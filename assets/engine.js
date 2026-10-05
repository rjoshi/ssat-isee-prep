/* Practice engine for SSAT and ISEE. Loads a test JSON and runs it section by section. */

const LETTERS = ["A", "B", "C", "D", "E"];

const state = {
  test: null,
  phase: "intro",
  si: 0,
  qi: 0,
  answers: {},
  flags: new Set(),
  qtime: {},
  sectionElapsed: {},
  writingText: "",
  writingChoice: 0,
  reviewFilter: "wrong",
  deadline: 0,
  tickHandle: null,
  qEnteredAt: 0,
  writingDone: false,
  attempt: null,
  saved: false,
  reviewing: false,
  stale: false,
  breakStart: 0,
};

const app = document.getElementById("app");
const railFill = document.getElementById("railFill");

/* ---------- helpers ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

function mmss(sec) {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

function sections() { return state.test.sections; }
function currentSection() { return sections()[state.si]; }
function currentQuestion() { return currentSection().questions[state.qi]; }
function allQuestions() { return sections().flatMap((s) => s.questions); }

function penalty() {
  return (state.test.scoring && state.test.scoring.wrongPenalty) || 0;
}

function writing() { return state.test.writing || null; }

function writingFirst() {
  const w = writing();
  return !!w && w.position === "first";
}

function passageFor(sec, q) {
  if (q && q.passage && sec.passages) return sec.passages[q.passage];
  if (sec.passage) return sec.passage;
  return null;
}

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  el.setAttribute("role", "status");
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ---------- timer ---------- */

function startTimer(seconds, onExpire, total = seconds) {
  stopTimer();
  state.deadline = Date.now() + seconds * 1000;
  const tick = () => {
    const left = (state.deadline - Date.now()) / 1000;
    const clock = document.getElementById("clock");
    if (clock) {
      clock.textContent = mmss(left);
      clock.classList.toggle("low", left <= total * 0.2);
    }
    if (railFill) {
      railFill.style.transform = "scaleX(" + Math.max(0, left / total) + ")";
      railFill.classList.toggle("low", left <= total * 0.2);
    }
    if (left <= 0) { stopTimer(); onExpire(); }
  };
  tick();
  state.tickHandle = setInterval(tick, 1000);
}

function stopTimer() {
  if (state.tickHandle) clearInterval(state.tickHandle);
  state.tickHandle = null;
}

/* Breaks count up rather than down. Nothing advances automatically, since the point of a full
   length sitting is to practise the whole three hours, but the clock turns rose once the real
   break would have ended. */
function startCountUp(allowed) {
  stopTimer();
  state.breakStart = Date.now();
  let warned = false;
  const tick = () => {
    const gone = (Date.now() - state.breakStart) / 1000;
    const clock = document.getElementById("clock");
    if (clock) {
      clock.textContent = mmss(gone);
      clock.classList.toggle("low", gone > allowed);
    }
    if (railFill) {
      railFill.style.transform = "scaleX(" + Math.min(1, gone / allowed) + ")";
      railFill.classList.toggle("low", gone > allowed);
    }
    if (gone > allowed && !warned) {
      warned = true;
      toast("The real break would be over now.");
    }
  };
  tick();
  state.tickHandle = setInterval(tick, 1000);
}

function clearRail() {
  if (railFill) {
    railFill.style.transform = "scaleX(1)";
    railFill.classList.remove("low");
  }
}

/* ---------- question time tracking ---------- */

function markQuestionExit() {
  const q = currentQuestion();
  if (!q || !state.qEnteredAt) return;
  state.qtime[q.id] = (state.qtime[q.id] || 0) + (Date.now() - state.qEnteredAt) / 1000;
  state.qEnteredAt = 0;
}

function markQuestionEnter() { state.qEnteredAt = Date.now(); }

/* ---------- rendering ---------- */

function render() {
  ({
    intro: renderIntro,
    section: renderSection,
    sectionEnd: renderSectionEnd,
    break: renderBreak,
    writing: renderWriting,
    results: renderResults,
  })[state.phase]();
  snapshot();
}

/* ---------- resume snapshots ----------
   A hung tab or an accidental refresh must not lose a sitting. Every render and every ten seconds
   the whole in-progress state is written to localStorage under prep:snapshot:<testId>:<seq>. The
   new snapshot is written first and the older ones removed afterwards, so there is never a moment
   with nothing saved. The intro screen offers to resume; finishing the test saves the attempt and
   then clears the snapshots. */

const SNAP_PREFIX = "prep:snapshot:";

function snapshotKeys(testId) {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SNAP_PREFIX + testId + ":")) keys.push(k);
    }
  } catch (e) {}
  return keys.sort((a, b) => Number(a.split(":").pop()) - Number(b.split(":").pop()));
}

function loadSnapshot(testId) {
  const keys = snapshotKeys(testId);
  // Newest first. A snapshot that fails to parse, from a write cut short, falls back to the one before.
  for (let i = keys.length - 1; i >= 0; i--) {
    try {
      const s = JSON.parse(localStorage.getItem(keys[i]));
      if (s && s.testId === testId && s.phase) return s;
    } catch (e) {}
  }
  return null;
}

function clearSnapshots(testId) {
  snapshotKeys(testId).forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
}

