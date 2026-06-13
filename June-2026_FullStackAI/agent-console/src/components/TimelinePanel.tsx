"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useConsole, TimelineEvent } from "@/context/ConsoleContext";
import { Search, ChevronDown, ChevronUp, Activity } from "lucide-react";
import styles from "./TimelinePanel.module.css";

const EVENT_FILTERS = [
  { value: "all", label: "All Events" },
  { value: "TOKEN_GROUP", label: "Tokens" },
  { value: "TOOL", label: "Tools" },
  { value: "CONTEXT_SNAPSHOT", label: "Context" },
  { value: "HEARTBEAT", label: "Heartbeat" },
  { value: "ERROR", label: "Errors" },
  { value: "DUPLICATE_IGNORED", label: "Duplicates" },
];

export default function TimelinePanel() {
  const {
    timelineEvents,
    highlightedTimelineEventId,
    setHighlightedTimelineEventId,
    setSelectedElementId,
    setActiveTab,
  } = useConsole();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [hoveredCallId, setHoveredCallId] = useState<string | null>(null);
  
  // Accordion open states for token groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const listRef = useRef<HTMLDivElement>(null);

  // Filtered timeline events
  const filteredEvents = useMemo(() => {
    return timelineEvents.filter((event) => {
      // 1. Search text match
      const searchLower = search.toLowerCase();
      let matchesSearch = true;
      if (search) {
        const textMatch = event.text?.toLowerCase().includes(searchLower);
        const typeMatch = event.type.toLowerCase().includes(searchLower);
        const toolMatch = event.toolName?.toLowerCase().includes(searchLower);
        const callMatch = event.callId?.toLowerCase().includes(searchLower);
        const codeMatch = event.code?.toLowerCase().includes(searchLower);
        const msgMatch = event.message?.toLowerCase().includes(searchLower);
        matchesSearch = !!(textMatch || typeMatch || toolMatch || callMatch || codeMatch || msgMatch);
      }

      // 2. Type filter match
      let matchesFilter = true;
      if (filter !== "all") {
        if (filter === "TOKEN_GROUP") {
          matchesFilter = event.type === "TOKEN_GROUP";
        } else if (filter === "TOOL") {
          matchesFilter = event.type === "TOOL_CALL" || event.type === "TOOL_RESULT";
        } else if (filter === "CONTEXT_SNAPSHOT") {
          matchesFilter = event.type === "CONTEXT_SNAPSHOT";
        } else if (filter === "HEARTBEAT") {
          matchesFilter = event.type === "PING" || event.type === "PONG";
        } else if (filter === "ERROR") {
          matchesFilter = event.type === "ERROR";
        } else if (filter === "DUPLICATE_IGNORED") {
          matchesFilter = event.type === "DUPLICATE_IGNORED";
        }
      }

      return matchesSearch && matchesFilter;
    });
  }, [timelineEvents, search, filter]);

  // Scroll to and highlight event if triggered by chat panel
  useEffect(() => {
    if (highlightedTimelineEventId) {
      const el = document.getElementById(`timeline-${highlightedTimelineEventId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Auto clear after a short delay
        const t = setTimeout(() => setHighlightedTimelineEventId(null), 2000);
        return () => clearTimeout(t);
      }
    }
  }, [highlightedTimelineEventId, setHighlightedTimelineEventId]);

  const toggleGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click trace trigger
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRowClick = (event: TimelineEvent) => {
    // Switch to Chat tab to see the highlighted message row
    setActiveTab("chat");
    
    // Determine the chat element to scroll to
    if (event.type === "TOKEN_GROUP" && event.streamId) {
      setSelectedElementId(`tool_undefined`); // Focus stream
    } else if ((event.type === "TOOL_CALL" || event.type === "TOOL_RESULT") && event.callId) {
      setSelectedElementId(`tool_${event.callId}`);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Activity size={18} className="text-cyan-400" />
          <span>Protocol Event Trace</span>
        </div>
        <div className={styles.controls}>
          <div className={styles.searchBar}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search trace payload..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <div className={styles.filterChips}>
            {EVENT_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`${styles.filterChip} ${
                  filter === f.value ? styles.filterChip_active : ""
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={styles.scrollArea} ref={listRef}>
        {filteredEvents.length === 0 ? (
          <div className={styles.emptyState}>No events recorded in trace.</div>
        ) : (
          filteredEvents.map((event) => {
            const isHighlighted = highlightedTimelineEventId === event.id;
            const hasCallId = !!event.callId;
            const isHoveredLink = hasCallId && hoveredCallId === event.callId;

            return (
              <TimelineRow
                key={event.id}
                event={event}
                isHighlighted={isHighlighted}
                isHoveredLink={isHoveredLink}
                expanded={!!expandedGroups[event.id]}
                onToggleExpand={(e) => toggleGroup(event.id, e)}
                onMouseEnter={() => event.callId && setHoveredCallId(event.callId)}
                onMouseLeave={() => setHoveredCallId(null)}
                onClick={() => handleRowClick(event)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

interface TimelineRowProps {
  event: TimelineEvent;
  isHighlighted: boolean;
  isHoveredLink: boolean;
  expanded: boolean;
  onToggleExpand: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

const TimelineRow = React.memo(function TimelineRow({
  event,
  isHighlighted,
  isHoveredLink,
  expanded,
  onToggleExpand,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: TimelineRowProps) {
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.toTimeString().split(" ")[0]}.${String(d.getMilliseconds()).padStart(3, "0")}`;
  };

  const getEventClass = (type: string) => {
    switch (type) {
      case "TOKEN_GROUP":
        return styles.dot_token;
      case "TOOL_CALL":
        return styles.dot_tool_call;
      case "TOOL_RESULT":
        return styles.dot_tool_result;
      case "CONTEXT_SNAPSHOT":
        return styles.dot_context;
      case "PING":
        return styles.dot_ping;
      case "PONG":
        return styles.dot_pong;
      case "ERROR":
        return styles.dot_error;
      case "DUPLICATE_IGNORED":
        return styles.dot_duplicate;
      default:
        return "";
    }
  };

  const getBadgeClass = (type: string) => {
    switch (type) {
      case "TOKEN_GROUP":
        return styles.badge_token;
      case "TOOL_CALL":
        return styles.badge_tool_call;
      case "TOOL_RESULT":
        return styles.badge_tool_result;
      case "CONTEXT_SNAPSHOT":
        return styles.badge_context;
      case "PING":
        return styles.badge_ping;
      case "PONG":
        return styles.badge_pong;
      case "ERROR":
        return styles.badge_error;
      case "DUPLICATE_IGNORED":
        return styles.badge_duplicate;
      default:
        return "";
    }
  };

  // Human readable title
  const getEventTitle = (e: TimelineEvent) => {
    switch (e.type) {
      case "TOKEN_GROUP":
        return `Streamed ${e.tokenCount} token${(e.tokenCount || 0) > 1 ? "s" : ""} (${(
          (e.durationMs || 0) / 1000
        ).toFixed(2)}s)`;
      case "TOOL_CALL":
        return `Tool Call invoked: ${e.toolName}`;
      case "TOOL_RESULT":
        return `Tool Result returned`;
      case "CONTEXT_SNAPSHOT":
        return `Context Snapshot received (${((e.dataSize || 0) / 1024).toFixed(1)} KB)`;
      case "PING":
        return `Heartbeat PING received`;
      case "PONG":
        return `Heartbeat PONG responded`;
      case "ERROR":
        return `Server Error [${e.code}]`;
      case "DUPLICATE_IGNORED":
        return `Duplicate event [${e.originalType}] ignored`;
      default:
        return e.type;
    }
  };

  return (
    <div
      id={`timeline-${event.id}`}
      className={`${styles.row} ${isHighlighted || isHoveredLink ? styles.row_highlighted : ""}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.indicator}>
        <div className={`${styles.dot} ${getEventClass(event.type)}`} />
        <div className={`${styles.line} ${isHoveredLink ? styles.connector_active : ""}`} />
      </div>

      <div className={styles.content}>
        <div className={styles.meta}>
          <span className={`${styles.typeBadge} ${getBadgeClass(event.type)}`}>
            {event.type === "TOKEN_GROUP" ? "TOKEN" : event.type}
            {event.seq > 0 && ` (seq: ${event.seq})`}
          </span>
          <span className={styles.time}>{formatTime(event.timestamp)}</span>
        </div>

        <div className={styles.payload}>
          {getEventTitle(event)}

          {event.type === "TOKEN_GROUP" && event.text && (
            <div className={styles.expandable}>
              <div className={styles.expandHeader} onClick={onToggleExpand}>
                <span>{expanded ? "Collapse text" : "Expand text"}</span>
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </div>
              {expanded && <div className="mt-2 text-slate-300 font-sans">{event.text}</div>}
            </div>
          )}

          {event.type === "TOOL_CALL" && (
            <pre className={styles.expandable}>
              <strong>args:</strong> {JSON.stringify(event.args, null, 2)}
            </pre>
          )}

          {event.type === "TOOL_RESULT" && (
            <pre className={styles.expandable}>
              <strong>result:</strong> {JSON.stringify(event.result, null, 2)}
            </pre>
          )}

          {event.type === "PING" && (
            <div className="text-slate-500 font-mono text-[11px] mt-1">
              Challenge: &quot;{event.challenge || "(empty)"}&quot;
            </div>
          )}

          {event.type === "ERROR" && (
            <div className="text-red-400 font-medium text-xs mt-1">{event.message}</div>
          )}
        </div>
      </div>
    </div>
  );
});
