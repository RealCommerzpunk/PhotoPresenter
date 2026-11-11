# PhotoPresenter – Plan

## Context

Neues Programm (leeres Verzeichnis `c:\service.hunda\PhotoPresenter`), verwaltet auf GitHub.
Kern: zufällige Vollbild-Diashow aus einem Fotoordner, die Bilder bewegen sich (Ken Burns: Zoom, Schwenk, Kamerafahrt),
die Übergänge sind konfigurierbar, ungefüllte Ränder werden unauffällig aus dem Foto selbst aufgefüllt.
Dazu kommen zwei Features: **Fokus-Person** (Gesichtserkennung, die Kamera fährt auf das Gesicht zu) und **Texte** (Fülltexte und an Fotos gebundene Texte mit kreativen Stilen und Animationen).

Festgelegt: Electron + TypeScript · normaler PC/Mini-PC (x86, iGPU reicht) · eigenes Einstellungsfenster · < 5.000 Fotos, lokal.

## Tech-Stack

| Bereich           | Wahl                                                                                                                                                         | Warum                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App-Gerüst        | Electron + **electron-vite** + TypeScript                                                                                                                    | Windows und Linux aus einer Codebasis                                                                                                                                            |
| Settings-UI       | React + Tailwind (wie Fluxly)                                                                                                                                | bekanntes Setup                                                                                                                                                                  |
| Rendering Diashow | **PixiJS v8** (WebGL2) + eigene GLSL-Filter                                                                                                                  | flüssige 60 fps, 4K, Shader für Blur und Übergänge                                                                                                                               |
| Übergänge         | Shader nach dem Vorbild von **gl-transitions** (MIT)                                                                                                         | dutzende fertige Effekte (Fade, Wipe, Zoom-Blur, Morph, Cube …)                                                                                                                  |
| Textanimation     | HTML/CSS-Overlay über dem Canvas + **GSAP** (inkl. SplitText, inzwischen kostenlos)                                                                          | maximale Gestaltungsfreiheit bei Text                                                                                                                                            |
| Gesichtserkennung | **onnxruntime-node** im Electron-`utilityProcess`; Modelle **YuNet** (Erkennung) + **SFace** (Wiedererkennung), beide aus dem OpenCV Model Zoo, freie Lizenz | läuft offline auf der CPU und blockiert die UI nicht. InsightFace wäre genauer, die Modelle sind aber nur für nicht-kommerzielle Nutzung freigegeben (als Option später möglich) |
| Bildvorbereitung  | **sharp** (Thumbnails, EXIF-Rotation, Downscale fürs Face-Scanning)                                                                                          | schnell, plattformübergreifend                                                                                                                                                   |
| Datenhaltung      | **better-sqlite3** (Foto-Index, Gesichter, Embeddings, Texte) + JSON-Settings mit **zod**-Schema                                                             | robust, inkrementell                                                                                                                                                             |
| Packaging         | **electron-builder**: NSIS (Windows), AppImage + .deb (Linux)                                                                                                |                                                                                                                                                                                  |
| Builds            | lokal per `npm run dist:win` / `dist:linux`, kein CI (GitHub nur für den Code)                                                                               |                                                                                                                                                                                  |

## Architektur

```
main process ── Fenster-Management, IPC, Settings, SQLite, File-Watcher (chokidar)
 ├─ utilityProcess "indexer" ── scannt Ordner, EXIF, Thumbnails, YuNet+SFace → Gesichter/Embeddings in DB
 ├─ Renderer "settings" (React) ── Konfiguration, Personen anlernen, Texteditor mit Live-Vorschau
 └─ Renderer "show" (Vollbild, je Monitor) ── PixiJS-Bühne + Text-Overlay
      ├─ Playlist/Scheduler   (Zufall ohne Wiederholung, Fülltexte einstreuen)
      ├─ ShotPlanner          (berechnet Kamerapfad pro Bild: Ken Burns / Face-Fokus)
      ├─ BackgroundFill       (Füllung für ungefüllte Ränder)
      ├─ TransitionEngine     (Shader-Übergänge zwischen 2 Render-Texturen)
      └─ TextLayer            (Stil-Presets + GSAP-Timelines)
```

### Projektstruktur

