# PhotoPresenter

Zufällige Vollbild-Foto-Diashow für Windows und Linux (Electron + TypeScript).
Plan und Meilensteine: `docs/PLAN.md` · Änderungen je Version: `CHANGELOG.md` · Überblick für Menschen: `README.md`.

## Befehle

- `npm run dev`: App mit Hot Reload; `npm run dev -- --show` startet direkt die Show
- `npm run typecheck`, `npm run lint`, `npm test` (Vitest): vor jedem Commit alle drei
- `npm run dist:win`: Installer lokal in `dist/` (Linux-Installer nur auf Linux/WSL)
- Session abschließen: `/session-ende`

## Arbeitsregeln

- **Kein CI.** GitHub (`RealCommerzpunk/PhotoPresenter`, privat) speichert nur den Code. Keine GitHub-Actions-Workflows anlegen, Builds und Tests laufen lokal (Actions-Minuten sparen, schneller).
- **Nie den Bildschirm aufnehmen.** Zum visuellen Prüfen `PP_CAPTURE_DIR=<ordner>` setzen: Die App speichert dann im Entwicklungsmodus alle 2 s Bilder ihrer eigenen Fenster (`captureForTests` in `src/main/index.ts`). Testbilder und Aufnahmen gehören ins Scratchpad, nicht ins Repo.
- Test-Einstellungen nach dem Test wieder löschen: `%APPDATA%/PhotoPresenter/settings.json`, damit der Nutzer mit seinem eigenen Ordner startet.
- In der Claude-Code-Umgebung ist `ELECTRON_RUN_AS_NODE=1` gesetzt: vor dem Start von Electron `unset ELECTRON_RUN_AS_NODE`, sonst startet es als reines Node.
- Oberfläche, Kommentare, Commit-Nachrichten und Doku auf Deutsch.
- Versionen: `0.<meilenstein>.<patch>` in `package.json`, jeder Meilenstein ein Eintrag in `CHANGELOG.md`.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Architektur

- `src/main/`: Fenster, IPC, Einstellungen (`settings.ts`, JSON in userData, atomar geschrieben), Fotoliste und `photo://`-Protokoll (`photos.ts`, liefert nur Dateien aus dem gewählten Ordner, CORS freigegeben)
- `src/preload/`: `window.api` (Typ `PhotoPresenterApi` in `src/shared/ipc.ts`)
- `src/shared/`: `random.ts` (Range „von … bis“ + Zufall, gewichtete Auswahl, `seededRng`), `settings.ts` (zod-Schema; jedes Feld hat Standardwert und fällt bei ungültigem Inhalt darauf zurück)
- `src/renderer/settings/`: React + Tailwind v4; Bausteine `RangeInput`, `WeightedList`, `Card`, `Field` in `controls.tsx`
- `src/renderer/show/`: PixiJS v8
  - `loader.ts`: Laden mit EXIF-Drehung, Verkleinern auf Bildschirm × 1,35, weiche Kanten, Randfüllung (blur/ambient/mirror; mirror liegt deckungsgleich unter dem Foto)
  - `motion.ts`: reine Bewegungsmathematik (`fitImage`, `planShot`, `evaluateShot`); Versatz wird immer an den Bildrand begrenzt
  - `slide.ts`: ein Foto mit Bewegung über Einblenden + Stehen + Ausblenden
  - `transitions/`: `engine.ts` rendert altes und neues Foto je Frame in RenderTextures und mischt per Mesh-Shader; `shaders.ts` enthält die Effekte (`vec4 transition(vec2 uv)` mit `fromColor`/`toColor`). Neuer Effekt = Eintrag in `TRANSITIONS` (`settings.ts`) + GLSL-Body
  - `playlist.ts`: Zufall ohne Wiederholung, Verlauf für ←
  - `main.ts`: Ablauf, Vorladen, Tasten

## Stolperfallen

- Die Fenster laufen mit `sandbox: true`: Der Preload muss CommonJS sein, deshalb kein `"type": "module"` in `package.json` (ESLint-Konfiguration ist `.mjs`).
- `import 'pixi.js/unsafe-eval'` muss vor PixiJS geladen werden, weil die CSP kein eval erlaubt.
- Neue Datenquellen in der Show brauchen einen Eintrag in der CSP beider `index.html`.
- Neue Auswahl-Optionen (Effekte, Bewegungsarten, Füllmodi) nur hinten an die Konstanten in `settings.ts` anhängen; `parseSettings` ergänzt sie in gespeicherten Einstellungen. Ein entfernter Eintrag setzt die ganze Liste auf Standard zurück.
- npm 11 blockiert Install-Skripte; Freigaben stehen in `allowScripts` in `package.json`. Electron lädt seine Binärdatei beim ersten Start selbst.
