import { useEffect, useRef, useState, useCallback } from "react";
import { ServerMessage, ClientMessage } from "@/types/protocol";
import { ReorderingBuffer } from "@/lib/reordering-buffer";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "resuming";

interface UseWebSocketOptions {
  url: string;
  onMessage: (message: ServerMessage, isReplayed: boolean) => void;
  onRawMessageReceived?: (message: ServerMessage, isDuplicate: boolean) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  onServerLog?: (logLine: string) => void;
}

export function useWebSocket({
  url,
  onMessage,
  onRawMessageReceived,
  onStatusChange,
  onServerLog,
}: UseWebSocketOptions) {
  const [status, setStatusState] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reorderBufferRef = useRef<ReorderingBuffer>(new ReorderingBuffer(0));
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManuallyClosedRef = useRef<boolean>(false);

  // Resume tracking
  const isResumingRef = useRef<boolean>(false);
  const replayedCountRef = useRef<number>(0);

  // Keep options in mutable refs to avoid resetting the WebSocket connection
  const onMessageRef = useRef(onMessage);
  const onRawMessageReceivedRef = useRef(onRawMessageReceived);
  const onStatusChangeRef = useRef(onStatusChange);
  const onServerLogRef = useRef(onServerLog);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onRawMessageReceivedRef.current = onRawMessageReceived;
    onStatusChangeRef.current = onStatusChange;
    onServerLogRef.current = onServerLog;
  });

  // Sync state changes with callbacks
  const setStatus = useCallback(
    (newStatus: ConnectionStatus) => {
      setStatusState(newStatus);
      if (onStatusChangeRef.current) {
        onStatusChangeRef.current(newStatus);
      }
    },
    []
  );

  // Send message helper
  const sendMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    if (isManuallyClosedRef.current) return;

    // Clean up existing socket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const currentAttempt = reconnectAttemptRef.current;
    const isRetry = currentAttempt > 0;
    setStatus(isRetry ? "reconnecting" : "connecting");

    // Output server-style stdout logs
    onServerLogRef.current?.("[agent-server] New WebSocket connection");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      console.log("[useWebSocket] Socket opened");
      reconnectAttemptRef.current = 0;

      const lastSeq = reorderBufferRef.current.getLastProcessedSeq();
      if (lastSeq > 0) {
        // We have state to recover! Send RESUME
        setStatus("resuming");
        isResumingRef.current = true;
        replayedCountRef.current = 0;

        console.log(`[useWebSocket] Resuming state from seq=${lastSeq}`);
        onServerLogRef.current?.(`[agent-server] Resume from seq=${lastSeq}, history has ${lastSeq} events`);

        ws.send(JSON.stringify({ type: "RESUME", last_seq: lastSeq }));

        // Move to connected after resume is sent (with small delay so React can register/render resuming state)
        setTimeout(() => {
          if (wsRef.current === ws) {
            onServerLogRef.current?.(`[agent-server] Replaying ${replayedCountRef.current} events`);
            isResumingRef.current = false;
            setStatus("connected");
          }
        }, 150);
      } else {
        setStatus("connected");
      }
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      let rawMsg: ServerMessage;
      try {
        rawMsg = JSON.parse(event.data) as ServerMessage;
      } catch (err) {
        console.error("[useWebSocket] Failed to parse message:", err);
        return;
      }

      // 1. Core heartbeat response (PING/PONG) must bypass the buffer entirely to prevent timeouts
      if (rawMsg.type === "PING") {
        const challenge = rawMsg.challenge;
        console.log(`[useWebSocket] Received PING with challenge="${challenge}", sending PONG`);
        sendMessage({ type: "PONG", echo: challenge });

        // Still process the PING in raw message logger (for timeline)
        if (onRawMessageReceivedRef.current) {
          onRawMessageReceivedRef.current(rawMsg, false);
        }

        // PING also goes to reordering buffer to advance lastProcessedSeq in sequence
        const ready = reorderBufferRef.current.add(rawMsg);
        for (const msg of ready) {
          if (onMessageRef.current) {
            onMessageRef.current(msg, isResumingRef.current);
          }
        }
        return;
      }

      // 2. ERROR messages bypass the buffer immediately for UI visibility
      if (rawMsg.type === "ERROR") {
        console.error("[useWebSocket] Server error received:", rawMsg.message);
        if (onRawMessageReceivedRef.current) {
          onRawMessageReceivedRef.current(rawMsg, false);
        }
        if (onMessageRef.current) {
          onMessageRef.current(rawMsg, isResumingRef.current);
        }

        // Also feed into reorder buffer to maintain seq numbers
        const ready = reorderBufferRef.current.add(rawMsg);
        for (const msg of ready) {
          if (msg.type !== "ERROR" && onMessageRef.current) {
            onMessageRef.current(msg, isResumingRef.current);
          }
        }
        return;
      }

      // 3. Normal stream message processing
      const isDuplicate = reorderBufferRef.current.isDuplicateOrOld(rawMsg.seq);

      if (onRawMessageReceivedRef.current) {
        onRawMessageReceivedRef.current(rawMsg, isDuplicate);
      }

      if (isDuplicate) {
        console.log(`[useWebSocket] Discarded duplicate/old message seq=${rawMsg.seq}`);
        return;
      }

      // Increment count of replayed messages during resume
      if (isResumingRef.current) {
        replayedCountRef.current++;
      }

      // Add to reorder queue
      const readyMessages = reorderBufferRef.current.add(rawMsg);
      for (const msg of readyMessages) {
        if (onMessageRef.current) {
          onMessageRef.current(msg, isResumingRef.current);
        }
      }
    };

    ws.onclose = (event) => {
      if (wsRef.current !== ws) return;
      console.log(`[useWebSocket] Socket closed: code=${event.code}, reason=${event.reason}`);
      setStatus("disconnected");
      onServerLogRef.current?.(`[agent-server] Connection closed: ${event.code}`);

      // Don't auto-reconnect if manually closed or replaced by another connection
      if (isManuallyClosedRef.current || event.reason === "replaced") {
        if (event.reason === "replaced") {
          console.log("[useWebSocket] Connection replaced by another client. Staying offline.");
          onServerLogRef.current?.("[useWebSocket] Connection replaced by another client. Staying offline.");
        }
        return;
      }

      // Exponential backoff reconnect
      const backoffMs = Math.min(500 * Math.pow(2, reconnectAttemptRef.current), 10000);
      console.log(`[useWebSocket] Attempting reconnect in ${backoffMs}ms`);
      reconnectAttemptRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        if (wsRef.current === ws) {
          connect();
        }
      }, backoffMs);
    };

    ws.onerror = (err) => {
      if (wsRef.current !== ws) return;
      console.error("[useWebSocket] Socket error:", err);
    };
  }, [url, setStatus, sendMessage]);

  const disconnect = useCallback(() => {
    isManuallyClosedRef.current = true;
    reconnectAttemptRef.current = 0;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
  }, [setStatus]);

  const resetBuffer = useCallback((seq: number = 0) => {
    reorderBufferRef.current.reset(seq);
  }, []);

  // Auto connect on mount, clean up on unmount
  useEffect(() => {
    isManuallyClosedRef.current = false;
    connect();

    return () => {
      isManuallyClosedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    status,
    sendMessage,
    disconnect,
    connect: useCallback(() => {
      isManuallyClosedRef.current = false;
      reconnectAttemptRef.current = 0;
      connect();
    }, [connect]),
    resetBuffer,
    getLastProcessedSeq: useCallback(() => reorderBufferRef.current.getLastProcessedSeq(), []),
  };
}
