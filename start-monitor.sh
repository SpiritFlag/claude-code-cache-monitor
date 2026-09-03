#!/usr/bin/env bash
# cc-monitor: live Claude Code cache/context cockpit
# usage: ./start-monitor.sh [projectsDir] [port]
set -e
DIR="${1:-$HOME/.claude/projects}"
PORT="${2:-7777}"
HERE="$(cd "$(dirname "$0")" && pwd)"
if command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}" ]; then xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true; fi
if command -v open >/dev/null 2>&1 && [ "$(uname)" = "Darwin" ]; then open "http://localhost:$PORT" || true; fi
exec node "$HERE/server.js" --dir "$DIR" --port "$PORT"
