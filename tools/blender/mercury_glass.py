"""
Mercury as a real glass object (the owner's step 1, 16 November 2026): a proof that a true 3D render of our
shape can come close to the main reference before any more tuning of material 2.

Builds the widget as one solid of clear glass from the prototype's own layout (tools/blender/export-layout.js
writes it): the outline, the fitted ridge, the cover, the buttons, the timeline and the volume. The solid is a
signed distance field worked out with numpy and meshed with OpenVDB:
  - the body: the outline inflated, round in cross-section, fuller in the lobes, its back flatter;
  - the cover sunk in a pocket cut into the bulb, so the bulb's glass is a thick rounded ring round it;
  - the ridge: a roll along the fitted ridge, from under the cover (the cover rests on it), up through the twist,
    along the edge of the sheet over the buttons, round into the tail tip;
  - the sheet over the buttons thicker than the glass below it, the ridge its rolled lip over the channel;
  - the buttons as wells in that channel; the lower band as a roll of its own; a soft hollow under the words.
Then clear glass (IOR 1.5, a faint warm tint inside), the cover as a glossy picture that gives off a little
light, the timeline and volume as glowing lines, a dark studio (a soft light overhead, long strip lights, warm
pools on the floor), and a camera at the main reference's framing (stage (58, 196) at its pixel (40, 477),
2.062 px per stage unit, 1586 x 992). The words and glyphs are laid over the render from the prototype's own
label sheet, as the live widget would draw them on top.

In Blender's UI:   exec(open(r'<repo>/tools/blender/mercury_glass.py').read())   (builds the scene only)
In the background: blender -b --factory-startup -P tools/blender/mercury_glass.py -- render out=<png>
                   [cover=<image>] [samples=256] [save=<blend>] [layout=<folder>]
Stage units: x right, y down (860 x 400); in Blender X right, Z up, the glass faces -Y (the camera).
"""
import bpy, bmesh, json, math, os, sys
import numpy as np

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else r'C:\Users\g8rla\jusic-redesign\tools\blender', '..', '..'))
ARGS = dict(a.split('=', 1) for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []) if '=' in a)
FLAGS = set(a for a in (sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []) if '=' not in a)
LAYOUT = os.path.abspath(ARGS.get('layout', os.path.join(REPO, 'design', 'captures', 'raw', 'blender')))
S = 0.01                     # Blender units per stage unit
V = 1.5                      # voxel size, stage units
CAM_PLANE_Z = 30.0           # the height (toward the viewer) at which the camera's mapping is exact: about the words

# ----------------------------------------------------------------------------------------------- shape knobs
K = dict(
    fat=0.5,                 # front height as a share of the local rounding radius
    back=0.55,               # back height as a share of the front's
    R=(112., 62., 88.),      # rounding radius: bulb, waist, right lobe
    ridge_r=13., ridge_sheet_r=15., ridge_lift=-3., ridge_sheet_lift=7.,
    sheet=12.,               # how much thicker the sheet over the buttons is
    chan=13.,                # how deep the channel under the sheet is
    groove=3.,               # the groove at the ridge's inner foot left of the twist
    band_r=15., band_in=30., # the lower band's roll: radius, how far in from the lower edge its middle runs
    hollow=5.,               # the soft hollow under the words (model pass: broad and shallow; 8 deep and steep-sided, its rim drew a line through the title's end)
    art_z=13.,               # the cover's face, above the body's middle plane
    pocket_round=20.,        # how round the pocket's rim is (14 before the model pass)
    well_depth=11.,
    # The model pass (the owner, after the proof): the rim a fat round roll merging softly into the body (its radius as a
    # share of the local rounding radius, its middle's height as a share of its radius, how softly it merges); a ring of
    # glass round the cover (how far out its middle runs from the art's edge, how high above the art, its radius, how
    # softly it merges); the wells flat-bottomed, with a raised lip round each.
    rim=0.3, rim_z=0.3, rim_soft=16.,
    ring_off=6., ring_z=9., ring_r=15., ring_soft=12.,
    lip_r=4.5,
)

def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0., 1.)
    return t * t * (3. - 2. * t)

def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0.) / k
    return np.minimum(a, b) - h * h * h * k / 6.

def smax(a, b, k):
    return -smin(-a, -b, k)

def load_layout():
    lay = json.load(open(os.path.join(LAYOUT, 'layout.json')))
    o = lay['outline']
    d = np.fromfile(os.path.join(LAYOUT, o['file']), dtype='<f4').reshape(o['h'], o['w'])
    return lay, d, o['step']

def sample_grid(g, step, x, y):
    """Bilinear sample of a grid stored every 'step' units from (step/2, step/2), rows by y."""
    gi = np.clip(x / step - 0.5, 0, g.shape[1] - 1.001)
    gj = np.clip(y / step - 0.5, 0, g.shape[0] - 1.001)
    i0 = np.floor(gi).astype(int); j0 = np.floor(gj).astype(int)
    fx = gi - i0; fy = gj - j0
    return (g[j0, i0] * (1 - fx) * (1 - fy) + g[j0, i0 + 1] * fx * (1 - fy)
            + g[j0 + 1, i0] * (1 - fx) * fy + g[j0 + 1, i0 + 1] * fx * fy)

def polyline_field(P, X, Y):
    """Distance from points to a polyline, signed (positive on the polyline's left of travel, which for the ridge,
    run left to right in stage units with y down, is above it), and how far along."""
    best = np.full(X.shape, 1e9); side = np.zeros(X.shape); along = np.zeros(X.shape)
    acc = 0.
    for a, b in zip(P[:-1], P[1:]):
        ba = b - a; L2 = float(ba @ ba); L = math.sqrt(L2)
        px = X - a[0]; py = Y - a[1]
        h = np.clip((px * ba[0] + py * ba[1]) / L2, 0., 1.)
        qx = px - ba[0] * h; qy = py - ba[1] * h
        dd = qx * qx + qy * qy
        m = dd < best
        best = np.where(m, dd, best)
        n = np.array([ba[1], -ba[0]]) / L
        side = np.where(m, qx * n[0] + qy * n[1], side)
        along = np.where(m, acc + h * L, along)
        acc += L
    return np.sqrt(best), side, along

