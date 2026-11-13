<p align="center"><img src="resources/icon.png" width="128" alt="PhotoPresenter"></p>

<h1 align="center">PhotoPresenter</h1>

<p align="center">
  A lively full-screen photo slideshow for Windows and Linux – random order, smooth camera moves,
  creative transitions, face focus, animated texts and a phone remote control.
</p>

<p align="center"><b>English</b> · <a href="README.de.md">Deutsch</a> · <a href="https://realcommerzpunk.github.io/PhotoPresenter/">Product page (German)</a></p>

<p align="center"><img src="docs/images/show.jpg" width="720" alt="PhotoPresenter showing a demo photo"></p>

> The interface is available in **German, English, Spanish and French** (Settings → General → Language). Most documentation is still German. Want to add or improve a language? See [TRANSLATING.md](TRANSLATING.md).

## Features

- **Photos from a folder** in random order without repeats, filling the screen as far as possible.
  Empty borders are filled unobtrusively from the photo itself (blur, colour gradient or mirror).
- **Camera motion** (Ken Burns): zoom in/out, pans and camera journeys – never beyond the photo's edge
  and never blowing up small photos beyond a configurable limit.
- **13 GPU transitions** (fade, wipe, swirl, ripple, zoom blur …) and particle effects (confetti, hearts,
  snow, fireworks …).
- **"From … to" ranges everywhere:** display time, motion intensity, transition duration and effects can be
  fixed or randomised per photo.
- **Face focus:** teach the app a person (offline face recognition, YuNet + SFace); photos showing them get a
  camera move onto their face, optionally panning across the other faces first.
- **Texts:** filler texts between photos or texts tied to photos (before, over or after), 12 animated styles
  plus your own. Texts and emojis automatically avoid covering faces.
- **3D photo world:** an occasional interlude where the photos form a sphere, helix, tunnel, wobbly jelly cube …
  and the camera dives into the next photo.
- **Phone remote control** via QR code (local network, no app needed): pause, skip, freeze a photo, trigger
  emojis, texts, effects and the 3D world, pick the next photos from a gallery.
- **Portable:** the portable build keeps all settings next to the program; one click creates a hand-over
  folder with program, photos, settings and face index for another computer.

## Try it

**Demo download (Windows):** get `PhotoPresenter-Demo-x.y.z.zip` from the
[latest release](https://github.com/RealCommerzpunk/PhotoPresenter/releases/latest), unzip it and double-click the `.exe` – nothing to install. It contains the program,
163 demo photos and ready-made demo settings with face recognition already done. The release also offers the
portable program alone and an installer.
Windows SmartScreen warns because the build is not signed ("More info" → "Run anyway").
A step-by-step guide (German) is in [Quickstart.md](Quickstart.md) / [Quickstart.pdf](Quickstart.pdf).

**From source** – requires Node.js ≥ 22.12:

```bash
git clone https://github.com/RealCommerzpunk/PhotoPresenter.git
cd PhotoPresenter
npm install
npm run models          # download the face recognition models (once, ~39 MB, checksums verified)
npm run demo -- --show  # start straight into the slideshow with the demo photos and demo settings
```

`npm run demo` uses the bundled demo photos in [`Photos/`](Photos/) (163 photos by
[RDNE Stock project](https://www.pexels.com/@rdne/) on Pexels) and the demo settings and face index in
[`Data/`](Data/). Plain `npm run dev` uses your personal settings folder instead; on its very first start it
also picks up `Photos/`. Choose your own folder in the settings window (**Allgemein → Fotos**).

### Keys in the slideshow

| Key | Action |
|---|---|
| Esc | quit the show |
| Space | pause / resume |
| ← / → | previous / next photo |
| I | photo info (resolution, zoom, EXIF) |
| Q | show the QR code for the phone remote |
| R | open the remote control as a window |
| D | frame rate |

## Development

```bash
npm run dev            # app with hot reload
npm test               # unit tests (Vitest)
npm run typecheck
npm run lint
npm run dist:win       # Windows installer + portable .exe in dist/
npm run dist:linux     # AppImage + .deb (run on Linux or WSL)
npm run quickstart     # rebuild Quickstart.pdf from Quickstart.md
```

Stack: Electron, TypeScript, electron-vite, React 19 + Tailwind CSS v4 (settings), PixiJS v8 (slideshow),
Three.js (3D world), GSAP (text animation), onnxruntime-web (face recognition), zod (settings schema).

```
src/main/               Electron main process: windows, IPC, settings, photos, face index, remote server
src/preload/            secure bridge between main process and windows (window.api)
src/shared/             shared code: types, settings schema, random ranges, face math
src/renderer/settings/  settings window (React + Tailwind)
src/renderer/show/      full-screen slideshow (PixiJS/WebGL, transitions, effects, 3D world)
src/renderer/indexer/   hidden window for face detection and thumbnails
```

Useful switches for development (dev builds only): `PP_USER_DATA=<dir>` keeps test settings away from your real
ones, `PP_SHOW_WINDOWED=1` shows the slideshow in a window, `PP_PERF=1` reports slow frames.
More in [CLAUDE.md](CLAUDE.md) (German), the plan in [docs/PLAN.md](docs/PLAN.md), changes in [CHANGELOG.md](CHANGELOG.md).

> If `ELECTRON_RUN_AS_NODE=1` is set in your shell (some editor terminals do this), Electron starts as plain
> Node and the app fails with `Cannot read properties of undefined (reading 'whenReady')`. Unset it first.

## Privacy and security

- Everything runs **offline** on your computer; photos and face data never leave it.
- The phone remote is a small web server in your **local network without a password** – anyone on the same
  network can control the show. Turn it off in the settings (**Allgemein → Fernbedienung**) on untrusted networks.

## Status

In active development (version 0.x). Roadmap: performance on 4K screens, Linux installer testing, first
release `v0.1.0`, multilingual documentation and product page, HEIC/RAW support, videos, background music.

## License and credits

The **source code** is licensed under the [MIT License](LICENSE).

Bundled or downloaded third-party content keeps its own license:

- **Demo photos** in [`Photos/`](Photos/): by [RDNE Stock project](https://www.pexels.com/@rdne/) on Pexels,
  [Pexels License](https://www.pexels.com/license/) – not covered by the MIT License, see
  [Photos/CREDITS.md](Photos/CREDITS.md).
- **App icon:** [Three Musketeers – Flaticon](https://www.flaticon.com/authors/three-musketeers).
- **Face models** (downloaded by `npm run models`, not in the repository): YuNet (MIT) and SFace (Apache-2.0)
  from the [OpenCV Model Zoo](https://github.com/opencv/opencv_zoo).
- **Fonts** via [Fontsource](https://fontsource.org/): SIL Open Font License.
- **GSAP** under the [GSAP Standard "No Charge" License](https://gsap.com/standard-license); Electron, PixiJS,
  Three.js, React, onnxruntime-web, exifr, zod and the other npm dependencies under their own (mostly MIT) licenses.
