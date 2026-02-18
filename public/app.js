// ============================================
// OCTADRE — Digital MIDI Sequencer
// Main Application Module
// ============================================

// ──────────────────────────────────────────────
// CONSTANTS (mapped from original Octadre)
// ──────────────────────────────────────────────

const TRACK_COLORS = [
    '#00e060', '#00c8ff', '#ff6040', '#ffc800',
    '#c060ff', '#ff4080', '#40ffb0', '#80a0ff',
    '#ff8020', '#40e0e0', '#e0e040', '#ff60c0',
    '#60ff60', '#8080ff', '#ff4040', '#40c0ff'
];

// Expose for audio engine waveform coloring
window.TRACK_COLORS = TRACK_COLORS;

const TRACK_COLORS_DIM = TRACK_COLORS.map(c => {
    // Create a dimmer version for inactive pads
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgb(${Math.floor(r * 0.25)}, ${Math.floor(g * 0.25)}, ${Math.floor(b * 0.25)})`;
});

// The circular/ring layout of the 8x8 grid — maps grid indices to ring positions
// BIG_GRID: outer ring (16 steps) — the main sequencer
// INNER_GRID: middle ring (12 pads) — note selection
// SMALL_GRID: inner ring (8 pads) — length/velocity/octave

// Octadre grid mapping reproduced from constants.js
// BIG_GRID positions in row-major 8x8 (value = row*10 + col + 11 in original)
// We map them to [row, col] for our web grid
const BIG_GRID_POSITIONS = [
    [0, 3], [1, 2], [2, 1], [3, 0], // left column going down
    [4, 0], [5, 1], [6, 2], [7, 3], // bottom-left going right
    [7, 4], [6, 5], [5, 6], [4, 7], // right column going up
    [3, 7], [2, 6], [1, 5], [0, 4]  // top-right going left
];

const INNER_GRID_POSITIONS = [
    [1, 3], [2, 2], [3, 1], [4, 1], // left side
    [5, 2], [6, 3], [6, 4], [5, 5], // bottom
    [4, 6], [3, 6], [2, 5], [1, 4]  // right side
];

const SMALL_GRID_POSITIONS = [
    [2, 3], [3, 2], [4, 2], [5, 3], // left
    [5, 4], [4, 5], [3, 5], [2, 4]  // right
];

// CENTER: 4 scene buttons in the very middle of the grid (always visible)
const SCENE_POSITIONS = [
    [3, 3], [3, 4],  // top-left, top-right
    [4, 3], [4, 4]   // bottom-left, bottom-right
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SCALES = [
    { name: 'Major', intervals: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1] },
    { name: 'Minor', intervals: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0] },
    { name: 'Harm. Major', intervals: [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1] },
    { name: 'Harm. Minor', intervals: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1] },
    { name: 'Mel. Major', intervals: [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0] },
    { name: 'Mel. Minor', intervals: [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1] },
];

// ──────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────

function createStep() {
    const notes = new Array(96).fill(false);
    notes[60] = true; // Default note: C5
    return {
        active: false,
        notes: notes,
        pitchNote: 60,          // chromatic pitch index (0-95), default C5
        chords: [],
        chordPlayMode: 0,
        chordScale: 0,
        length: 1,
        velocity: 100,
        triplet: false,
        doubleNote: false,
        singleTriplet: false,
        octave: 0
    };
}

function createTrack(index) {
    return {
        pattern: Array.from({ length: 16 }, () => createStep()),
        trackLength: 16,
        midiRoot: 60,
        color: TRACK_COLORS[index],
        colorDim: TRACK_COLORS_DIM[index],
        muted: false,
        tempoModifier: 1,
        channel: index
    };
}

function createScene() {
    return {
        tracks: Array.from({ length: 16 }, (_, i) => createTrack(i))
    };
}

const state = {
    currentStep: 0,
    currentTrack: 0,
    currentScene: 0,
    currentOctave: 5,
    lastPressedStep: 0,
    mode: 'seq', // 'seq', 'chords', or 'harmony'
    smallGridMode: 'length', // 'length', 'velocity', 'octave'
    workspace: 2, // 0: big_grid only, 1: + notes, 2: + small grid
    page: 0, // 0 = tracks 1-8, 1 = tracks 9-16
    playing: false,
    bpm: 120,
    clockSource: 'internal', // 'internal' or 'midi'
    clockTick: -1,
    clockResolution: 6,
    midiNotesQueue: [],
    scenesChain: [],
    currentSceneInChain: -1,
    chainMode: false,
    showCursor: true,
    copyMode: null, // null, 'step', 'track', 'scene'
    copyOrigin: null,
    recordMode: false,      // real-time note recording
    recHeld: false,         // REC button currently held (erase mode)
    lastRecordedPitch: null,// last pitch from inner grid (for recording)
    metronome: false,       // metronome click on each beat
};

// Launchpad physical button state
const lpState = {
    heldBigGridStep: -1,    // which big grid step is currently held (-1 = none)
    shiftHeld: false,       // bottom-right pad [7,7] / note 18
    copyHeld: false,        // top-left pad [0,0] / note 81
    copySourceStep: -1,     // first step pressed while copy is held
    leftShiftHeld: false,   // bottom-left pad [7,0] / note 11
    leftShiftUsed: false,   // set true if LS was used in a combo
};

// ── Harmony State ──
const harmonyState = {
    key: 0,                // 0=C, 1=C#, ... 11=B
    scale: 'major',        // major, natural_minor, harmonic_minor, melodic_minor
    pattern: [],           // 16 chord steps
    selectedStep: 0,       // currently selected step for editing
    selectionPhase: 'function', // 'function', 'degree', 'secondary_target'
    selectedFunction: null,     // temp: function being selected
    rhodes: null,              // RhodesSynth instance
    activeChordNotes: [],      // currently sounding chord notes
    activeChordStep: -1,       // which step is currently sustaining
};

// Initialize 16 harmony steps
for (let i = 0; i < 16; i++) {
    harmonyState.pattern.push({
        active: false,
        function: 'tonic',
        degree: 1,
        quality: 'maj',
        extension: 'triad',
        inversion: 0,
        voiceCount: 4,
        length: 4,
        velocity: 100,
        secondaryTarget: null,
        voicedNotes: [],
    });
}

// ── Chord Field state ──
const chordFieldState = {
    key: 0,                 // 0=C .. 11=B
    modeIndex: 1,           // index into MODE_ORDER: 0=lydian..6=locrian, 1=ionian
    voicingIndex: 0,        // index into VOICING_TYPES
    octaveOffset: 0,        // -2..+2
    rootRotation: 0,        // circle-of-4ths rotation offset
    prevVoicing: null,      // last voiced chord (for voice leading)
    activeNotes: [],        // currently sounding MIDI notes
    glowGrid: null,         // flat 64-element glow array
    lastChordLabel: '',     // display label
    rhodes: null,           // shared or own RhodesSynth
    activePadRow: -1,       // currently pressed pad row
    activePadCol: -1,       // currently pressed pad col
    // Humanization
    velocityMode: 'humanize', // 'fixed' | 'humanize'
    rollMode: 'off',          // 'off' | 'roll' | 'strum'
    rhythmPattern: 0,         // index into CF_RHYTHM_PATTERNS
    rhythmInterval: null,     // setInterval ID for rhythm
    arpMode: 'off',           // 'off' | 'up' | 'down' | 'updown' | 'random'
    arpRate: '8th',           // '8th' | '16th' | 'triplet'
    arpInterval: null,        // setInterval ID for arp
    arpIndex: 0,              // current position in arp sequence
    arpDirection: 1,          // 1 = up, -1 = down (for updown mode)
    arpLastNote: null,        // last arp note played (for cleanup)
    arpNotes: [],             // computed arp note pool
};

let scenes = [createScene(), createScene(), createScene(), createScene()];

// MIDI
let midiAccess = null;
let midiOutput = null;
let midiInput = null;
let launchpadOutput = null;
let clockInterval = null;

// ──────────────────────────────────────────────
// MIDI SETUP
// ──────────────────────────────────────────────

async function initMidi() {
    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: true });
        populateMidiSelects();
        midiAccess.onstatechange = () => populateMidiSelects();
        updateMidiStatus(true);
    } catch (err) {
        console.warn('Web MIDI API not available:', err);
        updateMidiStatus(false);
    }
}

function populateMidiSelects() {
    const outputSelect = document.getElementById('midi-output-select');
    const inputSelect = document.getElementById('midi-input-select');

    const currentOutput = outputSelect.value;
    const currentInput = inputSelect.value;

    outputSelect.innerHTML = '<option value="">None</option>';
    inputSelect.innerHTML = '<option value="">None</option>';

    if (!midiAccess) return;

    for (const [id, output] of midiAccess.outputs) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = output.name;
        outputSelect.appendChild(opt);
    }

    for (const [id, input] of midiAccess.inputs) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = input.name;
        inputSelect.appendChild(opt);
    }

    if (currentOutput) outputSelect.value = currentOutput;
    if (currentInput) inputSelect.value = currentInput;
}

function selectMidiOutput(id) {
    if (!midiAccess || !id) {
        midiOutput = null;
        updateMidiStatus(!!midiAccess);
        return;
    }
    midiOutput = midiAccess.outputs.get(id);
    updateMidiStatus(true);
}

function selectMidiInput(id) {
    if (midiInput) {
        midiInput.onmidimessage = null;
    }
    if (!midiAccess || !id) {
        midiInput = null;
        launchpadOutput = null;
        return;
    }
    midiInput = midiAccess.inputs.get(id);
    midiInput.onmidimessage = handleMidiInput;

    // Auto-detect matching Launchpad output for LED feedback
    launchpadOutput = null;
    const inputName = midiInput.name.toLowerCase();
    if (inputName.includes('launchpad')) {
        for (const [outId, output] of midiAccess.outputs) {
            if (output.name.toLowerCase().includes('launchpad')) {
                launchpadOutput = output;
                console.log(`🎹 Launchpad LED output detected: ${output.name}`);
                // Clear all LEDs first, then sync
                clearLaunchpadLEDs();
                setTimeout(() => updateLaunchpadLEDs(), 100);
                break;
            }
        }
    }
}

function handleMidiInput(event) {
    const [status, data1, data2] = event.data;
    const msgType = status & 0xF0;

    // Raw MIDI debug (diagnose double-triggers)
    if (msgType === 0x90 || msgType === 0x80 || msgType === 0xA0) {
        console.log(`🔧 RAW MIDI: 0x${status.toString(16)} note=${data1} val=${data2}`);
    }

    // ── MIDI Clock: 0xF8 ──
    if (status === 0xF8 && state.clockSource === 'midi') {
        state.clockTick++;
        playSequencer();
    }
    // ── MIDI Start: 0xFA ──
    if (status === 0xFA) {
        state.clockTick = -1;
        state.currentStep = 0;
        state.playing = true;
        updatePlayButton();
    }
    // ── MIDI Stop: 0xFC ──
    if (status === 0xFC) {
        state.playing = false;
        state.clockTick = -1;
        state.currentStep = 0;
        allNotesOff();
        updatePlayButton();
    }

    // ── Launchpad MK2 pad press (Note On with velocity > 0) ──
    // MK2 physical layout: TOP row = notes 81-88, BOTTOM row = notes 11-18
    // Digital grid: row 0 = top, row 7 = bottom
    // So we FLIP: gridRow = 8 - Math.floor(note / 10)
    if (msgType === 0x90 && data2 > 0) {
        // Debounce: ignore duplicate note-on within 80ms (hardware double-trigger)
        const _now = performance.now();
        if (!window._midiNoteDebounce) window._midiNoteDebounce = {};
        if (_now - (window._midiNoteDebounce[data1] || 0) < 80) return;
        window._midiNoteDebounce[data1] = _now;

        console.log(`🎹 MIDI NoteOn: note=${data1} vel=${data2} leftShiftHeld=${lpState.leftShiftHeld}`);
        // Right-side buttons (column 9: notes 19, 29, 39, ..., 89)
        if (data1 % 10 === 9 && data1 >= 19 && data1 <= 89) {
            const btnRow = 8 - Math.floor(data1 / 10);  // 89→0(top), 19→7(bottom)
            if (state.mode === 'chordfield') {
                // In chord field mode, side buttons select voicing type
                handleChordFieldSideButton(btnRow);
                renderGrid();
                console.log(`🎹 LP side button: note=${data1} → voicing ${btnRow}`);
                return;
            }
            if (state.mode === 'harmony') {
                // In harmony mode, side buttons are unused — ignore
                console.log(`🎹 LP harmony mode: side button ignored`);
                return;
            }
            const trackIndex = btnRow + (state.page * 8);
            if (trackIndex < scenes[state.currentScene].tracks.length) {
                console.log(`🎹 LP side button: note=${data1} → track ${trackIndex}`);
                changeTrack(trackIndex);
            }
            return;
        }

        // In chord field mode, bypass all corner/ring logic — full 8×8 grid
        if (state.mode === 'chordfield' && data1 >= 11 && data1 <= 88) {
            const gridRow = 8 - Math.floor(data1 / 10);
            const gridCol = (data1 % 10) - 1;
            if (gridRow >= 0 && gridRow < 8 && gridCol >= 0 && gridCol < 8) {
                console.log(`🎹 LP chordfield pad: note=${data1} → grid[${gridRow},${gridCol}]`);
                handleChordFieldPadPress(gridRow, gridCol);
                return;
            }
        }

        // In harmony mode, bypass corner buttons and sequencer combos —
        // route everything through the ring grid handler
        if (state.mode === 'harmony' && data1 >= 11 && data1 <= 88) {
            const gridRow = 8 - Math.floor(data1 / 10);
            const gridCol = (data1 % 10) - 1;
            if (gridRow >= 0 && gridRow < 8 && gridCol >= 0 && gridCol < 8) {
                console.log(`🎹 LP harmony pad: note=${data1} → grid[${gridRow},${gridCol}]`);
                handlePadPress(gridRow, gridCol, { button: 0 });
                return;
            }
        }

        // ── Special corner buttons ──
        // Top-left pad [0,0] = note 81 → Copy button (hold)
        if (data1 === 81) {
            lpState.copyHeld = true;
            lpState.copySourceStep = -1;
            console.log('🎹 LP Copy button HELD');
            return;
        }
        // Top-right pad [0,7] = note 88 → Tempo modifier cycle
        if (data1 === 88) {
            changeTempo();
            console.log(`🎹 LP Tempo modifier: ${getCurrentTrack().tempoModifier}x`);
            return;
        }
        // Bottom-right pad [7,7] = note 18 → Shift (hold for BPM)
        if (data1 === 18) {
            // LS + RS combo = toggle metronome
            if (lpState.leftShiftHeld) {
                toggleMetronome();
                lpState.leftShiftUsed = true;
                return;
            }
            lpState.shiftHeld = true;
            console.log('🎹 LP Shift button HELD');
            return;
        }
        // Bottom-left pad [7,0] = note 11 → Left Shift
        if (data1 === 11) {
            // RS + LS combo = toggle metronome
            if (lpState.shiftHeld) {
                toggleMetronome();
                return;
            }
            // If record mode ON + playing, hold = erase
            if (state.recordMode && state.playing) {
                state.recHeld = true;
                lpState.leftShiftHeld = true;
                lpState.leftShiftUsed = true;
                console.log('🔴 LP REC held — erasing steps');
                return;
            }
            lpState.leftShiftHeld = true;
            lpState.leftShiftUsed = false;
            console.log('🎹 LP Left Shift button HELD');
            return;
        }

        if (data1 >= 11 && data1 <= 88) {
            const gridRow = 8 - Math.floor(data1 / 10);   // 8→0(top), 1→7(bottom)
            const gridCol = (data1 % 10) - 1;              // 1-8 → 0-7
            if (gridRow >= 0 && gridRow < 8 && gridCol >= 0 && gridCol < 8) {

                // In sample mode, bypass ring-grid logic — use full 8x8 grid
                if (state.mode === 'sample') {
                    console.log(`🎹 LP sample pad: note=${data1} → grid[${gridRow},${gridCol}]`);
                    handlePadPress(gridRow, gridCol, { button: 0 });
                    return;
                }

                const bigIdx = BIG_GRID_POSITIONS.findIndex(([r, c]) => r === gridRow && c === gridCol);

                // ── Left Shift + big grid step = set track length ──
                if (lpState.leftShiftHeld && bigIdx !== -1) {
                    const newLength = bigIdx + 1;
                    changeTrackLength(newLength);
                    lpState.leftShiftUsed = true;
                    console.log(`🎹 LP Track length set to ${newLength}`);
                    return;
                }

                // ── Left Shift + inner grid pad = toggle record mode ──
                const innerIdx = LP_INNER_GRID.indexOf(data1);
                if (lpState.leftShiftHeld && innerIdx !== -1) {
                    state.recordMode = !state.recordMode;
                    lpState.leftShiftUsed = true;
                    console.log(`🔴 Record mode: ${state.recordMode ? 'ON' : 'OFF'}`);
                    if (launchpadOutput) {
                        launchpadOutput.send([0x90, 11, state.recordMode ? 5 : 1]);
                    }
                    renderGrid();
                    return;
                }

                // ── Copy mode: hold Copy + press source, then press destination ──
                if (lpState.copyHeld && bigIdx !== -1) {
                    if (lpState.copySourceStep === -1) {
                        // First press — set source
                        lpState.copySourceStep = bigIdx;
                        state.lastPressedStep = bigIdx;
                        console.log(`🎹 LP Copy source: step ${bigIdx}`);
                        renderGrid();
                    } else {
                        // Second press — execute copy
                        const track = getCurrentTrack();
                        track.pattern[bigIdx] = JSON.parse(JSON.stringify(track.pattern[lpState.copySourceStep]));
                        console.log(`🎹 LP Copy: step ${lpState.copySourceStep} → step ${bigIdx}`);
                        lpState.copySourceStep = -1;
                        renderGrid();
                        updateStepInfo();
                    }
                    return;
                }

                // ── Triplet creation: hold step A, press step B ──
                // A+1 = 16th triplet (3 in 2 sixteenths),  A+4 = 8th triplet (3 in 1 quarter)
                if (bigIdx !== -1 && lpState.heldBigGridStep !== -1 && bigIdx !== lpState.heldBigGridStep) {
                    const stepA = Math.min(lpState.heldBigGridStep, bigIdx);
                    const stepB = Math.max(lpState.heldBigGridStep, bigIdx);
                    const gap = stepB - stepA;

                    if (gap === 1 || gap === 3) {
                        const tripletType = gap === 1 ? '16th' : '8th';
                        const track = getCurrentTrack();
                        if (stepB < track.trackLength) {
                            // Step A = triplet source
                            track.pattern[stepA].active = true;
                            track.pattern[stepA].triplet = true;
                            track.pattern[stepA].tripletType = tripletType;
                            track.pattern[stepA].tripletSpan = gap;
                            track.pattern[stepA].doubleNote = false;
                            track.pattern[stepA].singleTriplet = false;

                            // All steps from A+1 to B are consumed (silent markers)
                            for (let s = stepA + 1; s <= stepB; s++) {
                                track.pattern[s].active = true;
                                track.pattern[s].singleTriplet = true;
                                track.pattern[s].triplet = false;
                                track.pattern[s].doubleNote = false;
                                track.pattern[s].tripletType = null;
                                track.pattern[s].tripletSpan = null;
                            }

                            console.log(`🎹 LP ${tripletType} Triplet created: steps ${stepA}-${stepB}`);
                            state.lastPressedStep = stepA;
                            renderGrid();
                            updateStepInfo();
                            return;
                        }
                    }
                }

                // Track which big grid step is held (for triplet detection)
                if (bigIdx !== -1) {
                    lpState.heldBigGridStep = bigIdx;
                }

                console.log(`🎹 LP pad: note=${data1} → grid[${gridRow},${gridCol}]`);
                handlePadPress(gridRow, gridCol, { button: 0 });
                return;
            }
        }
    }

    // ── Note Off / velocity 0 — release tracking ──
    if (msgType === 0x80 || (msgType === 0x90 && data2 === 0)) {
        // Release copy button
        if (data1 === 81) {
            lpState.copyHeld = false;
            lpState.copySourceStep = -1;
            console.log('🎹 LP Copy button RELEASED');
            return;
        }
        // Release shift button
        if (data1 === 18) {
            lpState.shiftHeld = false;
            console.log('🎹 LP Shift button RELEASED');
            return;
        }
        // Release left shift button
        if (data1 === 11) {
            const wasErasing = state.recHeld;
            state.recHeld = false;
            lpState.leftShiftHeld = false;
            // Toggle record mode only on quick tap (not used for length or erase)
            if (!lpState.leftShiftUsed && !wasErasing) {
                state.recordMode = !state.recordMode;
                console.log(`🔴 Record mode: ${state.recordMode ? 'ON' : 'OFF'}`);
                renderGrid();
            }
            lpState.leftShiftUsed = false;
            console.log('🎹 LP Left Shift button RELEASED');
            return;
        }
        // Release held big grid step
        if (data1 >= 11 && data1 <= 88) {
            const gridRow = 8 - Math.floor(data1 / 10);
            const gridCol = (data1 % 10) - 1;
            const bigIdx = BIG_GRID_POSITIONS.findIndex(([r, c]) => r === gridRow && c === gridCol);
            if (bigIdx !== -1 && bigIdx === lpState.heldBigGridStep) {
                lpState.heldBigGridStep = -1;
            }
        }
    }

    // ── Control Change from Launchpad (top row buttons send CC 104-111) ──
    if (msgType === 0xB0 && data2 > 0) {
        if (data1 >= 104 && data1 <= 111) {
            const buttonIdx = data1 - 104;
            console.log(`🎹 LP top button: CC${data1} → button ${buttonIdx}`);

            // Chord Field mode has its own CC mapping
            if (state.mode === 'chordfield') {
                handleChordFieldCC(buttonIdx);
                return;
            }

            switch (buttonIdx) {
                case 0: // Up arrow
                    if (lpState.shiftHeld) {
                        // Shift + Up = BPM +5
                        state.bpm = Math.min(300, state.bpm + 5);
                        document.getElementById('bpm-input').value = state.bpm;
                        console.log(`🎹 LP BPM: ${state.bpm}`);
                    } else {
                        if (state.currentTrack > 0) changeTrack(state.currentTrack - 1);
                    }
                    break;
                case 1: // Down arrow
                    if (lpState.shiftHeld) {
                        // Shift + Down = BPM -5
                        state.bpm = Math.max(20, state.bpm - 5);
                        document.getElementById('bpm-input').value = state.bpm;
                        console.log(`🎹 LP BPM: ${state.bpm}`);
                    } else {
                        if (state.currentTrack < scenes[state.currentScene].tracks.length - 1) changeTrack(state.currentTrack + 1);
                    }
                    break;
                case 2: // Left arrow — nudge pattern left
                    shiftPatternLeft();
                    break;
                case 3: // Right arrow — nudge pattern right
                    shiftPatternRight();
                    break;
                case 4: // Session — cycle through modes: seq→chords→harmony→sample→chordfield
                    toggleMode();
                    break;
                case 5: // User 1 — page 0 (tracks 1-8)
                    changePage(0);
                    break;
                case 6: // User 2 — page 1 (tracks 9-16)
                    changePage(1);
                    break;
                case 7: // Mixer — toggle play
                    if (state.playing) {
                        state.playing = false;
                        stopInternalClock();
                        allNotesOff();
                    } else {
                        state.playing = true;
                        if (state.clockSource === 'internal') startInternalClock();
                    }
                    updatePlayButton();
                    break;
            }
        }
    }
}

// ══════════════════════════════════════════════════════════
// Launchpad MK2 LED Feedback (matching original Octadre)
// ══════════════════════════════════════════════════════════

// SysEx headers from the original Octadre render.js
const LP_SYSEX_HEADER = [240, 0, 32, 41, 2, 24, 10]; // Set LED
const LP_SYSEX_SET_ALL = [240, 0, 32, 41, 2, 24, 14]; // Set all LEDs
const LP_SYSEX_FLASH = [240, 0, 32, 41, 2, 24, 40, 0]; // Flash LED
const LP_SYSEX_END = 247;

// Original Octadre track colors (MK2 velocity palette)
const LP_TRACK_COLORS = [29, 73, 81, 41, 52, 117, 112, 44, 78, 109, 77, 36, 49, 24, 108, 40];

// Original Octadre color constants
const LP_COLOR = {
    OFF: 0,
    CURSOR: 10,
    ACTIVE_STEP: 3,
    ACTIVE_NOTE: 58,
    NON_ACTIVE_NOTE: 40,
    LENGTH: 8,
    VELOCITY: 116,
    OCTAVE: 16,
    BLINK: 58,
    TRIPLET: 116,
    DOUBLE_NOTE: 44,
    ACTIVE_CHORD: 3,
    ACTIVE_SCENE: 3,
    TONIC: 29,
    SUBDOMINANT: 81,
    DOMINANT: 41,
    SECONDARY: 49,
    WHITE_DIM: 1,
    WHITE: 3,
    WARM_WHITE: 72,
};

// Grid positions as MK2 note values, flipped to match digital grid orientation
// Formula: LP note = (8 - digitalRow) * 10 + (col + 1)
// This ensures digital row 0 (top of screen) = MK2 row 8 (top of controller)
const LP_BIG_GRID = [84, 73, 62, 51, 41, 32, 23, 14, 15, 26, 37, 48, 58, 67, 76, 85];
const LP_INNER_GRID = [74, 63, 52, 42, 33, 24, 25, 36, 47, 57, 66, 75];
const LP_SMALL_GRID = [64, 53, 43, 34, 35, 46, 56, 65];
const LP_MUTE_BUTTONS = [89, 79, 69, 59, 49, 39, 29, 19]; // track 0=top(89), track 7=bottom(19)
// Center 4 scene buttons: [3,3]=54, [3,4]=55, [4,3]=44, [4,4]=45
const LP_SCENE_BUTTONS = [54, 55, 44, 45];

function clearLaunchpadLEDs() {
    if (!launchpadOutput) return;
    // Send Note On with velocity 0 to every pad (turns off LEDs)
    for (let lpRow = 1; lpRow <= 8; lpRow++) {
        for (let lpCol = 1; lpCol <= 9; lpCol++) { // 1-8 grid + 9 side
            launchpadOutput.send([0x90, lpRow * 10 + lpCol, 0]);
        }
    }
}

// Pre-compute lookup tables (avoid rebuilding every render)
const _bigSet = new Set(LP_BIG_GRID);
const _innerSet = new Set(LP_INNER_GRID);
const _smallSet = new Set(LP_SMALL_GRID);
const _sceneSet = new Set(LP_SCENE_BUTTONS);
const _bigLookup = {};
LP_BIG_GRID.forEach((note, i) => _bigLookup[note] = i);
const _innerLookup = {};
LP_INNER_GRID.forEach((note, i) => _innerLookup[note] = i);
const _smallLookup = {};
LP_SMALL_GRID.forEach((note, i) => _smallLookup[note] = i);
const _muteLookup = {};
LP_MUTE_BUTTONS.forEach((note, i) => _muteLookup[note] = i);
const _sceneLookup = {};
LP_SCENE_BUTTONS.forEach((note, i) => _sceneLookup[note] = i);

function updateLaunchpadLEDs() {
    if (!launchpadOutput) return;

    const track = getCurrentTrack();
    const trackColor = LP_TRACK_COLORS[state.currentTrack % LP_TRACK_COLORS.length];

    // Use Note On (0x90) for each pad — the MK2 sets LED color from velocity
    // This is simpler and more reliable than SysEx batches
    for (let lpRow = 1; lpRow <= 8; lpRow++) {
        for (let lpCol = 1; lpCol <= 8; lpCol++) {
            const note = lpRow * 10 + lpCol;
            let color = LP_COLOR.OFF;
            // ── Chord Field & Harmony: use full 8×8 grid, skip corner logic ──
            if (state.mode === 'chordfield') {
                const digitalRow = 8 - lpRow;
                const digitalCol = lpCol - 1;
                color = getChordFieldLPColor(digitalRow, digitalCol);
            } else if (state.mode === 'harmony' &&
                (note === 81 || note === 88 || note === 18 || note === 11)) {
                // Harmony mode corners are OFF
                color = LP_COLOR.OFF;
            } else if (note === 81) {
                // Special corner buttons — only in sequencer/chords/sample modes
                color = (lpState.copyHeld ? LP_COLOR.WHITE : LP_COLOR.WHITE_DIM);
            } else if (note === 88) {
                color = LP_COLOR.DOUBLE_NOTE;
            } else if (note === 18) {
                color = (lpState.shiftHeld ? LP_COLOR.WHITE : LP_COLOR.WHITE_DIM);
            } else if (note === 11) {
                color = (state.recordMode ? 5 : (lpState.leftShiftHeld ? LP_COLOR.WHITE : LP_COLOR.WHITE_DIM));
            } else
                if (state.mode === 'sample') {
                    // Sample mode: full 8×8 grid (bypass ring layout)
                    // Convert LP note to digital row/col
                    // LP row 8 (top) = digital row 0, LP row 1 (bottom) = digital row 7
                    const digitalRow = 8 - lpRow;
                    const digitalCol = lpCol - 1;
                    // Skip corners (handled above: 81, 88, 11, 18)
                    if (!(digitalRow === 0 && digitalCol === 0) && !(digitalRow === 0 && digitalCol === 7) &&
                        !(digitalRow === 7 && digitalCol === 0) && !(digitalRow === 7 && digitalCol === 7)) {
                        color = getSampleEditLPColor(digitalRow, digitalCol, state.currentTrack);
                    }
                } else if (_sceneSet.has(note)) {
                    // Scene buttons — always visible, regardless of workspace
                    const si = _sceneLookup[note];
                    color = (si === state.currentScene) ? LP_COLOR.ACTIVE_SCENE : LP_COLOR.WHITE_DIM;
                } else if (_bigSet.has(note)) {
                    const i = _bigLookup[note];
                    if (state.mode === 'seq') {
                        color = getSeqBigPadColor(i, track, trackColor);
                    } else if (state.mode === 'harmony') {
                        color = getHarmonyBigPadColor(i);
                    } else {
                        color = trackColor;
                    }
                } else if (_innerSet.has(note) && (state.workspace > 0 || state.mode === 'harmony')) {
                    const i = _innerLookup[note];
                    if (state.mode === 'seq') {
                        color = getSeqInnerPadColor(i, track);
                    } else if (state.mode === 'harmony') {
                        color = getHarmonyInnerPadColor(i);
                    } else {
                        color = LP_COLOR.NON_ACTIVE_NOTE;
                    }
                } else if (_smallSet.has(note) && (state.workspace > 1 || state.mode === 'harmony')) {
                    const i = _smallLookup[note];
                    if (state.mode === 'seq') {
                        color = getSeqSmallPadColor(i, track);
                    } else if (state.mode === 'harmony') {
                        color = getHarmonySmallPadColor(i);
                    }
                }

            // Note On ch1: sets LED color via velocity palette
            launchpadOutput.send([0x90, note, color]);
        }

        // Side button for this row (column 9)
        const sideNote = lpRow * 10 + 9;
        if (_muteLookup[sideNote] !== undefined) {
            const i = _muteLookup[sideNote];
            let sideColor = LP_COLOR.OFF;

            if (state.mode === 'chordfield') {
                sideColor = getChordFieldSideLPColor(i);
            } else if (state.mode === 'harmony') {
                // Harmony mode: side buttons unused — keep dark
                sideColor = LP_COLOR.OFF;
            } else {
                const allTracks = scenes[state.currentScene].tracks;
                const trackIdx = i + (state.page * 8);
                if (trackIdx < allTracks.length) {
                    const t = allTracks[trackIdx];
                    const tColor = LP_TRACK_COLORS[trackIdx % LP_TRACK_COLORS.length];
                    if (trackIdx === state.currentTrack) {
                        sideColor = LP_COLOR.WHITE;
                    } else {
                        sideColor = t.muted ? LP_COLOR.OFF : tColor;
                    }
                }
            }
            launchpadOutput.send([0x90, sideNote, sideColor]);
        }
    }

    // Flash the selected step using SysEx (only SysEx supports flash mode)
    if (state.mode === 'seq' && state.lastPressedStep < LP_BIG_GRID.length) {
        const step = track.pattern[state.lastPressedStep];
        let flashColor;
        if (step.triplet || step.singleTriplet) flashColor = LP_COLOR.TRIPLET;
        else if (step.doubleNote) flashColor = LP_COLOR.DOUBLE_NOTE;
        else flashColor = step.active ? LP_COLOR.ACTIVE_STEP : trackColor;

        const flashMsg = LP_SYSEX_FLASH.concat([LP_BIG_GRID[state.lastPressedStep], flashColor, LP_SYSEX_END]);
        launchpadOutput.send(flashMsg);
    }

    // ── Top row CC button LEDs ──
    // CC 104-111: Up, Down, Left, Right, Session, User1, User2, Mixer
    if (state.mode === 'chordfield') {
        // In chord field mode: arrows=dim, Session=bright green, User1/2=mode brightness indicators
        const modeIdx = chordFieldState.modeIndex; // 0=brightest(Lydian) to 6=darkest(Locrian)
        // User1 (brighter) lights up if we can go brighter
        const user1Color = modeIdx > 0 ? LP_COLOR.WHITE : LP_COLOR.WHITE_DIM;
        // User2 (darker) lights up if we can go darker
        const user2Color = modeIdx < 6 ? LP_COLOR.WHITE : LP_COLOR.WHITE_DIM;
        launchpadOutput.send([0xB0, 104, LP_COLOR.WHITE_DIM]); // Up (octave)
        launchpadOutput.send([0xB0, 105, LP_COLOR.WHITE_DIM]); // Down (octave)
        launchpadOutput.send([0xB0, 106, LP_COLOR.WHITE_DIM]); // Left (key)
        launchpadOutput.send([0xB0, 107, LP_COLOR.WHITE_DIM]); // Right (key)
        launchpadOutput.send([0xB0, 108, 21]);  // Session — green (active mode indicator)
        launchpadOutput.send([0xB0, 109, user1Color]); // User1 (brighter mode)
        launchpadOutput.send([0xB0, 110, user2Color]); // User2 (darker mode)
        launchpadOutput.send([0xB0, 111, LP_COLOR.WHITE_DIM]); // Mixer (root rotation)
    } else {
        // Normal sequencer mode top-button LEDs
        launchpadOutput.send([0xB0, 104, LP_COLOR.WHITE_DIM]); // Up
        launchpadOutput.send([0xB0, 105, LP_COLOR.WHITE_DIM]); // Down
        launchpadOutput.send([0xB0, 106, LP_COLOR.WHITE_DIM]); // Left
        launchpadOutput.send([0xB0, 107, LP_COLOR.WHITE_DIM]); // Right
        launchpadOutput.send([0xB0, 108, state.workspace === 0 ? LP_COLOR.WHITE : (state.workspace === 1 ? LP_COLOR.WARM_WHITE : LP_COLOR.ACTIVE_STEP)]); // Session
        launchpadOutput.send([0xB0, 109, state.page === 0 ? LP_COLOR.WHITE : LP_COLOR.WHITE_DIM]); // User1
        launchpadOutput.send([0xB0, 110, state.page === 1 ? LP_COLOR.WHITE : LP_COLOR.WHITE_DIM]); // User2
        launchpadOutput.send([0xB0, 111, state.playing ? 21 : LP_COLOR.WHITE_DIM]); // Mixer (play)
    }
}

// ── Sequencer LED color helpers (matching original Octadre render.js) ──

function getSeqBigPadColor(stepIndex, track, trackColor) {
    const step = track.pattern[stepIndex];

    // Out of range steps are off
    if (stepIndex >= track.trackLength) return LP_COLOR.OFF;

    // Cursor (current playback position) — matches digital version
    if (state.playing && state.showCursor) {
        const currentTrackStep = Math.floor(state.currentStep * track.tempoModifier) % track.trackLength;
        if (stepIndex === currentTrackStep) return LP_COLOR.CURSOR;
    }

    // Active step types (matching original: triplet > doubleNote > active > track color)
    if (step.triplet || step.singleTriplet) return LP_COLOR.TRIPLET;
    if (step.doubleNote) return LP_COLOR.DOUBLE_NOTE;
    if (step.active) return LP_COLOR.ACTIVE_STEP;

    // Inactive step within range: shows track color
    return trackColor;
}

function getSeqInnerPadColor(noteOffset, track) {
    const noteIndex = (state.currentOctave * 12) + noteOffset;
    const step = track.pattern[state.lastPressedStep];

    // Single active pitch — red if this is the selected pitch
    if (step.pitchNote === noteIndex) {
        return 5; // LP red
    }
    return LP_COLOR.NON_ACTIVE_NOTE;
}

function getSeqSmallPadColor(gridIndex, track) {
    const step = track.pattern[state.lastPressedStep];

    if (state.smallGridMode === 'length') {
        return gridIndex < step.length / 2 ? LP_COLOR.LENGTH : LP_COLOR.OFF;
    } else if (state.smallGridMode === 'velocity') {
        const mappedValue = (step.velocity * 8) / 127;
        return gridIndex < mappedValue ? LP_COLOR.VELOCITY : LP_COLOR.OFF;
    } else if (state.smallGridMode === 'octave') {
        return gridIndex === state.currentOctave ? LP_COLOR.OCTAVE : LP_COLOR.OFF;
    }
    return LP_COLOR.OFF;
}

// ── Harmony LED color helpers ──

function getHarmonyBigPadColor(stepIndex) {
    const step = harmonyState.pattern[stepIndex];
    if (!step.active) {
        return stepIndex === harmonyState.selectedStep ? LP_COLOR.WHITE_DIM : LP_COLOR.OFF;
    }

    // Playing cursor
    if (state.playing && state.showCursor) {
        if (stepIndex === state.currentStep % 16) return LP_COLOR.CURSOR;
    }

    const funcColors = {
        tonic: LP_COLOR.TONIC,
        predominant: LP_COLOR.SUBDOMINANT,
        dominant: LP_COLOR.DOMINANT,
        secondary: LP_COLOR.SECONDARY
    };
    const color = funcColors[step.function] || LP_COLOR.NON_ACTIVE_NOTE;

    // Selected step flashes (handled by flash SysEx), show base color
    if (stepIndex === harmonyState.selectedStep) return LP_COLOR.ACTIVE_NOTE;
    return color;
}

function getHarmonyInnerPadColor(innerIdx) {
    const step = harmonyState.pattern[harmonyState.selectedStep];
    if (!step) return LP_COLOR.OFF;

    const phase = harmonyState.selectionPhase;

    if (phase === 'function') {
        // Row 1 (idx 0-3): Function selectors
        if (innerIdx < 4) {
            const funcs = ['tonic', 'predominant', 'dominant', 'secondary'];
            const funcColors = [LP_COLOR.TONIC, LP_COLOR.SUBDOMINANT, LP_COLOR.DOMINANT, LP_COLOR.SECONDARY];
            if (innerIdx < funcs.length) {
                return (step.active && step.function === funcs[innerIdx])
                    ? LP_COLOR.ACTIVE_NOTE : LP_COLOR.NON_ACTIVE_NOTE;
            }
        }
        // Row 2 (idx 4-7): Degree selectors
        if (innerIdx < 8) {
            const he = window.harmonyEngine;
            const degrees = he.getDegreesForFunction(step.function, harmonyState.scale);
            const degreeIdx = innerIdx - 4;
            if (degreeIdx < degrees.length) {
                return (step.active && step.degree === degrees[degreeIdx])
                    ? LP_COLOR.ACTIVE_NOTE : LP_COLOR.NON_ACTIVE_NOTE;
            }
        }
        // Row 3 (idx 8-11): Extension selectors
        if (innerIdx < 12) {
            const extMap = ['triad', '7th', '9th', 'sus'];
            const extIdx = innerIdx - 8;
            if (extIdx < extMap.length) {
                return (step.active && step.extension === extMap[extIdx])
                    ? LP_COLOR.ACTIVE_NOTE : LP_COLOR.NON_ACTIVE_NOTE;
            }
        }
    }
    return LP_COLOR.OFF;
}

function getHarmonySmallPadColor(smallIdx) {
    const step = harmonyState.pattern[harmonyState.selectedStep];
    if (!step || !step.active) return LP_COLOR.OFF;

    // SmallIdx 0-1: Voices ±, 2-3: Length ±, 4-5: Inversion ±, 6-7: controls
    const controlColors = [
        LP_COLOR.LENGTH, LP_COLOR.LENGTH,       // Vox -, Vox +
        LP_COLOR.VELOCITY, LP_COLOR.VELOCITY,   // Len -, Len +
        LP_COLOR.OCTAVE, LP_COLOR.OCTAVE,       // Inv -, Inv +
        LP_COLOR.NON_ACTIVE_NOTE, LP_COLOR.NON_ACTIVE_NOTE
    ];
    return controlColors[smallIdx] || LP_COLOR.OFF;
}

function updateMidiStatus(available) {
    const el = document.getElementById('midi-status');
    if (available && midiOutput) {
        el.className = 'midi-status connected';
        el.querySelector('.status-text').textContent = midiOutput.name;
    } else if (available) {
        el.className = 'midi-status connected';
        el.querySelector('.status-text').textContent = 'MIDI Ready';
    } else {
        el.className = 'midi-status disconnected';
        el.querySelector('.status-text').textContent = 'No MIDI';
    }
}

// ──────────────────────────────────────────────
// MIDI OUTPUT
// ──────────────────────────────────────────────

function sendNoteOn(note, velocity, channel) {
    if (!midiOutput) return;
    midiOutput.send([0x90 | (channel & 0xF), note & 0x7F, velocity & 0x7F]);
}

function sendNoteOff(note, channel) {
    if (!midiOutput) return;
    midiOutput.send([0x80 | (channel & 0xF), note & 0x7F, 0]);
}

function sendCC(cc, value, channel) {
    if (!midiOutput) return;
    midiOutput.send([0xB0 | (channel & 0xF), cc & 0x7F, value & 0x7F]);
}

function allNotesOff() {
    if (!midiOutput) return;
    for (let ch = 0; ch < 16; ch++) {
        midiOutput.send([0xB0 | ch, 123, 0]); // All Notes Off CC
    }
    state.midiNotesQueue = [];
}

// ──────────────────────────────────────────────
// CLOCK & PLAYBACK
// ──────────────────────────────────────────────

function startInternalClock() {
    stopInternalClock();
    // MIDI clock sends 24 PPQN (pulses per quarter note)
    // We use clockResolution = 6 ticks per step (= 24/4 for 16th notes)
    const tickMs = (60000 / state.bpm) / 24;
    clockInterval = setInterval(() => {
        if (!state.playing) return;
        state.clockTick++;
        playSequencer();
    }, tickMs);
}

function stopInternalClock() {
    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }
}

function updateClockTempo() {
    if (state.clockSource === 'internal' && state.playing) {
        startInternalClock();
    }
}

function togglePlay() {
    state.playing = !state.playing;
    if (state.playing) {
        state.clockTick = -1;
        state.currentStep = 0;
        if (state.clockSource === 'internal') {
            startInternalClock();
        }
    } else {
        stopInternalClock();
        allNotesOff();
        if (window.audioEngine) window.audioEngine.stopAll();
        state.currentStep = 0;
        state.clockTick = -1;
        renderGrid();
    }
    updatePlayButton();
}

function stop() {
    state.playing = false;
    stopInternalClock();
    allNotesOff();
    if (window.audioEngine) window.audioEngine.stopAll();
    state.currentStep = 0;
    state.clockTick = -1;
    window._lastTriggeredStep = {};
    window._lastMidiStep = {};
    updatePlayButton();
    renderGrid();
}

function updatePlayButton() {
    const btn = document.getElementById('btn-play');
    if (state.playing) {
        btn.classList.add('active');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><rect x="5" y="3" width="5" height="18" fill="currentColor"/><rect x="14" y="3" width="5" height="18" fill="currentColor"/></svg>';
    } else {
        btn.classList.remove('active');
        btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><polygon points="5,3 19,12 5,21" fill="currentColor"/></svg>';
    }
}

// ──────────────────────────────────────────────
// SEQUENCER ENGINE
// ──────────────────────────────────────────────

function playSequencer() {
    if (state.clockTick % state.clockResolution === 0) {
        // Send note-offs for expired notes
        processNoteOffs();
        // Queue new notes
        queueMidiNotes();
        // Trigger audio samples
        triggerAudioSamples();
        // Trigger harmony chords
        triggerHarmonyChords();
        // Metronome click on quarter notes (every 4 steps)
        if (state.metronome && state.currentStep % 4 === 0) {
            const beat = (state.currentStep / 4) % 4;
            playMetronomeClick(beat === 0);
        }
        // Live erase: hold REC button to clear steps as sequencer passes
        if (state.recordMode && state.recHeld && state.playing) {
            const track = getCurrentTrack();
            const playingStep = Math.floor(state.currentStep * track.tempoModifier) % track.trackLength;
            track.pattern[playingStep].active = false;
            track.pattern[playingStep].pitchNote = null;
            track.pattern[playingStep].triplet = false;
            track.pattern[playingStep].doubleNote = false;
            track.pattern[playingStep].singleTriplet = false;
        }
        state.currentStep++;
        renderGrid();
    }
    // Send any pending note-ons
    processNoteOns();
    // Clean up expired notes
    cleanupNoteQueue();
}

// Synthesized metronome click using oscillator
function playMetronomeClick(isDownbeat) {
    const ctx = window.audioEngine?.audioContext;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = isDownbeat ? 1500 : 1000;  // higher pitch on beat 1

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);  // bypass compressor — always audible

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.05);
}

function toggleMetronome() {
    state.metronome = !state.metronome;
    const btn = document.getElementById('btn-metronome');
    if (btn) btn.classList.toggle('active', state.metronome);
    console.log(`🔔 Metronome: ${state.metronome ? 'ON' : 'OFF'}`);
}

function triggerAudioSamples() {
    if (!window.audioEngine || !window.audioEngine.initialized) return;

    const sceneIndex = getPlayingScene();
    const scene = scenes[sceneIndex];
    const tickMs = (60000 / state.bpm) / 24;  // ms per MIDI tick

    scene.tracks.forEach((track, trackIndex) => {
        const trackStep = Math.floor(state.currentStep * track.tempoModifier);
        const stepIndex = trackStep % track.trackLength;

        // Skip if this track step hasn't changed (prevents re-trigger at half tempo)
        if (!window._lastTriggeredStep) window._lastTriggeredStep = {};
        if (window._lastTriggeredStep[trackIndex] === trackStep) return;
        window._lastTriggeredStep[trackIndex] = trackStep;

        const step = track.pattern[stepIndex];
        if (!step || !step.active || track.muted || !window.audioEngine.hasSample(trackIndex)) return;

        // Skip if this track was just auditioned (prevents double-trigger during recording)
        const lastAudition = _auditionDebounce.get(trackIndex) || 0;
        if (performance.now() - lastAudition < 100) return;

        // singleTriplet steps are silent — the triplet step already covers both
        if (step.singleTriplet) return;

        if (step.triplet) {
            // 16th triplet: spacing=4 ticks (3 in 12 ticks), 8th triplet: spacing=8 ticks (3 in 24 ticks)
            const ticks = step.tripletType === '8th' ? 8 : 4;
            const spacingMs = (ticks / track.tempoModifier) * tickMs;
            const pitch = getStepPitchMultiplier(step);
            if (pitch !== null) {
                window.audioEngine.playSampleAtPitch(trackIndex, step.velocity, pitch);
                setTimeout(() => window.audioEngine.playSampleAtPitch(trackIndex, step.velocity, pitch), spacingMs);
                setTimeout(() => window.audioEngine.playSampleAtPitch(trackIndex, step.velocity, pitch), spacingMs * 2);
            } else {
                window.audioEngine.playSample(trackIndex, step.velocity);
                setTimeout(() => window.audioEngine.playSample(trackIndex, step.velocity), spacingMs);
                setTimeout(() => window.audioEngine.playSample(trackIndex, step.velocity), spacingMs * 2);
            }
        } else {
            const pitch = getStepPitchMultiplier(step);
            if (pitch !== null) {
                window.audioEngine.playSampleAtPitch(trackIndex, step.velocity, pitch);
            } else {
                window.audioEngine.playSample(trackIndex, step.velocity);
            }
        }
    });
}

// Get pitch multiplier for a step (null = use default sample pitch)
function getStepPitchMultiplier(step) {
    if (step.pitchNote == null) return null;
    const semitones = step.pitchNote - 60; // C5 = original pitch
    return Math.pow(2, semitones / 12);
}

function queueMidiNotes() {
    const sceneIndex = getPlayingScene();
    const scene = scenes[sceneIndex];
    scene.tracks.forEach((track, trackIndex) => {
        const trackStep = Math.floor(state.currentStep * track.tempoModifier);
        const stepIndex = trackStep % track.trackLength;

        // Skip if this track step hasn't changed (prevents re-trigger at half tempo)
        if (!window._lastMidiStep) window._lastMidiStep = {};
        if (window._lastMidiStep[trackIndex] === trackStep) return;
        window._lastMidiStep[trackIndex] = trackStep;

        const step = track.pattern[stepIndex];
        if (step && step.active && !track.muted) {
            queueStep(track, step);
            queueChords(track, step);
        }
    });
}

function queueStep(track, step) {
    step.notes.forEach((active, noteIndex) => {
        if (active) {
            addToQueue(step, track, noteIndex, state.clockTick);
        }
    });
}

function queueChords(track, step) {
    // Chord playback would be implemented here
    // For now, we focus on the step sequencer
}

function addToQueue(step, track, note, clockTick) {
    if (step.triplet) {
        // 16th triplet: 3 notes across 12 ticks (spacing=4), 8th triplet: 3 notes across 24 ticks (spacing=8)
        const ticks = step.tripletType === '8th' ? 8 : 4;
        const spacing = ticks / track.tempoModifier;
        const noteLen = spacing;
        state.midiNotesQueue.push({ clockTick, length: noteLen, note, channel: track.channel, velocity: step.velocity });
        state.midiNotesQueue.push({ clockTick: clockTick + spacing, length: noteLen, note, channel: track.channel, velocity: step.velocity });
        state.midiNotesQueue.push({ clockTick: clockTick + spacing * 2, length: noteLen, note, channel: track.channel, velocity: step.velocity });
    } else if (step.singleTriplet) {
        // singleTriplet is just a visual marker — the triplet step (A) already
        // plays all 3 notes spanning both steps. Don't play anything here.
        return;
    } else if (step.doubleNote) {
        const len = 4 / track.tempoModifier;
        state.midiNotesQueue.push({ clockTick, length: len, note, channel: track.channel, velocity: step.velocity });
        state.midiNotesQueue.push({ clockTick: clockTick + 3 / track.tempoModifier, length: len, note, channel: track.channel, velocity: step.velocity });
    } else {
        state.midiNotesQueue.push({ clockTick, length: step.length / track.tempoModifier, note, channel: track.channel, velocity: step.velocity });
    }
}

function processNoteOns() {
    state.midiNotesQueue.forEach(e => {
        if (state.clockTick === e.clockTick && !e.sent) {
            sendNoteOn(e.note, e.velocity, e.channel);
            e.sent = true;
        }
    });
}

function processNoteOffs() {
    state.midiNotesQueue.forEach(e => {
        if (e.sent && state.clockTick - e.clockTick >= e.length * state.clockResolution) {
            sendNoteOff(e.note, e.channel);
            e.done = true;
        }
    });
}

function cleanupNoteQueue() {
    state.midiNotesQueue = state.midiNotesQueue.filter(e => !e.done);
}

function getPlayingScene() {
    if (state.chainMode && state.scenesChain.length > 0) {
        const stepsPerCycle = 16;
        if (state.currentStep % stepsPerCycle === 0) {
            state.currentSceneInChain++;
            const sceneIndex = state.scenesChain[state.currentSceneInChain % state.scenesChain.length];
            state.currentScene = sceneIndex;
            renderSceneButtons();
        }
    }
    return state.currentScene;
}

// ──────────────────────────────────────────────
// GRID INTERACTION
// ──────────────────────────────────────────────

function getCurrentTrack() {
    return scenes[state.currentScene].tracks[state.currentTrack];
}

function toggleStep(stepIndex) {
    const track = getCurrentTrack();
    if (stepIndex >= track.trackLength) return;

    // If this step is part of a triplet group, clear the entire group
    if (track.pattern[stepIndex].triplet) {
        // This is step A — clear it and all consumed steps
        const span = track.pattern[stepIndex].tripletSpan || 1;
        track.pattern[stepIndex].active = false;
        track.pattern[stepIndex].triplet = false;
        track.pattern[stepIndex].tripletType = null;
        track.pattern[stepIndex].tripletSpan = null;
        for (let s = stepIndex + 1; s <= stepIndex + span && s < 16; s++) {
            track.pattern[s].active = false;
            track.pattern[s].singleTriplet = false;
        }
        state.lastPressedStep = stepIndex;
        renderGrid();
        updateStepInfo();
        return;
    }
    if (track.pattern[stepIndex].singleTriplet) {
        // This is a consumed step — find step A (scan backwards)
        track.pattern[stepIndex].active = false;
        track.pattern[stepIndex].singleTriplet = false;
        // Find the triplet source step
        for (let s = stepIndex - 1; s >= 0; s--) {
            if (track.pattern[s].triplet) {
                const span = track.pattern[s].tripletSpan || 1;
                track.pattern[s].active = false;
                track.pattern[s].triplet = false;
                track.pattern[s].tripletType = null;
                track.pattern[s].tripletSpan = null;
                // Clear all consumed steps in the group
                for (let c = s + 1; c <= s + span && c < 16; c++) {
                    track.pattern[c].active = false;
                    track.pattern[c].singleTriplet = false;
                }
                break;
            }
        }
        state.lastPressedStep = stepIndex;
        renderGrid();
        updateStepInfo();
        return;
    }

    track.pattern[stepIndex].active = !track.pattern[stepIndex].active;
    track.pattern[stepIndex].doubleNote = false;
    track.pattern[stepIndex].singleTriplet = false;
    state.lastPressedStep = stepIndex;
    renderGrid();
    updateStepInfo();
}

function toggleNote(noteOffset) {
    const track = getCurrentTrack();
    const trackIndex = scenes[state.currentScene].tracks.indexOf(track);
    const noteIndex = (state.currentOctave * 12) + noteOffset;
    if (noteIndex >= 96) return;

    const step = track.pattern[state.lastPressedStep];

    // Always set the new pitch (no toggle-off)
    step.pitchNote = noteIndex;

    // Audition: play the sample at this pitch
    auditionPitch(trackIndex, noteIndex);

    // Record mode: write to current playing step
    if (state.recordMode && state.playing) {
        const playingStep = Math.floor(state.currentStep * track.tempoModifier) % track.trackLength;
        track.pattern[playingStep].active = true;
        track.pattern[playingStep].pitchNote = noteIndex;
    }
    // Always remember last pitch for overdub
    state.lastRecordedPitch = noteIndex;

    renderGrid();
    updateStepInfo();
}

// Play a sample at a chromatic pitch offset
// noteIndex 60 = original pitch (C5), each semitone = 2^(1/12)
const _auditionDebounce = new Map();
function auditionPitch(trackIndex, noteIndex) {
    if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) return;

    // Debounce: prevent double-triggers within 50ms
    const now = performance.now();
    const lastTime = _auditionDebounce.get(trackIndex) || 0;
    if (now - lastTime < 50) return;
    _auditionDebounce.set(trackIndex, now);

    // Reference: noteIndex 60 (C5) = original sample pitch (1.0)
    const semitones = noteIndex - 60;
    const pitchMultiplier = Math.pow(2, semitones / 12);
    window.audioEngine.playSampleAtPitch(trackIndex, 127, pitchMultiplier);
}

function handleSmallGridPress(gridIndex) {
    const track = getCurrentTrack();
    const step = track.pattern[state.lastPressedStep];

    if (state.smallGridMode === 'length') {
        const newLength = (gridIndex + 1) * 2 - 1;
        step.length = step.length === newLength ? (newLength % 2 === 1 ? newLength + 1 : newLength - 1) : newLength;
    } else if (state.smallGridMode === 'velocity') {
        step.velocity = Math.round((127 / 8) * (gridIndex + 1));
    } else if (state.smallGridMode === 'octave') {
        state.currentOctave = gridIndex;
    }

    renderGrid();
    updateStepInfo();
}

function changeScene(sceneIndex) {
    state.currentScene = sceneIndex;
    state.chainMode = false;
    state.scenesChain = [];
    state.currentSceneInChain = 0;
    renderAll();
}

function changeTrack(trackIndex) {
    state.currentTrack = trackIndex;
    renderAll();
}

function toggleMute(trackIndex) {
    scenes[state.currentScene].tracks[trackIndex].muted = !scenes[state.currentScene].tracks[trackIndex].muted;
    renderTrackList();
    renderSideButtons();
}

function changeTempo() {
    const track = getCurrentTrack();
    const tempos = [1, 0.5, 0.25, 0.125];
    const idx = tempos.indexOf(track.tempoModifier);
    track.tempoModifier = tempos[(idx + 1) % tempos.length];
    renderAll();
}

function changeTrackLength(length) {
    const track = getCurrentTrack();
    track.trackLength = Math.max(1, Math.min(16, length));
    renderGrid();
    updateStepInfo();
}

function shiftPatternRight() {
    const track = getCurrentTrack();
    const last = track.pattern.pop();
    track.pattern.unshift(last);
    renderGrid();
}

function shiftPatternLeft() {
    const track = getCurrentTrack();
    const first = track.pattern.shift();
    track.pattern.push(first);
    renderGrid();
}

function randomPattern() {
    const track = getCurrentTrack();
    const len = Math.floor(Math.random() * 16) + 1;
    track.trackLength = len;
    for (let i = 0; i < 16; i++) {
        track.pattern[i].active = i < len && Math.random() > 0.5;
    }
    renderGrid();
    document.getElementById('track-length-slider').value = len;
    document.getElementById('track-length-value').textContent = len;
}

function clearPattern() {
    if (state.mode === 'harmony') {
        // Clear all harmony steps
        harmonyState.pattern.forEach(step => {
            step.active = false;
            step.function = 'tonic';
            step.degree = 1;
            step.extension = 'triad';
            step.inversion = 0;
            step.voiceCount = 4;
            step.length = 4;
            step.voicedNotes = [];
        });
        if (harmonyState.rhodes) harmonyState.rhodes.allNotesOff();
        recomputeHarmony();
        renderGrid();
        updateHarmonyUI();
        return;
    }
    const track = getCurrentTrack();
    track.pattern.forEach(step => {
        step.active = false;
        step.triplet = false;
        step.doubleNote = false;
        step.singleTriplet = false;
    });
    renderGrid();
}

function cycleSmallGridMode(direction) {
    const modes = ['length', 'velocity', 'octave'];
    const idx = modes.indexOf(state.smallGridMode);
    state.smallGridMode = modes[(idx + (direction === 'up' ? 1 : modes.length - 1)) % modes.length];
    renderGrid();
    updateStepInfo();
}

function setMode(mode) {
    state.mode = mode;
    document.getElementById('btn-mode-seq').classList.toggle('active', mode === 'seq');
    document.getElementById('btn-mode-chords').classList.toggle('active', mode === 'chords');
    document.getElementById('btn-mode-harmony').classList.toggle('active', mode === 'harmony');
    document.getElementById('btn-mode-sample').classList.toggle('active', mode === 'sample');
    document.getElementById('btn-mode-chordfield').classList.toggle('active', mode === 'chordfield');

    // Show/hide harmony controls
    const harmonyControls = document.getElementById('harmony-controls');
    if (harmonyControls) {
        harmonyControls.classList.toggle('hidden', mode !== 'harmony');
    }

    // Show/hide chord field controls
    const cfControls = document.getElementById('chordfield-controls');
    if (cfControls) {
        cfControls.classList.toggle('hidden', mode !== 'chordfield');
    }

    // Stop chord field playback when switching away
    if (mode !== 'chordfield' && typeof cfStopPlayback === 'function') {
        cfStopPlayback(chordFieldState);
        chordFieldState.activeNotes = [];
    }

    // Initialize Rhodes on first harmony/chordfield mode entry
    if (mode === 'harmony' && !harmonyState.rhodes) {
        initRhodes();
    }
    if (mode === 'chordfield') {
        initChordFieldRhodes();
    }

    renderGrid();
    if (mode === 'harmony') updateHarmonyUI();
    if (mode === 'chordfield') updateChordFieldUI();

    // Auto-expand/collapse the sample editor panel
    const editor = document.getElementById('sample-editor');
    if (editor) {
        if (mode === 'sample') {
            editor.classList.remove('collapsed');
            updateSampleEditor();
        }
    }
}

function toggleMode() {
    const modes = ['seq', 'chords', 'harmony', 'sample', 'chordfield'];
    const currentIdx = modes.indexOf(state.mode);
    setMode(modes[(currentIdx + 1) % modes.length]);
}

function changePage(page) {
    state.page = page;
    state.currentTrack = (state.currentTrack % 8) + (page * 8);
    document.getElementById('btn-page-0').classList.toggle('active', page === 0);
    document.getElementById('btn-page-1').classList.toggle('active', page === 1);
    document.getElementById('ctrl-page0').classList.toggle('active', page === 0);
    document.getElementById('ctrl-page1').classList.toggle('active', page === 1);
    renderAll();
}

// Copy functionality
function startCopy(type) {
    if (state.copyMode === type) {
        // Cancel copy
        state.copyMode = null;
        state.copyOrigin = null;
        updateCopyButtons();
        return;
    }

    if (type === 'track') {
        // Track copy is immediate: copies current track
        state.copyMode = 'track';
        state.copyOrigin = state.currentTrack;
        updateCopyButtons();
        return;
    }

    state.copyMode = type;
    state.copyOrigin = type === 'step' ? state.lastPressedStep : state.currentScene;
    updateCopyButtons();
}

function executeCopy(target) {
    if (!state.copyMode) return;

    if (state.copyMode === 'step') {
        const track = getCurrentTrack();
        track.pattern[target] = JSON.parse(JSON.stringify(track.pattern[state.copyOrigin]));
    } else if (state.copyMode === 'track') {
        const scene = scenes[state.currentScene];
        const buffer = JSON.parse(JSON.stringify(scene.tracks[state.copyOrigin]));
        buffer.color = TRACK_COLORS[target];
        buffer.colorDim = TRACK_COLORS_DIM[target];
        buffer.channel = target;
        scene.tracks[target] = buffer;
    } else if (state.copyMode === 'scene') {
        scenes[target] = JSON.parse(JSON.stringify(scenes[state.copyOrigin]));
    }

    state.copyMode = null;
    state.copyOrigin = null;
    updateCopyButtons();
    renderAll();
}

function updateCopyButtons() {
    document.getElementById('btn-copy-step').classList.toggle('copying', state.copyMode === 'step');
    document.getElementById('btn-copy-track').classList.toggle('copying', state.copyMode === 'track');
    document.getElementById('btn-copy-scene').classList.toggle('copying', state.copyMode === 'scene');
}

// Save / Load
function saveProject() {
    try {
        const data = {
            version: 2,
            scenes: scenes,
            state: {
                currentOctave: state.currentOctave,
                bpm: state.bpm,
                currentScene: state.currentScene,
                currentTrack: state.currentTrack,
            },
            samples: window.audioEngine ? window.audioEngine.exportSamples() : null
        };

        const json = JSON.stringify(data);
        const now = new Date();
        const ts = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
        const filename = `octadre-${ts}.json`;

        // Use File System Access API for a proper "Save As" dialog
        if ('showSaveFilePicker' in window) {
            (async () => {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: 'Octadre Project',
                            accept: { 'application/json': ['.json'] }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(json);
                    await writable.close();
                    console.log(`[Save] Project saved to "${handle.name}" (${(json.length / 1024 / 1024).toFixed(1)} MB)`);
                } catch (err) {
                    if (err.name === 'AbortError') {
                        console.log('[Save] Cancelled by user');
                    } else {
                        console.error('[Save] Failed:', err);
                        alert('Failed to save: ' + err.message);
                    }
                }
            })();
        } else {
            // Fallback for browsers without File System Access
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            console.log(`[Save] Project saved (${(json.length / 1024 / 1024).toFixed(1)} MB)`);
        }
    } catch (err) {
        console.error('[Save] Failed to save project:', err);
        alert('Failed to save project: ' + err.message);
    }
}

function loadProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Restore scenes and patterns
            scenes = data.scenes;

            // Migrate: ensure all steps have pitchNote (default C5)
            scenes.forEach(scene => {
                scene.tracks.forEach(track => {
                    track.pattern.forEach(step => {
                        if (step.pitchNote == null) step.pitchNote = 60;
                    });
                });
            });

            // Restore state
            if (data.state) {
                state.currentOctave = data.state.currentOctave || 5;
                state.bpm = data.state.bpm || 120;
                state.currentScene = data.state.currentScene || 0;
                state.currentTrack = data.state.currentTrack || 0;
                document.getElementById('bpm-input').value = state.bpm;
            }

            // Restore audio samples if present
            if (data.samples && window.audioEngine) {
                console.log('[Load] Restoring audio samples...');
                await window.audioEngine.importSamples(data.samples);
                console.log('[Load] Audio samples restored');
            }

            renderAll();
            console.log(`[Load] Project loaded from "${file.name}"`);
        } catch (err) {
            console.error('Failed to load project:', err);
            alert('Failed to load project: ' + err.message);
        }
    };
    input.click();
}

// ──────────────────────────────────────────────
// RENDERING
// ──────────────────────────────────────────────

function buildGrid() {
    const grid = document.getElementById('pad-grid');
    grid.innerHTML = '';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const pad = document.createElement('button');
            pad.className = 'pad';
            pad.dataset.row = row;
            pad.dataset.col = col;
            pad.id = `pad-${row}-${col}`;

            pad.addEventListener('mousedown', (e) => {
                // REC button: if already in record mode, hold = erase
                if (row === 7 && col === 0 && state.recordMode && state.playing) {
                    state.recHeld = true;
                    console.log('🔴 REC held — erasing steps');
                    return; // don't toggle off
                }
                handlePadPress(row, col, e);
            });
            pad.addEventListener('mouseup', (e) => {
                if (row === 7 && col === 0 && state.recHeld) {
                    state.recHeld = false;
                    console.log('🔴 REC released — erase stopped');
                }
            });
            pad.addEventListener('contextmenu', (e) => e.preventDefault());

            grid.appendChild(pad);
        }
    }
}

function buildSideButtons() {
    const container = document.getElementById('side-buttons');
    container.innerHTML = '';

    for (let i = 0; i < 8; i++) {
        const btn = document.createElement('button');
        btn.className = 'side-btn';
        btn.dataset.index = i;
        btn.addEventListener('click', () => {
            if (state.mode === 'chordfield') {
                handleChordFieldSideButton(i);
                return;
            }
            const trackIndex = i + (state.page * 8);
            if (state.copyMode === 'track') {
                executeCopy(trackIndex);
            } else {
                changeTrack(trackIndex);
            }
        });
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const trackIndex = i + (state.page * 8);
            toggleMute(trackIndex);
        });
        container.appendChild(btn);
    }
}

function buildTrackList() {
    const container = document.getElementById('track-list');
    container.innerHTML = '';

    for (let i = 0; i < 8; i++) {
        const trackIndex = i + (state.page * 8);
        const track = scenes[state.currentScene].tracks[trackIndex];
        const hasSample = window.audioEngine && window.audioEngine.hasSample(trackIndex);
        const sampleName = hasSample ? window.audioEngine.getSampleName(trackIndex) : null;

        const item = document.createElement('div');
        item.className = `track-item${trackIndex === state.currentTrack ? ' selected' : ''}${track.muted ? ' muted' : ''}`;
        item.style.setProperty('--track-color', track.color);

        item.innerHTML = `
      <div class="track-color-dot" style="background:${track.color}"></div>
      <div class="track-item-info">
        <div class="track-item-name">Track ${trackIndex + 1}</div>
        <div class="track-item-detail">${sampleName ? sampleName : `Ch${trackIndex + 1}`} | ${track.tempoModifier}x | ${track.trackLength}st</div>
      </div>
      ${hasSample ? '<div class="track-sample-dot" title="Sample loaded"></div>' : ''}
      <button class="track-mute-btn${track.muted ? ' muted' : ''}" data-track="${trackIndex}" title="Mute/Unmute">
        ${track.muted ? '🔇' : '🔊'}
      </button>
    `;

        // Drag-and-drop target for sample files
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            item.classList.add('drag-over');
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });
        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const fileHandle = e.dataTransfer.getData('application/octadre-file-handle');
            if (fileHandle) {
                // Handle from browser file list (stored in temp)
                const entry = window._draggedFileEntry;
                if (entry && entry.handle) {
                    await window.audioEngine.init();
                    await window.audioEngine.loadSampleFromHandle(entry.handle, trackIndex);
                    updateSampleSlotUI();
                    renderTrackList();
                    renderSideButtons();
                }
            } else if (e.dataTransfer.files.length > 0) {
                // Handle file dropped from OS
                const file = e.dataTransfer.files[0];
                await window.audioEngine.init();
                await window.audioEngine.loadSampleFromFile(file, trackIndex);
                updateSampleSlotUI();
                renderTrackList();
                renderSideButtons();
            }
        });

        item.addEventListener('click', (e) => {
            if (e.target.closest('.track-mute-btn')) return;
            changeTrack(trackIndex);
        });

        const muteBtn = item.querySelector('.track-mute-btn');
        muteBtn.addEventListener('click', () => toggleMute(trackIndex));

        container.appendChild(item);
    }
}

function renderTrackList() {
    buildTrackList();
}

function handlePadPress(row, col, event) {
    // In chord field mode, the full 8x8 grid is used — skip corner/scene buttons
    if (state.mode === 'chordfield') {
        handleChordFieldPadPress(row, col);
        return;
    }

    // In harmony mode, bypass corner buttons and scene buttons —
    // the ring grid handles all positions via big/inner/small indices
    if (state.mode === 'harmony') {
        const bigGridIndex = BIG_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
        const innerGridIndex = INNER_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
        const smallGridIndex = SMALL_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
        handleHarmonyPadPress(row, col, bigGridIndex, innerGridIndex, smallGridIndex);
        return;
    }

    // Special corner buttons (digital click handlers)
    if (row === 0 && col === 0) {
        // Copy button — toggle step copy mode
        startCopy('step');
        return;
    }
    if (row === 0 && col === 7) {
        // Tempo modifier button
        changeTempo();
        return;
    }
    if (row === 7 && col === 7) {
        // Shift button — no action on click (hold-only on physical)
        return;
    }
    if (row === 7 && col === 0) {
        // LS / REC button — toggle record mode on click
        // Hold tracking is done via mousedown/mouseup on the pad element
        state.recordMode = !state.recordMode;
        state.recHeld = false;
        console.log(`🔴 Record mode: ${state.recordMode ? 'ON' : 'OFF'}`);
        renderGrid();
        return;
    }

    // Determine what this pad represents
    const bigGridIndex = BIG_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
    const innerGridIndex = INNER_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
    const smallGridIndex = SMALL_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
    const sceneIndex = SCENE_POSITIONS.findIndex(([r, c]) => r === row && c === col);

    // Scene buttons are always active, regardless of mode or workspace
    if (sceneIndex !== -1) {
        if (state.copyMode === 'scene') {
            executeCopy(sceneIndex);
        } else {
            changeScene(sceneIndex);
        }
        return;
    }

    if (state.mode === 'seq') {
        if (bigGridIndex !== -1) {
            if (state.copyMode === 'step') {
                executeCopy(bigGridIndex);
            } else if (event.button === 2) {
                // Right-click: select step for editing without toggling
                state.lastPressedStep = bigGridIndex;
                renderGrid();
                updateStepInfo();
            } else {
                toggleStep(bigGridIndex);
            }
        } else if (innerGridIndex !== -1 && state.workspace > 0) {
            toggleNote(innerGridIndex);
        } else if (smallGridIndex !== -1 && state.workspace > 1) {
            handleSmallGridPress(smallGridIndex);
        }
    } else if (state.mode === 'chords') {
        // Chord mode — simplified for web version
    } else if (state.mode === 'harmony') {
        handleHarmonyPadPress(row, col, bigGridIndex, innerGridIndex, smallGridIndex);
    } else if (state.mode === 'sample') {
        handleSamplePadPress(row, col);
    } else if (state.mode === 'chordfield') {
        handleChordFieldPadPress(row, col);
    }
}

function renderGrid() {
    const track = getCurrentTrack();

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const pad = document.getElementById(`pad-${row}-${col}`);
            if (!pad) continue;

            const bigIdx = BIG_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
            const innerIdx = INNER_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
            const smallIdx = SMALL_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);

            // Reset classes and inline styles
            pad.className = 'pad';
            pad.style.background = '';
            pad.style.borderColor = '';
            pad.style.boxShadow = '';
            pad.style.opacity = '';
            pad.textContent = '';

            // Chord field mode: full grid, skip corner/scene rendering
            if (state.mode === 'chordfield') {
                renderChordFieldPad(pad, row, col);
                continue;
            }

            // Special corner buttons (always rendered)
            if (row === 0 && col === 0) {
                // Copy button (top-left)
                pad.textContent = 'CPY';
                pad.style.fontSize = '10px';
                if (lpState.copyHeld || state.copyMode === 'step') {
                    pad.style.background = 'var(--accent)';
                    pad.style.borderColor = 'var(--accent)';
                    pad.style.color = 'var(--bg-primary)';
                } else {
                    pad.style.background = 'rgba(60, 65, 80, 0.6)';
                    pad.style.borderColor = 'rgba(120, 130, 150, 0.3)';
                    pad.style.color = 'var(--text-secondary)';
                }
                continue;
            }
            if (row === 0 && col === 7) {
                // Tempo modifier button (top-right)
                pad.textContent = track.tempoModifier + 'x';
                pad.style.fontSize = '10px';
                pad.style.background = 'rgba(180, 130, 20, 0.5)';
                pad.style.borderColor = 'rgba(200, 160, 40, 0.5)';
                pad.style.color = '#ffc800';
                continue;
            }
            if (row === 7 && col === 7) {
                // Shift button (bottom-right)
                pad.textContent = '⇧';
                pad.style.fontSize = '14px';
                if (lpState.shiftHeld) {
                    pad.style.background = 'var(--accent)';
                    pad.style.borderColor = 'var(--accent)';
                    pad.style.color = 'var(--bg-primary)';
                } else {
                    pad.style.background = 'rgba(60, 65, 80, 0.6)';
                    pad.style.borderColor = 'rgba(120, 130, 150, 0.3)';
                    pad.style.color = 'var(--text-secondary)';
                }
                continue;
            }
            if (row === 7 && col === 0) {
                // Record / Left Shift button (bottom-left)
                pad.textContent = 'REC';
                pad.style.fontSize = '10px';
                if (state.recordMode) {
                    pad.style.background = '#e53935';
                    pad.style.borderColor = '#e53935';
                    pad.style.color = '#fff';
                } else if (lpState.leftShiftHeld) {
                    pad.style.background = 'var(--accent)';
                    pad.style.borderColor = 'var(--accent)';
                    pad.style.color = 'var(--bg-primary)';
                } else {
                    pad.style.background = 'rgba(60, 65, 80, 0.6)';
                    pad.style.borderColor = 'rgba(120, 130, 150, 0.3)';
                    pad.style.color = 'var(--text-secondary)';
                }
                continue;
            }
            // Check if this is a scene button (always rendered, regardless of mode/workspace)
            const sceneIdx = SCENE_POSITIONS.findIndex(([r, c]) => r === row && c === col);

            if (sceneIdx !== -1) {
                // Scene button — always visible
                pad.textContent = sceneIdx + 1;
                if (sceneIdx === state.currentScene) {
                    pad.classList.add('active-step');
                    pad.style.background = 'var(--accent)';
                    pad.style.borderColor = 'var(--accent)';
                    pad.style.boxShadow = '0 0 16px rgba(0, 232, 160, 0.4)';
                    pad.style.color = 'var(--bg-primary)';
                } else {
                    pad.style.background = 'rgba(60, 65, 80, 0.6)';
                    pad.style.borderColor = 'rgba(120, 130, 150, 0.3)';
                    pad.style.color = 'var(--text-secondary)';
                }
            } else if (state.mode === 'seq') {
                if (bigIdx !== -1) {
                    renderBigGridPad(pad, bigIdx, track);
                } else if (innerIdx !== -1 && state.workspace > 0) {
                    renderInnerGridPad(pad, innerIdx, track);
                } else if (smallIdx !== -1 && state.workspace > 1) {
                    renderSmallGridPad(pad, smallIdx, track);
                } else {
                    pad.classList.add('inactive');
                    pad.style.background = 'rgba(15, 15, 25, 0.6)';
                }
            } else if (state.mode === 'chords') {
                renderChordPad(pad, row, col);
            } else if (state.mode === 'harmony') {
                renderHarmonyPad(pad, row, col, bigIdx, innerIdx, smallIdx);
            } else if (state.mode === 'sample') {
                renderSampleEditPad(pad, row, col);
            } else if (state.mode === 'chordfield') {
                renderChordFieldPad(pad, row, col);
            }
        }
    }

    // Sync LEDs to physical Launchpad controller
    updateLaunchpadLEDs();
}

function renderBigGridPad(pad, stepIndex, track) {
    const step = track.pattern[stepIndex];

    if (stepIndex >= track.trackLength) {
        pad.classList.add('out-of-range');
        pad.textContent = stepIndex + 1;
        return;
    }

    // Check if this is the cursor position
    if (state.playing && state.showCursor) {
        const currentTrackStep = Math.floor(state.currentStep * track.tempoModifier) % track.trackLength;
        if (stepIndex === currentTrackStep) {
            pad.classList.add('cursor');
            pad.textContent = stepIndex + 1;
            return;
        }
    }

    // Step states
    if (step.triplet || step.singleTriplet) {
        pad.classList.add('triplet');
    } else if (step.doubleNote) {
        pad.classList.add('double-note');
    } else if (step.active) {
        pad.classList.add('active-step');
        // Use track color for active steps for more vibrant visuals
        pad.style.background = track.color;
        pad.style.boxShadow = `0 0 16px ${track.color}60, inset 0 0 10px ${track.color}30`;
        pad.style.borderColor = `${track.color}50`;
    } else {
        pad.style.background = track.colorDim;
        pad.style.borderColor = `${track.color}15`;
    }

    // Highlight the last pressed step with a selection ring
    if (stepIndex === state.lastPressedStep) {
        pad.style.boxShadow = `0 0 16px ${track.color}50, inset 0 0 0 2px ${track.color}aa`;
        pad.style.borderColor = `${track.color}60`;
    }

    pad.textContent = stepIndex + 1;
}

function renderInnerGridPad(pad, noteOffset, track) {
    const noteIndex = (state.currentOctave * 12) + noteOffset;
    const step = track.pattern[state.lastPressedStep];

    // Single pitch — red for active, dim for inactive
    if (step.pitchNote === noteIndex) {
        pad.classList.add('note-active');
        pad.style.background = '#e53935';  // red for active pitch
    } else {
        pad.classList.add('note-inactive');
        pad.style.background = '';
    }

    // Show note name
    if (noteOffset < 12) {
        pad.textContent = NOTE_NAMES[noteOffset];
    }
}

function renderSmallGridPad(pad, gridIndex, track) {
    const step = track.pattern[state.lastPressedStep];

    if (state.smallGridMode === 'length') {
        if (gridIndex < step.length / 2) {
            pad.classList.add('length-on');
        } else {
            pad.classList.add('ctrl-off');
        }
    } else if (state.smallGridMode === 'velocity') {
        const mappedValue = (step.velocity * 8) / 127;
        if (gridIndex < mappedValue) {
            pad.classList.add('velocity-on');
        } else {
            pad.classList.add('ctrl-off');
        }
    } else if (state.smallGridMode === 'octave') {
        if (gridIndex === state.currentOctave) {
            pad.classList.add('octave-on');
        } else {
            pad.classList.add('ctrl-off');
        }
    }
}

function renderChordPad(pad, row, col) {
    // Simplified chord view
    if (row < 7 && col < 7) {
        const chordColors = ['#00e060', '#ff6040', '#00e060', '#ff6040', '#ffc800', '#00e060', '#ffc800'];
        pad.style.background = chordColors[col] + '40';
        pad.style.border = `1px solid ${chordColors[col]}30`;
    } else {
        pad.style.background = 'rgba(15, 15, 25, 0.6)';
    }
}

function renderSideButtons() {
    if (state.mode === 'chordfield') {
        renderChordFieldSideButtons();
        return;
    }
    const container = document.getElementById('side-buttons');
    const buttons = container.querySelectorAll('.side-btn');

    buttons.forEach((btn, i) => {
        const trackIndex = i + (state.page * 8);
        const track = scenes[state.currentScene].tracks[trackIndex];
        const hasSample = window.audioEngine && window.audioEngine.hasSample(trackIndex);

        btn.className = 'side-btn';
        if (trackIndex === state.currentTrack) btn.classList.add('selected');
        if (track.muted) btn.classList.add('muted');
        if (hasSample) btn.classList.add('has-sample');

        btn.style.setProperty('--track-color', track.color);
        btn.style.borderLeftColor = track.color;
        btn.innerHTML = `<span style="color:${track.color}">${trackIndex + 1}</span>`;
        btn.style.background = trackIndex === state.currentTrack ? track.color + '20' : '';
    });
}

function renderSceneButtons() {
    document.querySelectorAll('.scene-btn').forEach((btn) => {
        const sceneIdx = parseInt(btn.dataset.scene);
        btn.classList.toggle('active', sceneIdx === state.currentScene);
    });
}

function updateStepInfo() {
    const track = getCurrentTrack();
    const step = track.pattern[state.lastPressedStep];

    // Find the first active note
    let activeNote = 60;
    for (let i = 0; i < 96; i++) {
        if (step.notes[i]) { activeNote = i; break; }
    }
    const noteName = NOTE_NAMES[activeNote % 12] + Math.floor(activeNote / 12);

    document.getElementById('info-track').textContent = state.currentTrack + 1;
    document.getElementById('info-step').textContent = state.lastPressedStep + 1;
    document.getElementById('info-note').textContent = noteName;
    document.getElementById('info-velocity').textContent = step.velocity;
    document.getElementById('info-length').textContent = step.length;
    document.getElementById('info-octave').textContent = state.currentOctave;
    document.getElementById('info-tempo-mod').textContent = track.tempoModifier + 'x';
    document.getElementById('info-ctrl-mode').textContent = state.smallGridMode.charAt(0).toUpperCase() + state.smallGridMode.slice(1);

    // Update tempo modifier buttons
    document.querySelectorAll('.tempo-mod-btn').forEach(btn => {
        btn.classList.toggle('active', parseFloat(btn.dataset.tempo) === track.tempoModifier);
    });

    // Update track length slider
    document.getElementById('track-length-slider').value = track.trackLength;
    document.getElementById('track-length-value').textContent = track.trackLength;
}

function renderAll() {
    renderGrid();
    renderSideButtons();
    renderSceneButtons();
    renderTrackList();
    updateStepInfo();
    updateSampleSlotUI();
}

// ──────────────────────────────────────────────
// SAMPLE BROWSER UI
// ──────────────────────────────────────────────

function updateSampleSlotUI() {
    const trackIndex = state.currentTrack;
    const slot = document.getElementById('sample-slot');
    const nameEl = document.getElementById('sample-slot-name');
    const durationEl = document.getElementById('sample-slot-duration');
    const canvas = document.getElementById('sample-waveform');
    const gainSlider = document.getElementById('sample-gain');
    const pitchSlider = document.getElementById('sample-pitch');
    const gainValue = document.getElementById('sample-gain-value');
    const pitchValue = document.getElementById('sample-pitch-value');

    if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) {
        slot.className = 'sample-slot empty';
        nameEl.textContent = 'No sample loaded';
        durationEl.textContent = '';
        gainSlider.value = 100;
        pitchSlider.value = 100;
        gainValue.textContent = '100%';
        pitchValue.textContent = '1.00x';
        if (window.audioEngine) window.audioEngine.drawWaveform(canvas, trackIndex);
    } else {
        slot.className = 'sample-slot has-sample';
        nameEl.textContent = window.audioEngine.getSampleName(trackIndex);
        const dur = window.audioEngine.getSampleDuration(trackIndex);
        durationEl.textContent = `${dur.toFixed(2)}s`;

        const sample = window.audioEngine.trackSamples[trackIndex];
        gainSlider.value = Math.round(sample.gain * 100);
        pitchSlider.value = Math.round(sample.pitch * 100);
        gainValue.textContent = `${Math.round(sample.gain * 100)}%`;
        pitchValue.textContent = `${sample.pitch.toFixed(2)}x`;

        window.audioEngine.drawWaveform(canvas, trackIndex);
    }

    // Refresh sample editor if open
    const editor = document.getElementById('sample-editor');
    if (editor && !editor.classList.contains('collapsed')) {
        updateSampleEditor();
    }
}

function renderBrowserFileList() {
    const engine = window.audioEngine;
    if (!engine || !engine.directoryHandle) {
        renderBrowserEmptyState();
        return;
    }

    if (engine.scanViewMode === 'flat' && engine.flatFileList.length > 0) {
        renderFlatFileList();
    } else {
        renderFolderFileList();
    }

    updateViewModeButtons();
}

function renderBrowserEmptyState() {
    const container = document.getElementById('browser-file-list');
    const countEl = document.getElementById('browser-file-count');

    container.innerHTML = `
        <div class="browser-empty-state">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.3">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
            <p>Click <strong>Open Folder</strong> to browse your samples</p>
            <span class="browser-hint">Works with Chrome, Edge, Arc</span>
        </div>
    `;
    countEl.textContent = 'No folder open';
}

function renderFolderFileList() {
    const container = document.getElementById('browser-file-list');
    const countEl = document.getElementById('browser-file-count');
    const engine = window.audioEngine;

    const tree = engine.fileTree;
    const dirs = tree.filter(e => e.type === 'directory').length;
    const files = tree.filter(e => e.type === 'file').length;
    countEl.textContent = `${dirs} folders, ${files} samples`;

    container.innerHTML = '';

    // Back button if not at root
    if (engine.currentPath.length > 0) {
        const backItem = document.createElement('div');
        backItem.className = 'file-item folder';
        backItem.innerHTML = `
            <div class="file-item-icon folder">
                <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            </div>
            <span class="file-item-name">..</span>
        `;
        backItem.addEventListener('click', async () => {
            engine.navigateUp();
            renderBrowserFileList();
            renderBreadcrumbs();
        });
        container.appendChild(backItem);
    }

    tree.forEach(entry => {
        if (entry.type === 'directory') {
            const item = document.createElement('div');
            item.className = 'file-item folder';
            item.innerHTML = `
                <div class="file-item-icon folder">
                    <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                </div>
                <span class="file-item-name">${entry.name}</span>
            `;
            item.addEventListener('click', async () => {
                await engine.navigateToFolder(entry);
                renderBrowserFileList();
                renderBreadcrumbs();
            });
            container.appendChild(item);
        } else {
            container.appendChild(createFileItemElement(entry));
        }
    });
}

function renderFlatFileList() {
    const container = document.getElementById('browser-file-list');
    const countEl = document.getElementById('browser-file-count');
    const engine = window.audioEngine;

    const groups = engine.getFolderGroups();
    const displayList = engine.getDisplayList();
    countEl.textContent = `${displayList.length} samples in ${groups.size} folders`;

    container.innerHTML = '';

    if (displayList.length === 0) {
        container.innerHTML = `
            <div class="browser-empty-state">
                <p>No matching samples found</p>
            </div>
        `;
        return;
    }

    for (const [folderName, files] of groups) {
        // Folder group header
        const header = document.createElement('div');
        header.className = 'folder-group-header';
        header.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>
            <span>${folderName || '(root)'}</span>
            <span class="folder-group-count">${files.length}</span>
        `;
        container.appendChild(header);

        // Files in this group
        files.forEach(entry => {
            container.appendChild(createFileItemElement(entry));
        });
    }
}

