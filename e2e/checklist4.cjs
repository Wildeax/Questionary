// Phase 4 checklist: rooms. A signed-in host and an anonymous guest in separate browser contexts.
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const { createHmac } = require("node:crypto");
const { readFileSync, rmSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const REPO = join(__dirname, "..");
const HERE = __dirname;
const DB = join(HERE, "e2e4.db");
const SHOTS = join(HERE, "shots4");
const PORT = 3126;
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
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  rmSync(SHOTS, { recursive: true, force: true }); mkdirSync(SHOTS);
  for (const f of [DB, DB + "-wal", DB + "-shm"]) rmSync(f, { force: true });
  const db = new DatabaseSync(DB);
  db.exec(readFileSync(join(REPO, "server/schema.sql"), "utf8"));
  const alice = db.prepare("INSERT INTO users (github_id, username, avatar_url, created_at) VALUES (?, ?, ?, ?) RETURNING id").get(401, "alice", "https://avatars.githubusercontent.com/u/1?s=64", Date.now()).id;
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

  const quizId = (await call("POST", "/api/quizzes", { title: "Room quiz", questions }, alice)).id;
  await call("POST", `/api/quizzes/${quizId}/publish`, undefined, alice);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const shot = (page, name) => page.screenshot({ path: join(SHOTS, name + ".png"), fullPage: true });
  const hostCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await hostCtx.addCookies([{ name: "qs", value: cookieValue(alice), domain: "localhost", path: "/" }]);
  const host = await hostCtx.newPage();
  const guestCtx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const guest = await guestCtx.newPage();
  for (const p of [host, guest]) p.on("dialog", (d) => d.accept());

  const createRoomViaUi = async (mode, seconds) => {
    await host.goto(BASE + `/quiz/${quizId}`);
    await host.click('a:has-text("Host a room")');
    await host.waitForSelector('h1:has-text("Host a room")');
    await host.check(`input[name="mode"][value="${mode}"]`);
    if (seconds) await host.fill('input[type="number"]', String(seconds));
    await host.click('button:has-text("Create room")');
    await host.waitForURL(/\/r\/[A-Z2-9]{6}$/);
    return host.url().split("/").pop();
  };
  const joinAsGuest = async (code, nickname) => {
    await guest.goto(BASE + `/r/${code}`);
    await guest.waitForSelector('h1:has-text("Join room")');
    await guest.fill('input[maxlength="20"]', nickname);
    await guest.click('button:has-text("Join")');
  };
  const answerRace = async (page, label) => {
    await page.click(`label:has-text("${label}") input[type=radio]`);
    const finish = await page.$('button:has-text("Finish")');
    await (finish ? finish.click() : page.click('button:has-text("Next")'));
  };

  try {
    let code;
    await step("1 host creates a race room, guest joins by nickname, duplicate nickname refused", async () => {
      code = await createRoomViaUi("race");
      await host.waitForSelector('h1:has-text("Waiting for players")');
      await host.waitForSelector("text=alice");
      await joinAsGuest(code, "guest");
      await guest.waitForSelector('h1:has-text("Waiting for players")');
      await host.waitForSelector("li:has-text(\"guest\")");
      await shot(host, "01-lobby-host");
      const dupCtx = await browser.newContext();
      const dup = await dupCtx.newPage();
      await dup.goto(BASE + `/r/${code}`);
      await dup.fill('input[maxlength="20"]', "GUEST");
      await dup.click('button:has-text("Join")');
      await dup.waitForSelector("text=taken");
      await dupCtx.close();
      return code;
    });

    await step("2 race: countdown, live progress, guest results, host ends, final ranking", async () => {
      await host.click('button:has-text("Start")');
      await host.waitForSelector("text=Get ready");
      await guest.waitForSelector("text=Get ready");
      await guest.waitForSelector("text=Question 1 of 2", { timeout: 10_000 });
      await answerRace(guest, "B");
      await host.waitForSelector("td:has-text(\"1/2\")");
      await answerRace(guest, "True");
      await guest.waitForSelector("text=Score: 2 / 2");
      await guest.waitForSelector("text=B was right");
      await shot(guest, "02-guest-results");
      await host.click('button:has-text("End race")');
      await host.waitForSelector('h2:has-text("Final ranking")');
      await guest.waitForSelector('h2:has-text("Final ranking")');
      const first = await host.textContent('aside tbody tr:first-child td:nth-child(2)');
      if (!first.includes("guest")) throw new Error(`first place was ${first}`);
      await shot(host, "02-final-host");
    });

    await step("3 refreshing the guest mid-race keeps the seat and resumes", async () => {
      code = await createRoomViaUi("race");
      await joinAsGuest(code, "guest");
      await host.waitForSelector("li:has-text(\"guest\")");
      await host.click('button:has-text("Start")');
      await guest.waitForSelector("text=Question 1 of 2", { timeout: 10_000 });
      await answerRace(guest, "B");
      await guest.waitForSelector("text=Question 2 of 2");
      await guest.reload();
      await guest.waitForSelector("text=Question 2 of 2", { timeout: 10_000 });
      await host.click('button:has-text("End race")');
      await host.waitForSelector('h2:has-text("Final ranking")');
    });

    await step("4 synchronized: timer, answers, reveal with points, timeout, final ranking", async () => {
      code = await createRoomViaUi("sync", 6);
      await joinAsGuest(code, "guest");
      await host.waitForSelector("li:has-text(\"guest\")");
      await host.click('button:has-text("Start")');
      await guest.waitForSelector("text=Question 1 of 2");
      await host.waitForSelector("text=Question 1 of 2");
      await guest.click('button:has-text("B")');
      await guest.waitForSelector("text=Answered. Waiting");
      await host.waitForSelector("text=1 of 2 answered");
      await host.click('button:has-text("B")');
      await host.waitForSelector("text=Correct answer:");
      await guest.waitForSelector("text=Correct answer:");
      await guest.waitForSelector("text=B was right");
      const pts = await guest.$$eval("tbody tr td:nth-child(3)", (tds) => tds.map((td) => td.textContent.trim()));
      if (!pts.every((t) => /\d+ pts \(\+\d+\)/.test(t))) throw new Error(`scoreboard cells ${pts.join(" | ")}`);
      await shot(guest, "04-reveal");
      await host.click('button:has-text("Next question")');
      await guest.waitForSelector("text=Question 2 of 2");
      await guest.waitForSelector("text=Correct answer:", { timeout: 12_000 });
      const after = await guest.$$eval("tbody tr td:nth-child(3)", (tds) => tds.map((td) => td.textContent.trim()));
      if (after.some((t) => t.includes("(+"))) throw new Error(`points awarded after a timeout: ${after.join(" | ")}`);
      await host.click('button:has-text("Show final ranking")');
      await host.waitForSelector('h1:has-text("Final ranking")');
      await guest.waitForSelector('h1:has-text("Final ranking")');
      await shot(host, "04-final");
    });

    await step("5 catalog code field opens the room; late joiner refused; unknown code shows not found", async () => {
      const lateCtx = await browser.newContext();
      const late = await lateCtx.newPage();
      await late.goto(BASE + "/");
      await late.fill('input[aria-label="Room code"]', code.toLowerCase());
      await late.click('button:has-text("Join room")');
      await late.waitForURL(new RegExp(`/r/${code}$`));
      await late.waitForSelector('h1:has-text("Join room")');
      await late.fill('input[maxlength="20"]', "late");
      await late.click('button:has-text("Join")');
      await late.waitForSelector("text=already started");
      await late.goto(BASE + "/r/ZZZZZZ");
      await late.waitForSelector("text=Room not found or expired");
      await lateCtx.close();
    });
  } finally {
    await browser.close();
    server.kill();
    await sleep(500);
    if (server.exitCode === null) { try { process.kill(server.pid); } catch {} }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} phase 4 steps passed. Screenshots in ${SHOTS}`);
  if (/Error|error/.test(serverLog.replace(/ExperimentalWarning[^\n]*\n/g, ""))) console.log("server log had errors:\n" + serverLog);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
