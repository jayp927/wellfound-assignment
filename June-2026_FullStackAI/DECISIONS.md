# Architectural & Design Decisions

This document details the systems design decisions, technical trade-offs, and scaling strategies implemented in the Agent Console.

---

## 1. Sequence-Based Ordering & Deduplication

### Approach & Data Structure
We implemented the `ReorderingBuffer` class to handle the out-of-order and duplicate message delivery introduced by the backend's chaos mode.

We chose a JavaScript `Map<number, ServerMessage>` as our primary data structure:
- **O(1) Insertion & Lookup**: Keying the map by the message sequence number (`seq`) allows us to inspect, insert, and delete out-of-order messages in constant time.
- **Deduplication**: Upon receiving a message, we first check `seq <= lastProcessedSeq` or `buffer.has(seq)`. If true, the message is immediately flagged as a duplicate and ignored.
- **Gap Resolution (Flush)**: Once a new message is inserted, we check if `lastProcessedSeq + 1` exists in the map. If it does, we pop it, increment `lastProcessedSeq`, add it to our flush list, and repeat. This guarantees that messages are emitted to the React state engine in a gapless, strictly increasing sequence.

### Out-of-Band Message Strategy (PING/ERROR)
A crucial protocol decision was made for `PING` and `ERROR` messages:
- **Immediate Dispatch**: If we buffer `PING` heartbeats behind missing tokens during a latency spike, the client will fail to respond with a `PONG` within the server's 3-second timeout, resulting in connection termination.
- To prevent this, we handle `PING` (and `ERROR` alerts) **immediately upon receipt on the WebSocket event listener**, bypassing the buffer to dispatch replies instantly.
- However, to ensure that sequence number tracking remains accurate (and we don't discard subsequent messages), we also pass these messages through the `ReorderingBuffer` to advance `lastProcessedSeq` when their position in the sequence is reached.

---

## 2. Preventing Layout Shift During Tool Interruptions

### Rendering Strategy
Traditional streaming chat interfaces render responses as a single concatenated text string. A mid-stream tool execution breaks this linear flow. If not handled carefully, rendering a tool card will cause the text to reflow or jitter.

To resolve this, we model the agent response as an ordered list of **discrete content blocks**:
```typescript
type ResponseBlock =
  | { type: "text"; text: string }
  | { type: "tool"; callId: string; toolName: string; args: object; result?: object; state: "waiting" | "acked" | "resolved" };
```

1. **Token Appending**: When a `TOKEN` arrives, it appends to the last block *only* if it is of type `"text"`.
2. **Stream Freezing**: When a `TOOL_CALL` arrives, the system appends a new `"tool"` block to the list. Subsequent `TOKEN` events will see that the last block is a `"tool"` block, and will automatically start a new `"text"` block below it.
3. **No Reflow / Shift**: This block-based layout ensures that the text before the tool call remains completely untouched and frozen. The tool card mounts directly below it, and the resumed tokens render below the card. 
4. **CSS Stability**: The tool card pre-allocates code blocks for parameters and results with stable font heights (`monospace`) and flex columns, preventing size transitions when the `TOOL_RESULT` is injected.

---

## 3. Reconnection State Recovery

### Consumed (DOM) vs. Received (Socket)
To make connection drops invisible, we must recover the exact state of what the DOM has fully processed.
- We maintain the `lastProcessedSeq` in a React `useRef` within our `useWebSocket` hook.
- When `useWebSocket` dispatches a message to the React state store and it is rendered, it advances the ref's sequence.
- On socket closure:
  1. The client displays a non-blocking "Reconnecting" toast but keeps the panels fully interactive (allowing scrolling and reading).
  2. It schedules retries using exponential backoff: `Math.min(500 * Math.pow(2, attempt), 10000)`.
  3. Upon a new connection, the client sends a `RESUME` payload containing the `lastProcessedSeq` ref value as the **first message** on the socket.
  4. The server replays all events after this sequence, which are fed through our reordering buffer to reconstruct any missing gaps.
  
If the drop happened mid-tool-call, the tool block is retained in the chat feed in its `"waiting"` or `"acked"` state. When the replayed stream delivers the `TOOL_RESULT`, it updates the card in place.

---

## 4. Scaling to High-Throughput Scenarios

### Scenario A: 50 Concurrent Streams (Operations Dashboard)
Under 50 concurrent streams, each streaming at 30+ tokens/sec, the UI thread would freeze due to React's rendering overhead (~1,500 re-renders/sec). To scale to this level, we would implement:
1. **Zustand with Transient Updates**: Replace React Context with a store like Zustand. Use direct DOM node references (`useRef` or canvas rendering) for streaming text, bypassing React's virtual DOM diffing entirely for token updates.
2. **AnimationFrame Batching (Throttling)**: Buffer incoming tokens in memory and flush them to the DOM at 60Hz using `requestAnimationFrame`, preventing the browser from paint-choking.
3. **DOM Virtualization & CSS Containment**: Use `content-visibility: auto` and list virtualization to render only the 5-10 streams visible on screen, skipping layouts for off-screen panels.
4. **Web Workers**: Move the WebSocket connection, reordering buffer, and JSON diff calculation to a Web Worker thread, keeping the main thread 100% free for user interactions.

### Scenario B: 100x Longer Responses (Full Document Generation)
If responses were 100x longer (megabytes of text):
1. **Incremental Markdown Parsing**: Standard markdown parsers parse the entire string from scratch. For huge text, this causes exponential slowdown. We would use a stateful, stream-safe markdown parser that only parses new tokens.
2. **Paging/Lazy Virtualization**: Instead of mounting the entire document, split it into pages or paragraph nodes and virtualize them so the DOM length remains constant.
3. **Ref-based Appends**: Append text directly to the active HTML paragraph node using `element.insertAdjacentText()`, preventing React from re-rendering the entire page wrapper.
