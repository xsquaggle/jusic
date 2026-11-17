"""
Mercury in 3D, phase 1: the widget as one solid of thick, clear glass, modelled over the main reference
(design/references/widget-mercury.png) in the camera view, then rendered in Cycles.

How the solid is made (no 2D outline is inflated):
  - every roll is a real sweep: a tube along a 3D path whose radius, depth, squash and tilt change along it
    (the outer rim, the ridge); each is meshed and turned into a narrow-band distance field with OpenVDB;
  - the sheet over the buttons is a thick lofted surface from the rim to the ridge, bowed forward, so it is
    a real overhang with a gap (the fold) behind its lower edge;
  - between the rolls a membrane closes the glass: its front and back are soap films stretched over the rolls
    (Poisson solves with the rolls as pins), sagging back into the words' hollow and the channel, bulging out
    behind; the pocket's floor is pinned under the cover;
  - all parts are joined with smooth (polynomial) minimums into one watertight field, the wells are smooth
    subtractions, and OpenVDB meshes the result.

Coordinates: everything is authored in the reference's pixels. u right, v down, d = depth in pixels (negative
toward the camera). Blender local axes: X right, Z up (screen up), -Y toward the camera; 1 unit = 100 px. The
model and its camera sit under one root tilted back by TILT, so the camera looks slightly down at the glass
while the studio (floor, overhead light) stays level.

In the live Blender:  p = r'<repo>/tools/mercury3d/build.py'
                      exec(compile(open(p).read(), p, 'exec'), {'__file__': p, 'MERCURY_ARGS': {}})
In the background:    blender -b --factory-startup -P tools/mercury3d/build.py -- render out=<png> [cover=<img>]
                      [samples=256] [save=<blend>] [transparent] [zebra] [backdrop]
"""
import bpy, bmesh, math, os, sys, time, json
import numpy as np
from mathutils import Vector, Matrix, Euler

T0 = time.time()
def log(*a):
    print('[mercury3d %5.1fs]' % (time.time() - T0), *a, flush=True)

# ------------------------------------------------------------------------------------------------ paths & args
try:
    HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:
    HERE = os.path.join(os.getcwd(), 'tools', 'mercury3d')
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW = os.path.join(REPO, 'design', 'captures', 'raw', 'mercury3d')
REF = os.path.join(REPO, 'design', 'references', 'widget-mercury.png')
TEST_COVER = os.path.join(REPO, 'prototypes', 'mercury', 'covers', 'silver-current.jpg')
os.makedirs(RAW, exist_ok=True)

_argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ARGS = dict(a.split('=', 1) for a in _argv if '=' in a)
FLAGS = set(a for a in _argv if '=' not in a)
ARGS.update(globals().get('MERCURY_ARGS', {}))           # the live session can pass options this way
FLAGS |= set(globals().get('MERCURY_FLAGS', ()))

# ------------------------------------------------------------------------------------------------ frame
W, H = 1586, 992            # the reference's size; the render matches it
CX, CY = 793.0, 496.0       # the image centre sits on the root's origin
S = 0.01                    # Blender units per reference pixel
TILT = math.radians(15.0)   # the camera looks this far down at the glass
VOX = float(ARGS.get('vox', 2.0))   # voxel size in pixels
U0, U1 = 0.0, 1586.0        # the field's box in pixels: u, v, depth
V0, V1 = 180.0, 780.0
D0, D1 = -120.0, 230.0

def L(u, v, d):
    """Reference pixel (u, v) at depth d (pixels) -> root-local Blender coordinates."""
    return Vector(((u - CX) * S, d * S, (CY - v) * S))

# ------------------------------------------------------------------------------------------------ the shape
# The silhouette, traced on the reference (top edge left to right, round the right end to the tail tip, then
# the bottom edge back to the left).
SIL = [
    (24, 365), (46, 308), (66, 288), (86, 272), (106, 256), (126, 242), (146, 230), (166, 224), (186, 220),
    (206, 216), (226, 214), (246, 211), (266, 209), (286, 208), (306, 209), (326, 211), (346, 214), (366, 217),
    (386, 220), (406, 225), (426, 237), (446, 254), (466, 271), (486, 287), (506, 303), (526, 318), (546, 333),
    (566, 347), (586, 360), (606, 371), (626, 381), (646, 390), (666, 397), (686, 403), (706, 409), (726, 413),
    (746, 416), (766, 418), (786, 420), (806, 421), (826, 420), (846, 418), (866, 414), (886, 407), (906, 398),
    (926, 388), (946, 378), (966, 366), (986, 353), (1006, 341), (1026, 331), (1046, 323), (1066, 317),
    (1086, 311), (1106, 303), (1126, 294), (1146, 286), (1166, 278), (1186, 271), (1206, 264), (1226, 259),
    (1246, 256), (1266, 253), (1286, 251), (1306, 251), (1326, 252), (1346, 254), (1366, 257), (1386, 262),
    (1406, 268), (1426, 277), (1446, 288), (1466, 302), (1486, 320), (1506, 343), (1526, 372), (1541, 405),
    (1551, 440), (1556, 470), (1554, 500), (1547, 528), (1532, 553),                       # the tail tip
    (1505, 558), (1475, 566), (1448, 580), (1422, 603), (1398, 626), (1374, 645), (1350, 656), (1325, 662),
    (1300, 664), (1275, 663), (1250, 659), (1225, 652), (1200, 645), (1175, 638), (1150, 632), (1125, 627),
    (1100, 623), (1075, 622), (1050, 622), (1025, 623), (1000, 625), (975, 629), (950, 634), (925, 641),
    (900, 648), (875, 655), (850, 662), (825, 668), (800, 674), (775, 682), (750, 690), (725, 698), (700, 706),
    (675, 714), (650, 721), (625, 726), (600, 731), (575, 735), (550, 739), (525, 742), (500, 743), (475, 744),
    (450, 744), (425, 743), (400, 741), (375, 738), (350, 734), (325, 729), (300, 722), (275, 715), (250, 707),
    (225, 697), (200, 684), (175, 667), (150, 646), (125, 622), (100, 595), (80, 566), (62, 532), (48, 495),
    (36, 455), (28, 412),
]
TIP = (1532, 553)
TIP_INDEX = SIL.index(TIP)  # the tail tip stays sharp
TIP_R = 9.0                 # its radius: crisp, but thick enough for the voxels

# The rim: the outer roll, inset from the silhouette by its radius. Stations at points of the silhouette:
# radius r in the picture's plane, centre depth d, squash sq (depth radius / r), tilt (degrees).
RIM_STATIONS = [
    # (u, v) on SIL      r    d    sq   tilt
    # (The model pass, 17 November: the outer roll fatter wherever there is room and rounder in section (squash near
    # 1: a deep, narrow roll turns its face quickly and stacks the studio's strips into tight bunches of thin lines),
    # and joined to the body more softly (MEM k_rim). Slim only where the reference's edge is slim: over the end of
    # the title and past the cover's top right corner.)
    ((24, 365),          62,  -4, 1.10,  0),   # the bulb's left end: a thick ring
    ((48, 495),          56,  -2, 1.08,  0),
    ((80, 566),          36,   2, 1.05,  0),   # passes close to the cover's lower left corner
    ((125, 622),         44,   6,  .95,  0),
    # The lower band: one fat roll whose broad crest carries the timeline and the times (its centre line inset
    # from the bottom edge to just under the timeline), shallower than wide, set back so the ridge stays proud.
    # (Its crest a little below the times and the timeline: the live studio lays one hot line just above every
    # roll's crest, and the words sit on the calm upper flank above it.)
    ((200, 684),         60,  18,  .80,  0),   # the bulb's fat bottom
    ((350, 734),         84,  24,  .62,  0),
    ((450, 744),         92,  26,  .58,  0),
    ((650, 721),         82,  22,  .62,  0),
    ((850, 662),         60,  14,  .74,  0),   # the lower band under the waist
    ((1050, 622),        40,   8,  .90,  0),
    ((1300, 664),        52,  12,  .82,  0),   # under the buttons (the time on its upper flank)
    ((1398, 626),        28,   6,  .88,  0),   # (thinner: its crest stays below the time until past it)
    ((1475, 566),        20, -14,  .95,  0),   # the band's end, under the tail
    (TIP,                 5, -38,  .95,  0),   # the tail tip, curled forward
    ((1547, 528),        16, -22,  .95,  0),
    ((1556, 470),        32,   4,  .98,  0),   # round the right end
    ((1506, 343),        32,  -8, 1.00,  0),
    ((1326, 252),        21, -24, 1.05,  0),   # the right lobe's top: the sheet hangs from here (clear of the volume)
    ((1126, 294),        22, -20, 1.08,  0),
    ((946, 378),         24,  -2, 1.10,  0),   # where the twist nearly touches it
    ((886, 407),         12, -12, 1.00,  0),
    ((806, 421),          8, -16, 1.00,  0),   # the waist's top edge, over the end of the title: slim and calm
    ((726, 413),         10, -14, 1.00,  0),
    ((566, 347),         22,  -4, 1.12,  0),
    ((466, 271),         18,   2, 1.20,  0),   # past the cover's top right corner: thin
    ((406, 225),         28,   0, 1.15,  0),
    ((286, 208),         32,   0, 1.12,  0),   # the bulb's top
    ((146, 230),         36,   0, 1.12,  0),
    ((86, 272),          48,   0, 1.12,  0),
]

# The ridge: the owner's trace, start under the cover's lower left, the twist, the sheet's edge, the tail tip.
# u, v, depth, radius, squash, tilt
RIDGE = [
    (128, 585, 6, 10, .9, 0),
    (165, 579, -8, 16, .9, 0),
    (188, 577, -14, 19, .9, 0),
    (312, 575, -16, 20, .9, 0),
    (436, 575, -16, 20, .9, 0),
    (559, 570, -16, 20, .9, 0),
    (683, 561, -18, 21, .9, 0),
    (766, 540, -22, 23, .9, 0),
    (848, 497, -28, 26, .9, 0),
    (920, 447, -34, 27, .9, 0),
    (982, 400, -40, 26, .9, 0),
    (1044, 365, -38, 24, .9, 0),
    (1116, 354, -38, 22, .9, 0),
    (1219, 354, -38, 22, .9, 0),
    (1322, 367, -38, 21, .9, 0),
    (1415, 392, -38, 20, .9, 0),
    (1481, 426, -50, 18, .9, 0),
    (1516, 476, -44, 14, .9, 0),
    (1528, 522, -40, 10, .9, 0),
    (1531, 551, -38, 9, .9, 0),
]
# Just past the title the ridge's soft join laid the studio's hot line on the foot of the title's last letter: the
# twist's start eased a few px down and right (within the trace's own width; the reference's crest runs there too).
TWIST_DV = float(ARGS.get('twist_dv', 16.0)); TWIST_DU = float(ARGS.get('twist_du', 6.0))
RIDGE = [(u + TWIST_DU * math.exp(-((u - 800.0) / 60.0) ** 2), v + TWIST_DV * math.exp(-((u - 800.0) / 60.0) ** 2))
         + tuple(r) for (u, v, *r) in RIDGE]
CHANNEL_CENTRE = (1240, 520)  # a point inside the channel under the sheet's lip
LIP = dict(attach=0.35, gap=8.0, drop=16.0)   # the sheet meets the lip this far toward its crest; the fold under it

# The cover: a square slab resting on the ridge, tilted back so its top sinks deeper into the pocket.
# The pocket (the model pass): carved after every roll is on, so it is round on every side. Clearance round the cover,
# depth behind its back, and the rounding of its lip (a broad smooth maximum: no straight wall, no flat ledge).
POCKET = dict(margin=5.0, behind=4.0, k=float(ARGS.get('pocket_k', 24.0)))
# The ring of glass wrapping the cover: a rounded roll round the cover's outline (a rounded-square torus), standing
# in front of the cover's face and joined softly to the body; the pocket then carves its inside, so the lip that
# meets the cover's edges is the ring's own rounded inner side.
# (Off by default: where it met the words' hollow it raised two thin spikes; the pocket's own broad rounding wraps
# the cover. ring_r=18 turns it on.)
RING = dict(off=float(ARGS.get('ring_off', 14.0)), r=float(ARGS.get('ring_r', 0.0)), sq=1.0,
            front=float(ARGS.get('ring_front', 14.0)), k=float(ARGS.get('ring_k', 20.0)))
COVER = dict(cu=295.0, bottom=572.0, side=302.0, tilt=4.0, d_front=4.0, thick=8.0, corner=28.0, dome=3.0)

