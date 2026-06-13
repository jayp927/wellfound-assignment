"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useWebSocket, ConnectionStatus } from "@/hooks/useWebSocket";
import { ServerMessage, ClientMessage } from "@/types/protocol";

export interface ResponseBlock {
  type: "text" | "tool";
  text?: string;
  callId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  state?: "waiting" | "acked" | "resolved";
}

export interface ChatItem {
  id: string; // streamId or messageId
  sender: "user" | "agent";
  content?: string; // For user message
  blocks?: ResponseBlock[]; // For agent response
}

export interface TimelineEvent {
  id: string;
  seq: number;
  timestamp: number;
  type: "TOKEN_GROUP" | "TOOL_CALL" | "TOOL_RESULT" | "CONTEXT_SNAPSHOT" | "PING" | "PONG" | "ERROR" | "DUPLICATE_IGNORED";
  text?: string;
  tokenCount?: number;
  durationMs?: number;
  streamId?: string;
  callId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  contextId?: string;
  dataSize?: number;
  challenge?: string;
  echo?: string;
  latencyMs?: number;
  code?: string;
  message?: string;
  originalType?: string;
}

export interface ContextSnapshot {
  seq: number;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface ContextSnapshotHistory {
  contextId: string;
  snapshots: ContextSnapshot[];
  currentIndex: number;
}

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
}

interface ConsoleContextType {
  status: ConnectionStatus;
  chatItems: ChatItem[];
  timelineEvents: TimelineEvent[];
  contextSnapshots: Record<string, ContextSnapshotHistory>;
  isStreaming: boolean;
  activeStreamId: string | null;
  selectedElementId: string | null; // For timeline -> chat tracing
  highlightedTimelineEventId: string | null; // For chat -> timeline tracing
  activeTab: "chat" | "timeline" | "context" | "monitor";
  setActiveTab: (tab: "chat" | "timeline" | "context" | "monitor") => void;
  toasts: ToastMessage[];
  addToast: (type: ToastMessage["type"], title: string, message: string) => void;
  removeToast: (id: string) => void;
  sendUserMessage: (content: string) => void;
  ackToolCall: (callId: string) => void;
  setContextHistoryIndex: (contextId: string, index: number) => void;
  setSelectedElementId: (id: string | null) => void;
  setHighlightedTimelineEventId: (id: string | null) => void;
  resetConsoleState: () => void;
}

