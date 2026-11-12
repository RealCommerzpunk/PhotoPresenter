# Session 001 – 2026-11-11 bis 2026-11-12

Erste Sitzung: vom leeren Ordner bis Version 0.6.2.

## Ergebnis

- Versionen 0.1.0 bis 0.6.2, Meilensteine 1–6 fertig, Teile von Meilenstein 7 (Ruckelfreiheit)
- Repo `RealCommerzpunk/PhotoPresenter` (privat), 39 Unit-Tests

## Ablauf

1. **Planung**: Electron + TypeScript, PixiJS, eigenes Einstellungsfenster, < 5.000 Fotos lokal. Plan in `docs/PLAN.md`.
2. **Gerüst (0.1.0)**: electron-vite, React/Tailwind, ESLint/Prettier/Vitest, electron-builder. GitHub Actions wieder entfernt – Wunsch: GitHub nur für Code, Builds lokal.
3. **Basis-Diashow (0.2.0)**: zufällige Playlist, EXIF-Drehung, Randfüllung, Ken Burns, Überblenden. Behoben: CORS beim `photo://`-Protokoll.
4. **Doku**: `CLAUDE.md`, `CHANGELOG.md`, Befehl `/session-ende`.
5. **Übergänge, Füllmodi, Kamerafahrt (0.4.0)**: 13 Shader-Übergänge, Randfüllung weich/Farbverlauf/gespiegelt, Vorschau im Fenster.
6. **Texte (0.5.0)**: Fülltexte, Texte vor/nach/über Fotos, 12 Stile, 8 Schriften, Stil-Editor.
7. **Gesichtserkennung (0.6.0)**: YuNet + SFace mit onnxruntime-web im unsichtbaren Analyse-Fenster, Index als JSON, Personen-Seite, Fokus-Kamerafahrten.
8. **Gegenbeispiele und Hand-Markierung (0.6.1)** auf Nachfrage des Nutzers.
9. **Ruckeln/Zucken (0.6.2)**: per Frame-Messung (`PP_PERF`) eingegrenzt; Ursache des Zuckens war ein Frame mit veraltetem Übergangsinhalt. Dazu Worker für die Bildvorbereitung, Vorladen nach dem Übergang, Texturen in Streifen.

## Entscheidungen des Nutzers

- Kein CI, Builds und Tests lokal
- Nur in diesem Projekt arbeiten (versehentlich ein anderes Projekt gelesen)
- Eine Fokus-Person; Frage nach mehreren Personen führte zur nächsten Session (Fokus-Partner)

## Fehler und Lehren

- Tests haben die echten Einstellungen des Nutzers (`%APPDATA%/PhotoPresenter`) überschrieben und gelöscht. Seitdem `PP_USER_DATA` für alle Testläufe (Regel in CLAUDE.md und Memory).
- Ein Prüfskript dekodierte Merkmalsvektoren falsch (`Buffer.buffer`-Pool) – erst Prüfwerkzeug verdächtigen, bevor man der App misstraut.

## Offen am Ende

- Meilenstein 7: npm audit, Test auf 4K/großen Fotos, Linux-Installer, Release v0.1.0
