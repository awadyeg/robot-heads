#!/usr/bin/env node
// Awady Office server: turns `gbot` (grok-bot-cli) into a small HTTP API for
// the Awady Office app. It polls each Grok Bot bot's recent thread, works out
// what the bot is doing (thinking, using a tool, waiting for an approval…),
// and relays messages and approval decisions back through gbot.
//
// No dependencies; Node 22+. Configure with environment variables:
//   OFFICE_TOKEN   required, the bearer token the app sends
//   PORT           default 8787
//   HOST           default 127.0.0.1 (put Tailscale Serve or a proxy in front);
//                  0.0.0.0 to listen on every interface
//   GBOT           path to the gbot binary, default "gbot"
//   DATA_DIR       where sections.json and state live, default ./data

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = process.env.OFFICE_TOKEN || '';
const GBOT = process.env.GBOT || 'gbot';
const DATA_DIR = process.env.DATA_DIR || join(HERE, 'data');
const THREAD_LIMIT = 60;
const MAX_PARALLEL = 3;

if (TOKEN.length < 16) {
  console.error('Set OFFICE_TOKEN to a random string of at least 16 characters.');
  process.exit(1);
}
mkdirSync(DATA_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ── gbot ─────────────────────────────────────────────────────────────── */

let running = 0;
const waiting = [];

function gbot(args, { timeout = 90_000 } = {}) {
  return new Promise((resolve, reject) => {
    const start = () => {
      running++;
      const child = spawn(GBOT, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
      let out = '';
      let err = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), timeout);
      child.stdout.on('data', (d) => (out += d));
      child.stderr.on('data', (d) => (err += d));
      const done = (fn) => {
        clearTimeout(timer);
        running--;
        waiting.shift()?.();
        fn();
      };
      child.on('error', (e) => done(() => reject(e)));
      child.on('close', (code) =>
        done(() => {
          const json = parseJson(out);
          if (json !== undefined && (code === 0 || typeof json === 'object')) {
            if (code !== 0 && json && json.error) reject(new Error(String(json.error)));
            else resolve(json);
          } else {
            reject(new Error((err || out || `gbot exited ${code}`).trim().slice(0, 500)));
          }
        }),
      );
    };
    if (running < MAX_PARALLEL) start();
    else waiting.push(start);
  });
}

function parseJson(text) {
  const t = text.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    // some versions print a line of text before the document
    const i = t.search(/[[{]/);
    if (i > 0) {
      try {
        return JSON.parse(t.slice(i));
      } catch {
        /* fall through */
      }
    }
    return undefined;
  }
}

/* ── sections ─────────────────────────────────────────────────────────── */

const SECTIONS_FILE = join(DATA_DIR, 'sections.json');
const DEFAULT_SECTIONS = JSON.parse(readFileSync(join(HERE, 'sections.default.json'), 'utf8'));

function loadSections() {
  try {
    return JSON.parse(readFileSync(SECTIONS_FILE, 'utf8'));
  } catch {
    writeFileSync(SECTIONS_FILE, JSON.stringify(DEFAULT_SECTIONS, null, 2) + '\n');
    return DEFAULT_SECTIONS;
  }
}

const slug = (s) => String(s).toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'x';
const norm = (s) => String(s).trim().toLowerCase();

/* ── looks ────────────────────────────────────────────────────────────── */

const COLORS = {
  black: '#3a3d44', brown: '#9c6b3f', red: '#ff2d3a', orange: '#ff9500', yellow: '#f2c200', green: '#12c96a',
  cyan: '#13c2b0', blue: '#1f6fff', violet: '#8b4dff', magenta: '#ff2f92', gray: '#7a7a80',
};
const SHAPES = {
  blob: 'circle', pebble: 'circle', bean: 'circle', egg: 'circle', cloud: 'circle', teardrop: 'circle', dome: 'circle',
  squircle: 'square', tablet: 'square', shield: 'square', arch: 'square',
  capsule: 'rectangle', cylinder: 'rectangle',
  hex: 'hexagon', gem: 'hexagon', crystal: 'hexagon', wedge: 'hexagon', leaf: 'hexagon',
};
const FALLBACK_COLORS = Object.values(COLORS);
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/* ── transcript → office ──────────────────────────────────────────────── */

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function timeOf(e, seen) {
  for (const k of ['createdAt', 'timestamp', 'ts', 'time', 'sentAt', 'created_at', 'updatedAt', 'at']) {
    const v = e?.[k] ?? e?.message?.[k];
    if (typeof v === 'number' && v > 0) return v < 1e12 ? v * 1000 : v;
    if (typeof v === 'string') {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  }
  return seen || 0;
}

function textOf(e) {
  if (!e || typeof e !== 'object') return '';
  const direct = e.text || e.prompt || (typeof e.message === 'string' ? e.message : '');
  if (typeof direct === 'string' && direct) return direct;
  const c = e.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p?.text || '')).filter(Boolean).join('\n');
  if (e.message && typeof e.message === 'object' && typeof e.message.content === 'string') return e.message.content;
  return typeof e.preview === 'string' ? e.preview : '';
}