// Shared helper: creates a file item element with preview, assign, drag, dblclick
function createFileItemElement(entry) {
    const item = document.createElement('div');
    item.className = 'file-item audio';
    item.innerHTML = `
        <div class="file-item-icon audio">
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
        </div>
        <span class="file-item-name">${entry.name}</span>
        <span class="file-item-ext">${entry.ext || ''}</span>
        <div class="file-item-actions">
            <button class="file-action-btn preview" title="Preview">▶</button>
            <button class="file-action-btn assign" title="Assign to current track">⮕</button>
        </div>
    `;

    // Preview
    item.querySelector('.preview').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.audioEngine.init();
        await window.audioEngine.previewFile(entry.handle);
    });

    // Assign to current track
    item.querySelector('.assign').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.audioEngine.init();
        await window.audioEngine.loadSampleFromHandle(entry.handle, state.currentTrack);
        updateSampleSlotUI();
        renderTrackList();
        renderSideButtons();
    });

    // Double-click to assign
    item.addEventListener('dblclick', async () => {
        await window.audioEngine.init();
        await window.audioEngine.loadSampleFromHandle(entry.handle, state.currentTrack);
        updateSampleSlotUI();
        renderTrackList();
        renderSideButtons();
    });

    // Drag support
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/octadre-file-handle', 'true');
        window._draggedFileEntry = entry;
        item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        window._draggedFileEntry = null;
    });

    return item;
}

