# Mercury visual audit

Round 8 (13 November 2026): the first look at the prototype on the real PC. Round 9 (same day): the same build in a real transparent window. Round 10 (same day): the screen-capture refraction experiment, which settles item 2. Round 11 (same day): the first round of work on the look itself, items 1 and 3, judged with real covers as well as the generated one. Round 12 (same day): items 2 and 4. Round 13 (same day): item 5 and parts of 6 and 9. Round 14 (same day): the buttons, item 8. Round 15 (same day): the outline's character, item 7. Round 16 (same day): a first round on light, the rest of items 1 and 4. Round 17 (same day): the cover pressing into the glass and leaning back, item 9, which the owner asked for.

**Decided since round 17: live refraction is to be the widget's look, not an option that is off** (item 2 has the decision and what follows from it). Every picture so far shows the nearly opaque body without it, so the verdicts below are of that body; the still has to be judged again with refraction on.

**After round 17** the verdict of round 16 below stands, with one gap closed part of the way: the cover now lies in a hollow it presses into the liquid and leans back, where it floated flat above it. The references' cover is set deeper still, in a crisp wall of glass.

**Verdict after round 16: the references' outline and anatomy, now with light in the glass and not only on its edges; closer, and still not as good as any of them.** The rims of the two lobes are half as wide again, the bulb is crowned, a soft band of light lies inside the rim on the side toward the lamps, and the album's colour comes up off the floor onto whatever leans toward it, so the body reads as a thick drop of smoked glass with light in it where it was a dark shape with lit edges. Beside the references (`mercury-still-round16.png`, fourth row for the bulb) the gap that is left is contrast and crispness: their light is drawn in sharp, bright strokes over deep darks, with crisp reflections of lamps in the rims; ours is soft everywhere, a glow where they have a glint. After that, in order: the band through the waist (narrower than theirs, its highlight in two strokes), the line of even width along the lower edge, pigment that fades by the waist (item 5), the cover floating where theirs is set in with a bevel (item 9), and the timeline (item 10). The round-15 verdict follows for the record.

**Verdict after round 15: it now has the references' outline and the references' anatomy, and it is still not as good as any of them. What separates them is no longer form but light.** The silhouette follows `widget-mercury.png` to within a few units all the way round: a full round bulb with the cover inside its rim, a waist that curves, a right lobe whose upper lip lies over an eye-shaped pod as a second layer, and a soft crest where the tail was. It holds over a dark desktop, a pale wallpaper and a white window, with every cover. Set beside the references part for part (`mercury-still-round15-detail.png`), the difference is plain: theirs are covered in light, ours is a dark body with lit edges. What the references still have that it does not, worst first: broad liquid sheens lying across the bulb, the lip and the band at the waist, and thick rolled rims with graded light on them, where ours shows thin lines along edges (items 1 and 4, now the largest gap by far); a band through the waist as wide and bright as theirs, where ours is narrower because it has to pass between a long title and the buttons (item 7, what is left); a line of the album's colour of even width along the whole lower edge, which reads as an outline (item 1); pigment in long threads the whole length of the lower body, where ours is a ribbon that fades by the waist (item 5); the cover set into the liquid with a bevel round it, where ours floats (item 9); and a quieter timeline (item 10). The round-14 verdict, for the record: "the same kind of object as the references... what is left is mostly form". The round-8 verdict: "it does not beat any of the three references yet, and it is not close"; it read as a flat shape traced in neon with a glow plate behind it.

## How it was captured

- Real GPU, real compositor: Electron 45.3.2, ANGLE on Direct3D 11.
- The machine reports an **RTX 3070** (the plan says 3060). Main monitor **2560×1440 at 125% scaling, 360 Hz**; second monitor 1920×1080 at 100%.
- Round 8: an ordinary window photographed with `capturePage`. Widget at 100% size is 1075×500 screen pixels; the liquid is drawn at 1920×893 and resolved down (1.79× supersampling under the cap, was 2×). `node prototypes/serve.js`, then `npx electron tools/capture/mercury-shots.js out=design/captures/raw/round8`.
- Round 9: the real widget window (transparent, frameless, always on top, never focused) over test windows on the second monitor, photographed from the screen itself. `npx electron tools/widget-proto/main.js shots=design/captures/raw/round9`.
- Both: `?capture=1`, clock stepped 720 frames with the scripted test audio, test cover "Silver Current" (a generated fixture, not real artwork).
- Sheets are built with `npx electron tools/capture/sheet.js tools/capture/sheets/<name>.json`.

