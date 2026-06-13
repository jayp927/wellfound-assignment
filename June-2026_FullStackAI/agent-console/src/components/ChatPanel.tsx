"use client";

import React, { useState, useRef, useEffect } from "react";
import { useConsole, ResponseBlock } from "@/context/ConsoleContext";
import { Send, Terminal, Loader2 } from "lucide-react";
import styles from "./ChatPanel.module.css";

const SUGGESTED_MESSAGES = [
  { text: "hello", label: "Greeting (Normal)" },
  { text: "q3 report summary", label: "Report Summary (1 Tool)" },
  { text: "analyze metric correlation", label: "Multi-Tool (2 Tools)" },
  { text: "lookup deployment SLA", label: "Knowledge base lookup" },
  { text: "database schema full", label: "Large 500KB+ Context" },
  { text: "detailed document explain", label: "Long Stream Response" },
];

export default function ChatPanel() {
  const {
    status,
    chatItems,
    isStreaming,
    sendUserMessage,
    selectedElementId,
    setSelectedElementId,
    setHighlightedTimelineEventId,
  } = useConsole();

  const [input, setInput] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of feed on new messages
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [chatItems]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || status === "disconnected") return;
    sendUserMessage(input.trim());
    setInput("");
  };

  const handleChipClick = (text: string) => {
    if (status === "disconnected") return;
    sendUserMessage(text);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Terminal size={18} className="text-cyan-400" />
          <span>Agent Console Feed</span>
        </div>
        <div className={styles.statusIndicator}>
          <span className={`${styles.statusDot} ${styles[`status_${status}`]}`} />
          <span>{status}</span>
        </div>
      </header>

      <div className={styles.feed} ref={feedRef}>
        {chatItems.length === 0 ? (
          <div className={styles.emptyState}>
            <Terminal size={40} className="text-slate-600 mb-2" />
            <h3 className={styles.emptyTitle}>AI Agent Session Initialized</h3>
            <p className={styles.emptyText}>
              Select a suggested command below or type a custom prompt. Send a message to run a simulated agent script.
            </p>
            <div className={styles.suggestedChips}>
              {SUGGESTED_MESSAGES.map((msg, idx) => (
                <button
                  key={idx}
                  onClick={() => handleChipClick(msg.text)}
                  disabled={status === "disconnected"}
                  className={styles.chip}
                >
                  {msg.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatItems.map((item) => (
            <div
              key={item.id}
              className={`${styles.messageRow} ${
                item.sender === "user" ? styles.messageRow_user : styles.messageRow_agent
              }`}
            >
              {item.sender === "user" ? (
                <div className={`${styles.bubble} ${styles.bubble_user}`}>
                  <div className={styles.bubbleText}>{item.content}</div>
                </div>
              ) : (
                <div className={`${styles.bubble} ${styles.bubble_agent}`}>
                  {item.blocks?.map((block, idx) => (
                    <div key={idx}>
                      {block.type === "text" && (
                        <div className={styles.bubbleText}>{block.text}</div>
                      )}
                      {block.type === "tool" && (
                        <ToolCallCard
                          block={block}
                          selectedElementId={selectedElementId}
                          setSelectedElementId={setSelectedElementId}
                          setHighlightedTimelineEventId={setHighlightedTimelineEventId}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {isStreaming && (
          <div className={styles.typingIndicator}>
            <div className={styles.typingDot} />
            <div className={styles.typingDot} />
            <div className={styles.typingDot} />
          </div>
        )}
      </div>

      <div className={styles.inputArea}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="text"
            placeholder={
              status === "disconnected"
                ? "Connecting to server..."
                : "Type a prompt to trigger the agent script..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={status === "disconnected"}
            className={styles.input}
          />
          <button
            type="submit"
            disabled={!input.trim() || status === "disconnected"}
            className={styles.sendButton}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}

interface ToolCallCardProps {
  block: ResponseBlock;
  selectedElementId: string | null;
  setSelectedElementId: (id: string | null) => void;
  setHighlightedTimelineEventId: (id: string | null) => void;
}

function ToolCallCard({
  block,
  selectedElementId,
  setSelectedElementId,
  setHighlightedTimelineEventId,
}: ToolCallCardProps) {
  const { setActiveTab } = useConsole();
  const cardId = `tool_${block.callId}`;
  const isTarget = selectedElementId === cardId;
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll this element into view if highlighted by timeline
  useEffect(() => {
    if (isTarget && containerRef.current) {
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      // Clear the target selection after a short delay
      const t = setTimeout(() => setSelectedElementId(null), 2000);
      return () => clearTimeout(t);
    }
  }, [isTarget, setSelectedElementId]);

  const handleCardClick = () => {
    setActiveTab("timeline");
    // Scroll and highlight in Trace Timeline
    setHighlightedTimelineEventId(`call_${block.callId}`);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleCardClick}
      className={`${styles.toolCard} ${isTarget ? styles.toolCard_highlighted : ""}`}
    >
      <div className={styles.toolHeader}>
        <div className={styles.toolName}>
          <Terminal size={14} />
          <span>tool::{block.toolName}</span>
        </div>
        <div className={styles.toolStatus}>
          {block.state === "waiting" && (
            <>
              <Loader2 size={12} className="animate-spin text-orange-400" />
              <span className={styles.status_waiting}>waiting ack</span>
            </>
          )}
          {block.state === "acked" && (
            <>
              <Loader2 size={12} className="animate-spin text-violet-400" />
              <span className={styles.status_acked}>executing</span>
            </>
          )}
          {block.state === "resolved" && (
            <>
              <span className={styles.status_resolved}>success</span>
            </>
          )}
        </div>
      </div>
      <div className={styles.toolBody}>
        <div>
          <span className={styles.toolLabel}>Arguments</span>
          <pre className={styles.toolCode}>{JSON.stringify(block.args, null, 2)}</pre>
        </div>

        {block.result && (
          <>
            <div className={styles.divider} />
            <div>
              <span className={styles.toolLabel}>Result</span>
              <pre className={styles.toolCode}>{JSON.stringify(block.result, null, 2)}</pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
