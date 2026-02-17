// ============================================
// OCTADRE — Audio Sample Engine
// File System Access API + Web Audio API
// ============================================

class OctadreAudioEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.compressor = null;

        // Per-track sample data: { buffer, name, file, gain, pitch, startOffset, endOffset }
        this.trackSamples = new Array(16).fill(null).map(() => ({
            buffer: null,
            name: null,
            fileHandle: null,
            gain: 1.0,
            pitch: 1.0,       // playback rate (1.0 = original pitch)
            startOffset: 0,   // normalized 0-1
            endOffset: 1,     // normalized 0-1
            waveformData: null // downsampled waveform for visualization
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
                waveformData: this.generateWaveformData(audioBuffer)
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
                waveformData: this.generateWaveformData(audioBuffer)
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
            waveformData: null
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

        // Per-track gain
        const trackGain = this.audioContext.createGain();
        const velocityScale = velocity / 127;
        trackGain.gain.value = sample.gain * velocityScale;

        source.connect(trackGain);
        trackGain.connect(this.compressor);

        // Calculate start/end offsets
        const duration = sample.buffer.duration;
        const startTime = sample.startOffset * duration;
        const endTime = sample.endOffset * duration;
        const playDuration = (endTime - startTime) / sample.pitch;

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
}

// Export as global
window.audioEngine = new OctadreAudioEngine();
