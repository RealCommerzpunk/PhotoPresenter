---
name: session-ende
description: Schließt eine Arbeitssitzung an PhotoPresenter ab. Bringt CHANGELOG.md, CLAUDE.md, docs/PLAN.md und die Memory auf den aktuellen Stand, committet und pusht, und gibt am Ende eine fertige /compact-Zeile aus.
disable-model-invocation: true
---

# Session-Ende

Schließe die laufende Sitzung so ab, dass die nächste Sitzung ohne Vorwissen weitermachen kann.
Arbeite die Schritte der Reihe nach ab. Ändere Dateien mit Edit/Write, nicht per Skript.

## 1. Stand erfassen

- `git status` und `git log --oneline` seit dem letzten Eintrag in `CHANGELOG.md` ansehen.
- Aus dem Gesprächsverlauf sammeln: was gebaut oder geändert wurde, welche Entscheidungen der Nutzer getroffen hat, was offen ist, welche Stolperfallen aufgetreten sind.

## 2. Prüfen

`npm run typecheck`, `npm run lint` und `npm test` einzeln ausführen. Schlägt etwas fehl: beheben oder im Abschlussbericht ehrlich nennen, nicht verschweigen.

## 3. CHANGELOG.md

- Neue Version oben eintragen bzw. die laufende ergänzen (Schema `0.<meilenstein>.<patch>`, Datum JJJJ-MM-TT).
- Nutzersicht: was kann die App jetzt, was wurde behoben. Keine Dateilisten.
- `version` in `package.json` auf dieselbe Version setzen.

## 4. CLAUDE.md

Nur dauerhaft Gültiges: neue Arbeitsregeln, Architekturänderungen, Stolperfallen, die wieder auftreten können.
Veraltetes streichen. Kurz halten; keine Sitzungsprotokolle, die gehören in den Changelog.

## 5. docs/PLAN.md

- Erledigte Meilensteine/Punkte als erledigt markieren (✅), Abweichungen vom ursprünglichen Plan nachtragen.
- Neue Entscheidungen des Nutzers einarbeiten; „Offene Punkte für später“ pflegen.
- Den Fahrplan in `README.md` gleich halten.

## 6. Memory

Memory-Verzeichnis: `C:\Users\haugu\.claude\projects\c--service-hunda-PhotoPresenter\memory\` mit Index `MEMORY.md`.

- Vorlieben und Rückmeldungen des Nutzers (wie er arbeiten will, was er nicht will) als `feedback`/`user`-Einträge sichern oder bestehende aktualisieren.
- Laufender Projektstand (aktueller Meilenstein, nächster Schritt, offene Fragen) als ein `project`-Eintrag, absolute Daten.
- Nichts doppeln, was schon in CLAUDE.md, Changelog oder Git steht. Falsch gewordene Einträge löschen, Index aktualisieren.

## 7. Commit und Push

- Alle Änderungen committen, Nachricht auf Deutsch, z. B. `Session-Ende: Doku auf Stand 0.x.y`, mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commit-Nachricht erst in eine Datei schreiben, dann `git commit -F <datei>`.
- `git push`. Keine GitHub Actions anlegen oder auslösen.

## 8. Abschluss

Gib dem Nutzer einen kurzen Bericht auf Deutsch: Version, was in dieser Sitzung fertig wurde, was offen ist, nächster Schritt.
Ende mit dieser Zeile, ausgefüllt, zum Kopieren:

```
/compact Stand PhotoPresenter <version>: <ein Satz zum Erreichten>. Weiter mit: <nächster Schritt>. Details in CLAUDE.md, CHANGELOG.md, docs/PLAN.md.
```

Weise darauf hin, dass `/compact` ein eingebauter Befehl ist, den nur der Nutzer selbst abschicken kann.
