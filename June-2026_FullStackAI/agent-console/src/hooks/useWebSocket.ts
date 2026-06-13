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
}

export function useWebSocket({
  url,
  onMessage,
  onRawMessageReceived,
  onStatusChange,
}: UseWebSocketOptions) {
  const [status, setStatusState] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reorderBufferRef = useRef<ReorderingBuffer>(new ReorderingBuffer(0));
  const reconnectAttemptRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManuallyClosedRef = useRef<boolean>(false);

  // Sync state changes with callbacks
  const setStatus = useCallback(
    (newStatus: ConnectionStatus) => {
      setStatusState(newStatus);
      if (onStatusChange) {
        onStatusChange(newStatus);
      }
    },
    [onStatusChange]
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

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[useWebSocket] Socket opened");
      reconnectAttemptRef.current = 0;

      const lastSeq = reorderBufferRef.current.getLastProcessedSeq();
      if (lastSeq > 0) {
        // We have state to recover! Send RESUME
        setStatus("resuming");
        console.log(`[useWebSocket] Resuming state from seq=${lastSeq}`);
        ws.send(JSON.stringify({ type: "RESUME", last_seq: lastSeq }));
        // Move to connected after resume is sent
        setStatus("connected");
      } else {
        setStatus("connected");
      }
    };

    ws.onmessage = (event) => {
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
        if (onRawMessageReceived) {
          onRawMessageReceived(rawMsg, false);
        }

        // PING also goes to reordering buffer to advance lastProcessedSeq in sequence
        const ready = reorderBufferRef.current.add(rawMsg);
        for (const msg of ready) {
          onMessage(msg, false);
        }
        return;
      }

      // 2. ERROR messages bypass the buffer immediately for UI visibility
      if (rawMsg.type === "ERROR") {
        console.error("[useWebSocket] Server error received:", rawMsg.message);
        if (onRawMessageReceived) {
          onRawMessageReceived(rawMsg, false);
        }
        onMessage(rawMsg, false);

        // Also feed into reorder buffer to maintain seq numbers
        const ready = reorderBufferRef.current.add(rawMsg);
        for (const msg of ready) {
          if (msg.type !== "ERROR") {
            onMessage(msg, false);
          }
        }
        return;
      }

      // 3. Normal stream message processing
      const isDuplicate = reorderBufferRef.current.isDuplicateOrOld(rawMsg.seq);

      if (onRawMessageReceived) {
        onRawMessageReceived(rawMsg, isDuplicate);
      }

      if (isDuplicate) {
        console.log(`[useWebSocket] Discarded duplicate/old message seq=${rawMsg.seq}`);
        return;
      }

      // Add to reorder queue
      const readyMessages = reorderBufferRef.current.add(rawMsg);
      for (const msg of readyMessages) {
        onMessage(msg, false);
      }
    };

    ws.onclose = (event) => {
      console.log(`[useWebSocket] Socket closed: code=${event.code}, reason=${event.reason}`);
      setStatus("disconnected");

      // Don't auto-reconnect if manually closed
      if (isManuallyClosedRef.current) return;

      // Exponential backoff reconnect
      const backoffMs = Math.min(500 * Math.pow(2, reconnectAttemptRef.current), 10000);
      console.log(`[useWebSocket] Attempting reconnect in ${backoffMs}ms`);
      reconnectAttemptRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, backoffMs);
    };

    ws.onerror = (err) => {
      console.error("[useWebSocket] Socket error:", err);
    };
  }, [url, onMessage, onRawMessageReceived, setStatus, sendMessage]);

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
