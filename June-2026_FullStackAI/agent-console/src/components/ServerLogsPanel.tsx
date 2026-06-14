"use client";

import React, { useEffect, useRef } from "react";
import { useConsole } from "@/context/ConsoleContext";
import { Terminal, Trash2 } from "lucide-react";
import styles from "./ServerLogsPanel.module.css";

export default function ServerLogsPanel() {
  const { serverStdoutLogs, resetConsoleState } = useConsole();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [serverStdoutLogs]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Terminal size={18} className="text-cyan-400" />
          <span>Server Console Output</span>
        </div>
        <button
          onClick={resetConsoleState}
          className={styles.clearBtn}
          title="Clear all logs"
        >
          <Trash2 size={14} />
          <span>Clear Logs</span>
        </button>
      </header>

      <div className={styles.terminalContainer}>
        <div className={styles.terminal}>
          {serverStdoutLogs.length === 0 ? (
            <div className={styles.emptyLogs}>
              No server console output recorded yet. Start interacting with the agent to generate activity.
            </div>
          ) : (
            serverStdoutLogs.map((log, index) => (
              <div key={index} className={styles.logLine}>
                <span className={styles.prompt}>$</span> {log}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