# The button wells in the channel: centre, radius on the surface, depth. (The model pass: each a flat-floored dish,
# its floor square to the camera so the middle stays dark, its wall turning up in a round fillet that gathers the
# light into the rim; no bowl to mirror a bright U under the icon.)
WELLS = [(1077, 467, 58, 14), (1237, 460, 82, 16), (1392, 467, 58, 14)]
WELL_FILLET = float(ARGS.get('well_fillet', 18.0))

WELL_LIP = dict(r=float(ARGS.get('lip_r', 12.0)), out=2.0, raise_=0.0, k=float(ARGS.get('lip_k', 14.0)))
WELL_LIP['raise'] = 4.0
# The glass behind the words calm: the hollow's front eased toward a plane facing the camera, tipped a few degrees
# down (it mirrors the studio's dark band, between the floor's glow and the key strip), over the title and artist.
# Each region: its box, how far below the silhouette's top edge and above the ridge it keeps, the feather.
# depth: how far in front of the front's own mean depth the plane sits (negative: toward the camera; a shallow hollow
# whose edges rise gently to the rolls round it instead of a deep tray with walls).
CALM = [dict(name='words', u=(436.0, float(ARGS.get('calm_u1', 900.0))), v=(416.0, 560.0), top=float(ARGS.get('calm_top', 3.0)), bottom=float(ARGS.get('calm_bottom', 0.0)), feather=16.0, depth=0.0, round=6.0),
        dict(name='volume', u=(1176.0, 1466.0), v=(280.0, 352.0), top=40.0, bottom=10.0, feather=14.0, depth=0.0, round=2.0)]
CALM_TILT = float(ARGS.get('calm_tilt', 1.0))          # degrees up (negative: down); the dark band is -8.5..+3
CALM_AMOUNT = float(ARGS.get('calm', 1.0))
# The fold under the sheet's lip: a groove carved along under the ridge's free part (offset toward the channel,
# set back behind the ridge's centre), so the lip truly overhangs and a narrow dark gap runs beneath it.
FOLD = dict(r=13.0, off=4.0, back=10.0, k=6.0)

# Membrane: pressures (negative sags back, away from the camera) and smoothing.
MEM = dict(p_front=float(ARGS.get('p_front', -0.0015)), p_channel=-0.0022, p_sheet=0.0012, k_rim=float(ARGS.get('k_rim', 30.0)),
           k_ridge=float(ARGS.get('k_ridge', 20.0)), k_sheet=14.0, k_well=10.0)

# The back: how far behind the rim's centre the glass reaches (by u), and how far in from the rim it gets there.
BACK = [(0, 130), (430, 130), (650, 80), (850, 60), (1000, 60), (1150, 55), (1440, 55), (1560, 25)]
BACK_REACH = float(ARGS.get('back_reach', 90.0))

STUDIO_GAIN = dict(refl=2.0, refr=2.0)   # overall strengths of the reflected and the seen-through studio
# The studio (radiances, linear): see make_env. Override any with st_<name>=<value>.
# Elevations (deg) of the soft strips in front. A face turned straight to the camera mirrors the studio at about
# TILT (15 deg) up: that height stays dark, so flat faces read dark; a face tipped up by a degrees mirrors 15 + 2a.
FILL_BANDS = [(28.0, 36.0), (46.0, 54.0)]
FILL_HALF_AZ = 55.0
CARD = dict(half_az=60.0, el=(-48.0, 4.0), depth=0.92)   # the black card behind, as the light through the glass sees it
STUDIO = dict(room=0.012, floor=2.0, over=6.0, side=5.0, fill=3.0, back=3.0, key=220.0, key2=60.0, rim=100.0, vert=120.0,
              low=4.0, strip_soft=0.05,
              # what light sees after passing through the glass, as a share of the above
              t_room=1.0, t_floor=0.5, t_over=0.5, t_side=0.6, t_fill=0.15, t_back=0.25)

# The sheet over the buttons: from the rim (top) to the ridge (its rolled lower edge).
SHEET = dict(rim_from=(986, 353), rim_to=TIP, ridge_from_u=982.0, half=13.0, bow=-14.0)

# ------------------------------------------------------------------------------------------------ curves
def catmull(P, closed=False, step=3.0):
    """Uniform Catmull-Rom through rows of P (first three columns u, v, d), every attribute splined, then
    resampled by arc length (in u, v, d) every `step` pixels."""
    P = np.asarray(P, float)
    if closed:
        pad = np.vstack([P[-1], P, P[0], P[1]])
    else:
        pad = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(pad) - 2):
        p0, p1, p2, p3 = pad[i - 1], pad[i], pad[i + 1], pad[i + 2]
        n = max(4, int(np.linalg.norm(p2[:3] - p1[:3]) / 0.75))
        t = np.linspace(0, 1, n, endpoint=False)[:, None]
        out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                          + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[0][None] if closed else P[-1][None])
    C = np.vstack(out)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C[:, :3], axis=0), axis=1))])
    m = max(3, int(s[-1] / step) + 1)
    si = np.linspace(0, s[-1], m)
    R = np.stack([np.interp(si, s, C[:, j]) for j in range(C.shape[1])], 1)
    if closed:
        R = R[:-1]
    return R

def smooth_loop(P, keep=(), it=6):
    P = np.asarray(P, float).copy()
    for _ in range(it):
        Q = P.copy()
        Q[1:-1] = 0.25 * P[:-2] + 0.5 * P[1:-1] + 0.25 * P[2:]
        Q[0] = 0.25 * P[-1] + 0.5 * P[0] + 0.25 * P[1]
        Q[-1] = 0.25 * P[-2] + 0.5 * P[-1] + 0.25 * P[0]
        for k in keep:
            Q[k] = P[k]
        P = Q
    return P

def loop_gauss(col, sig):
    k = np.arange(-int(3 * sig), int(3 * sig) + 1)
    g = np.exp(-0.5 * (k / sig) ** 2); g /= g.sum()
    pad = np.concatenate([col[-len(k):], col, col[:len(k)]])
    return np.convolve(pad, g, mode='same')[len(k):len(k) + len(col)]

def rim_path():
    """The rim's centre line: the silhouette (dense, smoothed), inset along its inward normal by the radius."""
    sil = np.array(SIL, float)
    sil = smooth_loop(sil, keep=(TIP_INDEX,), it=3)
    n = len(sil)
    # stations -> per silhouette point attributes (interpolated along the loop's arc length)
    seg = np.linalg.norm(np.roll(sil, -1, 0) - sil, axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])           # s[n] closes the loop
    st = sorted((SIL.index(tuple(p)) if tuple(p) in SIL else int(np.argmin(((np.array(SIL) - p) ** 2).sum(1))),
                 *rest) for p, *rest in RIM_STATIONS)
    ss = [s[i] for i, *_ in st] + [s[st[0][0]] + s[n]]
    vals = [list(v) for _, *v in st] + [list(st[0][1:])]
    if st[0][0] != 0:            # wrap so index 0 is covered: interpolate on an unrolled arc length
        ss = [ss[-2] - s[n]] + ss
        vals = [vals[-2]] + vals
    attr = np.stack([np.interp(s[:n], ss, [v[j] for v in vals]) for j in range(4)], 1)
    # dense loop through the silhouette points, with attributes
    P = np.hstack([sil, np.zeros((n, 1)), attr])        # u, v, 0, r, d, sq, tilt
    D = catmull(P, closed=True, step=1.0)
    # the stations' values change smoothly along the loop (no kinks in the roll where a station sits)
    sig = float(ARGS.get('rim_sigma', 28.0))
    k = np.arange(-int(3 * sig), int(3 * sig) + 1)
    g = np.exp(-0.5 * (k / sig) ** 2); g /= g.sum()
    tip = int(np.argmin(((D[:, :2] - np.array(TIP)) ** 2).sum(1)))
    for j in (3, 4, 5, 6):
        D[:, j] = loop_gauss(D[:, j], sig)
    # the outline itself smoothed (a hand trace wobbles), less so toward the tail tip, which stays sharp
    dt = np.minimum(np.abs(np.arange(len(D)) - tip), len(D) - np.abs(np.arange(len(D)) - tip)).astype(float)
    keep = np.clip(1.0 - dt / 60.0, 0, 1) ** 2
    for j in (0, 1):
        D[:, j] = D[:, j] * keep + loop_gauss(D[:, j], float(ARGS.get('sil_sigma', 12.0))) * (1 - keep)
    # keep the tail tip fine: the radius narrows to it whatever the smoothing did
    D[:, 3] = np.minimum(D[:, 3], TIP_R + dt * 0.3)
    # inward normal in the image plane (the loop runs clockwise on screen: top edge left to right)
    t = np.roll(D[:, :2], -1, 0) - np.roll(D[:, :2], 1, 0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-9
    nin = np.stack([-t[:, 1], t[:, 0]], 1)               # v is down: (-ty, tx) points inward for this winding
    # check the winding: the inward normal must point toward the loop's centroid on average
    c = D[:, :2].mean(0)
    if np.mean(np.sum((c - D[:, :2]) * nin, 1)) < 0:
        nin = -nin
    r = D[:, 3]
    # where the outline bends sharply outward (the tail tip), inset no further than its radius of curvature,
    # or the centre line would loop over itself
    dtan = np.roll(t, -1, 0) - np.roll(t, 1, 0)
    kap = np.linalg.norm(dtan, axis=1) / 2.0
    convex = np.sum(dtan * nin, 1) > 0
    inset = np.where(convex, np.minimum(r, 0.8 / np.maximum(kap, 1e-6)), r)
    inset = loop_gauss(inset, 3.0)
    cu = D[:, 0] + nin[:, 0] * inset
    cv = D[:, 1] + nin[:, 1] * inset
    out = np.stack([cu, cv, D[:, 4], r, D[:, 5], D[:, 6]], 1)   # u, v, d, r, sq, tilt
    # the inset bunches and wobbles on the inside of bends: smooth it (not at the tip)
    for j in (0, 1):
        out[:, j] = out[:, j] * keep + loop_gauss(out[:, j], 10.0) * (1 - keep)
    return catmull(out[::3], closed=True, step=3.0), D

def ridge_path():
    return catmull(np.array(RIDGE, float), closed=False, step=3.0)

# ------------------------------------------------------------------------------------------------ meshes
def px(u, v, d):
    """Pixel space used for the fields: x = u, y = depth, z = V1 - v (so z points up, right handed)."""
    return np.stack([u, d, V1 - v], -1)

def tube_mesh(Smp, closed=False, nseg=40, caps=True):
    """A closed tube along samples (u, v, d, r, sq, tilt): an ellipse of radius r in the image plane and r*sq in
    depth, rotated by tilt, swept along the path. Rounded caps at open ends. Returns (points, quads, tris)
    in field pixel space."""
    Smp = np.asarray(Smp, float)
    C = px(Smp[:, 0], Smp[:, 1], Smp[:, 2])
    r, sq, tl = Smp[:, 3], Smp[:, 4], np.radians(Smp[:, 5])
    if closed:
        T = np.roll(C, -1, 0) - np.roll(C, 1, 0)
    else:
        T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    Dp = np.array([0.0, 1.0, 0.0])
    N = Dp[None] - (T @ Dp)[:, None] * T
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    B = np.cross(T, N)
    ph = np.linspace(0, 2 * np.pi, nseg, endpoint=False)
    def ring(i, scale=1.0, back=0.0):
        cb = np.cos(ph) * r[i] * scale
        cn = np.sin(ph) * r[i] * sq[i] * scale
        b2 = cb * np.cos(tl[i]) - cn * np.sin(tl[i])
        n2 = cb * np.sin(tl[i]) + cn * np.cos(tl[i])
        return C[i][None] + b2[:, None] * B[i][None] + n2[:, None] * N[i][None] + back * T[i][None]
    rings = [ring(i) for i in range(len(C))]
    pts = list(rings)
    m = len(C)
    quads = []
    def link(a, b):          # ring index a -> ring index b
        for k in range(nseg):
            k2 = (k + 1) % nseg
            quads.append((a * nseg + k, a * nseg + k2, b * nseg + k2, b * nseg + k))
    for i in range(m - 1):
        link(i, i + 1)
    tris = []
    if closed:
        link(m - 1, 0)
    elif caps:
        for end, sgn in ((0, -1.0), (m - 1, 1.0)):
            prev = end
            base = len(pts)
            steps = 4
            idx_prev = end
            for k in range(1, steps + 1):
                a = k / (steps + 1) * np.pi / 2
                pts.append(ring(end, math.cos(a), sgn * r[end] * math.sin(a)))
                cur = len(pts) - 1
                if sgn > 0:
                    link(idx_prev, cur)
                else:
                    link(cur, idx_prev)
                idx_prev = cur
            apex = C[end] + sgn * r[end] * T[end]
            pts.append(np.repeat(apex[None], nseg, 0))   # a degenerate ring at the apex
            cur = len(pts) - 1
            if sgn > 0:
                link(idx_prev, cur)
            else:
                link(cur, idx_prev)
    P = np.vstack(pts).astype(np.float32)
    return P, np.array(quads, np.uint32)

def skin_mesh(G, half):
    """A thick surface: grid G (ns, nt, 3) in field pixel space and half thickness (ns, nt). Returns a closed
    slab (front, back and the four borders)."""
    ns, nt, _ = G.shape
    du = np.gradient(G, axis=0); dv = np.gradient(G, axis=1)
    nrm = np.cross(du, dv); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True) + 1e-12
    A = G + nrm * half[..., None]
    Bk = G - nrm * half[..., None]
    P = np.vstack([A.reshape(-1, 3), Bk.reshape(-1, 3)]).astype(np.float32)
    off = ns * nt
    idx = lambda i, j: i * nt + j
    q = []
    for i in range(ns - 1):
        for j in range(nt - 1):
            q.append((idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)))
            q.append((off + idx(i, j), off + idx(i, j + 1), off + idx(i + 1, j + 1), off + idx(i + 1, j)))
    for i in range(ns - 1):       # borders j = 0 and j = nt-1
        for j in (0, nt - 1):
            q.append((idx(i, j), off + idx(i, j), off + idx(i + 1, j), idx(i + 1, j)))
    for j in range(nt - 1):       # borders i = 0 and i = ns-1
        for i in (0, ns - 1):
            q.append((idx(i, j), idx(i, j + 1), off + idx(i, j + 1), off + idx(i, j)))
    return P, np.array(q, np.uint32)

