# Handoff: Jusic in frosted Mercury glass

The brief is `design/FABLE_PROMPT_FROSTED.md`; the plan is `design/FROSTED_PLAN.md`. This file is where things actually stand. **"Current status" is rewritten at every checkpoint**; a fresh session carries on from it alone. The Mercury widget work's handoff is archived at `design/archive/HANDOFF-mercury.md`.

## Current status

**Stages 0 to 3 are done, apart from the small items under "Still open". The material spike (stage 2) was sent to the owner on 22 November 2026 and he has not answered yet. Stage 4 (the real library window in the new look) must not start until he has. Branch `frosted`, pushed.**

What exists:
- **Stage 0:** the baseline of today's app, `design/FROSTED_PLAN.md`. The owner approved all five feature ideas in the plan's section 5 (built in stage 7).
- **Stage 1:** the Electron shell, `desktop/main.js` + `desktop/preload.js` (187 lines). Checked by hand and measured (see "Numbers").
- **Stage 2:** the glass. `public/js/kiln.js` (the shader), `glass.js` (surfaces: bake on size or palette change, fade or pour between palettes), `ribbon.js` (the ribbon's shape and seek line), `palette.js`, `public/frosted.css`, and the spike page `public/spike.html` + `js/spike.js`. Sheet: `design/captures/frosted/sheet-spike-library.png`.
- **Stage 3:**
  - `public/js/loop.js`: the one scheduler. Clock-paced timers (never display frames), nothing runs while the page is hidden, a task ends itself, motion tasks are skipped under reduced motion. `glass.js` fades and pours and the spike's pretend transport run through it.
  - `public/js/vlist.js`: the virtualised list (fixed row height, recycled rows). The spike uses it over the whole real library: 324 tracks, 17 rows in the DOM.
  - `public/js/player.js`: **two decks.** Crossfade (equal-power, through the same equaliser, analyser and output device; a natural end only), a 150 ms fade on manual skips, pause mid-fade lands on the new track, repeat-one loops, the queue's last track rings out. Each deck has a level gain before the equaliser for **evening out volume**: every track is measured while it plays (RMS and peak, about four looks a second, riding on `timeupdate`) and brought to -18 dB RMS from its next play on, never more than +6 dB and never past full scale. Measurements: `data/loudness.json` through new `GET`/`PUT /api/loudness` (delete the file and it is rebuilt as tracks play). Tested in the running app by script: all of the above behaved, a measurement was saved, no page errors.
  - Settings has a **Playback** section (old look for now): Crossfade with its length (1 to 12 s, off by default), Even out volume (off by default), Reduce motion. New settings fields: `crossfade` (seconds, 0 = off), `crossfadeLength`, `normalize`, `reduceMotion`.
  - The page tells the desktop shell what is playing (`window.desktop.transport`, only when the picture changes) and answers the taskbar thumbnail buttons.
  - `palette.js`: a cover that is mostly black or white but has a small, vivid accent keeps up to 40% of that hue instead of going fully silver (my change; see "Decisions").
  - The runner knows the spike page (`--ui spike --page spike.html`) and has `S5S` (scrolling and pointer sweep alone).

Still open (none blocks stage 4):
- **The test shortcut.** `npm run shortcut:frosted` is written but not run: a real double-click launch takes the focus and the owner was at the PC. Run it and launch from it once when he is away, or ask him to.
- The taskbar buttons and progress were not looked at (the calls are made without error; nobody has seen the taskbar).
- Crossfade and evening-out were tested by script with the audio muted: nobody has listened to them yet. Ask the owner to try a crossfade and a quiet track.
- `README.md` not updated. Physical media keys not pressed (the overlay path they use is proven). `npm start` itself not run, but the same page was loaded in Edge with the new engine and played ten track changes.
- Evening-out works from a track's second play. Measuring ahead (decoding a few seconds of the next track before it starts) would make it work from the first; not built.

**Exact next step:** wait for the owner's answer on the spike. If he approves the material: stage 4, the real library window. Replace `index.html`'s layout and `styles.css` with the spike's structure and `frosted.css`; drive it from the real store, player and `ui.js` logic (views, search, sort, menus stay as they are underneath); the ribbon's controls wired to the player (seek, volume, prev, play, next, the cover opening the focus view); `art.js` handing the playing cover's palette to `setPalette` with the cover's position for the pour; the glass title bar and `window.desktop.overlay`; delete `fx.js`, the rail and the ambient layers, and the spike page. If he asks for changes to the material, make them in `kiln.js` / `ribbon.js` and send new sheets first.

## Numbers

### The owner's ceiling (changed 22 November 2026)

"It's okay if the app exceeds 5%, but it absolutely should not go any higher than 10%. Really, 7% should be the all-time high when music is playing." So: aim for 5% of the machine, 7% the highest while playing, never above 10% in any 1-second sample. The brief's lower targets stay the working targets.

### The three states so far

% of the whole machine (16 logical processors), one run each, second monitor, under the owner's windows with the occlusion check off, while he was using the PC (a game on the main monitor for most of it). Mean / worst second.

| Scenario | Today's app in Edge | Today's app in Electron | **The glass spike in Electron** (default size) | Spike, maximised |
|---|---|---|---|---|
| S1 Idle, paused | 8.32 / 14.5 | 11.47 / 13.15 | **0.02 / 0.59** | 0.01 / 0.2 |
| S2 Playing, one track change | 13.34 / 16.34 | 16.86 / 20.01 | **0.13 / 1.37** | 0.14 / 1.46 |
| S3 Playing, spectrum | 13.28 / 16.29 | 17.57 / 20.31 | not in the spike | |
| S4 Playing, not the active window | 13.06 / 14.74 | 16.23 / 18.3 | 0.12 / 0.49 | 0.14 / 0.58 |
| S5 Interacting | 10.65 / 13.37 | 13.95 / 19.75 | not in the spike | |
| S5S Scrolling the whole library in 20 s, then the pointer across rows | | | **1.9 / 5.9** (324 real tracks) | |
| S6 Resizing | 14.15 / 17.12 | 16.95 / 19.69 | **2.12 / 5.82** | |
| S7 Minimised | 0.17 / 0.88 | 0.16 / 1.06 | 0.04 / 0.19 | 0.01 / 0.19 |
| S8 Fully covered | 0.18 / 6.75 | 0.15 / 0.68 | 0.04 / 0.49 | |
| S9 Ten track changes, one a second | 13.03 / 15.16 | 18.66 / 20.5 | **0.94 / 2.04** | 0.71 / 2.45 |
| S10 Rescan | 12.68 / 14.17 | 17.45 / 19.02 | not in the spike | |
| S6E Resizing an empty page (control) | 1.39 / 4.04 | 0.70 / 2.52 | 0.75 / 3.24 | |

GPU 3D (mean): today's app about 20% (Edge) and 12% (Electron) whenever visible; the spike 0% idle, 0.07% playing, about 1% while resizing or pouring. Memory: 1.3 to 3.2 GB (Edge), 0.9 to 2.2 GB (Electron, old interface), 0.4 to 0.6 GB (spike).

Reports in `design/perf/`: `2026-11-22-baseline-edge-m2*.json`, `2026-11-22-shell-old-ui.txt` (its JSON was lost to a runner bug, fixed since), `2026-11-23-spike*.json` (`spike-3` is the final one; `spike` has S4, S7, S8 and the control, taken before the last trims).

What they say:
- **Today's app redraws on every frame the display offers** (351 a second), paused or not. That is the whole of its cost: hidden, it uses 0.2%.
- **Electron costs about a third more than Edge per drawn frame** and the same or less when nothing is drawn. So a design that draws no frames at rest matters even more in the shell.
- **The spike draws nothing at rest** (0.02%), and "playing" (the seek line 5 times a second, the time once a second) is 0.13%.
- **CSS animations are the trap on this display.** The first spike faded palettes with a CSS animation: ten track changes cost 3.85% mean and 6.11% peak. Stepping the same fade from a 30-a-second timer: 0.94% and 2.04%. Same picture, a quarter of the cost. The plan's rule (no CSS animations for anything that lasts) is now measured.
- **Resizing** costs 2.1% mean and 5.8% peak against a floor of 0.75% and 3.2% for an empty page. Moving the "melt" of the panels from a CSS mask into the bake took the peak down from 7.4%.
- **Scrolling** the whole library in 20 seconds costs 1.9% mean and 5 to 6% at its worst second. That is the browser's own smooth scrolling, composited at 351 frames a second: keeping every thumbnail decoded changed nothing, and removing the rows' fade mask changed nothing. Turning smooth scrolling off would cut it but feel worse; I kept it.
- **The scheduler changed nothing measurable** (S1 0.01, S2 0.13 / 1.47, S9 0.77 / 2.55 after it), as intended: same rates, one owner.
- What the spike does **not** include: audio decoding, the real list with 400 rows, the spectrum, menus. Those arrive in stages 3 to 6 and get measured there.

**What these runs are not:** the brief asks for two runs each on the main monitor. The owner was using it, so every number here is one run on the second monitor. The page was still offered the main monitor's 351 frames a second there, so the frame-rate cost is represented; the 125% scale (56% more pixels) is not. The full set needs about 45 quiet minutes on the main monitor (see "Open tests").

Conditions for every run: DevTools attached on `127.0.0.1:9333`; audio muted at the browser (`--mute-audio`); never the active window; S8 with the occlusion check on, under a topmost cover.

## The machine

- Windows 11, 16 logical processors, RTX 3070, Node 24.14.0, Electron 45.3.2.
- Main monitor: 2560 x 1440 at **360 Hz**, scaled 125%. Second monitor: 1920 x 1080 at 120 Hz, 100%, to the left.
- **Chromium ticks at the main monitor's rate even for a window on the second one** (351 frames a second measured there). So `requestAnimationFrame` and any running CSS animation cost three times what they would at 120 Hz, on either monitor. The plan's frame rules follow from this.
- 5% of the machine is 0.8 of one logical processor.

## Decisions (what I chose and why)

- **Measurement runs stay out of the owner's way** (his instruction, 22 November: "run tests on my other monitor, I am using the one you are currently messing on"). The runner opens the window on the second monitor, pushes it to the bottom of the window stack, never activates it, and turns Chromium's occlusion check off so the page still renders. `--screen main` undoes all of that for a run on the main monitor when it is free.
- **Audio is muted at the browser for runs, not in Windows**, so no Windows setting is touched.
- **Focus is not emulated.** DevTools' focus emulation also makes a hidden page report itself visible, which would hide exactly what S7 and S8 test. It is switched on only for the two seconds S5 types into the search box.
- **The interim title bar is a plain 30 px drag strip** above today's interface. The glass title bar comes with stage 4.
- **The window's place is kept in memory and written once on exit**, not on the window's `close` event: a page calling `window.close()` (the Quit button does) never fires that event in Electron.
- **Fades are stepped from a timer (30 a second), never CSS animations or transitions that last.** Measured: a quarter of the cost on this display (see "Numbers"). Short CSS transitions on press and hover stay.
- **Panels that run down behind the ribbon melt away in the bake** (`melt` in `glass.js`), so their lower edges never show and no CSS mask is needed.
- **The seek line runs beside the cover, along the waist and under the bowls**, a constant distance above the ribbon's lower roll, instead of dipping under the cover as in the reference: on the bright roll under the cover it was hard to read, and this way it is also longer.
- **The demo library is injected by the capture tool** (`window.__demo`), not served: nothing about it ships in the app.
- **A small vivid accent keeps its hue.** The prototype's rule turns a cover silver when under 5% of its pixels are colourful. 14 of the owner's 119 covers fall under that and 16 more are blended. A black sleeve with a red-lit face is one of them, and its red is real, not invented. So when the few coloured pixels are strongly saturated, the palette keeps up to 40% of their hue. White and grey covers still go silver. The owner hasn't seen this; show him one such cover.
- **Smooth scrolling stays on**, at its measured cost (see "Numbers").
- **Evening-out measures RMS, not LUFS**, and applies from a track's second play. Simple, cheap, and needs no decoding ahead; the target is -18 dB RMS.
- **A slightly smaller ribbon than the references** (27% of the window's height, about 233 px at the default size, against roughly 300 in the mock-up), so more rows show. It is in the spike for the owner to judge.

## The owner's creative direction (22 November 2026, his words, shortened)

Act as Jusic's senior creative director and lead interaction designer, to the standard of a flagship app. Keep the exact Mercury glass identity and push its execution. The playing album's artwork directs the whole interface: a harmonious palette for glass tint, lit edges, bowls, the atmosphere and the spectrum, with coordinated colour transitions between tracks. Every hover, press, drag, scrub and view change tactile and physically connected to the glass. Elegant depth, subtle parallax, fluid transitions, restrained effects that respond to the actual music. A few breathtaking signature moments, with calm spacing, crisp type and effortless everyday use. Inspect it in motion as carefully as in screenshots. Target reaction: "Wait, this is a real, working app?"

My reading: this sits inside his standing motion rule (the glass stays still while music plays; only strong bass hits swell it slightly), not against it.

## Open tests

- **The full baseline and every later gate on the main monitor** (two runs, default and maximised, 360 Hz, 125%): about 45 minutes with the main monitor free and no game running. Ask the owner for a time.
- Physical media keys on the keyboard (the overlay path is proven; the keys themselves are not).
- A second launch focusing the open window (needs a run that is allowed to take the focus).

## Things that bit me (so they don't bite again)

- PowerShell names ignore case: `$h` was the `-H` height parameter, which made the test window 1,848 px tall for a while. The window handle is `$hwnd` now.
- A test launch without a position opens on the main monitor. One did, for a few seconds. Always pass `--perf=x,y` (the runner does).
- The owner's Mercury widget runs as `electron.exe` from this repo's `node_modules` (`tools/widget-proto/main.js`). Never stop `electron.exe` by name; `tools/perf/stop.ps1` matches on `--perf` and skips `widget-proto`.
- A cover window with `WS_EX_NOACTIVATE`, or one that isn't topmost, doesn't count as covering for Chromium. The cover is topmost and shown without activation.
- Don't edit `public/` while a run is going: S6E reloads the page.
- Scripted text replaces lose backslashes on the way through the shell; use the Edit tool for anything with a Windows path in it.
- `git checkout` writes Windows line endings here; normalise before scripted replaces.

## Hard rules (from the brief, restated so they're never missed)

- `Z:/jusic` is read-only. The daily install `C:\Users\g8rla\OneDrive\Documents\Claudington\jusic-player` is read-only (copy out, never in).
- No network except `127.0.0.1`. Never commit to or merge into `main`. Don't touch `mercury-3d`, its worktree, the Mercury widget, or the real desktop and Start Menu shortcuts.
- Server API and port 5175 stay as they are; dev runs fall back to 5176 with their own profile in `data/`.

## Budgets so far

- Runtime code against `main`: **+1,516 / -40 lines**, with the old interface still in place (the shell 187, kiln 249, glass 150, ribbon 71, palette 120, loop 58, vlist 54, `frosted.css` 134, the spike page 260, engine and settings about +190, server +45). The spike page goes when stage 4 lands, and stage 4 replaces `styles.css` (2,116 lines) and removes `fx.js` and the old layout code. Allowance: +2,500, aim +1,800.
- GLSL: about 170 lines (allowance about 400).
- Tools: 809 lines (`tools/perf/` 686, `tools/capture/shot.js` 56, `tools/demo/make-covers.js` 43, `tools/media-overlay.ps1` 24). Slightly over the aim of 800; the old Mercury capture scripts in `tools/capture/` (about 760 lines) are not counted and can go once nothing needs them.
- Binary assets added to `public/`: none. (The demo covers, 55 KB, live in `tools/demo/`.)
