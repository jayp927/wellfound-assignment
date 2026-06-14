"use client";

import React, { useState } from "react";
import { useConsole } from "@/context/ConsoleContext";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import TimelinePanel from "@/components/TimelinePanel";
import ContextInspector from "@/components/ContextInspector";
import SystemMonitor from "@/components/SystemMonitor";
import { Menu, Sparkles } from "lucide-react";

import styles from "./page.module.css";

export default function Home() {
  const { activeTab } = useConsole();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={styles.appContainer}>
      <div 
        className={`${styles.backdrop} ${sidebarOpen ? styles.backdrop_active : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <main className={styles.mainContent}>
        <header className={styles.mobileHeader}>
          <button 
            className={styles.hamburgerBtn} 
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>
          
          <div className={styles.mobileBrand}>
            <div className={styles.logoContainer}>
              <Sparkles size={14} className={styles.logoIcon} />
            </div>
            <div className={styles.brandTitle}>
              <h3>Alchemyst AI</h3>
              <span>Agent Console v2</span>
            </div>
          </div>

          <div className={styles.headerSpacer} />
        </header>

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
    </div>
  );
}


