// Phase 1 manual checklist, driven headless through Edge with Playwright.
// Starts the built app in production mode on a scratch database, seeds users,
// mints session cookies with the server's HMAC scheme, and walks the checklist.
// Usage: node checklist.cjs   (run from the scratchpad e2e dir; repo path below)
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { createHmac } = require("node:crypto");
const { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const REPO = join(__dirname, "..");
const HERE = __dirname;
const DB = join(HERE, "e2e.db");
const SHOTS = join(HERE, "shots");
const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
const SECRET = "e2esecret";

const results = [];
function pass(name, note = "") { results.push({ name, ok: true, note }); console.log(`PASS ${name}${note ? " (" + note + ")" : ""}`); }
function fail(name, note = "") { results.push({ name, ok: false, note }); console.log(`FAIL ${name}${note ? " (" + note + ")" : ""}`); }
async function step(name, fn) {
  try { const note = await fn(); pass(name, note || ""); } catch (e) { fail(name, e.message.split("\n")[0]); }
}

function cookieFor(userId) {
  const payload = `${userId}.${Date.now() + 86400000}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return { name: "qs", value: `${payload}.${sig}`, domain: "localhost", path: "/" };
}

const SMALL_QUIZ = `- metadata:
    name: "Smoke quiz"
    description: "Three questions for the checklist"
    tags: [smoke, e2e]
- id: S1
  type: mc
  prompt: "Pick B"
  options: ["A", "B", "C"]
  answer: 1
  explanation: "B was right"
- id: S2
  type: tf
  prompt: "Water is wet"
  answer: true
- id: S3
  type: mc
  prompt: "Pick C"
  options: ["A", "B", "C"]
  answer: 2
`;

async function main() {
  rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS);
  for (const f of [DB, DB + "-wal", DB + "-shm"]) rmSync(f, { force: true });
  writeFileSync(join(HERE, "small.yaml"), SMALL_QUIZ);

  // Seed users straight into the scratch database.
  const db = new DatabaseSync(DB);
  db.exec(readFileSync(join(REPO, "server/schema.sql"), "utf8"));
  const ins = db.prepare("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?) RETURNING id");
  const alice = ins.get(101, "alice", "https://avatars.githubusercontent.com/u/1?s=64", Date.now()).id;
  const bob = ins.get(102, "bob", "https://avatars.githubusercontent.com/u/2?s=64", Date.now()).id;
  const admin = ins.get(103, "admin", "https://avatars.githubusercontent.com/u/3?s=64", Date.now()).id;
  db.close();

  const server = spawn(process.execPath, ["server/index.ts"], {
    cwd: REPO,
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), DATABASE_PATH: DB, SESSION_SECRET: SECRET, GITHUB_CLIENT_ID: "x", GITHUB_CLIENT_SECRET: "y", ADMIN_USERS: "admin", BASE_URL: BASE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  const deadline = Date.now() + 20000;
  let up = false;
  while (Date.now() < deadline) {
    try { const r = await fetch(BASE + "/api/me"); if (r.status === 401) { up = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!up) { console.log(serverLog); throw new Error("server did not start"); }

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + ".png"), fullPage: true });
  const newPage = async (userId) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    if (userId) await ctx.addCookies([cookieFor(userId)]);
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept());
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.errors = errors;
    return page;
  };


  // Progress bar width after its 500 ms transition, as a percent of its track.
  const barPct = async (page) => {
    await page.waitForTimeout(700);
    return page.evaluate(() => {
      const bar = document.querySelector(".bg-emerald-500.transition-all");
      return Math.round((bar.getBoundingClientRect().width / bar.parentElement.getBoundingClientRect().width) * 100);
    });
  };

  let bigId = null, smallId = null, draftId = null;

  try {
    // 1. Header: signed-in avatar, sign out clears it.
    await step("1 header shows avatar when signed in and sign out clears it", async () => {
      const page = await newPage(alice);
      await page.goto(BASE + "/");
      await page.waitForSelector("summary img");
      await page.waitForSelector("summary >> text=alice");
      await shot(page, "01-signed-in");
      await page.click("summary");
      await page.click("button:has-text(\"Sign out\")");
      await page.waitForSelector("a:has-text(\"Sign in with GitHub\")");
      await shot(page, "01-signed-out");
      await page.context().close();
    });

    // 2. Publish the real sample file by upload, appears in catalog under New.
    await step("2 upload questions.yaml, publish, appears in catalog under New", async () => {
      const page = await newPage(alice);
      await page.goto(BASE + "/new");
      await page.waitForSelector("h1:has-text(\"New quiz\")");
      await page.setInputFiles("input[type=file]", join(REPO, "questions/questions.yaml"));
      await page.waitForSelector("text=/\\d+ questions loaded/");
      const title = await page.inputValue("input[maxlength=\"120\"]");
      if (!title) throw new Error("title was not prefilled from metadata");
      await shot(page, "02-publish-form");
      await page.click("button:has-text(\"Publish\")");
      await page.waitForURL(/\/quiz\/\d+$/);
      bigId = Number(page.url().split("/").pop());
      await page.waitForSelector("a:has-text(\"Play\")");
      await page.goto(BASE + "/?sort=new");
      await page.waitForSelector(`a[href="/quiz/${bigId}"]`);
      await shot(page, "02-catalog-new");
      await page.context().close();
      return `quiz ${bigId}, title "${title}"`;
    });

    // Publish a small quiz for the play flows, plus a draft for the Me page.
    await step("2b publish a small quiz and save a draft", async () => {
      const page = await newPage(alice);
      await page.goto(BASE + "/new");
      await page.setInputFiles("input[type=file]", join(HERE, "small.yaml"));
      await page.waitForSelector("text=3 questions loaded");
      await page.click("button:has-text(\"Publish\")");
      await page.waitForURL(/\/quiz\/\d+$/);
      smallId = Number(page.url().split("/").pop());
      await page.goto(BASE + "/new");
      await page.click("button:has-text(\"Insert YAML template\")");
      await page.fill("input[maxlength=\"120\"]", "Alice draft");
      await page.click("button:has-text(\"Save draft\")");
      await page.waitForURL(/\/me$/);
      await page.waitForSelector("h2:has-text(\"Drafts\")");
      const draftLink = await page.getAttribute("section:has(h2:has-text(\"Drafts\")) a[href^=\"/quiz/\"]", "href");
      draftId = Number(draftLink.split("/").pop());
      await shot(page, "02b-me-page");
      await page.context().close();
      return `small ${smallId}, draft ${draftId}`;
    });

    // 3a. Anonymous play to results.
    await step("3a play signed out to results", async () => {
      const page = await newPage(null);
      await page.goto(BASE + `/quiz/${smallId}/play`);
      await page.click("button:has-text(\"Start Quiz\")");
      await page.waitForSelector("text=Question 1 of 3");
      await page.click("label:has-text(\"B\") input[type=radio]");
      await page.click("button:has-text(\"Next\")");
      await page.click("label:has-text(\"True\") input[type=radio]");
      await page.click("button:has-text(\"Next\")");
      await page.click("label:has-text(\"C\") input[type=radio]");
      await page.click("button:has-text(\"Finish\")");
      await page.waitForSelector("text=Score: 3 / 3");
      await page.waitForSelector("text=B was right");
      await shot(page, "03a-anon-results");
      await page.context().close();
    });

    // 3b. Signed in: answer one, reload, resume lands on the same question, finish.
    await step("3b signed-in play, reload mid-quiz, resume, finish counts a play", async () => {
      const page = await newPage(bob);
      await page.goto(BASE + `/quiz/${smallId}/play`);
      await page.click("button:has-text(\"Start Quiz\")");
      await page.waitForSelector("text=Question 1 of 3");
      await page.click("label:has-text(\"B\") input[type=radio]");
      await page.click("button:has-text(\"Next\")");
      await page.waitForSelector("text=Question 2 of 3");
      await page.waitForTimeout(1500); // autosave debounce
      await page.reload();
      await page.waitForSelector("text=Continue saved quiz");
      await shot(page, "03b-resume-card");
      await page.click("button:has-text(\"Continue\")");
      await page.waitForSelector("text=Question 2 of 3");
      await page.click("label:has-text(\"True\") input[type=radio]");
      await page.click("button:has-text(\"Next\")");
      await page.click("label:has-text(\"C\") input[type=radio]");
      await page.click("button:has-text(\"Finish\")");
      await page.waitForSelector("text=Score: 3 / 3");
      const pct = await barPct(page);
      if (pct !== 100) throw new Error(`progress bar at ${pct}% on results`);
      await shot(page, "03b-results");
      const card = await (await fetch(BASE + `/api/quizzes/${smallId}`)).json();
      if (card.plays !== 1) throw new Error(`plays = ${card.plays}, expected 1`);
      await page.context().close();
    });

    // 4. Author edits an answer while another attempt is open; that attempt gets the 409 flow.
    await step("4 editing a published answer makes an open attempt stale with Start over", async () => {
      const bobPage = await newPage(bob);
      await bobPage.goto(BASE + `/quiz/${smallId}/play`);
      await bobPage.click("button:has-text(\"Start Quiz\")");
      await bobPage.waitForSelector("text=Question 1 of 3");
      await bobPage.click("label:has-text(\"B\") input[type=radio]");

      const alicePage = await newPage(alice);
      await alicePage.goto(BASE + `/quiz/${smallId}/edit`);
      await alicePage.waitForSelector("h1:has-text(\"Edit quiz\")");
      const yaml = await alicePage.inputValue("textarea.font-mono");
      if (!yaml.includes("answer: 1")) throw new Error("editor did not load the quiz YAML");
      await alicePage.fill("textarea.font-mono", yaml.replace("answer: 1", "answer: 0"));
      await alicePage.click("button:has-text(\"Save\")");
      await alicePage.waitForURL(new RegExp(`/quiz/${smallId}$`));
      await alicePage.context().close();

      await bobPage.click("button:has-text(\"Next\")");
      await bobPage.click("label:has-text(\"True\") input[type=radio]");
      await bobPage.click("button:has-text(\"Next\")");
      await bobPage.click("label:has-text(\"C\") input[type=radio]");
      await bobPage.click("button:has-text(\"Finish\")");
      await bobPage.waitForSelector("text=updated by its author");
      await shot(bobPage, "04-stale");
      await bobPage.click("button:has-text(\"Start over\")");
      await bobPage.waitForSelector("button:has-text(\"Start Quiz\")");
      await bobPage.context().close();
    });

    // 5. Profile lists published only; Me splits drafts and published.
    await step("5 profile shows published only, Me splits drafts and published", async () => {
      const page = await newPage(alice);
      await page.goto(BASE + "/u/alice");
      await page.waitForSelector("h1:has-text(\"alice\")");
      await page.waitForSelector(`a[href="/quiz/${smallId}"]`);
      if (await page.$(`a[href="/quiz/${draftId}"]`)) throw new Error("draft visible on profile");
      await shot(page, "05-profile");
      await page.goto(BASE + "/me");
      await page.waitForSelector(`section:has(h2:has-text("Drafts")) a[href="/quiz/${draftId}"]`);
      await page.waitForSelector(`section:has(h2:has-text("Published")) a[href="/quiz/${smallId}"]`);
      await page.context().close();
    });

    // 5b. Admin can unpublish and delete someone else's published quiz, not a draft.
    await step("5b admin unpublishes and deletes a published quiz", async () => {
      const page = await newPage(admin);
      await page.goto(BASE + `/quiz/${bigId}`);
      await page.waitForSelector("button:has-text(\"Unpublish\")");
      if (await page.$("a:has-text(\"Edit\")")) throw new Error("admin sees Edit");
      await page.click("button:has-text(\"Delete\")");
      await page.waitForURL(new RegExp(`${BASE}/$`));
      const r = await fetch(BASE + `/api/quizzes/${bigId}`);
      if (r.status !== 404) throw new Error(`quiz still reachable: ${r.status}`);
      await page.goto(BASE + `/quiz/${draftId}`);
      await page.waitForSelector("text=Not found");
      await page.context().close();
    });

    // 6. Local mode: paste template, play, reload, resume, finish.
    await step("6 local mode loads a pasted file and resumes after reload", async () => {
      const page = await newPage(null);
      await page.goto(BASE + "/local");
      await page.click("button:has-text(\"Insert YAML Template\")");
      await page.click("button:has-text(\"Load from Paste\")");
      await page.click("button:has-text(\"Start Quiz\")");
      await page.waitForSelector("text=Question 1 of 2");
      await page.click("label:has-text(\"A\") input[type=radio]");
      await page.waitForTimeout(1500);
      await page.reload();
      await page.waitForSelector("text=Continue saved quiz");
      await page.click("button:has-text(\"Continue\")");
      await page.waitForSelector("text=Question 1 of 2");
      await page.click("button:has-text(\"Next\")");
      await page.click("label:has-text(\"True\") input[type=radio]");
      await page.click("button:has-text(\"Finish\")");
      await page.waitForSelector("text=Score: 2 / 2");
      const pct = await barPct(page);
      if (pct !== 100) throw new Error(`progress bar at ${pct}% on results`);
      await page.waitForSelector("button:has-text(\"Back to import\")");
      await shot(page, "06-local-results");
      await page.context().close();
    });

    // 7. Search and 404 page.
    await step("7 catalog search and unknown route", async () => {
      const page = await newPage(null);
      await page.goto(BASE + "/?q=zzz");
      await page.waitForSelector("text=No quizzes here yet");
      await page.goto(BASE + "/?q=smoke");
      await page.waitForSelector(`a[href="/quiz/${smallId}"]`);
      await page.goto(BASE + "/nope");
      await page.waitForSelector("text=That page does not exist");
      await page.context().close();
    });
  } finally {
    await browser.close();
    server.kill();
    await new Promise((r) => setTimeout(r, 500));
    if (server.exitCode === null) { try { process.kill(server.pid); } catch {} }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checklist steps passed. Screenshots in ${SHOTS}`);
  if (/Error|error/.test(serverLog.replace(/ExperimentalWarning[^\n]*\n/g, ""))) console.log("server log had errors:\n" + serverLog);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
