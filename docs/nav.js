const pageNavItems = [
  { key: "applicationPage", label: "申请页面", href: "./index.html", public: true },
  { key: "reviewPage", label: "评审页面", href: "./admin.html" },
  { key: "permissionManagement", label: "权限管理", href: "./admin.html#permissionPanel" },
  { key: "resultSummary", label: "结果汇总", href: "./summary.html" },
  { key: "infoConfig", label: "信息配置", href: "./admin.html#cardConfigPanel" },
  { key: "passed", label: "成就卡榜单", href: "./passed.html", public: true, secondary: true }
];

const legacyPageKeyMapForNav = {
  reviewDesk: "reviewPage",
  summary: "resultSummary",
  cardConfig: "infoConfig"
};

function readNavUser() {
  try {
    return JSON.parse(localStorage.getItem("chengjiukaReviewUser") || "null");
  } catch {
    return null;
  }
}

function normalizedNavAccess(user) {
  if (!user) return [];
  if (user.role === "admin" || user.name === "孙立柱") {
    return ["applicationPage", "reviewPage", "permissionManagement", "resultSummary", "infoConfig"];
  }
  const access = Array.isArray(user.pageAccess) ? user.pageAccess : [];
  return [...new Set(access.map((key) => legacyPageKeyMapForNav[key] || key))];
}

function isCurrentNavItem(href) {
  const current = window.location.pathname.split("/").pop() || "index.html";
  const target = href.replace("./", "").split("#")[0];
  return current === target;
}

function renderPageNav() {
  const nav = document.querySelector("[data-page-nav]");
  if (!nav) return;

  const user = readNavUser();
  const access = new Set(normalizedNavAccess(user));
  const items = pageNavItems.filter((item) => {
    if (item.key === "passed") return true;
    if (!user && item.public) return true;
    return access.has(item.key);
  });

  nav.innerHTML = items
    .map((item) => {
      const classNames = ["admin-link"];
      if (item.secondary || isCurrentNavItem(item.href)) classNames.push("secondary-link");
      return `<a class="${classNames.join(" ")}" href="${item.href}">${item.label}</a>`;
    })
    .join("");
}

renderPageNav();
