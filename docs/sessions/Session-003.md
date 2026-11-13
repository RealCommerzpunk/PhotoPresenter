# Session 003 – 2026-11-12 bis 2026-11-13

Erweiterungen nach Version 0.10.0: Version 0.11.0 bis 0.13.0, Veröffentlichung des Repositorys und der ersten Releases.

## Ergebnis

- Version 0.13.0, 107 Unit-Tests, alles auf GitHub; Repo öffentlich (vom Nutzer umgestellt), GitHub Pages läuft
- Releases: v0.12.5 (Demo), v0.13.0 (Windows: Demo-ZIP, portable exe, Installer), v0.13.0-linux (Vorabversion: AppImage, deb, tar.gz, Demo-Paket)
- Neu: Live-Fernbedienung mit Rückmeldung, Emojis, Einfrieren, Galerie und eigener Reihenfolge, Info-Tafel, Bildschirm-/Bereichsauswahl, Mitnehmen (portabel, Weitergabe-Paket), Texte auf Abruf, Gesichter-Ausweichen für Texte und Emojis, Programm-Icon, Schnellstart-Anleitung (MD + PDF), Demo-Fotos und Demo-Einstellungen, MIT-Lizenz, englische README, Produktseite, Dublettenprüfung, Oberfläche in vier Sprachen (de/en/es/fr), Programm 27–70 MB kleiner, Linux-Workflow

## Ablauf

1. **0.11.0**: Rückmeldungen der Show auf dem Handy, per Hand Ausgelöstes endet beim Übergang, ruhiger Start nach der 3D-Welt, Emojis, Einfrieren (Bewegung in Schleife), Info-Tafel (Taste I, EXIF), Fernbedienung als Fenster (Taste R), Galerie mit Warteschlange.
2. **0.11.1**: Bildschirm und Bereich (Drittel/Hälften) für zusammengeschaltete Monitore.
3. **0.12.0**: Mitnehmen – `Data` neben portabler .exe/AppImage, Gesichtsindex mit relativen Pfaden, Weitergabe-Paket; Texte „nur auf Abruf“; kompakte Fernbedienung mit Reitern; 3D-Eintauchen endet in echter Fotogröße.
4. **0.12.1**: Texte und Emojis verdecken keine Gesichter (Kamerabewegung wird mitgerechnet).
5. **0.12.2**: Programm-Icon (Flaticon, Three Musketeers) für exe, Fenster, Fernbedienung, README; `Quickstart.md` mit PDF, PDF im Weitergabe-Paket.
6. **0.12.3**: Demo-Fotos (163 von RDNE Stock project, Pexels, auf 2560 px verkleinert), MIT-Lizenz, englische Haupt-README, `npm run demo` mit Demo-Datenordner `Data/` im Repo.
7. **0.12.4**: Produktseite `docs/index.html` mit Clips (animierte WebP) aus echten Aufnahmen; Fokus-Partner-Symbol ☆; langer Datenpfad bricht um; Dublettenprüfung ins Backlog.
8. **0.12.5**: Gesichtsindex erkennt Fotos am Inhalts-Fingerabdruck (Größe + Anfang/Ende der Datei), sodass nach `git clone`/ZIP nichts neu analysiert wird; Release v0.12.5 mit Demo-ZIP.
9. **0.13.0 Dublettenprüfung**: pHash (DCT über 32 × 32 Graustufen) im Analyse-Fenster, Gruppen bei Abstand ≤ 6 und gleichem Seitenverhältnis, beste Fassung nach Auflösung; Schalter „in der Show überspringen“, Aufräumen per Verschieben nach `Duplicates/` oder Papierkorb.
10. **0.13.0 Internationalisierung**: alle Oberflächentexte nach `src/shared/i18n/` (de als Quelle, en/es/fr), `t()`/`labelMap`, Sprache wählbar, Handy-Seite übersetzt per Rückwärtssuche über `/api/i18n`; Tests für Schlüssel, Platzhalter und Handy-Seite; `TRANSLATING.md` für Beitragende.
11. **Schlankeres Programm**: Fenster-Pakete in `devDependencies`, `app.asar` 300 → 32 MB; Windows-Release v0.13.0.
12. **Linux**: AppImage/deb unter Windows nicht baubar → manuell startbarer Workflow `.github/workflows/linux.yml` (Tests, Rauchtest mit xvfb, Archive mit Rechten, Anhängen ans Release); Release v0.13.0-linux als Vorabversion.

