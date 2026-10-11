import { useEffect, useRef, useState, type FormEvent } from 'react';
import { RobotHead } from 'robot-heads';
import { sendMessage, useBot } from './data/store';
import type { Activity, Bot, Task } from './data/types';
import { BUSY, STATE_LABEL, clock, when } from './ui';

type Tab = 'tasks' | 'activity' | 'chat';

export function BotPage({ id, onBack }: { id: string; onBack: () => void }) {
  const bot = useBot(id);
  const [tab, setTab] = useState<Tab>(() => (bot?.state === 'listening' ? 'chat' : 'tasks'));
  if (!bot) {
    return (
      <div className="page">
        <button className="back" onClick={onBack}>
          ‹ Office
        </button>
        <p className="empty">This bot is not in the office.</p>
      </div>
    );
  }

  const done = bot.tasks.filter((t) => t.status === 'done').length;
  const total = bot.tasks.length;

  return (
    <div className={`page s-${bot.state}`}>
      <header className="page-bar">
        <button className="round" onClick={onBack} aria-label="Back to the office">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m15 6-6 6 6 6" />
          </svg>
        </button>
        <span className="page-title" dir="auto">
          {bot.name}
        </span>
      </header>

      <section className="hero">
        <RobotHead
          shape={bot.shape}
          state={bot.state}
          size={150}
          color={bot.color}
          screenColor={bot.screenColor}
          aria-label={`${bot.name}, ${STATE_LABEL[bot.state].toLowerCase()}`}
        />
        <p className="hero-state">
          <span className="dot" />
          {STATE_LABEL[bot.state]}
        </p>
        <p className="hero-line" dir="auto">
          {bot.activity.replace(/^Waiting for you:\s*/, '') || (BUSY.has(bot.state) ? '…' : `Last seen ${when(bot.lastAt).toLowerCase()}`)}
        </p>
        {total > 0 && (
          <div className="progress" aria-label={`${done} of ${total} tasks done`}>
            <span style={{ width: `${(done / total) * 100}%` }} />
          </div>
        )}
      </section>

      <nav className="tabs" role="tablist">
        {(
          [
            ['tasks', `Tasks${total ? ` ${done}/${total}` : ''}`],
            ['activity', 'Activity'],
            ['chat', 'Chat'],
          ] as Array<[Tab, string]>
        ).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'tasks' && <Tasks bot={bot} onChat={() => setTab('chat')} />}
      {tab === 'activity' && <ActivityLog log={bot.log} />}
      {tab === 'chat' && <Chat bot={bot} />}
    </div>
  );
}

function TaskList({ title, tasks, kind }: { title: string; tasks: Task[]; kind: Task['status'] }) {
  if (tasks.length === 0) return null;
  return (
    <section className={`tasks t-${kind}`}>
      <h3>
        {title} <span className="n">{tasks.length}</span>
      </h3>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>
            <span className="mark" aria-hidden>
              {kind === 'done' ? '✓' : kind === 'doing' ? '' : ''}
            </span>
            <span className="task-title" dir="auto">
              {t.title}
            </span>
            {t.at && <span className="task-at">{when(t.at)}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tasks({ bot, onChat }: { bot: Bot; onChat: () => void }) {
  const doing = bot.tasks.filter((t) => t.status === 'doing');
  const next = bot.tasks.filter((t) => t.status === 'next');
  const done = bot.tasks.filter((t) => t.status === 'done').sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return (
    <div className="panel">
      {bot.state === 'listening' && (
        <button className="waiting-card" onClick={onChat}>
          <strong>Needs you</strong>
          <span dir="auto">{bot.activity.replace(/^Waiting for you:\s*/, '')}</span>
          <span className="go">Answer in chat ›</span>
        </button>
      )}
      <TaskList title="Working on now" tasks={doing} kind="doing" />
      <TaskList title="Up next" tasks={next} kind="next" />
      <TaskList title="Done" tasks={done} kind="done" />
      {bot.tasks.length === 0 && <p className="empty">No tasks yet. Give it one from the chat.</p>}
    </div>
  );
}

const KIND_ICON: Record<Activity['kind'], string> = {
  tool: '⚙',
  message: '💬',
  task: '✓',
  error: '!',
  waiting: '⏳',
};

function ActivityLog({ log }: { log: Activity[] }) {
  const items = log.slice().reverse();
  return (
    <div className="panel">
      {items.length === 0 && <p className="empty">Nothing yet.</p>}
      <ol className="timeline">
        {items.map((a) => (
          <li key={a.id} className={`k-${a.kind}`}>
            <span className="ico" aria-hidden>
              {KIND_ICON[a.kind]}
            </span>
            <span className="what" dir="auto">
              {a.tool && <code>{a.tool}</code>} {a.text}
            </span>
            <span className="at">{when(a.at) === clock(a.at) ? clock(a.at) : `${when(a.at)} ${clock(a.at)}`}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Chat({ bot }: { bot: Bot }) {
  const [draft, setDraft] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const busy = BUSY.has(bot.state);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [bot.chat]);

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    sendMessage(bot.id, text);
  }

  return (
    <div className="panel chat">
      <div className="messages">
        {bot.chat.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.from && <span className="from">{m.from}</span>}
            <span dir="auto">{m.text || '…'}</span>
            <span className="at">{clock(m.at)}</span>
          </div>
        ))}
        {busy && bot.state !== 'speaking' && (
          <div className="bubble bot typing" aria-label={`${bot.name} is ${STATE_LABEL[bot.state].toLowerCase()}`}>
            <i />
            <i />
            <i />
          </div>
        )}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={send}>
        <input
          dir="auto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={bot.state === 'listening' ? 'Answer…' : `Message ${bot.name}`}
        />
        <button type="submit" className="send" disabled={!draft.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.7 2-12.7 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
