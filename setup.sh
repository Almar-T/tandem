#!/usr/bin/env bash
# HearthHall — one-time setup for a new machine.
# Run:  bash <(curl -fsSL https://raw.githubusercontent.com/Almar-T/tandem/main/setup.sh)
# Or clone the repo first and run:  bash setup.sh

set -euo pipefail

REPO="https://github.com/Almar-T/tandem.git"
INSTALL_DIR="$HOME/hearth-hall"

echo ""
echo "  HearthHall Setup"
echo "  ─────────────────"
echo ""

# ── 1. Clone or update the repo ─────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ Repo already cloned at $INSTALL_DIR — pulling latest…"
  git -C "$INSTALL_DIR" pull --quiet
else
  echo "→ Cloning repo to $INSTALL_DIR…"
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi
echo "  ✓ Repo ready"

# ── 2. Schedule hourly git pull (keeps extension files up to date) ──────────
CRON_CMD="cd \"$INSTALL_DIR\" && git pull --quiet 2>/dev/null"
CRON_JOB="0 * * * * $CRON_CMD"

if crontab -l 2>/dev/null | grep -qF "$INSTALL_DIR"; then
  echo "→ Auto-update cron already set"
else
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  echo "  ✓ Hourly auto-update scheduled"
fi

# ── 3. Print extension install instructions ──────────────────────────────────
EXTENSION_DIR="$INSTALL_DIR/extension"
echo ""
echo "  Browser Extension"
echo "  ─────────────────"
echo "  1. Open Chrome and go to:  chrome://extensions"
echo "  2. Turn on  Developer mode  (top-right toggle)"
echo "  3. Click  Load unpacked"
echo "  4. Select this folder:"
echo ""
echo "       $EXTENSION_DIR"
echo ""
echo "  The extension auto-updates every hour — just reload it in"
echo "  chrome://extensions after the update is pulled."
echo "  (Or restart Chrome — it picks up changes on startup.)"

# ── 4. Print desktop app download link ──────────────────────────────────────
echo ""
echo "  Desktop Activity Tracker"
echo "  ─────────────────────────"
echo "  Download the latest installer from:"
echo ""
echo "       https://github.com/Almar-T/tandem/releases/latest"
echo ""
echo "  macOS: open the .dmg and drag to Applications."
echo "  The app lives in your menu bar and updates itself automatically."
echo ""
echo "  ✓ Setup complete!"
echo ""
