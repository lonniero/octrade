# Octadre Chord Field — Agent Handoff Document
> Generated: 2026-05-08. For use by the next agent picking up this debugging session.

---

## Project Context

**Project:** Octadre Web Instrument  
**Path:** `/Users/lonniero/Antigravity Projects/octadre-web/`  
**Dev server:** `npm run dev` → `http://localhost:3002`  
**Key files:**
- `public/chord-field-engine.js` — All music theory logic, voicing, Roman numeral generation
- `public/app.js` — UI rendering, pad press handlers, event routing
- `docs/CHORD_FIELD_THEORY.md` — The SOURCE OF TRUTH for intended behavior

> **CRITICAL RULE:** Before writing any code, read `CHORD_FIELD_THEORY.md` in full. Do not rely on any summary of what it says — read the actual file.

---

## Grid Layout (Must Understand Before Touching Anything)

The interface has an 8x8 grid of pads. There are two main modes:
- **Diatonic mode** (cf.ringMode === 'diatonic') — the one being debugged
- **Ring mode** — not the focus here

In **diatonic mode**, rows have fixed roles:

```
Row 0-1   MEMORY BANK (breadcrumbs — previous chords played)
Row 2     [col 0-3] PURPLE 2nd row — Flat-Side Portal Gates (V/IV, V/bVII, V/bIII, V/bVI)
          [col 4-7] RED 2nd row    — Secondary Diminished 7ths (vii°/ii, vii°/iii, etc.)
Row 3     [col 0-3] PURPLE 1st row — Sharp-Side Portal Gates (V/ii, V/iii, V/V, V/vi → key change)
          [col 4-7] RED 1st row    — Secondary Dominants (V/ii, V/iii, V/V, V/vi — NO key change)
Row 4     MAJOR ROW — I ii iii IV V vi vii° I (Ionian, fixed)
Row 5     MINOR ROW — i ii° bIII iv v bVI bVII i (Aeolian, fixed)
Row 6     [col 0-3] GREEN Resolve — Functional resolutions (context-reactive)
          [col 4-7] GOLD Color    — Borrowed/Modal interchange chords
Row 7     [col 0-3] GREEN Sus     — Suspended chords (STATIC: I sus2, I sus4, V sus2, vi sus4)
          [col 4-7] GOLD Advanced — Chromatic borrowed (N6, Ger+6, Fr+6, V7alt)
```

Context sensitivity: When a **major row** pad (Row 4) is pressed, the Gold quadrant borrows from **minor**. When a **minor row** pad (Row 5) is pressed, the Gold quadrant borrows from **major**. Controlled by `cf.lastDiatonicRowType`.

---

## The Outstanding Issues (User's Exact Requests)

### Issue 1 — Roman Numeral Labels Missing or Wrong Across ALL Quadrant Pads

Every pad should show two lines:
1. Top line (small): Roman numeral function label (e.g. `IΔ7`, `V⁷`, `V/ii`, `N6`, `bVII7`)
2. Bottom line (larger): Chord name (e.g. `Cmaj7`, `G7`, `D7`)

**Specific broken areas:**
- **Green Resolve quadrant** (Row 6, col 0-3): Was showing generic strings like `'resolution'`, `'tonic'`, `'plagal'` as labels instead of Roman numerals. Recent agent attempted to fix this.
- **Minor Row** (Row 5): Degrees bIII (col 2) and bVI (col 5) showed blank labels because `getScaleDegreeLabel` was called with the wrong mode. Recent agent attempted a fix.
- **Gold Color quadrant** (Row 6, col 4-7): Should show `bVII7`, `bIII`, `bIV`, `bVI` (major context) or `I`, `III`, `IV`, `VI` (minor context).
- **Purple Portal** (Row 3, col 0-3): Should show `V/ii`, `V/iii`, `V/V`, `V/vi`.
- **Purple 2nd row** (Row 2, col 0-3): Should show `V/IV`, `V/bVII`, `V/bIII`, `V/bVI`.
- **Red Tension** (Row 3, col 4-7): Should show `V/ii`, `V/iii`, `V/V`, `V/vi`.
- **Red 2nd row** (Row 2, col 4-7): Should show `vii°/ii`, `vii°/iii`, etc.
- **Gold Advanced** (Row 7, col 4-7): Should show `N6`, `Ger+6`, `Fr+6`, `V7alt`.

