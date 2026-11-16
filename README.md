# 轻contacts · 通讯录

> FZU–MU《软件工程》极限编程（Extreme Programming）作业项目
>
> 收藏联系人 · 多联系方式 · Excel 导入导出 · 精美 Web 界面 · 零第三方依赖

轻contacts 是一个可以直接运行的通讯录 Web 应用：左侧按「全部 / 收藏夹 / 标签」筛选，中间是联系人卡片列表，
右侧展示详情与全部联系方式；支持给同一个人挂任意多条手机号、邮箱、微信、QQ、微博、地址，支持一键导出
Excel、批量导入 Excel，并带有完整的接口测试与零依赖的 xlsx 读写实现。

> **在线演示：** <https://contact-hub-ogdm.onrender.com>（Render 免费实例，休眠后首次打开约 30–60 秒）

## 目录

- [界面预览](#界面预览)
- [功能一览](#功能一览)
- [技术栈与设计取舍](#技术栈与设计取舍)
- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [接口文档](#接口文档)
- [Excel 格式与导入规则](#excel-格式与导入规则)
- [测试](#测试)
- [部署到云服务器](#部署到云服务器)
- [评分点对照](#评分点对照)
- [常见问题](#常见问题)

## 界面预览

![首页](docs/screenshots/01-home.png)

收藏夹、联系人详情、新建表单、导入报告、深色模式与移动端截图都在
[docs/screenshots](docs/screenshots/)；完整的实现说明与作业博客见 [docs/blog.md](docs/blog.md)。

## 功能一览

| 功能 | 说明 | 对应评分点 |
| --- | --- | --- |
| 收藏联系人 | 卡片与详情页都可一键收藏，收藏夹独立视图，排序时收藏优先 | 25 分 |
| 多联系方式 | 每个联系人可挂任意多条手机 / 邮箱 / 微信 / QQ / 微博 / 地址 / 其他，支持「主要」标记与一键复制 | 10 分 |
| Excel 导出 | 一个联系人一行、每类信息一列，带表头样式、冻结首行、列宽、自动筛选 | 25 分 |
| Excel 导入 | 自动识别表头别名，逐行校验，重复联系人跳过并给出原因，导入结果可回溯 | 25 分 |
| 页面风格 | 三栏工作台布局、渐变头像、卡片悬浮动效、深色模式、移动端适配 | 10 分 |
| 云部署 | 提供 systemd / Nginx / 云服务器部署步骤，`PORT` 可配置 | +15 分（可选） |

除此之外还有：

- 关键词搜索：姓名、公司、职位、标签、备注、任意联系方式内容；输入 `13905910001` 可以匹配到存的 `139 0591 0001`
- 标签体系：标签云筛选，标签数量自动统计
- 表单校验：姓名必填、邮箱格式、联系方式类型、长度限制，服务端二次校验
- 深链接：`?view=starred`、`?contact=3`、`?open=new`、`?theme=dark`，方便分享与截图
- 响应式：≥1180px 三栏，平板双栏，手机端详情抽屉
- 完整测试：17 条接口与 xlsx 用例，`npm test` 一键跑完

## 技术栈与设计取舍

| 层次 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | Node.js ≥ 22.5 | 使用内置 `node:sqlite`，无需编译原生模块 |
| HTTP | 原生 `node:http` + 轻量路由 | 与 Express 同构的 method + path 匹配，零依赖、启动快 |
| 数据库 | SQLite（WAL） | 单文件数据库，便于演示、备份与迁移 |
| Excel | 自研 `src/lib/xlsx.js` | 手写 ZIP 容器 + SpreadsheetML，避免引入 exceljs 等重型依赖 |
| 前端 | 原生 ES Module + CSS | 无构建步骤，改完刷新即可，部署时直接托管静态文件 |

> **为什么不用 Express / exceljs？**
> 课程作业的部署环境不一定能联网安装依赖，`npm install` 失败会直接导致演示翻车。
> 本项目在 `npm install` 什么都不装的情况下也能启动，同时保留了清晰的分层（路由 / 服务 / 数据 / 工具），
> 并用自研 xlsx 模块覆盖了导入导出中最容易踩坑的编码、转义、多工作表、共享字符串等细节。

## 快速开始

环境要求：**Node.js ≥ 22.5**（推荐 24.x），无需数据库服务、无需 `npm install`。

```bash
# 1. 启动（首次启动会自动建库并写入 12 位演示联系人）
node server.js

# 2. 浏览器打开
# http://localhost:3000
```

其他命令：

```bash
node scripts/seed.js   # 重置演示数据（会删除 data/contacts.db 后重建）
npm test               # 运行 17 条自动化测试
PORT=8080 node server.js
```

数据默认保存在 `data/contacts.db`，可通过环境变量 `DATA_DIR` 指定其他目录：

```bash
DATA_DIR=/var/lib/contact-hub node server.js
```

## 目录结构

```text
contact-hub/
├── server.js                  # 服务入口：监听端口、优雅退出
├── package.json
├── src/
│   ├── app.js                 # 应用装配：路由 + 静态资源 + 统一异常处理
│   ├── router.js              # 极简路由（:param 匹配）
│   ├── http.js                # HttpError、JSON 响应、请求体读取
│   ├── static.js              # 静态资源托管（ETag / 目录穿越防护）
│   ├── db.js                  # SQLite 建表、连接、种子数据写入
│   ├── seed-data.js           # 演示数据
│   ├── lib/xlsx.js            # xlsx 读写（ZIP + SpreadsheetML）
│   ├── routes/                # 接口层
│   │   ├── contacts.js
│   │   ├── excel.js
│   │   └── meta.js
│   └── services/              # 业务层
│       ├── contacts.js        # 校验、CRUD、收藏、统计
│       └── excel.js           # 导出行构造、导入解析与去重
├── public/                    # 前端（无需构建）
│   ├── index.html
│   ├── css/style.css
│   ├── js/{api,ui,app}.js
│   └── assets/favicon.svg
├── tests/run-tests.js         # 接口 + xlsx 自动化测试
├── scripts/seed.js            # 重建演示数据
├── tools/capture-screenshots.ps1  # 一键抓取演示截图
└── docs/
    ├── blog.md                # CSDN 作业博客（可直接发布）
    ├── CODE_STYLE.md          # 代码规范
    ├── demo-script.md         # 演示视频分镜脚本
    ├── sample-import.xlsx     # 示例导入文件
    └── screenshots/           # 运行截图
```

## 接口文档

统一返回 JSON；错误格式为 `{ "error": { "message": "…", "details": [...] } }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/contacts?q=&starred=1&tag=&sort=recent\|name\|starred` | 列表 / 搜索 / 筛选 / 排序 |
| GET | `/api/contacts/:id` | 联系人详情（含全部联系方式） |
| POST | `/api/contacts` | 新增联系人 |
| PUT | `/api/contacts/:id` | 更新联系人（整体替换联系方式） |
| DELETE | `/api/contacts/:id` | 删除联系人（级联删除联系方式） |
| PATCH | `/api/contacts/:id/star` | 收藏 / 取消收藏，body `{ "starred": true }` |
| GET | `/api/export` | 导出全部联系人；`?template=1` 只导出表头模板 |
| POST | `/api/import` | 导入 xlsx，二进制请求体 + `X-File-Name` 头 |
| GET | `/api/meta` | 版本、联系方式类型字典、统计信息 |
| GET | `/api/health` | 健康检查 |

请求示例：

```bash
curl -X POST http://localhost:3000/api/contacts \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "林清和",
    "company": "福州大学",
    "title": "教授 · 软件工程系",
    "tags": "老师,校企",
    "starred": true,
    "methods": [
      { "type": "phone", "label": "手机", "value": "139 0591 0001", "primary": true },
      { "type": "email", "label": "工作", "value": "qinghe.lin@fzu.edu.cn" }
    ]
  }'
```

## Excel 格式与导入规则

导出列（一个联系人一行）：

```text
姓名 | 公司 | 职位 | 标签 | 收藏 | 备注 | 手机 | 手机(备用) | 邮箱 | 邮箱(备用) | 微信 | QQ | 微博 | 地址 | 其他
```

导入规则：

1. 表头必须包含「姓名」（也接受 `name`、`联系人` 等别名）；其余列可缺省。
2. 表头支持别名与多余空格、括号说明，例如 `手机(备用)`、`手机号`、`联系电话` 都会被识别为手机列。
3. 同一类型的多列会合并为该联系人的多条联系方式；单元格内可用 `、`、`；` 分隔多个号码。
4. 「收藏」列接受 `是/否`、`1/0`、`TRUE/FALSE`、`√`。
5. 逐行校验：缺少姓名、邮箱格式错误等会记录行号与原因，不影响其他行导入。
6. 去重规则：姓名 + 首个手机号（忽略空格与横线）或姓名 + 邮箱相同，视为重复并跳过。
7. 单次最多 2000 行、文件最大 8MB。

`docs/sample-import.xlsx` 是一份包含「新增 / 重复 / 缺姓名」三种情况的示例文件，可直接用于演示。

## 测试

```bash
npm test
```

覆盖内容：

- 静态资源与首页可访问、目录穿越防护
- 列表 / 搜索（姓名与号码）/ 收藏筛选
- 新增（多手机号、多邮箱、社交账号）、详情、更新、删除
- 字段校验（姓名、邮箱格式、非法类型）返回 422
- 导出 xlsx：表头、行数、ZIP 魔数、读回内容
- 导入 xlsx：新增 / 重复跳过 / 缺姓名失败、非 xlsx 与表头错误
- xlsx 模块：中文、换行、emoji、`<>&"` 转义往返一致

## 部署到云服务器

三种方式（细节见 [docs/DEPLOY.md](docs/DEPLOY.md)）：

| 方式 | 适用场景 | 地址形态 |
| --- | --- | --- |
| Render Blueprint（免费） | 没有服务器，想快速拿到公网地址 | `https://xxx.onrender.com` |
| 云服务器 + systemd | 要稳定、要拿「云部署」加分 | `http://公网IP:3000` |
| SSH 隧道（临时） | 只是临时给老师看一眼 | `https://xxx.app.lhr.life` |

Render 一键部署：仓库根目录的 `render.yaml` 已经准备好，把代码推到 GitHub 后，
在 Render 里 **New → Blueprint** 选中仓库即可。

以华为云 / 阿里云的 Ubuntu 22.04 为例（安全组需放行 80 或自定义端口）：

```bash
# 1. 安装 Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 拉取代码并启动
git clone <你的仓库地址> /opt/contact-hub
cd /opt/contact-hub
PORT=3000 node server.js
```

用 systemd 守护：

```ini
# /etc/systemd/system/contact-hub.service
[Unit]
Description=contact-hub address book
After=network.target

[Service]
WorkingDirectory=/opt/contact-hub
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Environment=DATA_DIR=/var/lib/contact-hub
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/lib/contact-hub && sudo chown www-data /var/lib/contact-hub
sudo systemctl daemon-reload && sudo systemctl enable --now contact-hub
```

Nginx 反向代理（80 端口直接访问，`localhost` 链接不算云部署）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

没有域名时，直接用 `http://<公网IP>:3000` 访问，并在安全组放行 3000 端口。

## 评分点对照

| 评分项 | 分值 | 本项目实现 |
| --- | --- | --- |
| 博客格式、仓库与代码规范链接 | 10 | `docs/blog.md`、`docs/CODE_STYLE.md`、GitHub 仓库 |
| 功能实现思路、程序截图、分工 | 20 | 博客第 3、4、5 节 |
| 页面风格 | 10 | 三栏工作台、渐变头像、悬浮动效、深色模式、响应式 |
| 收藏联系人 | 25 | 卡片 / 详情双入口收藏、收藏夹视图、收藏优先排序 |
| 多联系方式 | 10 | 子表存储、任意条数、类型图标、主要标记、一键复制 |
| 导入导出 | 25 | 自研 xlsx 读写、模板下载、逐行校验、去重与导入报告 |
| 云部署（加分） | +15 | 见「部署到云服务器」 |

## 常见问题

**启动报 `node:sqlite` 不存在？**
Node.js 版本低于 22.5。升级到 22 LTS 或 24。

**端口被占用？**
`PORT=8080 node server.js`。

**导入提示「缺少姓名列」？**
先点「导出 → 下载空白模板」，按模板表头填写；或确保第一行有「姓名」列。

**数据存在哪里？如何备份？**
`data/contacts.db`，直接复制该文件即可；停止服务后复制更稳妥（WAL 模式）。

**为什么导出的手机号是文本格式？**
为了避免 Excel 把 `13905910001` 显示成科学计数法、丢掉前导 0，手机与 QQ 列使用文本格式存储。
