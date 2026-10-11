import type { RobotHeadState } from 'robot-heads';

/* A tiny client for the Hermes Agent API server (`hermes gateway` with
   API_SERVER_ENABLED=true): health, the Runs API and its SSE event stream. */

export interface BotConfig {
  id: string;
  name: string;
  /** e.g. http://127.0.0.1:8642, or http://127.0.0.1:8642/p/<profile> with multi-profile routing */
  url: string;
  /** that profile's API_SERVER_KEY */
  apiKey: string;
  shape: 'rectangle' | 'square' | 'circle' | 'hexagon';
  color: string;
  screenColor: string;
}

/** One frame from GET /v1/runs/{id}/events: `{ event, run_id, timestamp, seq, ...fields }`. */
export interface RunEvent {
  event: string;
  run_id?: string;
  [key: string]: unknown;
}

function base(bot: BotConfig) {
  return bot.url.replace(/\/+$/, '');
}

function headers(bot: BotConfig, json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${bot.apiKey}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function failure(res: Response) {
  let msg = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    msg = body?.error?.message ?? body?.message ?? msg;
  } catch {
    /* not JSON */
  }
  return new Error(msg);
}

/** GET /health — public liveness probe. */
export async function checkHealth(bot: BotConfig, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${base(bot)}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}

/** POST /v1/runs — starts a turn, returns its run id. */
export async function startRun(bot: BotConfig, input: string, sessionId: string): Promise<string> {
  const res = await fetch(`${base(bot)}/v1/runs`, {
    method: 'POST',
    headers: headers(bot, true),
    body: JSON.stringify({ input, session_id: sessionId }),
  });
  if (!res.ok) throw await failure(res);
  const body = await res.json();
  return body.run_id as string;
}

export async function stopRun(bot: BotConfig, runId: string) {
  const res = await fetch(`${base(bot)}/v1/runs/${runId}/stop`, { method: 'POST', headers: headers(bot) });
  if (!res.ok) throw await failure(res);
}

export async function answerApproval(bot: BotConfig, runId: string, choice: string, requestId?: string) {
  const res = await fetch(`${base(bot)}/v1/runs/${runId}/approval`, {
    method: 'POST',
    headers: headers(bot, true),
    body: JSON.stringify(requestId ? { choice, request_id: requestId } : { choice }),
  });
  if (!res.ok) throw await failure(res);
}

/**
 * GET /v1/runs/{id}/events. EventSource cannot send an Authorization header,
 * so this reads the SSE stream through fetch and parses the frames itself,
 * skipping `: keepalive` comments. Resolves when the server closes the stream.
 */
export async function streamRun(
  bot: BotConfig,
  runId: string,
  onEvent: (e: RunEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${base(bot)}/v1/runs/${runId}/events`, { headers: headers(bot), signal });
  if (!res.ok || !res.body) throw await failure(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed.event === 'string') onEvent(parsed);
      } catch {
        /* a frame we do not understand */
      }
    }
  }
}

/* Tools that look things up get the searching face; everything else is work. */
const SEARCH_TOOL = /search|web|browse|browser|extract|crawl|fetch|lookup|recall|memory/i;

export function stateForTool(tool: string): RobotHeadState {
  return SEARCH_TOOL.test(tool) ? 'searching' : 'working';
}

/**
 * What the head should show for an event, or null to leave it alone.
 * `happy` and `error` are momentary: the card sends the head back to idle.
 */
export function stateForEvent(e: RunEvent): RobotHeadState | null {
  switch (e.event) {
    case 'run.started':
    case 'reasoning.available':
    case 'tool.completed':
    case 'subagent.complete':
    case 'approval.responded':
    case 'run.steered':
      return 'thinking';
    case 'tool.started':
      return stateForTool(String(e.tool ?? ''));
    case 'subagent.start':
      return 'working';
    case 'message.delta':
    case 'message.interim':
      return 'speaking';
    case 'approval.request':
      return 'listening';
    case 'run.completed':
      return 'happy';
    case 'run.failed':
      return 'error';
    case 'run.cancelled':
    case 'run.interrupted':
      return 'idle';
    default:
      return null;
  }
}

export function isTerminal(e: RunEvent) {
  return /^run\.(completed|failed|cancelled|interrupted)$/.test(e.event);
}
