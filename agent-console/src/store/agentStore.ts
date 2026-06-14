/**
 * agentStore.ts — Central Zustand store with Immer middleware.
 *
 * Single source of truth for all app state: connection, chat messages,
 * streaming state, timeline events, and context snapshots.
 *
 * MapSet plugin: Immer requires enableMapSet() to use Map/Set inside
 * produce(). Called once here at module load time.
 *
 * See DECISIONS.md for why Zustand over Redux/Context.
 */

import { create } from 'zustand';
import { enableMapSet } from 'immer';
import { immer } from 'zustand/middleware/immer';

// Must be called once before any Immer produce() that touches a Map or Set
enableMapSet();
import type {
  ConnectionState,
  ChatMessage,
  StreamState,
  TimelineEvent,
  ContextSnapshot,
  ToolCallEntry,
  ToolCallMessage,
  ToolResultMessage,
  ContextSnapshotMessage,
} from '@/src/types';

// ─── Store Shape ──────────────────────────────────────────────────────────────

interface AgentStore {
  // Connection
  connectionState: ConnectionState;
  lastRenderedSeq: number;
  lastReceivedSeq: number;

  // Chat
  messages: ChatMessage[];
  activeStreams: Map<string, StreamState>;

  // Timeline
  timelineEvents: TimelineEvent[];
  // Cross-panel focus: focusedEventId pins a specific timeline row; focusedCallId
  // and focusedStreamId correlate a tool card / message with its timeline entries
  // (and vice-versa) so clicking either side highlights the other.
  focusedEventId: string | null;
  focusedCallId: string | null;
  focusedStreamId: string | null;

  // Context
  contextSnapshots: Map<string, ContextSnapshot[]>;
  activeContextId: string | null;

