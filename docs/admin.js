let allRecords = [];
let currentRecordIndex = 0;
let authToken = localStorage.getItem("chengjiukaReviewToken") || "";
let currentUser = null;
const attachmentImageIndexes = {};

let cardDetails = window.CHENGJIUKA_CARD_DETAILS || {};
const reviewMembers = ["孙立柱", "王斌", "惠李伟", "蒋炳兰", "任蒨"];
const pageLabels = {
  applicationPage: "申请页面",
  passed: "成就卡榜单",
  reviewPage: "评审页面",
  permissionManagement: "权限管理",
  resultSummary: "结果汇总",
  infoConfig: "信息配置",
  fileMaintenance: "文件维护",
  coinManagement: "成就币管理"
};
let permissionPages = Object.entries(pageLabels).map(([key, label]) => ({ key, label }));
let permissionUsers = [];

const loginPanel = document.querySelector("#loginPanel");
const reviewApp = document.querySelector("#reviewApp");
const loginForm = document.querySelector("#loginForm");
const loginName = document.querySelector("#loginName");
const loginSecret = document.querySelector("#loginSecret");
const registerForm = document.querySelector("#registerForm");
const registerName = document.querySelector("#registerName");
const registerSecret = document.querySelector("#registerSecret");
const showLoginModeBtn = document.querySelector("#showLoginModeBtn");
const showRegisterModeBtn = document.querySelector("#showRegisterModeBtn");
const setupForm = document.querySelector("#setupForm");
const setupSecret = document.querySelector("#setupSecret");
const loginMessage = document.querySelector("#loginMessage");
const currentUserLabel = document.querySelector("#currentUserLabel");
const logoutBtn = document.querySelector("#logoutBtn");
const cardFilter = document.querySelector("#cardFilter");
const statusFilter = document.querySelector("#statusFilter");
const searchInput = document.querySelector("#searchInput");
const prevRecordBtn = document.querySelector("#prevRecordBtn");
const nextRecordBtn = document.querySelector("#nextRecordBtn");
const recordsEl = document.querySelector("#records");
const reviewPanel = document.querySelector("#reviewPanel");
const reviewToolbar = document.querySelector("#reviewToolbar");
const summaryRow = document.querySelector("#summaryRow");
const adminMessage = document.querySelector("#adminMessage");
const cardConfigPanel = document.querySelector("#cardConfigPanel");
const cardConfigEditor = document.querySelector("#cardConfigEditor");
const saveCardConfigBtn = document.querySelector("#saveCardConfigBtn");
const cardConfigMessage = document.querySelector("#cardConfigMessage");
const rosterImportForm = document.querySelector("#rosterImportForm");
const rosterFileInput = document.querySelector("#rosterFileInput");
const rosterSummary = document.querySelector("#rosterSummary");
const rosterImportMessage = document.querySelector("#rosterImportMessage");
const permissionPanel = document.querySelector("#permissionPanel");
const permissionList = document.querySelector("#permissionList");
const loadUsersBtn = document.querySelector("#loadUsersBtn");
const bulkDeleteUsersBtn = document.querySelector("#bulkDeleteUsersBtn");
const permissionMessage = document.querySelector("#permissionMessage");
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

function isAdminUser(user = currentUser) {
  return user && (user.role === "admin" || user.name === "孙立柱");
}

function isRootAdminUser(user = currentUser) {
  return user && user.name === "孙立柱" && user.role === "admin";
}

function hasPageAccess(page, user = currentUser) {
  if (isAdminUser(user)) return true;
  return Array.isArray(user?.pageAccess) && user.pageAccess.includes(page);
}

function currentAdminModule() {
  if (window.location.hash === "#permissionPanel") return "permission";
  if (window.location.hash === "#cardConfigPanel") return "config";
  return "review";
}

