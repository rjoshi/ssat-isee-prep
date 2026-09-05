Write a single skill drill. Arguments: `$ARGUMENTS`, in the form `<EXAM> <skill> <count>`, for
example `ISEE sentence-completion 15` or `SSAT synonym 20`. If the count is missing, use 12 for
maths and reading, 20 for verbal.

Read CLAUDE.md first, in particular the rules for test content and the real section proportions.

Steps:

1. Pick the id `<exam>-<skill>-drill-NN` in lower case, where NN is one more than the highest
   existing drill of that skill in `tests/`. Look at the closest existing drill for the exact JSON
   shape and tone before writing a word.
2. Set the time limit from the real pace: SSAT quantitative 72 seconds a question, SSAT reading 60,
   SSAT verbal 30, ISEE verbal 30, ISEE quantitative reasoning 57, ISEE reading 58, ISEE
   mathematics achievement 51. Round the section total to a whole number of seconds.
3. Write original questions. Five choices for the SSAT, four for the ISEE. Each question gets an
   `id`, a `topic` tag, a `type` where the engine uses one (`synonym`, `analogy`, `completion`, or
   a `comparison` object instead of a stem), a zero based `answer`, and an `explanation` that names
   the trap each wrong choice was built from. Refer to choices by their value, never by letter.
   Numeric choices go in ascending order. No em or en dashes anywhere.
4. Reading drills need original passages, never published text, in `passages` keyed by id with each
   question naming its passage. Aim for 4 to 6 questions per passage.
5. Plan the answer key before writing so no letter exceeds a third of the answers. For maths, place
   the answer by choosing distractors, since the numbers must stay in order.
6. Add the manifest entry with `kind: "drill"`, honest `covers` chips (reuse the existing names:
   Verbal, Quantitative, Reading, Mathematics, Writing, Essay), and `questions` and `minutes` that
   match the file.
7. Run `node check.js`. Fix every problem. Then run `/verify-runner` only if you touched
   `assets/engine.js`, which a drill should not need.
8. Commit with a message naming the exam, the skill and the question count.
