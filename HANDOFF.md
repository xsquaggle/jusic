# Handoff: Jusic in frosted Mercury glass

The brief is `design/FABLE_PROMPT_FROSTED.md`; the plan is `design/FROSTED_PLAN.md`. This file is where things actually stand. **"Current status" is rewritten at every checkpoint**; a fresh session carries on from it alone. The Mercury widget work's handoff is archived at `design/archive/HANDOFF-mercury.md`.

## Current status

**Stages 0 and 1 are done apart from the items listed under "Stage 1, still open". Stage 2 (the material spike) is built, measured and sent to the owner. I am waiting for his answer on the material before stage 4, and doing stage 3 meanwhile. Branch `frosted`, pushed.**

Stage 0: branch, brief, references, the baseline of today's app, `design/FROSTED_PLAN.md`. **The owner approved all five feature ideas** in the plan's section 5 on 22 November 2026 (built in stage 7).

Stage 1: `desktop/main.js` and `desktop/preload.js` (187 lines). Today's interface runs in a frameless Electron window with Windows' own caption buttons. Checked by hand: the server unchanged in a utility process (5175, or 5176 if the daily app holds it); every request outside `127.0.0.1` blocked; output device names with no microphone prompt; Windows' media overlay controls it (`tools/media-overlay.ps1`); closing the window quits everything; size and position remembered; a second launch doesn't start a second copy. Measured: table below.

Stage 1, still open:
- **The test shortcut.** `npm run shortcut:frosted` is written but has not been run (a real double-click launch takes the focus, and the owner was mid-game). Run it and launch from it once when he's away, or ask him to.
- The thumbnail buttons and taskbar progress exist in `desktop/main.js` but nothing in the page calls them yet (stage 3).
- `npm start` in a browser tab not re-run after the small page edits. `README.md` not updated. Physical media keys not pressed (the overlay path they use is proven).

**Stage 2, done:**
- `public/js/kiln.js` (247 lines, 169 of GLSL): one shader, drawn on demand, that bakes glass surfaces, bowls, the room and the pour from soft-joined distance fields. `public/js/glass.js` (143): makes an element glass; bakes on first size, 150 ms after a size change settles, and on a palette change (a timer-stepped fade, or the pour). `public/js/ribbon.js` (68): the ribbon's shape and the seek line. `public/js/palette.js`: the prototype's palette with its silver fallback. `public/frosted.css` (129): the new stylesheet; it replaces `styles.css` in stage 4.
- `public/spike.html` + `public/js/spike.js`: the library reference's layout in that glass. Demo library when a capture tool injects one, otherwise a few real tracks. Click the cover or the Next bowl to pour the next cover's colours through; the Play bowl runs a pretend transport (seek line 5 times a second, time once a second, a pour at the end of the "song") so playing can be measured without audio. To look at it: open `http://127.0.0.1:5175/spike.html` in a browser while `npm start` runs.
- `tools/demo/`: the demo library and covers cut from the references. `tools/capture/shot.js`: a picture of any page at an exact size and scale, with `--demo`. `tools/capture/sheets/frosted-spike.json` + `sheet.js`: the reference | ours sheet.
- Sheet: `design/captures/frosted/sheet-spike-library.png` (rose and blue, half size), with the differences listed on it. Sent to the owner with the numbers.

**Exact next step:** stage 3, in this order: (1) `public/js/loop.js`, the one scheduler (timers for 30 fps and below, clock-capped, stops when hidden or still, honours reduced motion); (2) the palette pipeline in the real app (`art.js` using `palette.js`, results cached as today); (3) crossfade and normalize volume in `player.js` with their settings; (4) the virtualised track list; (5) taskbar buttons and progress wired from the page to `window.desktop.transport`. None of these depend on the owner's answer. **Do not start stage 4 (the real library window in the new look) until he has answered on the spike.**

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

- Runtime code against `main`: **+1,111 / -6 lines**, old interface still in place (the shell 187, kiln 247, glass 143, ribbon 68, palette 116, `frosted.css` 129, the spike page 215, page edits 6). The spike page goes when stage 4 lands, and stage 4 replaces `styles.css` (2,116 lines) and removes `fx.js` and the old layout code. Allowance: +2,500, aim +1,800.
- GLSL: 169 lines (allowance about 400).
- Tools: about 800 lines (`tools/perf/` 675, `tools/capture/shot.js` 55, `tools/demo/make-covers.js` 43, `tools/media-overlay.ps1` 24). At the aim; the old Mercury capture scripts in `tools/capture/` (about 760 lines) are not counted and can go once nothing needs them.
- Binary assets added to `public/`: none. (The demo covers, 55 KB, live in `tools/demo/`.)
