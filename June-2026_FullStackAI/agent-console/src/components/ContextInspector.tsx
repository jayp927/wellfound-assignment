"use client";

import React, { useState, useMemo, startTransition } from "react";
import { useConsole } from "@/context/ConsoleContext";
import { diffObjects, DiffNode } from "@/lib/json-diff";
import { Database, ChevronRight, ChevronDown, Calendar } from "lucide-react";
import styles from "./ContextInspector.module.css";

export default function ContextInspector() {
  const { contextSnapshots, setContextHistoryIndex } = useConsole();
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);

  // List of active context IDs
  const contextIds = Object.keys(contextSnapshots);

  // Automatically select the first context ID if none is selected
  const activeContextId = selectedContextId || contextIds[0] || null;
  const history = activeContextId ? contextSnapshots[activeContextId] : null;

  // Compute the diff of the currently active snapshot
  const diffTree = useMemo(() => {
    if (!history || history.snapshots.length === 0) return [];
    
    const idx = history.currentIndex;
    const currentSnapshot = history.snapshots[idx];

    if (idx === 0) {
      // First snapshot: diff against empty object to show all as added
      return diffObjects({}, currentSnapshot.data);
    } else {
      // Step-by-step diff against the previous snapshot
      const prevSnapshot = history.snapshots[idx - 1];
      return diffObjects(prevSnapshot.data, currentSnapshot.data);
    }
  }, [history]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeContextId) return;
    const index = parseInt(e.target.value, 10);
    // Use startTransition to keep the slider sliding smooth
    startTransition(() => {
      setContextHistoryIndex(activeContextId, index);
    });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Database size={18} className="text-cyan-400" />
          <span>Context Inspector</span>
        </div>
        {contextIds.length > 0 && (
          <select
            value={activeContextId || ""}
            onChange={(e) => setSelectedContextId(e.target.value)}
            className={styles.selector}
          >
            {contextIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
      </header>

      {history && history.snapshots.length > 0 ? (
        <>
          <div className={styles.scrubber}>
            <span className={styles.scrubberLabel}>History Scrubber</span>
            <input
              type="range"
              min={0}
              max={history.snapshots.length - 1}
              value={history.currentIndex}
              onChange={handleSliderChange}
              className={styles.slider}
            />
            <span className={styles.scrubberValue}>
              {history.currentIndex + 1} / {history.snapshots.length}
            </span>
          </div>

          <div className={styles.scrollArea}>
            <div className="mb-4 text-xs text-slate-500 flex items-center gap-2 font-mono border-b border-slate-900 pb-2">
              <Calendar size={12} />
              <span>
                Snapshot seq: {history.snapshots[history.currentIndex].seq} | Timestamp:{" "}
                {new Date(history.snapshots[history.currentIndex].timestamp).toLocaleTimeString()}
              </span>
            </div>
            
            <div className="flex flex-col gap-1">
              {diffTree.map((node) => (
                <TreeNode key={node.key} node={node} isRoot={true} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className={styles.emptyState}>
          <Database size={40} className="text-slate-600 mb-2" />
          <span>No context loaded. Trigger an agent script.</span>
        </div>
      )}
    </div>
  );
}

interface TreeNodeProps {
  node: DiffNode;
  isRoot?: boolean;
}

const TreeNode = React.memo(function TreeNode({ node, isRoot = false }: TreeNodeProps) {
  // Collapse everything by default except root level, to prevent UI freeze on 500KB+ JSONs
  const [expanded, setExpanded] = useState(isRoot ? true : false);

  const hasChildren = !!(node.children && node.children.length > 0);

  const toggleExpand = (e: React.MouseEvent) => {
    if (hasChildren) {
      e.stopPropagation();
      setExpanded(!expanded);
    }
  };

  const getDiffClass = (type: DiffNode["type"]) => {
    switch (type) {
      case "added":
        return styles.diff_added;
      case "removed":
        return styles.diff_removed;
      case "modified":
        return styles.diff_modified;
      default:
        return "";
    }
  };

  const renderValue = (val: unknown) => {
    if (val === null) return <span className={styles.value_null}>null</span>;
    if (typeof val === "boolean")
      return <span className={styles.value_boolean}>{val ? "true" : "false"}</span>;
    if (typeof val === "number") return <span className={styles.value_number}>{val}</span>;
    if (typeof val === "string") return <span className={styles.value_string}>&quot;{val}&quot;</span>;
    return <span className={styles.value}>{JSON.stringify(val)}</span>;
  };

  return (
    <div className={styles.treeNode}>
      <div
        className={`${styles.nodeLabel} ${getDiffClass(node.type)}`}
        onClick={toggleExpand}
      >
        {hasChildren && (
          <span className="text-slate-400">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
        
        <span className={styles.keyName}>{node.key}</span>
        <span className={styles.colon}>:</span>

        {!hasChildren && (
          <>
            {node.type === "modified" ? (
              <span className="flex items-center gap-1">
                {renderValue(node.value)}
                <span className={styles.modifiedOldValue}>
                  was {JSON.stringify(node.oldValue)}
                </span>
              </span>
            ) : node.type === "removed" ? (
              renderValue(node.oldValue)
            ) : (
              renderValue(node.value)
            )}
          </>
        )}

        {hasChildren && (
          <span className="text-xs text-slate-500 font-sans">
            {Array.isArray(node.value) || node.key.startsWith("[")
              ? `[array: ${node.children?.length}]`
              : `{object: ${node.children?.length}}`}
          </span>
        )}

        {node.type === "added" && (
          <span className={`${styles.diffBadge} ${styles.badgeAdded}`}>+ Added</span>
        )}
        {node.type === "removed" && (
          <span className={`${styles.diffBadge} ${styles.badgeRemoved}`}>- Removed</span>
        )}
        {node.type === "modified" && (
          <span className={`${styles.diffBadge} ${styles.badgeModified}`}>Δ Mod</span>
        )}
      </div>

      {hasChildren && expanded && (
        <div className="flex flex-col gap-1 mt-1">
          {node.children?.map((childNode) => (
            <TreeNode key={childNode.key} node={childNode} />
          ))}
        </div>
      )}
    </div>
  );
});
