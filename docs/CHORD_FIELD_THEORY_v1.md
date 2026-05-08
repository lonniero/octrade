# Octadre Chord Field — Harmonic Theory & Architecture

> A deep technical guide to the music theory and engineering concepts powering the Octadre Chord Field instrument.
> Synchronized with `chord-field-engine.js` and `app.js` — May 2026.

---

## Table of Contents

1. [Philosophy & Design Intent](#1-philosophy--design-intent)
2. [Physical Layout — The Full 8×8 Grid](#2-physical-layout--the-full-88-grid)
3. [Rows 4–5: The Diatonic Rows — Parallel Major & Minor](#3-rows-45-the-diatonic-rows--parallel-major--minor)
4. [Rows 6–7: The Context Quadrants](#4-rows-67-the-context-quadrants)
   - [Green Row 6 (Pads 0–3): Functional Resolution](#green-row-6-pads-03-functional-resolution)
   - [Green Row 7 (Pads 0–3): Suspended Chords](#green-row-7-pads-03-suspended-chords)
   - [Gold Row 6 (Pads 4–7): Modal Interchange / Borrowed Chords](#gold-row-6-pads-47-modal-interchange--borrowed-chords)
   - [Gold Row 7 (Pads 4–7): Advanced Chromatic Borrowed Chords](#gold-row-7-pads-47-advanced-chromatic-borrowed-chords)
   - [Red Row 3 (Pads 4–7): Secondary Dominants](#red-row-3-pads-47-secondary-dominants)
   - [Red Row 2 (Pads 4–7): Secondary Diminished 7ths](#red-row-2-pads-47-secondary-diminished-7ths)
   - [Purple Row 3 (Pads 0–3): Portal Modulation Gates](#purple-row-3-pads-03-portal-modulation-gates)
   - [Purple Row 2 (Pads 0–3): Diminished Portal Gates](#purple-row-2-pads-03-diminished-portal-gates)
5. [Rows 0–1: The Memory Bank (Breadcrumbs)](#5-rows-01-the-memory-bank-breadcrumbs)
6. [The Voice Leading Engine](#6-the-voice-leading-engine)
7. [The Auto-Modulation System](#7-the-auto-modulation-system)
8. [Mode System & Brightness Spectrum](#8-mode-system--brightness-spectrum)
9. [Voicing Architecture](#9-voicing-architecture)
10. [The Rhodes FM Synth](#10-the-rhodes-fm-synth)

---

## 1. Philosophy & Design Intent

The Chord Field is not a traditional chord player. It is a **harmonic navigation instrument** — a real-time system that always knows where you are in a key, where you could go next, and how to get there in the most musical way possible.

Three principles drive the entire engine:

- **Gravity, not randomness.** Every voice in a chord moves by the smallest interval possible. The instrument behaves like a pianist's hands — fingers that are already on the keys don't fly across the keyboard for no reason.
- **Context, not presets.** The surrounding context chords are not a static bank. They recalculate completely after every diatonic pad press, using the current chord as the point of departure to suggest the most harmonically relevant options at every level — from simple resolutions to chromatic augmented 6th chords.
- **Parallel worlds.** The instrument simultaneously tracks both the Major and Minor versions of the current key, allowing the player to shift between bright and dark harmony by simply moving between rows — without formally "changing key."

---

## 2. Physical Layout — The Full 8×8 Grid

The grid is **8 rows × 8 columns** = 64 pads total. Each row serves a specific harmonic purpose.

```
Row  0  │  ◆ MEMORY BANK (Breadcrumbs slots 1–8)
Row  1  │  ◆ MEMORY BANK (Breadcrumbs slots 9–16)
─────────┼──────────────────────────────────────────────────────────────────
Row  2  │  [col 0-3] PURPLE 2nd row — dim7 Portal Gates
         │  [col 4-7] RED 2nd row    — Secondary Diminished 7ths (no modulation)
─────────┼──────────────────────────────────────────────────────────────────
Row  3  │  [col 0-3] PURPLE 1st row — Secondary Dominant Portal Gates (V/x → key change)
         │  [col 4-7] RED 1st row    — Secondary Dominants (V/x, no key change)
─────────┼──────────────────────────────────────────────────────────────────
Row  4  │  ▶ DIATONIC MAJOR (Ionian) — I ii iii IV V vi vii° I
Row  5  │  ▶ DIATONIC MINOR (Aeolian) — i ii° ♭III iv v ♭VI ♭VII i
─────────┼──────────────────────────────────────────────────────────────────
Row  6  │  [col 0-3] GREEN 1st row  — Functional Resolutions
         │  [col 4-7] GOLD 1st row   — Modal Interchange / Borrowed Chords
─────────┼──────────────────────────────────────────────────────────────────
Row  7  │  [col 0-3] GREEN 2nd row  — Suspended Chords
         │  [col 4-7] GOLD 2nd row   — Advanced Chromatic Borrowed (N6, Ger+6, Fr+6, TT)
```

**Color quadrant summary:**

| Color  | Rows   | Cols  | Harmonic Role                        | Key Change? |
| :----- | :----- | :---- | :----------------------------------- | :---------- |
| Green  | 6, 7   | 0–3   | Resolution & Suspension              | No          |
| Gold   | 6, 7   | 4–7   | Borrowed / Modal Interchange         | No          |
| Red    | 3, 2   | 4–7   | Tension (Secondary Dominants & dim7s)| No          |
| Purple | 3, 2   | 0–3   | Modulation Gates (same chords → key change) | **Yes** |

---

## 3. Rows 4–5: The Diatonic Rows — Parallel Major & Minor

These two rows are the **home base** of the instrument. Every context chord calculation originates from whichever pad was last pressed here.

### Row 4 — Parallel Major (Ionian)

Permanently fixed to the **Major (Ionian)** scale of the current key, using natural 7th chord qualities:

| Col | Degree | Name (in C) | Quality     |
| :-- | :----- | :---------- | :---------- |
| 0   | I      | Cmaj7       | `maj7`      |
| 1   | ii     | Dm7         | `min7`      |
| 2   | iii    | Em7         | `min7`      |
| 3   | IV     | Fmaj7       | `maj7`      |
| 4   | V      | G7          | `dom7`      |
| 5   | vi     | Am7         | `min7`      |
| 6   | vii°   | Bm7♭5       | `halfdim7`  |
| 7   | I(8ve) | Cmaj7       | `maj7`      |

**Reactive trigger:** Sets `lastDiatonicRowType = 'minor'` (the *opposite* of what you played, so borrowed chords show the contrasting flavor). The Gold quadrant will show **Minor borrowed** chords.

---

### Row 5 — Parallel Minor (Aeolian)

Fixed to the **Natural Minor (Aeolian)** scale of the *same tonic*. Not a different key — a parallel mode sharing the same root.

| Col | Degree | Name (in C) | Quality     |
| :-- | :----- | :---------- | :---------- |
| 0   | i      | Cm7         | `min7`      |
| 1   | ii°    | Dm7♭5       | `halfdim7`  |
| 2   | ♭III   | E♭maj7      | `maj7`      |
| 3   | iv     | Fm7         | `min7`      |
| 4   | v      | Gm7         | `min7`      |
| 5   | ♭VI    | A♭maj7      | `maj7`      |
| 6   | ♭VII   | B♭7         | `dom7`      |
| 7   | i(8ve) | Cm7         | `min7`      |

**Reactive trigger:** Sets `lastDiatonicRowType = 'major'` so the Gold quadrant will show **Major borrowed** chords (the bright world borrowed into a dark context).

### Why Parallel, Not Relative?

**Parallel** major and minor (C Major / C Minor) share the same root. This means a player can switch between the bright and dark world without the bass register moving — the tonic stays anchored. Only the harmonic color changes. This is the same technique used in gospel ("Picardy third" endings), neo-soul, and film scores.

---

## 4. Rows 6–7: The Context Quadrants

After every diatonic pad press, the engine recomputes all four color quadrants. Each color has **two rows** — a first row of primary options and a second row of advanced or variant options.

---

### Green Row 6 (Pads 0–3): Functional Resolution

**Theory:** The classic cadential moves of tonal harmony. These chords have gravitational pull toward a tonic. The specific chords shown depend on which chord you just played.

**In a Major context:**

| Pad | Logic | Example (in C) |
| :-- | :---- | :------------- |
| 0   | Strongest resolution from current position. V→I, ii→V, I→vi, others resolve down a 5th. | G7 → Cmaj7 |
| 1   | Mediant (iii) — tonic-function, shares notes with both I and V. Falls back to IV (plagal). | Em7 or Fmaj7 |
| 2   | Subdominant (IV) — the plagal ("Amen") resolution. Falls back to V if IV is already used. | Fmaj7 |
| 3   | Best common-tone match — whichever unused diatonic chord shares the most pitch classes with the current chord. | Varies |

**In a Minor context** (uses Harmonic Minor for pad 0 to supply the raised 7th / major V):

| Pad | Logic | Example (in Cm) |
| :-- | :---- | :-------------- |
| 0   | V→i using harmonic minor dominant (major V chord). | G7 → Cm7 |
| 1   | ♭VI — major chord on flat 6th. Strong common-tone bridge to tonic minor. | A♭maj7 |
| 2   | ♭III — the relative major. Most common "brightening" move from minor. | E♭maj7 |
| 3   | Best common-tone match from harmonic minor scale. | Varies |

> **Design note:** Green pads play their chord but **do not reshuffle** the context. Only diatonic pads trigger a full context recalculation. This lets you cadence freely within the current harmonic neighborhood without disrupting it.

---

### Green Row 7 (Pads 0–3): Suspended Chords

**Theory:** Suspended chords omit the 3rd and replace it with either a 2nd (sus2) or a 4th (sus4). This creates an ambiguous, floating quality — neither major nor minor — that resolves naturally by dropping the suspended note to the 3rd.

All four sus chords are fixed to the current key (not reactive to context):

| Pad | Chord        | Voicing logic | Example (in C) |
| :-- | :----------- | :------------ | :------------- |
| 0   | I sus2       | Root + 2nd + 5th | Csus2 |
| 1   | I sus4       | Root + 4th + 5th | Csus4 |
| 2   | V sus2       | V root + 6th + 2nd | Gsus2 |
| 3   | vi sus4      | vi root + 2nd + 5th | Asus4 |

Suspended chords are gospel staples — they set up a resolution that feels inevitable ("the chord that makes you wait for the 3rd to arrive"). They're also widely used in neo-soul and ambient music to sustain tension without committing to a quality.

---

### Gold Row 6 (Pads 4–7): Modal Interchange / Borrowed Chords

**Theory:** Modal interchange — borrowing chords from the parallel mode to color a progression without modulating.

**After playing the Major Row (Row 4) → borrows from Parallel Minor:**

| Pad | Chord | Example (in C) | Character |
| :-- | :---- | :------------- | :-------- |
| 4   | ♭I (tonic minor) | Cm7 | Direct "darkening" — flatten the 3rd of your tonic |
| 5   | ♭III (relative major of parallel minor) | E♭maj7 | Dreamy, distant — three steps flat |
| 6   | ♭IV (minor subdominant) | Fm7 | Melancholic — the Andalusian cadence sound |
| 7   | ♭VI (major on ♭6th) | A♭maj7 | Stadium anthem move — surprising but immediately right |

**After playing the Minor Row (Row 5) → borrows from Parallel Major:**

| Pad | Chord | Example (in Cm) | Character |
| :-- | :---- | :-------------- | :-------- |
| 4   | I major (Picardy) | Cmaj7 | Baroque "arrival" — major tonic in a minor context |
| 5   | III (major mediant) | Em7 | Bright, floating — unexpected lift in minor |
| 6   | IV major | Fmaj7 | Gospel lift — major subdominant in a minor key |
| 7   | VI (major submediant) | Am7 | Dorian flavor — warmth borrowed from the major world |

> These four chords are **fixed to the key root** regardless of which diatonic degree was last played. They represent the same four borrowed scale positions every time, making them reliable and musically predictable.

---

### Gold Row 7 (Pads 4–7): Advanced Chromatic Borrowed Chords

**Theory:** Four highly chromatic chords from the classical tradition — Neapolitan, German Augmented 6th, French Augmented 6th, and the Tritone Substitution. These go beyond simple modal borrowing into fully chromatic harmony.

These are **fixed to the key** and do not change based on major/minor row context.

| Pad | Name | Symbol | Example (in C) | Theory |
| :-- | :--- | :----- | :------------- | :----- |
| 4   | Neapolitan | N6 | D♭maj7 | The ♭II chord — a major chord a half-step above the tonic. Classical predominant function, leads to V. Dark, operatic quality. |
| 5   | German Augmented 6th | Ger⁺⁶ | A♭7 | Built on ♭VI. Contains the interval of an augmented 6th (♭6–♯4) that expands outward to the octave on V. Enharmonically equivalent to a dom7 but functions differently — resolves to V. Triggers a visual flash on the V pad. |
| 6   | French Augmented 6th | Fr⁺⁶ | A♭7♭5 | Similar to German +6 but uses a flattened 5th (dom7♭5 quality). Has a more ambiguous, impressionistic color — the French 6th was favored by Debussy and Ravel. Also resolves to V. |
| 7   | Tritone Substitution | TT | D♭7 | The ♭II dominant 7th replacing V7. The tritone (♭7–3) of D♭7 is enharmonically identical to the tritone (3–♭7) of G7, so the ear accepts either chord as a dominant. The bass moves chromatically (D♭→C) instead of by a 5th (G→C), creating a smooth, jazzy approach. |

> The German and French +6 chords flash the V pad upon pressing, signaling their classical resolution target.

---

### Red Row 3 (Pads 4–7): Secondary Dominants

**Theory:** Every major or minor chord in a key can be temporarily treated as a local tonic by preceding it with its own dominant 7th chord (a chord a perfect 5th above it). This is called "tonicization."

These chords **do not change the key**. They create local tension that resolves within the current tonal center.

**In a Major context:**

| Pad | Label | Dominant of... | Example (in C) | Resolves to |
| :-- | :---- | :------------- | :------------- | :---------- |
| 4   | V/ii  | Supertonic     | A7             | Dm7 (ii)    |
| 5   | V/iii | Mediant        | B7             | Em7 (iii)   |
| 6   | V/V   | Dominant       | D7             | G7 (V)      |
| 7   | V/vi  | Submediant     | E7             | Am7 (vi)    |

**In a Minor context:**

| Pad | Label  | Dominant of... | Example (in Cm) | Resolves to |
| :-- | :----- | :------------- | :-------------- | :---------- |
| 4   | V/♭III | Relative major | G7              | E♭maj7      |
| 5   | V/iv   | Subdominant    | C7              | Fm7         |
| 6   | V/v    | Dominant       | D7              | Gm7         |
| 7   | V/♭VI  | Major submediant| E♭7            | A♭maj7      |

When pressed, Red pads activate **Resolution Guide highlights** on the diatonic rows, marking which pad the tension wants to resolve to (★ = primary target, ◇ = deceptive alternative).

---

### Red Row 2 (Pads 4–7): Secondary Diminished 7ths

**Theory:** Just as a dominant 7th (V7) can tonicize a chord, a **leading-tone diminished 7th** (vii°7) can also approach the same target — built a half-step below the target chord's root. This is `vii°7/x`: the diminished 7th of the target degree.

Diminished 7ths are more intense and chromatic than regular secondary dominants. They were the "shock chord" of Romantic-era music and remain common in gospel and cinematic scores.

**In a Major context:**

| Pad | Label     | dim7 root | Example (in C) | Target  |
| :-- | :-------- | :-------- | :------------- | :------ |
| 4   | vii°7/ii  | C#dim7    | C#dim7         | Dm7     |
| 5   | vii°7/iii | D#dim7    | D#dim7         | Em7     |
| 6   | vii°7/V   | F#dim7    | F#dim7         | G7      |
| 7   | vii°7/vi  | G#dim7    | G#dim7         | Am7     |

**In a Minor context:**

| Pad | Label      | dim7 root | Example (in Cm) | Target  |
| :-- | :--------- | :-------- | :-------------- | :------ |
| 4   | vii°7/♭III | Ddim7     | Ddim7           | E♭maj7  |
| 5   | vii°7/iv   | Edim7     | Edim7           | Fm7     |
| 6   | vii°7/v    | F#dim7    | F#dim7          | Gm7     |
| 7   | vii°7/♭VI  | Gdim7     | Gdim7           | A♭maj7  |

Like the Red 1st row, pressing these also activates the Resolution Guide highlights.

---

### Purple Row 3 (Pads 0–3): Portal Modulation Gates

**Theory:** These contain the **exact same secondary dominant chords** as Red Row 3 (Pads 4–7) — but pressing one triggers a **permanent key change** to the target key.

| Pad | Label     | Chord | Modulates to |
| :-- | :-------- | :---- | :----------- |
| 0   | V/ii → I  | A7    | D Major/Minor |
| 1   | V/iii → I | B7    | E Major/Minor |
| 2   | V/V → I   | D7    | G Major/Minor |
| 3   | V/vi → I  | E7    | A Major/Minor |

**The mechanism:** Pressing a Purple pad plays the dominant chord, then forces `cfCheckAutoModulation()` with a `forceResult` object — bypassing all history-based detection and immediately updating `cf.key` and `cf.modeIndex`. The entire diatonic grid redraws in the new key.

**Why doesn't it always feel like a modulation?** The portal chord is a dominant 7th. If you immediately return to chords in your original key after pressing it, your ear re-anchors to the original center. A modulation only "sticks" if you commit to the new key — exactly as it works in real jazz harmony.

---

### Purple Row 2 (Pads 0–3): Diminished Portal Gates

**Theory:** The same relationship as Red/Purple 1st row, but using **leading-tone diminished 7th chords** as the modulation gateway. These are the same chords as Red Row 2, but pressing one **also triggers a key change**.

| Pad | Label         | dim7 chord | Modulates to |
| :-- | :------------ | :--------- | :----------- |
| 0   | vii°7/ii → I  | C#dim7     | D Major/Minor |
| 1   | vii°7/iii → I | D#dim7     | E Major/Minor |
| 2   | vii°7/V → I   | F#dim7     | G Major/Minor |
| 3   | vii°7/vi → I  | G#dim7     | A Major/Minor |

The diminished 7th portal is a more dramatic, abrupt modulation than the dominant portal — the chord offers no "return home" ambiguity. Historically, composers used diminished 7ths for sudden, jarring key changes precisely because the chord is so directionally charged.

---

## 5. Rows 0–1: The Memory Bank (Breadcrumbs)

Rows 0 and 1 together form a **16-slot memory bank** for capturing and replaying exact chord voicings.

- **Row 0:** Slots 1–8
- **Row 1:** Slots 9–16

### Capture
When a chord is saved, the engine records the complete `voicedMIDI` array — not just the root and quality, but the precise MIDI note numbers of every voice in its current inversion and register. For example: `[48, 52, 55, 59]` = C3, E3, G3, B3.

### Recall
Tapping a breadcrumb replays those exact MIDI note numbers. The voice-leading engine is **completely bypassed** during recall. What you hear is exactly what you played when you saved it.

After recall, the engine updates `cf.prevVoicing` so that the *next* chord you play will still voice-lead smoothly away from the recalled voicing — even though the recalled chord itself wasn't processed through the engine.

### Why bypass voice leading for recall?
The voice-leading engine would recalculate the chord's register and inversion based on your current position on the board. A beautiful high-register rootless voicing you captured might come back as a mid-register close position chord. The breadcrumb bank is a **faithful tape recorder**, not a reharmonizer.

---

## 6. The Voice Leading Engine

The engine (`voiceLeadNatural()`) mimics the physical constraints of a pianist's hands. It runs in three stages after every chord press.

### Stage 1 — Common-Tone Retention
The engine finds notes shared between the current and previous chord (as pitch classes). Those notes are kept at the **exact same MIDI note number** — zero movement. This is the most efficient voice motion possible.

*Example:* Cmaj7 `[C, E, G, B]` → Am7 `[A, C, E, G]` — three pitch classes (C, E, G) are shared. Those three voices hold. Only B needs to move, and it moves to A (down a whole step).

### Stage 2 — Tendency-Tone Resolution
For voices with no common-tone match, the engine checks against a resolution table:

| Interval from chord root | Tone | Resolution |
| :--- | :--- | :--- |
| ♭7 (10 semitones) | Minor 7th | Resolves **down** a half step |
| Maj7 (11 semitones) | Leading tone | Resolves **down** a half step |
| ♭5 / tritone (6 semitones) | Tritone | Resolves **down** a half step |
| ♭9 (1 semitone) | Flat 9 | Resolves **down** a half step |
| ♯5 / ♭13 (8 semitones) | Aug. 5th | Resolves **up** |

Resolution only applies if the resolved note is actually present in the target chord — the engine will never "force" a textbook resolution to a wrong note.

### Stage 3 — Stepwise Motion
Remaining unassigned voices find the closest octave placement of their target pitch class. Three candidate octaves are evaluated per voice; the one with the smallest distance from the previous note wins.

### Centroid Gravity
After voicing, the engine calculates the average MIDI pitch (centroid) of the chord. If this drifts outside the range **MIDI 48–66** (C3–F#4), the entire voicing is shifted by whole octaves back toward the **gravity target of MIDI 57 (A3)**.

This prevents the instrument from drifting permanently into very high or low registers during extended improvisation — like gravity keeping an orbit stable.

### Independent Bass Voice
The bass is handled separately by `voiceLeadBass()`:
- Range: **E2–C4** (MIDI 40–60)
- Center: **C3 (MIDI 48)** — piano left-hand sweet spot
- Prefers root position; plays the chord root in the bass

---

## 7. The Auto-Modulation System

Beyond explicit Purple portals, the engine listens for natural **ii–V patterns** and uses them to detect implied modulations.

A `ii → V → I` progression is the most powerful cadential formula in tonal music. The insight: if you play a chord that functions as `ii` followed by a chord that functions as `V` — and both chords belong to a *different key* than your current one — you have functionally declared that key through your playing.

**Detection logic:**
1. Is the current chord a dominant 7th quality?
2. Was the previous chord a predominant (ii or IV) in the key that this dominant resolves to?
3. If yes → shift to that key.

This creates a "stealth modulation" — you can drift across keys naturally just by playing ii–V ideas, exactly as a jazz musician navigates "the changes."

Purple portals override this with a `forceResult` object, bypassing detection entirely for an immediate key shift.

---

## 8. Mode System & Brightness Spectrum

8 modes supported, ordered by brightness:

```
Lydian → Ionian → Mixolydian → Dorian → Aeolian → Phrygian → Locrian
  ↑                                                               ↓
Brightest                                                     Darkest
```

Each adjacent mode differs by exactly **one note**. The diatonic rows always use **Ionian** (Row 4) and **Aeolian** (Row 5) as the fixed parallel pair. Each mode has its own full mapping of natural triad and 7th chord qualities per degree.

Additionally, **Harmonic Minor** (raised 7th) is used internally for the minor-context Resolution quadrant to supply a proper major V chord — the leading tone that makes minor cadences feel fully resolved.

---

## 9. Voicing Architecture

Eight voicing types are selectable via the modifier ring:

| Voicing    | Description | Character |
| :--------- | :---------- | :-------- |
| `close`    | All notes within one octave from root | Clear, beginner-friendly |
| `drop2`    | 2nd-from-top voice drops an octave | Classic jazz piano — wide bass interval |
| `drop3`    | 3rd-from-top voice drops an octave | Spacious, orchestral |
| `open`     | Voices spread across a wide range | Ambient, impressionist |
| `rootlessA`| Omits root — 3rd, 7th, upper extensions | Professional jazz piano |
| `rootlessB`| Alternate rootless layout | Variation on rootlessA |
| `quartal`  | Built in 4ths instead of 3rds | Herbie Hancock / McCoy Tyner |
| `triad`    | Root, 3rd, 5th only | Clean, pop-friendly |

**Quality modifiers** upgrade the chord type across the whole grid: `7th`, `9th`, `11th`, `13th`, `sus4`, `add9`, `6/9`, `triad`.

---

## 10. The Rhodes FM Synth

A custom **FM Synthesis electric piano** built entirely in the Web Audio API — no samples.

**Dual-modulator design:**

- **Modulator 1 — Tine (14:1 ratio):** Generates high-frequency inharmonic content — the glassy "bells" of a real Fender Rhodes tine.
- **Modulator 2 — Bark (1:1 ratio):** Same frequency as carrier — produces the fundamental "thump" and mid-range warmth.

**Velocity tracking:** Light touch → low modulation depth → pure, warm sine tone. Hard strike → high depth → bright, metallic, "tine-forward" tone. Each chord has a slightly different texture depending on how it is played.

---

*Document synchronized with `chord-field-engine.js` and `app.js`. Last Updated: May 2026.*
