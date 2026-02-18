// ============================================
// CHORD FIELD ENGINE — Jazz/Gospel/Blues Harmony
// ============================================
// A playable 8×8 grid chord instrument with intelligent
// voice leading, bass-soprano counterpoint, and modal support.

(function () {
    'use strict';

    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // ──────────────────────────────────────────────
    // MODES — ordered by brightness (brightest → darkest)
    // Each adjacent mode differs by exactly one note.
    // ──────────────────────────────────────────────

    const MODE_ORDER = ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'];

    const MODES = {
        lydian: [0, 2, 4, 6, 7, 9, 11],
        ionian: [0, 2, 4, 5, 7, 9, 11],
        mixolydian: [0, 2, 4, 5, 7, 9, 10],
        dorian: [0, 2, 3, 5, 7, 9, 10],
        aeolian: [0, 2, 3, 5, 7, 8, 10],
        phrygian: [0, 1, 3, 5, 7, 8, 10],
        locrian: [0, 1, 3, 5, 6, 8, 10],
    };

    const MODE_LABELS = {
        lydian: 'Lydian',
        ionian: 'Major (Ionian)',
        mixolydian: 'Mixolydian',
        dorian: 'Dorian',
        aeolian: 'Minor (Aeolian)',
        phrygian: 'Phrygian',
        locrian: 'Locrian',
    };

    // ──────────────────────────────────────────────
    // CHORD INTERVALS — every chord type available
    // ──────────────────────────────────────────────

    const CHORD_INTERVALS = {
        // Triads
        maj: [0, 4, 7],
        min: [0, 3, 7],
        dim: [0, 3, 6],
        aug: [0, 4, 8],
        sus2: [0, 2, 7],
        sus4: [0, 5, 7],

        // 7ths
        maj7: [0, 4, 7, 11],
        min7: [0, 3, 7, 10],
        dom7: [0, 4, 7, 10],
        halfdim7: [0, 3, 6, 10],
        dim7: [0, 3, 6, 9],
        minmaj7: [0, 3, 7, 11],
        augmaj7: [0, 4, 8, 11],

        // 9ths
        maj9: [0, 4, 7, 11, 14],
        min9: [0, 3, 7, 10, 14],
        dom9: [0, 4, 7, 10, 14],
        min9b5: [0, 3, 6, 10, 14],

        // 11ths (typically omit the 3rd in dom11 to avoid clash)
        maj11: [0, 4, 7, 11, 14, 17],
        min11: [0, 3, 7, 10, 14, 17],
        dom11: [0, 7, 10, 14, 17],  // no 3rd

        // 13ths (typically voiced with root, 3, 7, 9, 13)
        maj13: [0, 4, 7, 11, 14, 21],
        min13: [0, 3, 7, 10, 14, 21],
        dom13: [0, 4, 7, 10, 14, 21],

        // Altered dominants
        dom7alt: [0, 4, 6, 10, 13, 15],  // 1, 3, b5, b7, b9, #9
        dom7b9: [0, 4, 7, 10, 13],       // 1, 3, 5, b7, b9
        dom7sharp9: [0, 4, 7, 10, 15],       // 1, 3, 5, b7, #9 (Hendrix chord)
        dom7b5: [0, 4, 6, 10],            // 1, 3, b5, b7
        dom7sharp5: [0, 4, 8, 10],            // 1, 3, #5, b7
        dom7sharp11: [0, 4, 7, 10, 14, 18],    // 1, 3, 5, b7, 9, #11
    };

    // ──────────────────────────────────────────────
    // ROW DEFINITIONS — what quality each row uses
    // ──────────────────────────────────────────────

    const ROW_QUALITY_KEYS = [
        'maj7',      // Row 0: Major 7th
        'min7',      // Row 1: Minor 7th
        'dom7',      // Row 2: Dominant 7th
        'halfdim7',  // Row 3: Half-diminished
        'maj9',      // Row 4: Major 9th
        'min9',      // Row 5: Minor 9th
        'dom9',      // Row 6: Dominant 9th
        'special',   // Row 7: Context-dependent (handled in getRow7Quality)
    ];

    // Quality "family" for color assignment
    const QUALITY_FAMILY = {
        maj: 'major', maj7: 'major', maj9: 'major', maj11: 'major', maj13: 'major',
        augmaj7: 'major',
        min: 'minor', min7: 'minor', min9: 'minor', min11: 'minor', min13: 'minor',
        minmaj7: 'minor', min9b5: 'minor',
        dom7: 'dominant', dom9: 'dominant', dom11: 'dominant', dom13: 'dominant',
        dom7alt: 'dominant', dom7b9: 'dominant', dom7sharp9: 'dominant',
        dom7b5: 'dominant', dom7sharp5: 'dominant', dom7sharp11: 'dominant',
        dim: 'diminished', dim7: 'diminished', halfdim7: 'diminished',
        aug: 'augmented',
        sus2: 'sus', sus4: 'sus',
    };

    // ──────────────────────────────────────────────
    // DIATONIC QUALITY MAPPING — per mode
    // What chord quality each degree naturally gets
    // ──────────────────────────────────────────────

    // For each mode, the natural triad quality on each of the 7 degrees
    const MODE_DEGREE_TRIADS = {
        lydian: ['maj', 'maj', 'min', 'dim', 'maj', 'min', 'min'],
        ionian: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
        mixolydian: ['maj', 'min', 'dim', 'maj', 'min', 'min', 'maj'],
        dorian: ['min', 'min', 'maj', 'maj', 'min', 'dim', 'maj'],
        aeolian: ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
        phrygian: ['min', 'maj', 'maj', 'min', 'dim', 'maj', 'min'],
        locrian: ['dim', 'maj', 'min', 'min', 'maj', 'maj', 'min'],
    };

    // Natural 7th chord quality per mode degree
    const MODE_DEGREE_7THS = {
        lydian: ['maj7', 'dom7', 'min7', 'halfdim7', 'maj7', 'min7', 'min7'],
        ionian: ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'halfdim7'],
        mixolydian: ['dom7', 'min7', 'halfdim7', 'maj7', 'min7', 'min7', 'maj7'],
        dorian: ['min7', 'min7', 'maj7', 'dom7', 'min7', 'halfdim7', 'maj7'],
        aeolian: ['min7', 'halfdim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7'],
        phrygian: ['min7', 'maj7', 'dom7', 'min7', 'halfdim7', 'maj7', 'min7'],
        locrian: ['halfdim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7'],
    };

    // ──────────────────────────────────────────────
    // VOICING TYPES
    // ──────────────────────────────────────────────

    const VOICING_TYPES = ['close', 'drop2', 'drop3', 'open', 'rootlessA', 'rootlessB', 'quartal', 'triad'];

    const VOICING_LABELS = {
        close: 'Close',
        drop2: 'Drop 2',
        drop3: 'Drop 3',
        open: 'Open',
        rootlessA: 'Rootless A',
        rootlessB: 'Rootless B',
        quartal: 'Quartal',
        triad: 'Triad',
    };

    // Voice ranges (MIDI note numbers)
    const VOICE_RANGES = {
        bass: { low: 28, high: 55 },   // E1 to G3
        tenor: { low: 36, high: 60 },   // C2 to C4
        alto: { low: 48, high: 72 },   // C3 to C5
        soprano: { low: 55, high: 84 },   // G3 to C6
    };

    // Default center for first chord
    const DEFAULT_CENTER = 54; // F#3 — good center for jazz voicings

    // ──────────────────────────────────────────────
    // CORE FUNCTIONS
    // ──────────────────────────────────────────────

    /**
     * Get the 8 column roots for the current key and mode.
     * Columns 0-6 = 7 diatonic scale degrees
     * Column 7 = bII (tritone sub target) by default, or chromatic override
     */
    function getColumnRoots(key, modeName, chromRoot) {
        const intervals = MODES[modeName] || MODES.ionian;
        const roots = [];
        for (let deg = 0; deg < 7; deg++) {
            roots.push((key + intervals[deg]) % 12);
        }
        // Column 7: chromatic root — default is bII (one semitone above root)
        if (chromRoot !== null && chromRoot !== undefined) {
            roots.push(chromRoot % 12);
        } else {
            roots.push((key + 1) % 12); // bII
        }
        return roots;
    }

    /**
     * Determine the natural quality for a degree in the given mode.
     */
    function getDiatonicQuality(degreeIndex, modeName) {
        const sevenths = MODE_DEGREE_7THS[modeName] || MODE_DEGREE_7THS.ionian;
        return sevenths[degreeIndex] || 'maj7';
    }

    /**
     * Get the quality for Row 7 (special row) based on column degree.
     */
    function getRow7Quality(colIndex, modeName) {
        if (colIndex >= 7) return 'dom7alt'; // Chromatic column → altered dominant
        const triad = (MODE_DEGREE_TRIADS[modeName] || MODE_DEGREE_TRIADS.ionian)[colIndex];
        // Map based on natural triad quality:
        if (triad === 'maj') return 'sus2';        // Major degrees → sus2
        if (triad === 'min') return 'dim7';         // Minor degrees → dim7
        if (triad === 'dim') return 'dom7alt';      // Dim degrees → altered dominant
        return 'sus4';
    }

    /**
     * Get the chord quality for any grid position.
     * Returns the CHORD_INTERVALS key.
     */
    function getGridQuality(row, col, modeName) {
        if (row < 7) {
            const qualityKey = ROW_QUALITY_KEYS[row];
            return qualityKey;
        }
        // Row 7: special
        return getRow7Quality(col, modeName);
    }

    /**
     * Get complete chord info for a grid position.
     * Returns { root, quality, pitchClasses, name, roman, family }
     */
    function getGridChord(row, col, key, modeName, chromRoot) {
        const roots = getColumnRoots(key, modeName, chromRoot);
        const root = roots[col];
        const quality = getGridQuality(row, col, modeName);
        const intervals = CHORD_INTERVALS[quality];
        if (!intervals) return null;

        const pitchClasses = intervals.map(i => (root + i) % 12);
        const name = getChordName(root, quality);
        const roman = getRomanLabel(col, quality, modeName);
        const family = QUALITY_FAMILY[quality] || 'dominant';

        return { root, quality, pitchClasses, name, roman, family, intervals };
    }

    /**
     * Build pitch classes for a chord.
     */
    function buildChordPitchClasses(root, quality) {
        const intervals = CHORD_INTERVALS[quality];
        if (!intervals) return [root, (root + 4) % 12, (root + 7) % 12]; // fallback: major triad
        return intervals.map(i => (root + i) % 12);
    }

    // ──────────────────────────────────────────────
    // VOICING ENGINE
    // ──────────────────────────────────────────────

    /**
     * Voice a chord with the specified voicing type.
     * Returns an array of MIDI note numbers.
     *
     * @param {number} root - Root pitch class (0-11)
     * @param {string} quality - Chord quality key
     * @param {string} voicingType - One of VOICING_TYPES
     * @param {number[]} prevVoicing - Previous chord's MIDI notes (for voice leading)
     * @param {number} octaveOffset - Octave shift (-2 to +2)
     * @returns {number[]} MIDI note numbers, sorted low to high
     */
    function voiceChord(root, quality, voicingType, prevVoicing, octaveOffset) {
        const intervals = CHORD_INTERVALS[quality];
        if (!intervals) return [];

        // Normalize prevVoicing — null/undefined on first press
        if (!prevVoicing) prevVoicing = [];

        let notes;

        switch (voicingType) {
            case 'close':
                notes = voiceClose(root, intervals, prevVoicing);
                break;
            case 'drop2':
                notes = voiceDrop2(root, intervals, prevVoicing);
                break;
            case 'drop3':
                notes = voiceDrop3(root, intervals, prevVoicing);
                break;
            case 'open':
                notes = voiceOpen(root, intervals, prevVoicing);
                break;
            case 'rootlessA':
                notes = voiceRootless(root, intervals, prevVoicing, 'A');
                break;
            case 'rootlessB':
                notes = voiceRootless(root, intervals, prevVoicing, 'B');
                break;
            case 'quartal':
                notes = voiceQuartal(root, intervals, prevVoicing);
                break;
            case 'triad':
                notes = voiceTriad(root, quality, prevVoicing);
                break;
            default:
                notes = voiceClose(root, intervals, prevVoicing);
        }

        // ── Centroid gravity correction ──
        // Prevents voice leading drift when circling through keys.
        // If the chord's average pitch drifts outside the sweet zone,
        // shift the ENTIRE voicing by octave(s) to pull it back.
        const GRAVITY_LOW = 46;  // Bb2 — below this, push up
        const GRAVITY_HIGH = 70;  // Bb4 — above this, push down
        const GRAVITY_TARGET = DEFAULT_CENTER; // F#3 = 54

        if (notes.length > 0) {
            const centroid = notes.reduce((a, b) => a + b, 0) / notes.length;

            if (centroid < GRAVITY_LOW || centroid > GRAVITY_HIGH) {
                // Calculate how many octaves to shift to get closest to target
                const drift = GRAVITY_TARGET - centroid;
                const octaveShift = Math.round(drift / 12) * 12;

                if (octaveShift !== 0) {
                    notes = notes.map(n => n + octaveShift);
                }
            }
        }

        // Apply octave offset
        if (octaveOffset && octaveOffset !== 0) {
            notes = notes.map(n => n + (octaveOffset * 12));
        }

        // Ensure within playable range
        notes = clampToRange(notes, 28, 84); // E1 to C6

        notes.sort((a, b) => a - b);
        return notes;
    }

    /**
     * Close position: all notes within one octave, stacked up from root.
     */
    function voiceClose(root, intervals, prevVoicing) {
        const center = prevVoicing.length > 0
            ? Math.round(prevVoicing.reduce((a, b) => a + b, 0) / prevVoicing.length)
            : DEFAULT_CENTER;

        // Build close-position chord centered around the previous chord's center
        const notes = [];
        const bassNote = findClosest(root, center - 6);
        notes.push(bassNote);

        for (let i = 1; i < intervals.length && i < 5; i++) {
            const pc = (root + intervals[i]) % 12;
            const above = findNextAbove(pc, notes[notes.length - 1]);
            notes.push(above);
        }

        // Voice lead to previous if available
        if (prevVoicing.length > 0) {
            return voiceLeadSmooth(notes, prevVoicing);
        }
        return notes;
    }

    /**
     * Drop 2: close position, then drop the second-from-top note an octave.
     * Classic jazz piano voicing with wide bass interval.
     */
    function voiceDrop2(root, intervals, prevVoicing) {
        // First build close position (use 4 notes max)
        const close = buildClosePosition(root, intervals, prevVoicing, 4);

        if (close.length < 4) return voiceLeadSmooth(close, prevVoicing);

        // Drop the 2nd from top note down an octave
        close.sort((a, b) => a - b);
        const secondFromTop = close[close.length - 2];
        close[close.length - 2] = secondFromTop - 12;
        close.sort((a, b) => a - b);

        if (prevVoicing.length > 0) {
            return voiceLeadSmooth(close, prevVoicing);
        }
        return close;
    }

    /**
     * Drop 3: close position, then drop the third-from-top note an octave.
     * Wide, warm voicing for ballads.
     */
    function voiceDrop3(root, intervals, prevVoicing) {
        const close = buildClosePosition(root, intervals, prevVoicing, 4);

        if (close.length < 4) return voiceLeadSmooth(close, prevVoicing);

        close.sort((a, b) => a - b);
        const thirdFromTop = close[close.length - 3];
        close[close.length - 3] = thirdFromTop - 12;
        close.sort((a, b) => a - b);

        if (prevVoicing.length > 0) {
            return voiceLeadSmooth(close, prevVoicing);
        }
        return close;
    }

    /**
     * Open: spread voices across full range with proper bass-soprano counterpoint.
     * Gospel/neo-soul style — big, full sound.
     */
    function voiceOpen(root, intervals, prevVoicing) {
        const noteCount = Math.min(intervals.length, 5);
        const notes = [];

        // Bass: root in low register
        const bassCenter = prevVoicing.length > 0 ? prevVoicing[0] : 40; // around E2
        const bass = findClosest(root, bassCenter);
        notes.push(clampNote(bass, 28, 48)); // E1 to C3

        // Upper structure: spread remaining notes across alto-soprano range
        const upperIntervals = intervals.slice(1, noteCount);
        const upperCenter = prevVoicing.length > 0
            ? Math.round(prevVoicing.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, prevVoicing.length - 1))
            : 64; // E4

        for (let i = 0; i < upperIntervals.length; i++) {
            const pc = (root + upperIntervals[i]) % 12;
            const target = upperCenter - 6 + (i * 5); // spread ~5 semitones apart
            const note = findClosest(pc, target);
            notes.push(clampNote(note, 48, 84)); // C3 to C6
        }

        if (prevVoicing.length > 0) {
            return applyCounterpoint(notes, prevVoicing);
        }
        return notes;
    }

    /**
     * Rootless voicing: omit the root, voice the upper structure.
     * Type A: 3-5-7-9 | Type B: 7-9-3-5
     */
    function voiceRootless(root, intervals, prevVoicing, type) {
        if (intervals.length < 4) {
            // Too few notes for rootless — fall back to close
            return voiceClose(root, intervals, prevVoicing);
        }

        const pcs = intervals.map(i => (root + i) % 12);
        let voicePCs;

        if (type === 'A') {
            // 3-5-7-9 (or 3-5-7 if no 9th)
            voicePCs = [pcs[1], pcs.length > 2 ? pcs[2] : pcs[1], pcs[3]];
            if (pcs.length > 4) voicePCs.push(pcs[4]);
        } else {
            // 7-9-3-5 (or 7-3-5 if no 9th)
            voicePCs = [pcs[3], pcs.length > 4 ? pcs[4] : pcs[1], pcs[1]];
            if (pcs.length > 2) voicePCs.push(pcs[2]);
        }

        const center = prevVoicing.length > 0
            ? Math.round(prevVoicing.reduce((a, b) => a + b, 0) / prevVoicing.length)
            : DEFAULT_CENTER;

        const notes = [];
        let current = center - 6;
        for (const pc of voicePCs) {
            const note = findClosest(pc, current);
            notes.push(note);
            current = note + 3; // space out
        }

        if (prevVoicing.length > 0) {
            return voiceLeadSmooth(notes, prevVoicing);
        }
        return notes;
    }

    /**
     * Quartal voicing: stack notes in 4ths from the root.
     * McCoy Tyner / Herbie Hancock modal jazz sound.
     */
    function voiceQuartal(root, intervals, prevVoicing) {
        const pcs = intervals.map(i => (root + i) % 12);
        const center = prevVoicing.length > 0
            ? Math.round(prevVoicing.reduce((a, b) => a + b, 0) / prevVoicing.length)
            : DEFAULT_CENTER;

        // Build quartal stack: root, then up in 4ths (5 semitones)
        // but use chord tones when possible
        const notes = [];
        let bassNote = findClosest(root, center - 10);
        notes.push(bassNote);

        // Stack 4ths, snapping to nearest chord tone for color
        for (let i = 1; i < 4; i++) {
            const quartalTarget = notes[notes.length - 1] + 5; // perfect 4th up
            const pc = quartalTarget % 12;
            // Find the chord tone closest to this quartal target
            let bestPC = pc;
            let bestDist = 99;
            for (const chordPC of pcs) {
                const dist = Math.min(
                    Math.abs(chordPC - pc),
                    12 - Math.abs(chordPC - pc)
                );
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPC = chordPC;
                }
            }
            notes.push(findClosest(bestPC, quartalTarget));
        }

        if (prevVoicing.length > 0) {
            return voiceLeadSmooth(notes, prevVoicing);
        }
        return notes;
    }

    /**
     * Triad voicing: simple 3-note chord.
     * Uses the base triad quality from the chord.
     */
    function voiceTriad(root, quality, prevVoicing) {
        // Map quality to base triad
        let triadQ = 'maj';
        if (quality.startsWith('min') || quality === 'halfdim7') triadQ = 'min';
        else if (quality.startsWith('dom')) triadQ = 'maj';
        else if (quality.startsWith('dim') || quality === 'halfdim7') triadQ = 'dim';
        else if (quality.startsWith('aug')) triadQ = 'aug';
        else if (quality === 'sus2') triadQ = 'sus2';
        else if (quality === 'sus4') triadQ = 'sus4';

        const intervals = CHORD_INTERVALS[triadQ] || CHORD_INTERVALS.maj;

        const center = prevVoicing.length > 0
            ? Math.round(prevVoicing.reduce((a, b) => a + b, 0) / prevVoicing.length)
            : DEFAULT_CENTER;

        const notes = [];
        const bass = findClosest(root, center - 4);
        notes.push(bass);

        for (let i = 1; i < intervals.length; i++) {
            const pc = (root + intervals[i]) % 12;
            notes.push(findNextAbove(pc, notes[notes.length - 1]));
        }

        if (prevVoicing.length > 0) {
            return voiceLeadSmooth(notes, prevVoicing);
        }
        return notes;
    }

    // ──────────────────────────────────────────────
    // VOICE LEADING HELPERS
    // ──────────────────────────────────────────────

    /**
     * Build a close-position chord centered near the previous voicing.
     */
    function buildClosePosition(root, intervals, prevVoicing, maxNotes) {
        const noteCount = Math.min(intervals.length, maxNotes);
        const center = prevVoicing.length > 0
            ? Math.round(prevVoicing.reduce((a, b) => a + b, 0) / prevVoicing.length)
            : DEFAULT_CENTER;

        const notes = [];
        const bass = findClosest(root, center - 4);
        notes.push(bass);

        for (let i = 1; i < noteCount; i++) {
            const pc = (root + intervals[i]) % 12;
            notes.push(findNextAbove(pc, notes[notes.length - 1]));
        }

        return notes;
    }

    /**
     * Smooth voice leading: move each voice to the nearest available chord tone.
     * Minimizes total voice movement while preventing voice crossings.
     */
    function voiceLeadSmooth(newNotes, prevNotes) {
        if (prevNotes.length === 0) return newNotes;

        // Get the pitch classes we need to place
        const newPCs = newNotes.map(n => n % 12);
        const sortedPrev = [...prevNotes].sort((a, b) => a - b);
        const matchCount = Math.min(sortedPrev.length, newPCs.length);

        // For each prev voice (sorted low to high), find the closest
        // octave placement of each available pitch class
        const usedPCIndices = new Set();
        const result = [];

        for (let i = 0; i < matchCount; i++) {
            const prevNote = sortedPrev[i];
            let bestNote = null;
            let bestDist = Infinity;
            let bestPCIdx = 0;

            for (let j = 0; j < newPCs.length; j++) {
                if (usedPCIndices.has(j)) continue;
                const pc = newPCs[j];

                // Find closest octave placement of this pitch class to the prev note
                const octave = Math.floor(prevNote / 12);
                const candidates = [
                    (octave - 1) * 12 + pc,
                    octave * 12 + pc,
                    (octave + 1) * 12 + pc,
                ];

                for (const c of candidates) {
                    if (c < 28 || c > 84) continue;
                    const dist = Math.abs(c - prevNote);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestNote = c;
                        bestPCIdx = j;
                    }
                }
            }

            if (bestNote !== null) {
                result.push(bestNote);
                usedPCIndices.add(bestPCIdx);
            }
        }

        // Any extra notes from the new chord (if new chord has more voices)
        for (let i = 0; i < newPCs.length; i++) {
            if (!usedPCIndices.has(i)) {
                result.push(newNotes[i]);
            }
        }

        // Sort to prevent voice crossings
        result.sort((a, b) => a - b);
        return result;
    }

    /**
     * Apply bass-soprano counterpoint rules.
     * Bass and soprano should move in contrary or oblique motion.
     */
    function applyCounterpoint(newNotes, prevNotes) {
        if (prevNotes.length < 2 || newNotes.length < 2) return newNotes;

        const sorted = [...newNotes].sort((a, b) => a - b);
        const prevSorted = [...prevNotes].sort((a, b) => a - b);

        const prevBass = prevSorted[0];
        const prevSoprano = prevSorted[prevSorted.length - 1];

        let bass = sorted[0];
        let soprano = sorted[sorted.length - 1];

        // Check if both move in same direction (parallel) — try to fix
        const bassMotion = bass - prevBass;
        const sopranoMotion = soprano - prevSoprano;

        if (bassMotion > 0 && sopranoMotion > 0) {
            // Both moving up — try moving soprano down an octave
            const altSoprano = soprano - 12;
            if (altSoprano > bass && altSoprano >= 48) {
                sorted[sorted.length - 1] = altSoprano;
            }
        } else if (bassMotion < 0 && sopranoMotion < 0) {
            // Both moving down — try moving bass up an octave
            const altBass = bass + 12;
            if (altBass < soprano && altBass <= 55) {
                sorted[0] = altBass;
            }
        }

        // Now voice lead the inner voices smoothly
        if (sorted.length > 2) {
            const innerNew = sorted.slice(1, -1);
            const innerPrev = prevSorted.slice(1, -1);
            const ledInner = voiceLeadSmooth(innerNew, innerPrev);
            for (let i = 0; i < ledInner.length; i++) {
                sorted[i + 1] = ledInner[i];
            }
        }

        sorted.sort((a, b) => a - b);
        return sorted;
    }

    // ──────────────────────────────────────────────
    // PITCH HELPERS
    // ──────────────────────────────────────────────

    function findClosest(pitchClass, target) {
        const octave = Math.floor(target / 12);
        const candidates = [
            (octave - 1) * 12 + pitchClass,
            octave * 12 + pitchClass,
            (octave + 1) * 12 + pitchClass,
        ];
        let best = candidates[0];
        let bestDist = Math.abs(candidates[0] - target);
        for (const c of candidates) {
            const dist = Math.abs(c - target);
            if (dist < bestDist) {
                best = c;
                bestDist = dist;
            }
        }
        return best;
    }

    function findNextAbove(pitchClass, current) {
        let note = Math.floor(current / 12) * 12 + pitchClass;
        if (note <= current) note += 12;
        return note;
    }

    function clampNote(note, low, high) {
        while (note < low) note += 12;
        while (note > high) note -= 12;
        return note;
    }

    function clampToRange(notes, low, high) {
        return notes.map(n => {
            while (n < low) n += 12;
            while (n > high) n -= 12;
            return n;
        });
    }

    // ──────────────────────────────────────────────
    // SHARED-NOTE GLOW COMPUTATION
    // ──────────────────────────────────────────────

    /**
     * Count shared pitch classes between two chords.
     * Returns 0-n (number of common tones).
     */
    function computeSharedNotes(pcsA, pcsB) {
        if (!pcsA || !pcsB) return 0;
        const setA = new Set(pcsA.map(p => p % 12));
        let count = 0;
        for (const pc of pcsB) {
            if (setA.has(pc % 12)) count++;
        }
        return count;
    }

    /**
     * Compute glow levels for all 64 pads relative to a reference chord.
     * Returns 8×8 array of glow levels (0 = dim, 1 = low, 2 = medium, 3 = bright).
     */
    function computeGlowGrid(refPitchClasses, key, modeName, chromRoot) {
        const glow = new Array(64).fill(0);
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const chord = getGridChord(row, col, key, modeName, chromRoot);
                if (!chord) continue;
                const shared = computeSharedNotes(refPitchClasses, chord.pitchClasses);
                // Map: 3+ = 3, 2 = 2, 1 = 1, 0 = 0
                glow[row * 8 + col] = Math.min(shared, 3);
            }
        }
        return glow;
    }

    // ──────────────────────────────────────────────
    // DISPLAY HELPERS
    // ──────────────────────────────────────────────

    function getChordName(root, quality) {
        const rootName = NOTE_NAMES_FLAT[root % 12];
        const suffixes = {
            maj: '', min: 'm', dim: '°', aug: '+', sus2: 'sus2', sus4: 'sus4',
            maj7: 'maj7', min7: 'm7', dom7: '7', halfdim7: 'ø7', dim7: '°7',
            minmaj7: 'mΔ7', augmaj7: '+Δ7',
            maj9: 'maj9', min9: 'm9', dom9: '9', min9b5: 'ø9',
            maj11: 'maj11', min11: 'm11', dom11: '11',
            maj13: 'maj13', min13: 'm13', dom13: '13',
            dom7alt: '7alt', dom7b9: '7♭9', dom7sharp9: '7♯9',
            dom7b5: '7♭5', dom7sharp5: '7♯5', dom7sharp11: '7♯11',
        };
        return rootName + (suffixes[quality] || quality);
    }

    function getRomanLabel(colIndex, quality, modeName) {
        const ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', '♭II'];
        const ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', '♭ii'];

        const isMinorFamily = ['min7', 'min9', 'min11', 'min13', 'halfdim7', 'dim7',
            'dim', 'min', 'min9b5', 'minmaj7'].includes(quality);
        const roman = isMinorFamily ? ROMAN_LOWER[colIndex] : ROMAN_UPPER[colIndex];

        const suffixes = {
            maj7: 'Δ7', min7: '7', dom7: '7', halfdim7: 'ø7', dim7: '°7',
            maj9: 'Δ9', min9: '9', dom9: '9',
            dom7alt: '7alt', sus2: 'sus2', sus4: 'sus4',
        };
        return roman + (suffixes[quality] || '');
    }

    function getModeName(modeName) {
        return MODE_LABELS[modeName] || modeName;
    }

    function getKeyName(key) {
        return NOTE_NAMES_FLAT[key % 12];
    }

    function midiToName(midiNote) {
        const name = NOTE_NAMES[midiNote % 12];
        const octave = Math.floor(midiNote / 12) - 1;
        return `${name}${octave}`;
    }

    /**
     * Cycle to the next mode (brighter or darker).
     * @param {string} currentMode
     * @param {number} direction - +1 = darker, -1 = brighter
     * @returns {string} new mode name
     */
    function cycleMode(currentMode, direction) {
        const idx = MODE_ORDER.indexOf(currentMode);
        if (idx === -1) return 'ionian';
        const newIdx = (idx + direction + MODE_ORDER.length) % MODE_ORDER.length;
        return MODE_ORDER[newIdx];
    }

    /**
     * Get the display suffix for a chord quality.
     */
    function getQualitySuffix(quality) {
        const suffixes = {
            maj: '', min: 'm', dim: '°', aug: '+', sus2: 'sus2', sus4: 'sus4',
            maj7: 'maj7', min7: 'm7', dom7: '7', halfdim7: 'ø7', dim7: '°7',
            minmaj7: 'mΔ7', augmaj7: '+Δ7',
            maj9: 'maj9', min9: 'm9', dom9: '9', min9b5: 'ø9',
            maj11: 'maj11', min11: 'm11', dom11: '11',
            maj13: 'maj13', min13: 'm13', dom13: '13',
            dom7alt: '7alt', dom7b9: '7♭9', dom7sharp9: '7♯9',
            dom7b5: '7♭5', dom7sharp5: '7♯5', dom7sharp11: '7♯11',
        };
        return suffixes[quality] || quality;
    }

    /**
     * Convert MIDI note to name string (e.g. 60 → "C4").
     */
    function midiToNoteName(midiNote) {
        const name = NOTE_NAMES[midiNote % 12];
        const octave = Math.floor(midiNote / 12) - 1;
        return `${name}${octave}`;
    }

    /**
     * Get the natural chord quality for a degree in a mode and row.
     * Row determines the chord extension level.
     */
    function getQualityForDegree(modeName, degreeIndex, row) {
        if (row === 7) return getRow7Quality(degreeIndex, modeName);
        const qualityKey = ROW_QUALITY_KEYS[row];
        if (qualityKey === 'special') return getRow7Quality(degreeIndex, modeName);
        return qualityKey;
    }

    // ──────────────────────────────────────────────
    // RING CHORD FIELD — Circle of Fifths Layout
    // ──────────────────────────────────────────────

    // Circle of fifths: 12 pitch classes ordered by ascending 5ths
    // C → G → D → A → E → B → F#/Gb → Db → Ab → Eb → Bb → F
    const CIRCLE_OF_FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

    // Reverse lookup: pitch class → index in circle
    const CIRCLE_INDEX = {};
    CIRCLE_OF_FIFTHS.forEach((pc, i) => CIRCLE_INDEX[pc] = i);

    /**
     * Get the diatonic degree index (0-6) of a pitch class in a given key/mode.
     * Returns -1 if the pitch class is not diatonic.
     */
    function getDiatonicDegree(pitchClass, key, modeName) {
        const scale = MODES[modeName] || MODES.ionian;
        for (let i = 0; i < scale.length; i++) {
            if ((key + scale[i]) % 12 === pitchClass % 12) return i;
        }
        return -1;
    }

    /**
     * Get the default quality for a root in a key/mode.
     * Uses 7th chord quality for richer sound.
     */
    function getDefaultQuality(root, key, modeName) {
        const degree = getDiatonicDegree(root, key, modeName);
        if (degree >= 0) {
            const q7 = MODE_DEGREE_7THS[modeName];
            if (q7) return q7[degree];
            return MODE_DEGREE_TRIADS[modeName]?.[degree] || 'maj7';
        }
        // Non-diatonic root: default to dom7 (works for secondary doms, tritone subs)
        return 'dom7';
    }

    /**
     * Get the secondary dominant (V7) that resolves to a target root.
     * The secondary dominant root is a perfect 5th above the target.
     */
    function getSecondaryDominant(targetRoot) {
        const root = (targetRoot + 7) % 12; // P5 above = V of target
        return { root, quality: 'dom7', type: 'secondary_dom', resolves_to: targetRoot };
    }

    /**
     * Get the tritone substitution for a dominant chord.
     * The tritone sub shares the same tritone (3rd & 7th) but from a root a tritone away.
     */
    function getTritoneSubstitution(dominantRoot) {
        const root = (dominantRoot + 6) % 12; // tritone = 6 semitones
        return { root, quality: 'dom7', type: 'tritone_sub' };
    }

    /**
     * Get modal interchange chords (borrowed from parallel minor/modes).
     * Returns chords from parallel minor that aren't in the current key.
     */
    function getModalInterchange(key, modeName) {
        const chords = [];
        // Borrow from aeolian (natural minor) if we're in a major mode
        const borrowFrom = (modeName === 'ionian' || modeName === 'lydian' || modeName === 'mixolydian')
            ? 'aeolian' : 'ionian';
        const borrowScale = MODES[borrowFrom];
        const currentScale = MODES[modeName];
        const borrow7ths = MODE_DEGREE_7THS[borrowFrom];

        for (let deg = 0; deg < 7; deg++) {
            const borrowedInterval = borrowScale[deg];
            const currentInterval = currentScale[deg];
            // Only include if the root differs from current mode's degree
            if (borrowedInterval !== currentInterval) {
                const root = (key + borrowedInterval) % 12;
                const quality = borrow7ths ? borrow7ths[deg] : 'maj7';
                chords.push({ root, quality, type: 'modal_interchange', degree: deg });
            }
        }
        return chords;
    }

    /**
     * Get chromatic mediant chords.
     * Chromatic mediants share 1-2 notes but are a 3rd away (major or minor 3rd).
     */
    function getChromaticMediants(root, quality) {
        const mediants = [];
        // Major 3rd up & down
        mediants.push({ root: (root + 4) % 12, quality: 'maj7', type: 'chromatic_mediant' });
        mediants.push({ root: (root + 8) % 12, quality: 'maj7', type: 'chromatic_mediant' });
        // Minor 3rd up & down
        mediants.push({ root: (root + 3) % 12, quality: 'maj7', type: 'chromatic_mediant' });
        mediants.push({ root: (root + 9) % 12, quality: 'min7', type: 'chromatic_mediant' });
        return mediants;
    }

    /**
     * Compute the 3 "next move" suggestions for the center pads.
     * Each has a different personality:
     *   safe    = strongest diatonic resolution
     *   color   = modal interchange or chromatic mediant
     *   surprise = tritone substitution or distant secondary dominant
     *
     * @param {number} currentRoot - Current chord's root (0-11)
     * @param {string} currentQuality - Current chord quality
     * @param {number} key - Current key (0-11)
     * @param {string} modeName - Current mode name
     * @param {number[]} recentRoots - Array of recently played roots (for variety)
     * @returns {{ safe: object, color: object, surprise: object }}
     */
    function computeSuggestions(currentRoot, currentQuality, key, modeName, recentRoots) {
        const recent = recentRoots || [];
        const scale = MODES[modeName] || MODES.ionian;
        const degree7ths = MODE_DEGREE_7THS[modeName] || MODE_DEGREE_7THS.ionian;

        // ── SAFE: strongest diatonic resolution ──
        // Priority: V→I, then circle of fifths (down a 5th), then IV
        let safe;
        const currentDegree = getDiatonicDegree(currentRoot, key, modeName);

        if (currentDegree === 4) {
            // We're on V → resolve to I
            safe = { root: key, quality: degree7ths[0], type: 'resolution' };
        } else if (currentDegree === 1) {
            // We're on ii → go to V
            safe = { root: (key + scale[4]) % 12, quality: degree7ths[4], type: 'resolution' };
        } else if (currentDegree === 0) {
            // We're on I → suggest IV (subdominant direction for movement)
            safe = { root: (key + scale[3]) % 12, quality: degree7ths[3], type: 'resolution' };
        } else if (currentDegree >= 0) {
            // Diatonic chord: resolve down a 5th in the scale (circle of 5ths motion)
            const targetDeg = (currentDegree + 3) % 7; // down a 5th = up a 4th in scale
            safe = { root: (key + scale[targetDeg]) % 12, quality: degree7ths[targetDeg], type: 'resolution' };
        } else {
            // Non-diatonic: resolve down a half step to nearest diatonic
            for (let offset = 1; offset <= 6; offset++) {
                const tryRoot = (currentRoot - offset + 12) % 12;
                const tryDeg = getDiatonicDegree(tryRoot, key, modeName);
                if (tryDeg >= 0) {
                    safe = { root: tryRoot, quality: degree7ths[tryDeg], type: 'resolution' };
                    break;
                }
            }
            if (!safe) safe = { root: key, quality: degree7ths[0], type: 'resolution' };
        }

        // ── COLOR: modal interchange or chromatic mediant ──
        const miChords = getModalInterchange(key, modeName);
        const mediants = getChromaticMediants(currentRoot, currentQuality);
        // Combine and filter out recent roots for variety
        const colorCandidates = [...miChords, ...mediants]
            .filter(c => !recent.includes(c.root) && c.root !== currentRoot && c.root !== safe.root);
        // Pick semi-randomly but deterministically (based on current root)
        const color = colorCandidates.length > 0
            ? colorCandidates[currentRoot % colorCandidates.length]
            : miChords[0] || { root: (currentRoot + 3) % 12, quality: 'maj7', type: 'chromatic_mediant' };

        // ── SURPRISE: tritone sub or distant secondary dominant ──
        const secDom = getSecondaryDominant(currentRoot); // V7 of current = leads BACK here
        const triSub = getTritoneSubstitution((currentRoot + 7) % 12); // tritone sub of V
        // Pick the one that's not a recent root
        let surprise;
        if (!recent.includes(triSub.root) && triSub.root !== currentRoot) {
            surprise = triSub;
        } else if (!recent.includes(secDom.root) && secDom.root !== currentRoot) {
            surprise = secDom;
        } else {
            // Distant key: whole tone away
            surprise = { root: (currentRoot + 2) % 12, quality: 'dom7', type: 'distant' };
        }

        return { safe, color, surprise };
    }

    /**
     * Compute the 16 context chords for the outer ring.
     * Organized by harmonic relationship to the current chord.
     *
     * @param {number} currentRoot - Current chord's root (0-11)
     * @param {string} currentQuality - Current chord quality
     * @param {number} key - Current key (0-11)
     * @param {string} modeName - Current mode name
     * @returns {Array<{root, quality, type, label}>} 16 context chord objects
     */
    function computeContextChords(currentRoot, currentQuality, key, modeName) {
        const scale = MODES[modeName] || MODES.ionian;
        const degree7ths = MODE_DEGREE_7THS[modeName] || MODE_DEGREE_7THS.ionian;
        const context = [];
        const usedRoots = new Set();
        usedRoots.add(currentRoot); // don't include current chord

        // Helper: add chord if root not already included
        function addIfNew(chord) {
            if (context.length >= 16) return;
            if (usedRoots.has(chord.root)) return;
            usedRoots.add(chord.root);
            // Add display label
            chord.label = getChordName(chord.root, chord.quality);
            context.push(chord);
        }

        // 1. DIATONIC NEIGHBORS (up to 6 chords)
        for (let deg = 0; deg < 7; deg++) {
            const root = (key + scale[deg]) % 12;
            if (root === currentRoot) continue;
            addIfNew({ root, quality: degree7ths[deg], type: 'diatonic' });
        }

        // 2. SECONDARY DOMINANTS (V7 of ii, iii, IV, V, vi)
        const secDomTargets = [1, 2, 3, 4, 5]; // degrees to target
        for (const targetDeg of secDomTargets) {
            const targetRoot = (key + scale[targetDeg]) % 12;
            const sd = getSecondaryDominant(targetRoot);
            // Only add if it's not already diatonic
            if (getDiatonicDegree(sd.root, key, modeName) < 0) {
                addIfNew(sd);
            }
        }

        // 3. TRITONE SUBSTITUTIONS of primary dominants
        const primaryV = (key + scale[4]) % 12;
        const triSub = getTritoneSubstitution(primaryV);
        addIfNew(triSub);
        // Tritone sub of V/ii
        const secV_ii = getSecondaryDominant((key + scale[1]) % 12);
        const triSub2 = getTritoneSubstitution(secV_ii.root);
        addIfNew(triSub2);

        // 4. MODAL INTERCHANGE
        const miChords = getModalInterchange(key, modeName);
        for (const mic of miChords) {
            addIfNew(mic);
        }

        // 5. EXTENSIONS of current chord (same root, different quality)
        const extensionQualities = ['maj9', 'min9', 'dom9', 'dom13', 'sus4', 'min11'];
        for (const eq of extensionQualities) {
            if (eq === currentQuality || context.length >= 16) continue;
            // Only add a couple of extensions
            const extChord = {
                root: currentRoot, quality: eq, type: 'extension',
                label: getChordName(currentRoot, eq)
            };
            if (context.length < 16) {
                context.push(extChord);
                if (context.filter(c => c.type === 'extension').length >= 2) break;
            }
        }

        // 6. Fill remaining slots with chromatic mediants
        if (context.length < 16) {
            const mediants = getChromaticMediants(currentRoot, currentQuality);
            for (const med of mediants) {
                addIfNew(med);
            }
        }

        // Pad to exactly 16 if needed (shouldn't happen often)
        while (context.length < 16) {
            const fillRoot = (currentRoot + context.length) % 12;
            context.push({
                root: fillRoot,
                quality: 'dom7',
                type: 'fill',
                label: getChordName(fillRoot, 'dom7')
            });
        }

        return context.slice(0, 16);
    }

    /**
     * Get a ring chord info object for any pad in the ring layout.
     * @param {string} zone - 'inner', 'outer', 'center'
     * @param {number} index - Position within the zone
     * @param {object} ringState - Current ring state { activeRoot, activeQuality, key, modeName, contextChords, suggestions }
     * @returns {{ root, quality, name, type }}
     */
    function getRingChordInfo(zone, index, ringState) {
        const { activeRoot, activeQuality, key, modeName, contextChords, suggestions } = ringState;

        if (zone === 'inner') {
            // Circle of fifths — index 0-11
            const root = CIRCLE_OF_FIFTHS[index % 12];
            const quality = getDefaultQuality(root, key, modeName);
            return {
                root,
                quality,
                name: getChordName(root, quality),
                type: getDiatonicDegree(root, key, modeName) >= 0 ? 'diatonic' : 'chromatic',
                zone: 'inner',
                index
            };

        } else if (zone === 'outer') {
            // Context chords — index 0-15
            if (contextChords && contextChords[index]) {
                const c = contextChords[index];
                return { ...c, name: c.label || getChordName(c.root, c.quality), zone: 'outer', index };
            }
            return null;

        } else if (zone === 'center') {
            // Suggestions — 0=safe, 1=color, 2=surprise, 3=modifier
            if (index === 3) return { type: 'modifier', zone: 'center', index: 3 };
            if (!suggestions) return null;
            const keys = ['safe', 'color', 'surprise'];
            const s = suggestions[keys[index]];
            if (!s) return null;
            return {
                ...s,
                name: getChordName(s.root, s.quality),
                suggestionType: keys[index],
                zone: 'center',
                index
            };
        }
        return null;
    }

    // ──────────────────────────────────────────────
    // PUBLIC API
    // ──────────────────────────────────────────────

    window.ChordFieldEngine = {
        // Data
        MODES,
        MODE_ORDER,
        MODE_LABELS,
        CHORD_INTERVALS,
        ROW_QUALITY_KEYS,
        QUALITY_FAMILY,
        VOICING_TYPES,
        VOICING_LABELS,
        MODE_DEGREE_TRIADS,
        MODE_DEGREE_7THS,

        // Core functions
        getColumnRoots,
        getGridChord,
        getGridQuality,
        getDiatonicQuality,
        buildChordPitchClasses,
        getQualityForDegree,

        // Voicing
        voiceChord,

        // Glow
        computeSharedNotes,
        computeGlowGrid,

        // Display
        getChordName,
        getRomanLabel,
        getModeName,
        getKeyName,
        midiToName,
        midiToNoteName,
        getQualitySuffix,

        // Navigation
        cycleMode,

        // Ring Chord Field
        CIRCLE_OF_FIFTHS,
        CIRCLE_INDEX,
        getDiatonicDegree,
        getDefaultQuality,
        getSecondaryDominant,
        getTritoneSubstitution,
        getModalInterchange,
        getChromaticMediants,
        computeSuggestions,
        computeContextChords,
        getRingChordInfo,
    };

    console.log('[ChordFieldEngine] Loaded — jazz/gospel/blues harmony engine');

})();
