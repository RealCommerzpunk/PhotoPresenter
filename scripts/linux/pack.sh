#!/usr/bin/env bash
# Packt dist/linux-unpacked zu den Linux-Archiven (läuft auf Linux, z. B. im GitHub-Workflow):
#   PhotoPresenter-<v>-linux-x64.tar.gz        Programm
#   PhotoPresenter-Demo-<v>-linux-x64.tar.gz   Programm + Photos/ + Data/ + Quickstart.pdf
# Aufruf: scripts/linux/pack.sh <version> <ausgabeordner>
set -euo pipefail
version="$1"; out="$2"
root="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$out"; out="$(cd "$out" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

for demo in 0 1; do
  name="PhotoPresenter-$([ $demo = 1 ] && echo 'Demo-')$version-linux-x64"
  dir="$work/$name"
  mkdir -p "$dir"
  cp -a "$root/dist/linux-unpacked/." "$dir/"
  install -m 755 "$root/scripts/linux/start.sh" "$dir/start.sh"
  sed "s/@VERSION@/$version/" "$root/scripts/linux/README.txt.in" > "$dir/README.txt"
  if [ $demo = 1 ]; then
    cp -a "$root/Photos" "$dir/Photos"
    mkdir "$dir/Data"
    cp "$root/Data/settings.json" "$root/Data/faces.json" "$dir/Data/"
    cp "$root/Quickstart.pdf" "$dir/"
  fi
  tar -C "$work" --owner=0 --group=0 --numeric-owner -czf "$out/$name.tar.gz" "$name"
  rm -rf "$dir"
done
(cd "$out" && sha256sum PhotoPresenter-*linux-x64.tar.gz > SHA256SUMS.txt)
ls -la "$out"