function snapshot() {
  if (!state.test || state.reviewing) return;
  if (!["section", "sectionEnd", "break", "writing", "results"].includes(state.phase)) return;
  if (state.phase === "results" && state.saved) return;
  const now = Date.now();
  const inSection = state.phase === "section";
  const sec = inSection || state.phase === "sectionEnd" || state.phase === "break" ? currentSection() : null;
  const snap = {
    testId: state.test.id,
    savedAt: now,
    phase: state.phase,
    si: state.si,
    qi: state.qi,
    answers: state.answers,
    flags: [...state.flags],
    qtime: state.qtime,
    sectionElapsed: Object.assign({}, state.sectionElapsed),
    writingText: state.writingText,
    writingChoice: state.writingChoice,
    writingDone: state.writingDone,
    // Time is stored as what was left, not as a deadline, so a crash does not eat the clock.
    remaining: inSection || state.phase === "writing" ? Math.max(0, (state.deadline - now) / 1000) : null,
    sectionStartedAgo: inSection && sec ? (now - state.sectionElapsed[sec.name]) / 1000 : null,
    breakElapsed: state.phase === "break" ? (now - state.breakStart) / 1000 : null,
    qElapsed: inSection && state.qEnteredAt ? (now - state.qEnteredAt) / 1000 : 0,
  };
  const old = snapshotKeys(state.test.id);
  const seq = old.length ? Number(old[old.length - 1].split(":").pop()) + 1 : 1;
  try {
    localStorage.setItem(SNAP_PREFIX + state.test.id + ":" + seq, JSON.stringify(snap));
  } catch (e) {
    return; // Could not write the new one, so keep whatever is there.
  }
  old.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
}

function describeSnapshot(s) {
  if (s.phase === "writing") return "in the " + writing().name.toLowerCase();
  if (s.phase === "results") return "finished, with the scores not yet saved";
  const sec = sections()[s.si];
  if (!sec) return "part way through";
  if (s.phase === "break") return "on the break after " + sec.name;
  if (s.phase === "sectionEnd") return "at the end of " + sec.name;
  return "in " + sec.name + ", question " + (s.qi + 1) + " of " + sec.questions.length;
}

function resumeSnapshot(s) {
  state.phase = s.phase;
  state.si = s.si || 0;
  state.qi = s.qi || 0;
  state.answers = s.answers || {};
  state.flags = new Set(s.flags || []);
  state.qtime = s.qtime || {};
  state.sectionElapsed = s.sectionElapsed || {};
  state.writingText = s.writingText || "";
  state.writingChoice = s.writingChoice || 0;
  state.writingDone = !!s.writingDone;
  const now = Date.now();

  if (s.phase === "section") {
    const sec = currentSection();
    state.sectionElapsed[sec.name] = now - (s.sectionStartedAgo || 0) * 1000;
    const q = sec.questions[state.qi];
    if (q && s.qElapsed) state.qtime[q.id] = (state.qtime[q.id] || 0) + s.qElapsed;
    render();
    startTimer(s.remaining || 0, () => {
      toast("Time is up for this section.");
      finishSection();
    }, sec.timeLimitSeconds);
  } else if (s.phase === "writing") {
    render();
    startTimer(s.remaining || 0, () => {
      toast("Writing time is up.");
      afterWriting();
    }, writing().timeLimitSeconds);
  } else if (s.phase === "break") {
    render();
    state.breakStart = now - (s.breakElapsed || 0) * 1000;
  } else if (s.phase === "results") {
    showResults();
  } else {
    render();
  }
  toast("Resumed where you left off.");
}

setInterval(snapshot, 10000);
document.addEventListener("visibilitychange", () => { if (document.hidden) snapshot(); });
window.addEventListener("pagehide", snapshot);

function guessingLine() {
  return penalty() > 0
    ? "A wrong answer costs a quarter of a point and a blank costs nothing, so a wild guess is worth nothing on average. Once you can rule out even one choice, guessing pays. Rule out nothing, and leave it blank."
    : "A wrong answer costs exactly what a blank one costs, which is nothing, so never leave anything empty. Guess on every question you cannot work out.";
}

