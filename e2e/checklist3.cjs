// Phase 3 checklist: the in-app editor. Same scaffolding as checklist.cjs.
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { createHmac } = require("node:crypto");
const { readFileSync, rmSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const REPO = join(__dirname, "..");
const HERE = __dirname;
const DB = join(HERE, "e2e3.db");
const SHOTS = join(HERE, "shots3");
const PORT = 3125;
const BASE = `http://localhost:${PORT}`;
const SECRET = "e2esecret";

const results = [];
function pass(name, note = "") { results.push({ ok: true }); console.log(`PASS ${name}${note ? " (" + note + ")" : ""}`); }
function fail(name, note = "") { results.push({ ok: false }); console.log(`FAIL ${name}${note ? " (" + note + ")" : ""}`); }
async function step(name, fn) {
  try { const note = await fn(); pass(name, note || ""); } catch (e) { fail(name, e.message.split("\n")[0]); }
}
function cookieValue(userId) {
  const payload = `${userId}.${Date.now() + 86400000}`;
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS);
  for (const f of [DB, DB + "-wal", DB + "-shm"]) rmSync(f, { force: true });
  const db = new DatabaseSync(DB);
  db.exec(readFileSync(join(REPO, "server/schema.sql"), "utf8"));
  const alice = db.prepare("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?) RETURNING id").get(301, "alice", "https://avatars.githubusercontent.com/u/1?s=64", Date.now()).id;
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

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + ".png"), fullPage: true });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.addCookies([{ name: "qs", value: cookieValue(alice), domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const row = (id) => `[data-question="${id}"]`;
  const rowIds = () => page.$$eval("[data-question]", (els) => els.map((e) => e.getAttribute("data-question")));
  const promptOf = (id) => page.inputValue(`${row(id)} textarea[aria-label="Prompt"]`);
  let quizId = null;

  try {
    await step("1 template loads into the editor with its questions", async () => {
      await page.goto(BASE + "/new");
      await page.click('button:has-text("Insert YAML template")');
      await page.click('button[aria-pressed]:has-text("Editor")');
      await page.waitForSelector("[data-question]");
      const ids = await rowIds();
      if (ids.length !== 2) throw new Error(`expected 2 rows, got ${ids.join(",")}`);
      if (!(await promptOf(ids[0])).includes("your question")) throw new Error("first prompt not loaded");
      await shot(page, "01-editor-loaded");
      return ids.join(",");
    });

    await step("2 add a question, fill it, add an option, mark it correct", async () => {
      await page.click('button:has-text("Add question")');
      await page.waitForSelector(row("Q003"));
      await page.fill(`${row("Q003")} textarea[aria-label="Prompt"]`, "Pick C");
      await page.fill(`${row("Q003")} input[aria-label="Option 1"]`, "A");
      await page.fill(`${row("Q003")} input[aria-label="Option 2"]`, "B");
      await page.click(`${row("Q003")} button:has-text("Add option")`);
      await page.fill(`${row("Q003")} input[aria-label="Option 3"]`, "C");
      await page.check(`${row("Q003")} input[aria-label="Option 3 is correct"]`);
      const ids = await rowIds();
      if (ids.join(",") !== "Q001,Q002,Q003") throw new Error(`ids ${ids.join(",")}`);
    });

    await step("3 move up and delete renumber the rows", async () => {
      await page.click(`${row("Q003")} button[aria-label="Move up"]`);
      await page.waitForFunction(() => document.querySelector('[data-question="Q002"] textarea[aria-label="Prompt"]')?.value === "Pick C");
      await page.click(`${row("Q001")} button[aria-label="Delete question"]`);
      await page.waitForFunction(() => document.querySelectorAll("[data-question]").length === 2);
      const ids = await rowIds();
      if (ids.join(",") !== "Q001,Q002") throw new Error(`ids ${ids.join(",")}`);
      if ((await promptOf("Q001")) !== "Pick C") throw new Error("Pick C is not first");
      await shot(page, "03-reordered");
    });

    await step("4 switching to Upload shows the YAML and back keeps the rows", async () => {
      await page.click('button[aria-pressed]:has-text("Upload")');
      const yaml = await page.inputValue("textarea.font-mono");
      if (!yaml.includes("Pick C") || !yaml.includes("answer: 2")) throw new Error("YAML missing the edited question");
      await page.click('button[aria-pressed]:has-text("Editor")');
      await page.waitForSelector(row("Q002"));
      if ((await promptOf("Q001")) !== "Pick C") throw new Error("rows not restored");
    });

    await step("5 download YAML", async () => {
      const [download] = await Promise.all([page.waitForEvent("download"), page.click('button:has-text("Download YAML")')]);
      const name = download.suggestedFilename();
      if (!name.endsWith(".yaml")) throw new Error(`filename ${name}`);
      const content = readFileSync(await download.path(), "utf8");
      if (!content.includes("Pick C")) throw new Error("downloaded file lacks the edited question");
      return name;
    });

    await step("6 blank option is refused, then publish and play in the edited order", async () => {
      await page.fill(`${row("Q001")} input[aria-label="Option 2"]`, "");
      await page.fill('input[maxlength="120"]', "Edited quiz");
      await page.click('button:has-text("Publish")');
      await page.waitForSelector("text=options must not be blank");
      await page.fill(`${row("Q001")} input[aria-label="Option 2"]`, "B");
      await page.click('button:has-text("Publish")');
      await page.waitForURL(/\/quiz\/\d+$/);
      quizId = Number(page.url().split("/").pop());
      await page.waitForSelector("text=2 questions");
      await page.goto(BASE + `/quiz/${quizId}/play`);
      await page.click('button:has-text("Start Quiz")');
      await page.waitForSelector("text=Question 1 of 2");
      await page.waitForSelector("h2:has-text(\"Pick C\")");
      await shot(page, "06-play-edited");
      return `quiz ${quizId}`;
    });

    await step("7 editing a published quiz loads its questions into the editor", async () => {
      await page.goto(BASE + `/quiz/${quizId}/edit`);
      await page.waitForSelector('h1:has-text("Edit quiz")');
      await page.click('button[aria-pressed]:has-text("Editor")');
      await page.waitForSelector(row("Q002"));
      if ((await promptOf("Q001")) !== "Pick C") throw new Error("editor did not load the published questions");
    });
  } finally {
    await browser.close();
    server.kill();
    await sleep(500);
    if (server.exitCode === null) { try { process.kill(server.pid); } catch {} }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} phase 3 steps passed. Screenshots in ${SHOTS}`);
  if (/Error|error/.test(serverLog.replace(/ExperimentalWarning[^\n]*\n/g, ""))) console.log("server log had errors:\n" + serverLog);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
