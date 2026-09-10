/**
 * End-to-end check: two clients join a room, one queues and controls playback,
 * and we assert the other sees identical authoritative state.
 */
import { io } from 'socket.io-client';

const URL = 'http://localhost:4000';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(name, hue) {
  const socket = io(URL, { transports: ['websocket'] });
  const events = [];
  [
    'room:playback',
    'room:queue',
    'room:listeners',
    'chat:message',
    'reaction',
    'room:system',
    'room:closed',
  ].forEach((e) =>
    socket.on(e, (payload) => events.push({ e, payload }))
  );
  const ask = (event, payload) =>
    new Promise((resolve) => socket.emit(event, payload, resolve));
  return new Promise((resolve) => {
    socket.on('connect', async () => {
      await ask('identify', { id: `u_${name}`, name, hue });
      resolve({ socket, ask, events, name });
    });
  });
}

const fail = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) fail.push(label);
};

/** Build a playable mono WAV in memory so the test needs no fixture files. */
function makeWav(seconds, freq) {
  const rate = 44100;
  const samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    buffer.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2);
  }
  return buffer;
}

console.log('\n0. Uploading temporary fixtures');
const form = new FormData();
form.append('files', new Blob([makeWav(6, 440)], { type: 'audio/wav' }), 'smoke-tone-a.wav');
form.append('files', new Blob([makeWav(5, 523)], { type: 'audio/wav' }), 'smoke-tone-b.wav');
form.append('userId', 'smoke-test');
form.append('userName', 'Smoke Test');
const uploaded = await (await fetch(`${URL}/api/tracks`, { method: 'POST', body: form })).json();
check('two fixtures ingested with durations', uploaded.tracks?.length === 2 && uploaded.tracks.every((t) => t.duration > 0));
const [t1, t2] = uploaded.tracks;
const cleanup = async () => {
  for (const track of uploaded.tracks ?? []) {
    await fetch(`${URL}/api/tracks/${track.id}`, { method: 'DELETE' }).catch(() => {});
  }
};

console.log('1. Two clients join the same room');
const alice = await connect('Alice', 210);
const bob = await connect('Bob', 45);

const created = await alice.ask('room:create', { name: 'Test Room' });
check('room created with 6-char code', /^[A-Z0-9]{6}$/.test(created.code ?? ''), created.code);

const aJoin = await alice.ask('room:join', { code: created.code });
const bJoin = await bob.ask('room:join', { code: created.code });
check('Alice joined', aJoin.ok === true, aJoin.error);
check('Bob joined', bJoin.ok === true, bJoin.error);
check('Alice is host', aJoin.room.hostId === 'u_Alice');
await wait(120);
check('both listeners visible', bJoin.room.listeners.length >= 1 && alice.events.some((e) => e.e === 'room:listeners' && e.payload.listeners.length === 2));

console.log('\n2. Clock sync probe');
const t0 = Date.now();
const probe = await alice.ask('time:sync', t0);
const rtt = Date.now() - t0;
const offset = probe.serverTime - (t0 + rtt / 2);
check('time:sync returns server time', Number.isFinite(probe.serverTime), `rtt=${rtt}ms offset=${offset.toFixed(1)}ms`);

console.log('\n3. Queue + autoplay');
bob.events.length = 0;
await bob.ask('queue:add', { trackId: t1.id });
await wait(150);
const bobQueue = bob.events.filter((e) => e.e === 'room:queue').pop();
const bobPlay = bob.events.filter((e) => e.e === 'room:playback').pop();
check('queue broadcast to both', bobQueue?.payload.length === 1);
check('queue item carries media url', Boolean(bobQueue?.payload[0]?.url), bobQueue?.payload[0]?.url);
check('first track autoplays', bobPlay?.payload.isPlaying === true);
check('playback has server timestamps', Number.isFinite(bobPlay?.payload.startedAt) && Number.isFinite(bobPlay?.payload.serverTime));

console.log('\n4. Both clients derive the same position');
await wait(1000);
const aProbe = await alice.ask('time:sync', Date.now());
const bProbe = await bob.ask('time:sync', Date.now());
const pb = bobPlay.payload;
const derive = (serverNow) => pb.positionAtStart + (serverNow - pb.startedAt) / 1000;
const aPos = derive(aProbe.serverTime);
const bPos = derive(bProbe.serverTime);
check('derived positions agree within 50ms', Math.abs(aPos - bPos) < 0.05, `${aPos.toFixed(3)}s vs ${bPos.toFixed(3)}s`);
check('position advanced ~1s', aPos > 0.8 && aPos < 1.6, `${aPos.toFixed(2)}s`);

console.log('\n5. Remote control propagates');
alice.events.length = 0;
await bob.ask('playback:pause');
await wait(120);
const pausedForAlice = alice.events.filter((e) => e.e === 'room:playback').pop();
check('guest pause reaches host (open room)', pausedForAlice?.payload.isPlaying === false);
const pausedAt = pausedForAlice.payload.positionAtStart;
await wait(400);
alice.events.length = 0;
await bob.ask('playback:play');
await wait(120);
const resumed = alice.events.filter((e) => e.e === 'room:playback').pop();
check('paused position held while paused', Math.abs(resumed.payload.positionAtStart - pausedAt) < 0.05, `${pausedAt.toFixed(2)}s`);
check('resume restarts the clock', resumed.payload.isPlaying === true);