function renderIntro() {
  clearRail();
  const t = state.test;
  const w = writing();
  const breakMin = sections().reduce((a, s) => a + (s.breakAfterSeconds || 0), 0) / 60;
  const totalMin = Math.round(
    (sections().reduce((a, s) => a + s.timeLimitSeconds, 0) + (w ? w.timeLimitSeconds : 0)) / 60 + breakMin
  );
  const rows = sections().flatMap((s) => {
    const row = `<li><span class="k">${esc(s.name)}</span><span class="v">${plural(
      s.questions.length, "question"
    )} &nbsp;·&nbsp; ${Math.round(s.timeLimitSeconds / 60)} min</span></li>`;
    return s.breakAfterSeconds
      ? [row, `<li class="break-row"><span class="k">Break</span><span class="v">${Math.round(s.breakAfterSeconds / 60)} min</span></li>`]
      : [row];
  });
  const full = t.format === "full";
  const history = loadAttempts().filter((a) => a.testId === t.id);
  const snap = state.reviewing ? null : loadSnapshot(t.id);
  if (w) {
    const wrow = `<li><span class="k">${esc(w.name)}</span><span class="v">1 prompt &nbsp;·&nbsp; ${Math.round(
      w.timeLimitSeconds / 60
    )} min</span></li>`;
    writingFirst() ? rows.unshift(wrow) : rows.push(wrow);
  }
  const maxChoices = Math.max.apply(null, allQuestions().map((q) => q.choices.length));

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="intro">
        <p class="eyebrow">${esc(t.exam)} ${esc(t.level)} Level</p>
        <h2>${esc(t.title)}</h2>
        <p>${esc(t.description)}</p>
        ${snap ? `<div class="rule resume" id="resumeCard">
                <strong>Unfinished attempt.</strong> You were ${esc(describeSnapshot(snap))}, with
                ${plural(Object.keys(snap.answers || {}).length, "answer")} recorded, saved ${esc(
                  whenTaken(new Date(snap.savedAt).toISOString())
                )}. The time that was left in that section is restored, so a crash or a refresh does not
                cost you any of it.
                <div style="margin-top:0.9rem;display:flex;gap:0.6rem;flex-wrap:wrap">
                  <button class="btn btn-primary" id="resume">Resume</button>
                  <button class="btn" id="startOver">Start over</button>
                  <a class="btn" href="index.html">All tests</a>
                </div>
              </div>` : ""}
        <ul class="facts">${rows.join("")}</ul>
        <p class="rule"><strong>Scoring.</strong> ${guessingLine()}</p>
        ${
          full
            ? `<p class="rule"><strong>Full length.</strong> This runs the real sections at the real
              lengths with the real break, so set aside about ${Math.round(totalMin / 60 * 2) / 2} hours
              and treat it as a rehearsal for test day. During the break the clock counts up and
              nothing moves on until you press the button.</p>`
            : ""
        }
        ${
          history.length
            ? `<p style="font-size:0.95rem;color:var(--muted)">You have taken this test ${plural(
                history.length, "time"
              )} before. Your scores for every attempt are kept and compared on the results screen.</p>`
            : ""
        }
        <p style="font-size:0.97rem">Sit somewhere quiet with scratch paper and a pencil. There is
        no calculator, because neither real test allows one. Each section is timed on its own, and
        you cannot go back to a section once its time is up.</p>
        <p style="font-size:0.97rem"><strong>Keyboard.</strong> Press 1 to ${maxChoices} to answer,
        left and right arrows to move, F to flag a question, X to clear an answer and leave it blank.</p>
        ${
          snap
            ? ""
            : `<div style="margin-top:1.75rem;display:flex;gap:0.6rem;flex-wrap:wrap">
                <button class="btn btn-primary" id="begin">Start ${
                  writingFirst() ? esc(w.name) : esc(sections()[0].name)
                }</button>
                <a class="btn" href="index.html">All tests</a>
              </div>`
        }
        <p style="font-size:0.9rem;color:var(--muted);margin-top:1.5rem">${plural(
          allQuestions().length, "question"
        )}${w ? " plus the writing sample" : ""}, about ${totalMin} minutes.</p>
      </div>
    </div>`;
  const begin = document.getElementById("begin");
  if (begin) begin.onclick = () => (writingFirst() ? enterWriting() : enterSection(0));
  const resume = document.getElementById("resume");
  if (resume) resume.onclick = () => resumeSnapshot(snap);
  const over = document.getElementById("startOver");
  if (over) over.onclick = () => {
    if (!confirm("Throw away the unfinished attempt and start this test from the beginning?")) return;
    clearSnapshots(t.id);
    render();
  };
}

function enterSection(i) {
  state.si = i;
  state.qi = 0;
  state.phase = "section";
  const sec = sections()[i];
  state.sectionElapsed[sec.name] = Date.now();
  render();
  startTimer(sec.timeLimitSeconds, () => {
    toast("Time is up for this section.");
    finishSection();
  });
}

function finishSection() {
  stopTimer();
  markQuestionExit();
  const sec = currentSection();
  state.sectionElapsed[sec.name] = (Date.now() - state.sectionElapsed[sec.name]) / 1000;
  state.phase = sec.breakAfterSeconds ? "break" : "sectionEnd";
  render();
}

function nextAfterCurrent() {
  const w = writing();
  const isLast = state.si === sections().length - 1;
  return {
    name: !isLast ? sections()[state.si + 1].name : w && !state.writingDone ? w.name : "your results",
    go: () => {
      if (!isLast) enterSection(state.si + 1);
      else if (w && !state.writingDone) enterWriting();
      else showResults();
    },
  };
}

function renderBreak() {
  const sec = currentSection();
  const next = nextAfterCurrent();
  const answered = sec.questions.filter((q) => state.answers[q.id] !== undefined).length;
  const min = Math.round(sec.breakAfterSeconds / 60);

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="intro">
        <p class="eyebrow">Break</p>
        <h2>${plural(min, "minute")}, the way the real test gives it</h2>
        <p>${esc(sec.name)} is done. You answered ${answered} of ${sec.questions.length} in ${mmss(
    state.sectionElapsed[sec.name]
  )}.</p>
        <p style="font-size:0.97rem">Stand up, get water, eat something small. Do not open a book and
        do not look at your answers. The clock at the top counts up and turns rose when the real
        break would end. Nothing moves on until you press the button, so if you need longer, take
        it, and notice that you did.</p>
        <div style="margin-top:1.5rem">
          <button class="btn btn-primary" id="cont">Start ${esc(next.name)}</button>
        </div>
      </div>
    </div>`;
  document.getElementById("sectionName").textContent = "Break";
  document.getElementById("counter").textContent = "";
  document.getElementById("cont").onclick = () => { stopTimer(); clearRail(); next.go(); };
  startCountUp(sec.breakAfterSeconds);
}

