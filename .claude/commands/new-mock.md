Build a full length mock. Argument: `$ARGUMENTS`, which must be `SSAT` or `ISEE`.

Read CLAUDE.md first. The section "Full length mocks" is the specification, and `FULL_SPEC` in
`check.js` enforces it exactly: section names in order, question counts, time limits, the break,
and the writing section. Look at the existing full length mock for the other exam (or the same
exam, if one exists) for the exact JSON shape, id scheme and tone.

This is 150 to 160 original questions plus passages and prompts. Do not attempt it in one pass.

Steps:

1. Choose the id `<exam>-middle-full-NN`, one more than the highest existing. Set
   `"format": "full"` in the file and in the manifest entry, with `kind: "mock"`.
2. Write the file header (id, exam, level, title, description, scoring, format, writing) and the
   section skeleton with the exact `name`, `timeLimitSeconds` and `breakAfterSeconds` values from
   `FULL_SPEC`, each with an empty `questions` array. Do not add it to the manifest yet, so the
   validator ignores it while it is incomplete.
3. Build one section at a time, in the real order. For each section:
   - Plan the answer key first so that, across the whole test, no letter exceeds a third. Keep a
     running tally as you go. Numeric choices must be in ascending order, so on maths questions
     place the answer by choosing the distractors.
   - Write original questions with an `id`, a `topic` tag from the list below, a `type` where the
     engine uses one, and an `explanation` that names the trap each wrong choice was built from.
     Refer to choices by value, never by letter. No em or en dashes.
   - SSAT Verbal is exactly 30 `synonym` then 30 `analogy`. ISEE Verbal Reasoning is roughly half
     `synonym` and half `completion`. ISEE Quantitative Reasoning mixes word problems with 14 to 20
     `comparison` questions using the four standard choices in the standard order.
   - Reading uses `passages` keyed p1, p2 and so on, with 5 to 7 questions each, every question
     naming its passage. SSAT reading mixes fiction, poetry and nonfiction; ISEE reading is mostly
     informational across science, history and the humanities. All prose must be original.
   - Never pad with near-duplicate questions to reach a count. A padded mock produces a score the
     student will believe.
   - Commit after each section with a message like `SSAT full mock: Reading (40 questions)`.
4. When every section is complete, add the manifest entry (`questions` is the total, `minutes` is
   sections plus writing plus breaks) and run `node check.js`. Fix every problem; it will hold you
   to the exact structure.
5. Run `/verify-runner` to drive the mock through the runner, including the break screen.
6. Commit with the manifest change.

Topic tags: for maths use `arithmetic`, `fractions and decimals`, `percent`, `ratio and
proportion`, `algebra`, `geometry`, `measurement`, `data and probability`, `number properties`,
`word problems`. For reading use `main idea`, `detail`, `inference`, `vocabulary in context`,
`tone and purpose`, `structure`. For verbal use `vocabulary`, `analogies`, `sentence completion`.