function pendingApproval(e) {
  if (e?.kind !== 'send-message') return null;
  const type = e.message?.type;
  const card = type === 'auto-review-approval' ? e.message.approval : type === 'local-tool-permission' ? e.message.ask : null;
  if (card?.status !== 'pending' || !card.requestId || !e.id) return null;
  return {
    entryId: e.id,
    requestId: card.requestId,
    summary: card.summary || card.reason || card.description || card.action || '',
    command: card.command || '',
  };
}

function toolOf(e) {
  const kind = String(e?.kind || e?.type || '');
  if (!/tool/i.test(kind) && !e?.toolName && !e?.tool) return null;
  const name = e.toolName || e.name || e.tool?.name || (typeof e.tool === 'string' ? e.tool : '') || e.call?.name || e.message?.toolName || 'tool';
  const input = e.input ?? e.args ?? e.arguments ?? e.tool?.input ?? e.call?.arguments ?? e.message?.input;
  let preview = '';
  if (typeof input === 'string') preview = input;
  else if (input && typeof input === 'object') {
    preview = input.query || input.command || input.path || input.url || input.file || JSON.stringify(input);
  }
  return { name: String(name), input, preview: String(preview).replace(/\s+/g, ' ').slice(0, 120) };
}

const SEARCH_TOOL = /search|web|browse|browser|fetch|crawl|extract|lookup|read_url|navigate/i;

/** A todo-style tool call: [{ content|title|text, status }]. */
function tasksFrom(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const t = toolOf(entries[i]);
    if (!t || !/todo|task|plan|checklist/i.test(t.name) || !t.input || typeof t.input !== 'object') continue;
    const list = [t.input.todos, t.input.items, t.input.tasks, t.input.list, t.input.plan].find(Array.isArray);
    if (!list) continue;
    return list
      .map((x, j) => {
        const title = typeof x === 'string' ? x : x?.content || x?.title || x?.text || x?.step || '';
        const s = String(typeof x === 'object' ? x?.status || x?.state || '' : '').toLowerCase();
        const status = /complete|done|finish/.test(s) ? 'done' : /progress|active|doing|current|running/.test(s) ? 'doing' : 'next';
        return title ? { id: `${entries[i].id || i}-${j}`, title: String(title), status } : null;
      })
      .filter(Boolean);
  }
  return [];
}

function derive(rec, view, now = Date.now()) {
  const entries = view.entries;
  const at = (e) => timeOf(e, view.seen.get(e.id));
  const chat = [];
  const logItems = [];
  let approval = null;
  let lastText = '';
  let lastAt = 0;
  let unread = 0;

  for (const e of entries) {
    const t = at(e);
    if (t > lastAt) lastAt = t;
    const pending = pendingApproval(e);
    if (pending) {
      approval = pending;
      logItems.push({ id: e.id, at: t, kind: 'waiting', text: `Needs approval: ${pending.summary || pending.command}` });
      continue;
    }
    const tool = toolOf(e);
    if (tool) {
      logItems.push({ id: e.id, at: t, kind: 'tool', tool: tool.name, text: tool.preview });
      continue;
    }
    const text = textOf(e).trim();
    if (!text) continue;
    const mine = e.kind === 'user' || e.role === 'user';
    const role = mine ? 'user' : e.kind === 'send-message' || e.role === 'assistant' ? 'bot' : 'peer';
    chat.push({ id: e.id || `${chat.length}`, role, text, at: t, ...(role === 'peer' && (e.sender || e.from) ? { from: String(e.sender || e.from) } : {}) });
    logItems.push({ id: e.id, at: t, kind: 'message', text: mine ? `You: ${text.slice(0, 200)}` : text.slice(0, 200) });
    lastText = text;
    if (role !== 'user' && (e.id ? !view.readIds.has(e.id) : false) && view.readCursorSet) unread++;
  }

  // what is it doing now: judge by the newest entry
  const last = entries[entries.length - 1];
  const lastTime = last ? at(last) : 0;
  const age = now - lastTime;
  let state = 'idle';
  let activity = '';
  if (approval) {
    state = 'listening';
    activity = `Waiting for you: ${approval.summary || approval.command || 'approval'}`;
  } else if (view.sentAt && now - view.sentAt < 3 * MIN && (!last || last.kind === 'user' || at(last) <= view.sentAt)) {
    state = 'thinking';
    activity = 'Reading your message';
  } else if (last && toolOf(last) && age < 10 * MIN) {
    const t = toolOf(last);
    state = SEARCH_TOOL.test(t.name) ? 'searching' : 'working';
    activity = `${t.name}${t.preview ? ` · ${t.preview}` : ''}`;
  } else if (last && (last.kind === 'user' || last.role === 'user') && age < 15 * MIN) {
    state = 'thinking';
    activity = 'Working on your message';
  } else if (last && last.kind === 'send-message' && lastTime && age < 2 * MIN) {
    state = 'happy';
    activity = 'Replied';
  } else if (lastAt && now - lastAt > 7 * DAY) {
    state = 'sleeping';
  }

  const tasks = tasksFrom(entries);
  if (tasks.length === 0 && (state === 'working' || state === 'searching' || state === 'thinking') && view.lastAsk) {
    tasks.push({ id: 'ask', title: view.lastAsk.slice(0, 80), status: 'doing' });
  }

  return {
    id: rec.id,
    name: rec.name,
    tag: rec.title || undefined,
    color: COLORS[rec.avatarColor] || FALLBACK_COLORS[hash(rec.id) % FALLBACK_COLORS.length],
    shape: SHAPES[rec.avatarShape] || 'circle',
    state,
    activity,
    lastMessage: lastText,
    lastAt: lastAt || 0,
    unread,
    approval,
    tasks,
    log: logItems.filter((x) => x.text || x.tool).slice(-50),
    chat: chat.slice(-60),
    error: view.error || undefined,
  };
}

