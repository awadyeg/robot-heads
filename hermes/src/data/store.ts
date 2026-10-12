import { useSyncExternalStore } from 'react';
import type { RobotHeadState } from 'robot-heads';
import { folders as demoFolders, sections as demoSections, seedBots } from './mock';
import { api, loadConfig, saveConfig, type ServerConfig } from './live';
import type { Activity, Bot, Folder, Message, Section, Task } from './types';

/* The office's state. Without a server it runs on sample data and a small
   simulation (demo); once connected to the Awady Office server it shows the
   real Grok Bot bots, polled from the server. The GUI uses the same hooks and
   actions either way. */

let bots: Bot[] = seedBots();
let layout: { sections: Section[]; folders: Folder[] } = { sections: demoSections, folders: demoFolders };
export interface Connection {
  mode: 'demo' | 'live';
  url?: string;
  error?: string;
  updatedAt?: number;
}
let config: ServerConfig | null = loadConfig();
let connection: Connection = config ? { mode: 'live', url: config.url } : { mode: 'demo' };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function update(id: string, fn: (b: Bot) => Bot) {
  bots = bots.map((b) => (b.id === id ? fn(b) : b));
  emit();
}

let n = 0;
const uid = (p: string) => `${p}-live-${++n}`;

function addLog(b: Bot, entry: Omit<Activity, 'id' | 'at'>): Bot {
  return { ...b, log: [...b.log, { id: uid('a'), at: Date.now(), ...entry }].slice(-80) };
}

function addMessage(b: Bot, m: Omit<Message, 'id' | 'at'>): Bot {
  return { ...b, chat: [...b.chat, { id: uid('m'), at: Date.now(), ...m }] };
}

export function useBots() {
  return useSyncExternalStore(subscribe, () => bots);
}

export function useBot(id: string | null) {
  const all = useBots();
  return id ? all.find((b) => b.id === id) ?? null : null;
}

export function useLayout() {
  return useSyncExternalStore(subscribe, () => layout);
}

export function useConnection() {
  return useSyncExternalStore(subscribe, () => connection);
}

export function markRead(id: string) {
  const b = bots.find((x) => x.id === id);
  if (b && b.unread) update(id, (x) => ({ ...x, unread: 0 }));
  if (config) api(config, `/api/bots/${encodeURIComponent(id)}/read`, { method: 'POST', body: {} }).catch(() => {});
}

function setState(id: string, state: RobotHeadState, activity: string) {
  update(id, (b) => ({ ...b, state, activity }));
}

