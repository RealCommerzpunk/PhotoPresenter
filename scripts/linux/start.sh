#!/bin/sh
# Startet PhotoPresenter aus diesem Ordner. / Starts PhotoPresenter from this folder.
cd "$(dirname "$0")" || exit 1
EXTRA=""
# Ohne eingerichtete SUID-Sandbox (Normalfall bei entpackten Archiven) ohne Chromium-Sandbox starten.
if [ ! -u ./chrome-sandbox ] || [ "$(stat -c %U ./chrome-sandbox 2>/dev/null)" != "root" ]; then
  EXTRA="--no-sandbox"
fi
exec ./photopresenter $EXTRA "$@"