alice.events.length = 0;
await bob.ask('playback:seek', { position: 3.5 });
await wait(120);
const seeked = alice.events.filter((e) => e.e === 'room:playback').pop();
check('seek propagates', Math.abs(seeked.payload.positionAtStart - 3.5) < 0.01);

console.log('\n6. Host lock');
await alice.ask('room:settings', { allowGuestControl: false });
await wait(100);
const denied = await bob.ask('playback:pause');
check('guest control refused when locked', denied.ok === false, denied.error);
const stillQueue = await bob.ask('queue:add', { trackId: t2.id });
check('guest can still queue when locked', stillQueue.ok === true);
await alice.ask('room:settings', { allowGuestControl: true });

console.log('\n7. Votes reorder upcoming only');
await alice.ask('queue:add', { trackId: t1.id });
await wait(100);
alice.events.length = 0;
const q = alice.events.filter((e) => e.e === 'room:queue').pop();
const snapshot = (await bob.ask('room:join', { code: created.code })).room.queue;
const lastQid = snapshot[snapshot.length - 1].qid;
await bob.ask('queue:vote', { qid: lastQid });
await wait(120);
const voted = alice.events.filter((e) => e.e === 'room:queue').pop();
check('vote recorded', voted?.payload.some((i) => i.qid === lastQid && i.votes.length === 1));
check('current track stays at its index', voted?.payload[0].qid === snapshot[0].qid);
check('voted track moved up the upcoming list', voted?.payload[1].qid === lastQid, voted?.payload.map((i) => `${i.title}:${i.votes.length}`).join(' '));

console.log('\n8. Auto-advance at end of track');
const shortTrack = snapshot[0];
await alice.ask('playback:jump', { qid: shortTrack.qid });
await alice.ask('playback:seek', { position: Math.max(0, shortTrack.duration - 1.2) });
alice.events.length = 0;
await wait(2000);
const advanced = alice.events.filter((e) => e.e === 'room:playback').pop();
check('server advanced past the finished track', advanced?.payload.currentQid !== shortTrack.qid, `now ${advanced?.payload.currentQid}`);
check('next track is playing', advanced?.payload.isPlaying === true);

console.log('\n9. Chat + reactions');
bob.events.length = 0;
await alice.ask('chat:send', { text: 'this bit is great' });
alice.socket.emit('reaction:send', { emoji: '🔥' });
await wait(150);
check('chat delivered', bob.events.some((e) => e.e === 'chat:message' && e.payload.text === 'this bit is great'));
check('reaction delivered with sender', bob.events.some((e) => e.e === 'reaction' && e.payload.emoji === '🔥' && e.payload.from.name === 'Alice'));

console.log('\n10. Leaving acks promptly (a missing ack made the back button hang)');
const carol = await connect('Carol', 300);
await carol.ask('room:join', { code: created.code });
const leaveStart = Date.now();
const leaveReply = await carol.ask('room:leave');
const leaveMs = Date.now() - leaveStart;
check('room:leave acknowledges', leaveReply?.ok === true);
check('room:leave acks in well under a second', leaveMs < 500, `${leaveMs}ms`);
await wait(120);
const afterLeave = bob.events.filter((e) => e.e === 'room:listeners').pop();
check('leaver removed from the listener list', !afterLeave?.payload.listeners.some((l) => l.id === 'u_Carol'));
carol.socket.close();
await wait(100);

console.log('\n11. Host handoff on leave');
bob.events.length = 0;
alice.socket.close();
await wait(300);
const handoff = bob.events.filter((e) => e.e === 'room:listeners').pop();
check('Bob promoted to host when Alice leaves', handoff?.payload.hostId === 'u_Bob', `hostId=${handoff?.payload.hostId}`);

const dir = await (await fetch(`${URL}/api/rooms`)).json();
check('room still listed with remaining listener', dir.rooms.some((r) => r.code === created.code && r.listeners === 1));

console.log('\n12. Deleting a room (host only, evicts everyone)');
const dave = await connect('Dave', 120);
await dave.ask('room:join', { code: created.code });
await wait(120);

const refused = await dave.ask('room:delete');
check('a guest cannot delete the room', refused.ok === false, refused.error);
const survived = await (await fetch(`${URL}/api/rooms`)).json();
check('refused delete left the room standing', survived.rooms.some((r) => r.code === created.code));

dave.events.length = 0;
const deleted = await bob.ask('room:delete');
check('the host can delete the room', deleted.ok === true, deleted.error);
await wait(150);
const closed = dave.events.filter((e) => e.e === 'room:closed').pop();
check('everyone still inside is told it closed', closed?.payload.code === created.code, closed?.payload.reason);
const gone = await (await fetch(`${URL}/api/rooms`)).json();
check('deleted room drops out of the directory', !gone.rooms.some((r) => r.code === created.code));
const rejoin = await dave.ask('room:join', { code: created.code });
check('deleted room cannot be rejoined', rejoin.ok === false, rejoin.error);
// A stale membership would let this land in a room that no longer exists.
const orphaned = await dave.ask('chat:send', { text: 'anyone there?' });
check('evicted socket is no longer a member', orphaned.ok === false, orphaned.error);
dave.socket.close();

bob.socket.close();
await cleanup();
console.log(`\n${fail.length === 0 ? 'ALL CHECKS PASSED' : `${fail.length} FAILED: ${fail.join(', ')}`}\n`);
process.exit(fail.length ? 1 : 0);
