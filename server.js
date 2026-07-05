const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const xlsx = require("xlsx");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "3.1415926";
const SESSION_SECRET = process.env.SESSION_SECRET || `${ADMIN_TOKEN}-chengjiuka-session`;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const rootDir = __dirname;
const publicDir = path.join(rootDir, "docs");
const storageRoot = process.env.STORAGE_DIR || "D:\\BI文件\\成就值卡\\github-文件库";
const dataDir = path.join(storageRoot, "data");
const uploadDir = path.join(storageRoot, "uploads");
const submissionsFile = path.join(dataDir, "submissions.json");
const usersFile = path.join(dataDir, "users.json");
const cardConfigFile = path.join(dataDir, "card-config.json");
const rosterFile = path.join(dataDir, "roster.json");
const coinRecordsFile = path.join(dataDir, "coin-records.json");
const deletedUsersFile = path.join(dataDir, "deleted-users.json");
const dingtalkConfigFile = path.join(dataDir, "dingtalk-config.json");
const backupDir = path.join(dataDir, "backups");
const latestBackupFile = path.join(backupDir, "latest-backup.json");
const jsonFileCache = new Map();
const computedCache = {
  publicPassed: null
};

const adminName = "孙立柱";
const reviewerNames = ["王斌", "惠李伟", "蒋炳兰", "任蒨"];
const reviewMemberNames = [adminName, ...reviewerNames];
const reviewStatuses = new Set(["通过", "不通过"]);
const userRoleName = "user";
const pagePermissions = [
  { key: "applicationPage", label: "申请页面" },
  { key: "passed", label: "成就卡榜单" },
  { key: "reviewPage", label: "评审页面" },
  { key: "permissionManagement", label: "权限管理" },
  { key: "resultSummary", label: "结果汇总" },
  { key: "infoConfig", label: "信息配置" },
  { key: "fileMaintenance", label: "文件维护" },
  { key: "backupCenter", label: "备份中心" },
  { key: "coinManagement", label: "成就币管理" }
];
const pagePermissionKeys = pagePermissions.map((item) => item.key);
const legacyPageKeyMap = {
  reviewDesk: "reviewPage",
  summary: "resultSummary",
  cardConfig: "infoConfig"
};
const defaultReviewerAccess = ["applicationPage", "reviewPage"];
const defaultApplicantAccess = ["applicationPage", "passed"];

function loadDefaultCardDetails() {
  const raw = fs.readFileSync(path.join(publicDir, "card-data.js"), "utf8");
  const m = raw.match(/window\.CHENGJIUKA_CARD_DETAILS\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) return {};
  return new Function("return " + m[1])();
}

function normalizeRuleList(rules) {
  if (Array.isArray(rules)) {
    return rules.map((rule) => String(rule || "").trim()).filter(Boolean);
  }
  return String(rules || "")
    .split(/\r?\n/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

function normalizeScore(score) {
  if (score === "" || score === undefined || score === null) return "";
  const numericScore = Number(score);
  return Number.isFinite(numericScore) ? numericScore : "";
}

function normalizeCardDetails(details = {}) {
  return Object.fromEntries(
    Object.entries(details).map(([name, detail = {}]) => {
      const definition = String(detail.definition || "").trim();
      const hasExplicitOpenState = Object.prototype.hasOwnProperty.call(detail, "isOpen");
      return [
        name,
        {
          isOpen: hasExplicitOpenState ? Boolean(detail.isOpen) : Boolean(definition),
          definition,
          applicationRules: normalizeRuleList(detail.applicationRules),
          cycle: String(detail.cycle || "").trim(),
          score: normalizeScore(detail.score),
          reviewRules: normalizeRuleList(detail.reviewRules),
          sources: String(detail.sources || "").trim()
        }
      ];
    })
  );
}

function loadStoredCardDetails() {
  if (!fs.existsSync(cardConfigFile)) return null;
  return normalizeCardDetails(readJsonCached(cardConfigFile, {}));
}

function buildCardConfig(details) {
  return {
    scores: Object.fromEntries(Object.entries(details).filter(([, d]) => d.score).map(([k, d]) => [k, Number(d.score)])),
    cycles: Object.fromEntries(Object.entries(details).filter(([, d]) => d.cycle).map(([k, d]) => [k, d.cycle])),
    openTypes: new Set(Object.keys(details).filter((k) => details[k].isOpen))
  };
}
const fallbackCardTypes = new Set(["奋斗者", "分享达人", "业绩之王", "文化先锋", "最美工位"]);
const fallbackCardScores = { 奋斗者: 10, 分享达人: 10, 业绩之王: 10, 文化先锋: 10, 最美工位: 5 };
const fallbackCardCycles = { 奋斗者: "一年", 分享达人: "一年", 业绩之王: "一季度", 文化先锋: "一年", 最美工位: "一季度" };
const legacyCardScores = {
  超级新星: 5,
  创新达人: 5,
  服务之星: 5,
  沟通达人: 5,
  技术大牛: 7,
  教练员: 5,
  金主: 10,
  经营标杆: 7,
  卷王: 10,
  控费能手: 5,
  六边形战士: 7,
  魅力领袖: 7,
  目标达人: 5,
  数据精英: 5,
  文化达人: 5,
  问题终结者: 7,
  细节达人: 5,
  项目达人: 5,
  小蜜蜂: 5,
  效率达人: 5,
  协作达人: 5,
  学习先锋: 5,
  运动达人: 5,
  主人翁: 10,
  AI达人: 5,
  Balance大师: 5
};
const defaultCardDetails = normalizeCardDetails(loadDefaultCardDetails());
let activeCardDetails = loadStoredCardDetails() || defaultCardDetails;
let cardConfig = buildCardConfig(activeCardDetails);
let cardTypes = Object.keys(activeCardDetails).length ? cardConfig.openTypes : fallbackCardTypes;
let cardScores = Object.keys(cardConfig.scores).length ? cardConfig.scores : fallbackCardScores;
let cardCycles = Object.keys(cardConfig.cycles).length ? cardConfig.cycles : fallbackCardCycles;

function refreshCardRuntime(details) {
  activeCardDetails = normalizeCardDetails(details);
  cardConfig = buildCardConfig(activeCardDetails);
  cardTypes = Object.keys(activeCardDetails).length ? cardConfig.openTypes : fallbackCardTypes;
  cardScores = Object.keys(cardConfig.scores).length ? cardConfig.scores : fallbackCardScores;
  cardCycles = Object.keys(cardConfig.cycles).length ? cardConfig.cycles : fallbackCardCycles;
}

function writeCardDetails(details) {
  const normalized = normalizeCardDetails(details);
  writeJsonAtomic(cardConfigFile, normalized);
  refreshCardRuntime(normalized);
  return normalized;
}

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

if (!fs.existsSync(submissionsFile)) {
  fs.writeFileSync(submissionsFile, "[]", "utf8");
}

if (!fs.existsSync(coinRecordsFile)) {
  fs.writeFileSync(coinRecordsFile, "[]", "utf8");
}

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN === "*" ? origin : ALLOWED_ORIGIN);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token, x-review-token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false
  })
);
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));

app.use(express.json());
app.use(express.static(publicDir));

function normalizeOriginalName(name) {
  const rawName = String(name || "");
  const decodedName = Buffer.from(rawName, "latin1").toString("utf8");
  const replacementCount = (decodedName.match(/\uFFFD/g) || []).length;
  const looksMojibake = /[\u0080-\u00FF]/.test(rawName);

  if (decodedName && replacementCount === 0 && looksMojibake) {
    return decodedName;
  }

  return rawName;
}

function readDingTalkRuntimeConfig() {
  const envWebhook = String(process.env.DINGTALK_WEBHOOK || "").trim();
  const envSecret = String(process.env.DINGTALK_SECRET || "").trim();
  if (envWebhook) {
    return { webhook: envWebhook, secret: envSecret };
  }

  try {
    const config = readJsonCached(dingtalkConfigFile, {});
    return {
      webhook: String(config.webhook || "").trim(),
      secret: String(config.secret || "").trim()
    };
  } catch {
    return { webhook: "", secret: "" };
  }
}

