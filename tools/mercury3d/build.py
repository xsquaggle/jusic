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
VOX = 2.0                   # voxel size in pixels
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
    ((24, 365),          52,  -6, 1.45,  0),   # the bulb's left end: a thick ring
    ((48, 495),          40,  -4, 1.40,  0),
    ((80, 566),          28,   0, 1.50,  0),   # passes close to the cover's lower left corner
    ((125, 622),         28,   2, 1.40,  0),
    ((200, 684),         46,  14,  .85,  0),   # the bulb's fat bottom
    ((350, 734),         66,  12,  .90,  0),
    ((450, 744),         72,  12,  .90,  0),
    ((650, 721),         62,  10,  .90,  0),
    ((850, 662),         48,   6,  .90,  0),   # the lower band under the waist
    ((1050, 622),        42,   6,  .90,  0),
    ((1300, 664),        50,   6,  .90,  0),   # under the buttons
    ((1398, 626),        30,   2,  .80,  0),
    ((1475, 566),        16, -14,  .95,  0),   # the band's end, under the tail
    (TIP,                 5, -38,  .95,  0),   # the tail tip, curled forward
    ((1547, 528),        14, -22,  .95,  0),
    ((1556, 470),        26,   4,  .95,  0),   # round the right end
    ((1506, 343),        24,   2, 1.15,  0),
    ((1326, 252),        21,   0, 1.30,  0),   # the right lobe's top: the sheet hangs from here
    ((1126, 294),        22,   0, 1.30,  0),
    ((946, 378),         27,  -2, 1.30,  0),   # where the twist nearly touches it
    ((806, 421),         25,  -2, 1.50,  0),   # the waist's top edge
    ((566, 347),         24,   0, 1.60,  0),
    ((466, 271),         16,   2, 1.60,  0),   # past the cover's top right corner: thin, deep
    ((406, 225),         24,   0, 1.40,  0),
    ((286, 208),         33,   0, 1.35,  0),   # the bulb's top
    ((146, 230),         24,   0, 1.45,  0),
    ((86, 272),          34,   0, 1.60,  0),
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
CHANNEL_CENTRE = (1240, 520)  # a point inside the channel under the sheet's lip
LIP = dict(attach=0.35, gap=8.0, drop=16.0)   # the sheet meets the lip this far toward its crest; the fold under it

# The cover: a square slab resting on the ridge, tilted back so its top sinks deeper into the pocket.
POCKET = dict(margin=5.0, behind=4.0, k=9.0)   # the dent round the cover: clearance, depth behind its back, lip
COVER = dict(cu=295.0, bottom=572.0, side=302.0, tilt=4.0, d_front=4.0, thick=8.0, corner=28.0, dome=3.0)

# The button wells in the channel: centre, radius on the surface, depth.
WELLS = [(1077, 467, 58, 16), (1237, 460, 82, 20), (1392, 467, 58, 16)]

WELL_LIP = dict(r=7.0, out=1.0, raise_=0.0, k=7.0)
WELL_LIP['raise'] = 4.0
# The fold under the sheet's lip: a groove carved along under the ridge's free part (offset toward the channel,
# set back behind the ridge's centre), so the lip truly overhangs and a narrow dark gap runs beneath it.
FOLD = dict(r=13.0, off=4.0, back=10.0, k=6.0)

# Membrane: pressures (negative sags back, away from the camera) and smoothing.
MEM = dict(p_front=-0.006, p_channel=-0.0022, p_sheet=0.0012, k_rim=16.0, k_ridge=11.0, k_sheet=14.0, k_well=10.0)

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
    pins_f |= pocket
    fval = np.where(pocket, cover_back_depth(GV) + 3.0, fval)
    # the sag: the words' hollow is shallow; the channel under the buttons spans more, so it sags less per pixel;
    # the sheet between the rim and the lip bulges forward
    pf = np.interp(GU, [0, 980, 1060, 1600], [MEM['p_front'], MEM['p_front'], MEM['p_channel'], MEM['p_channel']])
    sheet_poly = np.vstack([sheet_rim_span(rim)[:, :2], ridge[ridge[:, 0] >= SHEET['ridge_from_u']][::-1, :2]])
    in_sheet = poly_inside(sheet_poly, GU, GV) & inside
    pf = np.where(in_sheet, MEM['p_sheet'], pf)
    f = poisson(pins_f, fval, pf, cell, 400)
    f = np.where(inside, gblur2(f, 2.5), f)
    # the back: rounded like a pebble, deepest behind the bulb, leaving the rim's back gently
    Bdep = np.interp(GU, [u for u, _ in BACK], [d for _, d in BACK])
    q = np.clip(-sd2 / BACK_REACH, 0, 1)
    b = d_rim + Bdep * (q * q * (3 - 2 * q)) ** 0.75
    b = gblur2(b, 4.0)
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

    # ---- wells: smooth subtraction of spheres from the membrane's front (before the rolls and the sheet go on)
    for (wu, wv, rho, w) in WELLS:
        R = (rho * rho + w * w) / (2 * w)
        fl = float(bilinear(f, cell, U0, V0, np.array([wu]), np.array([wv]))[0])
        cd = fl + w - R          # the sphere's centre, in front of the floor
        pad = 24
        i0, i1 = int((wu - R - pad - U0) / VOX), int((wu + R + pad - U0) / VOX) + 1
        k0, k1 = int((V1 - (wv + R + pad)) / VOX), int((V1 - (wv - R - pad)) / VOX) + 1
        j0, j1 = int((cd - R - pad - D0) / VOX), int((cd + R + pad - D0) / VOX) + 1
        i0, k0, j0 = max(i0, 0), max(k0, 0), max(j0, 0)
        i1, k1, j1 = min(i1, NX), min(k1, NZ), min(j1, NY)
        uu = (U0 + np.arange(i0, i1) * VOX)[:, None, None]
        dd = (D0 + np.arange(j0, j1) * VOX)[None, :, None]
        vv = (V1 - np.arange(k0, k1) * VOX)[None, None, :]
        sph = np.sqrt((uu - wu) ** 2 + (vv - wv) ** 2 + (dd - cd) ** 2) - R
        blk = smax(mem[i0:i1, j0:j1, k0:k1], -sph, MEM['k_well'])
        # the well's own lip: a rounded ring standing a little proud of the floor round the dish
        lip = WELL_LIP
        qr = np.sqrt((uu - wu) ** 2 + (vv - wv) ** 2) - (rho + lip['out'])
        qd = dd - (fl - lip['raise'])
        tor = np.sqrt(qr ** 2 + qd ** 2) - lip['r']
        mem[i0:i1, j0:j1, k0:k1] = smin(blk, tor, lip['k'])
    log('wells cut')
    pocket_cut(mem)
    log('pocket cut')

    # ---- rolls
    Pr, Qr = tube_mesh(rim, closed=True)
    # a wider blend behind (the back leaves the rim in a long smooth curve), a tighter one in front
    kr = (MEM['k_rim'] + 34.0 * np.clip((ds - 30.0) / 80.0, 0, 1)).astype(np.float32)[None, :, None]
    F = smin(mem, level_set(Pr, Qr, half_width=26.0), kr)
    del mem
    log('rim joined')
    Pg, Qg = tube_mesh(ridge, closed=False)
    F = smin(F, level_set(Pg, Qg), MEM['k_ridge'])
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

