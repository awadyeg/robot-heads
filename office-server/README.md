# Awady Office server

Bridges [grok-bot-cli](https://github.com/ScriptedAlchemy/grok-bot-cli) (`gbot`) to the Awady Office app, so the
office shows your real Grok Bot bots from a server that stays on, not your PC.

- polls each bot's recent thread through `gbot thread --json` (every 5 s for the bot open in the app, 20 s for busy
  bots, 2 min for the rest) and works out its state: waiting for an approval, thinking, using a tool (searching or
  working), just replied, idle, or resting (nothing for a week);
- reads tasks from the bot's latest to-do tool call, when it keeps one;
- sends your messages with `gbot send` and answers approval cards with `gbot approvals respond`.

## Install

On the server, as the user whose `gbot` already works:

```bash
curl -fsSL https://raw.githubusercontent.com/awadyeg/robot-heads/ccr-402eaf76-twjrnu/office-server/install.sh | bash
```

It installs a `systemd` service (`awady-office`), creates a token, and prints the address and token to enter in the
app (tap **A** → Grok Bot server). With Tailscale on the server it listens only on the Tailscale address.

## Sections

`~/awady-office/data/sections.json` lists the bots in each section by name and the two "leads" pinned on top.
Bots not listed go to **Unassigned**. Edits apply on the app's next refresh.

## API

All under `Authorization: Bearer <token>`:

| | |
|---|---|
| `GET /health` | no token; liveness |
| `GET /api/office` | sections, folders and every bot's state, activity, tasks, last message |
| `GET /api/bots/:id` | one bot with its chat and activity log |
| `POST /api/bots/:id/messages` `{text}` | send a message |
| `POST /api/bots/:id/approvals` `{entryId, requestId, decision}` | `accept` (once) or `decline` |
| `POST /api/bots/:id/read` | mark its messages read |
| `GET /api/bots/:id/raw` | the raw `gbot thread` entries, for debugging |

`gbot` uses the Grok Bot app's private gateway; it is unofficial and can break when Grok Bot changes.
