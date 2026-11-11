const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.send('ok'));
app.get('/config', (_, res) => {
  let iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  try { if (process.env.ICE_SERVERS) iceServers = JSON.parse(process.env.ICE_SERVERS); } catch (e) {}
  res.json({ iceServers });
});

const queues = { video: [], text: [] };
const partner = new Map();      // socket.id -> partner socket.id
const reports = new Map();      // ip -> count
const bans = new Map();         // ip -> expiry timestamp
const REPORT_LIMIT = 5, BAN_MS = 60 * 60 * 1000;

const ipOf = (s) => (s.handshake.headers['x-forwarded-for'] || s.handshake.address || '').toString().split(',')[0].trim();
const broadcastCount = () => io.emit('count', io.engine.clientsCount);

function unqueue(s) {
  for (const m in queues) queues[m] = queues[m].filter((id) => id !== s.id);
}
function leave(s, notify = true) {
  unqueue(s);
  const pid = partner.get(s.id);
  if (pid) {
    partner.delete(s.id); partner.delete(pid);
    if (notify) io.to(pid).emit('partner-left');
  }
}
function find(s, mode) {
  leave(s);
  mode = mode === 'text' ? 'text' : 'video';
  const q = queues[mode];
  while (q.length) {
    const id = q.shift();
    const other = io.sockets.sockets.get(id);
    if (!other || id === s.id) continue;
    partner.set(s.id, id); partner.set(id, s.id);
    s.emit('matched', { initiator: true });
    other.emit('matched', { initiator: false });
    return;
  }
  q.push(s.id);
  s.emit('waiting');
}

io.on('connection', (s) => {
  const ip = ipOf(s);
  if ((bans.get(ip) || 0) > Date.now()) { s.emit('banned'); return s.disconnect(true); }
  broadcastCount();
  let stamps = [];

  s.on('find', (mode) => find(s, mode));
  s.on('leave', () => leave(s));
  s.on('signal', (d) => { const p = partner.get(s.id); if (p && d && typeof d === 'object') io.to(p).emit('signal', d); });
  s.on('typing', () => { const p = partner.get(s.id); if (p) io.to(p).emit('typing'); });
  s.on('msg', (t) => {
    const now = Date.now();
    stamps = stamps.filter((x) => now - x < 3000);
    if (stamps.length >= 5 || typeof t !== 'string') return;
    stamps.push(now);
    const p = partner.get(s.id);
    if (p) io.to(p).emit('msg', t.slice(0, 500));
  });
  s.on('report', () => {
    const pid = partner.get(s.id);
    const other = pid && io.sockets.sockets.get(pid);
    if (!other) return;
    const oip = ipOf(other);
    const n = (reports.get(oip) || 0) + 1;
    reports.set(oip, n);
    console.log(`[report] ${oip} reported (${n})`);
    if (n >= REPORT_LIMIT) { bans.set(oip, Date.now() + BAN_MS); reports.delete(oip); other.emit('banned'); other.disconnect(true); }
  });
  s.on('disconnect', () => { leave(s); broadcastCount(); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`omegleonline running on :${PORT}`));
