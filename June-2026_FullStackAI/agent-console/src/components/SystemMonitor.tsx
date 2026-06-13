"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useConsole } from "@/context/ConsoleContext";
import {
  Server,
  RefreshCw,
  Wifi,
  Database,
  ShieldCheck,
  AlertCircle,
  Heart,
} from "lucide-react";
import styles from "./SystemMonitor.module.css";

interface ServerLogEvent {
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

export default function SystemMonitor() {
  const { status, timelineEvents } = useConsole();
  const [serverLogs, setServerLogs] = useState<ServerLogEvent[]>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  // Compute local metrics from timeline events
  const stats = React.useMemo(() => {
    let tokenCount = 0;
    let toolCalls = 0;
    let toolResults = 0;
    let contextSnapshotsCount = 0;
    let duplicatesIgnored = 0;
    let pings = 0;
    let errors = 0;
    let maxSeq = 0;

    timelineEvents.forEach((e) => {
      if (e.seq > maxSeq) maxSeq = e.seq;
      switch (e.type) {
        case "TOKEN_GROUP":
          tokenCount += e.tokenCount || 0;
          break;
        case "TOOL_CALL":
          toolCalls++;
          break;
        case "TOOL_RESULT":
          toolResults++;
          break;
        case "CONTEXT_SNAPSHOT":
          contextSnapshotsCount++;
          break;
        case "DUPLICATE_IGNORED":
          duplicatesIgnored++;
          break;
        case "PING":
          pings++;
          break;
        case "ERROR":
          errors++;
          break;
      }
    });

    return {
      tokenCount,
      toolCalls,
      toolResults,
      contextSnapshotsCount,
      duplicatesIgnored,
      pings,
      errors,
      maxSeq,
    };
  }, [timelineEvents]);

  // Fetch Server-side logs for verification
  const fetchServerLogs = useCallback(async () => {
    setIsFetchingLogs(true);
    setLogsError(null);
    try {
      const res = await fetch("http://localhost:4747/log");
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      // Server logs arrive as array of objects
      setServerLogs(data);
    } catch (err) {
      console.error("[SystemMonitor] Failed to fetch server logs:", err);
      setLogsError("Failed to connect to agent-server log endpoint (http://localhost:4747/log). Make sure the backend container is running.");
    } finally {
      setIsFetchingLogs(false);
    }
  }, []);

  // Fetch logs on mount
  useEffect(() => {
    fetchServerLogs();
  }, [fetchServerLogs]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Server size={18} className="text-cyan-400" />
          <span>System Monitor Dashboard</span>
        </div>
        <button
          onClick={fetchServerLogs}
          disabled={isFetchingLogs}
          className={styles.refreshBtn}
        >
          <RefreshCw size={14} className={isFetchingLogs ? "animate-spin" : ""} />
          <span>Refresh System Metrics</span>
        </button>
      </header>

      <div className={styles.scrollArea}>
        {/* Status Dashboard Grid */}
        <div className={styles.statsGrid}>
          {/* Card 1: Connection Info */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Wifi size={16} className={styles.icon_info} />
              <h4>WebSocket Status</h4>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Status</span>
                <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
                  {status}
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>WebSocket URI</span>
                <span className={styles.metaValue}>ws://localhost:4747/ws</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Buffer Sequence</span>
                <span className={styles.metaValue}>seq: {stats.maxSeq}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Packet Counters */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Database size={16} className={styles.icon_success} />
              <h4>Message Counter</h4>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.metaGrid}>
                <div className={styles.gridCell}>
                  <span className={styles.cellVal}>{stats.tokenCount}</span>
                  <span className={styles.cellLbl}>Tokens</span>
                </div>
                <div className={styles.gridCell}>
                  <span className={styles.cellVal}>{stats.toolCalls}</span>
                  <span className={styles.cellLbl}>Tool Calls</span>
                </div>
                <div className={styles.gridCell}>
                  <span className={styles.cellVal}>{stats.toolResults}</span>
                  <span className={styles.cellLbl}>Tool Results</span>
                </div>
                <div className={styles.gridCell}>
                  <span className={styles.cellVal}>{stats.contextSnapshotsCount}</span>
                  <span className={styles.cellLbl}>Contexts</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Heartbeat & Errors */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Heart size={16} className={styles.icon_warning} />
              <h4>Health & Chaos</h4>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>PINGs Received</span>
                <span className={styles.metaValue}>{stats.pings}</span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Duplicates Ignored</span>
                <span className={styles.metaValue} style={{ color: "var(--accent-orange)" }}>
                  {stats.duplicatesIgnored}
                </span>
              </div>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Errors Caught</span>
                <span className={styles.metaValue} style={{ color: "var(--accent-red)" }}>
                  {stats.errors}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Server Compliance Verification Logs */}
        <section className={styles.logsSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <ShieldCheck size={16} className="text-emerald-400" />
              <h4>Backend Verification Logs (/log)</h4>
            </div>
            <span className={styles.complianceNote}>
              Monitors client responses (PONGs, TOOL_ACKs, RESUMEs) recorded by server
            </span>
          </div>

          {logsError ? (
            <div className={styles.errorAlert}>
              <AlertCircle size={16} />
              <span>{logsError}</span>
            </div>
          ) : serverLogs.length === 0 ? (
            <div className={styles.emptyState}>No verification logs fetched.</div>
          ) : (
            <div className={styles.logsContainer}>
              <table className={styles.logsTable}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Recorded Event</th>
                    <th>Metadata & Details</th>
                  </tr>
                </thead>
                <tbody>
                  {serverLogs.map((log, index) => {
                    const { event, timestamp, ...details } = log;
                    const formattedTime = new Date(timestamp).toLocaleTimeString();
                    return (
                      <tr key={index} className={styles.logRow}>
                        <td className={styles.logTime}>{formattedTime}</td>
                        <td className={styles.logEvent}>
                          <span className={`${styles.eventBadge} ${styles[`badge_${event}`]}`}>
                            {event}
                          </span>
                        </td>
                        <td className={styles.logDetails}>
                          <pre>{JSON.stringify(details)}</pre>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