function updateViewModeButtons() {
    const engine = window.audioEngine;
    if (!engine) return;

    const scanBtn = document.getElementById('btn-scan-all');
    const viewBtn = document.getElementById('btn-view-mode');

    scanBtn.classList.toggle('active', engine.flatFileList.length > 0);
    viewBtn.classList.toggle('active', engine.scanViewMode === 'flat');
}

function renderBreadcrumbs() {
    const container = document.getElementById('browser-breadcrumbs');
    const engine = window.audioEngine;

    if (!engine || !engine.directoryHandle) {
        container.innerHTML = '';
        return;
    }

    // In flat mode, show the root folder name + "All Files" indicator
    if (engine.scanViewMode === 'flat') {
        container.innerHTML = '';
        const rootCrumb = document.createElement('span');
        rootCrumb.className = 'breadcrumb-item';
        rootCrumb.textContent = engine.directoryHandle.name;
        rootCrumb.addEventListener('click', () => {
            engine.scanViewMode = 'folder';
            renderBrowserFileList();
            renderBreadcrumbs();
        });
        container.appendChild(rootCrumb);

        const sep = document.createElement('span');
        sep.className = 'breadcrumb-sep';
        sep.textContent = '\u203A';
        container.appendChild(sep);

        const flatCrumb = document.createElement('span');
        flatCrumb.className = 'breadcrumb-item';
        flatCrumb.style.color = 'var(--accent-green)';
        flatCrumb.textContent = `All Files (${engine.getDisplayList().length})`;
        container.appendChild(flatCrumb);
        return;
    }

    // Normal folder breadcrumbs
    const crumbs = engine.getBreadcrumbs();
    container.innerHTML = '';

    crumbs.forEach((name, idx) => {
        if (idx > 0) {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-sep';
            sep.textContent = '\u203A';
            container.appendChild(sep);
        }

        const crumb = document.createElement('span');
        crumb.className = 'breadcrumb-item';
        crumb.textContent = name;

        if (idx < crumbs.length - 1) {
            crumb.addEventListener('click', async () => {
                const stepsBack = crumbs.length - 1 - idx;
                for (let i = 0; i < stepsBack; i++) {
                    engine.navigateUp();
                }
                renderBrowserFileList();
                renderBreadcrumbs();
            });
        }

        container.appendChild(crumb);
    });
}

