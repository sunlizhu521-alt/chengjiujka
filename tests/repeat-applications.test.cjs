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
  ["已过期", "通过", true, "2020-01-01"],
  ["通过未公示", "通过", false, "2026-09-13"]
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

// 冻结测试服务时间，覆盖准确到期日、月末顺延及北京时间边界。
const validitySpecs = [
  ["一年到期日仍有效", "2025-09-14", {}, true],
  ["一年到期次日已过期", "2025-09-13", {}, false],
  ["未满十三个完整月但已过准确到期日", "2025-08-15", {}, false],
  ["季度到期日仍有效", "2026-06-14", { cardType: "季度测试卡" }, true],
  ["季度到期次日已过期", "2026-06-13", { cardType: "季度测试卡" }, false],
  ["历史六个月到期日仍有效", "2026-03-14", { legacySource: { validMonths: 6 } }, true],
  ["历史六个月到期次日已过期", "2026-03-13", { legacySource: { validMonths: 6 } }, false],
  ["历史有效期优先", "2026-03-14", { cardType: "季度测试卡", legacySource: { validMonths: 6 } }, true],
  ["小蜜蜂月末半年到期前仍有效", "2026-03-31", { cardType: "小蜜蜂" }, true],
  ["零月数回退一年", "2025-09-14", { legacySource: { validMonths: 0 } }, true],
  ["空月数回退一年", "2025-09-14", { legacySource: { validMonths: null } }, true],
  ["异常月数回退一年", "2025-09-14", { legacySource: { validMonths: "invalid" } }, true],
  ["无评审日期回退申请日", "2026-09-13", { reviewDate: "" }, true],
  ["异常评审日期回退申请日", "2026-09-13", { reviewDate: "invalid" }, true],
  ["评审日期优先仍有效", "2020-01-01", { reviewDate: "2026-09-13" }, true],
  ["评审日期优先已过期", "2026-09-13", { reviewDate: "2020-01-01" }, false],
  ["无日期沿用榜单过期口径", "", { reviewDate: null }, false],
  ["两日期异常沿用过期口径", "invalid", { reviewDate: "invalid" }, false]
];
const boundaryHistories = validitySpecs.map(([label, date, overrides], index) => ({
  ...histories[1], id: `validity-${index}`, applicantName: `回归测试${label}`,
  applicationDate: date, reviewDate: date, ...overrides,
  attachments: [{ filename: `validity-${index}.txt`, originalName: "历史附件.txt", size: 0 }],
  feedbackFiles: []
}));
const blockedIds = new Set(["history-1", "history-5", ...validitySpecs.flatMap((spec, index) => spec[3] ? [`validity-${index}`] : [])]);
const mixedHistories = [
  { ...histories[2], id: "mixed-rejected", applicantName: "混合历史测试人" },
  { ...histories[4], id: "mixed-expired", applicantName: "混合历史测试人" },
  { ...histories[1], id: "mixed-active", applicantName: "混合历史测试人" }
];
const seededHistories = [...histories, ...boundaryHistories, ...mixedHistories];

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

