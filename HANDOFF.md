# Handoff: Jusic redesign

`REDESIGN_PLAN.md` is the full plan; this is where things actually stand. Work now happens on the owner's PC. **"Current status" is rewritten at the end of every stage**; the rest of the file is background from the cloud session, corrected where the PC has shown otherwise.

## Current status

Updated 13 November 2026, at the end of stage 3f (round 15 of the still). Step 2 of the owner's order of work is complete; **step 3 (polish the still) is under way: rounds 11 to 15 are done.** One session did stages 2e to 3d (rounds 11 to 14), a second did round 15; a fresh session can carry on from "Exact next step".

**Where the still stands.** `AUDIT.md` has the verdict and what each round changed. `design/captures/mercury-still-round15.png` is the latest side by side, with round 14 beneath it; `mercury-still-round15-detail.png` sets the right lobe and the bulb beside the same parts of the main reference; `mercury-outline-round15.png` shows the geometry as lines over that reference. In short: the outline and the anatomy are now the main reference's (a round bulb with the cover inside its rim, a waist that curves, an upper lip lying over an eye-shaped pod as a second layer, a soft crest), clean and readable with all six real covers on dark, pale and white backdrops. It is still not as good as any of the references, and what separates them now is light, not form: theirs are covered in broad sheens, ours is a dark body with lit edges.

- Round 11 (`AUDIT.md` items 1 and 3): no outlines, the rolled lip, a room whose lamps differ round the outline, a shaded underside, the glow as light on the floor with alpha of its own, a real shadow.
- Round 12 (items 2 and 4): the body nearly opaque with a colour of its own, the glare round the buttons cut, almost nothing clipping, broader light on the lip. Refraction still works as a switch on top.
- Round 13 (item 5, parts of 6 and 9): pigment as a ribbon in the lower lip instead of smoke, never white fog from a white cover, long titles fit, the tile's shadow.
- Round 14 (item 8): each button one smooth bowl.
- Round 15 (item 7): the silhouette rebuilt from the main reference (a circle for the bulb, one straight rising lower edge, one arc over the waist, two circles and a cut for the crest); the upper lip as a second layer with an S-shaped leading edge over an eye-shaped pod; the buttons 8 units higher; a straight timeline; a level volume line without its label; the cover tile inside the bulb's rim. Section 6a of `REDESIGN_PLAN.md` is corrected.
- **How the right lobe is put together now** (the part most likely to be touched next). In `shape.js`: `L.arch`, `L.band` and `L.end` are three circles, and `archSdf` is the region they bound, negative under the upper lip's leading edge (the pod and the strip below it) and positive on the lip; `L.rim` is the pod's lower rim; `archOn` says where that edge exists at all (not under the pod between its two legs, and melting away to the left of the waist). In `shaders.js`: `base()` carries the lip's broad form (its fall behind the edge, its crown, the ridge of the band through the waist), `detail()` the crisp parts (the rolled edge, the pod's drop and rolled rim, the gap), and the top-face block of `main` the lip's shadow and the glow through the gap. Anything that uses the distance from the edge far away from it has to be guarded: `exp(ar / 2.5)` overflowed on the far side of the bulb and painted a black disc with a white halo.
- **`npx electron tools/capture/outline.js out=design/captures/raw/outline.png ref=mercury`** (or `ref=flow`, `ref=none`) draws everything in `shape.js` as lines over a dimmed reference in about three seconds, with no window and no GPU, and prints where the top and bottom edges are every 30 units. Use it for any change to the geometry before photographing. The reference is in perspective and ours is square on, so it shows the character of the curves, not an exact fit; even so the outline lines up with `widget-mercury.png` within a few units.
- **Real covers.** `data/real-covers.json` (not in git) names the owner's cover folder and six tracks: pink, dark red, blue, white, many-coloured, near black. `npx electron tools/capture/mercury-shots.js out=<folder> real=1` photographs them through a read-only route in `prototypes/serve.js` (`/real-art/<file>`, the folder comes from `JUSIC_REAL_ART`). Nothing is copied out of the owner's folder. The page takes `?cover=<url>&title=&artist=&dur=`.
- **The repository on GitHub is public** (it can be read without signing in). So nothing that shows a real cover or a real title is committed: those shots and their sheet stay in `design/captures/raw/` (ignored) and go to the owner with `SendUserFile`. The sheets committed for each round use the generated cover. Real titles do not go into these notes either.
- **How a round is run.** Edit; for geometry, `outline.js` first; `npx electron tools/capture/mercury-shots.js out=design/captures/raw/roundNN-a real=1 only=dark,window,real4-window warm=360` for a quick look (360 frames are enough for edges and light; pigment needs the full 720); zoom with a small sheet spec (`crop` in `tools/capture/sheet.js` specs, `"pixel": true` for hard pixels); then the full set (`only=dark,light,window,dark-hover,dark-small,real1-dark,real1-window,real2-dark,real3-dark,real3-light,real4-dark,real4-window,real5-dark,real5-light,real6-dark,real6-window`), the committed sheets from `tools/capture/sheets/roundNN-overview.json` and `-detail.json`, the private one from a copy of `design/captures/raw/round15/real-covers.json`; then `test=passthrough`, `test=gpu dsf=1.25` if the shaders or the simulation got heavier, `AUDIT.md`, this section, commit, push, send the sheets. The full set takes about three minutes: run it in the background.
- `mercury.probe(x, y)` reads the liquid's velocity and pigment back at a stage position: look at the simulation with it instead of guessing from pictures.
- `test=passthrough` passes, 8 of 8, with the same probe points as before the outline changed; `test=gpu dsf=1.25` reads 0.92% idle and 8.0% playing with the card otherwise idle (57 W), against 0.83% and 7.9% before round 15.
- The owner has been sent the sheets of all five rounds, and the refraction result with the recommendation (nearly opaque body, refraction as an option). **Two things are waiting for the owner's word:** whether refraction ships as an option (the opaque body is built and the switch still works, so either answer is served), and whether the two utility dishes leave the surface for a right-click and tray menu (`AUDIT.md`, round 14; they now sit on the lip where it comes down round the right end, and fit no better).

