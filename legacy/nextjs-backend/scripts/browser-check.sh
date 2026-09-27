#!/bin/bash
# Browser E2E check: visit every view, look for client errors and empty mains.
VIEWS="landing coverage portal voice ussd intake-chat udc-intake helpline dlao applications case triage duplicates incident-groups document-agent lawyer-change jurisdiction mediation settlement signatures lawyer-worklist referrals reports audit offline-sync pwa-info"
BASE="http://localhost:3000"
for v in $VIEWS; do
  if [ "$v" = "case" ]; then url="$BASE/?view=case&id=CASE-2026-0001"; else url="$BASE/?view=$v"; fi
  agent-browser open "$url" > /dev/null 2>&1
  agent-browser wait --load networkidle > /dev/null 2>&1
  sleep 0.8
  text=$(agent-browser eval "document.querySelector('main')?.innerText?.length ?? 0" 2>/dev/null | tr -d '"')
  err=$(agent-browser errors 2>/dev/null)
  if echo "$err" | grep -q "Application error\|page error"; then
    echo "✗ $v — CLIENT ERROR"
  elif [ "$text" = "0" ] || [ -z "$text" ]; then
    echo "✗ $v — EMPTY"
  else
    echo "✓ $v (${text} chars)"
  fi
done
