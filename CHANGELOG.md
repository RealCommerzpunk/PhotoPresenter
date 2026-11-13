# Changelog

Alle Änderungen je Version. Format: neueste Version oben, Datum im Format JJJJ-MM-TT.

## 0.13.0 – 2026-11-13

- **Doppelte Fotos erkennen** (Allgemein → Doppelte Fotos): Vergleich des Bildinhalts per Wahrnehmungs-Hash, nicht nur nach Name oder Größe – auch verkleinerte, neu gespeicherte, umbenannte oder in anderes Format umgewandelte Kopien werden gefunden. Ähnliche Serienbilder gelten nicht als doppelt. Je Gruppe bleibt die Fassung mit der höchsten Auflösung (bei Gleichstand die größere Datei, dann der Name, der nicht nach Kopie aussieht)
- **Doppelte in der Show überspringen** (Schalter): Show und Galerie der Fernbedienung zeigen nur die beste Fassung
- **Aufräumen**: Dubletten in den Unterordner „Duplicates“ verschieben (wird nicht mehr eingelesen) oder in den Papierkorb legen
- Schon analysierte Fotos bekommen den Hash in einem schnellen Zusatzdurchlauf (ohne neue Gesichtserkennung)

## 0.12.5 – 2026-11-13

- **Gesichtsindex erkennt Fotos am Inhalt**: Ein Fingerabdruck (Größe + Anfang und Ende der Datei) verhindert, dass nach `git clone`, dem Entpacken einer ZIP oder dem Kopieren in eine andere Zeitzone alle Fotos neu analysiert werden. Ältere Indizes bekommen den Fingerabdruck beim nächsten Start nachgetragen
- Demo-Gesichtsindex in `Data/` mit Fingerabdrücken: Die Demo startet aus dem Repo und aus dem Demo-Download ohne Wartezeit
- **Demo zum Herunterladen** als Release auf GitHub (portable Programm + Demo-Fotos + Demo-Einstellungen)

## 0.12.4 – 2026-11-12

- **Produktseite** `docs/index.html` (für GitHub Pages) mit Clips der Show, Einstellungen und Fernbedienung
- **Fokus-Partner** ohne Herz: Symbol ☆ (nicht ausgefüllter Stern), der Partner kann jede zweite wichtige Person sein (Freundin, Kollege, Vater …)
- Behoben: Ein langer Pfad zum Datenordner machte die Seite „Allgemein“ breiter als das Fenster

## 0.12.3 – 2026-11-12

Vorbereitung auf ein öffentliches Repository.

- **Demo-Fotos** im Ordner `Photos` (163 Fotos von RDNE Stock project, Pexels-Lizenz): Ein frisch geklontes Repo bzw. ein Programm ohne Einstellungen startet gleich damit
- Code unter **MIT-Lizenz**; Nachweise für Fotos, Icon, Gesichtsmodelle, Schriften und GSAP
- `npm run demo` startet mit dem Demo-Datenordner `Data/` im Repo: Einstellungen und Gesichtsindex des Demo-Sets werden dort gespeichert und mit eingecheckt
- README auf Englisch (Haupt-README) mit Bild der Show, deutsche Fassung `README.de.md`; Hinweis zur Fernbedienung ohne Passwort

## 0.12.2 – 2026-11-12

- **Eigenes Programm-Icon** für die .exe, die Fenster, die Fernbedienung (auch als Lesezeichen und auf dem Startbildschirm des Handys) und GitHub. Icon von Three Musketeers (Flaticon), Nennung in README, Einstellungen und Paket
- **Schnellstart-Anleitung** `Quickstart.md` mit gestalteter PDF (`npm run quickstart`); die PDF liegt jedem Weitergabe-Paket bei

## 0.12.1 – 2026-11-12

- **Texte und Emojis verdecken keine Gesichter mehr**: Texte über Fotos wählen den Platz (Stil-Position, sonst unten, oben, Ecken, Mitte), an dem sie in ihrer Einblendzeit keine erkannten Gesichter überdecken – die Kamerabewegung wird mitgerechnet. Emojis von der Fernbedienung suchen sich ebenfalls freie Stellen neben den Gesichtern. Mittig gesetzte Stile dürfen jetzt in der Mitte bleiben, wenn dort kein Gesicht ist (bei noch nicht analysierten Fotos weiter vorsichtshalber unten)

## 0.12.0 – 2026-11-12

Zum Mitnehmen.

