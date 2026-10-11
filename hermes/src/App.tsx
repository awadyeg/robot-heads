import { useEffect, useRef, useState } from 'react';
import { BotPage } from './BotPage';
import { Office } from './Office';
import { markRead, startAmbient } from './data/store';
import { native } from './native';

/* Two screens: the office, and one bot's page at #bot/<id> (the same link
   the Android app opens from a notification). */

function botFromHash() {
  const m = location.hash.match(/^#bot\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export default function App() {
  const [botId, setBotId] = useState<string | null>(botFromHash);
  /* true when the bot page was opened from the office, so back can pop it;
     a page opened straight from a notification link has nothing to pop */
  const pushed = useRef(false);

  useEffect(() => startAmbient(), []);

  useEffect(() => {
    const onHash = () => {
      const id = botFromHash();
      if (!id) pushed.current = false;
      setBotId(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    native.setActiveBot(botId);
    if (botId) {
      markRead(botId);
      native.markRead(botId);
    }
    window.scrollTo(0, 0);
  }, [botId]);

  const back = () => {
    if (pushed.current) {
      pushed.current = false;
      history.back();
    } else {
      history.replaceState(null, '', location.pathname + location.search);
      setBotId(null);
    }
  };

  /* the Android back button: close the bot page before leaving the app */
  useEffect(() => {
    window.hermesBack = () => {
      if (!botFromHash()) return false;
      back();
      return true;
    };
    return () => {
      delete window.hermesBack;
    };
  });

  const open = (id: string) => {
    pushed.current = true;
    location.hash = `bot/${encodeURIComponent(id)}`;
  };

  return botId ? <BotPage key={botId} id={botId} onBack={back} /> : <Office onOpen={open} />;
}
