# Changelog

Alle Änderungen je Version. Format: neueste Version oben, Datum im Format JJJJ-MM-TT.

## 0.2.0 – 2026-11-11

Basis-Diashow (Meilenstein 2).

- Fotoordner wählen (mit Unterordnern), zufällige Reihenfolge ohne Wiederholung, Zurückblättern
- Fotos mit EXIF-Drehung laden und auf Bildschirmgröße verkleinern
- Bildschirm füllen: bis zum eingestellten Anteil beschneiden, sonst einpassen und Ränder aus dem weichgezeichneten Foto füllen; weiche Kanten
- Ken Burns: Hineinzoomen, Herauszoomen, Schwenk; nie über den Bildrand hinaus
- Weiches Überblenden; Bewegung läuft während der Überblendung weiter
- Tasten: Esc, Leertaste, ←/→, I (Dateiname), D (fps)
- Einstellungsfenster: Ordner, Beschnitt, Anzeigedauer, Intensität, Bewegungsarten, Überblenddauer (jeweils von … bis mit Zufall); Änderungen wirken sofort in der laufenden Show
- Einstellungen als JSON mit zod-Schema; defekte Datei → Standardwerte
- `PP_CAPTURE_DIR`: Fensteraufnahmen für Tests in der Entwicklung
- Behoben: `photo://` war von CORS blockiert; langer Pfad sprengte das Einstellungsfenster

## 0.1.0 – 2026-11-11

Projektgerüst (Meilenstein 1).

- Electron + electron-vite + TypeScript, React + Tailwind (Einstellungen), PixiJS (Show)
- ESLint, Prettier, Vitest, electron-builder (NSIS, AppImage, deb)
- Privates GitHub-Repo; GitHub Actions wieder entfernt, Builds und Tests nur lokal
