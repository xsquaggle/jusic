"""
Region by region brightness and colour of renders against the reference (run in background Blender).

blender -b --factory-startup -P tools/mercury3d/regions.py -- a=<png> [b=<png> ...] [scale=0.5]

For each named box (reference pixels) prints the median luminance (0..255, sRGB values), the 90th percentile
(how hot the highlights get), the 10th (how deep the darks go) and the mean colour, for the reference and each
render (renders laid over the reference's backdrop colour). Text and controls in the reference skew a box's mean,
so the median and percentiles are what to compare.
"""
import bpy, numpy as np, os, sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
LIST = [a.split('=', 1)[1] for a in argv if a.startswith(('a=', 'b=', 'c=', 'd=', 'e='))]
ARGS = dict(a.split('=', 1) for a in argv if '=' in a)
HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, '..', '..', 'design', 'references', 'widget-mercury.png')

BOXES = {
    'ring left':      (40, 330, 120, 470),
    'ring top':       (160, 214, 420, 262),
    'bulb low-left':  (70, 580, 200, 690),
    'ridge (cover)':  (200, 568, 440, 592),
    'band (bulb)':    (220, 645, 520, 725),
    'hollow':         (480, 360, 880, 540),
    'band (waist)':   (660, 615, 900, 665),
    'twist':          (880, 390, 1010, 480),
    'sheet':          (1080, 270, 1420, 350),
    'wells':          (1020, 400, 1450, 530),
    'band (right)':   (1100, 600, 1400, 650),
    'right end':      (1480, 330, 1555, 520),
}

def load(path):
    im = bpy.data.images.load(path, check_existing=False)
    w, h = im.size
    a = np.array(im.pixels[:], np.float32).reshape(h, w, im.channels)[::-1]
    bpy.data.images.remove(im)
    if a.shape[2] == 3:
        a = np.concatenate([a, np.ones((h, w, 1), np.float32)], 2)
    return a

def prep(a, shape):
    if a.shape[:2] != shape:
        k = shape[0] / a.shape[0]
        a = np.repeat(np.repeat(a, int(round(k)), 0), int(round(k)), 1)[:shape[0], :shape[1]]
    bg = np.array([0.105, 0.06, 0.068])
    al = a[..., 3:4]
    return a[..., :3] * al + bg * (1 - al)

ref = load(REF)[..., :3]
ims = [('reference', ref)] + [(os.path.basename(p), prep(load(p), ref.shape[:2])) for p in LIST]
lum = lambda x: (0.2126 * x[..., 0] + 0.7152 * x[..., 1] + 0.0722 * x[..., 2]) * 255
print('%-15s' % 'region' + ''.join('%-30s' % n[:28] for n, _ in ims))
print('%-15s' % '' + ''.join('%-30s' % 'p10/med/p90  r,g,b' for _ in ims))
for name, (u0, v0, u1, v1) in BOXES.items():
    row = '%-15s' % name
    for _, im in ims:
        c = im[v0:v1, u0:u1]
        L = lum(c).ravel()
        m = c.reshape(-1, 3).mean(0) * 255
        row += '%3d/%3d/%3d  %3d,%3d,%3d     ' % (np.percentile(L, 10), np.median(L), np.percentile(L, 90), *m)
    print(row)
