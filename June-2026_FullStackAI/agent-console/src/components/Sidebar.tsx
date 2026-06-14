"use client";

import React from "react";
import { useConsole } from "@/context/ConsoleContext";
import {
  MessageSquare,
  Activity,
  Database,
  Plus,
  Terminal,
  ChevronRight,
  Server,
  User,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import styles from "./Sidebar.module.css";

const PRESET_SCENARIOS = [
  { text: "hello", label: "Greeting (Normal)" },
  { text: "q3 report summary", label: "Report Summary (1 Tool)" },
  { text: "analyze metric correlation", label: "Multi-Tool (2 Tools)" },
  { text: "lookup deployment SLA", label: "Knowledge base lookup" },
  { text: "database schema full", label: "Large 500KB+ Context" },
  { text: "detailed document explain", label: "Long Stream Response" },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const {
    activeTab,
    setActiveTab,
    resetConsoleState,
    sendUserMessage,
    status,
  } = useConsole();

  const handleNewSession = () => {
    resetConsoleState();
    setActiveTab("chat");
    onClose();
  };

  const handlePresetClick = (text: string) => {
    setActiveTab("chat");
    onClose();
    // Small delay to ensure render transition has processed before stream triggers
    setTimeout(() => {
      sendUserMessage(text);
    }, 100);
  };

  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebar_open : ""}`}>
      {/* Brand Header */}
      <div className={styles.header}>
        <div className={styles.brandWrapper}>
          <div className={styles.logoContainer}>
            <Sparkles size={20} className={styles.logoIcon} />
          </div>
          <div className={styles.brandTitle}>
            <h3>Alchemyst AI</h3>
            <span>Agent Console v2</span>
          </div>
        </div>
        
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close sidebar">
          <X size={18} />
        </button>
      </div>

      {/* New Session Action */}
      <button className={styles.newChatBtn} onClick={handleNewSession}>
        <Plus size={16} />
        <span>New Chat Session</span>
      </button>

      {/* Navigation Links */}
      <nav className={styles.nav}>
        <button
          className={`${styles.navItem} ${activeTab === "chat" ? styles.navItem_active : ""}`}
          onClick={() => {
            setActiveTab("chat");
            onClose();
          }}
        >
          <MessageSquare size={16} />
          <span>AI Chat Agent</span>
          {activeTab === "chat" && <ChevronRight size={14} className={styles.activeIndicator} />}
        </button>

        <button
          className={`${styles.navItem} ${activeTab === "timeline" ? styles.navItem_active : ""}`}
          onClick={() => {
            setActiveTab("timeline");
            onClose();
          }}
        >
          <Activity size={16} />
          <span>Trace Timeline</span>
          {activeTab === "timeline" && <ChevronRight size={14} className={styles.activeIndicator} />}
        </button>

        <button
          className={`${styles.navItem} ${activeTab === "context" ? styles.navItem_active : ""}`}
          onClick={() => {
            setActiveTab("context");
            onClose();
          }}
        >
          <Database size={16} />
          <span>Context Inspector</span>
          {activeTab === "context" && <ChevronRight size={14} className={styles.activeIndicator} />}
        </button>

        <button
          className={`${styles.navItem} ${activeTab === "monitor" ? styles.navItem_active : ""}`}
          onClick={() => {
            setActiveTab("monitor");
            onClose();
          }}
        >
          <Server size={16} />
          <span>System Monitor</span>
          {activeTab === "monitor" && <ChevronRight size={14} className={styles.activeIndicator} />}
        </button>
      </nav>

      {/* Recents/Preset Scenarios */}
      <div className={styles.recentsSection}>
        <span className={styles.sectionLabel}>Recents</span>
        <div className={styles.presetList}>
          {PRESET_SCENARIOS.map((scenario, index) => (
            <button
              key={index}
              className={styles.presetItem}
              onClick={() => handlePresetClick(scenario.text)}
              disabled={status === "disconnected"}
              title={scenario.text}
            >
              <Terminal size={12} className={styles.presetIcon} />
              <span>{scenario.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer Profile Area */}
      <div className={styles.footer}>
        <div className={styles.profile}>
          <div className={styles.avatar}>
            <User size={16} />
          </div>
          <div className={styles.profileDetails}>
            <span className={styles.profileName}>Jay Pipaliya</span>
            <div className={styles.statusRow}>
              <span className={`${styles.statusDot} ${styles[`status_${status}`]}`} />
              <span className={styles.statusText}>{status}</span>
            </div>
          </div>
        </div>
        <button className={styles.settingsBtn} title="System Configuration">
          <Settings size={16} />
        </button>
      </div>
    </aside>
  );
}
