# Session 004 – 2026-11-13 bis 2026-11-20 (bis Version 0.16.0)

Version 0.14.0: Songs mit Karaoke, Zeiten-Editor, Kinder-Fernbedienung, Dichte der 3D-Welt.
Fortsetzung bis 0.15.0: weniger Wiederholungen, alle Einstellungen auf dem Handy, Personen-Seite (siehe unten).

## Ergebnis

- Version 0.14.0, 122 Unit-Tests, alles auf GitHub
- Releases: v0.14.0 (Windows, Latest: Demo-ZIP, portable exe, Installer) und v0.14.0-linux (Vorabversion: AppImage, deb, tar.gz, Demo-Archiv; Workflow mit Tests und Rauchtest erfolgreich)
- Produktseite auf Stand 0.14.0 (Abschnitt Songs & Karaoke, Kinder-Fernbedienung, Sprachen, Dubletten, Dichte, Tasten K/S/q)
- Neu: Songs mit Karaoke-Text (Taste S, Ordner `Songs`), gleitende Textspalte mit Füllung je Teilzeile, Darstellung einstellbar (Schrift, Zeilen, Farben, Position, Hintergrund mit Abdunklung), Zeiten-Editor mit Mitsingen und Wellenform, Kinder-Fernbedienung (Taste K, `/kids`, QR-Code mit q), Fernbedienung vervollständigt, Regler „Dichte“ der 3D-Welt

## Ablauf

1. Fragen beantwortet: Dublettenprüfung liegt unter Allgemein → Doppelte Fotos; Einstellungen der Entwicklungsversion liegen in `%APPDATA%\PhotoPresenter`.
2. Fernbedienung vervollständigt (Bewegungsarten, Füllung, Fokus-Arten, Gesichtsgröße, Text-Hintergründe, 3D-Fotozahl/Kameratempo, Reiter „Songs“).
3. Kinder-Fernbedienung: dieselbe `remote.html` im Kindermodus, Show erlaubt je Foto ein Emoji und einen Text.
4. Songs: `src/shared/lyrics.ts` (Parsen, Silbenverteilung, geschätztes Gesangsfenster, LRC-Marken, Teil-Marken), `SongPlayer` mit Web Audio, Auswahl auf dem Bildschirm bei mehreren Liedern.
5. Karaoke-Darstellung: Schriftgröße, Zeilen davor/danach, Hintergrund (Diashow, Foto abdunkeln, festes Foto); später gleitende Spalte (Bild für Bild), Farben, Füllung je umgebrochener Teilzeile; beim Liedstart enden Texte, Effekte und Emojis.
6. QR-Codes: q = Kinder-Fernbedienung, Q = normale.
7. Zeiten-Editor in drei Anläufen: Enter/E-Tasten mit Vorhalt und Tempo → Pfeiltasten mit Probehören → **Mitsingen (Taste halten) + Feinschliff auf der Wellenform** (vom Nutzer gewählt, nach Rückfrage mit Skizzen).
8. 3D-Welt: Regler „Dichte“, `formations.ts` mischt zwischen lockerem und dichtem Abstand, Kamera zieht mit.
9. Changelog 0.14.0 neu gegliedert, ältere Einträge vereinheitlicht, README-Funktionen ergänzt, Backlog gepflegt, Releases gebaut.
10. Produktseite nachgezogen (auf Hinweis des Nutzers: stand noch auf 0.12): Karaoke als animierte Nachbildung mit erfundenem Text (das echte Lied ist privat), waagrechte Überbreite auf dem Handy behoben.

## Entscheidungen des Nutzers

- Songs als eigene Rubrik; Verbindung MP3/TXT über den Dateinamen; Taste S, bei mehreren Liedern Auswahl auf dem Bildschirm
- Kinder-Fernbedienung mit Taste K, je Foto genau ein Emoji und ein Text
- Hintergrund während des Liedes wählbar (weiterlaufen, aktuelles Foto abdunkeln, festes Foto), Abdunklung einstellbar
- Karaoke-Text soll sanft gleiten; vergangene Zeilen nicht gelb; Farben einstellbar
- Zeiten-Editor: Tasten-Konzepte verworfen („unnatürlich“), stattdessen Mitsingen + Wellenform
- Dichte der 3D-Welt als Regler in den Einstellungen
- Backlog: alles auf die Fernbedienung; globale Vermeidung von Wiederholungen (auch beim Zielfoto der 3D-Welt)