- **Portabel**: Die portable Windows-Version und das AppImage speichern Einstellungen, Texte, Personen und Gesichtsindex im Ordner `Data` neben der Programmdatei. Der ganze Ordner lässt sich kopieren (USB-Stick, anderer Rechner) – alles reist mit. Beim ersten Start werden die bisherigen Einstellungen aus dem Benutzerordner übernommen. Die installierte Version nutzt `Data`, wenn der Ordner neben dem Programm liegt
- **Paket für die Weitergabe** (Allgemein → Mitnehmen): erstellt einen Ordner „PhotoPresenter“ mit Programm, allen Fotos (`Photos`), den aktuellen Einstellungen und einer kurzen Anleitung (`README.txt`)
- Der Gesichtsindex speichert Pfade relativ zum Fotoordner: Nach dem Kopieren muss nichts neu analysiert werden, von Hand markierte Gesichter bleiben erhalten (auch bei USB-Sticks mit gröberen Zeitstempeln)
- **Texte „nur auf Abruf“**: Schalter je Text (🔀 im Ablauf / 📱 nur auf Abruf) in den Einstellungen und auf der Fernbedienung; Texte auf Abruf erscheinen nur, wenn sie per Fernbedienung eingeblendet werden
- **Fernbedienung kompakter**: Kopf mit einer Zeile Symbol-Knöpfen (◀ ⏸ ▶ ❄ QR ⏻), Reiter Live · Fotos · Ablauf · Fokus · Texte · Effekte · 3D statt einer langen Seite; „Live“ bündelt Emojis, Texte auf Abruf, eigenen Text, Effekte und 3D zum Sofort-Auslösen. Der zuletzt benutzte Reiter bleibt gemerkt
- **3D-Fotowelt → Foto ohne Sprung**: Das Eintauchen endet genau in der Größe und im Seitenverhältnis, in der das Foto danach steht (auch bei verkleinerten kleinen Fotos); der Rahmen der Kachel blendet aus, die Randfüllung blendet weich ein

## 0.11.1 – 2026-11-12

Bildschirm wählen.

- **Bildschirm für die Show** (Allgemein → Bildschirm): „wo gerade die Maus ist“ oder ein bestimmter Monitor; „Bildschirme anzeigen“ blendet auf jedem Monitor kurz seine Nummer ein. Ist der gewählte Monitor nicht angeschlossen, läuft die Show auf dem mit der Maus
- **Bereich**: Meldet Windows zusammengeschaltete Monitore als einen breiten Bildschirm (z. B. 5760 × 1134), füllt die Show auf Wunsch nur das linke, mittlere oder rechte Drittel bzw. eine Hälfte; solche Bildschirme werden in den Einstellungen erkannt und markiert
- Tastenhilfe in den Einstellungen auf aktuellem Stand (I, R, Q)

## 0.11.0 – 2026-11-12

Live-Fernbedienung: Rückmeldung, Emojis, Einfrieren, eigene Reihenfolge.

- **Rückmeldung auf der Fernbedienung**: Jeder Auslöser bestätigt sich als kurzer Hinweis („Herzen läuft bis zum nächsten Foto“, „Text eingeblendet“, „3D-Fotowelt startet: Kugel“); Fehler erscheinen gelb (z. B. „Show läuft nicht“, „3D lädt noch Vorschaubilder“)
- **Per Hand ausgelöste Texte und Effekte gehören zum aktuellen Foto** und blenden beim nächsten Übergang aus
- **Emojis**: Abschnitt „Jetzt auf dem Foto“ mit einstellbaren Emojis; ein Tipp lässt sie groß und schwebend über dem aktuellen Foto erscheinen, bis zum nächsten Übergang
- **Foto einfrieren** (❄ auf der Fernbedienung): Das Foto bleibt stehen, Zoom, Schwenk oder Kamerafahrt pendeln weich in einer Schleife weiter; Emojis, Texte und Effekte lassen sich währenddessen auslösen. „Auftauen“ oder Weiterblättern setzt den Ablauf fort
- **Galerie und eigene Reihenfolge** (Reiter „Fotos“): Vorschau aller Fotos; Antippen zeigt ein Foto als Nächstes, weitere werden angehängt. Die Reihenfolge ist sichtbar, das laufende Foto markiert; Tippen entfernt, Halten und Ziehen ordnet neu. Danach geht es normal weiter. Adresse mit `#fotos` öffnet direkt die Galerie
- **Taste I**: Info-Tafel mit Auflösung (Original, geladen, Bildschirm), aktuellem Zoom und Vergrößerung, Bewegung, Randfüllung, Gesichtern und EXIF (Aufnahmedatum, Kamera, Objektiv, Belichtung, Brennweite, GPS …); I blendet aus
- **Taste R**: öffnet die Fernbedienung als Fenster auf dem Laptop, bevorzugt auf einem zweiten Bildschirm; braucht kein Netzwerk und funktioniert auch bei ausgeschalteter Handy-Fernbedienung. Erneut R schließt es
- Nach der 3D-Fotowelt steht das Zielfoto erst ruhig im Vollbild, dann beginnt der Zoom; die übrigen Kacheln blenden beim Eintauchen aus
- Erster Effekt, erstes Emoji und die Info-Tafel ruckeln nicht mehr (Vorab-Aufwärmen beim Start)

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