**How to verify:** Open the browser, switch to diatonic mode, check every pad type visually before and after any code changes.

### Issue 2 — Sus Chord Row Must Be Exactly These 4 Chords

Row 7, col 0-3 (Green Sus row) must always show, in this exact order:
1. `I sus2`
2. `I sus4`
3. `V sus2`
4. `vi sus4`

These are STATIC (not context-reactive). The `computeSusChords` function currently returns these. Verify the labels display correctly on the actual pads.

### Issue 3 — Neapolitan Chord Must Be Present

Row 7, col 4 (first pad of Gold Advanced row) should be the **Neapolitan chord** (bIImaj7).
In C: Dbmaj7 labeled as `N6`.
`computeAdvancedBorrowed` returns it as pad index 0. Verify it renders correctly in the UI.

### Issue 4 — Ctrl+Up / Ctrl+Down Inversion Buttons Do Not Work

The CC buttons that trigger `handleChordFieldCC(0)` (up) and `handleChordFieldCC(1)` (down) should invert the currently sounding chord.

Current logic:
- Up: sorts `prevVoicing`, removes lowest note, appends it +12
- Down: sorts `prevVoicing`, removes highest note, appends it -12
- Then sets `cf.activeNotes` and calls `cfPlayChordHumanized`

User says nothing audibly changes. Before debugging:
1. Add a `console.log` at the top of `handleChordFieldCC` to confirm it's being called at all
2. Check if `cf.prevVoicing` is populated when button is pressed (may be null/empty)
3. Check if `cfPlayChordHumanized` is actually sending notes to the synth

Do NOT rewrite the inversion logic without first confirming the function is being called.

### Issue 5 — Triad Voicing Must Force True 3-Note Triads

When `cf.voicingIndex` points to `'triad'` voicing type, the output should be a compact 3-note triad (root, 3rd, 5th only — no 7th). Verify that `voiceTriad` in `chord-field-engine.js` actually strips the chord to 3 notes. If `CHORD_INTERVALS['maj7']` is passed in, it must reduce to `[0, 4, 7]` only.

---

## What the Previous Agent Changed (Verify Before Assuming Correct)

**WARNING:** The previous agent made several changes without being able to visually verify them in the browser. Some may be correct, some may have introduced bugs.

### `chord-field-engine.js` changes:
1. **Resolve quadrant roles** in `computeContextChords` (~lines 1450-1630): Replaced generic role strings with calls to a new inner `romanRole()` helper. Verify this produces correct Roman numeral strings and that `ctx.role` is not empty on the pads.
2. **`computeFlatSidePortals`**: Changed `label` field from the chord name (e.g. 'C7') to the functional string (e.g. 'V/IV'). Verify the chord name still shows on the bottom line in `renderDiatonicPad`'s `portal_2nd` zone.
3. **Roman numeral arrays** (~line 1114): `ROMAN_LOWER` was changed to uppercase at some point in the session history — verify current state.

### `app.js` changes:
1. **`renderDiatonicPad` diatonic zone** (~line 5232): Changed the `modeName` passed to `getScaleDegreeLabel` from the global mode index to `rowMode = info.mode || (isMajorRow ? 'ionian' : 'aeolian')`. This is the fix for blank minor row labels. Verify `info.mode` is populated (it comes from `getDiatonicChordForRow` which returns `{ root, quality, degreeIdx, mode }`).

---

## Recommended Approach for Next Agent

