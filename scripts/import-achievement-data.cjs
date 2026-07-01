const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const uploadDir = path.join(rootDir, "uploads");
const submissionsFile = path.join(dataDir, "submissions.json");
const legacySummaryFile = path.resolve(rootDir, "..", "成就值-汇总", "Fac-成就值申请表汇总.xlsx");
const legacyCardDimFile = path.resolve(rootDir, "..", "成就值-汇总", "Dim-迈德斯特-成就值体系.xlsx");
const legacyJsonFile = path.resolve(rootDir, "..", "github-文件库", "data", "submissions.json");
const legacyUploadDir = path.resolve(rootDir, "..", "github-文件库", "uploads");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "") || JSON.stringify(fallback));
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function backupFile(file) {
  if (!fs.existsSync(file)) return "";
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `submissions-import-${stamp}.json`);
  fs.copyFileSync(file, target);
  return target;
}

function text(value) {
  return String(value ?? "").trim();
}

function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = text(value).replace(/\./g, "/").replace(/-/g, "/");
  const match = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function legacyId(prefix, parts) {
  return `${prefix}-${crypto.createHash("sha1").update(parts.map(text).join("|")).digest("hex").slice(0, 18)}`;
}

function readWorkbookRows(file, sheetName) {
  if (!fs.existsSync(file)) return [];
  const workbook = xlsx.readFile(file, { cellDates: true });
  const targetSheetName = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet) return [];
  return xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

function loadCardMeta() {
  const workbook = fs.existsSync(legacyCardDimFile) ? xlsx.readFile(legacyCardDimFile, { cellDates: true }) : null;
  const meta = new Map();
  if (!workbook) return meta;

  workbook.SheetNames.forEach((sheetName) => {
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
    rows.forEach((row) => {
      const cardName = text(row["成就卡名称"]);
      if (!cardName || meta.has(cardName)) return;
      meta.set(cardName, {
        category: text(row["成就卡类型"]),
        score: text(row["成就值"] || row["分值"]),
        validMonths: text(row["成就卡有效期（月）"])
      });
    });
  });
  return meta;
}

function mapReviewStatus(row) {
  const status = text(row["通过情况"] || row["二次评审结果"]);
  if (status.includes("不通过")) return "不通过";
  if (status.includes("补")) return "需补资料";
  if (status.includes("通过")) return "通过";
  return text(row["是否已经评审"]) === "是" ? "待评审" : "待评审";
}