## Fehler und Lehren

- Zwei Tasten-Editoren gebaut, bevor das Bedienkonzept geklärt war → bei interaktiven Werkzeugen erst Konzepte mit Skizzen vorschlagen und fragen (Memory `natural-interaction`).
- Vitest brach unter Node 22.21 ab → `--configLoader=runner` und `pool: 'vmThreads'`.
- Prettier setzte ein BOM-Escape als rohes Zeichen in einen Regex → Prüfung per `charCodeAt(0) === 0xfeff`.
- Python per Heredoc zerstörte Backslashes erneut → Patch-Skripte immer mit dem Write-Werkzeug.
- `npm run quickstart` schlug fehl, weil `ELECTRON_RUN_AS_NODE` gesetzt war → vor Electron-Befehlen `unset`.
- Testkopie des Liedes im Scratchpad versehentlich doppelt gestempelt → immer frisch aus `Songs/` kopieren.
- Produktseite bei 0.13 und 0.14 nicht mitgepflegt → steht jetzt als Schritt in den Release-Regeln in CLAUDE.md.
- `npm run dev` zeigte die Einstellungen leer (doppeltes React, auch ohne eigene Änderungen) → Aufnahmen der Einstellungen mit gebautem Stand (`electron-vite preview --skipBuild`).

## Fortsetzung 2026-11-20 – Version 0.15.0

### Ergebnis

- Version 0.15.0, 132 Unit-Tests, alles auf GitHub
- Releases: v0.15.0 (Windows, Latest: Demo-ZIP, portable exe, Installer) und v0.15.0-linux (Vorabversion per Workflow)
- Neu: möglichst wenig Wiederholungen (gemeinsamer Verlauf, `recent.json`, übersteht Neustarts; Zielfoto der 3D-Welt am längsten nicht gezeigt), fast alle Einstellungen auf der Fernbedienung (Abgleich per Test, Ausnahmen in `REMOTE_EXCLUDED`), Personen-Seite mit Gesichts-Vorschaubildern und stabiler Reihenfolge; behoben: aussortierte/gelöschte Fotos auf der Personen-Seite

### Ablauf

1. Backlog-Eintrag Kaffee-Spende (Ko-fi, Wero).
2. Fragen beantwortet: Dev-Einstellungen in `%APPDATA%\PhotoPresenter`; „Paket für die Weitergabe“ enthält aus `npm run dev` kein Programm (nur aus der gebauten exe).
3. Personen-Seite: schwarze Kacheln und zähes Scrollen kamen von ganzen Fotos je Kachel (riesig vergrößert) → Gesichtsausschnitte aus dem Analyse-Fenster (`photo://…?face=`), Cache; Klick sortiert nicht mehr um, Knopf „neu sortieren“.
4. Kaputte Kacheln von nach `Duplicates/` verschobenen Fotos → `FaceStore.entriesOfPhotos()` (nur Fotos des letzten Einlesens), Ersatzanzeige „Foto fehlt“.
5. Wiederholungen: `freshFirst` (kürzlich Gezeigtes ans Rundenende), `shownExternally` (3D-Ziel und Galerie aus der Runde), `freshestAmong` für das 3D-Ziel, Verlauf im Hauptprozess (`recent.ts`).
6. Fernbedienung: 16 weitere Einstellungen, neue Bausteine in `remote.html`, Test für die Vollständigkeit.
7. Changelog, Plan, CLAUDE.md, READMEs, Produktseite; Releases Windows und Linux.

### Entscheidungen des Nutzers

