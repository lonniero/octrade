// ============================================
// HARMONY ENGINE — Functional Harmony + Voice Leading
// ============================================

(function () {
    'use strict';

    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

    // Scale interval patterns (semitones from root)
    const SCALES = {
        major: [0, 2, 4, 5, 7, 9, 11],
        natural_minor: [0, 2, 3, 5, 7, 8, 10],
        harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
        melodic_minor: [0, 2, 3, 5, 7, 9, 11],
    };

    // Chord quality per scale degree (1-indexed)
    const DEGREE_QUALITIES = {
        major: {
            1: { quality: 'maj', roman: 'upper' },
            2: { quality: 'min', roman: 'lower' },
            3: { quality: 'min', roman: 'lower' },
            4: { quality: 'maj', roman: 'upper' },
            5: { quality: 'maj', roman: 'upper' },
            6: { quality: 'min', roman: 'lower' },
            7: { quality: 'dim', roman: 'lower' },
        },
        natural_minor: {
            1: { quality: 'min', roman: 'lower' },
            2: { quality: 'dim', roman: 'lower' },
            3: { quality: 'maj', roman: 'upper' },
            4: { quality: 'min', roman: 'lower' },
            5: { quality: 'min', roman: 'lower' },
            6: { quality: 'maj', roman: 'upper' },
            7: { quality: 'maj', roman: 'upper' },
        },
        harmonic_minor: {
            1: { quality: 'min', roman: 'lower' },
            2: { quality: 'dim', roman: 'lower' },
            3: { quality: 'aug', roman: 'upper' },
            4: { quality: 'min', roman: 'lower' },
            5: { quality: 'maj', roman: 'upper' },
            6: { quality: 'maj', roman: 'upper' },
            7: { quality: 'dim', roman: 'lower' },
        },
        melodic_minor: {
            1: { quality: 'min', roman: 'lower' },
            2: { quality: 'min', roman: 'lower' },
            3: { quality: 'aug', roman: 'upper' },
            4: { quality: 'maj', roman: 'upper' },
            5: { quality: 'maj', roman: 'upper' },
            6: { quality: 'dim', roman: 'lower' },
            7: { quality: 'dim', roman: 'lower' },
        },
    };

    // Functional groups: which degrees belong to each function
    const FUNCTION_DEGREES = {
        major: {
            tonic: [1, 3, 6],
            predominant: [2, 4],
            dominant: [5, 7],
        },
        natural_minor: {
            tonic: [1, 3, 6],
            predominant: [2, 4],
            dominant: [5, 7],
        },
        harmonic_minor: {
            tonic: [1, 3, 6],
            predominant: [2, 4],
            dominant: [5, 7],
        },
        melodic_minor: {
            tonic: [1, 3, 4],
            predominant: [2, 6],
            dominant: [5, 7],
        },
    };

    // Roman numeral symbols
    const ROMAN_UPPER = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
    const ROMAN_LOWER = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

    // Chord interval templates (semitones from root)
    const CHORD_INTERVALS = {
        maj: [0, 4, 7],
        min: [0, 3, 7],
        dim: [0, 3, 6],
        aug: [0, 4, 8],
        sus4: [0, 5, 7],
        '7_maj': [0, 4, 7, 10],
        '7_min': [0, 3, 7, 10],
        '7_dom': [0, 4, 7, 10],
        '7_dim': [0, 3, 6, 9],
        '7_halfdim': [0, 3, 6, 10],
        'maj7': [0, 4, 7, 11],
        '9_maj': [0, 4, 7, 10, 14],
        '9_min': [0, 3, 7, 10, 14],
        '9_dom': [0, 4, 7, 10, 14],
    };

    // Voice leading: the target octave range for voiced notes
    const VOICE_RANGE = { low: 48, high: 72 }; // C3 to C5

    // ── Core Functions ──

    function getScaleNotes(rootNote, scaleName) {
        const intervals = SCALES[scaleName] || SCALES.major;
        return intervals.map(i => (rootNote + i) % 12);
    }

    function getScaleDegreeRoot(rootNote, degree, scaleName) {
        const intervals = SCALES[scaleName] || SCALES.major;
        return (rootNote + intervals[degree - 1]) % 12;
    }

    function getDegreeQuality(degree, scaleName) {
        const qualities = DEGREE_QUALITIES[scaleName] || DEGREE_QUALITIES.major;
        return qualities[degree] || { quality: 'maj', roman: 'upper' };
    }

    function buildChordNotes(rootNote, quality, extension) {
        let intervals;

        if (extension === '7th') {
            if (quality === 'maj') intervals = CHORD_INTERVALS['maj7'];
            else if (quality === 'min') intervals = CHORD_INTERVALS['7_min'];
            else if (quality === 'dim') intervals = CHORD_INTERVALS['7_halfdim'];
            else if (quality === 'aug') intervals = [...CHORD_INTERVALS.aug, 11];
            else intervals = CHORD_INTERVALS['7_dom'];
        } else if (extension === '9th') {
            if (quality === 'maj') intervals = CHORD_INTERVALS['9_dom'];
            else if (quality === 'min') intervals = CHORD_INTERVALS['9_min'];
            else intervals = CHORD_INTERVALS['9_dom'];
        } else if (extension === 'sus4') {
            intervals = CHORD_INTERVALS.sus4;
        } else {
            // Triad
            intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS.maj;
        }

        return intervals.map(i => (rootNote + i) % 12);
    }

    function voiceChord(chordPitchClasses, voiceCount, prevVoicedNotes, inversion) {
        let notes = [];
        const targetCount = Math.min(voiceCount, chordPitchClasses.length);
        const pcs = chordPitchClasses.slice(0, targetCount);

        if (prevVoicedNotes.length === 0) {
            // First chord — arrange in close position
            let bass = chordPitchClasses[inversion % chordPitchClasses.length];
            let bassNote = findClosestInRange(bass, VOICE_RANGE.low, VOICE_RANGE.low + 12);
            notes.push(bassNote);

            let current = bassNote;
            for (let i = 1; i < targetCount; i++) {
                const pcIdx = (inversion + i) % chordPitchClasses.length;
                const pc = chordPitchClasses[pcIdx];
                current = findNextAbove(pc, current);
                if (current > VOICE_RANGE.high + 12) {
                    current = findClosestInRange(pc, VOICE_RANGE.low, VOICE_RANGE.high);
                }
                notes.push(current);
            }
        } else {
            // Voice leading: find closest voicing to previous chord
            notes = voiceLeadFromPrevious(pcs, prevVoicedNotes, inversion);
        }

        notes.sort((a, b) => a - b);

        // Ensure within range
        if (notes.length > 0) {
            while (notes[0] < VOICE_RANGE.low - 12) {
                notes = notes.map(n => n + 12);
            }
            while (notes[notes.length - 1] > VOICE_RANGE.high + 12) {
                notes = notes.map(n => n - 12);
            }
        }

        return notes;
    }

    function voiceLeadFromPrevious(pitchClasses, prevNotes, inversion) {
        const result = [];
        const pcsToVoice = [...pitchClasses];

        // Apply inversion: rotate the pitch class order
        for (let i = 0; i < inversion; i++) {
            pcsToVoice.push(pcsToVoice.shift());
        }

        for (let i = 0; i < pcsToVoice.length; i++) {
            const pc = pcsToVoice[i];

            if (i < prevNotes.length) {
                const target = prevNotes[i];
                const closest = findClosestTo(pc, target);
                result.push(closest);
            } else {
                const highest = result.length > 0 ? Math.max(...result) : VOICE_RANGE.low;
                result.push(findNextAbove(pc, highest));
            }
        }

        return result;
    }

    function findClosestInRange(pitchClass, low, high) {
        const center = (low + high) / 2;
        return findClosestTo(pitchClass, center);
    }

    function findClosestTo(pitchClass, target) {
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

    // ── Secondary Dominants ──

    function buildSecondaryDominant(targetDegree, key, scaleName) {
        const targetRoot = getScaleDegreeRoot(key, targetDegree, scaleName);
        const secDomRoot = (targetRoot + 7) % 12;
        return { root: secDomRoot, quality: 'maj' };
    }

    // ── Public API ──

    const harmonyEngine = {
        computeProgression(pattern, key, scaleName) {
            let prevNotes = [];

            for (let i = 0; i < pattern.length; i++) {
                const step = pattern[i];
                if (!step.active) continue;

                let chordRoot, quality;

                if (step.function === 'secondary' && step.secondaryTarget) {
                    const sec = buildSecondaryDominant(step.secondaryTarget, key, scaleName);
                    chordRoot = sec.root;
                    quality = sec.quality;
                } else {
                    chordRoot = getScaleDegreeRoot(key, step.degree, scaleName);
                    quality = getDegreeQuality(step.degree, scaleName).quality;
                }

                if (step.extension === 'sus4') {
                    quality = 'sus4';
                }

                const pitchClasses = buildChordNotes(chordRoot, quality, step.extension);
                const voicedNotes = voiceChord(
                    pitchClasses,
                    step.voiceCount,
                    prevNotes,
                    step.inversion
                );

                step.voicedNotes = voicedNotes;
                step.quality = quality;
                prevNotes = voicedNotes;
            }
        },

        getDegreesForFunction(func, scaleName) {
            const funcDeg = FUNCTION_DEGREES[scaleName] || FUNCTION_DEGREES.major;
            return funcDeg[func] || [1];
        },

        getSecondaryTargets(scaleName) {
            if (scaleName === 'major') {
                return [2, 3, 4, 5, 6];
            } else {
                return [3, 4, 5, 6, 7];
            }
        },

        getRomanNumeral(step, scaleName) {
            if (step.function === 'secondary' && step.secondaryTarget) {
                const targetRoman = this.getRomanForDegree(step.secondaryTarget, scaleName);
                return `V/${targetRoman}`;
            }

            const degreeInfo = getDegreeQuality(step.degree, scaleName);
            const roman = degreeInfo.roman === 'upper'
                ? ROMAN_UPPER[step.degree]
                : ROMAN_LOWER[step.degree];

            let suffix = '';
            if (step.extension === '7th') suffix = '7';
            else if (step.extension === '9th') suffix = '9';
            else if (step.extension === 'sus4') suffix = 'sus4';

            if (degreeInfo.quality === 'dim') suffix = '°' + suffix;
            else if (degreeInfo.quality === 'aug') suffix = '+' + suffix;

            return roman + suffix;
        },

        getRomanForDegree(degree, scaleName) {
            const degreeInfo = getDegreeQuality(degree, scaleName);
            let roman = degreeInfo.roman === 'upper'
                ? ROMAN_UPPER[degree]
                : ROMAN_LOWER[degree];
            if (degreeInfo.quality === 'dim') roman += '°';
            else if (degreeInfo.quality === 'aug') roman += '+';
            return roman;
        },

        getKeyName(key, scaleName) {
            const noteName = NOTE_NAMES[key];
            const scaleLabels = {
                major: 'Major',
                natural_minor: 'Minor',
                harmonic_minor: 'Harm. Minor',
                melodic_minor: 'Mel. Minor',
            };
            return `${noteName} ${scaleLabels[scaleName] || 'Major'}`;
        },

        midiToName(midiNote) {
            const noteName = NOTE_NAMES[midiNote % 12];
            const octave = Math.floor(midiNote / 12) - 1;
            return `${noteName}${octave}`;
        },

        getScaleNotes,
        getScaleDegreeRoot,
        getDegreeQuality,
        buildChordNotes,
    };

    window.harmonyEngine = harmonyEngine;
    console.log('[HarmonyEngine] Loaded — functional harmony + voice leading');

})();
