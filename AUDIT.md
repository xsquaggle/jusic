# Mercury visual audit

Round 8 (13 November 2026): the first look at the prototype on the real PC. Round 9 (same day): the same build in a real transparent window. Round 10 (same day): the screen-capture refraction experiment, which settles item 2. Round 11 (same day): the first round of work on the look itself, items 1 and 3, judged with real covers as well as the generated one. Round 12 (same day): items 2 and 4. Round 13 (same day): item 5 and parts of 6 and 9. Round 14 (same day): the buttons, item 8. Round 15 (same day): the outline's character, item 7. Round 16 (same day): a first round on light, the rest of items 1 and 4. Round 17 (same day): the cover pressing into the glass and leaning back, item 9, which the owner asked for. Round 18 (same night): live refraction made the widget's look and tuned as smoked glass, item 2. Round 19 (same night): the cover's pocket, item 9, first round of the crisp wall. Round 20 (same night): the pocket's wall and the bulb's rim as one tube, a glint on its crest. Round 21 (same night): the grey taken out of the glass, items 1 and 4.

**Since round 18 live refraction is the widget's look** (item 2 has the owner's decision; "What round 18 changed" has what was done). Pictures up to round 17 show the nearly opaque body without it, so the verdicts below are of that body. `mercury-still-round18-refraction.png` is the first judged with it on: over dark, white, colourful and striped windows it is dark smoked glass that bends what is behind it and keeps its words readable. It does not change the verdict: beside the reference it still lacks crisp bright light over deep darks, and the cover's deep, crisp pocket.

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

Images: `design/captures/mercury-audit-round8.png` (side by side with all three references), `mercury-audit-round8-zoom.png` (details at 200%, hover, small size), `mercury-window-round9.png` (the real window over dark, light and colourful windows), `mercury-refraction-round10.png` (today's body, the refracting body and the nearly opaque body over the same window, then refraction over stripes, colour and dark), `mercury-still-round11.png` (round 11 beside the three references, with round 8 beneath for comparison), `mercury-still-round12.png` (round 12 beside the references, round 11 beneath), `mercury-still-round13.png` (round 13 beside the references, round 12 beneath), `mercury-still-round14.png` (round 14 beside the references, with round 8, where the day started, beneath), `mercury-still-round15.png` (round 15 beside the references, round 14 beneath), `mercury-still-round15-detail.png` (the right lobe and the bulb beside the same parts of the main reference, the pointer on it, and the small size), `mercury-outline-round15.png` (the geometry drawn as lines over the main reference), `mercury-still-round16.png` (round 16 beside the references, the bulb beside the reference's bulb, round 15 beneath), `mercury-still-round17.png` (the bulb with the cover pressed in, beside the reference's, then the whole on three backdrops, round 16 beneath), `mercury-still-round18-refraction.png` (the refracting widget in its real window over four backdrops, beside the main reference), `mercury-any-media-round18.png` (the widget showing a made-up other app's media), `mercury-still-round19.png` (the cover's pocket beside the reference's bulb, then the whole, refracting and opaque), `mercury-still-round20.png` (the pocket as one tube with the rim, beside the reference's and round 19's), `mercury-still-round21.png` (the grey taken out: refracting over three windows, the opaque base beside round 20's, and the bulb beside the reference's).

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

## What round 18 changed (item 2: refraction as the look)

- **Refraction is on by default in the widget window.** `tools/widget-proto/main.js` refracts unless run with `refract=off` (or `glass=`, the old alternative). Shots and both tests now run with the capture on.
- **A switch, in the tray menu** ("Refraction", ticked). Off: the page stops the capture, the opaque body eases back, and only then is the window let back into screen captures, so it never bends a picture of itself; the widget can then be photographed. On again: the other way round. Written and started without errors; not clicked, because that needs the mouse.
- **Tuned as smoked glass** (`smoked()` and the "Refraction" block in `SURFACE`). What is behind was added at up to half strength whatever it was, so a white window washed the body to pale grey and the white words lost their ground (second row of the sheet, right). Now the glass takes more out of a bright thing than a dim one (under a third of white, nearly all of a dim colour), the pools under the words, the timeline and the volume let less through and blur it more, and the thin rolled edge lets a little more through than the middle. Over white it is now a dark object whose words read; over stripes the bending is still plain to see; over dark nothing is lost.
- The plain browser page and `mercury-shots.js` are untouched by this: there is no capture there, so they show the opaque body, which is the base and the fallback.
- **Cost, measured this round** (`test=gpu dsf=1.25`, the card otherwise idle, 42 W at rest; only one monitor was connected, 1920×1080 at 144 Hz, where the loop draws on every second refresh, 72 a second, so these do not compare directly with the 120-a-second readings above):

  | State | Own GPU share, refracting | Own GPU share, `refract=off` | CPU of one core, refracting → off |
  |---|---|---|---|
  | Idle: paused, pointer away (15 draws a second) | 1.75% drawing + 0.5% capturing | 1.33% | 0.61% → 0.26% |
  | Playing (72 draws a second) | 7.45% + 0.96% | 7.49% | 1.58% → 1.04% |
  | Hidden | 0%, the capture stops | 0% | 0.04% → 0.04% |

  Whole card 49.6 W against 49.1 W playing. Memory 582 MB against 462 MB. No yellow border pixels appeared along the monitor's edges while capturing (the count was the same before and during). `test=passthrough` passes, 8 of 8, with the capture on.
- **Still open, and needing the owner:** the widget over a full-screen game on the main monitor (does the game lose frames); the tray switch by hand; dragging to the other monitor. (Answered by the owner the same evening: no blurred double of the pointer shows in the glass, only the widget's own white light and ring round the cursor.)
- Still short of the reference with refraction on: the floor glow lies as a pink smear over words on a white window; the bent picture is soft everywhere, where real glass shows a sharp, squeezed image in its rim.

## What round 19 changed (item 9: the cover's pocket)

The owner asked for the pocket to be as deep and as crisp as the main reference's, refined until it matches. This is the first round of that; `mercury-still-round19.png` sets the bulb beside the reference's.

- **The glass ends at the cover in a wall** (`pocket` in `shape.js`; the wall itself in `detail()`, where edges stay sharp): a quarter round 16 units deep over the last 12 units before the tile's edge, level at its crest and upright at the tile, with the glass standing 6 units proud round it as a bank that dies away over 14 units. The soft hollow of round 17 is nearly gone (`press`: 4 deep, was 10), because glass that slopes down to the cover reads as a dent, and glass that stands round it and drops reads as a pocket.
- **The wall is lit as a rim of thick glass:** what it mirrors keeps its edge (reflection softness is capped in the wall); light is gathered along its crest all the way round, most on the side toward the lamps, with the album's colour in it; the glass just beyond the bank lies in the bank's shade, which gives the bright wall a dark to stand against; and where the wall meets the tile there is a line of deep shade, in place of the wide soft shadow of a floating slab.
- **The picture's colours show in the wall,** turned over and drawn out from the picture's own edge, held down for a bright picture so that a white cover does not turn its whole wall white.
- **Little of the tile's own side shows** (its thickness is drawn 2.4 units down, was 6.5): it lies at the bottom of the pocket and the wall stands over it.
- Seen with the generated cover refracting over dark, white and colourful windows, and with real covers (white, pink, near black) on the opaque body: the pocket reads on all of them, and the white cover neither fogs the bulb nor loses its edge.
- **Still short of the reference's pocket:** theirs is wider and deeper still (the wall is a thick tube, and on the left and above it runs straight into the bulb's rim as one piece of glass; ours is a separate ring inside the rim); their wall has hot, sharp highlights and near-black depths where ours is an even soft white; the picture's colours are plain to see bent in their wall and faint in ours; and their cover sits square, where ours still leans (which the owner asked for).
- `test=passthrough` passes, 8 of 8 (what can be clicked has not moved). GPU, refracting, one monitor at 144 Hz: 1.86% idle and 7.9% playing (1.75% and 7.45% in round 18).

## What round 20 changed (item 9, second round of the pocket)

- **The wall and the bulb's rim are one tube of glass** to the left of the cover, above it and below it (`TUBE_H` and the block after the hollow in `base()`): between the outline and the cover the glass is full and crowned across its width, running from the rim over into the wall, where round 19 had a separate ring standing inside the rim with a dark gap between. To the right, where the body goes on toward the words, the bank still stands alone with its shade beyond it (a little deeper, .42).
- **A glint on the wall's crest,** as a cut edge of glass has: hot and white where the edge faces the lamps (upper left), the album's colour where it faces the floor's light (lower edge), nothing between, so it swells, thins and stops and does not run round as a line.
- **Deeper shade at the wall's foot** (`tshadow`: .84 over 5.8 units, was .72 over 3.2), so the cover reads as lying lower.
- Seen refracting over dark, white and colourful windows, and with real covers (white on a white window, many-coloured on a light wallpaper, pink and near black on dark): it holds on all of them.
- **Still short of the reference's pocket:** their tube is brighter and far more contrasty (broad silver sheens with near-black beside them; ours is an even grey with one white line); the picture's colours are plain in their wall; and their bank to the right of the cover is one sharp crescent of light with deep shade inside it, where ours is a soft ring. All three are the same gap as items 1 and 4, crisp light over deep darks, which is the next work.
- `test=passthrough` passes, 8 of 8.

## What round 21 changed (items 1 and 4: deeper darks)

