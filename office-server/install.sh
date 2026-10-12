#!/usr/bin/env bash
# Installs the Awady Office server on this machine as a systemd service.
# Run it as the user whose `gbot` already sees your Grok Bot bots:
#
#   curl -fsSL https://raw.githubusercontent.com/awadyeg/robot-heads/ccr-402eaf76-twjrnu/office-server/install.sh | bash
#
# Re-running it updates the server and keeps your token and sections.
set -euo pipefail

BRANCH="${OFFICE_BRANCH:-ccr-402eaf76-twjrnu}"
RAW="https://raw.githubusercontent.com/awadyeg/robot-heads/$BRANCH/office-server"
DIR="${OFFICE_DIR:-$HOME/awady-office}"
PORT="${PORT:-8787}"
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

NODE="$(command -v node || true)"
GBOT="$(command -v gbot || true)"
[ -n "$NODE" ] || die "Node.js is not installed (need 22+)."
[ "$("$NODE" -p 'process.versions.node.split(".")[0]')" -ge 22 ] || die "Node.js 22+ is needed (found $("$NODE" -v))."
[ -n "$GBOT" ] || die "gbot is not on PATH. Install it with: npm install --global grok-bot-cli"

say "Checking that gbot can see your bots…"
COUNT="$("$GBOT" bots list --json --no-history | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const a=Array.isArray(j)?j:(j.bots||j.agents||[]);console.log(a.length)})')" \
  || die "gbot bots list failed. Make sure gbot works for this user first."
echo "gbot sees $COUNT bots and groups."

say "Downloading the server to $DIR…"
mkdir -p "$DIR"
curl -fsSL "$RAW/server.mjs" -o "$DIR/server.mjs"
curl -fsSL "$RAW/sections.default.json" -o "$DIR/sections.default.json"

ENV="$DIR/office.env"
if [ ! -f "$ENV" ]; then
  TOKEN="$("$NODE" -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  # on Tailscale, listen only on the tailnet address (WireGuard-encrypted, only
  # your devices reach it); otherwise on every interface
  HOST="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  [ -n "$HOST" ] || HOST=0.0.0.0
  cat > "$ENV" <<EOF
OFFICE_TOKEN=$TOKEN
PORT=$PORT
HOST=$HOST
GBOT=$GBOT
DATA_DIR=$DIR/data
EOF
  chmod 600 "$ENV"
fi
# shellcheck disable=SC1090
. "$ENV"

say "Installing the systemd service (awady-office)…"
$SUDO tee /etc/systemd/system/awady-office.service >/dev/null <<EOF
[Unit]
Description=Awady Office server (Grok Bot -> Awady Office app)
After=network-online.target
Wants=network-online.target

[Service]
User=$(id -un)
WorkingDirectory=$DIR
EnvironmentFile=$ENV
Environment=HOME=$HOME
Environment=PATH=$(dirname "$NODE"):$(dirname "$GBOT"):/usr/local/bin:/usr/bin:/bin
ExecStart=$NODE $DIR/server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
$SUDO systemctl daemon-reload
$SUDO systemctl enable awady-office >/dev/null 2>&1
$SUDO systemctl restart awady-office
sleep 2
curl -fsS "http://$([ "$HOST" = 0.0.0.0 ] && echo 127.0.0.1 || echo "$HOST"):$PORT/health" >/dev/null || die "The server did not start. See: journalctl -u awady-office -n 50"

if [ "$HOST" != "0.0.0.0" ]; then
  ADDRESS="http://$HOST:$PORT"
  echo "Listening on your Tailscale address only: keep Tailscale on in your phone."
else
  IP="$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
  ADDRESS="http://$IP:$PORT"
  echo "Note: without Tailscale the server answers plain HTTP on port $PORT; allow it in your firewall (e.g. ufw allow $PORT/tcp)."
fi

say "Done. In the Awady Office app: tap the A at the top → Grok Bot server, and enter:"
echo "  Address: $ADDRESS"
echo "  Token:   $OFFICE_TOKEN"
echo
echo "Logs:      journalctl -u awady-office -f"
echo "Sections:  edit $DIR/data/sections.json (bot names per section), no restart needed"
