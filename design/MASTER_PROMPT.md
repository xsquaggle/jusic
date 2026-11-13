# Jusic: the redesign (master prompt for Fable 5.2)

You're taking over **Jusic**, my local music player, and turning it into the most beautiful music player I've ever used. This is a redesign of a working app, not a fresh build. Everything it does today has to keep working. What changes is how it looks, moves and feels, plus a brand-new desktop widget.

I want you to go all out. Show what you can do creatively and technically. Don't settle for the safe version of anything. If you find yourself building something that looks like every other dark-mode player, stop and push further. Time isn't a constraint; quality is the only thing I care about.

---

## 1. What exists today (read the code before you change anything)

The repo is the current, working Jusic. Read `README.md` first, then the code.

- **Backend:** `server.js` is a small dependency-free Node HTTP server on `127.0.0.1:5175`. It scans my music folder (`Z:/jusic`, set in `config.json`), reads ID3 tags and embedded covers (`lib/id3.js`, `lib/audio.js`), parses metadata out of filenames (`lib/titles.js`), caches everything in `data/` (`lib/library.js`), range-streams audio, and serves artwork and thumbnails.
- **Frontend:** `public/` is plain HTML/CSS/ES modules with no framework and no build step. `player.js` is the playback engine and Web Audio graph. `eq.js`/`eqpanel.js` are a 10-band EQ with preamp and presets. `viz.js` is the spectrum visualizer and beat detection. `art.js` handles thumbnails and the palette extraction that themes the UI from the current cover. `fx.js` holds the feel layer: ripples, tilt, beat pulse, colour glide. `eras.js` is era detection. `output.js` picks the audio output device. `store.js` is state. `ui.js`/`main.js` render the UI.
- **How it launches:** my desktop shortcut runs `node server.js --app`, which starts the server hidden and opens Edge/Chrome in `--app` mode. The server exits when the last window closes.
- **My data:** favorites, playlists, play counts, era overrides, the EQ curve and settings live in `data/state.json`. That file isn't in the repo, but it is on my PC, and the redesigned app has to read the existing one without losing anything.

### Features that must survive the redesign (in the full app)

Library browsing (all tracks, favorites, recently played, most played, eras, sessions, my playlists) · search · sorting · hiding duplicate copies · the hero header with Play/Shuffle/Queue-all · the now-playing panel with spectrum, file details and the drag-to-reorder Up Next queue · right-click / `···` track menu (play next, add to queue, add to playlist, set era, jump to era/session, reveal in Explorer, save a copy) · **eras** (detection, colour-tinted chips, the eras timeline view, manual era setting with `E`) · the **10-band EQ** with preamp, presets, bypass and live curve · **audio output device** selection with fallback/return · palette theming from the current cover · rescan library · settings · the full keyboard shortcut set and the `?` overlay · media keys and the Windows media overlay · resume where I left off · reduced-motion support.

Don't silently drop any of these. If one truly has to change, say which one and why in your plan before you touch it.

### Hard rules

- **My music folder is read-only.** Nothing ever writes to it.
- **Stay local.** Everything runs on my machine, with no accounts and no network calls except to `127.0.0.1`.
- **Keep my data:** an existing `data/` folder (state, index, art cache) must keep working after the upgrade.
- **Keep `main` working.** Do all work on a `redesign` branch. `main` stays the current, working Jusic until I've approved the new one.

---

## 2. The look: two surfaces, two personalities

Reference images are in `design/references/`. Study them closely. They're mood targets, not pixel specs. Beat them where you can.

### A. The full app: layered glass ("Midnight Glass")

References: `app-layered-glass.png` (main reference), `app-midnight-mini-player.png`, `app-resonance-spectrum.png`.

- **2.5D layered glass.** The UI is built from thick frosted-glass sheets floating at different depths. The cover is the foreground slab, the controls and content sit in the middle, and an ambient glow sits at the back. Glass should have real presence: refraction or blur of what's behind it, bright beveled edges, specular highlights, soft coloured light bleeding through, and shadows cast onto lower layers.
- **Reacts to my mouse.** Layers parallax and tilt slightly toward the cursor, with spring physics instead of linear lerps. A light sheen slides across the glass from the cursor's direction. Keep it subtle on the big library list so reading and scrolling never feel wobbly. Make it strongest on the now-playing area.
- **Spectrum in a basin** (from `app-resonance-spectrum.png`). The visualizer becomes a deep, curved, layered contour landscape set *behind* the control surface, glowing through the glass. It should be beat-reactive, driven by the existing analyser, and stay smooth.
- **Colour comes from the music.** Keep and upgrade the existing palette theming. The references show cyan/violet because of that cover, but the whole app should take its accents, glows and ambient light from whatever's playing, gliding between palettes on track change.
- **A mini-player mode inside the app** (from `app-midnight-mini-player.png`, middle card, which I love). One click shrinks the app window to that compact glass card: cover, title, artist, seek, shuffle/prev/play/next/repeat, volume and a queue button. Another click expands it back. It's the same app and the same window, just compact.
- **Typography and polish.** Clean geometric sans-serif, generous spacing, nothing cluttered. It should feel like a premium object, not a database. Library rows, the sidebar, menus, dialogs, the EQ panel, settings and the shortcuts overlay all get the full treatment, not just the now-playing view.

### B. The desktop widget: liquid chrome ("Mercury")

