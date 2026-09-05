#!/usr/bin/env node
/* Validates every test listed in tests/manifest.json. Run: node check.js
   To freeze a test once it has been taken:  node check.js --freeze <id>   (or --freeze all) */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const L = ["A", "B", "C", "D", "E"];
const problems = [];
const warn = [];

const freezeArg = process.argv.indexOf("--freeze");
const freeze = freezeArg === -1 ? null : process.argv[freezeArg + 1] || "all";
let manifestChanged = false;

function fail(msg) {
  problems.push(msg);
}

/* The real Middle Level structure of each exam. A test that declares "format": "full" must match
   its row here exactly: section names in order, question counts, time limits, breaks, and the
   writing section. Short tests are free to use any proportions. */
const FULL_SPEC = {
  SSAT: {
    writing: { position: "first", timeLimitSeconds: 1500 },
    sections: [
      { name: "Quantitative 1", questions: 25, timeLimitSeconds: 1800 },
      { name: "Reading", questions: 40, timeLimitSeconds: 2400, breakAfterSeconds: 900 },
      { name: "Verbal", questions: 60, timeLimitSeconds: 1800, mix: { synonym: [30, 30], analogy: [30, 30] } },
      { name: "Quantitative 2", questions: 25, timeLimitSeconds: 1800 },
    ],
  },
  ISEE: {
    writing: { position: "last", timeLimitSeconds: 1800 },
    sections: [
      { name: "Verbal Reasoning", questions: 40, timeLimitSeconds: 1200, mix: { synonym: [17, 23], completion: [17, 23] } },
      { name: "Quantitative Reasoning", questions: 37, timeLimitSeconds: 2100, breakAfterSeconds: 300, mix: { comparison: [14, 20] } },
      { name: "Reading Comprehension", questions: 36, timeLimitSeconds: 2100 },
      { name: "Mathematics Achievement", questions: 47, timeLimitSeconds: 2400 },
    ],
  },
};

/* Reads "12", "$3.50", "2 1/2", "3/4", "-7", "1,200", "45%", "12 cm", "30 degrees". Returns null
   for anything that is not a plain quantity, so ratios like 2:3 and sentences are left alone. */
