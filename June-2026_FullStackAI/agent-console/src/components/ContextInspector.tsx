"use client";

import React, { useState, useMemo, startTransition, useEffect } from "react";
import { useConsole } from "@/context/ConsoleContext";
import { diffObjects, DiffNode } from "@/lib/json-diff";
import {
  Database,
  ChevronRight,
  ChevronDown,
  Calendar,
  Search,
  SlidersHorizontal,
  Layers,
  Clock,
  HardDrive
} from "lucide-react";
import styles from "./ContextInspector.module.css";

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, query: string) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className={styles.highlight}>{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function ExpandableValue({ val, searchQuery, threshold = 80 }: { val: unknown; searchQuery: string; threshold?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (val === null) {
    return <span className={styles.value_null}>null</span>;
  }
  if (typeof val === "boolean") {
    return <span className={styles.value_boolean}>{val ? "true" : "false"}</span>;
  }
  if (typeof val === "number") {
    return <span className={styles.value_number}>{val}</span>;
  }

  const isString = typeof val === "string";
  const rawText = isString ? val : JSON.stringify(val);
  const className = isString ? styles.value_string : styles.value;

  if (rawText.length <= threshold) {
    return (
      <span className={className}>
        {isString ? '"' : ""}
        {highlightText(rawText, searchQuery)}
        {isString ? '"' : ""}
      </span>
    );
  }

  const displayedText = isExpanded ? rawText : `${rawText.slice(0, threshold)}...`;

  return (
    <span
      className={`${className} ${styles.expandableText}`}
      onClick={(e) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
      }}
      title={isExpanded ? "Click to collapse text" : "Click to expand text"}
    >
      {isString ? '"' : ""}
      {highlightText(displayedText, searchQuery)}
      {isString ? '"' : ""}
    </span>
  );
}

function hasMatchingDescendant(node: DiffNode, query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  
  if (node.key.toLowerCase().includes(q)) return true;
  if (node.value !== undefined && String(node.value).toLowerCase().includes(q)) return true;
  if (node.oldValue !== undefined && String(node.oldValue).toLowerCase().includes(q)) return true;
  
  if (node.children) {
    return node.children.some(child => hasMatchingDescendant(child, query));
  }
  return false;
}

function pruneUnchangedNodes(nodes: DiffNode[]): DiffNode[] {
  return nodes
    .map(node => {
      if (node.type === "added" || node.type === "removed" || node.type === "modified") {
        return node;
      }
      if (node.type === "nested" && node.children) {
        const filteredChildren = pruneUnchangedNodes(node.children);
        if (filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren
          };
        }
      }
      return null;
    })
    .filter((n): n is DiffNode => n !== null);
}

function filterNodesBySearch(nodes: DiffNode[], query: string): DiffNode[] {
  const q = query.toLowerCase();
  return nodes
    .map(node => {
      const selfMatches = node.key.toLowerCase().includes(q) ||
        (node.value !== undefined && String(node.value).toLowerCase().includes(q)) ||
        (node.oldValue !== undefined && String(node.oldValue).toLowerCase().includes(q));

      if (node.children) {
        const filteredChildren = filterNodesBySearch(node.children, query);
        if (filteredChildren.length > 0 || selfMatches) {
          return {
            ...node,
            children: filteredChildren
          };
        }
      } else if (selfMatches) {
        return node;
      }
      return null;
    })
    .filter((n): n is DiffNode => n !== null);
}

function calculateStats(nodes: DiffNode[]): { added: number; removed: number; modified: number } {
  let added = 0;
  let removed = 0;
  let modified = 0;

  function traverse(nList: DiffNode[]) {
    for (const n of nList) {
      if (n.type === "added") added++;
      else if (n.type === "removed") removed++;
      else if (n.type === "modified") modified++;
      
      if (n.children) {
        traverse(n.children);
      }
    }
  }

  traverse(nodes);
  return { added, removed, modified };
}