- **The glass is no longer grey.** The slow wash of light from the upper left, which every gently sloping part of the body mirrors, was so broad (a power of 4) that level glass carried a third of it: the whole body sat at a mid grey and nothing could be dark. It is now a lobe (a power of 11, aimed a little higher and further left, and half as strong again): level glass catches only its skirt and stays near black with the album's deep tone in it, and glass that leans up and to the left carries all of it as a sheen. The album's colour coming up off the floor in front is tightened the same way (a power of 12, was 7) and a third stronger. Two numbers in `env()`.
- What it does (`mercury-still-round21.png`, third row, beside round 20): the body is dark smoked glass with the album's colour in it; the rims, the tube round the cover and the lip stand out bright against it; the words have a darker ground. It is the largest single step toward the reference's contrast since round 11.
- Seen refracting over dark, white and colourful windows and with real covers (white, blue, pink, near black): it holds on all of them; on a white window the widget is now a dark object with bright edges.
- **Still short of the reference:** their sheens are broad and have sharp ends (lamps with edges, mirrored crisply); ours are soft-ended glows. The bulb's lower half has no broad coral sheen like theirs. The bank to the right of the cover is a soft ring where theirs is one sharp crescent. The picture's colours are faint in the pocket's wall.
- `test=passthrough` passes, 8 of 8. (The mouse pointer shows in this round's pictures of the real window, to the right of the widget: the owner's mouse had been moved onto that screen. It is outside the glass, so it does not yet answer whether a blurred double shows inside it.)

## What round 22 changed (item 9 and item 1: light with edges on the tube round the cover)

- **Two sheens with edges on the tube of glass between the bulb's outline and the cover** (`SHEEN` and the block "Sheens with edges" in the top-face part of `main`, `shaders.js`). Each is a band lying along the tube, cut clean on one side and graded on the other, that swells where the tube faces its light, thins as the tube turns away and comes to a point: silver on the side toward the lamps (upper left), the album's colour on the side toward the floor (below the cover). They are drawn as shapes in the tube's own coordinates (how far across it, which way its outline faces), not mirrored from the room: the tube's slopes are in `base()`, which is sampled wide, so a lamp mirrored there can never have an edge.
- **The bank to the right of the cover** carries one pointed crescent of light, and the shade beyond it is deeper (.58, was .42) and starts further out.
- **The picture's colours in the pocket's wall** are stronger (.85, was .5).
- Seen on dark, light and white backdrops and with real covers (white, blue, pink, near black): it holds on all of them (`mercury-still-round22.png`; the bulb beside the reference's and beside round 21's).
- **Honest verdict: a modest step.** The upper left of the bulb now has a broad silver sheen with a clean outer edge, and there is colour under the cover. **Still short of the reference:** their sheens are brighter and more of them (several thin hot strokes inside the broad one); their tube is clear, with dark showing through between the strokes, where ours is still a little milky; their pocket wall on the left is wide and deep; the lower half of their bulb is one large coral reflection with a hot core, ours a band.
- **Not done this round, because the owner was at the only screen:** the photographs of the real refracting window, `test=passthrough`, `test=media`, `test=gpu`. The shader gained a few lines only in the tube. Run all four first next time.

## What round 23 changed (item 9 and item 1: a clear tube, hot strokes)

- **The tube round the cover is clear between its reflections** (`TUBE_CLEAR`, .5): the soft light it had picked up from the room is halved wherever no sheen lies, so the silver and the album's colour stand against dark glass instead of a milky grey.
- **A thin hot stroke inside each sheen**, close under its clean edge and shorter than the sheen: white in the silver (upper left), near white in the album's colour (under the cover, left of the time).
- **The floor's light under the cover is one larger reflection with a hot core** (`SHEEN.z` .3, `coreC`): brightest and palest at the middle of the bulb's underside, falling to the album's colour at its ends.
- Seen on dark, light and white backdrops and with real covers (white, blue, pink, near black): holds on all (`mercury-still-round23.png`, the bulb beside the reference's and beside round 22's).
- **Still short of the reference:** their pocket wall on the left is wide, deep and clear, ours narrow; their coral reflection fills the bulb's lower half and carries on along the lower edge, ours stops at the tube; their outer rim has a copper line all the way round the left; the silver sheen's graded side is still a soft fade where theirs has a second edge.
- **Again opaque base only** (the owner was at the only screen): the refracting shots, `test=passthrough`, `test=media` and `test=gpu` are owed for rounds 22 and 23 together.

## What round 24 changed (item 9: the wall on the left of the cover, the lower edge, the rim)

- **The pocket's wall on the left shows its inner face** (`WALL_L`): a stretch of deep dark glass 12 units wide between the cover's left edge and the tube, closed by a line of light along the straight of the side. (The first try carried that line round the corners, where it left the wall and curled away like a wire; it now lives only along the straight.)
- **The floor's light runs on along the inside of the bulb's lower edge** beyond the tube, toward the waist, as a blade that thins to a point.
- **A fine copper line just inside the silhouette on the bulb's left side.**
- Seen refracting in the real window over dark, white and colourful windows (second monitor), as the opaque base, and with real covers (white, blue, pink, near black): holds on all (`mercury-still-round24.png`).
- **Honest verdict: a small step.** Still short of the reference: their wall on the left is twice as wide again and one sees the cover's edge turned up in it; their silver sheen is one continuous ribbon from the left side round to the top, ours is two pieces; their lower half is a single broad coral reflection with a hard upper edge, ours is still bands; and their whole bulb reads as a thick ring of glass with a hollow middle, where ours reads as a dome with a tile set in it. That last one is the form itself (`base()`: the tube is 7 high and the body carries on at nearly the same height), and is the next thing to change.
- **The window tests owed since round 22 were run with this round**, on the second monitor: `test=passthrough` 8 of 8; `test=media` 15 of 15; `test=gpu dsf=1.25`, refracting, at 120 Hz with the card in use by other things (20 to 39%): 1.89% idle and 6.84% playing (1.86% and 7.9% in round 20), nothing while hidden.

## Measured on 14 November 2026: where the light lies in the ring of glass round the cover

Rounds 22 to 24 were judged by eye and moved slowly. `npx electron tools/capture/ring-profile.js shot=<a dark shot>` now reads both pictures (no window): from the cover's middle along five rays, the brightness from the cover's edge (`:`) to the silhouette (`|`) as digits 0 to 9, stretched to the same 30 columns in both, then how warm the light is, and the ring's width along the ray in stage units. Round 24 against the reference:

```
up         ref   30  :444444444444555555544555555445|   warm :222222222222211111112233210111|
up         ours  29  :676433356777777888987543332222|   warm :111111000000000000000000000000|
up-left    ref   23  :455544589999999999998878744432|   warm :122211100000000000000000001111|
up-left    ours   9  :888888899998888777666666665555|   warm :000000000000000000011111111111|
left       ref   59  :555533344443332222222244333423|   warm :222221111111111111222221111112|
left       ours  45  :236667532222246776778886666345|   warm :110010000000000000000000000012|
down-left  ref   36  :247766555555555555556667788464|   warm :122124344443333333333332111011|
down-left  ours  46  :111221125433321110001111111135|   warm :222222220111110000000001111122|
down       ref   68  :433222222221246422222222432213|   warm :211111111111100111111111331103|
down       ours  80  :112343576311346544444455441112|   warm :333332001111221222222222221112|
```

What it says, by the clock:

- **10 to 11 o'clock (up-left): the reference's key light.** One thick white streak (9s, no warmth) across the middle half of the ring, with a hard inner edge. Ours has no room for it: the cover's corner comes within 9 units of the silhouette where the reference has 23.
- **12 o'clock (up): the reference is an even, slightly pink mid-tone** (4 to 5) from the cover to the silhouette. Ours has a bright silver band in the middle (7 to 9) and a dark outer third.
- **9 o'clock (left): the reference is dark clear glass in its outer half** (2s), lighter toward the cover (5 at the wall, where the cover's own colours show), with only a thin line at the rim. Ours is the opposite: dark by the cover and a broad bright silver band (6 to 8) over the outer half. Our silver is in the wrong place.
- **7 to 8 o'clock (down-left): the reference's brightest warm area**, filled with the album's colour from the cover to the rim (5 to 8, warmth 3 to 4), hottest near the rim. Ours is nearly black there (1s).
- **6 o'clock (down): the reference is mostly dark** with one modest streak of colour close to the rim. Ours carries its band of colour in the middle of the ring.
- **Widths:** the reference's cover sits about 10 units further right and a few lower in its bulb than ours (left 59 against 45, up-left 23 against 9, down 68 against 80); their title starts 30 units from the cover's edge, ours 38.

So the next rounds re-aim the light to these numbers and move the cover, and each is checked with the tool before anyone looks at a picture.

## What round 25 changed (item 9: the ring's light laid out as measured)

- **The cover sits 8 units further right and 5 lower in the bulb** (`cover.c` in `shape.js`, now 188, 175), as the reference's does: there is glass round its upper left corner now, and the title starts 30 units from its edge as theirs does.
- **The light in the ring is laid out by the clock, to the measurements** (the block beginning "The light in the ring of glass round the cover" in `shaders.js`; `RING_KEY`, `RING_FLOOR`, `RING_TOP`):
  - 10 to 11 o'clock: the key lamp, one thick white streak across the middle of the ring, hard on the cover's side, softer toward the rim, with round ends. It replaces the silver band that ran from 8:30 to 1 o'clock.
  - 12 o'clock: an even soft light with a little of the album's colour in it.
  - 9 o'clock: nothing; dark clear glass (`TUBE_CLEAR` is .6).
  - 7 to 8 o'clock: the floor's light, the album's colour filling the ring from the cover to the rim, rising toward the rim and cut off hard just short of it.
  - 6 o'clock: dark; the blade of colour along the lower edge sits closer to the rim.
