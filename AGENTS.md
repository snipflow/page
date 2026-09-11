# Codex frontend verification

For any UI change in this project, use the browser-level checks before claiming completion.

- Start the app with the existing Vite command on `http://127.0.0.1:10010`.
- Run `pnpm test:e2e` at desktop (`1440x900`) and mobile (`390x844`) viewports.
- Inspect the screenshot attached to every Playwright run instead of relying on code inspection alone.
- Check console errors, page errors, failed requests, and failed interactions.
- Add route-specific interaction and accessibility assertions as each real workflow is implemented.
- Add visual-regression baselines only after the corresponding real page design is stable.
- Keep `test-results/` and `playwright-report/` as debugging artifacts; do not commit them.
- If a Playwright or Chrome DevTools MCP server is available, use it to open the running page, inspect the DOM, exercise the main workflow, and take screenshots after each UI iteration.
- Do not claim that a frontend change is complete until the browser checks pass or a remaining failure is explicitly reported.