# ------------------------------------------------------------------------------------------------ fields
NX = int((U1 - U0) / VOX) + 1
NY = int((D1 - D0) / VOX) + 1
NZ = int((V1 - V0) / VOX) + 1

def level_set(P, quads, half_width=14.0):
    import openvdb as vdb
    xf = vdb.createLinearTransform(voxelSize=VOX)
    g = vdb.FloatGrid.createLevelSetFromPolygons(P, quads=quads, transform=xf, halfWidth=half_width)
    a = np.empty((NX, NY, NZ), np.float32)
    a.fill(g.background)
    g.copyToArray(a, ijk=(int(round(U0 / VOX)), int(round(D0 / VOX)), 0))
    return a

def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * h * k * (1.0 / 6.0)

def smax(a, b, k):
    return -smin(-a, -b, k)

def poly_inside(P, X, Y):
    """Even-odd point in polygon for grids X, Y."""
    inside = np.zeros(X.shape, bool)
    n = len(P)
    for i in range(n):
        x1, y1 = P[i]; x2, y2 = P[(i + 1) % n]
        if y1 == y2:
            continue
        c = ((y1 > Y) != (y2 > Y)) & (X < (x2 - x1) * (Y - y1) / (y2 - y1) + x1)
        inside ^= c
    return inside

def nearest(PTS, VAL, X, Y, chunk=4000):
    """For each grid point, the distance to the nearest of PTS and that point's value."""
    flat = np.stack([X.ravel(), Y.ravel()], 1)
    dist = np.empty(len(flat)); val = np.empty(len(flat))
    for a in range(0, len(flat), chunk):
        q = flat[a:a + chunk]
        d2 = ((q[:, None, :] - PTS[None, :, :]) ** 2).sum(2)
        j = d2.argmin(1)
        dist[a:a + chunk] = np.sqrt(d2[np.arange(len(q)), j]); val[a:a + chunk] = VAL[j]
    return dist.reshape(X.shape), val.reshape(X.shape)

def poisson(fixed_mask, fixed_val, p, cell, iters):
    """Solve lap(f) = p on a grid with cells `cell` px; fixed cells keep their values. Coarse to fine."""
    def down(a, how):
        h2, w2 = a.shape[0] // 2 * 2, a.shape[1] // 2 * 2
        a = a[:h2, :w2]
        r = a.reshape(h2 // 2, 2, w2 // 2, 2)
        return r.max((1, 3)) if how == 'max' else r.mean((1, 3))
    levels = [(fixed_mask, fixed_val, p, cell)]
    while min(levels[-1][0].shape) > 24:
        m, v, pp, c = levels[-1]
        mm = down(m.astype(np.float32), 'max') > 0
        sw = down(m.astype(np.float32), 'mean')
        vv = np.where(sw > 0, down(np.where(m, v, 0), 'mean') / np.maximum(sw, 1e-6), 0)
        levels.append((mm, vv, down(pp, 'mean'), c * 2))
    f = None
    for lev in reversed(range(len(levels))):
        m, v, pp, c = levels[lev]
        if f is None:
            f = np.where(m, v, np.mean(v[m]) if m.any() else 0.0)
        else:
            f = np.repeat(np.repeat(f, 2, 0), 2, 1)
            f = np.pad(f, ((0, m.shape[0] - f.shape[0]), (0, m.shape[1] - f.shape[1])), mode='edge')[:m.shape[0], :m.shape[1]]
            f = np.where(m, v, f)
        n_it = iters if lev == 0 else iters * 2
        for _ in range(n_it):
            g = np.pad(f, 1, mode='edge')
            avg = 0.25 * (g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:])
            f = np.where(m, v, avg - 0.25 * c * c * pp)
    return f

def gblur2(F, sig):
    k = np.arange(-int(3 * sig), int(3 * sig) + 1)
    g = np.exp(-0.5 * (k / sig) ** 2); g /= g.sum()
    F = np.apply_along_axis(lambda r: np.convolve(np.pad(r, len(k), mode='edge'), g, 'same')[len(k):-len(k)], 1, F)
    F = np.apply_along_axis(lambda r: np.convolve(np.pad(r, len(k), mode='edge'), g, 'same')[len(k):-len(k)], 0, F)
    return F

def bilinear(F, cell, u0, v0, U, V):
    """Sample a 2D grid F (rows v, cols u) at points (U, V) in pixels."""
    x = (U - u0) / cell; y = (V - v0) / cell
    x0 = np.clip(np.floor(x).astype(int), 0, F.shape[1] - 2); y0 = np.clip(np.floor(y).astype(int), 0, F.shape[0] - 2)
    fx = np.clip(x - x0, 0, 1); fy = np.clip(y - y0, 0, 1)
    return (F[y0, x0] * (1 - fx) * (1 - fy) + F[y0, x0 + 1] * fx * (1 - fy)
            + F[y0 + 1, x0] * (1 - fx) * fy + F[y0 + 1, x0 + 1] * fx * fy)

def cover_back_depth(v):
    c = COVER
    return c['d_front'] + c['thick'] + (c['bottom'] - v) * math.tan(math.radians(c['tilt']))

