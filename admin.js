let allRecords = [];
let currentRecordIndex = 0;
const attachmentImageIndexes = {};

const cardDetails = {
  奋斗者: {
    definition:
      "员工在保证身体健康和工作状态的前提下，基于工作需要自愿投入非正常上班时间，持续保持较高专注度和责任心，体现积极负责、主动奋斗的工作状态。",
    applicationRules: [
      "员工需主动提交申请，并说明自愿投入的具体工作事项或场景。",
      "由人事协助核实申请人最近30天打卡记录。",
      "投入时长计算口径为：最近30天内，扣除正常上班时间和已提交加班申请的时间后，员工自愿投入工作的额外时长。",
      "自愿投入时长在公司员工中排名前10%的，可作为认定依据。",
      "结合日常情况核查是否存在代打卡、异常打卡、无效留岗等弄虚作假情况。",
      "如存在弄虚作假、无实际工作投入或明显影响工作状态，不予认定。",
      "相关材料提交至成就卡评审小组，由评审小组审核认定。"
    ],
    cycle: "一年",
    score: 10,
    reviewRules: [
      "员工申请材料。",
      "人事辅助核实结果、最近30天打卡记录、加班申请记录、异常打卡核查记录。",
      "成就卡评审小组审核结果。"
    ]
  },
  分享达人: {
    definition:
      "员工主动将自己的工作经验、专业知识、工具方法或优秀案例整理成可分享的内容，并申请组织正式分享会进行现场分享，帮助团队提升能力或工作效率。",
    applicationRules: [
      "分享内容需与工作经验、专业知识、工具方法或优秀案例相关。",
      "员工需提前申请组织正式分享会，明确分享主题、分享人、时间和参会人员。",
      "分享会实际参加人数不少于10人。",
      "分享会现场需使用成就卡评审小组提供的评分二维码进行满意度评分，满分5颗星，平均评分超过4颗星即可认定。",
      "分享会需保留现场记录，如签到、照片、会议纪要或分享记录。",
      "分享资料、分享内容和现场记录需提交至成就卡评审小组。",
      "分享内容和现场组织需真实有效，无明显敷衍或走形式情况。"
    ],
    cycle: "一年",
    score: 10,
    reviewRules: [
      "分享资料、分享内容、分享会申请记录、正式分享会记录、参会签到记录、现场照片/会议纪要。",
      "评审小组评分结果、成就卡评审小组审核结果。"
    ]
  },
  业绩之王: {
    definition: "面向所有运营同事，奖励在季度业绩中贡献占比最高，或在新业务增长中表现最突出的员工。",
    applicationRules: [
      "每季度评定一次，提交时间为每个季度第一个月。",
      "参考数据为上一季度财务确认后的业绩数据。",
      "个人运营业绩占所在事业部总业绩比例最高的，可评为业绩之王。",
      "新业务按季度业绩增长率评定，增长最快且连续3个月增速均达到30%以上的，可评为业绩之王。",
      "由事业部提报候选人及业绩说明，财务部门辅助提供或核实相关业绩数据。",
      "数据需真实有效，无异常订单、虚假数据或重大客户投诉。",
      "相关材料提交至成就卡评审小组，由评审小组审核认定。"
    ],
    cycle: "一季度",
    score: 10,
    reviewRules: [
      "上一季度财务业绩数据、事业部季度业绩数据、个人业绩明细、新业务月度增长数据、事业部提报材料。",
      "财务部门辅助核实结果。",
      "成就卡评审小组审核结果。"
    ]
  },
  文化先锋: {
    definition:
      "员工主动践行和传播公司文化，在工作中有具体正向事迹或实际行动，能够体现公司愿景、使命、价值观、经营理念或团队精神。",
    applicationRules: [
      "员工需有主动践行或传播公司文化的具体事迹，不限于文化分享、正向案例、客户服务、团队协作、产品使命实践等。",
      "事迹需真实、正向，有明确发生时间、事项经过和实际影响。",
      "申请人需提交事迹说明及相关证明材料。",
      "相关材料提交至成就卡评审小组，由评审小组审核认定。"
    ],
    cycle: "一年",
    score: 10,
    reviewRules: [
      "事迹说明、照片/截图/记录等证明材料。",
      "成就卡评审小组审核结果。"
    ]
  },
  最美工位: {
    definition:
      "员工长期保持个人工位干净整洁、物品摆放有序，并主动维护办公环境，展现良好的职业形象和办公习惯。",
    applicationRules: [
      "第一批收集全公司员工工位照片，由全公司投票评选，得票前三名可评为最美工位。",
      "后续新增申报人员需提交工位照片，参考已获得者标准进行评定。",
      "后续评定采用投票制，支持票数超过60%即可获得。",
      "工位需日常保持整洁有序，不能只在评定前临时整理。",
      "如日常检查中发现工位明显脏乱，可取消申报或认定资格。"
    ],
    cycle: "一季度",
    score: 5,
    reviewRules: [
      "工位照片、全公司投票结果。",
      "成就卡评审小组审核结果。",
      "行政日常检查/抽查记录。"
    ]
  }
};

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
  const imageBlock = renderImageCarousel(imageFiles, token, recordId);
  const fileBlock =
    otherFiles.length > 0
      ? `<ul class="file-download-list">${otherFiles.map((file) => renderFileDownload(file, token)).join("")}</ul>`
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
            <p><strong>成就卡定义：</strong>${escapeHtml(detail.definition || "未配置")}</p>
            <p><strong>申请细则：</strong></p>
            ${renderRuleList(detail.applicationRules || [])}
            <div class="meta-grid">
              <div class="meta"><strong>周期</strong>${escapeHtml(detail.cycle || "未配置")}</div>
              <div class="meta"><strong>分值</strong>${escapeHtml(autoScore ? `${autoScore}分` : "未配置")}</div>
            </div>
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
              <div class="reviewer-checks" role="group" aria-label="是否通过投票">
                <strong>是否通过投票：</strong>
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