function renderSection() {
  const sec = currentSection();
  const q = currentQuestion();
  const chosen = state.answers[q.id];
  const para = passageFor(sec, q);

  const passageHtml = para
    ? `<div class="passage">${
        sec.passages && q.passage ? `<p class="eyebrow">Passage ${esc(q.passage.replace(/\D/g, ""))}</p>` : ""
      }${para.map((p) => `<p>${esc(p)}</p>`).join("")}</div>`
    : "";

  let stemHtml;
  if (q.comparison) {
    stemHtml = `${q.stem ? `<p class="stem">${esc(q.stem)}</p>` : ""}
      <table class="compare">
        <tr><th>Column A</th><th>Column B</th></tr>
        <tr><td>${esc(q.comparison.a)}</td><td>${esc(q.comparison.b)}</td></tr>
      </table>`;
  } else {
    const extra = q.type === "synonym" ? " term" : q.type === "analogy" ? " analogy" : "";
    stemHtml = `<p class="stem${extra}">${esc(q.stem)}</p>`;
  }

  const hint =
    q.type === "synonym" ? "choose the word closest in meaning"
    : q.type === "analogy" ? "choose the pair whose relationship matches"
    : "";

  app.innerHTML = `
    <div class="wrap">
      <div class="qgrid ${para ? "has-passage" : ""}">
        ${passageHtml}
        <div class="qcard">
          <div class="qnum">Question ${state.qi + 1} of ${sec.questions.length}${
    hint ? ", " + hint : ""
  }</div>
          ${stemHtml}
          <div class="choices" role="radiogroup" aria-label="Answer choices">
            ${q.choices
              .map(
                (c, i) => `<button class="choice" role="radio" data-i="${i}"
                aria-checked="${chosen === i ? "true" : "false"}">
                <span class="tag" aria-hidden="true">${LETTERS[i]}</span>
                <span>${esc(c)}</span></button>`
              )
              .join("")}
          </div>
          ${
            chosen !== undefined
              ? `<button class="btn-quiet" id="clear" style="margin-top:0.8rem;padding-left:0">Clear this answer</button>`
              : ""
          }
        </div>
      </div>
    </div>
    <div class="controls">
      <div class="wrap controls-inner">
        <button class="btn-quiet" id="flag">${state.flags.has(q.id) ? "Unflag" : "Flag"}</button>
        <div class="dots">${sec.questions
          .map(
            (qq, i) =>
              `<button class="dot ${state.answers[qq.id] !== undefined ? "answered" : ""} ${
                i === state.qi ? "current" : ""
              } ${state.flags.has(qq.id) ? "flagged" : ""}" data-jump="${i}"
                aria-label="Question ${i + 1}">${i + 1}</button>`
          )
          .join("")}</div>
        <div class="spacer"></div>
        <button class="btn" id="prev" ${state.qi === 0 ? "disabled" : ""}>Previous</button>
        ${
          state.qi === sec.questions.length - 1
            ? `<button class="btn btn-primary" id="done">Finish section</button>`
            : `<button class="btn btn-primary" id="next">Next</button>`
        }
      </div>
    </div>`;

  document.getElementById("sectionName").textContent = sec.name;
  document.getElementById("counter").textContent = state.qi + 1 + " / " + sec.questions.length;
  // Only start the clock on arrival. Answering the last question, flagging or clearing re-renders
  // the same question, and restarting here used to throw away the time already spent on it.
  if (!state.qEnteredAt) markQuestionEnter();

  app.querySelectorAll(".choice").forEach((b) => {
    b.onclick = () => choose(Number(b.dataset.i));
  });
  document.querySelectorAll(".dot").forEach((b) => {
    b.onclick = () => goto(Number(b.dataset.jump));
  });
  document.getElementById("flag").onclick = () => { toggleFlag(q); render(); };
  const clear = document.getElementById("clear");
  if (clear) clear.onclick = () => { delete state.answers[q.id]; render(); };
  const prev = document.getElementById("prev");
  if (prev) prev.onclick = () => goto(state.qi - 1);
  const next = document.getElementById("next");
  if (next) next.onclick = () => goto(state.qi + 1);
  const done = document.getElementById("done");
  if (done) done.onclick = confirmFinish;
}

function toggleFlag(q) {
  state.flags.has(q.id) ? state.flags.delete(q.id) : state.flags.add(q.id);
}

function choose(i) {
  const q = currentQuestion();
  state.answers[q.id] = i;
  if (state.qi < currentSection().questions.length - 1) goto(state.qi + 1);
  else render();
}

function goto(i) {
  const sec = currentSection();
  if (i < 0 || i >= sec.questions.length) return;
  markQuestionExit();
  state.qi = i;
  render();
}

function confirmFinish() {
  const sec = currentSection();
  const blank = sec.questions.filter((q) => state.answers[q.id] === undefined).length;
  if (blank > 0 && penalty() === 0) {
    const ok = confirm(
      blank + (blank === 1 ? " question is" : " questions are") +
      " still blank. On this test a wrong answer costs no more than a blank one, so a guess is always better. Finish anyway?"
    );
    if (!ok) return;
  }
  finishSection();
}

function renderSectionEnd() {
  clearRail();
  const sec = currentSection();
  const next = nextAfterCurrent();
  const nextThing = next.name;
  const answered = sec.questions.filter((q) => state.answers[q.id] !== undefined).length;

  app.innerHTML = `
    <div class="wrap narrow">
      <div class="intro">
        <h2>${esc(sec.name)} is done</h2>
        <p>You answered ${answered} of ${sec.questions.length} in ${mmss(
    state.sectionElapsed[sec.name]
  )}. Scores come at the end, all at once.</p>
        <p style="font-size:0.97rem">The timer for ${esc(
          nextThing
        )} does not start until you press the button, so take a moment if you need one.</p>
        <div style="margin-top:1.5rem">
          <button class="btn btn-primary" id="cont">Start ${esc(nextThing)}</button>
        </div>
      </div>
    </div>`;
  document.getElementById("sectionName").textContent = sec.name;
  document.getElementById("counter").textContent = "";
  document.getElementById("cont").onclick = next.go;
}

