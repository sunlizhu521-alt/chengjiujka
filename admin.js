let allRecords = [];
let currentRecordIndex = 0;
const attachmentImageIndexes = {};

const cardDetails = window.CHENGJIUKA_CARD_DETAILS || {};
const reviewers = ["孙立柱", "王斌", "惠李伟", "任蒨", "蒋炳兰"];

const tokenInput = document.querySelector("#adminToken");
const cardFilter = document.querySelector("#cardFilter");
const statusFilter = document.querySelector("#statusFilter");
const searchInput = document.querySelector("#searchInput");
const loadBtn = document.querySelector("#loadBtn");
const prevRecordBtn = document.querySelector("#prevRecordBtn");
const nextRecordBtn = document.querySelector("#nextRecordBtn");
const recordsEl = document.querySelector("#records");
const summaryRow = document.querySelector("#summaryRow");
const adminMessage = document.querySelector("#adminMessage");
const localTestApiBase = "http://localhost:3000";
const configuredApiBase = (window.CHENGJIUKA_API_BASE || localTestApiBase).replace(/\/$/, "");
const isGithubPages = window.location.hostname.endsWith("github.io");

tokenInput.value = localStorage.getItem("chengjiukaAdminToken") || "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function setAdminMessage(text, type) {
  adminMessage.textContent = text;
  adminMessage.className = `message admin-message ${type || ""}`;
}

function hasBackend() {
  return Boolean(configuredApiBase || !isGithubPages);
}

function apiUrl(path) {
  return configuredApiBase ? `${configuredApiBase}${path}` : path;
}

function badgeClass(status) {
  status = normalizeReviewStatus(status);
  if (status === "通过") return "badge pass";
  if (status === "不通过") return "badge reject";
  if (status === "待评审" || status === "需补资料") return "badge pending";
  return "badge";
}

function normalizeReviewStatus(status) {
  if (status === "驳回") return "不通过";
  if (status === "需补充") return "需补资料";
  return status || "待评审";
}

function reviewerList(value) {
  return String(value || "")
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderRuleList(rules) {
  return `<ol>${rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ol>`;
}

function fileUrl(file, token, options = {}) {
  const downloadFlag = options.download ? "&download=1" : "";
  return apiUrl(`/api/files/${encodeURIComponent(file.filename)}?token=${token}${downloadFlag}`);
}

function isPreviewImage(file) {
  return String(file.mimetype || "").startsWith("image/");
}

function renderImageCarousel(files, token, recordId) {
  if (files.length === 0) return "";
  const savedIndex = attachmentImageIndexes[recordId] || 0;
  const currentIndex = Math.min(Math.max(savedIndex, 0), files.length - 1);
  attachmentImageIndexes[recordId] = currentIndex;
  const file = files[currentIndex];
  const href = fileUrl(file, token);
  const name = escapeHtml(file.originalName);

  return `
    <div class="image-carousel" data-record-id="${escapeHtml(recordId)}">
      <div class="image-carousel-head">
        <span>图片 ${currentIndex + 1} / ${files.length}</span>
        <div class="image-carousel-actions">
          <button type="button" class="attachment-image-prev" data-direction="-1" ${files.length <= 1 ? "disabled" : ""}>上一张</button>
          <button type="button" class="attachment-image-next" data-direction="1" ${files.length <= 1 ? "disabled" : ""}>下一张</button>
        </div>
      </div>
      <figure class="preview-item image-preview-item">
        <figcaption>${name}</figcaption>
        <img src="${href}" alt="${name}" loading="lazy" />
      </figure>
    </div>
  `;
}

function renderFileDownload(file, token) {
  const href = fileUrl(file, token, { download: true });
  const name = escapeHtml(file.originalName);

  return `
    <li class="file-download-item">
      <span>${name}</span>
      <a class="download-button" href="${href}" download="${name}">下载</a>
    </li>
  `;
}

function renderAttachmentPreviewList(files, token, recordId) {
  const imageFiles = files.filter(isPreviewImage);
  const otherFiles = files.filter((file) => !isPreviewImage(file));
  const imageBlock =
    imageFiles.length > 0
      ? `
        <section class="attachment-section">
          <div class="attachment-section-head">
            <h4>图片材料</h4>
            <span>${imageFiles.length} 个</span>
          </div>
          ${renderImageCarousel(imageFiles, token, recordId)}
        </section>
      `
      : "";
  const fileBlock =
    otherFiles.length > 0
      ? `
        <section class="attachment-section">
          <div class="attachment-section-head">
            <h4>文件材料</h4>
            <span>${otherFiles.length} 个</span>
          </div>
          <ul class="file-download-list">${otherFiles.map((file) => renderFileDownload(file, token)).join("")}</ul>
        </section>
      `
      : "";

  return imageBlock || fileBlock ? `${imageBlock}${fileBlock}` : "无附件";
}

function filteredRecords() {
  const card = cardFilter.value;
  const status = statusFilter.value;
  const keyword = searchInput.value.trim().toLowerCase();

  return allRecords.filter((item) => {
    const matchesCard = !card || item.cardType === card;
    const matchesStatus = !status || normalizeReviewStatus(item.reviewStatus) === status;
    const haystack = [
      item.cardType,
      item.applicantName,
      item.department,
      item.position,
      item.description,
      item.reviewComment
    ]
      .join(" ")
      .toLowerCase();
    return matchesCard && matchesStatus && (!keyword || haystack.includes(keyword));
  });
}

function renderSummary(records) {
  const total = records.length;
  const pending = records.filter((item) => item.reviewStatus === "待评审").length;
  const passed = records.filter((item) => item.reviewStatus === "通过").length;
  const rejected = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "不通过").length;
  const needMore = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "需补资料").length;

  summaryRow.innerHTML = [
    ["当前记录", total],
    ["待评审", pending],
    ["已通过", passed],
    ["不通过", rejected],
    ["需补资料", needMore]
  ]
    .map((item) => `<div class="summary-card"><strong>${item[1]}</strong><span>${item[0]}</span></div>`)
    .join("");
}

