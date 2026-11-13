# Mercury visual audit

Round 8 (13 November 2026): the first look at the prototype on the real PC. Round 9 (same day): the same build in a real transparent window. Round 10 (same day): the screen-capture refraction experiment, which settles item 2. Nothing about the default look has been changed yet; the code changes are the 120 fps and 1920×1080 cap the owner asked for, a clear page for the widget window, and the refraction experiment, which is off unless asked for.

**Verdict: it does not beat any of the three references yet, and it is not close.** The proportions, layout and edge anti-aliasing are sound. What is wrong is the material: it reads as a flat shape traced in neon with a glow plate behind it, where the references read as a solid object made of dark glass and chrome. In a real window a second problem joins it: whatever is behind the widget shows straight through the body.

## How it was captured

- Real GPU, real compositor: Electron 45.3.2, ANGLE on Direct3D 11.
- The machine reports an **RTX 3070** (the plan says 3060). Main monitor **2560×1440 at 125% scaling, 360 Hz**; second monitor 1920×1080 at 100%.
- Round 8: an ordinary window photographed with `capturePage`. Widget at 100% size is 1075×500 screen pixels; the liquid is drawn at 1920×893 and resolved down (1.79× supersampling under the cap, was 2×). `node prototypes/serve.js`, then `npx electron tools/capture/mercury-shots.js out=design/captures/raw/round8`.
- Round 9: the real widget window (transparent, frameless, always on top, never focused) over test windows on the second monitor, photographed from the screen itself. `npx electron tools/widget-proto/main.js shots=design/captures/raw/round9`.
- Both: `?capture=1`, clock stepped 720 frames with the scripted test audio, test cover "Silver Current" (a generated fixture, not real artwork).
- Sheets are built with `npx electron tools/capture/sheet.js tools/capture/sheets/<name>.json`.

