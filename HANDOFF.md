# Handoff: Jusic redesign

Written at the end of the cloud session, for the session that continues on the PC. Read `REDESIGN_PLAN.md` for the full plan; this is where things stand.

## Current state

- **Branch:** `redesign`. `main` is untouched.
- **Done:** the plan (`REDESIGN_PLAN.md`), and a standalone prototype of the Mercury widget in `prototypes/mercury/`.
- **Not started:** the Electron shell, the engine split, the Midnight Glass app, the widget window. No app code has been changed.
- **Everything so far was rendered in software.** The cloud sandbox has no GPU and could not reach the PC. No frame rate, GPU cost, transparency or click-through behaviour has been measured.

## Run the prototype

```bash
node prototypes/serve.js
```

Then open `http://127.0.0.1:5190/prototypes/mercury/`. Press play to start the built-in test synth. The buttons at the bottom left switch the backdrop, size, reduced motion, and close/appear.

URL options: `?bg=wallpaper` (light desktop), `?bg=window`, `?track=0..4`, `?scale=1`, `?ss=2` (supersampling), `?still` (reduced motion), `?capture=1` (clock stopped; step frames with `window.__mercury.step(n, dt, paint)`).

Files: `shape.js` (outline, curves, hit-test, and the GLSL generated from the same numbers), `shaders.js`, `mercury.js` (renderer and physics), `ink.js` (label sheet), `springs.js`, `palette.js`, `demo.js` (test harness only).

## The still look

Latest reference-vs-current image: `design/captures/mercury-still-round7.png`. The owner's rule: **don't go on to interactions until the still looks better than `design/references/widget-mercury-flow.png`**, and send a side-by-side (dark and light desktop) every round.

In place as of round 7:
- See-through glass body: the desktop shows through, tinted; a soft smoky tint only behind the words, the timeline and the volume strip.
- A visible underside along the lower edge that slides with the cursor's tilt.
- The cover as a bright glass tile floating above the body, overlapping its upper-left edge, throwing a shadow and its colour onto the liquid.
- Upright title and artist. All words and glyphs are drawn inside the liquid from a label sheet.
- One timeline track that follows the lower edge; reshaped tail; utility dishes (open app, hide) set into the lip at the right end, shown on hover.
- Pigment drawn as light, with a stream along the lower body.

Still short of the reference, in order:
1. **On a light desktop the body washes toward white** and the volume strip has low contrast. Needs tuning against the real desktop.
2. **No refraction of the desktop.** A page cannot see what is behind its window. Idea to try on the PC, unverified: exclude the widget from capture (`win.setContentProtection(true)`), capture the screen with `desktopCapturer`, and feed the region behind the widget in as a backdrop texture to bend. Check the cost and whether it is acceptable to you before keeping it.
3. **Depth.** The underside reads in places as a second outline rather than a shaded wall, and the view is top-down. The reference is drawn in perspective.
4. **Pigment.** The stream starts under the cover but does not yet run as long threads along the whole lower body.
5. **The cover tile's thickness is subtle**, and the test covers are generated stand-ins. Use real covers from `data/art`.

## Motion spec status

The spec is `REDESIGN_PLAN.md` section 6a.

| Item | Status |
|---|---|
| Sound → liquid (swell, waves, kick, shimmer) | Built, untuned |
| Pigment drops, circulation, obstacles, song-change mixing | Built, untuned |
| Approach hover, dimple, wake | Built, untuned |
| Press squash, ripple, pigment puff | Built, untuned |
| Play/pause morph, wake and settle | Built, untuned |
| Seek bead stretch, line bend, rising time lens, release ripple | Built, untuned |
| Volume drives the glow | Built, untuned |
| Skip lurch | Built, untuned |
| Drag slosh | Built in the renderer; the test page drags a DOM element, not a real window |
| Appear / close | Built, untuned |
| Idle breathing at 15 fps | Built; cost unmeasured |
| Reduced motion | Built, unchecked after the latest changes |
| Clips of each interaction, compared against the description | **Not done** |

All of it ran once in a smoke test without errors **before** the round-6 rewrite of the surface shader (glass body, underside, tile). It has not been re-run since.

Two things in section 6a are out of date after round 6 and need correcting there: the cover is no longer set into the metal (so "the cover is solid, the flow goes round it" now applies only to the three buttons), and text is upright rather than curved.

## Checks that were run

- Hit-test against the drawn shape (top face, underside and tile, at rest): 2 mismatches in 86,000 samples, both within 2 units of an edge.
- Edges checked at 200% zoom on dark and light through round 5: no stair-stepping, no dark outline. Not re-checked at 200% after round 6.

## What's left, in order

1. On the PC: run the prototype on the real GPU and desktop. Confirm 60 fps and the idle cost before anything else.
2. Finish the still (list above) with real covers.
3. Tune and record each interaction; fix section 6a to match.
4. Prove the widget window in Electron: transparency, click-through outside the shape, always on top, drag, remembered position. This is the main technical risk and has not been tried.
5. Phases 2 to 6 of the plan: shell and engine, Midnight Glass, widget in the shell, verification, README.
