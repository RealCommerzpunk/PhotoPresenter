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

1. ✅ **Gerüst & Repo**: electron-vite-Projekt, ESLint/Prettier, `git init`, privates GitHub-Repo `PhotoPresenter` per `gh repo create`, README.
2. ✅ **Basis-Diashow**: Ordner wählen, Index (ohne Gesichter), zufällige Playlist, PixiJS-Bühne, Contain + Blur-Backdrop, Crossfade, Ken Burns mit Ranges.
3. ✅ **Settings-UI & Konfig-Modell**: zod-Schema, Range-/Gewichtungs-Controls, Live-Vorschau-Fenster, Persistenz.
4. ✅ **Übergangs-Bibliothek & weitere Füllmodi**: 10+ Shader-Übergänge, Ambient-/Edge-Fill, Kamerafahrten.
5. ✅ **Texte**: Datenmodell, Editor, Stil-Presets, GSAP-Animationen, Fülltexte, Bildtexte vor/nach/über.
6. ✅ **Gesichtserkennung**: Indexer-Prozess, YuNet+SFace, Personen-Anlernen-UI, Matching, Fokus-Modi, Schwenk über andere Gesichter.
7. **Feinschliff & Release**: Performance (Vorladen/Decoding im Worker, Texturspeicher freigeben), Installer, erster Release `v0.1.0`.
   - ✅ erledigt (0.6.2): Bildvorbereitung im Worker, Vorladen nach dem Übergang, Texturen in Streifen vorab hochladen, Effekte vorkompilieren, Zucken vor dem Übergang behoben.
   - offen: `npm audit` (mittlere Warnungen, nur Entwicklungswerkzeuge), Test auf 4K und mit großen echten Fotos, Installer auf Linux testen, Fernbedienung mit echtem iPhone über Hotspot testen (Windows-Firewall „öffentliche Netzwerke“), Release `v0.1.0`.
   - ✅ erledigt in 0.11.1: Bildschirm- und Bereichsauswahl in den Einstellungen (Nutzerwunsch), weil Windows zeitweise zusammengeschaltete Monitore als einen Bildschirm (5760 × 1134) meldet.
   - ~~Entscheidung ausstehend~~ erledigt in 0.7.0 durch Fokus-Partner: „Fokus in der Show“ gilt nur für die eine ★-Fokus-Person, was in der Oberfläche missverständlich wirkt. Vorgeschlagen: (1) nur klarer beschriften („gilt für ★ Name“) oder (2) mehrere hervorgehobene Personen mit eigenen Einstellungen (Schwelle, Kamerabewegung, Häufigkeit), Kamera fährt bei Gruppenfotos beide an.

Jeder Meilenstein ergibt eine lauffähige Version und einen eigenen Commit/PR.

## Verifikation

- `npm run dev`: Show mit einem Testordner (gemischt Hoch-/Querformat, Panorama, EXIF-rotierte Handyfotos) starten, Füllung, Bewegung und Übergänge visuell prüfen, FPS-Overlay (Debug-Taste) sollte konstant ~60 zeigen.
- Unit-Tests (Vitest): `random.ts` (Ranges, Gewichtung), ShotPlanner (Ausschnitt bleibt im Bild, Face-Zielzoom), Playlist (keine Wiederholung, Fülltext-Frequenz), Settings-Schema-Migration.
- Gesichtserkennung: Testset mit 3–5 bekannten Personen, Treffer- und Fehlerquote bei Standard-Schwelle protokollieren.
- Installer lokal bauen und manuell auf Windows 11 und einem Linux (z. B. Ubuntu/Mint) testen.

## Erweiterungen (Session 002)