function applyAdminModule() {
  if (!currentUser) return;
  const module = currentAdminModule();
  const showReview = module === "review" && hasPageAccess("reviewPage");
  const showPermission = module === "permission" && isAdminUser();
  const showConfig = module === "config" && isAdminUser();

  if ((module === "permission" && !showPermission) || (module === "config" && !showConfig)) {
    if (hasPageAccess("reviewPage")) {
      window.location.hash = "reviewPanel";
      return;
    }
  }

  reviewPanel.hidden = false;
  reviewToolbar.hidden = !showReview;
  summaryRow.hidden = !showReview;
  recordsEl.hidden = !showReview;
  adminMessage.hidden = !showReview;
  cardConfigPanel.hidden = !showConfig;
  permissionPanel.hidden = !showPermission;

  if (module === "permission" && !showPermission) {
    setAdminMessage("当前账号暂无权限管理权限。", "error");
  }
  if (module === "config" && !showConfig) {
    setAdminMessage("当前账号暂无信息配置权限。", "error");
  }

  if (typeof renderPageNav === "function") renderPageNav();
  if (showConfig) loadRosterSummary().catch(() => {});
}

function setAuthMode(mode) {
  const isRegister = mode === "register";
  loginForm.hidden = isRegister;
  registerForm.hidden = !isRegister;
  setupForm.hidden = true;
  showLoginModeBtn.classList.toggle("active", !isRegister);
  showRegisterModeBtn.classList.toggle("active", isRegister);
  setLoginMessage("", "");
  if (isRegister) registerName.focus();
  else loginName.focus();
}

async function loadCardDetails() {
  if (!hasBackend()) return;

  try {
    const response = await fetch(apiUrl("/api/card-config"));
    const result = await response.json();
    if (response.ok && result.cards && typeof result.cards === "object") {
      cardDetails = result.cards;
    }
  } catch {
    cardDetails = window.CHENGJIUKA_CARD_DETAILS || {};
  }
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    "x-review-token": authToken
  };
}

function setPermissionMessage(text, type) {
  permissionMessage.textContent = text;
  permissionMessage.className = `message ${type || ""}`;
}

function normalizeReviewStatus(status) {
  if (status === "驳回") return "不通过";
  if (status === "需补充" || status === "需补资料") return "不通过";
  return status || "待评审";
}

function badgeClass(status) {
  status = normalizeReviewStatus(status);
  if (status === "通过") return "badge pass";
  if (status === "不通过") return "badge reject";
  if (status === "待评审") return "badge pending";
  return "badge";
}

function renderRuleList(rules) {
  if (!rules || rules.length === 0) return "<p>未配置。</p>";
  return `<ol>${rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ol>`;
}

function rulesToText(rules) {
  return Array.isArray(rules) ? rules.join("\n") : "";
}

function textToRules(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function setCardConfigMessage(text, type) {
  cardConfigMessage.textContent = text;
  cardConfigMessage.className = `message ${type || ""}`;
}

function setRosterImportMessage(text, type) {
  if (!rosterImportMessage) return;
  rosterImportMessage.textContent = text;
  rosterImportMessage.className = `message ${type || ""}`;
}

function renderRosterSummary(roster = {}) {
  if (!rosterSummary) return;
  const count = Number(roster.count || 0);
  const departments = Array.isArray(roster.departments) ? roster.departments : [];
  const updatedAt = roster.updatedAt ? formatDate(roster.updatedAt) : "未导入";
  rosterSummary.innerHTML = `
    <span>员工：<strong>${escapeHtml(count)}</strong> 人</span>
    <span>部门：<strong>${escapeHtml(departments.length)}</strong> 个</span>
    <span>更新时间：<strong>${escapeHtml(updatedAt)}</strong></span>
  `;
}

async function loadRosterSummary() {
  if (!hasBackend() || !isAdminUser()) return;
  const response = await fetch(apiUrl("/api/roster"));
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "花名册加载失败");
  renderRosterSummary(result);
}

