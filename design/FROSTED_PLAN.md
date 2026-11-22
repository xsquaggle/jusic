# Frosted Jusic: the plan

Written at stage 0 (22 November 2026). The brief is `FABLE_PROMPT_FROSTED.md`; this is how I intend to meet it. Where they differ, the brief wins unless `HANDOFF.md` records a decision.

## The idea in one paragraph

Glass light doesn't change from frame to frame, so it is worked out **once**: a small shader (the *kiln*) renders each glass surface when its size or the album's colours change, hands the result to the page as a plain bitmap, and then does nothing. Everything that moves afterwards is the compositor sliding or fading finished bitmaps (`transform` and `opacity` only), or a tiny canvas (the spectrum, the seek line). At rest the app draws **zero frames**. That is what makes a richer picture than the references cost less than today's app, which redraws at the monitor's full 360 Hz even while paused.

## 1. How each surface is drawn

**The kiln** (`public/js/kiln.js`, one WebGL2 context on an `OffscreenCanvas`, draws only on demand). One fragment shader, about 300 lines of GLSL. A surface is a short list of soft-blended shapes (rounded boxes and circles joined with a smooth minimum, which is what makes glass look poured rather than assembled), given as uniforms. From the exact signed distance the shader builds a rolled-edge height profile and lights it with the brief's four lights, in order:

1. light carried inside the body, lifted rose-grey, rising toward lower edges, with faint streaks inside the glass (noise stretched along the form);
2. one broad satin sheen on upper shoulders;
3. a crisp hot line on top silhouettes with darker glass just inside it;
4. a thicker, warmer roll along bottom edges, coral at the sides with a near-white core, and a soft bloom below it onto the room.

Colour enters only as light: rims, lower rolls, the inner glow and the played seek line take the cover's two hues (primary and secondary, so one surface carries a gentle hue shift rather than one flat tint). Highlights stay near white. Covers with little colour give silver (the round-62 rule from `prototypes/mercury/palette.js`).

| Surface | Drawn by | Redrawn when |
|---|---|---|
| The room: dark warm ground, wisps of the cover's colour, the window's glowing rim | kiln, one full-window bitmap | palette change; resize settles (stretched meanwhile); a slow drift while music plays (below) |
| Sidebar, list panel, capsules, cards, menus, EQ, settings, dialogs, toasts | kiln, one bitmap each at its real size | palette change; its size changes |
| Bowls (rest and "hot" state) | kiln, one bitmap per size, shared by every bowl of that size | palette change |
| The ribbon: bulb, waist, lip, pod, tail, with wells for the cover pocket and the three bowls | kiln, from its distance field at the real width, so nothing stretches | palette change; resize settles |
| The cover in its pocket | a normal `<img>` *under* the ribbon bitmap; the glass has a hole there and paints its own rim highlight, contact line and inner shadow over the art's edges | never (the art stays crisp) |
| Text, icons, thumbnails, era chips | DOM (Montserrat, upright, never refracted); chips are small CSS pills tinted with each era's colour | normal layout |
| Seek and volume lines | a small 2D canvas: glowing core, bead, dim remainder, following the ribbon's lower body | 4 to 8 times a second while playing; every pointer move while dragging |
| Spectrum (focus view) | 2D canvas behind the ribbon; a second copy at about one-sixth resolution, masked to the ribbon, is the "seen through frosted glass" version; the reflection is a mirrored copy | at most 60 a second, only in the focus view, only while visible |

No `backdrop-filter` anywhere. Nothing scrolls under glass: the list ends above the ribbon with a short fade.

**Palette changes never cut.** The new bake is drawn into a second bitmap on top and faded in. The ribbon gets the signature version (section 4, "the pour").

## 2. Why this fits the CPU ceiling

The owner's ceiling (22 November): aim for 5% of the machine, 7% the highest while music plays, never above 10%. The brief's lower targets stay my working targets.

| What | Cost model |
|---|---|
| Idle, paused | zero frames, zero timers beyond the once-a-second idle bookkeeping the server stream needs |
| Playing, library | time text once a second; seek line 4 to 8 Hz (a 1,000 px line over a 3-minute song moves 5 px a second, so 8 steps a second are sub-pixel and look continuous); bass detector reading the analyser about 30 times a second with no drawing unless a strong hit lands |
| The room's drift | re-baked about 4 times a second while playing, at sub-pixel steps, which the eye reads as continuous motion. Still when paused, hidden or with reduced motion. Dropped if it measures more than about 0.3% |
| Focus view | the spectrum at up to 60 fps: one analyser read, about 100 rectangles, one low-resolution copy |
| Track change | one set of bakes (a few milliseconds of GPU), one fade |
| Resize | bitmaps stretch with their boxes; one re-bake 150 ms after the last change. The list is virtualised (fixed row height, a few dozen recycled rows) |

