-- Run this once in the Supabase SQL editor for your project.

create table if not exists public.tracks (
  id           text primary key,
  title        text not null,
  artist       text not null,
  album        text,
  year         integer,
  genre        text,
  duration     numeric not null,
  file         text not null,   -- storage object path in the audio bucket
  url          text not null,   -- public URL returned by Supabase Storage
  cover_file   text,            -- storage object path in the covers bucket
  cover        text,
  bitrate      integer,
  size         bigint,
  uploaded_by  jsonb,
  uploaded_at  bigint not null
);

create index if not exists tracks_uploaded_at_idx on public.tracks (uploaded_at desc);

-- RLS stays on with no policies: only the service-role key (used exclusively
-- by the Sonora server, never the browser) can read/write this table.
alter table public.tracks enable row level security;

-- Then, in Storage → Buckets, create two *public* buckets named "audio" and
-- "covers" (or whatever SUPABASE_AUDIO_BUCKET / SUPABASE_COVERS_BUCKET point
-- to). Public buckets serve Range requests, which is what lets the player
-- seek without downloading the whole file. No storage policies are required
-- since all writes go through the server's service-role key.
