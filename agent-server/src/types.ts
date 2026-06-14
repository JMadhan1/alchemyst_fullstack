export interface TokenMessage {
  type: "TOKEN";
  seq: number;
  text: string;
  stream_id: string;
}

export interface ToolCallMessage {
  type: "TOOL_CALL";
  seq: number;
  call_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  stream_id: string;
}

export interface ToolResultMessage {
  type: "TOOL_RESULT";
  seq: number;
  call_id: string;
  result: Record<string, unknown>;
  stream_id: string;
}

export interface ContextSnapshotMessage {
  type: "CONTEXT_SNAPSHOT";
  seq: number;
  context_id: string;
  data: Record<string, unknown>;
}

export interface PingMessage {
  type: "PING";
  seq: number;
  challenge: string;
}

export interface StreamEndMessage {
  type: "STREAM_END";
  seq: number;
  stream_id: string;
}

export interface ErrorMessage {
  type: "ERROR";
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

export interface UserMessagePayload {
  type: "USER_MESSAGE";
  content: string;
}

export interface PongPayload {
  type: "PONG";
  echo: string;
}

export interface ResumePayload {
  type: "RESUME";
  last_seq: number;
}

export interface ToolAckPayload {
  type: "TOOL_ACK";
  call_id: string;
}

export type ClientMessage =
  | UserMessagePayload
  | PongPayload
  | ResumePayload
  | ToolAckPayload;

export interface ScriptTokenEvent {
  kind: "token";
  text: string;
}

export interface ScriptToolCallEvent {
  kind: "tool_call";
  tool_name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ScriptContextEvent {
  kind: "context";
  context_id: string;
  data: Record<string, unknown>;
}

export type ScriptEvent = ScriptTokenEvent | ScriptToolCallEvent | ScriptContextEvent;

export interface ResponseScript {
  id: string;
  name: string;
  triggers: string[];
  events: ScriptEvent[];
}

export interface ClientLogEntry {
  timestamp: number;
  type: string;
  data: Record<string, unknown>;
  verdict?: string;
}

export interface ChaosConfig {
  dropAfterMessages: number | null;
  reorderProbability: number;
  duplicateProbability: number;
  latencySpikeProbability: number;
  latencySpikeMs: [number, number];
  corruptPingProbability: number;
}

export type ServerMode = "normal" | "chaos";
