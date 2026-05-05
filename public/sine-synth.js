// ============================================
// SINE SYNTH — Pure Sine Wave Synthesizer
// ============================================
// A clean, simple sine wave synthesizer for pure harmonic testing.

class SineSynth {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.voices = new Map(); // midiNote -> voice object
        this.masterGain = null;
        this.reverbNode = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        // Master output chain
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.4;

        // Simple reverb via delay feedback
        this.reverbNode = this.createReverb();

        // Connect master -> reverb -> output
        this.masterGain.connect(this.reverbNode);
        this.reverbNode.connect(this.ctx.destination);

        // Also direct signal (dry)
        const dryGain = this.ctx.createGain();
        dryGain.gain.value = 0.8;
        this.masterGain.connect(dryGain);
        dryGain.connect(this.ctx.destination);

        this.initialized = true;
        console.log('[SineSynth] Pure sine synth initialized');
    }

    createReverb() {
        const input = this.ctx.createGain();
        const output = this.ctx.createGain();
        output.gain.value = 0.2;

        const delay1 = this.ctx.createDelay(1.0);
        delay1.delayTime.value = 0.05;
        const delay2 = this.ctx.createDelay(1.0);
        delay2.delayTime.value = 0.08;

        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.2;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;

        input.connect(delay1);
        delay1.connect(filter);
        filter.connect(delay2);
        delay2.connect(feedback);
        feedback.connect(delay1);
        delay2.connect(output);

        input.output = output;
        input.connect(output); 
        return input;
    }

    midiToFreq(midiNote) {
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }

    createVoice(midiNote, velocity) {
        const now = this.ctx.currentTime;
        const freq = this.midiToFreq(midiNote);
        const vel = velocity / 127;

        // Pure sine wave carrier
        const carrier = this.ctx.createOscillator();
        carrier.type = 'sine';
        carrier.frequency.value = freq;

        // Amplitude envelope (ADSR)
        const ampEnv = this.ctx.createGain();
        ampEnv.gain.setValueAtTime(0, now);

        // Attack - smooth but quick to avoid clicks
        ampEnv.gain.linearRampToValueAtTime(vel * 0.5, now + 0.02);
        // Sustain - hold at slightly lower volume
        ampEnv.gain.exponentialRampToValueAtTime(vel * 0.4, now + 0.1);
        
        carrier.connect(ampEnv);
        ampEnv.connect(this.masterGain);

        // Start oscillator
        carrier.start(now);

        return {
            carrier,
            ampEnv,
            startTime: now,
        };
    }

    noteOn(midiNote, velocity = 100) {
        if (!this.initialized) this.init();

        if (this.voices.has(midiNote)) {
            this.noteOff(midiNote);
        }

        const voice = this.createVoice(midiNote, velocity);
        this.voices.set(midiNote, voice);
    }

    noteOff(midiNote) {
        const voice = this.voices.get(midiNote);
        if (!voice) return;

        const now = this.ctx.currentTime;

        // Smooth release tail
        voice.ampEnv.gain.cancelScheduledValues(now);
        voice.ampEnv.gain.setValueAtTime(voice.ampEnv.gain.value, now);
        voice.ampEnv.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        const stopTime = now + 0.35;
        voice.carrier.stop(stopTime);

        this.voices.delete(midiNote);
    }

    playChord(notes, velocity = 100, autoReleaseDuration = null) {
        if (!this.initialized) this.init();

        notes.forEach(note => {
            this.noteOn(note, velocity);
        });

        if (autoReleaseDuration) {
            setTimeout(() => {
                this.releaseChord(notes);
            }, autoReleaseDuration * 1000);
        }
    }

    releaseChord(notes) {
        notes.forEach(note => {
            this.noteOff(note);
        });
    }

    allNotesOff() {
        for (const [note] of this.voices) {
            this.noteOff(note);
        }
    }

    setVolume(vol) {
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(vol * 0.4, this.ctx.currentTime, 0.02);
        }
    }
}

window.SineSynth = SineSynth;
console.log('[SineSynth] Pure Sine Wave Synth loaded');