def rrect_sdf(X, Y, c, half, r, rot, squash):
    cs, sn = math.cos(-rot), math.sin(-rot)
    qx = (X - c[0]) * cs - (Y - c[1]) * sn
    qy = (X - c[0]) * sn + (Y - c[1]) * cs
    bx, by = half, half * squash
    dx = np.abs(qx) - bx + r; dy = np.abs(qy) - by + r
    return np.hypot(np.maximum(dx, 0), np.maximum(dy, 0)) + np.minimum(np.maximum(dx, dy), 0) - r

# ----------------------------------------------------------------------------------------------- the solid
def build_field(lay, out, ostep):
    L = lay['L']
    x0, x1, y0, y1, z0, z1 = 36., 840., 36., 350., -46., 96.
    xs = np.arange(x0, x1 + 1e-6, V, dtype=np.float32); ys = np.arange(y0, y1 + 1e-6, V, dtype=np.float32); zs = np.arange(z0, z1 + 1e-6, V, dtype=np.float32)
    X, Y = np.meshgrid(xs, ys, indexing='ij')                       # [i, j]
    d2 = sample_grid(out, ostep, X, Y).astype(np.float32)
    t = np.maximum(-d2, 0.)
    R = (K['R'][0] + (K['R'][1] - K['R'][0]) * ss(250., 360., X))
    R = R + (K['R'][2] - R) * ss(480., 600., X)
    s = np.clip(t / R, 0., 4.)
    prof = np.sqrt(1. - np.exp(-2. * s)) / math.sqrt(1. - math.exp(-2.))
    Hf = K['fat'] * R * prof

    # The ridge's field.
    P = np.array(lay['ridge'], dtype=float)
    rd, across, along = polyline_field(P, X, Y)
    total = float(np.sum(np.hypot(*(P[1:] - P[:-1]).T)))
    twist = lay['marks'][1] if lay.get('marks') else total * 0.42
    side = ss(twist - 40., twist + 40., along)                      # right of the twist: the sheet and its channel
    live = ss(-6., 26., along) * ss(total + 4., total - 4., along)
    Hbase = Hf.copy()
    Hf = Hf + K['sheet'] * ss(4., 30., across) * side * ss(2., 14., t)
    Hf = Hf - K['chan'] * ss(8., 34., -across) * ss(120., 70., -across) * side * ss(total, total - 50., along)
    Hf = Hf - K['groove'] * np.exp(-((across + 34.) / 13.) ** 2) * live * (1. - side) * ss(4., 20., t)
    # The soft hollow under the words.
    Hf = Hf - K['hollow'] * np.exp(-((X - 372.) / 130.) ** 2) * np.exp(-((Y - 205.) / 40.) ** 2)
    Hb = K['back'] * Hbase

    Z = zs[None, None, :]
    F = np.maximum(np.maximum(Z - Hf[..., None], -Z - Hb[..., None]), d2[..., None])
    # The rim: one fat round roll along the whole outline, merging softly into the body, so each edge carries one broad
    # highlight. (Before the model pass the body's own profile met its flatter back in a tight edge, which drew a stack
    # of three to five thin lines along every rim.)
    Rr = (K['rim'] * R)[..., None]
    roll = np.sqrt((d2[..., None] + Rr) ** 2 + (Z - K['rim_z'] * Rr) ** 2) - Rr
    F = smin(F, roll, K['rim_soft'])

    # The ridge as a roll: its middle a little under the surface along most of it, lifted along the sheet so its
    # lower half hangs over the channel; thinner into the tail tip.
    Pz = sample_grid(np.ascontiguousarray(Hbase.T), V, (P[:, 0] - x0) + V / 2, (P[:, 1] - y0) + V / 2)
    seg = np.concatenate([[0.], np.cumsum(np.hypot(*(P[1:] - P[:-1]).T))])
    sideP = ss(twist - 40., twist + 40., seg)
    zR = Pz + K['ridge_lift'] * (1 - sideP) + K['ridge_sheet_lift'] * sideP
    rR = (K['ridge_r'] + (K['ridge_sheet_r'] - K['ridge_r']) * sideP) * (0.45 + 0.55 * ss(total, total - 70., seg)) * (0.7 + 0.3 * ss(0., 40., seg))
    zRg = np.interp(along, seg, zR); rRg = np.interp(along, seg, rR)
    tube = np.sqrt(rd[..., None] ** 2 + (Z - zRg[..., None]) ** 2) - rRg[..., None]
    F = smin(F, tube, 9.)

    # The lower band as a roll of its own: along a line K['band_in'] in from the lower edge, under the timeline.
    band = []
    for bx in np.arange(232., 640., 4.):
        col = sample_grid(out, ostep, np.full(200, bx), np.linspace(345., 230., 200))
        k = int(np.argmax(col < -K['band_in']))
        if col[k] < -K['band_in']:
            band.append([bx, float(np.linspace(345., 230., 200)[k])])
    B = np.array(band)
    bd, _, balong = polyline_field(B, X, Y)
    btot = float(np.sum(np.hypot(*(B[1:] - B[:-1]).T)))
    Bz = sample_grid(np.ascontiguousarray(Hbase.T), V, (B[:, 0] - x0) + V / 2, (B[:, 1] - y0) + V / 2)
    bseg = np.concatenate([[0.], np.cumsum(np.hypot(*(B[1:] - B[:-1]).T))])
    zB = np.interp(balong, bseg, Bz - 4.)
    rB = K['band_r'] * ss(0., 60., balong) * ss(btot, btot - 60., balong) + 1e-3
    btube = np.sqrt(bd[..., None] ** 2 + (Z - zB[..., None]) ** 2) - rB[..., None]
    F = smin(F, btube, 10.)

    # The cover's pocket: the glass cut away down to the art's face, its rim rounded, so the bulb's glass is a thick
    # ring round the cover; 1 unit of the art's border stays under the glass, which meets the art directly.
    cv = L['cover']
    dR = rrect_sdf(X, Y, cv['c'], cv['half'], cv['r'], cv['rot'], cv['squash'])
    pocket = np.maximum(dR[..., None] + 1., K['art_z'] - Z)
    F = smax(F, -pocket, K['pocket_round'])
    # ...and a round ring of glass wrapping the cover's edge on every side, as the reference's does (before the model
    # pass the pocket's wall was straight down the cover's right side, with flat ledges above and below).
    ring = np.sqrt((dR[..., None] - K['ring_off']) ** 2 + (Z - (K['art_z'] + K['ring_z'])) ** 2) - K['ring_r']
    F = smin(F, ring, K['ring_soft'])

    # The buttons' wells.
    for b in L['buttons']:
        cx, cy = b['c']; r = b['r']
        zs0 = float(sample_grid(np.ascontiguousarray(Hf.T), V, np.array([cx - x0 + V / 2]), np.array([cy - y0 + V / 2]))[0])
        # (Model pass: flat-bottomed, so the middle faces the viewer and mirrors the dark behind the camera, not the strips;
        # a raised lip round each catches the light as a luminous rim. A round dish's lower wall mirrored a bright U.)
        rho = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)[..., None]
        cup = np.maximum(rho - (r + 1.), (zs0 - K['well_depth']) - Z)
        F = smax(F, -cup, 8.)
        lip = np.sqrt((rho - (r + 5.)) ** 2 + (Z - (zs0 + 1.)) ** 2) - K['lip_r']
        F = smin(F, lip, 5.)

    # Nothing past the outline (the rolls end on the silhouette).
    F = smax(F, d2[..., None], 3.)
    return F.astype(np.float32), (x0, y0, z0), Hf, dR

