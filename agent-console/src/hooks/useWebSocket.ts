'use client';

/**
 * useWebSocket.ts — React hook wrapping WSClient.
 *
 * Bridges the imperative WSClient class with the React component tree.
 * Creates one WSClient instance per mount, wires it to the Zustand store,
 * and exposes connect/disconnect/send functions.
 */

import { useCallback, useEffect, useRef } from 'react';
import { WSClient, type ClientFrameNote } from '@/src/lib/wsClient';
import { useAgentStore } from '@/src/store/agentStore';
import type {
  ServerMessage,
  ConnectionState,
  ClientMessage,
  ToolCallMessage,
  ToolResultMessage,
  ContextSnapshotMessage,
} from '@/src/types';

let timelineSeq = 0;
function nextTimelineId(): string {
  return `tl-${++timelineSeq}-${Date.now()}`;
}

export function useWebSocket(wsUrl: string) {
  const clientRef = useRef<WSClient | null>(null);

  const setConnectionState = useAgentStore((s) => s.setConnectionState);
  const addToken = useAgentStore((s) => s.addToken);
  const addToolCall = useAgentStore((s) => s.addToolCall);
  const resolveToolCall = useAgentStore((s) => s.resolveToolCall);
  const addContextSnapshot = useAgentStore((s) => s.addContextSnapshot);
  const addTimelineEvent = useAgentStore((s) => s.addTimelineEvent);
  const endStream = useAgentStore((s) => s.endStream);

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      const now = Date.now();

      switch (msg.type) {
        case 'TOKEN':
          addToken(msg.stream_id, msg.text, msg.seq);
          addTimelineEvent({
            id: nextTimelineId(),
            type: 'TOKEN',
            seq: msg.seq,
            timestamp: now,
            summary: `"${msg.text.slice(0, 40)}${msg.text.length > 40 ? '…' : ''}"`,
            tokenText: msg.text,
            stream_id: msg.stream_id,
          });
          break;

        case 'TOOL_CALL':
          addToolCall(msg as ToolCallMessage);
          addTimelineEvent({
            id: nextTimelineId(),
            type: 'TOOL_CALL',
            seq: msg.seq,
            timestamp: now,
            summary: `${msg.tool_name}(${JSON.stringify(msg.args).slice(0, 60)})`,
            call_id: msg.call_id,
            stream_id: msg.stream_id,
          });
          break;

        case 'TOOL_RESULT':
          resolveToolCall(msg as ToolResultMessage);
          addTimelineEvent({
            id: nextTimelineId(),
            type: 'TOOL_RESULT',
            seq: msg.seq,
            timestamp: now,
            summary: `Result for ${msg.call_id.slice(0, 16)}`,
            call_id: msg.call_id,
            stream_id: msg.stream_id,
          });
          break;

        case 'CONTEXT_SNAPSHOT':
          addContextSnapshot(msg as ContextSnapshotMessage);
          addTimelineEvent({
            id: nextTimelineId(),
            type: 'CONTEXT_SNAPSHOT',
            seq: msg.seq,
            timestamp: now,
            summary: `ctx:${msg.context_id}`,
            context_id: msg.context_id,
          });
          break;

        case 'PING':
          addTimelineEvent({
            id: nextTimelineId(),
            type: 'PING',
            seq: msg.seq,
            timestamp: now,
            summary: msg.challenge
              ? `challenge: "${msg.challenge.slice(0, 20)}"`
              : '⚠ empty challenge',
          });
          break;

        case 'STREAM_END':
          endStream(msg.stream_id);
          addTimelineEvent({
            id: nextTimelineId(),
            type: 'STREAM_END',
            seq: msg.seq,
            timestamp: now,
            summary: `stream ${msg.stream_id} ended`,
            stream_id: msg.stream_id,
          });
          break;

        case 'ERROR':
          addTimelineEvent({
            id: nextTimelineId(),
            type: 'ERROR',
            seq: msg.seq,
            timestamp: now,
            summary: `[${msg.code}] ${msg.message}`,
          });
          break;
      }
    },
    [addToken, addToolCall, resolveToolCall, addContextSnapshot, addTimelineEvent, endStream]
  );

  const handleStateChange = useCallback(
    (state: string) => {
      setConnectionState(state as ConnectionState);
    },
    [setConnectionState]
  );

  // Client → server protocol frames (PONG, RESUME) surfaced as timeline rows so
  // the trace shows both directions of the conversation.
  const handleClientFrame = useCallback(
    (note: ClientFrameNote) => {
      addTimelineEvent({
        id: nextTimelineId(),
        type: note.kind === 'PONG' ? 'PONG' : 'RESUMED',
        seq: note.seq,
        timestamp: Date.now(),
        summary: note.kind === 'PONG' ? `PONG ${note.detail}` : `RESUME ${note.detail}`,
      });
    },
    [addTimelineEvent]
  );

  // Create client once per URL
  useEffect(() => {
    const client = new WSClient(handleMessage, handleStateChange, handleClientFrame);
    clientRef.current = client;
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsUrl]);

  // Keep callbacks fresh on client without recreating socket
  useEffect(() => {
    if (clientRef.current) {
      clientRef.current.onMessage = handleMessage;
      clientRef.current.onStateChange = handleStateChange;
      clientRef.current.onClientFrame = handleClientFrame;
    }
  }, [handleMessage, handleStateChange, handleClientFrame]);

  const connect = useCallback(() => {
    clientRef.current?.connect(wsUrl);
  }, [wsUrl]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    clientRef.current?.send(msg);
  }, []);

  const notifyRendered = useCallback((seq: number) => {
    clientRef.current?.setLastRenderedSeq(seq);
  }, []);

  // Reset per-turn seq tracking before a new USER_MESSAGE — the server restarts
  // its seq counter at 0 for each turn, so the client must too.
  const beginTurn = useCallback(() => {
    clientRef.current?.beginTurn();
  }, []);

  return { connect, disconnect, send, beginTurn, notifyRendered };
}