test("仅通过且有效的同一卡项禁止重复申请，历史、权限及持久化不变", async (t) => {
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "chengjiujka-repeat-test-"));
  let child;
  t.after(async () => { await stop(); fs.rmSync(storageDir, { recursive: true, force: true }); });
  const dataDir = path.join(storageDir, "data");
  const uploadDir = path.join(storageDir, "uploads");
  fs.mkdirSync(dataDir);
  fs.mkdirSync(uploadDir);
  const names = [...new Set(seededHistories.map((record) => record.applicantName)), "首次测试人", "并发测试人"];
  writeJson(path.join(dataDir, "roster.json"), {
    employees: names.map((name) => ({ name, department: "测试部门", position: "测试岗位" })),
    departments: ["测试部门"], count: names.length
  });
  writeJson(path.join(dataDir, "users.json"), Object.fromEntries(names.map((name) => [name, {
    id: `test-${name}`, name, role: "user", secretHash,
    pageAccess: ["applicationPage", "progressQuery"], mustChangeSecret: false
  }])));
  writeJson(path.join(dataDir, "submissions.json"), seededHistories);
  writeJson(path.join(dataDir, "card-config.json"), {
    [cardType]: { isOpen: true, definition: "重复申请回归测试", score: 10, cycle: "一年" },
    季度测试卡: { isOpen: true, definition: "季度回归测试", score: 10, cycle: "一季度" },
    小蜜蜂: { isOpen: true, definition: "小蜜蜂固定半年回归测试", score: 10, cycle: "一年" },
    未开放测试卡: { isOpen: false, definition: "未开放" }
  });
  for (const record of seededHistories) {
    for (const file of [...record.attachments, ...record.feedbackFiles]) {
      fs.writeFileSync(path.join(uploadDir, file.filename), "");
    }
  }
  const clockFile = path.join(storageDir, "test-clock.cjs");
  fs.writeFileSync(clockFile, `const OriginalDate = Date; const fixed = OriginalDate.parse("2026-09-13T16:30:00Z"); global.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };`);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let output = "";
  async function start() {
    child = spawn(process.execPath, ["--require", clockFile, path.join(repoDir, "server.js")], {
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
  async function waitForUploads(expected) {
    // 被拒绝的上传文件异步删除，等待文件系统完成以保持验收确定性。
    for (let attempt = 0; attempt < 100 && JSON.stringify(uploaded()) !== JSON.stringify(expected); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(uploaded(), expected);
  }
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

  for (const history of [...histories, ...boundaryHistories]) {
    if (blockedIds.has(history.id)) {
      await t.test(`${history.applicantName}禁止重复申请，拒绝附件清理`, async () => {
        const before = stored();
        const filesBefore = uploaded();
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await submit(` ${history.applicantName} `, { cardType: history.cardType });
          assert.equal(response.status, 409);
          assert.match(response.body.message, /仍在有效期内/);
        }
        assert.deepEqual(stored(), before);
        await waitForUploads(filesBefore);
        if (history.resultPublished) {
          const groups = await (await fetch(`${base}/api/public/passed`)).json();
          assert.ok(groups.active.some((record) => record.applicantName === history.applicantName));
        }
      });
      continue;
    }
    await t.test(`${history.applicantName}可重复申请，历史与零分保留`, async () => {
      const first = await submit(` ${history.applicantName} `, { cardType: history.cardType });
      const second = await submit(history.applicantName, { cardType: history.cardType });
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
      if (history.reviewStatus === "通过" && history.resultPublished) {
        const groups = await (await fetch(`${base}/api/public/passed`)).json();
        assert.ok(groups.expired.some((record) => record.applicantName === history.applicantName));
      }
    });
  }

  await t.test("有驳回/过期历史但同时有有效通过卡仍拦截，并发也不能绕过", async () => {
    const before = stored();
    const filesBefore = uploaded();
    const responses = await Promise.all(Array.from({ length: 4 }, () => submit("混合历史测试人")));
    assert.ok(responses.every((response) => response.status === 409));
    assert.deepEqual(stored(), before);
    await waitForUploads(filesBefore);
  });

  await t.test("持有有效卡不影响申请其他卡项或其他人员申请", async () => {
    assert.equal((await submit(histories[1].applicantName, { cardType: "季度测试卡" })).status, 201);
    assert.equal((await submit("并发测试人")).status, 201);
  });

  await t.test("首次与跨期申请均生成新编号，并发重复申请不覆盖", async () => {
    assert.equal((await submit("首次测试人")).status, 201);
    assert.equal((await submit("首次测试人", { applicationDate: "2027-01-01" })).status, 201);
    const responses = await Promise.all(Array.from({ length: 4 }, () => submit("并发测试人")));
    assert.ok(responses.every((response) => response.status === 201));
    assert.equal(new Set(responses.map((response) => response.body.id)).size, 4);
    assert.equal(stored().filter((record) => record.applicantName === "并发测试人").length, 5);
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
    await waitForUploads(filesBefore);
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
    await waitForUploads(filesBefore);
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
    assert.equal((await query(histories[2].applicantName)).length, 3);
    assert.equal((await submit(histories[1].applicantName)).status, 409);
    assert.equal((await submit(histories[2].applicantName)).status, 201);
    assert.equal(stored().length, before.length + 1);
  });

  await t.test("北京时间跨过有效期边界后即可申请，原记录不被覆盖", async () => {
    const history = boundaryHistories[0];
    const smallBeeHistory = boundaryHistories.find((record) => record.cardType === "小蜜蜂");
    assert.equal((await submit(history.applicantName)).status, 409);
    await stop();
    fs.writeFileSync(clockFile, `const OriginalDate = Date; const fixed = OriginalDate.parse("2026-09-30T16:30:00Z"); global.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [fixed])); } static now() { return fixed; } };`);
    await start();
    const groups = await (await fetch(`${base}/api/public/passed`)).json();
    assert.ok(groups.expired.some((record) => record.applicantName === history.applicantName));
    assert.ok(groups.expired.some((record) => record.applicantName === smallBeeHistory.applicantName));
    const response = await submit(history.applicantName);
    assert.equal(response.status, 201);
    assert.equal((await submit(smallBeeHistory.applicantName, { cardType: "小蜜蜂" })).status, 201);
    assert.deepEqual(stored().find((record) => record.id === history.id), history);
    assert.notEqual(response.body.id, history.id);
  });
});
