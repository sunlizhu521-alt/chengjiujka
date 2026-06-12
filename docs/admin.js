let allRecords = [];
let currentRecordIndex = 0;
let authToken = localStorage.getItem("chengjiukaReviewToken") || "";
let currentUser = null;
const attachmentImageIndexes = {};

const cardDetails = window.CHENGJIUKA_CARD_DETAILS || {};
const reviewMembers = ["孙立柱", "王斌", "惠李伟", "蒋炳兰", "任蒨"];

const loginPanel = document.querySelector("#loginPanel");
const reviewApp = document.querySelector("#reviewApp");
const loginForm = document.querySelector("#loginForm");
const loginName = document.querySelector("#loginName");
const loginSecret = document.querySelector("#loginSecret");
const setupForm = document.querySelector("#setupForm");
const setupSecret = document.querySelector("#setupSecret");
const loginMessage = document.querySelector("#loginMessage");
const currentUserLabel = document.querySelector("#currentUserLabel");
const summaryEntry = document.querySelector("#summaryEntry");
const logoutBtn = document.querySelector("#logoutBtn");
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

function formatFileSize(size) {
  const value = Number(size || 0);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function setAdminMessage(text, type) {
  adminMessage.textContent = text;
  adminMessage.className = `message admin-message ${type || ""}`;
}

function setLoginMessage(text, type) {
  loginMessage.textContent = text;
  loginMessage.className = `message ${type || ""}`;
}

function hasBackend() {
  return Boolean(configuredApiBase || !isGithubPages);
}

function apiUrl(path) {
  return configuredApiBase ? `${configuredApiBase}${path}` : path;
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    "x-review-token": authToken
  };
}

function normalizeReviewStatus(status) {
  if (status === "驳回") return "不通过";
  if (status === "需补充") return "需补资料";
  return status || "待评审";
}

function badgeClass(status) {
  status = normalizeReviewStatus(status);
  if (status === "通过") return "badge pass";
  if (status === "不通过") return "badge reject";
  if (status === "待评审" || status === "需补资料") return "badge pending";
  return "badge";
}

function renderRuleList(rules) {
  if (!rules || rules.length === 0) return "<p>未配置。</p>";
  return `<ol>${rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ol>`;
}

function fileUrl(file, options = {}) {
  const query = new URLSearchParams({ reviewToken: authToken });
  if (options.download) query.set("download", "1");
  return apiUrl(`/api/files/${encodeURIComponent(file.filename)}?${query.toString()}`);
}

function isPreviewImage(file) {
  return String(file.mimetype || "").startsWith("image/");
}

