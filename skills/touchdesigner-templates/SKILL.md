# TouchDesigner Project Templates

Copy-paste-able TouchDesigner projects — delivered as **Python network-builder
scripts**. Paste one into TouchDesigner and it builds a complete, runnable,
animated project (operators, parameters, wiring, and animation) in one shot.

## Why scripts and not `.toe` / `.tox` files?

TouchDesigner project files are **binary**:

- `.toe` — a full project file
- `.tox` — a single reusable component (COMP)

They cannot be written or edited as plain text, and they can only be produced
*by TouchDesigner itself*. So instead of shipping un-editable binaries, these
templates use TouchDesigner's **Python API**, which builds the exact same
networks from readable text you can paste, diff, and tweak.

Once a script has built the network, you can save it as a real binary from
inside TouchDesigner (see "Saving as a real file" below).

## How to load a template

You only need to do **one** of these:

### Option A — Textport (fastest)
1. Open TouchDesigner.
2. Open the Textport: **Alt+T** (or *Dialogs ▸ Textport and DATs*).
3. Open a script from `scripts/`, copy the whole file, paste into the Textport,
   press **Enter**.
4. A new COMP appears at the root of your network. Double-click it to enter;
   the node named **`out1`** is the final output.

### Option B — Text DAT
1. In any network, create a **Text DAT** (Tab ▸ DAT ▸ Text).
2. Paste the script into it.
3. Right-click the Text DAT ▸ **Run Script**.

Re-running a script is safe — each one deletes its previous build first, so you
can iterate freely.

## Saving as a real `.toe` / `.tox` file

After a script builds a network and you like it:

- **Whole project →** *File ▸ Save As* writes a `.toe` you can reopen normally.
- **Just the component →** right-click the generated COMP (e.g. `gen_noise`) ▸
  **Save Component .tox**. You can then drag that `.tox` into any other project.

## Templates

| Script | What it builds |
|---|---|
| `scripts/generative_noise.py` | Animated, colour-cycling noise field. Great starting canvas. |
| `scripts/feedback_trails.py` | Classic feedback loop — light-painting / infinite-smear trails. |
| `scripts/audio_reactive.py` | Visuals driven live by your mic / audio input (RMS level). |
| `scripts/render_3d.py` | Lit, rotating 3D geometry through a camera (Geo + Cam + Light → Render). |
| `scripts/bloom_glow.py` | Reusable glow/bloom effect (isolate brights → blur → add back). |

## How the scripts are written

Every script is self-contained and uses two small helpers so they never crash
on a version mismatch:

- `setpars(op, name=value, ...)` — sets parameters. A value beginning with `=`
  is set as an **expression** (e.g. `tz='=absTime.seconds*0.1'` animates it).
  OP objects are auto-converted to their path. Unknown parameter names are
  skipped with a warning instead of aborting the build — so if your TD version
  renamed a parameter, the rest of the project still builds and you just tweak
  that one knob.
- `wire(a, b, out_i, in_i)` — connects output `out_i` of `a` to input `in_i`
  of `b`.

This makes them easy to read, remix, and combine. Want a glowing audio-reactive
3D scene? Build all three and wire their `out1`s together.

## Requirements

- TouchDesigner (free **non-commercial** edition is fine) — any recent build.
- No external packages; uses only TouchDesigner's built-in Python API.
