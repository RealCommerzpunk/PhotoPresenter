# Changelog

Alle Änderungen je Version. Format: neueste Version oben, Datum im Format JJJJ-MM-TT.

## 0.6.1 – 2026-11-11

Gesichter ausschließen und von Hand markieren.

- „Ist nicht diese Person“: ✕ an jedem Gesicht in der Galerie setzt ein Gegenbeispiel (rot markiert). Ein Gesicht zählt nur noch als Treffer, wenn es der Person ähnlicher ist als jedem Gegenbeispiel, dadurch fallen auch ähnliche Fotos derselben falschen Person heraus
- „Gesicht von Hand markieren“: Foto suchen (Dateiname oder Ordner), Rahmen ums Gesicht ziehen, als Beispiel oder Gegenbeispiel übernehmen. Im vergrößerten Ausschnitt wird das Gesicht erneut gesucht (findet auch kleine Gesichter, genauerer Merkmalsvektor); ohne Treffer werden die Punkte aus dem Rahmen geschätzt
- Erkannte Gesichter lassen sich im Markier-Fenster direkt per ✓/✕ zuordnen
- Eine Markierung über einem schon erkannten Gesicht ersetzt dieses durch die genauere Fassung statt es doppelt anzulegen
- Beispiele werden am Merkmalsvektor erkannt; „Alles neu analysieren“ behält Zuordnungen und von Hand markierte Gesichter

## 0.6.0 – 2026-11-11

Gesichtserkennung und Fokus-Person (Meilenstein 6).

- Alle Fotos werden im Hintergrund nach Gesichtern durchsucht (YuNet) und jedes Gesicht wird wiedererkennbar gespeichert (SFace), komplett lokal ohne Internet; rund 150 ms pro Foto, neue und geänderte Fotos werden automatisch nachgezogen, während der Show gedrosselt
- Seite „Personen“: Analysefortschritt, Personen anlegen, Gesichter per Klick als Beispiele hinterlegen; die Galerie sortiert nach Ähnlichkeit und markiert Treffer
- Fokus-Person in der Show: langsam anzoomen, schnell anzoomen oder Kamerafahrt zum Gesicht; Gesichtsgröße am Ende einstellbar
- Bei Gruppenfotos optional vorher oder nachher über die anderen Gesichter schwenken
- Fotos mit der Fokus-Person können häufiger gezeigt werden (×2 bis ×4), nie direkt hintereinander
- Starkes Zoomen aufs Gesicht lädt das Foto entsprechend höher aufgelöst
- Erkennungsschwelle einstellbar; Info-Einblendung (Taste I) zeigt „Fokus-Person“
- Modelle: `npm run models` lädt sie aus dem OpenCV Model Zoo (mit Prüfsumme); der Installer-Bau erledigt das automatisch

## 0.5.0 – 2026-11-11

Texte (Meilenstein 5).

- Fülltexte zwischen den Fotos, Abstand „alle X–Y Fotos“ einstellbar; derselbe Text kommt nie direkt zweimal
- Texte an Fotos binden: vor, nach oder über dem Foto; Auswahl der Fotos mit Suche und Vorschaubildern
- Textfolien haben das zugehörige Foto weichgezeichnet als Hintergrund, langsam zoomend
- 12 Stilvorlagen (Elegant, Kino, Schreibmaschine, Handschrift, Notiz, Plakat, Neon, Minimal, Retro, Festlich, Untertitel, Zitat) mit 8 mitgelieferten Schriften (OFL, ohne Internet)
- 9 Einblend- und 5 Ausblendanimationen (u. a. Schreibmaschine mit Cursor, Handschrift, Glitch, Welle, Wörter springen)
- Stil pro Text fest oder „Zufall“ aus den aktiven Stilen mit Häufigkeit
- Eigene Stile: Vorlage ableiten und Schrift, Größe, Farben, Effekt, Kasten, Position und Animation ändern, mit Live-Vorschau
- Texte über Fotos stehen unten statt mittig, damit Gesichter frei bleiben; die Standzeit des Fotos verlängert sich bei Bedarf
- Pause hält auch die Textanimationen an
- Einstellungsfenster startet in der Entwicklung mit `PP_SETTINGS_PAGE=<Seite>` direkt auf einer Seite

## 0.4.0 – 2026-11-11

Einstellungen ausgebaut, Übergänge, Randfüllung und Kamerafahrt (Meilensteine 3 und 4).

- 13 Übergangseffekte per Shader: Überblenden, Über Schwarz, Wischen, Schieben, Kreis öffnen, Zoom-Unschärfe, Auflösen, Uhrzeiger, Verpixeln, Welle, Lichtblende, Jalousie, Strudel; jeweils an/aus und Häufigkeit 1–5, Richtung zufällig
- Beide Fotos bewegen sich während des Übergangs weiter
- Randfüllung wählbar: Weichgezeichnet, Farbverlauf aus den Randfarben, Gespiegelt (bewegt sich deckungsgleich mit dem Foto)
- Neue Bewegungsart Kamerafahrt: geschwungener Pfad über einen nahen Zwischenpunkt
- Einstellungsfenster: Vorschau im Fenster, Auf Standardwerte zurücksetzen (Ordner bleibt), Effektliste zweispaltig mit „alle an/aus“
- Einstellungen mit Versionsnummer; neue Optionen werden in gespeicherte Einstellungen ergänzt, ohne vorhandene Werte zu verlieren

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
