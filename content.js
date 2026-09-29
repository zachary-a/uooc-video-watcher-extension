const PAUSE_THRESHOLD_MS = 10 * 1000;
const BLOCKED_THRESHOLD_MS = 15 * 1000;
const PROGRESS_THROTTLE_MS = 15 * 1000;
const HEARTBEAT_INTERVAL_MS = 5000;
const TARGET_PLAYBACK_RATE = 2;
const NEXT_VIDEO_SETTLE_MS = 2500;
const NEXT_VIDEO_CONFIRM_MS = 8000;

const BLOCKING_SELECTORS = [
  ".el-dialog__wrapper",
  ".el-message-box__wrapper",
  ".ant-modal-wrap",
  ".ant-modal-mask",
  ".layui-layer",
  ".layui-layer-page",
  ".video-question",
  ".question-dialog",
  ".question-modal",
  ".exam-dialog",
  ".mask-layer",
  "[role='dialog']",
  "[class*='question']",
  "[class*='exam']",
  "[class*='topic']",
  "[class*='modal']",
  "[class*='dialog']",
  "[class*='mask']"
];

const state = {
  video: null,
  domObserverAttached: false,
  inspectTimerId: null,
  pauseTimerId: null,
  overlaySeenSince: null,
  lastProgressSentAt: 0,
  lastBlockedReportAt: 0,
  tabMuted: false,
  heartbeatStarted: false,
  endedVideo: null,
  endedSource: null,
  nextVideoTimerId: null,
  videoIdentity: null
};

bootstrap();

function bootstrap() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startMonitoring, { once: true });
    return;
  }

  startMonitoring();
}

function startMonitoring() {
  attachToBestVideo();
  observeDomChanges();
  window.addEventListener("focus", attachToBestVideo, { passive: true });

  if (state.heartbeatStarted) {
    return;
  }

  state.heartbeatStarted = true;
  window.setInterval(() => {
    attachToBestVideo();
    applyVideoPreferences();
    inspectPossibleBlocker();
    sendProgress("heartbeat");
  }, HEARTBEAT_INTERVAL_MS);
}

function observeDomChanges() {
  if (state.domObserverAttached) {
    return;
  }

  state.domObserverAttached = true;
  const observer = new MutationObserver(scheduleInspection);

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden"]
  });
}

function scheduleInspection() {
  if (state.inspectTimerId) {
    return;
  }

  state.inspectTimerId = window.setTimeout(() => {
    state.inspectTimerId = null;
    attachToBestVideo();
    inspectPossibleBlocker();
  }, 150);
}

function attachToBestVideo() {
  const nextVideo = pickBestVideo();
  if (!nextVideo) {
    if (state.video) {
      detachVideoListeners(state.video);
      state.video = null;
    }

    clearPauseTimer();
    void sendMessage({
      type: "STATUS_UPDATE",
      payload: buildPayload("video-missing")
    });
    return;
  }

  if (state.video === nextVideo) {
    applyVideoPreferences();
    return;
  }

  if (state.video) {
    detachVideoListeners(state.video);
  }

  state.video = nextVideo;
  state.videoIdentity = `${Date.now()}-${Math.random()}`;
  attachVideoListeners(nextVideo);
  if (state.endedVideo && !nextVideo.ended &&
      (nextVideo.currentSrc || nextVideo.src) &&
      (nextVideo.currentSrc || nextVideo.src) !== state.endedSource) {
    finishAutoNext(true);
  }
  if (!nextVideo.ended) {
    void sendMessage({ type: "VIDEO_SELECTED", payload: buildPayload("video-selected") });
  }
  applyVideoPreferences();
  void ensureTabMuted(nextVideo);

  if (nextVideo.ended) {
    handleEnded();
  } else if (!nextVideo.paused) {
    handlePlay();
  } else {
    handlePause();
  }
}

function pickBestVideo() {
  const videos = [...document.querySelectorAll("video")].filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width > 32 && rect.height > 32;
  });

  if (videos.length === 0) {
    return null;
  }

  videos.sort((left, right) => area(right) - area(left));
  return videos[0];
}

function area(video) {
  const rect = video.getBoundingClientRect();
  return rect.width * rect.height;
}

function attachVideoListeners(video) {
  video.addEventListener("play", handlePlay);
  video.addEventListener("pause", handlePause);
  video.addEventListener("ended", handleEnded);
  video.addEventListener("waiting", handleWaiting);
  video.addEventListener("stalled", handleStalled);
  video.addEventListener("error", handleError);
  video.addEventListener("timeupdate", handleTimeupdate);
  video.addEventListener("loadedmetadata", handleLoadedMetadata);
  video.addEventListener("ratechange", applyVideoPreferences);
  video.addEventListener("volumechange", applyVideoPreferences);
  video.addEventListener("loadstart", applyVideoPreferences);
}

