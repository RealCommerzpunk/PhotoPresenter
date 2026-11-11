# PhotoPresenter

Zufällige Vollbild-Foto-Diashow für Windows und Linux.

- Fotos aus einem Ordner in zufälliger Reihenfolge, möglichst bildschirmfüllend.
  Freie Ränder werden unauffällig aus dem Foto selbst aufgefüllt.
- Lebendige Bewegung: Zoom, Schwenk, Kamerafahrten (Ken Burns).
- Konfigurierbare Übergänge. Anzeigedauer, Bewegungsintensität, Überblenddauer und Effekte
  sind jeweils als Bereich „von … bis“ einstellbar, fest oder zufällig.
- **Fokus-Person**: Eine angelernte Person wird in den Fotos erkannt und angezoomt,
  optional mit einem Schwenk über die anderen Gesichter.
- **Texte**: Fülltexte zwischen den Fotos und an Fotos gebundene Texte (vor, nach oder über dem Bild),
  mit frei wählbaren oder zufälligen Stilen und Animationen.

> Status: in Entwicklung. Der Fahrplan steht unten.

## Entwicklung

Voraussetzung: Node.js ≥ 22.12.

```bash
npm install
npm run dev          # App mit Hot Reload starten
npm run dev -- --show  # direkt die Diashow starten
npm test             # Unit-Tests (Vitest)
npm run typecheck
npm run lint
```

Installer bauen (nur lokal, GitHub speichert nur den Code):

```bash
npm run dist:win     # Windows: NSIS-Installer in dist/
npm run dist:linux   # Linux: AppImage und .deb in dist/ (auf einem Linux-Rechner oder in WSL ausführen)
```

Tests, Typprüfung und Lint vor jedem Commit lokal ausführen: `npm run typecheck && npm run lint && npm test`.

> Hinweis: Ist in der Shell `ELECTRON_RUN_AS_NODE=1` gesetzt (manche Editor-Umgebungen tun das),
> startet Electron als reines Node und die App bricht mit `Cannot read properties of undefined (reading 'whenReady')` ab.
> Dann die Variable vorher entfernen.

## Aufbau

```
src/main/       Electron-Main-Prozess: Fenster, IPC, Einstellungen, Datenbank
src/preload/    sichere Brücke zwischen Main und Fenstern (window.api)
src/shared/     gemeinsamer Code (Typen, Zufalls-/Range-Logik)
src/renderer/settings/  Einstellungsfenster (React + Tailwind)
src/renderer/show/      Vollbild-Diashow (PixiJS/WebGL)
resources/      Modelle und Fonts, die mit ausgeliefert werden
```

## Fahrplan

1. ✅ Gerüst und Repo
2. Basis-Diashow: Ordner, zufällige Playlist, Auffüllen der Ränder, Ken Burns, Überblenden
3. Einstellungsfenster und Konfigurationsmodell
4. Übergangs-Bibliothek, weitere Füllmodi, Kamerafahrten
5. Texte: Editor, Stile, Animationen
6. Gesichtserkennung und Fokus-Person
7. Feinschliff und erstes Release