**The 360 Hz lesson.** The main monitor refreshes 360 times a second, so anything driven by `requestAnimationFrame` or a CSS animation costs three times what it would at 120 Hz, whether or not it changes anything. Rules that follow: no perpetual CSS animations at all; one scheduler owns every loop, caps each by clock time rather than by frames, uses timers (not `requestAnimationFrame`) for anything at 30 fps or below, and stops when nothing is moving, the page is hidden, or the window is covered.

Electron: `server.js` unchanged in a `utilityProcess`; the main process does nothing between events.

## 3. Code and asset budget

| Piece | Lines (estimate) |
|---|---|
| `desktop/main.js`, `desktop/preload.js` | 260 |
| `kiln.js` (context, shader, shape lists, bake queue) | 520 (about 300 GLSL) |
| `loop.js` (the scheduler) | 60 |
| `ribbon.js` (geometry, seek and volume lines, controls) | 260 |
| Crossfade and normalize in `player.js`, loudness store | 220 |
| Virtual list, focus view, palette pipeline changes | 300 |
| CSS: the old 2,116 lines replaced by roughly 1,500 (glass needs no gradient stacks or blur fallbacks any more) | about -600 |
| Removed with the old look: `fx.js` tilt, ripple and glide code, the rail, the ambient layers | about -350 |

Net: roughly **+700 to +1,300 lines** against the +1,800 aim. Binary assets added: **none** (the glass is procedural; only Montserrat stays in `public/fonts/`, Outfit and Manrope go).

## 4. Above and beyond (look and feel: I'll just do these)

- **The pour.** On a track change the new colour seeps out of the cover's pocket and through the ribbon like dye through frosted glass: the front runs faster along the thick rims than through the body, drawn by the shader over about a second (the ribbon is small, so this is cheap). Then the rest of the window takes the colour as a wave, nearest surfaces first. One glint runs the ribbon's lower roll as it lands.
- **The ribbon is one object.** Opening the focus view doesn't swap screens: the same ribbon glides from the bottom of the window to the centre and grows, while the library slides away beneath it like a lower sheet of glass.
- **Light that knows where you are.** A soft sheen leans toward the cursor on the ribbon and the bowls (a pre-baked highlight moved by `transform`).
- **Bowls with weight.** Press sinks the bowl and heats its rim; release springs back with a touch of overshoot (`springs.js` presets).
- **The filament.** The seek line's bead swells under the cursor; while dragging, the time rises out of the glass above it.
- **Menus grow out of the glass** they were opened from.
- **The room breathes with the music:** wisps drift while a song plays and hold still when it's paused.
- **Calm bass:** only a strong hit sends a slight swell through the ribbon's lower roll, fading in half a second.

## 5. Feature ideas (owner's call; none are built without a yes)

| # | Idea | Cost |
|---|---|---|
| 1 | **The glass remembers the song.** Normalize-volume has to listen to each track's loudness anyway. Keep that contour, and from the second play on the dim part of the seek line is drawn as the song's own shape (quiet intro, loud chorus), so you can see where you're seeking. | about 50 lines, no extra CPU (reuses the measurement) |
| 2 | **Sleep fade.** A timer (15, 30, 45, 60 minutes, or end of this track) that fades the music out over its last minute and pauses. | about 40 lines, none |
| 3 | **Drop it in the glass.** Drag a track onto the ribbon to play it next, or onto a playlist in the sidebar to add it. | about 70 lines, none at rest |
| 4 | **Album-aware crossfade.** Tracks that follow each other on the same album play gapless instead of crossfading, so live albums and suites aren't smeared. | about 12 lines, none |
| 5 | **A peek at what's next.** Resting on the Next bowl shows the coming track's cover and title in a small bubble of glass. | about 40 lines, none at rest |

## 6. Order of work

Stages as in the brief. Within them:

1. **Stage 0** (this): tools, baseline, this plan.
2. **Stage 1:** the shell. Today's interface unchanged in Electron; measure what Electron itself costs.
3. **Stage 2:** the material spike (`?spike=1`): kiln, room, one panel, bowls in three states, pocket, ribbon with both lines, rose then blue. Measured. **I wait for the owner here before stage 4.**
4. **Stage 3** (while waiting): scheduler, virtual list, palette pipeline, crossfade, normalize, taskbar buttons and progress.
5. **Stages 4 to 6:** library, focus view, every other surface.
6. **Stage 7:** the list in section 4, and any approved ideas from section 5.
7. **Stage 8:** verify every feature by hand, the full scenario set, hand over.

## 7. Risks I already see

- **Measuring on a busy PC.** The owner uses the main monitor (and plays games on it), so runs happen on the second monitor, behind his windows, at 120 Hz. The gate must also hold on the 360 Hz main monitor: that pass needs about 45 quiet minutes there, which I'll ask for.
- **The browser's own floor while resizing** may sit near the ceiling whatever the page draws; the empty-page control (S6E) says how much is ours.
- **Bake time at 4K** or on a weaker GPU: if a full set of bakes ever takes more than a few milliseconds of main-thread time, the kiln moves to a worker (it is written against `OffscreenCanvas` from the start so that is a small change).