def make_mesh(F, origin):
    import openvdb as vdb
    grid = vdb.FloatGrid(1e3)
    grid.copyFromArray(F)
    pts, quads = grid.convertToQuads(isovalue=0.0)
    x0, y0, z0 = origin
    sx = x0 + pts[:, 0] * V; sy = y0 + pts[:, 1] * V; sz = z0 + pts[:, 2] * V
    co = np.stack([(sx - 430.) * S, -sz * S, (200. - sy) * S], 1)
    me = bpy.data.meshes.new('MercuryGlass')
    me.from_pydata(co.tolist(), [], quads.astype(int).tolist())
    me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return me

# ----------------------------------------------------------------------------------------------- materials
def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return m, nt, out

def glass_material():
    m, nt, out = node_mat('MercuryGlass')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (1.0, 0.975, 0.96, 1)
    b.inputs['Roughness'].default_value = 0.0
    b.inputs['IOR'].default_value = 1.5
    b.inputs['Transmission Weight'].default_value = 1.0
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    va = nt.nodes.new('ShaderNodeVolumeAbsorption')
    va.inputs['Color'].default_value = (1.0, 0.86, 0.82, 1)      # a faint warm tint inside
    va.inputs['Density'].default_value = 0.35
    sc = nt.nodes.new('ShaderNodeVolumeScatter')                 # a faint glow inside: light carried through the glass shows
    sc.inputs['Color'].default_value = (1.0, 0.9, 0.86, 1)
    sc.inputs['Density'].default_value = float(ARGS.get('scat', 0.0))
    sc.inputs['Anisotropy'].default_value = 0.55
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(va.outputs['Volume'], add.inputs[0]); nt.links.new(sc.outputs['Volume'], add.inputs[1])
    nt.links.new(add.outputs['Shader'], out.inputs['Volume'])
    return m

def cover_material(path):
    m, nt, out = node_mat('MercuryCover')
    img = bpy.data.images.load(path, check_existing=True)
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    uv = nt.nodes.new('ShaderNodeUVMap')
    nt.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.35
    b.inputs['Coat Weight'].default_value = 0.15                 # a faint sheen that never dulls the art (1 before the model pass: a grey band)
    b.inputs['Coat Roughness'].default_value = 0.05
    nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = float(ARGS.get('art', 1.4))   # the art gives off light, which the glass carries round
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m

def emit_material(name, color, strength):
    m, nt, out = node_mat(name)
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*color, 1); e.inputs['Strength'].default_value = strength
    nt.links.new(e.outputs['Emission'], out.inputs['Surface'])
    return m

