const stage = document.getElementById("stage");
const cardRig = document.getElementById("cardRig");
const cardFlip = document.getElementById("cardFlip");
const faceFront = document.getElementById("faceFront");
const faceBack = document.getElementById("faceBack");
const srStatus = document.getElementById("srStatus");

const FRONT_WEBP = "./img/1.webp";
const BACK_WEBP = "./img/2.webp";
const MAX_TILT_DEG = 14;
const ARROW_STEP_DEG = 5;
const IDLE_DELAY_MS = 700;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.8;
const ZOOM_STEP = 0.1;
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let hasCard = false;
let isBusy = false;
let isHovering = false;
let idleTimer = null;
let zoomLevel = 1;

let tiltRAF = null;
let tiltTarget = { x: 0, y: 0 };
let tiltCurrent = { x: 0, y: 0 };

stage.addEventListener("click", () => {
  if (hasCard) cardFlip.classList.toggle("is-flipped");
});

cardFlip.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    if (hasCard) cardFlip.classList.toggle("is-flipped");
    return;
  }

  if (!hasCard) return;

  const arrowMap = {
    ArrowLeft: () => {
      tiltTarget.y = clamp(tiltTarget.y - ARROW_STEP_DEG, -MAX_TILT_DEG, MAX_TILT_DEG);
    },
    ArrowRight: () => {
      tiltTarget.y = clamp(tiltTarget.y + ARROW_STEP_DEG, -MAX_TILT_DEG, MAX_TILT_DEG);
    },
    ArrowUp: () => {
      tiltTarget.x = clamp(tiltTarget.x + ARROW_STEP_DEG, -MAX_TILT_DEG, MAX_TILT_DEG);
    },
    ArrowDown: () => {
      tiltTarget.x = clamp(tiltTarget.x - ARROW_STEP_DEG, -MAX_TILT_DEG, MAX_TILT_DEG);
    },
  };

  if (arrowMap[e.key]) {
    e.preventDefault();
    clearIdleTimer();
    activateTilt();
    arrowMap[e.key]();
    if (!isHovering) scheduleIdleSpin();
  }
});

stage.addEventListener("pointerenter", () => {
  isHovering = true;
  clearIdleTimer();
  if (hasCard) activateTilt();
});

stage.addEventListener("pointermove", (e) => {
  if (!hasCard || !cardRig.classList.contains("mode-tilt")) return;
  const rect = stage.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;

  tiltTarget.y = (px - 0.5) * MAX_TILT_DEG * 2;
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

stage.addEventListener(
  "wheel",
  (e) => {
    if (!hasCard) return;
    e.preventDefault();

    const delta = Math.sign(e.deltaY);
    if (delta === 0) return;

    zoomLevel = clamp(
      zoomLevel + (delta > 0 ? -ZOOM_STEP : ZOOM_STEP),
      MIN_ZOOM,
      MAX_ZOOM
    );
    applyZoom();
  },
  { passive: false }
);

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function announce(text) {
  srStatus.textContent = text;
}

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
  if (!cardRig.classList.contains("mode-tilt")) {
    tiltRAF = null;
    return;
  }

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

async function loadLocalWEBPs() {
  if (isBusy) return;

  isBusy = true;
  stage.classList.add("is-loading");
  announce("正在讀取 WEBP 圖檔...");

  try {
    const [front] = await Promise.all([
      renderImageToFace(FRONT_WEBP, faceFront),
      renderImageToFace(BACK_WEBP, faceBack),
    ]);

    hasCard = true;
    stage.classList.add("has-card");
    cardFlip.style.setProperty("--ratio", front.ratio.toFixed(4));
    cardFlip.classList.remove("is-flipped");
    if (isHovering) activateTilt();
    else activateIdleSpin();
    announce("已載入 WEBP/1.webp 與 WEBP/2.webp，使用滾輪可縮放");
  } catch (err) {
    console.error(err);
    flashError("無法載入 WEBP/1.webp 或 WEBP/2.webp");
  } finally {
    stage.classList.remove("is-loading");
    isBusy = false;
  }
}

async function renderImageToFace(url, faceEl) {
  const img = await loadImage(url);
  img.draggable = false;
  img.alt = "";
  const sheen = Array.from(faceEl.children).find((child) => child.classList?.contains("sheen"));
  faceEl.replaceChildren(img);
  if (sheen) faceEl.appendChild(sheen);
  faceEl.classList.remove("is-placeholder");

  return {
    ratio: img.naturalWidth / img.naturalHeight,
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

loadLocalWEBPs();
