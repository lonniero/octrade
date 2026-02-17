# Harmony Machine — Implementation Plan

## Design Decisions (Confirmed)
- **Separate mode** alongside `seq` and `chords` → `harmony`
- **Separate tracks** from the sample engine (dedicated harmony track)
- **Two-step selector** for secondary chords (pick "Secondary" → pick target)
- **Chord length** spans multiple sequencer steps (quarter, half, whole, etc.)
- **Octave constraints** follow SATB voice leading ranges

---

## Phase 1: Harmony Data Model + Theory Engine

### 1.1 Global Harmony State
```javascript
harmonyState = {
    key: 0,              // 0=C, 1=C#, 2=D, ... 11=B
    scale: 'major',      // major | natural_minor | harmonic_minor | melodic_minor
    octaveBase: 3,       // base octave for voicings
    chordTrack: {
        pattern: [],     // 16 chord slots (harmony steps)
        trackLength: 16,
    }
}
```

### 1.2 Chord Step Data
```javascript
// Each of the 16 harmony steps:
{
    active: false,
    function: 'tonic',          // tonic | predominant | dominant | secondary
    degree: 1,                  // 1-7 scale degree
    quality: 'maj',             // auto from scale: maj | min | dim | aug
    extension: 'triad',         // triad | 7th | 9th | sus2 | sus4
    inversion: 0,               // 0=root, 1=1st, 2=2nd, 3=3rd
    voiceCount: 4,              // 3-6
    length: 4,                  // in sequencer steps (4 = quarter note at default res)
    velocity: 100,
    secondaryTarget: null,      // for secondary: degree it tonicizes (1-7)
    
    // Computed at playback:
    voicedNotes: []             // actual MIDI notes after voice leading
}
```

### 1.3 Scale Degree → Chord Quality Mapping

**Major Scale:**
| Degree | Numeral | Quality | Notes (C) |
|--------|---------|---------|-----------|
| 1 | I | maj | C E G |
| 2 | ii | min | D F A |
| 3 | iii | min | E G B |
| 4 | IV | maj | F A C |
| 5 | V | maj | G B D |
| 6 | vi | min | A C E |
| 7 | vii° | dim | B D F |

**Natural Minor Scale:**
| Degree | Numeral | Quality | Notes (Am) |
|--------|---------|---------|------------|
| 1 | i | min | A C E |
| 2 | ii° | dim | B D F |
| 3 | III | maj | C E G |
| 4 | iv | min | D F A |
| 5 | v | min | E G B |
| 6 | VI | maj | F A C |
| 7 | VII | maj | G B D |

**Harmonic Minor (differs from natural):**
| Degree | Change | Quality |
|--------|--------|---------|
| 5 | V | maj (raised 7th gives major dominant) |
| 7 | vii° | dim (raised 7th) |

### 1.4 Function → Available Degrees

```javascript
const FUNCTION_DEGREES = {
    major: {
        tonic:        [1, 6, 3],      // I, vi, iii
        predominant:  [4, 2],          // IV, ii
        dominant:     [5, 7],          // V, vii°
        // secondary: computed dynamically
    },
    natural_minor: {
        tonic:        [1, 3, 6],      // i, III, VI
        predominant:  [4, 2],          // iv, ii°
        dominant:     [5, 7],          // v, VII
    },
    harmonic_minor: {
        tonic:        [1, 3, 6],
        predominant:  [4, 2],
        dominant:     [5, 7],          // V (major), vii° (dim)
    }
};
```

### 1.5 Progression Rules (Valid Next Functions)

```javascript
const PROGRESSION_RULES = {
    tonic:        ['tonic', 'predominant', 'dominant', 'secondary'],
    predominant:  ['dominant', 'tonic'],
    dominant:     ['tonic'],
    secondary:    ['_target_']  // resolves to the chord it tonicizes
};
```

---

## Phase 2: Voice Leading Algorithm

### 2.1 SATB Range Constraints
```
Soprano: C4 (60) — C6 (84)
Alto:    G3 (55) — C5 (72)
Tenor:   C3 (48) — G4 (67)
Bass:    E2 (40) — C4 (60)

Rules:
- Adjacent voices ≤ octave apart (except bass-tenor ≤ 12th)
- No voice crossing (soprano always highest, bass always lowest)
```

### 2.2 Voice Leading Steps
```
Input: previousChord.voicedNotes + currentChord (unvoiced)

1. Build chord tones from scale degree + quality + extension
2. If first chord (no previous): arrange in close position within SATB ranges
3. If continuing:
   a. Hold common tones in same voice
   b. Move remaining voices to nearest chord tone
   c. Resolve tendency tones:
      - Leading tone (7) → tonic (1) — always up by half step
      - Chord 7ths → resolve down by step
   d. Check for parallel 5ths/octaves — adjust if found
   e. Verify all notes within SATB ranges
   f. Verify no voice crossing
4. Output: voicedNotes array [bass, tenor, alto, soprano]
```

