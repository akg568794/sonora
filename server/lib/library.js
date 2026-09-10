import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { parseBuffer } from 'music-metadata';

import { supabase, AUDIO_BUCKET, COVERS_BUCKET } from './supabase.js';

const ALLOWED_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.oga', '.opus', '.webm']);
const MAX_FILE_BYTES = 60 * 1024 * 1024; // 60 MB — comfortably fits a lossless single

const COVER_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Turn "03 - Midnight City.mp3" into "Midnight City" when tags are missing. */
function titleFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename));
  return base
    .replace(/^\s*\d{1,3}\s*[-._)]\s*/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled';
}

async function uploadToBucket(bucket, storagePath, buffer, contentType) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

export function createLibraryRouter({ store }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES, files: 20 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_EXT.has(ext) || file.mimetype.startsWith('audio/')) return cb(null, true);
      cb(new Error(`${file.originalname} is not an audio file`));
    },
  });

  const router = express.Router();

  router.get('/tracks', (_req, res) => {
    res.json({ tracks: store.listTracks() });
  });

  router.post('/tracks', upload.array('files', 20), async (req, res) => {
    const uploader = {
      id: String(req.body.userId ?? 'anonymous').slice(0, 40),
      name: String(req.body.userName ?? 'Someone').slice(0, 40),
    };

    const added = [];
    const failed = [];

    for (const file of req.files ?? []) {
      try {
        added.push(await ingest(file, uploader));
      } catch (err) {
        console.error(`[library] failed to ingest ${file.originalname}:`, err.message);
        failed.push({ name: file.originalname, reason: err.message });
      }
    }

    res.status(added.length ? 201 : 400).json({ tracks: added, failed });
  });

  router.delete('/tracks/:id', async (req, res) => {
    const removed = store.removeTrack(req.params.id);
    if (!removed) return res.status(404).json({ error: 'Track not found' });
    await supabase.storage.from(AUDIO_BUCKET).remove([removed.file]);
    if (removed.coverFile) await supabase.storage.from(COVERS_BUCKET).remove([removed.coverFile]);
    res.json({ ok: true });
  });

  async function ingest(file, uploader) {
    let metadata = null;
    try {
      metadata = await parseBuffer(file.buffer, { mimeType: file.mimetype, size: file.size });
    } catch (err) {
      // Unreadable tags are not fatal — we can still play the file.
      console.warn(`[library] no readable tags in ${file.originalname}: ${err.message}`);
    }

    const common = metadata?.common ?? {};
    const format = metadata?.format ?? {};
    const id = nanoid(12);

    const ext = path.extname(file.originalname).toLowerCase() || '.mp3';
    const audioPath = `${id}${ext}`;
    const url = await uploadToBucket(AUDIO_BUCKET, audioPath, file.buffer, file.mimetype);

    let coverFile = null;
    let cover = null;
    const picture = common.picture?.[0];
    if (picture?.data) {
      const coverExt = COVER_EXT[picture.format] ?? '.jpg';
      coverFile = `${id}${coverExt}`;
      cover = await uploadToBucket(COVERS_BUCKET, coverFile, Buffer.from(picture.data), picture.format);
    }

    const duration = Number.isFinite(format.duration) ? Number(format.duration.toFixed(3)) : 0;
    if (!duration) {
      await supabase.storage.from(AUDIO_BUCKET).remove([audioPath]);
      throw new Error('could not determine track length — the file may be corrupt');
    }

    return store.addTrack({
      id,
      title: (common.title || titleFromFilename(file.originalname)).slice(0, 200),
      artist: (common.artist || common.albumartist || 'Unknown artist').slice(0, 200),
      album: (common.album || '').slice(0, 200),
      year: common.year ?? null,
      genre: common.genre?.[0] ?? null,
      duration,
      file: audioPath,
      url,
      coverFile,
      cover,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : null,
      size: file.size,
      uploadedBy: uploader,
      uploadedAt: Date.now(),
    });
  }

  // Multer surfaces limit violations as errors on the route — translate them.
  router.use((err, _req, res, _next) => {
    const message =
      err?.code === 'LIMIT_FILE_SIZE'
        ? `That file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`
        : err?.message || 'Upload failed';
    res.status(400).json({ error: message });
  });

  return router;
}
