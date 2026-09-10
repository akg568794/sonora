import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudUpload, Loader2 } from 'lucide-react';
import { uploadTracks } from '../lib/api.js';
import { spring } from './ui/Primitives.jsx';

const ACCEPT = '.mp3,.m4a,.aac,.flac,.wav,.ogg,.oga,.opus,.webm,audio/*';

/**
 * Drag-and-drop uploader. Listens on the window as well as the drop target so
 * the whole page can respond when you drag files in — otherwise people aim at
 * the wrong spot and nothing happens.
 */
export function UploadZone({ identity, onUploaded, compact = false }) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const dragDepth = useRef(0);

  const send = useCallback(
    async (fileList) => {
      const files = [...fileList].filter(
        (file) => file.type.startsWith('audio/') || /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|webm)$/i.test(file.name)
      );
      if (!files.length) {
        setError('Those files don’t look like audio.');
        return;
      }
      setError(null);
      setResult(null);
      setProgress(0);
      try {
        const { tracks, failed } = await uploadTracks({
          files,
          user: identity,
          onProgress: setProgress,
        });
        setResult({ count: tracks.length, failed });
        onUploaded?.(tracks);
      } catch (err) {
        setError(err.message);
      } finally {
        setProgress(null);
      }
    },
    [identity, onUploaded]
  );

  // Window-level drag tracking, ref-counted so nested elements don't flicker it.
  useEffect(() => {
    const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
    const onEnter = (event) => {
      if (!hasFiles(event)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (event) => hasFiles(event) && event.preventDefault();
    const onDrop = (event) => {
      dragDepth.current = 0;
      setDragging(false);
      if (!hasFiles(event)) return;
      event.preventDefault();
      send(event.dataTransfer.files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [send]);

  // Auto-dismiss the success note.
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), 5000);
    return () => clearTimeout(timer);
  }, [result]);

  const uploading = progress !== null;
  const pct = Math.round((progress ?? 0) * 100);

  return (
    <>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload music files"
        className={`glass glass-sheen group relative cursor-pointer overflow-hidden rounded-panel text-center transition-all duration-300 ease-apple ${
          compact ? 'px-5 py-5' : 'px-6 py-10'
        } ${dragging ? 'scale-[1.01] border-[rgb(var(--art-1))] bg-[rgb(var(--art-1)/0.12)]' : 'hover:bg-white/[0.09]'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) send(e.target.files);
            e.target.value = '';
          }}
        />

        <AnimatePresence mode="wait">
          {uploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <Loader2 size={compact ? 20 : 26} className="animate-spin text-[rgb(var(--art-1))]" />
              <p className="mt-3 text-[14px] font-medium">
                {pct < 100 ? `Uploading… ${pct}%` : 'Reading tags & artwork…'}
              </p>
              <div className="mt-3 h-1 w-40 overflow-hidden rounded-pill bg-white/12">
                <motion.div
                  className="h-full rounded-pill"
                  style={{
                    background: 'linear-gradient(90deg, rgb(var(--art-1)), rgb(var(--art-2)))',
                  }}
                  animate={{ width: `${pct}%` }}
                  transition={{ ease: 'linear', duration: 0.2 }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <motion.div
                animate={{ y: dragging ? -4 : 0, scale: dragging ? 1.12 : 1 }}
                transition={spring}
                className={`grid place-items-center rounded-[18px] transition-colors duration-300 ${
                  compact ? 'h-10 w-10' : 'h-14 w-14'
                } ${dragging ? 'bg-[rgb(var(--art-1))] text-white' : 'bg-white/8 text-white/55 group-hover:text-white/80'}`}
              >
                <CloudUpload size={compact ? 19 : 24} strokeWidth={1.7} />
              </motion.div>
              <p className={`font-semibold tracking-tight ${compact ? 'mt-2.5 text-[14px]' : 'mt-4 text-[16px]'}`}>
                {dragging ? 'Drop to add to your library' : 'Drop music here'}
              </p>
              {!compact && (
                <p className="mt-1.5 text-[13px] text-white/40">
                  or <span className="text-[rgb(var(--art-1))]">choose files</span> · MP3, M4A, FLAC, WAV, OGG
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {(error || result) && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className={`mt-3 flex items-start gap-2 rounded-card px-3.5 py-2.5 text-[13px] ${
                error ? 'bg-accent/15 text-accent-soft' : 'bg-[#30d158]/12 text-[#4ade80]'
              }`}
            >
              {error ? (
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                {error ? (
                  <span>{error}</span>
                ) : (
                  <span>
                    Added {result.count} track{result.count === 1 ? '' : 's'} to your library.
                    {result.failed?.length > 0 && (
                      <span className="mt-1 block text-white/50">
                        Skipped: {result.failed.map((f) => f.name).join(', ')}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full-screen drop affordance so a drag anywhere is obviously catchable. */}
      <AnimatePresence>
        {dragging && !uploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[90] border-[3px] border-dashed border-[rgb(var(--art-1)/0.6)] bg-black/25 backdrop-blur-[2px]"
          />
        )}
      </AnimatePresence>
    </>
  );
}
