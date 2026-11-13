# Handoff: Jusic redesign

Written at the end of the cloud session, for the session that continues on the PC. `REDESIGN_PLAN.md` is the full plan; this is where things actually stand.

## Current state

- **Branch:** `redesign`. `main` is untouched.
- **Done:** the plan, and a standalone prototype of the Mercury widget in `prototypes/mercury/`.
- **Not started:** the Electron shell, the engine split, the Midnight Glass app, the widget window. No app code has been changed. `public/fonts/` (Outfit, Manrope, Montserrat, OFL) is the only addition outside `prototypes/` and `design/`.
- **Everything was rendered in software.** The cloud sandbox has no GPU and could not reach the PC. Nothing about frame rate, GPU cost, transparency or click-through has been measured.
- **The owner's rule for the widget:** do not go on to interactions until the still looks better than `design/references/widget-mercury-flow.png`, and send a reference-vs-current side-by-side (dark and light desktop) every round. It does not look better yet.

## Run the prototype

```bash
node prototypes/serve.js
```

Open `http://127.0.0.1:5190/prototypes/mercury/`. Press play to start the built-in test synth. Buttons at the bottom left: backdrop, size, close/appear, reduced motion.

URL options: `?bg=wallpaper` (light desktop), `?bg=window`, `?bg=black`, `?track=0..4`, `?scale=1`, `?dpr=2`, `?ss=2` (supersampling per axis), `?still` (reduced motion), `?play`, `?unformed`, `?capture=1` (clock stopped: step with `window.__mercury.step(n, dt, paint)`; `paint=false` advances the liquid without drawing).

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

Captures: `design/captures/mercury-still-round7.png` (latest side-by-side), `mercury-still-round5.png`, `mercury-before-after.png`.

## Where it still falls short of the reference

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
| Frame rate while playing, at 100% and 150% display scale | Target is a locked 60 fps on the RTX 3060; never run on a GPU. Supersampling defaults to 2× per axis at 100% scale; lower it first if it misses. |
| Idle GPU and CPU (paused, pointer away, 15 fps breathing) | Target is near zero. If it is not, cut the idle rate, the supersampling or the pressure iterations. |
| Transparency | The page outputs premultiplied alpha with glow added where alpha is low. Whether Windows composites that as intended on a real desktop is untested. |
| Click-through outside the shape | Planned with `setIgnoreMouseEvents(true, { forward: true })` driven by `hit()`. Not tried. This is the main technical risk. |
| Real refraction through screen capture | Idea only: `win.setContentProtection(true)` to keep the widget out of the capture, `desktopCapturer` for the screen, pass the region behind the widget in as a backdrop texture to bend. Unknown cost, and it means the app captures the screen, which the owner should agree to first. |
| Always on top, drag, remembered position, not stealing focus from a game or FL Studio | Not built. |
| Audio glitches under load | Not testable without the engine. |
| Real covers and palettes from `data/art` and `data/colors.json` | Only generated covers have been used. |

## Checks that were run

- Hit-test against the drawn shape (top face, underside and tile, at rest): 2 mismatches in 86,000 samples, both within 2 units of an edge.
- Edges at 200% zoom on dark and light, through round 5: no stair-stepping, no dark outline.

## What's left, in order

1. On the PC: run the prototype on the real GPU and desktop. Frame rate and idle cost first.
2. Finish the still against the list above, with real covers.
3. Tune and record each interaction; correct section 6a.
4. Prove the widget window in Electron (transparency, click-through, on top, drag, position).
5. Phases 2 to 6 of the plan: shell and engine, Midnight Glass, widget in the shell, verification, README.