function enterWriting() {
  state.phase = "writing";
  render();
  startTimer(writing().timeLimitSeconds, () => {
    toast("Writing time is up.");
    afterWriting();
  });
}

function afterWriting() {
  stopTimer();
  state.writingDone = true;
  if (writingFirst()) enterSection(0);
  else showResults();
}

function renderWriting() {
  const w = writing();
  const prompts = w.prompts || [w.prompt];
  app.innerHTML = `
    <div class="wrap narrow">
      <div class="intro">
        <h2>${esc(w.name)}</h2>
        <p style="font-size:0.95rem;color:var(--muted)">${esc(w.note || "")}</p>
        ${
          prompts.length > 1
            ? `<p style="font-size:0.97rem">Choose one prompt and write about it.</p>
               <div class="choices" role="radiogroup" aria-label="Prompts">
                 ${prompts
                   .map(
                     (p, i) => `<button class="choice" role="radio" data-p="${i}"
                     aria-checked="${state.writingChoice === i ? "true" : "false"}">
                     <span class="tag" aria-hidden="true">${LETTERS[i]}</span>
                     <span>${esc(p)}</span></button>`
                   )
                   .join("")}
               </div>`
            : `<p class="stem">${esc(prompts[0])}</p>`
        }
      </div>
      <textarea class="essay-box" id="essay" placeholder="Start writing here."></textarea>
      <div class="wordcount" id="wc">0 words</div>
    </div>
    <div class="controls">
      <div class="wrap controls-inner">
        <div class="spacer"></div>
        <button class="btn btn-primary" id="submit">${
          writingFirst() ? "Done, start the first section" : "Finish and see results"
        }</button>
      </div>
    </div>`;
  document.getElementById("sectionName").textContent = w.name;
  document.getElementById("counter").textContent = "";
  app.querySelectorAll("[data-p]").forEach((b) => {
    b.onclick = () => { state.writingChoice = Number(b.dataset.p); render(); };
  });
  const ta = document.getElementById("essay");
  ta.value = state.writingText;
  let pending = null;
  ta.oninput = () => {
    state.writingText = ta.value;
    const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    document.getElementById("wc").textContent = plural(n, "word");
    // Snapshot shortly after typing pauses, so a crash mid-essay loses a sentence at most.
    clearTimeout(pending);
    pending = setTimeout(snapshot, 800);
  };
  document.getElementById("submit").onclick = afterWriting;
}

function showResults() {
  stopTimer();
  clearRail();
  markQuestionExit();
  if (!state.attempt) {
    state.attempt = buildAttempt();
    state.saved = saveAttempt(state.attempt);
  }
  state.phase = "results";
  render();
  // The final attempt is saved, so the working copy can go. If saving failed, render() has just
  // written a results-phase snapshot instead, and a reload will retry the save from it.
  if (state.saved) clearSnapshots(state.test.id);
}

/* ---------- saved attempts ---------- */

const STORE = "prep:attempts";
const NAME_KEY = "prep:student";

function loadAttempts() {
  try { return JSON.parse(localStorage.getItem(STORE) || "[]"); }
  catch (e) { return []; }
}

function studentName() {
  try { return localStorage.getItem(NAME_KEY) || ""; }
  catch (e) { return ""; }
}

function buildAttempt() {
  const w = writing();
  return {
    student: studentName(),
    exam: state.test.exam,
    level: state.test.level,
    testId: state.test.id,
    testTitle: state.test.title,
    takenAt: new Date().toISOString(),
    wrongPenalty: penalty(),
    sections: sections().map((sec) => {
      const sc = scoreSection(sec);
      return {
        name: sec.name,
        right: sc.right,
        wrong: sc.wrong,
        blank: sc.blank,
        total: sc.total,
        raw: Number(sc.raw.toFixed(2)),
        seconds: Math.round(state.sectionElapsed[sec.name] || 0),
      };
    }),
    questions: allQuestions().map((q) => ({
      id: q.id,
      chose: state.answers[q.id] === undefined ? null : LETTERS[state.answers[q.id]],
      correct: LETTERS[q.answer],
      right: state.answers[q.id] === q.answer,
      seconds: state.qtime[q.id] ? Math.round(state.qtime[q.id]) : 0,
      flagged: state.flags.has(q.id),
    })),
    writing: w
      ? {
          prompt: (w.prompts || [w.prompt])[state.writingChoice] || "",
          words: state.writingText.trim() ? state.writingText.trim().split(/\s+/).length : 0,
          text: state.writingText,
        }
      : null,
  };
}

function saveAttempt(attempt) {
  try {
    const all = loadAttempts();
    all.push(attempt);
    localStorage.setItem(STORE, JSON.stringify(all));
    return true;
  } catch (e) {
    return false;
  }
}