function updatePagerButtons(total) {
  prevRecordBtn.disabled = total === 0 || currentRecordIndex === 0;
  nextRecordBtn.disabled = total === 0 || currentRecordIndex >= total - 1;
}

function renderRecords() {
  const records = filteredRecords();
  renderSummary(records);

  if (records.length === 0) {
    currentRecordIndex = 0;
    updatePagerButtons(0);
    recordsEl.innerHTML = '<section class="record"><p>暂无符合条件的记录。</p></section>';
    return;
  }

  if (currentRecordIndex >= records.length) {
    currentRecordIndex = records.length - 1;
  }
  if (currentRecordIndex < 0) {
    currentRecordIndex = 0;
  }

  updatePagerButtons(records.length);

  const token = encodeURIComponent(tokenInput.value.trim());
  const item = records[currentRecordIndex];
  const detail = cardDetails[item.cardType] || { applicationRules: [], reviewRules: [], score: "" };
  const checkedReviewers = reviewerList(item.reviewer);
  const autoScore = detail.score || "";
  const attachments = renderAttachmentPreviewList(item.attachments || [], token, item.id);
  const currentStatus = normalizeReviewStatus(item.reviewStatus);

  recordsEl.innerHTML = `
        <article class="record" data-id="${escapeHtml(item.id)}">
          <div class="record-head">
            <div>
              <h3 class="record-title">${escapeHtml(item.cardType)} - ${escapeHtml(item.applicantName)}</h3>
              <p>提交时间：${escapeHtml(formatDate(item.submittedAt))}</p>
            </div>
            <span class="${badgeClass(currentStatus)}">${escapeHtml(currentStatus)}</span>
          </div>

          <div class="record-grid">
            <div><strong>部门</strong>${escapeHtml(item.department)}</div>
            <div><strong>岗位</strong>${escapeHtml(item.position)}</div>
            <div><strong>联系方式</strong>${escapeHtml(item.contact || "未填写")}</div>
            <div><strong>申报日期</strong>${escapeHtml(item.applicationDate)}</div>
            <div><strong>成就卡分值</strong>${escapeHtml(autoScore ? `${autoScore}分` : "未配置")}</div>
            <div><strong>评审人</strong>${escapeHtml(item.reviewer || "未填写")}</div>
          </div>

          <section class="review-reference">
            <h3>评审参考</h3>
            <div class="meta-grid">
              <div class="meta"><strong>周期</strong>${escapeHtml(detail.cycle || "未配置")}</div>
              <div class="meta"><strong>分值</strong>${escapeHtml(autoScore ? `${autoScore}分` : "未配置")}</div>
            </div>
            <p><strong>成就卡定义：</strong>${escapeHtml(detail.definition || "未配置")}</p>
            <p><strong>申请细则：</strong></p>
            ${renderRuleList(detail.applicationRules || [])}
            <p><strong>评审细则：</strong></p>
            ${renderRuleList(detail.reviewRules || [])}
          </section>

          <div class="description-block">
            <strong>申报说明</strong>
            <p>${escapeHtml(item.description)}</p>
          </div>

          <div class="attachments">
            <strong>附件预览</strong>
            <div class="attachment-preview-list">${attachments}</div>
          </div>

          <section class="review-feedback">
            <h3>评审反馈</h3>
            <form class="review-form">
              <div class="reviewer-checks" role="group" aria-label="评审参与人">
                <strong>评审参与人：</strong>
                ${reviewers
                  .map(
                    (name) => `
                      <label>
                        <input type="checkbox" name="reviewer" value="${escapeHtml(name)}" ${
                      checkedReviewers.includes(name) ? "checked" : ""
                    } />
                        <span>${escapeHtml(name)}</span>
                      </label>
                    `
                  )
                  .join("")}
              </div>
              <div class="review-result-options" role="group" aria-label="评审结果">
                <strong>评审结果：</strong>
                ${["通过", "不通过", "需补资料"]
                  .map(
                    (status) => `
                      <label>
                        <input type="radio" name="reviewStatus" value="${status}" ${
                      currentStatus === status ? "checked" : ""
                    } />
                        <span>${status}</span>
                      </label>
                    `
                  )
                  .join("")}
              </div>
              <label class="field review-comment-field">
                <span>评审意见</span>
                <textarea name="reviewComment" rows="2">${escapeHtml(item.reviewComment)}</textarea>
              </label>
              <button type="submit">保存</button>
            </form>
          </section>
        </article>
      `;
}

