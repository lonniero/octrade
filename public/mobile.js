/**
 * Octadre Mobile — Panel drawer system & touch optimizations
 */
(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        const trackToggle = document.getElementById('mob-toggle-tracks');
        const actionsToggle = document.getElementById('mob-toggle-actions');
        const overlay = document.getElementById('mobile-overlay');
        const trackPanel = document.getElementById('track-panel');
        const controlPanel = document.getElementById('control-panel');

        if (!trackToggle || !actionsToggle || !overlay) return;

        function closeAll() {
            trackPanel.classList.remove('mobile-open');
            controlPanel.classList.remove('mobile-open');
            overlay.classList.remove('active');
        }

        trackToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = trackPanel.classList.contains('mobile-open');
            closeAll();
            if (!isOpen) {
                trackPanel.classList.add('mobile-open');
                overlay.classList.add('active');
            }
        });

        actionsToggle.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = controlPanel.classList.contains('mobile-open');
            closeAll();
            if (!isOpen) {
                controlPanel.classList.add('mobile-open');
                overlay.classList.add('active');
            }
        });

        overlay.addEventListener('click', closeAll);

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeAll();
        });

        // Edge-swipe gestures
        var touchStartX = 0;
        var touchStartY = 0;

        document.addEventListener('touchstart', function (e) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        document.addEventListener('touchend', function (e) {
            if (!e.changedTouches.length || window.innerWidth > 960) return;

            var dx = e.changedTouches[0].clientX - touchStartX;
            var dy = e.changedTouches[0].clientY - touchStartY;
            var SWIPE = 60, EDGE = 30;

            if (Math.abs(dx) < SWIPE || Math.abs(dy) > Math.abs(dx) * 0.5) return;

            // Swipe to close open panels
            if (trackPanel.classList.contains('mobile-open') && dx < -SWIPE) { closeAll(); return; }
            if (controlPanel.classList.contains('mobile-open') && dx > SWIPE) { closeAll(); return; }

            // Swipe from edge to open
            if (dx > SWIPE && touchStartX < EDGE) {
                trackPanel.classList.add('mobile-open');
                overlay.classList.add('active');
            } else if (dx < -SWIPE && touchStartX > window.innerWidth - EDGE) {
                controlPanel.classList.add('mobile-open');
                overlay.classList.add('active');
            }
        }, { passive: true });

        // Close drawers when resizing beyond mobile
        window.addEventListener('resize', function () {
            if (window.innerWidth > 960) closeAll();
        });
    }
})();
