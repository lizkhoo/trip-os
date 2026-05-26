#!/usr/bin/env bash
# PII grep gate. Fails (exit 1) if any known real PII token from the private fixture
# appears in committed files.
#
# This script reads its pattern list from .pii-tokens (one regex-safe token per line, blank lines
# and lines starting with '#' ignored). The tokens file is itself git-ignored so the patterns
# never travel with the repo. To regenerate locally:
#
#   cat > .pii-tokens <<'EOF'
#   DYCDRC
#   QTBROV
#   ...real tokens you want gated against...
#   EOF
#
# In CI, the workflow writes .pii-tokens from a GitHub secret (PII_TOKENS) before invoking this.

set -euo pipefail

TOKENS_FILE="${1:-.pii-tokens}"

if [[ ! -f "$TOKENS_FILE" ]]; then
  echo "[pii-gate] no $TOKENS_FILE present — skipping gate." >&2
  exit 0
fi

# Build alternation from non-empty, non-comment lines.
PATTERN="$(grep -vE '^\s*(#|$)' "$TOKENS_FILE" | paste -sd '|' -)"

if [[ -z "$PATTERN" ]]; then
  echo "[pii-gate] tokens file is empty — skipping gate." >&2
  exit 0
fi

# Exclude the tokens file itself and this script.
if git grep -nE "$PATTERN" -- ':(exclude).pii-tokens' ':(exclude)scripts/pii-gate.sh'; then
  echo "[pii-gate] PII tokens found in tracked files." >&2
  exit 1
fi

echo "[pii-gate] no PII tokens leaked."
