import { useMemo, useState } from 'react';
import { Desk } from './Desk';
import { folders, sections, useBots } from './data/store';
import type { Bot } from './data/types';
import { BUSY, matches, type Filter } from './ui';

const COLLAPSED_KEY = 'awady-office-collapsed';

function loadCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

const FILTERS: Array<[Filter, string]> = [
  ['all', 'All'],
  ['busy', 'Working'],
  ['waiting', 'Waiting for you'],
  ['free', 'Free'],
];

const seedOf = (id: string) => (Array.from(id).reduce((a, c) => a + c.charCodeAt(0), 0) % 100) / 100;

export function Office({ onOpen }: { onOpen: (id: string) => void }) {
  const bots = useBots();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>(loadCollapsed);

  const counts = useMemo(
    () => ({
      busy: bots.filter((b) => BUSY.has(b.state)).length,
      waiting: bots.filter((b) => b.state === 'listening' || b.state === 'error').length,
      free: bots.filter((b) => b.state === 'idle' || b.state === 'sleeping').length,
    }),
    [bots],
  );

  const q = query.trim().toLowerCase();
  const shown = (b: Bot) => matches(b.state, filter) && (!q || b.name.toLowerCase().includes(q) || b.lastMessage.toLowerCase().includes(q));
  const leads = bots.filter((b) => b.lead && shown(b));

  function toggle(id: string) {
    setCollapsed((c) => {
      const next = c.includes(id) ? c.filter((x) => x !== id) : [...c, id];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* fine for this session */
      }
      return next;
    });
  }

  return (
    <div className="office">
      <header className="bar">
        <span className="me" aria-label="You">A</span>
        {searching ? (
          <input
            className="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bots"
            onBlur={() => !query && setSearching(false)}
          />
        ) : (
          <h1>Office</h1>
        )}
        <button className="round" aria-label="Search" onClick={() => setSearching((s) => !s)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </button>
        <button className="round" aria-label="New bot">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>

      <nav className="filters" aria-label="Filter">
        {FILTERS.map(([f, label]) => (
          <button key={f} className={`chip ${filter === f ? 'on' : ''} chip-${f}`} onClick={() => setFilter(f)}>
            {label}
            {f !== 'all' && <span className="n">{counts[f]}</span>}
          </button>
        ))}
      </nav>

      {leads.length > 0 && (
        <section className="leads">
          {leads.map((b) => (
            <Desk key={b.id} bot={b} big seed={seedOf(b.id)} onOpen={() => onOpen(b.id)} />
          ))}
        </section>
      )}

      {sections.map((s) => {
        const members = bots.filter((b) => b.sectionId === s.id && shown(b));
        if (members.length === 0) return null;
        const closed = collapsed.includes(s.id) && !q;
        const busyHere = members.filter((b) => BUSY.has(b.state)).length;
        return (
          <section key={s.id} className="room">
            <button className={`room-title ${closed ? 'closed' : ''}`} onClick={() => toggle(s.id)} aria-expanded={!closed}>
              {s.name}
              <span className="room-meta">
                {members.length}
                {busyHere > 0 && <span className="room-busy"> · {busyHere} working</span>}
              </span>
              <svg className="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {!closed && (
              <div className="desks">
                {members.map((b) => (
                  <Desk key={b.id} bot={b} seed={seedOf(b.id)} onOpen={() => onOpen(b.id)} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {filter === 'all' && !q && (
        <section className="folders">
          {folders.map((f) => (
            <button key={f.id} className="folder">
              {f.name} <span className="n">{f.count}</span>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