- The first try laid these on as flat fills with short ends, which matched the numbers and looked like paint. They are soft lights that swell and die away round the ring, with the crisp streaks on top. The lesson: the tool judges where the light is and how bright; the picture judges whether it is glass.
- The line of light that closed the wall's inner face on the left is gone (it read as a wire), and that face is lighter (`WALL_L`).
- Measured after the round (the tool now finds our cover's edge with `shape.js`'s own `tileSdf`, since the tile leans and is wider at the bottom; the widths in the table above were taken with a plainer estimate):

```
up         ref   30  :444444444444555555544555555445|
up         ours  40  :567777654456676555555555544333|
up-left    ref   23  :455544589999999999998878744432|
up-left    ours  27  :566777899999999989988888777665|
left       ref   59  :555533344443332222222244333423|
left       ours  54  :136466322232322221111111145535|
down-left  ref   36  :247766555555555555556667788464|
down-left  ours  42  :113676666554444444455566677777|
down       ref   68  :433222222221246422222222432213|
down       ours  68  :342566521111111111111111111113|
```

- Seen refracting in the real window over dark, white and colourful windows (second monitor), as the opaque base, and with real covers (white, blue, pink, near black): holds on all; the lower-left takes each album's colour (`mercury-still-round25.png`).
- **Honest verdict: the largest step on the bulb since the pocket was made**, and the first that the numbers confirm. **Still short of the reference:** their light has hard edges nearly everywhere, with near-black glass right beside it, where ours has one hard-edged streak and soft light elsewhere; their rim carries several fine parallel lines of white and copper on the left and along the bottom, ours one; by the cover at 9 o'clock their glass is lighter (5 against our 1 to 3) and at 12 o'clock ours is brighter by the cover and darker at the rim than theirs; their streak of colour near the rim at 6 o'clock is missing; our ring is 10 units wider than theirs at the top.
- `test=passthrough` 8 of 8 with the cover in its new place; `test=drag` passes.

## What round 26 changed (item 9 and item 1: crisp lines in the ring)

- **A ribbon of light under the cover's lower left corner** (`RIBBON`): on the pocket's crest where it faces the floor, with cut edges, widest under the corner, thinning along the cover's lower edge and gone before the far corner, and running out up the left side. Under the lower edge a line of deep shade lies beside it, cut as cleanly. (Of even width all the way round it drew a second outline round the cover; and the shade is kept to the lower edge, because round the corner the reference has the floor's light beside the ribbon, not dark.)
- **Three fine lines in the rim** (`RIM`), as the edge of thick glass shows the same light several times: copper outermost and longest, on the left and along the bottom; white inside it round the lower left; a third in the album's colour along the bottom, below the time. Each swells and dies on its own stretch.
- The blade of colour along the lower edge sits a little higher and is brighter; near the time label it gives way, as everything does where something has to be read.
- Measured: the rows are as after round 25 except where the lines cross them (`down-left` now starts `:112576678654...` where the reference has `:247766555555...`: the ribbon is there, a little further from the cover than theirs).
- Seen refracting over dark, white and colourful windows, as the opaque base, and with real covers (white, blue, pink, near black): holds on all (`mercury-still-round26.png`). `test=passthrough` 8 of 8.
- **Still short of the reference on the bulb:** by the cover at 9 o'clock their glass is lighter and one sees the cover's colours in it; the top is not as flat as theirs; their white streak has a fine dark edge on its outer side and ours runs into the rim's own light; their ribbon under the cover is one blade that starts on the left wall, ours follows the corner. **And the bulb is now ahead of the rest of the drop:** the waist, the upper lip and the right end still carry the old soft light. They are next, with the same method: measure, then change.

## Measured on 14 November 2026, second part: the rest of the drop, and a correction

