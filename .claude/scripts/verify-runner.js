#!/usr/bin/env node
/* Drives the site in headless Chrome or Edge over the DevTools protocol and checks the runner end
   to end. No dependencies. Run: node .claude/scripts/verify-runner.js [testId] */

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const testId = process.argv[2] || "ssat-middle-diagnostic-01";
const shots = path.join(process.env.SCRATCHPAD || os.tmpdir(), "verify-runner-" + Date.now());
fs.mkdirSync(shots, { recursive: true });

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (rel.endsWith("/")) rel += "index.html";
      const file = path.normalize(path.join(root, rel));
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
      }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, base: "http://127.0.0.1:" + srv.address().port + "/" }));
  });
}

function findBrowser() {
  const c = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return c.find((p) => fs.existsSync(p));
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let s = ""; res.on("data", (d) => (s += d)); res.on("end", () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}

async function launch() {
  const exe = findBrowser();
  if (!exe) throw new Error("No Chrome or Edge found. Set CHROME_PATH.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "verify-profile-"));
  const port = 9222 + Math.floor(Math.random() * 500);
  const proc = spawn(exe, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "--window-size=1200,900", "about:blank",
  ], { stdio: "ignore" });
  let info;
  for (let i = 0; i < 50 && !info; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try { info = await getJSON("http://127.0.0.1:" + port + "/json/version"); } catch (e) {}
  }
  if (!info) { proc.kill(); throw new Error("Browser did not open its debugging port."); }
  return { proc, port, profile, exe };
}

class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.waiters = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id); this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        // Leave-page and confirm dialogs would otherwise hang the run.
        if (msg.method === "Page.javascriptDialogOpening") this.send("Page.handleJavaScriptDialog", { accept: true });
        this.events.push(msg);
        this.waiters = this.waiters.filter((w) => !(w.method === msg.method && (w.resolve(msg), true)));
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  waitFor(method) { return new Promise((resolve) => this.waiters.push({ method, resolve })); }
  async goto(url) {
    const loaded = this.waitFor("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
    await new Promise((r) => setTimeout(r, 300));
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("In page: " + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async shot(name, full) {
    const r = await this.send("Page.captureScreenshot", full ? { format: "png", captureBeyondViewport: true } : { format: "png" });
    const f = path.join(shots, name + ".png");
    fs.writeFileSync(f, Buffer.from(r.data, "base64"));
    return f;
  }
}

let failures = 0;
function check(label, ok, detail) {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail !== undefined && !ok ? "  (" + JSON.stringify(detail) + ")" : ""));
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // VERIFY_BASE=https://host/path/ runs the same checks against a deployed copy instead.
  const remote = process.env.VERIFY_BASE;
  const { srv, base } = remote ? { srv: { close() {} }, base: remote.endsWith("/") ? remote : remote + "/" } : await serve();
  const browser = await launch();
  console.log("Browser: " + browser.exe);
  console.log("Site:    " + base);
  console.log("Shots:   " + shots + "\n");
  try {
    const targets = await getJSON("http://127.0.0.1:" + browser.port + "/json/list");
    const t = targets.find((x) => x.type === "page");
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const page = new Page(ws);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    const errors = [];
    page.ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text);
    });

    // Start clean.
    await page.goto(base + "index.html");
    await page.eval("localStorage.clear(); 'ok'");

    console.log("Home page");
    await page.goto(base + "index.html");
    await sleep(400);
    check("renders both exam groups", (await page.eval("document.querySelectorAll('.exam-group').length")) >= 2);
    const cards = await page.eval("document.querySelectorAll('.test-card').length");
    check("shows test cards", cards > 0, cards);
    check("no Attempted section when nothing is saved", (await page.eval("!!document.getElementById('attempted-section')")) === false);
    await page.shot("01-home");

    console.log("Runner: " + testId);
    await page.goto(base + "test.html?id=" + testId);
    await sleep(400);
    check("intro renders", await page.eval("state.phase === 'intro' && !!document.getElementById('begin')"));
    const hasWriting = await page.eval("!!state.test.writing");
    const wFirst = await page.eval("writingFirst()");
    await page.shot("02-intro");
    await page.eval("document.getElementById('begin').click(); 'ok'");
    await sleep(200);

    if (hasWriting && wFirst) {
      check("writing sample comes first", await page.eval("state.phase === 'writing'"));
      await page.eval("const ta = document.getElementById('essay'); ta.value = 'A short story written by the verifier. '.repeat(12); ta.dispatchEvent(new Event('input')); 'ok'");
      await page.shot("03-writing");
      await page.eval("document.getElementById('submit').click(); 'ok'");
      await sleep(200);
    }

    const n = await page.eval("sections().length");
    let sawBreak = false;
    for (let i = 0; i < n; i++) {
      check("section " + (i + 1) + " starts", await page.eval("state.phase === 'section' && state.si === " + i), await page.eval("state.phase + ' ' + state.si"));
      // Answer about two thirds, leave the rest blank, flag one. Use the keyboard for the first.
      await page.eval(`(() => {
        const qs = currentSection().questions;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
        for (let k = 1; k < qs.length; k++) { goto(k); if (k % 3 !== 0) choose((k % qs[k].choices.length)); }
        goto(0); toggleFlag(currentQuestion()); render(); return 'ok'; })()`);
      if (i === 0) await page.shot("04-question");
      if (i === 0) {
        // Time spent on the last question before answering it must be kept, not reset by the re-render.
        await page.eval("goto(currentSection().questions.length - 1); state.qEnteredAt = Date.now() - 5000; choose(0); 'ok'");
        const lastQ = await page.eval("(() => { const qs = currentSection().questions; markQuestionExit(); markQuestionEnter(); return state.qtime[qs[qs.length - 1].id] || 0; })()");
        check("last question keeps its time when answered", lastQ >= 5, lastQ);
      }
      const answered = await page.eval("Object.keys(state.answers).filter(id => currentSection().questions.some(q => q.id === id)).length");
      check("section " + (i + 1) + " records answers", answered > 0, answered);

      if (i === 0) {
        // Force the clock to expire and confirm the section locks itself.
        await page.eval("state.deadline = Date.now() - 10; 'ok'");
        await sleep(1500);
        check("timer expiry ends the section", await page.eval("state.phase !== 'section'"), await page.eval("state.phase"));
      } else {
        // The user presses Finish section; the ISEE blanks warning is auto-confirmed.
        await page.eval("window.confirm = () => true; goto(currentSection().questions.length - 1); document.getElementById('done').click(); 'ok'");
        await sleep(200);
      }

      const hasBreak = await page.eval("!!currentSection().breakAfterSeconds");
      if (hasBreak) {
        sawBreak = true;
        check("break screen after " + (await page.eval("currentSection().name")), await page.eval("state.phase === 'break'"));
        await sleep(1200);
        const clock = await page.eval("document.getElementById('clock').textContent");
        check("break clock counts up", /^0:0[1-9]$/.test(clock), clock);
        await page.shot("05-break");
      } else {
        check("section end screen", await page.eval("state.phase === 'sectionEnd'"), await page.eval("state.phase"));
      }
      await page.eval("document.getElementById('cont').click(); 'ok'");
      await sleep(200);
    }

    if (hasWriting && !wFirst) {
      check("essay comes last", await page.eval("state.phase === 'writing'"));
      await page.eval("const ta = document.getElementById('essay'); ta.value = 'An essay written by the verifier. '.repeat(12); ta.dispatchEvent(new Event('input')); document.getElementById('submit').click(); 'ok'");
      await sleep(200);
    }

    check("results screen", await page.eval("state.phase === 'results'"), await page.eval("state.phase"));
    check("attempt saved to localStorage", await page.eval("state.saved && JSON.parse(localStorage.getItem('prep:attempts')).length === 1"));
    check("review items rendered", (await page.eval("document.querySelectorAll('.review-item').length")) > 0);
    if (hasWriting) check("writing is readable on results", await page.eval("!!document.querySelector('.essay-view') && document.querySelector('.essay-view').textContent.includes('written by the verifier')"));
    check("no history block after one attempt", (await page.eval("document.body.innerHTML.includes('Across ')")) === false);
    await page.shot("06-results");
    const takenAt = await page.eval("state.attempt.takenAt");
    const hasResume = await page.eval("typeof snapshotKeys === 'function'");
    check("resume support present in the deployed engine", hasResume);
    if (hasResume) {
    check("no snapshot left after the attempt is saved", (await page.eval("snapshotKeys(state.test.id).length")) === 0);

    // Crash mid-test: answer a few, reload the page, and the intro must offer to resume.
    console.log("Resume after reload");
    await page.goto(base + "test.html?id=" + testId);
    await sleep(300);
    await page.eval("state.test.writing = null; document.getElementById('begin').click(); 'ok'");
    await sleep(150);
    await page.eval("choose(0); choose(1); choose(0); goto(1); toggleFlag(currentQuestion()); render(); 'ok'");
    check("snapshot written during the section", (await page.eval("snapshotKeys(state.test.id).length")) === 1);
    check("exactly one snapshot kept per test", (await page.eval("snapshotKeys(state.test.id).length")) === 1);
    await sleep(2500);
    // The clock runs while the page is alive; what must not be lost is the gap after leaving it.
    const remainingBefore = await page.eval("(state.deadline - Date.now()) / 1000");
    await page.goto(base + "test.html?id=" + testId);
    await sleep(300);
    check("intro offers Resume", await page.eval("!!document.getElementById('resume') && !document.getElementById('begin')"));
    await page.shot("04b-resume-offer");
    await page.eval("document.getElementById('resume').click(); 'ok'");
    await sleep(300);
    check("resumed into the section", await page.eval("state.phase === 'section' && state.si === 0 && state.qi === 1"));
    check("answers restored", (await page.eval("Object.keys(state.answers).length")) === 3);
    check("flag restored", await page.eval("state.flags.size === 1"));
    const remainingAfter = await page.eval("(state.deadline - Date.now()) / 1000");
    check("time left restored, not eaten by the gap", Math.abs(remainingBefore - remainingAfter) < 2, [remainingBefore, remainingAfter]);
    check("clock is running", await page.eval("state.tickHandle !== null"));
    await page.eval("window.onbeforeunload = null; 'ok'");

    await page.goto(base + "index.html");
    await sleep(300);
    check("home page marks the test in progress", (await page.eval("document.querySelectorAll('.length.resume').length")) >= 1);

    await page.goto(base + "test.html?id=" + testId);
    await sleep(300);
    await page.eval("document.getElementById('startOver').click(); 'ok'");
    await sleep(200);
    check("Start over clears the snapshot", (await page.eval("snapshotKeys(state.test.id).length === 0 && !!document.getElementById('begin')")));
    }

    // The synthetic break needs a second section to move into; a one-section drill has none.
    if (!sawBreak && n > 1) {
      // The default short mock has no break, so exercise the break screen synthetically.
      console.log("Break screen (synthetic)");
      await page.goto(base + "test.html?id=" + testId);
      await sleep(300);
      await page.eval("state.test.writing = null; document.getElementById('begin').click(); 'ok'");
      await sleep(150);
      await page.eval("currentSection().breakAfterSeconds = 60; window.confirm = () => true; choose(0); finishSection(); 'ok'");
      await sleep(150);
      check("break phase when breakAfterSeconds is set", await page.eval("state.phase === 'break'"), await page.eval("state.phase"));
      await sleep(1200);
      const clock = await page.eval("document.getElementById('clock').textContent");
      check("break clock counts up", /^0:0[1-9]$/.test(clock), clock);
      await page.shot("05-break");
      await page.eval("document.getElementById('cont').click(); 'ok'");
      await sleep(150);
      check("button after break starts the next section", await page.eval("state.phase === 'section' && state.si === 1"), await page.eval("state.phase + ' ' + state.si"));
      await page.eval("window.onbeforeunload = null; 'ok'");
    }

    // A second attempt, so history has something to compare.
    console.log("Second attempt (fast path)");
    await page.goto(base + "test.html?id=" + testId);
    await sleep(300);
    // The synthetic break run above may have left a snapshot; discard it first.
    await page.eval("const o = document.getElementById('startOver'); if (o) { o.click(); } 'ok'");
    await sleep(150);
    await page.eval(`(() => {
      state.test.writing = null; document.getElementById('begin').click();
      for (let i = 0; i < sections().length; i++) { sections()[i].questions.forEach(q => { state.answers[q.id] = q.answer; }); state.si = i; state.sectionElapsed[sections()[i].name] = Date.now() - 5000; finishSection(); }
      showResults(); return 'ok'; })()`);
    await sleep(200);
    check("history block after two attempts", await page.eval("document.body.innerHTML.includes('Across 2 attempts')"));
    await page.shot("07-results-history");
    await page.eval("window.onbeforeunload = null; 'ok'");

    console.log("Review mode");
    await page.goto(base + "test.html?id=" + testId + "&attempt=" + encodeURIComponent(takenAt));
    await sleep(400);
    check("opens straight onto results", await page.eval("state.phase === 'results' && state.reviewing === true"));
    check("restored answers", (await page.eval("Object.keys(state.answers).length")) > 0);
    check("retake button present", await page.eval("!!document.querySelector('a[href^=\"test.html?id=\"]')"));
    check("no duplicate save on review", await page.eval("JSON.parse(localStorage.getItem('prep:attempts')).length === 2"));
    if (hasWriting) check("writing is readable in review mode", await page.eval("!!document.querySelector('.essay-view') && document.querySelector('.essay-view').textContent.includes('written by the verifier')"));
    await page.shot("08-review", true);

    console.log("Home page with attempts");
    await page.goto(base + "index.html");
    await sleep(400);
    check("Attempted section present", await page.eval("!!document.getElementById('attempted-section')"));
    check("attempted test not in its exam group", await page.eval("!document.querySelector('#groups a.test-card[href=\"test.html?id=" + testId + "\"]')"));
    check("attempted card shows two score chips", (await page.eval("document.querySelectorAll('.score-chip').length")) === 2);
    await page.shot("09-home-attempted");

    console.log("Past attempts page");
    await page.goto(base + "results.html");
    await sleep(400);
    check("lists both attempts", (await page.eval("document.querySelectorAll('#list .review-item').length")) === 2);
    check("Review buttons present", (await page.eval("document.querySelectorAll('#list a[data-review]').length")) >= 2);
    check("Across attempts summary present", await page.eval("document.body.innerHTML.includes('Across attempts')"));
    if (hasWriting) check("writing is readable on past attempts", (await page.eval("document.querySelectorAll('#list .essay-view').length")) >= 1);
    await page.shot("10-past-attempts");

    check("no uncaught page errors", errors.length === 0, errors);

    await page.eval("localStorage.clear(); 'ok'");
    ws.close();
  } finally {
    browser.proc.kill();
    srv.close();
    try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch (e) {}
  }
  console.log("\n" + (failures ? failures + " check(s) failed." : "All checks passed.") + " Screenshots: " + shots);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("verify-runner crashed: " + e.message); process.exit(2); });