Images: `design/captures/mercury-audit-round8.png` (side by side with all three references), `mercury-audit-round8-zoom.png` (details at 200%, hover, small size), `mercury-window-round9.png` (the real window over dark, light and colourful windows), `mercury-refraction-round10.png` (today's body, the refracting body and the nearly opaque body over the same window, then refraction over stripes, colour and dark).

## What the real window showed (round 9)

- **It works.** Per-pixel transparency, no rectangle, no frame, always on top. By accident it was also seen over a full-screen game on the main monitor: it stayed on top and the game showed round it and through it.
- **The see-through body is the second-biggest problem,** worse than the stand-in backdrops suggested. A heading in the window behind reads straight through the title; over the game, item tiles and prices showed through the cover area and the control pod. It moves up from fourth to second.
- **The glow is treated differently on the two monitors** (measured with `tools/capture/premul-probe.js`, a canvas adding light with alpha 0, 1/255, 0.1 and 0.3):

  | Where | Light with alpha 0 | Light with alpha 1/255 or more |
  |---|---|---|
  | Ordinary window, main monitor (125%) | discarded | added in full |
  | Transparent window, main monitor (125%) | discarded | added in full |
  | Transparent window, second monitor (100%) | added in full | added in full |

  So on the main monitor the glow stops dead where the shadow's alpha runs out (the plate with a hard border), and on the second monitor it has no border but spreads as a fog that whitens the words round the widget on a light window. Light with no alpha behind it cannot be relied on.
- Not tested yet: click-through, dragging, focus, GPU load, refraction.

## What the refraction experiment showed (round 10)

Run it with `npx electron tools/widget-proto/main.js refract=live` (add `shots=<folder>` or `test=gpu dsf=1.25`). The window is left out of screen captures (`setContentProtection`), the page is given a capture of the monitor it is on (`getUserMedia` with a desktop source, 30 frames a second, 1920×1080), and the surface shader draws what is behind each point, moved the way the surface above it slopes, blurred and dimmed. With it on, nothing shows through the window itself.

- **It works.** The body bends, blurs and dims what is really behind it; words behind the widget no longer read through it or collide with its own. Over bold stripes the bending is plain to see. The exclusion from capture holds for a transparent, click-through window. No prompt, and no code outside the prototype's own page and window.
- **Cost, measured** (second monitor, widget at the main monitor's pixel size, card otherwise nearly idle at about 10% and 46 W, so shares read higher than in the first measurement, when a game had the card at 88–99%):

  | State | Own GPU share, off | Own GPU share, refracting | CPU of one core, off → refracting |
  |---|---|---|---|
  | Idle: paused, pointer away (15 draws a second) | 0.93% | 2.7% (1.73% drawing + 0.97% capturing) | 0.24% → 0.72% |
  | Playing (120 draws a second) | 7.9% | 10.3% (9.27% + 0.98%) | 1.65% → 2.03% |
  | Hidden | 0% | 0%, the capture stops | 0.04% → 0.04% |

  So about 2 points of the card and half a percent of one core, and 110 MB more memory (572 MB against 462 MB). Whole-card power was the same within a watt (57.8 W against 57.1 W playing). The capturing is done by the main process on the graphics card (the 0.97%), not by copying the screen through the CPU.
- **No border or indicator found.** Yellow pixels along the captured monitor's four edges were counted before and during the capture: none either time. That count reads the screen through GDI; the notification area could not be looked at from here, so it is worth one glance by eye.
- **What comes with it, whatever the tuning:**
  1. **The widget vanishes from every picture of the screen.** It has to be left out of captures or it would bend a picture of itself, and Windows offers no way to leave it out of one capture only. Screenshots, the Snipping Tool, OBS, Discord screen share and game recordings would all show the desktop without the widget.
  2. The player would be capturing the screen the whole time the widget is visible. Nothing is stored or sent, but it is a capture.
  3. What is behind arrives a frame or two late, so something moving behind the widget is seen through it slightly after it is seen beside it.
  4. Not tested, because the main monitor and the mouse were in use: capturing the monitor a full-screen game is running on (it may cost the game frames), and the mouse pointer, which Chromium draws into its screen captures, so a blurred second pointer would probably show inside the glass when the real one is near.
  5. Protected video comes out black in any capture, so the body would go black over it.
- **The alternative, tried the quick way** (`glass=0.88`: the body 88% opaque away from its edges, nothing captured): words behind are fainter but still sharp and still legible, and the lobes still wash out on a light window, because the liquid's light is added on top of whatever shows through. 88% is not enough; see item 2.

## The gaps, worst first

Line numbers are `prototypes/mercury/shaders.js` at commit `62869cb` unless another file is named.

### 1. Everything is outlined; nothing has form (depth and thickness)

A white line of even width runs round the silhouette, round the cover tile, round each button five or six times, and three or four times in parallel under the lower edge (top-face rim, underside edge, glow). The references have no outlines at all. Their edges are wide rolled lips where a highlight swells, thins and disappears, and the thickness is a shaded wall you can see into. Ours reads as a vector sticker; theirs as a photographed object. This is the largest gap and most of the other items are downstream of it.

Fix: remove the explicit rim line (the `lit` floor of .28 and the `pow(1 - ndv, 16)` term, 443–449), the bright line on the underside's lower edge (577) and the tile strokes (589, 608). Give the edge a real profile about 40 units wide whose normal sweeps from up to sideways, so a broad light makes a highlight with width that varies along the contour. Give the underside its own curved normal and shade it from the room instead of a flat colour plus a line. Make the wall's height vary round the contour (deep at the front, none at the back) so it reads as a view from slightly above, as in the references, instead of a copy of the outline shifted down 14 units.

### 2. Whatever is behind it shows through the body (glass transparency)

The body is see-through and tinted but does not bend or blur anything. In the real window, text and pictures behind the widget read straight through it and collide with the title, the timeline and the times; on a light desktop the body washes to pink-white and loses its form. The three dark pools only dim what is behind them. The references are dark smoked glass that mostly reflects.

**Decided by the round-10 experiment: a nearly opaque body, with refraction kept as an option that is off by default.** Refraction works and is cheap (above), but it takes the widget out of every screenshot, recording and screen share, and it needs the screen captured the whole time. The look that has to be right everywhere is therefore the one that needs no capture.

Fix: make the body dark glass that holds back 93–96% of what is behind it across the whole interior (88% was tried and still lets sharp words through), falling to clear only in the outer few units of the rolled edge, where the edge is thin and bright anyway. The body's own colour then has to carry it on a light desktop: dark smoked glass with the album's deep tone, not the present near-black, which only works because the desktop shows through. Refraction then becomes one switch on top of the same body: opacity goes to 100% and the bent, dimmed picture of what is behind is added as light (it is already written that way, `behind()` in `shaders.js`), so the two modes look alike by construction and only one look has to be polished. Leave the switch for the owner to try on their own desktop before deciding whether it ships.

### 3. The glow is a plate, or a fog, behind the widget

On the main monitor the glow is a band that stops dead: solid white with a hard edge on a near-white backdrop (it erases what is behind it), a brown band on dark whose brightness halves across one pixel (42,22,25 to 19,11,11), jagged at 200% because nothing anti-aliases it. On the second monitor there is no edge, and the same light spreads as a fog that whitens the words round the widget on a light window.

Cause, measured: the glow is drawn by adding light where the canvas's alpha is low (`COMPOSITE`, 917–935). Whether that light survives where alpha is exactly 0 depends on the monitor (table above). Outside the body the only alpha comes from the shadow (34 units, line 366), so on the main monitor the glow exists exactly as far as the shadow reaches. Switching bloom off does not move the border, so it is not the bloom. Wherever the light is kept it is added at full strength, which is what clips a light desktop to white.

Fix: give the glow its own alpha, equal to its brightness (a screen blend rather than an add). Every pixel is then an ordinary premultiplied colour that every path treats the same way: no cut-off, and a light desktop can no longer be pushed past white. Then stop spreading the glow evenly all round: pool it under the lower edge like the floor light in the references. On light desktops let a real soft, offset drop shadow carry the form; today the shadow peaks at 26% and is buried under the glow.

### 4. Highlights are blown out and colourless (chrome material)

The control pod has two large, flat, near-white patches above and below the buttons, and on a light desktop most of the right lobe is solid white. In the references almost nothing clips: highlights are thin to medium, graded, cool white from above and coral from below, on a dark body. Our chrome is neutral grey and white; the album's colour shows only in the glow, the underside and the pigment.

Fix: set exposure so only the bead and the hottest core of a rim may reach white. The level floor of the pod should be dark glass, so treat it as a pool like the one under the words (flatten and darken its reflection). Make the two soft lights larger, dimmer and graded, and add a palette-coloured light from below and behind so the lower lips pick up the album's colour. Not a repeat of the handoff's dead end (low reflectance everywhere in a dim room gave a black body with wire outlines): the room stays bright, the reflectance drops only where the surface is level.

### 5. Pigment is murky smoke, not threads

It fills the left half with soft red-brown fog, visibly low resolution at 100% (the 688×320 field stretched up), sits behind the title, and on a light desktop turns the body pink. The references keep the body clean and show a few long, silky, luminous threads along the lower body.

Fix: keep pigment out of the pool under the words; confine it to the stream under the timeline and a short plume from the tile; draw it as filaments (sharpen with the dye's own gradient, or raise the field toward 1376×640 and measure the cost); lower the amount and shorten the fade. Re-judge with real covers before tuning colour.

### 6. Text is soft and glowing (legibility)

The title has a halo and blurred edges at 100% and is plainly fuzzy at 200%; the references' type is crisp. The "VOLUME" label is about 8 px tall on screen, sits in the brightest highlight and cannot be read on a light desktop. At the small size (60%) the artist line and the times are about 6–7 px and marginal, and "VOLUME" is about 5 px. Placement of title, artist and times is right. Weight is heavier than the references (600 against roughly 500).

Fix: draw the label sheet at twice the scene's resolution and sample it once, sharpened; cut the glow round the words (`glow * .34`, 513–514) to almost nothing; keep the words' brightness at or under 1.0 so bloom ignores them (it is 1.4 now); make the dark backing under the words (`under`, 438) a tight, even darkening instead of an offset blurred copy. Title weight 500–550 (`ink.js` 136). A floor of about 9 px letter height on screen for any text: at the small size that means dropping the "VOLUME" label and enlarging the times.

### 7. Silhouette: proportions right, character wrong

Against `widget-mercury.png`, measured by eye on the images, the proportions are close (waist about 45% of the left lobe's height in both; right lobe about 80% of the left in both). The differences are in the outline's character. The left lobe is a rounded rectangle with a straight left side where the references have a full round bulb. The right end is a small pointed beak with a notch above it, where the references have a soft crest with the lip curling over. The top of the waist is nearly straight. And the fold at the waist is a pair of crossed white streaks that looks like a rendering fault, where the references show the ribbon actually twisting over itself.

Fix in `shape.js`: build the left lobe from a circle and an ellipse instead of a rounded box, replace the tail capsule with a rounded crest, curve the pinch. Replace the fin with a real second layer for the upper lip from the waist to the right end (the plan's two-layer approach), with an S-shaped leading edge that casts a soft shadow on the pod.

### 8. Buttons and the control pod

Each button is a stack of five or six concentric rings with a pink ring at the bottom, like a camera lens. The references' buttons are single smooth dark dimples with one soft rim light and a faint coral glow underneath. Glyph shapes are right but they glow. The open-app and hide dishes do appear on hover, but they are about 21 px across at 100% (13 px at the small size) with 8 px glyphs, jammed between the next button and the edge.

Fix: one concave bowl with one rounded shoulder per button; a floor on reflection softness inside the dishes so thin lights cannot draw rings; darker glass in the dish; one graded rim highlight. Utility dishes: radius 8.5 → about 12 units, moved clear of the next button, or moved to the right-click menu if they cannot be made comfortable at the small size.

### 9. Cover tile

A flat rounded square with an even 2 px white stroke and a second stroke below standing in for thickness. No perspective, a weak shadow on the body, and the picture is overexposed (gain 1.55, line 603) so the middle goes white. In Flow the tile is a thick slab seen at an angle: two edges catch light, the edges refract the picture, the picture is at normal exposure and the slab throws a clear shadow.

Fix: real covers; gain down to about 1.0–1.1; highlight only the edges that face the key light; draw the side as dark glass with the picture's edge refracted in it; a slight keystone so it reads as leaning; a larger, softer shadow plus a tight contact shadow.

### 10. Timeline

A thick white line with white bloom along its whole length. Played and unplayed differ too little, there is no coral in the played part, and the bead flares to about 40 px. It is also lost among the parallel rim lines beneath it. In the references the played part glows warm coral-white, the unplayed part is a thin dim grey, and the bead is small with a tight halo.

Fix: unplayed about 1.2 units thick at about 35% brightness; played tinted toward the palette with a tighter glow; smaller bead halo (517–532). Item 1 removes the clutter under it.

### 11. Volume

The track is short (86 units, about 108 px; 65 px at the small size) and sits in the brightest part of the lip, so on a light desktop it is white on white. The label is unreadable (item 6).

Fix: give it a proper dark pool like the timeline's, lengthen it to about 110 units, dim the unplayed part.

### 12. Cursor dimple (for step 4, noted because it is in all three reference stills)

The dimple is a ringed disc about 60 px across that looks like another button and kinks the timeline. The references show a small, shallow set of ripples.

### 13. Edge quality and anti-aliasing: mostly good

At 100% and at 200% (pixels doubled), on dark and on light, the body's silhouette, the tile and the buttons have clean edges: no stair-stepping and no dark fringe. The supersampled resolve works on the real GPU and still works at 1.79× under the cap. Drawn at 200% size the widget is rendered at 1920 px and stretched 12%, which is slightly soft but clean; real sizes are 100% and below. The edge problems are elsewhere: the cut-off border of the glow (item 3), the blocky pigment (item 5) and the soft text (item 6).

## Different here from the handoff screenshots

- The glow's hard border is far more visible on the real display than in the downscaled round-7 capture. On a near-white window it is a solid plate; the handoff did not show that backdrop.
- The handoff assumed the glow adds onto the desktop wherever alpha is low. Measured here, that depends on the monitor (item 3).
- The fin at the waist is crisp enough here to read as a fault.
- The hardware is not what the plan assumed: RTX 3070, 125% scaling (the plan's tests name 100% and 150%), a 360 Hz main display and a second monitor. With nothing limiting it the loop drew about 340 times a second with uneven gaps (p95 5.4 ms, max 8.4 ms), which is the lag the owner saw. Capped: 120 draws a second, gaps 8.3 ms median, 8.4 ms p95, 8.7 ms max over 4 s.
- Otherwise colour, layout and overall look match the software captures closely. The cloud renders were representative; nothing got better or worse by moving to the GPU.
- Destroying an Electron window and loading the same page in a new one straight away failed once with `ERR_FAILED`; reusing one window works.

## Order of work for step 3

1 and 3 first, together: they are the same decision about how edges and light are drawn, and they change how every later item looks. Then 2 and 4 (opacity and material; the refraction experiment has said 2 goes nearly opaque). Then real covers, and 5, 6, 9 with them. Then 7 and 8 (shape work, which moves hit areas, so the hit-test check gets re-run). 10 and 11 last; they are small once the rest is right.
