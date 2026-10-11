import { useEffect, useState, type FormEvent } from 'react';
import { RobotHead, robotHeadShapes } from 'robot-heads';
import { BotCard } from './BotCard';
import type { BotConfig } from './hermes';

const STORAGE_KEY = 'robot-heads-hermes-bots';

const COLORS = ['#2b49a3', '#c8372d', '#e2762a', '#e0ad1f', '#2f8f58', '#1f8189', '#6a45b8', '#d9558f', '#3a3d44'];
const SCREENS = ['#e8f2ff', '#7fe7ff', '#7dff9a', '#ffc46b', '#ff8fd0'];

function loadBots(): BotConfig[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function newBot(index: number): BotConfig {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: index === 0 ? 'Hermes' : `Hermes ${index + 1}`,
    url: 'http://127.0.0.1:8642',
    apiKey: '',
    shape: robotHeadShapes[index % robotHeadShapes.length],
    color: COLORS[index % COLORS.length],
    screenColor: SCREENS[0],
  };
}

export default function App() {
  const [bots, setBots] = useState<BotConfig[]>(loadBots);
  const [editing, setEditing] = useState<BotConfig | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bots));
    } catch {
      /* private mode: bots last for this tab only */
    }
  }, [bots]);

  function save(bot: BotConfig) {
    setBots((all) => (all.some((b) => b.id === bot.id) ? all.map((b) => (b.id === bot.id ? bot : b)) : [...all, bot]));
    setEditing(null);
  }

  function remove(id: string) {
    setBots((all) => all.filter((b) => b.id !== id));
    setEditing(null);
  }

  return (
    <main>
      <header className="top">
        <div>
          <h1>Hermes bots</h1>
          <p className="sub">Each head shows what its Hermes agent is doing, live from the gateway's Runs API.</p>
        </div>
        <button onClick={() => setEditing(newBot(bots.length))}>Add bot</button>
      </header>

      {bots.length === 0 ? (
        <section className="welcome">
          <RobotHead state="sleeping" size={180} />
          <h2>No bots yet</h2>
          <p>
            Turn on the API server in <code>~/.hermes/.env</code>, allow this page's origin, then run{' '}
            <code>hermes gateway</code>:
          </p>
          <pre>{`API_SERVER_ENABLED=true
API_SERVER_KEY=your-secret
API_SERVER_CORS_ORIGINS=${location.origin}`}</pre>
          <button onClick={() => setEditing(newBot(0))}>Add your first bot</button>
        </section>
      ) : (
        <section className="grid">
          {bots.map((bot, i) => (
            <BotCard key={bot.id} bot={bot} seed={(i * 0.37) % 1} onEdit={() => setEditing(bot)} />
          ))}
        </section>
      )}

      {editing && (
        <BotEditor
          bot={editing}
          isNew={!bots.some((b) => b.id === editing.id)}
          onSave={save}
          onRemove={() => remove(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}

function BotEditor({
  bot,
  isNew,
  onSave,
  onRemove,
  onClose,
}: {
  bot: BotConfig;
  isNew: boolean;
  onSave: (b: BotConfig) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(bot);
  const set = <K extends keyof BotConfig>(key: K, value: BotConfig[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    onSave({ ...draft, name: draft.name.trim() || 'Hermes', url: draft.url.trim() });
  }

  return (
    <div className="scrim" onClick={onClose}>
      <form className="dialog" onSubmit={submit} onClick={(e) => e.stopPropagation()}>
        <div className="preview">
          <RobotHead shape={draft.shape} color={draft.color} screenColor={draft.screenColor} state="happy" size={120} />
        </div>
        <label>
          Name
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </label>
        <label>
          Gateway URL
          <input value={draft.url} onChange={(e) => set('url', e.target.value)} placeholder="http://127.0.0.1:8642" />
          <small>
            For a named profile on a multiplexed gateway use <code>…:8642/p/&lt;profile&gt;</code>, or that profile's own
            port.
          </small>
        </label>
        <label>
          API key
          <input
            type="password"
            value={draft.apiKey}
            onChange={(e) => set('apiKey', e.target.value)}
            placeholder="API_SERVER_KEY"
          />
          <small>Stored in this browser's localStorage only.</small>
        </label>
        <fieldset>
          <legend>Shape</legend>
          <div className="row">
            {robotHeadShapes.map((s) => (
              <button
                type="button"
                key={s}
                className={draft.shape === s ? '' : 'ghost'}
                onClick={() => set('shape', s)}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Shell</legend>
          <div className="row">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch ${draft.color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => set('color', c)}
                aria-label={c}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Screen</legend>
          <div className="row">
            {SCREENS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch ${draft.screenColor === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => set('screenColor', c)}
                aria-label={c}
              />
            ))}
          </div>
        </fieldset>
        <div className="row end">
          {!isNew && (
            <button type="button" className="ghost danger" onClick={onRemove}>
              Remove
            </button>
          )}
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}
