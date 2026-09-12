# SSAT and ISEE practice, Middle Level

A small static site for timed SSAT and ISEE practice. No build step, no dependencies, no server
code. Adding a test means adding one JSON file.

Live at `https://rjoshi.github.io/ssat-isee-prep/` once you follow the steps below.

## The two exams are not the same test

The site models the differences rather than papering over them, because the correct habit on one
is the wrong habit on the other.

| | SSAT Middle | ISEE Middle |
|---|---|---|
| Answer choices | 5 | 4 |
| Wrong answer | costs 1/4 point | costs nothing |
| Blank | costs nothing | costs nothing |
| Guessing rule | only after ruling one out | always guess |
| Verbal | synonyms and analogies | synonyms and sentence completions |
| Writing | creative prompt, comes first | essay, comes last |
| Applies to | grades 5 to 7 applying to 6 to 8 | grades 6 to 7 applying to 7 to 8 |

The engine reads `scoring.wrongPenalty` from each test file and changes its behaviour: the finish
warning only nags about blanks when guessing is free, and the results screen scores and advises
accordingly.

## What it does

- Runs each section on its own countdown, with a thin timer bar across the top that turns
  rose in the last fifth of the time.
- Locks a section once its time expires, the way the real test does.
- Tracks how long each individual question took, which is what tells you whether a weak section
  is a pacing problem or a content problem.
- Warns before finishing a section with blanks, because a wrong answer costs nothing on the ISEE.
- Shows an explanation for every question afterwards, filtered to the missed ones by default, and
  a breakdown by topic so a weak section turns into something specific to practise.
- Runs full length mocks with the real break: the clock counts up, turns rose when the real break
  would have ended, and nothing moves on until the student presses the button.
- Saves progress continuously while a test is running. If the page hangs, the tab closes, or the
  laptop dies, opening the same test again offers **Resume**, with every answer, flag and the essay
  text back and the section clock at the time it had left. Nothing is lost short of the browser's
  storage being cleared.
- Saves each finished attempt in the browser and exports it as JSON to send on. See below.
- Moves any test that has been taken out of its exam group and into an Attempted section on the
  home page, with every sitting's score, so what is left to do is what is shown. Each attempt can
  be reviewed with its explanations, and the test can be retaken; every score is kept.
- Keyboard: 1 to 5 to answer, arrow keys to move, F to flag, X to clear.

## Put it online

The repository is at https://github.com/rjoshi/ssat-isee-prep and the site publishes to
https://rjoshi.github.io/ssat-isee-prep/.

1. Copy the site files into your clone, keeping the folder structure. The LICENSE that GitHub
   created stays where it is.
2. Commit and push:

   ```
   git add .
   git commit -m "Add SSAT and ISEE practice tests"
   git push
   ```

3. In the repository, open **Settings**, then **Pages** in the sidebar. Under **Source** choose
   **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. Wait a minute or two, then open https://rjoshi.github.io/ssat-isee-prep/. The Actions tab shows
   the deployment if it seems slow.

After the first push, everything is ordinary: edit, commit, push, and the site updates in about a
minute.

The `.nojekyll` file is there to stop GitHub running the files through Jekyll. Leave it alone.

## Run it on your own machine first

Double clicking `index.html` will **not** work. Browsers block one local file from reading another,
so the test JSON never loads. Use a local server instead:

```
cd ssat-isee-prep
node serve.js
```

Or, if you have Python rather than Node, `python3 -m http.server`. Either way, open
`http://localhost:8000`.

## Sending results to a parent or tutor

Nothing is uploaded anywhere. Each finished test is written to the browser's own storage on the
device that took it, and the only way results leave that device is a file the student chooses to
download and send.

**The student**, after finishing a test, presses **Download this attempt**, which saves a file like
`rahul-ssat-analogy-drill-01-2026-09-04.json`, and emails or messages it over. To send several at
once, open **Past attempts** and press **Export everything**, which bundles them into one file.

**The parent or tutor** opens `results.html`, presses **Open a results file** and picks the file.
It renders as a readable summary. Opening a file is view only: nothing from it is written into your
own browser, so your history and theirs stay separate.

Set the name once on the Past attempts page. It is used only to name the downloaded files, and it
never leaves the device except inside a file that is deliberately exported.

### What is in an attempt file

```json
{
  "student": "Rahul",
  "exam": "SSAT",
  "level": "Middle",
  "testId": "ssat-analogy-drill-01",
  "testTitle": "Analogy drill",
  "takenAt": "2026-09-04T23:41:07.221Z",
  "wrongPenalty": 0.25,
  "sections": [
    { "name": "Analogies", "right": 2, "wrong": 9, "blank": 1,
      "total": 12, "raw": -0.25, "seconds": 342 }
  ],
  "questions": [
    { "id": "A1", "chose": "B", "correct": "A", "right": false,
      "seconds": 41, "flagged": true }
  ],
  "writing": { "prompt": "...", "words": 312, "text": "..." }
}
```