function toggleSampleBrowser() {
    const browser = document.getElementById('sample-browser');
    browser.classList.toggle('collapsed');
}

// ──────────────────────────────────────────────
// HARMONY MODE
// ──────────────────────────────────────────────

function initRhodes() {
    if (harmonyState.rhodes) return;
    // Ensure audio context exists
    if (window.audioEngine && window.audioEngine.audioContext) {
        harmonyState.rhodes = new RhodesSynth(window.audioEngine.audioContext);
        harmonyState.rhodes.init();
        console.log('[Harmony] Rhodes synth initialized');
    } else {
        // Defer until audio engine is ready
        console.log('[Harmony] Waiting for audio context...');
    }
}

function ensureRhodes() {
    if (!harmonyState.rhodes && window.audioEngine) {
        if (!window.audioEngine.audioContext) {
            window.audioEngine.init();
        }
        harmonyState.rhodes = new RhodesSynth(window.audioEngine.audioContext);
        harmonyState.rhodes.init();
    }
}

// ── Harmony Grid Rendering ──

function renderHarmonyPad(pad, row, col, bigIdx, innerIdx, smallIdx) {
    if (bigIdx !== -1) {
        renderHarmonyBigPad(pad, bigIdx);
    } else if (innerIdx !== -1) {
        renderHarmonyInnerPad(pad, innerIdx);
    } else if (smallIdx !== -1) {
        renderHarmonySmallPad(pad, smallIdx);
    } else {
        pad.classList.add('inactive');
        pad.style.background = 'rgba(15, 15, 25, 0.6)';
    }
}

