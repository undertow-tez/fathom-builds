# =============================================================================
# Generative Noise  —  animated, colour-cycling noise field
# =============================================================================
# HOW TO USE
#   1. Open TouchDesigner.
#   2. Open the Textport:  Alt+T   (or Dialogs > Textport and DATs)
#   3. Paste this ENTIRE script and press Enter.
#      (Alternatively: create a Text DAT, paste this in, right-click > Run Script.)
#   4. A COMP called "gen_noise" appears at the root. Double-click to enter it.
#      The node "out1" is your final output.
#
# Re-running the script rebuilds it cleanly (it deletes the old one first).
# =============================================================================


def setpars(o, **kw):
    """Set parameters safely. Prefix a string value with '=' to set an
    EXPRESSION instead of a value. OP objects are converted to their path.
    Unknown params are skipped with a warning so the build never crashes."""
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
    """Connect output out_i of a -> input in_i of b."""
    b.inputConnectors[in_i].connect(a.outputConnectors[out_i])


# --- build target -----------------------------------------------------------
PARENT = op('/')          # build at the root; change to op('/project1') if you like
NAME = 'gen_noise'
if PARENT.op(NAME):
    PARENT.op(NAME).destroy()
base = PARENT.create(baseCOMP, NAME)
base.nodeX, base.nodeY = 0, 0

# --- network ----------------------------------------------------------------
noise = base.create(noiseTOP, 'noise1')
setpars(noise,
        outputresolution='custom', resolutionw=1280, resolutionh=720,
        type='sparse', period=4, harmonics=3, monochrome=1,
        tz='=absTime.seconds * 0.12')          # animate through the noise volume
noise.nodeX, noise.nodeY = 0, 0

lev = base.create(levelTOP, 'level1')
setpars(lev, blacklevel=0.12, whitelevel=0.9, gamma1=0.8)
lev.nodeX, lev.nodeY = 220, 0

hsv = base.create(hsvadjustTOP, 'hsv1')
setpars(hsv, saturationmult=1.4, valuemult=1.0,
        hueoffset='=absTime.seconds * 0.05')   # slow colour cycle
hsv.nodeX, hsv.nodeY = 440, 0

out = base.create(nullTOP, 'out1')
out.nodeX, out.nodeY = 660, 0
out.viewer = True

wire(noise, lev)
wire(lev, hsv)
wire(hsv, out)

print('Built %s  ->  double-click it; "out1" is the output.' % base.path)
