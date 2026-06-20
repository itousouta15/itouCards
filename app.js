const stage    = document.getElementById("stage");
const cardRig  = document.getElementById("cardRig");
const cardFlip = document.getElementById("cardFlip");
const faceFront = document.getElementById("faceFront");
const faceBack  = document.getElementById("faceBack");
const srStatus  = document.getElementById("srStatus");
const tabEls    = Array.from(document.querySelectorAll(".deck-tab"));
const deckNav   = document.querySelector(".deck-tabs");

const DECKS = {
  scaict:   { front: "./img/SCAICT/1.webp",  back: "./img/SCAICT/2.webp",  label: "SCAICT 名片" },
  personal: { front: "./img/personal/1.png",  back: "./img/personal/2.png",  label: "Personal 名片" },
};

const MAX_TILT_DEG  = 14;
const ARROW_STEP_DEG = 5;
const IDLE_DELAY_MS  = 700;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let currentDeck = "scaict";
let hasCard    = false;
let isBusy     = false;
let isHovering = false;
let idleTimer  = null;
let zoomLevel  = 1;

let tiltRAF     = null;
let tiltTarget  = { x: 0, y: 0 };
let tiltCurrent = { x: 0, y: 0 };

// ── Tab switching ─────────────────────────────────────────────────────────────

tabEls.forEach((tab) => {
  tab.addEventListener("click", () => {
    const key = tab.dataset.deck;
    if (key === currentDeck || isBusy) return;
    switchDeck(key);
  });

  // Standard ARIA tablist keyboard navigation
  tab.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir   = e.key === "ArrowRight" ? 1 : -1;
      const idx   = tabEls.indexOf(tab);
      const next  = tabEls[(idx + dir + tabEls.length) % tabEls.length];
      next.focus();
      if (next.dataset.deck !== currentDeck && !isBusy) switchDeck(next.dataset.deck);
    }
  });
});

function setActiveTab(key) {
  tabEls.forEach((t) => {
    const active = t.dataset.deck === key;
    t.classList.toggle("is-active", active);
    t.setAttribute("aria-selected", String(active));
    t.tabIndex = active ? 0 : -1;
  });
  requestAnimationFrame(updateIndicator);
}

function updateIndicator() {
  if (!deckNav) return;
  const active = tabEls.find(t => t.classList.contains("is-active"));
  if (!active) return;
  const nr = deckNav.getBoundingClientRect();
  const tr = active.getBoundingClientRect();
  deckNav.style.setProperty("--pill-x", `${tr.left - nr.left}px`);
  deckNav.style.setProperty("--pill-w", `${tr.width}px`);
}

async function switchDeck(key) {
  if (isBusy) return;
  currentDeck = key;
  setActiveTab(key);

  // Glow burst on the sliding pill
  deckNav.classList.remove("is-switching");
  void deckNav.offsetWidth; // force reflow so animation restarts
  deckNav.classList.add("is-switching");
  setTimeout(() => deckNav.classList.remove("is-switching"), 620);

  cardFlip.classList.remove("is-flipped");
  hasCard = false;
  cancelTiltLoop();
  cardRig.classList.remove("mode-spin", "mode-tilt");
  cardRig.style.transform = "";
  tiltTarget  = { x: 0, y: 0 };
  tiltCurrent = { x: 0, y: 0 };

  await loadDeck(DECKS[key]);
}

// ── Card loading ──────────────────────────────────────────────────────────────

async function loadDeck(deck) {
  if (isBusy) return;
  isBusy = true;
  tabEls.forEach((t) => (t.disabled = true));
  stage.classList.add("is-loading");
  announce(`正在載入 ${deck.label}...`);

  try {
    const [front] = await Promise.all([
      renderImageToFace(deck.front, faceFront),
      renderImageToFace(deck.back,  faceBack),
    ]);

    hasCard = true;
    stage.classList.add("has-card");
    cardFlip.style.setProperty("--ratio", front.ratio.toFixed(4));
    cardFlip.classList.remove("is-flipped");

    if (isHovering) activateTilt();
    else activateIdleSpin();

    announce(`已載入 ${deck.label}，點擊翻面，滾輪縮放`);
  } catch (err) {
    console.error(err);
    flashError(`無法載入 ${deck.label}`);
  } finally {
    stage.classList.remove("is-loading");
    tabEls.forEach((t) => (t.disabled = false));
    isBusy = false;
  }
}

