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

function startTimer(seconds, onExpire) {
  stopTimer();
  const total = seconds;
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
    writing: renderWriting,
    results: renderResults,
  })[state.phase]();
}

function guessingLine() {
  return penalty() > 0
    ? "A wrong answer costs a quarter of a point and a blank costs nothing, so a wild guess is worth nothing on average. Once you can rule out even one choice, guessing pays. Rule out nothing, and leave it blank."
    : "A wrong answer costs exactly what a blank one costs, which is nothing, so never leave anything empty. Guess on every question you cannot work out.";
}

function renderIntro() {
  clearRail();
  const t = state.test;
  const w = writing();
  const totalMin = Math.round(
    (sections().reduce((a, s) => a + s.timeLimitSeconds, 0) + (w ? w.timeLimitSeconds : 0)) / 60
  );
  const rows = sections().map(
    (s) => `<li><span class="k">${esc(s.name)}</span><span class="v">${plural(
      s.questions.length, "question"
    )} &nbsp;·&nbsp; ${Math.round(s.timeLimitSeconds / 60)} min</span></li>`
  );
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
        <ul class="facts">${rows.join("")}</ul>
        <p class="rule"><strong>Scoring.</strong> ${guessingLine()}</p>
        <p style="font-size:0.97rem">Sit somewhere quiet with scratch paper and a pencil. There is
        no calculator, because neither real test allows one. Each section is timed on its own, and
        you cannot go back to a section once its time is up.</p>
        <p style="font-size:0.97rem"><strong>Keyboard.</strong> Press 1 to ${maxChoices} to answer,
        left and right arrows to move, F to flag a question, X to clear an answer and leave it blank.</p>
        <div style="margin-top:1.75rem;display:flex;gap:0.6rem;flex-wrap:wrap">
          <button class="btn btn-primary" id="begin">Start ${
            writingFirst() ? esc(w.name) : esc(sections()[0].name)
          }</button>
          <a class="btn" href="index.html">All tests</a>
        </div>
        <p style="font-size:0.9rem;color:var(--muted);margin-top:1.5rem">${plural(
          allQuestions().length, "question"
        )}${w ? " plus the writing sample" : ""}, about ${totalMin} minutes.</p>
      </div>
    </div>`;
  document.getElementById("begin").onclick = () =>
    writingFirst() ? enterWriting() : enterSection(0);
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
  state.phase = "sectionEnd";
  render();
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
    hint ? " — " + hint : ""
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
  markQuestionEnter();

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
  const w = writing();
  const isLast = state.si === sections().length - 1;
  const nextThing = !isLast
    ? sections()[state.si + 1].name
    : w && !state.writingDone
    ? w.name
    : "your results";
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
  document.getElementById("cont").onclick = () => {
    if (!isLast) enterSection(state.si + 1);
    else if (w && !state.writingDone) enterWriting();
    else showResults();
  };
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
  ta.oninput = () => {
    state.writingText = ta.value;
    const n = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    document.getElementById("wc").textContent = plural(n, "word");
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
      <p class="eyebrow">${esc(state.test.exam)} ${esc(state.test.level)} Level</p>
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

      ${strategyNote(totalBlank, totalWrong, totalQ)}

      <div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin:1.5rem 0">
        <button class="btn btn-primary" id="dlJson">Download this attempt</button>
        <button class="btn" id="copy">Copy a summary</button>
        ${state.writingText.trim() ? `<button class="btn" id="dlEssay">Download the writing</button>` : ""}
        <a class="btn" href="results.html">Past attempts</a>
        <a class="btn" href="index.html">All tests</a>
      </div>
      <p style="font-size:0.9rem;color:var(--muted);max-width:60ch">${
        state.saved
          ? "This attempt is saved in this browser. Download it to send the file on, or open past attempts to export everything at once."
          : "This browser would not let the attempt be saved, so download it now if you want to keep it."
      }</p>

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
          i === q.answer ? " — the answer" : i === a ? " — your choice" : ""
        }</div>`;
      })
      .join("")}
    <p class="why">${esc(q.explanation)}</p>
  </div>`;
}

function copySummary() {
  const lines = [state.test.exam + " " + state.test.level + " Level — " + state.test.title, ""];
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

const id = new URLSearchParams(location.search).get("id");

if (!id) failed("No test was named in the address.");
else {
  fetch("tests/" + id + ".json")
    .then((r) => {
      if (!r.ok) throw new Error("No file at tests/" + id + ".json");
      return r.json();
    })
    .then((data) => {
      state.test = data;
      document.title = data.title + " — " + data.exam + " practice";
      render();
    })
    .catch((err) => failed(err.message));
}
