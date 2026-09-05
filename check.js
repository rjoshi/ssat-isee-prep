#!/usr/bin/env node
/* Validates every test listed in tests/manifest.json. Run: node check.js */

const fs = require("fs");
const path = require("path");

const L = ["A", "B", "C", "D", "E"];
const problems = [];
const warn = [];

function fail(msg) {
  problems.push(msg);
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

for (const entry of manifest) {
  const file = path.join(__dirname, "tests", entry.id + ".json");
  if (!fs.existsSync(file)) {
    fail(entry.id + ": no file at tests/" + entry.id + ".json");
    continue;
  }

  let test;
  try {
    test = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    fail(entry.id + ": not valid JSON. " + e.message);
    continue;
  }

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
  if (!Array.isArray(test.sections) || test.sections.length === 0) {
    fail(entry.id + ": no sections");
    continue;
  }

  const seen = new Set();
  const dist = [0, 0, 0, 0, 0];
  let count = 0;

  for (const sec of test.sections) {
    if (!sec.name) fail(entry.id + ": a section has no name");
    if (typeof sec.timeLimitSeconds !== "number" || sec.timeLimitSeconds <= 0)
      fail(entry.id + " / " + sec.name + ": timeLimitSeconds must be a positive number");
    if (sec.passage && !Array.isArray(sec.passage))
      fail(entry.id + " / " + sec.name + ": passage must be an array of paragraphs");
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
      if (q.comparison && (!q.comparison.a || !q.comparison.b))
        fail(where + ": comparison needs both a and b");

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
      }

      if (!q.explanation || q.explanation.length < 20)
        fail(where + ": needs a real explanation, since that is the point of the review screen");

      // A stale letter reference is the usual casualty of reordering choices.
      const refs = (q.explanation || "").match(/[Cc]hoices? ([A-D])/g);
      if (refs) {
        warn.push(
          where + ": explanation names " + refs.join(", ") +
          ". Confirm that still points at the option you meant. Key is " + L[q.answer] + "."
        );
      }
    }
  }

  if (count !== entry.questions)
    fail(entry.id + ": manifest says " + entry.questions + " questions, file has " + count);

  const top = Math.max(...dist);
  const share = top / count;
  console.log(
    test.exam + " " + entry.id + ": " + count + " questions, key spread " +
    dist.slice(0, Math.max(...test.sections.flatMap((s) => s.questions.map((q) => q.choices.length))))
      .map((v, i) => L[i] + v).join(" ") +
    " (" + Math.round(share * 100) + "% on one letter)"
  );
  if (share > 0.35)
    fail(
      entry.id + ": the key leans too hard on " + L[dist.indexOf(top)] +
      ". Reorder some choices, or change distractors on numeric questions so the answer moves."
    );
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