/* happy and error are moments; the head settles back to idle */
const settleTimers = new Map<string, number>();
function settle(id: string, after: number) {
  clearTimeout(settleTimers.get(id));
  settleTimers.set(
    id,
    window.setTimeout(() => {
      const b = bots.find((x) => x.id === id);
      if (b && (b.state === 'happy' || b.state === 'error')) setState(id, 'idle', '');
    }, after),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function sendMessage(id: string, text: string) {
  if (config) return liveSend(config, id, text);
  return demoSend(id, text);
}

/** Demo: play out a mock run: think, use a tool, reply, finish. */
async function demoSend(id: string, text: string) {
  const wasWaiting = bots.find((b) => b.id === id)?.state === 'listening';
  update(id, (b) => {
    let next = addMessage(b, { role: 'user', text });
    next = addLog(next, { kind: 'message', text: `You: ${text}` });
    const task: Task = { id: uid('t'), title: text.length > 60 ? `${text.slice(0, 60)}…` : text, status: 'doing' };
    // whatever it was doing moves back to next; the new ask comes first
    const tasks = next.tasks.map((t) => (t.status === 'doing' ? { ...t, status: 'next' as const } : t));
    return { ...next, tasks: [task, ...tasks], state: 'thinking', activity: wasWaiting ? 'Got your answer' : 'Reading your message' };
  });

  await sleep(1400);
  const search = /ابحث|دور|search|find|لقي/i.test(text);
  const tool = search ? 'web_search' : 'terminal';
  const preview = search ? text.slice(0, 40) : 'ls ~/projects';
  update(id, (b) => addLog({ ...b, state: search ? 'searching' : 'working', activity: `${tool} · ${preview}` }, { kind: 'tool', tool, text: preview }));

  await sleep(2200);
  update(id, (b) => addLog({ ...b, state: 'thinking', activity: `${tool} done` }, { kind: 'tool', tool, text: 'done in 1.8s' }));
  await sleep(900);

  const reply = `تمام، استلمت: «${text}». بدأت عليها وهبلّغك أول ما أخلص.`;
  update(id, (b) => addMessage({ ...b, state: 'speaking', activity: 'Replying' }, { role: 'bot', text: '' }));
  const words = reply.split(' ');
  for (let i = 0; i < words.length; i++) {
    await sleep(90);
    update(id, (b) => {
      const chat = b.chat.slice();
      const last = chat[chat.length - 1];
      chat[chat.length - 1] = { ...last, text: words.slice(0, i + 1).join(' ') };
      return { ...b, chat };
    });
  }

  update(id, (b) =>
    addLog(
      { ...b, state: 'happy', activity: 'Replied', lastMessage: reply, lastAt: Date.now() },
      { kind: 'message', text: reply },
    ),
  );
  settle(id, 2500);
}

/* ── ambient simulation: busy bots keep moving while you watch ── */

const AMBIENT_TOOLS: Record<string, Array<[RobotHeadState, string]>> = {
  working: [
    ['working', 'terminal · npm run build'],
    ['working', 'read_file · notes.md'],
    ['working', 'patch · src/app.ts'],
    ['thinking', 'Planning the next step'],
  ],
  searching: [
    ['searching', 'web_search · latest updates'],
    ['searching', 'web_extract · source page'],
    ['thinking', 'Comparing what it found'],
  ],
  thinking: [
    ['thinking', 'Thinking it through'],
    ['working', 'todo · updating plan'],
  ],
};

const busy = new Set<string>();
for (const b of bots) if (b.state in AMBIENT_TOOLS) busy.add(b.id);
const ambientTicks = new Map<string, number>();

function ambientTick() {
  if (connection.mode !== 'demo') return;
  for (const id of busy) {
    const b = bots.find((x) => x.id === id);
    if (!b || b.state === 'speaking' || b.state === 'happy' || b.state === 'listening') continue;
    if (Math.random() < 0.55) continue;
    const kind = ambientTicks.get(id) ?? 0;
    ambientTicks.set(id, kind + 1);

    // every few ticks a bot finishes its current task and picks up the next
    if (kind > 0 && kind % 5 === 0) {
      const doing = b.tasks.find((t) => t.status === 'doing');
      const next = b.tasks.find((t) => t.status === 'next');
      if (doing) {
        update(id, (x) => {
          const tasks = x.tasks.map((t) =>
            t.id === doing.id ? { ...t, status: 'done' as const, at: Date.now() } : next && t.id === next.id ? { ...t, status: 'doing' as const } : t,
          );
          return addLog({ ...x, tasks, state: 'happy', activity: `Finished: ${doing.title}` }, { kind: 'task', text: `Finished: ${doing.title}` });
        });
        // back to work, or to rest if nothing is left
        setTimeout(() => {
          const x = bots.find((y) => y.id === id);
          if (!x || x.state !== 'happy') return;
          if (x.tasks.some((t) => t.status === 'doing')) setState(id, 'working', 'Starting the next task');
          else {
            busy.delete(id);
            setState(id, 'idle', '');
          }
        }, 2500);
        continue;
      }
    }

    const pool = AMBIENT_TOOLS.working;
    const options = AMBIENT_TOOLS[b.state] ?? pool;
    const [state, activity] = options[Math.floor(Math.random() * options.length)];
    const [tool, text] = activity.includes(' · ') ? activity.split(' · ') : [undefined, activity];
    update(id, (x) => addLog({ ...x, state, activity }, tool ? { kind: 'tool', tool, text } : { kind: 'message', text }));
  }
}

let ambient: number | undefined;
export function startAmbient() {
  if (ambient === undefined) ambient = window.setInterval(ambientTick, 3500);
  return () => {
    clearInterval(ambient);
    ambient = undefined;
  };
}

/* ── live: the Awady Office server ── */

interface OfficeResponse {
  sections: Section[];
  folders: Folder[];
  bots: Array<Omit<Bot, 'chat' | 'log'> & Partial<Pick<Bot, 'chat' | 'log'>>>;
  updatedAt: number;
  error?: string;
}

function setConnection(next: Connection) {
  connection = next;
  emit();
}

async function pollOffice() {
  if (!config) return;
  const c = config;
  try {
    const data = await api<OfficeResponse>(c, '/api/office');
    if (config !== c) return;
    const prev = new Map(bots.map((b) => [b.id, b]));
    bots = data.bots.map((b) => {
      const old = prev.get(b.id);
      return { ...b, chat: old?.chat ?? [], log: old?.log ?? [], tasks: b.tasks ?? [] } as Bot;
    });
    layout = { sections: data.sections, folders: data.folders ?? [] };
    connection = { mode: 'live', url: c.url, updatedAt: Date.now(), error: data.error };
    emit();
  } catch (e) {
    if (config === c) setConnection({ ...connection, error: e instanceof Error ? e.message : String(e) });
  }
}

async function pollBot(id: string) {
  if (!config) return;
  const c = config;
  try {
    const full = await api<Bot>(c, `/api/bots/${encodeURIComponent(id)}`);
    if (config !== c) return;
    update(id, (b) => ({ ...b, ...full, sectionId: b.sectionId, lead: b.lead }));
  } catch {
    /* the office poll reports connection errors */
  }
}

let officeTimer: number | undefined;
function startLive() {
  clearInterval(officeTimer);
  bots = [];
  layout = { sections: [], folders: [] };
  emit();
  pollOffice();
  officeTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') pollOffice();
  }, 5000);
}