const ConsoleContext = createContext<ConsoleContextType | undefined>(undefined);

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [contextSnapshots, setContextSnapshots] = useState<Record<string, ContextSnapshotHistory>>({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  
  // Highlight states for bidirectional linking
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [highlightedTimelineEventId, setHighlightedTimelineEventId] = useState<string | null>(null);

  // Tab & Toast states
  const [activeTab, setActiveTab] = useState<"chat" | "timeline" | "context" | "monitor">("chat");
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastMessage["type"], title: string, message: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const sendMessageRef = useRef<(msg: ClientMessage) => boolean>(() => false);
  const pendingAcksRef = useRef<Set<string>>(new Set());

  // WebSocket lifecycle integration
  const handleMessage = useCallback((msg: ServerMessage) => {
    const now = Date.now();

    switch (msg.type) {
      case "TOKEN": {
        setIsStreaming(true);
        setActiveStreamId(msg.stream_id);

        setChatItems((prev) => {
          const index = prev.findIndex((item) => item.id === msg.stream_id);
          if (index === -1) {
            // New stream item
            return [
              ...prev,
              {
                id: msg.stream_id,
                sender: "agent",
                blocks: [{ type: "text", text: msg.text }],
              },
            ];
          } else {
            // Update existing stream item
            const item = prev[index];
            const blocks = [...(item.blocks || [])];
            const lastBlock = blocks[blocks.length - 1];

            if (lastBlock && lastBlock.type === "text") {
              // Append to last text block
              blocks[blocks.length - 1] = {
                ...lastBlock,
                text: (lastBlock.text || "") + msg.text,
              };
            } else {
              // Start a new text block
              blocks.push({ type: "text", text: msg.text });
            }

            const updated = [...prev];
            updated[index] = { ...item, blocks };
            return updated;
          }
        });

        // Add to Timeline Events, grouping tokens
        setTimelineEvents((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.type === "TOKEN_GROUP" && last.streamId === msg.stream_id) {
            const updatedLast = {
              ...last,
              tokenCount: (last.tokenCount || 0) + 1,
              text: (last.text || "") + msg.text,
              durationMs: now - last.timestamp,
            };
            return [...prev.slice(0, -1), updatedLast];
          } else {
            return [
              ...prev,
              {
                id: `tok_${msg.stream_id}_${msg.seq}`,
                seq: msg.seq,
                timestamp: now,
                type: "TOKEN_GROUP",
                streamId: msg.stream_id,
                text: msg.text,
                tokenCount: 1,
                durationMs: 0,
              },
            ];
          }
        });
        break;
      }

      case "TOOL_CALL": {
        setIsStreaming(false);

        // Append tool block to the chat panel
        setChatItems((prev) => {
          const index = prev.findIndex((item) => item.id === msg.stream_id);
          const newBlock: ResponseBlock = {
            type: "tool",
            callId: msg.call_id,
            toolName: msg.tool_name,
            args: msg.args,
            state: "acked",
          };

          if (index === -1) {
            return [
              ...prev,
              {
                id: msg.stream_id,
                sender: "agent",
                blocks: [newBlock],
              },
            ];
          } else {
            const item = prev[index];
            const blocks = [...(item.blocks || []), newBlock];
            const updated = [...prev];
            updated[index] = { ...item, blocks };
            return updated;
          }
        });

        // Trigger immediate TOOL_ACK back to the server
        console.log(`[ConsoleContext] TOOL_CALL seq=${msg.seq} callId=${msg.call_id}. Dispatching TOOL_ACK.`);
        addToast("info", "Tool Invoked", `Executing tool: ${msg.tool_name}`);
        sendMessageRef.current({ type: "TOOL_ACK", call_id: msg.call_id });

        setTimelineEvents((prev) => [
          ...prev,
          {
            id: `call_${msg.call_id}`,
            seq: msg.seq,
            timestamp: now,
            type: "TOOL_CALL",
            callId: msg.call_id,
            toolName: msg.tool_name,
            args: msg.args,
            streamId: msg.stream_id,
          },
        ]);
        break;
      }

      case "TOOL_RESULT": {
        setChatItems((prev) => {
          return prev.map((item) => {
            if (item.blocks) {
              const updatedBlocks = item.blocks.map((block) => {
                if (block.type === "tool" && block.callId === msg.call_id) {
                  return {
                    ...block,
                    result: msg.result,
                    state: "resolved" as const,
                  };
                }
                return block;
              });
              return { ...item, blocks: updatedBlocks };
            }
            return item;
          });
        });

        setTimelineEvents((prev) => [
          ...prev,
          {
            id: `res_${msg.call_id}`,
            seq: msg.seq,
            timestamp: now,
            type: "TOOL_RESULT",
            callId: msg.call_id,
            result: msg.result,
            streamId: msg.stream_id,
          },
        ]);
        addToast("success", "Tool Succeeded", `Resolved results for call_id: ${msg.call_id}`);
        break;
      }

      case "CONTEXT_SNAPSHOT": {
        setContextSnapshots((prev) => {
          const history = prev[msg.context_id];
          const newSnapshot: ContextSnapshot = {
            seq: msg.seq,
            timestamp: now,
            data: msg.data,
          };

          if (!history) {
            return {
              ...prev,
              [msg.context_id]: {
                contextId: msg.context_id,
                snapshots: [newSnapshot],
                currentIndex: 0,
              },
            };
          } else {
            // Check for duplicate seq
            const exists = history.snapshots.some((s) => s.seq === msg.seq);
            if (exists) return prev;

            const updatedSnapshots = [...history.snapshots, newSnapshot];
            return {
              ...prev,
              [msg.context_id]: {
                ...history,
                snapshots: updatedSnapshots,
                currentIndex: updatedSnapshots.length - 1,
              },
            };
          }
        });

        const payloadLength = JSON.stringify(msg.data).length;
        const sizeKb = Math.round(payloadLength / 1024);
        if (sizeKb >= 500) {
          addToast("warning", "Oversized Context Snapshot", `Received oversized snapshot (${sizeKb} KB) - computing diff...`);
        } else {
          addToast("info", "Context Updated", `Snapshot ${msg.context_id} loaded (${sizeKb} KB)`);
        }

        setTimelineEvents((prev) => [
          ...prev,
          {
            id: `ctx_${msg.context_id}_${msg.seq}`,
            seq: msg.seq,
            timestamp: now,
            type: "CONTEXT_SNAPSHOT",
            contextId: msg.context_id,
            dataSize: payloadLength,
          },
        ]);
        break;
      }

      case "PING": {
        // Log PING-PONG in the timeline
        setTimelineEvents((prev) => [
          ...prev,
          {
            id: `ping_${msg.seq}`,
            seq: msg.seq,
            timestamp: now,
            type: "PING",
            challenge: msg.challenge,
          },
          {
            id: `pong_${msg.seq}`,
            seq: msg.seq,
            timestamp: now + 2, // slightly later
            type: "PONG",
            echo: msg.challenge,
          },
        ]);
        break;
      }

      case "ERROR": {
        addToast("error", `Server Error: ${msg.code}`, msg.message);
        setTimelineEvents((prev) => [
          ...prev,
          {
            id: `err_${msg.seq}`,
            seq: msg.seq,
            timestamp: now,
            type: "ERROR",
            code: msg.code,
            message: msg.message,
          },
        ]);
        break;
      }

      case "STREAM_END": {
        setIsStreaming(false);
        setActiveStreamId(null);
        break;
      }
    }
  }, [addToast]);

  const handleRawMessageReceived = useCallback((msg: ServerMessage, isDuplicate: boolean) => {
    if (isDuplicate) {
      addToast("warning", "Duplicate Ignored", `Ignored duplicate packet seq: ${msg.seq}`);
      // Log duplicate in the timeline for maximum visibility
      setTimelineEvents((prev) => [
        ...prev,
        {
          id: `dup_${msg.type}_${msg.seq}_${Date.now()}`,
          seq: msg.seq,
          timestamp: Date.now(),
          type: "DUPLICATE_IGNORED",
          originalType: msg.type,
        },
      ]);
    }
  }, [addToast]);

  // Initialize WebSocket Hook
  const { status, sendMessage, resetBuffer } = useWebSocket({
    url: "ws://localhost:4747/ws",
    onMessage: handleMessage,
    onRawMessageReceived: handleRawMessageReceived,
  });

  // Monitor connection status changes for Toasts
  const prevStatusRef = useRef<ConnectionStatus | null>(null);
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      const prev = prevStatusRef.current;
      prevStatusRef.current = status;
      if (prev !== null) {
        if (status === "connected") {
          addToast("success", "Status: Connected", "Successfully connected to AI agent server.");
        } else if (status === "disconnected") {
          addToast("error", "Status: Disconnected", "WebSocket connection lost.");
        } else if (status === "reconnecting") {
          addToast("warning", "Status: Reconnecting", "WebSocket connection lost. Retrying (exponential backoff)...");
        } else if (status === "resuming") {
          addToast("info", "Status: Resuming State", "Resuming session state...");
        }
      }
    }
  }, [status, addToast]);

  sendMessageRef.current = sendMessage;

  const sendUserMessage = useCallback(
    (content: string) => {
      // 1. Client-side sequence state reset for a new turn
      resetBuffer(0);
      setIsStreaming(false);
      setActiveStreamId(null);

      // 2. Append User Message to Thread
      const msgId = `usr_${Date.now()}`;
      setChatItems((prev) => [
        ...prev,
        {
          id: msgId,
          sender: "user",
          content,
        },
      ]);

      // 3. Dispatch USER_MESSAGE
      sendMessage({
        type: "USER_MESSAGE",
        content,
      });

      // 4. Log USER_MESSAGE in timeline
      setTimelineEvents((prev) => [
        ...prev,
        {
          id: msgId,
          seq: 0,
          timestamp: Date.now(),
          type: "TOKEN_GROUP",
          text: `User: ${content}`,
          tokenCount: 1,
          durationMs: 0,
        },
      ]);
    },
    [sendMessage, resetBuffer]
  );

  const ackToolCall = useCallback(
    (callId: string) => {
      // Prevent redundant ACKs
      if (pendingAcksRef.current.has(callId)) return;
      pendingAcksRef.current.add(callId);

      addToast("success", "Tool Acknowledged", `Dispatched ACK for tool call ${callId}`);

      // Dispatch TOOL_ACK
      sendMessageRef.current({
        type: "TOOL_ACK",
        call_id: callId,
      });

      // Update local state to represent the ACK card state
      setChatItems((prev) => {
        return prev.map((item) => {
          if (item.blocks) {
            const updatedBlocks = item.blocks.map((block) => {
              if (block.type === "tool" && block.callId === callId) {
                return {
                  ...block,
                  state: "acked" as const,
                };
              }
              return block;
            });
            return { ...item, blocks: updatedBlocks };
          }
          return item;
        });
      });
    },
    [addToast]
  );

  const setContextHistoryIndex = useCallback((contextId: string, index: number) => {
    setContextSnapshots((prev) => {
      const history = prev[contextId];
      if (!history || index < 0 || index >= history.snapshots.length) return prev;
      return {
        ...prev,
        [contextId]: {
          ...history,
          currentIndex: index,
        },
      };
    });
  }, []);

  const resetConsoleState = useCallback(() => {
    setChatItems([]);
    setTimelineEvents([]);
    setContextSnapshots({});
    setIsStreaming(false);
    setActiveStreamId(null);
    resetBuffer(0);
    pendingAcksRef.current.clear();
  }, [resetBuffer]);

  return (
    <ConsoleContext.Provider
      value={{
        status,
        chatItems,
        timelineEvents,
        contextSnapshots,
        isStreaming,
        activeStreamId,
        selectedElementId,
        highlightedTimelineEventId,
        activeTab,
        setActiveTab,
        toasts,
        addToast,
        removeToast,
        sendUserMessage,
        ackToolCall,
        setContextHistoryIndex,
        setSelectedElementId,
        setHighlightedTimelineEventId,
        resetConsoleState,
      }}
    >
      {children}
    </ConsoleContext.Provider>
  );
}

export function useConsole() {
  const context = useContext(ConsoleContext);
  if (!context) {
    throw new Error("useConsole must be used within a ConsoleProvider");
  }
  return context;
}