1. **First: Read `docs/CHORD_FIELD_THEORY.md` in full** (all 522 lines)
2. **Second: Audit current code state — read before touching:**
   - `chord-field-engine.js` lines 1110-1135 (getScaleDegreeLabel)
   - `chord-field-engine.js` lines 1444-1640 (computeContextChords resolve quadrant)
   - `chord-field-engine.js` lines 2146-2190 (computeSusChords, computeFlatSidePortals)
   - `chord-field-engine.js` lines 2246-2280 (computeAdvancedBorrowed)
   - `app.js` lines 5213-5510 (renderDiatonicPad — ALL zone branches)
   - `app.js` lines 5605-5660 (handleChordFieldCC)
3. **Third: Open the browser and look.** Start server (`npm run dev`), open `http://localhost:3002`, switch to diatonic mode. Note exactly what labels are showing vs. what they should be. Do not guess.
4. **Fourth: Make only targeted fixes** with a clear mapping between the observed bug and the specific line causing it.

---

## Key Engine Functions Reference

| Function | File:Line | Purpose |
|---|---|---|
| `getScaleDegreeLabel(root, quality, key, modeName)` | engine:1110 | Returns Roman numeral string. Returns '' for non-diatonic. |
| `getDiatonicDegree(pitchClass, key, modeName)` | engine:1213 | Returns 0-6 scale degree or -1 if non-diatonic. |
| `getDiatonicChordForRow(key, col, rowType)` | engine:324 | Returns `{ root, quality, degreeIdx, mode }`. mode is 'ionian' or 'aeolian'. |
| `computeContextChords(root, quality, key, modeName, options)` | engine:1444 | Computes all 16 context pads. options.borrowFrom controls major/minor borrowing. |
| `computeSusChords(key, activeRoot, modeName)` | engine:2146 | Returns 4 static sus slash chords. |
| `computeFlatSidePortals(key)` | engine:2171 | Returns 4 flat-side portal chords. |
| `computeAdvancedBorrowed(key, modeName)` | engine:2246 | Returns N6, Ger+6, Fr+6, V7alt. |
| `handleChordFieldCC(buttonIdx)` | app:5605 | Inversion up/down CC buttons. |
| `renderDiatonicPad(pad, row, col)` | app:5213 | Renders all pad types in diatonic mode. |
| `cfComputeDiatonicContext(cf, root, quality, borrowFrom)` | app:4925 | Recomputes all context arrays after each pad press. |

---

## Confirmed Working — Do Not Break

- Sus chord set in `computeSusChords`: I sus2, I sus4, V sus2, vi sus4
- Major row (Row 4) labels: I, ii, iii, IV, V, vi, vii° all display correctly
- Auto-modulation system (portal pads triggering key changes)
- Voice leading (voiceLeadNatural, drop2, drop3)
- Breadcrumb memory bank (Rows 0-1)
- Rhythm and arp systems

---

---

# Complete 32-Pad Context Map

> This is the ground truth for what every context pad MUST display and do.
> All examples use the key of **C**. Context sensitivity is noted where applicable.
> "Static" = does not change based on which diatonic pad was last pressed.
> "Context-reactive" = recalculates after every diatonic pad press.

---

## ROW 6 — Green (col 0–3) + Gold (col 4–7)

### Green — Resolve Quadrant (col 0–3) — Context-Reactive

These 4 pads show the most harmonically appropriate places to "land" after the current chord. They recalculate every time a diatonic pad is pressed. They do NOT trigger a context reshuffle when pressed (only diatonic pads do that).

#### After pressing a MAJOR ROW pad (Row 4 — Ionian context):

