# Translating PhotoPresenter

PhotoPresenter ships with **German** (the source), **English**, **Spanish** and **French**.
Fixing a translation or adding a new language takes one small file and a pull request –
no programming needed. / Übersetzungen verbessern oder eine neue Sprache ergänzen geht ohne
Programmierkenntnisse: eine Datei, ein Pull Request.

All texts of the interface (settings window, slideshow messages, phone remote control, photo
info) live in one place: [`src/shared/i18n/`](src/shared/i18n/).

| File | Language |
|---|---|
| `de.ts` | German – the **source**; every new text is added here first |
| `en.ts` | English |
| `es.ts` | Spanish |
| `fr.ts` | French |

## Improve an existing translation

1. Open the file of your language (e.g. `es.ts`) – on GitHub you can use the pencil icon.
2. Each line is `'key': 'text',`. Change only the text on the right.
3. Keep these as they are:
   - **placeholders** in curly braces, e.g. `{n}`, `{name}`, `{path}` – move them where your
     grammar needs them, but do not translate or remove them;
   - **`|`** in texts like `'{n} photo|{n} photos'`: singular before, plural after the bar
     (picked by the number `{n}`);
   - `\n` (line break), symbols like ★ ☆ ✎ 📱 and file names such as `Photos`, `Data`, `Duplicates`.
4. Open a pull request. The automated checks (`npm test`) tell you if a placeholder is missing.

## Add a new language

Example: Italian (`it`).

1. Copy `en.ts` to `it.ts` and rename `export const en` to `export const it`.
2. Translate the texts on the right of each line (see the rules above).
3. Register the language in [`src/shared/i18n/index.ts`](src/shared/i18n/index.ts), four small edits:
   ```ts
   import { it } from './it'                      // 1. import
   export const LANGUAGES = ['de', 'en', 'es', 'fr', 'it'] as const   // 2. list
   export const LANGUAGE_NAMES = { ..., it: 'Italiano' }              // 3. name in its own language
   export const MESSAGES = { de, en, es, fr, it }                     // 4. dictionary
   ```
4. Optional: translate `README.txt` (key `main.export.readme`) – it goes into every package that
   the program creates.
5. Run `npm test`. It checks that every key exists and that placeholders match, and TypeScript
   reports missing keys. Then open a pull request.

To see your translation: `npm install`, `npm run dev`, then **Settings → General → Language**.

## Adding or changing texts in the code (developers)

- Never write interface text directly into the code. Add a key to `de.ts`, then to `en.ts`,
  `es.ts` and `fr.ts` (TypeScript will not compile until all four have it), and use
  `t('your.key', { name })`.
- Lists of choices (transitions, effects …) use `labelMap('prefix', ids)` and keys `prefix.id`.
- Texts of the phone page start with `remote.`; the page itself ([`src/main/remote.html`](src/main/remote.html))
  translates its German source texts through that dictionary, so a changed German text there needs
  the same change in `de.ts`.
- Not translated on purpose: the documentation ([Quickstart](Quickstart.md), CHANGELOG, session
  logs, comments), which stays German for now.
