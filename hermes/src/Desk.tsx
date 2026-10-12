import { useEffect, useRef, useState } from 'react';
import { RobotHead } from 'robot-heads';
import type { Bot } from './data/types';
import { STATE_LABEL } from './ui';

/** Pause heads that are scrolled out of view, so a full office stays cheap on a phone. */
function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible] as const;
}

export function Desk({ bot, seed, onOpen, big }: { bot: Bot; seed: number; onOpen: () => void; big?: boolean }) {
  const [ref, visible] = useOnScreen<HTMLButtonElement>();
  const doing = bot.tasks.filter((t) => t.status === 'doing').length;
  const done = bot.tasks.filter((t) => t.status === 'done').length;
  const total = bot.tasks.length;
  const line = bot.activity.replace(/^Waiting for you:\s*/, '') || (bot.state === 'sleeping' ? 'Nothing new in a while' : bot.lastMessage);

  return (
    <button ref={ref} className={`desk s-${bot.state} ${big ? 'big' : ''}`} onClick={onOpen}>
      <span className="desk-head">
        <RobotHead
          shape={bot.shape}
          state={bot.state}
          size={big ? 104 : 72}
          color={bot.color}
          screenColor={bot.screenColor}
          seed={seed}
          paused={!visible}
          interactive={false}
          antenna={big}
          aria-hidden
        />
        {bot.unread > 0 && <span className="badge">{bot.unread}</span>}
      </span>
      <span className="desk-name" dir="auto">
        {bot.name}
      </span>
      <span className="desk-state">
        <span className="dot" />
        {STATE_LABEL[bot.state]}
        {doing > 0 && total > 1 && <span className="count"> · {done}/{total}</span>}
      </span>
      <span className="desk-line" dir="auto">
        {line}
      </span>
    </button>
  );
}