async function renderImageToFace(url, faceEl) {
  const img = await loadImage(url);
  img.draggable = false;
  img.alt = "";
  const sheen = Array.from(faceEl.children).find((c) => c.classList?.contains("sheen"));
  faceEl.replaceChildren(img);
  if (sheen) faceEl.appendChild(sheen);
  faceEl.classList.remove("is-placeholder");
  return { ratio: img.naturalWidth / img.naturalHeight };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

// ── Flip ──────────────────────────────────────────────────────────────────────

stage.addEventListener("click", (e) => {
  if (!hasCard) return;
  // Ignore clicks on tab buttons
  if (e.target.closest(".deck-tabs")) return;
  cardFlip.classList.toggle("is-flipped");
  announce(cardFlip.classList.contains("is-flipped") ? "背面" : "正面");
});

cardFlip.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (hasCard) {
      cardFlip.classList.toggle("is-flipped");
      announce(cardFlip.classList.contains("is-flipped") ? "背面" : "正面");
    }
    return;
  }

  if (!hasCard) return;

  const arrowMap = {
    ArrowLeft:  () => { tiltTarget.y = clamp(tiltTarget.y - ARROW_STEP_DEG, -MAX_TILT_DEG, MAX_TILT_DEG); },
    ArrowRight: () => { tiltTarget.y = clamp(tiltTarget.y + ARROW_STEP_DEG, -MAX_TILT_DEG, MAX_TILT_DEG); },
    ArrowUp:    () => { tiltTarget.x = clamp(tiltTarget.x + ARROW_STEP_DEG, -MAX_TILT_DEG, MAX_TILT_DEG); },
    ArrowDown:  () => { tiltTarget.x = clamp(tiltTarget.x - ARROW_STEP_DEG, -MAX_TILT_DEG, MAX_TILT_DEG); },
  };

  if (arrowMap[e.key]) {
    e.preventDefault();
    clearIdleTimer();
    activateTilt();
    arrowMap[e.key]();
    if (!isHovering) scheduleIdleSpin();
  }
});

// ── Pointer / tilt ────────────────────────────────────────────────────────────

stage.addEventListener("pointerenter", () => {
  isHovering = true;
  clearIdleTimer();
  if (hasCard) activateTilt();
});

stage.addEventListener("pointermove", (e) => {
  if (!hasCard || !cardRig.classList.contains("mode-tilt")) return;
  const rect = stage.getBoundingClientRect();
  const px = (e.clientX - rect.left)  / rect.width;
  const py = (e.clientY - rect.top)   / rect.height;

  tiltTarget.y = (px - 0.5)  * MAX_TILT_DEG * 2;
  tiltTarget.x = -(py - 0.5) * MAX_TILT_DEG * 2;
  stage.classList.add("is-glaring");

  faceFront.style.setProperty("--mx", `${px * 100}%`);
  faceFront.style.setProperty("--my", `${py * 100}%`);
});

stage.addEventListener("pointerleave", () => {
  isHovering = false;
  tiltTarget = { x: 0, y: 0 };
  stage.classList.remove("is-glaring");
  scheduleIdleSpin();
});

// ── Zoom (wheel + pinch) ──────────────────────────────────────────────────────

stage.addEventListener("wheel", (e) => {
  if (!hasCard) return;
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  if (delta === 0) return;
  zoomLevel = clamp(zoomLevel + (delta > 0 ? -ZOOM_STEP : ZOOM_STEP), MIN_ZOOM, MAX_ZOOM);
  applyZoom();
}, { passive: false });

// Pinch-to-zoom (touch)
let pinchDist0 = null;
let pinchZoom0 = null;

stage.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    pinchDist0 = hypot(e.touches);
    pinchZoom0 = zoomLevel;
  }
}, { passive: true });

stage.addEventListener("touchmove", (e) => {
  if (e.touches.length !== 2 || pinchDist0 === null) return;
  e.preventDefault();
  const ratio = hypot(e.touches) / pinchDist0;
  zoomLevel = clamp(pinchZoom0 * ratio, MIN_ZOOM, MAX_ZOOM);
  applyZoom();
}, { passive: false });

stage.addEventListener("touchend", () => {
  pinchDist0 = null;
  pinchZoom0 = null;
}, { passive: true });

function hypot(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Idle spin / tilt helpers ──────────────────────────────────────────────────

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function announce(text) { srStatus.textContent = text; }

function flashError(message) {
  stage.classList.add("is-error");
  announce(message);
  setTimeout(() => stage.classList.remove("is-error"), 900);
}

function clearIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

function scheduleIdleSpin() {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    if (!isHovering && hasCard) activateIdleSpin();
  }, IDLE_DELAY_MS);
}

function activateIdleSpin() {
  if (!hasCard) return;
  cancelTiltLoop();
  cardRig.classList.remove("mode-tilt");
  cardRig.style.transform = "";
  cardRig.classList.add("mode-spin");
}

function activateTilt() {
  if (!hasCard) return;
  cardRig.classList.remove("mode-spin");
  cardRig.style.transform = "";
  cardRig.classList.add("mode-tilt");
  startTiltLoop();
}

function startTiltLoop() {
  if (tiltRAF) return;
  loopTilt();
}

function cancelTiltLoop() {
  if (tiltRAF) cancelAnimationFrame(tiltRAF);
  tiltRAF = null;
}

function loopTilt() {
  if (!cardRig.classList.contains("mode-tilt")) { tiltRAF = null; return; }
  const ease = prefersReducedMotion ? 1 : 0.12;
  tiltCurrent.x += (tiltTarget.x - tiltCurrent.x) * ease;
  tiltCurrent.y += (tiltTarget.y - tiltCurrent.y) * ease;
  cardRig.style.transform = `rotateX(${tiltCurrent.x.toFixed(2)}deg) rotateY(${tiltCurrent.y.toFixed(2)}deg)`;
  tiltRAF = requestAnimationFrame(loopTilt);
}

function applyZoom() {
  stage.style.setProperty("--zoom", zoomLevel.toFixed(3));
  announce(`縮放 ${Math.round(zoomLevel * 100)}%`);
}

// ── Init ──────────────────────────────────────────────────────────────────────

setActiveTab(currentDeck);
requestAnimationFrame(updateIndicator);
loadDeck(DECKS[currentDeck]);
window.addEventListener("resize", updateIndicator, { passive: true });
