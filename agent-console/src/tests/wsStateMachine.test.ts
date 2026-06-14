/**
 * wsStateMachine.test.ts — Unit tests for the WebSocket state machine.
 */

import { transition, canTransition, validEvents, WSStateMachine } from '../lib/wsStateMachine';
import type { ConnectionState } from '../types';
import type { WSEvent } from '../lib/wsStateMachine';

describe('transition (pure function)', () => {
  // ─── Valid transitions ─────────────────────────────────────────────────────

  test('IDLE → CONNECTING on USER_CONNECT', () => {
    expect(transition('IDLE', 'USER_CONNECT')).toBe('CONNECTING');
  });

  test('CONNECTING → CONNECTED on SOCKET_OPEN', () => {
    expect(transition('CONNECTING', 'SOCKET_OPEN')).toBe('CONNECTED');
  });

  test('CONNECTED → STREAMING on FIRST_TOKEN', () => {
    expect(transition('CONNECTED', 'FIRST_TOKEN')).toBe('STREAMING');
  });

  test('STREAMING → TOOL_CALL_PENDING on TOOL_CALL_RECEIVED', () => {
    expect(transition('STREAMING', 'TOOL_CALL_RECEIVED')).toBe('TOOL_CALL_PENDING');
  });

  test('TOOL_CALL_PENDING → STREAMING on TOOL_RESULT_RECEIVED', () => {
    expect(transition('TOOL_CALL_PENDING', 'TOOL_RESULT_RECEIVED')).toBe('STREAMING');
  });

  test('STREAMING → CONNECTED on STREAM_END', () => {
    expect(transition('STREAMING', 'STREAM_END')).toBe('CONNECTED');
  });

  test('STREAMING → RECONNECTING on CONNECTION_DROP', () => {
    expect(transition('STREAMING', 'CONNECTION_DROP')).toBe('RECONNECTING');
  });

  test('RECONNECTING → RESUMING on SOCKET_REOPENED', () => {
    expect(transition('RECONNECTING', 'SOCKET_REOPENED')).toBe('RESUMING');
  });

  test('RESUMING → CONNECTED on RESUME_SENT_AND_ACKED', () => {
    expect(transition('RESUMING', 'RESUME_SENT_AND_ACKED')).toBe('CONNECTED');
  });

  test('ANY state → CLOSED on MANUAL_DISCONNECT', () => {
    const states: ConnectionState[] = [
      'IDLE', 'CONNECTING', 'CONNECTED', 'STREAMING',
      'TOOL_CALL_PENDING', 'RECONNECTING', 'RESUMING',
    ];
    for (const s of states) {
      expect(transition(s, 'MANUAL_DISCONNECT')).toBe('CLOSED');
    }
  });

  test('CONNECTED → RECONNECTING on CONNECTION_DROP', () => {
    expect(transition('CONNECTED', 'CONNECTION_DROP')).toBe('RECONNECTING');
  });

  test('CONNECTING → RECONNECTING on CONNECTION_DROP', () => {
    expect(transition('CONNECTING', 'CONNECTION_DROP')).toBe('RECONNECTING');
  });

  test('TOOL_CALL_PENDING → RECONNECTING on CONNECTION_DROP', () => {
    expect(transition('TOOL_CALL_PENDING', 'CONNECTION_DROP')).toBe('RECONNECTING');
  });

  test('RESUMING → RECONNECTING on CONNECTION_DROP', () => {
    expect(transition('RESUMING', 'CONNECTION_DROP')).toBe('RECONNECTING');
  });

  test('CLOSED → CONNECTING on USER_CONNECT (re-connect after close)', () => {
    expect(transition('CLOSED', 'USER_CONNECT')).toBe('CONNECTING');
  });

  // ─── Invalid transitions — return current state ────────────────────────────

  test('invalid transitions return current state unchanged', () => {
    // IDLE can't receive SOCKET_OPEN before USER_CONNECT
    expect(transition('IDLE', 'SOCKET_OPEN')).toBe('IDLE');

    // CONNECTED can't receive TOOL_CALL_RECEIVED (must be STREAMING)
    expect(transition('CONNECTED', 'TOOL_CALL_RECEIVED')).toBe('CONNECTED');

    // IDLE can't receive CONNECTION_DROP
    expect(transition('IDLE', 'CONNECTION_DROP')).toBe('IDLE');

    // CLOSED can't receive SOCKET_OPEN
    expect(transition('CLOSED', 'SOCKET_OPEN')).toBe('CLOSED');

    // STREAMING can't receive SOCKET_OPEN
    expect(transition('STREAMING', 'SOCKET_OPEN')).toBe('STREAMING');

    // TOOL_CALL_PENDING can't receive STREAM_END
    expect(transition('TOOL_CALL_PENDING', 'STREAM_END')).toBe('TOOL_CALL_PENDING');
  });
});

