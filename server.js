const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "3.1415926";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const rootDir = __dirname;
const publicDir = path.join(rootDir, "docs");
const storageRoot = process.env.STORAGE_DIR || "D:\\BI文件\\成就值卡\\github-文件库";
const dataDir = path.join(storageRoot, "data");
const uploadDir = path.join(storageRoot, "uploads");
const submissionsFile = path.join(dataDir, "submissions.json");

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());
app.use(express.static(publicDir));

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path
      .basename(file.originalname, ext)
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

const cardTypes = new Set(["奋斗者", "分享达人", "业绩之王", "文化先锋", "最美工位"]);
const reviewStatuses = new Set(["待评审", "通过", "驳回", "需补充"]);

function readSubmissions() {
  const content = fs.readFileSync(submissionsFile, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(content || "[]");
}

function writeSubmissions(records) {
  fs.writeFileSync(submissionsFile, JSON.stringify(records, null, 2), "utf8");
}

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token") || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ message: "无权限，请提供正确的评审口令。" });
  }
  next();
}

function removeUploadedFiles(files = []) {
  files.forEach((file) => {
    fs.rm(file.path, { force: true }, () => {});
  });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
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

  if (requiredMissing.length > 0 || !cardTypes.has(cardType)) {
    removeUploadedFiles(req.files);
    return res.status(400).json({ message: "请完整填写必填信息后再提交。" });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "请至少上传一个证明材料附件。" });
  }

  const now = new Date().toISOString();
  const record = {
    id: crypto.randomUUID(),
    cardType,
    applicantName: applicantName.trim(),
    department: department.trim(),
    position: position.trim(),
    contact: String(contact || "").trim(),
    applicationDate,
    description: description.trim(),
    commitment,
    submittedAt: now,
    reviewStatus: "待评审",
    score: "",
    reviewComment: "",
    reviewer: "",
    reviewDate: "",
    attachments: req.files.map((file) => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype
    }))
  };

  const records = readSubmissions();
  records.unshift(record);
  writeSubmissions(records);

  res.status(201).json({ id: record.id, message: "提交成功，评审小组会统一评审。" });
});

app.get("/api/submissions", requireAdmin, (req, res) => {
  res.json(readSubmissions());
});

app.patch("/api/submissions/:id/review", requireAdmin, (req, res) => {
  const { reviewStatus, score, reviewComment, reviewer } = req.body;
  if (reviewStatus && !reviewStatuses.has(reviewStatus)) {
    return res.status(400).json({ message: "评审状态不正确。" });
  }

  const records = readSubmissions();
  const record = records.find((item) => item.id === req.params.id);
  if (!record) {
    return res.status(404).json({ message: "未找到提交记录。" });
  }

  record.reviewStatus = reviewStatus || record.reviewStatus;
  record.score = score ?? record.score;
  record.reviewComment = reviewComment ?? record.reviewComment;
  record.reviewer = reviewer ?? record.reviewer;
  record.reviewDate = localDateString();
  record.updatedAt = new Date().toISOString();
  writeSubmissions(records);

  res.json(record);
});

app.get("/api/files/:filename", requireAdmin, (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, safeName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("文件不存在");
  }
  res.download(filePath);
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
  console.log(`成就卡系统已启动：http://localhost:${PORT}`);
});
