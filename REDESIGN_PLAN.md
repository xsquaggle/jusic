# Jusic redesign plan

Status: **plan sent, no app code written yet.** Work happens on the `redesign` branch. `main` is untouched.

This is the plan you asked for before any app code. It covers the shell choice, the rendering approach, how every existing feature survives, the motion spec, performance targets, the build phases, and where I'd depart from your references.

Two things you should know up front:

1. **I can't reach your PC from this session.** Your `jusic ye` folder is in your Remote Control list, but that computer doesn't offer it to cloud sessions (using a folder from a cloud session isn't available to everyone yet). So everything Windows-specific (transparency, click-through, tray, media overlay, real GPU numbers, your real library) can't be tested by me from here. Section 9 says how I handle that honestly. You can also do the on-PC part in a session that runs on that computer.
2. **Two existing features move, none are dropped.** The spectrum moves from the strip under the now-playing cover into the control deck (section 4), and the track list becomes virtualised (same behaviour, far fewer DOM nodes). Details below.

---

## 1. Shell: Electron

**Decision: Electron 45 (Chromium 156, Node 24), pinned to an exact version.**

| Requirement | Electron | Tauri 2 (WebView2) |
|---|---|---|
| Per-pixel transparent, frameless, always-on-top window | Yes (`transparent`, `frame: false`, `alwaysOnTop`) | Yes |
| Click-through on transparent pixels only | **Yes.** `setIgnoreMouseEvents(true, { forward: true })` keeps mouse-move events flowing to the page on Windows, so the page can hit-test the chrome shape and switch click-through on and off as the cursor crosses its edge. | **No built-in way.** `set_ignore_cursor_events(true)` stops all mouse events, so the page can't tell when the cursor comes back (tauri#9250). The workaround is polling the global cursor from Rust 60 times a second and hit-testing by hand. There is also an open report of it not working on Windows 10 (tauri#11461). |
| GPU acceleration | Chromium, WebGL2 via ANGLE/D3D11 | Same engine (WebView2 is Chromium), same result |
| Memory | About 450–600 MB with the full app open, about 300–350 MB widget-only (estimate, to be measured) | Roughly 10–20% less, minus whatever the backend costs |
| Backend | `server.js` and `lib/` run **unchanged inside the main process**. No sidecar. | Port the ID3 reader, filename parser and scanner to Rust (a rewrite of code that must behave identically), or ship Node as a sidecar process. |
| Build on your PC | `npm install` downloads a prebuilt `electron.exe`. Nothing to compile. | Needs the Rust toolchain, MSVC build tools and a compile step. I can't produce a Windows build from here. |

The deciding points are click-through and the backend. Electron has the exact primitive the widget needs, and it lets the working backend stay byte-for-byte the same, which is the safest way to honour "everything it does today has to keep working". Tauri's memory advantage is real but small, and irrelevant on 32 GB.

What I verified, and how:
- Electron's forward mode and Tauri's lack of one: from the Electron docs and the Tauri issue tracker.
- Electron 45 installs and runs here (Linux, virtual display), including transparent frameless windows and hidden windows that keep running timers.
- **Not yet verified:** the behaviour on your actual Windows desktop. That is the first thing the widget prototype has to prove on your PC (section 9).

One install-time note: `npm install` downloads Electron once (about 110 MB) from GitHub. After that the app makes no network calls. I enforce this in code: the Electron session **blocks every request that isn't to `127.0.0.1`**, and spellcheck (which would fetch dictionaries) is off. The current app actually breaks your rule today by loading the Inter font from Google; the redesign bundles its fonts locally.

---

## 2. Architecture: one engine, two surfaces

```
Electron main process
 ├─ server.js + lib/        (unchanged logic; started in-process, same port 5175, same data/)
 ├─ tray, global shortcut, start-with-Windows, single-instance lock
 └─ windows
     ├─ core   (hidden)     the engine: <audio>, Web Audio graph, EQ, analyser,
     │                      output device, media session, queue, and all saved state
     ├─ app    (Midnight Glass)   the full player, also the mini-player
     └─ widget (Mercury)          transparent, frameless, always on top
```

**The engine lives in its own hidden window.** Both the app and the widget are views of it. That is what makes "pause in one pauses both" true by construction instead of by syncing two players. It also means:

- Closing the app window doesn't stop the music if the widget is up. The engine and widget keep going; the app window is rebuilt on demand.
- The audio pipeline sits in a process that does nothing else, so shader work in the app or widget can't starve it.
- With "start with Windows", only the engine and the widget load. The library UI isn't created until you open it.

**How they talk.** All three windows are pages on the same origin, so they share a `BroadcastChannel`. The engine broadcasts state (track, queue, playing, time, volume, saved state changes) and a small analysis frame 60 times a second (64 log-spaced bands plus the beat pulse, about 80 bytes) while something is playing and a surface is visible. The views send commands (`toggle`, `seek`, `playList`, `toggleFavorite`, ...). Seek bars interpolate time locally between updates so they move at 60 fps without flooding the channel.

**One writer for your data.** Today the page owns `state.json` through `PUT /api/state`. With several windows that would mean they overwrite each other. In the new design only the engine writes; views ask it to change things and get the new state back. The file format doesn't change at all.

**Audio graph is the same.** `<audio>` → preamp → 10 biquads → analyser → destination, built on first play, `setSinkId` on the context, exactly as `player.js` and `eq.js` do now. Those modules move into the engine nearly verbatim. The analyser's FFT goes from 512 to 2048 so the low end has real resolution (86 Hz per bin today is too coarse for a bass-driven landscape). An analyser is a tap; it doesn't touch the sound.

**Still works in a plain browser.** `node server.js` keeps working as a standalone server. In a browser tab the app page loads the engine in a hidden same-origin iframe, so there is one code path. The widget only exists in Electron.

**Electron hardening.** Context isolation on, Node integration off, sandboxed renderers, a small preload exposing only window controls, widget controls and shell preferences. Navigation locked to `127.0.0.1`.

---

## 3. Rendering approach

Raw WebGL2 with hand-written shaders, no three.js and no build step, in keeping with how the app is built today. WebGPU would work on your machine but I can't run it in this sandbox, and nothing here needs it.

### Mercury (the widget)

A **layered 2.5D heightfield**, not full 3D ray marching. Each chrome layer is a 2D signed-distance silhouette (smooth unions of a few primitives along the ribbon) turned into a height profile, with detail heights added on top: the cover recess, the three button dimples, the timeline groove, the cursor dimple, ripples, and audio flex. Normals come from the height gradient. Shading is environment reflection plus Fresnel over a dark body with pigment glowing inside it.

Why this over ray marching: every feature lives in 2D widget space, so controls, text and hit areas line up exactly with what you see, the outline can be evaluated in JavaScript for click-through, and it costs a few texture reads per pixel instead of dozens of distance evaluations. The fold that a single heightfield can't do (the upper lip over the lower body) is handled by compositing two layers with the gap between them.

Passes per frame:
1. **Pigment fluid** at 256×128: stable-fluids velocity field (advect, divergence, about 16 pressure iterations, project) carrying an RGB dye field. Dye is fed from the cover's own pixels, so the pigment really is the album art.
2. **Ripple field** at 256×128: a damped wave equation. Clicks and the moving cursor inject impulses.
3. **Surface**: one full-resolution pass that evaluates the silhouettes and heights, samples ripples, dye, cover and a procedural studio environment (soft light strips tinted by the palette), and writes premultiplied RGBA.
4. **Bloom**: bright rims and the timeline bead are blurred at quarter resolution and added back. With premultiplied alpha the glow adds onto the desktop instead of darkening it, and the form casts a real soft shadow so it reads on a bright wallpaper.

Text, icons and the time preview are **DOM on top of the canvas**, so they are always crisp. Icons scale with their button's spring so they squash with the press.

Song change: the outgoing cover becomes dye, a burst of velocity carries it across the ribbon, and the incoming cover resolves out of a decaying displacement field.

### Midnight Glass (the app)

CSS does the glass; WebGL does the light behind it.

- **Back layer (WebGL, quarter resolution):** slow flowing light ribbons and a soft bloom of the current cover, both in palette colours. Cheap, because it is blurry by nature.
- **Basin (WebGL, full resolution, geometry not fragment maths):** about 48 ridgelines drawn as glowing strips, back to front, each occluding the ones behind, curved in perspective. Driven by the engine's analysis frames.
- **Glass sheets (CSS):** translucent fills, `backdrop-filter` blur, double bevels (a bright inner edge and a second, dimmer line a few pixels in to read as thickness), gradient rim light in the palette's two colours, a back plate behind each sheet that shifts with the cursor, and shadows onto lower layers.
- **Refraction (Chromium only, which is all we need):** `backdrop-filter: url(#lens)` with an SVG displacement map bends what's behind the glass at its rim. Used on the small, thick pieces (cover slab, control deck, buttons, menus), not on the big sheets.
- **Sheen:** a specular highlight per sheet that follows the cursor through a spring.

Fonts are bundled (open-licence): **Outfit** for titles, **Manrope** for interface text, tabular numerals for times.

---

## 4. Layout and what changes

The window is opaque and frameless with its own title bar (brand, search, mini-player button, minimise / maximise / close). Inside it is a dark room with the layers floating in it:

- **Sidebar sheet:** views, playlists, the Eras / Sessions list, rescan, settings, shortcuts, quit.
- **Library sheet:** hero header (Play / Shuffle / Queue all), sort, duplicates toggle, the track list or era / session cards.
- **Stage (right):** the cover as a thick glass slab in the foreground, title, era chip and tags, actions, then Now Playing details and the Up Next queue.
- **Control deck (bottom):** a thick, mostly clear glass slab holding the transport, seek line with a luminous bead, volume, EQ and toggles. **The basin lives inside this glass**: a panoramic contour landscape across the full width, crisp through the clear glass, with a radial spectrum ring around the play button (from your layered-glass reference).

**Mini-player:** one click on the title-bar button (or `N`) springs the same window down to the compact card from your reference: cover, title, artist, seek, shuffle / prev / play / next / repeat, volume, queue button, with the basin glowing behind the controls. Click again to expand to the size and position it had.

Changes to existing features, stated plainly:

1. **Spectrum placement.** Today it is a strip under the now-playing cover. It becomes the basin in the control deck plus the ring around the play button. It is still toggled by the same visualizer button and setting. Reason: a ridge landscape wants a wide canvas, and in the deck it stays visible when the stage is closed.
2. **Track list is virtualised.** Only the rows on screen exist in the DOM. Everything a row does today stays (click, Enter, right-click, `···`, heart burst, era chip, Set era on hover, progress fill on the playing row). Reason: thousands of rows under glass would not hold 60 fps.
3. **"Clicking the shortcut again opens another window"** becomes "focuses the window you already have". One engine means one app window.
4. **Output device list.** Electron grants device-name access itself, so the "Show my devices" microphone step should disappear. I keep that flow as a fallback in case names come back empty. Your saved device was chosen under the Edge profile, whose device IDs differ, so on first launch I re-match it **by its saved name** rather than making you pick again.

---

## 5. Keeping every feature

Each line is a feature from the current code, where it goes, and how it gets checked. "Auto" means a scripted test drives the real app in Electron; "PC" means it also needs your machine.

**Library**
- All Tracks, Favorites, Recently Played, Most Played, Eras, Sessions, playlists, with sidebar counts → sidebar + library sheet. Auto.
- Search (every field it indexes today, same scoring, `/` to focus, `Esc` to clear, clears on view change) → title bar. Auto.
- Sorting A–Z / Era / Added / Length / Plays, plus clickable column headers, disabled in ordered views and search → library sheet. Auto.
- Hide duplicate copies, with the "N duplicates hidden" note and `copy` / `alt N` tags. Auto.
- Hero with kicker, title, meta, representative cover, Play / Shuffle / Queue all, era tint. Auto.
- Era and session card shelves with play buttons, era index numbers, the "no era yet" note. Auto.

**Tracks**
- Row: number / play glyph / animated bars, thumbnail, title, subtitle, era chip, tags, time, heart, `···`. Auto.
- Menu: play now, play next, add to queue, favorite, add to playlist, remove from this playlist, set / change era, go to era, go to session, show in Explorer, save a copy. Auto, except Explorer and the save dialog (PC).
- Playlists: create, create seeded, rename, delete, add, remove, play. Auto.

**Eras**
- Detection from album tags, filename abbreviations and tagged twins (`eras.js` logic unchanged), cover-derived colours, chips, timeline view, picker with number keys, new era, "Use automatic", "No era", `E`. Auto.

**Now playing and queue**
- Cover, title, subtitle, chips, favorite / add / reveal / save actions, all eleven file facts. Auto.
- Up Next: source label, clear, click to jump, drag to reorder, remove. Auto.
- Stage toggle, and the narrow-window collapse of sidebar and stage. Auto.

**Playback**
- Queue and order logic, shuffle and reshuffle, repeat off / all / one, previous restarts after 3.5 s, error skip, play counted after 8 s (`player.js` logic unchanged, moved into the engine). Auto.
- Seek with buffer bar, hover preview, time tip, scrubbing. Volume drag, wheel, percentage tip, mute. Auto.
- Resume where you left off, with the resume prompt. Auto.
- Media keys and the Windows media overlay with title, artist, album and artwork. PC.

**Sound**
- 10-band EQ: shelves at the ends, ±12 dB in half steps, preamp ±9, eight presets, bypass that keeps the curve, auto-on when you move a band, live curve with handles and the spectrum behind it, drag / wheel / arrows / double-click to zero, Flatten. Auto for logic and UI; by ear on PC.
- Output device: list, choose, test chime, fallback to default when unplugged, automatic return, notices. Logic auto with mocked devices; real devices PC.

**App**
- Palette theming from the cover, gliding on track change (upgraded, section 6). Auto.
- Thumbnail warm-up and palette cache (`data/thumbs`, `colors.json`), same formats. Auto.
- Rescan library with the result toast. Settings. Toasts. Boot and error screens. Auto.
- All shortcuts and the `?` overlay: `Space`, `←` `→`, `Shift`+`←` `→`, `↑` `↓`, `/`, `Esc`, `S`, `R`, `F`, `M`, `Q`, `E`, `,`, `.`, `?`. New: `N` mini-player, `W` widget. Auto.
- Reduced motion: the OS setting is honoured, plus a new in-app switch (System / On / Off). Auto.
- Quit button, clean exit, log file at `data/jusic.log`. Auto here, PC for the shortcut.

**Your data**
- `state.json`, `index.json`, `colors.json`, `art/`, `thumbs/` are read as they are. `lib/` doesn't change, so the index cache stays valid and nothing is rescanned. New settings are added keys only, which the old app ignores, so you can go back to `main` at any time.
- Before the new app writes anything, it copies `state.json` to `state.v1-backup.json` once.
- Test: I run the **current `main` app** against a synthetic library, use it (favorites, playlists, plays, era overrides, EQ curve, settings), and then open the resulting `data/` folder in the new app and compare field by field. Auto.
- `data/window` (the old Edge profile, about 120 MB) is no longer used. I leave it alone; the README will say it can be deleted.

---

## 6. Motion and interaction spec

Everything that follows the cursor or responds to touch runs on **springs** (semi-implicit Euler, mass 1), never linear lerps. Stiffness `k` and damping `c` below; ζ is the damping ratio.

| Spring | k | c | ζ | Used for |
|---|---|---|---|---|
| `glide` | 120 | 20 | 0.91 | Parallax, tilt, sheen following the cursor. Settles in about 350 ms with no visible overshoot. |
| `morph` | 210 | 26 | 0.90 | Mini-player resize, sheets entering, dialogs opening. |
| `press` | 900 | 40 | 0.67 | Button going down. Fast. |
| `pop` | 420 | 16 | 0.39 | Button release in the app. One clear overshoot. |
| `jelly` | 260 | 9 | 0.28 | Widget release. Two to three wobbles. |
| `bead` | 600 | 28 | 0.57 | Seek and volume beads chasing the pointer. |
| `lean` | 70 | 14 | 0.84 | Widget body lagging when you drag it. |

**The app, what reacts to what**

- *Cursor position* → cover slab tilts up to 9° and lifts (`glide`); the stage's text layers shift up to 6 px at different depths; each sheet's back plate shifts up to 6 px and the back light up to 14 px the other way; the sheen and rim highlight track the cursor on whichever sheet it is over.
- *The library sheet never rotates or shifts its text.* Only its lighting, back plate and the light behind it move. That keeps reading and scrolling steady, as you asked.
- *Press* → buttons squash to 0.94 (`press`), release with `pop`, and a soft ripple spreads from the touch point. The play button's ring flares.
- *Beat* (engine's pulse, 0–1) → basin ridges, the ring around play, the glow under the cover slab, back-light brightness (±6%), and the bead's halo.
- *Track change* → palette glides over 1100 ms, interpolated in OKLab so it never passes through grey; cover slab flips through a 420 ms `morph` with the old art dissolving; title and chips rise in with 40 ms stagger; the basin flattens and re-forms.
- *View change* → hero crossfades in 280 ms; the first 14 rows cascade at 18 ms stagger, 260 ms each; nothing below the fold animates.
- *Scroll* → hero art eases back, column header gains depth when stuck. No parallax on rows.
- *Menus, dialogs, toasts* → scale from 0.94 with `morph`, backdrop blur ramps over 220 ms; closing takes 140 ms.
- *Mini-player* → window bounds animate with `morph` (about 420 ms) while the layout cross-fades between full and compact.
- Hover feedback is 120 ms; nothing in the app takes longer than 450 ms to respond, except the palette glide.

**The widget, what reacts to what**

- *Cursor over the chrome* → a dimple about 22 px wide and shallow follows it (`glide`); a small moving light makes a reflection that travels with it; the whole environment shifts a few degrees so every reflection leans toward the cursor; the cover and the upper lip lean up to 4° (`glide`) while the buttons and timeline stay put.
- *Press* → the button's dimple deepens and its rim bulges (`press`), the body squashes 3% around the press point, and a ripple leaves the click point at about 180 px/s, fading over 1.4 s. Release is `jelly`.
- *Timeline* → the bead chases the pointer on `bead`; the time preview shows the exact time under the pointer, not under the lagging bead; on release the bead settles and the played line re-lights behind it.
- *Dragging the widget* → the body lags and shears slightly against the motion (`lean`) and wobbles when you let go.
- *Audio* → bass swells the two lobes and opens the fold by up to 3 px; a wave driven by the spectrum's recent history travels along the lower edge; the spectral glow in the fold follows the mids and highs; kicks push pulses into the pigment flow.
- *Playing* → pigment bleeds from the cover into the body along a slow current, fading over about 20 s.
- *Song change* → about 1.6 s: the cover liquefies (0–500 ms), the pigment front crosses the ribbon (300–1100 ms), the new cover resolves (900–1600 ms). The chrome tint glides with it.
- *Hover near the top edge* → two small droplets bud off the ribbon on a liquid neck: open the full app, and hide the widget. They merge back when you leave.
- Right-click anywhere on the chrome → menu: open Jusic, size (S / M / L), always on top, start with Windows, hide, quit.

**Reduced motion** (OS setting or the in-app switch): no parallax, tilt, wobble, ripples or travelling waves; springs become 120 ms fades; the basin and widget draw a calm, slowly breathing state; the pigment fades between covers instead of flowing; the palette still changes. Every control works the same.

---

## 7. Performance targets and how they are measured

| Target | Number | How it is measured |
|---|---|---|
| App frame rate | p95 frame ≤ 16.7 ms, p99 ≤ 20 ms, no frame over 33 ms in a 10 s library scroll | Frame-time histogram from `requestAnimationFrame` deltas, plus a Chromium trace |
| Widget while playing | p95 ≤ 16.7 ms; GPU use about 5% or less of the 3060 | Same histogram, plus `nvidia-smi` sampled once a second |
| Widget paused / idle | Render loop fully stopped within 3 s of the last motion: 0 frames per second, no measurable GPU | Frame counter and `nvidia-smi` delta against the app not running |
| Widget hidden or covered | 0 frames; the engine stops sending it analysis data | Frame counter |
| Audio | No underruns during a track change, a full-speed scroll and a widget drag | The audio context's underrun counters where Chromium exposes them, otherwise by ear with a log of main-thread stalls in the engine |
| Memory | Reported, not gated. Expected 450–600 MB with the app open. | `app.getAppMetrics()` |
| Launch | Window on screen within about 1.5 s of the double-click, warm | Timestamp in the log |

All of this is built into the app as `npm run measure`: it plays a track, scrolls the library, changes tracks, drags the seek bar, pauses, hides the widget, and writes the numbers to `data/measure-report.json`. **In this sandbox there is no GPU**, so numbers I produce here only show relative cost and catch regressions. The real figures come from running that command on your PC.

Design choices that protect the targets: the back light renders at quarter resolution; the basin is geometry, not per-pixel maths; big sheets use cheap translucency over an already-soft background and only the small thick pieces pay for refraction; the list is virtualised; the widget's simulations are 256×128; every loop stops when there is nothing moving.

---

## 8. Build phases

Each phase ends with commits pushed to `redesign` and a short update to you.

- **Phase 0 — Plan.** This document.
- **Phase 1 — Mercury prototype.** A standalone page in `prototypes/mercury/` with the chrome, pigment, ripples, jelly presses, seek bead and song change, driven by test covers and test audio. Screenshots and recordings at idle, hover, press, track change and seek drag, compared against your three references. You see it before it goes anywhere near the app.
- **Phase 2 — Shell and engine.** Electron main process, the server started in-process, the engine window, the message bus, and the **current UI** running on top of the new engine. The feature checklist passes here before anything is restyled, so later failures can only be visual.
- **Phase 3 — Midnight Glass.** Design tokens, type and glass; title bar; sidebar, library, stage, deck; back light and basin; springs and parallax; palette upgrade; menus, dialogs, EQ, settings, shortcuts overlay, toasts; virtual list; mini-player; reduced-motion switch.
- **Phase 4 — Mercury in the shell.** The transparent window, click-through, dragging and remembered position, sizes, the tray, the global shortcut (default `Ctrl+Alt+J`, changeable), start with Windows, idle and hidden throttling.
- **Phase 5 — Verification.** The feature checklist one by one, the `main` → `redesign` data test, the measurement run, reference comparisons, the shortcut installer, README.
- **Phase 6 — On your PC.** Run the measurements and the Windows checks on the real machine and library, fix what only shows up there.

---

## 9. What can only be proven on your PC

I'll build and test everything that can be tested here (logic, layout, shaders in software rendering, the Electron shell on a virtual Linux display, the data upgrade). These need Windows and your hardware, and I won't call them done until they have run there:

- Transparency and click-through on your desktop, including over a game or FL Studio.
- Additive glow and shadow compositing against a real wallpaper.
- Tray, global shortcut, start with Windows, the desktop and Start Menu shortcuts, no console window, clean quit.
- Media keys and the Windows media overlay from the hidden engine window.
- Output device names, your saved device re-matching, unplug and return.
- Every number in section 7.
- Your real library and your real `data/` folder.

To make that quick for you, the app ships with `npm run measure` and `npm run doctor` (a scripted pass over the Windows-only items that writes a report with screenshots). Sending me those reports, or opening a session on that PC, closes the loop.

---

## 10. Where I'd differ from your references, and why

1. **The full app is a window with glass floating inside it, not a sheet of glass floating on your desktop.** The layered-glass reference shows the app itself as a transparent slab over the wallpaper. Transparent windows on Windows can't be resized, maximised or snapped natively, and a library window needs all three. So the app is a normal opaque window containing a dark room, and the depth happens inside it. The object that truly floats on your desktop is Mercury. On Windows 11 there is an acrylic window material that might allow real frosted-desktop glass without losing native resizing; I'll try it on your PC as an option, not a promise.
2. **The mini-player's corners are the system's.** For the same reason the compact card fills the window edge to edge and gets Windows' own rounded corners (about 8 px on Windows 11, square on Windows 10) rather than the 28 px radius in the reference. It is still the same window, as you asked.
3. **The basin goes in the control deck, panoramic,** rather than in a blob-shaped pod as in the Resonance image. Reason in section 4.
4. **Mercury is one design that takes from all three**, rather than one of them:
   - From *Mercury*: the single continuous ribbon, the cover set into the left lobe, three pressed buttons, the timeline as the lower edge, volume on the upper-right lip.
   - From *Flow*: the cover as a glass slab that leans toward the cursor, and visible pigment streams in the lower body.
   - From *Split*: the fold between the upper lip and the body opens slightly, and the spectral surface glows through that gap. The lip leans; the controls don't.
5. **Mercury's glass can't refract your real desktop.** A web page can't see what is behind its window. The chrome reflects a studio environment lit in the album's colours instead, and the body is nearly opaque so it reads the same on any wallpaper.
6. **Text on the widget is not distorted by the surface.** In the renders the type sits perfectly still on moving metal; I keep that literally by drawing text above the shader.
7. **Additions you didn't ask for but that follow from the design:** widget sizes S / M / L, the droplet buttons for open and hide, a non-focusable widget window (clicking it won't take keyboard focus from a game or FL Studio), and the saved-device re-match.
8. **The icon stays** for now. If a Mercury-style icon turns out better I'll show it to you before changing anything.

---

## Progress

- [x] Phase 0 — plan
- [ ] Phase 1 — Mercury prototype
- [ ] Phase 2 — shell and engine
- [ ] Phase 3 — Midnight Glass
- [ ] Phase 4 — Mercury in the shell
- [ ] Phase 5 — verification
- [ ] Phase 6 — on your PC
