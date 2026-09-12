# CLAUDE.md

Context for working on this repo. Read before making changes.

## What this is

A static practice test site for the SSAT and ISEE, Middle Level, built for one student, Rahul,
who is applying to grade 7 for the 2027 school year. It publishes from `main` to
https://rjoshi.github.io/ssat-isee-prep/ via GitHub Pages.

No build step, no dependencies, no server. Plain HTML, CSS and one JavaScript file. Tests are JSON
files read at runtime. Adding a test means adding a file and a manifest line, never editing code.

Keep it that way. Do not introduce a framework, a bundler, a package.json, or a build pipeline
unless explicitly asked. The whole point is that a parent can add a test file and push.

## Layout

```
index.html          home page: untaken tests grouped by exam then mock/drill, then Attempted
test.html           shell the runner mounts into
results.html        saved attempts, export, import, and viewing a file someone sent
assets/engine.js    the entire test runner, including review mode and the break screen
assets/style.css    all styling
check.js            validator and freeze tool, run before every commit that touches tests/
serve.js            zero dependency local server for machines without Python
tests/manifest.json list of tests shown on the home page, with frozen hashes
tests/*.json        one file per test
.claude/commands/   slash commands (below)
.claude/scripts/    verify-runner.js, the headless browser check
.nojekyll           stops GitHub running the site through Jekyll, do not delete
```

## The two exams differ, and the code models the difference

This is the most important thing in the project. The correct test-taking habit on one exam is the
wrong habit on the other, so the site teaches them separately.

| | SSAT Middle | ISEE Middle |
|---|---|---|
| Answer choices | 5 | 4 |
| Wrong answer | −0.25 | 0 |
| Blank | 0 | 0 |
| Guessing advice | only after ruling one out | always guess |
| Verbal | synonyms, analogies | synonyms, sentence completions |
| Writing | creative prompt, first | essay, last |

`scoring.wrongPenalty` in each test file drives this. The engine changes its intro advice, its
finish-section warning, its raw scoring and its closing note from that single number. When adding
behaviour that touches guessing or scoring, branch on `penalty()`, never on the exam name.

## Old exams cannot be changed

Saved attempts record answers by question id and letter. If a choice in a test file is reordered,
every saved review of that test silently shows the wrong option as the student's answer. So:

- A manifest entry may carry `"frozen": "<hash>"`. `check.js` fails if the file no longer matches
  the hash. All tests that have been published are frozen. Never edit a frozen test file; write a
  new test with a new id instead, even for a typo.
- Freezing is done with `node check.js --freeze <id>` (or `--freeze all`), which writes the hash
  into the manifest. Freeze a new test in the same commit that adds it to the manifest.
- Frozen tests predate the ascending-numeric-choices rule, so the validator skips that rule for them.
- Review mode also compares the saved `correct` letter with the file's current key and shows a
  warning if they disagree, as a last line of defence.
- The attempt file format is stable. Fields may be added; none may be renamed or removed, because
  files exported before this change must import cleanly on `results.html`.

## Full length mocks

A test may declare `"format": "full"`, and `check.js` then enforces the real structure from its
`FULL_SPEC` table: exact section names in order, exact question counts, exact time limits, the break
in the right place, the writing section in the right position with the right length, and the mix of
question types in verbal and quantitative reasoning. A test that merely claims to be full length
fails the validator. Short tests, the default, may use any proportions.

SSAT Middle, 2h50 including a 15 minute break (the real test adds an unscored 15 minute
experimental section, which is not modelled):

| Section | Questions | Time |
|---|---|---|
| Writing sample, first | 1 creative prompt | 25 min |
| Quantitative 1 | 25 | 30 min |
| Reading | 40 | 40 min, then the 15 minute break |
| Verbal | 60, exactly 30 `synonym` and 30 `analogy` | 30 min |
| Quantitative 2 | 25 | 30 min |

ISEE Middle, 2h45 including the essay and a 5 minute break:

| Section | Questions | Time |
|---|---|---|
| Verbal Reasoning | 40, 17 to 23 each of `synonym` and `completion` | 20 min |
| Quantitative Reasoning | 37, including 14 to 20 `comparison` | 35 min, then a 5 minute break |
| Reading Comprehension | 36 | 35 min |
| Mathematics Achievement | 47 | 40 min |
| Essay, last | 1 prompt | 30 min |

Breaks are a `breakAfterSeconds` field on the section they follow. The runner shows a break screen
with a clock that counts up, turns rose when the real break would have ended, and never advances on
its own, since the point is to practise sitting the real length.

One full length mock exists per exam: `ssat-middle-full-01` and `isee-middle-full-01`. Building
another means 150 to 160 original questions. Do it a section at a time and never pad with
near-duplicates to reach a count. A padded mock produces a score the student will believe.

## Attempts, review, and history

- An in-progress sitting is snapshotted to `localStorage` under `prep:snapshot:<testId>:<seq>` on
  every render, every ten seconds, shortly after typing in the essay box, and when the tab is
  hidden or left. The new snapshot is always written before the previous one is removed, so a
  crash mid-write leaves the older copy. The intro screen offers Resume or Start over when a
  snapshot exists; resuming restores answers, flags, per-question timings, the essay text, and the
  time that was left in the section at the last snapshot, so a hang does not cost clock. Finishing
  saves the attempt and only then clears the snapshots. If saving fails, a results-phase snapshot
  stays so a reload retries the save. The home page marks such tests In progress.