function numeric(s) {
  let t = String(s).trim().replace(/^\$/, "").replace(/,/g, "");
  t = t.replace(/\s*(%|°|cm²|cm2|m²|sq\.? ?(cm|m|ft|in|units?)|square (units|feet|inches|centimetres|centimeters|metres|meters)|cm|mm|km|m|kg|g|ml|L|litres|liters|inches|inch|in|feet|foot|ft|yards|miles|mph|hours|hour|minutes|minute|seconds|degrees|dollars|cents|pounds|years|days|weeks|units|points)$/i, "");
  let m = t.match(/^(-?)(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return (m[1] ? -1 : 1) * (Number(m[2]) + Number(m[3]) / Number(m[4]));
  m = t.match(/^(-?\d+)\/(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = t.match(/^-?\d+(\.\d+)?$/);
  if (m) return Number(t);
  return null;
}

const manifestPath = path.join(__dirname, "tests", "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error("tests/manifest.json is missing.");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error("tests/manifest.json is not valid JSON: " + e.message);
  process.exit(1);
}

const manifestIds = new Set();

for (const entry of manifest) {
  if (manifestIds.has(entry.id)) fail(entry.id + ": listed twice in the manifest");
  manifestIds.add(entry.id);

  const file = path.join(__dirname, "tests", entry.id + ".json");
  if (!fs.existsSync(file)) {
    fail(entry.id + ": no file at tests/" + entry.id + ".json");
    continue;
  }

  let test;
  const raw = fs.readFileSync(file, "utf8");
  try {
    test = JSON.parse(raw);
  } catch (e) {
    fail(entry.id + ": not valid JSON. " + e.message);
    continue;
  }

  /* Saved attempts record answers by question id and letter, so once a test has been taken its
     file must not change: reordering a choice would silently corrupt every review of it. A frozen
     entry carries a hash of the file, and any edit fails here. Write a new test instead. */
  const hash = crypto.createHash("sha256").update(raw.replace(/\r\n/g, "\n")).digest("hex").slice(0, 16);
  if (freeze === "all" || freeze === entry.id) {
    if (entry.frozen !== hash) { entry.frozen = hash; manifestChanged = true; console.log("frozen " + entry.id + " at " + hash); }
  } else if (entry.frozen && entry.frozen !== hash) {
    fail(
      entry.id + ": this test is frozen because saved attempts refer to it, and the file has changed. " +
      "Put the change in a new test instead. If nobody has taken it and the edit is deliberate, run: node check.js --freeze " + entry.id
    );
  }
  const frozen = !!entry.frozen;

  if (test.id !== entry.id) fail(entry.id + ": id inside the file says " + test.id);
  if (!test.title) fail(entry.id + ": no title");
  if (test.exam !== "SSAT" && test.exam !== "ISEE") fail(entry.id + ": exam must be SSAT or ISEE");
  if (test.exam !== entry.exam) fail(entry.id + ": manifest exam does not match the file");
  if (test.exam === "SSAT" && (!test.scoring || test.scoring.wrongPenalty !== 0.25))
    fail(entry.id + ": the SSAT deducts 0.25 for a wrong answer, so scoring.wrongPenalty must be 0.25");
  if (test.exam === "ISEE" && test.scoring && test.scoring.wrongPenalty)
    fail(entry.id + ": the ISEE has no wrong answer penalty, so wrongPenalty must be 0");
  if (test.writing && !["first", "last"].includes(test.writing.position))
    fail(entry.id + ": writing.position must be first or last");
  if (test.exam === "SSAT" && test.writing && test.writing.position !== "first")
    fail(entry.id + ": the SSAT writing sample comes first");
  if (test.exam === "ISEE" && test.writing && test.writing.position !== "last")
    fail(entry.id + ": the ISEE essay comes last");

  const format = test.format || "short";
  if (format !== "short" && format !== "full")
    fail(entry.id + ": format must be short or full");
  if ((entry.format || "short") !== format)
    fail(entry.id + ": manifest says format " + (entry.format || "short") + ", file says " + format);
  if (format === "full" && entry.kind !== "mock")
    fail(entry.id + ": a full length test must be a mock in the manifest");

  if (!Array.isArray(test.sections) || test.sections.length === 0) {
    fail(entry.id + ": no sections");
    continue;
  }

  const seen = new Set();
  const dist = [0, 0, 0, 0, 0];
  const lettered = [];
  let count = 0;
  let seconds = test.writing ? test.writing.timeLimitSeconds || 0 : 0;

  for (const sec of test.sections) {
    if (!sec.name) fail(entry.id + ": a section has no name");
    if (typeof sec.timeLimitSeconds !== "number" || sec.timeLimitSeconds <= 0)
      fail(entry.id + " / " + sec.name + ": timeLimitSeconds must be a positive number");
    else seconds += sec.timeLimitSeconds;
    if (sec.breakAfterSeconds !== undefined) {
      if (typeof sec.breakAfterSeconds !== "number" || sec.breakAfterSeconds <= 0)
        fail(entry.id + " / " + sec.name + ": breakAfterSeconds must be a positive number");
      else seconds += sec.breakAfterSeconds;
    }
    if (sec.passage && !Array.isArray(sec.passage))
      fail(entry.id + " / " + sec.name + ": passage must be an array of paragraphs");
    if (sec.passages) {
      for (const [pid, paras] of Object.entries(sec.passages)) {
        if (!Array.isArray(paras) || paras.length === 0)
          fail(entry.id + " / " + sec.name + ": passage " + pid + " must be a non-empty array of paragraphs");
        else if (!sec.questions.some((q) => q.passage === pid))
          warn.push(entry.id + " / " + sec.name + ": passage " + pid + " has no questions pointing at it");
      }
    }
    if (!Array.isArray(sec.questions) || sec.questions.length === 0) {
      fail(entry.id + " / " + sec.name + ": no questions");
      continue;
    }

    for (const q of sec.questions) {
      count++;
      const where = entry.id + " / " + (q.id || "question with no id");

      if (!q.id) fail(where + ": every question needs an id");
      else if (seen.has(q.id)) fail(where + ": duplicate id");
      seen.add(q.id);

      if (!q.stem && !q.comparison) fail(where + ": needs a stem or a comparison");
      if (q.passage && !(sec.passages && sec.passages[q.passage]))
        fail(where + ": points at passage " + q.passage + ", which the section does not define");
      if (sec.passages && !q.passage && !sec.passage)
        fail(where + ": the section has several passages, so the question must name one");
      if (q.comparison && (!q.comparison.a || !q.comparison.b))
        fail(where + ": comparison needs both a and b");
      if (q.type && !["synonym", "analogy", "completion", "comparison"].includes(q.type))
        fail(where + ": unknown type " + q.type);
      if (q.topic !== undefined && (typeof q.topic !== "string" || !q.topic.trim()))
        fail(where + ": topic must be a short non-empty string");

      if (!Array.isArray(q.choices) || q.choices.length < 2)
        fail(where + ": needs at least two choices");
      else {
        if (q.choices.length > 5) fail(where + ": more than five choices will not render");
        if (test.exam === "SSAT" && q.choices.length !== 5)
          fail(where + ": the SSAT uses five choices");
        if (test.exam === "ISEE" && q.choices.length !== 4)
          fail(where + ": the ISEE uses four choices");
        if (new Set(q.choices).size !== q.choices.length)
          fail(where + ": two choices are identical");
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length)
          fail(where + ": answer must be an index into choices, so 0 to " + (q.choices.length - 1));
        else dist[q.answer]++;

        // Both real tests list numeric choices smallest to largest. Rebalance a key by changing
        // distractors, never by shuffling numbers out of order. Frozen tests predate this rule and
        // cannot be reordered without breaking saved attempts, so they are left as they are.
        const nums = q.choices.map(numeric);
        if (!frozen && nums.every((n) => n !== null)) {
          for (let i = 1; i < nums.length; i++) {
            if (nums[i] <= nums[i - 1]) {
              fail(where + ": numeric choices must be in ascending order (" + q.choices.join(", ") + ")");
              break;
            }
          }
        }
      }

      if (!q.explanation || q.explanation.length < 20)
        fail(where + ": needs a real explanation, since that is the point of the review screen");

      // A stale letter reference is the usual casualty of reordering choices.
      if (/\b[Cc]hoices? [A-E]\b/.test(q.explanation || "")) lettered.push(q.id);
      if (/[–—]/.test((q.stem || "") + (q.explanation || "") + q.choices.join("")))
        fail(where + ": contains an em or en dash, which the house style does not use");
    }
  }

  if (count !== entry.questions)
    fail(entry.id + ": manifest says " + entry.questions + " questions, file has " + count);

  if (lettered.length)
    warn.push(
      entry.id + ": " + lettered.length + " explanations name a choice by letter (" + lettered.join(", ") +
      "). Prefer naming the value. If you reorder any of these choices, remap the letters too."
    );

  const minutes = seconds / 60;
  if (typeof entry.minutes !== "number" || Math.abs(entry.minutes - minutes) > 2)
    warn.push(entry.id + ": manifest says " + entry.minutes + " minutes, the file adds up to " + Math.round(minutes) + " including any writing and breaks");

  if (format === "full") {
    const spec = FULL_SPEC[test.exam];
    if (spec) {
      if (!test.writing) fail(entry.id + ": a full length " + test.exam + " has a writing section");
      else {
        if (test.writing.position !== spec.writing.position)
          fail(entry.id + ": full length writing comes " + spec.writing.position);
        if (test.writing.timeLimitSeconds !== spec.writing.timeLimitSeconds)
          fail(entry.id + ": full length writing is " + spec.writing.timeLimitSeconds / 60 + " minutes");
      }
      if (test.sections.length !== spec.sections.length)
        fail(entry.id + ": a full length " + test.exam + " has " + spec.sections.length + " sections in this order: " + spec.sections.map((s) => s.name).join(", "));
      spec.sections.forEach((want, i) => {
        const have = test.sections[i];
        if (!have) return;
        const at = entry.id + " / section " + (i + 1);
        if (have.name !== want.name) fail(at + ": must be named " + want.name + ", not " + have.name);
        if ((have.questions || []).length !== want.questions)
          fail(at + " (" + want.name + "): needs exactly " + want.questions + " questions, has " + (have.questions || []).length);
        if (have.timeLimitSeconds !== want.timeLimitSeconds)
          fail(at + " (" + want.name + "): time limit is " + want.timeLimitSeconds / 60 + " minutes");
        if ((have.breakAfterSeconds || 0) !== (want.breakAfterSeconds || 0))
          fail(at + " (" + want.name + "): " + (want.breakAfterSeconds
            ? "must be followed by a " + want.breakAfterSeconds / 60 + " minute break (breakAfterSeconds)"
            : "has no break after it on the real test"));
        if (want.mix) {
          for (const [type, [lo, hi]] of Object.entries(want.mix)) {
            const n = (have.questions || []).filter((q) => q.type === type || (type === "comparison" && q.comparison)).length;
            if (n < lo || n > hi)
              fail(at + " (" + want.name + "): needs " + (lo === hi ? lo : lo + " to " + hi) + " questions of type " + type + ", has " + n);
          }
        }
      });
    }
  }

  const top = Math.max(...dist);
  const share = count ? top / count : 0;
  const width = Math.max(...test.sections.flatMap((s) => (s.questions || []).map((q) => (q.choices || []).length)));
  console.log(
    test.exam + " " + entry.id + (format === "full" ? " (full length)" : "") + ": " + count + " questions, key spread " +
    dist.slice(0, width).map((v, i) => L[i] + v).join(" ") +
    " (" + Math.round(share * 100) + "% on one letter)"
  );
  if (share > 0.35)
    fail(
      entry.id + ": the key leans too hard on " + L[dist.indexOf(top)] +
      ". Reorder some choices, or change distractors on numeric questions so the answer moves."
    );
}

// A test file that nothing lists is invisible on the site and never validated. Say so.
for (const f of fs.readdirSync(path.join(__dirname, "tests"))) {
  if (f === "manifest.json" || !f.endsWith(".json")) continue;
  const id = f.replace(/\.json$/, "");
  if (!manifestIds.has(id)) warn.push("tests/" + f + " is not in the manifest, so it is neither shown nor checked");
}

if (manifestChanged) {
  // Keep the manifest's one-line string arrays, so the diff is only the frozen hashes.
  const text = JSON.stringify(manifest, null, 2).replace(/\[\s+((?:"[^"]*",?\s+)+)\]/g, (m, inner) =>
    "[" + inner.trim().split(/,\s+/).join(", ") + "]"
  );
  fs.writeFileSync(manifestPath, text + "\n");
  console.log("tests/manifest.json updated.");
}

console.log("");
for (const w of warn) console.log("check: " + w);
if (warn.length) console.log("");

if (problems.length) {
  for (const p of problems) console.error("problem: " + p);
  console.error("\n" + problems.length + " to fix.");
  process.exit(1);
}

console.log("All tests valid.");
