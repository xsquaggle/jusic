# Handoff: Jusic redesign

`REDESIGN_PLAN.md` is the full plan; this is where things actually stand. Work now happens on the owner's PC. **"Current status" is rewritten at the end of every stage**; the rest of the file is background from the cloud session, corrected where the PC has shown otherwise.

## Current status

Updated 13 November 2026, at the end of stage 2b (click-through and drag).

**Step 2 so far**

- **2a done: the prototype runs in a real widget window.** `tools/widget-proto/main.js` is a throwaway shell, not the app: transparent, frameless, always on top, never focused, no taskbar entry, tray icon to quit. The page has a `?widget` mode (clear page, no test panel). Run it with `npx electron tools/widget-proto/main.js` (options `size=0.8`, `display=other`). It starts the prototype server itself if one is not running.
- **Transparency works:** per-pixel, no rectangle. Photographed from the real screen over test windows on the second monitor: `design/captures/mercury-window-round9.png` (`... main.js shots=<folder>`; it puts windows of its own behind the widget so nothing of the owner's desktop is recorded). The first run happened to land on a full-screen game on the main monitor, and the widget stayed on top of it.
- **The glow depends on the monitor** (`tools/capture/premul-probe.js`, table in `AUDIT.md`): on the main monitor (125%) light with alpha 0 is discarded, on the second (100%) it is kept. The fix is `AUDIT.md` item 3. `AUDIT.md` was updated for round 9: the see-through body moved up to second.
- **2b done in code: click-through, drag, remembered position, close.** In `demo.js`, `passThrough()` tells the window to let the mouse through whenever the pointer is not over the shape (`host.setIgnore`, which is `setIgnoreMouseEvents(on, { forward: true })`); dragging the body or cover moves the window (`host.drag`); the position is saved in `data/widget-proto/position.json`; the hide dish quits.
- **Checked without the real mouse:** `npx electron tools/widget-proto/main.js test=passthrough` moves a pretend pointer in the page and asks Windows (`WindowFromPhysicalPoint`) which window a click would reach. 8 of 8: the window behind when the pointer is in the notch, the corner or below the edge; the widget on the button, body, cover and timeline. Neither window took focus.

**Not verified: needs a real mouse.** The owner was using the PC during this stage (input every second, a game on the main monitor), so the mouse was not taken over. Still to confirm by hand, with `npx electron tools/widget-proto/main.js`:
1. Moving the real cursor from outside onto the shape makes it take clicks. This is the one piece the test cannot reach: the window has to keep reporting mouse moves while it is letting clicks through.
2. Clicks just outside the shape, inside the window's rectangle, reach what is behind.
3. Dragging by the body moves it, and it reopens where it was left.
4. Clicking it does not take keyboard focus from a game or FL Studio.

**Rule from this stage:** assume the owner may be using the main screen. Test windows go on the second monitor (`display=other` in `widget-proto`, the default for its shots and tests; `mercury-shots.js` now opens there too, still drawn at 125%). `tools/capture/mercury-fps.js` still opens on the main monitor. Never move or click the real mouse while the owner is active (`powerMonitor.getSystemIdleTime()` says).

**From stage 1:** the audit (`AUDIT.md`, `design/captures/mercury-audit-round8.png` and `-zoom.png`); the cap the owner asked for, 120 draws a second and 1920×1080 (`MAX_RENDER` in `mercury.js`, the limiter at the top of `loop` in `demo.js`; `?fps=N` and `?uncapped` override); capture tools in `tools/capture/`; Electron 45.3.2 pinned (`npm install`, then `node node_modules/electron/install.js` if `node_modules/electron/dist/electron.exe` is missing). The machine: RTX 3070 (not 3060), main monitor 2560×1440 at 125% and 360 Hz, second monitor 1920×1080 at 100%.

**Half-finished:** nothing in code.

**Exact next step (2d):** GPU load of the widget window, idle (paused, pointer away, 15 fps breathing) and playing, per process so the owner's own programs do not count: find the Electron GPU process with `app.getAppMetrics()` and read `\GPU Engine(pid_<pid>_*engtype_3D)\Utilization Percentage` with `Get-Counter` for 10–15 s each, plus `nvidia-smi --query-gpu=utilization.gpu,power.draw --format=csv -l 1` for the whole card. Say in the report whether a game was running, because that changes the numbers. Then (2e) the screen-capture refraction experiment (`setContentProtection(true)` plus `desktopCapturer`), which the owner has asked to try.

**The owner's instructions for these sessions**

1. Audit first, then stop for their reply. Done; they replied "Start step 2".
2. Real transparent, frameless, always-on-top window; test transparency and click-through on the real desktop; try screen-capture refraction; check idle GPU use.
3. Polish the still, working down `AUDIT.md`, with real covers from `C:\Users\g8rla\OneDrive\Documents\Claudington\jusic-player\data\art` (119 files). **That `jusic-player` folder is the app they use every day: read only, never modify anything in it.** Re-run the side by side after each round, update `AUDIT.md`, and correct section 6a of the plan.
4. Only when the still beats the references: tune and record the interactions.
5. After the widget is approved: the full-app glass redesign.

Working rules: stages of 20–30 minutes; at the end of each, commit, push to `redesign` and rewrite this section. If the owner says "wrap up", finish or shelve the current stage, checkpoint, summarise and stop. They are usually on their phone: short updates with a screenshot or clip. They are on a 5-hour usage limit, so do not start a stage that might not fit.

## State at the end of the cloud session

- **Branch:** `redesign`. `main` is untouched.
- **Done:** the plan, and a standalone prototype of the Mercury widget in `prototypes/mercury/`.
- **Not started:** the Electron shell, the engine split, the Midnight Glass app, the widget window. No app code has been changed. `public/fonts/` (Outfit, Manrope, Montserrat, OFL) is the only addition outside `prototypes/` and `design/`.
- **Everything up to round 7 was rendered in software.** The cloud sandbox has no GPU and could not reach the PC. Round 8 is the first on the real GPU; frame pacing has been measured there, GPU load, transparency in a real window and click-through have not.
- **The owner's rule for the widget:** do not go on to interactions until the still looks better than `design/references/widget-mercury-flow.png`, and send a reference-vs-current side-by-side (dark and light desktop) every round. It does not look better yet.

## Run the prototype

```bash
node prototypes/serve.js
```

Open `http://127.0.0.1:5190/prototypes/mercury/`. Press play to start the built-in test synth. Buttons at the bottom left: backdrop, size, close/appear, reduced motion.

URL options: `?bg=wallpaper` (light desktop), `?bg=window`, `?bg=black`, `?track=0..4`, `?scale=1`, `?dpr=2`, `?ss=2` (supersampling per axis), `?still` (reduced motion), `?play`, `?unformed`, `?fps=N` (drawing cap, default 120), `?uncapped` (lifts the 1920×1080 render cap), `?capture=1` (clock stopped: step with `window.__mercury.step(n, dt, paint)`; `paint=false` advances the liquid without drawing).

## File map (`prototypes/mercury/`)

| File | What it is |
|---|---|
| `shape.js` | The single source of the geometry, in an 860×400 stage: outline primitives, cover tile, buttons, basin, utility dishes; the timeline and volume curves as tables; `bodySdf`, `tileSdf`, `hit()`; and `SHAPE_GLSL`, the same numbers generated as GLSL so shader and hit-test cannot drift. |
| `shaders.js` | All GLSL. `SURFACE` (the drop: height field, mirrored room, pigment display, underside, cover tile, label sheet, timeline and volume, three outputs: light, aura, glass opacity). `SIM_*` (fluid: force/circulation, curl, vorticity, divergence, pressure, project, impulse, drop, advect, MacCormack dye). `BLOOM_*`. `COMPOSITE` (supersampled resolve, tone-map per sample, premultiplied output). |
| `mercury.js` | `createMercury(canvas)`: WebGL2 setup, render targets, springs, the fluid step, music reactions (`react`), all inputs (`setCover`, `setLabels`, `setAudio`, `pointerMove`, `pressAt`, `setSeekDrag`, `lurch`, `appear`, `vanish`, ...), `frame(dt, paint, idle)`. Knows nothing about what buttons do. |
| `ink.js` | The label sheet: title, artist, times, VOLUME, all glyphs and the time-preview text drawn to a 2D canvas and uploaded as a texture the shader reads through the surface. Includes the play/pause morph. |
| `springs.js` | `Spring`, `Spring2` and the shared presets. Meant to be reused by the app. |
| `palette.js` | Primary, secondary and deep tone from a cover (same method as `public/js/art.js`, plus the deep tone). |
| `demo.js` | Test harness only: fake tracks, a small synth, pointer handling, the two-speed loop, capture hooks. The real widget replaces this with the engine bus. |
| `index.html` | Test page and stand-in desktops. |
| `covers/` | Generated stand-in covers. Not real artwork. |
| `../serve.js` | Static server for the repo root on 127.0.0.1:5190. |

Capture tools (`tools/capture/`, all run with `npx electron <script>` while `serve.js` is running):

| File | What it is |
|---|---|
| `mercury-shots.js` | Photographs the prototype in a real composited window with the clock stepped, so rounds are comparable. `out=<folder>`, `only=<names>`. Raw shots go to `design/captures/raw/`, which is not committed. |
| `sheet.js` | Lays captures and references out on one labelled image from a JSON spec in `sheets/`. This makes the side by side. |
| `mercury-fps.js` | Runs the prototype live and muted for a few seconds and reports real draws per second, frame gaps and render size. |
| `premul-probe.js` | Tests whether the compositor keeps light added where alpha is low. |

Captures: `design/captures/mercury-audit-round8.png` (latest side by side, first on the GPU), `mercury-audit-round8-zoom.png`, and from the cloud `mercury-still-round7.png`, `mercury-still-round5.png`, `mercury-before-after.png`.

## Where it still falls short of the reference

`AUDIT.md` replaces this list: it is ranked, measured on the PC, and has fixes. The list below is the cloud session's own view, kept for the record.

1. **Light desktop.** The body washes toward white and the volume strip is low-contrast. The glass has only been judged against a CSS gradient, never a real desktop.
2. **No refraction.** The body is see-through and tinted, but it does not bend what is behind it. See PC-only tests.
3. **Depth.** The underside is a second copy of the outline shifted down; in places it reads as a second outline rather than a shaded wall. The view is top-down; the reference is drawn in perspective with real thickness.
4. **Highlights.** Correct but sparse. The reference has broader, more varied sheens across the lip and the left lobe.
5. **Pigment.** Luminous wisps and a short stream under the cover, not the long flowing threads along the whole lower body.
6. **Cover tile.** Bright and crisp, but its thickness is subtle and it has only been seen with a generated cover.
7. **Control pod.** Soft white glow bands at its upper left and right end; the fold reads as a glow, not a crisp overhang.
8. **Polish not re-checked after the round-6 rewrite:** 200% zoom on both backdrops, reduced motion, every interaction.

## What was tried and did not work (do not repeat)

**Material and lighting**
- *Soft panels everywhere* (softness 0.14–0.45, F0 about 0.5): low contrast, read as glossy plastic.
- *A "chrome painter's sky"*: sharp horizon, room tilted toward the viewer. The horizon became a hard line running parallel to the outline, and the band below it read as a second pink shape stacked under the chrome. With directions facing away from the viewer judged the same way, the whole rim turned floor-coloured.
- *Five thin strip lights*: on a surface that undulates they become many thin wandering streaks ("crinkled plastic wrap") and striped every button rim with concentric rings. Now: one broad key, one fill, one thin strip above and one below.
- *Large surface swells* (2.6 / 1.9 / 1.2 units): made the streaks wander. Now 1.1 / 0.7.
- *Low reflectance* (F0 0.2–0.25) with a dim room: a black body with white wire outlines.
- *A rim from reflection alone*: only appears where a light happens to line up. The rim is now an explicit grazing term, brightest toward the key and along the underside.

**Legibility**
- *Opaque dark pools* under the words, timeline and volume: fixed legibility, but the body read as a black capsule on a light desktop. Now the pools only flatten the surface and add local glass tint.
- *Title on a curve* following the shoulder: read as warped italics. Text is upright.
- *Refracting text by the full surface slope*: the standing curve of the body sheared every letter and added colour fringes. Words now move at most 1.5 units and mostly from ripples.

**Cover**
- *Set into the metal with a meniscus and a lens*: dim and flat, and a strong lens offset stretched the edge rows into smears. Now a floating glass tile.

**Controls**
- *Droplet buttons budding off the top edge*: floated awkwardly over the title. Now two dishes in the lip at the right end, shown on hover.
- *A twist ridge running under the text*: read as a second line beside the timeline. It now exists only where it sweeps up into the lip.

**Pigment**
- *A continuous seep ring plus a uniform current*: a gradient sliding across. Now discrete drops with jets, vortices, a wall-following current and a corrected (MacCormack) advection step.
- *Too much of it* (drop amount 0.85–1.25, 22 s fade): the whole body went pink.
- *Drawing pigment as dim colour*: thin pigment over dark looked like muddy brown marble. It is now thresholded to clear and drawn as light.

**Rendering**
- *Tone-mapping after multiplying by coverage*: brightened or darkened every edge pixel into a fringe. Body and aura are separate targets, encoded separately, blended by coverage.
- *Averaging supersamples before tone-mapping*: hot rims still stair-stepped. Each sample is tone-mapped first.
- *Screen-space derivatives for reflection softening*: avoided, because the shader returns early outside the shape and derivatives after that are undefined (and risky under ANGLE/D3D). Curvature is taken from the finite differences already computed.
- `cast` is a reserved word in GLSL ES.

**Capturing in software**
- GL commands queue far faster than they draw: call `gl.finish()` between chunks or screenshots time out.
- A painted frame at `ss=2` cost about 1.2 s, a simulation-only frame about 60 ms. None of this says anything about a real GPU.
- Alpha is now glass tint, not coverage, so a coverage check must threshold it (0.35 separates body from shadow).

**Environment**
- Electron 45 downloads its binary lazily (`node node_modules/electron/install.js`), needs `--no-sandbox` under a virtual display, and had no WebGL2 there by default. A hidden window kept running timers and animation frames in that setup; that is not evidence for Windows.
- The PC's `jusic ye` folder was in the Remote Control list but not offered to cloud sessions.

## Motion spec status

The spec is `REDESIGN_PLAN.md` section 6a.

| Item | Status |
|---|---|
| Sound → liquid (swell, waves, kick, shimmer, reflections flicker) | Built, untuned |
| Pigment drops, circulation, obstacles, song-change mixing, lower stream | Built, untuned |
| Approach hover, dimple, speed-scaled wake | Built, untuned |
| Press squash, ripple, pigment puff | Built, untuned |
| Play/pause morph, wake and settle | Built, untuned |
| Seek bead stretch, line bend, rising time lens, release ripple | Built, untuned |
| Volume drives the glow | Built, untuned |
| Skip lurch | Built, untuned |
| Drag slosh | Built in the renderer; the test page drags a DOM element, not a window |
| Appear / close | Built, untuned |
| Idle breathing at 15 fps | Built; cost unmeasured |
| Reduced motion | Built; unchecked since round 6 |
| Clips of each interaction compared against the owner's description | **Not done** |

All of it ran once in a smoke test without errors **before** the round-6 rewrite of the surface shader. It has not been re-run since.

Section 6a is out of date on three points and needs correcting: the cover is a floating tile (so only the three buttons are solid to the flow), text is upright, and the body is see-through with a visible underside.

## Open tests that need the PC

| Test | Why it is open |
|---|---|
| Frame rate while playing | **Pacing measured** (RTX 3070, 125% scaling, 360 Hz): capped at 120 draws a second, gaps 8.3 ms median, 8.7 ms worst, at 100% size. The owner reports it smooth. GPU load while playing is still unmeasured. |
| Idle GPU and CPU (paused, pointer away, 15 fps breathing) | Target is near zero. If it is not, cut the idle rate, the supersampling or the pressure iterations. Unmeasured. |
| Transparency | **Answered.** Inside an ordinary window the compositor adds the glow where alpha is at least 1/255 and discards it where alpha is exactly 0, which is what gives the glow its hard border. In a transparent window the main monitor (125%) behaves the same way and the second monitor (100%) keeps the light even at alpha 0 (`AUDIT.md` item 3, `tools/capture/premul-probe.js`). Per-pixel transparency itself works. |
| Click-through outside the shape | Planned with `setIgnoreMouseEvents(true, { forward: true })` driven by `hit()`. Not tried. This is the main technical risk. |
| Real refraction through screen capture | Idea only: `win.setContentProtection(true)` to keep the widget out of the capture, `desktopCapturer` for the screen, pass the region behind the widget in as a backdrop texture to bend. Unknown cost, and it means the app captures the screen, which the owner should agree to first. |
| Always on top, drag, remembered position, not stealing focus from a game or FL Studio | Not built. |
| Audio glitches under load | Not testable without the engine. |
| Real covers and palettes from `data/art` and `data/colors.json` | Only generated covers have been used. |

## Checks that were run

- Hit-test against the drawn shape (top face, underside and tile, at rest): 2 mismatches in 86,000 samples, both within 2 units of an edge.
- Edges at 200% zoom on dark and light, through round 5: no stair-stepping, no dark outline.

## What's left, in order

1. ~~On the PC: run the prototype on the real GPU.~~ Done: `AUDIT.md`. Idle cost moves to the widget-window step.
2. Prove the widget window in Electron first (the owner's order): transparency, click-through, refraction experiment, idle GPU. Then finish the still against `AUDIT.md`, with real covers.
3. Tune and record each interaction; correct section 6a.
4. Prove the widget window in Electron (transparency, click-through, on top, drag, position).
5. Phases 2 to 6 of the plan: shell and engine, Midnight Glass, widget in the shell, verification, README.
