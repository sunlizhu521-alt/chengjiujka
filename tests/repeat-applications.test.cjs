const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { test } = require("node:test");

const repoDir = path.resolve(__dirname, "..");
const cardType = "重复申请测试卡";
const querySecret = "repeat-application-test-only";
const secretHash = crypto.createHash("sha256").update(querySecret).digest("hex");
const histories = [
  ["待评审", "待评审", false, "2026-09-13"],
  ["已通过", "通过", true, "2026-09-13"],
  ["未通过", "不通过", true, "2026-09-13"],
  ["待修改", "待评审", false, "2026-09-13"],
  ["已过期", "通过", true, "2020-01-01"]
].map(([label, reviewStatus, resultPublished, applicationDate], index) => ({
  id: `history-${index}`,
  cardType,
  applicantName: `回归测试${label}`,
  department: "测试部门",
  position: "测试岗位",
  applicationDate,
  description: `原有${label}申请`,
  commitment: "我确认",
  submittedAt: `${applicationDate}T00:00:00.000Z`,
  reviewStatus,
  score: 0,
  reviewVotes: { 测试评审人: { status: "通过", comment: "保留原评审" } },
  reviewComment: "原评审意见",
  reviewDate: applicationDate,
  resultPublished,
  querySecretHash: secretHash,
  querySecretPlain: "",
  ...(label === "待修改" ? { changeRequest: { status: "requested", reason: "原修改要求" } } : {}),
  attachments: [{ filename: `history-${index}.txt`, originalName: "历史附件.txt", size: 0 }],
  feedbackFiles: [{ filename: `feedback-${index}.txt`, originalName: "评审附件.txt", size: 0 }]
}));

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test("同一人可以重复申请同一卡项，历史、权限及持久化不变", async (t) => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "chengjiujka-repeat-test-"));
  let child;
  t.after(async () => { await stop(); fs.rmSync(storageDir, { recursive: true, force: true }); });
  const dataDir = path.join(storageDir, "data");
  const uploadDir = path.join(storageDir, "uploads");
  fs.mkdirSync(dataDir);
  fs.mkdirSync(uploadDir);
  const names = [...histories.map((record) => record.applicantName), "首次测试人", "并发测试人"];
  writeJson(path.join(dataDir, "roster.json"), {
    employees: names.map((name) => ({ name, department: "测试部门", position: "测试岗位" })),
    departments: ["测试部门"], count: names.length
  });
  writeJson(path.join(dataDir, "users.json"), Object.fromEntries(names.map((name) => [name, {
    id: `test-${name}`, name, role: "user", secretHash,
    pageAccess: ["applicationPage", "progressQuery"], mustChangeSecret: false
  }])));
  writeJson(path.join(dataDir, "submissions.json"), histories);
  writeJson(path.join(dataDir, "card-config.json"), {
    [cardType]: { isOpen: true, definition: "重复申请回归测试", score: 10, cycle: "一年" },
    未开放测试卡: { isOpen: false, definition: "未开放" }
  });
  for (const record of histories) {
    fs.writeFileSync(path.join(uploadDir, record.attachments[0].filename), "");
    fs.writeFileSync(path.join(uploadDir, record.feedbackFiles[0].filename), "");
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let output = "";
  async function start() {
    child = spawn(process.execPath, [path.join(repoDir, "server.js")], {
      cwd: repoDir,
      env: { ...process.env, PORT: String(port), STORAGE_DIR: storageDir,
        ADMIN_TOKEN: "isolated-test-admin", ADMIN_PASSWORD: "isolated-test-password",
        SESSION_SECRET: "isolated-test-session", DINGTALK_WEBHOOK: "", DINGTALK_SECRET: "" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    for (let attempt = 0; attempt < 200; attempt++) {
      if (child.exitCode !== null) throw new Error(`测试服务退出：${output}`);
      try {
        if ((await fetch(`${base}/api/health`)).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`测试服务启动超时：${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
  }
  const stored = () => JSON.parse(fs.readFileSync(path.join(dataDir, "submissions.json"), "utf8"));
  const uploaded = () => fs.readdirSync(uploadDir).sort();
  async function submit(name, overrides = {}, headers = {}) {
    const data = new FormData();
    const fields = { cardType, applicantName: name, department: "测试部门", position: "测试岗位",
      applicationDate: "2026-09-13", description: "再次申请的独立材料", commitment: "我确认", ...overrides };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== null && value !== undefined) data.set(key, String(value));
    }
    data.append("attachments", new Blob(["本次附件"]), "evidence.txt");
    const response = await fetch(`${base}/api/submissions`, { method: "POST", headers, body: data });
    return { status: response.status, body: await response.json() };
  }
  async function query(name, secret = querySecret) {
    const response = await fetch(`${base}/api/results/query`, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ applicantName: name, querySecret: secret }) });
    assert.equal(response.status, 200);
    return (await response.json()).records;
  }
  await start();

  for (const history of histories) {
    await t.test(`${history.applicantName}可同日重复申请，历史与零分保留`, async () => {
      const first = await submit(` ${history.applicantName} `);
      const second = await submit(history.applicantName);
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      assert.notEqual(first.body.id, second.body.id);
      const records = stored();
      assert.deepEqual(records.find((record) => record.id === history.id), history);
      const fresh = records.filter((record) => record.applicantName === history.applicantName && record.id !== history.id);
      assert.equal(fresh.length, 2);
      for (const record of fresh) {
        assert.equal(record.reviewStatus, "待评审");
        assert.deepEqual(record.reviewVotes, {});
        assert.equal(record.resultPublished, false);
        assert.equal(record.score, "");
        assert.equal(record.querySecretHash, secretHash);
        assert.equal(record.attachments.length, 1);
        assert.equal(fs.readFileSync(path.join(uploadDir, record.attachments[0].filename), "utf8"), "本次附件");
      }
      assert.notEqual(fresh[0].attachments[0].filename, fresh[1].attachments[0].filename);
      for (const file of [...history.attachments, ...history.feedbackFiles]) {
        assert.equal(fs.statSync(path.join(uploadDir, file.filename)).size, 0);
      }
      assert.equal((await query(history.applicantName)).length, 3);
      assert.deepEqual(await query(history.applicantName, "错误秘钥"), []);
    });
  }

  await t.test("首次与跨期申请均生成新编号，并发重复申请不覆盖", async () => {
    assert.equal((await submit("首次测试人")).status, 201);
    assert.equal((await submit("首次测试人", { applicationDate: "2027-01-01" })).status, 201);
    const responses = await Promise.all(Array.from({ length: 4 }, () => submit("并发测试人")));
    assert.ok(responses.every((response) => response.status === 201));
    assert.equal(new Set(responses.map((response) => response.body.id)).size, 4);
    assert.equal(stored().filter((record) => record.applicantName === "并发测试人").length, 4);
  });

  await t.test("必填项空值、未开放卡与花名册限制仍生效，拒绝附件清理", async () => {
    const before = stored();
    const filesBefore = uploaded();
    for (const value of [null, "", "   "]) {
      const response = await submit("首次测试人", { commitment: value });
      assert.equal(response.status, 400);
    }
    for (const invalidCard of ["未开放测试卡", "已删除测试卡"]) {
      assert.equal((await submit("首次测试人", { cardType: invalidCard })).status, 400);
    }
    assert.equal((await submit("非花名册人员")).status, 400);
    assert.deepEqual(stored(), before);
    assert.deepEqual(uploaded(), filesBefore);
  });

  await t.test("可选联系方式空值与零值按原规则保存", async () => {
    for (const contact of [null, "", 0]) {
      const response = await submit("首次测试人", { contact });
      assert.equal(response.status, 201);
      assert.equal(stored().find((record) => record.id === response.body.id).contact, contact === 0 ? "0" : "");
    }
  });

  await t.test("登录姓名校验未放宽，合法登录者可重复申请", async () => {
    const login = await fetch(`${base}/api/auth/login`, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "首次测试人", secret: querySecret }) });
    const { token } = await login.json();
    assert.ok(token);
    const headers = { "x-review-token": token };
    const before = stored();
    const filesBefore = uploaded();
    assert.equal((await submit("并发测试人", {}, headers)).status, 403);
    assert.deepEqual(stored(), before);
    assert.deepEqual(uploaded(), filesBefore);
    assert.equal((await submit("首次测试人", {}, headers)).status, 201);
  });

  await t.test("重启后所有独立申请、编号与附件仍存在", async () => {
    const before = stored();
    const filesBefore = uploaded();
    await stop();
    await start();
    assert.deepEqual(stored(), before);
    assert.deepEqual(uploaded(), filesBefore);
    assert.equal(new Set(before.map((record) => record.id)).size, before.length);
    assert.equal((await query(histories[1].applicantName)).length, 3);
    assert.equal((await submit(histories[1].applicantName)).status, 201);
    assert.equal(stored().length, before.length + 1);
  });
});