The per-question `seconds` is the useful part. Two students can score the same and be in completely
different trouble: one is missing content, the other is running out of clock. The timings tell you
which.

### Caveats worth knowing

- Storage is per browser and per device. Practising on a laptop and then a phone gives two separate
  histories. Export from each.
- Private or incognito windows throw the history away when closed. The results screen says so if
  saving failed, and the download button still works.
- Clearing site data in the browser clears the attempts. Export anything worth keeping.
- A results file can be added back into a browser: open it on `results.html` and press **Add to
  this browser**. Attempts already present are skipped, so importing the same file twice adds
  nothing. Files exported by earlier versions of the site import the same way.
- A saved attempt can be reopened with its explanations from the home page, the results page, or
  directly at `test.html?id=<test>&attempt=<takenAt>`. That only works on the device that took it,
  or one the file has been imported into.

## How the home page is organised

Each exam has two groups, driven by the `kind` field in the manifest.

**Mocks** run every section in the order the real test uses them, so a mock is the only thing that
tells you where a student actually stands. Each exam has a **full length** mock, at the real
question counts and time limits with the real break, and a **short form** mock at a quarter
length. The short one finds the weak spot in an hour; the full one is a rehearsal for the day
itself and takes close to three hours.

**Attempted** sits below the exam groups and holds every test that has been taken in this browser.
A test appears there instead of in its exam group, with a chip for each sitting, the latest and
best scores, and a trend, plus Review latest and Retake buttons. Tests taken in another browser or
on another device are not known here until their results file is imported on `results.html`.

**Drills** take one skill at a time. Between them they cover every scored section of both exams:

| Exam | Drills | Covers |
|---|---|---|
| SSAT | Analogies, Quantitative, Reading | Verbal, Quantitative, Reading |
| ISEE | Verbal, Quantitative comparison, Mathematics achievement, Reading | Verbal, both maths sections, Reading |

The intended loop is mock first, then drill whatever the mock exposed, then another mock. Each
card shows the sections it covers as chips, so gaps in coverage are visible at a glance when you
add tests.

## Add a test

1. Create `tests/your-test-id.json` using the shape below.
2. Add a matching entry to `tests/manifest.json`.
3. Run `node check.js`.
4. Run `node check.js --freeze your-test-id` to lock the file. See below for why.
5. Commit and push. GitHub Pages redeploys in a minute or so.

That is the whole process. The engine reads whatever the manifest lists, so there is no code to
change and no list to keep in sync anywhere else. Tests appear on the home page grouped under
their exam, in manifest order.

**A published test must never change.** Saved attempts record each answer by question id and
letter, so reordering a single choice would make every past review of that test show the wrong
option as the student's answer. The manifest therefore carries a `frozen` hash for each test, and
`check.js` fails if a frozen file differs from its hash. To fix even a typo, write a new test with a
new id and, if you like, drop the old one from the manifest. Review mode also warns if it detects
that a test changed under an attempt, as a backstop.

### File shape

```json
{
  "id": "ssat-verbal-02",
  "exam": "SSAT",
  "level": "Middle",
  "title": "Verbal sprint 2",
  "description": "Shown on the start screen before the timer begins.",
  "scoring": { "wrongPenalty": 0.25 },
  "sections": [
    {
      "name": "Verbal Reasoning",
      "timeLimitSeconds": 600,
      "passage": ["First paragraph.", "Second paragraph."],
      "questions": [
        {
          "id": "S1",
          "type": "synonym",
          "stem": "VIVID",
          "choices": ["strikingly clear", "faint", "noisy", "brief"],
          "answer": 0,
          "explanation": "Shown during review after the test."
        }
      ]
    }
  ],
  "writing": {
    "name": "Writing sample",
    "position": "first",
    "timeLimitSeconds": 1500,
    "note": "Shown above the prompt.",
    "prompts": ["One or more. Two or more renders a chooser, as the real SSAT does."]
  }
}
```

Field notes:

- `exam` must be `SSAT` or `ISEE`. It drives the grouping on the home page and the validator's
  rules about choice count and scoring.
- `kind` in the manifest is `mock` or `drill`, and decides which group the card lands in. Anything
  else is treated as a drill.
- `covers` in the manifest is the list of chips shown on the card. Use the same section names
  across tests so coverage gaps are easy to spot.
- `scoring.wrongPenalty` is `0.25` for the SSAT and `0` for the ISEE. Do not set it by hand to
  anything else; the validator will reject it.
- `answer` is a zero based index into `choices`. `0` means A. Give SSAT questions five choices and
  ISEE questions four.
- `writing.position` is `first` on the SSAT and `last` on the ISEE, matching each real test.
- `id` must be unique within the file. It is what appears in the copied summary, and it is how
  saved attempts refer to the question, so it must never change once the test is published.