def build_field():
    rim, sil_dense = rim_path()
    ridge = ridge_path()
    log('paths: rim %d, ridge %d samples' % (len(rim), len(ridge)))

    # ---- membrane (2D solves at 4 px)
    cell = 4.0
    gu = np.arange(U0, U1 + cell, cell); gv = np.arange(V0, V1 + cell, cell)
    GU, GV = np.meshgrid(gu, gv)
    inside = poly_inside(rim[:, :2], GU, GV)
    dist_rim, ir = nearest(rim[:, :2], np.arange(len(rim)), GU, GV)
    ir = ir.astype(int)
    d_rim = rim[ir, 2]
    lift = float(ARGS.get('lift', 0.6))                  # the membrane meets each roll this far toward its crest
    sd2 = np.where(inside, -dist_rim, dist_rim)          # signed 2D distance to the rim's centre line
    fixed = ~inside
    fval = d_rim - lift * rim[ir, 3] * rim[ir, 4]
    pins_f = fixed.copy()
    def pin(u, v, dval):
        a = int(np.clip(round((v - V0) / cell), 0, len(gv) - 1)); b_ = int(np.clip(round((u - U0) / cell), 0, len(gu) - 1))
        pins_f[a, b_] = True; fval[a, b_] = dval
    # the ridge: the membrane meets it all along. Right of the twist it is the sheet's rolled lip: the sheet
    # attaches nearer its crest, and just under it the glass drops back into the channel (the fold): an overhang
    tan = np.gradient(ridge[:, :2], axis=0); tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
    towards = np.array(CHANNEL_CENTRE) - ridge[:, :2]
    nrm *= np.sign(np.sum(nrm * towards, 1))[:, None]              # pointing into the channel
    for (u, v, dval, rr, sq, _), nn in zip(ridge, nrm):
        w = np.clip((u - 980.0) / 80.0, 0, 1); w = w * w * (3 - 2 * w)
        pin(u, v, dval - (lift * (1 - w) + LIP['attach'] * w) * rr * sq)
    # the pocket's floor under the cover
    c = COVER
    half = c['side'] / 2 - 12
    cosT = math.cos(math.radians(c['tilt']))
    top = c['bottom'] - c['side'] * cosT
    pocket = (np.abs(GU - c['cu']) < half - 18) & (GV > top + 30) & (GV < c['bottom'] - 28)
    if 'pocket_pin' in FLAGS:       # (phase 1 pinned the front behind the cover; the pocket is now carved after the rolls,
        pins_f |= pocket            # and the pin dragged the words' hollow down toward it)
        fval = np.where(pocket, cover_back_depth(GV) + 3.0, fval)
    # the sag: the words' hollow is shallow; the channel under the buttons spans more, so it sags less per pixel;
    # the sheet between the rim and the lip bulges forward
    pf = np.interp(GU, [0, 980, 1060, 1600], [MEM['p_front'], MEM['p_front'], MEM['p_channel'], MEM['p_channel']])
    sheet_poly = np.vstack([sheet_rim_span(rim)[:, :2], ridge[ridge[:, 0] >= SHEET['ridge_from_u']][::-1, :2]])
    in_sheet = poly_inside(sheet_poly, GU, GV) & inside
    pf = np.where(in_sheet, MEM['p_sheet'], pf)
    f = poisson(pins_f, fval, pf, cell, 400)
    f = np.where(inside, gblur2(f, 2.5), f)
    f = calm_words(f, GU, GV, inside)
    # the back: rounded like a pebble, deepest behind the bulb, leaving the rim's back gently
    Bdep = np.interp(GU, [u for u, _ in BACK], [d for _, d in BACK])
    q = np.clip(-sd2 / BACK_REACH, 0, 1)
    b = d_rim + Bdep * (q * q * (3 - 2 * q)) ** 0.75
    b = gblur2(b, 4.0)
    b = calm_back(b, GU, GV, inside)
    # a minimum thickness away from the rim (fading to none at its centre line, where the rim covers it)
    need = f + float(ARGS.get('min_thick', 34.0)) * np.clip(-sd2 / 40.0, 0, 1)
    b = 0.5 * (b + need + np.sqrt((b - need) ** 2 + 8.0 ** 2))
    log('membrane solved: front %.0f..%.0f, back %.0f..%.0f' % (f[inside].min(), f[inside].max(), b[inside].min(), b[inside].max()))

    # ---- 3D grid coordinates (index i: u, j: depth, k: z = V1 - v)
    us = U0 + np.arange(NX) * VOX
    ds = D0 + np.arange(NY) * VOX
    vs = V1 - np.arange(NZ) * VOX
    UU, VV = np.meshgrid(us, vs, indexing='ij')           # (NX, NZ)
    F2 = gblur2(bilinear(f, cell, U0, V0, UU, VV), 2.0).astype(np.float32)
    B2 = gblur2(bilinear(b, cell, U0, V0, UU, VV), 2.0).astype(np.float32)
    SD = bilinear(sd2, cell, U0, V0, UU, VV).astype(np.float32)
    Dd = ds.astype(np.float32)[None, :, None]
    mem = np.maximum(F2[:, None, :] - Dd, Dd - B2[:, None, :])
    mem = np.maximum(mem, SD[:, None, :])
    log('membrane field', mem.shape)


    # ---- rolls
    Pr, Qr = tube_mesh(rim, closed=True)
    # a wider blend behind (the back leaves the rim in a long smooth curve), a tighter one in front
    kr = (MEM['k_rim'] + 34.0 * np.clip((ds - 30.0) / 80.0, 0, 1)).astype(np.float32)[None, :, None]
    F = smin(mem, level_set(Pr, Qr, half_width=26.0), kr)
    del mem
    log('rim joined')
    # ---- wells: smooth subtraction of flat-floored dishes from the membrane's front (after the outer roll is on, so the fat lower band
    # cannot fill their lower rims back in: that left small bumps between the wells; before the ridge): a
    # rounded cylinder along the view, its floor w behind the surface, its floor-to-wall edge a fillet
    for (wu, wv, rho, w) in WELLS:
        fl = float(bilinear(f, cell, U0, V0, np.array([wu]), np.array([wv]))[0])
        re = min(WELL_FILLET, rho * 0.45)
        near = 70.0                               # the cylinder reaches this far in front of the surface
        h = (w + near) / 2.0
        cd = fl + w - h                           # its middle (depth)
        pad = 24
        i0, i1 = int((wu - rho - pad - U0) / VOX), int((wu + rho + pad - U0) / VOX) + 1
        k0, k1 = int((V1 - (wv + rho + pad)) / VOX), int((V1 - (wv - rho - pad)) / VOX) + 1
        j0, j1 = int((cd - h - pad - D0) / VOX), int((cd + h + pad - D0) / VOX) + 1
        i0, k0, j0 = max(i0, 0), max(k0, 0), max(j0, 0)
        i1, k1, j1 = min(i1, NX), min(k1, NZ), min(j1, NY)
        uu = (U0 + np.arange(i0, i1) * VOX)[:, None, None]
        dd = (D0 + np.arange(j0, j1) * VOX)[None, :, None]
        vv = (V1 - np.arange(k0, k1) * VOX)[None, None, :]
        qx = np.sqrt((uu - wu) ** 2 + (vv - wv) ** 2) - (rho - re)
        qy = np.abs(dd - cd) - (h - re)
        sph = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - re
        blk = smax(F[i0:i1, j0:j1, k0:k1], -sph, MEM['k_well'])
        # the well's own lip: a rounded ring standing a little proud of the floor round the dish
        lip = WELL_LIP
        qr = np.sqrt((uu - wu) ** 2 + (vv - wv) ** 2) - (rho + lip['out'])
        qd = dd - (fl - lip['raise'])
        tor = np.sqrt(qr ** 2 + qd ** 2) - lip['r']
        F[i0:i1, j0:j1, k0:k1] = smin(blk, tor, lip['k'])
    log('wells cut')
    smooth_region(F, (1000.0, 1470.0), (500.0, 610.0), passes=int(ARGS.get('channel_smooth', 24)))
    log('channel under the wells smoothed')
    Pg, Qg = tube_mesh(ridge, closed=False)
    # (a tighter join just past the title, where the ridge sweeps up through the twist: the soft join began some
    # 40 px above its crest there and laid the studio's hot line across the end of the title)
    us_ = U0 + np.arange(NX) * VOX
    k_tw = float(ARGS.get('k_twist', 6.0))
    kg = (MEM['k_ridge'] + (k_tw - MEM['k_ridge']) * np.exp(-((us_ - 805.0) / 75.0) ** 2)).astype(np.float32)[:, None, None]
    F = smin(F, level_set(Pg, Qg), kg)
    log('ridge joined')
    # the fold under the sheet's lip
    tan = np.gradient(ridge[:, :2], axis=0); tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
    nrm *= np.sign(np.sum(nrm * (np.array(CHANNEL_CENTRE) - ridge[:, :2]), 1))[:, None]
    w = np.clip((ridge[:, 0] - 990.0) / 70.0, 0, 1); w = w * w * (3 - 2 * w)
    n_end = np.clip((len(ridge) - 1 - np.arange(len(ridge))) / 25.0, 0, 1)      # fade out before the tail tip
    w = w * n_end
    sel = w > 0.02
    gp = ridge[sel].copy()
    off = (ridge[sel, 3] + FOLD['off'])[:, None] * nrm[sel]
    gp[:, 0] += off[:, 0]; gp[:, 1] += off[:, 1]
    gp[:, 2] = ridge[sel, 2] + FOLD['back']
    gp[:, 3] = np.maximum(FOLD['r'] * w[sel], 1.5)
    gp[:, 4] = 1.0
    Pf, Qf = tube_mesh(gp, closed=False)
    F = smax(F, -level_set(Pf, Qf), FOLD['k'])
    log('fold carved')
    # the bulb's broad left side, between the outer roll and the pocket, ironed (its soft humps made the hot line
    # wander there in a Z)
    smooth_region(F, (20.0, 150.0), (220.0, 600.0), passes=int(ARGS.get('bulb_smooth', 16)))
    log('bulb side smoothed')
    # ---- the ring of glass round the cover, then the pocket carved through everything (round on every side)
    pocket_ring(F)
    pocket_cut(F)
    log('ring joined, pocket cut')

    # ---- the sheet over the buttons: loft from the rim's top (right of the twist) to the ridge's free part
    # take the rim samples that belong to the top and the right end, ordered from the twist to the tip
    rim_top = sheet_rim_span(rim)
    rB = ridge[ridge[:, 0] >= SHEET['ridge_from_u']]
    ns = 60; nt = 14
    ra = resample(rim_top, ns); rb = resample(rB, ns)
    t = np.linspace(0, 1, nt)
    G = np.empty((ns, nt, 3)); Hh = np.empty((ns, nt))
    s_ = np.linspace(0, 1, ns)
    taper = np.clip(np.minimum(s_ / 0.18, (1 - s_) / 0.12), 0, 1)
    taper = taper * taper * (3 - 2 * taper)
    for j, tt in enumerate(t):
        u = ra[:, 0] * (1 - tt) + rb[:, 0] * tt
        v = ra[:, 1] * (1 - tt) + rb[:, 1] * tt
        d = ra[:, 2] * (1 - tt) + rb[:, 2] * tt + SHEET['bow'] * 4 * tt * (1 - tt) * taper
        G[:, j] = px(u, v, d)
        Hh[:, j] = (SHEET['half'] * (0.55 + 0.45 * taper)) * (1 - 0.25 * abs(2 * tt - 1))
    if 'sheet_slab' in FLAGS:
        Ps, Qs = skin_mesh(G, Hh)
        F = smin(F, level_set(Ps, Qs), MEM['k_sheet'])
        log('sheet joined')
    return F, dict(rim=rim, ridge=ridge, sheet=G, f=f, b=b)

def smooth_region(F, ur, vr, passes=24, feather=24.0):
    """Blur the field inside a box of the picture (u, v ranges, all depths), blended in over a feather: irons out
    small bumps where several rolls meet without moving the forms round them."""
    if passes <= 0:
        return
    pad = feather + 8
    i0, i1 = max(int((ur[0] - pad - U0) / VOX), 0), min(int((ur[1] + pad - U0) / VOX) + 1, NX)
    k0, k1 = max(int((V1 - (vr[1] + pad)) / VOX), 0), min(int((V1 - (vr[0] - pad)) / VOX) + 1, NZ)
    blk = F[i0:i1, :, k0:k1].copy()
    sm = blur3(blk, passes)
    uu = (U0 + np.arange(i0, i1) * VOX)[:, None, None]
    vv = (V1 - np.arange(k0, k1) * VOX)[None, None, :]
    def ramp(x0, x1, x):
        t = np.clip(np.minimum(x - x0, x1 - x) / feather, 0, 1)
        return t * t * (3 - 2 * t)
    w = (ramp(ur[0], ur[1], uu) * ramp(vr[0], vr[1], vv)).astype(np.float32)
    F[i0:i1, :, k0:k1] = blk + w * (sm - blk)

def calm_mask(c, GU, GV, inside):
    """The weight (0..1) of a CALM region on the membrane's grid: its box, kept below the silhouette's top edge and
    above the ridge (clear of both rolls), feathered and rounded so the zebra stays smooth."""
    sil = np.array(SIL, float)
    top = sil[:int(np.argmax(sil[:, 0])) + 1]
    rg = np.array(RIDGE, float)
    ridge_top = np.interp(GU, rg[:, 0], rg[:, 1]) - np.interp(GU, rg[:, 0], rg[:, 3])
    v0 = np.maximum(c['v'][0], np.interp(GU, top[:, 0], top[:, 1]) + c['top'])
    v1 = np.minimum(c['v'][1], ridge_top - c['bottom'])
    F_ = c['feather']
    def sm(x):
        t = np.clip((x + F_) / (2 * F_), 0, 1)
        return t * t * (3 - 2 * t)
    w = sm(GU - c['u'][0]) * sm(c['u'][1] - GU) * sm(GV - v0) * sm(v1 - GV) * inside
    return gblur2(w, c['round'])                # (in 4 px cells: rounds the region's corners)

def calm_plane(F, w, GU, GV, tilt_deg, depth=0.0, max_across=0.08):
    """F eased toward a plane where w is 1: at F's own mean depth there (plus depth), across as F leans (clamped),
    tipped tilt_deg up (negative: down). Returns the new F and the largest change."""
    core = w > 0.5
    if core.sum() < 20:
        return F, 0.0
    uc, vc = GU[core].mean(), GV[core].mean()
    A = np.stack([np.ones(core.sum()), GU[core] - uc, GV[core] - vc], 1)
    a, b, _ = np.linalg.lstsq(A, F[core], rcond=None)[0]
    b = float(np.clip(b, -max_across, max_across))
    target = a + depth + b * (GU - uc) - math.tan(math.radians(tilt_deg)) * (GV - vc)
    return F + CALM_AMOUNT * w * (target - F), float(np.abs(F[core] - target[core]).max())

def calm_words(f, GU, GV, inside):
    """Ease the front toward a calm plane behind the words and the controls (CALM's regions): square to the camera
    across, tipped CALM_TILT degrees (so it mirrors the studio's dark band, between the floor's glow and the key
    strip), at the front's own mean depth there."""
    if CALM_AMOUNT <= 0:
        return f
    for c in CALM:
        w = calm_mask(c, GU, GV, inside)
        f, resid = calm_plane(f, w, GU, GV, CALM_TILT, c['depth'])
        log('calm %s: largest change %.1f px' % (c['name'], resid))
    return f

def calm_back(b, GU, GV, inside):
    """The back behind the words parallel to the calm front, so light crosses the glass there straight to the dark
    behind it (a rounded back bends those rays down onto the studio's bright floor: pink, milky glass)."""
    if CALM_AMOUNT <= 0:
        return b
    w = calm_mask(CALM[0], GU, GV, inside)
    w = gblur2(w, 4.0)                          # (wider: the back bends rays, so its own edges are softened more)
    b, resid = calm_plane(b, w, GU, GV, 0.0, 0.0, max_across=0.05)
    log('calm back behind the words: largest change %.1f px' % resid)
    return b

def cover_frame(i0, i1, k0, k1):
    """Grid coordinates in the cover's frame for the block [i0:i1, :, k0:k1]: x across, y up its face from its middle,
    z in front of its face."""
    c = COVER
    t = math.radians(c['tilt'])
    Bu, Bv, Bd = c['cu'], c['bottom'], c['d_front']
    uu = (U0 + np.arange(i0, i1) * VOX)[:, None, None]
    dd = (D0 + np.arange(NY) * VOX)[None, :, None]
    vv = (V1 - np.arange(k0, k1) * VOX)[None, None, :]
    x = uu - Bu
    y = (vv - Bv) * (-math.cos(t)) + (dd - Bd) * math.sin(t) - c['side'] / 2
    z = (vv - Bv) * (-math.sin(t)) + (dd - Bd) * (-math.cos(t))
    return x, y, z

def cover_block(pad):
    c = COVER
    half = c['side'] / 2
    i0, i1 = int((c['cu'] - half - pad - U0) / VOX), int((c['cu'] + half + pad - U0) / VOX) + 1
    k0, k1 = int((V1 - (c['bottom'] + pad)) / VOX), int((V1 - (c['bottom'] - c['side'] - pad)) / VOX) + 1
    return max(i0, 0), min(i1, NX), max(k0, 0), min(k1, NZ)

def rrect2(x, y, half, rc):
    qx = np.abs(x) - (half - rc); qy = np.abs(y) - (half - rc)
    return np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - rc

