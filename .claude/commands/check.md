Validate every test and serve the site locally.

1. Run `node check.js` from the project root. Read the output in full. Every line starting with
   `problem:` must be fixed before anything is committed. Lines starting with `check:` are warnings;
   read them and decide, do not silence them.
2. If the validator passes, start the local server in the background with `node serve.js` (or
   `python3 -m http.server` where Python exists) and tell the user the site is at
   http://localhost:8000. Do not open `index.html` from the filesystem, the test JSON will not load.
3. If `$ARGUMENTS` names a test id, also print that test's section names, question counts, time
   limits and key spread so the user can eyeball it.

Never lower the 35% answer key threshold or loosen the exam rules in `check.js` to make a run pass.
Fix the test instead.
