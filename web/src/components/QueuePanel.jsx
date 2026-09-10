import { AnimatePresence, Reorder, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { GripVertical, ListMusic, Play, Plus, Trash2, TrendingUp, Volume2 } from 'lucide-react';
import { Avatar, CoverArt, EmptyState, Tooltip, spring } from './ui/Primitives.jsx';
import { formatTime, pluralize } from '../lib/format.js';

function VoteButton({ item, userId, onVote }) {
  const voted = item.votes.includes(userId);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onVote(item.qid);
      }}
      aria-label={voted ? 'Remove your vote' : 'Vote to move this up'}
      aria-pressed={voted}
      className={`flex h-7 shrink-0 items-center gap-1 rounded-pill px-2 text-[11.5px] font-semibold transition-all duration-200 ease-apple active:scale-90 ${
        voted
          ? 'bg-[rgb(var(--art-1)/0.9)] text-white shadow-[0_4px_14px_-4px_rgb(var(--art-1)/0.8)]'
          : 'bg-white/8 text-white/50 hover:bg-white/15 hover:text-white'
      }`}
    >
      <TrendingUp size={12} strokeWidth={2.6} />
      {item.votes.length > 0 && <span className="tnum">{item.votes.length}</span>}
    </button>
  );
}

function QueueRow({ item, index, isCurrent, isPast, isPlaying, userId, canControl, canDrag, onJump, onRemove, onVote }) {
  const mine = item.addedBy.id === userId;

  return (
    <div
      className={`group relative flex items-center gap-3 rounded-card px-2 py-2 transition-colors duration-200 ${
        isCurrent ? 'bg-white/[0.09]' : 'hover:bg-white/[0.055]'
      } ${isPast ? 'opacity-45' : ''}`}
    >
      {canDrag && (
        <span className="-ml-1 hidden w-3 cursor-grab text-white/25 transition-opacity duration-150 group-hover:text-white/50 sm:block">
          <GripVertical size={14} />
        </span>
      )}

      <button
        onClick={() => canControl && onJump(item.qid)}
        disabled={!canControl}
        className="relative shrink-0 overflow-hidden rounded-[10px] disabled:cursor-default"
        aria-label={canControl ? `Play ${item.title}` : item.title}
      >
        <CoverArt src={item.cover} alt="" size={42} rounded="rounded-[10px]" />
        {canControl && (
          <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
            <Play size={15} className="fill-white text-white" />
          </span>
        )}
        {isCurrent && (
          <span className="absolute inset-0 grid place-items-center bg-black/45 group-hover:opacity-0">
            {isPlaying ? (
              <span className="flex items-end gap-[2px]" aria-label="Now playing">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-[2.5px] rounded-full bg-white"
                    animate={{ height: [4, 12, 6, 14, 5] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
                  />
                ))}
              </span>
            ) : (
              <Volume2 size={14} className="text-white/90" />
            )}
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[13.5px] font-medium leading-tight ${
            isCurrent ? 'text-[rgb(var(--art-1))]' : 'text-white/92'
          }`}
        >
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-[12px] leading-tight text-white/45">{item.artist}</p>
      </div>

      <Tooltip label={`Added by ${mine ? 'you' : item.addedBy.name}`}>
        <Avatar name={item.addedBy.name} hue={item.addedBy.hue} size={20} />
      </Tooltip>

      <span className="tnum hidden w-9 shrink-0 text-right text-[11.5px] text-white/35 sm:block">
        {formatTime(item.duration)}
      </span>

      <div className="flex shrink-0 items-center gap-1">
        {!isPast && !isCurrent && <VoteButton item={item} userId={userId} onVote={onVote} />}
        {(mine || canControl) && (
          <button
            onClick={() => onRemove(item.qid)}
            aria-label={`Remove ${item.title} from the queue`}
            className="btn-icon h-7 w-7 opacity-0 hover:!text-accent-soft focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Trash2 size={13.5} />
          </button>
        )}
      </div>
    </div>
  );
}

export function QueuePanel({
  queue,
  currentQid,
  currentIndex,
  isPlaying,
  userId,
  canControl,
  onJump,
  onRemove,
  onVote,
  onMove,
  onBrowse,
}) {
  // Local mirror so drag-reorder feels instant; server broadcast reconciles it.
  const [order, setOrder] = useState(queue);
  useEffect(() => setOrder(queue), [queue]);

  const upcoming = Math.max(0, queue.length - currentIndex - 1);
  const totalRemaining = queue
    .slice(currentIndex + 1)
    .reduce((sum, item) => sum + (item.duration ?? 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight">Up next</h2>
          <p className="mt-0.5 truncate text-[12px] text-white/40">
            {queue.length === 0
              ? 'Nothing queued yet'
              : `${pluralize(upcoming, 'track')} · ${formatTime(totalRemaining)} left`}
          </p>
        </div>
        {/* The laptop layout has an inline search above NowPlaying instead. */}
        <button onClick={onBrowse} className="btn btn-glass h-8 px-3 text-[12.5px] lg:hidden">
          <Plus size={14} strokeWidth={2.5} />
          Add
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {queue.length === 0 ? (
          <EmptyState icon={ListMusic} title="The queue is empty">
            Add something from your library and everyone in the room hears it at the same moment.
          </EmptyState>
        ) : canControl ? (
          <Reorder.Group
            axis="y"
            values={order}
            onReorder={setOrder}
            className="space-y-0.5"
            layoutScroll
          >
            {order.map((item, index) => (
              <Reorder.Item
                key={item.qid}
                value={item}
                transition={spring}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.08}
                onDragEnd={() => {
                  const to = order.findIndex((i) => i.qid === item.qid);
                  if (to !== -1 && queue[to]?.qid !== item.qid) onMove(item.qid, to);
                }}
                whileDrag={{ scale: 1.02, zIndex: 20, cursor: 'grabbing' }}
                className="relative"
              >
                <QueueRow
                  item={item}
                  index={index}
                  isCurrent={item.qid === currentQid}
                  isPast={currentIndex > -1 && index < currentIndex}
                  isPlaying={isPlaying}
                  userId={userId}
                  canControl={canControl}
                  canDrag
                  onJump={onJump}
                  onRemove={onRemove}
                  onVote={onVote}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        ) : (
          <div className="space-y-0.5">
            <AnimatePresence initial={false}>
              {order.map((item, index) => (
                <motion.div
                  key={item.qid}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring}
                >
                  <QueueRow
                    item={item}
                    index={index}
                    isCurrent={item.qid === currentQid}
                    isPast={currentIndex > -1 && index < currentIndex}
                    isPlaying={isPlaying}
                    userId={userId}
                    canControl={false}
                    onJump={onJump}
                    onRemove={onRemove}
                    onVote={onVote}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