def pocket_ring(F):
    """The ring of glass round the cover: a rounded roll following the cover's rounded square RING['off'] px outside
    its edge, its centre RING['front'] px in front of the face, joined softly to the body."""
    c, R = COVER, RING
    if R['r'] <= 0:
        return
    pad = R['off'] + R['r'] + R['k'] + 12
    i0, i1, k0, k1 = cover_block(pad)
    x, y, z = cover_frame(i0, i1, k0, k1)
    dc = rrect2(x, y, c['side'] / 2, c['corner'])
    tube = np.sqrt((dc - R['off']) ** 2 + ((z - R['front']) / R['sq']) ** 2) - R['r']
    F[i0:i1, :, k0:k1] = smin(F[i0:i1, :, k0:k1], tube.astype(np.float32), R['k'])

def pocket_cut(F):
    """Carve the cover's pocket: the cover's rounded square, a little larger, open toward the camera, so the
    cover sits in air in a dent with a rounded lip and no glass over its face."""
    c = COVER
    m = POCKET['margin']
    i0, i1, k0, k1 = cover_block(POCKET['k'] + m + 16)
    x, y, z = cover_frame(i0, i1, k0, k1)
    d2 = rrect2(x, y, c['side'] / 2 + m, c['corner'] + m)
    cut = np.maximum(d2, -(z + c['thick'] + POCKET['behind']))
    F[i0:i1, :, k0:k1] = smax(F[i0:i1, :, k0:k1], -cut.astype(np.float32), POCKET['k'])

def sheet_rim_span(rim):
    """The rim's samples from just right of the twist along the top and round the right end to the tail tip."""
    # find the rim sample nearest the sheet's start on the top edge and the one nearest the tip
    sil = np.array(SIL, float)
    a = np.array(SHEET['rim_from'], float); z = np.array(SHEET['rim_to'], float)
    ia = int(np.argmin(((rim[:, :2] - a) ** 2).sum(1)))
    iz = int(np.argmin(((rim[:, :2] - z) ** 2).sum(1)))
    if ia <= iz:
        return rim[ia:iz + 1]
    return np.vstack([rim[ia:], rim[:iz + 1]])

def resample(Smp, n):
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(Smp[:, :3], axis=0), axis=1))])
    si = np.linspace(0, s[-1], n)
    return np.stack([np.interp(si, s, Smp[:, j]) for j in range(Smp.shape[1])], 1)

def blur3(F, passes=1):
    for _ in range(passes):
        for ax in range(3):
            F = (np.roll(F, 1, ax) + 2 * F + np.roll(F, -1, ax)) * 0.25
    return F

LIVE = {}      # what the live export needs from the build (the field's normals at the mesh's points)

def taubin(P, quads, it, lam=0.33, mu=-0.34):
    """Taubin's smoothing (a shrink step, then an inflate step) over the quads' edges: removes the voxel ripple
    without shrinking the form."""
    if it <= 0:
        return P
    q = quads.astype(np.int64)
    e = np.concatenate([q[:, [0, 1]], q[:, [1, 2]], q[:, [2, 3]], q[:, [3, 0]]])
    a = np.concatenate([e[:, 0], e[:, 1]]); b = np.concatenate([e[:, 1], e[:, 0]])
    deg = np.bincount(a, minlength=len(P)).astype(np.float64)[:, None]
    P = P.astype(np.float64)
    for _ in range(it):
        for f in (lam, mu):
            s = np.zeros_like(P)
            np.add.at(s, a, P[b])
            P = P + f * (s / np.maximum(deg, 1) - P)
    return P.astype(np.float32)

def trilinear(F, P):
    """F (grid) at points P (n x 3, index coordinates)."""
    P = np.clip(P, 0, np.array(F.shape) - 1.001)
    i = np.floor(P).astype(np.int64); f = (P - i).astype(np.float32)
    out = np.zeros(len(P), np.float32)
    for dx in (0, 1):
        wx = f[:, 0] if dx else 1 - f[:, 0]
        for dy in (0, 1):
            wy = f[:, 1] if dy else 1 - f[:, 1]
            for dz in (0, 1):
                wz = f[:, 2] if dz else 1 - f[:, 2]
                out += F[i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz] * wx * wy * wz
    return out

def field_normals(F, P, h=0.75):
    """The outward normal at each point from the field's gradient (index axes i: u, j: depth, k: up, which are
    Blender's X, Y, Z in the root's frame).
    (The clear-glass polish: the gradient is taken on the grid, from the field lightly blurred, and that gradient
    interpolated: continuous across voxels. Differences of the interpolated field itself kinked at every voxel face,
    and on broad, gently curved glass the hot strip's reflection showed the voxels as a saw-tooth.)"""
    if ARGS.get('normals') == 'facet':
        g = np.stack([trilinear(F, P + o) - trilinear(F, P - o) for o in np.eye(3, dtype=np.float32) * h], 1)
        return (g / (np.linalg.norm(g, axis=1, keepdims=True) + 1e-12)).astype(np.float32)
    passes = int(ARGS.get('normal_blur', 2))
    P = np.clip(P, 1, np.array(F.shape) - 2.001)
    i0 = np.floor(P).astype(np.int64); f = (P - i0).astype(np.float32)
    # the nodes round the points only (the whole grid's gradient would not fit in memory twice over), blurred there
    lo = np.maximum(i0.min(0) - 1 - passes, 0); hi = np.minimum(i0.max(0) + 3 + passes, np.array(F.shape))
    g = np.zeros((len(P), 3), np.float32)
    # walk the grid in slabs along u so the blurred copy stays small
    step = 48
    for a in range(int(lo[0]), int(hi[0]), step):
        sel = (i0[:, 0] >= a) & (i0[:, 0] < a + step)
        if not sel.any():
            continue
        b0 = max(a - 1 - passes, 0); b1 = min(a + step + 2 + passes, F.shape[0])
        blk = F[b0:b1, lo[1]:hi[1], lo[2]:hi[2]].astype(np.float32)
        for _ in range(passes):
            for ax in range(3):
                pad = np.concatenate([blk[(slice(None),) * ax + (slice(0, 1),)], blk, blk[(slice(None),) * ax + (slice(-1, None),)]], ax)
                n = blk.shape[ax]
                blk = (pad[(slice(None),) * ax + (slice(0, n),)] + 2 * blk + pad[(slice(None),) * ax + (slice(2, n + 2),)]) * 0.25
        q = i0[sel] - np.array([b0, lo[1], lo[2]]); fq = f[sel]
        acc = np.zeros((sel.sum(), 3), np.float32)
        for dx in (0, 1):
            wx = fq[:, 0] if dx else 1 - fq[:, 0]
            for dy in (0, 1):
                wy = fq[:, 1] if dy else 1 - fq[:, 1]
                for dz in (0, 1):
                    wz = fq[:, 2] if dz else 1 - fq[:, 2]
                    x, y, z = q[:, 0] + dx, q[:, 1] + dy, q[:, 2] + dz
                    gr = np.stack([blk[x + 1, y, z] - blk[x - 1, y, z], blk[x, y + 1, z] - blk[x, y - 1, z],
                                   blk[x, y, z + 1] - blk[x, y, z - 1]], 1)
                    acc += gr * (wx * wy * wz)[:, None]
        g[sel] = acc
    return (g / (np.linalg.norm(g, axis=1, keepdims=True) + 1e-12)).astype(np.float32)

def field_to_mesh(F, name):
    import openvdb as vdb
    band = 3.0 * VOX
    Fb = np.where(np.abs(F) < band, F, np.float32(band)).astype(np.float32)
    g = vdb.FloatGrid(band)
    g.copyFromArray(np.ascontiguousarray(Fb), ijk=(0, 0, 0), tolerance=0.0)
    del Fb
    g.signedFloodFill()
    pts, quads = g.convertToQuads(isovalue=0.0)
    log('meshed: %d points, %d quads' % (len(pts), len(quads)))
    # (Phase 2's quality bar: a smooth mesh with smooth normals.) A light Taubin smoothing (it does not shrink the
    # form), then each point's normal from the distance field's own gradient, not from the facets.
    pts = taubin(pts, quads, int(ARGS.get('smooth_it', 4)))
    LIVE['normals'] = field_normals(F, pts)
    u = U0 + pts[:, 0] * VOX
    d = D0 + pts[:, 1] * VOX
    v = V1 - pts[:, 2] * VOX
    co = np.stack([(u - CX) * S, d * S, (CY - v) * S], 1).astype(np.float32)
    me = bpy.data.meshes.get(name)
    if me:
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(co))
    me.vertices.foreach_set('co', co.ravel())
    nq = len(quads)
    me.loops.add(nq * 4)
    me.loops.foreach_set('vertex_index', quads.astype(np.int32)[:, ::-1].ravel())   # outward normals
    me.polygons.add(nq)
    me.polygons.foreach_set('loop_start', np.arange(0, nq * 4, 4, dtype=np.int32))
    me.polygons.foreach_set('use_smooth', np.ones(nq, bool))
    me.update(calc_edges=True)
    # outward normals: faces far from the middle must point away from it
    nrm = np.empty(nq * 3, np.float32); me.polygons.foreach_get('normal', nrm); nrm = nrm.reshape(-1, 3)
    ctr = np.empty(nq * 3, np.float32); me.polygons.foreach_get('center', ctr); ctr = ctr.reshape(-1, 3)
    far = np.abs(ctr[:, 1] - ctr[:, 1].mean()) > 0.3
    if np.mean(np.sum(nrm[far] * (ctr[far] - ctr.mean(0)), 1)) < 0:
        me.flip_normals()
        log('normals flipped')
    return me

# ------------------------------------------------------------------------------------------------ scene
def get_scene():
    """The live session builds in a scene of its own (the open file's other scenes are left alone); the
    background run uses the factory scene, emptied."""
    if bpy.app.background:
        sc = bpy.context.scene
        for ob in list(sc.objects):
            if not ob.name.startswith('Mercury3D'):
                bpy.data.objects.remove(ob, do_unlink=True)
        sc.name = 'Mercury'
        return sc
    sc = bpy.data.scenes.get('Mercury')
    if sc is None:
        sc = bpy.data.scenes.new('Mercury')
    if bpy.context.window:
        bpy.context.window.scene = sc
    return sc

