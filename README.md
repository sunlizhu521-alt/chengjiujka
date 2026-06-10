# 成就卡申请与评审系统

这是一个简单的完整提交版系统，包含：

- 员工申请页：选择成就卡、查看项目说明、填写基础信息、上传附件并提交。
- 评审工作台：查看提交记录、下载附件、填写评审状态、分值和评审意见。
- 后端接口：保存申请数据和附件。

> 注意：GitHub Pages 只能托管静态网页，不能保存表单数据和附件。本项目需要部署到支持 Node.js 的平台，例如公司服务器、Render、Railway、Vercel Serverless 改造版等。

## 本地运行

```bash
npm install
npm start
```

打开：

- 申请页：http://localhost:3000
- 评审页：http://localhost:3000/admin.html

默认评审口令：

```text
chengjiuka-admin
```

正式部署时请设置环境变量：

```bash
ADMIN_TOKEN=你的评审口令
```

## 文件说明

```text
server.js              后端服务、提交接口、附件上传、评审接口
public/index.html      员工申请页
public/admin.html      评审工作台
public/app.js          申请页交互逻辑
public/admin.js        评审页交互逻辑
public/styles.css      页面样式
data/submissions.json  提交数据，本地运行后自动生成
uploads/               附件保存目录
```

## 附件规则

- 每次申请至少上传 1 个附件。
- 附件内容不限，可上传文件、图片、截图、文档、表格、PDF、压缩包等。
- 默认单个文件最大 50MB，每次最多 10 个附件。

## 评审状态

系统内置状态：

- 待评审
- 通过
- 驳回
- 需补充

## 部署建议

如果只是内部小范围使用，可以部署到一台公司内网服务器或支持 Node.js 的云平台。

如果后续需要更正式的长期使用，建议升级为：

- 数据库存储提交记录。
- 对象存储保存附件。
- 钉钉扫码登录或账号密码登录。
- 按评审小组成员控制权限。
- 导出 Excel 汇总表。