**A correction to the ring's measurements above.** The reference's cover had been read 12 pixels too far right and as a square; it is 140 to 447 across and 278 to 568 down. `ring-profile.js` has the right numbers now. Two things said above came from that mistake and are withdrawn: the reference's glass is *not* lighter by the cover at 9 o'clock (those columns were the cover's own picture), and its ring is not much wider than ours on the left. Everything else stands. Round 26 against the reference, with the cover read properly:

```
up         ref   34  :343444444444445555555544555534|
up         ours  40  :567777754467677655555555444333|
up-left    ref   21  :555545799999999999999888974443|
up-left    ours  27  :566777889999999999988888777654|
left       ref   51  :433444444333322222222443333422|
left       ours  54  :125456322232322221111111135524|
down-left  ref   32  :755555555555555555666666777463|
down-left  ours  42  :112576678654444444455566677777|
down       ref   66  :424322222222222222222222432114|
down       ours  68  :342468611111111111111111223454|
```

**The rest of the drop.** `npx electron tools/capture/cut-profile.js shot=<a dark shot>` (no window) reads five vertical cuts, each from the upper silhouette (first column) to the lower (last), 40 columns: between the cover and the title; through the title; between the title's end and the first button; through the play button; between the last button and the right end. The number is the drop's height there in stage units. Round 26:

```
gap    ref   229  4344544222222221111122122576236222233363
gap    ours  202  2333322233345543345556654663423574223446
title  ref   163  5322224181111111222254522393222222343222
title  ours  132  1343111135111111111122334456679776555436
waist  ref   120  2574455554245651221221111115222324344444
waist  ours  129  1356888555433221231111111111111115412215
play   ref   197  3321111112336311112222222248453225223342
play   ours  203  2463224853366422114444111152321711112322
end    ref   131  2554322233469972552111233344566754555536
end    ours  118  1222222221111112223544332211443223334454
```

What it says (words, the timeline and the buttons show as short bright runs in both):

- **Between the cover and the title the reference is near-black glass** (1s and 2s through its middle); ours is a mid grey (3 to 6) from top to bottom. This is the largest difference left.
- **Through the title, the reference's lower half is dark** (2s and 3s) with the timeline as one bright line in it; ours is bright (4 to 9) over the whole lower 45%: the glow round the timeline and the lower lip's light are far too broad.
- **At the right end the reference is bright and lively** (a white streak at a third of the way down, then rising to 5 to 7 through the lower half); ours is dim (1s and 2s above, 2 to 5 below).
- **Over the play button the reference's upper lip is dark** (1 to 3, with the volume line in it); ours carries several bright bands there.
- **Through the waist the two agree above** (a sheen across the upper third, dark below it); the reference's lower third is lit (3 to 4) where ours is dark.
- The reference's drop is taller than ours through the title (163 units against 132) and between the cover and the title (229 against 202): it is in perspective and nearer the eye on the left; no change is meant by this.

## What round 27 changed (items 1 and 4: dark glass between the cover and the title)

- **To the right of the cover the glass is near black** (`WALL_R`): a little light at the cover's very edge, then the pocket's wall and the bank beyond it in deep shade, from level with the cover's upper third down. Read along a line from the cover's edge toward the title, level with the cover's middle, ours was `5665665544443444454432...` where the reference has `3344333222222222111111...`; it is now `5666654322222111111111...`. (The wall there faced the key lamp and mirrored it, and round 22 had laid a crescent of light on the bank: twenty units of bright glass where the reference has four. The crescent is gone.) Level with the cover's upper third the body's own even light is left alone, as the reference has it.
- **The timeline's bead glows close** (its halo was 25 units across, three times the reference's).
- `cut-profile.js` takes its cut through the title a quarter of the way along it, clear of the bead in both pictures; the first reading there had the bead's glow in it, and what was said above about the lower half through the title being too bright was mostly that.
- Measured after the round: `gap` is `2332221111222211223444433452...` against the reference's `4344544222222221111122122576...` (it was `2333322233345543345556654663...`).
- Seen refracting over dark, white and colourful windows, as the opaque base, and with real covers: holds on all (`mercury-still-round27.png`). `test=passthrough` 8 of 8.
- **Next is the right lobe**, which is the furthest from the reference now. Side by side: theirs is warm and lit all through (the upper lip a clear pink sheet of glass, the three button bowls with glowing rims in the album's colour, the right end a thick curled lip with white and coral light and dark streaks in it); ours is grey and dark, with thin grey rims on the bowls and one thin line at the end.

## What round 28 changed (items 1, 4 and 8: the right lobe)

- **The three button bowls are ringed with the album's colour** (`BTN_RIM`): one crisp ring just inside each rim, brightest on the arc toward the floor's light (lower left) and again toward the key lamp (upper right), with a soft glow inside it; the play button's a quarter stronger, and each brightens when pressed. One ring each, laid on, so it cannot multiply as the mirrored rings did before round 14.
- **The right end is lit** (`END_KEY`, `END_FLOOR`): the key lamp as a white streak just inside the silhouette where the end faces right, a dark streak inside that, and the floor's light in the album's colour where the end turns down and under. It comes in gradually from the last button on (starting at a line, it drew that line), gives way where something is read, and dims while the two utility dishes show.
- Measured (`cut-profile.js`): the `end` cut's lower half now rises as the reference's does (`...444234455766` against `...566754555536`; it was `...443223334454`). Its upper half is still dark where the reference has a white streak a third of the way down: theirs is the upper lip's own edge sweeping down toward the end, 40 units in from the tip, which ours does not have.
- Seen refracting over dark, white and colourful windows, as the opaque base, and with real covers (white, blue, pink, near black: the rings take each album's colour): holds on all (`mercury-still-round28.png`, fourth row: the right lobe beside the reference's).
- `test=passthrough` 8 of 8. `test=gpu dsf=1.25`, refracting, second monitor: 1.9% idle (1.89% in round 24) and 10.8% playing (6.8%). The playing figure is the card's clock, not the shader: idle draws the same shader 15 times a second and has not moved, and the power the widget adds while playing is no higher (about 15 W against 17).
- **Still short on the right lobe:** the reference's rings are not lines but the lit thickness of the bowls' rims, wider and softer on the inside; its upper lip is a clear sheet lit warm all through, ours grey with one sheen; its upper lip's edge sweeps down toward the end as a broad white band; its lower right is a curled point with the brightest coral on the whole drop, ours a smooth corner.

## What round 29 changed (item 4: warm light)

- **A copper line in the upper edge** (`RIM_TOP`): the album's colour warmed toward copper, just inside the upper silhouette, swelling on the shoulders of the two lobes and at the right end's top and dying away between them and through the waist. In the reference the drop's whole upper outline is warm (the first columns of every cut's warmth row: 4, 2, 2, 0, 2 to 5); ours was a cool white line or nothing (1, 0, 1, 0, 1). After the round ours reads 2, 2, 1, 2, 1 to 2. It has no floor under it on purpose: of even strength all the way round it would be an outline again, and outlines were item 1 of this audit.
- **The lamps other than the key are a neutral white** (`cool` in `env()`, now .93, .94, .97; it was .86, .93, 1.). There is no cold light anywhere in the reference, and the blue cast made the glass read as steel beside its copper and coral.
- The buttons' rings are dimmer where they face no light, and the arc toward the key lamp sits further round to the right, as the play button's does in the reference.
- Seen refracting over dark, white and colourful windows, as the opaque base, and with real covers (white, blue, pink, near black): holds on all (`mercury-still-round29.png`; its last row sets this round beside round 24, where the day's work on the look began). `test=passthrough` 8 of 8.
- **Where the still stands after rounds 22 to 29.** The bulb's light is laid out as the reference's and measured to be; the glass between the cover and the title is dark and clear; the buttons are ringed; the right end and the upper edge are lit and warm. **Still short, largest first:** (1) the reference's light has hard edges nearly everywhere and ours mostly on the bulb: the waist's S-shaped band, the upper lip and the lower lip are still soft; (2) the right end's form: theirs curls to a point at the lower right with the brightest colour on the drop, ours is a smooth corner (the outline itself, `shape.js`); (3) the upper lip as a clear sheet with its edge sweeping down toward the end as a broad white band; (4) the bowls' rims as lit thickness rather than a line; (5) the floor under the drop: theirs carries broad pools of the album's colour with the drop's reflection in them, ours two soft ovals.

## What round 30 changed (items 1 and 4: the S-band and the lower lip with hard edges)

Done on 16 November 2026, the first round of a fresh session (Opus 5.5).

- **The upper lip's leading edge is one S from the cover to the right end, as in the reference.** Seen beside the reference at the waist, theirs is not a band that starts at the waist: it is the lip's edge running from the cover's lower right corner, under the words, up through the waist and over the pod. Ours stopped at the waist (it faded out between x 432 and 492). In `shape.js` the waist leg now runs on past the bottom of the band circle as a nearly level line to the cover (`L.run`; `archSdf` blends to it below x 442; `lipFade` is 266 to 304, where it melts into the cover's bank). Only `archSdf` changed, not the outline, so the hit test is the same (`test=passthrough` 8 of 8). Under the words the lip is a rolled ridge only: behind it the glass comes back down to the strip's level (`sheet` in `base()`), so nothing but the ridge rises where it fades in beside the cover.
- **It is lit with hard strokes** (`LIP_EDGE` in `shaders.js`), across it from the strip up: its outer face, which looks at the floor, copper-white and cut hard; a fine dark seam; its crest, a white hairline that swells into a streak where it faces the key lamp; and shade in the hollow behind the roll. Along it each part swells and dies on its own stretch (of even strength it was a double outline, the first try's look). Where it rises through the waist it is a broad ribbon: the glass between its strokes is lit, and a second line lies in it.
- **The lower lip is dark, with one streak at its edge** (`LOW_EDGE`): most of the floor's soft glow is taken out of the last 30 units inside the lower edge between x 300 and 690, and in its place one thick streak with hard sides, 4 units in, swelling white in three places and thinning to copper between, a line of shade above it and a fine copper line at the edge (brighter where the streak is thin). Ours was two broad soft bands of the floor's colour.
- Measured (`cut-profile.js`), the cuts this touched:

```
title  ref   186  8134221111311141111224536227322222233115
title  ours  154  2332111163581111332332164233357743222356   (round 29: ...1111331111111222348642234767)
waist  ref   120  2574455554245651221221111115222324344444
waist  ours  129  2335666346657875751111111111111103601374   (round 29: 2356887555433211231111111111111113612215)
```

  Through the waist the reference has a moderate sheen, a dark seam and one stroke of 6, then dark; ours had one broad soft bump of 8s and has now a moderate sheen, a seam and its stroke (7 and 8, still a little bright). Under the title the lower lip was 4 to 7 all through; it is now 2 to 3 with the edge at 5 to 6, as the reference's (2s, then its edge). The ring round the cover is unchanged (`ring-profile.js`).
- Seen refracting over dark, white and colourful windows, as the opaque base, and with real covers (white, blue, pink, near black): holds on all (`mercury-still-round30.png`; its second row is the waist and the band under the words beside the reference's).
- **Honest verdict:** the structure is now the reference's: the words sit on a plateau bounded by the lip's edge, and the S reads from the cover to the pod. The light on it is still short. **Still short, largest first:** (1) under the words the reference's band is a broad ribbon of bright glass, about 20 units, and ours a thin silver line; (2) the plateau the words sit on is lighter, silvery glass in the reference and a dark box in ours (the words' pool; their cut through the title is dark too, so only lighter, not bright); (3) the pink underside below the lower edge still shows as a band of its own under the new streak, so the lower edge has three parallel lines where the reference has one (that is item 5, the floor, and the underside's thickness, `uWall`); (4) the waist's stroke is a little too bright.

## What round 31 changed (item 7 in part: the right end's point)

Done on 16 November 2026, the second round of the same session.

- **Measured first: the right end's silhouette was already the reference's, except at the corner.** Traced off the picture (the reference mapped onto the stage as `outline.js` maps it), its right side lies within 1 to 2 units of ours from the top of the end down to the corner, and its lower edge within 1 to 3 units from x 737 to the corner. Only the corner differed: theirs is a tight point at about (785, 229), with the lower edge running nearly level into it; ours was a broad fillet 3 to 5 units inside that, because the `cut` circle was blended into the end with a smoothing of 24 units.
- **The corner is turned tightly** (`L.cut.kTip` in `shape.js`: the smoothing eases from 24 to 8 between x 745 and 785, so the rest of the lower edge is untouched). Ours now reaches (785.5, 229) at the point, against the reference's (785, 229); just left of the point our lower edge is still 3 units higher than theirs (they run level at 234 to 236 from x 761 to 781). `test=passthrough` 8 of 8; the hit test reads the same outline.
- **The point is lit as the reference's is** (`END_TIP` in `shaders.js`): the floor's light gathers there, hotter, whiter and a little wider toward the point (the reference's hottest colour on the whole drop is at this tip), and just inside it a dark crease where the curled lip tucks under.
- Measured (`cut-profile.js`, the `end` cut, 26 units left of the point): its lower half reads `...454344556886` against the reference's `...566754555536` (round 30: `...454234455766`). The last columns are now a little too bright: the tip's glow reaches 20 units (`END_TIP.z`) and should reach about 12. That is a one-number change for the next round.
- Seen refracting over dark, white and colourful windows, as the opaque base, and with real covers: holds on all (`mercury-still-round31.png`; its second row is the right end beside the reference's and round 30's).
- **Honest verdict: a small step.** The silhouette was nearly right already, so the "curl" the reference shows is mostly light: their whole end is a mass of lit glass (white streaks down its right side, coral through its lower half, the upper lip's edge sweeping down into it as a broad white band), where ours has one white streak and the floor's light at the bottom. That is the next item, the upper lip as a clear sheet with its edge sweeping down toward the end.

## What round 32 changed (item 8, at the owner's word: the two controls as beads beside the end)

Done on 16 November 2026. The owner, asked whether the two utility dishes (open the full app, hide the widget) should leave the surface for a right-click and tray menu, answered that they should appear when the pointer comes over the right side of the drop, as two separate small beads of liquid glass to the right of it, not inside it.

- **In `shape.js`** the two controls rest just clear of the right end (`L.utils`, now at x 807, 6 to 7 units beyond the edge, 27 apart), and `L.beads` says how they come out: each grows out of the end from 14 units further in and slides clear, joined to it by a neck (a smooth union of 6 units) until it pinches off (`beadAt`). `hit()` knows them while they are out (`f.beads`, the same spring the shader draws with): a bead is `util` within 4 units of its edge, and the narrow gap between the end and the beads is `gap`, which does nothing but keeps the pointer on the widget as it crosses (`demo.js` ignores a click there and shows the plain arrow).
- **They come out** while the pointer is on the drop right of x 690, on a bead or in the gap (`pointerMove` in `mercury.js`), and go back in when it leaves.
- **In `shaders.js`** the beads are part of the outline while they are out (`beads()`, `outlineB()`), so they have coverage, an underside, a shadow and the drop's glass and room, and each is a small round dome of its own (the end of `base()`): steep all round its rim, so its rim mirrors the lamps on every side. Only a sliver of a bead's underside shows (drawn as far down as the drop's, it was a second bead under each). A press dents the bead (`detail()`). The right end's laid-on lights keep off them (`inBead`), the end no longer dims while they show, and the icons are not split into blue and orange by the bead's slope. The old dishes in the lip, and their shade, are gone.
- **`test=passthrough` has six new cases** and passes 14 of 14: where the upper bead rests a click reaches the window behind until the pointer comes; with the pointer on the right end, in the gap, on either bead, the widget takes the mouse; beyond the beads it goes to the window behind.
- `mercury-shots.js` has four new shots: `dark-beads-coming` (part way out), `dark-beads`, `dark-bead-hover` (pointer on the upper bead), `window-beads`.
- **A fault in the capture tool, found on the way:** a shot that moves the pretend pointer now and then came out as if it had never moved (one or two of the four bead shots in each run, a different one each time), although the page's own state read back right. Its exact cause is not pinned down. Not the real mouse (the cursor was on the main monitor; the page now ignores real pointer events anyway in `?capture=1`), and not covering alone (keeping the window painting while covered, and above everything, each helped but did not cure it). What cured it: reading the page's state back in a round trip of its own between the shot's script and the photo (printed with `trace=1`). With all of these, 12 of 12 bead shots over three runs came out right. Hover shots from earlier rounds (`dark-hover`, `dark-hover-title`) may have been hit by the same fault.
- Seen: `mercury-still-round32.png` (the first row zooms on the right end with no pointer, budding, out and with the pointer on a bead). **Not yet seen by the owner on their screen.** Open for the owner: whether the beads are the size they want (radius 8.5 units, as the dishes were; the audit's first finding asked for about 12 for comfort at the small size).

## What round 33 changed (items 1 and 4: the upper lip's edge sweeping down round the right end)

Done on 16 November 2026.

- **Where the upper lip's edge comes down round the right end it is a broad white band** (`sweep` in the `LIP_EDGE` block of `shaders.js`: from x 722 on, brightest high up and gone by y 250). Its crest is up to 2.4 units wider there, its outer face is at full width, the glass between its strokes is lit as in the waist, and the dimming the edge takes over the pod does not apply to it. Round 31's right leg carried only a grey hairline.
- **The tip's glow reaches 12 units, not 20** (`END_TIP.z`), as round 31's measurement asked.
- Measured (`cut-profile.js`, the `end` cut):

```
end    ref   131  2554322233469972552111233344566754555536
end    ours  118  3432222222222358877754432222454234456776   (round 31: 5222222222111111233544332222454344556886)
```

  The band is there now (`58877` where the reference has `46997`), but about 12 units lower down the cut than theirs: at that x our lip's edge is where the arch circle leaves the pod (y about 177), and theirs is higher. Moving it is a change to the arch's geometry (`L.arch`, `L.end` in `shape.js`), not to the light. The last columns are a shade calmer (`6776` against round 31's `6886`; the reference's `5536`): what is left there is the floor's light along the end's underside (`END_FLOOR`), not the tip.
- Only the light changed, not the outline or the hit test. Seen as the opaque base, refracting over dark and colourful windows, and with real covers (`mercury-still-round33.png`; its first row is the right lobe beside the reference's and round 31's).
- **Still short on the right lobe:** the reference's band is thicker and reads as the lip curling over (white over coral, with a dark line inside); ours is a band laid along the edge. Their upper lip is a clear, warm sheet; ours is grey. Their bowls' rims are lit thickness; ours are lines.

## What round 34 changed (items 1 and 4: the upper lip as a clear, warm sheet)

Done on 16 November 2026, in a fresh session (Opus 5.5).

- **Measured first, with a new tool:** `npx electron tools/capture/area-map.js shot=<a dark shot> box=x0,y0,x1,y1 step=N [part=lip]` (no window) prints a grid of brightness and warmth over any part of the drop, the reference beside our shot, in stage units (the reference mapped onto the stage as `outline.js` maps it), and the mean colour of the cells; `part=lip` keeps to the upper lip. One cut through the play button could not say whether the lip reads as a sheet; this can. Over four areas the bulb and the waist were already the reference's (mean colour 131,96,95 against 131,93,91, and 97,81,82 against 101,82,81); the upper lip was too bright and grey (125,110,110 against 112,90,89), and the lower right lobe, with the bowls and the floor, too dark (92,75,76 against 119,90,85: rounds 35 and 36).
- **What the grey was:** the inner face of the lip's top rim and its crown mirrored the room's cool wash all over: 3s to 5s, neutral, from 8 units inside the outline to the volume line, where the reference's clear glass is 2s and 1s with a rose cast. And the volume bead's glow lit the glass for 11 units round it.
- **The lip's glass takes the album's colour and lets the wash go** (`LIP_SHEET` in `shaders.js`): from 5 units inside the outline and clear of the leading edge, its reflections and its body are tinted toward the album's colour (pinkish with a pink cover, olive with a cream one) and the wash is taken down by .6, a little less on the lobe's left shoulder, where it curls up toward the lamps.
- **A broad white band along the top of the lip, on the lobe's left shoulder** (`LIP_TOP`), with a fine line of the album's colour inside it: measured across the rim at nine places from x 570 to 750, the reference's brightest stroke on the upper lip is there (8s and 9s from 4 to 10 units in at x 585 to 600, a 7 three units in at x 630, a 5 at x 660, nothing by 690). Cut hard at both sides, hottest in its middle, drawing out toward the outline and thinning to the right.
- **The volume line:** the bead's glow is kept close (as round 27 did for the timeline's), and the part not yet played is dim, as the reference's is (4s beside the played part's 8s; ours was 7s). That is item 11 in part.
- Measured: the upper lip's mean colour is 114,97,96 against the reference's 112,90,89 (round 33: 125,110,110). Across the rim, from the outline inward:

```
x 585  ref   4445689975443332222222   (peak 9 six units in, then clear)
x 585  r33   2355322233344555667654   (a 5 at the outline, grey after it)
x 585  r34   2355445788765555445543
x 600  ref   1354456885433322222211
x 600  r33   3455333344445544543346
x 600  r34   3455457887655443333224
```

  The ring round the cover and the five cuts are unchanged except where the lip and the volume line cross them.
- Only the light changed, not the outline or the hit test. Seen as the opaque base, refracting over dark and colourful windows, and with real covers (`mercury-still-round34.png`; its first row is the upper lip beside the reference's and round 33's).
- **Still short on the upper lip (round 34):** inside the band the glass is still a 5 for a few units where the reference's is a 3 (a soft light ours carries there, which the sheet's tint does not reach); the reference's volume line is longer (about 102 units against our 86) and sits 4 units higher, under a "VOLUME" label we do not have (item 11); its band carries on along the top as a thin white line into the broad band down the right end, which in ours begins 12 units too low (round 33).

## What round 35 changed (items 1, 4 and 8: the bowls' rims as lit thickness)

Done on 16 November 2026, in the same session as round 34.

- **Measured first**, along eight rays from each bowl's middle, from 18 units inside its edge to 8 outside (the reference's bowls found on the picture: the play bowl's middle at about 638, 189 with a radius of 40, the previous button's at 561, 190 with 28; ours are 642, 190 with 37 and 566, 193 with 24). The reference's rim is dark all round the inside, with a fine line at the edge, except for a broad crescent of the floor's light from 4:30 to 7:30 (8s and 9s over the last 7 units inside the edge, ramping in over 4 more, peach-white at its core, 231,196,183, and coral toward its sides), a darker strip between that crescent and the edge at 6 o'clock (4s over the last 3 units), the pod just below the edge lit (6s falling to 3s), and a short warm arc at 1:30. Ours was one even ring of light, neutral, at most 4 units wide, and the wall under each bowl's upper shoulder mirrored the floor (3s to 6s at 12 o'clock where theirs is 1s).
- **Each bowl's rim is lit as a thick ring** (`BTN_RIM`, now four numbers, and `BTN_KEY` in `shaders.js`): the crescent is the bowl's circle less a circle shifted up, so its inner edge is cut hard, it is widest at 6 o'clock and runs out to nothing toward 3 and 9; brightest against that inner edge, peach-white there and coral toward the edge, with a darker strip and then a fine line at the edge where it is wide; the bowl above it lit warm from it, fading over 10 units; the rest of the inside of the rim darker; the fine line at the edge plainest at the top and bottom; the key lamp's arc at 1:30. The small bowls' crescents scale with their radius and are a little dimmer, as the reference's are. The tone curve turns any strong light white, so the warmth comes from moderate, saturated light and a warm tint on what lies under the crescent, not from more light.
- Measured on the play bowl, from 18 units inside the edge to the edge (`|`) and 8 beyond:

```
6 o'clock    ref  222233345688898544|444543333
             r34  111111111123466676|531223333   (the old ring)
             r35  111222333578888766|654444433
4:30         ref  222222334466689997|665433333
             r35  122222334577888888|755432221
12 o'clock   ref  111111111112322246|543333333
             r34  111222222333445566|677777766
             r35  111111222222223345|556666654
```

  The crescent's colour at 6 o'clock is 204,180,173 to 221,197,189 over two runs (the liquid moves) against the reference's 231,196,183 (round 34: 204,192,191). The 'play' cut of `cut-profile.js` now has the crescent where the reference has it: `...112485421...` against `...112248453...`.
- Only the light changed, not the outline or the hit test.
- **Still short on the bowls:** the reference's crescent has a thinner hot core and more coral; its bowls are about 3 units larger in radius than ours (28, 40, 27 against 24, 37, 24) and nearly touch one another and the pod's rims; and the pod round them is lit silvery-pink glass (4s to 6s) where ours is dark brown. That last is most of what is left of the lower right lobe's darkness (mean colour 92,75,76 against 119,90,85 before this round).

## What round 36 changed (items 1 and 4: the lower edge as one line)

Done on 16 November 2026, in the same session as rounds 34 and 35.

- **Measured first**, across the lower edge at seven places from x 300 to 700, from 30 units inside the lower silhouette to 16 below it. The reference's lower edge is one lit band running right up to the silhouette and falling off within 3 to 5 units below it (at x 480: 8s and 9s over the last 9 units, then 7 6 5 and dark). Ours was a streak lying 4 units in, a gap, a copper line of its own at the edge, and then the underside as a third band, 5s over 6 to 8 units below the silhouette: three lines where theirs is one (round 30 named it).
- **The lower lip's streak runs to the edge** (`LOW_EDGE` in `shaders.js`), wider where it swells (up to 8 units), and the copper is its own outer side rather than a line beside it.
- **The underside falls off within a few units** (`UNDER_FALL`): only its first 3 or so carry on the edge's light; below that it is dark on a dark desktop and clear glass, not a dark band, on a light one (first tried dark all the way, it drew a dark line under the whole drop on a white window: an outline again, item 1). Its thickness (`uWall`, 11 units) and the hit test are unchanged.
- Measured, at x 480, from 30 units inside the silhouette (the 31st digit is the silhouette):

```
ref  2332234434454567776324899999998765211111111111
r35  1111135664200000011146888754665555311111110000
r36  1111246653100000111125788888765543211111110000
```

- **The floor** (broad pools of the album's colour under the drop): read with `area-map.js part=all`, the ground below and round the drop already has the reference's mean colour (74,50,49 against 75,52,51), and the reference's perspective puts its pools a few units from where ours could be compared. Left as it is; the drop's reflection in the floor, which the reference shows, is not attempted.
- The ring round the cover's `down` ray, past the silhouette: ours `|43311` against the reference's `|31111` (round 35: `|34311`). Only the light and the underside's see-through changed. Seen as the opaque base over dark, light and white, refracting over dark and colourful windows, and with real covers (`mercury-still-round36.png`).
- **Still short on the lower edge:** the reference's lower lip is a broad rounded tube whose light breaks into separate white and coral streaks with soft gradients between them; ours is one even ribbon.

## What round 37 changed (items 1 and 4: the band under the words as a broad ribbon)

Done on 16 November 2026, in the same session as rounds 34 to 36.

- **Seen beside the reference's** (`mercury-still-round37.png`, first row): under the words their upper lip's leading edge is a ribbon of glass some 16 units deep, below the artist's name and rising into the waist: a copper line along its foot, warm, darker glass through its middle and a white-to-copper stroke along its top. Ours was a white hairline over a copper line, 3 units in all (round 30's verdict, first of what was still short).
- **The edge is a broad ribbon under the words too** (`LIP_RIBBON` in the `LIP_EDGE` block of `shaders.js`), carrying on into the ribbon it already was where it rises through the waist: its crest moves up 5 units and widens, warmed toward copper where it is thin; lit warm glass fills the space between it and the copper line at its foot; the shade behind the roll moves up with it. It fades in from x 292 beside the cover's bank and hands over to the waist's own ribbon.
- Measured: the `title` cut of `cut-profile.js` now has the ribbon where the reference has it, a quarter of the way along the title: ours `...2337545222...` against the reference's `...2245362273...` (round 36: `...4323321642...`); its top stroke was an 8 at first, where the reference's is a 4 or 5 at that point, and is dimmer along the ribbon now. The other cuts are unchanged.
- Only the light changed. Seen as the opaque base over dark, light and white, refracting over dark and colourful windows, and with real covers.
- `test=gpu dsf=1.25` after rounds 34 to 37, refracting, second monitor, with the card already 70% busy with something else: 2.1% idle and 6.0% playing (round 28: 1.9% and 10.8%). The four rounds added nothing that matters.
- **Still short under the words:** the reference's ribbon brightens to white as it rises, with a coral streak in it; ours is even along its length. The plateau the words sit on is lighter, silvery glass in the reference and dark in ours (round 30's second point).

## What round 38 changed (item 7 in part: the lip's edge round the right end)

Done on 16 November 2026, in the same session as rounds 34 to 37, at the owner's word to carry on.

- **Seen first, with `outline.js` over the reference and a zoom on the right end:** the reference's lip edge does not turn down inside the end. It runs on from over the next button as a long diagonal down to the right silhouette, meeting it at about (790, 200), and the lower right below it is open body, where the coral point lies. Ours turned down into a vertical leg some 25 units inside the end (the edge of the `end` circle), which closed the pod off there and kept the whole end under the lip; the light laid along the edge (round 33's `sweep`) followed that leg, so on the `end` cut it came out lower than the reference's band. Round 33 had put this down as "about 12 units lower".
- **The right leg is gone** (`L.end.leg: false` in `shape.js`; `archSdf` in JS and in the generated GLSL returns the arc alone): the arch circle on its own already runs down to the silhouette at about (795, 201), within a few units of the reference's edge from x 700 rightward. Over the buttons nothing moved. The outline and the hit test are unchanged (neither uses the arch).
- `test=passthrough`: 14 of 14.
- The light needed no change: the edge's strokes and round 33's broad white band follow the edge, so they now lie along the diagonal.
- Measured (`cut-profile.js`, the `end` cut):

```
end    ref   131  2554322233469972552111233344566754555536
end    ours  118  5221111111147774477444222222454233444666   (round 37: 3432111111112358877754432222454234456776)
```

  The band's first stroke now sits where the reference's 9s are; the second (`77` a few columns on) is the glow through the fold just under the edge.
- **Still short at the right end:** the reference's band along the diagonal is a curl, white over coral with a dark line inside it, and its lower right is a mass of lit coral glass; ours is a white band and the floor's light at the point. The reference's edge enters the right lobe about 8 units higher than ours at x 680.

## What round 39 changed (items 1 and 4: the pod round the bowls as lit glass)

Done on 16 November 2026, in the same session as rounds 34 to 38.

- **Measured first** with `area-map.js part=pod` (new: the pod the buttons sit in, less the bowls and 3 units round them). The reference's pod is lit, warm glass: 3s and 4s with warmth 2 to 3 along its lower half, 5s to 7s at its right end past the last bowl, 2s and 3s in the narrow gaps between the bowls; mean 129,96,93. Ours was a dark tray, 1s and 2s, neutral: 106,87,87. (Just under the lip's edge ours is brighter than theirs, 6s and 7s against 3s to 5s: that is the spectrum glowing through the fold, a designed reaction to the music, and was left.)
- **The floor's light comes up into the pod** (`POD_LIGHT` in `shaders.js`): it rises toward the pod's own lower rim, swells a little under each gap between the bowls, gathers where the pod narrows to its end past the last bowl, and a little lies in the gaps at the bowls' middle height. The bowls themselves are left out, so their dark insides and lit rims stand in a lit tray as the reference's do.
- Measured: the pod's mean is 125,98,96 after 360 frames and 136,109,107 after the full 720 (the pigment gathers), against the reference's 129,96,93 (round 38: 106,87,87); the whole lower right lobe 105,83,82 against 119,90,85 (round 38: 98,79,78; what is left there is mostly the strip below the pod, round the timeline). The `end` cut's lower half now rises as the reference's does.
- Only the light changed. Seen as the opaque base over dark, light and white, refracting over dark and colourful windows, and with real covers (`mercury-still-round39.png`).
- **Still short on the pod:** the reference's carries silver streaks, between the bowls and along the pod's lower rim, which ours does not; ours is a smooth glow. Its bowls are larger and nearly touch (item 3 of HANDOFF's list).

## What round 40 changed (item 8: the bowls at the reference's size)

Done on 16 November 2026, in the same session as rounds 34 to 39.

- **Measured on the reference** (its three bowls on a zoom of the picture, mapped as `outline.js` maps it): radii of about 28, 40 and 27 with gaps of about 9 and 8 between them, nearly touching the lip's edge above and the pod's rim below. Ours were 24, 37 and 24 with 15 between.
- **The bowls are 27.5, 39.5 and 27.5** (`L.buttons` in `shape.js`); the next bowl moved 2 left and 2 down, so its rim keeps 3.8 units clear of the lip's edge (at 1.7 it would have run into the edge's rolled light). Gaps of 9.1 and 7.2. Everything reads them from `L.buttons`: the hit test, the bowls in `detail()`, their rims, the press springs. The row in the reference sits about 4 units further left than ours, which looks like the perspective of the mapping, so the positions are otherwise kept.
- **The previous and next glyphs are 26 units, not 21** (`ink.js`), about 29% of their bowl's width as the reference's are (22% at 21 in the larger bowls).
- Measured: on the play bowl at 6 o'clock ours reads `...334678888765|` against the reference's `...345688898544|`; the `play` cut `...111385521...` against `...112248453...`. The pod's mean stays near the reference's (133,105,103 against 130,97,94 with the larger bowls left out).
- `test=passthrough` after the change: 14 of 14. Seen as the opaque base over dark, light and white, refracting over dark and colourful windows, and with real covers (`mercury-still-round40.png`).

