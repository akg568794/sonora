import './lib/env.js';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

import { SupabaseStore } from './lib/supabaseStore.js';
import { RoomManager } from './lib/rooms.js';
import { createLibraryRouter } from './lib/library.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4000);
const WEB_DIST = path.join(__dirname, '..', 'web', 'dist');

// A room with nobody in it sticks around briefly so a page refresh or a dropped
// wifi connection doesn't nuke the queue everyone was building.
const EMPTY_ROOM_TTL_MS = 90_000;

// A stray unhandled rejection (e.g. a network blip on a fire-and-forget
// Supabase write) shouldn't take the whole server, and every listener in it, down.
process.on('unhandledRejection', (err) => console.error('[server] unhandled rejection:', err));

const store = await new SupabaseStore().load();
const rooms = new RoomManager();
const reapTimers = new Map();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.use(express.json());

// Backdrop chrome (laptop/tablet/mobile) and any legacy local track files ship
// from here — the SPA fallback below already carves `/media` out for this.
app.use('/media', express.static(path.join(__dirname, 'uploads')));

app.use('/api', createLibraryRouter({ store }));
app.get('/api/rooms', (_req, res) => res.json({ rooms: rooms.list() }));
app.get('/api/health', (_req, res) => res.json({ ok: true, tracks: store.listTracks().length }));

if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get(/^\/(?!api|media|socket\.io).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
}

// --------------------------------------------------------------------- sockets

rooms.onChange = (room) => broadcastPlayback(room);

function broadcastPlayback(room) {
  io.to(room.code).emit('room:playback', room.playbackState());
  io.to(room.code).emit('room:queue', room.queue);
}

function broadcastQueue(room) {
  io.to(room.code).emit('room:queue', room.queue);
}

function broadcastListeners(room) {
  io.to(room.code).emit('room:listeners', {
    listeners: [...room.listeners.values()],
    hostId: room.hostId,
  });
}

function cancelReap(code) {
  const timer = reapTimers.get(code);
  if (timer) {
    clearTimeout(timer);
    reapTimers.delete(code);
  }
}

function scheduleReap(room) {
  cancelReap(room.code);
  reapTimers.set(
    room.code,
    setTimeout(() => {
      reapTimers.delete(room.code);
      const current = rooms.get(room.code);
      if (current?.isEmpty) rooms.destroy(room.code);
    }, EMPTY_ROOM_TTL_MS)
  );
}

/** Resolve the room a socket is currently in, plus a control-permission check. */
function context(socket) {
  const code = socket.data.roomCode;
  const room = code ? rooms.get(code) : null;
  return { room, user: socket.data.user };
}

/**
 * Tear a room down for everyone in it. Every member socket has to be detached
 * explicitly — leaving them joined to a code whose Room object is gone would let
 * later broadcasts and `context()` lookups reference a room that no longer exists.
 */
function closeRoom(room, reason) {
  io.to(room.code).emit('room:closed', { code: room.code, reason });
  for (const socketId of [...room.sockets.keys()]) {
    const member = io.sockets.sockets.get(socketId);
    if (!member) continue;
    member.leave(room.code);
    member.data.roomCode = null;
  }
  cancelReap(room.code);
  rooms.destroy(room.code);
}

function leaveRoom(socket, { announce = true } = {}) {
  const { room } = context(socket);
  if (!room) return;
  const departed = room.removeSocket(socket.id);
  socket.leave(room.code);
  socket.data.roomCode = null;
  if (departed && announce) {
    io.to(room.code).emit('room:system', { text: `${departed.name} left`, at: Date.now() });
  }
  broadcastListeners(room);
  if (room.isEmpty) {
    room.pause(); // don't burn a timer on an audience of nobody
    scheduleReap(room);
  }
}

