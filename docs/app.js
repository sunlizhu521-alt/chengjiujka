let cardDetails = window.CHENGJIUKA_CARD_DETAILS || {};
const cardChoices = document.querySelector("#cardChoices");
const cardFilterButtons = Array.from(document.querySelectorAll(".card-filter-btn"));
const cardInfo = document.querySelector("#cardInfo");
const form = document.querySelector("#applicationForm");
const message = document.querySelector("#message");
const resultQueryForm = document.querySelector("#resultQueryForm");
const queryResult = document.querySelector("#queryResult");
const dateInput = form.querySelector('input[name="applicationDate"]');
const applicantNameInput = form.querySelector('input[name="applicantName"]');
const querySecretField = document.querySelector("#querySecretField");
const querySecretInput = form.querySelector('input[name="querySecret"]');
const querySecretHint = document.querySelector("#querySecretHint");
const attachmentInput = document.querySelector("#attachmentInput");
const attachmentList = document.querySelector("#attachmentList");
const uploadCount = document.querySelector("#uploadCount");
const localTestApiBase = "http://localhost:3000";
const configuredApiBase = (window.CHENGJIUKA_API_BASE || localTestApiBase).replace(/\/$/, "");
const isGithubPages = window.location.hostname.endsWith("github.io");
let selectedCardType = "";
let selectedFiles = [];
let currentCardFilter = "open";
let applicantHasHistorySecret = false;
let secretStatusTimer = null;

dateInput.valueAsDate = new Date();

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function formatCardScore(score) {
  const value = String(score || "").trim();
  if (!value) return "暂未开放";
  return value.endsWith("分") ? value : `${value}分`;
}

function isOpenCard(detail) {
  return Boolean(String((detail || {}).definition || "").trim());
}

function currentCardButtons() {
  return Array.from(document.querySelectorAll(".card-choice"));
}

function snapshotApplicationState() {
  const values = {};
  new FormData(form).forEach((value, key) => {
    values[key] = value;
  });
  return {
    values,
    files: selectedFiles.slice(),
    hasHistorySecret: applicantHasHistorySecret
  };
}

function restoreApplicationState(snapshot) {
  Object.entries(snapshot.values).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field || field.type === "file") return;
    if (field.type === "checkbox" || field.type === "radio") {
      field.checked = field.value === value;
      return;
    }
    field.value = value;
  });
  selectedFiles = snapshot.files.slice();
  renderSelectedFiles();
  updateQuerySecretVisibility(snapshot.hasHistorySecret);
  if (snapshot.values.querySecret) {
    querySecretInput.value = snapshot.values.querySecret;
  }
}

function renderCardChoices() {
  const isOpenFilter = currentCardFilter === "open";
  const cards = Object.entries(cardDetails).filter(([, detail]) => isOpenCard(detail) === isOpenFilter);

  cardChoices.innerHTML =
    cards
      .map(([name, detail]) => {
        const isOpen = isOpenCard(detail);
        const isSelected = selectedCardType === name;
        return `
          <button
            class="card-choice ${isSelected ? "is-selected" : ""} ${isOpen ? "" : "is-closed"}"
            type="button"
            data-card-type="${escapeHtml(name)}"
            aria-pressed="${isSelected}"
          >
            <span>${escapeHtml(name)}</span>
          </button>
        `;
      })
      .join("") || '<p class="empty-files">暂无对应成就卡。</p>';
}

function renderCardInfo(name) {
  const detail = cardDetails[name];
  if (!detail) {
    cardInfo.hidden = true;
    cardInfo.innerHTML = "";
    return;
  }

  if (!isOpenCard(detail)) {
    cardInfo.hidden = false;
    cardInfo.innerHTML = `
      <h3>${escapeHtml(name)}</h3>
      <div class="closed-card-notice">
        <strong>暂未开放</strong>
        <p>该成就卡目前还没有明确的成就卡定义、申请细则和评审细则，暂不支持提交申请。</p>
      </div>
    `;
    return;
  }

  cardInfo.hidden = false;
  cardInfo.innerHTML = `
    <h3>${escapeHtml(name)}</h3>
    <div class="meta-grid">
      <div class="meta"><strong>周期</strong>${escapeHtml(detail.cycle)}</div>
      <div class="meta"><strong>分值</strong>${escapeHtml(formatCardScore(detail.score))}</div>
    </div>
    <p><strong>成就卡定义：</strong>${escapeHtml(detail.definition)}</p>
    <p><strong>申请细则：</strong></p>
    <ol>${detail.applicationRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ol>
    <p><strong>评审细则：</strong></p>
    <ol>${detail.reviewRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ol>
  `;
}

