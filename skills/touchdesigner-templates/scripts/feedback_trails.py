# =============================================================================
# Feedback Trails  —  classic infinite-feedback / light-painting loop
# =============================================================================
# HOW TO USE
#   1. Open TouchDesigner, open the Textport (Alt+T).
#   2. Paste this whole script, press Enter.
#   3. A COMP "feedback_trails" appears at the root. Double-click in; "out1"
#      is the output. The image should bloom and smear over time.
#
# This is the canonical TD feedback pattern:
#   source -> ADD over (decayed + transformed previous frame) -> out -> feedback
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
NAME = 'feedback_trails'
if PARENT.op(NAME):
    PARENT.op(NAME).destroy()
base = PARENT.create(baseCOMP, NAME)

# moving source that gets smeared
src = base.create(noiseTOP, 'noise1')
setpars(src,
        outputresolution='custom', resolutionw=1280, resolutionh=720,
        type='sparse', period=1.5, harmonics=2, monochrome=0, gain=1.3,
        tz='=absTime.seconds * 0.4', tx='=absTime.seconds * 0.07')
src.nodeX, src.nodeY = 0, 100

# feedback loop nodes
fb = base.create(feedbackTOP, 'feedback1')
fb.nodeX, fb.nodeY = 0, -100

trans = base.create(transformTOP, 'transform1')
# NOTE: transform param names vary slightly between TD builds; setpars will
# warn (not crash) on any it doesn't recognise. A tiny zoom + rotate gives the
# "tunnel" smear. Even if these are skipped, the decay below still trails.
setpars(trans, scale=0.99, rotate=0.5, tx=0.0, ty=0.0)
trans.nodeX, trans.nodeY = 220, -100

decay = base.create(levelTOP, 'decay1')
setpars(decay, opacity=0.93)        # how long trails persist (closer to 1 = longer)
decay.nodeX, decay.nodeY = 440, -100

comp = base.create(compositeTOP, 'comp1')
setpars(comp, operand='add')
comp.nodeX, comp.nodeY = 660, 0

out = base.create(nullTOP, 'out1')
out.nodeX, out.nodeY = 880, 0
out.viewer = True

# wiring
wire(fb, trans)
wire(trans, decay)
wire(src, comp, in_i=0)
wire(decay, comp, in_i=1)
wire(comp, out)

# feedback samples the previous frame of out1
setpars(fb, top=out)

print('Built %s  ->  double-click it; "out1" is the output.' % base.path)
