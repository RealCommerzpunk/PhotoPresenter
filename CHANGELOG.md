# Changelog

Alle Änderungen je Version. Format: neueste Version oben, Datum im Format JJJJ-MM-TT.

## 0.10.0 – 2026-11-12

Wackelpudding, kleine Fotos, gezielte Auslöser.

- **3D-Fotowelt: eine Formation je Zwischenspiel** (Einflug → Formation mit Kamerafahrt → Eintauchen); die Einstellung „Formationen je Zwischenspiel“ entfällt
- **Neue Formation Wackelpudding-Würfel**: Fotos lückenlos um einen Würfel, der sich dreht, umherschwebt, staucht und streckt; die Fotos biegen sich wabbelnd mit und beruhigen sich vor dem Eintauchen
- Eintauchen jetzt immer in eine der Kamera zugewandte Kachel – kein Flug mehr durch die Formation; Weiterschalten springt direkt ins Eintauchen
- **Kleine Fotos begrenzen** (Allgemein → Bildschirm füllen): schlecht aufgelöste oder gescannte Fotos höchstens bis X % ihrer Originalauflösung vergrößern; der Rand wird wie gewohnt aufgefüllt, auch rundum
- **Fernbedienung: gezielt auslösen** – jeden Effekt einzeln, jede 3D-Formation einzeln, jeden Text sofort über dem aktuellen Foto („Zeigen“) sowie freien Text sofort einblenden (nicht gespeichert)
- „3D jetzt“ während eines Übergangs geht nicht mehr verloren, sondern startet direkt danach

## 0.9.0 – 2026-11-12

3D-Fotowelt.

- **Zwischenspiel 3D-Fotowelt** (Three.js): Viele Fotos fliegen als Kacheln mit hellem Rahmen in den Raum und ordnen sich nacheinander zu Formationen – Kugel, Spirale, 3D-Raster, Wand, schwebende Rahmen, Würfel, Karussell, Tunnel, Welle. Die Kacheln morphen versetzt wie im „CSS3D Periodic Table“-Beispiel, die Kamera kreist, fährt heran, fliegt hindurch oder darüber und taucht am Ende in ein Foto ein, mit dem die Show nahtlos weiterläuft
- Einstellbar (Seite Effekte → 3D-Fotowelt): wie oft (alle X–Y Fotos), wie lange, wie viele Fotos, wie viele Formationen, Kameratempo, Auswahl der Formationen mit Häufigkeit; „3D jetzt zeigen“
- Auf der Fernbedienung: an/aus, Häufigkeit, Dauer, Formationen, „3D jetzt“
- Vorschaubilder werden im Hintergrund in ruhigen Phasen geladen; Kachel-Texturen werden über mehrere Frames hochgeladen. Gemessen: keine langsamen Frames während der Zwischenspiele (einmaliger Ruckler beim allerersten Laden von Three.js)

## 0.8.0 – 2026-11-12

Effekte.

- **Partikel-Effekte** über den Fotos: Konfetti, Schnee, Funkeln, Herzen, Seifenblasen, Feuerwerk, Blütenblätter, Goldstaub. Einstellbar: wie oft (alle X–Y Fotos), wie lange, wie intensiv (Menge, Tempo, Deckkraft), Auswahl mit Häufigkeit; laufen über Fotowechsel hinweg aus
- **Animierte Hintergründe für Textfolien**: Polarlicht, Nebel, Wellen, Lichter (Bokeh), Sternenhimmel – in den Farben des zugehörigen Fotos, laufen durch die Übergangseffekte mit
- Neue Einstellungsseite „Effekte“ mit „✨ Effekt jetzt zeigen“; Effekte auch auf der Fernbedienung (an/aus, Häufigkeit, Dauer, Intensität, Auswahl, Effekt jetzt)
- Vorschaufenster auf sehr breiten Bildschirmen höchstens 1280 px breit
- Umgesetzt mit PixiJS statt tsParticles/Vanta.js: ein gemeinsames WebGL-Canvas bleibt ruckelfrei, und die Hintergründe gehen mit den Übergängen mit

## 0.7.0 – 2026-11-12

Fernbedienung, Fokus-Partner, Zoomgrenze, relativer Fotopfad.

- **Fernbedienung per Handy**: Der Presenter öffnet eine Webseite im lokalen Netz (Port 8765, ohne Passwort). Dort lassen sich Anzeige-, Überblend- und Textdauer, Bewegung, höchste Vergrößerung, Übergänge, Fokus (Person, Partner, gemeinsam, Schwelle, Häufigkeit, andere Gesichter) und Texte (an/aus, neuer Fülltext, Abstand) während der Show ändern; Show starten/beenden, Pause, vor/zurück. Mehrere Handys gleichzeitig, Live-Aktualisierung. Das Hotspot-Netz des iPhones wird bevorzugt.
- QR-Code mit Adresse in den Einstellungen (Allgemein → Fernbedienung); in der Show blendet die Taste **Q** ihn 30 Sekunden lang ein (auch per Fernbedienung)
- **Fokus-Partner** (♥): Mit „Gemeinsam fokussieren“ fährt die Kamera bei Fotos mit beiden erst den Partner, dann die Fokus-Person an. Die Fokus-Karte zeigt, für wen sie gilt.
- **Höchste Vergrößerung** (Standard 125 %): Zoom wird nach Original- und Bildschirmauflösung begrenzt, damit nichts pixelig wird; gilt für alle Bewegungen und den Fokus
- **Fotoordner relativ** zum Programmordner möglich (z. B. „Fotos“ neben dem Programm); unter Windows auch „/Fotos“. Zusätzlich gibt es eine portable Windows-Version (einzelne .exe, ideal für einen USB-Stick)
- Sitzungsprotokolle unter `docs/sessions/`

## 0.6.2 – 2026-11-11

Ruckeln und Zucken vor dem Übergang behoben.

- Behoben: Kurz vor jedem Übergang zeigte die Show einen Frame lang ein veraltetes Bild (Zucken/Blitzen). Der erste Übergangs-Frame wird jetzt sofort gezeichnet.
- Fotos werden in einem eigenen Thread (Web Worker) geladen und vorbereitet; der Canvas dort rechnet auf dem Prozessor, damit er nicht mit der Grafikkarte konkurriert
- Das nächste Foto wird erst nach dem Übergang vorbereitet, nicht währenddessen
- Fotos werden in Streifen vorab auf die Grafikkarte geladen, ein Streifen pro Frame; keine Mipmaps mehr
- Alle Übergangseffekte werden beim Start vorkompiliert
- Gemessen (Testfotos, 1920×1080): Übergänge ohne langsame Frames; im A/B-Vergleich 0–8 statt 21–38 langsame Frames pro 10 s
- Für die Entwicklung: `PP_PERF=1` protokolliert langsame Frames, `PP_USER_DATA` trennt Testdaten von den echten Einstellungen

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
