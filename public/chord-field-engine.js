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

    // ──────────────────────────────────────────────
    // RING QUALITY MODIFIERS — small ring pad labels
    // ──────────────────────────────────────────────

    const RING_QUALITY_MODIFIERS = [
        { key: '7th', label: '7th', desc: 'Default 7th voicing' },
        { key: '9th', label: '9th', desc: 'Add the 9th — neo-soul staple' },
        { key: '11th', label: '11th', desc: 'Ethereal, open sound' },
        { key: '13th', label: '13th', desc: 'Full, rich voicing' },
        { key: 'sus4', label: 'sus4', desc: 'Suspended — gospel floater' },
        { key: 'add9', label: 'add9', desc: 'Triad + 9th, no 7th' },
        { key: '69', label: '6/9', desc: 'Smooth — D\'Angelo territory' },
        { key: 'triad', label: 'triad', desc: 'Strip to basic triad' },
    ];

    /**
     * Upgrade a base chord quality using the active modifier.
     * E.g. min7 + '9th' → min9, dom7 + '13th' → dom13
     * Returns the original quality if no valid upgrade exists.
     */
    function applyQualityModifier(baseQuality, modifierKey) {
        if (!modifierKey || modifierKey === '7th') return baseQuality;

        // Determine the chord family from the base quality
        const family = QUALITY_FAMILY[baseQuality] || 'major';

        const UPGRADE_MAP = {
            '9th': {
                major: 'maj9', minor: 'min9', dominant: 'dom9',
                diminished: 'min9b5', augmented: 'maj9', sus: baseQuality,
            },
            '11th': {
                major: 'maj11', minor: 'min11', dominant: 'dom11',
                diminished: 'min11', augmented: 'maj11', sus: baseQuality,
            },
            '13th': {
                major: 'maj13', minor: 'min13', dominant: 'dom13',
                diminished: 'min13', augmented: 'maj13', sus: baseQuality,
            },
            'sus4': {
                major: 'sus4', minor: 'sus4', dominant: 'sus4',
                diminished: baseQuality, augmented: baseQuality, sus: 'sus4',
            },
            'add9': {
                major: 'maj9', minor: 'min9', dominant: 'dom9',
                diminished: baseQuality, augmented: 'maj9', sus: baseQuality,
            },
            '69': {
                major: 'maj13', minor: 'min13', dominant: 'dom13',
                diminished: baseQuality, augmented: 'maj13', sus: baseQuality,
            },
            'triad': {
                major: 'maj', minor: 'min', dominant: 'maj',
                diminished: 'dim', augmented: 'aug', sus: 'sus4',
            },
        };

        const map = UPGRADE_MAP[modifierKey];
        if (!map) return baseQuality;
        return map[family] || baseQuality;
    }

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
    function voiceChord(root, quality, voicingType, prevVoicing, octaveOffset, prevRoot) {
        const intervals = CHORD_INTERVALS[quality];
        if (!intervals) return [];

        // Normalize prevVoicing — null/undefined on first press
        if (!prevVoicing) prevVoicing = [];
        // Normalize prevRoot — default to 0 if not provided
        if (prevRoot === undefined || prevRoot === null) prevRoot = 0;

        let notes;

        switch (voicingType) {
            case 'close':
                notes = voiceClose(root, intervals, prevVoicing, prevRoot);
                break;
            case 'drop2':
                notes = voiceDrop2(root, intervals, prevVoicing, prevRoot);
                break;
            case 'drop3':
                notes = voiceDrop3(root, intervals, prevVoicing, prevRoot);
                break;
            case 'open':
                notes = voiceOpen(root, intervals, prevVoicing, prevRoot);
                break;
            case 'rootlessA':
                notes = voiceRootless(root, intervals, prevVoicing, 'A', prevRoot);
                break;
            case 'rootlessB':
                notes = voiceRootless(root, intervals, prevVoicing, 'B', prevRoot);
                break;
            case 'quartal':
                notes = voiceQuartal(root, intervals, prevVoicing, prevRoot);
                break;
            case 'triad':
                notes = voiceTriad(root, quality, prevVoicing, prevRoot);
                break;
            default:
                notes = voiceClose(root, intervals, prevVoicing, prevRoot);
        }

        // ── Centroid gravity correction ──
        // Prevents voice leading drift when circling through keys.
        // If the chord's average pitch drifts outside the sweet zone,
        // shift the ENTIRE voicing by octave(s) to pull it back.
        const GRAVITY_LOW = 48;  // C3 — below this, push up
        const GRAVITY_HIGH = 66;  // F#4 — above this, push down
        const GRAVITY_TARGET = 57; // A3 — keyboard sweet spot

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

        // ── Max-spread check ──
        // If bass-to-next-voice gap exceeds 19 semitones (octave + P5),
        // push bass up an octave to tighten the voicing.
        if (notes.length >= 2) {
            const bassUpperGap = notes[1] - notes[0];
            if (bassUpperGap > 19 && notes[0] + 12 < notes[1]) {
                notes[0] += 12;
                notes.sort((a, b) => a - b);
            }
        }

        return notes;
    }

    /**
     * Close position: all notes within one octave, stacked up from root.
     */
    function voiceClose(root, intervals, prevVoicing, prevRoot) {
        const prevBass = prevVoicing.length > 0 ? Math.min(...prevVoicing) : 0;

        // Bass voice: independent movement
        const bass = voiceLeadBass(root, prevBass);

        // Upper voices: close position stacked above bass
        const upperPCs = [];
        for (let i = 1; i < intervals.length && i < 5; i++) {
            upperPCs.push((root + intervals[i]) % 12);
        }

        if (prevVoicing.length > 1) {
            // Voice lead upper voices naturally (exclude bass from prev)
            const prevUpper = [...prevVoicing].sort((a, b) => a - b).slice(1);
            const ledUpper = voiceLeadNatural(upperPCs, prevUpper, prevRoot || 0);
            return [bass, ...ledUpper].sort((a, b) => a - b);
        }

        // No previous voicing — build from scratch
        const notes = [bass];
        for (const pc of upperPCs) {
            notes.push(findNextAbove(pc, notes[notes.length - 1]));
        }
        return notes;
    }

    /**
     * Drop 2: close position, then drop the second-from-top note an octave.
     * Classic jazz piano voicing with wide bass interval.
     */
    function voiceDrop2(root, intervals, prevVoicing, prevRoot) {
        // First build close position (use 4 notes max)
        const close = buildClosePosition(root, intervals, prevVoicing, 4);

        if (close.length < 4) {
            if (prevVoicing.length > 0) {
                const pcs = close.map(n => ((n % 12) + 12) % 12);
                return voiceLeadNatural(pcs, prevVoicing, prevRoot || 0);
            }
            return close;
        }

        // Drop the 2nd from top note down an octave
        close.sort((a, b) => a - b);
        const secondFromTop = close[close.length - 2];
        close[close.length - 2] = secondFromTop - 12;
        close.sort((a, b) => a - b);

        if (prevVoicing.length > 0) {
            // Bass: independent, upper: natural
            const prevBass = Math.min(...prevVoicing);
            const bass = voiceLeadBass(root, prevBass);
            const prevUpper = [...prevVoicing].sort((a, b) => a - b).slice(1);
            const upperPCs = close.slice(1).map(n => ((n % 12) + 12) % 12);
            const ledUpper = voiceLeadNatural(upperPCs, prevUpper, prevRoot || 0);
            return [bass, ...ledUpper].sort((a, b) => a - b);
        }
        return close;
    }

    /**
     * Drop 3: close position, then drop the third-from-top note an octave.
     * Wide, warm voicing for ballads.
     */
    function voiceDrop3(root, intervals, prevVoicing, prevRoot) {
        const close = buildClosePosition(root, intervals, prevVoicing, 4);

        if (close.length < 4) {
            if (prevVoicing.length > 0) {
                const pcs = close.map(n => ((n % 12) + 12) % 12);
                return voiceLeadNatural(pcs, prevVoicing, prevRoot || 0);
            }
            return close;
        }

        close.sort((a, b) => a - b);
        const thirdFromTop = close[close.length - 3];
        close[close.length - 3] = thirdFromTop - 12;
        close.sort((a, b) => a - b);

        if (prevVoicing.length > 0) {
            const prevBass = Math.min(...prevVoicing);
            const bass = voiceLeadBass(root, prevBass);
            const prevUpper = [...prevVoicing].sort((a, b) => a - b).slice(1);
            const upperPCs = close.slice(1).map(n => ((n % 12) + 12) % 12);
            const ledUpper = voiceLeadNatural(upperPCs, prevUpper, prevRoot || 0);
            return [bass, ...ledUpper].sort((a, b) => a - b);
        }
        return close;
    }

    /**
     * Open: spread voices across full range with proper bass-soprano counterpoint.
     * Gospel/neo-soul style — big, full sound.
     */
    function voiceOpen(root, intervals, prevVoicing, prevRoot) {
        const noteCount = Math.min(intervals.length, 5);

        // Bass: independent voice leading  
        const prevBass = prevVoicing.length > 0 ? Math.min(...prevVoicing) : 0;
        const bass = voiceLeadBass(root, prevBass);

        // Upper structure: spread remaining notes across alto-soprano range
        const upperPCs = [];
        for (let i = 1; i < noteCount; i++) {
            upperPCs.push((root + intervals[i]) % 12);
        }

        if (prevVoicing.length > 1) {
            const prevUpper = [...prevVoicing].sort((a, b) => a - b).slice(1);
            const ledUpper = voiceLeadNatural(upperPCs, prevUpper, prevRoot || 0);
            // Ensure upper voices stay in upper register
            const clampedUpper = ledUpper.map(n => clampNote(n, 48, 84));
            return [bass, ...clampedUpper].sort((a, b) => a - b);
        }

        // No previous — build spread voicing from scratch
        const notes = [bass];
        const upperCenter = 62; // D4
        for (let i = 0; i < upperPCs.length; i++) {
            const target = upperCenter - 4 + (i * 5);
            notes.push(clampNote(findClosest(upperPCs[i], target), 48, 84));
        }
        return notes.sort((a, b) => a - b);
    }

    /**
     * Rootless voicing: omit the root, voice the upper structure.
     * Type A: 3-5-7-9 | Type B: 7-9-3-5
     */
    function voiceRootless(root, intervals, prevVoicing, type, prevRoot) {
        if (intervals.length < 4) {
            // Too few notes for rootless — fall back to close
            return voiceClose(root, intervals, prevVoicing, prevRoot);
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

        if (prevVoicing.length > 0) {
            // Rootless = no bass voice, all voices led naturally
            return voiceLeadNatural(voicePCs, prevVoicing, prevRoot || 0);
        }

        // No previous — build from scratch
        const center = DEFAULT_CENTER;
        const notes = [];
        let current = center - 6;
        for (const pc of voicePCs) {
            const note = findClosest(pc, current);
            notes.push(note);
            current = note + 3;
        }
        return notes;
    }

    /**
     * Quartal voicing: stack notes in 4ths from the root.
     * McCoy Tyner / Herbie Hancock modal jazz sound.
     */
    function voiceQuartal(root, intervals, prevVoicing, prevRoot) {
        const pcs = intervals.map(i => (root + i) % 12);

        // Bass: independent
        const prevBass = prevVoicing.length > 0 ? Math.min(...prevVoicing) : 0;
        const bass = voiceLeadBass(root, prevBass);

        // Build quartal stack for upper voices
        // Stack chord tones in 4ths above bass
        const upperPCs = [];
        let quartalMidi = bass + 5; // start a 4th above bass
        for (let i = 0; i < 3; i++) {
            const targetPC = quartalMidi % 12;
            // Snap to nearest chord tone
            let bestPC = targetPC;
            let bestDist = 99;
            for (const chordPC of pcs) {
                const dist = Math.min(
                    Math.abs(chordPC - targetPC),
                    12 - Math.abs(chordPC - targetPC)
                );
                if (dist < bestDist) {
                    bestDist = dist;
                    bestPC = chordPC;
                }
            }
            upperPCs.push(bestPC);
            quartalMidi += 5; // next 4th
        }

        if (prevVoicing.length > 1) {
            const prevUpper = [...prevVoicing].sort((a, b) => a - b).slice(1);
            const ledUpper = voiceLeadNatural(upperPCs, prevUpper, prevRoot || 0);
            return [bass, ...ledUpper].sort((a, b) => a - b);
        }

        // No previous — build from scratch
        const notes = [bass];
        let current = bass;
        for (const pc of upperPCs) {
            const note = findNextAbove(pc, current);
            notes.push(note);
            current = note;
        }
        return notes;
    }

    /**
     * Triad voicing: simple 3-note chord.
     * Uses the base triad quality from the chord.
     */
    function voiceTriad(root, quality, prevVoicing, prevRoot) {
        // Map quality to base triad
        let triadQ = 'maj';
        if (quality.startsWith('min') || quality === 'halfdim7') triadQ = 'min';
        else if (quality.startsWith('dom')) triadQ = 'maj';
        else if (quality.startsWith('dim') || quality === 'halfdim7') triadQ = 'dim';
        else if (quality.startsWith('aug')) triadQ = 'aug';
        else if (quality === 'sus2') triadQ = 'sus2';
        else if (quality === 'sus4') triadQ = 'sus4';

        const intervals = CHORD_INTERVALS[triadQ] || CHORD_INTERVALS.maj;

        // Bass: independent
        const prevBass = prevVoicing.length > 0 ? Math.min(...prevVoicing) : 0;
        const bass = voiceLeadBass(root, prevBass);

        // Upper voices (just 2 for a triad)
        const upperPCs = [];
        for (let i = 1; i < intervals.length; i++) {
            upperPCs.push((root + intervals[i]) % 12);
        }

        if (prevVoicing.length > 1) {
            const prevUpper = [...prevVoicing].sort((a, b) => a - b).slice(1);
            const ledUpper = voiceLeadNatural(upperPCs, prevUpper, prevRoot || 0);
            return [bass, ...ledUpper].sort((a, b) => a - b);
        }

        // No previous — build from scratch
        const notes = [bass];
        for (const pc of upperPCs) {
            notes.push(findNextAbove(pc, notes[notes.length - 1]));
        }
        return notes;
    }

    // ──────────────────────────────────────────────
    // VOICE LEADING HELPERS
    // ──────────────────────────────────────────────

    /**
     * Tendency tone resolution table.
     * Maps interval-from-chord-root → preferred resolution in semitones.
     * Negative = resolve down, positive = resolve up.
     */
    const TENDENCY_RESOLUTIONS = {
        10: -1,  // b7 resolves DOWN by half-step (e.g. Bb → A over G7 → C)
        11: -1,  // maj7 resolves DOWN by half-step in most contexts
        6: -1,  // tritone/b5 resolves DOWN (e.g. Db → C over G7 → C)
        1: -1,  // b9 resolves DOWN
        8: 1,  // #5/b13 resolves UP
    };

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
     * Natural voice leading: mimics how a pianist moves between chords.
     *
     * Priority order:
     *   1. Common tones — shared pitch classes stay at exact same MIDI note
     *   2. Tendency tones — 7ths resolve down, tritones resolve, etc.
     *   3. Stepwise motion — remaining voices move by smallest interval possible
     *
     * @param {number[]} newPCs - Pitch classes to place (0-11)
     * @param {number[]} prevVoicing - Previous chord's MIDI notes (sorted low→high)
     * @param {number} prevRoot - Previous chord's root pitch class (for tendency detection)
     * @returns {number[]} MIDI notes, sorted low→high
     */
    function voiceLeadNatural(newPCs, prevVoicing, prevRoot) {
        if (prevVoicing.length === 0) return newPCs; // no prev = nothing to lead from

        const sortedPrev = [...prevVoicing].sort((a, b) => a - b);
        const targetPCs = new Set(newPCs.map(pc => ((pc % 12) + 12) % 12));
        const placedPCs = new Set();       // PCs we've assigned to a voice
        const result = new Array(sortedPrev.length).fill(null);

        // ── Step 1: Common-tone retention ──
        // If a previous voice's pitch class is in the new chord, keep it
        for (let i = 0; i < sortedPrev.length; i++) {
            const prevPC = ((sortedPrev[i] % 12) + 12) % 12;
            if (targetPCs.has(prevPC) && !placedPCs.has(prevPC)) {
                result[i] = sortedPrev[i]; // exact same MIDI note — finger doesn't move
                placedPCs.add(prevPC);
            }
        }

        // ── Step 2: Tendency-tone resolution ──
        // For unplaced voices, check if they're tendency tones that should resolve
        for (let i = 0; i < sortedPrev.length; i++) {
            if (result[i] !== null) continue; // already placed

            const prevNote = sortedPrev[i];
            const prevPC = ((prevNote % 12) + 12) % 12;

            // What interval is this voice relative to the previous chord's root?
            const intervalFromPrevRoot = ((prevPC - prevRoot) % 12 + 12) % 12;
            const resolution = TENDENCY_RESOLUTIONS[intervalFromPrevRoot];

            if (resolution !== undefined) {
                const resolvedNote = prevNote + resolution;
                const resolvedPC = ((resolvedNote % 12) + 12) % 12;

                // Only resolve if the target PC is actually in the new chord
                if (targetPCs.has(resolvedPC) && !placedPCs.has(resolvedPC)) {
                    result[i] = resolvedNote;
                    placedPCs.add(resolvedPC);
                }
            }
        }

        // ── Step 3: Stepwise motion for remaining voices ──
        // Unplaced new PCs get assigned to unplaced prev voices by smallest motion
        const unplacedNewPCs = [...targetPCs].filter(pc => !placedPCs.has(pc));
        const unplacedVoiceIndices = [];
        for (let i = 0; i < result.length; i++) {
            if (result[i] === null) unplacedVoiceIndices.push(i);
        }

        // Greedy assignment: for each unplaced voice, find the closest unplaced PC
        const usedNewPCs = new Set();
        for (const voiceIdx of unplacedVoiceIndices) {
            const prevNote = sortedPrev[voiceIdx];
            let bestNote = null;
            let bestDist = Infinity;
            let bestPC = null;

            for (const pc of unplacedNewPCs) {
                if (usedNewPCs.has(pc)) continue;

                // Find closest octave placement
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
                        bestPC = pc;
                    }
                }
            }

            if (bestNote !== null) {
                result[voiceIdx] = bestNote;
                usedNewPCs.add(bestPC);
            }
        }

        // Fill any remaining null slots (voice count mismatch)
        for (let i = 0; i < result.length; i++) {
            if (result[i] === null) {
                result[i] = sortedPrev[i]; // fallback: keep prev note
            }
        }

        // Handle case where new chord has MORE voices than previous
        if (newPCs.length > sortedPrev.length) {
            const extraPCs = unplacedNewPCs.filter(pc => !usedNewPCs.has(pc));
            const center = Math.round(sortedPrev.reduce((a, b) => a + b, 0) / sortedPrev.length);
            for (const pc of extraPCs) {
                result.push(findClosest(pc, center));
            }
        }

        result.sort((a, b) => a - b);
        return result;
    }

    /**
     * Independent bass voice leading.
     * A pianist's left hand moves differently from the right:
     *   - Prefers root motion by 4th/5th (strongest), then step, then 3rd
     *   - Keeps bass in a focused low register (C2–G3)
     *   - Places root unless voicing type says otherwise
     *
     * @param {number} newRoot - New chord root pitch class
     * @param {number} prevBass - Previous bass MIDI note (or 0 if none)
     * @returns {number} MIDI note for bass voice
     */
    function voiceLeadBass(newRoot, prevBass) {
        const BASS_LOW = 40;   // E2
        const BASS_HIGH = 60;  // C4
        const BASS_CENTER = 48; // C3 — piano left-hand sweet spot

        if (!prevBass || prevBass === 0) {
            return findClosest(newRoot, BASS_CENTER);
        }

        // Find all valid placements of the new root in bass range
        const candidates = [];
        for (let oct = 1; oct <= 5; oct++) {
            const note = oct * 12 + newRoot;
            if (note >= BASS_LOW && note <= BASS_HIGH) {
                candidates.push(note);
            }
        }
        if (candidates.length === 0) {
            return findClosest(newRoot, BASS_CENTER);
        }

        // Score each candidate: prefer small motion, especially by 4th/5th
        let bestNote = candidates[0];
        let bestScore = Infinity;

        for (const c of candidates) {
            const motion = Math.abs(c - prevBass);
            const interval = motion % 12;

            // Scoring: lower is better
            // Perfect 4th/5th (5 or 7 semitones) = most natural bass motion
            // Step (1-2) = smooth
            // Minor/major 3rd (3-4) = acceptable
            // Tritone (6) = dramatic but OK
            // Others = less ideal
            let score = motion; // base: total distance
            if (interval === 5 || interval === 7) score -= 3;  // reward 4th/5th
            if (interval <= 2) score -= 2;                      // reward step
            if (interval === 0) score -= 4;                     // reward common tone (oblique bass)

            if (score < bestScore) {
                bestScore = score;
                bestNote = c;
            }
        }

        return bestNote;
    }

    /**
     * Legacy wrapper — calls voiceLeadNatural with no tendency info.
     * Used by voicing functions that don't track the previous root.
     */
    function voiceLeadSmooth(newNotes, prevNotes) {
        if (prevNotes.length === 0) return newNotes;
        const newPCs = newNotes.map(n => ((n % 12) + 12) % 12);
        return voiceLeadNatural(newPCs, prevNotes, 0);
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
     * Get Neo-Riemannian chord transformations (P, R, L).
     * These are the 3 "neighbor" chords that share 2 out of 3 notes.
     *
     * P (Parallel): same root, flip major↔minor (C→Cm, Am→A)
     * R (Relative): relative major/minor (C→Am, Am→C, Cm→Eb, Ebm→Gb)
     * L (Leading tone): move one note by semitone to flip quality
     *   Major→minor: root stays, 5th moves up → e.g. C(CEG)→Em(EGB) 
     *   Minor→major: root stays, root moves down → e.g. Am(ACE)→F(FAC)
     *
     * @param {number} root - Root pitch class (0-11)
     * @param {string} quality - Current chord quality
     * @returns {{ P: {root, quality}, R: {root, quality}, L: {root, quality} }}
     */
    function getNeoRiemannian(root, quality) {
        const isMajor = QUALITY_FAMILY[quality] === 'major' || quality === 'maj7' || quality === 'maj' || quality === 'dom7' || quality === 'dom9' || quality === 'dom13' || quality === 'sus4';
        const isMinor = !isMajor;

        // P: Parallel — same root, flip quality
        const P = {
            root: root,
            quality: isMajor ? 'min7' : 'maj7',
            type: 'neo_riemannian',
            role: 'parallel'
        };

        // R: Relative — relative major/minor relationship
        // Major → down minor 3rd (C→Am): root - 3
        // Minor → up minor 3rd (Am→C): root + 3
        const R = {
            root: isMajor ? (root + 9) % 12 : (root + 3) % 12,
            quality: isMajor ? 'min7' : 'maj7',
            type: 'neo_riemannian',
            role: 'relative'
        };

        // L: Leading tone exchange
        // Major → down semitone from root (C→Em): root + 4
        // Minor → up semitone to 5th (Em→C): root + 8
        const L = {
            root: isMajor ? (root + 4) % 12 : (root + 8) % 12,
            quality: isMajor ? 'min7' : 'maj7',
            type: 'neo_riemannian',
            role: 'leading_tone'
        };

        return { P, R, L };
    }

    /**
     * Compute the 16 context chords for the outer ring.
     * Organized into 4 QUADRANTS of 4 pads each by musical intent:
     *
     *   Resolve (0-3):  ↓ tension — standard landing spots
     *   Color   (4-7):  = tension — Neo-Riemannian neighbors, same energy different shade
     *   Tension (8-11): ↑ tension — dominants, approach chords
     *   Portal  (12-15): ⚡ jump — shortcuts across the circle
     *
     * @param {number} currentRoot - Current chord's root (0-11)
     * @param {string} currentQuality - Current chord quality
     * @param {number} key - Current key (0-11)
     * @param {string} modeName - Current mode name
     * @returns {Array<{root, quality, type, quadrant, role, label}>} 16 context chord objects
     */
    function computeContextChords(currentRoot, currentQuality, key, modeName) {
        const scale = MODES[modeName] || MODES.ionian;
        const degree7ths = MODE_DEGREE_7THS[modeName] || MODE_DEGREE_7THS.ionian;
        const currentDegree = getDiatonicDegree(currentRoot, key, modeName);

        // Helper to build a labeled chord object
        function makeChord(root, quality, quadrant, role) {
            return {
                root: root % 12,
                quality,
                type: quadrant,       // used for backward compat
                quadrant,             // new: 'resolve'|'color'|'tension'|'portal'
                role,                 // new: descriptive role name
                label: getChordName(root % 12, quality)
            };
        }

        // ═══════════════════════════════════════════════
        // QUADRANT 1: RESOLVE (pads 0-3) — "where to land"
        // ═══════════════════════════════════════════════
        const resolve = [];

        // Pad 0: Strongest functional resolution from current chord
        if (currentDegree === 4) {
            // On V → resolve to I
            resolve.push(makeChord(key, degree7ths[0], 'resolve', 'resolution'));
        } else if (currentDegree === 1) {
            // On ii → go to V
            resolve.push(makeChord((key + scale[4]) % 12, degree7ths[4], 'resolve', 'resolution'));
        } else if (currentDegree === 0) {
            // On I → ii (start a ii-V)
            resolve.push(makeChord((key + scale[1]) % 12, degree7ths[1], 'resolve', 'resolution'));
        } else if (currentDegree >= 0) {
            // Other diatonic: resolve down a 5th (circle of 5ths motion)
            const targetDeg = (currentDegree + 3) % 7;
            resolve.push(makeChord((key + scale[targetDeg]) % 12, degree7ths[targetDeg], 'resolve', 'resolution'));
        } else {
            // Non-diatonic: resolve down semitone to nearest diatonic
            let resolved = false;
            for (let offset = 1; offset <= 6; offset++) {
                const tryRoot = (currentRoot - offset + 12) % 12;
                const tryDeg = getDiatonicDegree(tryRoot, key, modeName);
                if (tryDeg >= 0) {
                    resolve.push(makeChord(tryRoot, degree7ths[tryDeg], 'resolve', 'resolution'));
                    resolved = true;
                    break;
                }
            }
            if (!resolved) resolve.push(makeChord(key, degree7ths[0], 'resolve', 'resolution'));
        }

        // Pad 1: IV chord (plagal / subdominant)
        const ivRoot = (key + scale[3]) % 12;
        if (ivRoot !== currentRoot && ivRoot !== resolve[0]?.root) {
            resolve.push(makeChord(ivRoot, degree7ths[3], 'resolve', 'plagal'));
        } else {
            // If IV is current or same as resolution, use V instead
            const vRoot = (key + scale[4]) % 12;
            resolve.push(makeChord(vRoot, degree7ths[4], 'resolve', 'dominant'));
        }

        // Pad 2: vi chord (deceptive resolution)
        const viRoot = (key + scale[5]) % 12;
        const viUsed = resolve.some(c => c.root === viRoot) || viRoot === currentRoot;
        if (!viUsed) {
            resolve.push(makeChord(viRoot, degree7ths[5], 'resolve', 'deceptive'));
        } else {
            // Fallback: iii chord
            const iiiRoot = (key + scale[2]) % 12;
            resolve.push(makeChord(iiiRoot, degree7ths[2], 'resolve', 'mediant'));
        }

        // Pad 3: I chord (home / tonic)
        if (key !== currentRoot && !resolve.some(c => c.root === key)) {
            resolve.push(makeChord(key, degree7ths[0], 'resolve', 'tonic'));
        } else {
            // If tonic already used, use ii chord
            const iiRoot = (key + scale[1]) % 12;
            if (!resolve.some(c => c.root === iiRoot) && iiRoot !== currentRoot) {
                resolve.push(makeChord(iiRoot, degree7ths[1], 'resolve', 'supertonic'));
            } else {
                const vRoot = (key + scale[4]) % 12;
                resolve.push(makeChord(vRoot, degree7ths[4], 'resolve', 'dominant'));
            }
        }

        // ═══════════════════════════════════════════════
        // QUADRANT 2: COLOR (pads 4-7) — "same energy, different shade"
        // ═══════════════════════════════════════════════
        const color = [];
        const neoR = getNeoRiemannian(currentRoot, currentQuality);

        // Pad 4: Parallel (P) — flip major↔minor
        color.push(makeChord(neoR.P.root, neoR.P.quality, 'color', 'parallel'));

        // Pad 5: Relative (R) — relative major/minor
        if (neoR.R.root !== neoR.P.root) {
            color.push(makeChord(neoR.R.root, neoR.R.quality, 'color', 'relative'));
        } else {
            // Fallback: chromatic mediant (M3 up with same quality)
            color.push(makeChord((currentRoot + 4) % 12, currentQuality, 'color', 'mediant_up'));
        }

        // Pad 6: Leading tone (L) — Neo-Riemannian L transform
        if (neoR.L.root !== neoR.P.root && neoR.L.root !== neoR.R.root) {
            color.push(makeChord(neoR.L.root, neoR.L.quality, 'color', 'leading_tone'));
        } else {
            // Fallback: chromatic mediant (m3 up)
            color.push(makeChord((currentRoot + 3) % 12, 'min7', 'color', 'mediant_m3'));
        }

        // Pad 7: Modal borrow — strongest borrowed chord from parallel key
        const miChords = getModalInterchange(key, modeName);
        const unusedMi = miChords.filter(c =>
            c.root !== currentRoot &&
            !color.some(cc => cc.root === c.root)
        );
        if (unusedMi.length > 0) {
            // Prefer iv (in major) or IV (in minor) — the most iconic borrow
            const borrowDeg3 = unusedMi.find(c => c.degree === 3); // iv / IV
            const chosen = borrowDeg3 || unusedMi[0];
            color.push(makeChord(chosen.root, chosen.quality, 'color', 'modal_borrow'));
        } else {
            // Fallback: chromatic mediant down (M3 down)
            color.push(makeChord((currentRoot + 8) % 12, 'maj7', 'color', 'mediant_down'));
        }

        // ═══════════════════════════════════════════════
        // QUADRANT 3: TENSION (pads 8-11) — "build expectation"
        // ═══════════════════════════════════════════════
        const tension = [];

        // Pad 8: Secondary dominant — V7 that resolves TO the current chord
        const secDomOfCurrent = getSecondaryDominant(currentRoot);
        tension.push(makeChord(secDomOfCurrent.root, secDomOfCurrent.quality, 'tension', 'secondary_dominant'));

        // Pad 9: Tritone sub of V — chromatic approach to current key's tonic
        const primaryV = (key + scale[4]) % 12;
        const triSubV = getTritoneSubstitution(primaryV);
        if (triSubV.root !== secDomOfCurrent.root && triSubV.root !== currentRoot) {
            tension.push(makeChord(triSubV.root, triSubV.quality, 'tension', 'tritone_sub'));
        } else {
            // Tritone sub of the current chord's dominant
            const triSubCurrent = getTritoneSubstitution(secDomOfCurrent.root);
            tension.push(makeChord(triSubCurrent.root, triSubCurrent.quality, 'tension', 'tritone_sub'));
        }

        // Pad 10: V7/ii — secondary dominant of ii (sets up the classic ii-V)
        const iiRoot = (key + scale[1]) % 12;
        const secDomOfII = getSecondaryDominant(iiRoot);
        if (secDomOfII.root !== currentRoot && !tension.some(c => c.root === secDomOfII.root)) {
            tension.push(makeChord(secDomOfII.root, secDomOfII.quality, 'tension', 'secondary_dom_ii'));
        } else {
            // V7/vi — secondary dominant of vi
            const viRoot2 = (key + scale[5]) % 12;
            const secDomOfVI = getSecondaryDominant(viRoot2);
            tension.push(makeChord(secDomOfVI.root, secDomOfVI.quality, 'tension', 'secondary_dom_vi'));
        }

        // Pad 11: Dominant chain next — next dom7 in circle of 5ths from current position
        const domChainRoot = (currentRoot + 5) % 12; // down a 5th = up a 4th
        if (domChainRoot !== currentRoot && !tension.some(c => c.root === domChainRoot)) {
            tension.push(makeChord(domChainRoot, 'dom7', 'tension', 'dominant_chain'));
        } else {
            // Chain the other direction (up a 5th)
            const domChainUp = (currentRoot + 7) % 12;
            tension.push(makeChord(domChainUp, 'dom7', 'tension', 'dominant_chain'));
        }

        // ═══════════════════════════════════════════════
        // QUADRANT 4: PORTAL (pads 12-15) — "jump across the circle"
        // ═══════════════════════════════════════════════
        const portal = [];

        // Pad 12: Coltrane jump — M3 up (Giant Steps direction)
        const coltraneUp = (currentRoot + 4) % 12;
        const coltraneUpQ = getDefaultQuality(coltraneUp, key, modeName);
        // Use maj7 for the Coltrane sound if not diatonic
        portal.push(makeChord(coltraneUp,
            getDiatonicDegree(coltraneUp, key, modeName) >= 0 ? coltraneUpQ : 'maj7',
            'portal', 'coltrane_up'));

        // Pad 13: Coltrane jump — M3 down (other Giant Steps direction)
        const coltraneDown = (currentRoot + 8) % 12;
        const coltraneDownQ = getDefaultQuality(coltraneDown, key, modeName);
        portal.push(makeChord(coltraneDown,
            getDiatonicDegree(coltraneDown, key, modeName) >= 0 ? coltraneDownQ : 'maj7',
            'portal', 'coltrane_down'));

        // Pad 14: Chromatic slide — semitone up, same quality family
        const slideRoot = (currentRoot + 1) % 12;
        const slideQ = getDefaultQuality(slideRoot, key, modeName);
        portal.push(makeChord(slideRoot,
            getDiatonicDegree(slideRoot, key, modeName) >= 0 ? slideQ : currentQuality,
            'portal', 'chromatic_slide'));

        // Pad 15: Diminished bridge — dim7 chord that connects to 4 keys
        const dimRoot = (currentRoot + 11) % 12; // vii°7 of current chord (leading tone)
        portal.push(makeChord(dimRoot, 'dim7', 'portal', 'diminished_bridge'));

        // ═══════════════════════════════════════════════
        // Combine all 4 quadrants into the 16-pad array
        // ═══════════════════════════════════════════════
        const context = [...resolve, ...color, ...tension, ...portal];

        // Safety: ensure exactly 16
        while (context.length < 16) {
            context.push(makeChord((currentRoot + context.length) % 12, 'dom7', 'fill', 'fill'));
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
    // AUTO-MODULATION — Seamless Key Shifting
    // ──────────────────────────────────────────────
    //
    // Dylan's concept: if you play two chords in sequence that form a
    // predominant→dominant (ii→V or IV→V) pattern in a KEY OTHER than
    // the current one, automatically shift the tonal center to that new key.
    //
    // The secret: any dominant 7th chord IS the V of some key. The question
    // is whether the chord BEFORE it confirms the journey by being ii or IV
    // in that same target key. That two-step pattern is what makes the
    // modulation feel inevitable — "they don't even know they're changing key."
    //

    /**
     * Check if a chord has dominant function (contains a major 3rd + minor 7th = tritone).
     * Any dom7-family chord qualifies.
     */
    function isDominantQuality(quality) {
        return [
            'dom7', 'dom9', 'dom11', 'dom13',
            'dom7alt', 'dom7b9', 'dom7sharp9',
            'dom7b5', 'dom7sharp5', 'dom7sharp11',
        ].includes(quality);
    }

    /**
     * Check if a chord could function as a predominant (ii or IV) in a given key.
     * 
     * In major keys:
     *   ii = minor chord rooted on scale degree 2
     *   IV = major chord rooted on scale degree 4
     * 
     * We check all 7 modes for maximum flexibility.
     * 
     * @param {number} chordRoot - Root pitch class (0-11)
     * @param {string} chordQuality - Chord quality string
     * @param {number} targetKey - The key we're testing against (0-11)
     * @param {string} modeName - Current mode
     * @returns {boolean}
     */
    function isPredominantInKey(chordRoot, chordQuality, targetKey, modeName) {
        const scale = MODES[modeName] || MODES.ionian;
        const family = QUALITY_FAMILY[chordQuality] || 'major';

        // Check degree 1 (ii in ionian = scale[1])
        const iiRoot = (targetKey + scale[1]) % 12;
        const iiNatural = (MODE_DEGREE_TRIADS[modeName] || MODE_DEGREE_TRIADS.ionian)[1];
        const iiFamily = QUALITY_FAMILY[iiNatural] || 'minor';

        // Check degree 3 (IV in ionian = scale[3])
        const ivRoot = (targetKey + scale[3]) % 12;
        const ivNatural = (MODE_DEGREE_TRIADS[modeName] || MODE_DEGREE_TRIADS.ionian)[3];
        const ivFamily = QUALITY_FAMILY[ivNatural] || 'major';

        // ii match: root matches AND quality family matches (minor-family for ii)
        if (chordRoot === iiRoot && (family === iiFamily || family === 'minor')) {
            return true;
        }

        // IV match: root matches AND quality family matches (major-family for IV)
        if (chordRoot === ivRoot && (family === ivFamily || family === 'major')) {
            return true;
        }

        return false;
    }

    /**
     * Detect if the last two chords form a modulation trigger.
     * 
     * The algorithm (from Dylan):
     * 1. The SECOND chord (most recent) must be a dominant 7th chord
     * 2. That dominant's root tells us: it's the V of (root - 7 semitones) = target key
     * 3. The FIRST chord must be ii or IV in that same target key
     * 4. The target key must be DIFFERENT from the current key
     * 
     * If all conditions are met → modulate to the target key.
     * 
     * Examples (in C major):
     *   Am → D7  → Am is ii of G, D7 is V of G → shift to G major ✓
     *   Dm → G7  → Dm is ii of C, G7 is V of C → no shift (already in C) ✗
     *   F  → Bb7 → F is IV of Eb (in mixo: scale[3]), Bb is V of Eb → shift to Eb ✓
     *   Em → A7  → Em is ii of D, A7 is V of D → shift to D major ✓
     *   C  → A7  → C is NOT ii or IV of D → no shift (A7 is just V/ii in C) ✗
     * 
     * @param {number} prevRoot - Root of the chord before the current one (0-11)
     * @param {string} prevQuality - Quality of that chord
     * @param {number} currentRoot - Root of the chord just played (0-11)
     * @param {string} currentQuality - Quality of that chord
     * @param {number} currentKey - The current tonal center (0-11)
     * @param {string} modeName - The current mode
     * @returns {{ newKey: number, confidence: string } | null}
     *   newKey: the pitch class to modulate to
     *   confidence: 'strong' (ii-V) or 'moderate' (IV-V)
     */
    function detectModulation(prevRoot, prevQuality, currentRoot, currentQuality, currentKey, modeName) {
        // ── Step 1: Current chord must be a dominant ──
        if (!isDominantQuality(currentQuality)) {
            return null;
        }

        // ── Step 2: Determine the target key ──
        // A dominant chord resolves down a P5 to its tonic
        // V root → tonic: subtract 7 semitones (or add 5)
        const targetKey = (currentRoot + 5) % 12;

        // ── Step 3: Target must differ from current key ──
        if (targetKey === currentKey) {
            return null;
        }

        // ── Step 4: Previous chord must be predominant (ii or IV) in target key ──
        if (!isPredominantInKey(prevRoot, prevQuality, targetKey, modeName)) {
            return null;
        }

        // ── Step 5: Determine confidence ──
        // ii→V is the strongest signal (jazz standard ii-V-I)
        // IV→V is also strong (gospel/pop cadential approach)
        const scale = MODES[modeName] || MODES.ionian;
        const iiRoot = (targetKey + scale[1]) % 12;
        const confidence = (prevRoot === iiRoot) ? 'strong' : 'moderate';

        return { newKey: targetKey, confidence };
    }

    /**
     * Check if a chord root is diatonic in a given key and mode.
     * Returns true if the root appears as any scale degree.
     */
    function isRootDiatonic(root, key, modeName) {
        return getDiatonicDegree(root, key, modeName) >= 0;
    }

    /**
     * Find the best mode for a new key based on the preceding context.
     * For now, default to ionian (major) — this can be extended later
     * to detect minor key modulations, etc.
     */
    function suggestModeForKey(newKey, prevRoot, prevQuality, modeName) {
        // If the target key's tonic chord would naturally be minor in the
        // original mode context, suggest aeolian (minor)
        // For v1, keep it simple: always use the same mode as current
        return modeName;
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
        getNeoRiemannian,
        getSecondaryDominant,
        getTritoneSubstitution,
        getModalInterchange,
        getChromaticMediants,
        computeSuggestions,
        computeContextChords,
        getRingChordInfo,

        // Quality modifiers (small ring)
        RING_QUALITY_MODIFIERS,
        applyQualityModifier,

        // Auto-modulation
        detectModulation,
        isDominantQuality,
        isPredominantInKey,
        isRootDiatonic,
        suggestModeForKey,
    };

    console.log('[ChordFieldEngine] Loaded — jazz/gospel/blues harmony engine');

})();
