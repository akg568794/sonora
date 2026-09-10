import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { emit, socket } from '../lib/socket.js';

const REACTION_TTL = 4200;

const initialState = {
  status: 'idle', // idle | joining | joined | error
  error: null,
  code: null,
  name: '',
  hostId: null,
  allowGuestControl: true,
  listeners: [],
  queue: [],
  chat: [],
  playback: { currentQid: null, isPlaying: false, positionAtStart: 0, startedAt: 0, repeat: 'off', shuffle: false },
};

function reducer(state, action) {
  switch (action.type) {
    case 'joining':
      return { ...initialState, status: 'joining', code: action.code };
    case 'joined': {
      const { room } = action;
      return {
        status: 'joined',
        error: null,
        code: room.code,
        name: room.name,
        hostId: room.hostId,
        allowGuestControl: room.allowGuestControl,
        listeners: room.listeners,
        queue: room.queue,
        chat: room.chat,
        playback: room.playback,
      };
    }
    case 'error':
      return { ...initialState, status: 'error', error: action.error };
    case 'left':
      return initialState;
    case 'listeners':
      return { ...state, listeners: action.listeners, hostId: action.hostId ?? state.hostId };
    case 'queue':
      return { ...state, queue: action.queue };
    case 'playback':
      return { ...state, playback: action.playback };
    case 'meta':
      return {
        ...state,
        allowGuestControl: action.allowGuestControl ?? state.allowGuestControl,
        hostId: action.hostId ?? state.hostId,
      };
    case 'chat':
      return { ...state, chat: [...state.chat, action.message].slice(-200) };
    default:
      return state;
  }
}

/**
 * Owns everything about the room the user is currently in: subscribes to the
 * server's broadcasts, exposes intent-style actions, and re-joins automatically
 * after a reconnect so a flaky network doesn't drop you out of the session.
 */
export function useRoom(identity) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [reactions, setReactions] = useState([]);
  const [connected, setConnected] = useState(socket.connected);
  const codeRef = useRef(null);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  // --------------------------------------------------------------- socket wiring

  useEffect(() => {
    const onConnect = async () => {
      setConnected(true);
      await emit('identify', identityRef.current);
      // Re-enter the room we were in before the drop.
      if (codeRef.current) {
        const reply = await emit('room:join', { code: codeRef.current });
        if (reply.ok) dispatch({ type: 'joined', room: reply.room });
        else dispatch({ type: 'error', error: reply.error });
      }
    };
    const onDisconnect = () => setConnected(false);

    const onListeners = (payload) =>
      dispatch({ type: 'listeners', listeners: payload.listeners, hostId: payload.hostId });
    const onQueue = (queue) => dispatch({ type: 'queue', queue });
    const onPlayback = (playback) => dispatch({ type: 'playback', playback });
    const onMeta = (meta) => dispatch({ type: 'meta', ...meta });
    const onChat = (message) => dispatch({ type: 'chat', message: { ...message, kind: 'chat' } });
    // The host who deleted it has already dropped the room locally, so this only
    // needs to handle everyone else being evicted.
    const onClosed = (payload) => {
      if (!codeRef.current || codeRef.current !== payload?.code) return;
      codeRef.current = null;
      dispatch({ type: 'error', error: payload?.reason ?? 'The host closed this room.' });
    };
    const onSystem = (payload) =>
      dispatch({
        type: 'chat',
        message: { id: `sys-${payload.at}-${Math.random()}`, kind: 'system', ...payload },
      });
    const onReaction = (reaction) => {
      setReactions((prev) => [...prev.slice(-30), reaction]);
      setTimeout(
        () => setReactions((prev) => prev.filter((r) => r.id !== reaction.id)),
        REACTION_TTL
      );
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:listeners', onListeners);
    socket.on('room:queue', onQueue);
    socket.on('room:playback', onPlayback);
    socket.on('room:meta', onMeta);
    socket.on('room:closed', onClosed);
    socket.on('chat:message', onChat);
    socket.on('room:system', onSystem);
    socket.on('reaction', onReaction);

    if (socket.connected) emit('identify', identityRef.current);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:listeners', onListeners);
      socket.off('room:queue', onQueue);
      socket.off('room:playback', onPlayback);
      socket.off('room:meta', onMeta);
      socket.off('room:closed', onClosed);
      socket.off('chat:message', onChat);
      socket.off('room:system', onSystem);
      socket.off('reaction', onReaction);
    };
  }, []);

  // Push profile edits (name / avatar colour) to the server live.
  useEffect(() => {
    if (identity?.name) emit('identify', identity);
  }, [identity?.name, identity?.hue, identity?.id]);

  // ------------------------------------------------------------------- actions

  const join = useCallback(async (rawCode) => {
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (!code) return { ok: false, error: 'Enter a room code.' };
    dispatch({ type: 'joining', code });
    await emit('identify', identityRef.current);
    const reply = await emit('room:join', { code });
    if (reply.ok) {
      codeRef.current = reply.room.code;
      dispatch({ type: 'joined', room: reply.room });
    } else {
      codeRef.current = null;
      dispatch({ type: 'error', error: reply.error });
    }
    return reply;
  }, []);

  const create = useCallback(
    async (name) => {
      await emit('identify', identityRef.current);
      const reply = await emit('room:create', { name });
      if (!reply.ok) return reply;
      return join(reply.code);
    },
    [join]
  );

  // Leaving is local-first: drop the room immediately and tell the server after.
  // Waiting on the round-trip would make the back button feel broken.
  const leave = useCallback(() => {
    codeRef.current = null;
    dispatch({ type: 'left' });
    socket.emit('room:leave');
  }, []);

  // Deleting, unlike leaving, can be refused (only the host may do it), so this
  // one does wait for the server before throwing away our copy of the room.
  const close = useCallback(async () => {
    const reply = await emit('room:delete');
    if (reply?.ok) {
      codeRef.current = null;
      dispatch({ type: 'left' });
    }
    return reply;
  }, []);

  const actions = useMemo(
    () => ({
      addToQueue: (trackId, opts = {}) => emit('queue:add', { trackId, ...opts }),
      addManyToQueue: (trackIds) => emit('queue:add', { trackIds }),
      removeFromQueue: (qid) => emit('queue:remove', { qid }),
      moveInQueue: (qid, toIndex) => emit('queue:move', { qid, toIndex }),
      vote: (qid) => emit('queue:vote', { qid }),
      play: () => emit('playback:play'),
      pause: () => emit('playback:pause'),
      seek: (position) => emit('playback:seek', { position }),
      next: () => emit('playback:next'),
      previous: () => emit('playback:previous'),
      jumpTo: (qid) => emit('playback:jump', { qid }),
      sendChat: (text) => emit('chat:send', { text }),
      react: (emoji) => socket.emit('reaction:send', { emoji }),
      updateSettings: (settings) => emit('room:settings', settings),
    }),
    []
  );

  // ----------------------------------------------------------------- selectors

  const currentItem = useMemo(
    () => state.queue.find((item) => item.qid === state.playback.currentQid) ?? null,
    [state.queue, state.playback.currentQid]
  );

  const currentIndex = useMemo(
    () => state.queue.findIndex((item) => item.qid === state.playback.currentQid),
    [state.queue, state.playback.currentQid]
  );

  const isHost = state.hostId === identity?.id;
  const canControl = state.allowGuestControl || isHost;

  return {
    ...state,
    connected,
    reactions,
    currentItem,
    currentIndex,
    isHost,
    canControl,
    join,
    create,
    leave,
    close,
    ...actions,
  };
}