/* ── state and polling ────────────────────────────────────────────────── */

const records = new Map(); // id → bot record from `gbot bots list`
const views = new Map(); // id → { entries, seen, polledAt, viewedAt, sentAt, lastAsk, readIds, error, busy }
let listedAt = 0;
let listError = '';

const READ_FILE = join(DATA_DIR, 'read.json');
let readState = {};
try {
  readState = JSON.parse(readFileSync(READ_FILE, 'utf8'));
} catch {
  /* first run */
}
const saveRead = () => writeFileSync(READ_FILE, JSON.stringify(readState));

function viewOf(id) {
  let v = views.get(id);
  if (!v) {
    v = { entries: [], seen: new Map(), polledAt: 0, viewedAt: 0, sentAt: 0, lastAsk: '', readIds: new Set(readState[id] || []), readCursorSet: Boolean(readState[id]), error: '', busy: null, first: true };
    views.set(id, v);
  }
  return v;
}

function pickArray(json) {
  if (Array.isArray(json)) return json;
  for (const k of ['bots', 'agents', 'records', 'items', 'value', 'result']) if (Array.isArray(json?.[k])) return json[k];
  return [];
}

async function refreshList() {
  try {
    const rows = pickArray(await gbot(['bots', 'list', '--json', '--no-history']));
    records.clear();
    for (const r of rows) {
      if (!r?.id || r.hiddenFromSidebar) continue;
      records.set(r.id, { ...r, isGroup: r.kind === 'group' || r.isGroup === true });
    }
    listedAt = Date.now();
    listError = '';
    log(`listed ${records.size} bots`);
  } catch (e) {
    listError = e.message;
    log('bots list failed:', e.message);
  }
}

async function refreshThread(id) {
  const v = viewOf(id);
  // a read already in flight may predate a send or an approval: wait for it, then read again
  while (v.busy) await v.busy;
  let release;
  v.busy = new Promise((r) => (release = r));
  try {
    const out = await gbot(['thread', id, '--limit', String(THREAD_LIMIT), '--json', '--no-history']);
    const entries = (out?.transcript?.entries || out?.thread?.entries || out?.entries || []).filter((e) => e && typeof e === 'object');
    const now = Date.now();
    for (const e of entries) if (e.id && !v.seen.has(e.id)) v.seen.set(e.id, v.first ? 0 : now);
    v.first = false;
    v.entries = entries;
    v.error = '';
    if (!v.readCursorSet) {
      // first sight: everything already there counts as read
      for (const e of entries) if (e.id) v.readIds.add(e.id);
      v.readCursorSet = true;
      readState[id] = [...v.readIds].slice(-200);
      saveRead();
    }
    if (v.sentAt && entries.some((e) => e.kind === 'send-message' && (v.seen.get(e.id) || 0) > v.sentAt)) v.sentAt = 0;
  } catch (e) {
    v.error = e.message;
  } finally {
    v.polledAt = Date.now();
    v.busy = null;
    release();
  }
}

const BUSY = new Set(['thinking', 'searching', 'working', 'listening']);

function dueIn(id, now) {
  const v = viewOf(id);
  if (now - v.viewedAt < 30_000) return 5_000; // open in the app
  if (v.sentAt) return 4_000;
  const rec = records.get(id);
  const state = rec ? derive(rec, v, now).state : 'idle';
  if (BUSY.has(state)) return 20_000;
  return 120_000;
}

