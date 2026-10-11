import { useEffect, useRef, useState, type FormEvent } from 'react';
import { RobotHead, type RobotHeadState } from 'robot-heads';
import {
  answerApproval,
  checkHealth,
  isTerminal,
  startRun,
  stateForEvent,
  stopRun,
  streamRun,
  type BotConfig,
  type RunEvent,
} from './hermes';

interface Message {
  role: 'user' | 'assistant' | 'error';
  text: string;
}

interface Approval {
  requestId?: string;
  command?: string;
  description?: string;
  choices: string[];
}

const STATE_LABELS: Record<RobotHeadState, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  searching: 'Searching',
  listening: 'Waiting for you',
  speaking: 'Replying',
  working: 'Working',
  happy: 'Done',
  error: 'Error',
  sleeping: 'Offline',
};

const HEALTH_EVERY_MS = 15_000;

function preview(value: unknown, max = 80) {
  const s = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function BotCard({ bot, seed, onEdit }: { bot: BotConfig; seed: number; onEdit: () => void }) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [state, setState] = useState<RobotHeadState>('idle');
  const [activity, setActivity] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const settle = useRef<number | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const sessionId = `robot-heads-${bot.id}`;

  /* poll /health; an unreachable gateway puts the bot to sleep */
  useEffect(() => {
    const ctrl = new AbortController();
    const probe = () => checkHealth(bot, ctrl.signal).then((ok) => !ctrl.signal.aborted && setOnline(ok));
    probe();
    const timer = setInterval(probe, HEALTH_EVERY_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [bot]);

  useEffect(() => () => clearTimeout(settle.current), []);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [messages]);

  /* happy and error are moments, not resting states */
  function show(next: RobotHeadState) {
    clearTimeout(settle.current);
    setState(next);
    if (next === 'happy' || next === 'error') {
      settle.current = window.setTimeout(() => setState('idle'), next === 'happy' ? 2500 : 4000);
    }
  }

  function append(role: Message['role'], text: string) {
    setMessages((m) => [...m, { role, text }]);
  }

  /* message.delta tokens grow the last assistant bubble */
  function appendDelta(delta: string) {
    setMessages((m) => {
      const last = m[m.length - 1];
      if (last?.role === 'assistant') return [...m.slice(0, -1), { ...last, text: last.text + delta }];
      return [...m, { role: 'assistant', text: delta }];
    });
  }

  function handle(e: RunEvent, streamed: { text: boolean }) {
    const next = stateForEvent(e);
    if (next) show(next);
    switch (e.event) {
      case 'tool.started':
        setActivity(`${e.tool}${e.preview ? ` · ${preview(e.preview)}` : ''}`);
        break;
      case 'tool.completed':
        setActivity(`${e.tool} ${e.error ? 'failed' : 'done'}${e.duration ? ` in ${e.duration}s` : ''}`);
        break;
      case 'subagent.start':
        setActivity(`delegating${e.preview ? ` · ${preview(e.preview)}` : ''}`);
        break;
      case 'reasoning.available':
        setActivity('reasoning');
        break;
      case 'message.delta':
        streamed.text = true;
        appendDelta(String(e.delta ?? ''));
        break;
      case 'approval.request':
        setApproval({
          requestId: typeof e.request_id === 'string' ? e.request_id : undefined,
          command: typeof e.command === 'string' ? e.command : undefined,
          description: typeof e.description === 'string' ? e.description : undefined,
          choices: Array.isArray(e.choices) ? (e.choices as string[]) : ['once', 'deny'],
        });
        setActivity('needs approval');
        break;
      case 'approval.responded':
        setApproval(null);
        break;
      case 'run.completed':
        if (!streamed.text && e.output) append('assistant', String(e.output));
        setActivity('');
        break;
      case 'run.failed':
      case 'run.interrupted':
        append('error', String(e.error ?? 'The run failed.'));
        setActivity('');
        break;
      case 'run.cancelled':
        setActivity('stopped');
        break;
    }
  }

  async function send(ev: FormEvent) {
    ev.preventDefault();
    const input = draft.trim();
    if (!input || runId) return;
    setDraft('');
    append('user', input);
    show('thinking');
    setActivity('starting');
    let id: string | null = null;
    try {
      id = await startRun(bot, input, sessionId);
      setRunId(id);
      const streamed = { text: false };
      let ended = false;
      await streamRun(bot, id, (e) => {
        if (isTerminal(e)) ended = true;
        handle(e, streamed);
      });
      if (!ended) show('idle');
    } catch (err) {
      append('error', err instanceof Error ? err.message : String(err));
      show('error');
      setActivity('');
    } finally {
      setRunId(null);
      setApproval(null);
    }
  }

  async function approve(choice: string) {
    if (!runId || !approval) return;
    try {
      await answerApproval(bot, runId, choice, approval.requestId);
      setApproval(null);
      show('thinking');
    } catch (err) {
      append('error', err instanceof Error ? err.message : String(err));
    }
  }

  const shown: RobotHeadState = online === false && !runId ? 'sleeping' : state;

  return (
    <article className={`bot ${online === false ? 'offline' : ''}`}>
      <header className="bot-head">
        <RobotHead
          shape={bot.shape}
          state={shown}
          size={132}
          color={bot.color}
          screenColor={bot.screenColor}
          seed={seed}
          aria-label={`${bot.name}, ${STATE_LABELS[shown].toLowerCase()}`}
        />
        <div className="bot-meta">
          <h2>{bot.name}</h2>
          <p className={`status status-${shown}`}>
            <span className="dot" />
            {online === null ? 'Connecting…' : STATE_LABELS[shown]}
          </p>
          <p className="activity" title={activity}>
            {activity || ' '}
          </p>
        </div>
        <button className="ghost" onClick={onEdit} aria-label={`Edit ${bot.name}`}>
          Edit
        </button>
      </header>

      <div className="log" ref={log}>
        {messages.length === 0 && <p className="empty">Say something to {bot.name}.</p>}
        {messages.map((m, i) => (
          <p key={i} className={`msg ${m.role}`}>
            {m.text}
          </p>
        ))}
      </div>

      {approval && (
        <div className="approval">
          <p>
            <strong>Approval needed</strong>
            {approval.description ? ` — ${approval.description}` : ''}
          </p>
          {approval.command && <code>{approval.command}</code>}
          <div className="row">
            {approval.choices.map((c) => (
              <button key={c} className={c === 'deny' ? 'ghost' : ''} onClick={() => approve(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="composer" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={online === false ? 'Gateway unreachable' : `Message ${bot.name}`}
          disabled={!!runId}
        />
        {runId ? (
          <button type="button" className="ghost" onClick={() => stopRun(bot, runId).catch(() => {})}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </article>
  );
}