def floor_material(warm=(1., 0.62, 0.5)):
    m, nt, out = node_mat('MercuryFloor')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (0.008, 0.005, 0.0045, 1)   # nearly black: it shows the pools and the drop's reflection, not a lit grey plane
    b.inputs['Roughness'].default_value = float(ARGS.get('floorr', 0.45))
    # (It fades out a few units round the drop, so it has no far edge or horizon: the studio's back shows beyond.)
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    mp.inputs['Scale'].default_value = (2., 2., 1.)   # (object coordinates: the plane's edge at 1)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.0; mr.inputs['From Max'].default_value = 0.5
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], gr.inputs['Vector'])
    nt.links.new(gr.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], mx.inputs['Fac']); nt.links.new(tr.outputs['BSDF'], mx.inputs[1]); nt.links.new(b.outputs['BSDF'], mx.inputs[2])
    # (Round 69 proof: the floor itself glows warm under each lobe, in the album's colour, softly, as the reference's pools
    # do; the glass's lower halves refract it, so they carry coral where they face down.)
    glow = None
    for (px, py, rx, ry) in ((-0.144, -0.057, 0.17, 0.24), (0.139, -0.057, 0.15, 0.22)):
        m2 = nt.nodes.new('ShaderNodeMapping'); m2.inputs['Location'].default_value = (-px / rx, -py / ry, 0.); m2.inputs['Scale'].default_value = (1 / rx, 1 / ry, 1.)
        g2 = nt.nodes.new('ShaderNodeTexGradient'); g2.gradient_type = 'QUADRATIC_SPHERE'
        nt.links.new(tc.outputs['Object'], m2.inputs['Vector']); nt.links.new(m2.outputs['Vector'], g2.inputs['Vector'])
        if glow is None: glow = g2.outputs['Fac']
        else:
            mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'ADD'; nt.links.new(glow, mm.inputs[0]); nt.links.new(g2.outputs['Fac'], mm.inputs[1]); glow = mm.outputs['Value']
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*warm, 1)
    st = nt.nodes.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = float(ARGS.get('floorglow', 2.2))
    nt.links.new(glow, st.inputs[0]); nt.links.new(st.outputs['Value'], em.inputs['Strength'])
    ad = nt.nodes.new('ShaderNodeAddShader'); nt.links.new(b.outputs['BSDF'], ad.inputs[0]); nt.links.new(em.outputs['Emission'], ad.inputs[1])
    nt.links.new(ad.outputs['Shader'], mx.inputs[2])
    nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    return m

# ----------------------------------------------------------------------------------------------- objects
def stage_to_blender(x, y, z):
    return ((x - 430.) * S, -z * S, (200. - y) * S)

def add_object(name, me, mat):
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if mat: ob.data.materials.append(mat)
    return ob