function renderHarmonyBigPad(pad, stepIndex) {
    const step = harmonyState.pattern[stepIndex];
    const he = window.harmonyEngine;

    pad.classList.add('harmony-step');

    if (step.active) {
        // Color by harmonic function
        pad.classList.add(`harmony-${step.function}`);
        pad.classList.add('step-active');

        // Show roman numeral
        const roman = he.getRomanNumeral(step, harmonyState.scale);
        pad.textContent = roman;
    } else {
        pad.style.background = 'rgba(25, 25, 40, 0.5)';
        pad.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        pad.textContent = '';
    }

    // Cursor (playback position)
    if (state.playing) {
        const playStep = state.currentStep % 16;
        if (stepIndex === playStep) {
            pad.classList.add('harmony-cursor');
        }
    }

    // Selected step for editing
    if (stepIndex === harmonyState.selectedStep) {
        pad.classList.add('harmony-selected');
    }
}

function renderHarmonyInnerPad(pad, innerIdx) {
    const step = harmonyState.pattern[harmonyState.selectedStep];
    const he = window.harmonyEngine;
    const phase = harmonyState.selectionPhase;

    if (phase === 'function') {
        // Row 1 (indices 0–3): Function selectors
        const funcMap = ['tonic', 'predominant', 'dominant', 'secondary'];
        const funcLabels = ['T', 'PD', 'D', 'Sec'];

        if (innerIdx < 4) {
            const func = funcMap[innerIdx];
            pad.classList.add('harmony-func', `func-${func}`);
            pad.textContent = funcLabels[innerIdx];
            if (step.active && step.function === func) {
                pad.classList.add('active');
            }
        } else if (innerIdx < 8) {
            // Row 2: Show degrees for current function
            const degrees = he.getDegreesForFunction(step.function, harmonyState.scale);
            const degreeIdx = innerIdx - 4;
            if (degreeIdx < degrees.length) {
                const deg = degrees[degreeIdx];
                const roman = he.getRomanForDegree(deg, harmonyState.scale);
                pad.classList.add('harmony-degree', `func-${step.function}`);
                pad.textContent = roman;
                if (step.active && step.degree === deg) {
                    pad.classList.add('active');
                }
            } else {
                pad.classList.add('inactive');
                pad.style.background = 'rgba(15, 15, 25, 0.4)';
            }
        } else {
            // Row 3: Extensions
            const extMap = ['triad', '7th', '9th', 'sus4'];
            const extLabels = ['Triad', '7th', '9th', 'Sus4'];
            const extIdx = innerIdx - 8;
            if (extIdx < 4) {
                pad.classList.add('harmony-ext');
                pad.textContent = extLabels[extIdx];
                if (step.active && step.extension === extMap[extIdx]) {
                    pad.classList.add('active');
                }
            }
        }
    } else if (phase === 'secondary_target') {
        // Show secondary target selector: V/ii, V/iii, V/IV, V/V, V/vi
        const targets = he.getSecondaryTargets(harmonyState.scale);
        if (innerIdx < targets.length) {
            const targetDeg = targets[innerIdx];
            const roman = he.getRomanForDegree(targetDeg, harmonyState.scale);
            pad.classList.add('harmony-degree', 'func-secondary');
            pad.textContent = `V/${roman}`;
            if (step.secondaryTarget === targetDeg) {
                pad.classList.add('active');
            }
        } else if (innerIdx === targets.length) {
            // Back button
            pad.classList.add('harmony-ctrl');
            pad.textContent = '← Back';
        } else {
            pad.classList.add('inactive');
            pad.style.background = 'rgba(15, 15, 25, 0.4)';
        }
    }
}

function renderHarmonySmallPad(pad, smallIdx) {
    const step = harmonyState.pattern[harmonyState.selectedStep];
    // 8 pads: mapped to voice/length controls
    const labels = ['Key↓', 'Key↑', 'Vox-', 'Vox+', 'Len-', 'Len+', 'Inv-', 'Inv+'];
    pad.classList.add('harmony-ctrl');
    pad.textContent = labels[smallIdx] || '';
}

// ── Harmony Pad Interaction ──

function handleHarmonyPadPress(row, col, bigIdx, innerIdx, smallIdx) {
    const he = window.harmonyEngine;

    if (bigIdx !== -1) {
        const step = harmonyState.pattern[bigIdx];

        // If tapping the already-selected active step → clear it
        if (bigIdx === harmonyState.selectedStep && step.active) {
            step.active = false;
            step.function = 'tonic';
            step.degree = 1;
            step.extension = 'triad';
            step.inversion = 0;
            step.voiceCount = 4;
            step.length = 4;
            step.voicedNotes = [];
            // Release any playing notes
            if (harmonyState.rhodes) harmonyState.rhodes.allNotesOff();
            recomputeHarmony();
            renderGrid();
            updateHarmonyUI();
            return;
        }

        // Select this step for editing
        harmonyState.selectedStep = bigIdx;

        if (!step.active) {
            // Activate the step with defaults
            step.active = true;
            step.function = 'tonic';
            step.degree = 1;
            step.extension = 'triad';
            step.inversion = 0;
            step.voiceCount = 4;
            step.length = 4;
        }

        harmonyState.selectionPhase = 'function';
        recomputeHarmony();
        renderGrid();
        updateHarmonyUI();

        // Preview the chord
        previewHarmonyStep(bigIdx);

    } else if (innerIdx !== -1) {
        handleHarmonyInnerPress(innerIdx);

    } else if (smallIdx !== -1) {
        handleHarmonySmallPress(smallIdx);
    }
}

function handleHarmonyInnerPress(innerIdx) {
    const he = window.harmonyEngine;
    const step = harmonyState.pattern[harmonyState.selectedStep];
    if (!step.active) return;

    if (harmonyState.selectionPhase === 'function') {
        if (innerIdx < 4) {
            // Function selection
            const funcMap = ['tonic', 'predominant', 'dominant', 'secondary'];
            step.function = funcMap[innerIdx];

            if (step.function === 'secondary') {
                harmonyState.selectionPhase = 'secondary_target';
            } else {
                // Auto-set to first degree of the function
                const degrees = he.getDegreesForFunction(step.function, harmonyState.scale);
                step.degree = degrees[0];
            }
        } else if (innerIdx < 8) {
            // Degree selection
            const degrees = he.getDegreesForFunction(step.function, harmonyState.scale);
            const degreeIdx = innerIdx - 4;
            if (degreeIdx < degrees.length) {
                step.degree = degrees[degreeIdx];
            }
        } else {
            // Extension selection
            const extMap = ['triad', '7th', '9th', 'sus4'];
            const extIdx = innerIdx - 8;
            if (extIdx < extMap.length) {
                step.extension = extMap[extIdx];
            }
        }
    } else if (harmonyState.selectionPhase === 'secondary_target') {
        const targets = he.getSecondaryTargets(harmonyState.scale);
        if (innerIdx < targets.length) {
            step.secondaryTarget = targets[innerIdx];
            step.function = 'secondary';
            harmonyState.selectionPhase = 'function';
        } else if (innerIdx === targets.length) {
            // Back button
            harmonyState.selectionPhase = 'function';
            step.function = 'tonic';
        }
    }

    recomputeHarmony();
    renderGrid();
    updateHarmonyUI();

    // Preview
    previewHarmonyStep(harmonyState.selectedStep);
}

function handleHarmonySmallPress(smallIdx) {
    const he = window.harmonyEngine;
    const step = harmonyState.pattern[harmonyState.selectedStep];

    switch (smallIdx) {
        case 0: // Key down
            harmonyState.key = (harmonyState.key + 11) % 12;
            break;
        case 1: // Key up
            harmonyState.key = (harmonyState.key + 1) % 12;
            break;
        case 2: // Voices down
            if (step.active) step.voiceCount = Math.max(3, step.voiceCount - 1);
            break;
        case 3: // Voices up
            if (step.active) step.voiceCount = Math.min(6, step.voiceCount + 1);
            break;
        case 4: // Length down
            if (step.active) step.length = Math.max(1, step.length - 1);
            break;
        case 5: // Length up
            if (step.active) step.length = Math.min(16, step.length + 1);
            break;
        case 6: // Inversion down
            if (step.active) step.inversion = Math.max(0, step.inversion - 1);
            break;
        case 7: // Inversion up
            if (step.active) {
                const maxInv = step.extension === 'triad' ? 2 : 3;
                step.inversion = Math.min(maxInv, step.inversion + 1);
            }
            break;
    }

    recomputeHarmony();
    renderGrid();
    updateHarmonyUI();

    // Preview on key change
    if (smallIdx <= 1 && step.active) {
        previewHarmonyStep(harmonyState.selectedStep);
    }
}