function detachVideoListeners(video) {
  video.removeEventListener("play", handlePlay);
  video.removeEventListener("pause", handlePause);
  video.removeEventListener("ended", handleEnded);
  video.removeEventListener("waiting", handleWaiting);
  video.removeEventListener("stalled", handleStalled);
  video.removeEventListener("error", handleError);
  video.removeEventListener("timeupdate", handleTimeupdate);
  video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  video.removeEventListener("ratechange", applyVideoPreferences);
  video.removeEventListener("volumechange", applyVideoPreferences);
  video.removeEventListener("loadstart", applyVideoPreferences);
}

function applyVideoPreferences() {
  const video = state.video;
  if (!video) {
    return;
  }

  // Keep the media element producing audio; Edge mutes the tab instead.
  if (state.tabMuted && video.muted) {
    video.muted = false;
  }
  if (video.playbackRate !== TARGET_PLAYBACK_RATE) {
    video.playbackRate = TARGET_PLAYBACK_RATE;
  }
}

async function ensureTabMuted(video) {
  if (!state.tabMuted) {
    video.muted = true;
  }

  const response = await sendMessage({ type: "MUTE_VIDEO_TAB" });
  if (!response?.ok || state.video !== video) {
    return;
  }

  state.tabMuted = true;
  video.muted = false;
}

function handlePlay() {
  applyVideoPreferences();
  if (state.video) {
    void ensureTabMuted(state.video);
  }
  void sendMessage({ type: "RUN_AUTO_ANTI_PAUSE" });
  clearPauseTimer();
  state.overlaySeenSince = null;
  state.lastBlockedReportAt = 0;

  void sendMessage({
    type: "STATUS_UPDATE",
    payload: buildPayload("play")
  });
}

function handlePause() {
  clearPauseTimer();
  const pausedSince = Date.now();

  void sendMessage({
    type: "STATUS_UPDATE",
    payload: buildPayload("pause", { pausedSince })
  });

  state.pauseTimerId = window.setTimeout(() => {
    if (!state.video || !state.video.paused || state.video.ended) {
      return;
    }

    void sendMessage({
      type: "ALERT_EVENT",
      payload: buildPayload("pause-timeout", { pausedSince })
    });
  }, PAUSE_THRESHOLD_MS);
}

function handleEnded() {
  if (state.endedVideo === state.video) {
    return;
  }
  clearPauseTimer();
  state.overlaySeenSince = null;
  state.endedVideo = state.video;
  state.endedSource = state.video?.currentSrc || state.video?.src || "";

  void sendMessage({
    type: "STATUS_UPDATE",
    payload: buildPayload("ended-pending")
  });

  state.nextVideoTimerId = window.setTimeout(() => {
    void tryNextVideo(state.endedVideo);
  }, NEXT_VIDEO_SETTLE_MS);
}

async function tryNextVideo(endedVideo) {
  if (!endedVideo || state.endedVideo !== endedVideo) {
    return;
  }
  if (!endedVideo.ended) {
    finishAutoNext((endedVideo.currentSrc || endedVideo.src) !== state.endedSource);
    return;
  }

  if (findBlockingElement()) {
    finishAutoNext(false);
    return;
  }

  const nextControl = findAvailableNextControl();
  if (!nextControl) {
    finishAutoNext(false);
    return;
  }

  const oldSource = endedVideo.currentSrc || endedVideo.src;
  nextControl.click();

  // A normal page navigation may unload this script. The background worker
  // keeps the pending reminder until a new video is actually selected.
  await new Promise((resolve) => window.setTimeout(resolve, NEXT_VIDEO_CONFIRM_MS));
  if (state.endedVideo !== endedVideo) {
    return;
  }

  const current = pickBestVideo();
  const sourceChanged = current && (current.currentSrc || current.src) &&
    (current.currentSrc || current.src) !== oldSource;
  if (current && !current.ended && sourceChanged) {
    finishAutoNext(true);
  } else {
    finishAutoNext(false);
  }
}

function findAvailableNextControl() {
  const activeVideoItem = [...document.querySelectorAll(".basic.active")]
    .find((item) => item.querySelector(".icon-video"));
  if (activeVideoItem) {
    const items = [...document.querySelectorAll(".basic")];
    const nextItem = items[items.indexOf(activeVideoItem) + 1];
    // Do not skip a quiz, locked item, or collapsed chapter to reach a later video.
    return nextItem?.querySelector(".icon-video") &&
      !nextItem.querySelector(".icon-lock, .icon-locked") && isAvailableControl(nextItem)
      ? nextItem : null;
  }

  const controls = document.querySelectorAll("button, a, [role='button']");
  for (const control of controls) {
    const label = [control.textContent, control.getAttribute("aria-label"), control.getAttribute("title")]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (!/下一(?:节视频|个视频|段视频|视频)/.test(label)) {
      continue;
    }
    if (isAvailableControl(control)) {
      return control;
    }
  }
  return null;
}

