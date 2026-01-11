/**
 * 90s Cursor Bubbles (Monochrome, Floaty, Easing) + Mobile Tap/Double-Tap/Long-Press
 * - Desktop: bubbles on pointer move (trail)
 * - Mobile: bubbles on tap, double-tap (bigger burst), long-press (continuous stream)
 * - "Gravity-like" easing upward (buoyancy acceleration)
 * - Pure black outline bubbles
 *
 * Drop this script anywhere (ideally before </body>). No dependencies.
 */
(() => {
  // Respect accessibility
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  // ---------------------------
  // TUNABLE PARAMETERS
  // ---------------------------

  // Trail visibility longer: increase lifetimes and keep fade gentle
  const lifeMin = 1800;     // ms
  const lifeMax = 3200;     // ms

  // Bubble counts
  const desktopSpawnEveryMs = 28;   // trail density (desktop)
  const mobileTapCount = 7;         // bubbles on single tap
  const mobileDoubleTapCount = 14;  // bubbles on double tap
  const longPressIntervalMs = 90;   // bubbles while holding (mobile)
  const longPressCountPerTick = 1;  // bubbles per long-press tick

  // Size
  const minSize = 7;
  const maxSize = 17;
  const doubleTapSizeBoost = 1.25;  // bigger on double-tap

  // Performance caps
  const maxBubblesDesktop = 120;
  const maxBubblesMobile = 85;

  // Motion tuning: "almost floating"
  const driftMax = 0.06;       // px/ms sideways drift cap
  const wobbleAmp = 4.5;       // px
  const wobbleFreq = 0.006;    // lower = slower wobble

  // Buoyancy easing upward (starts nearly still then accelerates slightly)
  const riseStart = 0.010;     // px/ms
  const riseEnd   = 0.070;     // px/ms

  // Visual fade + shrink
  const startOpacity = 0.92;
  const endOpacityFactor = 0.85; // fade by (1 - p*endOpacityFactor)
  const shrinkTo = 0.82;

  // Gesture thresholds
  const doubleTapWindowMs = 300;
  const longPressDelayMs = 420;     // how long to hold before stream starts
  const tapMoveCancelPx = 10;       // movement cancels tap/long-press intent

  // ---------------------------
  // UTIL
  // ---------------------------
  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeInQuad = (p) => p * p;

  // ---------------------------
  // BUBBLE ENGINE
  // ---------------------------
  const bubbles = [];
  let lastSpawn = 0;

  function capLimit() {
    return isCoarsePointer ? maxBubblesMobile : maxBubblesDesktop;
  }

  function createBubble(x, y, sizeMultiplier = 1) {
    // Recycle oldest if over cap
    const cap = capLimit();
    if (bubbles.length >= cap) {
      const old = bubbles.shift();
      old.el.remove();
    }

    const el = document.createElement("div");
    el.className = "bubble-90s";

    const size = clamp(rand(minSize, maxSize) * sizeMultiplier, 5, 28);
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.borderWidth = Math.max(1.5, size * 0.12) + "px";

    document.body.appendChild(el);

    bubbles.push({
      el,
      x,
      y,
      vx: rand(-driftMax, driftMax),
      wobblePhase: rand(0, Math.PI * 2),
      life: rand(lifeMin, lifeMax),
      age: 0,
    });
  }

  function spawnBurst(x, y, count, spread = 10, sizeMult = 1) {
    for (let i = 0; i < count; i++) {
      createBubble(
        x + rand(-spread, spread),
        y + rand(-spread, spread),
        sizeMult
      );
    }
  }

  // ---------------------------
  // DESKTOP TRAIL
  // ---------------------------
  window.addEventListener("pointermove", (e) => {
    if (isCoarsePointer) return; // mobile handled by gestures
    const now = performance.now();
    if (now - lastSpawn < desktopSpawnEveryMs) return;
    lastSpawn = now;
    createBubble(e.clientX + rand(-3, 3), e.clientY + rand(-3, 3));
  }, { passive: true });

  // ---------------------------
  // MOBILE GESTURES: tap, double tap, long press
  // ---------------------------
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  let pressTimer = null;
  let longPressInterval = null;
  let pointerDown = false;
  let downX = 0, downY = 0;
  let activePointerId = null;
  let longPressActive = false;

  function clearLongPressTimers() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    if (longPressInterval) { clearInterval(longPressInterval); longPressInterval = null; }
    longPressActive = false;
  }

  function movedTooFar(x, y) {
    const dx = x - downX;
    const dy = y - downY;
    return Math.hypot(dx, dy) > tapMoveCancelPx;
  }

  window.addEventListener("pointerdown", (e) => {
    if (!isCoarsePointer) return;

    pointerDown = true;
    activePointerId = e.pointerId;
    downX = e.clientX;
    downY = e.clientY;
    longPressActive = false;

    // Prepare long-press stream after delay (unless moved)
    clearLongPressTimers();
    pressTimer = setTimeout(() => {
      if (!pointerDown) return;
      longPressActive = true;

      // Start continuous bubble stream while holding
      longPressInterval = setInterval(() => {
        if (!pointerDown) return;
        spawnBurst(downX, downY, longPressCountPerTick, 6, 1);
      }, longPressIntervalMs);
    }, longPressDelayMs);

  }, { passive: true });

  window.addEventListener("pointermove", (e) => {
    if (!isCoarsePointer) return;
    if (!pointerDown) return;
    if (activePointerId !== e.pointerId) return;

    // Cancel tap/long-press intent if user drags (scroll/gesture)
    if (movedTooFar(e.clientX, e.clientY)) {
      clearLongPressTimers();
    }
  }, { passive: true });

  window.addEventListener("pointerup", (e) => {
    if (!isCoarsePointer) return;
    if (activePointerId !== e.pointerId) return;

    pointerDown = false;

    const upX = e.clientX;
    const upY = e.clientY;

    const now = performance.now();
    const isTapCandidate = !movedTooFar(upX, upY);

    // If long-press was active, just stop the stream (do not also tap-burst)
    const wasLongPress = longPressActive;

    clearLongPressTimers();
    activePointerId = null;

    if (!isTapCandidate || wasLongPress) return;

    // Double tap detection: time window + proximity
    const dt = now - lastTapTime;
    const dist = Math.hypot(upX - lastTapX, upY - lastTapY);

    if (dt <= doubleTapWindowMs && dist <= 28) {
      // Double tap burst (bigger)
      spawnBurst(upX, upY, mobileDoubleTapCount, 14, doubleTapSizeBoost);
      lastTapTime = 0; // reset so triple-tap doesn't chain
    } else {
      // Single tap burst
      spawnBurst(upX, upY, mobileTapCount, 12, 1);
      lastTapTime = now;
      lastTapX = upX;
      lastTapY = upY;
    }
  }, { passive: true });

  window.addEventListener("pointercancel", () => {
    if (!isCoarsePointer) return;
    pointerDown = false;
    activePointerId = null;
    clearLongPressTimers();
  }, { passive: true });

  // ---------------------------
  // ANIMATION LOOP
  // ---------------------------
  function animate(t) {
    const last = animate._last || t;
    const dt = Math.min(34, t - last); // ms, clamp for stability
    animate._last = t;

    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      b.age += dt;

      const p = b.age / b.life; // 0..1
      if (p >= 1) {
        b.el.remove();
        bubbles.splice(i, 1);
        continue;
      }

      // Buoyancy / gravity-like easing (accelerates upward over time)
      const rise = riseStart + (riseEnd - riseStart) * easeInQuad(p);
      b.y -= rise * dt;

      // Gentle drift + slow wobble
      const wobble = Math.sin(b.wobblePhase + b.age * wobbleFreq) * wobbleAmp;
      b.x += (b.vx * dt) + (wobble * 0.015);

      // Fade gradually, linger longer
      const opacity = startOpacity * (1 - (p * endOpacityFactor));
      const scale = 1 - (1 - shrinkTo) * p;

      b.el.style.opacity = opacity.toFixed(3);
      b.el.style.transform = `translate(${b.x}px, ${b.y}px) scale(${scale})`;
    }

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
})();