```
src/main/        index.ts, ipc.ts, db.ts, settings.ts, watcher.ts
src/indexer/     indexer.ts, faces.ts (YuNet/SFace), exif.ts
src/shared/      types.ts, settingsSchema.ts (zod), random.ts (Range→Wert)
src/renderer/settings/   React-App (Seiten: Allgemein, Bewegung, Übergänge, Personen, Texte, Stile)
src/renderer/show/       stage.ts, playlist.ts, shotPlanner.ts, backgroundFill.ts,
                         transitions/ (*.glsl + registry.ts), text/ (presets/, textLayer.ts)
resources/models/        yunet.onnx, sface.onnx
resources/fonts/         gebündelte Fonts (OFL) für Textstile

```

## Kernfunktionen im Detail

### 1. Konfigurationsmodell „von … bis + Zufall“

Jeder Parameter ist eine `Range { min, max, mode: 'fixed' | 'random' }`. Bei Effekten ist es eine gewichtete Auswahlliste `{ id, enabled, weight }[]`.
Betroffen sind unter anderem: Anzeigedauer, Bewegungsintensität (Zoomfaktor, Schwenkweg), Bewegungsart (Zoom-in/out, Pan, Kamerafahrt), Easing, Überblenddauer, Übergangseffekt, Hintergrundfüllung, Textstil, Textanimation und Fokus-Modus.
Ein zentrales `pick(range)` in `src/shared/random.ts`, optional mit Seed zum Reproduzieren.

### 2. Vollbild und Auffüllen der Ränder

- Standard: Das Bild wird eingepasst (contain), die Bewegung darf es leicht vergrößern. Optional „Cover bis X % Beschnitt“: Bei geringem Unterschied im Seitenverhältnis wird beschnitten statt aufgefüllt.
- Füllmodi (auch zufällig wählbar):
  - **Blur-Backdrop**: dasselbe Foto, stark vergrößert, mit Gaußschem Weichzeichner, leicht abgedunkelt und entsättigt. Es bewegt sich langsam gegenläufig mit, das wirkt edel.
  - **Ambient-Verlauf**: Verlauf aus den dominanten Randfarben.
  - **Edge-Stretch + Blur**: Die Randpixel werden gespiegelt bzw. gestreckt und weichgezeichnet.
- Ein weicher Übergang (Feather-Maske) zwischen Foto und Füllung, damit keine harte Kante entsteht.

### 3. Bewegung (ShotPlanner)

Pro Bild wird ein Kamerapfad aus Keyframes `{ center, zoom, t }` berechnet und mit Easing interpoliert (Bezier für Kamerafahrten).
Nebenbedingung: Der Ausschnitt verlässt nie das Bild, bzw. nur so weit, wie die Füllung es kaschiert. Bei Hochformat-Bildern schwenkt die Kamera bevorzugt vertikal.

### 4. Fokus-Person

- **Anlernen** (Settings → Personen): Fotos auswählen. Der Indexer schlägt erkannte Gesichter vor, der Nutzer klickt das richtige an oder zieht manuell einen Rahmen. Aus mehreren Gesichtern wird ein Embedding-Set gebildet (Mittelwert plus alle Einzelvektoren).
- **Indexierung**: Alle Fotos werden einmalig im Hintergrund gescannt (bei < 5.000 Fotos einige Minuten), danach inkrementell über den Watcher. Gespeichert werden Gesichts-Boxen, Landmarks und Embeddings pro Foto. Treffer per Kosinus-Ähnlichkeit, die Schwelle ist konfigurierbar.
- **In der Show**: Wird die Person in einem Foto erkannt, wählt der ShotPlanner einen Fokus-Modus (konfigurierbar oder zufällig):
  - langsames Anzoomen · schnelles Anzoomen · Kamerafahrt (Bezier-Pfad zum Gesicht)
  - optional ein Schwenk über die anderen erkannten Gesichter **vorher** (Personen abfahren, dann auf die Fokus-Person) oder **nachher** (vom Fokus aus wegschwenken)
  - Zielzoom, sodass das Gesicht x % der Bildhöhe einnimmt (Range)
- Option „Fotos mit Fokus-Person bevorzugen“ (Gewichtung in der Playlist).

### 5. Texte

