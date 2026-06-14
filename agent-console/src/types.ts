// ─── Connection ───────────────────────────────────────────────────────────────

export type ConnectionState =
  | 'IDLE'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'STREAMING'
  | 'TOOL_CALL_PENDING'
  | 'RECONNECTING'
  | 'RESUMING'
  | 'CLOSED';

// ─── Server → Client Messages ────────────────────────────────────────────────

export interface TokenMessage {
  type: 'TOKEN';
  seq: number;
  text: string;
  stream_id: string;
}

export interface ToolCallMessage {
  type: 'TOOL_CALL';
  seq: number;
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  stream_id: string;
}

export interface ToolResultMessage {
  type: 'TOOL_RESULT';
  seq: number;
  call_id: string;
  result: Record<string, unknown>;
  stream_id: string;
}

export interface ContextSnapshotMessage {
  type: 'CONTEXT_SNAPSHOT';
  seq: number;
  context_id: string;
  data: Record<string, unknown>;
}

export interface PingMessage {
  type: 'PING';
  seq: number;
  challenge: string;
}

export interface StreamEndMessage {
  type: 'STREAM_END';
  seq: number;
  stream_id: string;
}

export interface ErrorMessage {
  type: 'ERROR';
  seq: number;
  code: string;
  message: string;
}

export type ServerMessage =
  | TokenMessage
  | ToolCallMessage
  | ToolResultMessage
  | ContextSnapshotMessage
  | PingMessage
  | StreamEndMessage
  | ErrorMessage;

// ─── Client → Server Messages ────────────────────────────────────────────────

export interface UserMessagePayload {
  type: 'USER_MESSAGE';
  content: string;
}

export interface PongMessage {
  type: 'PONG';
  echo: string;
}

export interface ResumeMessage {
  type: 'RESUME';
  last_seq: number;
}

export interface ToolAckMessage {
  type: 'TOOL_ACK';
  call_id: string;
}

export type ClientMessage =
  | UserMessagePayload
  | PongMessage
  | ResumeMessage
  | ToolAckMessage;

// ─── App State Types ──────────────────────────────────────────────────────────

export type ToolCallStatus = 'pending' | 'resolved';

export interface ToolCallEntry {
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result: Record<string, unknown> | null;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  /** accumulated text content */
  text: string;
  stream_id: string | null;
  toolCalls: ToolCallEntry[];
  isStreaming: boolean;
  createdAt: number;
}

export interface StreamState {
  stream_id: string;
  messageId: string;
  isActive: boolean;
  lastTokenSeq: number;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'TOKEN'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'PING'
  | 'PONG'
  | 'CONTEXT_SNAPSHOT'
  | 'STREAM_END'
  | 'ERROR'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'RESUMED';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  seq: number;
  timestamp: number;
  summary: string;
  /** For TOKEN batching — raw text accumulated */
  tokenText?: string;
  /** For linking TOOL_CALL + TOOL_RESULT */
  call_id?: string;
  stream_id?: string;
  context_id?: string;
  /** Whether this row is a batch group */
  isBatch?: boolean;
  batchCount?: number;
  batchDurationMs?: number;
  batchStartTime?: number;
}

// ─── Context Snapshots ────────────────────────────────────────────────────────

export interface ContextSnapshot {
  context_id: string;
  seq: number;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── JSON Diff ────────────────────────────────────────────────────────────────

export interface DiffResult {
  added: Record<string, unknown>;
  removed: Record<string, unknown>;
  changed: Record<string, { from: unknown; to: unknown }>;
  unchanged: Record<string, unknown>;
}
