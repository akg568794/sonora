import { motion } from 'framer-motion';
import { Disc3, Library, Radio, Users } from 'lucide-react';
import { Avatar, spring } from './ui/Primitives.jsx';

const NAV = [
  { key: 'lobby', label: 'Rooms', icon: Radio, href: '#/' },
  { key: 'library', label: 'Library', icon: Library, href: '#/library' },
];

function Logo() {
  return (
    <a href="#/" className="mb-8 flex items-center gap-2.5 px-2" aria-label="Sonora home">
      <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[rgb(var(--art-1))] shadow-[0_6px_20px_-6px_rgb(var(--art-1)/0.9)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none">
          <path
            d="M9 18.5a2.75 2.75 0 1 0 2.75-2.75V6.2l7.25-1.45v3L13.5 8.9"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="text-[17px] font-bold tracking-tight">Sonora</span>
    </a>
  );
}

/** macOS Music-style source list. Collapses to a bottom tab bar on small screens. */
export function Sidebar({ route, identity, room, onEditProfile }) {
  const inRoom = room.status === 'joined';

  return (
    <>
      <aside className="glass sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-y-0 border-l-0 px-3 py-5 lg:flex">
        <Logo />

        <nav className="space-y-0.5">
          {NAV.map((entry) => {
            const active = route.name === entry.key;
            return (
              <a
                key={entry.key}
                href={entry.href}
                className="relative flex items-center gap-3 rounded-card px-3 py-2 text-[14px] font-medium transition-colors duration-200"
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={spring}
                    className="absolute inset-0 rounded-card bg-white/10"
                  />
                )}
                <entry.icon
                  size={17}
                  className={`relative ${active ? 'text-[rgb(var(--art-1))]' : 'text-white/45'}`}
                />
                <span className={`relative ${active ? 'text-white' : 'text-white/65'}`}>{entry.label}</span>
              </a>
            );
          })}
        </nav>

        {inRoom && (
          <div className="mt-7">
            <p className="label-caps mb-2 px-3">In a room</p>
            <a
              href={`#/room/${room.code}`}
              className={`group flex items-center gap-3 rounded-card px-3 py-2.5 transition-colors duration-200 ${
                route.name === 'room' ? 'bg-white/10' : 'hover:bg-white/[0.06]'
              }`}
            >
              <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[rgb(var(--art-1)/0.18)]">
                <Disc3
                  size={16}
                  className={`text-[rgb(var(--art-1))] ${room.playback.isPlaying ? 'animate-spin' : ''}`}
                  style={{ animationDuration: '3.5s' }}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-white/90">{room.name}</span>
                <span className="flex items-center gap-1 text-[11.5px] text-white/40">
                  <Users size={10} />
                  {room.listeners.length}
                </span>
              </span>
            </a>
          </div>
        )}

        <div className="mt-auto pt-6">
          <button
            onClick={onEditProfile}
            className="flex w-full items-center gap-2.5 rounded-card px-2 py-2 text-left transition-colors duration-200 hover:bg-white/[0.07]"
          >
            <Avatar name={identity.name} hue={identity.hue} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{identity.name}</span>
              <span className="block text-[11px] text-white/35">Edit profile</span>
            </span>
          </button>
        </div>
      </aside>

      {/* -------------------------------------------------- mobile tab bar */}
      <nav className="glass-strong safe-b fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around border-x-0 border-b-0 px-2 pt-1 lg:hidden">
        {NAV.map((entry) => {
          const active = route.name === entry.key;
          return (
            <a
              key={entry.key}
              href={entry.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium"
            >
              <entry.icon size={20} className={active ? 'text-[rgb(var(--art-1))]' : 'text-white/45'} />
              <span className={active ? 'text-white' : 'text-white/45'}>{entry.label}</span>
            </a>
          );
        })}
        {inRoom && (
          <a
            href={`#/room/${room.code}`}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium"
          >
            <Disc3
              size={20}
              className={`${route.name === 'room' ? 'text-[rgb(var(--art-1))]' : 'text-white/45'} ${
                room.playback.isPlaying ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '3.5s' }}
            />
            <span className={route.name === 'room' ? 'text-white' : 'text-white/45'}>Room</span>
          </a>
        )}
        <button
          onClick={onEditProfile}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-white/45"
        >
          <Avatar name={identity.name} hue={identity.hue} size={20} />
          You
        </button>
      </nav>
    </>
  );
}