- ✅ Fernbedienung per Handy mit QR-Code (Taste Q in der Show)
- ✅ Fokus-Partner mit „Gemeinsam fokussieren“ (beantwortet die offene Frage zur Fokus-Karte: Überschrift zeigt jetzt, für wen sie gilt)
- ✅ Zoomgrenze nach Original- und Bildschirmauflösung
- ✅ Relativer Fotopfad, portable Windows-Version
- ✅ 0.10.0: Wackelpudding-Würfel, eine Formation je Zwischenspiel, kleine Fotos begrenzen, gezielte Auslöser und Sofort-Texte auf der Fernbedienung
- ✅ 0.11.1: Bildschirm- und Bereichsauswahl
- ✅ 0.13.0: Oberfläche in Deutsch/Englisch/Spanisch/Französisch, Dublettenprüfung (pHash, beste Fassung, Überspringen, Aufräumen), schlankeres Programm (app.asar 32 MB), Linux-Pakete per manuellem GitHub-Workflow
- ✅ 0.12.5: Fingerabdruck im Gesichtsindex, Demo als Download-Release
- ✅ 0.12.4: Produktseite (docs/index.html), Fokus-Partner mit neutralem Symbol
- ✅ 0.12.3: Demo-Fotos, MIT-Lizenz, englische README – Vorbereitung auf öffentliches Repo
- ✅ 0.12.2: Programm-Icon, Schnellstart-Anleitung (Markdown + PDF im Paket)
- ✅ 0.12.1: Texte und Emojis weichen Gesichtern aus
- ✅ 0.12.0: Mitnehmen (portabler Datenordner `Data`, Gesichtsindex mit relativen Pfaden, Weitergabe-Paket), Texte „nur auf Abruf“, kompakte Fernbedienung mit Reitern, Eintauchen der 3D-Welt endet in der echten Größe des Fotos
- ✅ 0.11.0: Rückmeldung auf der Fernbedienung, Emojis, Foto einfrieren (Bewegung in Schleife), Galerie mit eigener Reihenfolge, Info-Tafel (Taste I, EXIF), Fernbedienung als Fenster (Taste R); per Hand Ausgelöstes endet beim nächsten Übergang; ruhiger Start nach der 3D-Welt
- ✅ 3D-Fotowelt (0.9.0): Zwischenspiel mit Three.js, 9 Formationen (Klassiker aus dem Periodic-Table-Beispiel plus Rahmen, Würfel, Karussell, Tunnel, Welle), Eintauchen in ein Foto
- ✅ Effekte (0.8.0): 8 Partikel-Effekte mit PixiJS und 5 animierte Textfolien-Hintergründe als Shader (statt Vanta.js: kein zweiter WebGL-Kontext, läuft durch die Übergänge), einstellbar nach Häufigkeit, Dauer und Intensität

## Abweichungen vom ursprünglichen Plan

- **Gesichtserkennung mit onnxruntime-web (WebAssembly) statt onnxruntime-node**, in einem unsichtbaren Analyse-Fenster: keine nativen Module, Windows und Linux identisch, Fotos werden genau wie in der Show dekodiert (EXIF-Drehung), daher passen die Gesichtspositionen garantiert.
- **Gesichtsindex als JSON-Datei** (`faces.json` im Benutzerordner) statt SQLite: reicht für < 5.000 Fotos, kein natives Modul. sharp und better-sqlite3 werden nicht gebraucht.
- Modelle liegen nicht im Git-Repo (SFace ≈ 39 MB), sondern werden per `npm run models` geladen und mit dem Installer ausgeliefert.
- Zusätzlich zum Plan: Gegenbeispiele („ist nicht diese Person“) und Gesichter von Hand markieren (seit 0.6.1).

## Offene Punkte für später (nicht im ersten Wurf)

- ✅ (0.13.0: de/en/es/fr, Community-Anleitung `TRANSLATING.md`; offen: Produktseite und Quickstart mehrsprachig) **Internationalisierung (Nutzerwunsch 2026-11-12):** Die App soll übersetzbar sein, vor allem die Oberfläche (Einstellungen, Fernbedienung, Show-Meldungen). Entwickelt und dokumentiert wird weiter vornehmlich auf Deutsch, übersetzt wird später. Grundsprache für Einstellungen und Technisches ist Englisch (Ordner-, Datei- und Schlüsselnamen, z. B. `Data\`, `Photos\`, `README.txt`). Vorgehen später: Texte aus dem Code in Sprachdateien (Schlüssel englisch), Sprache wählbar, Fallback Deutsch/Englisch.
- ✅ (0.13.0, erster Schritt) **Dublettenprüfung (Nutzerwunsch 2026-11-12):** Doppelte Fotos im Ordner erkennen (auch umbenannt, verkleinert oder neu gespeichert, z. B. per Wahrnehmungs-Hash) und in der Show nur einmal zeigen; in den Einstellungen anzeigen, welche Fotos doppelt sind.
- **Mehrsprachige Doku** (Quickstart, Produktseite `docs/index.html`, evtl. Changelog) in en/es/fr; Muttersprachler-Gegenlesung von es/fr.
- **Linux auf echter Hardware testen** (AppImage unter Ubuntu 24.04 braucht evtl. `--no-sandbox`; `desktopName` setzen); Dublettenprüfung: ähnliche, aber nicht identische Fotos (Serienbilder) optional gruppieren.
- Weitere: HEIC/RAW-Support, Videos in der Show, Hintergrundmusik, mehrere Fokus-Personen, Erkennung kleiner Gesichter in großen Gruppenfotos (Kacheln statt eines 640er-Durchgangs), Texte über Fotos neben statt unter Gesichter setzen.