References: `widget-mercury.png` (main one), `widget-mercury-flow.png`, `widget-mercury-split.png`. I love all three. Take the best of each, or propose a version that beats them.

This is a **separate, frameless, transparent, always-on-top window** that floats on my desktop. There's no rectangle behind it, just the chrome shape itself and its glow and shadow.

- **The form** is a living ribbon of liquid chrome. The cover is set into one end, title and artist sit in the body, prev/play/next are pressed into the surface as glass-chrome buttons, the ribbon's lower edge is the timeline with a luminous bead, and volume sits on the raised upper-right lip.
- **Pigment from the cover.** The chrome is tinted by the album's palette (the coral in the references comes from that cover). As the song plays, colour pigment slowly bleeds out of the cover and flows through the chrome. On a song change, the artwork dissolves into liquid pigment, flows across the ribbon and resolves into the next cover.
- **Moves with the music.** The ribbon flexes subtly with the audio, and waves travel through its fold. From Split: a spectral surface can glow through the gap or fold.
- **Reacts to my mouse.** The cursor draws a small dimple and a travelling reflection across the surface, and reflections follow the cursor. Parts can lean toward it, as in Split, where the upper layer leans while the controls stay steady.
- **Jelly haptics.** Every interaction should feel physical: press squash-and-stretch, a wobble on release, a shallow ripple spreading through the metal from where I clicked, and a springy bead drag on the timeline. Controls and text must stay crisp and readable while the surface moves around them.
- **Widget features (minimal on purpose):** cover, title, artist, prev / play-pause / next, seek with a precise time preview while dragging, and volume. That's all it needs. It doesn't need the library, EQ or eras. Also give it a way to open the full app, a way to close it, and a way to drag it around, and remember its position.
- **Practical details:** clicks on the transparent areas around the shape must pass through to my desktop. Hovering should never block what's underneath outside the visible chrome. Give me a toggle (tray menu, app button and keyboard shortcut) to show or hide the widget, plus an option to start it with Windows.

The widget and the app are **the same player**. They share one playback engine, so pressing pause in either one pauses both, and both always show the same state.

---

## 3. Technical direction (verify, then decide)

- **Shell:** the widget needs real transparent, frameless, always-on-top, click-through windows, which Edge `--app` can't do. Wrap Jusic in a proper desktop shell. **Electron** is the natural fit because the backend is already Node, so `server.js` and `lib/` can run in the main process with no sidecar. Tauri (I have Rust installed) is the alternative. Check both against the requirements above on Windows (per-pixel transparency, click-through on transparent pixels, GPU acceleration, memory footprint) and pick one, with your reasoning in the plan.
- **Rendering:** the liquid chrome and pigment flow will need real GPU work: WebGL/WebGPU shaders (SDF or metaball surfaces, environment-map reflections, refraction, a small low-resolution fluid simulation for the pigment). Use whatever gives the best result; three.js or raw shaders are both fine. The app's glass can mix CSS (backdrop-filter, layered transforms) with WebGL where CSS isn't enough.
- **Performance is part of quality.** I run games and FL Studio on this PC (RTX 3060, 32 GB RAM). Targets:
  - a locked, smooth 60 fps in both surfaces;
  - the widget sits near zero GPU when paused or idle, throttles when hidden or occluded, and never causes audio glitches;
  - nothing janks while the library scrolls.
  
  Measure these, don't guess.
- **Audio stays untouched in quality.** The EQ, output-device routing and analyser have to work exactly as before, now feeding both surfaces.
- **Reduced motion:** honour the OS setting and add an in-app toggle. Everything must stay fully usable with motion off.
- **Launch:** update the desktop shortcut and Start Menu entry so double-clicking opens the new app exactly the way it opens today (no console window, quits cleanly). Use the existing icon unless you design a better one, and if you do, show me.

---

## 4. How to work

1. **Read and plan first.** Read the whole codebase and `design/references/`. Then write `REDESIGN_PLAN.md` and send it to me *before* writing app code. It should cover the shell choice, the rendering approach, how you'll keep every feature, a motion and interaction spec (timings, easing, spring constants, what reacts to what), performance targets, and build phases. Include a list of anything you'd do differently from my references and why.
2. **Prove the hardest part early.** Build the Mercury chrome-and-pigment prototype as a standalone test page before integrating it, and show it to me. That's where the risk is.
3. **Build in phases,** committing and pushing to `redesign` as you go, with clear commit messages.
4. **Check your own work against the references.** Capture screenshots and short recordings at matching moments (idle, hover, press, track change, seek drag) and compare them honestly against the reference images. Iterate until you'd show it off. "Works" isn't the bar; "makes someone stop and stare" is.
5. **Test on my real PC** (Windows, RTX 3060, 32 GB RAM) with my actual library, not just in a sandbox. Transparency, click-through and GPU behaviour only show their real problems there.
6. **Updates to me:** I'm usually on my phone, so keep progress messages short: what's done, what's next, and anything you need from me. Send screenshots and recordings whenever there's something to see.

### Done means

- Every feature in section 1 works in the new app, verified one by one.
- The full app and the Mercury widget both match or beat the references' look and feel.
- The widget is transparent, click-through outside its shape, always on top, draggable, remembered, and in sync with the app.
- Performance targets are met and measured.
- My existing `data/` (favorites, playlists, play counts, eras, EQ) loads intact.
- The desktop shortcut launches it cleanly.
- `README.md` is updated for the new app.