- `topic` is a short tag such as `algebra` or `inference`. When questions carry topics, the
  results screen shows the weakest topics first. Reuse the names already in the full length mocks
  so the breakdown stays comparable across tests.
- `format` is `short` (the default) or `full`. A full length test must match the real exam
  exactly: section names in order, question counts, time limits, break, and the writing section.
  `check.js` holds it to the `FULL_SPEC` table at the top of the file and lists every mismatch.
- `breakAfterSeconds` on a section adds a break after it. The runner shows a break screen with a
  clock that counts up and never advances on its own. The full length SSAT has 900 after Reading;
  the full length ISEE has 300 after Quantitative Reasoning.
- Numeric choices must be listed smallest to largest, as both real tests do. To move the correct
  answer to a different letter, change the distractors rather than the order.
- No em dashes or en dashes anywhere in a test. Use a comma or a full stop.
- `type` is optional. `"synonym"` sets the stem in small caps spacing and adds a reminder line.
- For one passage per section, use `passage` as an array of paragraphs on the section.
- For several passages in one section, as SSAT reading has, put them in `passages` keyed by id and
  point each question at one:

  ```json
  { "passages": { "p1": ["First paragraph.", "Second."], "p2": ["..."] },
    "questions": [{ "id": "R1", "passage": "p1", "stem": "..." }] }
  ```

  A passage renders beside the questions on a wide screen and above them on a phone.
- `type` may also be `analogy`, which adds the matching instruction line. SSAT analogy stems end
  with "as", like `Petal is to flower as`, and each choice is a full pair.
- `comparison` replaces `stem` for quantitative comparison questions:

  ```json
  { "comparison": { "a": "25% of 80", "b": "1/5 of 100" } }
  ```

  Use the four standard choices in the standard order, since students learn to recognise them
  by position. Copy them from `tests/isee-middle-qc-drill-01.json`. A `stem` alongside the
  comparison is optional and is the place for any given condition, such as `x is a positive number`.
- `type` may also be `completion` for ISEE sentence completions. Mark the blank with underscores
  in the stem, or write the sentence up to the point where the choices finish it.

### Manifest entry

```json
{
  "id": "ssat-verbal-02",
  "exam": "SSAT",
  "kind": "drill",
  "title": "Verbal 2",
  "blurb": "One line shown on the home page.",
  "covers": ["Verbal"],
  "questions": 20,
  "minutes": 10
}
```

## Check a test before committing

This catches broken answer indices, duplicate ids, a question count that disagrees with the
manifest, a frozen test that has been edited, a full length test that does not match the real
structure, numeric choices out of order, stray dashes, and an answer key that leans too hard on one
letter. Run it from the project root.

```
node check.js                    # validate everything
node check.js --freeze <id>      # lock a test once it is published (or --freeze all)
```

An answer key where one letter wins more than about a third of the time teaches guessing rather
than reasoning, so the script fails the build on that. It also warns, without failing, about
explanations that refer to a choice by letter rather than by value, and about a test file that is
not listed in the manifest.

To check the runner itself, after changing anything in `assets/`, `index.html` or `results.html`,
run `node .claude/scripts/verify-runner.js`. It needs Chrome or Edge installed and drives the whole
site in a headless window, including the break screen, review mode and the Attempted section.

## Real test proportions

Match these when writing a new test so the pacing feels right.

**SSAT Middle Level**, 3 hours 5 minutes in the order below.

| Section | Real test | Real time | Pace |
|---|---|---|---|
| Writing sample | 1 creative prompt, unscored | 25 min | — |
| Quantitative 1 | 25 questions | 30 min | 72s each |
| Reading | 40 questions | 40 min | 60s each |
| Verbal | 60 questions, half synonyms and half analogies | 30 min | 30s each |
| Quantitative 2 | 25 questions | 30 min | 72s each |
| Experimental | 16 questions, unscored | 15 min | — |

**ISEE Middle Level**, 2 hours 40 minutes plus the essay.

| Section | Real test | Real time | Pace |
|---|---|---|---|
| Verbal Reasoning | 40 questions | 20 min | 30s each |
| Quantitative Reasoning | 37 questions | 35 min | 57s each |
| Reading Comprehension | 36 questions | 35 min | 58s each |
| Mathematics Achievement | 47 questions | 40 min | 51s each |
| Essay | 1 prompt, unscored | 30 min | — |

Verbal is the fastest section on both exams by a wide margin. That pace is worth drilling on its
own, which is what the verbal and analogy drills are for.

## Before test day

Take a full length official sample for whichever exam is being sat. For the SSAT that is
[EMA](https://www.ssat.org/), and for the ISEE it is ERB's
[What to Expect on the ISEE](https://www.erblearn.org/families/isee-preparation/), which every
ISEE registration includes free access to. Both are written by the people who build the real
tests. Nothing here replaces them. This site is for volume and pacing between official attempts.