// ── Harmony Engine Integration ──

function recomputeHarmony() {
    if (!window.harmonyEngine) return;
    window.harmonyEngine.computeProgression(
        harmonyState.pattern,
        harmonyState.key,
        harmonyState.scale
    );
}

function previewHarmonyStep(stepIndex) {
    ensureRhodes();
    if (!harmonyState.rhodes) {
        console.warn('[Harmony] Rhodes synth not available — cannot preview');
        return;
    }

    const step = harmonyState.pattern[stepIndex];
    if (!step.active || step.voicedNotes.length === 0) {
        console.log(`[Harmony] Step ${stepIndex}: active=${step.active}, voicedNotes=${JSON.stringify(step.voicedNotes)}`);
        return;
    }

    console.log(`[Harmony] Preview step ${stepIndex}: notes=${JSON.stringify(step.voicedNotes)}`);

    // Release previous preview
    harmonyState.rhodes.allNotesOff();

    // Play the chord for 1.5 seconds
    harmonyState.rhodes.playChord(step.voicedNotes, step.velocity, 1.5);
}

// ── Harmony Playback ──

function triggerHarmonyChords() {
    if (!harmonyState.rhodes && window.RhodesSynth) {
        ensureRhodes();
    }
    if (!harmonyState.rhodes) return;

    const playStep = state.currentStep % 16;

    // Check if a chord starts at this step
    const step = harmonyState.pattern[playStep];
    if (step && step.active && step.voicedNotes.length > 0) {
        // Release any active chord
        if (harmonyState.activeChordNotes.length > 0) {
            harmonyState.rhodes.releaseChord(harmonyState.activeChordNotes);
        }

        // Play the new chord
        harmonyState.rhodes.playChord(step.voicedNotes, step.velocity);
        harmonyState.activeChordNotes = [...step.voicedNotes];
        harmonyState.activeChordStep = playStep;
    }

    // Check if the active chord should be released (based on length)
    if (harmonyState.activeChordStep >= 0) {
        const activeStep = harmonyState.pattern[harmonyState.activeChordStep];
        if (activeStep) {
            const elapsed = (playStep - harmonyState.activeChordStep + 16) % 16;
            if (elapsed >= activeStep.length && playStep !== harmonyState.activeChordStep) {
                // Check if there's no new chord at this step
                const currentStep = harmonyState.pattern[playStep];
                if (!currentStep || !currentStep.active) {
                    harmonyState.rhodes.releaseChord(harmonyState.activeChordNotes);
                    harmonyState.activeChordNotes = [];
                    harmonyState.activeChordStep = -1;
                }
            }
        }
    }
}

// ── Harmony UI Updates ──

function updateHarmonyUI() {
    const he = window.harmonyEngine;
    if (!he) return;

    const step = harmonyState.pattern[harmonyState.selectedStep];

    // Key label
    const keyLabel = document.getElementById('harmony-key-label');
    if (keyLabel) keyLabel.textContent = he.getKeyName(harmonyState.key, harmonyState.scale);

    // Scale toggle button
    const scaleBtn = document.getElementById('harmony-scale-toggle');
    if (scaleBtn) {
        const scaleLabels = {
            major: 'Major', natural_minor: 'Minor',
            harmonic_minor: 'Harm Min', melodic_minor: 'Mel Min'
        };
        scaleBtn.textContent = scaleLabels[harmonyState.scale] || 'Major';
    }

    // Voices label
    const voicesLabel = document.getElementById('harmony-voices-label');
    if (voicesLabel) voicesLabel.textContent = step.active ? step.voiceCount : '-';

    // Length label
    const lengthLabel = document.getElementById('harmony-length-label');
    if (lengthLabel) lengthLabel.textContent = step.active ? step.length : '-';

    // Step info
    const stepLabel = document.getElementById('harmony-step-label');
    const notesLabel = document.getElementById('harmony-notes-label');
    if (stepLabel) {
        if (step.active) {
            stepLabel.textContent = he.getRomanNumeral(step, harmonyState.scale);
            // Color the roman numeral
            const funcColors = {
                tonic: 'var(--harmony-tonic)',
                predominant: 'var(--harmony-predominant)',
                dominant: 'var(--harmony-dominant)',
                secondary: 'var(--harmony-secondary)',
            };
            stepLabel.style.color = funcColors[step.function] || 'var(--text-primary)';
        } else {
            stepLabel.textContent = '—';
            stepLabel.style.color = '';
        }
    }
    if (notesLabel) {
        if (step.active && step.voicedNotes.length > 0) {
            notesLabel.textContent = step.voicedNotes.map(n => he.midiToName(n)).join(' ');
        } else {
            notesLabel.textContent = '';
        }
    }
}

function setupHarmonyListeners() {
    // Key controls
    const keyDown = document.getElementById('harmony-key-down');
    const keyUp = document.getElementById('harmony-key-up');
    if (keyDown) keyDown.addEventListener('click', () => {
        harmonyState.key = (harmonyState.key + 11) % 12;
        recomputeHarmony();
        renderGrid();
        updateHarmonyUI();
    });
    if (keyUp) keyUp.addEventListener('click', () => {
        harmonyState.key = (harmonyState.key + 1) % 12;
        recomputeHarmony();
        renderGrid();
        updateHarmonyUI();
    });

    // Scale toggle
    const scaleToggle = document.getElementById('harmony-scale-toggle');
    if (scaleToggle) scaleToggle.addEventListener('click', () => {
        const scales = ['major', 'natural_minor', 'harmonic_minor', 'melodic_minor'];
        const idx = scales.indexOf(harmonyState.scale);
        harmonyState.scale = scales[(idx + 1) % scales.length];
        recomputeHarmony();
        renderGrid();
        updateHarmonyUI();
    });

    // Voices
    const voicesDown = document.getElementById('harmony-voices-down');
    const voicesUp = document.getElementById('harmony-voices-up');
    if (voicesDown) voicesDown.addEventListener('click', () => {
        const step = harmonyState.pattern[harmonyState.selectedStep];
        if (step.active) {
            step.voiceCount = Math.max(3, step.voiceCount - 1);
            recomputeHarmony();
            renderGrid();
            updateHarmonyUI();
        }
    });
    if (voicesUp) voicesUp.addEventListener('click', () => {
        const step = harmonyState.pattern[harmonyState.selectedStep];
        if (step.active) {
            step.voiceCount = Math.min(6, step.voiceCount + 1);
            recomputeHarmony();
            renderGrid();
            updateHarmonyUI();
        }
    });

    // Length
    const lengthDown = document.getElementById('harmony-length-down');
    const lengthUp = document.getElementById('harmony-length-up');
    if (lengthDown) lengthDown.addEventListener('click', () => {
        const step = harmonyState.pattern[harmonyState.selectedStep];
        if (step.active) {
            step.length = Math.max(1, step.length - 1);
            recomputeHarmony();
            renderGrid();
            updateHarmonyUI();
        }
    });
    if (lengthUp) lengthUp.addEventListener('click', () => {
        const step = harmonyState.pattern[harmonyState.selectedStep];
        if (step.active) {
            step.length = Math.min(16, step.length + 1);
            recomputeHarmony();
            renderGrid();
            updateHarmonyUI();
        }
    });
}

// ──────────────────────────────────────────────
// SAMPLE EDITOR GRID MODE
// ──────────────────────────────────────────────
//
// Layout on the 8×8 grid / Launchpad:
//   Rows 0-4  : Waveform visualizer (8 cols × 5 rows)
//               Each column = 1/8th of the sample
//               Amplitude bars grow upward from row 4
//               Active region (between IN/OUT) = bright track color
//               Outside region = dim
//               IN column base = red, OUT column base = blue
//               Tap a column to move nearest marker
//   Row 5     : ADSR envelope curve (8 pads, brightness = height)
//   Row 6     : A- A+ D- D+ S- S+ R- R+ (parameter pair controls)
//   Row 7     : LS (auto) ... preview ... RS (auto)

const sampleEditState = {
    selectedParam: 'attack',   // which ADSR param is highlighted
};

// Compute 8-column amplitude data from waveformData
function getSampleAmplitudes(trackIndex) {
    if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) return null;
    const data = window.audioEngine.trackSamples[trackIndex].waveformData;
    if (!data || data.length === 0) return null;
    const amps = new Array(8).fill(0);
    const chunkSize = Math.floor(data.length / 8);
    for (let col = 0; col < 8; col++) {
        let max = 0;
        const start = col * chunkSize;
        const end = Math.min(start + chunkSize, data.length);
        for (let i = start; i < end; i++) {
            if (data[i] > max) max = data[i];
        }
        amps[col] = max;
    }
    return amps;
}

// Compute ADSR envelope heights at 8 positions (0-1)
function getADSRCurveValues(trackIndex) {
    if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) {
        return [0, 0, 0, 0, 0, 0, 0, 0];
    }
    const adsr = window.audioEngine.trackSamples[trackIndex].adsr;
    const a = adsr.attack, d = adsr.decay, s = adsr.sustain, r = adsr.release;
    const total = a + d + 0.2 + r; // 0.2 = sustain hold time

    // Map envelope to 8 positions
    const values = [];
    for (let i = 0; i < 8; i++) {
        const t = (i / 7) * total;
        let v = 0;
        if (t <= a) {
            v = a > 0 ? t / a : 1; // attack ramp
        } else if (t <= a + d) {
            v = 1 - (1 - s) * ((t - a) / (d || 0.001)); // decay
        } else if (t <= a + d + 0.2) {
            v = s; // sustain hold
        } else {
            const rt = t - (a + d + 0.2);
            v = s * (1 - rt / (r || 0.001)); // release
        }
        values.push(Math.max(0, Math.min(1, v)));
    }
    return values;
}

// ADSR param colors for row 6 (LP MK2 palette indices)
const ADSR_COLORS = {
    attack: { bright: 72, dim: 71 },  // warm amber
    decay: { bright: 9, dim: 11 },  // orange
    sustain: { bright: 29, dim: 27 },  // green
    release: { bright: 45, dim: 43 },  // blue
};
const ADSR_PARAM_ORDER = ['attack', 'decay', 'sustain', 'release'];

// ══════════════════════════════════════════════════════════
// CHORD FIELD MODE
// ══════════════════════════════════════════════════════════

const CF_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Row colors by chord quality row (CSS) — neutral base, glow provides meaning
const CF_BASE_COLOR = 'rgba(40, 55, 70, 0.5)';       // uniform dark teal-grey
const CF_BASE_BORDER = 'rgba(80, 100, 120, 0.25)';

// Glow-driven colors: from dim (no shared notes) to bright (3+ shared)
const CF_GLOW_CSS = [
    'rgba(35, 45, 55, 0.45)',     // 0: dark — no harmonic connection
    'rgba(60, 90, 120, 0.6)',     // 1: cool blue — weak connection
    'rgba(180, 160, 60, 0.75)',   // 2: warm amber — moderate connection
    'rgba(255, 240, 180, 0.95)',  // 3: bright warm — strong connection
];
const CF_GLOW_BORDER = [
    'rgba(60, 75, 90, 0.2)',      // 0
    'rgba(80, 120, 160, 0.35)',   // 1
    'rgba(200, 180, 80, 0.5)',    // 2
    'rgba(255, 240, 200, 0.7)',   // 3
];

// LP MK2 colors: glow-driven (dark to bright)
const CF_LP_GLOW_COLORS = [43, 45, 9, 3]; // dark teal, mid teal, amber, white
const CF_LP_BASE_COLOR = 45;  // neutral teal for pre-glow state

// Glow multipliers for CSS opacity (less relevant now, but kept for fallback)
const CF_GLOW_OPACITY = [0.3, 0.6, 0.85, 1.0]; // 0,1,2,3 shared notes

// ── Rhythm Pattern Presets (16th-note grid, 16 steps = 1 bar) ──
const CF_RHYTHM_PATTERNS = [
    { name: 'Sustain', pattern: null },  // hold, no re-trigger
    { name: 'Quarter', pattern: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] },
    { name: 'Offbeat', pattern: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0] },
    { name: 'Bounce', pattern: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
    { name: 'Tresillo', pattern: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0] },
    { name: '8ths', pattern: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
];

const CF_ARP_MODES = ['off', 'up', 'down', 'updown', 'random'];
const CF_ARP_RATES = ['8th', '16th', 'triplet'];

// ── Humanization Engine ──

function cfGetVelocity(cf) {
    if (cf.velocityMode === 'humanize') {
        return Math.floor(80 + Math.random() * 47); // 80–127
    }
    return 100;
}

function cfPlayChordHumanized(cf, voiced) {
    const rhodes = cf.rhodes;
    if (!rhodes) return;

    if (cf.rollMode === 'strum') {
        // Bottom-to-top stagger: 15ms between each note
        voiced.forEach((n, i) => {
            setTimeout(() => rhodes.noteOn(n, cfGetVelocity(cf)), i * 15);
        });
    } else if (cf.rollMode === 'roll') {
        // Random per-note delay: 5–25ms
        voiced.forEach(n => {
            setTimeout(() => rhodes.noteOn(n, cfGetVelocity(cf)), Math.random() * 25 + 5);
        });
    } else {
        // Simultaneous
        voiced.forEach(n => rhodes.noteOn(n, cfGetVelocity(cf)));
    }
}

function cfStopPlayback(cf) {
    // Stop rhythm
    if (cf.rhythmInterval) {
        clearInterval(cf.rhythmInterval);
        cf.rhythmInterval = null;
    }
    // Stop arp
    if (cf.arpInterval) {
        clearInterval(cf.arpInterval);
        cf.arpInterval = null;
    }
    // Release last arp note if one is still sounding
    if (cf.arpLastNote !== null && cf.arpLastNote !== undefined && cf.rhodes) {
        cf.rhodes.noteOff(cf.arpLastNote);
        cf.arpLastNote = null;
    }
    // Release any active chord notes
    if (cf.rhodes && cf.activeNotes.length > 0) {
        cf.activeNotes.forEach(n => cf.rhodes.noteOff(n));
    }
    cf.arpIndex = 0;
    cf.arpDirection = 1;
}

function cfStartRhythm(cf) {
    const preset = CF_RHYTHM_PATTERNS[cf.rhythmPattern];
    if (!preset || !preset.pattern) return; // sustain mode, no rhythm

    const pattern = preset.pattern;
    const sixteenthMs = (60000 / state.bpm) / 4; // ms per 16th note
    let step = 0;
    let isOn = true; // chord was just played, so it's already on

    cf.rhythmInterval = setInterval(() => {
        const hit = pattern[step % pattern.length] === 1;
        if (hit && !isOn) {
            // Re-trigger: play chord
            cfPlayChordHumanized(cf, cf.activeNotes);
            isOn = true;
        } else if (!hit && isOn) {
            // Off-beat: release notes for rhythmic gap
            cf.activeNotes.forEach(n => cf.rhodes.noteOff(n));
            isOn = false;
        }
        step++;
    }, sixteenthMs);
}

function cfStartArp(cf) {
    if (cf.arpMode === 'off' || cf.arpNotes.length === 0) return;

    // Calculate interval based on rate
    let rateMs;
    const beatMs = 60000 / state.bpm;
    switch (cf.arpRate) {
        case '16th': rateMs = beatMs / 4; break;
        case 'triplet': rateMs = beatMs / 3; break;
        default: rateMs = beatMs / 2; break; // 8th
    }

    cf.arpLastNote = null;
    cf.arpInterval = setInterval(() => {
        const notes = cf.arpNotes;
        if (notes.length === 0) return;

        // Release previous arp note
        if (cf.arpLastNote !== null) cf.rhodes.noteOff(cf.arpLastNote);

        // Get next note based on mode
        let note;
        switch (cf.arpMode) {
            case 'up':
                note = notes[cf.arpIndex % notes.length];
                cf.arpIndex++;
                break;
            case 'down':
                note = notes[(notes.length - 1) - (cf.arpIndex % notes.length)];
                cf.arpIndex++;
                break;
            case 'updown':
                note = notes[cf.arpIndex % notes.length];
                cf.arpIndex += cf.arpDirection;
                if (cf.arpIndex >= notes.length - 1) cf.arpDirection = -1;
                if (cf.arpIndex <= 0) cf.arpDirection = 1;
                break;
            case 'random':
                note = notes[Math.floor(Math.random() * notes.length)];
                break;
        }

        if (note !== undefined) {
            cf.rhodes.noteOn(note, cfGetVelocity(cf));
            cf.arpLastNote = note;
        }
    }, rateMs);
}

function cfBuildArpNotes(voiced) {
    // Spread chord tones across 2 octaves, sorted low to high
    const base = [...voiced].sort((a, b) => a - b);
    const extended = [...base, ...base.map(n => n + 12)];
    return extended;
}

function initChordFieldRhodes() {
    if (chordFieldState.rhodes) return;
    if (window.audioEngine && window.audioEngine.audioContext) {
        chordFieldState.rhodes = new RhodesSynth(window.audioEngine.audioContext);
        chordFieldState.rhodes.init();
        console.log('[ChordField] Rhodes synth initialized');
    } else if (window.audioEngine) {
        window.audioEngine.init();
        if (window.audioEngine.audioContext) {
            chordFieldState.rhodes = new RhodesSynth(window.audioEngine.audioContext);
            chordFieldState.rhodes.init();
            console.log('[ChordField] Rhodes synth initialized (after audio init)');
        }
    }
}

// Get the grid info for a given row/col
function cfGetPadInfo(row, col) {
    const cf = chordFieldState;
    const modeName = ChordFieldEngine.MODE_ORDER[cf.modeIndex];
    const scale = ChordFieldEngine.MODES[modeName];

    // Columns 0-6 = scale degrees, column 7 = chromatic (tritone sub / bII)
    let root, quality;
    if (col < 7) {
        // Apply root rotation (circle of 4ths)
        const degreeIdx = (col + cf.rootRotation) % 7;
        root = (cf.key + scale[degreeIdx]) % 12;
        quality = ChordFieldEngine.getQualityForDegree(modeName, degreeIdx, row);
    } else {
        // Column 7: chromatic — bII (tritone sub root = key + 1 semitone)
        root = (cf.key + 1) % 12;
        quality = ChordFieldEngine.getQualityForDegree(modeName, 0, row); // use I quality
    }

    return { root, quality, modeName };
}

function handleChordFieldPadPress(row, col) {
    const cf = chordFieldState;
    if (!cf.rhodes) {
        initChordFieldRhodes();
        if (!cf.rhodes) return;
    }

    const { root, quality } = cfGetPadInfo(row, col);

    // Voice the chord
    const voicingType = ChordFieldEngine.VOICING_TYPES[cf.voicingIndex];
    const voiced = ChordFieldEngine.voiceChord(root, quality, voicingType, cf.prevVoicing, cf.octaveOffset);

    if (!voiced || voiced.length === 0) return;

    // Stop any running rhythm/arp AND release all sounding notes
    cfStopPlayback(cf);

    // Store new chord
    cf.activeNotes = voiced;

    // Play chord with humanization (velocity + roll/strum)
    if (cf.arpMode !== 'off') {
        // Arp mode: play initial chord strike, then start arpeggiator
        cfPlayChordHumanized(cf, voiced);
        cf.arpNotes = cfBuildArpNotes(voiced);
        cf.arpIndex = 0;
        cf.arpDirection = 1;
        // Start arp after a beat (let chord ring first)
        const beatMs = 60000 / state.bpm;
        setTimeout(() => {
            // Release the chord, arp will take over
            voiced.forEach(n => cf.rhodes.noteOff(n));
            cfStartArp(cf);
        }, beatMs);
    } else {
        // Normal chord play
        cfPlayChordHumanized(cf, voiced);

        // Start rhythm pattern if not sustain
        if (cf.rhythmPattern > 0) {
            cfStartRhythm(cf);
        } else {
            // Auto-release after 1.5s (sustain feel)
            setTimeout(() => {
                voiced.forEach(n => cf.rhodes.noteOff(n));
                if (cf.activeNotes === voiced) cf.activeNotes = [];
            }, 1500);
        }
    }

    // Update state for voice leading
    cf.prevVoicing = voiced;
    cf.activePadRow = row;
    cf.activePadCol = col;

    // Compute glow for next press
    const pitchClasses = voiced.map(n => n % 12);
    cf.glowGrid = ChordFieldEngine.computeGlowGrid(
        pitchClasses, cf.key, ChordFieldEngine.MODE_ORDER[cf.modeIndex], null
    );

    // Update display label
    const rootName = CF_NOTE_NAMES[root];
    cf.lastChordLabel = `${rootName}${ChordFieldEngine.getQualitySuffix(quality)}`;

    updateChordFieldUI();
    renderGrid();  // renderGrid calls updateLaunchpadLEDs internally
}

