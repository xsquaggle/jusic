"""
Side by side and overlay of renders against the reference, at the same framing (run in background Blender).

blender -b --factory-startup -P tools/mercury3d/compare.py -- out=<png> a=<png> [b=<png> ...] [bg=r,g,b] [half]
    [overlay=<png>]  (a 50/50 blend of the reference and the first render)
    [labels=<png>]   (the live layer, words and controls, laid on each render)
    [glow=<strength>] [glow_rgb=r,g,b]  (soft warm pools of light below the lobes, from each render's own outline)
    [noref]          (leave the reference out)

Renders with alpha are laid over a plain backdrop close to the reference's own (dark maroon) unless bg is given.
"""
import bpy, numpy as np, os, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ARGS = {}
LIST = []
for a in argv:
    if '=' in a:
        k, v = a.split('=', 1)
        if k in ('a', 'b', 'c', 'd'):
            LIST.append(v)
        else:
            ARGS[k] = v
    else:
        ARGS[a] = True

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
REF = os.path.join(REPO, 'design', 'references', 'widget-mercury.png')

def load(path):
    im = bpy.data.images.load(path, check_existing=False)
    im.colorspace_settings.name = 'sRGB'
    w, h = im.size
    a = np.array(im.pixels[:], np.float32).reshape(h, w, im.channels)[::-1]
    bpy.data.images.remove(im)
    if a.shape[2] == 3:
        a = np.concatenate([a, np.ones((h, w, 1), np.float32)], 2)
    return a

def save(path, a):
    h, w = a.shape[:2]
    im = bpy.data.images.new('out', w, h, alpha=True)
    im.pixels.foreach_set(np.ascontiguousarray(a[::-1]).ravel())
    im.filepath_raw = path; im.file_format = 'PNG'; im.save()
    bpy.data.images.remove(im)

def backdrop(h, w):
    # a dark warm backdrop with a soft falloff, close to the reference's
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((x - w * 0.5) / (w * 0.7)) ** 2 + ((y - h * 0.5) / (h * 0.8)) ** 2)
    base = np.array([0.105, 0.06, 0.068]) * (1.0 - 0.45 * np.clip(r, 0, 1))[..., None]
    if 'bg' in ARGS:
        base = np.ones((h, w, 3)) * np.array([float(c) for c in ARGS['bg'].split(',')])
    return base.astype(np.float32)

def blur1(x, sig, axis):
    k = np.arange(-int(3 * sig), int(3 * sig) + 1)
    g = np.exp(-0.5 * (k / sig) ** 2); g /= g.sum()
    return np.apply_along_axis(lambda r: np.convolve(np.pad(r, len(k), mode='edge'), g, 'same')[len(k):-len(k)], axis, x)

def floor_glow(alpha, strength, rgb):
    """Soft warm pools where a floor would be: the glass's outline, dropped below itself, flattened and blurred,
    stronger under the fat lobes than under the waist. Never a halo round the outline: only below it."""
    h, w = alpha.shape
    a = alpha[::4, ::4]
    mass = a.sum(0)                                   # how much glass stands over each column
    bottom = np.array([np.max(np.nonzero(a[:, x] > 0.5)[0]) if (a[:, x] > 0.5).any() else 0 for x in range(a.shape[1])])
    g = np.zeros_like(a)
    for x in range(a.shape[1]):
        if bottom[x] > 0:
            y = min(bottom[x] + 12, a.shape[0] - 1)
            g[y, x] = mass[x] ** 1.5
    g = blur1(blur1(g, 18, 1), 4.5, 0)
    g /= max(g.max(), 1e-6)
    g = np.repeat(np.repeat(g, 4, 0), 4, 1)[:h, :w]
    return (strength * g)[..., None] * np.array(rgb)[None, None, :]

def over(a, bg):
    # renders are straight alpha in PNG; composite over bg (both sRGB-encoded values: good enough for a look)
    al = a[..., 3:4]
    return a[..., :3] * al + bg * (1 - al)

ref = load(REF)
h, w = ref.shape[:2]
tiles = [ref[..., :3]]
if 'noref' in ARGS:
    tiles = []
lab = load(ARGS['labels']) if 'labels' in ARGS else None
for p in LIST:
    a = load(p)
    if a.shape[:2] != (h, w):
        raise SystemExit('size mismatch: %s' % p)
    t = over(a, backdrop(h, w))
    if 'glow' in ARGS:
        rgb = [float(c) for c in ARGS.get('glow_rgb', '1.0,0.5,0.42').split(',')]
        t = t + floor_glow(a[..., 3], float(ARGS['glow']), rgb) * (1 - a[..., 3:4])
    if lab is not None:
        t = lab[..., :3] * lab[..., 3:4] + t * (1 - lab[..., 3:4])
    tiles.append(np.clip(t, 0, 1))

if 'overlay' in ARGS:
    a = load(ARGS['overlay'])
    o = 0.5 * ref[..., :3] + 0.5 * over(a, backdrop(h, w))
    tiles = [o]

gap = 8
cols = 1 if ('stack' in ARGS or len(tiles) == 1) else 2
rows = (len(tiles) + cols - 1) // cols
out = np.zeros((rows * h + (rows - 1) * gap, cols * w + (cols - 1) * gap, 4), np.float32)
out[..., :3] = 0.04; out[..., 3] = 1
for i, t in enumerate(tiles):
    r, c = divmod(i, cols)
    out[r * (h + gap):r * (h + gap) + h, c * (w + gap):c * (w + gap) + w, :3] = t
if 'half' in ARGS:
    H2, W2 = out.shape[0] // 2 * 2, out.shape[1] // 2 * 2
    out = out[:H2, :W2].reshape(H2 // 2, 2, W2 // 2, 2, 4).mean((1, 3))
if 'crop' in ARGS:
    x0, y0, x1, y1 = [int(v) for v in ARGS['crop'].split(',')]
    out = out[y0:y1, x0:x1]
save(ARGS['out'], out)
print('saved', ARGS['out'], out.shape)
