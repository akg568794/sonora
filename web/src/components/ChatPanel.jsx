import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Avatar, spring } from './ui/Primitives.jsx';
import { formatClock } from '../lib/format.js';

/** Consecutive messages from one person collapse into a single visual group. */
function groupMessages(messages) {
  const groups = [];
  for (const message of messages) {
    const last = groups[groups.length - 1];
    const sameAuthor =
      last &&
      last.kind === 'chat' &&
      message.kind === 'chat' &&
      last.userId === message.userId &&
      message.at - last.at < 4 * 60 * 1000;
    if (sameAuthor) last.items.push(message);
    else
      groups.push({
        key: message.id,
        kind: message.kind,
        userId: message.userId,
        name: message.name,
        hue: message.hue,
        at: message.at,
        text: message.text,
        items: [message],
      });
  }
  return groups;
}

export function ChatPanel({ messages, onSend, identity, connected }) {
  const [draft, setDraft] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const groups = useMemo(() => groupMessages(messages), [messages]);

  // Stay pinned to the newest message, but never yank the view while someone is
  // reading back through history.
  useLayoutEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [groups.length, atBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtBottom(distance < 60);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
    setAtBottom(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Chat</h2>
        <span className="text-[11.5px] text-white/35">{messages.length ? '' : 'Say hi 👋'}</span>
      </header>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto px-4 py-1">
        <AnimatePresence initial={false}>
          {groups.map((group) =>
            group.kind === 'system' ? (
              <motion.p
                key={group.key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className="py-1.5 text-center text-[11.5px] font-medium text-white/30"
              >
                {group.text}
              </motion.p>
            ) : (
              <motion.div
                key={group.key}
                layout="position"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring}
                className="flex gap-2.5 py-1.5"
              >
                <Avatar name={group.name} hue={group.hue} size={26} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="truncate text-[12.5px] font-semibold"
                      style={{ color: `hsl(${group.hue} 80% 72%)` }}
                    >
                      {group.userId === identity.id ? 'You' : group.name}
                    </span>
                    <span className="tnum shrink-0 text-[10.5px] text-white/25">
                      {formatClock(group.at)}
                    </span>
                  </div>
                  {group.items.map((message) => (
                    <p
                      key={message.id}
                      className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.45] text-white/85"
                    >
                      {message.text}
                    </p>
                  ))}
                </div>
              </motion.div>
            )
          )}
        </AnimatePresence>
        <div ref={bottomRef} className="h-1" />
      </div>

      <AnimatePresence>
        {!atBottom && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => {
              setAtBottom(true);
              bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }}
            className="glass-strong absolute bottom-[70px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[11.5px] font-medium"
          >
            <ArrowDown size={12} /> Latest
          </motion.button>
        )}
      </AnimatePresence>

      <form onSubmit={submit} className="hairline-t flex items-center gap-2 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? 'Message the room…' : 'Reconnecting…'}
          disabled={!connected}
          maxLength={500}
          aria-label="Message the room"
          className="field !rounded-pill !py-2 text-[14px]"
        />
        <button
          type="submit"
          disabled={!draft.trim() || !connected}
          aria-label="Send message"
          className="btn btn-primary h-9 w-9 !px-0"
        >
          <ArrowUp size={17} strokeWidth={2.6} />
        </button>
      </form>
    </div>
  );
}
