# =============================================================================
# 3D Render Starter  —  lit, rotating geometry through a camera
# =============================================================================
# HOW TO USE
#   1. Open TouchDesigner, open the Textport (Alt+T).
#   2. Paste this whole script, press Enter.
#   3. A COMP "render_3d" appears at the root. Double-click in; "out1" shows
#      the rendered, spinning object.
#   4. To change the shape: enter "geo1" and replace the default torus SOP with
#      a Box / Sphere / Geometry of your choice (the last SOP with its blue
#      "render" flag on gets rendered).
#
# Full 3D chain:  Geometry COMP + Camera COMP + Light COMP -> Render TOP
# =============================================================================


def setpars(o, **kw):
    for k, v in kw.items():
        try:
            p = getattr(o.par, k)
        except AttributeError:
            print('  [skip] %s has no parameter .%s' % (o.name, k))
            continue
        try:
            if isinstance(v, str) and v.startswith('='):
                p.expr = v[1:]
            else:
                if hasattr(v, 'path'):
                    v = v.path
                p.val = v
        except Exception as e:
            print('  [warn] %s.%s = %r failed: %s' % (o.name, k, v, e))


def wire(a, b, out_i=0, in_i=0):
    b.inputConnectors[in_i].connect(a.outputConnectors[out_i])


PARENT = op('/')
NAME = 'render_3d'
if PARENT.op(NAME):
    PARENT.op(NAME).destroy()
base = PARENT.create(baseCOMP, NAME)

# Geometry (a new Geometry COMP ships with a torus inside, already renderable)
geo = base.create(geometryCOMP, 'geo1')
setpars(geo,
        rx='=absTime.seconds * 22',
        ry='=absTime.seconds * 30')      # tumble
geo.nodeX, geo.nodeY = 0, 0

# Camera, pulled back so it can see the origin
cam = base.create(cameraCOMP, 'cam1')
setpars(cam, tz=5)
cam.nodeX, cam.nodeY = 0, -150

# Light, off to one side
light = base.create(lightCOMP, 'light1')
setpars(light, tx=3, ty=4, tz=5)
light.nodeX, light.nodeY = 0, -300

# Render
ren = base.create(renderTOP, 'render1')
setpars(ren,
        outputresolution='custom', resolutionw=1280, resolutionh=720,
        camera=cam, lights=light, geometry=geo)
ren.nodeX, ren.nodeY = 250, -150

out = base.create(nullTOP, 'out1')
out.nodeX, out.nodeY = 470, -150
out.viewer = True
wire(ren, out)

print('Built %s  ->  double-click it; "out1" is the output.' % base.path)
