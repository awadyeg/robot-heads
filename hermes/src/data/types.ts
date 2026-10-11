import type { RobotHeadShape, RobotHeadState } from 'robot-heads';

/* The shapes the GUI renders. The mock store fills them today; the bridge
   on the PC will fill the same shapes once it is linked. */

export interface Section {
  id: string;
  name: string;
}

/** A collapsed group shown as a single row at the bottom, e.g. "Sara Eng Projects 39". */
export interface Folder {
  id: string;
  name: string;
  count: number;
}

export type TaskStatus = 'doing' | 'next' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  /** when it was finished, for done tasks */
  at?: number;
}

export type ActivityKind = 'tool' | 'message' | 'task' | 'error' | 'waiting';

export interface Activity {
  id: string;
  at: number;
  kind: ActivityKind;
  text: string;
  /** tool name for kind === 'tool' */
  tool?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'bot' | 'peer';
  text: string;
  at: number;
  /** for peer messages: which bot sent it */
  from?: string;
}

export interface Bot {
  id: string;
  name: string;
  /** small tag shown next to the name, like "Piano Teacher" */
  tag?: string;
  sectionId: string | null;
  /** the two bots pinned to the top of the office */
  lead?: boolean;
  color: string;
  screenColor?: string;
  shape: RobotHeadShape;
  state: RobotHeadState;
  /** one line on what it is doing right now */
  activity: string;
  lastMessage: string;
  lastAt: number;
  unread: number;
  tasks: Task[];
  log: Activity[];
  chat: Message[];
}