def pocket_cut(F):
    """Carve the cover's pocket: the cover's rounded square, a little larger, open toward the camera, so the
    cover sits in air in a dent with a rounded lip and no glass over its face."""
    c = COVER
    t = math.radians(c['tilt'])
    m = POCKET['margin']; half = c['side'] / 2 + m; rc = c['corner'] + m
    Bu, Bv, Bd = c['cu'], c['bottom'], c['d_front']
    pad = 40
    i0, i1 = int((Bu - half - pad - U0) / VOX), int((Bu + half + pad - U0) / VOX) + 1
    k0, k1 = int((V1 - (Bv + pad)) / VOX), int((V1 - (Bv - c['side'] - pad)) / VOX) + 1
    i0, k0 = max(i0, 0), max(k0, 0); i1, k1 = min(i1, NX), min(k1, NZ)
    uu = (U0 + np.arange(i0, i1) * VOX)[:, None, None]
    dd = (D0 + np.arange(NY) * VOX)[None, :, None]
    vv = (V1 - np.arange(k0, k1) * VOX)[None, None, :]
    x = uu - Bu
    y = (vv - Bv) * (-math.cos(t)) + (dd - Bd) * math.sin(t) - c['side'] / 2   # up the face, from its middle
    z = (vv - Bv) * (-math.sin(t)) + (dd - Bd) * (-math.cos(t))                # in front of the face
    qx = np.abs(x) - (half - rc); qy = np.abs(y) - (half - rc)
    d2 = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - rc
    cut = np.maximum(d2, -(z + c['thick'] + POCKET['behind']))
    F[i0:i1, :, k0:k1] = smax(F[i0:i1, :, k0:k1], -cut, POCKET['k'])

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
    b.inputs['Coat Weight'].default_value = float(ARGS.get('cover_coat', 0.035))
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
    # the same studio, softened: what light sees after it has passed through the glass (the strips only faintly:
    # they are small lamps, and inside the glass the big soft sources and the floor carry the light)
    # ... and the black card behind the glass, kept dark after the softening (a larger card: rays through the
    # glass leave its back bent by up to a few tens of degrees)
    soft = blur_equirect(base_t + st['strip_soft'] * strips, float(ARGS.get('soft_deg', 12.0)))
    c0, c1 = CARD['el']
    card_t = ss(CARD['half_az'], CARD['half_az'] - 12, dab) * ss(c0 - 6, c0 + 6, eld) * ss(c1 + 6, c1 - 6, eld)
    soft = soft * (1.0 - CARD['depth'] * card_t)[..., None]
    write_exr(path.replace('.exr', '_soft.exr'), soft)
    return path

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
    log('album colour', tuple(round(x, 3) for x in tint))

    F, parts = build_field()
    if 'blur' in ARGS:
        F = blur3(F, int(ARGS['blur']))
    me = field_to_mesh(F, 'Mercury3D_GlassMesh')
    del F
    glass = add_obj(col, 'Mercury3D_Glass', me, root)
    look = (zebra_material() if zebra else clay_material() if 'clay' in FLAGS else chrome_material() if 'chrome' in FLAGS
            else glass_material(tint))
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

if __name__ == '__main__' or 'MERCURY_ARGS' in globals():
    sc = build(ARGS.get('cover'), zebra='zebra' in FLAGS)
    if 'save' in ARGS:
        bpy.ops.wm.save_as_mainfile(filepath=ARGS['save'])
    if 'render' in FLAGS and bpy.app.background:
        render(ARGS.get('out', os.path.join(RAW, 'still.png')))
