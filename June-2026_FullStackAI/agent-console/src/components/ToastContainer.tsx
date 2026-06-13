"use client";

import React, { useEffect } from "react";
import { useConsole, ToastMessage } from "@/context/ConsoleContext";
import { CheckCircle, AlertTriangle, AlertCircle, Info, X } from "lucide-react";
import styles from "./ToastContainer.module.css";

export default function ToastContainer() {
  const { toasts, removeToast } = useConsole();

  return (
    <div className={styles.toastStack}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  removeToast,
}: {
  toast: ToastMessage;
  removeToast: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle size={18} className={styles.icon_success} />;
      case "error":
        return <AlertTriangle size={18} className={styles.icon_error} />;
      case "warning":
        return <AlertCircle size={18} className={styles.icon_warning} />;
      case "info":
      default:
        return <Info size={18} className={styles.icon_info} />;
    }
  };

  return (
    <div className={`${styles.toastItem} ${styles[`toast_${toast.type}`]}`}>
      <div className={styles.iconContainer}>{getIcon()}</div>
      <div className={styles.toastContent}>
        <h4 className={styles.toastTitle}>{toast.title}</h4>
        <p className={styles.toastMsg}>{toast.message}</p>
      </div>
      <button className={styles.closeBtn} onClick={() => removeToast(toast.id)}>
        <X size={14} />
      </button>
      <div className={styles.progressBar}>
        <div className={`${styles.progressFill} ${styles[`fill_${toast.type}`]}`} />
      </div>
    </div>
  );
}
