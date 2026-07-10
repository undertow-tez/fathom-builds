# mfSk8 — Game Design Document

*Working title. Alternates considered: Grind mfers, WAGGI (We're All Gonna Grind It), Sartoshi's Pipe Dream.*

A casual THPS-style arcade skateboarding game starring **mfers** (CC0, by sartoshi).
Lo-fi chill vibe. Target platforms: **Steam first, then iOS/Android** — eventually both.

---

## Why mfers

- **CC0 / public domain** — full commercial rights, no licensing risk. Rare among NFT collections.
- The mfer aesthetic (lanky stick figure, headphones, slacker energy) *is* a skater. Zero
  concept-art distance between the IP and the genre.
- Built-in crypto-native community for grassroots launch marketing.

## Positioning & strategy

**Hybrid, mainstream-first** (decided 2026-07-10):

- Ship a genuinely fun standalone skate game — no wallet required, no tokens, playable by anyone.
  Keeps Steam and App Store distribution safe (both restrict crypto/NFT integrations).
- Design the character system around **traits from day one** (the official OG mfers 3D models are
  already split into per-trait meshes on a shared Mixamo skeleton), so an optional
  "connect wallet → your mfer is your skater" feature can be added later without rework.
- Onchain extras (Base cosmetics, onchain leaderboards) are a post-launch option, gated so store
  builds stay compliant.

## Core loop (THPS formula)

1. Drop into a skate spot — **2-minute run timer**
2. Chain tricks → combos → multipliers → high score
3. Objectives checklist per spot (S-K-A-T-E letters, hidden item, score targets, named gaps)
4. Beat objectives → unlock next spot + cosmetics

## Tricks

**Traditional names for the base trick list** (credibility with skaters, readability for everyone):

- Flatground: Ollie, Kickflip, Heelflip, Pop Shove-it, 360 Flip
- Grinds: 50-50, Boardslide, Nosegrind, Crooked, Smith, Feeble
- Air/grabs: Melon, Indy, Method, Nosegrab, Stalefish; spins in 180 increments up to 900
- Manuals as combo connectors

**Crypto-named specials only** — rare, meter-gated signature moves (fill the special meter by
banking combos):

| Special | What it is |
|---|---|
| **Diamond Hands** | Golden grind — multiplied grind points the longer you hold it |
| **The 100x** | Massive multi-flip signature air (our "900") |
| **Sartoshi Spin** | Signature manual-to-air flourish |
| **gm** | Stylish grab that extends the combo timer |

Bail flavor text: "PAPER HANDS".

## Levels — web3-themed places, real skatepark geometry first

1. **The Base Skatepark** — blue/white bowl, tutorial + home spot *(prototype park is a sketch of this)*
2. **Abandoned DeFi Mall** — rugged overgrown mall, rails, ledges, drained fountain
3. **The Punk Plaza** — pixel/voxel city block, stairs and gaps
4. **Ape Yacht Marina** — docks, boats, quarter pipes off the pier
5. **Sartoshi's Backyard** — secret unlockable origin-story half-pipe

Collectible per level: a **hardware wallet** (our "hidden VHS tape").

## Art & audio direction

- **"A sketch of a skatepark come to life"** (locked in from user feedback, v0.2): paper-cream
  world, wobbly double-stroked ink outlines on all geometry, pencil-hatched ground, doodle sun
  and scribble clouds, crayon-red graffiti, Base-blue coping/rails as the color accent.
  The textured 3D mfer is the one "real" thing in the sketch — the drawing that came to life.
  This is truer to the source than any rendered style: mfers *are* ink doodles.
- **LoFi chill** pacing and sound: lo-fi hip-hop (~72bpm), vinyl crackle, mellow SFX. The
  prototype generates its loop procedurally with WebAudio; production would license real tracks.
- Proportions are cartoon, not realistic: oversized board (~1.5×) to match the mfer's big head.

## Character / trait system

The official OG mfers 3D pipeline exports each trait as a separate skinned mesh on one shared
**Mixamo skeleton** (verified from the reference GLB: 12 trait meshes, 33 joints, ~13k tris).
Consequences:

- Any mfer = the base rig + a set of trait meshes toggled on. The full 10k roster is one asset system.
- Mixamo's free animation library retargets directly onto the rig (idle/run/bail/celebrate);
  only trick-specific animations need custom work.
- ~13k tris per character is comfortably mobile-budget.

## Tech plan

| Phase | Tech | Purpose |
|---|---|---|
| **Prototype (now)** | three.js, browser | Validate that a 2-minute run is fun before engine commitment |
| Vertical slice | **Unity** | One polished level, real trick animation set, controller support |
| Ship | Unity | Steam → mobile port (touch controls validated in prototype) |

## Prototype status (v0.1 — in `prototype/`)

Built 2026-07-10. Playable in browser, desktop keyboard + mobile touch buttons.

- ✅ Auto-roll + steer, push to boost, THPS behind-the-back camera
- ✅ Ollie, Kickflip, Heelflip, Pop Shove-it, Melon grab, spin scoring
- ✅ 50-50 grinds on a rail, quarter-pipe vert airs, kicker launches
- ✅ Combo chain × multiplier, bail on sketchy landings, special meter → Diamond Hands grind
- ✅ 2:00 runs, local best score, generated lo-fi soundtrack
- Character: the actual OG mfer GLB (green headphones), procedurally posed
  (no custom trick animations yet — board does the flipping)

### Open questions

- Full OG mfers trait-mesh library: where to source the complete set?
- Trick animation production: Mixamo retarget + hand-keyed tricks in Blender, or mocap?
- Name/branding final call before any store page goes up.