function renderChordFieldPad(pad, row, col) {
    const cf = chordFieldState;
    const { root, quality } = cfGetPadInfo(row, col);

    // Get glow level
    let glowLevel = 0;
    if (cf.glowGrid) {
        glowLevel = cf.glowGrid[row * 8 + col] || 0;
    }

    const isActive = (cf.activePadRow === row && cf.activePadCol === col);
    const hasGlow = cf.glowGrid !== null;

    // Color from glow level (or uniform base before first press)
    const bgColor = hasGlow ? CF_GLOW_CSS[glowLevel] : CF_BASE_COLOR;
    const borderColor = hasGlow ? CF_GLOW_BORDER[glowLevel] : CF_BASE_BORDER;

    // Build CSS
    pad.style.background = bgColor;
    pad.style.opacity = isActive ? 1.0 : (hasGlow ? CF_GLOW_OPACITY[glowLevel] : 0.7);
    pad.style.transition = 'all 0.15s ease';

    // Show chord label
    const rootName = CF_NOTE_NAMES[root];
    const suffix = ChordFieldEngine.getQualitySuffix(quality);
    pad.textContent = rootName + suffix;
    pad.style.fontSize = '9px';
    pad.style.color = glowLevel >= 2 ? '#1a1a2e' : '#fff';

    // Glow ring + active highlight
    if (isActive) {
        pad.style.borderColor = 'rgba(255, 220, 100, 0.9)';
        pad.style.boxShadow = '0 0 18px rgba(255, 220, 100, 0.7), inset 0 0 8px rgba(255, 220, 100, 0.25)';
    } else if (glowLevel === 3) {
        pad.style.borderColor = CF_GLOW_BORDER[3];
        pad.style.boxShadow = '0 0 14px rgba(255, 240, 180, 0.5)';
    } else if (glowLevel === 2) {
        pad.style.borderColor = CF_GLOW_BORDER[2];
        pad.style.boxShadow = '0 0 8px rgba(180, 160, 60, 0.3)';
    } else if (glowLevel === 1) {
        pad.style.borderColor = borderColor;
        pad.style.boxShadow = '0 0 3px rgba(80, 120, 160, 0.15)';
    } else {
        pad.style.borderColor = borderColor;
        pad.style.boxShadow = 'none';
    }
}

function renderChordFieldSideButtons() {
    const container = document.getElementById('side-buttons');
    const buttons = container.querySelectorAll('.side-btn');
    const cf = chordFieldState;

    buttons.forEach((btn, i) => {
        btn.className = 'side-btn';
        const voicingName = ChordFieldEngine.VOICING_TYPES[i] || '—';
        const isActive = i === cf.voicingIndex;

        if (isActive) {
            btn.classList.add('selected');
            btn.style.background = 'var(--accent)';
            btn.style.borderLeftColor = 'var(--accent)';
            btn.style.color = 'var(--bg-primary)';
        } else {
            btn.style.background = '';
            btn.style.borderLeftColor = 'rgba(120,130,150,0.3)';
            btn.style.color = 'var(--text-secondary)';
        }

        // Capitalize first letter
        btn.innerHTML = `<span>${voicingName.charAt(0).toUpperCase() + voicingName.slice(1)}</span>`;
    });
}

function updateChordFieldUI() {
    const cf = chordFieldState;
    const modeName = ChordFieldEngine.MODE_ORDER[cf.modeIndex];
    const keyName = CF_NOTE_NAMES[cf.key];

    const keyLabel = document.getElementById('cf-key-label');
    const modeLabel = document.getElementById('cf-mode-label');
    const voicingLabel = document.getElementById('cf-voicing-label');
    const chordLabel = document.getElementById('cf-chord-label');
    const notesLabel = document.getElementById('cf-notes-label');

    if (keyLabel) keyLabel.textContent = `${keyName} ${modeName.charAt(0).toUpperCase() + modeName.slice(1)}`;
    if (modeLabel) modeLabel.textContent = modeName.charAt(0).toUpperCase() + modeName.slice(1);
    if (voicingLabel) voicingLabel.textContent = ChordFieldEngine.VOICING_TYPES[cf.voicingIndex];
    if (chordLabel) chordLabel.textContent = cf.lastChordLabel || '—';
    if (notesLabel) {
        notesLabel.textContent = cf.activeNotes.length > 0
            ? cf.activeNotes.map(n => ChordFieldEngine.midiToNoteName(n)).join(' ')
            : '';
    }

    renderChordFieldSideButtons();
}

function handleChordFieldCC(buttonIdx) {
    const cf = chordFieldState;
    switch (buttonIdx) {
        case 0: // Up — octave up
            cf.octaveOffset = Math.min(2, cf.octaveOffset + 1);
            console.log(`[ChordField] Octave offset: ${cf.octaveOffset}`);
            break;
        case 1: // Down — octave down
            cf.octaveOffset = Math.max(-2, cf.octaveOffset - 1);
            console.log(`[ChordField] Octave offset: ${cf.octaveOffset}`);
            break;
        case 2: // Left — key down (semitone)
            cf.key = (cf.key + 11) % 12;
            cf.prevVoicing = null; // reset voice leading on key change
            cf.glowGrid = null;
            console.log(`[ChordField] Key: ${CF_NOTE_NAMES[cf.key]}`);
            break;
        case 3: // Right — key up (semitone)
            cf.key = (cf.key + 1) % 12;
            cf.prevVoicing = null;
            cf.glowGrid = null;
            console.log(`[ChordField] Key: ${CF_NOTE_NAMES[cf.key]}`);
            break;
        case 4: // Session — toggle mode (back to seq)
            setMode('seq');
            return;
        case 5: // User 1 — brighter mode
            cf.modeIndex = Math.max(0, cf.modeIndex - 1);
            cf.prevVoicing = null;
            cf.glowGrid = null;
            console.log(`[ChordField] Mode: ${ChordFieldEngine.MODE_ORDER[cf.modeIndex]}`);
            break;
        case 6: // User 2 — darker mode
            cf.modeIndex = Math.min(6, cf.modeIndex + 1);
            cf.prevVoicing = null;
            cf.glowGrid = null;
            console.log(`[ChordField] Mode: ${ChordFieldEngine.MODE_ORDER[cf.modeIndex]}`);
            break;
        case 7: // Mixer — root rotation (circle of 4ths)
            cf.rootRotation = (cf.rootRotation + 1) % 7;
            cf.glowGrid = null;
            console.log(`[ChordField] Root rotation: ${cf.rootRotation}`);
            break;
    }
    updateChordFieldUI();
    renderGrid();
}

function handleChordFieldSideButton(index) {
    if (index < ChordFieldEngine.VOICING_TYPES.length) {
        chordFieldState.voicingIndex = index;
        console.log(`[ChordField] Voicing: ${ChordFieldEngine.VOICING_TYPES[index]}`);
        updateChordFieldUI();
    }
}

function getChordFieldLPColor(digitalRow, digitalCol) {
    const cf = chordFieldState;

    // Active pad: bright white
    if (cf.activePadRow === digitalRow && cf.activePadCol === digitalCol) {
        return LP_COLOR.WHITE;
    }

    // Before first press, show uniform base color
    if (!cf.glowGrid) return CF_LP_BASE_COLOR;

    // With glow grid, use tiered brightness
    const glow = cf.glowGrid[digitalRow * 8 + digitalCol] || 0;
    return CF_LP_GLOW_COLORS[Math.min(glow, 3)];
}

function getChordFieldSideLPColor(index) {
    return index === chordFieldState.voicingIndex ? LP_COLOR.WHITE : LP_COLOR.WHITE_DIM;
}

function setupChordFieldListeners() {
    // Key controls
    const cfKeyDown = document.getElementById('cf-key-down');
    const cfKeyUp = document.getElementById('cf-key-up');
    const cfModeDown = document.getElementById('cf-mode-down');
    const cfModeUp = document.getElementById('cf-mode-up');

    if (cfKeyDown) cfKeyDown.addEventListener('click', () => {
        chordFieldState.key = (chordFieldState.key + 11) % 12;
        chordFieldState.prevVoicing = null;
        chordFieldState.glowGrid = null;
        cfStopPlayback(chordFieldState);
        updateChordFieldUI();
        renderGrid();
    });
    if (cfKeyUp) cfKeyUp.addEventListener('click', () => {
        chordFieldState.key = (chordFieldState.key + 1) % 12;
        chordFieldState.prevVoicing = null;
        chordFieldState.glowGrid = null;
        cfStopPlayback(chordFieldState);
        updateChordFieldUI();
        renderGrid();
    });
    if (cfModeDown) cfModeDown.addEventListener('click', () => {
        chordFieldState.modeIndex = Math.min(6, chordFieldState.modeIndex + 1);
        chordFieldState.prevVoicing = null;
        chordFieldState.glowGrid = null;
        cfStopPlayback(chordFieldState);
        updateChordFieldUI();
        renderGrid();
    });
    if (cfModeUp) cfModeUp.addEventListener('click', () => {
        chordFieldState.modeIndex = Math.max(0, chordFieldState.modeIndex - 1);
        chordFieldState.prevVoicing = null;
        chordFieldState.glowGrid = null;
        cfStopPlayback(chordFieldState);
        updateChordFieldUI();
        renderGrid();
    });

    // ── Humanization Controls ──

    const cfVelocityBtn = document.getElementById('cf-velocity-toggle');
    const cfRollBtn = document.getElementById('cf-roll-cycle');
    const cfRhythmBtn = document.getElementById('cf-rhythm-cycle');
    const cfArpBtn = document.getElementById('cf-arp-cycle');
    const cfArpRateBtn = document.getElementById('cf-arp-rate');

    if (cfVelocityBtn) cfVelocityBtn.addEventListener('click', () => {
        const cf = chordFieldState;
        cf.velocityMode = cf.velocityMode === 'fixed' ? 'humanize' : 'fixed';
        cfVelocityBtn.textContent = cf.velocityMode === 'humanize' ? '🎯 Humanize' : '🎯 Fixed';
        cfVelocityBtn.classList.toggle('active', cf.velocityMode === 'humanize');
    });

    if (cfRollBtn) cfRollBtn.addEventListener('click', () => {
        const cf = chordFieldState;
        const modes = ['off', 'roll', 'strum'];
        const labels = ['✋ Off', '🌊 Roll', '🎸 Strum'];
        const idx = (modes.indexOf(cf.rollMode) + 1) % modes.length;
        cf.rollMode = modes[idx];
        cfRollBtn.textContent = labels[idx];
        cfRollBtn.classList.toggle('active', cf.rollMode !== 'off');
    });

    if (cfRhythmBtn) cfRhythmBtn.addEventListener('click', () => {
        const cf = chordFieldState;
        cfStopPlayback(cf);
        cf.rhythmPattern = (cf.rhythmPattern + 1) % CF_RHYTHM_PATTERNS.length;
        const name = CF_RHYTHM_PATTERNS[cf.rhythmPattern].name;
        cfRhythmBtn.textContent = '🥁 ' + name;
        cfRhythmBtn.classList.toggle('active', cf.rhythmPattern > 0);
    });

    if (cfArpBtn) cfArpBtn.addEventListener('click', () => {
        const cf = chordFieldState;
        cfStopPlayback(cf);
        const idx = (CF_ARP_MODES.indexOf(cf.arpMode) + 1) % CF_ARP_MODES.length;
        cf.arpMode = CF_ARP_MODES[idx];
        const label = cf.arpMode === 'off' ? 'Arp Off' : 'Arp ' + cf.arpMode.charAt(0).toUpperCase() + cf.arpMode.slice(1);
        cfArpBtn.textContent = '🎹 ' + label;
        cfArpBtn.classList.toggle('active', cf.arpMode !== 'off');
        // Show/hide rate button
        if (cfArpRateBtn) cfArpRateBtn.style.display = cf.arpMode !== 'off' ? '' : 'none';
    });

    if (cfArpRateBtn) cfArpRateBtn.addEventListener('click', () => {
        const cf = chordFieldState;
        cfStopPlayback(cf);
        const idx = (CF_ARP_RATES.indexOf(cf.arpRate) + 1) % CF_ARP_RATES.length;
        cf.arpRate = CF_ARP_RATES[idx];
        cfArpRateBtn.textContent = '♪ ' + cf.arpRate;
    });
}

// Web CSS colors for ADSR
const ADSR_CSS_COLORS = {
    attack: { bright: '#ffaa33', dim: '#553311' },
    decay: { bright: '#ff6633', dim: '#551a11' },
    sustain: { bright: '#33ff88', dim: '#114422' },
    release: { bright: '#3388ff', dim: '#112244' },
};

// ── Web Grid Rendering ──

function renderSampleEditPad(pad, row, col) {
    const trackIndex = state.currentTrack;
    const trackColor = TRACK_COLORS[trackIndex] || '#00e8a0';
    const trackColorDim = TRACK_COLORS_DIM[trackIndex] || '#004430';
    const hasSample = window.audioEngine && window.audioEngine.hasSample(trackIndex);

    if (row <= 4) {
        // ── Waveform rows ──
        if (!hasSample) {
            pad.style.background = 'rgba(15, 15, 25, 0.6)';
            pad.style.borderColor = 'rgba(255, 255, 255, 0.05)';
            if (row === 2 && col === 3) pad.textContent = 'NO';
            if (row === 2 && col === 4) pad.textContent = 'SMP';
            return;
        }

        const amps = getSampleAmplitudes(trackIndex);
        if (!amps) { pad.style.background = 'rgba(15, 15, 25, 0.4)'; return; }

        const sample = window.audioEngine.trackSamples[trackIndex];
        const colNorm = col / 8; // normalized position (0-1) for this column
        const colNormEnd = (col + 1) / 8;
        const inActive = colNorm >= sample.startOffset && colNormEnd <= sample.endOffset + 0.001;
        const isInCol = Math.floor(sample.startOffset * 8) === col;
        const isOutCol = Math.min(7, Math.floor(sample.endOffset * 8 - 0.001)) === col;

        // How many rows should be lit (from bottom=row4 up)
        const barHeight = Math.round(amps[col] * 5); // 0-5
        const rowFromBottom = 4 - row; // row4=0, row3=1, row2=2, row1=3, row0=4

        if (rowFromBottom < barHeight) {
            // Lit pad
            if (isInCol && row === 4) {
                pad.style.background = '#ff4444';
                pad.style.boxShadow = '0 0 12px rgba(255, 68, 68, 0.6)';
            } else if (isOutCol && row === 4) {
                pad.style.background = '#4488ff';
                pad.style.boxShadow = '0 0 12px rgba(68, 136, 255, 0.6)';
            } else if (inActive) {
                const brightness = 0.5 + (rowFromBottom / 5) * 0.5;
                pad.style.background = trackColor;
                pad.style.opacity = brightness;
                pad.style.boxShadow = `0 0 8px ${trackColor}40`;
            } else {
                pad.style.background = trackColorDim;
                pad.style.opacity = '0.3';
            }
            pad.style.borderColor = inActive ? `${trackColor}60` : 'rgba(255,255,255,0.05)';
        } else {
            // Unlit pad
            pad.style.background = inActive ? `${trackColor}10` : 'rgba(10, 10, 20, 0.5)';
            pad.style.borderColor = 'rgba(255, 255, 255, 0.03)';
            // Show IN/OUT markers even on unlit base row
            if (row === 4) {
                if (isInCol) {
                    pad.style.background = '#ff444430';
                    pad.style.borderColor = '#ff444460';
                } else if (isOutCol) {
                    pad.style.background = '#4488ff30';
                    pad.style.borderColor = '#4488ff60';
                }
            }
        }

    } else if (row === 5) {
        // ── ADSR curve row ──
        if (!hasSample) { pad.style.background = 'rgba(15, 15, 25, 0.4)'; return; }
        const curve = getADSRCurveValues(trackIndex);
        const height = curve[col];
        const brightness = 0.15 + height * 0.85;
        pad.style.background = trackColor;
        pad.style.opacity = brightness;
        pad.style.borderColor = `${trackColor}40`;
        pad.style.boxShadow = height > 0.5 ? `0 0 6px ${trackColor}30` : 'none';

        // Label the ADSR phases
        const adsr = hasSample ? window.audioEngine.trackSamples[trackIndex].adsr : null;
        if (adsr) {
            const total = adsr.attack + adsr.decay + 0.2 + adsr.release;
            const t = (col / 7) * total;
            if (t <= adsr.attack) pad.textContent = '';
            else if (t <= adsr.attack + adsr.decay) pad.textContent = '';
        }

    } else if (row === 6) {
        // ── ADSR parameter controls ──
        const paramIdx = Math.floor(col / 2);
        const param = ADSR_PARAM_ORDER[paramIdx];
        const isSelected = sampleEditState.selectedParam === param;
        const isDecrease = col % 2 === 0;
        const colors = ADSR_CSS_COLORS[param];

        pad.style.background = isSelected ? colors.bright : colors.dim;
        pad.style.borderColor = isSelected ? `${colors.bright}80` : 'rgba(255,255,255,0.08)';
        pad.style.boxShadow = isSelected ? `0 0 12px ${colors.bright}40` : 'none';
        pad.textContent = isDecrease ? '−' : '+';
        pad.style.color = isSelected ? '#000' : 'rgba(255,255,255,0.5)';
        pad.style.fontSize = '14px';
        pad.style.fontWeight = 'bold';

    } else if (row === 7) {
        // ── Bottom row: LS and RS handled globally, middle = preview ──
        if (col >= 3 && col <= 4) {
            pad.style.background = hasSample ? `${trackColor}60` : 'rgba(30,30,50,0.5)';
            pad.style.borderColor = `${trackColor}30`;
            pad.textContent = '▶';
            pad.style.fontSize = '12px';
        }
    }
}

// ── Sample Mode Click Handler ──

function handleSamplePadPress(row, col) {
    const trackIndex = state.currentTrack;
    const hasSample = window.audioEngine && window.audioEngine.hasSample(trackIndex);
    if (!hasSample && row <= 5) return;

    if (row <= 4) {
        // ── Waveform tap: move nearest IN or OUT marker ──
        const sample = window.audioEngine.trackSamples[trackIndex];
        const tapPos = (col + 0.5) / 8; // center of this column (0-1)

        const distToStart = Math.abs(tapPos - sample.startOffset);
        const distToEnd = Math.abs(tapPos - sample.endOffset);

        if (distToStart <= distToEnd) {
            // Move IN marker (snap to column boundary)
            const newStart = col / 8;
            if (newStart < sample.endOffset) {
                window.audioEngine.setStartOffset(trackIndex, newStart);
            }
        } else {
            // Move OUT marker
            const newEnd = (col + 1) / 8;
            if (newEnd > sample.startOffset) {
                window.audioEngine.setEndOffset(trackIndex, newEnd);
            }
        }

        drawEditorWaveform(); // sync the web editor panel
        renderGrid();

    } else if (row === 5) {
        // ── ADSR curve tap: could audition with envelope ──
        // For now, just preview
        if (hasSample) {
            window.audioEngine.playSample(trackIndex, 127);
        }

    } else if (row === 6) {
        // ── ADSR parameter adjust ──
        const paramIdx = Math.floor(col / 2);
        const param = ADSR_PARAM_ORDER[paramIdx];
        const isDecrease = col % 2 === 0;
        sampleEditState.selectedParam = param;

        const adsr = window.audioEngine.trackSamples[trackIndex].adsr;

        // Step sizes
        const steps = { attack: 0.02, decay: 0.02, sustain: 0.05, release: 0.02 };
        const maxes = { attack: 2.0, decay: 2.0, sustain: 1.0, release: 3.0 };
        const mins = { attack: 0.001, decay: 0.001, sustain: 0.0, release: 0.001 };

        if (isDecrease) {
            adsr[param] = Math.max(mins[param], adsr[param] - steps[param]);
        } else {
            adsr[param] = Math.min(maxes[param], adsr[param] + steps[param]);
        }

        // Sync to web editor sliders
        updateADSRSliders();
        drawADSRVisualizer();
        renderGrid();

    } else if (row === 7 && (col === 3 || col === 4)) {
        // ── Preview button ──
        if (hasSample) {
            window.audioEngine.playSample(trackIndex, 127);
        }
    }
}

