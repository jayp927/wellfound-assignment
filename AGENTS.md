# AGENTS.md

# Agent Console

A resilient AI Agent Console built with Next.js that communicates with the provided mock agent backend over WebSockets.

The system is designed to survive unreliable network conditions, out-of-order events, duplicate messages, dropped packets, backend restarts, and large context updates while maintaining a consistent user experience.

---

# Design Goals

The assignment focuses on distributed systems reliability rather than simple chat rendering.

Core objectives:

* Render streaming agent responses in real time.
* Handle mid-stream tool call interruptions.
* Visualize agent execution traces.
* Support context inspection and diffing.
* Recover from network failures without losing state.
* Survive backend chaos mode.

---

# High-Level Architecture

```
WebSocket
     │
     ▼
┌─────────────────────┐
│ Protocol Layer      │
│                     │
│ Reordering Buffer   │
│ Duplicate Filter    │
│ Resume Logic        │
│ Heartbeat Handler   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ State Store         │
│                     │
│ Chat State          │
│ Trace State         │
│ Context State       │
│ Connection State    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ UI Layer            │
│                     │
│ Chat Panel          │
│ Timeline Panel      │
│ Context Inspector   │
└─────────────────────┘
```

The architecture intentionally separates protocol concerns from rendering concerns.

React components never directly consume raw socket messages.

All incoming events pass through the protocol engine before reaching application state.

---

# Project Structure

```
agent-console/

src/
│
├── app/
│   └── page.tsx
│
├── components/
│   ├── ChatPanel.tsx
│   ├── TimelinePanel.tsx
│   └── ContextInspector.tsx
│
├── hooks/
│   └── useWebSocket.ts
│
├── lib/
│   ├── reordering-buffer.ts
│   └── json-diff.ts
│
├── store/
│   └── state-store.ts
│
├── types/
│   └── protocol.ts
│
└── workers/
    └── diff.worker.ts
```

---

# Protocol Layer

The protocol layer is responsible for correctness.

Responsibilities:

* WebSocket lifecycle management
* Heartbeat handling
* Resume support
* Duplicate filtering
* Message ordering
* Tool acknowledgement

UI components must never contain protocol logic.

---

# Connection Lifecycle

States:

```
DISCONNECTED
      │
      ▼
CONNECTING
      │
      ▼
CONNECTED
      │
      ├── socket lost
      ▼
RECONNECTING
      │
      ▼
RESUMING
      │
      ▼
CONNECTED
```

Features:

* Exponential backoff reconnect
* Automatic resume
* Connection status tracking
* Heartbeat monitoring

---

# Heartbeat Handling

Server may send:

```json
{
  "type": "PING",
  "challenge": "abc123"
}
```

Client must immediately respond:

```json
{
  "type": "PONG",
  "challenge": "abc123"
}
```

Rules:

* Challenge must be echoed verbatim.
* Empty challenge strings are valid.
* Missing heartbeat causes reconnect.

---

# Reordering Buffer

Chaos mode may deliver messages:

* Out of order
* Duplicated
* Delayed

Example:

```
1
3
2
5
4
```

The buffer guarantees downstream consumers only receive:

```
1
2
3
4
5
```

Duplicate messages are discarded.

The buffer tracks:

```ts
lastProcessedSeq
```

and only releases contiguous sequences.

---

# Resume Strategy

The client stores:

```ts
lastProcessedSeq
```

After reconnect:

```json
{
  "type": "RESUME",
  "lastProcessedSeq": 421
}
```

The backend then replays missing events.

This prevents:

* Lost tokens
* Broken traces
* Missing tool results

---

# State Management

State is centralized using Zustand.

Why Zustand:

* Minimal re-renders
* Simple subscriptions
* Excellent support for streaming updates
* Easier protocol/UI separation

Store domains:

```ts
chat
timeline
contextSnapshots
connection
activeStreams
```

---

# Streaming Message Rendering

Agent responses arrive incrementally.

Example:

```
TOKEN
TOKEN
TOKEN
TOOL_CALL
TOOL_RESULT
TOKEN
TOKEN
END
```

Rendering model:

```ts
Message
 ├── TextBlock
 ├── ToolCallBlock
 ├── ToolResultBlock
 └── TextBlock
```

This avoids layout shifts when tools interrupt generation.

---

# Tool Call Handling

When a tool call is received:

1. Render tool card.
2. Send TOOL_ACK immediately.
3. Wait for TOOL_RESULT.
4. Resume streaming.

No duplicate rendering should occur after reconnection.

---

# Timeline Panel

Purpose:

Provide a live view of protocol activity.

Displays:

* Tokens
* Tool calls
* Tool results
* Context updates
* Connection events
* Resume events

Optimizations:

* Event grouping
* Virtualized rendering
* Incremental updates

---

# Context Inspector

Displays the active agent context.

Features:

* Expandable JSON tree
* Snapshot history
* Diff visualization
* Change highlighting

Change types:

* Added
* Removed
* Modified

---

# Context Diffing

Large context payloads may exceed several hundred kilobytes.

Diff algorithm produces:

```ts
{
  added: [],
  removed: [],
  modified: []
}
```

If profiling reveals frame drops, diffing can be moved into a Web Worker without changing component APIs.

---

# Performance Considerations

Streaming tokens can arrive rapidly.

To prevent excessive React updates:

* Token batching
* Store-level aggregation
* Memoized components
* Virtualized timelines

Goals:

* No dropped frames
* No UI freezes
* Smooth scrolling

---

# Testing Strategy

## Unit Tests

### Reordering Buffer

Verify:

* Empty input
* Ordered input
* Out-of-order input
* Duplicate input
* Resume scenarios

### JSON Diff

Verify:

* Nested objects
* Arrays
* Additions
* Deletions
* Modifications

---

# Chaos Mode Validation

Checklist:

* Network interruption recovery
* Duplicate packet handling
* Out-of-order packet handling
* Resume correctness
* Tool call recovery
* Context rendering stability
* Heartbeat compliance

---

# Development Commands

Install dependencies:

```bash
npm run install:all
```

Run frontend:

```bash
npm run dev
```

Run backend:

```bash
npm run server:start
```

Run backend chaos mode:

```bash
npm run server:chaos
```

Build:

```bash
npm run build
```

Production:

```bash
npm run start
```

---

# Guiding Principle

Correctness before rendering.

Every protocol event must be processed exactly once, in the correct order, regardless of transport instability.

The UI is a projection of validated state, never a direct projection of socket traffic.