## Entscheidungen des Nutzers

- Einstellungen zum Bildschirm in den Einstellungen, nicht automatisch
- Alles auf „Mitnehmen“/portabel umbauen; technische Namen englisch (`Data`, `Photos`), Oberfläche vorerst deutsch, Internationalisierung später
- Code unter MIT, Demo-Fotos verkleinern, README auf Englisch (deutsche Fassung daneben), Commit-Adresse bleibt sichtbar
- Repo noch nicht öffentlich schalten; Demo-Set (Einstellungen + Gesichtsindex) gehört ins Repo
- Fokus-Partner neutral (kein Herz): erst 🫂, dann ☆
- Produktseite zunächst auf Deutsch
- Dublettenprüfung: nur inhaltlich gleiche Fotos (nicht Serienbilder), behalten wird die höchste Auflösung; zwei Aufräum-Wege (verschieben/löschen)
- Sprachen: Englisch, Spanisch, Französisch; Übersetzungen sollen die Community per Pull Request pflegen können
- Linux-Build auf GitHub erlaubt, aber nur manuell gestartet (Regel „Kein CI“ gelockert)

## Fehler und Lehren

- Testbefehle per curl landeten in der echten App des Nutzers (Sandbox leitet 127.0.0.1 an den Rechner weiter) → `PP_TEST_COMMANDS` und das R-Fenster ohne Netzwerk, curl ist tabu.
- Eine Social-Preview-Datei als „vorbereitet“ gemeldet, die noch nicht existierte; später korrigiert und erstellt. Nur melden, was wirklich da ist.
- Python-Patches per Heredoc verloren `\n`-Escapes → Patch-Skripte mit dem Write-Werkzeug anlegen.
- `npm run quickstart` scheiterte, solange die PDF geöffnet war (EBUSY); Skript meldet das jetzt.
- ffmpeg-Download abgelehnt → Clips als animierte WebP.
- Repo-Sichtbarkeit aus dem Gedächtnis als „privat“ behauptet, obwohl der Nutzer es schon öffentlich gestellt hatte → vor Aussagen per `gh api` prüfen.
- `electron-builder --linux` unter Windows: AppImage scheitert (Symlinks), tar.gz verliert Dateirechte → Linux nur im Workflow bauen.
- Das erste Packskript im Workflow brach lautlos ab (`set -e` bei `[ … ] && echo` in einer Zuweisung); Workflow lokal nicht testbar, daher zuerst ohne Release-Tag laufen lassen.
- `app.asar` war 300 MB, weil gebündelte Fenster-Pakete zusätzlich in `dependencies` standen.
- Hilfsskripte mit Python-Patches: Import-Zeile mitten in einen mehrzeiligen Import gesetzt → Import immer ganz oben einfügen.
- Alle Tests mit `PP_USER_DATA` im Scratchpad; das Demo-Set in `Data/` nur gelesen bzw. kopiert.

## Offen am Ende

- Produktseite, Quickstart und Changelog in en/es/fr; Gegenlesung von es/fr durch Muttersprachler
- Linux-Pakete auf echter Hardware/anderen Distributionen testen (AppImage unter Ubuntu 24.04 evtl. `--no-sandbox`, `desktopName`)
- Repo-Beschreibung/Themen auf GitHub setzen, Social Preview hochladen (nur im Web möglich)
- Meilenstein 7: npm audit, Test 4K/große Fotos, echter iPhone-Test, Release v0.1.0 bzw. Versionsschema klären
- Backlog: HEIC/RAW, Videos, Musik, Serienbilder gruppieren
