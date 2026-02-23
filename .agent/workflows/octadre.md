---
description: Octadre project context and dev workflow
---

# Octadre — Digital MIDI Sequencer

## Project Overview
Octadre is a web-based digital MIDI sequencer designed for the Novation Launchpad MK2. It features an 8×8 grid-based interface with multiple modes for music production, including step sequencing, chord field harmony, and a harmony machine.

## Architecture

### File Structure
```
public/
  index.html              — Main sequencer UI (25KB)
  app.js                  — Core application logic, state, grid rendering, MIDI I/O (213KB, 5500+ lines)
  audio-engine.js         — Sample playback engine (OctadreAudioEngine class) — file system, waveforms, ADSR
  chord-field-engine.js   — Jazz/Gospel/Blues chord field — voicing engine, diatonic mapping, ring mode (70KB)
  harmony-engine.js       — Functional harmony theory engine — scales, voice leading, secondary dominants
  rhodes-synth.js         — FM synthesis Rhodes electric piano (Web Audio API)
  harmony-field-manual.html — Visual reference for chord field layout
  styles.css              — All styling (47KB)
```

### Key Systems
- **Grid Layout**: Three concentric rings — BIG_GRID (16 outer pads), INNER_GRID (12 middle pads), SMALL_GRID (8 inner pads)
- **Modes**: `seq` (step sequencer), `chords` (chord field), `harmony` (functional harmony machine)
- **Audio**: Sample engine (file-based) + Rhodes FM synth (generated)
- **MIDI**: Bidirectional — Launchpad input/LED feedback + external instrument output
- **State**: Global `state`, `harmonyState`, `chordFieldState` objects in app.js

### Launchpad LED Mapping
- Digital grid row 0 (top of screen) = MK2 row 8 (top of controller)
- Formula: LP note = (8 - digitalRow) * 10 + (col + 1)
- LP_BIG_GRID, LP_INNER_GRID, LP_SMALL_GRID, LP_MUTE_BUTTONS, LP_SCENE_BUTTONS constants

## Dev Server

// turbo
1. Start the dev server:
```bash
npm run dev
```
This runs on **port 3002** (with automatic port cleanup via predev script).

// turbo
2. Open in browser: http://localhost:3002

## Key Patterns
- All engines use IIFEs `(function() { 'use strict'; ... })()` and attach to `window.*`
- Chord field engine exposes `window.chordFieldEngine`
- Harmony engine exposes `window.harmonyEngine`
- Rhodes synth exposes `window.RhodesSynth` (class, instantiated in app.js)
- app.js is the orchestrator — imports engines, manages state, renders grid, handles MIDI

## Important Notes
- `app.js` is very large (5500+ lines). Changes should be surgical and well-scoped.
- The grid rendering system (`renderGrid()`, `renderHarmonyGrid()`, `renderChordFieldGrid()`) is mode-dependent.
- Launchpad LED feedback mirrors the on-screen grid state.
- Voice leading in both chord-field-engine and harmony-engine — they are separate systems.