describe('canTransition', () => {
  test('returns true for valid transitions', () => {
    expect(canTransition('IDLE', 'USER_CONNECT')).toBe(true);
    expect(canTransition('STREAMING', 'TOOL_CALL_RECEIVED')).toBe(true);
  });

  test('returns false for invalid transitions', () => {
    expect(canTransition('IDLE', 'SOCKET_OPEN')).toBe(false);
    expect(canTransition('CLOSED', 'SOCKET_OPEN')).toBe(false);
  });
});

describe('validEvents', () => {
  test('IDLE has USER_CONNECT and MANUAL_DISCONNECT', () => {
    const events = validEvents('IDLE');
    expect(events).toContain('USER_CONNECT');
    expect(events).toContain('MANUAL_DISCONNECT');
  });

  test('STREAMING has TOOL_CALL_RECEIVED, STREAM_END, CONNECTION_DROP, MANUAL_DISCONNECT', () => {
    const events = validEvents('STREAMING');
    expect(events).toContain('TOOL_CALL_RECEIVED');
    expect(events).toContain('STREAM_END');
    expect(events).toContain('CONNECTION_DROP');
    expect(events).toContain('MANUAL_DISCONNECT');
  });
});

describe('WSStateMachine (stateful class)', () => {
  test('starts in IDLE', () => {
    const sm = new WSStateMachine();
    expect(sm.state).toBe('IDLE');
  });

  test('transitions through full happy path', () => {
    const sm = new WSStateMachine();
    expect(sm.send('USER_CONNECT')).toBe('CONNECTING');
    expect(sm.send('SOCKET_OPEN')).toBe('CONNECTED');
    expect(sm.send('FIRST_TOKEN')).toBe('STREAMING');
    expect(sm.send('TOOL_CALL_RECEIVED')).toBe('TOOL_CALL_PENDING');
    expect(sm.send('TOOL_RESULT_RECEIVED')).toBe('STREAMING');
    expect(sm.send('STREAM_END')).toBe('CONNECTED');
    expect(sm.send('MANUAL_DISCONNECT')).toBe('CLOSED');
  });

  test('reconnection path', () => {
    const sm = new WSStateMachine('STREAMING');
    sm.send('CONNECTION_DROP');
    expect(sm.state).toBe('RECONNECTING');
    sm.send('SOCKET_REOPENED');
    expect(sm.state).toBe('RESUMING');
    sm.send('RESUME_SENT_AND_ACKED');
    expect(sm.state).toBe('CONNECTED');
  });

  test('reset returns to IDLE', () => {
    const sm = new WSStateMachine('STREAMING');
    sm.reset();
    expect(sm.state).toBe('IDLE');
  });

  test('can() returns correct boolean', () => {
    const sm = new WSStateMachine('STREAMING');
    expect(sm.can('TOOL_CALL_RECEIVED')).toBe(true);
    expect(sm.can('SOCKET_OPEN')).toBe(false);
  });

  test('invalid event keeps state unchanged', () => {
    const sm = new WSStateMachine('CONNECTED');
    sm.send('TOOL_CALL_RECEIVED' as WSEvent); // invalid from CONNECTED
    expect(sm.state).toBe('CONNECTED');
  });
});
