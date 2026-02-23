(function () {
    'use strict';

    /* ── Tutorial Step Definitions ── */
    const STEPS = [
        {
            id: 'splash',
            type: 'splash',
            title: 'Octadre',
            subtitle: 'Transform your Novation Launchpad into a circular sequencer.\nCompatible with macOS, Windows and Linux.',
            cta: 'Begin Tour'
        },
        {
            id: 'grid',
            type: 'highlight',
            target: '#pad-grid',
            title: 'The Circular Grid',
            body: 'Watch the green cursor — it moves around the <strong>outer ring</strong> of 16 pads in a circle. This is your step sequencer. The inner rings control pitch, velocity, and length for the selected step.',
            position: 'right',
            autoPlay: true
        },
        {
            id: 'try-it',
            type: 'highlight',
            target: '#pad-grid',
            title: 'Your Turn',
            body: 'Click a few pads on the <strong>outer ring</strong> to place some beats. You\'ll hear them play as the cursor passes over.',
            position: 'right',
            autoPlay: true,
            interactive: true
        },
        {
            id: 'tracks',
            type: 'highlight',
            target: '#track-panel',
            title: 'Tracks',
            body: 'You have 16 tracks across two pages. Each track can hold its own sample, pattern length, and sequence. Select a track here to edit its pattern on the grid.',
            position: 'right'
        },
        {
            id: 'transport',
            type: 'highlight',
            target: '.transport-controls',
            title: 'Transport',
            body: 'Hit Play to start the sequencer. Adjust BPM, toggle the metronome, or sync to an external MIDI clock source.',
            position: 'bottom'
        },
        {
            id: 'modes',
            type: 'highlight',
            target: '#mode-bar',
            title: 'Modes',
            body: 'Switch between Sequencer, Chords, Harmony, Sample, and Chord Field modes. Each mode transforms the grid into a different instrument.',
            position: 'bottom'
        },
        {
            id: 'samples',
            type: 'highlight',
            target: '#track-sample-info',
            title: 'Sample Slot',
            body: 'Each track has a sample slot with waveform preview, volume, pitch controls, and a full ADSR envelope editor. Drag audio files or use the sample browser.',
            position: 'right'
        },
        {
            id: 'controls',
            type: 'highlight',
            target: '#control-panel',
            title: 'Actions',
            body: 'Tempo modifiers, track length, copy/paste operations, pattern shifting, randomisation, and save/load — all your power tools live here.',
            position: 'left'
        },
        {
            id: 'scenes',
            type: 'highlight',
            target: '#scene-bar',
            title: 'Scenes',
            body: 'Store up to 4 complete scene snapshots. Switch between them to build song arrangements on the fly.',
            position: 'top'
        },
        {
            id: 'done',
            type: 'splash',
            title: 'You\'re Ready',
            subtitle: 'Connect your Launchpad via MIDI, load some samples,\nand start creating.',
            cta: 'Start Sequencing'
        }
    ];

    let currentStep = 0;
    let overlayEl = null;
    let spotlightEl = null;
    let tutorialStartedPlayback = false;
    let cardEl = null;
    let progressEl = null;

    /* ── Build DOM ── */
    function createOverlay() {
        // Main overlay
        overlayEl = document.createElement('div');
        overlayEl.id = 'tutorial-overlay';
        overlayEl.className = 'tutorial-overlay';

        // Spotlight cutout (SVG mask)
        spotlightEl = document.createElement('div');
        spotlightEl.className = 'tutorial-spotlight';
        overlayEl.appendChild(spotlightEl);

        // Card
        cardEl = document.createElement('div');
        cardEl.className = 'tutorial-card';
        overlayEl.appendChild(cardEl);

        // Progress
        progressEl = document.createElement('div');
        progressEl.className = 'tutorial-progress';
        overlayEl.appendChild(progressEl);

        document.body.appendChild(overlayEl);
    }

    /* ── Render Step ── */
    function renderStep(index) {
        const step = STEPS[index];
        if (!step) return dismiss();

        // Auto-play / auto-stop logic
        handleAutoPlay(step);

        // Progress dots
        const totalHighlightSteps = STEPS.length;
        let dotsHTML = '<div class="tutorial-dots">';
        for (let i = 0; i < totalHighlightSteps; i++) {
            const cls = i === index ? 'dot active' : i < index ? 'dot done' : 'dot';
            dotsHTML += `<span class="${cls}"></span>`;
        }
        dotsHTML += '</div>';
        const stepCount = `<span class="tutorial-step-count">${index + 1} / ${totalHighlightSteps}</span>`;
        progressEl.innerHTML = dotsHTML + stepCount;

        if (step.type === 'splash') {
            renderSplash(step);
        } else {
            renderHighlight(step);
        }
    }

    function handleAutoPlay(step) {
        if (step.autoPlay) {
            // Start playback if not already playing
            const playBtn = document.getElementById('btn-play');
            if (playBtn && !document.querySelector('#btn-play.active')) {
                playBtn.click();
                tutorialStartedPlayback = true;
            }
        } else if (tutorialStartedPlayback) {
            // Stop playback when leaving an autoPlay step
            const stopBtn = document.getElementById('btn-stop');
            if (stopBtn) stopBtn.click();
            tutorialStartedPlayback = false;
        }
    }

    function renderSplash(step) {
        overlayEl.classList.add('splash-mode');
        overlayEl.classList.remove('highlight-mode');
        spotlightEl.style.display = 'none';

        const lines = step.subtitle.split('\n');
        const subtitleHTML = lines.map(l => `<span>${l}</span>`).join('');

        cardEl.className = 'tutorial-card splash-card';
        cardEl.innerHTML = `
      <div class="splash-logo">${step.title}</div>
      <div class="splash-subtitle">${subtitleHTML}</div>
      <button class="tutorial-btn primary" id="tutorial-next">${step.cta}</button>
      <button class="tutorial-btn skip" id="tutorial-skip">Skip Tutorial</button>
    `;

        // Animate in
        requestAnimationFrame(() => cardEl.classList.add('visible'));

        document.getElementById('tutorial-next').onclick = next;
        document.getElementById('tutorial-skip').onclick = dismiss;
    }

    function renderHighlight(step) {
        overlayEl.classList.remove('splash-mode', 'interactive-mode');
        overlayEl.classList.add('highlight-mode');

        const targetEl = document.querySelector(step.target);
        if (!targetEl) return next(); // skip if element doesn't exist

        // Interactive mode — let clicks through to the grid
        if (step.interactive) {
            overlayEl.classList.add('interactive-mode');
            setupInteractiveTracking();
        } else {
            teardownInteractiveTracking();
        }

        // Position spotlight
        const rect = targetEl.getBoundingClientRect();
        const pad = 8;
        spotlightEl.style.display = 'block';
        spotlightEl.style.left = (rect.left - pad) + 'px';
        spotlightEl.style.top = (rect.top - pad) + 'px';
        spotlightEl.style.width = (rect.width + pad * 2) + 'px';
        spotlightEl.style.height = (rect.height + pad * 2) + 'px';

        // Update overlay mask
        updateMask(rect, pad);

        // Card content
        const tryBadge = step.interactive ? '<span class="try-badge">🎹 TRY IT</span>' : '';
        cardEl.className = 'tutorial-card highlight-card';
        cardEl.innerHTML = `
      <div class="card-header">
        <span class="card-step-label">Step ${currentStep}</span>
        ${tryBadge}
        <h2 class="card-title">${step.title}</h2>
      </div>
      <p class="card-body">${step.body}</p>
      ${step.interactive ? '<div class="try-counter" id="try-counter"></div>' : ''}
      <div class="card-actions">
        ${currentStep > 1 ? '<button class="tutorial-btn secondary" id="tutorial-prev">← Back</button>' : ''}
        <button class="tutorial-btn primary" id="tutorial-next">Next →</button>
      </div>
    `;

        // Position card relative to target
        positionCard(rect, step.position);

        requestAnimationFrame(() => cardEl.classList.add('visible'));

        document.getElementById('tutorial-next').onclick = next;
        const prevBtn = document.getElementById('tutorial-prev');
        if (prevBtn) prevBtn.onclick = prev;
    }

    /* ── Interactive Step: track pad clicks ── */
    let interactivePadCount = 0;
    let interactiveListener = null;

    function setupInteractiveTracking() {
        interactivePadCount = 0;
        interactiveListener = function (e) {
            const pad = e.target.closest('.pad');
            if (pad) {
                interactivePadCount++;
                updateTryCounter();
            }
        };
        document.addEventListener('click', interactiveListener, true);
    }

    function teardownInteractiveTracking() {
        if (interactiveListener) {
            document.removeEventListener('click', interactiveListener, true);
            interactiveListener = null;
        }
    }

    function updateTryCounter() {
        const el = document.getElementById('try-counter');
        if (!el) return;
        if (interactivePadCount === 1) {
            el.textContent = '🎵 Nice! Keep going...';
        } else if (interactivePadCount === 2) {
            el.textContent = '🔥 Now you\'re getting it!';
        } else if (interactivePadCount >= 3) {
            el.textContent = '✨ You\'ve got the feel — hit Next when ready!';
        }
        el.classList.add('visible');
    }

    function updateMask(rect, pad) {
        // Use box-shadow trick for the darkened overlay with cutout
        const x = rect.left - pad;
        const y = rect.top - pad;
        const w = rect.width + pad * 2;
        const h = rect.height + pad * 2;

        spotlightEl.style.boxShadow = `
      0 0 0 9999px rgba(6, 6, 12, 0.82),
      0 0 30px 5px rgba(142, 130, 176, 0.25) inset
    `;
        spotlightEl.style.borderRadius = '12px';
    }

    function positionCard(rect, position) {
        const gap = 20;
        cardEl.style.position = 'fixed';

        // Reset
        cardEl.style.left = '';
        cardEl.style.right = '';
        cardEl.style.top = '';
        cardEl.style.bottom = '';

        switch (position) {
            case 'right':
                cardEl.style.left = (rect.right + gap) + 'px';
                cardEl.style.top = Math.max(80, rect.top) + 'px';
                break;
            case 'left':
                cardEl.style.right = (window.innerWidth - rect.left + gap) + 'px';
                cardEl.style.top = Math.max(80, rect.top) + 'px';
                break;
            case 'bottom':
                cardEl.style.left = rect.left + 'px';
                cardEl.style.top = (rect.bottom + gap) + 'px';
                break;
            case 'top':
                cardEl.style.left = rect.left + 'px';
                cardEl.style.bottom = (window.innerHeight - rect.top + gap) + 'px';
                break;
        }

        // Clamp to viewport
        requestAnimationFrame(() => {
            const cr = cardEl.getBoundingClientRect();
            if (cr.right > window.innerWidth - 20) {
                cardEl.style.left = (window.innerWidth - cr.width - 20) + 'px';
            }
            if (cr.bottom > window.innerHeight - 20) {
                cardEl.style.top = (window.innerHeight - cr.height - 20) + 'px';
            }
        });
    }

    /* ── Navigation ── */
    function next() {
        cardEl.classList.remove('visible');
        currentStep++;
        setTimeout(() => renderStep(currentStep), 250);
    }

    function prev() {
        cardEl.classList.remove('visible');
        currentStep--;
        setTimeout(() => renderStep(currentStep), 250);
    }

    function dismiss() {
        // Stop playback if tutorial started it
        if (tutorialStartedPlayback) {
            const stopBtn = document.getElementById('btn-stop');
            if (stopBtn) stopBtn.click();
            tutorialStartedPlayback = false;
        }
        overlayEl.classList.add('dismissing');
        setTimeout(() => {
            overlayEl.remove();
            overlayEl = null;
            localStorage.setItem('octadre-tutorial-seen', 'true');
        }, 400);
    }

    /* ── Init ── */
    function startTutorial() {
        // Clean up any existing tutorial overlay
        if (overlayEl) {
            overlayEl.remove();
            overlayEl = null;
        }
        localStorage.removeItem('octadre-tutorial-seen');
        currentStep = 0;
        createOverlay();
        renderStep(0);
    }

    // ESC to dismiss
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlayEl) dismiss();
    });

    // Auto-launch on first visit, or expose for manual trigger
    window.OctadreTutorial = { start: startTutorial };

    document.addEventListener('DOMContentLoaded', () => {
        // Small delay to let the app render first
        setTimeout(() => {
            if (!localStorage.getItem('octadre-tutorial-seen')) {
                startTutorial();
            }
        }, 600);
    });
})();