function renderCardConfigEditor() {
  if (!currentUser || currentUser.role !== "admin") {
    cardConfigPanel.hidden = true;
    cardConfigEditor.innerHTML = "";
    return;
  }

  cardConfigPanel.hidden = false;
  cardConfigEditor.innerHTML = Object.entries(cardDetails)
    .map(([name, detail = {}], index) => {
      const isOpen =
        typeof detail.isOpen === "boolean" ? detail.isOpen : Boolean(String(detail.definition || "").trim());
      return `
        <details class="card-config-card" data-card-name="${escapeHtml(name)}" ${index === 0 ? "open" : ""}>
          <summary>
            <strong>${escapeHtml(name)}</strong>
            <span>${isOpen ? "已开放" : "暂未开放"}</span>
          </summary>
          <div class="card-config-fields">
            <label class="card-config-switch card-config-wide">
              <input name="isOpen" type="checkbox" ${isOpen ? "checked" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
              <span>
                <strong>开放申请</strong>
                <small>开启后进入“已开放”，关闭后进入“暂未开放”且不能提交。</small>
              </span>
            </label>
            <label class="field">
              <span>周期</span>
              <input name="cycle" value="${escapeHtml(detail.cycle || "")}" />
            </label>
            <label class="field">
              <span>分值</span>
              <input name="score" type="number" min="0" step="1" value="${escapeHtml(detail.score || "")}" />
            </label>
            <label class="field card-config-wide">
              <span>成就卡定义</span>
              <textarea name="definition" rows="3">${escapeHtml(detail.definition || "")}</textarea>
            </label>
            <label class="field card-config-wide">
              <span>申请细则</span>
              <textarea name="applicationRules" rows="6" placeholder="每行一条">${escapeHtml(rulesToText(detail.applicationRules))}</textarea>
            </label>
            <label class="field card-config-wide">
              <span>评审细则</span>
              <textarea name="reviewRules" rows="6" placeholder="每行一条">${escapeHtml(rulesToText(detail.reviewRules))}</textarea>
            </label>
            <label class="field card-config-wide">
              <span>数据来源</span>
              <textarea name="sources" rows="3">${escapeHtml(detail.sources || "")}</textarea>
            </label>
          </div>
        </details>
      `;
    })
    .join("");
}

function collectCardConfigEditor() {
  const nextCards = {};
  cardConfigEditor.querySelectorAll(".card-config-card").forEach((cardEl) => {
    const name = cardEl.dataset.cardName;
    const scoreValue = cardEl.querySelector('[name="score"]').value;
    nextCards[name] = {
      ...(cardDetails[name] || {}),
      isOpen: cardEl.querySelector('[name="isOpen"]').checked,
      cycle: cardEl.querySelector('[name="cycle"]').value.trim(),
      score: scoreValue === "" ? "" : Number(scoreValue),
      definition: cardEl.querySelector('[name="definition"]').value.trim(),
      applicationRules: textToRules(cardEl.querySelector('[name="applicationRules"]').value),
      reviewRules: textToRules(cardEl.querySelector('[name="reviewRules"]').value),
      sources: cardEl.querySelector('[name="sources"]').value.trim()
    };
  });
  return nextCards;
}

