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
    mode: 'seq', // 'seq' or 'chords'
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
};

let scenes = [createScene(), createScene(), createScene(), createScene()];

// MIDI
let midiAccess = null;
let midiOutput = null;
let midiInput = null;
let clockInterval = null;

// ──────────────────────────────────────────────
// MIDI SETUP
// ──────────────────────────────────────────────

async function initMidi() {
    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });
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
        return;
    }
    midiInput = midiAccess.inputs.get(id);
    midiInput.onmidimessage = handleMidiInput;
}

function handleMidiInput(event) {
    const [status] = event.data;
    // MIDI Clock: 0xF8
    if (status === 0xF8 && state.clockSource === 'midi') {
        state.clockTick++;
        playSequencer();
    }
    // MIDI Start: 0xFA
    if (status === 0xFA) {
        state.clockTick = -1;
        state.currentStep = 0;
        state.playing = true;
        updatePlayButton();
    }
    // MIDI Stop: 0xFC
    if (status === 0xFC) {
        state.playing = false;
        state.clockTick = -1;
        state.currentStep = 0;
        allNotesOff();
        updatePlayButton();
    }
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
        state.currentStep++;
        renderGrid();
    }
    // Send any pending note-ons
    processNoteOns();
    // Clean up expired notes
    cleanupNoteQueue();
}

function triggerAudioSamples() {
    if (!window.audioEngine || !window.audioEngine.initialized) return;

    const sceneIndex = getPlayingScene();
    const scene = scenes[sceneIndex];
    scene.tracks.forEach((track, trackIndex) => {
        const trackStep = Math.floor(state.currentStep * track.tempoModifier);
        const stepIndex = trackStep % track.trackLength;
        const step = track.pattern[stepIndex];
        if (step && step.active && !track.muted && window.audioEngine.hasSample(trackIndex)) {
            window.audioEngine.playSample(trackIndex, step.velocity);
        }
    });
}

function queueMidiNotes() {
    const sceneIndex = getPlayingScene();
    const scene = scenes[sceneIndex];
    scene.tracks.forEach(track => {
        const trackStep = Math.floor(state.currentStep * track.tempoModifier);
        const stepIndex = trackStep % track.trackLength;
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
        const len = 4 / track.tempoModifier;
        state.midiNotesQueue.push({ clockTick, length: len, note, channel: track.channel, velocity: step.velocity });
        state.midiNotesQueue.push({ clockTick: clockTick + len, length: len, note, channel: track.channel, velocity: step.velocity });
        state.midiNotesQueue.push({ clockTick: clockTick + len * 2, length: len, note, channel: track.channel, velocity: step.velocity });
    } else if (step.singleTriplet) {
        const len = 2 / track.tempoModifier;
        state.midiNotesQueue.push({ clockTick, length: len, note, channel: track.channel, velocity: step.velocity });
        state.midiNotesQueue.push({ clockTick: clockTick + len, length: len, note, channel: track.channel, velocity: step.velocity });
        state.midiNotesQueue.push({ clockTick: clockTick + len * 2, length: len, note, channel: track.channel, velocity: step.velocity });
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
    if (track.pattern[stepIndex].triplet) return;

    track.pattern[stepIndex].active = !track.pattern[stepIndex].active;
    track.pattern[stepIndex].doubleNote = false;
    track.pattern[stepIndex].singleTriplet = false;
    state.lastPressedStep = stepIndex;
    renderGrid();
    updateStepInfo();
}

function toggleNote(noteOffset) {
    const track = getCurrentTrack();
    const noteIndex = (state.currentOctave * 12) + noteOffset;
    if (noteIndex >= 96) return;
    track.pattern[state.lastPressedStep].notes[noteIndex] = !track.pattern[state.lastPressedStep].notes[noteIndex];
    renderGrid();
    updateStepInfo();
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

function toggleMode() {
    state.mode = state.mode === 'seq' ? 'chords' : 'seq';
    document.getElementById('btn-mode-seq').classList.toggle('active', state.mode === 'seq');
    document.getElementById('btn-mode-chords').classList.toggle('active', state.mode === 'chords');
    renderGrid();
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
    const data = {
        scenes: scenes,
        state: {
            currentOctave: state.currentOctave,
            bpm: state.bpm,
        }
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'octadre-project.json';
    a.click();
    URL.revokeObjectURL(url);
}

function loadProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                scenes = data.scenes;
                if (data.state) {
                    state.currentOctave = data.state.currentOctave || 5;
                    state.bpm = data.state.bpm || 120;
                    document.getElementById('bpm-input').value = state.bpm;
                }
                renderAll();
            } catch (err) {
                console.error('Failed to load project:', err);
            }
        };
        reader.readAsText(file);
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

            pad.addEventListener('mousedown', (e) => handlePadPress(row, col, e));
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
    // Determine what this pad represents
    const bigGridIndex = BIG_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
    const innerGridIndex = INNER_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);
    const smallGridIndex = SMALL_GRID_POSITIONS.findIndex(([r, c]) => r === row && c === col);

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
        // TODO: implement full chord grid interaction
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
            pad.textContent = '';

            if (state.mode === 'seq') {
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
            }
        }
    }
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

    if (noteIndex < 96 && step.notes[noteIndex]) {
        pad.classList.add('note-active');
    } else {
        pad.classList.add('note-inactive');
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
// EVENT BINDINGS
// ──────────────────────────────────────────────

function setupEventListeners() {
    // Transport
    document.getElementById('btn-play').addEventListener('click', togglePlay);
    document.getElementById('btn-stop').addEventListener('click', stop);

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
    document.getElementById('btn-mode-seq').addEventListener('click', () => {
        if (state.mode !== 'seq') toggleMode();
    });
    document.getElementById('btn-mode-chords').addEventListener('click', () => {
        if (state.mode !== 'chords') toggleMode();
    });

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
    initMidi();

    // Initialize audio engine reference
    if (window.audioEngine) {
        console.log('[Octadre] Audio engine available');
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
