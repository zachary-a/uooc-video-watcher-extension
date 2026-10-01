const PAUSE_THRESHOLD_MS = 10 * 1000;
const BLOCKED_THRESHOLD_MS = 15 * 1000;
const PROGRESS_THROTTLE_MS = 15 * 1000;
const HEARTBEAT_INTERVAL_MS = 5000;
const TARGET_PLAYBACK_RATE = 2;
const NEXT_VIDEO_MIN_DELAY_MS = 3000;
const NEXT_VIDEO_MAX_DELAY_MS = 7000;
const NEXT_VIDEO_CONFIRM_MS = 8000;
const CATALOG_NAVIGATION_TIMEOUT_MS = 20000;
const CATALOG_POLL_MS = 250;
const MAX_CATALOG_DEPTH = 12;

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
    if (!state.video || !state.video.paused || state.video.ended || state.endedVideo) {
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

  const nextVideoDelayMs = NEXT_VIDEO_MIN_DELAY_MS + Math.floor(Math.random() *
    (NEXT_VIDEO_MAX_DELAY_MS - NEXT_VIDEO_MIN_DELAY_MS + 1));
  state.nextVideoTimerId = window.setTimeout(() => {
    void tryNextVideo(state.endedVideo);
  }, nextVideoDelayMs);
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

  let nextControl;
  try {
    const action = findNextCourseAction();
    nextControl = action?.kind === "catalog"
      ? await findVideoInCatalogNode(action.node, endedVideo)
      : action?.control;
  } catch (error) {
    console.debug("Next video selection failed", error);
  }
  if (state.endedVideo !== endedVideo) {
    return;
  }
  if (!nextControl) {
    finishAutoNext(false);
    return;
  }

  const oldSource = state.endedSource;
  if (findBlockingElement() || !clickAvailableControl(nextControl)) {
    finishAutoNext(false);
    return;
  }

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

function findNextCourseAction() {
  const activeVideoItem = [...document.querySelectorAll(".basic.active")]
    .find((item) => item.querySelector(".icon-video"));
  if (activeVideoItem) {
    const resourceList = activeVideoItem.closest(".resourcelist");
    const items = [...(resourceList || document).querySelectorAll(".basic")];
    const remaining = items.slice(items.indexOf(activeVideoItem) + 1);
    const nextItem = resourceList ? nextRequiredResource(remaining) : remaining[0];
    if (nextItem) {
      // An unfinished resource such as a quiz must be handled before leaving this section.
      return isVideoControl(nextItem) && isControlEnabled(nextItem)
        ? { kind: "video", control: nextItem } : null;
    }
    if (resourceList) {
      const labels = [...document.querySelectorAll(".oneline.active")]
        .filter((label) => !label.closest(".resourcelist"));
      const currentNode = labels.at(-1)?.closest("li, .catalogItem");
      const nextNode = findNextCatalogNode(currentNode);
      return nextNode ? { kind: "catalog", node: nextNode } : null;
    }
    return null;
  }

  const controls = document.querySelectorAll("button, a, [role='button']");
  for (const control of controls) {
    const label = [control.textContent, control.getAttribute("aria-label"), control.getAttribute("title")]
      .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (!/下一(?:节视频|个视频|段视频|视频)/.test(label)) {
      continue;
    }
    if (isAvailableControl(control)) {
      return { kind: "video", control };
    }
  }
  return null;
}

function findNextCatalogNode(currentNode) {
  let node = currentNode;
  while (node) {
    if (node.nextElementSibling) {
      return getCatalogControl(node.nextElementSibling) ? node.nextElementSibling : null;
    }
    node = node.parentElement?.closest("li, .catalogItem");
  }
  return null;
}

function getCatalogControl(node) {
  return [...node.querySelectorAll(".chapter, .basic")].find((control) =>
    !control.closest(".resourcelist") && control.closest("li, .catalogItem") === node) || null;
}

function getCatalogChildren(node) {
  return [...node.querySelectorAll("li, .catalogItem")].filter((child) =>
    child.parentElement?.closest("li, .catalogItem") === node && getCatalogControl(child));
}

function readResourceList(node = document) {
  const list = [...node.querySelectorAll(".resourcelist")].find(isControlVisible);
  const items = list ? [...list.querySelectorAll(".basic")] : [];
  return { list, items, text: items.map((item) => item.textContent).join("\n") };
}

function resourceListChanged(before, after) {
  return after.items.length > 0 && (before.list !== after.list ||
    before.text !== after.text || before.items.length !== after.items.length ||
    after.items.some((item, index) => before.items[index] !== item));
}

async function findVideoInCatalogNode(firstNode, endedVideo) {
  const deadline = Date.now() + CATALOG_NAVIGATION_TIMEOUT_MS;
  const before = readResourceList();
  let node = firstNode;
  for (let depth = 0; node && depth < MAX_CATALOG_DEPTH; depth += 1) {
    if (Date.now() >= deadline || state.endedVideo !== endedVideo || findBlockingElement()) {
      return null;
    }
    const control = getCatalogControl(node);
    if (!control || !isControlEnabled(control)) {
      return null;
    }
    const children = getCatalogChildren(node);
    const firstChild = children[0];
    if (firstChild && isControlVisible(getCatalogControl(firstChild))) {
      node = firstChild;
      continue;
    }

    if (!clickAvailableControl(control)) {
      return null;
    }
    await new Promise((resolve) => window.setTimeout(resolve, CATALOG_POLL_MS));

    let loaded = null;
    while (Date.now() < deadline && state.endedVideo === endedVideo) {
      if (findBlockingElement()) {
        return null;
      }
      const child = getCatalogChildren(node)[0];
      if (child && isControlVisible(getCatalogControl(child))) {
        loaded = { child };
        break;
      }
      const scoped = readResourceList(node);
      const global = readResourceList();
      const selected = [...node.querySelectorAll(".oneline.active")].some((label) =>
        label.closest("li, .catalogItem") === node);
      const resources = scoped.items.length ? scoped
        : selected && resourceListChanged(before, global) ? global : null;
      if (resources) {
        // Let the page finish replacing its list before selecting the first item.
        await new Promise((resolve) => window.setTimeout(resolve, CATALOG_POLL_MS));
        if (state.endedVideo !== endedVideo || findBlockingElement()) {
          return null;
        }
        const refreshed = readResourceList(scoped.items.length ? node : document);
        if (refreshed.items[0] === resources.items[0] && refreshed.text === resources.text) {
          loaded = { resources: refreshed };
          break;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, CATALOG_POLL_MS));
    }
    if (!loaded) {
      return null;
    }
    if (loaded.resources) {
      const first = nextRequiredResource(loaded.resources.items);
      return isVideoControl(first) && isControlEnabled(first) ? first : null;
    }
    node = loaded.child;
  }
  return null;
}

function isVideoControl(control) {
  return Boolean(control?.querySelector(".icon-video"));
}

function nextRequiredResource(items) {
  return items.find((item) => isVideoControl(item) || !item.classList?.contains("complete")) || null;
}

function isControlEnabled(control) {
  return Boolean(control && !control.closest(
    "[disabled], [aria-disabled='true'], [inert], .disabled, .is-disabled, .locked, .is-locked") &&
    !control.querySelector(".icon-lock, .icon-locked"));
}

function isControlVisible(control) {
  if (!control || control.closest("[hidden]")) {
    return false;
  }
  const style = window.getComputedStyle(control);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return false;
  }
  const rect = control.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isAvailableControl(control) {
  if (!isControlEnabled(control) || !isControlVisible(control)) {
    return false;
  }
  const rect = control.getBoundingClientRect();
  return rect.bottom > 0 && rect.right > 0 &&
    rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function clickAvailableControl(control) {
  if (!isControlEnabled(control) || !isControlVisible(control)) {
    return false;
  }
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (!isAvailableControl(control)) {
    return false;
  }
  control.click();
  return true;
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
  if (succeeded && state.video?.paused && !state.video.ended) {
    handlePause();
  }
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
