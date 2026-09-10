# Sonora

Upload your music, open a room, and listen together — everyone hears the same
moment at the same time.

Track audio, covers and metadata are stored in your own Supabase project
(Storage + Postgres) — no other accounts or cloud services needed.

---

## Running it

Requires **Node 20+** (an `.nvmrc` pins 22.13.1) and a free
[Supabase](https://supabase.com) project.

1. Create a Supabase project, then run [`server/supabase/schema.sql`](server/supabase/schema.sql)
   in its SQL editor and create two **public** Storage buckets named `audio`
   and `covers`.
2. Copy `server/.env.example` to `server/.env` and fill in `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` (Settings → API in the Supabase dashboard).
3. Install and run:

```bash
nvm use          # or make sure `node -v` is >= 20
npm install
npm run dev
```

Then open **http://localhost:5173**.

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on `:5173` + API/socket server on `:4000` |
| `npm run smoke` | End-to-end check of sync, queue, votes, chat and host handoff (needs `npm run dev` running) |
| `npm run build` | Builds the web app into `web/dist` |
| `npm start` | Serves the built app *and* the API from `:4000` alone |

### Listening with other people

Everyone needs to reach the same server.

- **Same wifi:** the dev server prints a `Network:` URL (e.g.
  `http://192.168.0.127:5173`). Share that, then share the room code.
- **Over the internet:** tunnel port 5173 (`ngrok http 5173`, `cloudflared
  tunnel --url http://localhost:5173`), or deploy — see below.

Two browser windows on one machine work fine for a quick look, and each window
counts as its own listener.

---

## How it works

### Playback stays in sync

The interesting problem in a listen-together app is that clients can't trust
their own clocks or each other. Sonora handles it the way networked games do.

**The server owns the playhead.** It never stores "position 42s". It stores
*when the current track started* — `(startedAt, positionAtStart, isPlaying)` in
server time. Any client can turn that into an exact position:

```
position = positionAtStart + (serverNow - startedAt) / 1000
```

**Each client learns its clock offset.** On connect, the browser fires five
rapid round-trip probes at the server ([`web/src/lib/socket.js`](web/src/lib/socket.js)),
then re-probes every 10 seconds. Offsets from the *lowest-latency* probes are
averaged — a slow round trip is usually asymmetric, which skews its estimate, so
the fastest probes are the honest ones.

**Drift is corrected in two tiers**
([`web/src/hooks/useSyncedAudio.js`](web/src/hooks/useSyncedAudio.js)). Once a
second, each client compares where it *is* to where it *should be*:

| Drift | Response |
| --- | --- |
| < 45 ms | leave it alone — correcting would be more audible than the error |
| 45 ms – 900 ms | trim `playbackRate` by up to ±6% to glide back with no audible seam |
| > 900 ms | hard seek (a suspended tab, a long buffer stall) |

**The server decides when a track ends,** via a timer sized to the remaining
duration. A backgrounded, throttled tab can't stall the room, and two clients
can't race to double-skip.

Measured on localhost, two clients derive positions within **1 ms** of each other.

### Everything else

- **Uploads** — drag files anywhere onto the window. The server reads ID3/Vorbis
  tags with `music-metadata`, extracts embedded cover art to a file, and falls
  back to cleaning up the filename when a track has no tags. MP3, M4A, AAC,
  FLAC, WAV, OGG, Opus, WebM; 60 MB per file.
- **Rooms** — 6-character codes with ambiguous characters (`0/O/1/I/L`) removed,
  because people read them aloud. Shareable as `#/room/CODE` links. An empty room
  survives 90 seconds so a refresh doesn't destroy the queue, and the host role
  passes to the longest-present listener if the host leaves. The host can delete a
  room outright from **Room settings → Danger zone**, which evicts everyone in it;
  that's host-only even when playback is unlocked, since unlike a skip it can't be
  undone. Leaving is always just leaving.
- **Queue** — collaborative, drag to reorder, and upvoting nudges a track up the
  *upcoming* slice only, stably, so voting never shuffles history or yanks the
  playing track.
- **Permissions** — open by default (anyone can play/pause/skip); the host can
  lock playback, and guests keep the ability to queue and vote either way.
- **Chat and reactions** — grouped messages, join/leave notices, and emoji that
  float up over the artwork for everyone at once.
- **Ambient UI** — a palette is sampled from the current album art
  ([`web/src/lib/color.js`](web/src/lib/color.js)) and written into CSS custom
  properties, so every glow, gradient, button and visualiser bar takes on the
  colour of whatever is playing.

### Keyboard

`Space` play/pause · `Shift+←/→` previous/next · `M` mute

---

## Layout

```
server/
  index.js            Express + Socket.IO wiring, event handlers, permissions
  lib/rooms.js        Room state machine — authoritative clock, queue, votes
  lib/library.js      Upload route, tag + cover-art extraction
  lib/supabaseStore.js  Track metadata, backed by a Supabase Postgres table
  lib/supabase.js     Supabase client (audio/cover files live in Storage)
  supabase/schema.sql SQL to run once against your Supabase project
  .env.example        Copy to .env and fill in SUPABASE_URL / keys

web/src/
  App.jsx             Shell, hash routing, owns audio + room + palette
  hooks/
    useSyncedAudio.js Clock-locked <audio> with drift correction
    useRoom.js        Socket subscriptions, actions, auto-rejoin
    useAudioAnalyser.js  WebAudio tap for the visualiser
  lib/socket.js       Socket singleton + NTP-style ServerClock
  lib/color.js        Album-art palette extraction
  screens/            Onboarding, Lobby, Library, RoomScreen
  components/         NowPlaying, QueuePanel, ChatPanel, Visualizer, …
  index.css           Design system: glass, hairlines, springs, controls
```

---

## Deploying

The server can host the built app on its own:

```bash
npm run build
PORT=8080 npm start
```

That serves the SPA, the API and the websocket from one origin — deployable to
Railway, Render, Fly or any host that runs a long-lived Node process. Track audio,
covers and metadata live in Supabase (Storage + Postgres), so the host's own
filesystem can be fully ephemeral — no persistent disk needed. Set `SUPABASE_URL`
and `SUPABASE_SERVICE_ROLE_KEY` (see `server/.env.example`) in the deploy
environment.

Rooms live in memory, so a restart clears them (the library survives, since it's
in Supabase). In dev the server runs under `node --watch`, so editing a server
file also drops open rooms.

### If you outgrow this

- **Multiple server instances** need a Socket.IO Redis adapter and room state
  moved out of process memory.
- **Uploading other people's copyrighted music to a public server** is a
  licensing problem, not a technical one. This design — your own files, your own
  server, small private rooms — is deliberately the shape that avoids it.
