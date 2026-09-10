# Sonora — directory structure

An npm-workspaces monorepo with two packages: `server` (Express + Socket.IO API)
and `web` (React + Vite client). The root package only orchestrates them.

```
sonora/
├── package.json                 workspaces root — dev/build/start/smoke scripts
├── package-lock.json            single lockfile for both workspaces
├── .nvmrc                       pins Node 22.13.1 (engines requires >= 20)
├── .gitignore
├── README.md                    setup, how sync works, deploy notes
├── STRUCTURE.md                 this file
│
├── scripts/
│   └── smoke-test.mjs      236  37-check end-to-end test — no fixtures needed,
│                                it generates WAVs in memory and cleans up after
│
├── server/                      ── API + realtime + storage ──────────────────
│   ├── package.json             express, socket.io, multer, music-metadata, nanoid,
│   │                            @supabase/supabase-js
│   ├── .env.example              copy to .env — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
│   ├── index.js                 HTTP routes, Socket.IO event handlers, permission
│   │                            checks, empty-room reaper, SPA fallback
│   ├── lib/
│   │   ├── rooms.js        380  Room state machine + RoomManager. The authoritative
│   │   │                        playback clock, queue, votes, host handoff
│   │   ├── library.js           Upload route: tag reading, cover-art extraction,
│   │   │                        filename fallback, format/size limits
│   │   ├── supabase.js          Supabase client (service-role key) + bucket names
│   │   ├── supabaseStore.js     Track metadata, backed by a Supabase Postgres table
│   │   └── env.js               Zero-dependency .env loader
│   └── supabase/
│       └── schema.sql           run once in the Supabase SQL editor
│
└── web/                         ── client ────────────────────────────────────
    ├── package.json             react, framer-motion, lucide-react, socket.io-client
    ├── index.html               Vite entry
    ├── vite.config.js           dev proxy for /api, /media, /socket.io → :4000
    ├── tailwind.config.js       design tokens: colours, radii, easings, keyframes
    ├── postcss.config.js
    └── src/
        ├── main.jsx          13  createRoot, StrictMode, top-level ErrorBoundary
        ├── App.jsx          404  shell: hash routing, identity, and the single
        │                         owner of room + audio + palette state
        ├── index.css        282  design system — .glass, hairlines, .btn*, .field,
        │                         .switch, springs, reduced-motion overrides
        │
        ├── hooks/
        │   ├── useRoom.js          243  socket subscriptions, room reducer,
        │   │                            actions, auto-rejoin on reconnect
        │   ├── useSyncedAudio.js   264  clock-locked <audio> + drift correction
        │   └── useAudioAnalyser.js  85  WebAudio tap feeding the visualiser
        │
        ├── lib/
        │   ├── socket.js       115  socket singleton, ServerClock (NTP-style
        │   │                        offset estimation), ack-wrapped emit()
        │   ├── color.js        120  album-art palette extraction → CSS variables
        │   ├── identity.js      51  guest profile in localStorage, avatar gradients
        │   ├── api.js           47  REST calls: tracks, rooms, upload with progress
        │   └── format.js        32  time, bytes, pluralisation
        │
        ├── screens/                 one per route
        │   ├── Onboarding.jsx    99  #/  first visit — pick a name and colour
        │   ├── Lobby.jsx        306  #/  create a room, join by code, live rooms
        │   ├── Library.jsx      207  #/library  uploads, search, queue-all
        │   └── RoomScreen.jsx   473  #/room/CODE  header, settings + delete,
        │                             add-music picker, Queue/Chat tabs
        │
        └── components/
            ├── ui/
            │   └── Primitives.jsx  312  Avatar, Tooltip, Switch, Modal, Slider,
            │                            EmptyState, CoverArt, spring presets
            ├── NowPlaying.jsx      299  hero artwork, transport, sync badge
            ├── QueuePanel.jsx      225  drag-to-reorder queue, votes, removal
            ├── UploadZone.jsx      227  drag-and-drop + progress
            ├── ChatPanel.jsx       163  grouped messages, join/leave notices
            ├── Sidebar.jsx         144  desktop source list / mobile tab bar
            ├── Visualizer.jsx      116  canvas frequency bars
            ├── ReactionLayer.jsx    93  floating emoji + the reaction bar
            ├── ListenerRail.jsx     83  overlapping avatars, host badge
            ├── MiniPlayer.jsx       83  docked player when you're outside the room
            ├── AmbientBackdrop.jsx  74  blurred artwork + drifting colour blobs
            └── ErrorBoundary.jsx    61  shows the error instead of a blank page
```

## How the pieces connect

**State ownership.** `App.jsx` is the only stateful coordinator. It owns identity,
the track list, the route, and — critically — a single `useRoom` and a single
`useSyncedAudio`. Screens and components are handed props; none of them open their
own socket or audio element. That is what lets the mini player and the room screen
show the same playhead without fighting each other.

**The sync path.** `server/lib/rooms.js` stores `(startedAt, positionAtStart,
isPlaying)` in *server* time and never a ticking position → broadcast over
Socket.IO by `server/index.js` → `web/src/lib/socket.js` converts server time to
local time using its measured clock offset → `useSyncedAudio` compares that to
`audio.currentTime` once a second and corrects. Full explanation in the README.

**The upload path.** `UploadZone` → `lib/api.js` → `POST /api/tracks` →
`server/lib/library.js` (multer in memory, `music-metadata` reads tags from the
buffer, audio + cover art uploaded to Supabase Storage) →
`server/lib/supabaseStore.js` (row written to the Postgres `tracks` table) →
track list served back with the public Supabase Storage URLs already attached.

**Routing** is hash-based and hand-rolled in `App.jsx` (`parseHash`), so there is
no router dependency: `#/`, `#/library`, `#/room/CODE`.

## Not in the tree

- `node_modules/` — hoisted to the root by npm workspaces; the two package
  `node_modules` directories are mostly symlinks.
- `web/dist/` — build output. Only exists after `npm run build`; when present,
  `server/index.js` serves it and the SPA fallback activates, so it is removed
  during development to keep the Vite dev server authoritative.
- `.vscode/` — editor scratch, not project configuration.