async function tick() {
  const now = Date.now();
  if (now - listedAt > 5 * MIN) await refreshList();
  const due = [...records.keys()]
    .map((id) => ({ id, late: now - viewOf(id).polledAt - dueIn(id, now) }))
    .filter((x) => x.late >= 0)
    .sort((a, b) => b.late - a.late)
    .slice(0, MAX_PARALLEL);
  await Promise.all(due.map((x) => refreshThread(x.id)));
}

let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await tick();
  } finally {
    ticking = false;
  }
}, 2_000);

/* ── office layout ────────────────────────────────────────────────────── */

function office() {
  const cfg = loadSections();
  const bots = [...records.values()].filter((r) => !r.isGroup || cfg.showGroups);
  const byName = new Map(bots.map((r) => [norm(r.name), r]));
  const placed = new Set();
  const sections = [];
  const sectionOf = new Map();
  for (const s of cfg.sections || []) {
    const id = slug(s.name);
    sections.push({ id, name: s.name });
    for (const n of s.bots || []) {
      const r = byName.get(norm(n));
      if (r && !placed.has(r.id)) {
        placed.add(r.id);
        sectionOf.set(r.id, id);
      }
    }
  }
  const leads = new Set((cfg.leads || []).map(norm));
  const rest = bots.filter((r) => !placed.has(r.id) && !leads.has(norm(r.name)));
  if (rest.length) {
    sections.push({ id: 'unassigned', name: cfg.unassignedName || 'Unassigned' });
    for (const r of rest) sectionOf.set(r.id, 'unassigned');
  }
  const now = Date.now();
  const list = bots.map((r) => {
    const d = derive(r, viewOf(r.id), now);
    const { chat: _c, log: _l, ...summary } = d;
    return { ...summary, sectionId: leads.has(norm(r.name)) ? null : sectionOf.get(r.id) ?? 'unassigned', lead: leads.has(norm(r.name)) };
  });
  return { sections, folders: cfg.folders || [], bots: list, updatedAt: now, error: listError || undefined };
}

/* ── http ─────────────────────────────────────────────────────────────── */

function authorized(req) {
  const h = req.headers.authorization || '';
  const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
}

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new Error('body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    if (path === '/health') return send(res, 200, { ok: true, bots: records.size, listedAt, error: listError || undefined });
    if (!authorized(req)) return send(res, 401, { error: 'Wrong or missing token' });

    if (req.method === 'GET' && path === '/api/office') {
      if (!listedAt) await refreshList();
      return send(res, 200, office());
    }

    const m = path.match(/^\/api\/bots\/([^/]+)(?:\/(messages|approvals|read|raw))?$/);
    if (!m) return send(res, 404, { error: 'Not found' });
    const id = decodeURIComponent(m[1]);
    const rec = records.get(id);
    if (!rec) return send(res, 404, { error: 'No such bot' });
    const v = viewOf(id);

    if (req.method === 'GET' && !m[2]) {
      v.viewedAt = Date.now();
      if (Date.now() - v.polledAt > 5_000) await refreshThread(id);
      return send(res, 200, derive(rec, v));
    }
    if (req.method === 'GET' && m[2] === 'raw') {
      await refreshThread(id);
      return send(res, 200, { record: rec, entries: v.entries });
    }
    if (req.method === 'POST' && m[2] === 'read') {
      for (const e of v.entries) if (e.id) v.readIds.add(e.id);
      readState[id] = [...v.readIds].slice(-200);
      saveRead();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && m[2] === 'messages') {
      const { text } = await body(req);
      if (typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'Empty message' });
      const out = await gbot(['send', id, '--json', '--no-history', '--', text.trim()], { timeout: 120_000 });
      v.sentAt = Date.now();
      v.lastAsk = text.trim();
      v.viewedAt = Date.now();
      setTimeout(() => refreshThread(id), 1500);
      return send(res, 200, { ok: true, delivery: out?.delivery, messageId: out?.messageId });
    }
    if (req.method === 'POST' && m[2] === 'approvals') {
      const { entryId, requestId, decision } = await body(req);
      if (!entryId || !requestId || !['accept', 'decline'].includes(decision)) return send(res, 400, { error: 'entryId, requestId and decision (accept|decline) are required' });
      await gbot(['approvals', 'respond', id, '--entry-id', entryId, '--request-id', requestId, '--decision', decision, '--json']);
      // refresh before answering, so the app's next read no longer shows the card
      await refreshThread(id);
      return send(res, 200, { ok: true, bot: derive(rec, v) });
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    log('error:', e.message);
    return send(res, 502, { error: e.message });
  }
});

server.listen(PORT, HOST, () => log(`Awady Office server on http://${HOST}:${PORT}`));
if (!existsSync(SECTIONS_FILE)) loadSections();
refreshList();
