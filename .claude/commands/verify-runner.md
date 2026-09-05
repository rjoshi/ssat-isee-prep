Drive the site in a headless browser and confirm the runner still works end to end. Required after
any change to `assets/engine.js`, `index.html`, `results.html` or `assets/style.css`, because a
broken section transition, timer or results screen is invisible to `node check.js`.

Run:

```
node .claude/scripts/verify-runner.js
```

It needs Chrome or Edge installed (it looks in the usual Windows and macOS locations, or honour
`CHROME_PATH`). It starts its own static server on a spare port, so nothing else needs to be
running. It has no dependencies; it speaks to the browser over the DevTools protocol directly.

What it checks, in order: the home page renders both exam groups; a short mock runs from the
intro through the writing sample, every section, a forced timer expiry and the results screen; the
attempt is saved; a section with `breakAfterSeconds` shows the break screen with a counting clock;
the saved attempt reopens in review mode with the explanations; the home page then lists that test
under Attempted and not under its exam; and `results.html` shows the attempt with a Review button.

Screenshots land in the scratchpad directory it prints. Look at them, do not only read the pass
line. If `$ARGUMENTS` names a test id, it runs that test instead of the default short SSAT mock,
which is how to exercise a full length mock's break.

If any step fails, fix the cause in the site code and run it again. Do not edit the verifier to
make it pass.