  // Actions
  setConnectionState: (state: ConnectionState) => void;
  addUserMessage: (content: string) => void;
  addToken: (streamId: string, text: string, seq: number) => void;
  addToolCall: (event: ToolCallMessage) => void;
  resolveToolCall: (event: ToolResultMessage) => void;
  addContextSnapshot: (event: ContextSnapshotMessage) => void;
  addTimelineEvent: (event: TimelineEvent) => void;
  setLastRenderedSeq: (seq: number) => void;
  setLastReceivedSeq: (seq: number) => void;
  setFocusedEvent: (id: string | null) => void;
  setActiveContextId: (id: string) => void;
  /** Focus a timeline row and correlate it to chat via call_id / stream_id. */
  focusTimelineEvent: (event: { id: string; call_id?: string; stream_id?: string }) => void;
  /** Focus a tool call from the chat side (scrolls the timeline to its TOOL_CALL row). */
  focusToolCall: (callId: string | null) => void;
  clearFocus: () => void;
  endStream: (streamId: string) => void;
  reset: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAgentStore = create<AgentStore>()(
  immer((set) => ({
    // Initial state
    connectionState: 'IDLE' as ConnectionState,
    lastRenderedSeq: 0,
    lastReceivedSeq: 0,
    messages: [],
    activeStreams: new Map<string, StreamState>(),
    timelineEvents: [],
    focusedEventId: null,
    focusedCallId: null,
    focusedStreamId: null,
    contextSnapshots: new Map<string, ContextSnapshot[]>(),
    activeContextId: null,

    // ── Actions ───────────────────────────────────────────────────────────────

    setConnectionState: (state) =>
      set((draft) => {
        draft.connectionState = state;
      }),

    addUserMessage: (content) =>
      set((draft) => {
        draft.messages.push({
          id: generateId(),
          role: 'user',
          text: content,
          stream_id: null,
          toolCalls: [],
          isStreaming: false,
          createdAt: Date.now(),
        });
      }),

    addToken: (streamId, text, seq) =>
      set((draft) => {
        // Ensure stream + message exist
        if (!draft.activeStreams.has(streamId)) {
          const msgId = generateId();
          const newMsg: ChatMessage = {
            id: msgId,
            role: 'assistant',
            text: '',
            stream_id: streamId,
            toolCalls: [],
            isStreaming: true,
            createdAt: Date.now(),
          };
          draft.messages.push(newMsg);
          draft.activeStreams.set(streamId, {
            stream_id: streamId,
            messageId: msgId,
            isActive: true,
            lastTokenSeq: 0,
          });
        }

        const stream = draft.activeStreams.get(streamId);
        if (!stream) return;

        const msg = draft.messages.find((m) => m.id === stream.messageId);
        if (!msg) return;

        msg.text += text;
        stream.lastTokenSeq = seq;
      }),

    addToolCall: (event) =>
      set((draft) => {
        // Ensure stream exists
        if (!draft.activeStreams.has(event.stream_id)) {
          const msgId = generateId();
          draft.messages.push({
            id: msgId,
            role: 'assistant',
            text: '',
            stream_id: event.stream_id,
            toolCalls: [],
            isStreaming: true,
            createdAt: Date.now(),
          });
          draft.activeStreams.set(event.stream_id, {
            stream_id: event.stream_id,
            messageId: msgId,
            isActive: true,
            lastTokenSeq: 0,
          });
        }

        const stream = draft.activeStreams.get(event.stream_id);
        if (!stream) return;

        const msg = draft.messages.find((m) => m.id === stream.messageId);
        if (!msg) return;

        const entry: ToolCallEntry = {
          call_id: event.call_id,
          tool_name: event.tool_name,
          args: event.args,
          status: 'pending',
          result: null,
        };
        msg.toolCalls.push(entry);
      }),

    resolveToolCall: (event) =>
      set((draft) => {
        for (const msg of draft.messages) {
          const tc = msg.toolCalls.find((t) => t.call_id === event.call_id);
          if (tc) {
            // Idempotent — already resolved is a no-op (handles replay)
            if (tc.status !== 'resolved') {
              tc.status = 'resolved';
              tc.result = event.result;
            }
            break;
          }
        }
      }),

    addContextSnapshot: (event) =>
      set((draft) => {
        const snapshot: ContextSnapshot = {
          context_id: event.context_id,
          seq: event.seq,
          timestamp: Date.now(),
          data: event.data,
        };

        const existing = draft.contextSnapshots.get(event.context_id);
        if (existing) {
          existing.push(snapshot);
        } else {
          draft.contextSnapshots.set(event.context_id, [snapshot]);
        }
        draft.activeContextId = event.context_id;
      }),

    addTimelineEvent: (event) =>
      set((draft) => {
        draft.timelineEvents.push(event);
      }),

    setLastRenderedSeq: (seq) =>
      set((draft) => {
        draft.lastRenderedSeq = seq;
      }),

    setLastReceivedSeq: (seq) =>
      set((draft) => {
        draft.lastReceivedSeq = seq;
      }),

    setFocusedEvent: (id) =>
      set((draft) => {
        draft.focusedEventId = id;
      }),

    setActiveContextId: (id) =>
      set((draft) => {
        draft.activeContextId = id;
      }),

    focusTimelineEvent: (event) =>
      set((draft) => {
        // Toggle off if the same row is clicked again.
        if (draft.focusedEventId === event.id) {
          draft.focusedEventId = null;
          draft.focusedCallId = null;
          draft.focusedStreamId = null;
          return;
        }
        draft.focusedEventId = event.id;
        draft.focusedCallId = event.call_id ?? null;
        draft.focusedStreamId = event.stream_id ?? null;
      }),

    focusToolCall: (callId) =>
      set((draft) => {
        if (callId !== null && draft.focusedCallId === callId) {
          draft.focusedCallId = null;
          draft.focusedEventId = null;
          draft.focusedStreamId = null;
          return;
        }
        // Pin the call_id; the timeline scrolls to the matching TOOL_CALL row.
        draft.focusedCallId = callId;
        draft.focusedEventId = null;
        draft.focusedStreamId = null;
      }),

    clearFocus: () =>
      set((draft) => {
        draft.focusedEventId = null;
        draft.focusedCallId = null;
        draft.focusedStreamId = null;
      }),

    endStream: (streamId) =>
      set((draft) => {
        const stream = draft.activeStreams.get(streamId);
        if (stream) {
          stream.isActive = false;
        }
        const msg = draft.messages.find((m) => m.stream_id === streamId);
        if (msg) {
          msg.isStreaming = false;
        }
      }),

    reset: () =>
      set((draft) => {
        draft.connectionState = 'IDLE';
        draft.lastRenderedSeq = 0;
        draft.lastReceivedSeq = 0;
        draft.messages = [];
        draft.activeStreams = new Map();
        draft.timelineEvents = [];
        draft.focusedEventId = null;
        draft.focusedCallId = null;
        draft.focusedStreamId = null;
        draft.contextSnapshots = new Map();
        draft.activeContextId = null;
      }),
  }))
);