export default function ContextInspector() {
  const { contextSnapshots, setContextHistoryIndex } = useConsole();
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);

  // Filter & search states
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(false);
  


  // Track the latest received context ID (the one with the most recent snapshot timestamp)
  const latestContextId = useMemo(() => {
    let latestId: string | null = null;
    let latestTime = 0;
    
    Object.entries(contextSnapshots).forEach(([id, history]) => {
      const lastSnapshot = history.snapshots[history.snapshots.length - 1];
      if (lastSnapshot && lastSnapshot.timestamp > latestTime) {
        latestTime = lastSnapshot.timestamp;
        latestId = id;
      }
    });
    
    return latestId;
  }, [contextSnapshots]);

  // Auto-switch to the latest context ID when a new snapshot arrives
  useEffect(() => {
    if (latestContextId) {
      setSelectedContextId(latestContextId);
    }
  }, [latestContextId]);

  // List of active context IDs, sorted by the timestamp of their most recent snapshot in descending order
  const contextIds = useMemo(() => {
    return Object.keys(contextSnapshots).sort((a, b) => {
      const historyA = contextSnapshots[a];
      const historyB = contextSnapshots[b];
      const lastA = historyA.snapshots[historyA.snapshots.length - 1]?.timestamp || 0;
      const lastB = historyB.snapshots[historyB.snapshots.length - 1]?.timestamp || 0;
      return lastB - lastA; // descending
    });
  }, [contextSnapshots]);

  // Automatically select the first context ID if none is selected
  const activeContextId = selectedContextId || contextIds[0] || null;
  const history = activeContextId ? contextSnapshots[activeContextId] : null;

  // Compute the diff of the currently active snapshot
  const diffTree = useMemo(() => {
    if (!history || history.snapshots.length === 0) return [];
    
    const idx = history.currentIndex;
    const currentSnapshot = history.snapshots[idx];

    if (idx === 0) {
      return diffObjects({}, currentSnapshot.data);
    } else {
      const prevSnapshot = history.snapshots[idx - 1];
      return diffObjects(prevSnapshot.data, currentSnapshot.data);
    }
  }, [history]);

  // Compute statistics (added, removed, modified)
  const stats = useMemo(() => {
    return calculateStats(diffTree);
  }, [diffTree]);

  // Filter & search tree processing
  const processedTree = useMemo(() => {
    let tree = diffTree;
    if (onlyChanges) {
      tree = pruneUnchangedNodes(tree);
    }
    if (searchQuery.trim()) {
      tree = filterNodesBySearch(tree, searchQuery.trim());
    }
    return tree;
  }, [diffTree, onlyChanges, searchQuery]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeContextId) return;
    const index = parseInt(e.target.value, 10);
    startTransition(() => {
      setContextHistoryIndex(activeContextId, index);
    });
  };



  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.title}>
          <Database size={18} className={styles.iconViolet} />
          <span>Context Inspector</span>
        </div>
        {contextIds.length > 0 && (
          <div className={styles.selectWrapper}>
            <Layers size={14} className={styles.selectIcon} />
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
          </div>
        )}
      </header>

      {history && history.snapshots.length > 0 ? (
        <>
          {/* History Scrubber Controls */}
          <div className={styles.scrubber}>
            <span className={styles.scrubberLabel}>
              <Clock size={12} />
              <span>Snapshot Timeline</span>
            </span>
            <input
              type="range"
              min={0}
              max={history.snapshots.length - 1}
              value={history.currentIndex}
              onChange={handleSliderChange}
              className={styles.slider}
              disabled={history.snapshots.length <= 1}
            />
            <span className={styles.scrubberValue}>
              {history.currentIndex + 1} / {history.snapshots.length}
            </span>
          </div>

          {/* Filtering Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.searchBar}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Search keys or values..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            
            <div className={styles.toolbarActions}>
              <button
                onClick={() => setOnlyChanges(!onlyChanges)}
                className={`${styles.toggleChip} ${onlyChanges ? styles.toggleChipActive : ""}`}
                title="Filter tree to show only additions, deletions, or modifications"
              >
                <SlidersHorizontal size={12} />
                <span>Changes Only</span>
              </button>
              

            </div>
          </div>

          {/* Metadata banner */}
          <div className={styles.metadataBanner}>
            <div className={styles.metaInfo}>
              <div className={styles.metaItem}>
                <Calendar size={12} className={styles.iconViolet} />
                <span>Seq: {history.snapshots[history.currentIndex].seq}</span>
              </div>
              <span className={styles.metaDivider}>|</span>
              <div className={styles.metaItem}>
                <Clock size={12} className={styles.iconViolet} />
                <span>
                  Time: {new Date(history.snapshots[history.currentIndex].timestamp).toLocaleTimeString()}
                </span>
              </div>
              <span className={styles.metaDivider}>|</span>
              <div className={styles.metaItem}>
                <HardDrive size={12} className={styles.iconViolet} />
                <span>
                  Size: {(JSON.stringify(history.snapshots[history.currentIndex].data).length / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>
            
            <div className={styles.diffStats}>
              {stats.added > 0 && <span className={styles.statAdded}>+{stats.added} Added</span>}
              {stats.removed > 0 && <span className={styles.statRemoved}>-{stats.removed} Removed</span>}
              {stats.modified > 0 && <span className={styles.statModified}>Δ {stats.modified} Mod</span>}
              {stats.added === 0 && stats.removed === 0 && stats.modified === 0 && (
                <span className={styles.statUnchanged}>No changes from prev</span>
              )}
            </div>
          </div>

          <div className={styles.scrollArea}>
            {processedTree.length === 0 ? (
              <div className={styles.noResults}>
                <Database size={24} className={styles.iconMuted} />
                <span>No matching keys or values found</span>
              </div>
            ) : (
              <div className={styles.treeWrapper}>
                {processedTree.map((node) => (
                  <TreeNode
                    key={node.key}
                    node={node}
                    isRoot={true}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className={styles.emptyState}>
          <Database size={40} className={styles.emptyIcon} />
          <span>No context loaded. Trigger an agent script in the chat.</span>
        </div>
      )}
    </div>
  );
}

interface TreeNodeProps {
  node: DiffNode;
  isRoot?: boolean;
  searchQuery: string;
}

const TreeNode = React.memo(function TreeNode({
  node,
  isRoot = false,
  searchQuery
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(isRoot);

  const hasChildren = !!(node.children && node.children.length > 0);

  // Expand node if children match search query
  useEffect(() => {
    if (searchQuery.trim()) {
      if (hasMatchingDescendant(node, searchQuery)) {
        setExpanded(true);
      }
    }
  }, [searchQuery, node]);

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
    return <ExpandableValue val={val} searchQuery={searchQuery} />;
  };

  return (
    <div className={styles.treeNode}>
      <div
        className={`${styles.nodeLabel} ${getDiffClass(node.type)}`}
        onClick={toggleExpand}
      >
        {hasChildren ? (
          <span className={styles.arrowIcon}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className={styles.arrowSpacer} />
        )}
        
        <span className={styles.keyName}>{highlightText(node.key, searchQuery)}</span>
        <span className={styles.colon}>:</span>

        {!hasChildren && (
          <div className={styles.valueContainer}>
            {node.type === "modified" ? (
              <span className={styles.modifiedRow}>
                {renderValue(node.value)}
                <span className={styles.modifiedOldValue}>
                  was <ExpandableValue val={node.oldValue} searchQuery={searchQuery} />
                </span>
              </span>
            ) : node.type === "removed" ? (
              renderValue(node.oldValue)
            ) : (
              renderValue(node.value)
            )}
          </div>
        )}

        {hasChildren && (
          <span className={styles.typeHelper}>
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
        <div className={styles.nodeChildren}>
          {node.children?.map((childNode) => (
            <TreeNode
              key={childNode.key}
              node={childNode}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
});
