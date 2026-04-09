# Octrade

A web-based circular MIDI sequencer for the Novation Launchpad. Designed for live performance and production with Ableton Live or any DAW that accepts MIDI input.

## Features

- **16-step circular sequencer** with per-track tempo modifiers and scene management
- **Harmony engine** with functional harmony (tonic/predominant/dominant), voice leading, and auto-modulation
- **Chord field instrument** — 8x8 grid with 7 modal systems, 85+ chord types, Neo-Riemannian transformations, and intelligent SATB voice leading
- **FM Rhodes synth** with reverb and chorus, built on the Web Audio API
- **Sample playback** with a built-in file browser for loading and editing samples
- **Hardware integration** via Web MIDI for Novation Launchpad (also works without hardware)
- **Mobile/tablet support** with touch-friendly grid layout

## Modes

| Mode | Description |
|------|-------------|
| Seq | Classic step sequencer with sample triggers |
| Chords | Chord sequencing with multiple playback modes |
| Harmony | Functional harmony progressions with Rhodes synth |
| Sample | Sample loading, editing, and slice assignment |
| Chord Field | Jazz/gospel harmony instrument with modal systems and voice leading |

## Getting Started

```bash
npm run dev
```

Opens at [http://localhost:3002](http://localhost:3002). No build step required — the app is vanilla JS, HTML, and CSS.

For hardware control, connect a Novation Launchpad via USB and grant MIDI access when prompted by the browser.

## Deployment

Configured for Cloudflare Pages via `wrangler.toml`:

```bash
npx wrangler pages deploy public
```

## Documentation

- [Chord Field Theory](docs/CHORD_FIELD_THEORY.md) — deep dive into modal systems, voice leading, and Neo-Riemannian transformations
- [Harmony Field Manual](public/harmony-field-manual.html) — interactive reference (served with the app)

## License

[GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html)