async function loadRecords() {
  if (!hasBackend()) {
    setAdminMessage("当前固定入口还没有配置后端地址，请管理员先部署后端并填写 docs/config.js。", "error");
    return;
  }

  const token = tokenInput.value.trim();
  if (!token) {
    setAdminMessage("请输入评审口令。", "error");
    tokenInput.focus();
    return;
  }

  localStorage.setItem("chengjiukaAdminToken", token);
  loadBtn.disabled = true;
  loadBtn.textContent = "加载中...";
  setAdminMessage("", "");

  try {
    const response = await fetch(apiUrl("/api/submissions"), {
      headers: { "x-admin-token": token }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载失败");
    allRecords = result;
    renderRecords();
    setAdminMessage("记录已加载。", "success");
  } catch (error) {
    setAdminMessage(error.message, "error");
  } finally {
    loadBtn.disabled = false;
    loadBtn.textContent = "加载记录";
  }
}

recordsEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target.closest(".review-form");
  if (!form) return;

  const record = event.target.closest(".record");
  const id = record.dataset.id;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  const selectedReviewers = formData.getAll("reviewer");
  const currentRecord = allRecords.find((item) => item.id === id);
  const currentDetail = currentRecord ? cardDetails[currentRecord.cardType] : null;
  payload.reviewer = selectedReviewers.join("、");
  payload.score = String((currentDetail || {}).score || "");
  payload.reviewStatus = formData.get("reviewStatus") || "待评审";

  try {
    const response = await fetch(apiUrl(`/api/submissions/${id}/review`), {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-admin-token": tokenInput.value.trim()
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "保存失败");
    allRecords = allRecords.map((item) => (item.id === id ? result : item));
    const records = filteredRecords();
    if (currentRecordIndex >= records.length) {
      currentRecordIndex = Math.max(records.length - 1, 0);
    }
    renderRecords();
    setAdminMessage("评审结果已保存。", "success");
  } catch (error) {
    setAdminMessage(error.message, "error");
  }
});

recordsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".attachment-image-prev, .attachment-image-next");
  if (!button) return;

  const carousel = button.closest(".image-carousel");
  const recordId = carousel ? carousel.dataset.recordId : "";
  const record = allRecords.find((item) => item.id === recordId);
  const imageCount = record ? (record.attachments || []).filter(isPreviewImage).length : 0;
  if (!recordId || imageCount <= 1) return;

  const direction = Number(button.dataset.direction || 0);
  const currentIndex = attachmentImageIndexes[recordId] || 0;
  attachmentImageIndexes[recordId] = (currentIndex + direction + imageCount) % imageCount;
  renderRecords();
});

prevRecordBtn.addEventListener("click", () => {
  currentRecordIndex -= 1;
  renderRecords();
});

nextRecordBtn.addEventListener("click", () => {
  currentRecordIndex += 1;
  renderRecords();
});

[cardFilter, statusFilter, searchInput].forEach((input) => {
  input.addEventListener("input", () => {
    currentRecordIndex = 0;
    renderRecords();
  });
});

loadBtn.addEventListener("click", loadRecords);
