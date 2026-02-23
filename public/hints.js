(function () {
    'use strict';

    const STORAGE_KEY = 'octadre-hints-seen';
    let seenHints = {};
    let activeHint = null;
    let dismissTimer = null;

    // Load seen state
    try {
        seenHints = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
        seenHints = {};
    }

    function saveSeen() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seenHints));
    }

    /* ── Hint Definitions ── */
    const HINTS = {
        'first-pad-click': {
            anchor: '#pad-grid',
            position: 'right',
            icon: '🎹',
            title: 'Step Toggled!',
            body: 'You just activated a step. Hit the <strong>Play</strong> button to hear your pattern.',
            trigger: 'pad-click'
        },
        'first-play': {
            anchor: '#btn-play',
            position: 'bottom',
            icon: '▶',
            title: 'Sequencer Running',
            body: 'The green cursor shows playback position. Try toggling more pads while it plays!',
            trigger: 'play-click'
        },
        'first-track-select': {
            anchor: '#track-list',
            position: 'right',
            icon: '🎚',
            title: 'Track Selected',
            body: 'Each track has its own pattern & sample. The grid now shows this track\'s sequence.',
            trigger: 'track-select'
        },
        'first-ctrl-mode': {
            anchor: '#ctrl-up',
            position: 'bottom',
            icon: '▲',
            title: 'Control Mode',
            body: 'Use <strong>▲ / ▼</strong> to cycle between Length, Velocity, and Octave editing modes.',
            trigger: 'ctrl-mode'
        },
        'first-shift': {
            anchor: '#ctrl-left',
            position: 'bottom',
            icon: '↔',
            title: 'Pattern Shifted',
            body: 'Your sequence rotated! Use <strong>◄ / ►</strong> to shift patterns left or right.',
            trigger: 'shift-pattern'
        },
        'first-tempo-mod': {
            anchor: '.tempo-mod-buttons',
            position: 'left',
            icon: '⏱',
            title: 'Tempo Modifier',
            body: 'This track now runs at a different speed relative to others. Great for polyrhythms!',
            trigger: 'tempo-mod'
        },
        'first-scene': {
            anchor: '#scene-bar',
            position: 'top',
            icon: '🎬',
            title: 'Scene Switched',
            body: 'Each scene stores a complete snapshot of all tracks. Build arrangements by switching between them.',
            trigger: 'scene-switch'
        },
        'first-sample-load': {
            anchor: '#sample-slot',
            position: 'right',
            icon: '🔊',
            title: 'Sample Loaded',
            body: 'Adjust <strong>Volume</strong> and <strong>Pitch</strong> below, or expand the Sample Editor for ADSR envelope control.',
            trigger: 'sample-load'
        },
        'first-copy': {
            anchor: '#btn-copy-track',
            position: 'left',
            icon: '📋',
            title: 'Copied!',
            body: 'Now select a different track and click again to paste. Works for steps, tracks, and entire scenes.',
            trigger: 'copy-action'
        },
        'first-mode-switch': {
            anchor: '#mode-bar',
            position: 'bottom',
            icon: '🎛',
            title: 'Mode Changed',
            body: 'Each mode transforms the grid into a different instrument. Explore Chords and Chord Field for harmonic tools.',
            trigger: 'mode-switch'
        }
    };

    /* ── Show Hint ── */
    function showHint(hintId) {
        // Don't show if already seen, or if tutorial is open
        if (seenHints[hintId]) return;
        if (document.getElementById('tutorial-overlay')) return;

        const hint = HINTS[hintId];
        if (!hint) return;

        // Mark as seen immediately
        seenHints[hintId] = true;
        saveSeen();

        // Dismiss existing hint
        if (activeHint) dismissHint(false);

        // Find anchor element
        const anchorEl = document.querySelector(hint.anchor);
        if (!anchorEl) return;

        // Create hint element
        const el = document.createElement('div');
        el.className = 'ctx-hint';
        el.innerHTML = `
            <div class="ctx-hint-icon">${hint.icon}</div>
            <div class="ctx-hint-content">
                <div class="ctx-hint-title">${hint.title}</div>
                <div class="ctx-hint-body">${hint.body}</div>
            </div>
            <button class="ctx-hint-close" aria-label="Dismiss">×</button>
        `;

        document.body.appendChild(el);

        // Position
        const rect = anchorEl.getBoundingClientRect();
        positionHint(el, rect, hint.position);

        // Animate in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => el.classList.add('visible'));
        });

        // Dismiss handlers
        el.querySelector('.ctx-hint-close').onclick = () => dismissHint(true);
        el.addEventListener('click', (e) => {
            if (e.target.closest('.ctx-hint-close')) return;
            dismissHint(true);
        });

        activeHint = el;

        // Auto-dismiss after 6 seconds
        clearTimeout(dismissTimer);
        dismissTimer = setTimeout(() => dismissHint(true), 6000);
    }

    function positionHint(el, rect, position) {
        const gap = 12;
        el.style.position = 'fixed';
        el.style.zIndex = '9999';

        switch (position) {
            case 'right':
                el.style.left = (rect.right + gap) + 'px';
                el.style.top = (rect.top + rect.height / 2) + 'px';
                el.style.transform = 'translateY(-50%)';
                break;
            case 'left':
                el.style.right = (window.innerWidth - rect.left + gap) + 'px';
                el.style.top = (rect.top + rect.height / 2) + 'px';
                el.style.transform = 'translateY(-50%)';
                break;
            case 'bottom':
                el.style.left = (rect.left + rect.width / 2) + 'px';
                el.style.top = (rect.bottom + gap) + 'px';
                el.style.transform = 'translateX(-50%)';
                break;
            case 'top':
                el.style.left = (rect.left + rect.width / 2) + 'px';
                el.style.bottom = (window.innerHeight - rect.top + gap) + 'px';
                el.style.transform = 'translateX(-50%)';
                break;
        }

        // Clamp to viewport
        requestAnimationFrame(() => {
            const cr = el.getBoundingClientRect();
            if (cr.right > window.innerWidth - 12) {
                el.style.left = (window.innerWidth - cr.width - 12) + 'px';
                el.style.transform = position === 'top' || position === 'bottom' ? 'none' : 'translateY(-50%)';
            }
            if (cr.left < 12) {
                el.style.left = '12px';
                el.style.right = '';
            }
            if (cr.bottom > window.innerHeight - 12) {
                el.style.top = (window.innerHeight - cr.height - 12) + 'px';
            }
        });
    }

    function dismissHint(animated) {
        clearTimeout(dismissTimer);
        if (!activeHint) return;
        const el = activeHint;
        activeHint = null;

        if (animated) {
            el.classList.remove('visible');
            el.classList.add('dismissing');
            setTimeout(() => el.remove(), 300);
        } else {
            el.remove();
        }
    }

    /* ── DOM Event Listeners ── */
    function setupTriggers() {
        // Pad click
        document.addEventListener('click', (e) => {
            const pad = e.target.closest('.pad');
            if (pad && !pad.classList.contains('inactive') && !pad.classList.contains('out-of-range')) {
                showHint('first-pad-click');
            }
        });

        // Play button
        const playBtn = document.getElementById('btn-play');
        if (playBtn) playBtn.addEventListener('click', () => showHint('first-play'));

        // Track selection
        const trackList = document.getElementById('track-list');
        if (trackList) {
            trackList.addEventListener('click', (e) => {
                if (e.target.closest('.track-item')) showHint('first-track-select');
            });
        }

        // Control mode buttons
        const ctrlUp = document.getElementById('ctrl-up');
        const ctrlDown = document.getElementById('ctrl-down');
        if (ctrlUp) ctrlUp.addEventListener('click', () => showHint('first-ctrl-mode'));
        if (ctrlDown) ctrlDown.addEventListener('click', () => showHint('first-ctrl-mode'));

        // Shift buttons
        const shiftL = document.getElementById('ctrl-left');
        const shiftR = document.getElementById('ctrl-right');
        if (shiftL) shiftL.addEventListener('click', () => showHint('first-shift'));
        if (shiftR) shiftR.addEventListener('click', () => showHint('first-shift'));

        // Tempo modifier
        document.addEventListener('click', (e) => {
            if (e.target.closest('.tempo-mod-btn')) showHint('first-tempo-mod');
        });

        // Scene buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.scene-btn')) showHint('first-scene');
        });

        // Copy buttons
        const copyStep = document.getElementById('btn-copy-step');
        const copyTrack = document.getElementById('btn-copy-track');
        const copyScene = document.getElementById('btn-copy-scene');
        [copyStep, copyTrack, copyScene].forEach(btn => {
            if (btn) btn.addEventListener('click', () => showHint('first-copy'));
        });

        // Mode switches
        document.addEventListener('click', (e) => {
            const modeBtn = e.target.closest('.mode-btn');
            if (modeBtn && !modeBtn.classList.contains('active')) showHint('first-mode-switch');
        });
    }

    /* ── Public API ── */
    window.OctadreHints = {
        show: showHint,
        reset: function () {
            seenHints = {};
            saveSeen();
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        // Wait for app to render
        setTimeout(setupTriggers, 800);
    });
})();
