"use client";

import React from "react";
import { useConsole } from "@/context/ConsoleContext";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import TimelinePanel from "@/components/TimelinePanel";
import ContextInspector from "@/components/ContextInspector";
import SystemMonitor from "@/components/SystemMonitor";
import ToastContainer from "@/components/ToastContainer";
import styles from "./page.module.css";

export default function Home() {
  const { activeTab } = useConsole();

  return (
    <div className={styles.appContainer}>
      <Sidebar />
      <main className={styles.mainContent}>
        {activeTab === "chat" && (
          <div className={`${styles.viewWrapper} animate-slide-in`}>
            <ChatPanel />
          </div>
        )}
        {activeTab === "timeline" && (
          <div className={`${styles.viewWrapper} animate-slide-in`}>
            <TimelinePanel />
          </div>
        )}
        {activeTab === "context" && (
          <div className={`${styles.viewWrapper} animate-slide-in`}>
            <ContextInspector />
          </div>
        )}
        {activeTab === "monitor" && (
          <div className={`${styles.viewWrapper} animate-slide-in`}>
            <SystemMonitor />
          </div>
        )}
      </main>
      <ToastContainer />
    </div>
  );
}


