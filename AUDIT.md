# Mercury visual audit

Round 8, 13 November 2026. The first look at the prototype on the real PC. Nothing about the look was changed before these captures; the only code change is the 120 fps and 1920×1080 cap the owner asked for mid-audit.

**Verdict: it does not beat any of the three references yet, and it is not close.** The proportions, layout and edge anti-aliasing are sound. What is wrong is the material: it reads as a flat shape traced in neon with a glow plate behind it, where the references read as a solid object made of dark glass and chrome.

## How it was captured

- Real GPU, real compositor: Electron 45.3.2, ANGLE on Direct3D 11, in a normal window, photographed with `capturePage`.
- The machine reports an **RTX 3070** (the plan says 3060), a **2560×1440 display at 125% scaling, 360 Hz**.
- Widget at 100% size is 1075×500 screen pixels; the liquid is drawn at 1920×893 and resolved down (1.79× supersampling under the new cap, was 2×).
- `?capture=1`, clock stepped 720 frames with the scripted test audio, test cover "Silver Current" (a generated fixture, not real artwork).
- Reproduce: `node prototypes/serve.js`, then `npx electron tools/capture/mercury-shots.js out=design/captures/raw/round8`, then `npx electron tools/capture/sheet.js tools/capture/sheets/round8-overview.json` (and `round8-zoom.json`).

Images: `design/captures/mercury-audit-round8.png` (side by side with all three references, dark, light and near-white) and `design/captures/mercury-audit-round8-zoom.png` (details at 200%, hover, small size).

## The gaps, worst first

Line numbers are `prototypes/mercury/shaders.js` at commit `62869cb` unless another file is named.

### 1. Everything is outlined; nothing has form (depth and thickness)

A white line of even width runs round the silhouette, round the cover tile, round each button five or six times, and three or four times in parallel under the lower edge (top-face rim, underside edge, glow). The references have no outlines at all. Their edges are wide rolled lips where a highlight swells, thins and disappears, and the thickness is a shaded wall you can see into. Ours reads as a vector sticker; theirs as a photographed object. This is the largest gap and most of the other items are downstream of it.

Fix: remove the explicit rim line (the `lit` floor of .28 and the `pow(1 - ndv, 16)` term, 443–449), the bright line on the underside's lower edge (577) and the tile strokes (589, 608). Give the edge a real profile about 40 units wide whose normal sweeps from up to sideways, so a broad light makes a highlight with width that varies along the contour. Give the underside its own curved normal and shade it from the room instead of a flat colour plus a line. Make the wall's height vary round the contour (deep at the front, none at the back) so it reads as a view from slightly above, as in the references, instead of a copy of the outline shifted down 14 units.

### 2. The glow is a plate behind the widget (the opposite of "no rectangle behind it")

On the near-white backdrop the glow is a solid white slab with a hard edge that erases whatever is behind it. On the wallpaper it is a pale band with a visible border. On dark it is a brown band that stops dead: brightness halves across one pixel (42,22,25 to 19,11,11 in the capture), and the border is jagged at 200% because nothing anti-aliases it. This will be the first thing noticed in the real transparent window.

Cause, measured: the glow is drawn by adding light where the canvas's alpha is low (`COMPOSITE`, 917–935). A probe page shows the compositor keeps that light wherever alpha is at least 1/255 and discards it where alpha is exactly 0 (alpha 0: nothing added; alpha 1/255: the full amount added). Outside the body the only alpha comes from the shadow, so the glow exists exactly as far as the shadow reaches (34 units, line 366) and is cut there. Switching bloom off does not move the border, so it is not the bloom. Inside the border the light is added at full strength, which is what clips a light desktop to white.

Fix: give the glow its own alpha, equal to its brightness (a screen blend rather than an add). That removes the cut-off, because alpha is never zero where there is light, and it stops the glow pushing a light desktop past white. Then stop spreading it evenly all round: pool it under the lower edge like the floor light in the references. On light desktops let a real soft, offset drop shadow carry the form; today the shadow peaks at 26% and is buried under the glow. The same probe has to be repeated in the real transparent window in step 2, because Windows' own compositor may treat these pixels differently again.

### 3. Highlights are blown out and colourless (chrome material)

The control pod has two large, flat, near-white patches above and below the buttons, and on a light desktop most of the right lobe is solid white. In the references almost nothing clips: highlights are thin to medium, graded, cool white from above and coral from below, on a dark body. Our chrome is neutral grey and white; the album's colour shows only in the glow, the underside and the pigment.

Fix: set exposure so only the bead and the hottest core of a rim may reach white. The level floor of the pod should be dark glass, so treat it as a pool like the one under the words (flatten and darken its reflection). Make the two soft lights larger, dimmer and graded, and add a palette-coloured light from below and behind so the lower lips pick up the album's colour. Not a repeat of the handoff's dead end (low reflectance everywhere in a dim room gave a black body with wire outlines): the room stays bright, the reflectance drops only where the surface is level.

### 4. On a light desktop the body loses itself (glass transparency)

The body is see-through and tinted but does not bend anything, so a light desktop simply shows through as a wash: pink-white over the wallpaper, white plastic with black holes over a white window. The dark interior that keeps text readable exists only in the three pools. The references are dark smoked glass that mostly reflects.

Fix: depends on the refraction experiment in step 2. If screen-capture refraction works, bend and darken what is behind (about 70–85% opaque). If it does not, go back to the plan's original position: body nearly opaque (85–90%), clear only at the thin edges, so it reads the same on any wallpaper.

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

At 100% and at 200% (pixels doubled), on dark and on light, the body's silhouette, the tile and the buttons have clean edges: no stair-stepping and no dark fringe. The supersampled resolve works on the real GPU and still works at 1.79× under the new cap. Drawn at 200% size the widget is rendered at 1920 px and stretched 12%, which is slightly soft but clean; real sizes are 100% and below. The edge problems are elsewhere: the cut-off border of the glow (item 2), the blocky pigment (item 5) and the soft text (item 6).

## Different here from the handoff screenshots

- The glow's hard border is far more visible on the real display than in the downscaled round-7 capture. On a near-white window it is a solid plate; the handoff did not show that backdrop.
- The handoff assumed the glow adds onto the desktop wherever alpha is low. Measured here, that only holds where alpha is at least 1/255; where it is exactly 0 the light is thrown away (item 2). This is the first half of the handoff's open "Transparency" test; the real-window half is step 2.
- The fin at the waist is crisp enough here to read as a fault.
- The hardware is not what the plan assumed: RTX 3070, 125% scaling (the plan's tests name 100% and 150%), and a 360 Hz display. With nothing limiting it the loop drew about 340 times a second with uneven gaps (p95 5.4 ms, max 8.4 ms), which is the lag the owner saw. Capped: 120 draws a second, gaps 8.3 ms median, 8.4 ms p95, 8.7 ms max over 4 s.
- Otherwise colour, layout and overall look match the software captures closely. The cloud renders were representative; nothing got better or worse by moving to the GPU.
- For step 2: destroying an Electron window and loading the same page in a new one straight away failed once with `ERR_FAILED`; reusing one window works.

## Order of work for step 3

1 and 2 first, together: they are the same decision about how edges and light are drawn, and they change how every later item looks. Then 3 and 4 (material and opacity, after the refraction experiment). Then real covers, and 5, 6, 9 with them. Then 7 and 8 (shape work, which moves hit areas, so the hit-test check gets re-run). 10 and 11 last; they are small once the rest is right.
