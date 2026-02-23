// ============================================
// OCTADRE — Audio Sample Engine
// File System Access API + Web Audio API
// ============================================

class OctadreAudioEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.compressor = null;

        // Per-track sample data: { buffer, name, file, gain, pitch, startOffset, endOffset, adsr }
        this.trackSamples = new Array(16).fill(null).map(() => ({
            buffer: null,
            name: null,
            fileHandle: null,
            gain: 1.0,
            pitch: 1.0,       // playback rate (1.0 = original pitch)
            startOffset: 0,   // normalized 0-1
            endOffset: 1,     // normalized 0-1
            waveformData: null, // downsampled waveform for visualization
            adsr: { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.05 }  // seconds / level
        }));

        // File System Access
        this.directoryHandle = null;
        this.fileTree = [];     // [{name, handle, type, children?}]
        this.currentPath = [];  // breadcrumb navigation

        // Flat scan results: [{ name, handle, ext, folder, relativePath }]
        this.flatFileList = [];
        this.filteredFileList = null; // null = show all
        this.scanViewMode = 'folder'; // 'folder' or 'flat'
        this.isScanning = false;
        this.scanProgress = { scanned: 0, found: 0 };

        // Active voices (for stopping)
        this.activeVoices = new Map(); // trackIndex -> [{ source, gainNode }]

        this.initialized = false;
    }

    // ──────────────────────────────────────────────
    // INITIALIZATION
    // ──────────────────────────────────────────────

    async init() {
        if (this.initialized) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            latencyHint: 'interactive',
            sampleRate: 44100
        });

        // Master chain: compressor → gain → destination
        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.value = -6;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.1;

        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.8;

        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);

        this.initialized = true;
        console.log('[AudioEngine] Initialized — sample rate:', this.audioContext.sampleRate);
    }

    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    // ──────────────────────────────────────────────
    // FILE SYSTEM ACCESS API
    // ──────────────────────────────────────────────

    async openSamplesFolder() {
        if (!('showDirectoryPicker' in window)) {
            alert('File System Access API not supported.\nPlease use Chrome, Edge, or Arc browser.');
            return false;
        }

        try {
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'read',
                startIn: 'music'
            });

            await this.scanDirectory(this.directoryHandle);
            this.currentPath = [];
            console.log('[AudioEngine] Opened folder:', this.directoryHandle.name);
            return true;
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('[AudioEngine] Folder picker cancelled');
                return false;
            }
            console.error('[AudioEngine] Error opening folder:', err);
            return false;
        }
    }

    async scanDirectory(dirHandle) {
        const entries = [];

        for await (const [name, handle] of dirHandle) {
            if (handle.kind === 'file') {
                const ext = name.split('.').pop().toLowerCase();
                const audioExts = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a', 'webm', 'aiff', 'aif'];
                if (audioExts.includes(ext)) {
                    entries.push({
                        name,
                        handle,
                        type: 'file',
                        ext
                    });
                }
            } else if (handle.kind === 'directory') {
                entries.push({
                    name,
                    handle,
                    type: 'directory',
                    children: null // lazy load
                });
            }
        }

        // Sort: directories first, then files alphabetically
        entries.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        this.fileTree = entries;
        return entries;
    }

    // Deep recursive scan — flattens ALL audio files from all subfolders
    async scanAllRecursive(onProgress) {
        if (!this.directoryHandle) return [];

        this.isScanning = true;
        this.scanProgress = { scanned: 0, found: 0 };
        this.flatFileList = [];

        const audioExts = ['wav', 'mp3', 'ogg', 'flac', 'aac', 'm4a', 'webm', 'aiff', 'aif'];

        const crawl = async (dirHandle, relativePath) => {
            try {
                for await (const [name, handle] of dirHandle) {
                    if (handle.kind === 'file') {
                        const ext = name.split('.').pop().toLowerCase();
                        if (audioExts.includes(ext)) {
                            this.flatFileList.push({
                                name,
                                handle,
                                type: 'file',
                                ext,
                                folder: relativePath || this.directoryHandle.name,
                                relativePath: relativePath ? `${relativePath}/${name}` : name
                            });
                            this.scanProgress.found++;
                        }
                    } else if (handle.kind === 'directory') {
                        this.scanProgress.scanned++;
                        if (onProgress) onProgress(this.scanProgress);
                        const subPath = relativePath ? `${relativePath}/${name}` : name;
                        await crawl(handle, subPath);
                    }
                }
            } catch (err) {
                console.warn(`[AudioEngine] Could not scan: ${relativePath}`, err);
            }
        };

        await crawl(this.directoryHandle, '');

        // Sort by folder, then by name
        this.flatFileList.sort((a, b) => {
            if (a.folder !== b.folder) return a.folder.localeCompare(b.folder);
            return a.name.localeCompare(b.name);
        });

        this.isScanning = false;
        this.filteredFileList = null;
        console.log(`[AudioEngine] Deep scan complete: ${this.flatFileList.length} audio files in ${this.scanProgress.scanned} folders`);
        return this.flatFileList;
    }

    // Filter flat file list by search query
    filterFiles(query) {
        if (!query || query.trim() === '') {
            this.filteredFileList = null;
            return this.flatFileList;
        }

        const q = query.toLowerCase().trim();
        this.filteredFileList = this.flatFileList.filter(f =>
            f.name.toLowerCase().includes(q) ||
            f.folder.toLowerCase().includes(q)
        );
        return this.filteredFileList;
    }

    // Get the list to display (filtered or all)
    getDisplayList() {
        return this.filteredFileList || this.flatFileList;
    }

    // Get unique folder names from flat list for grouping
    getFolderGroups() {
        const list = this.getDisplayList();
        const groups = new Map();
        for (const file of list) {
            const folder = file.folder || '(root)';
            if (!groups.has(folder)) groups.set(folder, []);
            groups.get(folder).push(file);
        }
        return groups;
    }

    async navigateToFolder(folderEntry) {
        if (folderEntry.type !== 'directory') return;

        this.currentPath.push({
            name: folderEntry.name,
            handle: folderEntry.handle,
            previousTree: this.fileTree
        });

        await this.scanDirectory(folderEntry.handle);
    }

    navigateUp() {
        if (this.currentPath.length === 0) return false;

        const previous = this.currentPath.pop();
        this.fileTree = previous.previousTree;
        return true;
    }

    getCurrentFolderName() {
        if (this.currentPath.length === 0 && this.directoryHandle) {
            return this.directoryHandle.name;
        }
        if (this.currentPath.length > 0) {
            return this.currentPath[this.currentPath.length - 1].name;
        }
        return 'No folder selected';
    }

    getBreadcrumbs() {
        const crumbs = [];
        if (this.directoryHandle) {
            crumbs.push(this.directoryHandle.name);
        }
        for (const p of this.currentPath) {
            crumbs.push(p.name);
        }
        return crumbs;
    }

    // ──────────────────────────────────────────────
    // SAMPLE LOADING
    // ──────────────────────────────────────────────

    async loadSampleFromHandle(fileHandle, trackIndex) {
        if (!this.initialized) await this.init();

        try {
            const file = await fileHandle.getFile();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.trackSamples[trackIndex] = {
                buffer: audioBuffer,
                name: fileHandle.name,
                fileHandle: fileHandle,
                gain: this.trackSamples[trackIndex]?.gain ?? 1.0,
                pitch: this.trackSamples[trackIndex]?.pitch ?? 1.0,
                startOffset: 0,
                endOffset: 1,
                waveformData: this.generateWaveformData(audioBuffer),
                adsr: { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.05 }
            };

            console.log(`[AudioEngine] Loaded "${fileHandle.name}" → Track ${trackIndex + 1} (${audioBuffer.duration.toFixed(2)}s)`);
            return true;
        } catch (err) {
            console.error(`[AudioEngine] Failed to load sample for track ${trackIndex + 1}:`, err);
            return false;
        }
    }

    async loadSampleFromFile(file, trackIndex) {
        if (!this.initialized) await this.init();

        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            this.trackSamples[trackIndex] = {
                buffer: audioBuffer,
                name: file.name,
                fileHandle: null,
                gain: this.trackSamples[trackIndex]?.gain ?? 1.0,
                pitch: this.trackSamples[trackIndex]?.pitch ?? 1.0,
                startOffset: 0,
                endOffset: 1,
                waveformData: this.generateWaveformData(audioBuffer),
                adsr: { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.05 }
            };

            console.log(`[AudioEngine] Loaded "${file.name}" → Track ${trackIndex + 1}`);
            return true;
        } catch (err) {
            console.error(`[AudioEngine] Failed to load sample:`, err);
            return false;
        }
    }

    removeSample(trackIndex) {
        this.trackSamples[trackIndex] = {
            buffer: null,
            name: null,
            fileHandle: null,
            gain: 1.0,
            pitch: 1.0,
            startOffset: 0,
            endOffset: 1,
            waveformData: null,
            adsr: { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.05 }
        };
    }

    // ──────────────────────────────────────────────
    // WAVEFORM VISUALIZATION
    // ──────────────────────────────────────────────

    generateWaveformData(audioBuffer, samples = 128) {
        const channelData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(channelData.length / samples);
        const waveform = new Float32Array(samples);

        for (let i = 0; i < samples; i++) {
            let sum = 0;
            const start = i * blockSize;
            for (let j = 0; j < blockSize; j++) {
                sum += Math.abs(channelData[start + j] || 0);
            }
            waveform[i] = sum / blockSize;
        }

        // Normalize
        const max = Math.max(...waveform) || 1;
        for (let i = 0; i < samples; i++) {
            waveform[i] /= max;
        }

        return waveform;
    }

    drawWaveform(canvas, trackIndex) {
        const sample = this.trackSamples[trackIndex];
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        if (!sample || !sample.waveformData) {
            // Draw empty state
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();
            ctx.setLineDash([]);
            return;
        }

        const data = sample.waveformData;
        const barWidth = width / data.length;
        const trackColor = window.TRACK_COLORS ? window.TRACK_COLORS[trackIndex] : '#00e8a0';

        // Background for active region
        const startX = sample.startOffset * width;
        const endX = sample.endOffset * width;
        ctx.fillStyle = `${trackColor}10`;
        ctx.fillRect(startX, 0, endX - startX, height);

        // Draw bars
        ctx.fillStyle = trackColor;
        for (let i = 0; i < data.length; i++) {
            const x = i * barWidth;
            const barH = data[i] * height * 0.8;
            const y = (height - barH) / 2;

            // Dim bars outside start/end range
            const normalized = i / data.length;
            if (normalized < sample.startOffset || normalized > sample.endOffset) {
                ctx.globalAlpha = 0.15;
            } else {
                ctx.globalAlpha = 0.75;
            }

            ctx.fillRect(x + 0.5, y, Math.max(barWidth - 1, 1), barH);
        }

        ctx.globalAlpha = 1;

        // Start/end markers
        ctx.strokeStyle = trackColor;
        ctx.lineWidth = 1.5;

        if (sample.startOffset > 0) {
            ctx.beginPath();
            ctx.moveTo(startX, 0);
            ctx.lineTo(startX, height);
            ctx.stroke();
        }
        if (sample.endOffset < 1) {
            ctx.beginPath();
            ctx.moveTo(endX, 0);
            ctx.lineTo(endX, height);
            ctx.stroke();
        }
    }

    // ──────────────────────────────────────────────
    // PLAYBACK
    // ──────────────────────────────────────────────

    playSample(trackIndex, velocity = 127) {
        const sample = this.trackSamples[trackIndex];
        if (!sample || !sample.buffer || !this.audioContext) return;

        // Resume context if suspended (browser autoplay policy)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = sample.buffer;
        source.playbackRate.value = sample.pitch;

        // Per-track gain with ADSR envelope
        const trackGain = this.audioContext.createGain();
        const velocityScale = velocity / 127;
        const peakGain = sample.gain * velocityScale;
        const adsr = sample.adsr;
        const now = this.audioContext.currentTime;

        // ADSR envelope
        trackGain.gain.setValueAtTime(0, now);
        trackGain.gain.linearRampToValueAtTime(peakGain, now + adsr.attack);
        trackGain.gain.linearRampToValueAtTime(peakGain * adsr.sustain, now + adsr.attack + adsr.decay);

        source.connect(trackGain);
        trackGain.connect(this.compressor);

        // Calculate start/end offsets
        const duration = sample.buffer.duration;
        const startTime = sample.startOffset * duration;
        const endTime = sample.endOffset * duration;
        const playDuration = (endTime - startTime) / sample.pitch;

        // Schedule release at the end of the clip
        const releaseStart = now + playDuration - adsr.release;
        if (releaseStart > now + adsr.attack + adsr.decay) {
            trackGain.gain.setValueAtTime(peakGain * adsr.sustain, releaseStart);
            trackGain.gain.linearRampToValueAtTime(0, releaseStart + adsr.release);
        }

        // Stop any previous voices on this track (for one-shot behavior)
        this.stopTrack(trackIndex);

        source.start(0, startTime, endTime - startTime);

        // Track active voice
        if (!this.activeVoices.has(trackIndex)) {
            this.activeVoices.set(trackIndex, []);
        }
        const voice = { source, gainNode: trackGain };
        this.activeVoices.get(trackIndex).push(voice);

        // Cleanup when done
        source.onended = () => {
            const voices = this.activeVoices.get(trackIndex);
            if (voices) {
                const idx = voices.indexOf(voice);
                if (idx !== -1) voices.splice(idx, 1);
            }
            trackGain.disconnect();
        };
    }

    /**
     * Play a sample at a specific pitch multiplier (for chromatic keyboard).
     * pitchMultiplier: 1.0 = original, 2.0 = octave up, 0.5 = octave down
     */
    playSampleAtPitch(trackIndex, velocity = 127, pitchMultiplier = 1.0) {
        const sample = this.trackSamples[trackIndex];
        if (!sample || !sample.buffer || !this.audioContext) return;

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const source = this.audioContext.createBufferSource();
        source.buffer = sample.buffer;
        source.playbackRate.value = pitchMultiplier;

        // Per-track gain with ADSR envelope
        const trackGain = this.audioContext.createGain();
        const velocityScale = velocity / 127;
        const peakGain = sample.gain * velocityScale;
        const adsr = sample.adsr;
        const now = this.audioContext.currentTime;

        // ADSR envelope
        trackGain.gain.setValueAtTime(0, now);
        trackGain.gain.linearRampToValueAtTime(peakGain, now + adsr.attack);
        trackGain.gain.linearRampToValueAtTime(peakGain * adsr.sustain, now + adsr.attack + adsr.decay);

        source.connect(trackGain);
        trackGain.connect(this.compressor);

        const duration = sample.buffer.duration;
        const startTime = sample.startOffset * duration;
        const endTime = sample.endOffset * duration;
        const playDuration = (endTime - startTime) / pitchMultiplier;

        // Schedule release
        const releaseStart = now + playDuration - adsr.release;
        if (releaseStart > now + adsr.attack + adsr.decay) {
            trackGain.gain.setValueAtTime(peakGain * adsr.sustain, releaseStart);
            trackGain.gain.linearRampToValueAtTime(0, releaseStart + adsr.release);
        }

        // Hard-kill any previous voices immediately (no fade)
        const prevVoices = this.activeVoices.get(trackIndex);
        if (prevVoices) {
            prevVoices.forEach(v => {
                try { v.source.stop(0); v.gainNode.disconnect(); } catch (e) { }
            });
            this.activeVoices.set(trackIndex, []);
        }
        source.start(0, startTime, endTime - startTime);

        if (!this.activeVoices.has(trackIndex)) {
            this.activeVoices.set(trackIndex, []);
        }
        const voice = { source, gainNode: trackGain };
        this.activeVoices.get(trackIndex).push(voice);

        source.onended = () => {
            const voices = this.activeVoices.get(trackIndex);
            if (voices) {
                const idx = voices.indexOf(voice);
                if (idx !== -1) voices.splice(idx, 1);
            }
            trackGain.disconnect();
        };
    }

    stopTrack(trackIndex) {
        const voices = this.activeVoices.get(trackIndex);
        if (!voices) return;

        voices.forEach(voice => {
            try {
                voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, this.audioContext.currentTime);
                voice.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.005);
                voice.source.stop(this.audioContext.currentTime + 0.01);
            } catch (e) {
                // Source may already have stopped
            }
        });
        this.activeVoices.set(trackIndex, []);
    }

    stopAll() {
        for (let i = 0; i < 16; i++) {
            this.stopTrack(i);
        }
    }

    // ──────────────────────────────────────────────
    // PER-TRACK CONTROLS
    // ──────────────────────────────────────────────

    setTrackGain(trackIndex, gain) {
        this.trackSamples[trackIndex].gain = Math.max(0, Math.min(2, gain));
    }

    setTrackPitch(trackIndex, pitch) {
        this.trackSamples[trackIndex].pitch = Math.max(0.25, Math.min(4, pitch));
    }

    setTrackStartOffset(trackIndex, offset) {
        this.trackSamples[trackIndex].startOffset = Math.max(0, Math.min(offset, this.trackSamples[trackIndex].endOffset - 0.01));
    }

    setTrackEndOffset(trackIndex, offset) {
        this.trackSamples[trackIndex].endOffset = Math.max(this.trackSamples[trackIndex].startOffset + 0.01, Math.min(1, offset));
    }

    setMasterVolume(vol) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, vol));
        }
    }

    // ──────────────────────────────────────────────
    // PREVIEW (play a file without assigning it)
    // ──────────────────────────────────────────────

    async previewFile(fileHandle) {
        if (!this.initialized) await this.init();
        await this.resume();

        try {
            const file = await fileHandle.getFile();
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Stop any preview that's playing
            if (this._previewSource) {
                try { this._previewSource.stop(); } catch (e) { }
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;

            const gain = this.audioContext.createGain();
            gain.gain.value = 0.6;

            source.connect(gain);
            gain.connect(this.compressor);
            source.start(0);

            this._previewSource = source;

            // Auto-stop after 3 seconds
            setTimeout(() => {
                try { source.stop(); } catch (e) { }
            }, 3000);
        } catch (err) {
            console.error('[AudioEngine] Preview failed:', err);
        }
    }

    stopPreview() {
        if (this._previewSource) {
            try { this._previewSource.stop(); } catch (e) { }
            this._previewSource = null;
        }
    }

    // ──────────────────────────────────────────────
    // STATE HELPERS
    // ──────────────────────────────────────────────

    hasSample(trackIndex) {
        return !!this.trackSamples[trackIndex]?.buffer;
    }

    getSampleName(trackIndex) {
        return this.trackSamples[trackIndex]?.name || null;
    }

    getSampleDuration(trackIndex) {
        const buf = this.trackSamples[trackIndex]?.buffer;
        return buf ? buf.duration : 0;
    }

    isReady() {
        return this.initialized && this.audioContext?.state === 'running';
    }

    // ──────────────────────────────────────────────
    // SAVE / LOAD (base64 WAV encoding)
    // ──────────────────────────────────────────────

    /**
     * Export all track samples as serializable objects with base64-encoded WAV data.
     * Returns an array of 16 entries (null if no sample loaded).
     */
    exportSamples() {
        return this.trackSamples.map((sample, i) => {
            if (!sample || !sample.buffer) return null;

            // Convert AudioBuffer → interleaved PCM → WAV → base64
            const wavArrayBuffer = this._audioBufferToWav(sample.buffer);
            const base64 = this._arrayBufferToBase64(wavArrayBuffer);

            return {
                name: sample.name,
                gain: sample.gain,
                pitch: sample.pitch,
                startOffset: sample.startOffset,
                endOffset: sample.endOffset,
                adsr: { ...sample.adsr },
                sampleRate: sample.buffer.sampleRate,
                channels: sample.buffer.numberOfChannels,
                duration: sample.buffer.duration,
                wavBase64: base64
            };
        });
    }

    /**
     * Import samples from saved data (output of exportSamples).
     * Decodes base64 WAV back into AudioBuffers.
     */
    async importSamples(savedSamples) {
        if (!savedSamples || !Array.isArray(savedSamples)) return;
        if (!this.initialized) await this.init();

        for (let i = 0; i < savedSamples.length; i++) {
            const saved = savedSamples[i];
            if (!saved || !saved.wavBase64) {
                // No sample for this track — reset
                this.trackSamples[i] = {
                    buffer: null, name: null, fileHandle: null,
                    gain: 1.0, pitch: 1.0, startOffset: 0, endOffset: 1,
                    waveformData: null,
                    adsr: { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.05 }
                };
                continue;
            }

            try {
                const arrayBuffer = this._base64ToArrayBuffer(saved.wavBase64);
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                this.trackSamples[i] = {
                    buffer: audioBuffer,
                    name: saved.name || `Track ${i + 1}`,
                    fileHandle: null,
                    gain: saved.gain ?? 1.0,
                    pitch: saved.pitch ?? 1.0,
                    startOffset: saved.startOffset ?? 0,
                    endOffset: saved.endOffset ?? 1,
                    waveformData: this.generateWaveformData(audioBuffer),
                    adsr: saved.adsr ?? { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.05 }
                };

                console.log(`[AudioEngine] Restored "${saved.name}" → Track ${i + 1}`);
            } catch (err) {
                console.error(`[AudioEngine] Failed to restore track ${i + 1}:`, err);
                this.trackSamples[i] = {
                    buffer: null, name: null, fileHandle: null,
                    gain: 1.0, pitch: 1.0, startOffset: 0, endOffset: 1,
                    waveformData: null,
                    adsr: { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.05 }
                };
            }
        }
    }

    // ── Encoding helpers ──

    _audioBufferToWav(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const format = 1; // PCM
        const bitsPerSample = 16;

        // Get channel data
        const channels = [];
        for (let i = 0; i < numChannels; i++) {
            channels.push(audioBuffer.getChannelData(i));
        }

        const numFrames = audioBuffer.length;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const dataSize = numFrames * blockAlign;
        const headerSize = 44;
        const totalSize = headerSize + dataSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);

        // WAV header
        this._writeString(view, 0, 'RIFF');
        view.setUint32(4, totalSize - 8, true);
        this._writeString(view, 8, 'WAVE');
        this._writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        this._writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        // Interleave and write PCM samples
        let offset = 44;
        for (let frame = 0; frame < numFrames; frame++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let sample = channels[ch][frame];
                sample = Math.max(-1, Math.min(1, sample));
                sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, sample, true);
                offset += 2;
            }
        }

        return buffer;
    }

    _writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    _base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // ──────────────────────────────────────────────
    // BUILT-IN DRUM SOUND SYNTHESIZER
    // Generates 8 classic drum sounds via offline rendering
    // so the app is immediately playable without loading files.
    // ──────────────────────────────────────────────

    /**
     * Generate all 8 built-in drum sounds and assign them to tracks 0-7.
     * Only loads into tracks that don't already have a sample.
     */
    async generateBuiltInDrums() {
        if (!this.initialized) await this.init();

        const sampleRate = this.audioContext.sampleRate;

        const drums = [
            { name: 'Kick',           gen: (sr) => this._synthKick(sr) },
            { name: 'Snare',          gen: (sr) => this._synthSnare(sr) },
            { name: 'Clap',           gen: (sr) => this._synthClap(sr) },
            { name: 'Closed Hi-Hat',  gen: (sr) => this._synthClosedHiHat(sr) },
            { name: 'Open Hi-Hat',    gen: (sr) => this._synthOpenHiHat(sr) },
            { name: 'Rimshot',        gen: (sr) => this._synthRimshot(sr) },
            { name: 'Crash Cymbal',   gen: (sr) => this._synthCrash(sr) },
            { name: 'Shaker',         gen: (sr) => this._synthShaker(sr) },
        ];

        for (let i = 0; i < drums.length; i++) {
            // Skip if track already has a sample loaded
            if (this.trackSamples[i].buffer) continue;

            try {
                const audioBuffer = drums[i].gen(sampleRate);
                this.trackSamples[i] = {
                    buffer: audioBuffer,
                    name: drums[i].name,
                    fileHandle: null,
                    gain: 1.0,
                    pitch: 1.0,
                    startOffset: 0,
                    endOffset: 1,
                    waveformData: this.generateWaveformData(audioBuffer),
                    adsr: { attack: 0.001, decay: 0.05, sustain: 1.0, release: 0.01 }
                };
                console.log(`[AudioEngine] Built-in "${drums[i].name}" → Track ${i + 1}`);
            } catch (err) {
                console.error(`[AudioEngine] Failed to generate ${drums[i].name}:`, err);
            }
        }
    }

    // ── Helper: create white noise buffer ──
    _noiseBuffer(sampleRate, duration) {
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    // ── Helper: render a synthesis function offline into an AudioBuffer ──
    _renderOffline(sampleRate, duration, setupFn) {
        const length = Math.floor(sampleRate * duration);
        const offline = new OfflineAudioContext(1, length, sampleRate);
        setupFn(offline, duration);
        // OfflineAudioContext.startRendering() returns a promise
        // But we build the buffer synchronously from raw math for reliability
        // Use direct sample generation instead
        return null; // overridden by direct generation below
    }

    // ── Direct buffer generation (no OfflineAudioContext needed) ──

    _synthKick(sampleRate) {
        const duration = 0.5;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // Pitch sweep: 150Hz → 40Hz exponential decay
            const freq = 40 + 110 * Math.exp(-t * 30);
            // Phase accumulation for smooth pitch sweep
            const phase = 2 * Math.PI * (40 * t + (110 / 30) * (1 - Math.exp(-t * 30)));
            // Sine body with amplitude decay
            const body = Math.sin(phase) * Math.exp(-t * 7);
            // Sub click at the start
            const click = Math.sin(2 * Math.PI * 160 * t) * Math.exp(-t * 40) * 0.7;
            // Combine
            data[i] = Math.max(-1, Math.min(1, (body * 0.9 + click) * 0.95));
        }

        return buffer;
    }

    _synthSnare(sampleRate) {
        const duration = 0.3;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // Tone body: 180Hz sine, fast decay
            const body = Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t * 20) * 0.5;
            // Noise snare wires: filtered noise with medium decay
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 12) * 0.6;
            // Snap transient
            const snap = Math.sin(2 * Math.PI * 330 * t) * Math.exp(-t * 50) * 0.3;
            data[i] = Math.max(-1, Math.min(1, body + noise + snap));
        }

        return buffer;
    }

    _synthClap(sampleRate) {
        const duration = 0.3;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        // Clap = multiple short noise bursts followed by a decaying noise tail
        const burstTimes = [0, 0.01, 0.02, 0.035]; // 4 micro-bursts
        const burstDuration = 0.008;

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            let sample = 0;

            // Micro-bursts (initial "clap" attack)
            for (const bt of burstTimes) {
                const dt = t - bt;
                if (dt >= 0 && dt < burstDuration) {
                    const burstEnv = Math.exp(-dt * 200);
                    sample += (Math.random() * 2 - 1) * burstEnv * 0.5;
                }
            }

            // Noise tail (band-pass-ish via simple filtering)
            if (t > 0.03) {
                const tail = (Math.random() * 2 - 1) * Math.exp(-(t - 0.03) * 15) * 0.55;
                sample += tail;
            }

            data[i] = Math.max(-1, Math.min(1, sample));
        }

        return buffer;
    }

    _synthClosedHiHat(sampleRate) {
        const duration = 0.08;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // Metallic tones: sum of high-frequency square-ish harmonics
            const metallic = (
                Math.sin(2 * Math.PI * 3500 * t) * 0.3 +
                Math.sin(2 * Math.PI * 5100 * t) * 0.25 +
                Math.sin(2 * Math.PI * 7200 * t) * 0.2 +
                Math.sin(2 * Math.PI * 8900 * t) * 0.15 +
                Math.sin(2 * Math.PI * 10800 * t) * 0.1
            );
            // Noise component
            const noise = (Math.random() * 2 - 1) * 0.4;
            // Very fast decay envelope
            const env = Math.exp(-t * 80);
            data[i] = Math.max(-1, Math.min(1, (metallic + noise) * env * 0.8));
        }

        return buffer;
    }

    _synthOpenHiHat(sampleRate) {
        const duration = 0.5;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // Same metallic ratios as closed hat, but longer decay
            const metallic = (
                Math.sin(2 * Math.PI * 3500 * t) * 0.3 +
                Math.sin(2 * Math.PI * 5100 * t) * 0.25 +
                Math.sin(2 * Math.PI * 7200 * t) * 0.2 +
                Math.sin(2 * Math.PI * 8900 * t) * 0.15 +
                Math.sin(2 * Math.PI * 10800 * t) * 0.1
            );
            // Noise component
            const noise = (Math.random() * 2 - 1) * 0.45;
            // Slower decay for open hat character
            const env = Math.exp(-t * 6);
            data[i] = Math.max(-1, Math.min(1, (metallic + noise) * env * 0.7));
        }

        return buffer;
    }

    _synthRimshot(sampleRate) {
        const duration = 0.12;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // High-pitched tone body
            const tone = Math.sin(2 * Math.PI * 820 * t) * Math.exp(-t * 35) * 0.6;
            // Secondary harmonic
            const harm = Math.sin(2 * Math.PI * 1640 * t) * Math.exp(-t * 45) * 0.3;
            // Click transient
            const click = (Math.random() * 2 - 1) * Math.exp(-t * 100) * 0.5;
            data[i] = Math.max(-1, Math.min(1, tone + harm + click));
        }

        return buffer;
    }

    _synthCrash(sampleRate) {
        const duration = 1.5;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // Wide-band metallic shimmer
            const metallic = (
                Math.sin(2 * Math.PI * 2400 * t + Math.sin(t * 1200) * 0.5) * 0.2 +
                Math.sin(2 * Math.PI * 3800 * t + Math.sin(t * 2400) * 0.3) * 0.2 +
                Math.sin(2 * Math.PI * 5600 * t) * 0.15 +
                Math.sin(2 * Math.PI * 7100 * t) * 0.1 +
                Math.sin(2 * Math.PI * 9300 * t) * 0.08
            );
            // Noise — dominant in crash
            const noise = (Math.random() * 2 - 1) * 0.55;
            // Two-stage envelope: fast initial hit, then long shimmer decay
            const envAttack = Math.min(1, t / 0.002); // 2ms attack ramp
            const envBody = Math.exp(-t * 3);
            const env = envAttack * envBody;
            data[i] = Math.max(-1, Math.min(1, (metallic + noise) * env * 0.75));
        }

        return buffer;
    }

    _synthShaker(sampleRate) {
        const duration = 0.15;
        const length = Math.floor(sampleRate * duration);
        const buffer = this.audioContext.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            // High-pass filtered noise effect via differentiated noise
            const noise = Math.random() * 2 - 1;
            // Granular texture: amplitude modulation at ~200Hz for "shh" texture
            const grain = 0.6 + 0.4 * Math.sin(2 * Math.PI * 200 * t);
            // Envelope: quick swell then decay
            const env = Math.sin(Math.PI * t / duration) * Math.exp(-t * 15);
            data[i] = Math.max(-1, Math.min(1, noise * grain * env * 0.65));
        }

        return buffer;
    }
}

// Export as global
window.audioEngine = new OctadreAudioEngine();
