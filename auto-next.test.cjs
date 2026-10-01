const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function item({ video = false, disabled = false, text = "" } = {}) {
  return {
    textContent: text,
    querySelector(selector) { return selector === ".icon-video" && video ? {} : null; },
    getAttribute() { return null; },
    closest() { return disabled ? this : null; },
    getBoundingClientRect() { return { width: 100, height: 30, top: 0, left: 0, bottom: 30, right: 100 }; }
  };
}

function contentProbe({ active = [], items = [], controls = [] }) {
  const document = {
    readyState: "loading",
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === ".basic.active") return active;
      if (selector === ".basic") return items;
      if (selector === "button, a, [role='button']") return controls;
      return [];
    }
  };
  const context = {
    document,
    window: {
      innerWidth: 1200,
      innerHeight: 800,
      getComputedStyle() { return { display: "block", visibility: "visible", pointerEvents: "auto" }; }
    }
  };
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  vm.runInNewContext(`${source}\nglobalThis.probe = () => findNextCourseAction()?.control || null;`, context);
  return context.probe();
}

test("selects only the immediately following available UOOC video", () => {
  const current = item({ video: true });
  const next = item({ video: true });
  assert.equal(contentProbe({ active: [current], items: [current, next] }), next);
});

test("stops at a quiz instead of skipping to a later video", () => {
  const current = item({ video: true });
  const quiz = item();
  const later = item({ video: true });
  assert.equal(contentProbe({ active: [current], items: [current, quiz, later] }), null);
});

test("does not select a locked next video", () => {
  const current = item({ video: true });
  const locked = item({ video: true, disabled: true });
  assert.equal(contentProbe({ active: [current], items: [current, locked] }), null);
});

test("uses a visible next button when no active UOOC video item exists", () => {
  const next = item({ text: "下一节视频" });
  assert.equal(contentProbe({ controls: [next] }), next);
});

test("does not click a generic next section that may lead to a quiz", () => {
  const next = item({ text: "下一节" });
  assert.equal(contentProbe({ controls: [next] }), null);
});

async function backgroundProbe() {
  const notifications = [];
  const timers = new Map();
  let nextTimerId = 1;
  const event = { addListener() {} };
  const chrome = {
    runtime: {
      getURL(pathname) { return pathname; },
      onMessage: event,
      async sendMessage() { return { ok: true }; },
      async getContexts() { return [{}]; }
    },
    notifications: {
      onClicked: event,
      async create(id) { notifications.push(id); }
    },
    tabs: {
      onRemoved: event,
      onUpdated: event,
      async query() { return []; }
    },
    storage: { local: {
      async get() { return {}; },
      async set() {}
    } },
    windows: { async create() { return { id: 1 }; } }
  };
  const context = {
    chrome,
    console,
    setTimeout(callback) { const id = nextTimerId++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  const source = fs.readFileSync(path.join(__dirname, "background.js"), "utf8");
  vm.runInNewContext(`${source}\nglobalThis.probe = { handleStatusUpdate, handleVideoSelected, handleAlertEvent, resetRuntimeState, state };`, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { ...context.probe, notifications, timers };
}

function payload(kind, videoIdentity, source) {
  return { kind, videoIdentity, source, title: "课程", url: "https://www.uooc.net.cn/course" };
}

test("a newly selected video cancels the end reminder", async () => {
  const worker = await backgroundProbe();
  const sender = { tab: { id: 7 } };
  await worker.handleStatusUpdate(payload("ended-pending", "old", "old.mp4"), sender);
  await worker.handleVideoSelected(payload("video-selected", "new", "new.mp4"), sender);
  assert.equal(worker.state.tabs[7].pendingEndedVideoId, null);
  assert.equal(worker.timers.size, 0);
  assert.equal(worker.notifications.length, 0);
});

test("a failed switch keeps the original end reminder", async () => {
  const worker = await backgroundProbe();
  const sender = { tab: { id: 7 } };
  await worker.handleStatusUpdate(payload("ended-pending", "old", "old.mp4"), sender);
  await worker.handleStatusUpdate(payload("ended", "old", "old.mp4"), sender);
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0], "uooc-7-ended");
});

test("page loading does not erase a pending reminder", async () => {
  const worker = await backgroundProbe();
  const sender = { tab: { id: 7 } };
  await worker.handleStatusUpdate(payload("ended-pending", "old", "old.mp4"), sender);
  worker.resetRuntimeState(7, { keepSnooze: false });
  assert.equal(worker.state.tabs[7].pendingEndedVideoId, "old");
  const timer = [...worker.timers.values()][0];
  await timer();
  assert.equal(worker.notifications[0], "uooc-7-ended");
});

test("does not show a pause reminder while chapter navigation is pending", async () => {
  const worker = await backgroundProbe();
  const sender = { tab: { id: 7 } };
  await worker.handleStatusUpdate(payload("ended-pending", "old", "old.mp4"), sender);
  await worker.handleAlertEvent(payload("pause-timeout", "old", "old.mp4"), sender);
  assert.equal(worker.notifications.length, 0);
  await worker.handleStatusUpdate(payload("ended", "old", "old.mp4"), sender);
  assert.equal(worker.notifications[0], "uooc-7-ended");
});
