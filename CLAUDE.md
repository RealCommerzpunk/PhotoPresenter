# PhotoPresenter

Zufällige Vollbild-Foto-Diashow für Windows und Linux (Electron + TypeScript).
Plan und Meilensteine: `docs/PLAN.md` · Änderungen je Version: `CHANGELOG.md` · Sitzungsprotokolle: `docs/sessions/Session-NNN.md` · Überblick für Menschen: `README.md` (Englisch, Haupt-README auf GitHub) und `README.de.md` (Deutsch) – beide inhaltlich gleich halten.

## Befehle

- `npm run demo`: App mit dem Demo-Datenordner `Data/` des Repos (Einstellungen + Gesichtsindex des Demo-Sets, nur `settings.json`/`faces.json` sind im Git). Das Demo-Set pflegt der Nutzer: in Tests nie `Data/` benutzen, sondern eine Kopie im Scratchpad per `PP_USER_DATA`
- `npm run dev`: App mit Hot Reload; `npm run dev -- --show` startet direkt die Show
- `npm run typecheck`, `npm run lint`, `npm test` (Vitest): vor jedem Commit alle drei
- `npm run models`: Modelle für die Gesichtserkennung nach `resources/models/` (nicht im Git, Prüfsummen im Skript); `dist` ruft das selbst auf
- `npm run quickstart`: `Quickstart.pdf` aus `Quickstart.md` neu erzeugen (nach jeder Änderung der Anleitung; die PDF kommt per `extraResources` ins Programm und ins Weitergabe-Paket)
- Icon: `build/icon.png`/`icon.ico` (electron-builder), `resources/icon.png` (Fenster per `iconPath()`, Fernbedienung `/icon.png`); Nennung „Three Musketeers – Flaticon“ muss erhalten bleiben
- `npm run dist:win`: Installer lokal in `dist/` (Linux-Installer nur auf Linux/WSL)
- Session abschließen: `/session-ende`

## Arbeitsregeln

- **Kein CI.** GitHub (`RealCommerzpunk/PhotoPresenter`, privat) speichert nur den Code. Keine GitHub-Actions-Workflows anlegen, Builds und Tests laufen lokal (Actions-Minuten sparen, schneller).
- **Nie den Bildschirm aufnehmen.** Zum visuellen Prüfen `PP_CAPTURE_DIR=<ordner>` setzen: Die App speichert dann im Entwicklungsmodus alle 2 s Bilder ihrer eigenen Fenster (`captureForTests` in `src/main/index.ts`). Testbilder und Aufnahmen gehören ins Scratchpad, nicht ins Repo.
- **Nie im echten Datenordner testen** (`%APPDATA%/PhotoPresenter`: Einstellungen, Personen, Gesichtsindex des Nutzers). Für jeden Testlauf `PP_USER_DATA=<scratchpad>/userdata` setzen (nur Entwicklung) und Testeinstellungen nur dort ablegen. Das gepackte Programm nutzt immer den echten Ordner.
- Demo-Fotos: `Photos/` (163 Pexels-Fotos von RDNE Stock project, auf 2560 px verkleinert, Nachweis in `Photos/CREDITS.md`, nicht MIT). Originale liegen in `Photos-Original/` (gitignored). Ohne `settings.json` nimmt der erste Start den Ordner `Photos` neben dem Programm (`firstStartSettings` in `src/main/settings.ts`). Code steht unter MIT (`LICENSE`); neue Fremdinhalte (Bilder, Schriften, Modelle) in README/README.de.md unter „Credits“ nennen.
- In der Claude-Code-Umgebung ist `ELECTRON_RUN_AS_NODE=1` gesetzt: vor dem Start von Electron `unset ELECTRON_RUN_AS_NODE`, sonst startet es als reines Node.
- Oberfläche, Kommentare, Commit-Nachrichten und Doku auf Deutsch.
- Versionen: `0.<meilenstein>.<patch>` in `package.json`, jeder Meilenstein ein Eintrag in `CHANGELOG.md`.
- Technische Namen (Ordner, Dateien, Schlüssel) auf Englisch (`Data`, `Photos`), Oberfläche und Doku vorerst auf Deutsch; Internationalisierung steht im Backlog (`docs/PLAN.md`).
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Architektur

