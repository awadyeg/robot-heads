import type { RobotHeadState } from 'robot-heads';

export const STATE_LABEL: Record<RobotHeadState, string> = {
  idle: 'Free',
  thinking: 'Thinking',
  searching: 'Searching',
  listening: 'Waiting for you',
  speaking: 'Replying',
  working: 'Working',
  happy: 'Done',
  error: 'Stuck',
  sleeping: 'Resting',
};

/** Busy states: the bot is in the middle of something. */
export const BUSY: ReadonlySet<RobotHeadState> = new Set(['thinking', 'searching', 'working', 'speaking']);

export type Filter = 'all' | 'busy' | 'waiting' | 'free';

export function matches(state: RobotHeadState, f: Filter) {
  if (f === 'all') return true;
  if (f === 'busy') return BUSY.has(state) || state === 'happy';
  if (f === 'waiting') return state === 'listening' || state === 'error';
  return state === 'idle' || state === 'sleeping';
}

const DAY = 86_400_000;

/** "14:05", "Yesterday", "Saturday", "Oct 4" — like the chat list. */
export function when(at: number) {
  const d = new Date(at);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = today.getTime() - new Date(d).setHours(0, 0, 0, 0);
  if (diff <= 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff <= DAY) return 'Yesterday';
  if (diff < 7 * DAY) return d.toLocaleDateString('en', { weekday: 'long' });
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

export function clock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