| Pad | Col | Roman Numeral Label | Logic | Example in C |
|-----|-----|--------------------|--------------------------------------------|----------------|
| 0 | 0 | Depends on current chord | Strongest functional resolution: V→I, ii→V, I→vi, others resolve down a 5th (circle of 5ths motion) | G7→Cmaj7 (from V); A7→Dm7 (from ii) |
| 1 | 1 | iii (or IV fallback) | Mediant — tonic function, shares notes with I and V. Falls back to IV (plagal) if iii is already in use | Em7 (or Fmaj7) |
| 2 | 2 | IV (or V fallback) | Subdominant — the plagal "Amen" resolution. Falls back to V if IV already used | Fmaj7 |
| 3 | 3 | Varies | Best common-tone match — whichever unused diatonic chord shares the most pitch classes with the current chord | Varies |

#### After pressing a MINOR ROW pad (Row 5 — Aeolian context, uses Harmonic Minor for pad 0):

| Pad | Col | Roman Numeral Label | Logic | Example in Cm |
|-----|-----|--------------------|--------------------------------------------|------------------|
| 0 | 0 | V (or i) | V→i using harmonic minor dominant (major V chord). If already on i, goes to V | G7→Cm7 |
| 1 | 1 | bVI | Major chord on flat 6th — strong common-tone bridge to tonic minor | Abmaj7 |
| 2 | 2 | bIII | Relative major — the most common "brightening" move from minor | Ebmaj7 |
| 3 | 3 | Varies | Best common-tone match from harmonic minor scale | Varies |

---

### Gold — Color Quadrant (col 4–7) — Context-Reactive (fixed to key root, not current degree)

Borrows chords from the **parallel** mode. These 4 pads are always the same 4 positions regardless of which diatonic degree was last played — they only flip between major/minor borrowing based on which ROW was last pressed.

#### After pressing a MAJOR ROW pad (Row 4) → borrows from Parallel Minor:

| Pad | Col | Roman Numeral Label | Chord | Example in C | Character |
|-----|-----|---------------------|-------|--------------|-------------------------------------------|
| 0 | 4 | bVII7 | Backdoor dominant | Bb7 | R&B/gospel signature — approaches tonic from subdominant side |
| 1 | 5 | bIII | Relative major of parallel minor | Ebmaj7 | Dreamy, distant — three steps flat |
| 2 | 6 | iv (bIV) | Minor subdominant | Fm7 | Melancholic — the Andalusian cadence sound |
| 3 | 7 | bVI | Major on flat 6th | Abmaj7 | Stadium anthem move — surprising but immediately right |

#### After pressing a MINOR ROW pad (Row 5) → borrows from Parallel Major:

| Pad | Col | Roman Numeral Label | Chord | Example in Cm | Character |
|-----|-----|---------------------|-------|---------------|------------------------------------------|
| 0 | 4 | I (Picardy) | Major tonic | Cmaj7 | Baroque "arrival" — major tonic in minor context |
| 1 | 5 | III | Major mediant | Em7 | Bright floating — unexpected lift in minor |
| 2 | 6 | IV | Major subdominant | Fmaj7 | Gospel lift — major IV in a minor key |
| 3 | 7 | VI | Major submediant | Am7 | Dorian flavor — warmth from the major world |

---

## ROW 7 — Green Sus (col 0–3) + Gold Advanced (col 4–7)

### Green — Sus Quadrant (col 0–3) — STATIC (never changes)

These 4 pads are completely fixed to the key. They do not react to which chord was last played. They always show the same 4 suspended chords.

| Pad | Col | Label | Chord | Example in C | Theory |
|-----|-----|-------|-------|--------------|-------------------------------------------|
| 0 | 0 | I sus2 | Root + 2nd + 5th (no 3rd) | Csus2 | Ambiguous, floating — resolves naturally when 2nd drops to 3rd |
| 1 | 1 | I sus4 | Root + 4th + 5th (no 3rd) | Csus4 | Gospel "wait" chord — the 4th resolves down to the 3rd |
| 2 | 2 | V sus2 | V root + 2nd + 5th | Gsus2 | Dominant without committing to major quality |
| 3 | 3 | vi sus4 | vi root + 4th + 5th | Asus4 | Submediant suspended — melancholic float |