io.on('connection', (socket) => {
  socket.data.user = { id: `anon-${socket.id.slice(0, 6)}`, name: 'Guest', hue: 210 };
  socket.data.roomCode = null;

  socket.on('identify', (payload = {}, ack) => {
    socket.data.user = {
      id: String(payload.id ?? socket.data.user.id).slice(0, 40),
      name: String(payload.name ?? 'Guest').trim().slice(0, 24) || 'Guest',
      hue: Number.isFinite(payload.hue) ? Math.abs(payload.hue) % 360 : 210,
    };
    const { room } = context(socket);
    if (room) {
      room.addListener(socket.id, socket.data.user);
      broadcastListeners(room);
    }
    ack?.({ ok: true, user: socket.data.user });
  });

  // Round-trip probe the client uses to estimate its offset from server time.
  socket.on('time:sync', (clientSent, ack) => {
    ack?.({ clientSent, serverTime: Date.now() });
  });

  socket.on('room:create', (payload = {}, ack) => {
    const room = rooms.create({ name: payload.name, host: socket.data.user });
    ack?.({ ok: true, code: room.code });
  });

  socket.on('room:join', (payload = {}, ack) => {
    const room = rooms.get(payload.code);
    if (!room) return ack?.({ ok: false, error: "That room code doesn't exist." });

    if (socket.data.roomCode && socket.data.roomCode !== room.code) leaveRoom(socket);

    cancelReap(room.code);
    const isNew = !room.listeners.has(socket.data.user.id);
    room.addListener(socket.id, socket.data.user);
    socket.join(room.code);
    socket.data.roomCode = room.code;

    ack?.({ ok: true, room: room.toJSON(), you: socket.data.user });
    if (isNew) {
      socket.to(room.code).emit('room:system', {
        text: `${socket.data.user.name} joined`,
        at: Date.now(),
      });
    }
    broadcastListeners(room);
  });

  socket.on('room:leave', (_payload, ack) => {
    leaveRoom(socket);
    ack?.({ ok: true });
  });

  // Deleting is the host's alone — it evicts everyone else, so `allowGuestControl`
  // deliberately doesn't grant it the way it grants playback control.
  socket.on('room:delete', (_payload, ack) => {
    const { room, user } = context(socket);
    if (!room) return ack?.({ ok: false, error: 'Not in a room' });
    if (room.hostId !== user.id) {
      return ack?.({ ok: false, error: 'Only the host can delete this room.' });
    }
    closeRoom(room, `${user.name} closed the room.`);
    ack?.({ ok: true });
  });

  socket.on('room:settings', (payload = {}, ack) => {
    const { room, user } = context(socket);
    if (!room) return ack?.({ ok: false, error: 'Not in a room' });
    if (room.hostId !== user.id) return ack?.({ ok: false, error: 'Only the host can change room settings.' });
    if (typeof payload.allowGuestControl === 'boolean') room.allowGuestControl = payload.allowGuestControl;
    if (['off', 'all', 'one'].includes(payload.repeat)) room.repeat = payload.repeat;
    if (typeof payload.shuffle === 'boolean') room.shuffle = payload.shuffle;
    io.to(room.code).emit('room:meta', {
      allowGuestControl: room.allowGuestControl,
      hostId: room.hostId,
    });
    broadcastPlayback(room);
    ack?.({ ok: true });
  });

  // ------------------------------------------------------------------- queue

  socket.on('queue:add', (payload = {}, ack) => {
    const { room, user } = context(socket);
    if (!room) return ack?.({ ok: false, error: 'Not in a room' });
    const ids = Array.isArray(payload.trackIds) ? payload.trackIds : [payload.trackId];
    const tracks = store.getTracks(ids.filter(Boolean));
    if (!tracks.length) return ack?.({ ok: false, error: 'Those tracks are no longer in the library.' });

    tracks.forEach((track, i) => room.addToQueue(track, user, { playNow: payload.playNow && i === 0 }));
    io.to(room.code).emit('room:system', {
      text:
        tracks.length === 1
          ? `${user.name} queued ${tracks[0].title}`
          : `${user.name} queued ${tracks.length} tracks`,
      at: Date.now(),
    });
    broadcastPlayback(room);
    ack?.({ ok: true });
  });

  socket.on('queue:remove', (payload = {}, ack) => {
    const { room, user } = context(socket);
    if (!room) return ack?.({ ok: false, error: 'Not in a room' });
    const item = room.queue.find((i) => i.qid === payload.qid);
    // You can always pull your own additions; removing someone else's needs control.
    if (item && item.addedBy.id !== user.id && !room.canControl(user.id)) {
      return ack?.({ ok: false, error: 'Only the host can remove other people’s tracks.' });
    }
    room.removeFromQueue(payload.qid);
    broadcastPlayback(room);
    ack?.({ ok: true });
  });

  socket.on('queue:move', (payload = {}, ack) => {
    const { room, user } = context(socket);
    if (!room) return ack?.({ ok: false, error: 'Not in a room' });
    if (!room.canControl(user.id)) return ack?.({ ok: false, error: 'Only the host can reorder the queue.' });
    room.moveInQueue(payload.qid, Number(payload.toIndex));
    broadcastQueue(room);
    ack?.({ ok: true });
  });

  socket.on('queue:vote', (payload = {}, ack) => {
    const { room, user } = context(socket);
    if (!room) return ack?.({ ok: false, error: 'Not in a room' });
    room.toggleVote(payload.qid, user.id);
    broadcastQueue(room);
    ack?.({ ok: true });
  });

  // ---------------------------------------------------------------- playback

  const control = (handler) => (payload = {}, ack) => {
    const { room, user } = context(socket);
    if (!room) return ack?.({ ok: false, error: 'Not in a room' });
    if (!room.canControl(user.id)) {
      return ack?.({ ok: false, error: 'The host has playback locked for this room.' });
    }
    handler(room, payload, user);
    broadcastPlayback(room);
    ack?.({ ok: true });
  };

  socket.on('playback:play', control((room) => room.play()));
  socket.on('playback:pause', control((room) => room.pause()));
  socket.on('playback:seek', control((room, p) => room.seek(Number(p.position) || 0)));
  socket.on('playback:next', control((room) => room.next()));
  socket.on('playback:previous', control((room) => room.previous()));
  socket.on('playback:jump', control((room, p) => room.playItem(p.qid, { autoplay: true })));

  // A client's local <audio> reaching its real end — a passive report, not a
  // command, so it isn't gated by `canControl`.
  socket.on('playback:ended', (payload = {}) => {
    const { room } = context(socket);
    if (room?.reportEnded(payload.qid)) broadcastPlayback(room);
  });

  // ------------------------------------------------------------ chat/reactions

  socket.on('chat:send', (payload = {}, ack) => {
    const { room, user } = context(socket);
    if (!room) return ack?.({ ok: false, error: 'Not in a room' });
    const text = String(payload.text ?? '').trim();
    if (!text) return ack?.({ ok: false, error: 'Empty message' });
    io.to(room.code).emit('chat:message', room.addChat(user, text));
    ack?.({ ok: true });
  });

  socket.on('reaction:send', (payload = {}) => {
    const { room, user } = context(socket);
    if (!room) return;
    io.to(room.code).emit('reaction', {
      id: `${socket.id}-${Date.now()}`,
      emoji: String(payload.emoji ?? '❤️').slice(0, 8),
      from: { id: user.id, name: user.name, hue: user.hue },
      at: Date.now(),
    });
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

server.listen(PORT, () => {
  console.log(`\n  ♪  Sonora server listening on http://localhost:${PORT}`);
  console.log(`     library: ${store.listTracks().length} track(s) in Supabase\n`);
});