function selectCard(name) {
  const snapshot = snapshotApplicationState();
  const detail = cardDetails[name];
  if (!isOpenCard(detail)) {
    selectedCardType = "";
    currentCardButtons().forEach((button) => {
      button.classList.remove("is-selected");
      button.setAttribute("aria-pressed", "false");
    });
    renderCardInfo(name);
    restoreApplicationState(snapshot);
    setMessage("该成就卡暂未开放，暂不支持提交申请。", "error");
    return;
  }

  selectedCardType = name;
  currentCardButtons().forEach((button) => {
    const isSelected = button.dataset.cardType === name;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderCardInfo(name);
  restoreApplicationState(snapshot);
  setMessage("", "");
}

function clearCardSelection() {
  selectedCardType = "";
  currentCardButtons().forEach((button) => {
    button.classList.remove("is-selected");
    button.setAttribute("aria-pressed", "false");
  });
  renderCardInfo("");
}

function setMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type || ""}`;
}

function setQueryResult(content, type = "") {
  queryResult.className = `query-result ${type}`;
  queryResult.innerHTML = content;
}

function renderResultRecords(records) {
  if (!records.length) {
    return '<p class="empty-files">未查询到匹配的申请记录，请核对姓名和秘钥。</p>';
  }

  return records
    .map(
      (item) => `
        <article class="result-card">
          <div class="result-card-head">
            <strong>${escapeHtml(item.cardType)}</strong>
            <span class="result-status">${escapeHtml(item.reviewStatus || "待评审")}</span>
          </div>
          <div class="result-grid">
            <div><span>申报日期</span>${escapeHtml(item.applicationDate || "未填写")}</div>
            <div><span>评审日期</span>${escapeHtml(item.reviewDate || "暂未评审")}</div>
            <div><span>成就卡分值</span>${escapeHtml(item.score ? `${item.score}分` : "暂未评定")}</div>
          </div>
          <p><strong>评审建议：</strong>${escapeHtml(item.reviewComment || "暂无评审建议")}</p>
        </article>
      `
    )
    .join("");
}

function formatFileSize(size) {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
}

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function renderSelectedFiles() {
  uploadCount.textContent = `已选 ${selectedFiles.length}/10`;

  if (selectedFiles.length === 0) {
    attachmentList.innerHTML = '<p class="empty-files">尚未选择材料。点击上方区域添加文件。</p>';
    return;
  }

  attachmentList.innerHTML = `
    <strong>已选材料</strong>
    <ul>
      ${selectedFiles
        .map(
          (file, index) => `
            <li>
              <span class="file-index">${index + 1}</span>
              <span class="file-name">${escapeHtml(file.name)} <em>${escapeHtml(formatFileSize(file.size))}</em></span>
              <button type="button" class="remove-file-btn" data-file-index="${index}">移除</button>
            </li>
          `
        )
        .join("")}
    </ul>
  `;
}

function addSelectedFiles(files) {
  const existingKeys = new Set(selectedFiles.map(fileKey));
  const incoming = Array.from(files).filter((file) => !existingKeys.has(fileKey(file)));
  selectedFiles = selectedFiles.concat(incoming).slice(0, 10);
  attachmentInput.value = "";
  renderSelectedFiles();
}

function hasBackend() {
  return Boolean(configuredApiBase || !isGithubPages);
}

function apiUrl(path) {
  return configuredApiBase ? `${configuredApiBase}${path}` : path;
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

function updateQuerySecretVisibility(hasSecret) {
  applicantHasHistorySecret = hasSecret;
  querySecretField.hidden = hasSecret;
  querySecretInput.required = !hasSecret;
  if (hasSecret) {
    querySecretInput.value = "";
    querySecretHint.textContent = "已申请过，系统会自动沿用之前设置的查询秘钥。";
    return;
  }
  querySecretHint.textContent = "首次申请必填；同一姓名后续申请会自动沿用之前设置的查询秘钥。";
}

async function refreshApplicantSecretStatus() {
  const applicantName = applicantNameInput.value.trim();
  if (!applicantName || !hasBackend()) {
    updateQuerySecretVisibility(false);
    return false;
  }

  const response = await fetch(apiUrl(`/api/applicants/secret-status?applicantName=${encodeURIComponent(applicantName)}`));
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "查询申请人状态失败");
  updateQuerySecretVisibility(Boolean(result.hasSecret));
  return Boolean(result.hasSecret);
}

cardFilterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const snapshot = snapshotApplicationState();
    currentCardFilter = button.dataset.cardFilter;
    cardFilterButtons.forEach((item) => {
      const isSelected = item === button;
      item.classList.toggle("is-selected", isSelected);
      item.setAttribute("aria-pressed", String(isSelected));
    });
    clearCardSelection();
    renderCardChoices();
    restoreApplicationState(snapshot);
    setMessage("", "");
  });
});

cardChoices.addEventListener("click", (event) => {
  const button = event.target.closest(".card-choice");
  if (!button) return;
  selectCard(button.dataset.cardType);
});

attachmentInput.addEventListener("change", () => {
  addSelectedFiles(attachmentInput.files);
});

attachmentList.addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-file-btn")) {
    return;
  }
  const index = Number(event.target.dataset.fileIndex);
  selectedFiles = selectedFiles.filter((file, fileIndex) => fileIndex !== index);
  renderSelectedFiles();
});

applicantNameInput.addEventListener("input", () => {
  clearTimeout(secretStatusTimer);
  secretStatusTimer = setTimeout(() => {
    refreshApplicantSecretStatus().catch(() => {
      updateQuerySecretVisibility(false);
    });
  }, 350);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedCardType) {
    setMessage("请先选择申报成就卡项目。", "error");
    const firstOpenButton = currentCardButtons().find((button) => !button.classList.contains("is-closed"));
    if (firstOpenButton) {
      firstOpenButton.focus();
    }
    return;
  }

  if (!hasBackend()) {
    setMessage("当前固定入口还没有配置后端地址，请管理员先部署后端并填写 docs/config.js。", "error");
    return;
  }

  try {
    await refreshApplicantSecretStatus();
  } catch (error) {
    setMessage(error.message, "error");
    return;
  }

  if (!applicantHasHistorySecret && querySecretInput.value.trim().length < 4) {
    setMessage("首次申请请设置至少4位查询秘钥。", "error");
    querySecretInput.focus();
    return;
  }

  const data = new FormData(form);
  data.delete("attachments");
  data.set("cardType", selectedCardType);
  selectedFiles.forEach((file) => {
    data.append("attachments", file, file.name);
  });

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";
  setMessage("", "");

  try {
    const response = await fetch(apiUrl("/api/submissions"), {
      method: "POST",
      body: data
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "提交失败");

    form.reset();
    dateInput.valueAsDate = new Date();
    updateQuerySecretVisibility(false);
    selectedFiles = [];
    renderSelectedFiles();
    clearCardSelection();
    const secretTip = result.querySecretInherited ? "已沿用你之前设置的查询秘钥。" : "请妥善保存查询秘钥。";
    setMessage(`${result.message} 编号：${result.id}。${secretTip}`, "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "提交申请";
  }
});

resultQueryForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!hasBackend()) {
    setQueryResult('<p class="message error">当前固定入口还没有配置后端地址，请管理员先部署后端并填写 docs/config.js。</p>', "error");
    return;
  }

  const submitBtn = resultQueryForm.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(resultQueryForm).entries());
  submitBtn.disabled = true;
  submitBtn.textContent = "查询中...";
  setQueryResult("", "");

  try {
    const response = await fetch(apiUrl("/api/results/query"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "查询失败");
    setQueryResult(renderResultRecords(result.records || []), result.records && result.records.length ? "success" : "");
  } catch (error) {
    setQueryResult(`<p class="message error">${escapeHtml(error.message)}</p>`, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "查询结果";
  }
});

async function initializePage() {
  renderSelectedFiles();
  await loadCardDetails();
  renderCardChoices();
}

initializePage();