function attemptFilename(a) {
  const who = (a.student || "attempt").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return who + "-" + a.testId + "-" + a.takenAt.slice(0, 10) + ".json";
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- scoring ---------- */

function scoreSection(sec) {
  let right = 0, wrong = 0, blank = 0;
  sec.questions.forEach((q) => {
    const a = state.answers[q.id];
    if (a === undefined) blank++;
    else if (a === q.answer) right++;
    else wrong++;
  });
  return { right, wrong, blank, total: sec.questions.length, raw: right - wrong * penalty() };
}

function renderResults() {
  const scores = sections().map((s) => ({ sec: s, ...scoreSection(s) }));
  const totalRight = scores.reduce((a, s) => a + s.right, 0);
  const totalWrong = scores.reduce((a, s) => a + s.wrong, 0);
  const totalBlank = scores.reduce((a, s) => a + s.blank, 0);
  const totalQ = scores.reduce((a, s) => a + s.total, 0);
  const p = penalty();

  const pool = allQuestions().filter((q) => {
    const a = state.answers[q.id];
    if (state.reviewFilter === "wrong") return a !== q.answer;
    if (state.reviewFilter === "flagged") return state.flags.has(q.id);
    return true;
  });

  app.innerHTML = `
    <div class="wrap narrow">
      <p class="eyebrow">${esc(state.test.exam)} ${esc(state.test.level)} Level${
        state.reviewing ? " &nbsp;·&nbsp; reviewing the attempt from " + esc(whenTaken(state.attempt.takenAt)) : ""
      }</p>
      <h2 style="font-family:var(--serif);font-size:1.7rem">${esc(state.test.title)}</h2>
      <p style="font-family:var(--serif);color:var(--muted);line-height:1.7;max-width:60ch">
        ${totalRight} right, ${totalWrong} wrong and ${totalBlank} blank out of ${totalQ}.
        ${
          p > 0
            ? "The raw score subtracts a quarter point for each wrong answer, which is how the real SSAT counts it."
            : "Look at the pattern between sections rather than at the total."
        }</p>

      <div style="margin:2rem 0">
        ${scores
          .map((s) => {
            const pct = Math.round((s.right / s.total) * 100);
            return `<div class="scoreline">
              <div>
                <div class="name">${esc(s.sec.name)}</div>
                <div class="bar"><span style="width:${pct}%"></span></div>
              </div>
              <div class="val">${p > 0 ? s.raw.toFixed(2) : s.right} / ${s.total}</div>
              <div class="time">${mmss(state.sectionElapsed[s.sec.name] || 0)}</div>
            </div>`;
          })
          .join("")}
      </div>

      ${
        state.stale
          ? `<p class="rule warn">This test has been edited since the attempt was taken, so the
            answers below may not line up with the choices the student actually saw. The scores
            recorded at the time are still the ones to trust.</p>`
          : ""
      }

      ${topicBreakdown()}

      ${strategyNote(totalBlank, totalWrong, totalQ)}

      <div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin:1.5rem 0">
        ${
          state.reviewing
            ? `<a class="btn btn-primary" href="test.html?id=${encodeURIComponent(state.test.id)}">Retake this test</a>
               <button class="btn" id="dlJson">Download this attempt</button>`
            : `<button class="btn btn-primary" id="dlJson">Download this attempt</button>`
        }
        <button class="btn" id="copy">Copy a summary</button>
        ${state.writingText.trim() ? `<button class="btn" id="dlEssay">Download the writing</button>` : ""}
        <a class="btn" href="results.html">Past attempts</a>
        <a class="btn" href="index.html">All tests</a>
      </div>
      <p style="font-size:0.9rem;color:var(--muted);max-width:60ch">${
        state.reviewing
          ? "This is a saved attempt. Retaking the test starts a fresh timed run and keeps this one."
          : state.saved
          ? "This attempt is saved in this browser. Download it to send the file on, or open past attempts to export everything at once."
          : "This browser would not let the attempt be saved, so download it now if you want to keep it."
      }</p>

      ${writingView()}

      ${attemptHistory()}

      <h3 style="margin-top:2.5rem;font-family:var(--serif);font-size:1.3rem">Review</h3>
      <div class="filters">
        <button data-f="wrong" aria-pressed="${state.reviewFilter === "wrong"}">Missed</button>
        <button data-f="flagged" aria-pressed="${state.reviewFilter === "flagged"}">Flagged</button>
        <button data-f="all" aria-pressed="${state.reviewFilter === "all"}">Everything</button>
      </div>
      <div id="review">
        ${
          pool.length === 0
            ? `<p class="empty">${
                state.reviewFilter === "wrong"
                  ? "Nothing missed. Go straight to a full length official test."
                  : "Nothing flagged."
              }</p>`
            : pool.map(reviewItem).join("")
        }
      </div>
      <div style="height:4rem"></div>
    </div>`;

  document.getElementById("sectionName").textContent = "Results";
  document.getElementById("counter").textContent = "";
  document.getElementById("clock").textContent = "";

  document.querySelectorAll(".filters button").forEach((b) => {
    b.onclick = () => { state.reviewFilter = b.dataset.f; render(); };
  });
  document.getElementById("copy").onclick = copySummary;
  document.getElementById("dlJson").onclick = () => {
    downloadJSON(state.attempt, attemptFilename(state.attempt));
    toast("Attempt downloaded.");
  };
  const dl = document.getElementById("dlEssay");
  if (dl) dl.onclick = downloadWriting;
}

function whenTaken(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function attemptTotals(a) {
  let right = 0, wrong = 0, blank = 0, total = 0, seconds = 0;
  a.sections.forEach((s) => { right += s.right; wrong += s.wrong; blank += s.blank; total += s.total; seconds += s.seconds; });
  return { right, wrong, blank, total, seconds, raw: right - wrong * (a.wrongPenalty || 0) };
}

/* The writing sample or essay, readable in place. It is unscored, so this is the only review it
   gets, and a parent or tutor reading it here is the point. */
function writingView() {
  const w = writing();
  const saved = state.attempt && state.attempt.writing;
  if (!w || !saved || !(saved.text || "").trim()) return "";
  return `
    <h3 style="margin-top:2.5rem;font-family:var(--serif);font-size:1.3rem">${esc(w.name)}</h3>
    <p style="font-size:0.95rem;color:var(--muted);max-width:60ch">${plural(saved.words || 0, "word")}.
      Not scored by the real test, but every school that receives the results reads it.</p>
    ${saved.prompt ? `<p class="stem" style="font-size:1rem">${esc(saved.prompt)}</p>` : ""}
    <div class="essay-view">${esc(saved.text)}</div>`;
}

/* Every saved attempt on this test, oldest first, so a repeat sitting can be read as a trend. */
function attemptHistory() {
  const all = loadAttempts()
    .filter((a) => a.testId === state.test.id)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  if (all.length < 2) return "";
  const p = penalty();
  const score = (a) => (p > 0 ? attemptTotals(a).raw.toFixed(2) : attemptTotals(a).right);
  const first = attemptTotals(all[0]);
  const last = attemptTotals(all[all.length - 1]);
  const delta = p > 0 ? last.raw - first.raw : last.right - first.right;
  const trend =
    delta > 0 ? "Up " + (p > 0 ? delta.toFixed(2) : delta) + " since the first attempt."
    : delta < 0 ? "Down " + (p > 0 ? (-delta).toFixed(2) : -delta) + " since the first attempt."
    : "Level with the first attempt.";
  return `
    <h3 style="margin-top:2.5rem;font-family:var(--serif);font-size:1.3rem">Across ${plural(all.length, "attempt")}</h3>
    <p style="font-size:0.95rem;color:var(--muted);max-width:60ch">${trend} ${
      p > 0 ? "Scores here are raw, with the quarter point deduction applied." : "Scores here are questions right."
    }</p>
    <div class="history">
      ${all
        .map((a) => {
          const t = attemptTotals(a);
          const current = state.attempt && a.takenAt === state.attempt.takenAt;
          return `<div class="history-row ${current ? "current" : ""}">
            <span class="when">${esc(whenTaken(a.takenAt))}${current ? " <em>this one</em>" : ""}</span>
            <span class="bar"><span style="width:${Math.round((t.right / t.total) * 100)}%"></span></span>
            <span class="score">${score(a)} / ${t.total}</span>
            <span class="time">${mmss(t.seconds)}</span>
            ${
              current
                ? `<span></span>`
                : `<a class="btn-quiet" href="test.html?id=${encodeURIComponent(state.test.id)}&attempt=${encodeURIComponent(a.takenAt)}">Review</a>`
            }
          </div>`;
        })
        .join("")}
    </div>`;
}

/* Questions may carry a topic tag. When they do, show the weakest topics first, since a weak
   section says where to look and a weak topic says what to practise. */
function topicBreakdown() {
  const by = {};
  allQuestions().forEach((q) => {
    if (!q.topic) return;
    const t = (by[q.topic] = by[q.topic] || { right: 0, total: 0 });
    t.total++;
    if (state.answers[q.id] === q.answer) t.right++;
  });
  const rows = Object.entries(by).filter(([, t]) => t.total >= 2);
  if (rows.length < 2) return "";
  rows.sort((a, b) => a[1].right / a[1].total - b[1].right / b[1].total || b[1].total - a[1].total);
  return `
    <h3 style="margin-top:2rem;font-family:var(--serif);font-size:1.3rem">By topic, weakest first</h3>
    <div class="topics">
      ${rows
        .map(([name, t]) => {
          const pct = Math.round((t.right / t.total) * 100);
          return `<div class="topic-row ${pct < 50 ? "weak" : ""}">
            <span class="name">${esc(name)}</span>
            <span class="bar"><span style="width:${pct}%"></span></span>
            <span class="score">${t.right} / ${t.total}</span>
          </div>`;
        })
        .join("")}
    </div>`;
}

function strategyNote(blank, wrong, total) {
  if (penalty() > 0) {
    if (blank === 0 && wrong > total * 0.25)
      return `<p class="rule warn">Nothing was left blank and a fair number were wrong. On the SSAT
        that costs real points. A question where you cannot rule out a single choice is worth more
        left empty than filled in.</p>`;
    if (blank > total * 0.3)
      return `<p class="rule warn">${plural(blank, "question")} left blank. Blanks are free here,
        but they are also free of points. Where you could rule out even one choice, guessing among
        the rest was the better bet.</p>`;
    return `<p class="rule">Blanks cost nothing on this test, so leaving one is a decision rather
      than a failure. The rule is to guess whenever you can rule out at least one choice.</p>`;
  }
  if (blank > 0)
    return `<p class="rule warn">${plural(blank, "question")} left blank. On the ISEE that is pure
      lost ground, because a wrong answer costs exactly what a blank one costs. Fill in every bubble
      next time, even when you are guessing.</p>`;
  return "";
}

function reviewItem(q) {
  const a = state.answers[q.id];
  const cls = a === undefined ? "skipped" : a === q.answer ? "right" : "wrong";
  const verdict = a === undefined ? "Left blank" : a === q.answer ? "Correct" : "Missed";
  const t = state.qtime[q.id];
  const extra = q.type === "synonym" ? " term" : q.type === "analogy" ? " analogy" : "";
  return `<div class="review-item ${cls}">
    <div class="verdict ${cls}">${verdict}${t ? ` &nbsp;·&nbsp; ${Math.round(t)}s` : ""}</div>
    ${
      q.comparison
        ? `${q.stem ? `<p class="stem">${esc(q.stem)}</p>` : ""}
           <table class="compare"><tr><th>Column A</th><th>Column B</th></tr>
           <tr><td>${esc(q.comparison.a)}</td><td>${esc(q.comparison.b)}</td></tr></table>`
        : `<p class="stem${extra}">${esc(q.stem)}</p>`
    }
    ${q.choices
      .map((c, i) => {
        let k = "opt";
        if (i === q.answer) k += " key";
        else if (i === a) k += " chosen-wrong";
        return `<div class="${k}">${LETTERS[i]}. ${esc(c)}${
          i === q.answer ? " (the answer)" : i === a ? " (your choice)" : ""
        }</div>`;
      })
      .join("")}
    <p class="why">${esc(q.explanation)}</p>
  </div>`;
}

function copySummary() {
  const lines = [state.test.exam + " " + state.test.level + " Level, " + state.test.title, ""];
  sections().forEach((s) => {
    const sc = scoreSection(s);
    lines.push(
      s.name + ": " + sc.right + " right, " + sc.wrong + " wrong, " + sc.blank + " blank" +
      (penalty() > 0 ? ", raw " + sc.raw.toFixed(2) : "") +
      ", " + mmss(state.sectionElapsed[s.name] || 0)
    );
  });
  const missed = allQuestions().filter((q) => state.answers[q.id] !== q.answer);
  lines.push("", "Missed: " + (missed.map((q) => q.id).join(", ") || "none"));
  const text = lines.join("\n");
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => toast("Summary copied."),
      () => window.prompt("Copy this:", text)
    );
  } else window.prompt("Copy this:", text);
}