function dingtalkSignedUrl(webhook, secret) {
  if (!secret) return webhook;
  const timestamp = Date.now();
  const signSource = `${timestamp}\n${secret}`;
  const sign = crypto.createHmac("sha256", secret).update(signSource).digest("base64");
  const separator = webhook.includes("?") ? "&" : "?";
  return `${webhook}${separator}timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
}

function dingtalkActor(lines = []) {
  const actorLabels = ["操作人", "评审人", "申报人", "姓名"];
  for (const label of actorLabels) {
    const line = lines.find((item) => String(item || "").trim().startsWith(`${label}：`));
    if (line) return String(line).split("：").slice(1).join("：").trim();
  }
  return "系统";
}

function dingtalkActionText(action) {
  const actionTextMap = {
    新用户注册: "注册了账号",
    用户权限已调整: "调整了用户权限",
    用户登录密码已重置: "重置了用户登录密码",
    用户账号已删除: "删除了用户账号",
    批量删除用户账号: "批量删除了用户账号",
    提交成就卡申请: "提交了成就卡申请",
    新增成就币记录: "新增了成就币记录",
    删除成就币记录: "删除了成就币记录",
    提交评审意见: "提交了评审意见",
    上传评审组反馈文件: "上传了评审组反馈文件",
    重置查询秘钥: "重置了查询秘钥",
    确认展示评审结果: "确认展示了评审结果",
    取消展示评审结果: "取消展示了评审结果",
    批量删除申请记录: "批量删除了申请记录",
    删除申请记录: "删除了申请记录"
  };
  return actionTextMap[action] || action;
}

function dingtalkSummary(action, lines = []) {
  return `${dingtalkActor(lines)} ${dingtalkActionText(action)}`;
}

function dingtalkMarkdown(action, lines = []) {
  const safeLines = lines.map((line) => String(line || "").trim()).filter(Boolean);
  return [`### 成就卡系统提醒`, `**${dingtalkSummary(action, safeLines)}**`, ...safeLines].join("\n\n");
}

async function sendDingTalkNotice(action, lines = []) {
  const { webhook, secret } = readDingTalkRuntimeConfig();
  if (!webhook) return;

  const title = `成就卡系统提醒：${dingtalkSummary(action, lines)}`;
  const text = dingtalkMarkdown(action, lines);
  const response = await fetch(dingtalkSignedUrl(webhook, secret), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      msgtype: "markdown",
      markdown: { title, text }
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`钉钉通知发送失败：${response.status} ${body}`);
  }
}