function isAvailableControl(control) {
  if (control.closest("[disabled], [aria-disabled='true'], [inert], .disabled, .is-disabled, .locked, .is-locked")) {
    return false;
  }
  const style = window.getComputedStyle(control);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return false;
  }
  const rect = control.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
    rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function finishAutoNext(succeeded) {
  if (!state.endedVideo) {
    return;
  }
  if (state.nextVideoTimerId) {
    window.clearTimeout(state.nextVideoTimerId);
    state.nextVideoTimerId = null;
  }
  state.endedVideo = null;
  state.endedSource = null;
  void sendMessage({
    type: "STATUS_UPDATE",
    payload: buildPayload(succeeded ? "auto-next-success" : "ended")
  });
}

function handleWaiting() {
  void sendMessage({
    type: "STATUS_UPDATE",
    payload: buildPayload("waiting")
  });
}

function handleStalled() {
  void sendMessage({
    type: "STATUS_UPDATE",
    payload: buildPayload("stalled")
  });
}

function handleError() {
  void sendMessage({
    type: "STATUS_UPDATE",
    payload: buildPayload("error")
  });
}

function handleTimeupdate() {
  sendProgress("progress");
}

function handleLoadedMetadata() {
  applyVideoPreferences();
  sendProgress("metadata");
  if (state.endedVideo && !state.video.ended &&
      (state.video.currentSrc || state.video.src) &&
      (state.video.currentSrc || state.video.src) !== state.endedSource) {
    finishAutoNext(true);
  }
  void sendMessage({ type: "VIDEO_SELECTED", payload: buildPayload("video-selected") });
}

function sendProgress(kind) {
  if (!state.video) {
    return;
  }

  const now = Date.now();
  if (kind === "progress" && now - state.lastProgressSentAt < PROGRESS_THROTTLE_MS) {
    return;
  }

  state.lastProgressSentAt = now;
  void sendMessage({
    type: "STATUS_UPDATE",
    payload: buildPayload("progress", { kind })
  });
}

function inspectPossibleBlocker() {
  if (!state.video || state.video.ended) {
    state.overlaySeenSince = null;
    return;
  }

  const blockingElement = findBlockingElement();
  if (!blockingElement || !state.video.paused) {
    state.overlaySeenSince = null;
    return;
  }

  if (!state.overlaySeenSince) {
    state.overlaySeenSince = Date.now();
    return;
  }

  const now = Date.now();
  if (now - state.overlaySeenSince < BLOCKED_THRESHOLD_MS) {
    return;
  }

  if (now - state.lastBlockedReportAt < BLOCKED_THRESHOLD_MS) {
    return;
  }

  state.lastBlockedReportAt = now;
  void sendMessage({
    type: "ALERT_EVENT",
    payload: buildPayload("blocked-suspected", {
      blockedSince: state.overlaySeenSince
    })
  });
}

function findBlockingElement() {
  for (const selector of BLOCKING_SELECTORS) {
    const matches = document.querySelectorAll(selector);
    for (const node of matches) {
      if (isBlocking(node)) {
        return node;
      }
    }
  }

  return null;
}

function isBlocking(node) {
  if (!(node instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(node);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rect = node.getBoundingClientRect();
  if (rect.width < window.innerWidth * 0.25 || rect.height < window.innerHeight * 0.15) {
    return false;
  }

  if (rect.bottom < 0 || rect.right < 0) {
    return false;
  }

  if (!["fixed", "absolute", "sticky"].includes(style.position)) {
    return false;
  }

  const zIndex = Number.parseInt(style.zIndex || "0", 10);
  return Number.isFinite(zIndex) ? zIndex >= 10 : true;
}

function buildPayload(kind, extra = {}) {
  const video = state.video;

  return {
    kind,
    title: document.title,
    url: location.href,
    currentTime: video ? Number(video.currentTime || 0) : 0,
    duration: video ? Number(video.duration || 0) : 0,
    paused: video ? video.paused : false,
    ended: video ? video.ended : false,
    videoIdentity: state.videoIdentity,
    source: video ? video.currentSrc || video.src || "" : "",
    ...extra
  };
}

async function sendMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.debug("Extension message failed", error);
    return null;
  }
}

function clearPauseTimer() {
  if (!state.pauseTimerId) {
    return;
  }

  window.clearTimeout(state.pauseTimerId);
  state.pauseTimerId = null;
}
