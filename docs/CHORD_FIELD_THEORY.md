# Octadre Chord Field — Harmonic Theory & Architecture

> A technical guide to the music theory concepts powering Octadre's chord field instrument.

---

## Table of Contents

1. [Overview](#overview)
2. [The Modal System](#the-modal-system)
3. [Voice Leading Engine](#voice-leading-engine)
4. [Voicing Types](#voicing-types)
5. [The Context Chord System](#the-context-chord-system)
6. [Neo-Riemannian Transformations](#neo-riemannian-transformations)
7. [Modulation Detection](#modulation-detection)
8. [The Rhodes Synth](#the-rhodes-synth)
9. [Humanization & Performance](#humanization--performance)

---

## 1. Overview

The chord field is a **harmonic navigation instrument** — think of it as an intelligent chord keyboard that understands where you are in a harmonic space and suggests where you might go next. Rather than requiring the player to know music theory, the instrument embeds decades of jazz, gospel, neo-soul, and classical harmony into its layout and real-time suggestions.

**Core principles:**
- Every chord you press triggers **intelligent voice leading** — notes move by the smallest possible intervals, just like a trained pianist
- The surrounding pads update to show **harmonically meaningful next moves** based on functional harmony, Neo-Riemannian theory, and chromatic relationships
- The system tracks your harmonic trajectory and can **detect modulations** automatically, adjusting the key context in real-time
- All of this runs in the browser using Web Audio API — no external synths or DAW required

### Layouts

The chord field supports three layouts:

| Layout | Description |
|--------|-------------|
| **Ring** | Circle of fifths (inner ring) + 16 context chords (outer ring) + center controls |
| **Diatonic** | Row-based grid with 7 diatonic chords + categorized context chords in rows above |
| **Classic** | 8×8 grid: 7 scale degrees × 8 quality rows (maj7, min7, dom7, etc.) |

---

## 2. The Modal System

### Mode Spectrum (Bright → Dark)

Octadre arranges the 7 diatonic modes on a **brightness spectrum** where each adjacent mode differs by exactly one note:

```
Lydian → Ionian → Mixolydian → Dorian → Aeolian → Phrygian → Locrian
 #4        ♮4       ♮4,♭7      ♭3,♭7   ♭3,♭6,♭7  ♭2,♭3...   ♭2,♭3,♭5...
(brightest)                                                    (darkest)
```

**Scale degree intervals:**
| Mode       | Intervals        | Character |
|-----------|------------------|-----------|
| Lydian     | 0 2 4 6 7 9 11  | Ethereal, floating (#4 = no pull to resolve) |
| Ionian     | 0 2 4 5 7 9 11  | "Major" — stable, resolved |
| Mixolydian | 0 2 4 5 7 9 10  | Bluesy major (♭7 adds dominant pull) |
| Dorian     | 0 2 3 5 7 9 10  | Jazz minor — minor with a bright 6th |
| Aeolian    | 0 2 3 5 7 8 10  | Natural minor — melancholy |
| Phrygian   | 0 1 3 5 7 8 10  | Spanish/Middle Eastern (♭2 = exotic) |
| Locrian    | 0 1 3 5 6 8 10  | Unstable (diminished tonic, rarely used as tonal center) |

### Diatonic Chord Quality

Each scale degree generates a specific chord quality determined by the mode. For example, in **Ionian** (major):

```
I      ii     iii    IV     V      vi     vii°
Cmaj7  Dm7    Em7    Fmaj7  G7     Am7    Bø7
```

The engine maps every mode to its diatonic 7th chords via `MODE_DEGREE_7THS`, so switching from Ionian to Dorian instantly reharmonizes the entire field.

---

## 3. Voice Leading Engine

This is the heart of what makes the chord field sound like a **pianist** rather than a MIDI controller. Every chord change uses a three-priority voice leading algorithm:

### Priority 1: Common-Tone Retention

If a pitch class appears in both the old and new chords, it **stays at the exact same MIDI note** — the finger doesn't move. This is the #1 rule of smooth voice leading.

```
Example: Cmaj7 → Am7
  B (maj7 of C) stays as B (9th of A)
  E (3rd of C) stays as E (5th of A)
  → Only 2 voices move, 2 stay still
```

### Priority 2: Tendency-Tone Resolution

Certain intervals have built-in "gravitational pull" — they *want* to resolve in a specific direction. The engine knows about these:

| Interval from Root | Name | Resolution |
|-------------------|------|------------|
| 10 (♭7) | Dominant 7th | Resolves **DOWN** by half-step |
| 11 (maj7) | Major 7th | Resolves **DOWN** by half-step |
| 6 (♭5/tritone) | Tritone | Resolves **DOWN** |
| 1 (♭9) | Flat nine | Resolves **DOWN** |
| 8 (#5/♭13) | Augmented 5th | Resolves **UP** |

```
Example: G7 → Cmaj7
  F (♭7 of G) resolves DOWN to E (3rd of C)  ← tendency tone!
  B (3rd of G) resolves UP to C (root of C)    ← leading tone!
```

### Priority 3: Stepwise Motion

Any remaining unplaced voices find the **closest available pitch class** from the new chord — minimizing total movement in semitones.

### Bass Voice Independence

The bass voice (left hand) operates on its own voice-leading logic, separate from the upper voices:
- Prefers motion by **4th or 5th** (strongest bass motion in tonal music)
- Stays within the piano left-hand "sweet spot" (E2–C4, centered on C3)
- Moves independently so the bass line can walk while upper voices sustain

### Centroid Gravity

A safety mechanism prevents voice leading from drifting into extreme registers over many chord changes. If the **average pitch** (centroid) of the voicing drifts outside the sweet zone (C3–F#4), the entire voicing shifts by octave(s) to pull it back toward A3.

```
GRAVITY_LOW  = 48 (C3)  — below this, push up
GRAVITY_HIGH = 66 (F#4) — above this, push down
GRAVITY_TARGET = 57 (A3) — the sweet spot
```

---

## 4. Voicing Types

The chord field offers 8 voicing types, each producing a distinct sound character while maintaining smooth voice leading:

| Voicing | Notes | Character | Origin |
|---------|-------|-----------|--------|
| **Close** | 4 | Compact, all within an octave | Classical harmony |
| **Drop 2** | 4 | 2nd-from-top dropped an octave — wide bass interval | Jazz piano standard |
| **Drop 3** | 4 | 3rd-from-top dropped an octave — warm, wide | Ballad / big band |
| **Open** | 4-5 | Spread across full range, big sound | Gospel / Neo-soul |
| **Rootless A** | 3-4 | No root: 3-5-7-9 | Jazz trio (bass plays root) |
| **Rootless B** | 3-4 | No root: 7-9-3-5 | Jazz trio alternative |
| **Quartal** | 3-4 | Stacked in 4ths | Modal jazz (McCoy Tyner) |
| **Triad** | 3 | Simple 3-note chord | Pop / rock / singer-songwriter |

### Drop 2 Example
```
Close position:    C E G B    (all within one octave)
Drop 2:            G C E B    (G dropped one octave — creates wide bass spread)
```

### Rootless Voicings
These omit the root entirely, assuming a bassist covers it. This is how jazz pianists actually voice chords in a combo:
```
Rootless A (Cmaj7): E G B D    (3-5-7-9)
Rootless B (Cmaj7): B D E G    (7-9-3-5)
```

### Quartal Voicings
Instead of stacking 3rds (traditional harmony), notes are stacked in **perfect 4ths**. This creates an ambiguous, modern sound associated with McCoy Tyner, Herbie Hancock, and modal jazz:
```
Quartal (Dm7): D G C F    (each note a 4th apart)
```

---

## 5. The Context Chord System

After each chord press, the engine computes **16 context chords** organized into 4 quadrants. These represent the harmonic "neighborhood" — every musically meaningful direction you could move from your current position.

### Quadrant 1: RESOLVE (Pads 0-3) — "Where to land"

Functional harmony's answer to "what sounds right next":

| Pad | Logic | Example (from G7 in C) |
|-----|-------|----------------------|
| **0: Resolution** | Strongest functional resolution. V→I, ii→V, I→ii (start a ii-V), or circle-of-fifths motion | G7 → **Cmaj7** |
| **1: Plagal** | IV chord (subdominant) — the "amen" cadence alternative | G7 → **Fmaj7** |
| **2: Deceptive** | vi chord — the surprise resolution that avoids finality | G7 → **Am7** |
| **3: Tonic** | I chord (home base), or ii if tonic is already used | G7 → **Cmaj7** |

**Non-diatonic fallback:** If the current chord isn't in the key, the engine searches chromatically downward for the nearest diatonic chord to resolve to — mimicking how chromatic harmony gravitates toward diatonic stability.

### Quadrant 2: COLOR (Pads 4-7) — "Same energy, different shade"

Neo-Riemannian and modal interchange — chords that share notes with the current chord but shift its color:

| Pad | Source | Example (from Cmaj7) |
|-----|--------|---------------------|
| **4: Parallel** | P transform — flip major↔minor (same root) | C → **Cm7** |
| **5: Relative** | R transform — relative major/minor key relationship | C → **Am7** |
| **6: Leading Tone** | L transform — move one note by semitone to flip quality | C → **Em7** |
| **7: Modal Borrow** | Strongest chord borrowed from the parallel key | C major → **Fm7** (from C minor) |

### Quadrant 3: TENSION (Pads 8-11) — "Build expectation"

Secondary dominants, tritone substitutions, and extended dominant chains:

| Pad | Technique | Example (from Cmaj7 in C) |
|-----|-----------|--------------------------|
| **8: Secondary Dominant** | V7/current — the dominant that resolves TO your chord | **G7** (V7 of C) |
| **9: Tritone Sub** | ♭II7 of V — chromatic approach to the tonic | **D♭7** (tritone sub of G7) |
| **10: V7/ii** | Secondary dominant of the supertonic — sets up a ii-V | **A7** (V7 of Dm) |
| **11: Dominant Chain** | Next dom7 in the circle of 5ths from current position | **F7** (continues the chain) |

**Tritone substitution** works because two dominant 7th chords a tritone apart share the same guide tones (3rd and 7th swap). G7 (B,F) and D♭7 (F,C♭/B) are functionally interchangeable.

### Quadrant 4: PORTAL (Pads 12-15) — "Jump across the circle"

Bold harmonic leaps that break out of the local key:

| Pad | Technique | Example (from Cmaj7) |
|-----|-----------|---------------------|
| **12: Coltrane Up** | Major 3rd up — Giant Steps direction | **Emaj7** |
| **13: Coltrane Down** | Major 3rd down — other Giant Steps axis | **A♭maj7** |
| **14: Chromatic Slide** | Semitone up, same quality family | **D♭maj7** |
| **15: Diminished Bridge** | dim7 on leading tone — connects to 4 possible keys | **Bdim7** |

**Coltrane changes** divide the octave into 3 equal major thirds (the augmented triad). John Coltrane's "Giant Steps" famously exploits this to create kaleidoscopic key changes: C → E → A♭ → C.

**Diminished bridge:** A dim7 chord is symmetrical — it repeats every minor 3rd. Bdim7 = Ddim7 = Fdim7 = A♭dim7. This means one dim7 chord can resolve to **four different keys**, making it the ultimate harmonic "portal."

---

## 6. Neo-Riemannian Transformations

The Color quadrant uses **Neo-Riemannian theory** — a 19th-century analytical framework that maps chord relationships based on shared notes rather than key-based function.

### The Three Transforms

Each transform changes exactly **one note** in the triad by a half-step or whole-step:

```
P (Parallel):      C major (C-E-G) → C minor (C-E♭-G)
                    Only the 3rd moves: E → E♭

R (Relative):      C major (C-E-G) → A minor (A-C-E)  
                    Only one note moves: G → A
                    (shares 2 notes: C and E)

L (Leading Tone):  C major (C-E-G) → E minor (E-G-B)
                    Only one note moves: C → B
                    (shares 2 notes: E and G)
```

### Why This Matters for Players

Neo-Riemannian transforms give you chords that are **maximally smooth** — only one voice moves, and it moves by the smallest possible interval. This creates beautiful, chromatic chord progressions that don't follow traditional functional harmony:

```
C → Cm → A♭ → A♭m → E → Em → C
(P)  (R)   (P)   (R)  (P)  (R)
```

This is a **hexatonic cycle** — it visits 6 chords and returns home, all through single-note voice movements. Radiohead, film scores, and neo-soul artists use these progressions extensively.

---

## 7. Modulation Detection

The chord field listens to your chord sequence and **automatically detects when you've modulated** to a new key. This updates the entire field (diatonic colors, context chords, suggestions) to reflect the new tonal center.

### How It Works

The engine watches for **ii–V** and **IV–V** patterns pointing to a key different from the current one:

```
Detection pipeline:
  1. Current chord has dominant quality? (dom7, dom9, dom7alt, etc.)
  2. YES → Calculate the key it would resolve to (a 5th below = "target key")
  3. Check if the PREVIOUS chord was a predominant in that target key
  4. If so → modulation detected! Update key to target.
```

### Major Key Patterns Detected

| Pattern | Example | Target |
|---------|---------|--------|
| **ii → V** | Dm7 → G7 | → C major |
| **IV → V** | Fmaj7 → G7 | → C major |

### Minor Key Patterns Detected

| Pattern | Example | Target |
|---------|---------|--------|
| **iiø → V** | Bø7 → E7 | → A minor |
| **iv → V** | Dm → E7 | → A minor |
| **♭VI → V** | F → E7 | → A minor |
| **♭II → V** | B♭ → E7 | → A minor (Neapolitan approach) |

### Confidence Levels

- **High:** Previous chord is the **diatonic ii** or **iv** of the target key (strongest signal)
- **Medium:** Previous chord is IV, ♭VI, or ♭II (likely but could be a borrowed chord)

### Post-Modulation Visual Feedback

After a modulation is detected:
1. The **key label** updates to show the new key and mode (e.g., "A Aeolian")
2. The **chord label** shows the modulation path (e.g., "E7 🔀 C→A min")
3. The **tonic pad** of the new key pulses with a green "resolve here" glow for 4 seconds
4. All **diatonic colors** shift to the new key's hue
5. **Context chords** recompute around the new tonal center

### Mode Switching

When modulating to a minor key, the mode automatically switches to **Aeolian**. When modulating to a major key, it switches to **Ionian**. This ensures the diatonic chord field always reflects the correct scale for the new key.

---

## 8. The Rhodes Synth

The chord field uses a custom **FM synthesis electric piano** built entirely in Web Audio API, inspired by the Fender Rhodes Mark I.

### Architecture

```
┌─────────────┐     ┌──────────────┐
│ Modulator 1 │────→│              │
│ (14:1 ratio)│     │   Carrier    │──→ Amp Envelope ──→ Lowpass Filter ──→ Master
│ "tine"      │     │   (sine)     │
└─────────────┘     │              │
┌─────────────┐     │              │
│ Modulator 2 │────→│              │
│ (1:1 ratio) │     └──────────────┘
│ "warmth"    │
└─────────────┘
```

**Modulator 1 (14:1 ratio):** Creates the metallic "tine" attack characteristic of a Rhodes. The 14:1 frequency ratio produces inharmonic partials that create that glassy bell sound. Higher notes get less modulation depth (natural Rhodes behavior — low notes are more bell-like, high notes are more pure).

**Modulator 2 (1:1 ratio):** Adds body and warmth to the fundamental. This is the "bark" of the Rhodes that comes from the tine hitting the pickup.

**Amplitude Envelope:**
- Attack: 5ms (instant)
- Decay: 300ms to sustain level
- Sustain: Slow exponential decay over 8 seconds
- Release: 500ms warm tail

**Effects chain:** Chorus (subtle LFO detune at 0.8Hz) → Delay-based reverb → Master gain

### Polyphony

The synth maintains a `voices` Map keyed by MIDI note number. Each active note has its own independent oscillator chain, envelope, and filter — true polyphony with no voice stealing.

---

## 9. Humanization & Performance

### Velocity Modes

| Mode | Behavior |
|------|----------|
| **Fixed** | Constant velocity (100) |
| **Humanize** | Random variation: 75–105 with ±15 humanization spread |

### Chord Articulation

| Mode | Effect |
|------|--------|
| **Simultaneous** | All notes at once (default) |
| **Strum** | Bottom-to-top, 15ms between each note |
| **Roll** | Random per-note delay: 5–25ms (jazz scatter) |

### Chromatic Approach Tone

When the **bass note changes** between chords, the engine automatically plays a **grace note one semitone below the new bass** — a classic jazz piano technique:

```
Cmaj7 (bass: C3) → Am7 (bass: A2)
  → Plays G#2 as a quick grace note (80ms), then A2 enters
  → Upper voices delayed 60ms so the approach is heard first
```

This creates the walking-bass feel that jazz pianists use intuitively.

### Rhythm Patterns

Pre-programmed comping patterns that re-trigger the current chord:
- Whole notes (sustain)
- Half notes
- Syncopated patterns (jazz comping)

### Arpeggiator

Breaks the current chord into individual notes:
- **Up:** Low to high
- **Down:** High to low  
- **Up-Down:** Bounce pattern
- **Random:** Stochastic note selection

The arp starts after one beat of the full chord sounding, then takes over with individual notes at the selected rate (8th notes, 16th notes, or triplets).

---

## Appendix: The Circle of Fifths

The inner ring of the chord field is arranged in the **circle of fifths** — the most important relationship map in Western music:

```
        C
    F       G
  Bb          D
   Eb        A
    Ab      E
      Db/C# B
        F#/Gb
```

Each adjacent pair is a **perfect 5th apart** — the strongest consonance after the octave. Moving clockwise = sharp direction (G, D, A...), counterclockwise = flat direction (F, Bb, Eb...).

**Why this layout:** The circle of fifths places the most harmonically related chords adjacent to each other. The I, IV, and V of any key are always neighbors. This means smooth progressions are always close at hand, while bold modulations require deliberate leaps across the circle.

---

*Document generated from the Octadre chord-field-engine.js codebase. Last updated: February 2026.*