- Round 11 on: `npx electron tools/capture/mercury-shots.js out=design/captures/raw/round11 real=1` (it starts its own server now). `real=1` adds shots with real covers, listed in `data/real-covers.json`, which is not in git. **The repository is public, so no picture that shows a real cover or a real title is committed**: those shots and their sheet stay in `design/captures/raw/` and are sent to the owner directly. The committed sheet of each round uses the generated cover.

Images: `design/captures/mercury-audit-round8.png` (side by side with all three references), `mercury-audit-round8-zoom.png` (details at 200%, hover, small size), `mercury-window-round9.png` (the real window over dark, light and colourful windows), `mercury-refraction-round10.png` (today's body, the refracting body and the nearly opaque body over the same window, then refraction over stripes, colour and dark), `mercury-still-round11.png` (round 11 beside the three references, with round 8 beneath for comparison), `mercury-still-round12.png` (round 12 beside the references, round 11 beneath), `mercury-still-round13.png` (round 13 beside the references, round 12 beneath), `mercury-still-round14.png` (round 14 beside the references, with round 8, where the day started, beneath), `mercury-still-round15.png` (round 15 beside the references, round 14 beneath), `mercury-still-round15-detail.png` (the right lobe and the bulb beside the same parts of the main reference, the pointer on it, and the small size), `mercury-outline-round15.png` (the geometry drawn as lines over the main reference), `mercury-still-round16.png` (round 16 beside the references, the bulb beside the reference's bulb, round 15 beneath), `mercury-still-round17.png` (the bulb with the cover pressed in, beside the reference's, then the whole on three backdrops, round 16 beneath).

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

## What round 11 changed (items 1 and 3)

- **No outlines.** The drawn rim, the bright line along the underside and the strokes round the cover tile are gone. Edges are lit only by what they mirror.
- **A rolled lip.** The edge is now a rounded tube 17 units to its crest with a gentle inner face (`edgeR`, `edgeH`, `edgeDip`, `edgeIn` in `shape.js`; `base()` in `shaders.js`), where it was a single 44-unit rise into a dome. The timeline was moved up to 8 units at the waist so the lower lip has room under it.
- **A room that is not the same all the way round** (`env()`). It used to be evenly bright above and evenly coloured below, with two thin strips, which drew lines of even width. Now: a slow wash of light from the upper left and nothing with an edge in it toward the viewer, so gently sloping liquid shows a smooth sheen that waves cannot tear into blotches (that was tried first with a lamp there, and it tore); and lamps well off to the sides that only steep liquid mirrors: an overhead bank that is brighter at its left end, a key panel at the upper left, a narrow panel behind on the right and a weaker one behind on the left; and the album's colour on the floor with a hot core behind and below.
- **The underside is a surface** with a normal of its own that turns from facing outward to facing down and toward the viewer, and it mirrors that floor. The first try had the floor's light in front, which lit the lip and the underside as two flat bands like rubber; with the hot core behind, the two light up together across the silhouette as one rounded edge. It is 11 units deep instead of 14.
- **The glow is a pool on the floor,** under the two lobes and clear of the lower edge, and nothing hugs the outline. In the resolve it has alpha of its own (`COMPOSITE`): as much as its weakest channel, so the white in it is an ordinary screen blend that cannot pass white and only its colour is added, and never none where there is any light, so both monitors treat it alike. Alpha equal to the brightest channel was tried first: on a white window that paints the glow as a pink smear.
- **A real shadow** falls straight down from the drop (30% under it, fading over about 40 units), with a tighter one against the lower edge. On a light desktop it is what lifts the drop off the page.
- **The cover tile** has a bevel that mirrors the room (lamps on its upper and left edges, floor colour on its lower edge) in place of strokes, and its picture is no longer overexposed (gain 1.15, was 1.55).
- Seen with six real covers (pink, dark red, blue, white, many-coloured, near black) on dark, gradient and near-white backdrops. The near-black cover, which leaves almost no pigment in the body, is the closest to the references. The white cover floods the left lobe with white pigment and on a white window that half of the widget, and the first letter of the title, disappear: item 5 has to deal with white and very light covers. A long title is cut short with an ellipsis after about eleven letters, because the title has 190 units; item 6.
- The first launch after the shaders change now spends about two and a half seconds compiling them before anything is drawn (it was about two). Later launches read them from Chromium's cache.

## What round 12 changed (items 2 and 4)

- **The body is nearly opaque dark glass**: it holds back 94 to 97% of what is behind it, 86% at the very edge (`glass`, end of the top-face block), and has a colour of its own, the album's deep tone, smoked (`inner`). It was 44% and up, and near black, which only worked because the desktop showed through. On a white window it is now a dark object with a shadow instead of a pale ghost. The underside follows (90 to 97%). Refraction still works as a switch on top (`refract=live`): it takes the opacity to 100% and adds the bent picture as light.
- **The glare round the buttons is gone.** The light let through the fold (the spectrum) is a thin line of the album's colour instead of a white tube: about a third as strong, narrower, less white in it.
- **Almost nothing clips.** Words are drawn at white, not 40% over it, with a third of the glow, so bloom leaves them alone and they are crisper. The played part of the timeline and the volume line come down (1.6 to 1.3 and 2.1 to 1.35). Bloom is 0.42, was 0.5.
- **Broader light on the lip.** The overhead light is now a glow that fills the upper half of the room, brightest at the upper left and dying away to the right, with a short crisp bank inside it over the left half only. The upper lips take a broad graded light from it instead of one thin line of even brightness, and the right end is lit by its own small panel alone.
- **The floor light is two soft pools** under the lobes, where it was a bar.
- GPU load is unchanged by rounds 11 and 12: 0.87% idle and 7.5% playing with the card otherwise idle (0.93% and 7.9% before), 57 W.
- With real covers: every cover now gives a readable widget on every backdrop. The white cover still floods the left lobe with white smoke that hides the elapsed time and half the artist's name. The near-black cover is still the cleanest.

## What round 13 changed (item 5, and parts of 6 and 9)

- **Pigment is a ribbon of colour inside the lower lip, not smoke in the body.** It is let go in three fine threads at the lower left, into a current that runs inside the lip between the timeline and the edge and follows the outline round (`SIM_FORCE`, `SIM_DYE`). The tile weeps only from its lower edge. Drops on a kick leave the tile's lower right, downward, and are smaller. Nothing is let go toward the words, and pigment gives way wherever something has to be read.
- **What it took to get threads at all,** found by reading the liquid's velocity and pigment back from the simulation (`mercury.probe(x, y)`, for tests): the old stream ran against the slow current that follows the walls, which tore it apart at the waist, so the wall current now runs the same way; a jet left to itself rolls up into curls, so the stream is held firmly to its course; the slow circulation was strong enough to boil (interior speeds over 150 units a second), so it is less than half as strong and the curl put back each step is a fifth of what it was; the pigment field is 1032×480, was 688×320, so a thread three units wide keeps its edge; and the pigment was looked up 14 units off along the surface slope, which on the steep new lip hid the threads completely, so that is 4.5 now. Thin pigment is shown down to 4% (was 14%), or every thread ended a third of the way along.
- **A cover with no colour to give gives the album's colour.** Pigment from white or grey is made of the palette's primary colour (`PIGMENT`), so a white cover no longer fills the lobe with white fog. The picture's light spilling round the tile is 40% of what it was and closer in, for the same reason.
- **Long titles fit.** The title has 205 units (was 190) and is set smaller, down to four fifths, before anything is cut; its weight is 560 (was 600).
- **The tile's shadow** on the body is a soft one further off and a tight one against it, instead of one of middling softness.
- GPU load with the larger pigment field: 0.83% idle and 7.9% playing with the card otherwise idle (0.87% and 7.5% in round 12), 57 W. `test=passthrough` passes.
- Left of item 5: the ribbon fades out by the waist; the references' threads run the whole length. The stream reaches the far end at 50 to 70 units a second, so it is the pigment that thins, not the current that stops. Left of item 6: the label sheet is still drawn at the scene's resolution, and nothing has been done about text at the small size. Left of item 9: the tile is still drawn square on, with no keystone.

## What round 14 changed (item 8)

- **Each button is one smooth bowl** pressed into the surface, with one rounded shoulder and no rim standing round it (`detail()`, the `uBtn` loop). A rim and a dish gave every lamp four faces to draw a ring on, which is where the camera-lens look came from. Inside a bowl nothing is mirrored sharply, so its lower wall takes one soft light from above. The bowl is darker glass, darkest under its upper shoulder, with a breath of the album's colour in its bottom that grows when it is pressed or on a beat, in place of the pink ring.
- Not done: the two utility dishes (open the app, hide the widget). At a comfortable size, about 12 units, they do not fit between the next button and the lip at the right end. The recommendation is to take them off the surface and put both actions in a right-click menu and the tray menu, with a double click on the body to open the app; that is the owner's call.
- `test=passthrough` passes; what can be clicked has not moved.

## What round 15 changed (item 7)

The numbers were taken from `widget-mercury.png`. `tools/capture/outline.js` draws everything in `shape.js` as lines over a dimmed reference in about three seconds, without a window or the GPU; the outline was fitted with it and photographed after each of the four steps.

- **The left lobe is a circle,** radius 128: a full round bulb. It was a rounded box whose corners the blend with the spine filled in, so it had a straight left side and a flat bottom. The cover tile sat in the bulb's upper left with its corner outside the outline, which made the end read as a square sitting on a box; it is now inside the rim all the way round, where the reference has it (8 units of rim at its nearest corner, about 27 above it and 45 to its left). It still floats, with its shadow on the liquid.
- **The body draws out of the bulb along one straight rising lower edge** (a tapered capsule), instead of arching up at the waist and down again.
- **The top of the waist is one arc,** radius 210, struck from above; both lobes run into it without a corner, so the top outline is a continuous S. It was an arc of radius 312, which pressed the waist nearly flat and cut the shoulder off both lobes.
- **The right lobe is two circles** (a round shoulder, and the end, a little smaller and lower) **with a cut beneath,** so the outline comes over the top, down the end and back along a rising lower edge to a soft point: a crest. The tail, its notch and the twist in the surface that went with it are gone.
- **The upper lip is a second layer.** Its leading edge is one arch (`archSdf`): a flat arc over the top of the pod, a leg coming down round the right end to the crest, and at the waist a leg that sweeps down and away to the left under the words, where it melts into the body; the whole edge is an S. The lip ends in a rolled edge, a quarter round 7 units high, upright where it meets what is under it, so along its length it mirrors first the floor (a thin line of the album's colour) and then the room above. Behind that edge the lip is full, not hollow, and through the waist it narrows to a rolled band with a ridge of its own. This replaces the stadium-shaped basin, the ridge and groove of the fold, and the strap and fin at the waist, which was the pair of crossed streaks that read as a fault.
- **The pod** the buttons sit in is eye-shaped: under the arch it drops away at once, in the lip's shadow (dark and tight against the edge, wider where the pod lies deep under it); its own lower rim is a rolled shoulder with a soft graded light and a dark line at its foot. The buttons moved up 8 units to where the reference has them, and the liquid's obstacles in the simulation moved with them (they were written out by hand; they are generated from the geometry now).
- **The timeline is one straight rise** from under the cover to under the buttons, like the lower edge it runs above. It used to follow the edge's every turn. **The volume line lies level** across the flat of the lip, and its label is gone: it was too small to read at any size, it sat in the lip's highlight (item 6), and two of the three references have none.
- The floor light is two separate pools again (the new outline had run them together into a bar), and the light the cover spills on the liquid round it is taken from a much softer copy of the picture and is weaker, because the tile now has liquid on all four sides and a white cover fogged the bulb.
- **What it cost.** The title has 196 units instead of 205, because the lip's waist leg passes its far end; to make up for it a long title is set smaller, down to about three quarters instead of four fifths, so as many letters fit as before. The artist line has 180 units (it had 197).
- The band through the waist is steeper and narrower than the references' (about 20 units against about 26) because it has to pass between the end of a long title and the previous button, which leaves it about 50 units. Its highlight is two short strokes where theirs is one long one.
- The two utility dishes sit on the lip where it comes down round the right end. They fit there no better than before (item 8); still the owner's call.
- `test=passthrough` passes, 8 of 8, with the same probe points: the bulb reaches 10 units further left and the right end stops 11 units short of where the tail did, but nothing moved out from under a probe. GPU load is unchanged within what the reading varies by: 0.92% idle and 8.0% playing with the card otherwise idle (0.83% and 7.9% in round 13), 57 W.

## What round 16 changed (the rest of items 1 and 4, first part)

- **The rims of the two lobes are half as wide again:** 25 units to the crest instead of 17 (`edgeRLobe`, `edgeHLobe`, `edgeInLobe` in `shape.js`). A wide roll turns slowly, so the lamps it mirrors lie across it as a band about 10 units wide instead of a line of 7. Through the waist the rim keeps its 17 units: the body is thin there, and the title and the timeline lie close to the outline.
- **The bulb is crowned** (`bulbCrown`, 15 units): full in the middle and falling away to its rim all round, in place of a swell too slight to mirror anything but the wash.
- **Light carried through the glass** (`THROUGH` in `shaders.js`): a broad soft band just inside the roll, on the side of the outline that faces the lamps, strongest at the upper left of each lobe and gone where the outline faces away. Thick glass shows the light that entered through its edge this way, and it is what the references' rims have that a mirror alone cannot give: bright outer face, dark crest, soft light inside. It gives way wherever something has to be read, and in the pod.
- **The album's colour comes up off the floor in front** as a second soft, edgeless light in `env()`, beside the wash from the upper left (which is half as strong again and a little broader). Liquid that leans toward the viewer's feet carries it as a glow: the lower half of the bulb, the lower side of the lip's crown, the outer face of the lower lip. The lower edge now shows a graded band of colour above the line that was all it had.
- Not done this round: the band through the waist still has its highlight in two strokes; the underside still shows as a line of even width along the whole lower edge; nothing was done to make the light crisper, which is now what most separates the two.
- With real covers: every cover reads on every backdrop. The body is lighter than it was (it holds back as much as before, but more of it is lit), which on a white window with a white cover makes it a paler object; the words stay white on dark because the pools under them are unchanged.
- `test=passthrough` passes, 8 of 8. GPU load with the card otherwise idle: 0.88% idle and 8.5% playing, 57 W (0.92% and 8.0% in round 15).

## What round 17 changed (item 9, at the owner's request)

The owner asked for the cover to leave a print in the glass where it sits, squashing it down as in the main reference, and to be slightly tilted so that it reads as 3D.

- **The cover presses into the liquid.** The surface sinks toward the tile all the way round it, beginning 28 units out and 10 deep where it meets the tile (`press` in `shape.js`, the hollow itself in `base()`), so the bulb's rim runs down into a hollow and the tile lies in it. The side of the hollow away from the lamps, to the right of the cover and below it, takes their light as a soft band; the side toward them is in shade. A raised frame of displaced liquid round the tile was tried first and read as a picture frame set inside the bulb; the hollow now runs out into the bulb's rim instead, with only a trace of a swell.
- **Its shadow is where it touches:** close in all round, a little longer on the side away from the lamps. It was the shadow of a slab floating above the liquid, thrown down and to the right.
- **It leans back.** Its far (upper) edge is drawn 9% narrower than its middle and its near edge 9% wider, and the whole is 3.5% shorter, as a slab seen from in front and above (`lean` and `squash`; `tilePlane()` in `shape.js` and in the shader, so what can be clicked leans with it). Its thickness still shows along its lower edge.
- Not done: in the reference the cover is set deeper, and the glass round it is a crisp bevelled wall that mirrors the picture and the lamps; ours is a soft hollow. Whether this is the print the owner meant is for them to say.
- `test=passthrough` passes, 8 of 8. GPU load with the card otherwise idle: 0.73% idle and 7.5% playing, 57 W (0.88% and 8.5% in round 16).

## The gaps, worst first

Line numbers are `prototypes/mercury/shaders.js` at commit `62869cb` unless another file is named. Items 1 and 3 were worked on in round 11; their line numbers are of historical interest only.

### 1. Everything is outlined; nothing has form (depth and thickness): mostly fixed in round 11

Left to do after round 16 (which widened the rims of the lobes to 25 units and put light inside them): the light on the rims is soft where the references' is crisp, a glow where they have the sharp reflection of a lamp; along the whole lower silhouette the underside shows as one line of the album's colour of even width, with a hairline of dark between it and the lit lip, which reads as an outline; and the wall's depth is the same everywhere it shows. The original finding follows.

A white line of even width runs round the silhouette, round the cover tile, round each button five or six times, and three or four times in parallel under the lower edge (top-face rim, underside edge, glow). The references have no outlines at all. Their edges are wide rolled lips where a highlight swells, thins and disappears, and the thickness is a shaded wall you can see into. Ours reads as a vector sticker; theirs as a photographed object. This is the largest gap and most of the other items are downstream of it.

Fix: remove the explicit rim line (the `lit` floor of .28 and the `pow(1 - ndv, 16)` term, 443–449), the bright line on the underside's lower edge (577) and the tile strokes (589, 608). Give the edge a real profile about 40 units wide whose normal sweeps from up to sideways, so a broad light makes a highlight with width that varies along the contour. Give the underside its own curved normal and shade it from the room instead of a flat colour plus a line. Make the wall's height vary round the contour (deep at the front, none at the back) so it reads as a view from slightly above, as in the references, instead of a copy of the outline shifted down 14 units.

### 2. Whatever is behind it shows through the body (glass transparency): fixed in round 12; refraction is now to be the look

**The owner's decision, 13 November 2026, as relayed by the session that manages this work:** asked "Should live refraction stay as an optional switch, off by default?", they answered **"Make it the look"**. They chose it after being told what comes with it: the widget disappears from every screenshot, recording and screen share, and the player captures the screen the whole time the widget is visible. This reverses the recommendation further down, which is kept for the record.

What follows from it, none of it done yet:

- The nearly opaque dark-glass body of round 12 stays as the base. It is what shows before the first captured frame arrives, if the capture fails, in the plain browser page, and whenever refraction is switched off.
- A switch stays, the other way round: refraction is on unless it is turned off. With it on the owner cannot take a picture of the widget, so they need a way to turn it off.
- `tools/widget-proto/main.js` refracts only when run with `refract=live`. It should refract by default, with `refract=off` to stop it.
- The still has to be judged with it on. `tools/capture/mercury-shots.js` photographs an ordinary window, where there is nothing to capture, so refraction never shows there; it shows only in the real window: `npx electron tools/widget-proto/main.js shots=<folder> refract=live modes=dark,light,busy,stripes` (the tool's own backdrops, with the guard on what it saves). Each round's sheet should include those from now on.
- It has to be tuned as the look. The "Refraction (experiment)" block in `SURFACE` and `behind()` in `shaders.js` (how much comes through, `clear`; the blur, `soft`; the bend, `lens`) were set when the body was still see-through and only looked over on the dark body in round 12; rounds 16 and 17 have since put more light into the body. The aim is dark bending glass that stays calm under the words.
- Not yet tested, and it matters now: refraction on the monitor a full-screen game is running on, and what it costs the game; the mouse pointer, which Chromium draws into its screen captures, so a blurred double probably shows in the glass (see whether the capture can leave the pointer out); the capture border by eye; dragging the widget to the other monitor (the change of source in `placeBackdrop` in `demo.js` is written and untried); and the capture running at 30 frames a second while the widget idles at 15 draws. The first two need the owner's mouse or main screen: ask them, do not take either over.

The original finding and the decision follow.

The body is see-through and tinted but does not bend or blur anything. In the real window, text and pictures behind the widget read straight through it and collide with the title, the timeline and the times; on a light desktop the body washes to pink-white and loses its form. The three dark pools only dim what is behind them. The references are dark smoked glass that mostly reflects.

**Decided by the round-10 experiment: a nearly opaque body, with refraction kept as an option that is off by default.** Refraction works and is cheap (above), but it takes the widget out of every screenshot, recording and screen share, and it needs the screen captured the whole time. The look that has to be right everywhere is therefore the one that needs no capture.

Fix: make the body dark glass that holds back 93–96% of what is behind it across the whole interior (88% was tried and still lets sharp words through), falling to clear only in the outer few units of the rolled edge, where the edge is thin and bright anyway. The body's own colour then has to carry it on a light desktop: dark smoked glass with the album's deep tone, not the present near-black, which only works because the desktop shows through. Refraction then becomes one switch on top of the same body: opacity goes to 100% and the bent, dimmed picture of what is behind is added as light (it is already written that way, `behind()` in `shaders.js`), so the two modes look alike by construction and only one look has to be polished. Leave the switch for the owner to try on their own desktop before deciding whether it ships.

### 3. The glow is a plate, or a fog, behind the widget: fixed in round 11

Left to do: check the new glow by eye on both real monitors in the widget window (it has only been photographed in an ordinary window on the second monitor), and decide with the owner whether the floor pool should be this visible on a dark desktop. The original finding follows.

On the main monitor the glow is a band that stops dead: solid white with a hard edge on a near-white backdrop (it erases what is behind it), a brown band on dark whose brightness halves across one pixel (42,22,25 to 19,11,11), jagged at 200% because nothing anti-aliases it. On the second monitor there is no edge, and the same light spreads as a fog that whitens the words round the widget on a light window.

Cause, measured: the glow is drawn by adding light where the canvas's alpha is low (`COMPOSITE`, 917–935). Whether that light survives where alpha is exactly 0 depends on the monitor (table above). Outside the body the only alpha comes from the shadow (34 units, line 366), so on the main monitor the glow exists exactly as far as the shadow reaches. Switching bloom off does not move the border, so it is not the bloom. Wherever the light is kept it is added at full strength, which is what clips a light desktop to white.

Fix: give the glow its own alpha, equal to its brightness (a screen blend rather than an add). Every pixel is then an ordinary premultiplied colour that every path treats the same way: no cut-off, and a light desktop can no longer be pushed past white. Then stop spreading the glow evenly all round: pool it under the lower edge like the floor light in the references. On light desktops let a real soft, offset drop shadow carry the form; today the shadow peaks at 26% and is buried under the glow.

### 4. Highlights are blown out and colourless (chrome material): mostly fixed in rounds 11 and 12

Left to do after round 16 (which crowned the bulb and added two broad soft lights and the light carried through the rim): the sheens are there but soft and low in contrast; the references' are bright strokes over deep darks. The band at the waist and the rims of the buttons have not been touched. The original finding follows.

The control pod has two large, flat, near-white patches above and below the buttons, and on a light desktop most of the right lobe is solid white. In the references almost nothing clips: highlights are thin to medium, graded, cool white from above and coral from below, on a dark body. Our chrome is neutral grey and white; the album's colour shows only in the glow, the underside and the pigment.

Fix: set exposure so only the bead and the hottest core of a rim may reach white. The level floor of the pod should be dark glass, so treat it as a pool like the one under the words (flatten and darken its reflection). Make the two soft lights larger, dimmer and graded, and add a palette-coloured light from below and behind so the lower lips pick up the album's colour. Not a repeat of the handoff's dead end (low reflectance everywhere in a dim room gave a black body with wire outlines): the room stays bright, the reflectance drops only where the surface is level.

### 5. Pigment is murky smoke, not threads: mostly fixed in round 13

What is left is listed under "What round 13 changed". The original finding follows.

It fills the left half with soft red-brown fog, visibly low resolution at 100% (the 688×320 field stretched up), sits behind the title, and on a light desktop turns the body pink. The references keep the body clean and show a few long, silky, luminous threads along the lower body.

Fix: keep pigment out of the pool under the words; confine it to the stream under the timeline and a short plume from the tile; draw it as filaments (sharpen with the dye's own gradient, or raise the field toward 1376×640 and measure the cost); lower the amount and shorten the fade. Re-judge with real covers before tuning colour.

### 6. Text is soft and glowing (legibility)

The title has a halo and blurred edges at 100% and is plainly fuzzy at 200%; the references' type is crisp. The "VOLUME" label is about 8 px tall on screen, sits in the brightest highlight and cannot be read on a light desktop. At the small size (60%) the artist line and the times are about 6–7 px and marginal, and "VOLUME" is about 5 px. Placement of title, artist and times is right. Weight is heavier than the references (600 against roughly 500).

Fix: draw the label sheet at twice the scene's resolution and sample it once, sharpened; cut the glow round the words (`glow * .34`, 513–514) to almost nothing; keep the words' brightness at or under 1.0 so bloom ignores them (it is 1.4 now); make the dark backing under the words (`under`, 438) a tight, even darkening instead of an offset blurred copy. Title weight 500–550 (`ink.js` 136). A floor of about 9 px letter height on screen for any text: at the small size that means dropping the "VOLUME" label and enlarging the times.

### 7. Silhouette: proportions right, character wrong: fixed in round 15

Left to do: the band through the waist is narrower and steeper than the references' and its highlight is broken into two strokes; the lip's end at the crest is a plain rounded nose where the references show the lip curling over the strip with a small notch in the outline. The original finding follows.

Against `widget-mercury.png`, measured by eye on the images, the proportions are close (waist about 45% of the left lobe's height in both; right lobe about 80% of the left in both). The differences are in the outline's character. The left lobe is a rounded rectangle with a straight left side where the references have a full round bulb. The right end is a small pointed beak with a notch above it, where the references have a soft crest with the lip curling over. The top of the waist is nearly straight. And the fold at the waist is a pair of crossed white streaks that looks like a rendering fault, where the references show the ribbon actually twisting over itself.

Fix in `shape.js`: build the left lobe from a circle and an ellipse instead of a rounded box, replace the tail capsule with a rounded crest, curve the pinch. Replace the fin with a real second layer for the upper lip from the waist to the right end (the plan's two-layer approach), with an S-shaped leading edge that casts a soft shadow on the pod.

### 8. Buttons and the control pod: buttons fixed in round 14, utility dishes open

The original finding follows.

Each button is a stack of five or six concentric rings with a pink ring at the bottom, like a camera lens. The references' buttons are single smooth dark dimples with one soft rim light and a faint coral glow underneath. Glyph shapes are right but they glow. The open-app and hide dishes do appear on hover, but they are about 21 px across at 100% (13 px at the small size) with 8 px glyphs, jammed between the next button and the edge.

Fix: one concave bowl with one rounded shoulder per button; a floor on reflection softness inside the dishes so thin lights cannot draw rings; darker glass in the dish; one graded rim highlight. Utility dishes: radius 8.5 → about 12 units, moved clear of the next button, or moved to the right-click menu if they cannot be made comfortable at the small size.

### 9. Cover tile: partly fixed in round 17

Left to do: a crisp bevelled wall of glass round the cover, as deep as the reference's, in place of the soft hollow; the picture's edge refracted in the tile's side. The original finding follows.

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

~~1 and 3 first, together~~ (round 11). ~~Then 2 and 4~~ (round 12). ~~Then 5~~, with the urgent parts of 6 and 9 (round 13). ~~Then 8~~, the buttons (round 14). ~~Then 7~~, the outline's character (round 15). ~~Then the first part of what is left of 1 and 4~~: wider rims, a crowned bulb, light in the glass (round 16). Next the second part: crisper light (the sharp reflection of a lamp in the rims, deeper darks beside it), one long highlight on the band through the waist, and the line along the lower edge. Then 10 and 11 (timeline and volume), then the rest of 5, 6 and 9.
