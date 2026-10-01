const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// A small DOM fixture, including nested lists and visibility inherited from parents.
class Element {
  constructor(tag = "div", classes = "", text = "") {
    this.tagName = tag;
    this.classes = new Set(classes.split(/\s+/).filter(Boolean));
    this.text = text;
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.hidden = false;
    this.style = {};
    this.classList = {
      contains: (name) => this.classes.has(name),
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name)
    };
  }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
    return this;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }
  get textContent() { return this.text + this.children.map((child) => child.textContent).join(""); }
  get nextElementSibling() {
    const siblings = this.parentElement?.children || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  getAttribute(name) {
    if (name === "class") return [...this.classes].join(" ");
    if (name === "hidden") return this.hidden ? "" : null;
    return this.attributes[name] ?? null;
  }
  matches(selectors) {
    return selectors.split(",").some((selector) => {
      const value = selector.trim();
      const tag = value.match(/^[\w-]+/);
      if (tag && tag[0] !== this.tagName) return false;
      for (const match of value.matchAll(/\.([\w-]+)/g)) {
        if (!this.classes.has(match[1])) return false;
      }
      for (const match of value.matchAll(/\[([\w-]+)(?:([*]?=)['"]([^'"]*)['"])?\]/g)) {
        const attribute = this.getAttribute(match[1]);
        if (attribute === null) return false;
        if (match[2] === "=" && attribute !== match[3]) return false;
        if (match[2] === "*=" && !attribute.includes(match[3])) return false;
      }
      return true;
    });
  }
  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() {
    const hidden = this.closest("[hidden]");
    const width = hidden ? 0 : this.tagName === "video" ? 640 : 800;
    const height = hidden ? 0 : this.tagName === "video" ? 360 : 400;
    return { width, height, top: 0, left: 0, bottom: height, right: width };
  }
  scrollIntoView() {}
  click() { this.onClick?.(); }
}

function branch(title, chapter = false) {
  const node = new Element(chapter ? "div" : "li", chapter ? "catalogItem" : "");
  const label = new Element("span", "oneline", title);
  const control = new Element("div", chapter ? "chapter" : "basic").append(label);
  node.append(control);
  return { node, label, control, title };
}

function descendants(parent, children, hidden = false) {
  const list = new Element("ul", "rank-2").append(...children.map((child) => child.node));
  list.hidden = hidden;
  parent.node.append(list);
  return list;
}

function resource(title, kind = "video") {
  return new Element("div", "basic", title).append(new Element("span", `icon-${kind}`));
}

