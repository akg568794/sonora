import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy server/.env.example to server/.env and fill in your project values.'
  );
}

// The service-role key bypasses RLS and must never reach the browser — it is
// only ever used here, server-side, to write to Storage and Postgres on the
// uploader's behalf.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

export const AUDIO_BUCKET = process.env.SUPABASE_AUDIO_BUCKET || 'audio';
export const COVERS_BUCKET = process.env.SUPABASE_COVERS_BUCKET || 'covers';
