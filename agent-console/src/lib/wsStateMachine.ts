/**
 * wsStateMachine.ts — Pure state machine, no React, no side effects.
 * All state transitions are deterministic functions: (state, event) → state.
 */

import type { ConnectionState } from '@/src/types';

export type WSEvent =
  | 'USER_CONNECT'
  | 'SOCKET_OPEN'
  | 'FIRST_TOKEN'
  | 'TOOL_CALL_RECEIVED'
  | 'TOOL_RESULT_RECEIVED'
  | 'STREAM_END'
  | 'CONNECTION_DROP'
  | 'SOCKET_REOPENED'
  | 'RESUME_SENT_AND_ACKED'
  | 'MANUAL_DISCONNECT';

type TransitionMap = Partial<Record<WSEvent, ConnectionState>>;
type StateMachineConfig = Record<ConnectionState, TransitionMap>;

const TRANSITIONS: StateMachineConfig = {
  IDLE: {
    USER_CONNECT: 'CONNECTING',
    MANUAL_DISCONNECT: 'CLOSED',
  },
  CONNECTING: {
    SOCKET_OPEN: 'CONNECTED',
    CONNECTION_DROP: 'RECONNECTING',
    MANUAL_DISCONNECT: 'CLOSED',
  },
  CONNECTED: {
    FIRST_TOKEN: 'STREAMING',
    CONNECTION_DROP: 'RECONNECTING',
    MANUAL_DISCONNECT: 'CLOSED',
  },
  STREAMING: {
    TOOL_CALL_RECEIVED: 'TOOL_CALL_PENDING',
    STREAM_END: 'CONNECTED',
    CONNECTION_DROP: 'RECONNECTING',
    MANUAL_DISCONNECT: 'CLOSED',
  },
  TOOL_CALL_PENDING: {
    TOOL_RESULT_RECEIVED: 'STREAMING',
    CONNECTION_DROP: 'RECONNECTING',
    MANUAL_DISCONNECT: 'CLOSED',
  },
  RECONNECTING: {
    SOCKET_REOPENED: 'RESUMING',
    MANUAL_DISCONNECT: 'CLOSED',
  },
  RESUMING: {
    RESUME_SENT_AND_ACKED: 'CONNECTED',
    CONNECTION_DROP: 'RECONNECTING',
    MANUAL_DISCONNECT: 'CLOSED',
  },
  CLOSED: {
    USER_CONNECT: 'CONNECTING',
  },
};

/**
 * Pure transition function. Returns the next state given current state + event.
 * Returns current state unchanged for invalid transitions.
 */
export function transition(
  current: ConnectionState,
  event: WSEvent
): ConnectionState {
  const map = TRANSITIONS[current];
  return map[event] ?? current;
}

/**
 * Returns true if the given event is valid from the current state.
 */
export function canTransition(
  current: ConnectionState,
  event: WSEvent
): boolean {
  return event in TRANSITIONS[current];
}

/**
 * Returns all valid events from the given state.
 */
export function validEvents(current: ConnectionState): WSEvent[] {
  return Object.keys(TRANSITIONS[current]) as WSEvent[];
}

/**
 * Stateful wrapper — holds current state and applies transitions.
 * Useful for the wsClient which needs to track state over time.
 */
export class WSStateMachine {
  private _state: ConnectionState;

  constructor(initial: ConnectionState = 'IDLE') {
    this._state = initial;
  }

  get state(): ConnectionState {
    return this._state;
  }

  send(event: WSEvent): ConnectionState {
    this._state = transition(this._state, event);
    return this._state;
  }

  can(event: WSEvent): boolean {
    return canTransition(this._state, event);
  }

  reset(): void {
    this._state = 'IDLE';
  }
}