function fixture(mode, options = {}) {
  const document = new Element("main");
  document.readyState = "loading";
  document.title = "课程目录测试";
  document.addEventListener = () => {};
  const catalog = new Element("div", "catalog");
  const chapter6 = branch("6", true);
  const section62 = branch("6.2");
  const current = branch("6.2.2");
  current.label.classList.add("active");
  descendants(section62, [current]);
  descendants(chapter6, [section62]);
  catalog.append(chapter6.node);

  let pathToNext = [];
  if (mode === "subsection") {
    pathToNext = [branch("6.2.3")];
    current.node.parentElement.append(pathToNext[0].node);
  } else if (mode === "section") {
    pathToNext = [branch("6.3"), branch("6.3.1")];
    section62.node.parentElement.append(pathToNext[0].node);
  } else if (mode === "chapter") {
    pathToNext = [branch("7", true), branch("7.1"), branch("7.1.1")];
    catalog.append(pathToNext[0].node);
  }
  for (let i = 0; i < pathToNext.length - 1; i += 1) {
    descendants(pathToNext[i], [pathToNext[i + 1]], true);
  }

  const oldItem = resource("6.2.2 最后一个视频");
  oldItem.classList.add("active");
  const resources = new Element("div", "resourcelist").append(oldItem);
  const video = new Element("video");
  Object.assign(video, { currentSrc: "old.mp4", ended: true, paused: true });
  document.append(catalog, resources, video);
  const clicks = [];
  const messages = [];
  const pendingLoads = [];
  let now = 0;

  function activate(entry) {
    for (const label of catalog.querySelectorAll(".oneline.active")) label.classList.remove("active");
    entry.label.classList.add("active");
  }
  function loadResources(entry) {
    const next = resource(`${entry.title} 第一个视频`);
    next.onClick = () => {
      clicks.push("video");
      video.currentSrc = "new.mp4";
      video.ended = false;
      video.paused = false;
    };
    const quiz = resource("先完成测验", "test");
    if (options.completedQuiz) quiz.classList.add("complete");
    resources.replaceChildren(...(options.quiz || options.completedQuiz ? [quiz, next] : [next]));
  }
  pathToNext.forEach((entry, index) => {
    entry.control.onClick = () => {
      clicks.push(entry.title);
      activate(entry);
      if (index < pathToNext.length - 1) {
        entry.node.children[1].hidden = false;
        if (options.autoLoad) {
          activate(pathToNext.at(-1));
          loadResources(pathToNext.at(-1));
        }
      } else if (!options.stale && !options.autoLoad) {
        if (options.delayed) {
          pendingLoads.push({ at: now + 1500, callback: () => loadResources(entry) });
        } else {
          loadResources(entry);
        }
      }
      if (options.blocked) {
        const dialog = new Element("div", "question-dialog");
        dialog.style = { position: "fixed", zIndex: "30" };
        document.append(dialog);
      }
    };
  });
  if (options.locked) pathToNext[0].control.attributes["aria-disabled"] = "true";
  if (options.currentQuiz || options.currentQuizComplete) {
    const quiz = resource("本节测验", "test");
    if (options.currentQuizComplete) quiz.classList.add("complete");
    resources.append(quiz);
  }

  class Clock extends Date { static now() { return now; } }
  const context = {
    document, console, Date: Clock, HTMLElement: Element,
    location: { href: "https://www.uooc.net.cn/home/learn/index#/course" },
    chrome: { runtime: { async sendMessage(message) { messages.push(message); return { ok: true }; } } },
    window: {
      innerWidth: 1200, innerHeight: 900,
      getComputedStyle(node) {
        return { display: node.closest("[hidden]") ? "none" : "block", visibility: "visible",
          pointerEvents: "auto", position: "static", opacity: "1", ...node.style };
      },
      setTimeout(callback, delay) {
        setImmediate(() => {
          now += delay;
          for (const pending of [...pendingLoads]) {
            if (pending.at <= now) {
              pendingLoads.splice(pendingLoads.indexOf(pending), 1);
              pending.callback();
            }
          }
          callback();
        });
        return 1;
      },
      clearTimeout() {}
    }
  };
  const source = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  vm.runInNewContext(`${source}\nglobalThis.probe = { state, tryNextVideo };`, context);
  Object.assign(context.probe.state, { video, endedVideo: video, endedSource: "old.mp4" });
  return { run: () => context.probe.tryNextVideo(video), clicks, messages };
}

for (const [mode, expected] of [
  ["subsection", ["6.2.3", "video"]],
  ["section", ["6.3", "6.3.1", "video"]],
  ["chapter", ["7", "7.1", "7.1.1", "video"]]
]) {
  test(`switches across ${mode} boundaries and confirms the new video`, async () => {
    const page = fixture(mode);
    await page.run();
    assert.deepEqual(page.clicks, expected);
    assert.equal(page.messages.at(-1).payload.kind, "auto-next-success");
  });
}

test("uses newly loaded resources when a parent selects its first section automatically", async () => {
  const page = fixture("section", { autoLoad: true });
  await page.run();
  assert.deepEqual(page.clicks, ["6.3", "6.3.1", "video"]);
  assert.equal(page.messages.at(-1).payload.kind, "auto-next-success");
});

test("waits for asynchronous section resources instead of clicking the old list", async () => {
  const page = fixture("chapter", { delayed: true });
  await page.run();
  assert.deepEqual(page.clicks, ["7", "7.1", "7.1.1", "video"]);
  assert.equal(page.messages.at(-1).payload.kind, "auto-next-success");
});

for (const option of ["completedQuiz", "currentQuizComplete"]) {
  test(`allows navigation past a quiz already marked complete (${option})`, async () => {
    const page = fixture("subsection", { [option]: true });
    await page.run();
    assert.deepEqual(page.clicks, ["6.2.3", "video"]);
    assert.equal(page.messages.at(-1).payload.kind, "auto-next-success");
  });
}

for (const [option, expectedClicks] of [
  ["locked", []], ["quiz", ["6.2.3"]], ["stale", ["6.2.3"]],
  ["blocked", ["6.2.3"]], ["currentQuiz", []]
]) {
  test(`keeps the reminder when navigation encounters ${option}`, async () => {
    const page = fixture("subsection", { [option]: true });
    await page.run();
    assert.deepEqual(page.clicks, expectedClicks);
    assert.equal(page.messages.at(-1).payload.kind, "ended");
  });
}

test("does not return to the start after the course's last video", async () => {
  const page = fixture("end");
  await page.run();
  assert.deepEqual(page.clicks, []);
  assert.equal(page.messages.at(-1).payload.kind, "ended");
});
