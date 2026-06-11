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
    score: "10分",
    reviewRules: [
      "员工申请材料。",
      "人事辅助核实结果、最近30天打卡记录、加班申请记录、异常打卡核查记录。",
      "成就卡评审小组审核结果。"
    ],
    sources:
      "员工申请材料、人事辅助核实结果、最近30天打卡记录、加班申请记录、异常打卡核查记录、成就卡评审小组审核结果。"
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
    score: "10分",
    reviewRules: [
      "分享资料、分享内容、分享会申请记录、正式分享会记录、参会签到记录、现场照片/会议纪要。",
      "评审小组评分结果、成就卡评审小组审核结果。"
    ],
    sources:
      "分享资料、分享内容、分享会申请记录、正式分享会记录、参会签到记录、现场照片/会议纪要、评审小组评分结果、成就卡评审小组审核结果。"
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
    score: "10分",
    reviewRules: [
      "上一季度财务业绩数据、事业部季度业绩数据、个人业绩明细、新业务月度增长数据、事业部提报材料。",
      "财务部门辅助核实结果。",
      "成就卡评审小组审核结果。"
    ],
    sources:
      "上一季度财务业绩数据、事业部季度业绩数据、个人业绩明细、新业务月度增长数据、事业部提报材料、财务部门辅助核实结果、成就卡评审小组审核结果。"
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
    score: "10分",
    reviewRules: [
      "事迹说明、照片/截图/记录等证明材料。",
      "成就卡评审小组审核结果。"
    ],
    sources: "事迹说明、照片/截图/记录等证明材料、成就卡评审小组审核结果。"
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
    score: "5分",
    reviewRules: [
      "工位照片、全公司投票结果。",
      "成就卡评审小组审核结果。",
      "行政日常检查/抽查记录。"
    ],
    sources: "工位照片、全公司投票结果、成就卡评审小组审核结果、行政日常检查/抽查记录。"
  }
};

const cardButtons = Array.from(document.querySelectorAll(".card-choice"));
const cardInfo = document.querySelector("#cardInfo");
const form = document.querySelector("#applicationForm");
const message = document.querySelector("#message");
const resultQueryForm = document.querySelector("#resultQueryForm");
const queryResult = document.querySelector("#queryResult");
const dateInput = form.querySelector('input[name="applicationDate"]');
const attachmentInput = document.querySelector("#attachmentInput");
const attachmentList = document.querySelector("#attachmentList");
const uploadCount = document.querySelector("#uploadCount");
const localTestApiBase = "http://localhost:3000";
const configuredApiBase = (window.CHENGJIUKA_API_BASE || localTestApiBase).replace(/\/$/, "");
const isGithubPages = window.location.hostname.endsWith("github.io");
let selectedCardType = "";
let selectedFiles = [];

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

function renderCardInfo(name) {
  const detail = cardDetails[name];
  if (!detail) {
    cardInfo.hidden = true;
    cardInfo.innerHTML = "";
    return;
  }

  cardInfo.hidden = false;
  cardInfo.innerHTML = `
    <h3>${escapeHtml(name)}</h3>
    <p><strong>成就卡定义：</strong>${escapeHtml(detail.definition)}</p>
    <p><strong>申请细则：</strong></p>
    <ol>${detail.applicationRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ol>
    <div class="meta-grid">
      <div class="meta"><strong>周期</strong>${escapeHtml(detail.cycle)}</div>
      <div class="meta"><strong>分值</strong>${escapeHtml(detail.score)}</div>
    </div>
    <p><strong>评审细则：</strong></p>
    <ol>${detail.reviewRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ol>
  `;
}

function selectCard(name) {
  selectedCardType = name;
  cardButtons.forEach((button) => {
    const isSelected = button.dataset.cardType === name;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderCardInfo(name);
}

function clearCardSelection() {
  selectedCardType = "";
  cardButtons.forEach((button) => {
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

function formatDateTime(value) {
  if (!value) return "未填写";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
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
            <div><span>申请编号</span>${escapeHtml(item.id)}</div>
            <div><span>申报日期</span>${escapeHtml(item.applicationDate || "未填写")}</div>
            <div><span>提交时间</span>${escapeHtml(formatDateTime(item.submittedAt))}</div>
            <div><span>评审日期</span>${escapeHtml(item.reviewDate || "暂未评审")}</div>
            <div><span>成就卡分值</span>${escapeHtml(item.score ? `${item.score}分` : "暂未评定")}</div>
            <div><span>是否通过投票</span>${escapeHtml(item.reviewer || "暂未填写")}</div>
          </div>
          <p><strong>评审意见：</strong>${escapeHtml(item.reviewComment || "暂无评审意见")}</p>
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

cardButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectCard(button.dataset.cardType);
  });
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedCardType) {
    setMessage("请先选择申报成就卡项目。", "error");
    if (cardButtons[0]) {
      cardButtons[0].focus();
    }
    return;
  }

  if (!hasBackend()) {
    setMessage("当前固定入口还没有配置后端地址，请管理员先部署后端并填写 docs/config.js。", "error");
    return;
  }

  if (selectedFiles.length === 0) {
    setMessage("请至少上传一个证明材料。", "error");
    attachmentInput.focus();
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
    selectedFiles = [];
    renderSelectedFiles();
    clearCardSelection();
    setMessage(`${result.message} 编号：${result.id}。请妥善保存查询秘钥。`, "success");
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

renderSelectedFiles();
