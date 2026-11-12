# Session 003 – 2026-11-12

Erweiterungen nach Version 0.10.0: Version 0.11.0 bis 0.12.4 und Vorbereitung auf ein öffentliches Repository.

## Ergebnis

- Version 0.12.4, 80 Unit-Tests, alles auf GitHub (Repo noch privat)
- Neu: Live-Fernbedienung mit Rückmeldung, Emojis, Einfrieren, Galerie und eigener Reihenfolge, Info-Tafel, Bildschirm-/Bereichsauswahl, Mitnehmen (portabel, Weitergabe-Paket), Texte auf Abruf, Gesichter-Ausweichen für Texte und Emojis, Programm-Icon, Schnellstart-Anleitung (MD + PDF), Demo-Fotos und Demo-Einstellungen, MIT-Lizenz, englische README, Produktseite

## Ablauf

1. **0.11.0**: Rückmeldungen der Show auf dem Handy, per Hand Ausgelöstes endet beim Übergang, ruhiger Start nach der 3D-Welt, Emojis, Einfrieren (Bewegung in Schleife), Info-Tafel (Taste I, EXIF), Fernbedienung als Fenster (Taste R), Galerie mit Warteschlange.
2. **0.11.1**: Bildschirm und Bereich (Drittel/Hälften) für zusammengeschaltete Monitore.
3. **0.12.0**: Mitnehmen – `Data` neben portabler .exe/AppImage, Gesichtsindex mit relativen Pfaden, Weitergabe-Paket; Texte „nur auf Abruf“; kompakte Fernbedienung mit Reitern; 3D-Eintauchen endet in echter Fotogröße.
4. **0.12.1**: Texte und Emojis verdecken keine Gesichter (Kamerabewegung wird mitgerechnet).
5. **0.12.2**: Programm-Icon (Flaticon, Three Musketeers) für exe, Fenster, Fernbedienung, README; `Quickstart.md` mit PDF, PDF im Weitergabe-Paket.
6. **0.12.3**: Demo-Fotos (163 von RDNE Stock project, Pexels, auf 2560 px verkleinert), MIT-Lizenz, englische Haupt-README, `npm run demo` mit Demo-Datenordner `Data/` im Repo.
7. **0.12.4**: Produktseite `docs/index.html` mit Clips (animierte WebP) aus echten Aufnahmen; Fokus-Partner-Symbol ☆; langer Datenpfad bricht um; Dublettenprüfung ins Backlog.

## Entscheidungen des Nutzers

- Einstellungen zum Bildschirm in den Einstellungen, nicht automatisch
- Alles auf „Mitnehmen“/portabel umbauen; technische Namen englisch (`Data`, `Photos`), Oberfläche vorerst deutsch, Internationalisierung später
- Code unter MIT, Demo-Fotos verkleinern, README auf Englisch (deutsche Fassung daneben), Commit-Adresse bleibt sichtbar
- Repo noch nicht öffentlich schalten; Demo-Set (Einstellungen + Gesichtsindex) gehört ins Repo
- Fokus-Partner neutral (kein Herz): erst 🫂, dann ☆
- Produktseite zunächst auf Deutsch

## Fehler und Lehren

- Testbefehle per curl landeten in der echten App des Nutzers (Sandbox leitet 127.0.0.1 an den Rechner weiter) → `PP_TEST_COMMANDS` und das R-Fenster ohne Netzwerk, curl ist tabu.
- Eine Social-Preview-Datei als „vorbereitet“ gemeldet, die noch nicht existierte; später korrigiert und erstellt. Nur melden, was wirklich da ist.
- Python-Patches per Heredoc verloren `\n`-Escapes → Patch-Skripte mit dem Write-Werkzeug anlegen.
- `npm run quickstart` scheiterte, solange die PDF geöffnet war (EBUSY); Skript meldet das jetzt.
- ffmpeg-Download abgelehnt → Clips als animierte WebP.
- Alle Tests mit `PP_USER_DATA` im Scratchpad; das Demo-Set in `Data/` nur gelesen bzw. kopiert.

## Offen am Ende

- Repo öffentlich schalten: Release mit Programmen anlegen, Beschreibung/Themen, Social Preview hochladen, GitHub Pages (`main`/`docs`) einschalten
- Neues Build (dist) mit Icon-PDF-Stand 0.12.4 vor dem Release
- Produktseite ggf. auf Englisch
- Meilenstein 7: npm audit, Test 4K/große Fotos, Linux-Installer, echter iPhone-Test, Release v0.1.0
- Backlog: Internationalisierung, Dublettenprüfung, HEIC/RAW, Videos, Musik
