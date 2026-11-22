# Handoff: Jusic in frosted Mercury glass

The brief is `design/FABLE_PROMPT_FROSTED.md`; the plan is `design/FROSTED_PLAN.md`. This file is where things actually stand. **"Current status" is rewritten at every checkpoint**; a fresh session carries on from it alone. The Mercury widget work's handoff is archived at `design/archive/HANDOFF-mercury.md`.

## Current status

**Stage 0 is done. Stage 1 (the desktop shell) is built and checked by hand, but not yet measured. The owner sent "wrap up" on 22 November 2026; nothing is half-applied. Branch `frosted`, pushed.**

Done:
- **Stage 0.** Branch, the brief and references committed, old handoff archived, my copy of the owner's real data in the git-ignored `data/` (410 tracks). `tools/perf/` built. Today's app measured (one pass, table below). `design/FROSTED_PLAN.md` written, with five feature ideas waiting for the owner's yes or no (its section 5).
- **Stage 1, built:** `desktop/main.js` and `desktop/preload.js` (187 lines together). Today's interface, unchanged apart from a 30 px drag strip, runs in a frameless Electron window with Windows' own caption buttons (`titleBarOverlay`).
- **Stage 1, checked by hand** (how, in brackets):
  - `server.js` unchanged in a `utilityProcess`, on 5175, or 5176 when the daily app holds 5175 (page loaded from `http://127.0.0.1:5175/`, 376 rows).
  - Every request outside `127.0.0.1` is blocked (a fetch to example.com and one to Google Fonts both failed from the page). The Google Fonts link is gone from `index.html`.
  - Output device names show with no microphone prompt (8 outputs, all named, before any click).
  - Playback works; Windows' media overlay sees it as `jusic.desktop` and its Next and Play/Pause reach the app (`tools/media-overlay.ps1 -Press next` changed the track, `-Press toggle` paused it). That is the same path the keyboard's media keys take; the physical keys themselves weren't pressed.
  - Closing the window quits everything, server included (no `electron.exe` of ours left, port free).
  - Size and position are remembered (closed at 1200 x 760 on the second monitor, reopened there).
  - A second launch exits at once and one main process remains. Its "focus the open window" line was skipped in the test, because test runs never take the focus.
  - The Quit button shows in the desktop window.

Not done in stage 1:
- **Measure the shell** against the baseline: `node tools/perf/run.js --app electron --label shell-old-ui --sizes default --runs 1`, then `--occlusion on --only S8`. This is the number for "what Electron itself costs".
- **The test shortcut.** `npm run shortcut:frosted` is written (it makes "Jusic frosted" on the desktop and never touches the `jusic` shortcuts) but has not been run, so launching from a shortcut with no console window is unverified.
- The thumbnail buttons and taskbar progress exist in `desktop/main.js` but nothing in the page calls them yet (stage 3).
- `npm start` in a browser tab was not re-run after the small page edits (the Edge baseline used the same page before them).
- `README.md` not updated.

Written ahead, **untested**: `public/js/kiln.js` (233 lines, about 150 of GLSL), the shader that bakes the glass for the stage 2 spike. Nothing imports it yet and it has never been run, so treat it as a draft: the first job of stage 2 is to get one bake on screen and look at it.

**Exact next step:** run the two shell measurements above, add their table here beside the baseline, run `npm run shortcut:frosted` and launch from it once. Then stage 2: a `?spike=1` page that imports `kiln.js` and shows the room, one panel, three bowls, the pocket and the ribbon in the rose palette, then the blue one.

## Numbers

### The owner's ceiling (changed 22 November 2026)

"It's okay if the app exceeds 5%, but it absolutely should not go any higher than 10%. Really, 7% should be the all-time high when music is playing." So: aim for 5% of the machine, 7% the highest while playing, never above 10% in any 1-second sample. The brief's lower targets stay the working targets.

### Baseline: today's app in Edge

One run per scenario, default size only, on the second monitor, **while the owner was playing a game on the main monitor** (38.9% of the machine and 74.5% of summed GPU 3D busy with other things at the start). % of the whole machine, 16 logical processors. Reports: `design/perf/2026-11-22-baseline-edge-m2.json` and `-s8.json`.

| Scenario | Mean | p95 | Max 1 s | Busiest process | GPU 3D mean / max | Memory MB |
|---|---|---|---|---|---|---|
| S1 Idle, paused | 8.32 | 10.08 | **14.5** | gpu-process 59% | 20.3 / 20.8 | 1721 |
| S2 Playing, library, one track change | 13.34 | 15.36 | **16.34** | renderer 56% | 20.6 / 21.2 | 1776 |
| S3 Playing, spectrum | 13.28 | 15.2 | **16.29** | renderer 55% | 20.7 / 21.2 | 1688 |
| S4 Playing, not the active window | 13.06 | 14.36 | **14.74** | renderer 54% | 20.9 / 25.9 | 1714 |
| S5 Interacting while playing | 10.65 | 12.72 | **13.37** | gpu-process 53% | 20.9 / 23.1 | 1913 |
| S6 Resizing while playing | 14.15 | 16.88 | **17.12** | renderer 55% | 18.3 / 20.8 | 3177 |
| S7 Minimised, playing | 0.17 | 0.59 | 0.88 | renderer 78% | 0 / 0 | 2134 |
| S8 Fully covered, playing | 0.18 | 0.39 | 6.75 | main 58% | 0 / 0 | 976 |
| S9 Ten track changes, one a second | 13.03 | 15.16 | **15.16** | renderer 60% | 20.0 / 20.6 | 1444 |
| S10 Rescan (the scan took 0.5 s) | 12.68 | 14.17 | **14.17** | renderer 54% | 19.4 / 19.6 | 1297 |
| S6E Resizing an empty dark page (control) | 1.39 | 3.81 | 4.04 | main 64% | 0.3 / 0.6 | 1216 |

Bold is over the 10% ceiling. What it says:
- Today's app is over the ceiling whenever it is on screen, **including paused and idle** (8.3% mean). It redraws on every frame the display offers, and the page was offered 351 frames a second.
- Hidden, it costs almost nothing (0.2%), so the cost is all drawing.
- The browser's own floor for resizing is low (1.4% mean, 4% peak), so resizing is ours to keep cheap.
- In today's app S2, S3 and S4 are one condition: the spectrum sits beside the library, and the window was never the active one.

**What this baseline is not:** the brief asks for two runs, at default size and maximised, on the main monitor. The owner was using that monitor, so this is one pass under game load. The full set needs about 45 quiet minutes; ask for them (see "Open tests").

Conditions for every run so far: DevTools attached on `127.0.0.1:9333`; audio muted at the browser (`--mute-audio`; the audio path still runs); the window under the owner's windows with Chromium's occlusion check off so it rendered as if in view (S8 ran with the check on, under a topmost cover); never the active window.

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
- **A slightly smaller ribbon than the references** is my intent for stage 4 (about 200 px tall at the default size, against roughly 300 in the mock-up), so about ten rows show instead of six. Not built yet; to be shown in the spike for the owner to judge.

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

- Runtime code against `main`: **+426 / -6 lines** (the shell 187, `kiln.js` 233, page edits 6). `git diff --shortstat main -- public server.js lib desktop` reports +705 because it also counts the three font licence texts added on `redesign` (279 lines); two of those go when Outfit and Manrope are removed. Allowance: +2,500, aim +1,800.
- Tools: 694 lines (`tools/perf/` 670, `tools/media-overlay.ps1` 24). Aim: under about 800.
- Binary assets added: none.