def clear_collection(sc, name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
    if col.name not in sc.collection.children:
        sc.collection.children.link(col)
    for ob in list(col.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    return col

def add_obj(col, name, data, parent=None):
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)
    ob = bpy.data.objects.new(name, data)
    col.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob

def node_mat(name):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out

def real_cover(n):
    """The owner's n-th real cover (data/real-covers.json, never in git; this worktree has no data/, so the main
    checkout's is read). Its path is never printed; renders with it stay private in design/captures/raw/."""
    for base in (REPO, os.path.join(os.path.dirname(REPO), 'jusic-redesign')):
        f = os.path.join(base, 'data', 'real-covers.json')
        if os.path.exists(f):
            r = json.load(open(f, encoding='utf-8'))
            return os.path.join(r['art'], r['tracks'][n - 1]['cover'])
    raise SystemExit('no real-covers.json found')

def album_colour(path):
    """A rough album colour: the mean of the cover's more saturated pixels; grey covers give silver."""
    im = bpy.data.images.load(path, check_existing=True)
    a = np.array(im.pixels[:], np.float32).reshape(-1, im.channels)[:, :3]
    a = a[:: max(1, len(a) // 40000)]
    mx, mn = a.max(1), a.min(1)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    share = float((sat > 0.25).mean())
    pick = a[sat >= np.quantile(sat, 0.8)]
    c = pick.mean(0) if len(pick) else a.mean(0)
    c = c / max(c.max(), 1e-4)
    k = np.clip((share - 0.05) / 0.10, 0, 1)
    silver = np.array([0.86, 0.9, 0.96])
    return tuple(silver + (c - silver) * k)

def glass_material(tint):
    m, nt, out = node_mat('Mercury3D_Glass')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (1, 1, 1, 1)
    b.inputs['Roughness'].default_value = float(ARGS.get('rough', 0.0))
    b.inputs['IOR'].default_value = 1.5
    b.inputs['Transmission Weight'].default_value = 1.0
    if 'Dispersion' in b.inputs:
        b.inputs['Dispersion'].default_value = float(ARGS.get('disp', 0.025))
    b.inputs['Coat Weight'].default_value = float(ARGS.get('coat', 0.0))
    b.inputs['Coat Roughness'].default_value = 0.0
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    va = nt.nodes.new('ShaderNodeVolumeAbsorption')
    t = np.array(tint)
    col = 1.0 - (1.0 - t) * float(ARGS.get('absorb_mix', 0.55))
    va.inputs['Color'].default_value = (*col, 1)
    va.inputs['Density'].default_value = float(ARGS.get('absorb', 0.55))
    nt.links.new(va.outputs['Volume'], out.inputs['Volume'])
    return m

def clay_material():
    m, nt, out = node_mat('Mercury3D_Clay')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (0.55, 0.55, 0.57, 1)
    b.inputs['Roughness'].default_value = 0.3
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m

def chrome_material():
    m, nt, out = node_mat('Mercury3D_Chrome')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (1, 1, 1, 1)
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Roughness'].default_value = 0.0
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m

def bands_material():
    """A map of which part of the studio each point mirrors (the reflection's elevation, in the studio's level frame):
    black where it mirrors the dark band (the calm faces), dark blue the floor's glow, red the key strip (23 deg),
    green the soft strips (28-36, 46-54), yellow the second strip (41), white the overhead light."""
    m, nt, out = node_mat('Mercury3D_Bands')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Reflection'], sep.inputs['Vector'])
    asn = nt.nodes.new('ShaderNodeMath'); asn.operation = 'ARCSINE'
    nt.links.new(sep.outputs['Z'], asn.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -math.pi / 2; mr.inputs['From Max'].default_value = math.pi / 2
    nt.links.new(asn.outputs['Value'], mr.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    el = lambda deg: (deg + 90.0) / 180.0
    stops = [(-90, (0.02, 0.05, 0.25)), (-2, (0, 0, 0)), (21.5, (0.9, 0.08, 0.05)), (24.5, (0, 0, 0)),
             (27, (0.1, 0.55, 0.1)), (37, (0, 0, 0)), (39.5, (0.9, 0.85, 0.1)), (42.5, (0, 0, 0)),
             (45, (0.1, 0.55, 0.1)), (55, (0, 0, 0)), (58, (0.9, 0.9, 0.9))]
    els = ramp.color_ramp.elements
    els[0].position = el(stops[0][0]); els[0].color = (*stops[0][1], 1)
    els[1].position = el(stops[1][0]); els[1].color = (*stops[1][1], 1)
    for deg, c in stops[2:]:
        e = els.new(el(deg)); e.color = (*c, 1)
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m

def zebra_material():
    m, nt, out = node_mat('Mercury3D_Zebra')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Reflection'], sep.inputs['Vector'])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 28.0
    nt.links.new(sep.outputs['Z'], mul.inputs[0])
    sn = nt.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'
    nt.links.new(mul.outputs[0], sn.inputs[0])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.0
    nt.links.new(sn.outputs[0], gt.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(gt.outputs[0], mix.inputs['Factor'])
    mix.inputs['A'].default_value = (0.02, 0.02, 0.025, 1); mix.inputs['B'].default_value = (0.95, 0.95, 0.95, 1)
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(mix.outputs['Result'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m

def cover_material(path, glow):
    m, nt, out = node_mat('Mercury3D_Cover')
    img = bpy.data.images.load(path, check_existing=True)
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    uv = nt.nodes.new('ShaderNodeUVMap')
    nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    dim = nt.nodes.new('ShaderNodeMix'); dim.data_type = 'RGBA'; dim.blend_type = 'MULTIPLY'
    dim.inputs['Factor'].default_value = 1.0; dim.inputs['B'].default_value = (0.08, 0.08, 0.08, 1)
    nt.links.new(tex.outputs['Color'], dim.inputs['A'])
    nt.links.new(dim.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.4
    b.inputs['Specular IOR Level'].default_value = 0.0      # no broad sheen over the art; the clear coat is the gloss
    # (The model pass: a faint sheen. At .035 the key strip mirrored in it laid a grey band across the art.)
    b.inputs['Coat Weight'].default_value = float(ARGS.get('cover_coat', 0.01))
    b.inputs['Coat Roughness'].default_value = 0.05
    nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = glow
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m

def cover_mesh(name):
    """A thin slab with rounded corners. Its face is a regular grid, bowed a little toward the camera along its
    height, so one band of light crosses it; no creases for the gloss to catch."""
    c = COVER
    side = c['side']; half = side / 2; rc = c['corner']; th = c['thick']
    N = 48
    xs = np.linspace(-half, half, N + 1)
    def clamp(x, y):
        cx_ = math.copysign(half - rc, x); cy_ = math.copysign(half - rc, y)
        if abs(x) > half - rc and abs(y) > half - rc:
            dx_, dy_ = x - cx_, y - cy_
            L = math.hypot(dx_, dy_)
            if L > rc:
                return cx_ + dx_ * rc / L, cy_ + dy_ * rc / L
        return x, y
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    grid = [[None] * (N + 1) for _ in range(N + 1)]
    for i, x in enumerate(xs):
        for j, y in enumerate(xs):
            X, Y = clamp(x, y)
            grid[i][j] = bm.verts.new((X, -c['dome'] * (1 - (Y / half) ** 2), Y))
    for i in range(N):
        for j in range(N):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    ring = [grid[i][0] for i in range(N + 1)] + [grid[N][j] for j in range(1, N + 1)] +            [grid[i][N] for i in range(N - 1, -1, -1)] + [grid[0][j] for j in range(N - 1, 0, -1)]
    back = [bm.verts.new((v.co.x, th, v.co.z)) for v in ring]
    m = len(ring)
    for k in range(m):
        k2 = (k + 1) % m
        if (ring[k].co - ring[k2].co).length > 1e-6:
            bm.faces.new((ring[k2], back[k2], back[k], ring[k]))
    bm.faces.new(list(reversed(back)))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-3)
    for f_ in bm.faces:
        for l in f_.loops:
            l[uvl].uv = ((l.vert.co.x + half) / side, (l.vert.co.z + half) / side)
        f_.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.get(name)
    if me:
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    me.transform(Matrix.Scale(S, 4))
    return me

# ------------------------------------------------------------------------------------------------ studio
def make_env(path, tint, w=2048, h=1024):
    """The studio as an HDR panorama (Blender's equirectangular mapping): a dark room, a soft light overhead,
    long thin strip lights, and a warm bounce off the floor. The same file lights the live widget."""
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h                     # Blender rows are bottom-up
    U, V = np.meshgrid(u, v)
    phi = (0.5 - U) * 2 * np.pi                       # atan2(dy, dx)
    el = (V - 0.5) * np.pi
    dx = np.cos(el) * np.cos(phi); dy = np.cos(el) * np.sin(phi); dz = np.sin(el)
    tint = np.array(tint)
    st = dict(STUDIO)
    st.update({k[3:]: float(v) for k, v in ARGS.items() if k.startswith('st_')})
    warm = 0.55 * tint + 0.45 * np.array([1.0, 0.72, 0.62])          # the floor's bounce: the album's colour
    peach = 0.78 * np.array([1.0, 0.9, 0.8]) + 0.22 * tint            # the strips: peach white, from the album
    white = 0.9 * np.array([1.0, 0.97, 0.95]) + 0.1 * tint            # the big soft sources: near neutral
    az = np.degrees(phi); eld = np.degrees(el)
    cam = -90.0                                       # azimuth of the camera's side (-Y)
    dac = (az - cam + 180) % 360 - 180                # azimuth relative to the camera's side
    def ss(e0, e1, x):
        t = np.clip((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)
    # The big soft sources, each kept apart: the reflected studio and the seen-through studio weigh them
    # differently (st['<name>'] for reflections, times st['t_<name>'] for light that has passed through the glass).
    comp = {}
    # the room: dark; darkest straight behind the glass (what shows through it, as the reference's backdrop)
    behind = ss(70, 30, np.abs((az - 90 + 180) % 360 - 180)) * ss(45, 10, np.abs(eld))
    comp['room'] = (1 - 0.7 * behind)[..., None] * np.array([1.0, 0.86, 0.84])
    # the floor's warm bounce: below the horizon, brightest in front of the glass, fading straight down
    comp['floor'] = (ss(-2, -14, eld) * ss(-85, -35, eld) * (0.45 + 0.55 * ss(120, 20, np.abs(dac))))[..., None] * warm
    # a big soft light overhead, leaning toward the camera
    ov = np.array([0.0, -0.1, 1.0]); ov /= np.linalg.norm(ov)
    ang = np.degrees(np.arccos(np.clip(dx * ov[0] + dy * ov[1] + dz * ov[2], -1, 1)))
    comp['over'] = ss(32, 20, ang)[..., None] * white
    # soft side panels, front left and right, and back left and right (the left and right ends' grazing edges)
    sp = 0
    for a0 in (cam - 70, cam + 70, cam - 125, cam + 125):
        da = np.abs((az - a0 + 180) % 360 - 180)
        sp = sp + ss(22, 12, da) * ss(-34, -22, eld) * ss(55, 40, eld)
    comp['side'] = sp[..., None] * white
    # a big soft box behind and above: what the top edges reflect at a grazing angle (out of the camera's sight)
    dab = np.abs((az - 90 + 180) % 360 - 180)
    comp['back'] = (ss(75, 60, dab) * ss(-3, 5, eld) * ss(60, 48, eld))[..., None] * white
    # soft strips above and in front, by the camera: broad bright bands along the fronts of the rolls, with dark
    # gaps between them (one big box would lay an even sheen over every face: chrome, not glass)
    fb = 0
    for e0, e1 in FILL_BANDS:
        fb = fb + ss(e0 - 4, e0 + 2, eld) * ss(e1 + 4, e1 - 2, eld)
    comp['fill'] = (ss(FILL_HALF_AZ, FILL_HALF_AZ - 14, np.abs(dac)) * fb)[..., None] * white
    # a black card where the camera looks straight through the glass: the backdrop (the camera looks TILT down)
    card = 1.0 - ss(48, 30, dab) * ss(-6, -10, eld) * ss(-40, -28, eld)
    comp['room'] = comp['room'] * card[..., None]
    comp['floor'] = comp['floor'] * card[..., None]
    base = sum(st[n] * c for n, c in comp.items()).astype(np.float32)
    base_t = sum(st[n] * st['t_' + n] * c for n, c in comp.items()).astype(np.float32)
    del comp
    img = np.zeros((h, w, 3), np.float32)
    # long thin hot strips: the narrow highlights along every roll
    def strip_h(e0, th, a0, span, rad, col):
        da = (az - a0 + 180) % 360 - 180
        m = ss(th, th * 0.5, np.abs(eld - e0)) * ss(span, span - 10, np.abs(da))
        img[...] += (rad * m)[..., None] * col
    def strip_v(a0, th, e_lo, e_hi, rad, col):
        da = (az - a0 + 180) % 360 - 180
        m = ss(th, th * 0.5, np.abs(da)) * ss(e_lo - 4, e_lo + 4, eld) * ss(e_hi + 4, e_hi - 4, eld)
        img[...] += (rad * m)[..., None] * col
    strip_h(23, 1.3, cam, 75, st['key'], peach)        # the key strip, in front: a hot line just over each crest
    strip_h(41, 1.6, cam, 65, st['key2'], peach)       # a second, higher, between the soft strips
    strip_h(16, 1.2, 90, 60, st['rim'], peach)         # low behind the glass: light along the top edges
    strip_v(cam - 55, 1.2, -8, 60, st['vert'], peach)  # thin verticals, front left and front right
    strip_v(cam + 55, 1.2, -8, 60, st['vert'], peach)
    strip_h(-8, 2.5, cam, 85, st['low'], warm)         # a low warm line in front: coral along the bottoms
    strips = img
    write_exr(path, base + strips)
    LIVE['env'] = (base + strips).astype(np.float32)
    # the same studio, softened: what light sees after it has passed through the glass (the strips only faintly:
    # they are small lamps, and inside the glass the big soft sources and the floor carry the light)
    # ... and the black card behind the glass, kept dark after the softening (a larger card: rays through the
    # glass leave its back bent by up to a few tens of degrees)
    soft = blur_equirect(base_t + st['strip_soft'] * strips, float(ARGS.get('soft_deg', 12.0)))
    c0, c1 = CARD['el']
    card_t = ss(CARD['half_az'], CARD['half_az'] - 12, dab) * ss(c0 - 6, c0 + 6, eld) * ss(c1 + 6, c1 - 6, eld)
    soft = soft * (1.0 - CARD['depth'] * card_t)[..., None]
    write_exr(path.replace('.exr', '_soft.exr'), soft)
    LIVE['env_soft'] = soft.astype(np.float32)
    return path

# The studio made for the live widget (phase 2's clear-glass pass, the owner, 17 November 2026): fewer, softer
# strips than Cycles' (which stays as it is): one hot strip in front for the narrow highlight along each roll, a soft
# light overhead, a warm floor and a low warm strip for the coral along the bottoms, soft panels for the ends, a dark
# card behind. Neutral: the live page warms it with the album. Radiances as Cycles' (the page applies the same gain).
# (Clear glass, not satin: broad sources only dim; what the glass mirrors is mostly dark, the few lights bright.)
LIVE_STUDIO = dict(room=0.008, floor=0.45, over=1.8, over_deg=26.0, back=0.3, side=0.22, key=70.0, key_el=24.0, key_half=1.4,
                   low=8.0, low_el=-7.0, low_half=3.0,
                   box=0.0, box_az=-130.0, box_el=38.0, box_haz=28.0, box_hel=16.0,
                   t_room=1.0, t_floor=0.45, t_over=0.5, t_back=0.2, t_side=0.4, t_box=0.3, strip_soft=0.03)

def make_env_live(w=2048, h=1024):
    """The live studio as a pair of panoramas (Blender's equirectangular mapping, rows from the bottom): what the
    glass mirrors, and what light sees after it has passed through the glass (softened, the card behind dark)."""
    st = dict(LIVE_STUDIO)
    st.update({k[3:]: float(v) for k, v in ARGS.items() if k.startswith('ls_')})
    u = (np.arange(w) + 0.5) / w
    v = (np.arange(h) + 0.5) / h
    U, V = np.meshgrid(u, v)
    phi = (0.5 - U) * 2 * np.pi
    el = (V - 0.5) * np.pi
    dx = np.cos(el) * np.cos(phi); dy = np.cos(el) * np.sin(phi); dz = np.sin(el)
    az = np.degrees(phi); eld = np.degrees(el)
    cam = -90.0
    dac = (az - cam + 180) % 360 - 180
    dab = np.abs((az - 90 + 180) % 360 - 180)
    def ss(e0, e1, x):
        t = np.clip((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)
    white = np.array([1.0, 0.98, 0.96]); warm = np.array([1.0, 0.82, 0.74])
    comp = {}
    comp['room'] = np.ones_like(eld)[..., None] * white
    comp['floor'] = (ss(-2, -16, eld) * ss(-85, -40, eld) * (0.4 + 0.6 * ss(120, 20, np.abs(dac))))[..., None] * warm
    ov = np.array([0.0, -0.15, 1.0]); ov /= np.linalg.norm(ov)
    ang = np.degrees(np.arccos(np.clip(dx * ov[0] + dy * ov[1] + dz * ov[2], -1, 1)))
    comp['over'] = ss(st['over_deg'], st['over_deg'] * 0.45, ang)[..., None] * white
    comp['back'] = (ss(80, 55, dab) * ss(0, 10, eld) * ss(55, 40, eld))[..., None] * white
    sp = 0
    for a0 in (cam - 75, cam + 75):
        sp = sp + ss(26, 12, np.abs((az - a0 + 180) % 360 - 180)) * ss(-20, -5, eld) * ss(45, 30, eld)
    comp['side'] = sp[..., None] * white
    # a large soft box above and to the left in front (the clear-glass polish): broad highlights on the faces turned
    # up and left (the bulb's ring, the waist's top, the sheet), with dark between, as the reference's rolls
    bx = (ss(st['box_haz'], st['box_haz'] * 0.35, np.abs((az - st['box_az'] + 180) % 360 - 180))
          * ss(st['box_hel'], st['box_hel'] * 0.35, np.abs(eld - st['box_el'])))
    comp['box'] = bx[..., None] * white
    card = 1.0 - ss(48, 30, dab) * ss(-6, -10, eld) * ss(-40, -28, eld)
    comp['room'] = comp['room'] * card[..., None]
    base = sum(st[n] * c for n, c in comp.items()).astype(np.float32)
    base_t = sum(st[n] * st['t_' + n] * c for n, c in comp.items()).astype(np.float32)
    strips = np.zeros((h, w, 3), np.float32)
    def strip_h(e0, half, span, rad, col):
        m = ss(half, half * 0.35, np.abs(eld - e0)) * ss(span, span - 18, np.abs(dac))
        strips[...] += (rad * m)[..., None] * col
    strip_h(st['key_el'], st['key_half'], 70, st['key'], white)          # the one hot strip in front
    strip_h(st['low_el'], st['low_half'], 85, st['low'], warm)           # low and warm: coral along the bottoms
    sharp = base + strips
    soft = blur_equirect(base_t + st['strip_soft'] * strips, float(ARGS.get('soft_deg', 12.0)))
    c0, c1 = CARD['el']
    card_t = ss(CARD['half_az'], CARD['half_az'] - 12, dab) * ss(c0 - 6, c0 + 6, eld) * ss(c1 + 6, c1 - 6, eld)
    soft = soft * (1.0 - CARD['depth'] * card_t)[..., None]
    return sharp.astype(np.float32), soft.astype(np.float32)

def write_exr(path, img):
    h, w = img.shape[:2]
    im = bpy.data.images.new('mercury3d_tmp_exr', w, h, alpha=False, float_buffer=True)
    rgba = np.concatenate([img.astype(np.float32), np.ones((h, w, 1), np.float32)], 2)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = path
    im.file_format = 'OPEN_EXR'
    im.save()
    bpy.data.images.remove(im)

def blur_equirect(img, sig_deg):
    """A Gaussian blur on the sphere, near enough: rows blurred wider toward the poles, columns evenly."""
    h, w = img.shape[:2]
    img = img[::2, ::2]                                  # half size is plenty for a soft copy
    h2, w2 = img.shape[:2]
    deg_px = 360.0 / w2
    el = ((np.arange(h2) + 0.5) / h2 - 0.5) * np.pi
    out = np.empty_like(img)
    x = np.arange(w2); x = np.minimum(x, w2 - x).astype(np.float64)       # circular distance from 0
    F = np.fft.rfft(img, axis=1)
    for y in range(h2):
        sx = min(sig_deg / deg_px / max(math.cos(el[y]), 0.08), w2 / 2.5)
        g = np.exp(-0.5 * (x / sx) ** 2); g /= g.sum()
        out[y] = np.fft.irfft(F[y] * np.fft.rfft(g)[:, None], n=w2, axis=0)
    sy = sig_deg / deg_px
    k = np.arange(-int(3 * sy), int(3 * sy) + 1)
    g = np.exp(-0.5 * (k / sy) ** 2); g /= g.sum()
    col = np.pad(out, ((len(k), len(k)), (0, 0), (0, 0)), mode='edge')
    res = np.empty_like(out)
    for c in range(3):
        res[:, :, c] = np.apply_along_axis(lambda r: np.convolve(r, g, 'same'), 0, col[:, :, c])[len(k):len(k) + h2]
    return np.repeat(np.repeat(res, 2, 0), 2, 1)[:h, :w]

def setup_world(sc, env_path, strength=1.0):
    wd = bpy.data.worlds.get('Mercury3D_Studio') or bpy.data.worlds.new('Mercury3D_Studio')
    wd.use_nodes = True
    nt = wd.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(env_path, check_existing=False)
    soft = nt.nodes.new('ShaderNodeTexEnvironment')
    soft.image = bpy.data.images.load(env_path.replace('.exr', '_soft.exr'), check_existing=False)
    # light that has passed through the glass sees the softened studio; reflections off the surface the sharp one
    lp = nt.nodes.new('ShaderNodeLightPath')
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
    nt.links.new(lp.outputs['Transmission Depth'], gt.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(gt.outputs[0], mix.inputs['Factor'])
    gain_r = nt.nodes.new('ShaderNodeMix'); gain_r.data_type = 'RGBA'; gain_r.blend_type = 'MULTIPLY'
    gain_r.inputs['Factor'].default_value = 1.0
    gain_r.inputs['B'].default_value = (*(3 * [float(ARGS.get('refl_gain', STUDIO_GAIN['refl']))]), 1)
    nt.links.new(env.outputs['Color'], gain_r.inputs['A'])
    gain_t = nt.nodes.new('ShaderNodeMix'); gain_t.data_type = 'RGBA'; gain_t.blend_type = 'MULTIPLY'
    gain_t.inputs['Factor'].default_value = 1.0
    gain_t.inputs['B'].default_value = (*(3 * [float(ARGS.get('refr_gain', STUDIO_GAIN['refr']))]), 1)
    nt.links.new(soft.outputs['Color'], gain_t.inputs['A'])
    nt.links.new(gain_r.outputs['Result'], mix.inputs['A'])
    nt.links.new(gain_t.outputs['Result'], mix.inputs['B'])
    bg.inputs['Strength'].default_value = strength
    nt.links.new(mix.outputs['Result'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    sc.world = wd

def setup_camera(sc, col, root):
    cd = bpy.data.cameras.get('Mercury3D_Cam') or bpy.data.cameras.new('Mercury3D_Cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = W * S
    cd.sensor_fit = 'HORIZONTAL'
    cd.clip_start = 1.0; cd.clip_end = 200.0
    cam = add_obj(col, 'Mercury3D_Camera', cd, root)
    cam.location = (0.0, -60.0, 0.0)
    cam.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = cam
    # the reference as the camera's background (seen in the camera view while modelling)
    ref = bpy.data.images.load(REF, check_existing=True)
    cd.show_background_images = True
    cd.background_images.clear()
    bgi = cd.background_images.new()
    bgi.image = ref
    bgi.alpha = 0.45
    bgi.display_depth = 'FRONT'
    bgi.frame_method = 'FIT'
    return cam

def render_settings(sc, samples=256, transparent=True):
    sc.render.engine = 'CYCLES'
    sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.color_depth = '16'
    cy = sc.cycles
    cy.samples = samples
    cy.use_denoising = True
    cy.max_bounces = 48; cy.transmission_bounces = 48; cy.glossy_bounces = 24
    cy.transparent_max_bounces = 16; cy.diffuse_bounces = 3; cy.volume_bounces = 2
    cy.caustics_reflective = True; cy.caustics_refractive = True
    cy.blur_glossy = 0.4
    cy.sample_clamp_indirect = 12.0
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.view_settings.look = ARGS.get('look', 'AgX - Medium High Contrast')
    except TypeError:
        pass
    sc.view_settings.exposure = float(ARGS.get('exposure', 0.0))

def use_gpu(sc):
    try:
        cp = bpy.context.preferences.addons['cycles'].preferences
        cp.compute_device_type = 'OPTIX'
        cp.get_devices()
        for d in cp.devices:
            d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('GPU not set:', e)

def guide_curve(col, name, pts_uvd, colour, parent, closed=False, width=0.012):
    cu = bpy.data.curves.get(name) or bpy.data.curves.new(name, 'CURVE')
    cu.splines.clear()
    cu.dimensions = '3D'
    cu.bevel_depth = width
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts_uvd) - 1)
    for p, (u, v, d) in zip(sp.points, pts_uvd):
        q = L(u, v, d - 160)       # drawn in front of the glass so it stays visible
        p.co = (q.x, q.y, q.z, 1)
    sp.use_cyclic_u = closed
    ob = add_obj(col, name, cu, parent)
    ob.hide_render = True
    m = bpy.data.materials.get(name + '_m') or bpy.data.materials.new(name + '_m')
    m.diffuse_color = colour
    cu.materials.clear(); cu.materials.append(m)
    ob.color = colour
    return ob

# ------------------------------------------------------------------------------------------------ main
def build(cover_path=None, zebra=False):
    sc = get_scene()
    col = clear_collection(sc, 'Mercury3D')
    gcol = clear_collection(sc, 'Mercury3D_Guides')
    for n in ('Mercury3D_Root',):
        ob = bpy.data.objects.get(n)
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)
    root = bpy.data.objects.new('Mercury3D_Root', None)
    col.objects.link(root)
    root.rotation_euler = (-TILT, 0, 0)

    if cover_path and cover_path.startswith('real:'):
        cover_path = real_cover(int(cover_path[5:]))
    cover_path = cover_path or TEST_COVER
    tint = album_colour(cover_path)
    LIVE['tint'] = [float(x) for x in tint]; LIVE['cover_path'] = cover_path
    log('album colour', tuple(round(x, 3) for x in tint))

    F, parts = build_field()
    if 'blur' in ARGS:
        F = blur3(F, int(ARGS['blur']))
    me = field_to_mesh(F, 'Mercury3D_GlassMesh')
    del F
    glass = add_obj(col, 'Mercury3D_Glass', me, root)
    if 'bands' in FLAGS:
        zebra = True                     # (the same treatment as the zebra view: a diagnostic, no studio needed)
    look = (bands_material() if 'bands' in FLAGS else zebra_material() if zebra else clay_material() if 'clay' in FLAGS
            else chrome_material() if 'chrome' in FLAGS else glass_material(tint))
    glass.data.materials.append(look)

    # cover
    cme = cover_mesh('Mercury3D_CoverMesh')
    cov = add_obj(col, 'Mercury3D_Cover', cme, root)
    c = COVER
    tilt = math.radians(c['tilt'])
    # the slab's local origin is its face centre; place its bottom edge at (cu, bottom, d_front)
    cov.rotation_euler = (-tilt, 0, 0)
    half = c['side'] / 2 * S
    bottom = L(c['cu'], c['bottom'], c['d_front'])
    cov.location = bottom + Vector((0, half * math.sin(tilt), half * math.cos(tilt)))
    cov.data.materials.append(look if (zebra or 'clay' in FLAGS or 'chrome' in FLAGS) else cover_material(cover_path, float(ARGS.get('glow', 1.0))))

    # guides (viewport only)
    rim, ridge = parts['rim'], parts['ridge']
    guide_curve(gcol, 'G_rim', [(p[0], p[1], p[2]) for p in rim[::2]], (0.1, 0.9, 1.0, 1), root, closed=True)
    guide_curve(gcol, 'G_ridge', [(p[0], p[1], p[2]) for p in ridge[::2]], (1.0, 0.9, 0.1, 1), root)

    env_path = os.path.join(RAW, 'studio.exr')
    make_env(env_path, tint)
    setup_world(sc, env_path, float(ARGS.get('env', 1.0)))
    setup_camera(sc, col, root)
    render_settings(sc, int(ARGS.get('samples', 256)), transparent='backdrop' not in FLAGS)
    sc.render.resolution_percentage = int(ARGS.get('pct', 100))
    log('built')
    return sc

def solid_preview(sc):
    """A quick clay look in Workbench: studio light, cavity, one colour. For judging the form only."""
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'SINGLE'
    sh.single_color = (0.62, 0.6, 0.6)
    sh.show_cavity = True
    sh.cavity_type = 'WORLD'
    sh.show_specular_highlight = True
    sc.display.render_aa = '8'

def oblique(sc, yaw, pitch):
    cam = sc.camera
    root = bpy.data.objects['Mercury3D_Root']
    r = 60.0
    y, p = math.radians(yaw), math.radians(pitch)
    cam.location = (r * math.sin(y) * math.cos(p), -r * math.cos(y) * math.cos(p), r * math.sin(p))
    cam.rotation_euler = (math.radians(90) - p, 0, y)

def render(out):
    sc = bpy.context.scene
    if 'solid' in FLAGS:
        solid_preview(sc)
    else:
        use_gpu(sc)
    if 'yaw' in ARGS or 'pitch' in ARGS:
        oblique(sc, float(ARGS.get('yaw', 0)), float(ARGS.get('pitch', 0)))
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    log('rendered', out)

def half_bin(path, img):
    """An image (rows from the bottom, as Blender keeps them) as RGBA half floats, for the live page."""
    h, w = img.shape[:2]
    a = np.ones((h, w, 4), np.float16)
    a[..., :3] = np.clip(img[..., :3], 0, 60000).astype(np.float16)
    a.tofile(path)
    return [w, h]

def bleed(a, it=24):
    """Spread an RGBA image's colour outward from where alpha is set, a pixel per step (alpha kept), so filtering
    at the outline never reads black."""
    rgb = a[..., :3] * (a[..., 3:4] > 0.5); w = (a[..., 3] > 0.5).astype(np.float32)
    for _ in range(it):
        s = np.zeros_like(rgb); c = np.zeros_like(w)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            s += np.roll(np.roll(rgb * w[..., None], dy, 0), dx, 1); c += np.roll(np.roll(w, dy, 0), dx, 1)
        grow = (w == 0) & (c > 0)
        rgb[grow] = s[grow] / c[grow][:, None]; w = np.maximum(w, grow.astype(np.float32))
    out = a.copy(); out[..., :3] = rgb
    return out

def tone_lut(sc, d, n=33):
    """Blender's own view transform (AgX with the scene's look and exposure) as a 3D table for the live page, so the
    live glass is tone-mapped exactly as Cycles' still is: inputs on AgX's log scale (log2 of linear light from
    -12.47 to 4.03, per channel), outputs the display's values. tone.bin: n^3 RGBA half floats, red fastest, then
    green, then blue."""
    lo, hi = -12.47393, 4.026069
    vals = (2.0 ** (lo + np.linspace(0, 1, n) * (hi - lo))).astype(np.float32)
    img = np.ones((n, n * n, 4), np.float32)                 # rows: green; columns: blue * n + red
    for bi in range(n):
        img[:, bi * n:(bi + 1) * n, 0] = vals[None, :]
        img[:, bi * n:(bi + 1) * n, 1] = vals[:, None]
        img[:, bi * n:(bi + 1) * n, 2] = vals[bi]
    im = bpy.data.images.new('mercury3d_tone', n * n, n, alpha=True, float_buffer=True)
    im.pixels.foreach_set(img.ravel())
    keep = (sc.render.image_settings.file_format, sc.render.image_settings.color_depth, sc.render.image_settings.color_mode)
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_depth = '16'
    sc.render.image_settings.color_mode = 'RGBA'
    path = os.path.join(d, 'tone.png')
    im.save_render(filepath=path, scene=sc)
    bpy.data.images.remove(im)
    sc.render.image_settings.file_format, sc.render.image_settings.color_depth, sc.render.image_settings.color_mode = keep
    back = bpy.data.images.load(path, check_existing=False)
    back.colorspace_settings.name = 'Non-Color'
    out = np.array(back.pixels[:], np.float32).reshape(n, n * n, 4)
    bpy.data.images.remove(back)
    out = out.reshape(n, n, n, 4).transpose(1, 0, 2, 3)     # (green, blue, red) -> (blue, green, red)
    out[..., 3] = 1.0
    out.astype(np.float16).tofile(os.path.join(d, 'tone.bin'))
    log('tone table: view %s, look %s; mid grey .18 -> %.3f' % (sc.view_settings.view_transform, sc.view_settings.look,
        float(np.interp(math.log2(0.18), lo + np.linspace(0, 1, n) * (hi - lo), out[n // 2 * 0 + int(round((math.log2(0.18) - lo) / (hi - lo) * (n - 1))), int(round((math.log2(0.18) - lo) / (hi - lo) * (n - 1))), :, 0]))))
    return dict(n=n, lo=lo, hi=hi)

def export_live(d, sc):
    """Everything the live widget (prototypes/glass3d/) draws this model with, written to folder d (keep it in
    design/captures/raw/: it is rebuilt, never committed):
      glass.bin   the glass: positions, normals (from the distance field), UVs (the camera's projection: u / W,
                  1 - v / H), then triangles; Blender coordinates in the root's frame (the camera looks along +Y)
      light.bin   Cycles' light on the glass, an image wrapped on it by those UVs (W x H, RGBA half floats): the
                  glass standing in as white diffuse, the cover a black card, the studio as rendered
      cover.bin   the cover's slab as triangles: position, UV
      env.bin, env-soft.bin   the studio pair (Blender's equirectangular mapping, rows from the bottom)
      meta.json   sizes, the frame, the tilt, the cover's frame, the album's colour"""
    os.makedirs(d, exist_ok=True)
    bpy.context.view_layer.update()
    meta = dict(W=W, H=H, CX=CX, CY=CY, S=S, tilt=math.degrees(TILT), vox=VOX, tint=LIVE['tint'],
                map='u = 0.5 - atan2(y, x) / 2pi, v = 0.5 + asin(z) / pi (world: the root frame turned by the tilt '
                    'about X); rows from the bottom')
    g = bpy.data.objects['Mercury3D_Glass']; me = g.data
    me.calc_loop_triangles()
    n = len(me.vertices)
    co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nr = LIVE['normals']
    tri = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', tri)
    uv = np.stack([(co[:, 0] / S + CX) / W, 1.0 - (CY - co[:, 2] / S) / H], 1).astype(np.float32)
    with open(os.path.join(d, 'glass.bin'), 'wb') as f:
        co.tofile(f); nr.astype(np.float32).tofile(f); uv.tofile(f); tri.astype(np.uint32).tofile(f)
    meta['glass'] = dict(verts=n, tris=len(tri) // 3)
    # the cover: its slab as triangles (position in the root's frame, UV), and its frame for the art seen through
    # the glass (the inverse of its placement: root frame -> its own, where the face is y ~ 0, x across, z up)
    cov = bpy.data.objects['Mercury3D_Cover']; cm = cov.data
    cm.calc_loop_triangles()
    M = cov.matrix_local.copy()
    uvl = cm.uv_layers[0].data
    out = []
    for t in cm.loop_triangles:
        for li in t.loops:
            q = M @ cm.vertices[cm.loops[li].vertex_index].co
            out.append([q.x, q.y, q.z, uvl[li].uv[0], uvl[li].uv[1]])
    np.array(out, np.float32).tofile(os.path.join(d, 'cover.bin'))
    meta['cover'] = dict(count=len(out), inv=[list(r) for r in M.inverted()], half=COVER['side'] / 2 * S,
                         corner=COVER['corner'] * S, side=COVER['side'] * S)
    meta['tone'] = tone_lut(sc, d)
    # the studio pair
    meta['env'] = half_bin(os.path.join(d, 'env.bin'), LIVE['env'])
    soft = LIVE['env_soft']
    hs, ws = soft.shape[0] // 2, soft.shape[1] // 2
    soft = soft[:hs * 2, :ws * 2].reshape(hs, 2, ws, 2, 3).mean((1, 3))
    meta['envSoft'] = half_bin(os.path.join(d, 'env-soft.bin'), soft)
    # the studio made for the live widget
    sharp, soft = make_env_live()
    meta['envLive'] = half_bin(os.path.join(d, 'env-live.bin'), sharp)
    hs, ws = soft.shape[0] // 2, soft.shape[1] // 2
    meta['envLiveSoft'] = half_bin(os.path.join(d, 'env-live-soft.bin'), soft[:hs * 2, :ws * 2].reshape(hs, 2, ws, 2, 3).mean((1, 3)))
    # Cycles' light on the glass, rendered from the camera onto those UVs (the glass white diffuse, the cover black)
    if 'nolight' not in FLAGS:
        use_gpu(sc)
        keep = (list(g.data.materials), list(cov.data.materials))
        m, nt, o = node_mat('Mercury3D_BakeWhite')
        df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (1, 1, 1, 1)
        nt.links.new(df.outputs['BSDF'], o.inputs['Surface'])
        k, nt2, o2 = node_mat('Mercury3D_BakeBlack')
        db = nt2.nodes.new('ShaderNodeBsdfDiffuse'); db.inputs['Color'].default_value = (0, 0, 0, 1)
        nt2.links.new(db.outputs['BSDF'], o2.inputs['Surface'])
        g.data.materials.clear(); g.data.materials.append(m)
        cov.data.materials.clear(); cov.data.materials.append(k)
        sc.render.film_transparent = True
        sc.render.image_settings.file_format = 'OPEN_EXR'; sc.render.image_settings.color_depth = '32'
        sc.render.image_settings.color_mode = 'RGBA'
        sc.view_settings.view_transform = 'Standard'
        sc.cycles.samples = int(ARGS.get('light_samples', 128))
        path = os.path.join(d, 'light.exr')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(path, check_existing=False)
        w_, h_ = im.size
        a = np.array(im.pixels[:], np.float32).reshape(h_, w_, 4)
        bpy.data.images.remove(im)
        a = bleed(a)
        meta['light'] = half_bin(os.path.join(d, 'light.bin'), a)
        lum = a[..., :3] @ np.array([.2126, .7152, .0722])
        inside = a[..., 3] > 0.5
        meta['lightRef'] = float(np.percentile(lum[inside], 90)) if inside.any() else 1.0
        g.data.materials.clear(); [g.data.materials.append(x) for x in keep[0]]
        cov.data.materials.clear(); [cov.data.materials.append(x) for x in keep[1]]
    json.dump(meta, open(os.path.join(d, 'meta.json'), 'w'), indent=1)
    log('exported', d, meta['glass'])

if __name__ == '__main__' or 'MERCURY_ARGS' in globals():
    sc = build(ARGS.get('cover'), zebra='zebra' in FLAGS)
    if 'export' in ARGS and bpy.app.background:
        export_live(os.path.abspath(ARGS['export']), sc)
    if 'save' in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=ARGS['save'])
    if 'render' in FLAGS and bpy.app.background:
        render(ARGS.get('out', os.path.join(RAW, 'still.png')))
