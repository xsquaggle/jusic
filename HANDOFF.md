# Handoff: Jusic in frosted Mercury glass

The brief is `design/FABLE_PROMPT_FROSTED.md`. This file is where things actually stand. **"Current status" is rewritten at every checkpoint**; a fresh session carries on from it alone. The Mercury widget work's handoff is archived at `design/archive/HANDOFF-mercury.md`.

## Current status

**Stage 0 (orient and measure today's app), checkpoint 1 of about 3. Branch `frosted`, pushed.**

Done:
- Branch `frosted` created from `redesign`; the brief and the six reference images are its first commit.
- Old handoff moved to `design/archive/HANDOFF-mercury.md`; this file started.
- My real data copied (never moved) from the daily install into this repo's git-ignored `data/`: `state.json`, `index.json`, `colors.json`, `art/` (119 covers), `thumbs/` (119). 410 tracks, 12 favourites, 2 playlists, 353 play counts.

Half-finished: nothing.

**Exact next step:** build `tools/perf/` (a process-tree CPU sampler, a dependency-free DevTools client, the S1 to S10 scenario driver), then run the whole set on today's app in Edge as the baseline and put the table here.

After that: write `design/FROSTED_PLAN.md` (how each surface is drawn, the budgets, the order of work, the first feature ideas) and send the owner the baseline, the plan and the ideas. Then stage 1 (the Electron shell).

## The machine (conditions for every measurement)

- Windows 11, 16 logical processors, RTX 3070, Node 24.14.0, Electron 45.3.2 (dev dependency).
- Main monitor: 2560 × 1440 at **360 Hz** (Windows reports 359), scaled 125%. Second monitor: 1920 × 1080 at 120 Hz, to the left. An uncapped `requestAnimationFrame` loop on the main monitor therefore runs 360 times a second; every frame cap in the brief matters three times more than at 120 Hz.
- 5% of the machine is 0.8 of one logical processor.

## Decisions (what I chose and why)

- **Measurement runs mute the app's audio at the browser (`--mute-audio`), not in Windows.** The whole audio path still runs (decode, EQ, analyser, output stream); only the final mix to the speakers is silenced, so the PC doesn't play music aloud for an hour of scenarios and no Windows setting is touched. The app's own volume stays where the owner left it. Stated in every report.

## Hard rules (from the brief, restated so they're never missed)

- `Z:/jusic` is read-only. The daily install `C:\Users\g8rla\OneDrive\Documents\Claudington\jusic-player` is read-only (copy out, never in).
- No network except `127.0.0.1`. Never commit to or merge into `main`. Don't touch `mercury-3d`, its worktree, the Mercury widget, or the real desktop and Start Menu shortcuts.
- Server API and port 5175 stay as they are; dev runs fall back to 5176 with their own profile in `data/`.
- Never more than 5% of the machine's CPU in any 1-second sample, S1 to S10.
