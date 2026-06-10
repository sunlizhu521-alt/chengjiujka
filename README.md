# 成就卡申请与评审系统

固定入口地址：

```text
https://sunlizhu521-alt.github.io/chengjiujka/
```

这个地址用于分享给同事。页面放在 `docs/` 目录，可通过 GitHub Pages 发布。

## 功能

- 员工申请页：选择成就卡、查看项目说明、填写基础信息、上传附件并提交。
- 评审工作台：查看提交记录、下载附件、填写评审状态、分值和评审意见。
- 后端接口：保存申请数据和附件。

## 重要说明

GitHub Pages 只能展示静态页面，不能保存表单数据和附件。

因此本项目采用：

```text
GitHub Pages 固定入口 + Node 后端接口
```

同事只需要访问固定入口地址；后端地址写在：

```text
docs/config.js
```

部署后端后，把里面的空字符串改成后端域名：

```js
window.CHENGJIUKA_API_BASE = "https://your-api.example.com";
```

## 启用 GitHub Pages

进入仓库设置：

```text
Settings -> Pages -> Build and deployment
```

选择：

```text
Source: Deploy from a branch
Branch: main
Folder: /docs
```

保存后，访问：

```text
https://sunlizhu521-alt.github.io/chengjiujka/
```

## 本地运行完整功能

```bash
npm install
npm start
```

打开：

```text
申请页：http://localhost:3000
评审页：http://localhost:3000/admin.html
```

默认评审口令：

```text
chengjiuka-admin
```

正式部署时请设置环境变量：

```bash
ADMIN_TOKEN=你的评审口令
ALLOWED_ORIGIN=https://sunlizhu521-alt.github.io
```

## 文件说明

```text
server.js              后端服务、提交接口、附件上传、评审接口
docs/index.html        员工申请页，GitHub Pages 发布入口
docs/admin.html        评审工作台
docs/config.js         GitHub Pages 前端使用的后端地址配置
docs/app.js            申请页交互逻辑
docs/admin.js          评审页交互逻辑
docs/styles.css        页面样式
data/submissions.json  提交数据，本地运行后自动生成
uploads/               附件保存目录
```

## 附件规则

- 每次申请至少上传 1 个附件。
- 附件内容不限，可上传文件、图片、截图、文档、表格、PDF、压缩包等。
- 默认单个文件最大 50MB，每次最多 10 个附件。

## 后续建议

长期正式使用时，建议把数据和附件从本地文件升级到数据库和对象存储，并接入钉钉登录或账号权限。