- Every finished test is saved to `localStorage` under `prep:attempts`. The home page reads that
  list: a test with any attempt leaves its exam group and appears under Attempted with every
  sitting's score, a trend line, Review latest and Retake.
- `test.html?id=X&attempt=<takenAt>` is review mode. It rebuilds the results screen from the saved
  attempt without starting a timer or saving anything.
- The results screen shows all attempts on the same test (Across attempts) and a by-topic breakdown
  when questions carry `topic` tags.
- `results.html` can import a results file into the browser, de-duplicated by test id and time
  taken. Old files import fine; do not break that.

## Slash commands

- `/new-mock SSAT` or `/new-mock ISEE` builds a full length mock section by section.
- `/new-drill ISEE sentence-completion 15` writes a single skill drill.
- `/check` runs the validator and serves the site.
- `/verify-runner` drives the site in headless Chrome or Edge, which is required after touching
  `assets/engine.js`, `index.html`, `results.html` or `assets/style.css`.

They live in `.claude/commands/`. Edit those files rather than repeating instructions in chat.

## Rules for test content

**Run `node check.js` before committing anything under `tests/`.** It fails on bad answer indices,
wrong choice counts for the exam, duplicate ids, broken passage references, manifest disagreement,
an edited frozen test, a full length test that does not match `FULL_SPEC`, numeric choices out of
ascending order, any em or en dash, and an answer key that puts more than 35% of correct answers on
one letter.

**Answer key balance is not cosmetic.** A key leaning on one letter teaches a student to guess that
letter, which fails immediately on a real test. The validator has caught this repeatedly, once at
88% on a single letter. Do not lower the threshold to make a commit pass. Plan the key before
writing the questions.

**Numeric answer choices stay in ascending order**, because both real tests arrange them that way.
So you cannot rebalance a maths question by shuffling. Change the distractors instead, and make sure
each new distractor corresponds to a plausible specific error.

**Name a choice by its value, not its letter, inside explanations.** Writing "the choice $48 is
40 plus 20% of 40" survives reordering; writing "choice B" does not. Older tests do name letters;
they are frozen, so the letters stay correct. The validator warns per test about any that remain.

**Every explanation should teach the trap, not just state the answer.** Say what the wrong choices
were built from. That is the value of the whole review screen.

**Every question carries a `topic` tag** so the results screen can show weakest topics. Maths:
`arithmetic`, `fractions and decimals`, `percent`, `ratio and proportion`, `algebra`, `geometry`,
`measurement`, `data and probability`, `number properties`, `word problems`. Reading: `main idea`,
`detail`, `inference`, `vocabulary in context`, `tone and purpose`, `structure`. Verbal:
`vocabulary`, `analogies`, `sentence completion`.

**Passages must be original prose.** Do not paste published text, and do not reproduce copyrighted
poems, articles or excerpts.

## Writing style

Plain, direct sentences. No em dashes or en dashes anywhere in user-facing prose, in the site or in
test content, which is a standing preference from the repo owner and is enforced by the validator
for test content. No exclamation marks, no cheerleading. Address the student as a capable person.

## Privacy

Attempts live in `localStorage` under `prep:attempts` and never leave the device except as a file
the student chooses to download. There is no analytics, no telemetry, no network call except the
Google Fonts stylesheet. Do not add any. The repo is public, so nothing identifying belongs in a
committed file beyond the student's first name in this document.

## Checking your work

```
node check.js                          # validates every test
node serve.js                          # then open localhost:8000; file:// will not work
node .claude/scripts/verify-runner.js  # headless browser run of the whole site
```

`verify-runner.js` needs Chrome or Edge installed. It runs a short mock start to finish including
the writing sample, a forced timer expiry, the break screen, the results screen, a reload mid-test
and resume, a second attempt, review mode, the Attempted section on the home page and
`results.html`. Pass a test id to run a
different test; pass a full length id to exercise a real break. Look at the screenshots it writes,
not only the pass line. Set `VERIFY_BASE=https://rjoshi.github.io/ssat-isee-prep/` to run the same
checks against the deployed site instead of a local server, which is the first thing to do when
someone reports the live site misbehaving. Checks for features not yet deployed fail rather than
crash, so a run against an older deployment still tells you what does work.

## Known gaps, roughly in order of value

1. **Progress over time as a chart.** `results.html` and the results screen list attempts and show
   the trend in words; a small chart of repeat attempts would read faster.
2. **More tests.** An SSAT synonym drill and an ISEE sentence completion drill would round out
   verbal coverage. A second full length mock per exam would let the student sit one cold and one
   after a month of drills. Use `/new-drill` and `/new-mock`.
3. **A missed-questions review mode**, pulling from saved attempts across sessions.
4. **Accessibility pass.** Keyboard navigation and focus states exist but have not been tested with
   a screen reader.

## Things deliberately not done

- No account, login or server. Results move as files.
- No timer pause. The real tests do not pause.
- No password gate. A client-side password on a static site protects nothing.
- No scaled score or percentile estimate. Converting a raw score to an SSAT scaled score or an ISEE
  stanine requires the official norm tables, and inventing an estimate would be misleading.
- No editing of published tests. See "Old exams cannot be changed."