function notifyDingTalk(action, lines = []) {
  setImmediate(() => {
    sendDingTalkNotice(action, lines).catch((error) => {
      console.error(error.message || "钉钉通知发送失败");
    });
  });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const originalName = normalizeOriginalName(file.originalname);
    const ext = path.extname(originalName);
    const safeBase = path
      .basename(originalName, ext)
      .replace(/[^\w\u4e00-\u9fa5-]+/g, "_")
      .slice(0, 60);
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
    cb(null, `${unique}-${safeBase}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 10
  }
});

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function hmac(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}

function hashSecret(secret) {
  return crypto.createHash("sha256").update(String(secret || "")).digest("hex");
}

function createSession(user) {
  const payload = base64Url(
    JSON.stringify({
      name: user.name,
      role: user.role,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7
    })
  );
  return `${payload}.${hmac(payload)}`;
}

function createUserId() {
  return `u-${crypto.randomBytes(8).toString("hex")}`;
}

function isAdminUser(user) {
  return user && (user.name === adminName || user.role === "admin");
}

function normalizePageAccess(user) {
  if (isAdminUser(user)) return pagePermissionKeys;
  const source = Array.isArray(user.pageAccess)
    ? user.pageAccess
    : user.role === "reviewer"
      ? defaultReviewerAccess
      : defaultApplicantAccess;
  const normalized = source.map((key) => legacyPageKeyMap[key] || key);
  const withRoleDefaults = user.role === userRoleName ? [...defaultApplicantAccess, ...normalized] : normalized;
  return [...new Set(withRoleDefaults.filter((key) => pagePermissionKeys.includes(key)))];
}

function hasPageAccess(user, ...pages) {
  if (isAdminUser(user)) return true;
  const access = normalizePageAccess(user);
  return pages.some((page) => access.includes(page));
}

function verifySession(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || hmac(payload) !== signature) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    const users = readUsers();
    const user = users[data.name];
    if (!user || user.role !== data.role) return null;
    return {
      name: user.name,
      role: user.role,
      pageAccess: normalizePageAccess(user),
      canUploadFeedback: user.name === adminName
    };
  } catch {
    return null;
  }
}

function defaultUsers() {
  return {
    [adminName]: {
      id: "u-admin",
      name: adminName,
      role: "admin",
      pageAccess: pagePermissionKeys,
      secretHash: hashSecret(process.env.ADMIN_PASSWORD || "521sunlizhu"),
      mustChangeSecret: false
    },
    ...Object.fromEntries(
      reviewerNames.map((name, index) => [
        name,
        {
          name,
          id: `u-reviewer-${index + 1}`,
          role: "reviewer",
          pageAccess: defaultReviewerAccess,
          secretHash: "",
          mustChangeSecret: true
        }
      ])
    )
  };
}

function readDeletedUsers() {
  if (!fs.existsSync(deletedUsersFile)) return [];
  try {
    const names = readJsonCached(deletedUsersFile, []);
    return Array.isArray(names) ? names : [];
  } catch {
    return [];
  }
}

function writeDeletedUsers(names) {
  writeJsonAtomic(deletedUsersFile, [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))]);
}

function addSubmissionApplicantsToUsers(users) {
  if (!fs.existsSync(submissionsFile)) return false;

  let changed = false;
  try {
    const records = readSubmissions();
    const deletedUsers = new Set(readDeletedUsers());
    records.forEach((record) => {
      const name = String(record.applicantName || "").trim();
      if (!name || users[name] || deletedUsers.has(name)) return;
      users[name] = {
        id: createUserId(),
        name,
        role: userRoleName,
        pageAccess: defaultApplicantAccess,
        secretHash: "",
        mustChangeSecret: false,
        createdAt: record.submittedAt || new Date().toISOString(),
        source: "submission"
      };
      changed = true;
    });
  } catch {
    return changed;
  }

  return changed;
}

function buildUserStats(submissions = readSubmissions()) {
  return submissions.reduce((stats, record) => {
    const name = String(record.applicantName || "").trim();
    if (!name) return stats;
    const current = stats.get(name) || { submitted: 0, passed: 0 };
    current.submitted += 1;
    if (record.reviewStatus === "通过") current.passed += 1;
    stats.set(name, current);
    return stats;
  }, new Map());
}

function publicPermissionUsers(users, submissions = readSubmissions()) {
  const stats = buildUserStats(submissions);
  return Object.values(users).map((user) => ({
    id: user.id,
    name: user.name,
    role: user.role,
    pageAccess: normalizePageAccess(user),
    mustChangeSecret: Boolean(user.mustChangeSecret),
    createdAt: user.createdAt || "",
    updatedAt: user.updatedAt || "",
    stats: stats.get(user.name) || { submitted: 0, passed: 0 }
  }));
}

function readUsers() {
  let users = {};
  if (fs.existsSync(usersFile)) {
    users = readJsonCached(usersFile, {});
  }

  const defaults = defaultUsers();
  let changed = false;
  Object.entries(defaults).forEach(([name, user]) => {
    if (!users[name]) {
      users[name] = user;
      changed = true;
      return;
    }
    if (!users[name].name) users[name].name = name;
    if (!users[name].role) users[name].role = user.role;
    if (!users[name].id) {
      users[name].id = user.id || createUserId();
      changed = true;
    }
    const normalizedAccess = normalizePageAccess(users[name]);
    if (JSON.stringify(users[name].pageAccess || []) !== JSON.stringify(normalizedAccess)) {
      users[name].pageAccess = normalizedAccess;
      changed = true;
    }
    if (name === adminName && (users[name].secretHash !== user.secretHash || users[name].mustChangeSecret)) {
      users[name].secretHash = user.secretHash;
      users[name].mustChangeSecret = false;
      users[name].pageAccess = pagePermissionKeys;
      changed = true;
    }
  });

  if (addSubmissionApplicantsToUsers(users)) {
    changed = true;
  }

  Object.entries(users).forEach(([name, user]) => {
    if (!user.name) {
      user.name = name;
      changed = true;
    }
    if (!user.id) {
      user.id = createUserId();
      changed = true;
    }
    if (!user.role) {
      user.role = userRoleName;
      changed = true;
    }
    const normalizedAccess = normalizePageAccess(user);
    if (JSON.stringify(user.pageAccess || []) !== JSON.stringify(normalizedAccess)) {
      user.pageAccess = normalizedAccess;
      changed = true;
    }
  });

  if (changed || !fs.existsSync(usersFile)) {
    writeUsers(users);
  }

  return users;
}

function writeUsers(users) {
  writeJsonAtomic(usersFile, users);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    pageAccess: normalizePageAccess(user),
    canUploadFeedback: user.name === adminName
  };
}

function readSubmissions() {
  return readJsonCached(submissionsFile, []);
}

function writeSubmissions(records) {
  writeJsonAtomic(submissionsFile, records);
}

function readCoinRecords() {
  return readJsonCached(coinRecordsFile, []);
}

function writeCoinRecords(records) {
  writeJsonAtomic(coinRecordsFile, records);
}

function writeJsonAtomic(file, value) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
  updateJsonCache(file, value);
  invalidateComputedCaches();
}

function readJsonCached(file, fallbackValue) {
  if (!fs.existsSync(file)) return fallbackValue;
  const stat = fs.statSync(file);
  const cached = jsonFileCache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.value;
  }

  const content = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const value = content ? JSON.parse(content) : fallbackValue;
  jsonFileCache.set(file, {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    value
  });
  return value;
}

function updateJsonCache(file, value) {
  try {
    const stat = fs.statSync(file);
    jsonFileCache.set(file, {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      value
    });
  } catch {
    jsonFileCache.delete(file);
  }
}

function invalidateComputedCaches() {
  computedCache.publicPassed = null;
}

function dataBackupSources() {
  return [
    submissionsFile,
    usersFile,
    cardConfigFile,
    rosterFile,
    coinRecordsFile,
    deletedUsersFile,
    dingtalkConfigFile
  ];
}

function createLatestBackup(options = {}) {
  fs.mkdirSync(backupDir, { recursive: true });
  const files = {};
  const fileStats = [];

  dataBackupSources().forEach((file) => {
    if (!fs.existsSync(file)) return;
    const name = path.basename(file);
    const stat = fs.statSync(file);
    const content = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    try {
      files[name] = content ? JSON.parse(content) : null;
    } catch {
      files[name] = content;
    }
    fileStats.push({
      name,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    });
  });

  const snapshot = {
    version: 1,
    generatedAt: new Date().toISOString(),
    reason: options.reason || "scheduled",
    actorName: options.actorName || "",
    fileCount: fileStats.length,
    files,
    fileStats
  };
  writeJsonAtomic(latestBackupFile, snapshot);
  return readLatestBackupStatus();
}

function readLatestBackupStatus() {
  if (!fs.existsSync(latestBackupFile)) {
    return {
      exists: false,
      generatedAt: "",
      reason: "",
      actorName: "",
      fileCount: 0,
      size: 0,
      files: []
    };
  }

  const stat = fs.statSync(latestBackupFile);
  let backup = {};
  try {
    backup = readJsonCached(latestBackupFile, {});
  } catch {
    backup = {};
  }
  return {
    exists: true,
    generatedAt: backup.generatedAt || stat.mtime.toISOString(),
    reason: backup.reason || "",
    actorName: backup.actorName || "",
    fileCount: Number(backup.fileCount || 0),
    size: stat.size,
    files: Array.isArray(backup.fileStats) ? backup.fileStats : []
  };
}

function delayUntilNextChinaMidnight() {
  const dayMs = 24 * 60 * 60 * 1000;
  const chinaOffsetMs = 8 * 60 * 60 * 1000;
  const chinaNow = Date.now() + chinaOffsetMs;
  const nextMidnight = Math.floor(chinaNow / dayMs) * dayMs + dayMs;
  return Math.max(1000, nextMidnight - chinaNow);
}

function scheduleDailyLatestBackup() {
  setTimeout(() => {
    try {
      createLatestBackup({ reason: "scheduled" });
    } catch (err) {
      console.error("daily backup failed:", err.message);
    }
    scheduleDailyLatestBackup();
  }, delayUntilNextChinaMidnight());
}

function normalizeRosterText(value) {
  return String(value || "").trim();
}

function normalizeRosterRows(rows = []) {
  const employeesByName = new Map();

  rows.forEach((row) => {
    const name = normalizeRosterText(row["姓名"] || row.name || row["员工姓名"]);
    const department = normalizeRosterText(row["一级部门"] || row["所属部门"] || row["部门"] || row.department);
    const position = normalizeRosterText(row["二级部门"] || row["岗位"] || row.position);
    if (!name || !department) return;
    employeesByName.set(name, { name, department, position });
  });

  const employees = Array.from(employeesByName.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const departments = [...new Set(employees.map((item) => item.department))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));

  return {
    updatedAt: new Date().toISOString(),
    count: employees.length,
    departments,
    employees
  };
}

function parseRosterWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("花名册文件没有可读取的工作表。");
  }

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    defval: "",
    raw: false
  });
  return normalizeRosterRows(rows);
}

function readRoster() {
  if (!fs.existsSync(rosterFile)) {
    return { updatedAt: "", count: 0, departments: [], employees: [] };
  }

  const roster = readJsonCached(rosterFile, {});
  return {
    updatedAt: roster.updatedAt || "",
    count: Number(roster.count || 0),
    departments: Array.isArray(roster.departments) ? roster.departments : [],
    employees: Array.isArray(roster.employees)
      ? roster.employees.map((employee) => ({
          name: normalizeRosterText(employee.name),
          department: normalizeRosterText(employee.department),
          position: normalizeRosterText(employee.position)
        }))
      : []
  };
}

function findRosterEmployee(name) {
  const applicantName = normalizeRosterText(name);
  if (!applicantName) return null;
  return readRoster().employees.find((employee) => employee.name === applicantName) || null;
}

function writeRoster(roster) {
  const normalized = {
    updatedAt: roster.updatedAt || new Date().toISOString(),
    count: Number(roster.count || 0),
    departments: Array.isArray(roster.departments) ? roster.departments : [],
    employees: Array.isArray(roster.employees)
      ? roster.employees.map((employee) => ({
          name: normalizeRosterText(employee.name),
          department: normalizeRosterText(employee.department),
          position: normalizeRosterText(employee.position)
        }))
      : []
  };
  writeJsonAtomic(rosterFile, normalized);
  return normalized;
}

function normalizeImportText(value) {
  return String(value ?? "").trim();
}

function normalizeImportDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = normalizeImportText(value).replace(/\./g, "/").replace(/-/g, "/");
  const match = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function createImportId(prefix, parts) {
  const source = parts.map(normalizeImportText).join("|");
  return `${prefix}-${crypto.createHash("sha1").update(source).digest("hex").slice(0, 18)}`;
}

function compactChinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${valueByType.year}${valueByType.month}${valueByType.day}`;
}

function createSubmissionId(records, date = new Date()) {
  const prefix = compactChinaDate(date);
  const maxSequence = records.reduce((max, record) => {
    const id = String(record.id || "");
    const match = id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (!match) return max;
    return Math.max(max, Number(match[1] || 0));
  }, 0);
  return `${prefix}${String(maxSequence + 1).padStart(3, "0")}`;
}

function importReviewStatus(row = {}) {
  const status = normalizeImportText(row["通过情况"] || row["二次评审结果"] || row.reviewStatus);
  if (status.includes("不通过") || status.includes("驳回")) return "不通过";
  if (status.includes("补")) return "需补资料";
  if (status.includes("通过")) return "通过";
  return "待评审";
}

function buildImportDescription(row = {}) {
  const sections = [
    ["申请理由", row["申请理由"] || row.description],
    ["推荐人", row["推荐人"]],
    ["推荐理由", row["推荐理由"]],
    ["补充说明", row["补充说明"]],
    ["二次评审结果", row["二次评审结果"]]
  ];
  return sections
    .map(([label, value]) => {
      const content = normalizeImportText(value);
      return content ? `${label}：${content}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

function loadImportCardMeta(filePath) {
  const meta = new Map();
  if (!filePath || !fs.existsSync(filePath)) return meta;

  const workbook = xlsx.readFile(filePath, { cellDates: true });
  workbook.SheetNames.forEach((sheetName) => {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
    rows.forEach((row) => {
      const cardName = normalizeImportText(row["成就卡名称"] || row.cardType);
      if (!cardName || meta.has(cardName)) return;
      meta.set(cardName, {
        category: normalizeImportText(row["成就卡类型"] || row.category),
        score: normalizeImportText(row["成就值"] || row["分值"] || row.score),
        validMonths: normalizeImportText(row["成就卡有效期（月）"] || row.validMonths)
      });
    });
  });
  return meta;
}

function normalizeImportedJsonRecord(record = {}) {
  const cardType = normalizeImportText(record.cardType || record["成就卡名称"]);
  const applicantName = normalizeImportText(record.applicantName || record["姓名"]);
  if (!cardType || !applicantName) return null;

  const reviewStatus = importReviewStatus(record);
  const applicationDate = normalizeImportDate(record.applicationDate || record["申请日期"]);
  return {
    ...record,
    id: record.id || createImportId("json", [applicantName, cardType, applicationDate, record.submittedAt]),
    cardType,
    applicantName,
    department: normalizeImportText(record.department || record["部门"]),
    position: normalizeImportText(record.position || record["岗位"]),
    contact: normalizeImportText(record.contact || record["联系方式"]),
    applicationDate,
    description: normalizeImportText(record.description) || buildImportDescription(record) || "历史数据导入",
    querySecretHash: record.querySecretHash || "",
    querySecretPlain: record.querySecretPlain || "",
    querySecretInherited: Boolean(record.querySecretInherited),
    commitment: record.commitment || "历史数据导入",
    submittedAt: record.submittedAt || (applicationDate ? `${applicationDate}T00:00:00.000Z` : new Date().toISOString()),
    reviewStatus,
    score: reviewStatus === "通过" ? scoreForCardType(cardType, record.score) : "",
    reviewComment: record.reviewComment || "",
    reviewer: record.reviewer || "历史数据导入",
    reviewDate: record.reviewDate || (reviewStatus === "待评审" ? "" : applicationDate),
    reviewVotes: record.reviewVotes || {},
    reviewSummary: record.reviewSummary || {},
    finalPublicComment: record.finalPublicComment || record.reviewComment || "历史数据导入",
    resultPublished: Boolean(record.resultPublished || reviewStatus === "通过"),
    resultPublishedAt: record.resultPublishedAt || (reviewStatus === "通过" ? new Date().toISOString() : ""),
    resultPublishedBy: record.resultPublishedBy || (reviewStatus === "通过" ? "历史数据导入" : ""),
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    feedbackFiles: Array.isArray(record.feedbackFiles) ? record.feedbackFiles : []
  };
}

function normalizeImportedExcelRecord(row = {}, rowNumber, cardMeta) {
  const applicantName = normalizeImportText(row["姓名"] || row.applicantName);
  const cardType = normalizeImportText(row["成就卡名称"] || row.cardType);
  if (!applicantName || !cardType) return null;

  const applicationDate = normalizeImportDate(row["申请日期"] || row.applicationDate);
  const reviewStatus = importReviewStatus(row);
  const meta = cardMeta.get(cardType) || {};
  const reviewComment = [row["补充说明"], row["二次评审结果"]].map(normalizeImportText).filter(Boolean).join("\n");
  const score = scoreForCardType(cardType, normalizeImportText(row["成就值"] || row["分值"] || meta.score));

  return {
    id: createImportId("excel", [rowNumber, applicantName, cardType, applicationDate, row["申请理由"]]),
    cardType,
    applicantName,
    department: normalizeImportText(row["部门"] || row.department),
    position: normalizeImportText(row["岗位"] || row.position),
    contact: normalizeImportText(row["联系方式"] || row.contact),
    applicationDate,
    description: buildImportDescription(row) || "历史数据导入",
    querySecretHash: "",
    querySecretPlain: "",
    querySecretInherited: false,
    commitment: "历史数据导入",
    submittedAt: applicationDate ? `${applicationDate}T00:00:00.000Z` : new Date().toISOString(),
    reviewStatus,
    score: reviewStatus === "通过" ? score : "",
    reviewComment,
    reviewer: "历史数据导入",
    reviewDate: reviewStatus === "待评审" ? "" : applicationDate,
    reviewVotes: {},
    reviewSummary: {},
    finalPublicComment: reviewComment || "历史数据导入",
    resultPublished: reviewStatus === "通过",
    resultPublishedAt: reviewStatus === "通过" ? new Date().toISOString() : "",
    resultPublishedBy: reviewStatus === "通过" ? "历史数据导入" : "",
    attachments: [],
    feedbackFiles: [],
    legacySource: {
      type: "excel-upload",
      rowNumber,
      cardCategory: normalizeImportText(row["成就卡类别"] || meta.category),
      validMonths: normalizeImportText(row["成就卡有效期（月）"] || meta.validMonths)
    }
  };
}

function parseHistoryImportFiles(historyFile, cardDimFile) {
  const ext = path.extname(historyFile.originalname || historyFile.filename).toLowerCase();
  if (ext === ".json") {
    const payload = JSON.parse(fs.readFileSync(historyFile.path, "utf8").replace(/^\uFEFF/, "") || "[]");
    const records = Array.isArray(payload) ? payload : Array.isArray(payload.records) ? payload.records : [];
    return records.map(normalizeImportedJsonRecord).filter(Boolean);
  }

  if (![".xlsx", ".xls", ".csv"].includes(ext)) {
    throw new Error("历史数据仅支持 .json、.xlsx、.xls、.csv 文件。");
  }

  const cardMeta = loadImportCardMeta(cardDimFile?.path);
  const workbook = xlsx.readFile(historyFile.path, { cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => name.includes("申请")) || workbook.SheetNames[0];
  if (!sheetName) throw new Error("历史数据文件没有可读取的工作表。");
  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
  return rows.map((row, index) => normalizeImportedExcelRecord(row, index + 2, cardMeta)).filter(Boolean);
}

function mergeImportedSubmissions(importedRecords) {
  const records = readSubmissions();
  const existingIds = new Set(records.map((record) => record.id));
  const existingFingerprints = new Set(
    records.map((record) =>
      [record.applicantName, record.cardType, record.applicationDate, normalizeImportText(record.description)]
        .map(normalizeImportText)
        .join("|")
    )
  );
  let added = 0;
  let skipped = 0;

  importedRecords.forEach((record) => {
    const fingerprint = [record.applicantName, record.cardType, record.applicationDate, normalizeImportText(record.description)]
      .map(normalizeImportText)
      .join("|");
    if (existingIds.has(record.id) || existingFingerprints.has(fingerprint)) {
      skipped += 1;
      return;
    }
    records.push(record);
    existingIds.add(record.id);
    existingFingerprints.add(fingerprint);
    added += 1;
  });

  writeSubmissions(records);
  return { added, skipped, total: records.length };
}

function normalizeFileList(files = []) {
  return files.map((file) => ({
    ...file,
    originalName: normalizeOriginalName(file.originalName)
  }));
}

function normalizeAttachmentNames(record) {
  return {
    ...record,
    attachments: normalizeFileList(record.attachments || []),
    feedbackFiles: normalizeFileList(record.feedbackFiles || []),
    reviewVotes: record.reviewVotes || {}
  };
}

function publicSubmissionForReview(record) {
  const normalizedRecord = normalizeAttachmentNames(record);
  const querySecretSet = Boolean(normalizedRecord.querySecretHash);
  delete normalizedRecord.querySecretHash;
  return {
    ...normalizedRecord,
    querySecretPlain: normalizedRecord.querySecretPlain || "",
    querySecretSet
  };
}

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function publicReviewResult(record) {
  const normalizedRecord = normalizeAttachmentNames(record);
  const isPublished = Boolean(normalizedRecord.resultPublished);

  if (!isPublished) {
    return {
      id: normalizedRecord.id,
      cardType: normalizedRecord.cardType,
      applicantName: normalizedRecord.applicantName,
      applicationDate: normalizedRecord.applicationDate,
      reviewStatus: "评审结果暂未发布",
      score: "",
      reviewComment: "评审小组正在整理最终意见，请等待评审组确认展示。",
      reviewDate: ""
    };
  }

  return {
    id: normalizedRecord.id,
    cardType: normalizedRecord.cardType,
    applicantName: normalizedRecord.applicantName,
    applicationDate: normalizedRecord.applicationDate,
    reviewStatus: normalizedRecord.reviewStatus,
    score: normalizedRecord.score,
    reviewComment: normalizedRecord.finalPublicComment || "暂无最终评审意见。",
    reviewDate: normalizedRecord.reviewDate
  };
}

function authenticateRequest(req) {
  const token = req.get("x-review-token") || req.query.reviewToken;
  const user = verifySession(token);
  if (user) return user;

  const legacyToken = req.get("x-admin-token") || req.query.token;
  if (legacyToken === ADMIN_TOKEN) {
    return { name: adminName, role: "admin", canUploadFeedback: true, legacy: true };
  }

  return null;
}

function requireReviewUser(req, res, next) {
  const user = authenticateRequest(req);
  if (!user) {
    return res.status(401).json({ message: "请先登录评审账号。" });
  }
  req.authUser = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = authenticateRequest(req);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "只有管理员孙立柱可以操作。" });
  }
  req.authUser = user;
  next();
}

function requirePageAccess(...pages) {
  return (req, res, next) => {
    const user = req.authUser || authenticateRequest(req);
    if (!user) {
      return res.status(401).json({ message: "请先登录账号。" });
    }
    if (!hasPageAccess(user, ...pages)) {
      return res.status(403).json({ message: "账号暂无该页面权限，请联系管理员孙立柱授权。" });
    }
    req.authUser = user;
    next();
  };
}

function removeUploadedFiles(files = []) {
  files.forEach((file) => {
    fs.rm(file.path, { force: true }, () => {});
  });
}

function uploadedFileInfo(file) {
  return {
    originalName: normalizeOriginalName(file.originalname),
    filename: file.filename,
    size: file.size,
    mimetype: file.mimetype,
    uploadedAt: new Date().toISOString()
  };
}

function summarizeReviewComments(votes) {
  return reviewMemberNames
    .map((name) => {
      const vote = votes[name];
      if (!vote) return "";
      const comment = String(vote.comment || "").trim();
      return comment ? `${name}（${vote.status}）：${comment}` : `${name}：${vote.status}`;
    })
    .filter(Boolean)
    .join("\n");
}

function calculateFinalReview(votes, cardType) {
  const statuses = reviewMemberNames.map((name) => (votes[name] || {}).status).filter(Boolean);
  const passed = statuses.filter((status) => status === "通过").length;
  const rejected = statuses.filter((status) => status === "不通过").length;

  let reviewStatus = "待评审";
  if (passed >= 3) reviewStatus = "通过";
  else if (rejected >= 3) reviewStatus = "不通过";

  return {
    reviewStatus,
    score: reviewStatus === "通过" ? scoreForCardType(cardType) : "",
    passed,
    rejected,
    voted: statuses.length
  };
}

function parseDateOnly(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addCycle(date, cycle) {
  const result = new Date(date.getTime());
  if (cycle === "一季度") {
    result.setMonth(result.getMonth() + 3);
    return result;
  }
  result.setFullYear(result.getFullYear() + 1);
  return result;
}

function scoreForCardType(cardType, explicitScore = "") {
  const recordScore = String(explicitScore ?? "").trim();
  if (recordScore) return recordScore;
  const configuredScore = cardScores[cardType];
  if (configuredScore !== undefined && configuredScore !== null && String(configuredScore).trim()) {
    return String(configuredScore).trim();
  }
  const legacyScore = legacyCardScores[cardType];
  return legacyScore !== undefined && legacyScore !== null ? String(legacyScore) : "";
}

const coinRecordTypes = new Set(["card_issue", "leave_exchange", "reward_redeem"]);
const coinRecordTypeLabels = {
  card_issue: "成就卡发放",
  leave_exchange: "年假兑换",
  reward_redeem: "奖励兑换"
};

function normalizePositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function publicCoinRecord(record) {
  const amount = Number(record.amount || 0);
  return {
    id: record.id,
    type: record.type,
    typeLabel: coinRecordTypeLabels[record.type] || record.type,
    applicantName: record.applicantName || "",
    department: record.department || "",
    cardType: record.cardType || "",
    score: record.score || "",
    leaveDays: record.leaveDays || "",
    rewardName: record.rewardName || "",
    coinAmount: Math.abs(amount),
    amount,
    recordDate: record.recordDate || "",
    note: record.note || "",
    createdBy: record.createdBy || "",
    createdAt: record.createdAt || ""
  };
}

function buildCoinBalances(records) {
  const balances = new Map();

  records.forEach((record) => {
    const name = String(record.applicantName || "").trim();
    if (!name) return;
    const amount = Number(record.amount || 0);
    const item =
      balances.get(name) ||
      {
        applicantName: name,
        department: record.department || "",
        balance: 0,
        cardIssue: 0,
        leaveExchange: 0,
        rewardRedeem: 0,
        recordCount: 0
      };

    if (!item.department && record.department) item.department = record.department;
    item.balance += amount;
    item.recordCount += 1;
    if (record.type === "card_issue") item.cardIssue += amount;
    if (record.type === "leave_exchange") item.leaveExchange += amount;
    if (record.type === "reward_redeem") item.rewardRedeem += Math.abs(amount);
    balances.set(name, item);
  });

  return Array.from(balances.values()).sort((a, b) => b.balance - a.balance || a.applicantName.localeCompare(b.applicantName, "zh-CN"));
}

function publicPassedRecord(record, validity, rosterByName = new Map()) {
  const rosterEmployee = rosterByName.get(record.applicantName);
  return {
    applicantName: record.applicantName,
    department: rosterEmployee ? rosterEmployee.department : record.department,
    cardType: record.cardType,
    score: scoreForCardType(record.cardType, record.score),
    applicationDate: record.applicationDate || "",
    reviewDate: record.reviewDate || "",
    validity,
    employmentStatus: rosterEmployee ? "在职" : "已离职"
  };
}

function groupPublicPassedRecords(records, now = new Date()) {
  const rosterByName = new Map(readRoster().employees.map((employee) => [employee.name, employee]));
  return records.reduce(
    (groups, record) => {
      if (!record.resultPublished || record.reviewStatus !== "通过") {
        return groups;
      }

      const baseDate = parseDateOnly(record.reviewDate) || parseDateOnly(record.applicationDate);
      if (!baseDate) {
        groups.expired.push(publicPassedRecord(record, "expired", rosterByName));
        return groups;
      }

      const expiresAt = addCycle(baseDate, cardCycles[record.cardType] || "一年");
      const targetGroup = expiresAt >= now ? "active" : "expired";
      groups[targetGroup].push(publicPassedRecord(record, targetGroup, rosterByName));
      return groups;
    },
    { active: [], expired: [] }
  );
}

function fileVersion(file) {
  try {
    const stat = fs.statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function publicPassedCacheKey(now = new Date()) {
  return [
    fileVersion(submissionsFile),
    fileVersion(rosterFile),
    compactChinaDate(now),
    JSON.stringify(cardCycles)
  ].join("|");
}

function getPublicPassedGroups() {
  const now = new Date();
  const key = publicPassedCacheKey(now);
  if (computedCache.publicPassed?.key === key) {
    return computedCache.publicPassed.value;
  }

  const value = groupPublicPassedRecords(readSubmissions(), now);
  computedCache.publicPassed = { key, value };
  return value;
}

function findStoredFile(filename) {
  const safeName = path.basename(filename);
  const records = readSubmissions();
  return records
    .flatMap((record) => [...(record.attachments || []), ...(record.feedbackFiles || [])])
    .find((file) => file.filename === safeName);
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", (req, res) => {
  const name = String(req.body.name || "").trim();
  const secret = String(req.body.secret || "").trim();
  const users = readUsers();
  const user = users[name];

  if (!user) {
    return res.status(401).json({ message: "账号不存在，请选择正确的评审人。" });
  }

  if (user.mustChangeSecret || !user.secretHash) {
    return res.json({
      needsSetup: true,
      message: "首次登录请先设置自己的评审秘钥。"
    });
  }

  if (!secret || user.secretHash !== hashSecret(secret)) {
    return res.status(401).json({ message: "秘钥不正确。" });
  }

  if (!isAdminUser(user) && normalizePageAccess(user).length === 0) {
    return res.status(403).json({ message: "账号已注册，请等待管理员孙立柱授权页面后再登录。" });
  }

  const token = createSession(user);
  res.json({ token, user: publicUser(user) });
});

app.post("/api/auth/setup", (req, res) => {
  const name = String(req.body.name || "").trim();
  const secret = String(req.body.secret || "").trim();
  const users = readUsers();
  const user = users[name];

  if (!user || user.role === "admin") {
    return res.status(403).json({ message: "该账号不支持首次设置秘钥。" });
  }
  if (user.secretHash && !user.mustChangeSecret) {
    return res.status(409).json({ message: "该评审人已设置秘钥，请直接登录。" });
  }
  if (secret.length < 4) {
    return res.status(400).json({ message: "秘钥至少需要 4 位。" });
  }

  user.secretHash = hashSecret(secret);
  user.mustChangeSecret = false;
  user.updatedAt = new Date().toISOString();
  writeUsers(users);

  const token = createSession(user);
  res.json({ token, user: publicUser(user), message: "秘钥已设置。" });
});

app.get("/api/auth/me", requireReviewUser, (req, res) => {
  res.json({ user: publicUser(req.authUser) });
});

app.post("/api/auth/register", (req, res) => {
  const name = String(req.body.name || "").trim();
  const secret = String(req.body.secret || req.body.password || "").trim();
  if (!name || !secret) {
    return res.status(400).json({ message: "请输入姓名和秘钥。" });
  }
  if (secret.length < 4) {
    return res.status(400).json({ message: "秘钥至少需要 4 位。" });
  }

  const users = readUsers();
  if (users[name]) {
    return res.status(409).json({ message: "该姓名已注册，请直接登录或联系管理员。" });
  }

  const user = {
    id: createUserId(),
    name,
    role: userRoleName,
    pageAccess: defaultApplicantAccess,
    secretHash: hashSecret(secret),
    mustChangeSecret: false,
    createdAt: new Date().toISOString()
  };
  users[name] = user;
  writeDeletedUsers(readDeletedUsers().filter((deletedName) => deletedName !== name));
  writeUsers(users);
  notifyDingTalk("新用户注册", [`姓名：${user.name}`, `默认权限：申请页面、成就卡榜单`]);
  res.json({ user: publicUser(user), message: "注册成功，已开通申请页面和成就卡榜单。" });
});

app.get("/api/auth/users", requireAdmin, (req, res) => {
  const users = readUsers();
  res.json({
    pages: pagePermissions,
    users: publicPermissionUsers(users)
  });
});

app.patch("/api/auth/users/:name/access", requireAdmin, (req, res) => {
  const targetName = String(req.params.name || "").trim();
  const users = readUsers();
  const user = users[targetName];
  if (!user) {
    return res.status(404).json({ message: "用户不存在。" });
  }

  const requestedAccess = Array.isArray(req.body.pageAccess)
    ? [...new Set(req.body.pageAccess.filter((key) => pagePermissionKeys.includes(key)))]
    : [];
  user.pageAccess = isAdminUser(user) ? pagePermissionKeys : requestedAccess;
  user.updatedAt = new Date().toISOString();
  writeUsers(users);
  notifyDingTalk("用户权限已调整", [
    `操作人：${req.authUser.name}`,
    `对象：${user.name}`,
    `授权页面：${normalizePageAccess(user).map((key) => (pagePermissions.find((page) => page.key === key) || {}).label || key).join("、") || "无"}`
  ]);
  res.json({ user: publicUser(user), message: "用户权限已保存。" });
});

app.post("/api/auth/users/:name/reset-secret", requireAdmin, (req, res) => {
  const targetName = String(req.params.name || "").trim();
  const newSecret = String(req.body.secret || "123456").trim();
  const users = readUsers();
  const user = users[targetName];
  if (!user) {
    return res.status(404).json({ message: "用户不存在。" });
  }
  if (isAdminUser(user)) {
    return res.status(400).json({ message: "不能重置孙立柱管理员秘钥。" });
  }
  if (newSecret.length < 4) {
    return res.status(400).json({ message: "秘钥至少需要 4 位。" });
  }

  user.secretHash = hashSecret(newSecret);
  user.mustChangeSecret = true;
  user.updatedAt = new Date().toISOString();
  writeUsers(users);
  notifyDingTalk("用户登录密码已重置", [`操作人：${req.authUser.name}`, `对象：${user.name}`]);
  res.json({ message: `秘钥已重置为 ${newSecret}，用户下次登录需重新设置。` });
});

app.delete("/api/auth/users/:name", requireAdmin, (req, res) => {
  if (req.authUser.name !== adminName) {
    return res.status(403).json({ message: "只有孙立柱管理员可以删除用户账号。" });
  }

  const targetName = String(req.params.name || "").trim();
  const users = readUsers();
  const user = users[targetName];
  if (!user) {
    return res.status(404).json({ message: "用户不存在。" });
  }
  if (targetName === adminName) {
    return res.status(400).json({ message: "不能删除孙立柱管理员账号。" });
  }

  delete users[targetName];
  writeDeletedUsers([...readDeletedUsers(), targetName]);
  writeUsers(users);
  notifyDingTalk("用户账号已删除", [`操作人：${req.authUser.name}`, `对象：${targetName}`]);
  res.json({
    message: "用户已删除。",
    users: publicPermissionUsers(users)
  });
});

app.post("/api/auth/users/bulk-delete", requireAdmin, (req, res) => {
  if (req.authUser.name !== adminName) {
    return res.status(403).json({ message: "只有孙立柱管理员可以批量删除用户账号。" });
  }

  const targetNames = Array.isArray(req.body.names)
    ? [...new Set(req.body.names.map((name) => String(name || "").trim()).filter(Boolean))]
    : [];
  if (targetNames.length === 0) {
    return res.status(400).json({ message: "请选择要删除的用户。" });
  }
  if (targetNames.includes(adminName)) {
    return res.status(400).json({ message: "不能删除孙立柱管理员账号。" });
  }

  const users = readUsers();
  const deletedNames = [];
  targetNames.forEach((name) => {
    if (!users[name]) return;
    delete users[name];
    deletedNames.push(name);
  });

  if (deletedNames.length === 0) {
    return res.status(404).json({ message: "未找到可删除的用户。" });
  }

  writeDeletedUsers([...readDeletedUsers(), ...deletedNames]);
  writeUsers(users);
  notifyDingTalk("批量删除用户账号", [`操作人：${req.authUser.name}`, `数量：${deletedNames.length}`, `对象：${deletedNames.join("、")}`]);
  res.json({
    message: `已删除 ${deletedNames.length} 个用户。`,
    deletedNames,
    users: publicPermissionUsers(users)
  });
});

app.post("/api/submissions", upload.array("attachments", 10), (req, res) => {
  const {
    cardType,
    applicantName,
    department,
    position,
    contact,
    applicationDate,
    description,
    querySecret,
    commitment
  } = req.body;

  const requiredMissing = [
    ["cardType", cardType],
    ["applicantName", applicantName],
    ["department", department],
    ["position", position],
    ["applicationDate", applicationDate],
    ["description", description],
    ["commitment", commitment]
  ].filter(([, value]) => !String(value || "").trim());

  if (requiredMissing.length > 0) {
    removeUploadedFiles(req.files);
    return res.status(400).json({ message: "请完整填写必填信息后再提交。" });
  }

  if (!cardTypes.has(cardType)) {
    removeUploadedFiles(req.files);
    return res.status(400).json({ message: "该成就卡暂未开放，暂不支持提交申请。" });
  }

  const records = readSubmissions();
  const normalizedApplicantName = applicantName.trim();
  const rosterEmployee = findRosterEmployee(normalizedApplicantName);
  if (!rosterEmployee) {
    removeUploadedFiles(req.files);
    return res.status(400).json({ message: "申报人姓名不在花名册内，不能提交申请。请确认姓名与花名册一致。" });
  }

  const normalizedQuerySecret = String(querySecret || "").trim();
  const previousSecretRecord = records.find(
    (record) => record.applicantName === normalizedApplicantName && record.querySecretHash
  );
  const duplicateRecord = records.find((record) => record.cardType === cardType && record.applicantName === normalizedApplicantName);

  if (duplicateRecord) {
    removeUploadedFiles(req.files);
    return res.status(409).json({ message: `你已提交过「${cardType}」成就卡申请，请勿重复提交。` });
  }

  if (!normalizedQuerySecret && !previousSecretRecord) {
    removeUploadedFiles(req.files);
    return res.status(400).json({ message: "首次申请请设置至少4位查询秘钥，后续申请可不填并沿用。" });
  }

  if (normalizedQuerySecret && normalizedQuerySecret.length < 4) {
    removeUploadedFiles(req.files);
    return res.status(400).json({ message: "查询秘钥至少需要 4 位。" });
  }

  const effectiveQuerySecretHash = normalizedQuerySecret
    ? hashSecret(normalizedQuerySecret)
    : previousSecretRecord.querySecretHash;
  const effectiveQuerySecretPlain = normalizedQuerySecret
    ? normalizedQuerySecret
    : previousSecretRecord.querySecretPlain || "";

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const record = {
    id: createSubmissionId(records, nowDate),
    cardType,
    applicantName: normalizedApplicantName,
    department: rosterEmployee.department || department.trim(),
    position: rosterEmployee.position || position.trim(),
    contact: String(contact || "").trim(),
    applicationDate,
    description: description.trim(),
    querySecretHash: effectiveQuerySecretHash,
    querySecretPlain: effectiveQuerySecretPlain,
    querySecretInherited: !normalizedQuerySecret,
    commitment,
    submittedAt: now,
    reviewStatus: "待评审",
    score: "",
    reviewComment: "",
    reviewer: "",
    reviewDate: "",
    reviewVotes: {},
    finalPublicComment: "",
    resultPublished: false,
    resultPublishedAt: "",
    resultPublishedBy: "",
    attachments: (req.files || []).map(uploadedFileInfo),
    feedbackFiles: []
  };

  records.unshift(record);
  writeSubmissions(records);
  notifyDingTalk("提交成就卡申请", [
    `申请编号：${record.id}`,
    `申报人：${record.applicantName}`,
    `部门：${record.department}`,
    `项目：${record.cardType}`,
    `申报日期：${record.applicationDate}`,
    `材料数量：${record.attachments.length}`
  ]);

  res.status(201).json({
    id: record.id,
    querySecretInherited: record.querySecretInherited,
    message: "提交成功，评审小组会统一评审。"
  });
});

app.post("/api/results/query", (req, res) => {
  const applicantName = String(req.body.applicantName || "").trim();
  const querySecret = String(req.body.querySecret || "").trim();

  if (!applicantName || !querySecret) {
    return res.status(400).json({ message: "请输入申报人姓名和查询秘钥。" });
  }

  const secretHash = hashSecret(querySecret);
  const records = readSubmissions()
    .filter((record) => record.applicantName === applicantName && record.querySecretHash === secretHash)
    .map(publicReviewResult);

  res.json({ records });
});

app.get("/api/public/passed", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30");
  res.json(getPublicPassedGroups());
});

app.get("/api/applicants/secret-status", (req, res) => {
  const applicantName = String(req.query.applicantName || "").trim();
  if (!applicantName) {
    return res.json({ hasSecret: false });
  }

  const hasSecret = readSubmissions().some((record) => record.applicantName === applicantName && record.querySecretHash);
  res.json({ hasSecret });
});

app.get("/api/roster", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(readRoster());
});

app.get("/api/maintenance/status", requireAdmin, (req, res) => {
  const submissions = readSubmissions();
  const statusCounts = submissions.reduce((counts, record) => {
    const status = record.reviewStatus || "待评审";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  res.json({
    submissions: {
      total: submissions.length,
      statusCounts,
      publishedPassed: submissions.filter((record) => record.resultPublished && record.reviewStatus === "通过").length,
      lastSubmittedAt: submissions
        .map((record) => record.submittedAt || "")
        .filter(Boolean)
        .sort()
        .at(-1) || ""
    },
    roster: readRoster()
  });
});

app.get("/api/backups/status", requireAdmin, (req, res) => {
  res.json(readLatestBackupStatus());
});

app.post("/api/backups/run", requireAdmin, (req, res) => {
  try {
    const status = createLatestBackup({
      reason: "manual",
      actorName: req.authUser.name
    });
    notifyDingTalk("数据备份已生成", [`操作人：${req.authUser.name}`, `备份文件：latest-backup.json`]);
    res.json({ message: "备份已生成，会覆盖上一份最新备份。", status });
  } catch (error) {
    res.status(500).json({ message: error.message || "备份失败" });
  }
});

app.get("/api/backups/latest", requireAdmin, (req, res) => {
  if (!fs.existsSync(latestBackupFile)) {
    return res.status(404).json({ message: "暂无备份文件" });
  }
  res.download(latestBackupFile, "chengjiujka-latest-backup.json");
});

app.post("/api/roster/import", requireAdmin, upload.single("rosterFile"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "请选择要导入的花名册 Excel 文件。" });
  }

  try {
    const roster = parseRosterWorkbook(req.file.path);
    if (!roster.count) {
      return res.status(400).json({ message: "未读取到有效员工数据，请确认表头包含“姓名”和“一级部门”。" });
    }

    const savedRoster = writeRoster(roster);
    res.json({
      message: `花名册已导入，共 ${savedRoster.count} 人、${savedRoster.departments.length} 个部门。`,
      roster: savedRoster
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "花名册导入失败。" });
  } finally {
    fs.rm(req.file.path, { force: true }, () => {});
  }
});

app.post(
  "/api/history/import",
  requireAdmin,
  upload.fields([
    { name: "historyFile", maxCount: 1 },
    { name: "cardDimFile", maxCount: 1 }
  ]),
  (req, res) => {
    const historyFile = req.files?.historyFile?.[0];
    const cardDimFile = req.files?.cardDimFile?.[0];

    if (!historyFile) {
      return res.status(400).json({ message: "请选择历史申请数据文件。" });
    }

    try {
      const importedRecords = parseHistoryImportFiles(historyFile, cardDimFile);
      if (!importedRecords.length) {
        return res.status(400).json({ message: "未读取到可导入的历史申请记录。" });
      }

      const result = mergeImportedSubmissions(importedRecords);
      res.json({
        message: `历史数据导入完成，新增 ${result.added} 条，跳过重复 ${result.skipped} 条，当前共 ${result.total} 条。`,
        ...result
      });
    } catch (error) {
      res.status(400).json({ message: error.message || "历史数据导入失败。" });
    } finally {
      [historyFile, cardDimFile].filter(Boolean).forEach((file) => fs.rm(file.path, { force: true }, () => {}));
    }
  }
);

app.get("/api/card-config", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json({ cards: activeCardDetails });
});

app.patch("/api/card-config", requireAdmin, (req, res) => {
  const cards = req.body.cards;
  if (!cards || typeof cards !== "object" || Array.isArray(cards)) {
    return res.status(400).json({ message: "成就卡配置格式不正确。" });
  }

  const normalized = writeCardDetails({ ...defaultCardDetails, ...cards });
  res.json({
    message: "成就卡配置已保存。",
    cards: normalized
  });
});

app.get("/api/coins", requireAdmin, (req, res) => {
  const records = readCoinRecords().map(publicCoinRecord);
  const totals = records.reduce(
    (sum, record) => {
      sum.balance += Number(record.amount || 0);
      if (record.type === "card_issue") sum.cardIssue += Number(record.amount || 0);
      if (record.type === "leave_exchange") sum.leaveExchange += Number(record.amount || 0);
      if (record.type === "reward_redeem") sum.rewardRedeem += Math.abs(Number(record.amount || 0));
      return sum;
    },
    { balance: 0, cardIssue: 0, leaveExchange: 0, rewardRedeem: 0 }
  );

  res.json({
    records,
    balances: buildCoinBalances(records),
    totals: {
      ...totals,
      people: buildCoinBalances(records).length,
      records: records.length
    }
  });
});

app.post("/api/coins", requireAdmin, (req, res) => {
  if (req.authUser.name !== adminName) {
    return res.status(403).json({ message: "只有管理员孙立柱可以登记成就币记录。" });
  }

  const type = String(req.body.type || "").trim();
  const applicantName = String(req.body.applicantName || "").trim();
  const department = String(req.body.department || "").trim();
  const cardType = String(req.body.cardType || "").trim();
  const rewardName = String(req.body.rewardName || "").trim();
  const note = String(req.body.note || "").trim();
  const recordDate = String(req.body.recordDate || localDateString()).trim();

  if (!coinRecordTypes.has(type)) {
    return res.status(400).json({ message: "请选择正确的成就币记录类型。" });
  }
  if (!applicantName) {
    return res.status(400).json({ message: "请输入申报人姓名。" });
  }

  let amount = 0;
  let score = "";
  let leaveDays = "";

  if (type === "card_issue") {
    if (!cardType) return res.status(400).json({ message: "请选择成就卡项目。" });
    score = normalizePositiveNumber(req.body.score) || normalizePositiveNumber(scoreForCardType(cardType));
    if (!score) return res.status(400).json({ message: "请填写有效分值。" });
    amount = score;
  }

  if (type === "leave_exchange") {
    leaveDays = normalizePositiveNumber(req.body.leaveDays);
    if (!leaveDays) return res.status(400).json({ message: "请填写有效年假天数。" });
    amount = leaveDays * 20;
  }

  if (type === "reward_redeem") {
    const coinAmount = normalizePositiveNumber(req.body.coinAmount);
    if (!rewardName) return res.status(400).json({ message: "请填写兑换奖励名称。" });
    if (!coinAmount) return res.status(400).json({ message: "请填写有效兑换成就币数量。" });
    amount = -coinAmount;
  }

  const records = readCoinRecords();
  const record = {
    id: crypto.randomUUID(),
    type,
    applicantName,
    department,
    cardType: type === "card_issue" ? cardType : "",
    score: type === "card_issue" ? String(score) : "",
    leaveDays: type === "leave_exchange" ? String(leaveDays) : "",
    rewardName: type === "reward_redeem" ? rewardName : "",
    amount,
    recordDate,
    note,
    createdBy: req.authUser.name,
    createdAt: new Date().toISOString()
  };
  records.unshift(record);
  writeCoinRecords(records);
  notifyDingTalk("新增成就币记录", [
    `操作人：${req.authUser.name}`,
    `对象：${record.applicantName}`,
    `类型：${coinRecordTypeLabels[record.type] || record.type}`,
    `变动：${record.amount > 0 ? "+" : ""}${record.amount} 币`,
    `日期：${record.recordDate}`
  ]);

  res.json({
    message: "成就币记录已保存。",
    record: publicCoinRecord(record)
  });
});

app.delete("/api/coins/:id", requireAdmin, (req, res) => {
  if (req.authUser.name !== adminName) {
    return res.status(403).json({ message: "只有管理员孙立柱可以删除成就币记录。" });
  }

  const records = readCoinRecords();
  const index = records.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: "未找到成就币记录。" });
  }

  const [removedRecord] = records.splice(index, 1);
  writeCoinRecords(records);
  notifyDingTalk("删除成就币记录", [
    `操作人：${req.authUser.name}`,
    `对象：${removedRecord.applicantName || ""}`,
    `类型：${coinRecordTypeLabels[removedRecord.type] || removedRecord.type || "未填写"}`,
    `变动：${removedRecord.amount > 0 ? "+" : ""}${removedRecord.amount || 0} 币`
  ]);
  res.json({ message: "成就币记录已删除。", id: req.params.id });
});

app.get("/api/submissions", requireReviewUser, requirePageAccess("reviewPage", "resultSummary"), (req, res) => {
  res.json(readSubmissions().map(publicSubmissionForReview));
});

app.patch("/api/submissions/:id/review", requireReviewUser, requirePageAccess("reviewPage"), (req, res) => {
  const reviewStatus = String(req.body.reviewStatus || "").trim();
  const reviewComment = String(req.body.reviewComment || "").trim();

  if (!reviewMemberNames.includes(req.authUser.name)) {
    return res.status(403).json({ message: "当前账号不是固定评审成员，不能提交投票。" });
  }

  if (!reviewStatuses.has(reviewStatus)) {
    return res.status(400).json({ message: "评审结果必填，请选择通过或不通过。" });
  }

  const records = readSubmissions();
  const record = records.find((item) => item.id === req.params.id);
  if (!record) {
    return res.status(404).json({ message: "未找到提交记录。" });
  }
  if (!Array.isArray(record.feedbackFiles) || record.feedbackFiles.length === 0) {
    return res.status(400).json({ message: "请先上传评审组收集反馈文件，再进行评审。" });
  }

  record.reviewVotes = record.reviewVotes || {};
  if (record.reviewVotes[req.authUser.name]) {
    return res.status(409).json({ message: "你已提交过本条申请的评审，不能重复提交或修改。" });
  }

  record.reviewVotes[req.authUser.name] = {
    status: reviewStatus,
    comment: reviewComment,
    date: localDateString(),
    updatedAt: new Date().toISOString()
  };

  const finalReview = calculateFinalReview(record.reviewVotes, record.cardType);
  record.reviewStatus = finalReview.reviewStatus;
  record.score = finalReview.score;
  record.reviewComment = summarizeReviewComments(record.reviewVotes);
  record.reviewer = Object.keys(record.reviewVotes).join("、");
  record.reviewDate = localDateString();
  record.reviewSummary = finalReview;
  record.updatedAt = new Date().toISOString();
  writeSubmissions(records);
  notifyDingTalk("提交评审意见", [
    `评审人：${req.authUser.name}`,
    `申报人：${record.applicantName}`,
    `项目：${record.cardType}`,
    `本次意见：${reviewStatus}`,
    `当前结果：${record.reviewStatus}`
  ]);

  res.json(publicSubmissionForReview(record));
});

app.post("/api/submissions/:id/feedback-files", requireAdmin, upload.array("feedbackFiles", 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "请选择要上传的评审组反馈文件。" });
  }

  const records = readSubmissions();
  const record = records.find((item) => item.id === req.params.id);
  if (!record) {
    removeUploadedFiles(req.files);
    return res.status(404).json({ message: "未找到提交记录。" });
  }

  record.feedbackFiles = [...(record.feedbackFiles || []), ...req.files.map(uploadedFileInfo)];
  record.feedbackUpdatedAt = new Date().toISOString();
  writeSubmissions(records);
  notifyDingTalk("上传评审组反馈文件", [
    `操作人：${req.authUser.name}`,
    `申报人：${record.applicantName}`,
    `项目：${record.cardType}`,
    `本次上传：${req.files.length} 个`
  ]);
  res.json(publicSubmissionForReview(record));
});

app.patch("/api/submissions/:id/query-secret", requireAdmin, (req, res) => {
  const querySecret = String(req.body.querySecret || "").trim();
  if (querySecret.length < 4) {
    return res.status(400).json({ message: "查询秘钥至少需要 4 位。" });
  }

  const records = readSubmissions();
  const record = records.find((item) => item.id === req.params.id);
  if (!record) {
    return res.status(404).json({ message: "未找到提交记录。" });
  }

  record.querySecretHash = hashSecret(querySecret);
  record.querySecretPlain = querySecret;
  record.querySecretResetAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  writeSubmissions(records);
  notifyDingTalk("重置查询秘钥", [
    `操作人：${req.authUser.name}`,
    `申报人：${record.applicantName}`,
    `项目：${record.cardType}`
  ]);
  res.json({ message: "查询秘钥已重置。", record: publicSubmissionForReview(record) });
});

app.patch("/api/submissions/:id/public-result", requireAdmin, (req, res) => {
  const finalPublicComment = String(req.body.finalPublicComment || "").trim();
  const resultPublished = Boolean(req.body.resultPublished);

  if (resultPublished && !finalPublicComment) {
    return res.status(400).json({ message: "请先补齐最终展示评审意见，再确认展示。" });
  }

  const records = readSubmissions();
  const record = records.find((item) => item.id === req.params.id);
  if (!record) {
    return res.status(404).json({ message: "未找到提交记录。" });
  }

  record.finalPublicComment = finalPublicComment;
  record.resultPublished = resultPublished;
  record.resultPublishedAt = resultPublished ? new Date().toISOString() : "";
  record.resultPublishedBy = resultPublished ? req.authUser.name : "";
  record.updatedAt = new Date().toISOString();
  writeSubmissions(records);
  notifyDingTalk(resultPublished ? "确认展示评审结果" : "取消展示评审结果", [
    `操作人：${req.authUser.name}`,
    `申报人：${record.applicantName}`,
    `项目：${record.cardType}`,
    `评审结果：${record.reviewStatus || "待评审"}`
  ]);

  res.json(publicSubmissionForReview(record));
});

app.post("/api/submissions/bulk-delete", requireAdmin, (req, res) => {
  if (req.authUser.name !== adminName) {
    return res.status(403).json({ message: "只有管理员孙立柱可以批量删除申请记录。" });
  }

  const ids = Array.isArray(req.body.ids)
    ? [...new Set(req.body.ids.map((id) => String(id || "").trim()).filter(Boolean))]
    : [];
  if (ids.length === 0) {
    return res.status(400).json({ message: "请选择要删除的申请记录。" });
  }

  const idSet = new Set(ids);
  const records = readSubmissions();
  const removedRecords = records.filter((record) => idSet.has(record.id));
  if (removedRecords.length === 0) {
    return res.status(404).json({ message: "未找到可删除的申请记录。" });
  }

  const keptRecords = records.filter((record) => !idSet.has(record.id));
  removeUploadedFiles(removedRecords.flatMap((record) => [...(record.attachments || []), ...(record.feedbackFiles || [])]));
  writeSubmissions(keptRecords);
  notifyDingTalk("批量删除申请记录", [
    `操作人：${req.authUser.name}`,
    `数量：${removedRecords.length}`,
    `对象：${removedRecords.map((record) => `${record.applicantName}-${record.cardType}`).join("、")}`
  ]);

  res.json({
    message: `已删除 ${removedRecords.length} 条申请记录。`,
    deletedIds: removedRecords.map((record) => record.id)
  });
});

app.delete("/api/submissions/:id", requireAdmin, (req, res) => {
  if (req.authUser.name !== adminName) {
    return res.status(403).json({ message: "只有管理员孙立柱可以删除申请记录。" });
  }

  const records = readSubmissions();
  const recordIndex = records.findIndex((item) => item.id === req.params.id);
  if (recordIndex === -1) {
    return res.status(404).json({ message: "未找到提交记录。" });
  }

  const [removedRecord] = records.splice(recordIndex, 1);
  removeUploadedFiles([...(removedRecord.attachments || []), ...(removedRecord.feedbackFiles || [])]);
  writeSubmissions(records);
  notifyDingTalk("删除申请记录", [
    `操作人：${req.authUser.name}`,
    `申报人：${removedRecord.applicantName}`,
    `项目：${removedRecord.cardType}`,
    `状态：${removedRecord.reviewStatus || "待评审"}`
  ]);
  res.json({ message: "申请记录已删除。", id: req.params.id });
});

app.get("/api/files/:filename", requireReviewUser, requirePageAccess("reviewPage", "resultSummary"), (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("文件不存在");
  }

  const attachment = findStoredFile(safeName);
  const displayName = attachment ? normalizeOriginalName(attachment.originalName) : safeName;

  if (req.query.download === "1") {
    return res.download(filePath, displayName);
  }

  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`);
  res.sendFile(filePath);
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "请求数据格式不正确。" });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: "附件上传失败，请检查文件数量和大小。" });
  }
  console.error(err);
  res.status(500).json({ message: "服务器异常，请稍后再试。" });
});

scheduleDailyLatestBackup();

app.listen(PORT, () => {
  readUsers();
  console.log(`成就卡系统已启动：http://localhost:${PORT}`);
});