### 2.3 Extension Handling
```
triad:  [root, 3rd, 5th]                    → 3 or 4 voices (double root)
7th:    [root, 3rd, 5th, 7th]               → 4 voices
9th:    [root, 3rd, 5th, 7th, 9th]          → 5 voices
sus2:   [root, 2nd, 5th]                    → 3 or 4 voices
sus4:   [root, 4th, 5th]                    → 3 or 4 voices
```

---

## Phase 3: Rhodes FM Synthesizer

### 3.1 Architecture
```
[Modulator (sine)] → [Carrier (sine)] → [Tremolo] → [Output Gain] → Master
      ↕                    ↕                ↕
  mod envelope         amp envelope     LFO ~4.5Hz

Velocity mapping:
  - Low velocity  → low mod index (warm, mellow)
  - High velocity → high mod index (bright, bark)
```

### 3.2 Parameters
```javascript
rhodes = {
    carrierRatio: 1,
    modulatorRatio: 1,        // 1:1 ratio = classic Rhodes
    modulationIndex: {
        min: 0.5,             // at velocity 0
        max: 3.5,             // at velocity 127
    },
    envelope: {
        attack: 0.005,        // 5ms
        decay: 0.8,           // 800ms
        sustain: 0.3,
        release: 0.4,         // 400ms
    },
    tremolo: {
        rate: 4.5,            // Hz
        depth: 0.15,          // 15% amplitude variation
    },
    detune: 3,                // cents (subtle warmth)
}
```

---

## Phase 4: Grid UI Mapping (Harmony Mode)

### 4.1 Mode Switch
```
Existing modes: 'seq', 'chords'
New mode: 'harmony'
Activated by: new button in transport/mode area, or keyboard shortcut
```

### 4.2 Big Grid (Outer 16 Pads) — Chord Steps
```
- Each pad = one chord step in the harmony sequence
- Color based on function:
    🟢 Tonic     = green (#00e8a0)
    🟡 Predominant = amber/gold (#e8b000)
    🔴 Dominant   = red (#e85050)
    🟣 Secondary  = purple (#b060e8)
- Brightness: active vs inactive
- Cursor shows current playback position
- Width visual hint: wider glow for longer chords
- Pad text: Roman numeral (I, ii, IV, V7, etc.)
```

### 4.3 Inner Grid (12 Pads) — Chord Selection
```
Contextual based on selection flow:

DEFAULT (no sub-selection active):
Row 1: [Tonic🟢] [Predom🟡] [Dominant🔴] [Second🟣]

AFTER selecting function (e.g., Tonic):
Row 1: [I] [vi] [iii] [back]

AFTER selecting Secondary:
Row 1: [V/ii] [V/iii] [V/IV] [V/V]    ← target selector
Row 2: [V/vi] [back] [—] [—]

AFTER chord is chosen:
Row 2: [triad] [7th] [9th] [sus4]      ← extensions
Row 3: [inv 0] [inv 1] [inv 2] [inv 3] ← inversions
```

### 4.4 Small Grid (8 Pads) — Voice/Length Controls
```
Row 1: [key↓] [key↑] [voices-] [voices+]
Row 2: [len-]  [len+]  [oct↓]   [oct↑]
```

### 4.5 Side Buttons (Track Panel)
```
- Show current key name (e.g., "C Major")
- Show currently selected step's Roman numeral
- Maybe show the actual notes being played
```

---

## Phase 5: Playback Integration

### 5.1 Harmony Sequencer Tick
```
On each sequencer step:
  1. Check if a chord starts at this step → trigger Rhodes notes
  2. Check if a previous chord's duration has ended → release notes
  3. Voice leading computed when chord is placed (not at playback)
```

### 5.2 MIDI Output (optional)
```
- Harmony chords can also output MIDI to external synths
- Uses a dedicated MIDI channel (e.g., ch 10)
- Sends proper note-on/note-off with computed voice leading
```

---

## Build Order

1. **harmony-engine.js** — Theory engine (scales, chords, voice leading algorithm)
2. **rhodes-synth.js** — FM synthesis Rhodes sound
3. **Harmony state + data model** — in app.js
4. **Grid rendering** — harmony mode rendering in renderGrid()
5. **Grid interactions** — function selector, degree selector, extensions
6. **Playback integration** — trigger Rhodes on chord steps  
7. **Polish** — visual feedback, Roman numeral display, valid-next highlighting

---

## File Structure
```
public/
  app.js              ← add harmony mode, grid rendering
  audio-engine.js     ← existing sample engine (unchanged)
  harmony-engine.js   ← NEW: theory, scales, voice leading
  rhodes-synth.js     ← NEW: FM synthesis Rhodes
  index.html          ← add harmony mode button, key selector
  styles.css          ← add harmony-specific colors/styles
```