**Exact next step: round 16, what is left of `AUDIT.md` items 1 and 4: light.** It is now the largest gap by far; `mercury-still-round15-detail.png` shows it part for part. Four things, in this order, photographing after each:

1. **Broad sheens across the bulb and the lip.** The body between its edges is nearly level (a dome of 5 units over 110, swells of 7), so it mirrors only the faint wash that `env()` holds toward the viewer. Either give the body real curvature toward its rim (so its slope reaches 0.2 to 0.4 across the outer third of each lobe, where the overhead glow starts at `r.y` 0.22) or bring a broad, soft, edgeless light further toward the viewer in `env()`; probably both, a little of each. Keep it level in the three pools. Earlier dead ends, in "What was tried": swells over 2 units made streaks wander, and a lamp with an edge toward the viewer was torn into blotches by every ripple.
2. **Wider rims.** The outer lip is 17 units to its crest (`edgeR`); the references' rims are about 22 with graded light on them. Try 22 to 24 with `edgeIn` to match; the timeline and the volume line have room.
3. **The band through the waist:** one long highlight along it instead of two strokes (its far slope meets the key panel only where it faces up and left; `bandH` and the ridge's width in `base()` set that slope).
4. **The line along the lower edge.** The underside shows as one line of the album's colour of even width with a hairline of dark above it. Vary how much of the underside shows round the outline (`uWall` is one offset for the whole body), and close the hairline.

After that: 10 and 11 (the timeline is still a thick white line; the volume line is 86 units and should be about 110, with the unplayed part dimmer), then the rest of 5 (threads the whole length of the lower body), 6 (the label sheet at twice the resolution, text at the small size) and 9 (the tile set in with a bevel, or leaning).

**Stage 2e (step 2, complete): screen-capture refraction. It works; recommended as an option, not as the default look.**

- Run it: `npx electron tools/widget-proto/main.js refract=live` (also with `shots=<folder>` or `test=gpu dsf=1.25`; `rfps=N` and `rmax=N` set the capture's rate and longest side). `glass=0.88` is the other branch tried the quick way: a nearly opaque body, nothing captured.
- How it is built: `main.js` calls `setContentProtection(true)` so the window is left out of screen captures, and answers `widget:backdrop` with the capture source of the monitor the window is on and where the window sits on it (sent again on every move). `demo.js` opens that source with `getUserMedia` (`chromeMediaSource: 'desktop'`; Electron 45 needs no prompt and no click for it), reads frames with `MediaStreamTrackProcessor` and hands them to `mercury.setBackdropFrame`; the capture stops while the page is hidden. `mercury.js` uploads the newest frame when it next draws. In `shaders.js`, `behind()` reads it and the top face adds it as light, moved by the surface slope, blurred and dimmed; `uBackPx.y` eases it in and takes the window's own see-through to nothing.
- Picture: `design/captures/mercury-refraction-round10.png`. Numbers and consequences: `AUDIT.md`, "What the refraction experiment showed". In short: about 2 points of GPU and half a percent of one CPU core extra, nothing when hidden, no capture border found. But the widget then disappears from every screenshot, recording and screen share, and the screen is captured the whole time the widget is visible.
- Decision, in `AUDIT.md` item 2: build the still as a nearly opaque dark-glass body (93–96%; 88% was tried and is not enough), and keep refraction as a switch on top of the same body, off by default, for the owner to try on their own desktop. **The owner has been sent the picture and this recommendation and has not answered yet.** Items 1 and 3 do not depend on the answer.
- Not tested, because the main monitor and the mouse were in use: refraction on a monitor a full-screen game is running on; whether the mouse pointer shows as a blurred double inside the glass; the capture border by eye (it was checked by counting yellow pixels along the monitor's edges).

**Three things 2e found that matter beyond it**

1. **Electron's default always-on-top level loses the widget behind other windows while a full-screen game has the foreground.** The default level ('floating') also parks the window just behind the taskbar; when a full-screen game is in front, Windows takes the taskbar out of the always-on-top band and the window goes with it. `onTop()` in `main.js` now uses the 'screen-saver' level, which stays on top. The real widget has to do the same.
2. **A grab of the screen shows whatever is really there.** Because of point 1, the first photographs of this stage showed the owner's own screen (the app that was open on the second monitor) instead of the test windows. They were deleted at once and were never committed (`design/captures/raw/` is ignored). `backdrop.html` now paints a magenta marker in each corner and `saveShot()` in `main.js` refuses to write a grab that does not show all four. Keep that check in anything that saves a grab of the screen.
3. **GPU share depends on what else the card is doing.** With the card nearly idle (about 10%, 46 W) the same widget reads 0.93% idle and 7.9% playing, against 0.36% and 2.1–3.0% in stage 2d, when a game had the card at 88–99%: an idle card runs slower, so the same work takes a larger share of its time. Power is the steadier number: about 1 W more idle and 11 W more playing than with the window not shown. `test=gpu` now prints both, and the use by each process and by the desktop compositor on each graphics adapter. Both monitors are composed on the RTX 3070; the second monitor hangs off the AMD graphics but nothing measurable ran there.

**Step 2, stages 2a to 2d (unchanged)**

- **2a: the prototype runs in a real widget window.** `tools/widget-proto/main.js` is a throwaway shell, not the app: transparent, frameless, always on top, never focused, no taskbar entry, tray icon to quit. The page has a `?widget` mode (clear page, no test panel). Run it with `npx electron tools/widget-proto/main.js` (options `size=0.8`, `display=other`). It starts the prototype server itself if one is not running.
- **Transparency works:** per-pixel, no rectangle. `design/captures/mercury-window-round9.png` (`... main.js shots=<folder>`; it puts windows of its own behind the widget so nothing of the owner's desktop is recorded).
- **The glow depends on the monitor** (`tools/capture/premul-probe.js`, table in `AUDIT.md`): on the main monitor (125%) light with alpha 0 is discarded, on the second (100%) it is kept. The fix is `AUDIT.md` item 3.
- **2b: click-through, drag, remembered position, close, in code.** In `demo.js`, `passThrough()` tells the window to let the mouse through whenever the pointer is not over the shape; dragging the body or cover moves the window; the position is saved in `data/widget-proto/position.json`; the hide dish quits. `... main.js test=passthrough` moves a pretend pointer in the page and asks Windows which window a click would reach: 8 of 8 correct, and neither window took focus.
- **2d: GPU load** (`... main.js test=gpu dsf=1.25`, code in `tools/widget-proto/gpu-test.js`), at the main monitor's pixel size (1075×500 on screen, liquid drawn at 1920×893), second monitor, 120 Hz, while a game had the card at 88–99%:

  | State | Draws a second | Own share of the RTX 3070 | CPU, all its processes |
  |---|---|---|---|
  | Window not shown | 0 | 0.06% | 0.1% of one core |
  | Idle: paused, pointer away | 15 | 0.36% (0.45% at worst) | 0.4% of one core |
  | Playing | 113 | 2.1% to 3.0% over two runs | 1.5% to 1.7% of one core |
  | Hidden (`window.hide()`) | 0 | 0.00% | under 0.1% of one core |

  Memory, all processes of the prototype: about 440–460 MB working set (summed, so shared memory is counted more than once). It reaches the idle cadence about 10 s after launch. Hidden is truly zero only because the widget window leaves Chromium's background throttling on; the capture tools switch it off, the widget must not. See point 3 above for the same readings with the card nearly idle.

**Not verified: needs a real mouse.** The owner was using the PC throughout, so the mouse was not taken over. Still to confirm by hand, with `npx electron tools/widget-proto/main.js`:
1. Moving the real cursor from outside onto the shape makes it take clicks. This is the one piece the test cannot reach: the window has to keep reporting mouse moves while it is letting clicks through.
2. Clicks just outside the shape, inside the window's rectangle, reach what is behind.
3. Dragging by the body moves it, and it reopens where it was left.
4. Clicking it does not take keyboard focus from a game or FL Studio.

**Rules from these stages:** assume the owner may be using either screen. Test windows go on the second monitor (`display=other` in `widget-proto`, the default for its shots and tests; `mercury-shots.js` opens there too, still drawn at 125%). `tools/capture/mercury-fps.js` still opens on the main monitor. Never move or click the real mouse while the owner is active (`powerMonitor.getSystemIdleTime()` says). Never save a grab of the screen that has not been checked to show the test backdrop (point 2 above). Never commit a picture that shows a real cover or a real title: the repository is public.

**From stage 1:** the audit (`AUDIT.md`, `design/captures/mercury-audit-round8.png` and `-zoom.png`); the cap the owner asked for, 120 draws a second and 1920×1080 (`MAX_RENDER` in `mercury.js`, the limiter at the top of `loop` in `demo.js`; `?fps=N` and `?uncapped` override); capture tools in `tools/capture/`; Electron 45.3.2 pinned (`npm install`, then `node node_modules/electron/install.js` if `node_modules/electron/dist/electron.exe` is missing). The machine: RTX 3070 (not 3060), main monitor 2560×1440 at 125% and 360 Hz, second monitor 1920×1080 at 100% and 120 Hz, to the left of the main one.

**Half-finished:** nothing in code.

**The geometry below this line** (file map, "where it still falls short", "what was tried") is from before round 15 where it names shapes: the spine, the pinch that pressed the waist flat, the lift, the tail, the basin and its fold, and the twist ridge are gone. `shape.js` is the record of what there is now.

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
| `shape.js` | The single source of the geometry, in an 860×400 stage: outline primitives, the upper lip's leading edge and the pod's rim, cover tile, buttons, utility dishes; the timeline and volume lines as tables; `bodySdf`, `archSdf`, `podSdf`, `tileSdf`, `hit()`; and `SHAPE_GLSL`, the same numbers generated as GLSL so shader and hit-test cannot drift. |
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
| `outline.js` | Draws the geometry in `shape.js` as lines, over a dimmed reference if asked. No window, no GPU, about three seconds. |

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
- `alwaysOnTop: true` and `setAlwaysOnTop(true, 'floating')` are not reliably on top on Windows: see "Three things 2e found" in the status above. `win.moveTop()` does not rescue a window that has lost the always-on-top band.

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

Section 6a was corrected on 13 November 2026 (the cover is a floating tile, so only the three buttons are solid to the flow; text is upright; the body is nearly opaque, in two layers; pigment is a stream in the lower lip).

## Open tests that need the PC

| Test | Why it is open |
|---|---|
| Frame rate and GPU load while playing | **Measured** (RTX 3070, at the main monitor's pixel size): capped at 120 draws a second, gaps 8.3 ms median, 8.7 ms worst; the widget's own share of the card is 2.1–3.0%, against a target of 5%. Taken while a game was using the card; repeat with nothing else running. |
| Idle GPU and CPU (paused, pointer away, 15 fps breathing) | **Measured:** 0.36% of the card and 0.4% of one CPU core; exactly 0 when the window is hidden. Same caveat about the game. Whether 0.36% counts as "near zero" is the owner's call; stopping the breathing after a minute would make it 0. |
| Transparency | **Answered.** Inside an ordinary window the compositor adds the glow where alpha is at least 1/255 and discards it where alpha is exactly 0, which is what gives the glow its hard border. In a transparent window the main monitor (125%) behaves the same way and the second monitor (100%) keeps the light even at alpha 0 (`AUDIT.md` item 3, `tools/capture/premul-probe.js`). Per-pixel transparency itself works. |
| Click-through outside the shape | **Half proven.** The page, the message to the window and Windows' own answer to "which window gets a click here" all agree (`test=passthrough`, 8 of 8). Not yet tried with a real mouse: whether moves keep arriving while the window lets clicks through. |
| Real refraction through screen capture | **Tried and working** (`refract=live`): about 2 points of GPU and half a percent of a core extra, no border found. It takes the widget out of every screenshot and screen share and needs the screen captured while the widget is visible, so it is kept as an option, off by default (`AUDIT.md` item 2). Not tried on the monitor a game is running on. |
| Always on top, drag, remembered position, not stealing focus from a game or FL Studio | Built in `tools/widget-proto`. Electron's default on-top level fell behind other windows while a full-screen game had the foreground; the 'screen-saver' level stays on top (`onTop()` in `main.js`). Drag, position and focus need a real mouse and have not been tried by hand. |
| Audio glitches under load | Not testable without the engine. |
| Real covers and palettes from `data/art` and `data/colors.json` | Six real covers are photographed each round (`real=1`). The palettes are still worked out by the prototype's own `palette.js`, not read from `data/colors.json`. A white cover floods the body with white pigment (`AUDIT.md`, round 11). |

## Checks that were run

- Hit-test against the drawn shape (top face, underside and tile, at rest): 2 mismatches in 86,000 samples, both within 2 units of an edge.
- Edges at 200% zoom on dark and light, through round 5: no stair-stepping, no dark outline.

## What's left, in order

1. ~~On the PC: run the prototype on the real GPU.~~ Done: `AUDIT.md`. Idle cost moves to the widget-window step.
2. Prove the widget window in Electron first (the owner's order): transparency, click-through, refraction experiment, idle GPU. Then finish the still against `AUDIT.md`, with real covers.
3. Tune and record each interaction; correct section 6a.
4. Prove the widget window in Electron (transparency, click-through, on top, drag, position).
5. Phases 2 to 6 of the plan: shell and engine, Midnight Glass, widget in the shell, verification, README.
