#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "AI-WasteTwin is starting at http://localhost:8000"
echo "Press Ctrl+C to stop the server."
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server 8000
else
  python -m http.server 8000
fi