def cover_object(L, art):
    cv = L['cover']; c = cv['c']; half = cv['half']; r = cv['r']; rot = cv['rot']; sq = cv['squash']
    ring = []
    for corner, (sx, sy) in enumerate([(1, 1), (-1, 1), (-1, -1), (1, -1)]):
        a0 = [0, 0.5, 1, 1.5][corner] * math.pi
        for k in range(10):
            a = a0 + (k / 9) * 0.5 * math.pi
            ring.append((sx * (half - r) + math.cos(a) * r, sy * (half * sq - r) + math.sin(a) * r))
    verts, uvs = [], []
    zt = K['art_z'] + 0.6
    for (qx, qy) in ring:
        cs, sn = math.cos(rot), math.sin(rot)
        x = c[0] + qx * cs - qy * sn; y = c[1] + qx * sn + qy * cs
        verts.append(stage_to_blender(x, y, zt))
        uvs.append(((qx / half + 1) / 2, 1 - (qy / (half * sq) + 1) / 2))
    n = len(ring)
    for (qx, qy) in ring:
        cs, sn = math.cos(rot), math.sin(rot)
        x = c[0] + qx * cs - qy * sn; y = c[1] + qx * sn + qy * cs
        verts.append(stage_to_blender(x, y, zt - 3.))
    faces = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
    me = bpy.data.meshes.new('MercuryCover'); me.from_pydata(verts, [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    uvl = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            uvl.data[li].uv = uvs[vi % n]
    return add_object('MercuryCover', me, cover_material(art))

def surface_z(F, origin, x, y):
    """The top of the glass at stage (x, y): the highest z inside, from the field."""
    x0, y0, z0 = origin
    i = int(round((x - x0) / V)); j = int(round((y - y0) / V))
    col = F[i, j, :]
    inside = np.where(col < 0)[0]
    if len(inside) == 0: return 0.
    k = inside[-1]
    a, b = col[k], col[min(k + 1, len(col) - 1)]
    return z0 + (k + (a / (a - b) if b != a else 0.)) * V

def line_object(name, pts, F, origin, radius, mat, lift=1.2):
    curve = bpy.data.curves.new(name, 'CURVE'); curve.dimensions = '3D'
    sp = curve.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (*stage_to_blender(x, y, surface_z(F, origin, x, y) + lift), 1)
    curve.bevel_depth = radius * S; curve.bevel_resolution = 3; curve.use_fill_caps = True
    ob = bpy.data.objects.new(name, curve); bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob

def light(name, kind, loc, rot, energy, color=(1, 1, 1), size=(1, 1), shape='RECTANGLE'):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = color
    if kind == 'AREA':
        ld.shape = shape; ld.size = size[0]; ld.size_y = size[1]
    ob = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(ob)
    ob.location = loc; ob.rotation_euler = rot
    return ob

def aim(ob, target):
    from mathutils import Vector
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()

# ----------------------------------------------------------------------------------------------- scene
def real_cover(n):
    """The owner's n-th real cover (data/real-covers.json, not in git). Its path is never printed: renders with it stay
    private in design/captures/raw/, and the words stay the generated track's."""
    r = json.load(open(os.path.join(REPO, 'data', 'real-covers.json')))
    return os.path.join(r['art'], r['tracks'][n - 1]['cover'])

def album_colour(path):
    """The album's colour from its art: the mean of its most colourful fifth, as the prototype's palette leans."""
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size; buf = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(buf)
    px = buf.reshape(-1, 4)[::7, :3]
    mx = px.max(1); mn = px.min(1); sat = (mx - mn) / np.maximum(mx, 1e-3)
    pick = px[sat >= np.quantile(sat, 0.8)]
    c = pick.mean(0); c = c / max(c.max(), 1e-3)
    if float(sat.mean()) < 0.08: c = np.array([0.8, 0.82, 0.86])        # a cover with little colour gets silver
    return [float(v) for v in c]

def build(cover_path=None):
    lay, out, ostep = load_layout()
    if cover_path and cover_path.startswith('real'):
        cover_path = real_cover(int(cover_path[4:] or 1))
        lay['pal'] = {'a': album_colour(cover_path)}
    L = lay['L']
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.curves, bpy.data.cameras):
        for blk in list(coll):
            if blk.users == 0: coll.remove(blk)
    scene = bpy.context.scene

    F, origin, Hf, dR = build_field(lay, out, ostep)
    glass = add_object('MercuryGlass', make_mesh(F, origin), glass_material())
    art = cover_path or os.path.join(REPO, 'prototypes', 'mercury', 'covers', 'silver-current.jpg')
    cover_object(L, art)

    # The timeline and the volume: a hot core with the album's colour in the played part, a thin dim grey after.
    pal = lay['pal']['a']
    hot = tuple(min(1., 0.2 + 0.8 * c) for c in pal)
    played = emit_material('MercuryLinePlayed', hot, 5.)
    rest = emit_material('MercuryLineRest', (0.75, 0.72, 0.72), 0.9)
    seek = lay['seek']; p = lay['progress']; xs = L['seek']['x0'] + (L['seek']['x1'] - L['seek']['x0']) * p
    a = [q for q in seek if q[0] <= xs]; b = [q for q in seek if q[0] >= xs]
    if len(a) > 1: line_object('MercurySeekPlayed', a, F, origin, 1.9, played)
    if len(b) > 1: line_object('MercurySeekRest', b, F, origin, 1.1, rest)
    vol = lay['vol']; vx = L['vol']['x0'] + (L['vol']['x1'] - L['vol']['x0']) * lay['volume']
    a = [q for q in vol if q[0] <= vx]; b = [q for q in vol if q[0] >= vx]
    if len(a) > 1: line_object('MercuryVolPlayed', a, F, origin, 1.9, played)
    if len(b) > 1: line_object('MercuryVolRest', b, F, origin, 1.1, rest)
    bead = emit_material('MercuryBead', (1., 0.97, 0.95), 14.)
    for name, (bx, by), r in (('MercurySeekBead', (xs, np.interp(xs, *np.array(seek).T)), 5.5), ('MercuryVolBead', (vx, np.interp(vx, *np.array(vol).T)), 4.5)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r * S, location=stage_to_blender(bx, by, surface_z(F, origin, bx, by) + r * 0.6), segments=24, ring_count=12)
        o = bpy.context.active_object; o.name = name; o.data.materials.append(bead)

    # Floor, a little under the drop.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0.4, (200. - float(ARGS.get('floory', 334))) * S))
    pal_ = lay['pal']['a']; warmF = tuple(0.6 * c + 0.4 * w for c, w in zip(pal_, (1., 0.62, 0.5)))
    fl = bpy.context.active_object; fl.name = 'MercuryFloor'; fl.data.materials.append(floor_material(warmF))
    fl.scale = (16., 7., 1.); bpy.context.view_layer.update()

    # The studio: dark, a soft light overhead, long strips, warm pools on the floor in the album's colour.
    world = bpy.data.worlds.new('MercuryStudio'); scene.world = world; world.use_nodes = True
    # (The studio's back: a dim warm glow straight ahead and a little low, falling to near black above and to the sides.
    # The glass refracts it, so the body is warm mid-tones where one looks through it, not black.)
    wn = world.node_tree; bg = wn.nodes['Background']; bg.inputs['Strength'].default_value = 1.0
    tc = wn.nodes.new('ShaderNodeTexCoord'); dt = wn.nodes.new('ShaderNodeVectorMath'); dt.operation = 'DOT_PRODUCT'
    dt.inputs[1].default_value = (0.0, 0.995, -0.1)
    ramp = wn.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = float(ARGS.get('wallr', 0.93)); ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[0].color = tuple(float(v) for v in ARGS.get('wall0', '0.0025,0.0012,0.0013').split(',')) + (1,)
    ramp.color_ramp.elements[1].color = tuple(float(v) for v in ARGS.get('wall1', '0.045,0.018,0.017').split(',')) + (1,)
    wn.links.new(tc.outputs['Generated'], dt.inputs[0]); wn.links.new(dt.outputs['Value'], ramp.inputs['Fac'])
    wn.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    E = dict(top=float(ARGS.get('top', 2800)), fill=float(ARGS.get('fill', 700)), back=float(ARGS.get('back', 0)),
             s1=float(ARGS.get('s1', 2400)), s2=float(ARGS.get('s2', 1600)), s3=float(ARGS.get('s3', 1600)), pool=float(ARGS.get('pool', 0)))
    top = light('MercuryOverhead', 'AREA', (0, -1.5, 5.0), (0, 0, 0), E['top'], (1, 0.9, 0.84), (float(ARGS.get('tw', 14)), float(ARGS.get('th', 4)))); aim(top, (0, 0, 0))
    # (Model pass: higher, so glass facing the viewer squarely, the wells' floors among it, mirrors the dark below it.)
    fill = light('MercuryFill', 'AREA', (0, -22, 7.5), (0, 0, 0), E['fill'], (1, 0.95, 0.93), (14, 5)); aim(fill, (0, 0, 0))
    warm = tuple(0.6 * c + 0.4 * w for c, w in zip(pal, (1., 0.62, 0.5)))
    back = light('MercuryBack', 'AREA', (0, 5, float(ARGS.get('backz', -1.1))), (0, 0, 0), E['back'], warm, (float(ARGS.get('backw', 14)), float(ARGS.get('backh', 0.5)))); aim(back, (0, 0, -0.7))
    s1 = light('MercuryStripFront', 'AREA', (0, -9, 3.2), (0, 0, 0), E['s1'], (1, 0.92, 0.87), (13, 0.12)); aim(s1, (0, 0, 0.2))
    s2 = light('MercuryStripLeft', 'AREA', (-7, -4.5, 2.2), (0, 0, 0), E['s2'], (1, 0.9, 0.85), (0.12, 7)); aim(s2, (-1.5, 0, 0.3))
    s3 = light('MercuryStripRight', 'AREA', (6.5, 3.0, 0.8), (0, 0, 0), E['s3'], (1, 0.88, 0.82), (0.12, 6)); aim(s3, (3.2, 0, 0))
    for nm, x in (('MercuryPoolLeft', (200. - 430.) * S), ('MercuryPoolRight', (652. - 430.) * S)):
        pl = light(nm, 'AREA', (x, 0.25, (200. - float(ARGS.get('floory', 334)) + float(ARGS.get('poolz', 34.))) * S), (0, 0, 0), E['pool'], warm, (float(ARGS.get('pw', 4.5)), float(ARGS.get('ph', 2.6))), 'ELLIPSE'); aim(pl, (x, 0.25, -5))
    for ob in scene.objects:
        if ob.type == 'LIGHT': ob.visible_camera = False
    # The studio's lights light the drop, not the floor (light linking): the floor shows only its warm pools and the
    # drop's reflection. Lit grey, it was seen through the glass and turned the whole drop milky.
    nofloor = bpy.data.collections.new('MercuryNotFloor')
    nofloor.objects.link(fl)
    for lo in (top, fill, back, s1, s2, s3):
        lo.light_linking.receiver_collection = nofloor
    nofloor.collection_objects[0].light_linking.link_state = 'EXCLUDE'
    nocover = bpy.data.collections.new('MercuryNotCover')
    nocover.objects.link(fl); nocover.objects.link(bpy.data.objects['MercuryCover'])
    fill.light_linking.receiver_collection = nocover
    for co in nocover.collection_objects: co.light_linking.link_state = 'EXCLUDE'

    # The camera at the main reference's framing.
    cam_d = bpy.data.cameras.new('MercuryCam'); cam_d.lens = 100; cam_d.sensor_width = 36; cam_d.sensor_fit = 'HORIZONTAL'
    cam = bpy.data.objects.new('MercuryCam', cam_d); scene.collection.objects.link(cam); scene.camera = cam
    W, H, k = 1586, 992, 2.0619
    width_units = W / k
    dist = width_units * S * cam_d.lens / cam_d.sensor_width
    cx = 58. + (W / 2 - 40.) / k; cy = 196. + (H / 2 - 477.) / k
    # (Raised and its lens shifted down by the same, so the drop's face is framed exactly as before while the floor under
    # it is seen from a little above: level with the drop, the floor was a thin line.)
    up = float(ARGS.get('camup', 1.5))
    cam.location = ((cx - 430.) * S, -CAM_PLANE_Z * S - dist, (200. - cy) * S + up)
    cam_d.shift_y = -up / (width_units * S)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.render.resolution_x = W; scene.render.resolution_y = H; scene.render.resolution_percentage = int(ARGS.get('pct', 100))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = int(ARGS.get('samples', 256))
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 24; scene.cycles.transmission_bounces = 16; scene.cycles.glossy_bounces = 8
    scene.cycles.transparent_max_bounces = 8; scene.cycles.volume_bounces = 2
    scene.cycles.caustics_reflective = True; scene.cycles.caustics_refractive = True
    scene.cycles.blur_glossy = 0.5
    try:
        scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = ARGS.get('look', 'AgX - Punchy')
    except Exception as e:
        print('look not set:', e)
    return dict(verts=len(glass.data.vertices), faces=len(glass.data.polygons))

def zebra_scene():
    """The zebra view of the model: the glass a perfect mirror of a sky of even stripes by elevation, no lights or floor."""
    scene = bpy.context.scene
    g = bpy.data.objects['MercuryGlass']; m, nt, out = node_mat('MercuryZebra')
    gl_ = nt.nodes.new('ShaderNodeBsdfGlossy'); gl_.inputs['Roughness'].default_value = 0.0; gl_.inputs['Color'].default_value = (1, 1, 1, 1)
    nt.links.new(gl_.outputs['BSDF'], out.inputs['Surface']); g.data.materials[0] = m
    for ob in scene.objects:
        if ob.type == 'LIGHT' or ob.name in ('MercuryFloor',): ob.hide_render = True
    wn = scene.world.node_tree; wn.nodes.clear()
    o_ = wn.nodes.new('ShaderNodeOutputWorld'); bg = wn.nodes.new('ShaderNodeBackground'); tc = wn.nodes.new('ShaderNodeTexCoord')
    sp = wn.nodes.new('ShaderNodeSeparateXYZ'); asn = wn.nodes.new('ShaderNodeMath'); asn.operation = 'ARCSINE'
    mul = wn.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = float(ARGS.get('zebra', 36))
    sn = wn.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'; gt = wn.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.0
    mr = wn.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 0.02; mr.inputs['To Max'].default_value = 0.8
    wn.links.new(tc.outputs['Generated'], sp.inputs['Vector']); wn.links.new(sp.outputs['Z'], asn.inputs[0]); wn.links.new(asn.outputs['Value'], mul.inputs[0])
    wn.links.new(mul.outputs['Value'], sn.inputs[0]); wn.links.new(sn.outputs['Value'], gt.inputs[0]); wn.links.new(gt.outputs['Value'], mr.inputs['Value'])
    wn.links.new(mr.outputs['Result'], bg.inputs['Color']); wn.links.new(bg.outputs['Background'], o_.inputs['Surface'])
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'

def export_live(d):
    """For the live 3D spike (prototypes/glass3d/): the glass mesh with its smooth normals, the cover, the camera, the
    timeline's and volume's lines and beads, the studio as a 360-degree light map (the scene from the drop's middle with
    the drop hidden, its lamps seen; built from six square renders and resampled to latitude and longitude), a softened
    copy of it (the studio pair: sharp for what the glass mirrors and bends, soft for what it scatters), and the
    background plate from the camera. Light maps and plate in linear light, half floats, rows from the bottom."""
    from mathutils import Matrix
    os.makedirs(d, exist_ok=True)
    scene = bpy.context.scene
    bpy.context.view_layer.update()                  # (the camera's world matrix is stale until the scene is evaluated)
    meta = {'S': S, 'stage_origin': [430., 200.], 'res': [scene.render.resolution_x, scene.render.resolution_y]}
    g = bpy.data.objects['MercuryGlass']; me = g.data; me.calc_loop_triangles()
    n = len(me.vertices); co = np.empty(n * 3, np.float32); me.vertices.foreach_get('co', co)
    nr = np.empty(n * 3, np.float32); me.vertices.foreach_get('normal', nr)
    tri = np.empty(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', tri)
    with open(os.path.join(d, 'glass.bin'), 'wb') as f:
        co.tofile(f); nr.tofile(f); tri.astype(np.uint32).tofile(f)
    meta['glass'] = {'verts': n, 'tris': len(me.loop_triangles)}
    # The cover's face: its outline (Blender coordinates) and the art's coordinates there.
    cv = bpy.data.objects['MercuryCover'].data
    top = max(cv.polygons, key=lambda p: (len(p.vertices), -p.normal.y))
    uvl = cv.uv_layers[0].data
    meta['cover'] = {'pts': [list(cv.vertices[cv.loops[li].vertex_index].co) for li in top.loop_indices],
                     'uv': [list(uvl[li].uv) for li in top.loop_indices], 'normal': list(top.normal)}
    cam = scene.camera
    meta['camera'] = {'matrix': [list(r) for r in cam.matrix_world], 'lens': cam.data.lens, 'sensor': cam.data.sensor_width,
                      'shift': [cam.data.shift_x, cam.data.shift_y], 'clip': [cam.data.clip_start, cam.data.clip_end]}
    lines = {}
    for nm in ('MercurySeekPlayed', 'MercurySeekRest', 'MercuryVolPlayed', 'MercuryVolRest'):
        ob = bpy.data.objects.get(nm)
        if not ob: continue
        em = ob.data.materials[0].node_tree.nodes['Emission']
        lines[nm] = {'pts': [list(p.co)[:3] for p in ob.data.splines[0].points], 'radius': ob.data.bevel_depth,
                     'color': list(em.inputs['Color'].default_value)[:3], 'strength': em.inputs['Strength'].default_value}
    for nm in ('MercurySeekBead', 'MercuryVolBead'):
        ob = bpy.data.objects.get(nm)
        if ob: lines[nm] = {'at': list(ob.location), 'radius': ob.dimensions.x / 2}
    meta['lines'] = lines
    meta['art'] = ARGS.get('cover') or os.path.join(REPO, 'prototypes', 'mercury', 'covers', 'silver-current.jpg')
    # Renders for the light maps and the plate: the drop and what sits on it hidden.
    hide = [o for o in scene.objects if o.name.startswith(('MercuryGlass', 'MercuryCover', 'MercurySeek', 'MercuryVol'))]
    for o in hide: o.hide_render = True
    scene.render.image_settings.file_format = 'OPEN_EXR'; scene.render.image_settings.color_depth = '16'
    def render_to(path):
        scene.render.filepath = path; bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path); w, h = img.size
        buf = np.empty(w * h * 4, np.float32); img.pixels.foreach_get(buf); bpy.data.images.remove(img)
        return buf.reshape(h, w, 4)
    # The plate: what the camera sees behind the drop.
    plate = render_to(os.path.join(d, 'plate.exr'))
    plate.astype(np.float16).tofile(os.path.join(d, 'plate.bin'))
    meta['plate'] = [plate.shape[1], plate.shape[0]]
    # The studio from the drop's middle: six square views (95 degrees, so they overlap), lamps seen.
    for o in scene.objects:
        if o.type == 'LIGHT': o.visible_camera = True
    keep = (scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage)
    cd = bpy.data.cameras.new('MercuryCube'); cd.lens = 18. / math.tan(math.radians(47.5)); cd.sensor_width = 36.; cd.sensor_fit = 'HORIZONTAL'
    cc = bpy.data.objects.new('MercuryCube', cd); scene.collection.objects.link(cc); scene.camera = cc
    FS = int(ARGS.get('cubesize', 640))
    scene.render.resolution_x = FS; scene.render.resolution_y = FS; scene.render.resolution_percentage = 100
    faces = []
    for i, rot in enumerate([(90, 0, -90), (90, 0, 90), (90, 0, 0), (90, 0, 180), (180, 0, 0), (0, 0, 0)]):
        cc.location = (0., 0., 0.); cc.rotation_euler = tuple(math.radians(a) for a in rot)
        bpy.context.view_layer.update()
        img = render_to(os.path.join(d, f'cube{i}.exr'))
        faces.append((np.array(cc.matrix_world.to_3x3()), img))
    EW, EH = int(ARGS.get('envw', 2048)), int(ARGS.get('envw', 2048)) // 2
    u = (np.arange(EW) + 0.5) / EW; v = (np.arange(EH) + 0.5) / EH
    lon = (u - 0.5) * 2 * math.pi; lat = (v - 0.5) * math.pi
    LON, LAT = np.meshgrid(lon, lat)                                # rows from the bottom (lat -90 first)
    D = np.stack([np.sin(LON) * np.cos(LAT), np.cos(LON) * np.cos(LAT), np.sin(LAT)], -1)   # Blender: x right, y in, z up
    env = np.zeros((EH, EW, 4), np.float32); best = np.full((EH, EW), -1e9, np.float32); tn = math.tan(math.radians(47.5))
    for Rm, img in faces:
        dc = D @ Rm                                                 # into the camera's frame (columns are its axes)
        fz = -dc[..., 2]
        x = dc[..., 0] / np.maximum(fz, 1e-6); y = dc[..., 1] / np.maximum(fz, 1e-6)
        ok = (fz > 0) & (np.abs(x) <= tn) & (np.abs(y) <= tn) & (fz > best)
        px = np.clip((x / tn + 1) / 2 * FS - 0.5, 0, FS - 1.001); py = np.clip((y / tn + 1) / 2 * FS - 0.5, 0, FS - 1.001)
        i0 = px.astype(int); j0 = py.astype(int); fx = (px - i0)[..., None]; fy = (py - j0)[..., None]
        smp = img[j0, i0] * (1 - fx) * (1 - fy) + img[j0, i0 + 1] * fx * (1 - fy) + img[j0 + 1, i0] * (1 - fx) * fy + img[j0 + 1, i0 + 1] * fx * fy
        env[ok] = smp[ok]; best[ok] = fz[ok]
    env[..., 3] = 1.
    env.astype(np.float16).tofile(os.path.join(d, 'env.bin'))
    # The soft one: a quarter the size, blurred (about 6 degrees), wrapping round in longitude.
    sm = env.reshape(EH // 4, 4, EW // 4, 4, 4).mean((1, 3))
    for _ in range(3):
        sm = (np.roll(sm, 1, 1) + sm + np.roll(sm, -1, 1)) / 3.
        sm = (np.concatenate([sm[:1], sm[:-1]]) + sm + np.concatenate([sm[1:], sm[-1:]])) / 3.
    sm.astype(np.float16).tofile(os.path.join(d, 'env-soft.bin'))
    meta['env'] = [EW, EH]; meta['envSoft'] = [EW // 4, EH // 4]
    meta['map'] = 'u = atan2(x, y) / 2pi + .5, v = asin(z) / pi + .5 (Blender coordinates; rows from the bottom)'
    scene.camera, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = keep
    for o in hide: o.hide_render = False
    json.dump(meta, open(os.path.join(d, 'meta.json'), 'w'), indent=1)
    print('exported', d, meta['glass'])

def use_gpu():
    try:
        cp = bpy.context.preferences.addons['cycles'].preferences
        cp.compute_device_type = 'OPTIX'; cp.get_devices()
        for d in cp.devices: d.use = d.type == 'OPTIX'
        bpy.context.scene.cycles.device = 'GPU'
    except Exception as e:
        print('GPU not set:', e)

def overlay_words(png):
    """Lays the prototype's label sheet over the render, as the live widget draws words and glyphs on top."""
    img = bpy.data.images.load(png); W, H = img.size
    buf = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(buf)
    px = buf.reshape(H, W, 4)[::-1].copy()
    ink = bpy.data.images.load(os.path.join(LAYOUT, 'ink.png')); iw, ih = ink.size
    ib = np.empty(iw * ih * 4, dtype=np.float32); ink.pixels.foreach_get(ib)
    ik = ib.reshape(ih, iw, 4)[::-1][..., 0]
    f = W / 1586.; k = 2.0619 * f; Xs, Ys = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)   # (any render size: the frame scales)
    sx = 58. + (Xs - 40. * f) / k; sy = 196. + (Ys - 477. * f) / k
    u = np.clip(sx * 3. - 0.5, 0, iw - 1.001); v = np.clip(sy * 3. - 0.5, 0, ih - 1.001)
    i0 = u.astype(int); j0 = v.astype(int); fx = u - i0; fy = v - j0
    a = (ik[j0, i0] * (1 - fx) * (1 - fy) + ik[j0, i0 + 1] * fx * (1 - fy) + ik[j0 + 1, i0] * (1 - fx) * fy + ik[j0 + 1, i0 + 1] * fx * fy)
    a *= (sx < 790.)                                             # not the beads' glyphs: the beads are in
    # The glass behind the words a little darker and calm: a soft shade spread round the letters (as the live widget's
    # words layer would carry), so the artist and the times keep their contrast.
    sh = a.copy()
    for _ in range(3):
        for ax in (0, 1):
            st_ = max(1, int(round(3 * f)))
            sh = (np.roll(sh, -2 * st_, ax) + np.roll(sh, -st_, ax) + sh + np.roll(sh, st_, ax) + np.roll(sh, 2 * st_, ax)) / 5.
    sh = np.clip(sh * 3.0, 0., 1.)
    px[..., :3] *= (1. - float(ARGS.get('wordshade', 0.35)) * sh)[..., None]
    col = np.array([1.0, 0.975, 0.965])
    px[..., :3] = px[..., :3] * (1 - a[..., None]) + col * a[..., None]
    img.pixels.foreach_set(np.ascontiguousarray(px[::-1]).ravel())
    img.filepath_raw = png; img.file_format = 'PNG'; img.save()

if __name__ == '__main__' or 'render' in FLAGS:
    info = build(ARGS.get('cover'))
    print('glass mesh', info)
    if ARGS.get('save'):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(ARGS['save']))
    if 'zebra' in ARGS or 'zebra' in FLAGS: zebra_scene()
    if ARGS.get('export'):
        use_gpu(); bpy.context.scene.cycles.samples = int(ARGS.get('samples', 64)); export_live(os.path.abspath(ARGS['export']))
    if 'render' in FLAGS:
        use_gpu()
        outp = os.path.abspath(ARGS.get('out', os.path.join(LAYOUT, 'render.png')))
        bpy.context.scene.render.filepath = outp
        bpy.context.scene.render.image_settings.file_format = 'PNG'
        bpy.ops.render.render(write_still=True)
        if 'nowords' not in FLAGS and 'zebra' not in ARGS and 'zebra' not in FLAGS:
            words = outp.replace('.png', '-words.png')
            import shutil; shutil.copyfile(outp, words); overlay_words(words)
        print('rendered', outp)