/** While a bot's page is open, keep its chat and activity fresh. */
export function watchBot(id: string) {
  if (!config) return () => {};
  pollBot(id);
  const timer = window.setInterval(() => {
    if (document.visibilityState === 'visible') pollBot(id);
  }, 3000);
  return () => clearInterval(timer);
}

async function liveSend(c: ServerConfig, id: string, text: string) {
  update(id, (b) => ({
    ...addMessage(b, { role: 'user', text }),
    state: 'thinking',
    activity: 'Sending…',
  }));
  try {
    await api(c, `/api/bots/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { text }, timeout: 130_000 });
    pollBot(id);
  } catch (e) {
    update(id, (b) => ({
      ...addMessage(b, { role: 'peer', from: 'Not sent', text: e instanceof Error ? e.message : String(e) }),
      state: 'error',
      activity: 'Message not sent',
    }));
  }
}

export async function answerApproval(id: string, decision: 'accept' | 'decline') {
  const b = bots.find((x) => x.id === id);
  if (!config || !b?.approval) return;
  await api(config, `/api/bots/${encodeURIComponent(id)}/approvals`, {
    method: 'POST',
    body: { entryId: b.approval.entryId, requestId: b.approval.requestId, decision },
    timeout: 60_000,
  });
  update(id, (x) => ({ ...x, approval: null, state: 'thinking', activity: decision === 'accept' ? 'Approved' : 'Declined' }));
  pollBot(id);
}

/** Connect to a server: checks it answers with the token, then switches to live. */
export async function connect(c: ServerConfig) {
  await api<OfficeResponse>(c, '/api/office');
  config = c;
  saveConfig(c);
  connection = { mode: 'live', url: c.url };
  startLive();
}

export function disconnect() {
  config = null;
  saveConfig(null);
  clearInterval(officeTimer);
  bots = seedBots();
  layout = { sections: demoSections, folders: demoFolders };
  connection = { mode: 'demo' };
  emit();
}

if (config) startLive();