function buildDescription(row) {
  return [
    text(row["申请理由"]) && `申请理由：${text(row["申请理由"])}`,
    text(row["推荐人"]) && `推荐人：${text(row["推荐人"])}`,
    text(row["推荐理由"]) && `推荐理由：${text(row["推荐理由"])}`,
    text(row["补充说明"]) && `补充说明：${text(row["补充说明"])}`,
    text(row["二次评审结果"]) && `二次评审结果：${text(row["二次评审结果"])}`
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeExcelRecord(row, rowNumber, cardMeta) {
  const applicantName = text(row["姓名"]);
  const cardType = text(row["成就卡名称"]);
  if (!applicantName || !cardType) return null;

  const applicationDate = normalizeDate(row["申请日期"]);
  const reviewStatus = mapReviewStatus(row);
  const meta = cardMeta.get(cardType) || {};
  const reviewComment = [text(row["补充说明"]), text(row["二次评审结果"])].filter(Boolean).join("\n");

  return {
    id: legacyId("excel", [rowNumber, applicantName, cardType, applicationDate, text(row["申请理由"])]),
    cardType,
    applicantName,
    department: text(row["部门"]),
    position: "",
    contact: "",
    applicationDate,
    description: buildDescription(row) || "历史数据导入",
    querySecretHash: "",
    querySecretPlain: "",
    querySecretInherited: false,
    commitment: "历史数据导入",
    submittedAt: applicationDate ? `${applicationDate}T00:00:00.000Z` : new Date().toISOString(),
    reviewStatus,
    score: reviewStatus === "通过" ? text(meta.score) : "",
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
      type: "excel",
      rowNumber,
      cardCategory: text(row["成就卡类别"]) || text(meta.category),
      validMonths: text(row["成就卡有效期（月）"]) || text(meta.validMonths)
    }
  };
}

function normalizeLegacyJsonRecord(record) {
  const id = record.id || legacyId("json", [record.applicantName, record.cardType, record.submittedAt]);
  return {
    id,
    cardType: text(record.cardType),
    applicantName: text(record.applicantName),
    department: text(record.department),
    position: text(record.position),
    contact: text(record.contact),
    applicationDate: normalizeDate(record.applicationDate),
    description: text(record.description),
    querySecretHash: record.querySecretHash || "",
    querySecretPlain: record.querySecretPlain || "",
    querySecretInherited: Boolean(record.querySecretInherited),
    commitment: record.commitment || "我确认",
    submittedAt: record.submittedAt || new Date().toISOString(),
    reviewStatus: record.reviewStatus || "待评审",
    score: record.score || "",
    reviewComment: record.reviewComment || "",
    reviewer: record.reviewer || "",
    reviewDate: record.reviewDate || "",
    reviewVotes: record.reviewVotes || {},
    reviewSummary: record.reviewSummary || {},
    finalPublicComment: record.finalPublicComment || "",
    resultPublished: Boolean(record.resultPublished),
    resultPublishedAt: record.resultPublishedAt || "",
    resultPublishedBy: record.resultPublishedBy || "",
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    feedbackFiles: Array.isArray(record.feedbackFiles) ? record.feedbackFiles : [],
    legacySource: record.legacySource || { type: "legacy-json" }
  };
}

function copyLegacyUploads(records) {
  if (!fs.existsSync(legacyUploadDir)) return 0;
  fs.mkdirSync(uploadDir, { recursive: true });
  let copied = 0;

  records.forEach((record) => {
    [...(record.attachments || []), ...(record.feedbackFiles || [])].forEach((file) => {
      if (!file.filename) return;
      const source = path.join(legacyUploadDir, path.basename(file.filename));
      const target = path.join(uploadDir, path.basename(file.filename));
      if (fs.existsSync(source) && !fs.existsSync(target)) {
        fs.copyFileSync(source, target);
        copied += 1;
      }
    });
  });
  return copied;
}

function dedupeMerge(existing, incoming) {
  const recordsById = new Map(existing.map((record) => [record.id, record]));
  let added = 0;
  let skipped = 0;

  incoming.forEach((record) => {
    if (!record || !record.id) return;
    if (recordsById.has(record.id)) {
      skipped += 1;
      return;
    }
    recordsById.set(record.id, record);
    added += 1;
  });

  return { records: Array.from(recordsById.values()), added, skipped };
}

function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  if (!fs.existsSync(submissionsFile)) writeJsonAtomic(submissionsFile, []);

  const existing = readJson(submissionsFile, []);
  const backup = backupFile(submissionsFile);
  const cardMeta = loadCardMeta();
  const excelRows = readWorkbookRows(legacySummaryFile, "Fac-成就值申请表汇总");
  const excelRecords = excelRows
    .map((row, index) => normalizeExcelRecord(row, index + 2, cardMeta))
    .filter(Boolean);
  const legacyJsonRecords = readJson(legacyJsonFile, []).map(normalizeLegacyJsonRecord);

  const copiedUploads = copyLegacyUploads(legacyJsonRecords);
  const merged = dedupeMerge(existing, [...legacyJsonRecords, ...excelRecords]);
  writeJsonAtomic(submissionsFile, merged.records);

  console.log(
    JSON.stringify(
      {
        backup,
        before: existing.length,
        legacyJson: legacyJsonRecords.length,
        excel: excelRecords.length,
        added: merged.added,
        skipped: merged.skipped,
        after: merged.records.length,
        copiedUploads
      },
      null,
      2
    )
  );
}

main();