## What round 41 changed (items 7 and 11: the right lobe's shoulder, and the volume line)

Done on 16 November 2026, in the same session as rounds 34 to 40.

- **Measured first: the upper silhouette by x**, ours from `shape.js` against the reference's found on the picture (a scratch tracer, the reference mapped as `outline.js` maps it). From x 620 to 650 the two agreed within 2 units, but the reference's top stays near y 87 to 89 out to x 700 before it falls to the right end, where ours fell from x 650: ours lay 6 to 11 units lower from x 680 to 750. (That is also why the longer volume line had no room under our top edge.)
- **The right lobe has an upper shoulder** (`L.shoulder` in `shape.js`, in `bodySdf` in JS and in the generated GLSL): a circle fitted to the reference's top edge from x 700 to 780 (centre 680, 200, radius 112.5), cut off below y 200 so it cannot touch the lower edge, and blended into the body over 6 units (at 24 it bulged the top past the reference's by 4 to 7 units near the right end). The top edge now matches the reference's within 1.5 units from x 620 to 780 (before: up to 11 lower). Every lower edge is unchanged (`outline.js` prints the same bottoms), and the right side is unchanged at the beads' heights (794).
- **The volume line is 97 units, from x 645 to 742, at y 123.5** (`L.vol`), as the reference's lies (it was 86 units from 628 at y 127); over the reference, ours now sits on theirs from end to end. The speaker keeps 23 units before it, level with it. Round 34 had already made the part not yet played dim. The "VOLUME" label the main reference shows is still left out, as decided in round 15 (too small to read at the widget's size, in the lip's highlight, and two of the three references do without one).
- `test=passthrough`: 14 of 14 with the new outline. Seen as the opaque base over dark, light and white, refracting over dark and colourful windows, and with real covers (`mercury-still-round41.png`; its second row has the geometry over the reference).

