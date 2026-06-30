const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

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

const adminName = "孙立柱";
const reviewerNames = ["王斌", "惠李伟", "蒋炳兰", "任蒨"];
const reviewMemberNames = [adminName, ...reviewerNames];
const reviewStatuses = new Set(["通过", "不通过", "需补资料"]);
function loadCardConfig() {
  const raw = fs.readFileSync(path.join(publicDir, "card-data.js"), "utf8");
  const m = raw.match(/window\.CHENGJIUKA_CARD_DETAILS\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) return null;
  const details = new Function("return " + m[1])();
  return {
    scores: Object.fromEntries(Object.entries(details).filter(([, d]) => d.score).map(([k, d]) => [k, Number(d.score)])),
    cycles: Object.fromEntries(Object.entries(details).filter(([, d]) => d.cycle).map(([k, d]) => [k, d.cycle])),
    openTypes: new Set(Object.keys(details).filter((k) => details[k].definition))
  };
}
const cardConfig = loadCardConfig();
const fallbackCardTypes = new Set(["奋斗者", "分享达人", "业绩之王", "文化先锋", "最美工位"]);
const cardTypes = cardConfig ? cardConfig.openTypes : fallbackCardTypes;
const cardScores = cardConfig ? cardConfig.scores : { 奋斗者: 10, 分享达人: 10, 业绩之王: 10, 文化先锋: 10, 最美工位: 5 };
const cardCycles = cardConfig ? cardConfig.cycles : { 奋斗者: "一年", 分享达人: "一年", 业绩之王: "一季度", 文化先锋: "一年", 最美工位: "一季度" };

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

if (!fs.existsSync(submissionsFile)) {
  fs.writeFileSync(submissionsFile, "[]", "utf8");
}

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN === "*" ? origin : ALLOWED_ORIGIN);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token, x-review-token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

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

function verifySession(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || hmac(payload) !== signature) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return null;
    const users = readUsers();
    const user = users[data.name];
    if (!user || user.role !== data.role) return null;
    return { name: data.name, role: data.role, canUploadFeedback: data.name === adminName };
  } catch {
    return null;
  }
}

function defaultUsers() {
  return {
    [adminName]: {
      name: adminName,
      role: "admin",
      secretHash: hashSecret(process.env.ADMIN_PASSWORD || "521sunlizhu"),
      mustChangeSecret: false
    },
    ...Object.fromEntries(
      reviewerNames.map((name) => [
        name,
        {
          name,
          role: "reviewer",
          secretHash: "",
          mustChangeSecret: true
        }
      ])
    )
  };
}

function readUsers() {
  let users = {};
  if (fs.existsSync(usersFile)) {
    const content = fs.readFileSync(usersFile, "utf8").replace(/^\uFEFF/, "");
    users = JSON.parse(content || "{}");
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
    if (name === adminName && (users[name].secretHash !== user.secretHash || users[name].mustChangeSecret)) {
      users[name].secretHash = user.secretHash;
      users[name].mustChangeSecret = false;
      changed = true;
    }
  });

  if (changed || !fs.existsSync(usersFile)) {
    writeUsers(users);
  }

  return users;
}

function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf8");
}

function publicUser(user) {
  return {
    name: user.name,
    role: user.role,
    canUploadFeedback: user.name === adminName
  };
}

function readSubmissions() {
  const content = fs.readFileSync(submissionsFile, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(content || "[]");
}

function writeSubmissions(records) {
  fs.writeFileSync(submissionsFile, JSON.stringify(records, null, 2), "utf8");
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
  const needMore = statuses.filter((status) => status === "需补资料").length;

  let reviewStatus = "需补资料";
  if (passed >= 4) reviewStatus = "通过";
  else if (rejected >= 3) reviewStatus = "不通过";
  else if (needMore >= 2) reviewStatus = "需补资料";

  return {
    reviewStatus,
    score: reviewStatus === "通过" ? String(cardScores[cardType] || "") : "",
    passed,
    rejected,
    needMore,
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

function publicPassedRecord(record) {
  return {
    applicantName: record.applicantName,
    department: record.department,
    cardType: record.cardType,
    score: record.score || String(cardScores[record.cardType] || ""),
    applicationDate: record.applicationDate || "",
    reviewDate: record.reviewDate || ""
  };
}

function groupPublicPassedRecords(records, now = new Date()) {
  return records.reduce(
    (groups, record) => {
      if (!record.resultPublished || record.reviewStatus !== "通过") {
        return groups;
      }

      const baseDate = parseDateOnly(record.reviewDate) || parseDateOnly(record.applicationDate);
      if (!baseDate) {
        groups.expired.push(publicPassedRecord(record));
        return groups;
      }

      const expiresAt = addCycle(baseDate, cardCycles[record.cardType] || "一年");
      const targetGroup = expiresAt >= now ? "active" : "expired";
      groups[targetGroup].push(publicPassedRecord(record));
      return groups;
    },
    { active: [], expired: [] }
  );
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

  const token = createSession(user);
  res.json({ token, user: publicUser(user) });
});

app.post("/api/auth/setup", (req, res) => {
  const name = String(req.body.name || "").trim();
  const secret = String(req.body.secret || "").trim();
  const users = readUsers();
  const user = users[name];

  if (!user || user.role !== "reviewer") {
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

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    cardType,
    applicantName: normalizedApplicantName,
    department: department.trim(),
    position: position.trim(),
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
  const groups = groupPublicPassedRecords(readSubmissions());
  res.json(groups);
});

app.get("/api/applicants/secret-status", (req, res) => {
  const applicantName = String(req.query.applicantName || "").trim();
  if (!applicantName) {
    return res.json({ hasSecret: false });
  }

  const hasSecret = readSubmissions().some((record) => record.applicantName === applicantName && record.querySecretHash);
  res.json({ hasSecret });
});

app.get("/api/submissions", requireReviewUser, (req, res) => {
  res.json(readSubmissions().map(publicSubmissionForReview));
});

app.patch("/api/submissions/:id/review", requireReviewUser, (req, res) => {
  const reviewStatus = String(req.body.reviewStatus || "").trim();
  const reviewComment = String(req.body.reviewComment || "").trim();

  if (!reviewStatuses.has(reviewStatus)) {
    return res.status(400).json({ message: "评审结果必填，请选择通过、不通过或需补资料。" });
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

  res.json(publicSubmissionForReview(record));
});

app.get("/api/files/:filename", requireReviewUser, (req, res) => {
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

app.listen(PORT, () => {
  readUsers();
  console.log(`成就卡系统已启动：http://localhost:${PORT}`);
});