---

### Gold — Advanced Chromatic Quadrant (col 4–7) — STATIC (fixed to key, not context-reactive)

Four highly chromatic chords from the classical tradition. Always the same regardless of major/minor row context.

| Pad | Col | Label | Chord | Example in C | Theory |
|-----|-----|-------|-------|--------------|--------|
| 0 | 4 | N6 (Neapolitan) | bIImaj7 | Dbmaj7 | Major chord a half-step above tonic. Classical predominant — leads to V. Dark, operatic. |
| 1 | 5 | Ger+6 (German Aug. 6th) | bVI dom7 | Ab7 | Built on bVI. Contains augmented 6th interval (b6–#4) that expands to octave on V. Resolves to V — flashes V pad. |
| 2 | 6 | Fr+6 (French Aug. 6th) | bVI dom7b5 | Ab7b5 | Like German +6 but with flattened 5th — more ambiguous, impressionistic (Debussy/Ravel). Resolves to V. |
| 3 | 7 | TT (Tritone Sub) | bII7 | Db7 | Replaces V7. Tritone of Db7 is enharmonically identical to G7's tritone — bass moves chromatically (Db→C) instead of by 5th (G→C). Jazzy, smooth approach. |

> Pads Ger+6 and Fr+6 flash the V pad on press to indicate their resolution target.

---

## ROW 3 — Purple Portal (col 0–3) + Red Tension (col 4–7)

### Purple — Sharp-Side Portal Gates (col 0–3) — STATIC label, STATIC chord, triggers KEY CHANGE

These contain the same chords as the Red Tension row but pressing them triggers a **permanent key change** to the target key. The dominant chord plays, then `cfCheckAutoModulation()` is forced with a `forceResult` — bypassing history detection and immediately updating `cf.key`.

| Pad | Col | Label | Chord | Modulates to | Example in C |
|-----|-----|-------|-------|-------------|---------------|
| 0 | 0 | V/ii → key | A7 | D Major/Minor | A7 → now in D |
| 1 | 1 | V/iii → key | B7 | E Major/Minor | B7 → now in E |
| 2 | 2 | V/V → key | D7 | G Major/Minor | D7 → now in G |
| 3 | 3 | V/vi → key | E7 | A Major/Minor | E7 → now in A |

> Sharp-side portals feel like "arriving" — moving up the circle of fifths into a brighter key.

---

### Red — Secondary Dominants / Tension (col 4–7) — Context-Reactive

These tonicize a diatonic chord without changing the key. They activate **Resolution Guide highlights** on the diatonic rows when pressed (★ = primary target, ◇ = deceptive).

#### Major context (after Row 4 press):

| Pad | Col | Label | Chord | Example in C | Resolves to |
|-----|-----|-------|-------|--------------|-------------|
| 0 | 4 | V/ii | A7 | A7 | Dm7 (ii) |
| 1 | 5 | V/iii | B7 | B7 | Em7 (iii) |
| 2 | 6 | V/V | D7 | D7 | G7 (V) |
| 3 | 7 | V/vi | E7 | E7 | Am7 (vi) |

#### Minor context (after Row 5 press):

| Pad | Col | Label | Chord | Example in Cm | Resolves to |
|-----|-----|-------|-------|---------------|-------------|
| 0 | 4 | V/bIII | G7 | G7 | Ebmaj7 (bIII) |
| 1 | 5 | V/iv | C7 | C7 | Fm7 (iv) |
| 2 | 6 | V/v | D7 | D7 | Gm7 (v) |
| 3 | 7 | V/bVI | Eb7 | Eb7 | Abmaj7 (bVI) |

---

## ROW 2 — Purple Flat Portals (col 0–3) + Red Dim7s (col 4–7)

### Purple — Flat-Side Portal Gates (col 0–3) — STATIC label, STATIC chord, triggers KEY CHANGE

Same mechanism as Row 3 Purple, but navigates **down** the circle of fifths into flatter keys. Pressing any of these plays the dominant 7th of the target and immediately modulates.

| Pad | Col | Label | Chord | Modulates to | Character |
|-----|-----|-------|-------|-------------|-------------------------------------------|
| 0 | 0 | V/IV → key | C7 | F Major/Minor | Subdominant — closest flat step. The "relaxing into" move. |
| 1 | 1 | V/bVII → key | F7 | Bb Major/Minor | One step flat — gospel/soul staple. |
| 2 | 2 | V/bIII → key | Bb7 | Eb Major/Minor | Two steps flat — rich and cinematic. |
| 3 | 3 | V/bVI → key | Eb7 | Ab Major/Minor | Three steps flat — deep into the flat world. |

> Flat-side portals feel like "settling" — moving down into a warmer, darker key.

---

### Red — Secondary Diminished 7ths (col 4–7) — Context-Reactive

More intense than secondary dominants — a leading-tone dim7 a half-step below the target chord root. Also activates Resolution Guide highlights.

#### Major context (after Row 4 press):

| Pad | Col | Label | Dim7 Root | Example in C | Target |
|-----|-----|-------|-----------|--------------|--------|
| 0 | 4 | vii°7/ii | C#dim7 | C#dim7 | Dm7 (ii) |
| 1 | 5 | vii°7/iii | D#dim7 | D#dim7 | Em7 (iii) |
| 2 | 6 | vii°7/V | F#dim7 | F#dim7 | G7 (V) |
| 3 | 7 | vii°7/vi | G#dim7 | G#dim7 | Am7 (vi) |

#### Minor context (after Row 5 press):

| Pad | Col | Label | Dim7 Root | Example in Cm | Target |
|-----|-----|-------|-----------|---------------|--------|
| 0 | 4 | vii°7/bIII | Ddim7 | Ddim7 | Ebmaj7 (bIII) |
| 1 | 5 | vii°7/iv | Edim7 | Edim7 | Fm7 (iv) |
| 2 | 6 | vii°7/v | F#dim7 | F#dim7 | Gm7 (v) |
| 3 | 7 | vii°7/bVI | Gdim7 | Gdim7 | Abmaj7 (bVI) |

---

## Summary: All 32 Pads at a Glance

```
         Col 0          Col 1          Col 2          Col 3          Col 4          Col 5          Col 6          Col 7
Row 2  [V/IV→F] Purple [V/bVII→Bb]  [V/bIII→Eb]   [V/bVI→Ab]   [vii°7/ii]     [vii°7/iii]   [vii°7/V]      [vii°7/vi]
                                                    (flat portals)                              (secondary dim7s, context shifts maj/min)

Row 3  [V/ii→D] Purple [V/iii→E]    [V/V→G]       [V/vi→A]     [V/ii] Red     [V/iii] Red   [V/V] Red      [V/vi] Red
                                                    (sharp portals)                             (secondary dominants, context shifts maj/min)

Row 6  [Resolve 0]     [Resolve 1]  [Resolve 2]   [Resolve 3]  [bVII7/Picardy] [bIII/III]   [iv/IV]        [bVI/VI]
        Green                                       (strongest→best common-tone) Gold Color (context shifts maj/min)

Row 7  [I sus2]        [I sus4]     [V sus2]      [vi sus4]    [N6]            [Ger+6]       [Fr+6]         [TT sub]
        Green Sus (static)                          Gold Advanced (static)
```

### Display Format Required for Every Pad

```
┌─────────────┐
│   V/ii      │  ← TOP LINE: Roman numeral / function label (small text)
│    A7       │  ← BOTTOM LINE: Chord name (larger text)
└─────────────┘
```

Static pads (Sus, Gold Advanced, Purple Portals) always show the same label.
Context-reactive pads (Green Resolve, Gold Color, Red Tension, Red Dim7s) update their label after every diatonic pad press.
