# Browser checklists

Four scripts that drive the built app through a headless browser, one per phase of the
community build. Each starts `server/index.ts` in production mode on its own port with a
scratch SQLite file, seeds users directly, mints session cookies with the server's HMAC
scheme, and walks the phase's manual checklist. Screenshots land in `shots*/`.

They use the Edge browser that ships with Windows through Playwright's `msedge` channel,
so no browser download is needed. On another OS, set `channel` to `chrome` or run
`npx playwright install chromium` and drop the `channel` option.

```bash
cd e2e
npm install
cd .. && npm run build && cd e2e
npm run all
```

Each script prints one PASS or FAIL line per step and exits non-zero on any failure.
The GitHub OAuth round trip is the one thing they cannot exercise.