function renderPermissionPanel() {
  if (!isAdminUser()) {
    permissionPanel.hidden = true;
    permissionList.innerHTML = "";
    return;
  }

  permissionPanel.hidden = false;
  if (permissionUsers.length === 0) {
    permissionList.innerHTML = '<p class="empty-text">暂无用户数据，请点击刷新用户。</p>';
    return;
  }

  const rows = permissionUsers
    .map((user) => {
      const isBuiltInAdmin = isAdminUser(user);
      const canDeleteUser = isRootAdminUser() && user.name !== "孙立柱";
      const access = new Set(user.pageAccess || []);
      const options = permissionPages
        .map(
          (page) => `
            <label class="permission-checkbox">
              <input
                type="checkbox"
                value="${escapeHtml(page.key)}"
                ${access.has(page.key) ? "checked" : ""}
                ${isBuiltInAdmin ? "disabled" : ""}
              />
              <span>${escapeHtml(page.label)}</span>
            </label>
          `
        )
        .join("");
      const roleLabel = isBuiltInAdmin ? "管理员" : user.role === "reviewer" ? "评审人" : "普通用户";
      const stats = user.stats || { submitted: 0, passed: 0 };
      const deleteButton = canDeleteUser
        ? '<button type="button" class="delete-user-btn danger-button">删除</button>'
        : "";

      return `
        <tr class="${isBuiltInAdmin ? "is-protected" : ""}" data-user-name="${escapeHtml(user.name)}">
          <td data-label="选择">
            <input class="permission-user-select" type="checkbox" value="${escapeHtml(user.name)}" ${canDeleteUser ? "" : "disabled"} />
          </td>
          <td data-label="姓名">${escapeHtml(user.name)}</td>
          <td data-label="角色">${escapeHtml(roleLabel)}</td>
          <td data-label="系统信息">
            <span class="permission-stats">提交 ${escapeHtml(stats.submitted || 0)} 个 / 通过 ${escapeHtml(stats.passed || 0)} 个</span>
          </td>
          <td data-label="页面权限">
            <div class="permission-checkbox-grid">${options}</div>
          </td>
          <td data-label="操作">
            <div class="permission-actions">
              <button type="button" class="save-user-access-btn" ${isBuiltInAdmin ? "disabled" : ""}>授权</button>
              <button type="button" class="reset-user-secret-btn secondary-button" ${isBuiltInAdmin ? "disabled" : ""}>重置密码</button>
              ${deleteButton}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  permissionList.innerHTML = `
    <div class="table-wrap permission-table-wrap">
      <table class="summary-table permission-table">
        <thead>
          <tr>
            <th><input id="permissionSelectAll" type="checkbox" aria-label="全选用户" /></th>
            <th>姓名</th>
            <th>角色</th>
            <th>系统信息</th>
            <th>页面权限</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  updateBulkDeleteButton();
}

function selectedPermissionUserNames() {
  return Array.from(permissionList.querySelectorAll(".permission-user-select:checked")).map((input) => input.value);
}

function updateBulkDeleteButton() {
  if (!bulkDeleteUsersBtn) return;
  bulkDeleteUsersBtn.disabled = selectedPermissionUserNames().length === 0;
}

async function loadPermissionUsers() {
  if (!isAdminUser()) return;
  loadUsersBtn.disabled = true;
  setPermissionMessage("", "");
  try {
    const response = await fetch(apiUrl("/api/auth/users"), {
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "加载用户失败");
    permissionPages = result.pages || permissionPages;
    permissionUsers = result.users || [];
    renderPermissionPanel();
    applyAdminModule();
    setPermissionMessage("用户权限已加载。", "success");
  } catch (error) {
    setPermissionMessage(error.message, "error");
  } finally {
    loadUsersBtn.disabled = false;
  }
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

  summaryRow.innerHTML = [
    ["当前记录", total],
    ["待评审", pending],
    ["已通过", passed],
    ["不通过", rejected]
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

function renderReviewForm(item) {
  const filesReady = (item.feedbackFiles || []).length > 0;
  const myVote = ((item.reviewVotes || {})[currentUser.name] || {});
  const hasSubmittedVote = Boolean(myVote.status);
  const disabledAttr = filesReady && !hasSubmittedVote ? "" : "disabled";
  const submitButtonText = hasSubmittedVote ? "已提交评审" : "保存我的评审";

  return `
    <section class="review-feedback">
      <h3>评审反馈</h3>
      ${renderVoteProgress(item)}
      <form class="review-form">
        <div class="review-result-options" role="group" aria-label="评审结果">
          <strong>评审结果：<b>*</b></strong>
          ${["通过", "不通过"]
            .map(
              (status) => `
                <label class="review-result-option ${status === "通过" ? "is-pass" : "is-reject"}">
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
        <button type="submit" ${disabledAttr}>${submitButtonText}</button>
      </form>
    </section>
  `;
}

function renderPublicResultConfirm(item) {
  if (!currentUser || currentUser.role !== "admin") return "";
  const publishedAt = item.resultPublishedAt ? `发布时间：${formatDate(item.resultPublishedAt)}` : "暂未发布";

  return `
    <section class="public-result-confirm">
      <h3>最终展示确认</h3>
      <p>这里填写的是员工查询时看到的最终评审意见，不显示评审人和评审过程。</p>
      <form class="public-result-form">
        <label class="field review-comment-field">
          <span>最终展示评审意见 <b>*</b></span>
          <textarea name="finalPublicComment" rows="3" placeholder="请填写给员工看的最终评审意见。">${escapeHtml(item.finalPublicComment || "")}</textarea>
        </label>
        <label class="checkline public-result-check">
          <input type="checkbox" name="resultPublished" value="1" ${item.resultPublished ? "checked" : ""} />
          <span>确认展示给申报人查询</span>
        </label>
        <div class="public-result-actions">
          <button type="submit">保存最终展示</button>
          <small>${escapeHtml(publishedAt)}</small>
        </div>
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
          <p>申请编号：${escapeHtml(item.id || "")}</p>
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
      ${renderPublicResultConfirm(item)}
    </article>
  `;
}

function showReviewApp(user) {
  currentUser = user;
  const roleLabel = user.role === "admin" ? "管理员" : user.role === "reviewer" ? "评审人" : "普通用户";
  currentUserLabel.textContent = `${user.name}（${roleLabel}）`;
  loginPanel.hidden = true;
  loginPanel.style.display = "none";
  reviewApp.hidden = false;
  reviewApp.style.display = "";
  renderCardConfigEditor();
  renderPermissionPanel();
  applyAdminModule();
  if (typeof renderPageNav === "function") renderPageNav();
}

function showLogin() {
  currentUser = null;
  authToken = "";
  localStorage.removeItem("chengjiukaReviewToken");
  localStorage.removeItem("chengjiukaReviewUser");
  loginPanel.hidden = false;
  loginPanel.style.display = "";
  reviewApp.hidden = true;
  reviewApp.style.display = "none";
  setupForm.hidden = true;
  setAuthMode("login");
  allRecords = [];
  permissionUsers = [];
  if (typeof renderPageNav === "function") renderPageNav();
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
  if (!hasPageAccess("reviewPage")) {
    setAdminMessage("当前账号暂无评审页面权限。", "error");
    return;
  }

  setAdminMessage("正在刷新记录...", "");

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
    await loadCardDetails();
    showReviewApp(result.user);
    await Promise.all([
      hasPageAccess("reviewPage", result.user) ? loadRecords() : Promise.resolve(),
      isAdminUser(result.user) ? loadPermissionUsers() : Promise.resolve()
    ]);
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
    await loadCardDetails();
    showReviewApp(result.user);
    await Promise.all([
      hasPageAccess("reviewPage", result.user) ? loadRecords() : Promise.resolve(),
      isAdminUser(result.user) ? loadPermissionUsers() : Promise.resolve()
    ]);
  } catch (error) {
    setLoginMessage(error.message, "error");
  }
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!hasBackend()) {
    setLoginMessage("当前固定入口还没有配置后端地址。", "error");
    return;
  }

  const payload = Object.fromEntries(new FormData(registerForm).entries());
  setLoginMessage("", "");

  try {
    const response = await fetch(apiUrl("/api/auth/register"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "注册失败");
    registerForm.reset();
    setAuthMode("login");
    loginName.value = payload.name || "";
    setLoginMessage(result.message || "注册成功，请等待管理员授权。", "success");
  } catch (error) {
    setLoginMessage(error.message, "error");
  }
});

showLoginModeBtn.addEventListener("click", () => setAuthMode("login"));
showRegisterModeBtn.addEventListener("click", () => setAuthMode("register"));

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

  if (event.target.classList.contains("public-result-form")) {
    const formData = new FormData(event.target);
    const payload = {
      finalPublicComment: String(formData.get("finalPublicComment") || "").trim(),
      resultPublished: formData.get("resultPublished") === "1"
    };

    try {
      const response = await fetch(apiUrl(`/api/submissions/${id}/public-result`), {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "保存失败");
      replaceRecord(result);
      setAdminMessage(payload.resultPublished ? "最终评审结果已发布给申报人查询。" : "最终展示意见已保存，暂未发布。", "success");
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
loadUsersBtn.addEventListener("click", loadPermissionUsers);
bulkDeleteUsersBtn.addEventListener("click", async () => {
  const names = selectedPermissionUserNames();
  if (names.length === 0) return;
  if (!window.confirm(`确认批量删除 ${names.length} 个用户？`)) return;

  bulkDeleteUsersBtn.disabled = true;
  try {
    const response = await fetch(apiUrl("/api/auth/users/bulk-delete"), {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ names })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "批量删除失败");
    permissionUsers = result.users || permissionUsers.filter((user) => !names.includes(user.name));
    renderPermissionPanel();
    applyAdminModule();
    setPermissionMessage(result.message || "批量删除完成。", "success");
  } catch (error) {
    setPermissionMessage(error.message, "error");
    updateBulkDeleteButton();
  }
});
window.addEventListener("hashchange", applyAdminModule);

permissionList.addEventListener("change", (event) => {
  if (event.target.id === "permissionSelectAll") {
    const checked = event.target.checked;
    permissionList.querySelectorAll(".permission-user-select:not(:disabled)").forEach((input) => {
      input.checked = checked;
    });
    updateBulkDeleteButton();
    return;
  }

  if (event.target.classList.contains("permission-user-select")) {
    const selectAll = permissionList.querySelector("#permissionSelectAll");
    const selectable = Array.from(permissionList.querySelectorAll(".permission-user-select:not(:disabled)"));
    if (selectAll) {
      selectAll.checked = selectable.length > 0 && selectable.every((input) => input.checked);
      selectAll.indeterminate = selectable.some((input) => input.checked) && !selectAll.checked;
    }
    updateBulkDeleteButton();
  }
});

permissionList.addEventListener("click", async (event) => {
  const row = event.target.closest("[data-user-name]");
  if (!row || !permissionList.contains(row)) return;
  const userName = row.dataset.userName;
  if (!userName) return;

  try {
    if (event.target.closest(".save-user-access-btn")) {
      const pageAccess = Array.from(row.querySelectorAll('.permission-checkbox-grid input[type="checkbox"]:checked')).map(
        (input) => input.value
      );
      const response = await fetch(apiUrl(`/api/auth/users/${encodeURIComponent(userName)}/access`), {
        method: "PATCH",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ pageAccess })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "保存授权失败");
      permissionUsers = permissionUsers.map((user) => (user.name === result.user.name ? result.user : user));
      renderPermissionPanel();
      applyAdminModule();
      setPermissionMessage(result.message || "用户权限已保存。", "success");
      return;
    }

    if (event.target.closest(".reset-user-secret-btn")) {
      if (!window.confirm(`确认重置 ${userName} 的登录秘钥？重置后临时秘钥为 123456。`)) return;
      const response = await fetch(apiUrl(`/api/auth/users/${encodeURIComponent(userName)}/reset-secret`), {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ secret: "123456" })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "重置秘钥失败");
      setPermissionMessage(result.message || "秘钥已重置。", "success");
      return;
    }

    if (event.target.closest(".delete-user-btn")) {
      if (!window.confirm(`确认删除账号 ${userName}？`)) return;
      const response = await fetch(apiUrl(`/api/auth/users/${encodeURIComponent(userName)}`), {
        method: "DELETE",
        headers: authHeaders()
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "删除账号失败");
      permissionUsers = result.users || permissionUsers.filter((user) => user.name !== userName);
      renderPermissionPanel();
      applyAdminModule();
      setPermissionMessage(result.message || "用户已删除。", "success");
    }
  } catch (error) {
    setPermissionMessage(error.message, "error");
  }
});

saveCardConfigBtn.addEventListener("click", async () => {
  if (!currentUser || currentUser.role !== "admin") return;

  saveCardConfigBtn.disabled = true;
  setCardConfigMessage("", "");

  try {
    const payload = { cards: collectCardConfigEditor() };
    const response = await fetch(apiUrl("/api/card-config"), {
      method: "PATCH",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "保存失败");

    cardDetails = result.cards || payload.cards;
    renderCardConfigEditor();
    applyAdminModule();
    renderRecords();
    setCardConfigMessage(result.message || "成就卡配置已保存。", "success");
  } catch (error) {
    setCardConfigMessage(error.message, "error");
  } finally {
    saveCardConfigBtn.disabled = false;
  }
});

if (rosterImportForm) {
  rosterImportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser || currentUser.role !== "admin") return;

    const file = rosterFileInput.files[0];
    if (!file) {
      setRosterImportMessage("请选择花名册 Excel 文件。", "error");
      return;
    }

    const submitButton = rosterImportForm.querySelector('button[type="submit"]');
    const data = new FormData();
    data.append("rosterFile", file, file.name);
    submitButton.disabled = true;
    setRosterImportMessage("", "");

    try {
      const response = await fetch(apiUrl("/api/roster/import"), {
        method: "POST",
        headers: authHeaders(),
        body: data
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "花名册导入失败");
      rosterFileInput.value = "";
      renderRosterSummary(result.roster);
      setRosterImportMessage(result.message || "花名册已导入。", "success");
    } catch (error) {
      setRosterImportMessage(error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function restoreSession() {
  if (!authToken || !hasBackend()) return;
  try {
    const response = await fetch(apiUrl("/api/auth/me"), {
      headers: authHeaders()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "登录已过期");
    localStorage.setItem("chengjiukaReviewUser", JSON.stringify(result.user));
    await loadCardDetails();
    showReviewApp(result.user);
    await Promise.all([
      hasPageAccess("reviewPage", result.user) ? loadRecords() : Promise.resolve(),
      isAdminUser(result.user) ? loadPermissionUsers() : Promise.resolve()
    ]);
  } catch {
    showLogin();
  }
}

restoreSession();