## What round 42 changed (items 1 and 6: no dark box round the words)

Done on 16 November 2026, in the same session as rounds 34 to 41.

- **Seen and measured:** round 30 had put down "the plateau the words sit on is lighter, silvery glass in the reference and a dark box in ours". Mapped with `area-map.js` (x 270 to 520, y 150 to 250), the glass right round the words is dark in both (1s), and the means agree (ours 89,76,77, the reference's 90,74,74): the difference is not how dark but its shape. Ours sat the words in a dark rounded rectangle that hugged the text block, framed by the lit glass round it; the reference's dark has no such edge, and its glass is a little lighter toward the top behind the title. (The near-black strip just left of the title is round 27's dark glass beside the cover, and is meant.)
- **What made the box:** the calm that keeps the words legible (`calm` in the top face's block of `shaders.js`) followed the letters blurred by 10 units and saturated at 1.6, taking 80% of the reflections out in the shape of the text block. The broad pool under the words (`pools()`) already keeps the surface there level.
- **That calm is wide and gentle now** (`WORD_CALM`: the letters blurred by 16 units, at .75), so the box has no edge and the glass round the words reads as the rest does, lighter at the top. The text's own shadow (`under`) and the pool are unchanged, and the words read as before over dark, light and white desktops, over the colourful window refracting, and on every real cover.
- The means and the cuts are unchanged, as they should be: the round changes the shape of the dark round the words, not its amount.

## What round 43 changed (items 1 and 4: the right end's light)

Done on 16 November 2026, in the same session as rounds 34 to 42.

- **Mapped first** (`area-map.js box=730,120,800,244 step=4`). Above the diagonal edge the reference's lip curls over: its light lies 10 to 25 units above the edge, 6s to 9s at y 148 to 164, warm, with a darker line (2s to 4s) at the edge itself. Ours was dark there (1s), and its white band lay on the edge. Down the right side, just inside the silhouette, the reference's light breaks into the curl above, a dimmer stretch where the edge meets the side, and coral below; ours was one even white streak (7s and 8s from y 130 to 215), a wire. Below the edge the lower right was as bright as theirs but neutral (warmth 1 to 2 against 3 to 5).
- **The curl** (`END_CURL` and the `LIP_EDGE` block's `curl` in `shaders.js`): round the right end the edge's crest moves up the lip (6.5 units further, eased in from x 690 to 768: switched on over 28 units, it rose in a kink), wider and warmer toward its top; a dark line lies just above the edge, and the shade behind the roll gives way there; the edge's outer face is plainer.
- **The streak down the right side** (`END_KEY`) gives way where the lip's edge meets the side, is warmer, and is weaker (.6, was .9).
- **The lower right below the edge** is tinted and lit coral.
- Measured: the `end` cut's band now lies where the reference's does, `...1111677843434655...` against `...2233469972552111...` (round 42: `...1111147774477444...`), with the darker stretch after it. The right end's mean is 152,127,123 against the reference's 154,120,116 (round 42: 147,126,124), its warmth 1.36 against 1.82 (1.08).
- Only the light changed. Seen as the opaque base over dark, light and white, refracting over dark and colourful windows, and with real covers (`mercury-still-round43.png`).
- **Still short at the right end:** the reference's is a mass of lit glass, coral and white in broad shapes with crisp edges; ours is still made of bands laid along the edges, a step nearer.

## What round 44 changed (items 1 and 4: the upper pod)

Done on 16 November 2026, in the same session as rounds 34 to 43.

- **Measured first**, at a 3-unit step: the "silver streaks" round 39 listed between the bowls and along the pod's lower rim are fine detail the numbers barely show. In the gaps between the bowls ours was one level darker than the reference's (1s and 2s against 2s and 3s); along the pod's lower rim the two matched. The clear difference was the upper pod, under the lip's edge (`area-map.js box=530,148,770,180 part=pod`): ours was a bright stripe (6s and 7s) right under the edge with darker glass (2s and 3s) below it, mean 154,130,126; the reference's is an even warm mid-tone, 3s to 5s, mean 124,94,92. The stripe is the spectrum glowing through the fold, which answers the music by design.
- **The glow through the fold is calmer** (`FOLD_GLOW`, .6; it was 1 in effect). It still answers the music, from a lower level: this is visible while playing, and it is one number for the owner to turn back up.
- **The upper pod under it has a soft warm light** (`POD_UPPER`).
- Measured: the upper pod's mean is 130,105,102 against the reference's 124,94,92 (round 43: 154,130,126): 5s under the edge and 3s below. The whole pod 136,106,103 against 130,97,94.
- Only the light changed. Seen as the opaque base over dark, light and white, refracting over dark and colourful windows, and with real covers (`mercury-still-round44.png`).
- **Still short in the pod:** the reference's carries fine silver reflections that make it read as glass; ours is a smooth glow.

## What round 45 changed (items 1 and 4: the right end's curl as lit glass)

Done on 16 November 2026, in a fresh session (Opus 5.5).

- **Measured first**, across the lip's edge round the right end along its normal at six places (a scratch profiler: from 12 units on the pod side to 45 on the lip, the reference sampled through the `outline.js` mapping), and down the right side 4 units inside the silhouette. The reference keeps the edge's crest low and lit as far as x 745 (6s and 7s from 0 to 9 units up); its curl is a light of its own 15 to 30 units up, a hot core (9s) coral on its lower side and white on its upper, with a soft light spreading 20 units further up the lip; toward the side it turns up, so where the curl and the edge meet the right side the glass between them is dark (3s and 4s from y 152 to 176). Ours had lifted the crest itself into one flat white band of even width that ran on down to the side: 8s from y 164 to 176 there.
- **The crest stays on the edge** round the right end and dies away before the side; the dark line above the edge is a thin one (it put out ten units of the crest). **The curl is its own light** (`CURL_MASS` in `shaders.js`): a broad body and a thin hot core, coral below and white above, and a soft tail up the lip; its middle rises by 22 units from x 745 to the side.
- Measured: down the right side, y 164 to 176, ours now 2s to 5s against the reference's 3s and 4s (round 44: 8s); across the edge at x 745, from the edge up:

```
x 745  ref   |432556644689999976555444443333
x 745  r44   |643334433588877775211111256575
x 745  r45   |544445888887777777776653566763
```

- **Still short at the right end:** across the edge at x 772 ours is still bright (7s and 8s from 7 to 18 units up) where the reference's glass is dark; the curl is still a band, not the reference's broad coral mass. Left for later: the owner's three requests (rounds 46 to 48) came first.

## What round 46 changed (item 10, at the owner's word: the timeline's curve)

- **The owner, on 16 November 2026**, with an annotated picture of the widget and the flow reference: "Curve it gently downward beneath the album-cover area, then sweep it smoothly upward toward the right, following the reference's shallow flowing curve. This should create enough space to properly seat the cover."
- **Measured first:** the timeline followed column by column in both references (a scratch tracer that keeps to the line from its left end), in stage units. Both are level under the cover, rise in one smooth S to a crest under the waist (about x 510 to 530) and ease a few units down again under the buttons. Ours was one straight rise from 279 to 247.

```
x      206  235  264  293  322  351  381  410  439  468  497  526  555  584  613  642
main   270  272  271  268  265  261  256  252  248  245  243  243  245  248  251  253
flow   268  268  268  267  265  262  259  255  252  250  247  247  247  248  250  252
r45    279  278  276  274  272  270  268  266  264  262  260  258  256  253  251  248
r46    283  283  283  281  277  273  267  262  257  252  249  248  248  250  253  255
```

- **The timeline is that curve** (`L.seek` and `seekPath` in `shape.js`: level at y 283 to x 270, the references' S up to its crest at (520, 248), easing down to 255 at its right end). It lies a few units lower than the references' on the left because our cover does (the mapping puts our cover's lower edge about 8 units below theirs); the gap from the cover to the timeline is now the references' 30 units (it was 25 to 27). Everything reads the curve from `shape.js`: the line, its pool, the times at its ends, the hit test, the ripples.
- `test=passthrough`: 14 of 14.

## What round 47 changed (items 1, 4 and 9, at the owner's word: the shelf the cover sits on)

- **The owner:** "Smooth the rough ridge into a continuous, rounded glass shelf that flows into the surrounding body. The cover should look nestled into this soft, jelly-like surface, with convincing contact, depth, and subtle reflections." In both references the cover's lower edge sits just above a broad rounded ledge of glass: a dark contact line, one bright crest line 5 to 7 units below the cover, a soft front face in the album's colour falling to a darker strip, the timeline about 30 units below the cover; and the ledge runs straight on past the cover's lower right corner into the lip's edge under the words, as one line. Ours had the pocket's narrow sharp bank lit with two hard lines (round 26's ribbon under the lower left corner and the bank's own), curling up round the corner: the "rough ridge", read as a neon frame.
- **The shelf is geometry, in the soft form** (`SHELF` and `shelfAt` in `shaders.js`, in `base()`): a ridge 9 high and 8.5 wide (6 and 7 at first: too faint beside the flow reference's thick ledge), its crest 7 units below the cover, round the lower left corner and straight on past the lower right one; the pocket's sharp bank is mostly taken out under it (`detail()`). So what it mirrors is soft and unbroken.
- **Its light** (`SHELF_LIGHT`): one crest line, soft-sided, brightest under the lower left corner and never gone along its length; the floor's colour on its front face; and below that a darker strip where the timeline runs, as in both references. Round 26's hard ribbon and the shade beside it are taken out under the cover (they stay round the lower left corner of the ring).
- Seen beside both references under the cover and whole (`mercury-still-round47.png`, first two rows). Only the cover's surroundings changed; the cover, its pocket wall and the hit test did not.
- **Still short under the cover:** the shelf's crest is softer and paler than the references' (theirs is a crisp bright line with a darker strip below the front face); the bulb's lower left beside the cover is a white wash where both references are coral.

## What round 48 changed (items 1, 4 and 8, at the owner's word: the pod as a soft pocket)

- **The owner:** "Smooth the oval enclosure into a softly sculpted glass pocket. Its edges and reflections should flow naturally into the main body"; and of the lip's edge over it, which they marked in red, "the ridge that we have now is very rough, whereas it's smooth and curvy in the reference image". Seen beside both references: theirs is one thick round roll of glass over a pod with a rounded left end and a soft rolled lower rim. Ours drew three hard lines over the pod (the edge's outer face, a dark seam, the crest), because the lip's quarter round stood upright over a pod that dropped away at once; and the pod's left end, where the lip's edge meets its lower rim, was a wedge (9 units tall at x 520, 51 at x 540).
- **The pod is one soft pocket** (`POD_SOFT` and `podDepth` in `shaders.js`): its depth is worked out from one rounded distance to its boundary, the lip's edge and its lower rim joined round at the left end, and it falls from that boundary over 10 units, level at both ends. The old form is kept left of the pod, in the waist.
- **The lip's roll over the pod is round and 13 units wide** (7 elsewhere), its foot leaning into the pocket; its strokes lie further out across it with soft sides, and the fine dark seam is all but gone there.
- The pod's lower-rim light and its upper light are a little lower (`POD_LIGHT.x` .1, `POD_UPPER` .04): the softer rims spread them a level brighter.
- Measured with `area-map.js part=pod` (x 530 to 780, y 140 to 250): the pod's mean colour is 138,107,104 against the reference's 127,94,91 (round 47: 147,118,115); its middle was already the reference's 2s and 3s, and its upper and lower rims are now within a level of theirs. Seen beside both references (`mercury-still-round48.png`, first two rows), as the opaque base over dark, light and white, refracting over dark and colourful windows, and with real covers.
- Only the light and the pod's form in the shader changed; the outline, the bowls and the hit test did not.
- **Still short in the pod:** the reference's ridge over the pod is a brighter silver roll with a crisp highlight along it; the bowls' crescents are thicker and whiter than the references' thin coral rims; the pod's glass has none of the references' fine silver reflections.

## What round 49 changed (items 1, 4 and 9, at the owner's word: the cover's seat, its turn, the roll over the pod)

- **The roll over the pod**, measured across the edge at x 580 to 700 against the flow reference: theirs has dark glass at the edge and one crisp white stroke (8s and 9s, about 6 units wide) along the roll's crest, dark glass above it; ours had a broad band of 6s and 7s on the roll's face and no highlight (the crest's stroke swells only at the waist and the ends, so it was all but out over the pod). Now one unbroken highlight lies along the crest over the pod, 10.5 units up the edge, with shade behind it and a little on the face below (`POD_RIDGE` in `shaders.js`): across the edge at x 610 ours now reads `|666668864323...` against the flow reference's `|111111148985122...`.
- **The owner, on round 47's shelf:** "It should be the same exact line that you're working on smoothing out that runs underneath the artist name and title and up over the buttons. That line should run and should be what the album cover sits on. The album cover should look a little bit heavy squishing into it." And: "pushing the right points of the album cover back to make it look like it's facing a little bit more to the right ... maybe 10 to 15 [degrees]".
- **The lip's edge runs on under the cover as its seat** (`L.seat` and `runY` in `shape.js`, in `archSdf` and its GLSL): from x 305 to 255 it turns from the run under the words to follow the cover's tilted lower edge 3.5 units below it, sagging 2.5 more under the cover's middle where its weight presses (4.3 to 6 units below the cover's edge from x 130 to 250), and on to the bulb's rim at x 92 to 128, where it fades in (`lipFade`; it melted away beside the cover, from x 266 to 304). The cover so rests on the edge's roll. It is lit as the rest of the edge is, brightest under the cover's lower left. Round 47's shelf of its own is taken out; under the cover the pocket's sharp bank and round 26's hard ribbon stay out.
- **The cover presses deeper** (`press` 6 where it was 4) and the glass it pushes aside stands up a little (1.5).
- **The cover is turned 12 degrees about its upright axis, its right side back** (`L.cover.yaw` and `persp`, in `tilePlane` in `shape.js` and in the shader, so the hit test, the picture and the tile agree): its right edge is drawn about 5% shorter than its left, as the flow reference's (its left edge 272 px, right 258 px); the tile's thickness now shows on its left side, which comes toward the eye (`uTile` in `mercury.js`).
- `test=passthrough`: 14 of 14, the cover included. Seen whole and close beside the flow reference (`mercury-still-round49.png`).
- **Still short:** the seat is a thin bright line, where the flow reference's is the front edge of a thick glossy ledge; at the cover's lower right corner the edge makes a small hook where it turns from the run to the cover; the cover's turn is slight to the eye.

## What changed on 14 November 2026 at the owner's word (the cursor's light; item 12 in part)

- The owner found the light round the cursor "far too bright ... essentially completely white" and the title hard to read under it. Its core is now .55 (was 3.2) and its soft light .12 (was .2), it lies under the words, and words turn dark where it is bright behind them (`CURSOR_LIGHT`, `WORD_FLIP`). `mercury-cursor-light.png` shows before and after.
- Item 12 (the dimple reads as a button) is not otherwise touched: the dimple and its rings are the same shape, only lit less.

## The gaps, worst first

Line numbers are `prototypes/mercury/shaders.js` at commit `62869cb` unless another file is named. Items 1 and 3 were worked on in round 11; their line numbers are of historical interest only.

### 1. Everything is outlined; nothing has form (depth and thickness): mostly fixed in round 11

Left to do after round 16 (which widened the rims of the lobes to 25 units and put light inside them): the light on the rims is soft where the references' is crisp, a glow where they have the sharp reflection of a lamp; along the whole lower silhouette the underside shows as one line of the album's colour of even width, with a hairline of dark between it and the lit lip, which reads as an outline; and the wall's depth is the same everywhere it shows. The original finding follows.

A white line of even width runs round the silhouette, round the cover tile, round each button five or six times, and three or four times in parallel under the lower edge (top-face rim, underside edge, glow). The references have no outlines at all. Their edges are wide rolled lips where a highlight swells, thins and disappears, and the thickness is a shaded wall you can see into. Ours reads as a vector sticker; theirs as a photographed object. This is the largest gap and most of the other items are downstream of it.

Fix: remove the explicit rim line (the `lit` floor of .28 and the `pow(1 - ndv, 16)` term, 443–449), the bright line on the underside's lower edge (577) and the tile strokes (589, 608). Give the edge a real profile about 40 units wide whose normal sweeps from up to sideways, so a broad light makes a highlight with width that varies along the contour. Give the underside its own curved normal and shade it from the room instead of a flat colour plus a line. Make the wall's height vary round the contour (deep at the front, none at the back) so it reads as a view from slightly above, as in the references, instead of a copy of the outline shifted down 14 units.

### 2. Whatever is behind it shows through the body (glass transparency): fixed in round 12; refraction is now to be the look

**The owner's decision, 13 November 2026, as relayed by the session that manages this work:** asked "Should live refraction stay as an optional switch, off by default?", they answered **"Make it the look"**. They chose it after being told what comes with it: the widget disappears from every screenshot, recording and screen share, and the player captures the screen the whole time the widget is visible. This reverses the recommendation further down, which is kept for the record.

What follows from it (done in round 18 except the last point's tests; see "What round 18 changed"):

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

### 8. Buttons and the control pod: buttons fixed in round 14, the utility dishes made beads beside the end in round 32 (the owner's design)

The original finding follows.

Each button is a stack of five or six concentric rings with a pink ring at the bottom, like a camera lens. The references' buttons are single smooth dark dimples with one soft rim light and a faint coral glow underneath. Glyph shapes are right but they glow. The open-app and hide dishes do appear on hover, but they are about 21 px across at 100% (13 px at the small size) with 8 px glyphs, jammed between the next button and the edge.

Fix: one concave bowl with one rounded shoulder per button; a floor on reflection softness inside the dishes so thin lights cannot draw rings; darker glass in the dish; one graded rim highlight. Utility dishes: radius 8.5 → about 12 units, moved clear of the next button, or moved to the right-click menu if they cannot be made comfortable at the small size.

### 9. Cover tile: partly fixed in round 17

Left to do after round 19 (which made the wall): the wall as one piece with the bulb's rim on the left and above; hotter, sharper highlights and deeper darks in it; the picture's colours plainer in it; see "What round 19 changed". The original finding follows.

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