// ── LP Color for Sample Mode ──

function getSampleEditLPColor(row, col, trackIndex) {
    const trackColor = LP_TRACK_COLORS[trackIndex % LP_TRACK_COLORS.length];
    const hasSample = window.audioEngine && window.audioEngine.hasSample(trackIndex);

    if (row <= 4) {
        // Waveform
        if (!hasSample) return LP_COLOR.OFF;
        const amps = getSampleAmplitudes(trackIndex);
        if (!amps) return LP_COLOR.OFF;

        const sample = window.audioEngine.trackSamples[trackIndex];
        const colNorm = col / 8;
        const colNormEnd = (col + 1) / 8;
        const inActive = colNorm >= sample.startOffset && colNormEnd <= sample.endOffset + 0.001;
        const isInCol = Math.floor(sample.startOffset * 8) === col;
        const isOutCol = Math.min(7, Math.floor(sample.endOffset * 8 - 0.001)) === col;

        const barHeight = Math.round(amps[col] * 5);
        const rowFromBottom = 4 - row;

        if (rowFromBottom < barHeight) {
            // Lit
            if (isInCol && row === 4) return 5;  // red
            if (isOutCol && row === 4) return 45; // blue
            if (inActive) return trackColor;
            return LP_COLOR.WHITE_DIM;
        } else {
            // Unlit
            if (row === 4 && isInCol) return 7;   // dim red
            if (row === 4 && isOutCol) return 47;  // dim blue
            return LP_COLOR.OFF;
        }

    } else if (row === 5) {
        // ADSR curve
        if (!hasSample) return LP_COLOR.OFF;
        const curve = getADSRCurveValues(trackIndex);
        const height = curve[col];
        // Map height to brightness: use track color if high, dim if low
        if (height > 0.7) return trackColor;
        if (height > 0.4) return LP_COLOR.WARM_WHITE;
        if (height > 0.15) return LP_COLOR.WHITE_DIM;
        return LP_COLOR.OFF;

    } else if (row === 6) {
        // ADSR params
        const paramIdx = Math.floor(col / 2);
        const param = ADSR_PARAM_ORDER[paramIdx];
        const isSelected = sampleEditState.selectedParam === param;
        const colors = ADSR_COLORS[param];
        return isSelected ? colors.bright : colors.dim;

    } else if (row === 7) {
        if (col === 3 || col === 4) return hasSample ? trackColor : LP_COLOR.OFF;
        return LP_COLOR.OFF;
    }

    return LP_COLOR.OFF;
}

// ──────────────────────────────────────────────
// SAMPLE EDITOR (Web Panel)
// ──────────────────────────────────────────────

function drawEditorWaveform() {
    const canvas = document.getElementById('editor-waveform');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = 80 * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const width = rect.width;
    const height = 80;

    ctx.clearRect(0, 0, width, height);

    const trackIndex = state.currentTrack;
    if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No sample loaded', width / 2, height / 2 + 4);
        return;
    }

    const sample = window.audioEngine.trackSamples[trackIndex];
    const data = sample.waveformData;
    if (!data) return;

    const trackColor = window.TRACK_COLORS ? window.TRACK_COLORS[trackIndex] : '#00e8a0';
    const startX = sample.startOffset * width;
    const endX = sample.endOffset * width;

    // Dimmed background
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, width, height);

    // Active region background
    ctx.fillStyle = `${trackColor}15`;
    ctx.fillRect(startX, 0, endX - startX, height);

    // Draw waveform bars
    const barWidth = width / data.length;
    for (let i = 0; i < data.length; i++) {
        const x = i * barWidth;
        const barH = data[i] * height * 0.85;
        const y = (height - barH) / 2;
        const normalized = i / data.length;

        if (normalized < sample.startOffset || normalized > sample.endOffset) {
            ctx.globalAlpha = 0.12;
        } else {
            ctx.globalAlpha = 0.7;
        }
        ctx.fillStyle = trackColor;
        ctx.fillRect(x + 0.5, y, Math.max(barWidth - 1, 1), barH);
    }
    ctx.globalAlpha = 1;

    // Start marker
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.stroke();

    // Start handle triangle
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX + 8, 0);
    ctx.lineTo(startX, 10);
    ctx.closePath();
    ctx.fill();

    // End marker
    ctx.strokeStyle = '#44aaff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();

    // End handle triangle
    ctx.fillStyle = '#44aaff';
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX - 8, 0);
    ctx.lineTo(endX, 10);
    ctx.closePath();
    ctx.fill();

    // Update time labels
    const duration = sample.buffer ? sample.buffer.duration : 0;
    const startLabel = document.getElementById('editor-start-time');
    const endLabel = document.getElementById('editor-end-time');
    if (startLabel) startLabel.textContent = `IN: ${(sample.startOffset * duration).toFixed(3)}s`;
    if (endLabel) endLabel.textContent = `OUT: ${(sample.endOffset * duration).toFixed(3)}s`;
}

function setupEditorWaveformDrag() {
    const canvas = document.getElementById('editor-waveform');
    if (!canvas) return;

    let dragging = null; // 'start' | 'end' | null

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const trackIndex = state.currentTrack;
        if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) return;
        const sample = window.audioEngine.trackSamples[trackIndex];

        // Detect proximity to start or end marker (within 3% of width)
        const startDist = Math.abs(x - sample.startOffset);
        const endDist = Math.abs(x - sample.endOffset);

        if (startDist < 0.03 || (startDist < endDist && x < (sample.startOffset + sample.endOffset) / 2)) {
            dragging = 'start';
        } else {
            dragging = 'end';
        }

        updateMarker(e);
    });

    function updateMarker(e) {
        const rect = canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const trackIndex = state.currentTrack;
        if (!window.audioEngine) return;

        if (dragging === 'start') {
            window.audioEngine.setStartOffset(trackIndex, x);
        } else if (dragging === 'end') {
            window.audioEngine.setEndOffset(trackIndex, x);
        }
        drawEditorWaveform();
    }

    document.addEventListener('mousemove', (e) => {
        if (dragging) updateMarker(e);
    });

    document.addEventListener('mouseup', () => {
        dragging = null;
    });
}

function drawADSRVisualizer() {
    const canvas = document.getElementById('adsr-visualizer');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : { width: 240 };
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = 50 * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const width = rect.width;
    const height = 50;

    ctx.clearRect(0, 0, width, height);

    const trackIndex = state.currentTrack;
    if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) return;

    const sample = window.audioEngine.trackSamples[trackIndex];
    const adsr = sample.adsr;
    const trackColor = window.TRACK_COLORS ? window.TRACK_COLORS[trackIndex] : '#00e8a0';

    // Normalize to fit canvas
    const totalTime = adsr.attack + adsr.decay + 0.2 + adsr.release; // 0.2 = sustain hold
    const pad = 4;
    const drawW = width - pad * 2;
    const drawH = height - pad * 2;

    const aX = pad + (adsr.attack / totalTime) * drawW;
    const dX = aX + (adsr.decay / totalTime) * drawW;
    const sX = dX + (0.2 / totalTime) * drawW;
    const rX = sX + (adsr.release / totalTime) * drawW;

    // Fill under curve
    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    ctx.lineTo(aX, pad);                              // Attack
    ctx.lineTo(dX, pad + drawH * (1 - adsr.sustain)); // Decay to sustain
    ctx.lineTo(sX, pad + drawH * (1 - adsr.sustain)); // Sustain hold
    ctx.lineTo(rX, height - pad);                      // Release
    ctx.lineTo(pad, height - pad);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, `${trackColor}40`);
    grad.addColorStop(1, `${trackColor}05`);
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw curve
    ctx.beginPath();
    ctx.moveTo(pad, height - pad);
    ctx.lineTo(aX, pad);
    ctx.lineTo(dX, pad + drawH * (1 - adsr.sustain));
    ctx.lineTo(sX, pad + drawH * (1 - adsr.sustain));
    ctx.lineTo(rX, height - pad);
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Dots at inflection points
    [
        [pad, height - pad],
        [aX, pad],
        [dX, pad + drawH * (1 - adsr.sustain)],
        [sX, pad + drawH * (1 - adsr.sustain)],
        [rX, height - pad],
    ].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = trackColor;
        ctx.fill();
    });

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', (pad + aX) / 2, height - 2);
    ctx.fillText('D', (aX + dX) / 2, height - 2);
    ctx.fillText('S', (dX + sX) / 2, height - 2);
    ctx.fillText('R', (sX + rX) / 2, height - 2);
}

function updateSampleEditor() {
    drawEditorWaveform();
    drawADSRVisualizer();
    updateADSRSliders();
}

function updateADSRSliders() {
    const trackIndex = state.currentTrack;
    if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) return;
    const adsr = window.audioEngine.trackSamples[trackIndex].adsr;

    const attackEl = document.getElementById('adsr-attack');
    const decayEl = document.getElementById('adsr-decay');
    const sustainEl = document.getElementById('adsr-sustain');
    const releaseEl = document.getElementById('adsr-release');

    if (attackEl) attackEl.value = adsr.attack * 1000;
    if (decayEl) decayEl.value = adsr.decay * 1000;
    if (sustainEl) sustainEl.value = adsr.sustain * 100;
    if (releaseEl) releaseEl.value = adsr.release * 1000;

    updateADSRLabels();
}

function updateADSRLabels() {
    const attackEl = document.getElementById('adsr-attack');
    const decayEl = document.getElementById('adsr-decay');
    const sustainEl = document.getElementById('adsr-sustain');
    const releaseEl = document.getElementById('adsr-release');

    const fmt = (ms) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
    if (attackEl) document.getElementById('adsr-attack-val').textContent = fmt(attackEl.value);
    if (decayEl) document.getElementById('adsr-decay-val').textContent = fmt(decayEl.value);
    if (sustainEl) document.getElementById('adsr-sustain-val').textContent = `${Math.round(sustainEl.value)}%`;
    if (releaseEl) document.getElementById('adsr-release-val').textContent = fmt(releaseEl.value);
}

function setupSampleEditorListeners() {
    // Toggle panel
    const toggleBtn = document.getElementById('btn-sample-editor-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const editor = document.getElementById('sample-editor');
            editor.classList.toggle('collapsed');
            if (!editor.classList.contains('collapsed')) {
                updateSampleEditor();
            }
        });
    }

    // ADSR sliders
    ['attack', 'decay', 'sustain', 'release'].forEach(param => {
        const el = document.getElementById(`adsr-${param}`);
        if (!el) return;
        el.addEventListener('input', () => {
            const trackIndex = state.currentTrack;
            if (!window.audioEngine || !window.audioEngine.hasSample(trackIndex)) return;
            const adsr = window.audioEngine.trackSamples[trackIndex].adsr;

            if (param === 'sustain') {
                adsr.sustain = el.value / 100;
            } else {
                adsr[param] = el.value / 1000; // ms → seconds
            }
            updateADSRLabels();
            drawADSRVisualizer();
        });
    });

    // Waveform drag for in/out points
    setupEditorWaveformDrag();
}

// ──────────────────────────────────────────────
// EVENT BINDINGS
// ──────────────────────────────────────────────

function setupEventListeners() {
    // Global mouseup to cancel REC hold (erase) if mouse leaves pad
    document.addEventListener('mouseup', () => {
        if (state.recHeld) {
            state.recHeld = false;
            console.log('🔴 REC released (global) — erase stopped');
        }
    });

    // Transport
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.getElementById('btn-stop').addEventListener('click', stop);

    // Metronome
    document.getElementById('btn-metronome').addEventListener('click', toggleMetronome);

    // BPM
    document.getElementById('bpm-input').addEventListener('change', (e) => {
        state.bpm = Math.max(20, Math.min(300, parseInt(e.target.value) || 120));
        e.target.value = state.bpm;
        updateClockTempo();
    });

    // Clock source
    document.getElementById('clock-source').addEventListener('change', (e) => {
        state.clockSource = e.target.value;
        if (state.clockSource === 'internal' && state.playing) {
            startInternalClock();
        } else {
            stopInternalClock();
        }
    });

    // MIDI selects
    document.getElementById('midi-output-select').addEventListener('change', (e) => selectMidiOutput(e.target.value));
    document.getElementById('midi-input-select').addEventListener('change', (e) => selectMidiInput(e.target.value));

    // Top controls
    document.getElementById('ctrl-up').addEventListener('click', () => cycleSmallGridMode('up'));
    document.getElementById('ctrl-down').addEventListener('click', () => cycleSmallGridMode('down'));
    document.getElementById('ctrl-left').addEventListener('click', shiftPatternLeft);
    document.getElementById('ctrl-right').addEventListener('click', shiftPatternRight);
    document.getElementById('ctrl-mode').addEventListener('click', toggleMode);
    document.getElementById('ctrl-session').addEventListener('click', () => {
        state.workspace = (state.workspace + 1) % 3;
        renderGrid();
    });
    document.getElementById('ctrl-page0').addEventListener('click', () => changePage(0));
    document.getElementById('ctrl-page1').addEventListener('click', () => changePage(1));

    // Mode buttons
    document.getElementById('btn-mode-seq').addEventListener('click', () => setMode('seq'));
    document.getElementById('btn-mode-chords').addEventListener('click', () => setMode('chords'));
    document.getElementById('btn-mode-harmony').addEventListener('click', () => setMode('harmony'));
    document.getElementById('btn-mode-sample').addEventListener('click', () => setMode('sample'));
    document.getElementById('btn-mode-chordfield').addEventListener('click', () => setMode('chordfield'));

    // Harmony controls
    setupHarmonyListeners();

    // Chord Field controls
    setupChordFieldListeners();

    // Scene buttons
    document.querySelectorAll('.scene-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sceneIdx = parseInt(btn.dataset.scene);
            if (state.copyMode === 'scene') {
                executeCopy(sceneIdx);
            } else {
                changeScene(sceneIdx);
            }
        });
    });

    // Page buttons
    document.getElementById('btn-page-0').addEventListener('click', () => changePage(0));
    document.getElementById('btn-page-1').addEventListener('click', () => changePage(1));

    // Tempo modifier buttons
    document.querySelectorAll('.tempo-mod-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tempo = parseFloat(btn.dataset.tempo);
            getCurrentTrack().tempoModifier = tempo;
            renderAll();
        });
    });

    // Track length slider
    document.getElementById('track-length-slider').addEventListener('input', (e) => {
        const len = parseInt(e.target.value);
        changeTrackLength(len);
        document.getElementById('track-length-value').textContent = len;
    });

    // Copy buttons
    document.getElementById('btn-copy-step').addEventListener('click', () => startCopy('step'));
    document.getElementById('btn-copy-track').addEventListener('click', () => startCopy('track'));
    document.getElementById('btn-copy-scene').addEventListener('click', () => startCopy('scene'));

    // Pattern buttons
    document.getElementById('btn-shift-left').addEventListener('click', shiftPatternLeft);
    document.getElementById('btn-shift-right').addEventListener('click', shiftPatternRight);
    document.getElementById('btn-random').addEventListener('click', randomPattern);
    document.getElementById('btn-clear').addEventListener('click', clearPattern);

    // Save / Load
    document.getElementById('btn-save').addEventListener('click', saveProject);
    document.getElementById('btn-load').addEventListener('click', loadProject);

    // ── Sample Browser ──
    document.getElementById('btn-open-folder').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.audioEngine.init();
        const success = await window.audioEngine.openSamplesFolder();
        if (success) {
            // Auto-expand browser
            document.getElementById('sample-browser').classList.remove('collapsed');
            renderBrowserFileList();
            renderBreadcrumbs();
        }
    });

    // Scan All — recursively scan every subfolder
    document.getElementById('btn-scan-all').addEventListener('click', async (e) => {
        e.stopPropagation();
        const engine = window.audioEngine;

        if (!engine || !engine.directoryHandle) {
            // If no folder open yet, open one first
            await engine.init();
            const success = await engine.openSamplesFolder();
            if (!success) return;
        }

        // Show progress bar
        const progressEl = document.getElementById('scan-progress');
        const progressFill = progressEl.querySelector('.scan-progress-fill');
        const progressText = progressEl.querySelector('.scan-progress-text');
        const scanBtn = document.getElementById('btn-scan-all');

        progressEl.classList.remove('hidden');
        scanBtn.classList.add('scanning');
        progressFill.style.width = '20%';
        progressText.textContent = 'Scanning folders...';

        // Ensure browser is expanded
        document.getElementById('sample-browser').classList.remove('collapsed');

        await engine.scanAllRecursive((progress) => {
            progressText.textContent = `Scanning... ${progress.scanned} folders, ${progress.found} files found`;
            progressFill.style.width = `${Math.min(90, 20 + progress.scanned * 2)}%`;
        });

        // Done — switch to flat view
        progressFill.style.width = '100%';
        progressText.textContent = `Done! ${engine.flatFileList.length} samples found`;
        scanBtn.classList.remove('scanning');

        engine.scanViewMode = 'flat';
        renderBrowserFileList();
        renderBreadcrumbs();

        // Hide progress after a second
        setTimeout(() => {
            progressEl.classList.add('hidden');
        }, 1500);
    });

    // Toggle folder / flat view
    document.getElementById('btn-view-mode').addEventListener('click', (e) => {
        e.stopPropagation();
        const engine = window.audioEngine;
        if (!engine || !engine.directoryHandle) return;

        if (engine.scanViewMode === 'flat') {
            engine.scanViewMode = 'folder';
        } else if (engine.flatFileList.length > 0) {
            engine.scanViewMode = 'flat';
        }
        renderBrowserFileList();
        renderBreadcrumbs();
    });

    // Search / filter input
    let searchDebounce = null;
    document.getElementById('browser-search-input').addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            const engine = window.audioEngine;
            if (!engine) return;

            // Auto-switch to flat view for searching (search makes most sense against all files)
            if (engine.flatFileList.length > 0 && e.target.value.trim()) {
                engine.scanViewMode = 'flat';
            }
            engine.filterFiles(e.target.value);
            renderBrowserFileList();
            renderBreadcrumbs();
        }, 150);
    });

    document.getElementById('btn-toggle-browser').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSampleBrowser();
    });

    document.getElementById('sample-browser-header')?.addEventListener('click', (e) => {
        // Only toggle if clicking the header itself, not child buttons
        if (!e.target.closest('.sb-action-btn')) {
            toggleSampleBrowser();
        }
    });

    // Sample slot controls
    document.getElementById('sample-gain').addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (window.audioEngine) {
            window.audioEngine.setTrackGain(state.currentTrack, val / 100);
        }
        document.getElementById('sample-gain-value').textContent = `${val}%`;
    });

    document.getElementById('sample-pitch').addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (window.audioEngine) {
            window.audioEngine.setTrackPitch(state.currentTrack, val / 100);
        }
        document.getElementById('sample-pitch-value').textContent = `${(val / 100).toFixed(2)}x`;
    });

    document.getElementById('btn-remove-sample').addEventListener('click', () => {
        if (window.audioEngine) {
            window.audioEngine.removeSample(state.currentTrack);
            updateSampleSlotUI();
            renderTrackList();
            renderSideButtons();
        }
    });

    document.getElementById('master-volume').addEventListener('input', (e) => {
        if (window.audioEngine) {
            window.audioEngine.setMasterVolume(parseInt(e.target.value) / 100);
        }
    });

    // Ensure audio context is resumed on first user interaction
    document.addEventListener('click', () => {
        if (window.audioEngine && window.audioEngine.audioContext) {
            window.audioEngine.resume();
        }
    }, { once: true });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                togglePlay();
                break;
            case 'Escape':
                stop();
                break;
            case 'ArrowLeft':
                shiftPatternLeft();
                break;
            case 'ArrowRight':
                shiftPatternRight();
                break;
            case 'ArrowUp':
                cycleSmallGridMode('up');
                break;
            case 'ArrowDown':
                cycleSmallGridMode('down');
                break;
            case 'KeyM':
                toggleMode();
                break;
            case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4':
                changeScene(parseInt(e.code.slice(-1)) - 1);
                break;
            case 'KeyR':
                randomPattern();
                break;
            case 'KeyC':
                if (e.metaKey || e.ctrlKey) return;
                clearPattern();
                break;
        }
    });
}

// ──────────────────────────────────────────────
// INITIALIZATION
// ──────────────────────────────────────────────

function init() {
    buildGrid();
    buildSideButtons();
    renderAll();
    setupEventListeners();
    setupSampleEditorListeners();
    initMidi();

    // Initialize audio engine reference
    if (window.audioEngine) {
        console.log('[Octadre] Audio engine available');
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