- `src/main/remote.ts`: Fernbedienung. Logik in `RemoteServer.fetch` (Request → Response), der Node-Server reicht nur durch; das R-Fenster nutzt dieselbe Logik ohne Netzwerk (Sitzung `fernbedienung` mit `protocol.handle('http')`, Adresse `http://fernbedienung.local/`). Routen: `/` (`remote.html` per `?raw`), `/api/state`, `/api/settings` (nur `REMOTE_KEYS`), `/api/show` (`{cmd, arg}`), `/api/events` (SSE; Ereignis `notice` für Hinweise), `/api/photos`, `/api/thumb?n=`, `/api/queue`. Show meldet Zustand per `reportShowStatus` und Rückmeldungen per `notice`.
- `src/main/queue.ts`: manuelle Reihenfolge aus der Galerie (`QueueStore`, getestet); der laufende Eintrag (`playing`) steht vorn und fällt beim Weiterschalten heraus. Die Show bekommt die Liste per `IPC.queueChanged`, bevorzugt sie in `nextEntry()` und meldet per `queuePlaying`, was zu sehen ist; ändert sich die Liste, wird das vorbereitete Foto verworfen (ein normales wandert per `insertNext` hinter die Liste).
- `src/main/portable.ts`: Datenordner festlegen (`setupDataLocation`, vor `whenReady`): portable .exe/AppImage → `Data` neben der Datei (erster Start übernimmt `settings.json`/`faces.json` aus dem Benutzerordner), installiert nur wenn `Data` existiert; Chromium-Caches bleiben per `sessionData` im Benutzerordner. `exportPackage.ts`: Weitergabe-Paket (Programm, `Photos`, `Data`, `README.txt`). `faceIndexFile.ts`: Index-Datei Version 2 mit Pfaden relativ zum Fotoordner, `sameFile` mit 2 s Toleranz.
- `src/main/thumbs.ts`: Vorschaubilder der Galerie; das Analyse-Fenster rechnet sie (`thumbRequest`), Cache in `userData/thumbs`. `src/main/photoInfo.ts`: EXIF per exifr für die Info-Tafel.
- `src/main/paths.ts` + `programDir()`/`photoFolder()` in `settings.ts`: Fotoordner immer über `photoFolder()` auflösen, nie `settings.photoFolder` direkt benutzen (kann relativ sein).
- `src/main/faces.ts`: `FaceStore` – Gesichtsindex `faces.json` (Schlüssel: absoluter Pfad), Warteschlange fürs Analyse-Fenster, Abgleich mit der Fokus-Person, Beispielgesichter
- `src/renderer/indexer/`: unsichtbares Analyse-Fenster mit onnxruntime-web (WASM, ein Thread): YuNet 640×640 BGR → `decodeYunet`, Ausrichtung per `similarityTransform` auf die ArcFace-Vorlage, SFace 112×112 RGB → 128er-Vektor
- `src/shared/faces.ts`: reine Gesichts-Mathematik und Typen (getestet)
- `src/main/`: Fenster, IPC, Einstellungen (`settings.ts`, JSON in userData, atomar geschrieben), Fotoliste und `photo://`-Protokoll (`photos.ts`, liefert nur Dateien aus dem gewählten Ordner, CORS freigegeben)
- `src/preload/`: `window.api` (Typ `PhotoPresenterApi` in `src/shared/ipc.ts`)
- `src/shared/`: `random.ts` (Range „von … bis“ + Zufall, gewichtete Auswahl, `seededRng`), `settings.ts` (zod-Schema; jedes Feld hat Standardwert und fällt bei ungültigem Inhalt darauf zurück)
- `src/renderer/settings/`: React + Tailwind v4; Bausteine `RangeInput`, `WeightedList`, `Select`, `Card`, `Field` in `controls.tsx`; Seiten `TextsPage`, `StylesPage`; `TextPreview` spielt Texte live ab
- `src/renderer/text/`: von Show und Einstellungen gemeinsam genutzt: `overlay.ts` (HTML-Text mit GSAP SplitText), `animations.ts`, `fonts.ts` (Fontsource-Imports), `resolve.ts` (Stil inkl. Zufall)
- `src/shared/text.ts`: Schemas für Texte und Stile, die 12 Stilvorlagen, Schriften, Animationsnamen
- `src/renderer/show/`: PixiJS v8
  - `loader.ts` (Haupt-Thread) schickt Aufträge an `loader.worker.ts`; die Bildarbeit steht in `imageprep.ts`: Laden mit EXIF-Drehung, Verkleinern auf Bildschirm × 1,35, weiche Kanten, Randfüllung (blur/ambient/mirror; mirror liegt deckungsgleich unter dem Foto). Das Foto kommt in Streifen à 320 Zeilen (2 px Überlappung) zurück; `main.ts` lädt sie einzeln pro Frame hoch (`uploadGradually`), `Slide` setzt sie zusammen
  - `motion.ts`: reine Bewegungsmathematik (`fitImage`, `planShot`, `planFocusShot`, `evaluateShot`); Pfade mit Stationen (`path`) für Schwenks über Gesichter; Versatz wird immer an den Bildrand begrenzt
  - `slide.ts`: ein Foto mit Bewegung über Einblenden + Stehen + Ausblenden
  - `transitions/`: `engine.ts` rendert altes und neues Foto je Frame in RenderTextures und mischt per Mesh-Shader; `shaders.ts` enthält die Effekte (`vec4 transition(vec2 uv)` mit `fromColor`/`toColor`). Neuer Effekt = Eintrag in `TRANSITIONS` (`settings.ts`) + GLSL-Body
  - `effects/particles.ts`: `EffectLayer`/`ParticleEffect` (PixiJS `ParticleContainer`, eine gemeinsame Formen-Textur, Effekte als `SPECS`); Ebene liegt über `transitions.view`. `effects/backgrounds.ts`: `AnimatedBackground` (Mesh-Shader) für Textfolien, Farben per `colorsFrom` aus dem Foto
  - `world/`: 3D-Zwischenspiel. `formations.ts` (reine Rechnung, getestet: Position + Blickpunkt je Kachel, Kamerastil je Formation), `worldScene.ts` (`WorldScene` als `Scene`; Three.js zeichnet in ein eigenes Canvas, das jeden Frame als Pixi-Textur übernommen wird → läuft durch die Übergänge; Three wird per dynamischem Import nachgeladen; ein gemeinsamer Renderer für alle Zwischenspiele), `thumbPool.ts` (Vorschaubilder 4:3 aus dem Worker, nur in ruhigen Phasen). In der Show: `nextEntry()` schiebt `{ kind: 'world' }` ein, `sequencer.insertNext(final)` setzt danach mit dem Zielfoto fort
  - `playlist.ts`: Zufall ohne Wiederholung, Verlauf für ←
  - `sequencer.ts`: Reihenfolge aus Fotos, Fülltexten und gebundenen Texten (vor/über/nach)
  - `scene.ts`: gemeinsame Schnittstelle `Scene` für `Slide` (Foto) und `TextSlide`; `OverlayTrack` steuert Texte zeitlich
  - `faceAvoid.ts`: Gesichter auf dem Bildschirm (`faceOnScreen`, mit Rand) und Platzwahl (`bestPlace`); `Slide.upcomingFaces(s)` liefert sie für Sofort-Texte/Emojis, Texte über Fotos wählen per `TextOverlay.placeAvoiding` (gemessen ohne Animations-Transform). Die Show lädt die Gesichter je Foto immer (`faces: null` = nicht analysiert)
  - `emojis.ts`: schwebende Emojis (HTML + GSAP) über dem Foto; `info.ts`: Info-Tafel (Taste I)
  - `main.ts`: Ablauf, Vorladen, Tasten. Per Hand Ausgelöstes (Effekte, Sofort-Texte, Emojis) endet in `endManualExtras()` beim nächsten Übergang. Einfrieren: `Slide.setFrozen` (Fortschritt pendelt als Sinus um die aktuelle Stelle, Auftauen setzt dort fort)

