# =============================================================================
# Audio Reactive  —  visuals driven by your microphone / audio input
# =============================================================================
# HOW TO USE
#   1. Open TouchDesigner, open the Textport (Alt+T).
#   2. Paste this whole script, press Enter.
#   3. A COMP "audio_reactive" appears at the root. Double-click in.
#      "out1" is the output; "audio_level" is the CHOP carrying the live level.
#   4. Make some noise. If nothing reacts, select "audioin1" and pick the right
#      input Device in its parameters (Common page).
#
# Signal flow:
#   audio in -> analyze (RMS level) -> null  ==> referenced by the visual's
#   parameters via expressions, so the noise tightens/brightens with volume.
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
NAME = 'audio_reactive'
if PARENT.op(NAME):
    PARENT.op(NAME).destroy()
base = PARENT.create(baseCOMP, NAME)

# --- audio analysis ---------------------------------------------------------
ain = base.create(audiodevinCHOP, 'audioin1')
ain.nodeX, ain.nodeY = 0, -150

ana = base.create(analyzeCHOP, 'analyze1')
setpars(ana, function='rms')          # overall loudness
ana.nodeX, ana.nodeY = 200, -150

lag = base.create(lagCHOP, 'lag1')
setpars(lag, lag1=0.05, lag2=0.20)    # smooth attack / slower release
lag.nodeX, lag.nodeY = 400, -150

level = base.create(nullCHOP, 'audio_level')
level.nodeX, level.nodeY = 600, -150

wire(ain, ana)
wire(ana, lag)
wire(lag, level)

# --- visual -----------------------------------------------------------------
noise = base.create(noiseTOP, 'noise1')
setpars(noise,
        outputresolution='custom', resolutionw=1280, resolutionh=720,
        type='sparse', monochrome=1,
        period='=4 - op("audio_level")[0] * 6',   # louder = finer detail
        gain='=1 + op("audio_level")[0] * 3',      # louder = brighter
        tz='=absTime.seconds * 0.2')
noise.nodeX, noise.nodeY = 0, 100

hsv = base.create(hsvadjustTOP, 'hsv1')
setpars(hsv, saturationmult=1.5,
        hueoffset='=op("audio_level")[0] * 2 + absTime.seconds * 0.02')
hsv.nodeX, hsv.nodeY = 220, 100

out = base.create(nullTOP, 'out1')
out.nodeX, out.nodeY = 440, 100
out.viewer = True

wire(noise, hsv)
wire(hsv, out)

print('Built %s  ->  double-click it; "out1" is the output. Pick the audio '
      'device on "audioin1" if it does not react.' % base.path)
