# Jusic in frosted Mercury glass (master prompt for Fable 5.2)

You're taking over **Jusic**, my local music player, and rebuilding how the whole app looks and feels in one material: the frosted, satin, pillowy rose glass of my Mercury widget (its rounds 40 to 60), and turning it from an Edge app window into a real desktop app (Electron) with its own glass window frame. This is a redesign of a working app, not a fresh build. Everything it does today has to keep working, it has to stay light on my PC (a hard 5% CPU ceiling, measured), and the code has to stay small. Within those limits, I want you to go past the references: they are AI-generated mood targets, and I'd like the real thing to be better than them.

You'll work alone for a long run. This file is everything you need; when something isn't covered, use your judgement, write down what you decided and why in `HANDOFF.md`, and keep going.

---

## 1. Read first, in this order

All paths are in this repo (`C:\Users\g8rla\jusic-redesign`) unless stated. Some files are big: **search them, don't read them whole** (I have usage limits; stay lean, and don't fan out subagents).

1. `README.md`: what Jusic does and how I use it.
2. `design/references/frosted/`: the six reference images (section 3). Open all of them.
3. `design/MASTER_PROMPT.md`: the previous master prompt. Its feature list and hard rules carry over (sections 4 and 5 below restate them); its look ("Midnight Glass"), its mini-player and its desktop widget do **not**.
4. `HANDOFF.md`, top section "Current status", and the sections "What was tried and did not work" and "Open tests that need the PC". About 107 KB in all; read the top ~50 lines, then search. Section 8 below summarises what matters.
5. `AUDIT.md` (205 KB, search only): "What the real window showed (round 9)", "What the refraction experiment showed (round 10)", rounds 58 to 61, "The independent visual audit".
6. `REDESIGN_PLAN.md` sections 1 and 2 (why Electron, how `server.js` runs under it unchanged, the hardening; skip the parts about an engine in a hidden window and the widget), section 10 item 1 (why a see-through window can't be resized natively on Windows) and section 7 (the old performance table, superseded by section 6 here).
7. The code: `server.js`, `lib/`, `public/index.html`, `public/styles.css`, `public/js/*`. All of it is small enough to read.

---

## 2. What exists today

- **Server:** `server.js` (about 650 lines, Node 18+, no dependencies; Node 24 is installed) serves `public/` and a small API on `127.0.0.1:5175` (`config.json`): `/api/library`, `/api/state` (GET/PUT), `/api/scan`, `/api/thumbs`, `/api/reveal`, `/api/quit`, and `/api/live`, a server-sent-events stream that every open page holds; when the last one drops, the server quits about ten seconds later. It range-streams audio and serves artwork and thumbnails. `lib/id3.js`, `lib/audio.js`, `lib/titles.js` and `lib/library.js` read tags, durations and filenames and cache the library in `data/`.
- **Launch today:** my desktop shortcut runs `node server.js --app`: the server starts hidden and opens Edge or Chrome with `--app=<address> --user-data-dir=data/window` (its own profile, so the window has its own taskbar entry and remembers its size; `--window-size=1380,900` the first time only).
- **The redesign moves Jusic into Electron** (my decision on 22 November 2026): one opaque, frameless, resizable main window with its own glass title bar (section 3, "The window"). No floating mini-player and no desktop widget: I already have a finished Mercury desktop widget, separately. Don't build one, and don't change mine.
- **Front end:** `public/` is plain HTML, CSS and ES modules with no framework and no build step (about 4,500 lines of JS and 2,100 of CSS). `player.js` is the playback engine and Web Audio graph (`<audio>` → preamp → 10 biquads → analyser → destination, `setSinkId` for the output device); `eq.js`/`eqpanel.js` the EQ; `viz.js` the spectrum and beat detection; `art.js` thumbnails and the palette taken from the playing cover; `fx.js` the feel layer (ripples, tilt, beat pulse, colour glide); `eras.js` era detection; `output.js` the output device; `store.js` state; `ui.js`/`main.js` rendering; `settings.js` the settings panel; `util.js` helpers.
- **Fonts:** Montserrat, Outfit and Manrope are bundled in `public/fonts/` (added on the `redesign` branch). **Today's `index.html` still loads Inter from Google Fonts, which breaks the local-only rule: remove it.**
- **My data:** favorites, playlists, play counts, era choices, the EQ curve and settings live in `data/state.json`. The repo's `data/` is git-ignored and nearly empty. My real data is in my daily-use install, `C:\Users\g8rla\OneDrive\Documents\Claudington\jusic-player\data\` (`state.json`, `index.json`, `colors.json`, `art/`, `thumbs/`, `window/`). **That whole folder is read-only to you: never write, move or delete anything in it.** To test with my real data, *copy* `state.json`, `index.json`, `colors.json`, `art/` and `thumbs/` into this repo's `data/` (not `window/`).
- **Music:** `Z:/jusic`. Read-only, always.
- **What's on the `redesign` branch besides the app:** the Mercury widget prototype (`prototypes/mercury/`, WebGL2), capture tools (`tools/capture/`, run with `npx electron`; Electron 45.3.2 is already a dev dependency, so far used only by those tools), Blender and live-3D experiments, `AUDIT.md`, `HANDOFF.md`. None of the app code in `public/` was changed by that work except the fonts.

---

## 3. The look

### References (`design/references/frosted/`)

| File | What it shows |
|---|---|
| `frosted-library.webp` | **The main reference.** The full library window in rose glass. |
| `frosted-now-playing.webp` | The now-playing focus view: the ribbon large, a spectrum glowing behind and through it, an "Up next" card. |
| `frosted-components.webp` | The component sheet: track menu, 10-band EQ, settings, era chips, button states (rest, hover, pressed), and the ribbon on its own (labelled "Mercury mini-player"; a style reference only). |
| `frosted-library-blue.webp` | The same library themed from a blue/violet cover ("Cold Winters"): the colour follows the music. |
| `mercury-round60.png` | My widget at round 60, the still the look was generated from. |
| `mercury-round60-over-window.png` | The same widget over a busy window. |

They are mood targets made by an image model, not pixel specs. Match their material and mood closely, fix what an image model gets wrong (inconsistent spacing, glyphs, alignment), and beat them where you can. Sample colours from them yourself; the numbers below are descriptions, not measurements.

### The material: frosted Mercury glass

Everything in the app is made of one material. Get this right first; everything else is layout.

- **Thick, pillowy, smoky rose glass with a satin-frosted finish.** Soft and diffuse, not a mirror: light glows *inside* it and spreads, rather than reflecting a room in sharp lines. Slightly translucent, with soft refraction: what's behind shows as a dim, blurred, warm hint, never as legible detail.
- **Light, in this order of importance:**
  1. **Light carried inside the glass:** a lifted rose-grey glow, never black, rising toward the lower edges where light from below comes up through the body.
  2. **One soft, broad highlight on upper shoulders:** a wide satin sheen across the top of each rounded form.
  3. **A crisp hot line along top edges:** a thin peach-white line right on the silhouette, with slightly darker glass just inside it, so edges read as thick rolled glass rather than an outline.
  4. **A brighter roll of light along bottom edges:** thicker and warmer than the top line, coral at the sides with a near-white core, ending sharply at the silhouette.
- **Colour from the cover seeps into the glass.** The rims, the lower rolls, the glow inside the glass and the played part of the seek line take the playing album's colour. Highlights stay near white. Covers with little colour (white, grey, near-black) give silver glass, not an invented hue (see `prototypes/mercury/palette.js`: it blends toward silver below about 5 to 15% colourful pixels).
- **The album cover sinks into a glass pocket:** a rounded-square well with the glass rolling down into it on every side, a crisp highlight on the pocket's rim, a thin dark contact line where glass meets art. The art itself stays crisp and undistorted.
- **Buttons are deep round glass bowls:** dark inside, a soft coral rim (a broad crescent, strongest low), a silver highlight upper left, a warm glow low inside, a crisp white icon. States, from `frosted-components.webp`: hover brightens and warms the rim; pressed sinks the bowl and makes the rim hotter and the inner glow brighter.
- **Text:** crisp white Montserrat (bundled), always upright DOM text, never warped, refracted or blurred by the glass. Hierarchy as in the references: big bold headings ("Library", "Now playing"), semibold titles, artists and counts in a lighter weight at about 65 to 75% white, tabular numerals for times.
- **The room:** a dark, warm background (deep smoky maroon-brown in the rose theme) with soft, slow wisps of coloured light behind the glass, taking the album's colour (indigo and violet in the blue reference).

### The library window (`frosted-library.webp`)

- **The window is one big glass slab** with rounded corners and a glowing rim.
- **Sidebar:** a glass panel down the left whose lower edge flows into the ribbon's bulb. The Jusic logo; Library, Favorites, Recently played, Most played, Eras, Sessions with line icons; a "Playlists" heading and my playlists. The active item is a raised glass pill with a rosy glow. Settings, Rescan library and Quit jusic still live in the sidebar (bottom), restyled.
- **Top bar:** a long glass search capsule ("Search your music") and a glass sort capsule with a chevron.
- **Header:** "Library" large, the track count under it, and Play / Shuffle / Queue-all as three glass bowls with labels.
- **Track list:** clean rows on the glass, no boxes: thumbnail, Title, Artist, Album, Era, Duration. Era chips are small glass pills tinted with each era's colour. The playing row is a glass bar with a warm glow and a small bars icon.
- **The now-playing bar is the Mercury ribbon itself:** a poured glass shape along the bottom: a round bulb on the left holding the cover in its pocket; a waist where the title and artist sit; the upper lip rising on the right, carrying the volume line; prev / play-pause / next as bowls in a pod under that lip; the body tapering into a tail on the right. The seek line runs along the lower body: a glowing hot core for the played part, a bead of light at the playhead, a thin dim line for the rest, with times at each end; it dips under the cover and sweeps up to the right, following the ribbon. The volume line on the lip uses the same style.

### The now-playing focus view (`frosted-now-playing.webp`)

"Back to Library" capsule, a large "Now playing" heading, the ribbon large in the middle (with album and year under the artist), a spectrum of thin glowing bars rising behind the ribbon and showing softly *through* its glass, mirrored below as a fading reflection, and an "Up next" glass card on the right (thumbnail, title, artist, duration per row). The queue must stay drag-to-reorder, and today's file details must stay reachable here.

### Components (`frosted-components.webp`)

Track menu (glass panel, thin dividers, chevrons on submenus), the EQ (a glass panel, ten thin vertical tracks with glass-pill thumbs, a glowing curve through them, dB and frequency labels, the preamp set apart by a divider), settings rows with glass toggles (on: a coral-filled track and a white knob), era chips, the three button states, and the ribbon on its own (a style reference for the ribbon only; there is no mini-player mode). Style every other surface the same way: dialogs, the `?` shortcut overlay, toasts, the Set-era popover, the eras timeline, sessions, the output-device picker, empty and loading states.

### Colour follows the music (`frosted-library-blue.webp`)

The whole app retunes to the playing cover: glass tint, rims, glows, wisps, the active pill, the bowls' rims, the playing row, the seek line. Track changes glide from one palette to the next; they never cut.

### The window (Electron)

Jusic becomes a desktop app, so the window itself is part of the design:

- **One opaque, frameless main window** with the glass running right up to the top edge. Electron's `titleBarStyle: 'hidden'` with `titleBarOverlay` keeps Windows' own minimise, maximise and close (and the Snap Layouts flyout) while you draw the rest of the title bar; recolour the overlay from the palette on every track change (`setTitleBarOverlay`). Fully custom glass caption buttons, as in the references, are fine instead, but only if Snap Layouts, double-click to maximise and dragging still behave like any normal window.
- **Native resize, snap, maximise and minimise must keep working.** That's why the main window is **not** see-through (`transparent: true`): on Windows a transparent window loses native resizing, snapping and maximising (`REDESIGN_PLAN.md` section 10). Windows 11 rounds the window's corners (about 8 px); draw the glass rim hugging them instead of the reference's larger radius.
- **Try Windows 11's acrylic material** (`backgroundMaterial`): the system blurs the desktop behind the window at no cost to us, which could make the outer glass truly frosted. Keep it only if the room still reads dark and warm (the desktop a faint hint, nothing legible), it behaves when the window loses focus or is maximised, and it measures no cost. Otherwise drop it and say why.
- The title bar, window controls and anything else Electron-only are hidden when the page runs in a normal browser tab (`npm start`).

### Motion (my standing rules)

- **The glass stays still while music plays.** Only strong bass hits send a slight swell through it (a few pixels, fading in about half a second). I rejected a constantly moving, bouncing, beat-waving version as "way too much"; I approved the calm one.
- Interactions are physical but brief: press, release, hover, drag. Springs, not linear easing (`prototypes/mercury/springs.js` has the presets).
- Reduced motion: honour the Windows setting and add an in-app toggle. With motion off, everything still works and still looks finished.

---

## 4. Features

### Must survive (verify each one by hand at the end)

Library browsing (all tracks, favorites, recently played, most played, eras, sessions, my playlists) · search · sorting (including the Era column sort) · hiding duplicate copies (the toolbar toggle) · the header with Play / Shuffle / Queue-all · now playing with the spectrum, file details and the drag-to-reorder Up Next queue · right-click and `···` track menu (play next, add to queue, add to playlist, set era, jump to era, jump to session, reveal in Explorer, save a copy) · **eras** (detection, colour-tinted chips, the eras timeline view, Set era on hover for unknown rows, number keys and typing a new era name in the picker, `E` for what's playing) · the **10-band EQ** with preamp, presets, bypass and the live curve with the spectrum behind it · **audio output device** selection with fallback and return · palette theming from the playing cover · rescan library · settings · the full keyboard shortcut set (README table) and the `?` overlay · media keys and the Windows media overlay · resume where I left off · reduced motion · the Quit button, and closing the window quitting Jusic completely (server included) · `npm start` still working in a normal browser tab (without the window controls).

Don't drop any of these silently. If one has to change, say which and why in `HANDOFF.md` before you change it.

### New features I want

1. **The now-playing focus view** (above), reached from the ribbon (click the cover or title) and back with "Back to Library" or `Esc`.
2. **Crossfade** (a setting: on/off and a length, about 1 to 12 seconds; off by default). Equal-power, through the same EQ, analyser and output device. Manual skips get a short fade (about 150 ms), not the full crossfade; repeat-one and pause must behave; resume, the media overlay and play counts follow the incoming track.
3. **Normalize volume** (a setting, off by default): some of my songs are much quieter than others. Use ReplayGain or similar tags where a file has them; otherwise measure loudness without ever writing to the music files and without breaking the CPU budget (for example, measure a track while it plays and apply the result from then on, or analyse ahead in small throttled chunks). Apply it as a per-track gain before the EQ, capped so it never clips (no more than about +6 dB of boost). Store results under `data/` in a file that can be deleted and rebuilt.

4. **What the desktop app makes possible** (each is small, so build them all): prev / play-pause / next buttons in the taskbar thumbnail (`setThumbarButtons`) and the song's progress on the taskbar button (`setProgressBar`, shown as paused when paused); the window remembers its size, position and maximised state; launching Jusic again focuses the open window instead of starting a second copy; output device names without today's microphone prompt, if Electron's permission handler can allow it (check; otherwise keep today's flow). Media keys and the Windows media overlay must still work under Electron: check them early.

Not wanted: start with Windows, and a mini-player or floating window of any kind (my Mercury widget covers that).

### Your own ideas: send them to me

I reward creativity strongly. Two kinds:

- **Look, light, motion, colour and feel** inside the brief (how colour flows from the cover, how light moves, how interactions feel): just do them, within the motion rules and the budgets, and show me.
- **New features** (anything that changes what the app does): send me a short list early, one or two lines each with what it costs in code and CPU, and a sketch or screenshot where you can. Build the ones I say yes to. Don't stop and wait for my answer; carry on with the planned work.

---

## 5. Hard rules

- **My music folder is read-only.** Nothing ever writes to `Z:/jusic`.
- **My daily install is read-only:** `C:\Users\g8rla\OneDrive\Documents\Claudington\jusic-player` (copy out of it, never into it).
- **Stay local.** No network calls except to `127.0.0.1`: no CDNs, no Google Fonts, no telemetry.
- **Keep my data.** An existing `data/` folder (state, index, art, thumbs, colors) must load intact. New settings are new fields; unknown fields are preserved; the file format stays readable by today's app.
- **Keep `main` working.** Work on a new branch, `frosted`, created from `redesign` (which has this file and the references). Never commit to `main`, never merge into it; that's my call after I've approved the result.
- **Don't touch** the `mercury-3d` branch or its worktree (`C:\Users\g8rla\jusic-mercury-3d`) or my Mercury widget, and no Blender or 3D work.
- **Don't touch my desktop and Start Menu shortcuts.** `npm run shortcut` overwrites `jusic.lnk` in both places, and they launch my daily install. Test with a separately named shortcut (for example "Jusic frosted"). Pointing the real ones at the new app is my call, after I've approved it.
- **Keep the server's API and its port (5175 by default) as they are,** so the browser version and anything else that talks to it keep working.
- **Dev runs don't collide with my daily app:** if port 5175 is taken, run the new app on 5176, with its own Electron profile inside this repo's `data/`.

---

## 6. Performance: never more than 5% of my CPU

**The requirement:** Jusic must never take more than 5% of my CPU at any given time. My PC: Windows 11, 16 logical processors, RTX 3070; the main monitor is scaled 125% (record its refresh rate: `requestAnimationFrame` runs at the monitor's rate, possibly 144 Hz, so an uncapped loop draws 144 frames a second).

### What "5%" means

The share of the **whole machine** (all 16 logical processors), as Task Manager's Processes tab shows it, for all of Jusic's processes added together:

- **the new app:** Electron's main `electron.exe` **and every process under it** (GPU, renderer, the audio and network utility processes, the server's process, crashpad);
- **today's app (the baseline):** `node.exe` running this repo's `server.js`, plus the app window's browser process (the `msedge.exe` or `chrome.exe` started with `--user-data-dir=...\data\window`) and every process under it.

Find them by walking `ParentProcessId` from `Win32_Process`, re-listed every sample because processes come and go.

Per sample: (CPU time used by those processes in the interval) ÷ (interval × 16) × 100. 5% of the machine is about 0.8 of one logical processor.

**The gate:** in every scenario below, **no 1-second sample above 5.0%**. Not gated: the first 5 seconds after the window first paints at launch, and first-run work on an empty `data/` folder (report both anyway). A rescan *is* gated: throttle it; slower is fine.

### Targets under the gate (aim for these; they leave headroom)

| Scenario | Mean | Max 1-s sample |
|---|---|---|
| Idle, paused | ≤ 0.3% | ≤ 1% |
| Playing, library or focus view, no input | ≤ 1.5% | ≤ 3% |
| Minimised or fully covered, playing | ≤ 0.5% | ≤ 1% |
| Interacting, resizing | as low as you can | ≤ 5% |

Also report, without a gate: the GPU's 3D engine use for the same processes (`\GPU Engine(pid_<pid>_*engtype_3D)\Utilization Percentage`, summed; aim for 5% of the card or less while playing) and private memory.

### Scenarios

Run each at the default window size (1380 × 900) on the main monitor, and again maximised. Each scenario twice; report the worse run. Music playing from my real library at a normal volume (keep the app's own volume above zero; turn Windows' volume down if needed).

| # | Scenario | Length |
|---|---|---|
| S1 | Idle: Library view, paused, pointer outside the window | 60 s |
| S2 | Playing, Library view, no input, including one natural track change (with crossfade on, once it exists) | 120 s |
| S3 | Playing, now-playing focus view with the spectrum, no input | 120 s |
| S4 | Playing, the window visible but another app focused (for example Jusic on my second monitor) | 60 s |
| S5 | Interacting while playing: continuous wheel scroll through the whole library (20 s), the pointer sweeping across rows and the sidebar (10 s), the track menu opened and closed 10 times, the seek bead dragged (5 s), EQ bands dragged (5 s), a search typed and cleared, views switched 10 times | 60 s |
| S6 | Resizing while playing: the window resized continuously between 1100 × 700 and 1700 × 1050, about 60 steps a second (20 s); then maximise and restore 10 times (20 s) | 40 s |
| S7 | Minimised while playing | 60 s |
| S8 | Fully covered by another window while playing | 60 s |
| S9 | Ten track changes, one a second (palette glide each time) | 15 s |
| S10 | Rescan library | until done |

**Control:** run S6 once more on an empty dark page in the same app window. That is the browser's own floor for resizing; if the floor alone is over 5%, report it plainly with what Jusic adds on top, and tell me. Don't hide it.

### How to measure (build this first, in `tools/perf/`)

- A sampler (PowerShell or Node calling PowerShell) that finds the processes as above, samples CPU time every second, and writes every sample plus a summary per scenario to `design/perf/<date>-<label>.json`.
- A driver for the scenarios that doesn't move my real mouse: open a DevTools port on `127.0.0.1` for measurement runs only (behind a launch flag in Electron; a command-line switch for the Edge baseline). Node 24 has a global `WebSocket`, so a small dependency-free Chrome DevTools Protocol client is enough: `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`, and `Page.captureScreenshot` for your screenshots too. Resize, maximise, minimise and cover the window with Win32 calls (`SetWindowPos`, `ShowWindow`) on its handle. Note in the report that the DevTools connection was attached.
- **Measure before you change anything:** run the whole set on today's app in Edge, as I run it now (the current `public/` on this branch, which is `main`'s app plus fonts), and keep that report as the baseline. Once the shell is in (stage 1), measure today's unchanged interface inside Electron too: that separates what Electron itself costs from what the new design costs. Today's app may already break 5%: its CSS has nine `backdrop-filter` blurs, and the spectrum and feel layers run animation loops while playing.
- Report as a table per scenario, before and after: mean, p95 and max (% of machine), which process used the most, GPU 3D mean and max, memory; plus the conditions (what else was running, the card's total use at the start, monitor refresh rate, window size). Put the table in `HANDOFF.md` at every checkpoint that touches rendering, and in your final report.

### Design rules that make 5% possible

These are rules, not suggestions. If you break one, measure why it was worth it and write that down.

1. **Bake the glass; don't draw it live.** Render each glass surface once per size and palette (canvas or one WebGL context, then use the result as an image, a nine-slice `border-image`, or a layer), and re-render only when the palette changes (crossfade old bake to new with opacity) or after a resize settles. The satin look is diffuse, so baked light is exactly right for it; the expensive parts of the old widget were things that moved every frame.
2. **No live `backdrop-filter` on large areas** (and preferably none at all). The "frosted" hint of what's behind is faked: everything behind the glass is the app's own room, so draw a pre-blurred copy of it where glass covers it. **Nothing scrolls under frosted glass:** the list's scroll area ends above the ribbon or fades out before it.
3. **Frosting over live content means drawing that content a second time at low resolution, masked to the glass** (the spectrum through the ribbon), never a blur filter per frame.
4. **At most one WebGL context, rendering on demand.** No `requestAnimationFrame` loop runs unless something is visibly moving; every loop has one owner (a small scheduler) and a stop condition.
5. **Frame caps:** the room's wisps 20 to 30 fps (or pure CSS transform drift on a few pre-rendered layers, which costs the main thread nothing); the spectrum at most 60 fps and only while it's visible; time text once a second. The seek line can be a compositor animation (a linear transform over the remaining time, paused on pause) instead of a JS update.
6. **Animate only `transform` and `opacity`.** Never animate blur, `filter`, `box-shadow`, gradients, `background-position`, width or height. Keep `will-change` to the few elements that need it.
7. **Pause when unseen:** stop every visual loop and stop reading the analyser when the page is hidden (minimised) or the view isn't on screen; check that Chromium on Windows reports a fully covered window as hidden, and handle it if it doesn't.
8. **Resizing is cheap:** during a resize, stretch the last baked frame and re-bake once it settles (about 150 ms after the last change); `contain: layout paint` on panels; the track list virtualised (fixed row height, a few dozen recycled rows); nothing in JS that re-measures layout per resize event.
9. **The ribbon resizes without stretching:** build it in three parts (bulb, waist, pod and tail) or from its distance field at the real width, so the waist stretches and the bulb and pod keep their shape.
10. **Audio is never starved:** no long main-thread work during a track change (bake in a worker with `OffscreenCanvas` if it takes more than a few milliseconds).
11. **Keep Electron's main process idle.** It runs the window's message loop, so heavy or synchronous work there freezes dragging and resizing. Run `server.js` in an Electron `utilityProcess` (or a child Node process), not in the main process; no polling between processes; send state only when it changes.

---

## 7. Compactness

The app is small today and should stay small. Put the Electron main and preload files in `desktop/`, and measure with `git diff --shortstat main -- public server.js lib desktop` (text files only).

- **No frameworks, no build step, no bundler, no TypeScript.** Plain ES modules, as today. **Electron is the one dependency,** pinned to an exact version (45.3.2 is already in the repo; upgrade only with a reason). No packaging tools such as electron-builder: the shortcut runs the repo's own Electron, hidden, with no console window.
- **Runtime code** (`public/**/*.{js,css,html}`, `server.js`, `lib/**`, `desktop/**`): about 8,050 lines today. **Net growth at most +2,500 lines; aim for +1,800** (the shell itself should be a few hundred). Deleting code you replace counts in your favour; leave no dead code behind.
- **Shaders,** if you use any: one module, at most about 400 lines of GLSL.
- **Binary assets added to `public/`** (baked textures, images): at most 1.5 MB in total. Ship only the fonts you use; delete the others from `public/fonts/`.
- **Tools** (`tools/perf/`, capture scripts, the demo fixture) don't count toward the runtime budget but stay dependency-free and modest (aim for under about 800 lines together).
- Copying from `prototypes/mercury/` (`springs.js`, `palette.js`, ideas from `shape.js`) is welcome and counts toward the budget.
- Going over a budget needs a written reason in `HANDOFF.md`.

---

## 8. What the Mercury widget work taught (don't repeat the dead ends)

In November 2026 the widget went through about 70 rounds in a WebGL2 prototype, then a Blender model and a live 3D renderer. In short:

- **How the rounds 40 to 60 look was made** (the look I've now chosen; run it with `node prototypes/serve.js`, then `http://127.0.0.1:5190/prototypes/mercury/`, which defaults to that material, `?mat=1`; the last commit of that series is `375419c`, round 61): one full-screen fragment shader over a 2.5D height field built from the ribbon's outline as signed distances (`prototypes/mercury/shape.js` is the single source of the geometry for both drawing and hit-testing), lit by a procedural studio room plus **light painted region by region**. The terms that make the look have names you can search for in `prototypes/mercury/shaders.js` (2,500 lines: search, don't read): `BODY_GLOW` (light carried through the glass, rising toward the lower edge), `EDGE_GLOW` (the thick edge glowing, peach above and coral below), `EDGE_HOT` (the crisp hot line on the upper silhouette with dark glass inside it), `LOW_EDGE` (the bright lower roll), `BTN_RIM`, `BTN_GLOW`, `BTN_HALO` (the bowls' coral crescent, the glow low inside, the lit ring above). On top of that ran a 256 × 128 fluid simulation for the album pigment, a ripple field and a bloom pass.
- **What it cost** on this RTX 3070 (widget only, about 860 × 400 units at screen size): while playing at 120 draws a second, 7.5 to 8.5% of the card and about 1.7% of one CPU core; idle at 15 draws a second ("breathing"), about 0.9% of the card; hidden, zero. Real refraction by capturing the screen added about 2 points of GPU and 110 MB of memory and removed the widget from every screenshot and screen share; it was kept off. **A whole app window drawn that way every frame would cost several times more.** The light itself barely changes over time, which is why section 6 says bake it.
- **Dead ends:**
  - Chasing a photo-match by nudging one constant per round. By rounds 58 to 60 the changes couldn't be told apart at the size I look at things (half size). Make structural decisions, judge at half size, and stop tuning when it stops showing.
  - Material 2 (rounds 63 to 69: physically based Fresnel, reflections off the back face, zebra views) moved toward polished clear glass. That's **not** the look I've chosen; don't go there.
  - Blender proofs and live 3D meshes with baked light (the `mercury-3d` branch). High fidelity and cheap at run time (about 1.5% of the card at 60 fps) but a heavy pipeline for one shape. Not for this app.
  - Live screen-capture refraction: off, for the reasons above.
- **Lessons that still apply:**
  - Text on a curve read as warped italics, and text refracted by the surface's slope sheared letters. Keep text upright and crisp, with calm glass under it.
  - Album colour on everything reads as neon; an even glow round every outline reads as an inflatable. Colour belongs in the light (rims, lower rolls, the glow inside the glass, the played line); highlights stay near white.
  - White and near-black covers turned the glass khaki and bronze until the palette learned to fall back to silver (round 62, `palette.js`).
  - Pigment drawn as dim colour looked like muddy marble; draw colour as light.
  - Comparing a coarse grid of mean colour, or a brightness histogram, between a shot and the reference (the scratch tools `grid2.js` and `texture.js` in `design/captures/raw/`, if they are still there) told more than eyeballing. The reference's darkest glass is a lifted rose-grey, almost never black.
  - The shell is not where CPU goes; what you draw is. On this PC the widget prototype's see-through Electron window used about 0.03% of the whole machine idle and about 0.1% playing.
  - Electron in this repo: its binary downloads lazily (run `node node_modules/electron/install.js` if `electron.exe` is missing), and `npx electron` scripts outside the repository fail silently, so keep scripts inside it.
  - In this repo, `git checkout` writes Windows line endings; a scripted replace that expects plain newlines then fails (`sed -i 's/\r$//'` first). GLSL inside JS template strings breaks on a backtick in a comment.

---

## 9. How to work

### My working rules

- **Small checkpoints:** about 20 to 30 minutes of work each. Never start a change you couldn't finish and checkpoint in one go.
- **At every checkpoint:** commit, push `frosted`, and rewrite the "Current status" section at the top of `HANDOFF.md` (what got done, what's half-finished, the exact next step, the latest numbers). A fresh session must be able to carry on from the repo alone. (At the very start, `git mv` the current `HANDOFF.md` to `design/archive/HANDOFF-mercury.md` and start a fresh `HANDOFF.md` for this work.)
- **Updates to me:** I'm usually on my phone. Keep them short (what's done, what's next, anything you need from me), with a screenshot. In Claude Code, send it with `SendUserFile`.
- **If I send "wrap up":** finish or safely shelve the current checkpoint, commit, push, send a short summary, start nothing new.
- **Be honest.** If something falls short of a reference or a budget, say so plainly, with the numbers.

### Screenshots and comparisons

- Make a **demo library** for comparisons, so committed pictures never show my real library: the reference's tracks (Silver Current, Slow Motion, Rosewater, Night Drive, Half Awake, Blue Hour, plus Cold Winters for the blue theme, with the artists, albums, eras and times shown), covers cropped from the reference images, and a quiet synthetic audio source. It loads only with `?demo=1`, never in normal use, and lives with the tools.
- Capture the real app window (DevTools `Page.captureScreenshot`) at the reference's proportions, in the same state as each reference, and lay out **reference | ours** sheets at half size (`tools/capture/sheet.js` exists; or write a smaller one). Under each sheet list three to six concrete differences and which ones you've closed. Commit sheets to `design/captures/frosted/`.
- Shots with my real covers and library stay private in `design/captures/raw/` (git-ignored); send them to me, don't commit them.

### Stages

Each stage is several checkpoints. Stage 2 is the one place I ask you to wait for my answer before building on it; while you wait, do stage 3.

**Stage 0: Orient and measure today's app.** Read section 1's list. Create the branch, move the old handoff, start the new `HANDOFF.md`. Copy my real data into `data/` as described. Build `tools/perf/` and measure today's app across all scenarios: that's the baseline. Write a short `design/FROSTED_PLAN.md`: how each surface will be drawn, how it fits the budgets, the order of work, and the first list of your feature ideas. Send me the baseline table, the plan and the ideas.

**Stage 1: The desktop shell.** Today's interface, unchanged, inside Electron: the frameless window with a plain first version of the title bar, native resize, snap and maximise; the server in its own process on the same port; size and position remembered; a single instance; closing quits everything; launched hidden with no console window from a test shortcut; media keys and the Windows media overlay; output devices; every request blocked except to `127.0.0.1`; `npm start` still working in a browser. Measure it against the stage 0 baseline: that's what Electron itself costs. Send me the numbers.

**Stage 2: The material spike (wait for my answer before stage 4).** One page (`?spike=1` or a page under `design/`) showing the library reference's layout in the demo library: the window slab, the sidebar, one glass panel, three bowls in their states, the cover pocket and the ribbon with its seek and volume lines, in the rose palette and then the blue one. Measure it (S1, S2, S6 at least). Send me the reference | ours sheet and the numbers. This proves the material, the bake and the cost before the whole app depends on them.

**Stage 3: Foundations that don't depend on the look.** The render scheduler (one loop owner, frame caps, pause when unseen, reduced motion); the virtualised track list; the palette pipeline (silver fallback, smooth glides); crossfade and normalize volume in the engine, with their settings; the taskbar buttons and progress; the scenario driver finished. Measure.

**Stage 4: The library window in the new look,** with the glass title bar and the ribbon as the now-playing bar and every control in it working (seek, volume, prev/play/next, the cover opening the focus view). Sheet against `frosted-library.webp` and, with a blue cover, `frosted-library-blue.webp`. Measure.

**Stage 5: The now-playing focus view.** Spectrum behind and through the ribbon, Up next with drag-to-reorder, file details. Sheet against `frosted-now-playing.webp`. Measure.

**Stage 6: Every other surface:** track menu and submenus, the EQ panel, settings (output device, crossfade, normalize, reduced motion), the eras timeline, sessions, playlists, dialogs, the `?` overlay, toasts, the Set-era popover, empty and loading states. Sheet against `frosted-components.webp`. Measure.

**Stage 7: Above and beyond.** Your pass on colour, light, motion and feel (section 10), plus any feature ideas I've approved. Measure again: nothing here may break the gate.

**Stage 8: Verify and hand over.** Every feature in section 4, checked by hand one by one, with how you checked it. My copied `data/` before and after: favourites, playlists, play counts, era choices and the EQ curve unchanged (a small script that compares them). The full scenario set, before and after. Final sheets against all four app references, plus private real-cover shots. Update `README.md`. Check that `npm start` and the test shortcut launch it cleanly, and write down exactly how to point my real shortcuts at it once I approve (don't do it yourself). Report the code and asset budgets.

---

## 10. Going above and beyond

I want to see what you can do. Some seeds; your own ideas are worth more than these:

- **Colour flowing from the cover:** on a track change the new colour seeps out of the cover's pocket into the ribbon and then across the app (rims, bowls, chips, wisps) like dye through frosted glass, rather than every surface fading at once. Cheap to do as a mask or opacity reveal over the newly baked palette.
- **Light that feels physical:** a soft sheen that drifts toward the cursor on the ribbon and the bowls (small elements only); the warm glow under a row as you hover it; the bead swelling and a time preview rising as you drag the seek line.
- **Music in the glass, calmly:** the spectrum glowing through the ribbon in the focus view; the slight bass swell; the playing row's small bars icon.
- **Interaction feel:** bowls that sink on press and spring back with a touch of overshoot; menus that grow out of the glass they came from; views that slide like layers of glass.

Every idea has to stay inside the motion rules (still glass, subtle and occasional reactions), the CPU gate and the code budget. In your final report, list the specific ways the result goes beyond the references, with screenshots.

---

## 11. Done means

- Every feature in section 4 works, verified one by one (the list is in the final report).
- Crossfade, normalize volume, the focus view and the desktop-app extras (section 4, item 4) work; the feature ideas I approved are in.
- The app matches or beats all four app references in material and mood, shown on reference | ours sheets at half size, and the colour follows the cover (rose and blue shown).
- **The CPU gate holds:** in every scenario S1 to S10, at the default size and maximised, no 1-second sample above 5.0% of the machine; the before/after table, GPU and memory reported, the conditions stated.
- The code and asset budgets are met (or each overrun is justified in `HANDOFF.md`).
- My existing `data/` loads intact, and nothing was written to `Z:/jusic` or to my daily install.
- It's a real desktop app: a frameless glass window with native resize, snap and maximise, no console window, and a clean quit.
- `main` is untouched; `frosted` is pushed; `README.md` is updated; my real shortcuts are untouched, with the steps to switch them written down.
- A short final message to me: what you built, the numbers, where it beats the references, what (if anything) still falls short, and the decisions I need to make (starting with whether to merge into `main`).
