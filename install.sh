#!/usr/bin/env bash
# RUBICON · local install. Touches nothing outside this folder.
set -euo pipefail
cd "$(dirname "$0")"
ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
command -v node >/dev/null || { echo "Node.js >= 20 is required"; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 is required"; exit 1; }
ok "node $(node --version) · $(python3 --version)"
node scripts/generate-synthetic.cjs 500 42 >/dev/null && ok "synthetic dataset (500 accounts)"
node engine/build-workflows.cjs >/dev/null && ok "n8n workflows generated from the engine"
npm test --silent >/dev/null 2>&1 && ok "all tests pass" || { echo "tests failed: run npm test"; exit 1; }
node engine/cli.cjs daily >/dev/null && node engine/cli.cjs postcall >/dev/null && ok "demo written to outputs/demo/"
python3 analytics/rubicon_analytics.py >/dev/null && ok "analytics report in outputs/analytics/"
ok "skills available in .claude/skills/ (project-local) — open Claude Code here and type /outbound-setup"
