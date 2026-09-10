import { io } from 'socket.io-client';

export const socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnectionDelay: 400,
  reconnectionDelayMax: 4000,
});

/**
 * An NTP-style estimate of the offset between this browser's clock and the
 * server's. Everything about synchronised playback depends on it: the server
 * tells us "the track started at server-time T", and only a good offset turns
 * that into a position we can trust to a few tens of milliseconds.
 */
class ServerClock {
  constructor(sock, { interval = 10_000, window = 8 } = {}) {
    this.socket = sock;
    this.interval = interval;
    this.window = window;
    this.samples = [];
    this.offset = 0;
    this.rtt = 0;
    this.ready = false;
    this.listeners = new Set();
    this.timer = null;

    sock.on('connect', () => this.#burst());
    if (sock.connected) this.#burst();
    this.timer = setInterval(() => this.probe(), this.interval);
  }

  /** Several probes back-to-back on connect so playback starts accurate. */
  #burst() {
    this.samples = [];
    let sent = 0;
    const fire = () => {
      this.probe();
      if (++sent < 5) setTimeout(fire, 180);
    };
    fire();
  }

  probe() {
    if (!this.socket.connected) return;
    const sentAt = Date.now();
    this.socket.emit('time:sync', sentAt, (reply) => {
      if (!reply?.serverTime) return;
      const receivedAt = Date.now();
      const rtt = receivedAt - sentAt;
      // Assume symmetric latency: the server's clock reading corresponds to
      // roughly the midpoint of our round trip.
      const offset = reply.serverTime - (sentAt + rtt / 2);
      this.samples.push({ offset, rtt });
      if (this.samples.length > this.window) this.samples.shift();
      this.#recompute();
    });
  }

  /**
   * Average only the lowest-latency samples. A slow round trip is almost always
   * asymmetric (a queued packet, a busy tab), which biases its offset estimate,
   * so the fastest probes are the honest ones.
   */
  #recompute() {
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    if (!best.length) return;
    this.offset = best.reduce((sum, s) => sum + s.offset, 0) / best.length;
    this.rtt = best[0].rtt;
    this.ready = true;
    this.listeners.forEach((fn) => fn(this));
  }

  /** Current server time, as best we can tell. */
  now() {
    return Date.now() + this.offset;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const serverClock = new ServerClock(socket);

/**
 * Where the room's playhead should be right now, derived from the authoritative
 * (startedAt, positionAtStart) pair rather than any client's own timer.
 */
export function expectedPosition(playback, clock = serverClock) {
  if (!playback?.currentQid) return 0;
  if (!playback.isPlaying) return playback.positionAtStart;
  return playback.positionAtStart + (clock.now() - playback.startedAt) / 1000;
}

/** Promise-wrapped emit for the request/ack style events the server exposes. */
export function emit(event, payload) {
  return new Promise((resolve) => {
    const send = () => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, error: 'The server did not respond.' });
        }
      }, 8000);
      socket.emit(event, payload, (reply) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(reply ?? { ok: true });
      });
    };

    if (socket.connected) return send();

    // Right after a page load the socket is often still mid-handshake rather
    // than actually unreachable — wait briefly for `connect` instead of
    // failing a deep-linked room join outright.
    const waitTimeout = setTimeout(() => {
      socket.off('connect', onConnect);
      resolve({ ok: false, error: 'Not connected to the server.' });
    }, 4000);
    const onConnect = () => {
      clearTimeout(waitTimeout);
      send();
    };
    socket.once('connect', onConnect);
  });
}
