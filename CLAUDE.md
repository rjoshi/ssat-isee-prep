# CLAUDE.md

Context for working on this repo. Read before making changes.

## What this is

A static practice test site for the SSAT and ISEE, Middle Level, built for one student applying to
grade 7. It publishes from `main` to https://rjoshi.github.io/ssat-isee-prep/ via GitHub Pages.

No build step, no dependencies, no server. Plain HTML, CSS and one JavaScript file. Tests are JSON
files read at runtime. Adding a test means adding a file and a manifest line, never editing code.

Keep it that way. Do not introduce a framework, a bundler, a package.json, or a build pipeline
unless explicitly asked. The whole point is that a parent can add a test file and push.

## Layout

```
index.html          home page, groups tests by exam then by mock/drill
test.html           shell the runner mounts into
results.html        saved attempts, export, and viewing a file someone sent
assets/engine.js    the entire test runner
assets/style.css    all styling
check.js            validator, run before every commit that touches tests/
tests/manifest.json list of tests shown on the home page
tests/*.json        one file per test
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

## Real section proportions

Match these when writing new tests so pacing feels right.

SSAT Middle, 3h05: writing 25 min; Quantitative 1, 25q/30min; Reading 40q/40min; Verbal 60q/30min
(half synonyms, half analogies); Quantitative 2, 25q/30min; experimental 16q/15min unscored.

ISEE Middle, 2h40 plus essay: Verbal 40q/20min; Quantitative Reasoning 37q/35min; Reading 36q/35min;
Mathematics Achievement 47q/40min; essay 30 min.

Per question that is roughly: SSAT 72s maths, 60s reading, 30s verbal. ISEE 51-58s maths and
reading, 30s verbal.

## Full length mocks

A test may declare `"format": "full"`, and `check.js` then enforces the real structure from its
`FULL_SPEC` table: exact section names in order, exact question counts, exact time limits, the break
in the right place, and the writing section in the right position with the right length. A test that
merely claims to be full length will fail the validator. Existing mocks are `"format": "short"`,
which is the default.

SSAT Middle, 3h05 including a 15 minute break:

| Section | Questions | Time |
|---|---|---|
| Writing sample, first | 1 creative prompt | 25 min |
| Quantitative 1 | 25 | 30 min |
| Reading | 40 | 40 min, then the 15 minute break |
| Verbal | 60, half synonyms half analogies | 30 min |
| Quantitative 2 | 25 | 30 min |

ISEE Middle, 2h40 plus the essay, with a short break after quantitative reasoning:

| Section | Questions | Time |
|---|---|---|
| Verbal Reasoning | 40 | 20 min |
| Quantitative Reasoning | 37 | 35 min, then a 5 minute break |
| Reading Comprehension | 36 | 35 min |
| Mathematics Achievement | 47 | 40 min |
| Essay, last | 1 prompt | 30 min |

Breaks are a `breakAfterSeconds` field on the section they follow. The runner shows a break screen
with a counting clock and no forced advance, since the point is to practise sitting the real length.

Building one of these means 150 to 160 original questions. Do it a section at a time, committing
between sections, and never pad with near-duplicates to reach a count. A padded mock produces a
score the student will believe.

## Slash commands

- `/new-mock SSAT` or `/new-mock ISEE` builds a full length mock section by section.
- `/new-drill ISEE sentence-completion 15` writes a single skill drill.
- `/check` runs the validator and serves the site.
- `/verify-runner` drives the site in a headless browser, which is required after touching
  `assets/engine.js`.

They live in `.claude/commands/`. Edit those files rather than repeating instructions in chat.

## Rules for test content

**Run `node check.js` before committing anything under `tests/`.** It fails the commit on bad answer
indices, wrong choice counts for the exam, duplicate ids, broken passage references, manifest
disagreement, and an answer key that puts more than 35% of correct answers on one letter.

**Answer key balance is not cosmetic.** A key leaning on one letter teaches a student to guess that
letter, which fails immediately on a real test. The validator has caught this repeatedly, once at
88% on a single letter. Do not lower the threshold to make a commit pass.

**Numeric answer choices stay in ascending order**, because both real tests arrange them that way.
So you cannot rebalance a maths question by shuffling. Change the distractors instead, and make sure
each new distractor corresponds to a plausible specific error.

**Prefer naming a choice by its value, not its letter, inside explanations.** Writing "the choice
$48 is 40 plus 20% of 40" survives reordering; writing "choice B" does not. Existing explanations
that name letters are correct as of the last commit, but any reorder must remap them, including the
`Choices A and D` form, which a previous remapper missed and silently broke.

**Every explanation should teach the trap, not just state the answer.** Say what the wrong choices
were built from. That is the value of the whole review screen.

**Passages must be original prose.** Do not paste published text, and do not reproduce copyrighted
poems, articles or excerpts.

## Writing style

Plain, direct sentences. No em dashes or en dashes anywhere in user-facing prose, in the site or in
test content, which is a standing preference from the repo owner. No exclamation marks, no
cheerleading. Address the student as a capable person.

## Privacy

Attempts live in `localStorage` under `prep:attempts` and never leave the device except as a file
the student chooses to download. There is no analytics, no telemetry, no network call except the
Google Fonts stylesheet. Do not add any. The repo is public, so nothing identifying belongs in a
committed file.

## Checking your work

```
node check.js               # validates every test
python3 -m http.server      # then open localhost:8000; file:// will not work
```

There is no automated browser test in the repo. Past sessions used Playwright ad hoc to drive the
site and screenshot it. That is worth doing for anything touching the runner, since a broken section
transition or timer is invisible to `check.js`.

Test by hand at minimum: a mock start to finish including the writing sample, section timer expiry,
the results screen, a downloaded attempt file, and reopening that file on `results.html`.

## Known gaps, roughly in order of value

1. **Topic tags per question.** Add a `topic` field (`algebra`, `geometry`, `vocabulary`,
   `inference`, and so on) and surface weakest topics on the results screen. Right now a weak
   section tells you where to look but not what to practise. This is the highest value change.
2. **Resume an interrupted test.** A closed tab loses everything. Save progress per section.
3. **Progress over time.** `results.html` lists attempts but does not chart them. Repeat attempts on
   the same test should show a trend.
4. **More tests.** Only one mock per exam, both short. An SSAT synonym drill and an ISEE sentence
   completion drill would round out verbal coverage. Use `/new-drill`.
5. **A full length mock for each exam.** The runner and validator support it, and `/new-mock`
   drives the build. Resume support matters more once a sitting is three hours, so consider item 2
   first.
6. **A missed-questions review mode**, pulling from saved attempts across sessions.
7. **Accessibility pass.** Keyboard navigation and focus states exist but have not been tested with
   a screen reader.

## Things deliberately not done

- No account, login or server. Results move as files.
- No timer pause. The real tests do not pause.
- No password gate. A client-side password on a static site protects nothing.
- No scaled score or percentile estimate. Converting a raw score to an SSAT scaled score or an ISEE
  stanine requires the official norm tables, and inventing an estimate would be misleading.