function downloadWriting() {
  const blob = new Blob([state.writingText], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = state.test.id + "-writing.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- keyboard ---------- */

document.addEventListener("keydown", (e) => {
  if (state.phase !== "section") return;
  if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
  const q = currentQuestion();
  if (e.key >= "1" && e.key <= "5") {
    const i = Number(e.key) - 1;
    if (i < q.choices.length) { e.preventDefault(); choose(i); }
  } else if (e.key === "ArrowRight") goto(state.qi + 1);
  else if (e.key === "ArrowLeft") goto(state.qi - 1);
  else if (e.key.toLowerCase() === "f") { toggleFlag(q); render(); }
  else if (e.key.toLowerCase() === "x") { delete state.answers[q.id]; render(); }
});

window.addEventListener("beforeunload", (e) => {
  if (state.phase === "section" || state.phase === "writing") {
    snapshot();
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ---------- boot ---------- */

function failed(message) {
  app.innerHTML = `<div class="wrap narrow"><div class="intro">
    <h2>This test did not load</h2>
    <p>${esc(message)}</p>
    <p style="font-size:0.95rem">Opening these files straight from your hard drive will not work,
    because browsers block one local file from reading another. Run
    <code>python3 -m http.server</code> in the project folder and open
    <code>localhost:8000</code>, or push to GitHub Pages.</p>
    <div style="margin-top:1.5rem"><a class="btn" href="index.html">All tests</a></div>
  </div></div>`;
}

/* Review mode: test.html?id=X&attempt=<takenAt> reopens a saved attempt on the results screen,
   with the explanations, instead of starting a new timed run. */
function restoreAttempt(a) {
  const byId = {};
  (a.questions || []).forEach((r) => { byId[r.id] = r; });
  allQuestions().forEach((q) => {
    const r = byId[q.id];
    if (!r) return;
    if (r.chose) state.answers[q.id] = LETTERS.indexOf(r.chose);
    if (r.seconds) state.qtime[q.id] = r.seconds;
    if (r.flagged) state.flags.add(q.id);
  });
  (a.sections || []).forEach((s) => { state.sectionElapsed[s.name] = s.seconds; });
  if (a.writing && a.writing.text) state.writingText = a.writing.text;
  // If the test file has changed since the attempt, letters no longer line up. Say so rather than
  // showing a review that quietly disagrees with the score the student got at the time.
  state.stale =
    (a.questions || []).length !== allQuestions().length ||
    allQuestions().some((q) => byId[q.id] && byId[q.id].correct && byId[q.id].correct !== LETTERS[q.answer]);
  state.attempt = a;
  state.saved = true;
  state.reviewing = true;
  state.writingDone = true;
  state.phase = "results";
}

const params = new URLSearchParams(location.search);
const id = params.get("id");
const attemptAt = params.get("attempt");

if (!id) failed("No test was named in the address.");
else {
  fetch("tests/" + id + ".json")
    .then((r) => {
      if (!r.ok) throw new Error("No file at tests/" + id + ".json");
      return r.json();
    })
    .then((data) => {
      state.test = data;
      document.title = data.title + ", " + data.exam + " practice";
      document.getElementById("sectionName").textContent = data.exam + " practice";
      if (attemptAt) {
        const a = loadAttempts().find((x) => x.testId === data.id && x.takenAt === attemptAt);
        if (!a) throw new Error("That attempt is not saved in this browser. Attempts stay on the device that took them.");
        restoreAttempt(a);
      }
      render();
    })
    .catch((err) => failed(err.message));
}
