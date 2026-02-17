// ============================================
// RHODES SYNTH — FM Synthesis Electric Piano
// ============================================
// A warm, bell-like Rhodes-style FM synthesizer
// using Web Audio API's built-in oscillators.

class RhodesSynth {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.voices = new Map(); // midiNote -> voice object
        this.masterGain = null;
        this.reverbNode = null;
        this.chorusLFO = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        // Master output chain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.35;

        // Simple reverb via delay feedback
        this.reverbNode = this.createReverb();

        // Chorus LFO (subtle)
        this.chorusLFO = this.ctx.createOscillator();
        this.chorusLFO.type = 'sine';
        this.chorusLFO.frequency.value = 0.8; // Slow modulation
        this.chorusLFO.start();

        this.chorusGain = this.ctx.createGain();
        this.chorusGain.gain.value = 2; // Subtle detune in cents
        this.chorusLFO.connect(this.chorusGain);

        // Connect master -> reverb -> output
        this.masterGain.connect(this.reverbNode);
        this.reverbNode.connect(this.ctx.destination);

        // Also direct signal (dry)
        const dryGain = this.ctx.createGain();
        dryGain.gain.value = 0.7;
        this.masterGain.connect(dryGain);
        dryGain.connect(this.ctx.destination);

        this.initialized = true;
        console.log('[Rhodes] FM synth initialized');
    }

    createReverb() {
        // Simple reverb using feedback delay network
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();
        output.gain.value = 0.3;

        const delay1 = this.ctx.createDelay(1.0);
        delay1.delayTime.value = 0.05;
        const delay2 = this.ctx.createDelay(1.0);
        delay2.delayTime.value = 0.08;

        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.25;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 3000;

        input.connect(delay1);
        delay1.connect(filter);
        filter.connect(delay2);
        delay2.connect(feedback);
        feedback.connect(delay1);
        delay2.connect(output);

        input.output = output;
        input.connect(output); // wet + dry mix point
        return input;
    }

    // Convert MIDI note to frequency
    midiToFreq(midiNote) {
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }

    // Create an FM Rhodes voice for a single note
    createVoice(midiNote, velocity) {
        const now = this.ctx.currentTime;
        const freq = this.midiToFreq(midiNote);
        const vel = velocity / 127;

        // FM Rhodes architecture:
        // Carrier (sine) + Modulator (sine at harmonic ratio)
        // The modulator adds bell-like harmonics

        // ── Modulator (creates the "tine" brightness) ──
        const modulator = this.ctx.createOscillator();
        modulator.type = 'sine';
        modulator.frequency.value = freq * 14; // 14:1 ratio = metallic tine

        const modGain = this.ctx.createGain();
        // Higher notes = less modulation depth (more mellow at top)
        const modDepth = vel * freq * 2.5 * Math.max(0.3, 1 - (midiNote - 48) / 60);
        modGain.gain.setValueAtTime(modDepth, now);
        // Fast decay of brightness (the "tine" attack)
        modGain.gain.exponentialRampToValueAtTime(modDepth * 0.01, now + 0.8);

        modulator.connect(modGain);

        // ── Second modulator (warmth / body) ──
        const mod2 = this.ctx.createOscillator();
        mod2.type = 'sine';
        mod2.frequency.value = freq * 1; // 1:1 ratio = adds warmth

        const mod2Gain = this.ctx.createGain();
        const mod2Depth = vel * freq * 0.4;
        mod2Gain.gain.setValueAtTime(mod2Depth, now);
        mod2Gain.gain.exponentialRampToValueAtTime(mod2Depth * 0.1, now + 2.0);

        mod2.connect(mod2Gain);

        // ── Carrier (the main tone) ──
        const carrier = this.ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.value = freq;

        // Connect modulators to carrier frequency
        modGain.connect(carrier.frequency);
        mod2Gain.connect(carrier.frequency);

        // Apply chorus (subtle pitch wobble)
        if (this.chorusGain) {
            this.chorusGain.connect(carrier.detune);
        }

        // ── Amplitude envelope (ADSR) ──
        const ampEnv = this.ctx.createGain();
        ampEnv.gain.setValueAtTime(0, now);

        // Attack
        ampEnv.gain.linearRampToValueAtTime(vel * 0.5, now + 0.005);
        // Decay to sustain
        ampEnv.gain.exponentialRampToValueAtTime(vel * 0.22, now + 0.3);
        // Slow sustain decay
        ampEnv.gain.exponentialRampToValueAtTime(vel * 0.12, now + 3.0);

        carrier.connect(ampEnv);

        // ── Lowpass filter (warmth) ──
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000 + vel * 4000, now);
        filter.frequency.exponentialRampToValueAtTime(800, now + 1.5);
        filter.Q.value = 0.7;

        ampEnv.connect(filter);
        filter.connect(this.masterGain);

        // Start oscillators
        carrier.start(now);
        modulator.start(now);
        mod2.start(now);

        return {
            carrier,
            modulator,
            mod2,
            ampEnv,
            filter,
            modGain,
            mod2Gain,
            startTime: now,
        };
    }

    // Play a single note
    noteOn(midiNote, velocity = 100) {
        if (!this.initialized) this.init();

        // Release existing voice on this note
        if (this.voices.has(midiNote)) {
            this.noteOff(midiNote);
        }

        const voice = this.createVoice(midiNote, velocity);
        this.voices.set(midiNote, voice);
    }

    // Release a single note
    noteOff(midiNote) {
        const voice = this.voices.get(midiNote);
        if (!voice) return;

        const now = this.ctx.currentTime;

        // Quick release
        voice.ampEnv.gain.cancelScheduledValues(now);
        voice.ampEnv.gain.setValueAtTime(voice.ampEnv.gain.value, now);
        voice.ampEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        // Stop oscillators after release
        const stopTime = now + 0.35;
        voice.carrier.stop(stopTime);
        voice.modulator.stop(stopTime);
        voice.mod2.stop(stopTime);

        this.voices.delete(midiNote);
    }

    // Play a chord (array of MIDI notes)
    playChord(notes, velocity = 100, autoReleaseDuration = null) {
        if (!this.initialized) this.init();

        notes.forEach(note => {
            this.noteOn(note, velocity);
        });

        // Optional auto-release after duration
        if (autoReleaseDuration) {
            setTimeout(() => {
                this.releaseChord(notes);
            }, autoReleaseDuration * 1000);
        }
    }

    // Release specific chord notes
    releaseChord(notes) {
        notes.forEach(note => {
            this.noteOff(note);
        });
    }

    // Kill all sound immediately
    allNotesOff() {
        for (const [note] of this.voices) {
            this.noteOff(note);
        }
    }

    // Set master volume (0-1)
    setVolume(vol) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(vol * 0.35, this.ctx.currentTime, 0.02);
        }
    }
}

// Expose globally
window.RhodesSynth = RhodesSynth;
console.log('[RhodesSynth] FM Electric Piano loaded');