- Kaffee-Spende (Ko-fi, Wero) bleibt im Backlog
- 0.15.0 veröffentlichen wie vorgeschlagen (Windows + Linux); erster echter Einsatz am 2026-11-21

### Fehler und Lehren

- Gesichtskacheln luden ganze Fotos → bei vielen kleinen Ansichten immer Vorschaubilder aus dem Cache.
- Der Gesichtsindex behält gelöschte Fotos absichtlich → Anzeigen und Auswahlen müssen gegen die aktuelle Fotoliste filtern.
- Demo-ZIP der Vorversion lag nicht mehr in `dist/` → Aufbau und `README.txt` aus dem Release-Asset übernommen (`gh release download`).

## Fortsetzung 2026-11-20 (Nachmittag) – Version 0.16.0

### Ergebnis

- Version 0.16.0, 138 Unit-Tests; Releases v0.16.0 (Windows) und v0.16.0-linux (Vorabversion)
- Neu: Ein- und Ausstieg der 3D-Welt mit Foto samt Rand, Verlauf für ←/→ über alle Einträge, Tasten p/P, „Länger zeigen“ bei Fokus, Schriftgröße bei Zufall, neuer Farbverlauf, Papier-Rückseiten, keine Statuseinblendungen

### Ablauf

1. Länger zeigen bei Fokus (Person / mit Partner), zufällige Schriftgröße bei Zufallsstil, Fernbedienung ergänzt.
2. Randfüllung: Beispiele des Nutzers zeigten den alten „Farbverlauf“ (zwei flache, dunkle Flächen) → Ränder zeilenweise fortsetzen, deckungsgleich unter dem Foto.
3. Ausstieg 3D-Welt: Sprung kam vom 4:3-Ausschnitt der Kachel → Vorschaubilder im Seitenverhältnis des Fotos, Zielkachel zieht zum ganzen Foto auf, scharfe Fassung.
4. Verlauf für ←/→ (`history.ts`), Einstieg in die Welt mit dem aktuellen Foto, Tasten p/P.
5. Auf Wunsch: keine Statuseinblendungen; 12 Papier-Rückseiten (danach kräftiger).
6. Ausstieg wirkte noch zu lang (Stehen, dann Rand langsam) → der Rand entsteht in der Welt selbst während des Eintauchens bzw. löst sich beim Einstieg auf; Überblendung nur noch kurz.
7. Backlog: Party-Version mit Abstimmung während der 3D-Welt.

### Entscheidungen des Nutzers

- Auf dem Show-Bildschirm nur bewusst Eingeblendetes (Texte, Emojis, QR-Codes)
- Übergänge der 3D-Welt sollen so weich wie die übrigen sein, ohne Stillstand
- Party-Version (Gäste-Fernbedienungen, Abstimmung in der 3D-Welt) viel später

### Fehler und Lehren

- Testaufnahmen alle 100 ms hinken zeitlich nach; Lage von 3D-Kacheln lieber per Projektion der Ecken (Konsolenausgabe) prüfen.
- Ein Rand, der erst nach dem Übergang einblendet, wirkt wie ein Bruch: Übergänge zwischen gleichem Bild müssen beide Seiten identisch zeigen (Rand schon in der Welt).

## Offen am Ende

- Rückmeldung vom ersten echten Einsatz (2026-11-21); Wiederholungs-Vermeidung und Fernbedienung nur per Test/Ansicht geprüft, nicht im Betrieb
- Backlog: Kaffee-Spende (Ko-fi, Wero; Adresse/Wero-Weg vom Nutzer nötig); Fokus-Bevorzugung achtet nur darauf, dass kein Foto direkt auf sich selbst folgt
- Zeiten-Editor vom Nutzer mit Ton noch nicht abschließend bestätigt; Klang/Synchronität nur vom Nutzer prüfbar
- `Songs/` optional ins Weitergabe-Paket („Mitnehmen“)
- Produktseite, Quickstart und Changelog in en/es/fr; Linux auf echter Hardware testen
- Meilenstein 7: npm audit, Test 4K/große Fotos, echter iPhone-Test
