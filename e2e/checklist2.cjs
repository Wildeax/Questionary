// Phase 2 checklist: votes, tags, leaderboard, history. Same scaffolding as checklist.cjs.
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { createHmac } = require("node:crypto");
const { readFileSync, rmSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const REPO = join(__dirname, "..");
const HERE = __dirname;
const DB = join(HERE, "e2e2.db");
const SHOTS = join(HERE, "shots2");
const PORT = 3124;
const BASE = `http://localhost:${PORT}`;
const SECRET = "e2esecret";

const results = [];
function pass(name, note = "") { results.push({ name, ok: true }); console.log(`PASS ${name}${note ? " (" + note + ")" : ""}`); }
function fail(name, note = "") { results.push({ name, ok: false }); console.log(`FAIL ${name}${note ? " (" + note + ")" : ""}`); }
async function step(name, fn) {
  try { const note = await fn(); pass(name, note || ""); } catch (e) { fail(name, e.message.split("\n")[0]); }
}
function cookieValue(userId) {
  const payload = `${userId}.${Date.now() + 86400000}`;
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}
async function call(method, path, body, userId) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(userId ? { Cookie: `qs=${cookieValue(userId)}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const questions = [
  { id: "S1", type: "mc", prompt: "Pick B", options: ["A", "B", "C"], answer: 1, explanation: "B was right" },
  { id: "S2", type: "tf", prompt: "Water is wet", answer: true },
  { id: "S3", type: "mc", prompt: "Pick C", options: ["A", "B", "C"], answer: 2 },
];
const perfect = { S1: 1, S2: true, S3: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS);
  for (const f of [DB, DB + "-wal", DB + "-shm"]) rmSync(f, { force: true });
  const db = new DatabaseSync(DB);
  db.exec(readFileSync(join(REPO, "server/schema.sql"), "utf8"));
  const ins = db.prepare("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?) RETURNING id");
  const ids = {};
  for (const [i, name] of ["alice", "bob", "carol", "dave"].entries()) {
    ids[name] = ins.get(200 + i, name, `https://avatars.githubusercontent.com/u/${10 + i}?s=64`, Date.now()).id;
  }
  db.close();

  const server = spawn(process.execPath, ["server/index.ts"], {
    cwd: REPO,
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), DATABASE_PATH: DB, SESSION_SECRET: SECRET, GITHUB_CLIENT_ID: "x", GITHUB_CLIENT_SECRET: "y", BASE_URL: BASE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  const deadline = Date.now() + 20000;
  let up = false;
  while (Date.now() < deadline) {
    try { if ((await fetch(BASE + "/api/me")).status === 401) { up = true; break; } } catch {}
    await sleep(300);
  }
  if (!up) { console.log(serverLog); throw new Error("server did not start"); }

  // Seed two published quizzes through the API.
  const smoke = (await call("POST", "/api/quizzes", { title: "Smoke quiz", description: "Three questions", tags: ["smoke", "e2e"], questions }, ids.alice)).id;
  await call("POST", `/api/quizzes/${smoke}/publish`, undefined, ids.alice);
  const other = (await call("POST", "/api/quizzes", { title: "Unity basics", tags: ["unity"], questions }, ids.alice)).id;
  await call("POST", `/api/quizzes/${other}/publish`, undefined, ids.alice);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + ".png"), fullPage: true });
  const newPage = async (userId) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    if (userId) await ctx.addCookies([{ name: "qs", value: cookieValue(userId), domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept());
    return page;
  };
  const score = (page) => page.textContent('button[aria-label="Upvote"] + span').then((s) => s.trim());
  const playUI = async (page, quizId, answers) => {
    await page.goto(BASE + `/quiz/${quizId}/play`);
    await page.click('button:has-text("Start Quiz")');
    await page.waitForSelector("text=Question 1 of 3");
    await page.click(`label:has-text("${answers[0]}") input[type=radio]`);
    await page.click('button:has-text("Next")');
    await page.click(`label:has-text("${answers[1]}") input[type=radio]`);
    await page.click('button:has-text("Next")');
    await page.click(`label:has-text("${answers[2]}") input[type=radio]`);
    await page.click('button:has-text("Finish")');
    await page.waitForSelector("text=/Score: \\d \\/ 3/");
  };
  const playApi = async (userId, quizId, answers, delayMs) => {
    const start = await call("POST", `/api/quizzes/${quizId}/attempts`, undefined, userId);
    await sleep(delayMs);
    return call("POST", `/api/attempts/${start.attemptId}`, { answers }, userId);
  };

  try {
    await step("1 vote up, clear, down as a non-author; author sees disabled buttons", async () => {
      const page = await newPage(ids.bob);
      await page.goto(BASE + `/quiz/${smoke}`);
      await page.waitForSelector('button[aria-label="Upvote"]');
      if ((await score(page)) !== "0") throw new Error("initial score not 0");
      await page.click('button[aria-label="Upvote"]');
      await page.waitForFunction(() => document.querySelector('button[aria-label="Upvote"] + span')?.textContent?.trim() === "1");
      const cls = await page.getAttribute('button[aria-label="Upvote"]', "class");
      if (!cls.includes("bg-emerald-600")) throw new Error("upvote not highlighted");
      await shot(page, "01-upvoted");
      await page.click('button[aria-label="Upvote"]');
      await page.waitForFunction(() => document.querySelector('button[aria-label="Upvote"] + span')?.textContent?.trim() === "0");
      await page.click('button[aria-label="Downvote"]');
      await page.waitForFunction(() => document.querySelector('button[aria-label="Upvote"] + span')?.textContent?.trim() === "-1");
      await page.context().close();
      const author = await newPage(ids.alice);
      await author.goto(BASE + `/quiz/${smoke}`);
      await author.waitForSelector('button[aria-label="Upvote"]');
      if (!(await author.isDisabled('button[aria-label="Upvote"]'))) throw new Error("author can vote");
      await author.context().close();
    });

    await step("2 signed out, a vote click shows the sign-in hint", async () => {
      const page = await newPage(null);
      await page.goto(BASE + `/quiz/${smoke}`);
      await page.click('button[aria-label="Upvote"]');
      await page.waitForSelector("text=to vote.");
      await page.waitForSelector('a:has-text("Sign in")');
      await page.context().close();
    });

    await step("3 leaderboard orders by score then time, one row per user, shows my best", async () => {
      const page = await newPage(ids.bob);
      await playUI(page, smoke, ["B", "True", "C"]);
      await page.context().close();
      await playApi(ids.dave, smoke, perfect, 2500);
      await playApi(ids.carol, smoke, { S1: 1, S2: true, S3: 0 }, 100);
      await playApi(ids.carol, smoke, perfect, 4000);
      const view = await newPage(ids.carol);
      await view.goto(BASE + `/quiz/${smoke}`);
      await view.waitForSelector('section:has(h2:has-text("Leaderboard")) tbody tr');
      const names = await view.$$eval('section:has(h2:has-text("Leaderboard")) tbody tr td:nth-child(2)', (tds) => tds.map((td) => td.textContent.trim()));
      if (names.join(",") !== "bob,dave,carol") throw new Error(`order was ${names.join(",")}`);
      const scores = await view.$$eval('section:has(h2:has-text("Leaderboard")) tbody tr td:nth-child(3)', (tds) => tds.map((td) => td.textContent.trim()));
      if (scores.join(",") !== "3/3,3/3,3/3") throw new Error(`scores were ${scores.join(",")}`);
      await view.waitForSelector("text=/Your best: 3\\/3/");
      await shot(view, "03-leaderboard");
      await view.context().close();
      return names.join(" > ");
    });

    await step("4 changing an answer resets the leaderboard with a message", async () => {
      const page = await newPage(ids.alice);
      await page.goto(BASE + `/quiz/${smoke}/edit`);
      await page.waitForSelector('h1:has-text("Edit quiz")');
      const yaml = await page.inputValue("textarea.font-mono");
      await page.fill("textarea.font-mono", yaml.replace("answer: 2", "answer: 0"));
      await page.click('button:has-text("Save")');
      await page.waitForURL(new RegExp(`/quiz/${smoke}$`));
      await page.waitForSelector("text=Leaderboard reset");
      await shot(page, "04-reset");
      await page.context().close();
    });

    await step("5 catalog tag chips filter and clear", async () => {
      const page = await newPage(null);
      await page.goto(BASE + "/");
      await page.waitForSelector('button:has-text("unity")');
      await page.click('button:has-text("smoke")');
      await page.waitForURL(/tag=smoke/);
      await page.waitForSelector(`a[href="/quiz/${smoke}"]`);
      if (await page.$(`a[href="/quiz/${other}"]`)) throw new Error("unfiltered quiz still shown");
      await shot(page, "05-tag-filter");
      await page.click('button:has-text("smoke")');
      await page.waitForFunction(() => !location.search.includes("tag="));
      await page.waitForSelector(`a[href="/quiz/${other}"]`);
      await page.context().close();
    });

    await step("6 tag input: suggestions, enter, limit of five, remove, tags on the published quiz", async () => {
      const page = await newPage(ids.alice);
      await page.goto(BASE + "/new");
      await page.click('button:has-text("Insert YAML template")');
      await page.waitForSelector('button[aria-label="Remove topic"]');
      await page.fill('input[aria-label="Add a tag"]', "sm");
      await page.click('div:has(> input[aria-label="Add a tag"]) button:has-text("smoke")');
      await page.waitForSelector('button[aria-label="Remove smoke"]');
      for (const t of ["a1", "b2"]) {
        await page.fill('input[aria-label="Add a tag"]', t);
        await page.press('input[aria-label="Add a tag"]', "Enter");
        await page.waitForSelector(`button[aria-label="Remove ${t}"]`);
      }
      if (!(await page.isDisabled('input[aria-label="Add a tag"]'))) throw new Error("input not disabled at five tags");
      await page.click('button[aria-label="Remove level"]');
      await page.fill('input[aria-label="Add a tag"]', "c++");
      await page.press('input[aria-label="Add a tag"]', "Enter");
      await page.waitForSelector("text=Invalid tag");
      await shot(page, "06-tag-input");
      await page.fill('input[maxlength="120"]', "Tagged quiz");
      await page.click('button:has-text("Publish")');
      await page.waitForURL(/\/quiz\/\d+$/);
      await page.waitForSelector('a:has-text("smoke")');
      await page.waitForSelector('a:has-text("a1")');
      await page.context().close();
    });

    await step("7 history lists finished attempts newest first", async () => {
      const page = await newPage(ids.carol);
      await page.goto(BASE + "/me");
      await page.waitForSelector('section:has(h2:has-text("History")) tbody tr');
      const rows = await page.$$eval('section:has(h2:has-text("History")) tbody tr', (trs) => trs.map((tr) => tr.children[1].textContent.trim()));
      if (rows.length !== 2 || rows[0] !== "3/3" || rows[1] !== "2/3") throw new Error(`rows were ${rows.join(",")}`);
      await shot(page, "07-history");
      await page.context().close();
    });
  } finally {
    await browser.close();
    server.kill();
    await sleep(500);
    if (server.exitCode === null) { try { process.kill(server.pid); } catch {} }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} phase 2 steps passed. Screenshots in ${SHOTS}`);
  if (/Error|error/.test(serverLog.replace(/ExperimentalWarning[^\n]*\n/g, ""))) console.log("server log had errors:\n" + serverLog);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
