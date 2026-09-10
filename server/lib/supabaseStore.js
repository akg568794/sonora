import { supabase } from './supabase.js';

const TABLE = 'tracks';

function fromRow(row) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album ?? '',
    year: row.year,
    genre: row.genre,
    duration: Number(row.duration),
    file: row.file,
    url: row.url,
    coverFile: row.cover_file,
    cover: row.cover,
    bitrate: row.bitrate,
    size: Number(row.size),
    uploadedBy: row.uploaded_by,
    uploadedAt: Number(row.uploaded_at),
  };
}

function toRow(track) {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    year: track.year,
    genre: track.genre,
    duration: track.duration,
    file: track.file,
    url: track.url,
    cover_file: track.coverFile,
    cover: track.cover,
    bitrate: track.bitrate,
    size: track.size,
    uploaded_by: track.uploadedBy,
    uploaded_at: track.uploadedAt,
  };
}

/**
 * Track library backed by a Supabase Postgres table. Mirrors the in-memory +
 * write-through shape of the old JSON `Store`: reads are synchronous against a
 * local cache, writes fire off to Postgres in the background so a burst of
 * uploads doesn't block on round-trips.
 */
export class SupabaseStore {
  constructor() {
    this.tracks = [];
  }

  async load() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('uploaded_at', { ascending: false });
    if (error) throw new Error(`[supabase-store] failed to load tracks: ${error.message}`);
    this.tracks = data.map(fromRow);
    return this;
  }

  listTracks() {
    return [...this.tracks].sort((a, b) => b.uploadedAt - a.uploadedAt);
  }

  getTrack(id) {
    return this.tracks.find((t) => t.id === id) ?? null;
  }

  getTracks(ids) {
    const byId = new Map(this.tracks.map((t) => [t.id, t]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  addTrack(track) {
    this.tracks.push(track);
    supabase
      .from(TABLE)
      .insert(toRow(track))
      .then(({ error }) => {
        if (error) console.error('[supabase-store] failed to persist track:', error.message);
      })
      .catch((err) => console.error('[supabase-store] failed to persist track:', err.message));
    return track;
  }

  removeTrack(id) {
    const idx = this.tracks.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    const [removed] = this.tracks.splice(idx, 1);
    supabase
      .from(TABLE)
      .delete()
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[supabase-store] failed to delete track:', error.message);
      })
      .catch((err) => console.error('[supabase-store] failed to delete track:', err.message));
    return removed;
  }
}