- **Textverwaltung**: beliebige Texte (Mehrzeiler, einfache Formatierung). Typen:
  - _Fülltext_: erscheint statt eines Fotos. Häufigkeit konfigurierbar (z. B. alle 8–15 Bilder, zufällig).
  - _Bildtext_: an ein oder mehrere Fotos gebunden, Einblendung **vor**, **nach** oder **über** dem Bild. Bei „über“ gibt es eine Position (frei/auto) und die Option „Gesichter nicht verdecken“, die die Face-Boxen nutzt.
- **Stile**: Presets als JSON (Font, Größe, Farben, Schatten/Glow, Hintergrund wie Glas/Band/Vollfarbe/Blur des aktuellen Fotos, Ausrichtung) plus Animation in/halten/out (Typewriter, Buchstaben einblenden, Wort-für-Wort hochfliegen, Glitch, Handschrift-Reveal, Zoom-Blur, Kinetic Typography …). Dazu kommt ein Stil-Editor mit Live-Vorschau. Pro Text ein fester Stil oder „Zufall aus Auswahl“.
- Rund 10–15 vorgefertigte Stile zum Start.

### 6. Übergänge

Die TransitionEngine rendert das alte und das neue Bild (inklusive laufender Bewegung) in je eine RenderTexture und mischt sie per Shader. Die Effektliste ist gewichtet und zufällig, die Dauer eine Range. Text-Folien nutzen dieselbe Engine.

### 7. Bedienung in der Show

Tastatur/Maus: Esc beendet, Leertaste pausiert, ←/→ springt, I zeigt Info (Dateiname, Datum, erkannte Person). Der Mauszeiger wird ausgeblendet, Energiesparmodus und Bildschirmschoner werden unterdrückt (`powerSaveBlocker`). Optional Autostart der Show beim Programmstart und Multi-Monitor (gleiche oder getrennte Shows).

## Umsetzung in Meilensteinen

1. **Gerüst & Repo**: electron-vite-Projekt, ESLint/Prettier, `git init`, privates GitHub-Repo `PhotoPresenter` per `gh repo create`, README.
2. **Basis-Diashow**: Ordner wählen, Index (ohne Gesichter), zufällige Playlist, PixiJS-Bühne, Contain + Blur-Backdrop, Crossfade, Ken Burns mit Ranges.
3. **Settings-UI & Konfig-Modell**: zod-Schema, Range-/Gewichtungs-Controls, Live-Vorschau-Fenster, Persistenz.
4. **Übergangs-Bibliothek & weitere Füllmodi**: 10+ Shader-Übergänge, Ambient-/Edge-Fill, Kamerafahrten.
5. **Texte**: Datenmodell, Editor, Stil-Presets, GSAP-Animationen, Fülltexte, Bildtexte vor/nach/über.
6. **Gesichtserkennung**: Indexer-Prozess, YuNet+SFace, Personen-Anlernen-UI, Matching, Fokus-Modi, Schwenk über andere Gesichter.
7. **Feinschliff & Release**: Performance (Vorladen/Decoding im Worker, Texturspeicher freigeben), Installer, erster Release `v0.1.0`.

Jeder Meilenstein ergibt eine lauffähige Version und einen eigenen Commit/PR.

## Verifikation

- `npm run dev`: Show mit einem Testordner (gemischt Hoch-/Querformat, Panorama, EXIF-rotierte Handyfotos) starten, Füllung, Bewegung und Übergänge visuell prüfen, FPS-Overlay (Debug-Taste) sollte konstant ~60 zeigen.
- Unit-Tests (Vitest): `random.ts` (Ranges, Gewichtung), ShotPlanner (Ausschnitt bleibt im Bild, Face-Zielzoom), Playlist (keine Wiederholung, Fülltext-Frequenz), Settings-Schema-Migration.
- Gesichtserkennung: Testset mit 3–5 bekannten Personen, Treffer- und Fehlerquote bei Standard-Schwelle protokollieren.
- Installer lokal bauen und manuell auf Windows 11 und einem Linux (z. B. Ubuntu/Mint) testen.

## Offene Punkte für später (nicht im ersten Wurf)

HEIC/RAW-Support, Videos in der Show, Hintergrundmusik, Web-Fernbedienung, mehrere Fokus-Personen.
