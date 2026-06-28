# =============================================================================
# Bloom / Glow  —  reusable "add a glow" effect on a generated source
# =============================================================================
# HOW TO USE
#   1. Open TouchDesigner, open the Textport (Alt+T).
#   2. Paste this whole script, press Enter.
#   3. A COMP "bloom_glow" appears at the root. Double-click in; "out1" is the
#      output: a soft, blooming colour field.
#
# Technique (works as a glow on ANY source — swap "noise1" for a Movie File In,
# Text TOP, render, etc.):
#   source -> isolate bright areas (Level) -> Blur -> ADD back over the source
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
NAME = 'bloom_glow'
if PARENT.op(NAME):
    PARENT.op(NAME).destroy()
base = PARENT.create(baseCOMP, NAME)

# source (replace this node with your own image/movie/render to glow it)
src = base.create(noiseTOP, 'noise1')
setpars(src,
        outputresolution='custom', resolutionw=1280, resolutionh=720,
        type='sparse', period=3, harmonics=3, monochrome=0, gain=1.3,
        tz='=absTime.seconds * 0.15')
src.nodeX, src.nodeY = 0, 100

color = base.create(hsvadjustTOP, 'color1')
setpars(color, saturationmult=1.5, hueoffset='=absTime.seconds * 0.03')
color.nodeX, color.nodeY = 200, 100

# isolate the bright parts
thr = base.create(levelTOP, 'threshold1')
setpars(thr, blacklevel=0.6, gamma1=0.6)
thr.nodeX, thr.nodeY = 400, -50

# blur them into a halo
blur = base.create(blurTOP, 'blur1')
setpars(blur, size=48)
blur.nodeX, blur.nodeY = 600, -50

# add the halo back over the original
comp = base.create(compositeTOP, 'comp1')
setpars(comp, operand='add')
comp.nodeX, comp.nodeY = 800, 100

out = base.create(nullTOP, 'out1')
out.nodeX, out.nodeY = 1000, 100
out.viewer = True

wire(src, color)
wire(color, thr)
wire(thr, blur)
wire(color, comp, in_i=0)
wire(blur, comp, in_i=1)
wire(comp, out)

print('Built %s  ->  double-click it; "out1" is the output.' % base.path)