## Stolperfallen

- Die Fenster laufen mit `sandbox: true`: Der Preload muss CommonJS sein, deshalb kein `"type": "module"` in `package.json` (ESLint-Konfiguration ist `.mjs`).
- `import 'pixi.js/unsafe-eval'` muss vor PixiJS geladen werden, weil die CSP kein eval erlaubt.
- Ruckelfreiheit: Im Übergang keine Zusatzarbeit (Vorladen startet erst bei "Übergang Ende"); Worker-Canvas mit `willReadFrequently` (CPU), sonst konkurriert er mit WebGL; beim Übergangsstart sofort `transitions.render(…, 0)`, sonst zeigt die Übergangsfläche einen Frame lang alten Inhalt. Änderungen an der Show mit `PP_PERF=1` messen, und zwar ohne `PP_CAPTURE_DIR` (die Aufnahmen verfälschen die Bildrate).
- Neue Datenquellen in der Show brauchen einen Eintrag in der CSP beider `index.html`.
- Neue Auswahl-Optionen (Effekte, Bewegungsarten, Füllmodi) nur hinten an die Konstanten in `settings.ts` anhängen; `parseSettings` ergänzt sie in gespeicherten Einstellungen. Ein entfernter Eintrag setzt die ganze Liste auf Standard zurück.
- Gesichtskoordinaten im Index sind relativ (0–1) zum bereits EXIF-gedrehten Bild; Show und Analyse dekodieren beide mit `imageOrientation: 'from-image'`.
- Beispiele und Gegenbeispiele (`Person.samples`/`negatives`) werden am Merkmalsvektor (`emb`) erkannt, nicht an der Gesichtsnummer. Treffer = über der Schwelle und ähnlicher als jedes Gegenbeispiel (`matchFace`).
- Hand-Markierung: `markFace` → Analyse-Fenster (`analyzeBox`) sucht im Ausschnitt neu; überlappt das Ergebnis ein vorhandenes Gesicht (IoU > 0,5), wird es ersetzt und Zuordnungen ziehen mit. Von Hand markierte Gesichter (`manual`) überstehen das Neu-Analysieren.
- `FaceStore` nimmt den aktuellen Ordner aus den Einstellungen, nicht aus dem letzten Einlesen (sonst findet die Show beim Start keine Gesichter).
- Zum Testen der Erkennung: OpenCV-Beispielbilder (`lena.jpg`, `messi5.jpg`) ins Scratchpad laden, nie ins Repo. Gleiche Person ≈ 0,8–0,93, verschiedene ≈ 0,13–0,18 (Schwelle 0,38).
- Textgrößen sind in `cqh` angegeben: Der Host-Container eines `TextOverlay` braucht `container-type: size`.
- Texte und eigene Stile werden in `parseSettings` Eintrag für Eintrag geprüft (`parseList`), damit ein kaputter Eintrag nicht alle Texte löscht. In zod 4 müssen solche losen Felder `z.unknown().optional()` sein.
- Frame-Messung: `PP_PERF=1` lädt die Show mit `#perf`; langsame Frames (> 25 ms) erscheinen mit den Ereignissen davor im Terminal (`perf.ts`).
- Weitere Testschalter (nur Entwicklung): `PP_PROGRAM_DIR` (so tun, als läge das Programm dort; mit `PP_USER_DATA=<dir>/Data` ein Paket „auf einem anderen Rechner“ starten), `PP_TEST_EXPORT=<ordner>` (erstellt dort ein Paket), `PP_CAPTURE_MS` (Aufnahme-Abstand, z. B. 500 für schnelle Abläufe).
- Fernbedienung testen: **nicht per curl** – die Sandbox der Shell leitet 127.0.0.1 an den echten Rechner weiter, dort laufen evtl. die echte App oder andere Programme. Stattdessen `PP_TEST_COMMANDS="7:emoji:❤️;8:freeze:on;9:key:i;10:queue:foto.jpg;12:drag:x1,y1,x2,y2"` (Sekunden:Befehl:Zusatz, nur Entwicklung) und die Handy-Seite mit `PP_REMOTE_PREVIEW=1|zoom|fotos` (läuft ohne Netzwerk, mit `PP_CAPTURE_DIR` als Aufnahme). Beim ersten Öffnen des Ports fragt die Windows-Firewall.
- Befehle an die Show haben einen optionalen Zusatz (`{ cmd, arg }`): `effect`/`world` mit ID, `text` mit Text-ID, `say` mit freiem Text. Sofort eingeblendete Texte laufen unabhängig vom Ablauf (`instantTexts` in `show/main.ts`).
- Nach der 3D-Welt: Sobald das Zielfoto geladen ist, ruft die Show `WorldScene.setFinalFrame(w, h)` (Größe des eingepassten Fotos); Kamera-Abstand und Seitenverhältnis der Zielkachel passen sich weich an, der Übergang startet erst bei `frameSettled`. Das Foto beginnt mit `stillStart` im Gesamtbild (Zoom 1, mittig).
- 3D-Zwischenspiel: eine Formation; das Zielfoto wird erst beim Eintauchen gewählt (`WorldScene.chooseFinal`), deshalb lädt die Show während der 3D-Welt erst bei `diving` vor. Wackelpudding = `JELLY_VERTEX` (ersetzt three.js `project_vertex`) auf fein unterteilten Kacheln.
- Testeinstellungen mit Auswahllisten immer vollständig angeben: `parseSettings` ergänzt fehlende Optionen als aktiv.
- Ein zusätzlicher WebGL-Kontext (wie Three.js für die 3D-Welt) muss sein Bild als Pixi-Textur abgeben (Canvas → `Texture.from`, je Frame `source.update()`), sonst läuft er nicht durch die Übergänge. Kleinere Effekte lieber als Pixi-Partikel oder Mesh-Shader.
- `electron-vite preview --skipBuild` startet den zuletzt gebauten Stand – nach Codeänderungen ohne `--skipBuild` testen.
- Windows kann zusammengeschaltete Monitore als einen Bildschirm melden (z. B. 5760×1134). Dafür gibt es `showDisplay` (Display-ID, leer = Maus) und `showArea` (Drittel/Hälften, Rechnung in `src/shared/display.ts`); ein Teilbereich ist ein randloses Fenster mit `alwaysOnTop('screen-saver')` statt Vollbild. Für Tests `PP_SHOW_WINDOWED=1` (Fenster-Vorschau im Seitenverhältnis des Bereichs) – nie die echte Vollbild-Show über den Bildschirm des Nutzers legen.
- Zoom immer mit `limitShot(…, zoomLimit(…))` begrenzen (Einstellung `maxUpscale`).
- Shell-Fallen: Backslashes, Regex und Template-Strings in `node -e`/Heredocs gehen leicht kaputt – bei so etwas Edit/Write oder ein Skript im Scratchpad benutzen.
- Visuelle Tests der Einstellungen: `PP_SETTINGS_PAGE=Texte` (Seitenname) zusammen mit `PP_CAPTURE_DIR`.
- npm 11 blockiert Install-Skripte; Freigaben stehen in `allowScripts` in `package.json`. Electron lädt seine Binärdatei beim ersten Start selbst.
