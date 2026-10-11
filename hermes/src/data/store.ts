import { useSyncExternalStore } from 'react';
import type { RobotHeadState } from 'robot-heads';
import { folders, sections, seedBots } from './mock';
import type { Activity, Bot, Message, Task } from './types';

/* The office's state. Today it is seeded with sample data and a small
   simulation so the heads have something to do; linking to the bridge will
   replace `seedBots` and the simulation with the bridge's API and events,
   keeping the same actions for the GUI. */

let bots: Bot[] = seedBots();
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

export { sections, folders };

export function markRead(id: string) {
  const b = bots.find((x) => x.id === id);
  if (b && b.unread) update(id, (x) => ({ ...x, unread: 0 }));
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

/** Send a message and play out a mock run: think, use a tool, reply, finish. */
export async function sendMessage(id: string, text: string) {
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