function renderImageCarousel(files, carouselKey) {
  if (files.length === 0) return "";
  const savedIndex = attachmentImageIndexes[carouselKey] || 0;
  const currentIndex = Math.min(Math.max(savedIndex, 0), files.length - 1);
  attachmentImageIndexes[carouselKey] = currentIndex;
  const file = files[currentIndex];
  const href = fileUrl(file);
  const name = escapeHtml(file.originalName);

  return `
    <div class="image-carousel" data-carousel-key="${escapeHtml(carouselKey)}">
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

function renderFileDownload(file) {
  const href = fileUrl(file, { download: true });
  const name = escapeHtml(file.originalName);
  const size = escapeHtml(formatFileSize(file.size));

  return `
    <li class="file-download-item">
      <span>${name} <em>${size}</em></span>
      <a class="download-button" href="${href}" download="${name}">下载</a>
    </li>
  `;
}

function renderAttachmentPreviewList(files, recordId, groupName) {
  const imageFiles = (files || []).filter(isPreviewImage);
  const otherFiles = (files || []).filter((file) => !isPreviewImage(file));
  const imageBlock =
    imageFiles.length > 0
      ? `
        <section class="attachment-section">
          <div class="attachment-section-head">
            <h4>图片材料</h4>
            <span>${imageFiles.length} 个</span>
          </div>
          ${renderImageCarousel(imageFiles, `${recordId}-${groupName}-images`)}
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
          <ul class="file-download-list">${otherFiles.map(renderFileDownload).join("")}</ul>
        </section>
      `
      : "";

  return imageBlock || fileBlock ? `${imageBlock}${fileBlock}` : '<p class="empty-files">暂无附件。</p>';
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
      item.reviewComment,
      item.reviewer
    ]
      .join(" ")
      .toLowerCase();
    return matchesCard && matchesStatus && (!keyword || haystack.includes(keyword));
  });
}

function renderSummary(records) {
  const total = records.length;
  const pending = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "待评审").length;
  const passed = records.filter((item) => normalizeReviewStatus(item.reviewStatus) === "通过").length;
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

function renderVoteProgress(item) {
  const votes = item.reviewVotes || {};
  return `
    <div class="vote-progress">
      <strong>评审进度</strong>
      <div class="vote-pills">
        ${reviewMembers
          .map((name) => {
            const vote = votes[name];
            const status = vote ? vote.status : "未评审";
            return `<span class="vote-pill ${badgeClass(status)}">${escapeHtml(name)}：${escapeHtml(status)}</span>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderFeedbackFiles(item) {
  const files = item.feedbackFiles || [];
  const canUpload = currentUser && currentUser.canUploadFeedback;
  const uploadForm = canUpload
    ? `
      <form class="feedback-upload-form">
        <label class="feedback-upload-box">
          <input type="file" name="feedbackFiles" multiple />
          <span>上传评审组收集反馈文件</span>
          <small>只有孙立柱可上传，支持图片和任意文件，可多选。</small>
        </label>
        <button type="submit">上传反馈文件</button>
      </form>
    `
    : "";

  return `
    <section class="feedback-files">
      <div class="section-title-row">
        <strong>评审组收集反馈文件</strong>
        <span>${files.length > 0 ? `已上传 ${files.length} 个` : "未上传"}</span>
      </div>
      <div class="attachment-preview-list">${renderAttachmentPreviewList(files, item.id, "feedback")}</div>
      ${files.length === 0 ? '<p class="empty-files">需先上传评审组收集反馈文件，才可以进行评审。</p>' : ""}
      ${uploadForm}
    </section>
  `;
}

function renderQuerySecretAdmin(item) {
  if (!currentUser || currentUser.role !== "admin") return "";
  const resetAt = item.querySecretResetAt ? `最近重置：${formatDate(item.querySecretResetAt)}` : "未重置过";

  return `
    <section class="query-secret-admin">
      <h3>查询秘钥管理</h3>
      <form class="query-secret-lookup-form">
        <label class="field">
          <span>提交人姓名</span>
          <input name="applicantName" type="text" placeholder="输入姓名后查看秘钥" />
        </label>
        <button type="submit">查看秘钥</button>
      </form>
      <div class="query-secret-lookup-result">
        <p class="empty-files">请输入提交人姓名后点击查看。</p>
      </div>
      <p><strong>当前记录状态：</strong>${item.querySecretSet === false ? "未设置" : "已设置"}，${escapeHtml(resetAt)}</p>
      <form class="query-secret-form">
        <label class="field">
          <span>新的查询秘钥</span>
          <input name="querySecret" type="text" minlength="4" placeholder="至少 4 位" required />
        </label>
        <button type="submit">重置查询秘钥</button>
      </form>
    </section>
  `;
}

function renderQuerySecretLookup(records, applicantName) {
  if (!applicantName) {
    return '<p class="empty-files">请输入提交人姓名后点击查看。</p>';
  }
  if (records.length === 0) {
    return `<p class="empty-files">未查询到“${escapeHtml(applicantName)}”的申请记录。</p>`;
  }

  const rows = records
    .map((record) => {
      const secretText = record.querySecretPlain ? record.querySecretPlain : "历史记录不可查看，可重置";
      return `
        <tr>
          <td>${escapeHtml(record.applicantName)}</td>
          <td>${escapeHtml(record.cardType)}</td>
          <td>${escapeHtml(secretText)}</td>
          <td>${escapeHtml(record.querySecretResetAt ? formatDate(record.querySecretResetAt) : "未重置")}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="query-secret-table-wrap">
      <table class="query-secret-table">
        <thead>
          <tr>
            <th>提交人姓名</th>
            <th>成就卡</th>
            <th>查询秘钥</th>
            <th>重置时间</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderReviewForm(item) {
  const filesReady = (item.feedbackFiles || []).length > 0;
  const myVote = ((item.reviewVotes || {})[currentUser.name] || {});
  const disabledAttr = filesReady ? "" : "disabled";

  return `
    <section class="review-feedback">
      <h3>评审反馈</h3>
      ${renderVoteProgress(item)}
      <form class="review-form">
        <div class="review-result-options" role="group" aria-label="评审结果">
          <strong>评审结果：<b>*</b></strong>
          ${["通过", "不通过", "需补资料"]
            .map(
              (status) => `
                <label>
                  <input type="radio" name="reviewStatus" value="${status}" ${myVote.status === status ? "checked" : ""} ${disabledAttr} required />
                  <span>${status}</span>
                </label>
              `
            )
            .join("")}
        </div>
        <label class="field review-comment-field">
          <span>评审意见</span>
          <textarea name="reviewComment" rows="2" ${disabledAttr}>${escapeHtml(myVote.comment || "")}</textarea>
        </label>
        <button type="submit" ${disabledAttr}>保存我的评审</button>
      </form>
    </section>
  `;
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

  if (currentRecordIndex >= records.length) currentRecordIndex = records.length - 1;
  if (currentRecordIndex < 0) currentRecordIndex = 0;

  updatePagerButtons(records.length);

  const item = records[currentRecordIndex];
  const detail = cardDetails[item.cardType] || { applicationRules: [], reviewRules: [], score: "" };
  const autoScore = detail.score || "";
  const attachments = renderAttachmentPreviewList(item.attachments || [], item.id, "apply");
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
        <div><strong>最终结果</strong>${escapeHtml(currentStatus)}</div>
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
        <strong>申请材料预览</strong>
        <div class="attachment-preview-list">${attachments}</div>
      </div>

      ${renderFeedbackFiles(item)}
      ${renderReviewForm(item)}
      ${renderQuerySecretAdmin(item)}
    </article>
  `;
}

function showReviewApp(user) {
  currentUser = user;
  currentUserLabel.textContent = `${user.name}（${user.role === "admin" ? "管理员" : "评审人"}）`;
  summaryEntry.hidden = user.role !== "admin";
  summaryEntry.style.display = user.role === "admin" ? "" : "none";
  loginPanel.hidden = true;
  loginPanel.style.display = "none";
  reviewApp.hidden = false;
  reviewApp.style.display = "";
}

function showLogin() {
  currentUser = null;
  authToken = "";
  localStorage.removeItem("chengjiukaReviewToken");
  localStorage.removeItem("chengjiukaReviewUser");
  summaryEntry.hidden = true;
  summaryEntry.style.display = "none";
  loginPanel.hidden = false;
  loginPanel.style.display = "";
  reviewApp.hidden = true;
  reviewApp.style.display = "none";
  setupForm.hidden = true;
  allRecords = [];
}

async function loadRecords() {
  if (!hasBackend()) {
    setAdminMessage("当前固定入口还没有配置后端地址，请管理员先部署后端并填写 docs/config.js。", "error");
    return;
  }
  if (!authToken) {
    setAdminMessage("请先登录评审账号。", "error");
    return;
  }

  loadBtn.disabled = true;
  loadBtn.textContent = "加载中...";
  setAdminMessage("", "");

  try {
    const response = await fetch(apiUrl("/api/submissions"), {
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载失败");
    allRecords = result;
    renderRecords();
    setAdminMessage("记录已加载。", "success");
  } catch (error) {
    setAdminMessage(error.message, "error");
    if (/登录|权限|token|401/.test(error.message)) showLogin();
  } finally {
    loadBtn.disabled = false;
    loadBtn.textContent = "加载记录";
  }
}

function replaceRecord(updatedRecord) {
  allRecords = allRecords.map((item) => (item.id === updatedRecord.id ? updatedRecord : item));
  const records = filteredRecords();
  if (currentRecordIndex >= records.length) currentRecordIndex = Math.max(records.length - 1, 0);
  renderRecords();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!hasBackend()) {
    setLoginMessage("当前固定入口还没有配置后端地址。", "error");
    return;
  }

  const payload = Object.fromEntries(new FormData(loginForm).entries());
  setLoginMessage("", "");

  try {
    const response = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "登录失败");
    if (result.needsSetup) {
      setupForm.hidden = false;
      setupSecret.focus();
      setLoginMessage(result.message || "首次登录请设置秘钥。", "error");
      return;
    }
    authToken = result.token;
    localStorage.setItem("chengjiukaReviewToken", authToken);
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    showReviewApp(result.user);
    await loadRecords();
  } catch (error) {
    setLoginMessage(error.message, "error");
  }
});

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    name: loginName.value,
    secret: setupSecret.value
  };

  try {
    const response = await fetch(apiUrl("/api/auth/setup"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "设置失败");
    authToken = result.token;
    localStorage.setItem("chengjiukaReviewToken", authToken);
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    showReviewApp(result.user);
    await loadRecords();
  } catch (error) {
    setLoginMessage(error.message, "error");
  }
});

recordsEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const record = event.target.closest(".record");
  const id = record ? record.dataset.id : "";

  if (event.target.classList.contains("feedback-upload-form")) {
    const form = event.target;
    const input = form.querySelector('input[type="file"]');
    if (!input.files.length) {
      setAdminMessage("请选择要上传的评审组反馈文件。", "error");
      return;
    }

    const data = new FormData(form);
    try {
      const response = await fetch(apiUrl(`/api/submissions/${id}/feedback-files`), {
        method: "POST",
        headers: authHeaders(),
        body: data
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "上传失败");
      replaceRecord(result);
      setAdminMessage("评审组反馈文件已上传。", "success");
    } catch (error) {
      setAdminMessage(error.message, "error");
    }
    return;
  }

  if (event.target.classList.contains("query-secret-lookup-form")) {
    const form = event.target;
    const applicantName = String(new FormData(form).get("applicantName") || "").trim();
    const resultEl = form.parentElement.querySelector(".query-secret-lookup-result");
    const matchedRecords = allRecords.filter((recordItem) => recordItem.applicantName === applicantName);
    resultEl.innerHTML = renderQuerySecretLookup(matchedRecords, applicantName);
    return;
  }

  if (event.target.classList.contains("query-secret-form")) {
    const payload = Object.fromEntries(new FormData(event.target).entries());
    try {
      const response = await fetch(apiUrl(`/api/submissions/${id}/query-secret`), {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "重置失败");
      replaceRecord(result.record);
      setAdminMessage("查询秘钥已重置，请把新秘钥告知员工本人。", "success");
    } catch (error) {
      setAdminMessage(error.message, "error");
    }
    return;
  }

  const form = event.target.closest(".review-form");
  if (!form) return;

  const currentRecord = allRecords.find((item) => item.id === id);
  if (!currentRecord || !(currentRecord.feedbackFiles || []).length) {
    setAdminMessage("请先上传评审组收集反馈文件，再进行评审。", "error");
    return;
  }

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch(apiUrl(`/api/submissions/${id}/review`), {
      method: "PATCH",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "保存失败");
    replaceRecord(result);
    setAdminMessage("你的评审结果已保存，系统已按规则自动汇总最终结果。", "success");
  } catch (error) {
    setAdminMessage(error.message, "error");
  }
});

recordsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".attachment-image-prev, .attachment-image-next");
  if (!button) return;

  const carousel = button.closest(".image-carousel");
  const carouselKey = carousel ? carousel.dataset.carouselKey : "";
  if (!carouselKey) return;

  const currentRecord = filteredRecords()[currentRecordIndex];
  const files = carouselKey.includes("-feedback-") ? currentRecord.feedbackFiles || [] : currentRecord.attachments || [];
  const imageCount = files.filter(isPreviewImage).length;
  if (imageCount <= 1) return;

  const direction = Number(button.dataset.direction || 0);
  const currentIndex = attachmentImageIndexes[carouselKey] || 0;
  attachmentImageIndexes[carouselKey] = (currentIndex + direction + imageCount) % imageCount;
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

logoutBtn.addEventListener("click", showLogin);
loadBtn.addEventListener("click", loadRecords);

async function restoreSession() {
  if (!authToken || !hasBackend()) return;
  try {
    const response = await fetch(apiUrl("/api/auth/me"), {
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "登录已过期");
    showReviewApp(result.user);
    await loadRecords();
  } catch {
    showLogin();
  }
}

restoreSession();
