# 代码规范

本文档约定「轻contacts」项目的编码风格与协作约定，所有提交的代码都应满足以下要求。
仓库中的代码已按此规范实现，可直接对照阅读。

## 1. 目录与分层

```text
src/routes/     只做参数解析与响应组装，不写业务规则
src/services/   业务规则、校验、事务
src/lib/        与业务无关的通用能力（xlsx 读写、路由、HTTP 工具）
public/js/      页面逻辑，按 api / ui / app 三层拆分
tests/          自动化测试
```

约束：

- 路由层不直接操作数据库，必须经过 service。
- service 不感知 HTTP（不读写 `req` / `res`），只接收普通对象、抛 `HttpError`。
- 通用工具不得反向依赖业务模块。

## 2. 命名

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 文件 / 目录 | 小写短横线或小驼峰 | `seed-data.js`、`style.css` |
| 变量 / 函数 | 小驼峰，动词开头 | `normalizeTags`、`importContacts` |
| 常量 | 全大写 + 下划线 | `MAX_IMPORT_BYTES`、`EXPORT_COLUMNS` |
| 类 | 大驼峰 | `HttpError` |
| 布尔值 | `is` / `has` / `can` 前缀 | `isPrimary`、`hasName` |
| 数据库字段 | 下划线 | `created_at`、`is_primary` |
| 接口字段 | 小驼峰 | `createdAt`、`isPrimary` |

## 3. 格式

- 统一使用 **2 空格缩进**，UTF-8 编码，LF 换行。
- 单行不超过 **110** 字符（注释可放宽到 120）。
- 语句必须带分号；字符串优先单引号，仅在包含单引号或需要模板插值时使用双引号 / 反引号。
- 对象、数组末尾保留尾逗号（多行时），便于 diff。
- 文件末尾保留一个空行。

## 4. 导入顺序

```js
// 1. Node 内置模块
import path from 'node:path';
import { readFile } from 'node:fs/promises';

// 2. 第三方依赖（本项目为 0）
// 3. 项目内部模块（相对路径）
import { createContactService } from './services/contacts.js';
```

## 5. 注释

- 每个模块顶部用块注释说明「这个文件负责什么」，必要时写清关键设计取舍。
- 导出的函数使用 JSDoc 描述参数与返回值。
- 注释解释 **为什么**，而不是复述代码在做什么。
- 复杂 SQL、正则、二进制格式处理必须写注释。

```js
/**
 * 读取 xlsx 的第一个工作表。
 * @param {Buffer} buffer
 * @returns {{ rows: string[][] }}
 */
export function readXlsx(buffer) { … }
```

## 6. 错误处理

- 可预期的错误抛 `HttpError(status, message, details)`；`details` 用于字段级提示。
- 禁止吞掉异常；`catch` 中若确实忽略，必须写明原因（`/* 隐私模式下忽略 */`）。
- 写操作使用事务，失败时 `ROLLBACK`。
- 用户可见的错误信息使用中文，且说明「发生了什么 + 怎么办」。

## 7. 安全

- 所有输出到 HTML 的动态内容必须经过 `escapeHtml`。
- 静态资源路径做 `path.resolve` + 前缀校验，防止目录穿越。
- 请求体限制大小（JSON 1MB、导入 8MB）。
- SQL 一律使用参数化查询，禁止字符串拼接用户输入。
- 邮箱、姓名、长度在前后端各校验一次，前端校验只改善体验，服务端校验才是边界。

## 8. 前端约定

- 状态集中在 `state` 对象，渲染函数只读状态，事件处理只改状态后调用渲染 / 重新拉取。
- DOM 查询统一在文件顶部缓存为 `const el = { … }`。
- 动态列表使用事件委托，避免逐项绑定。
- 类名语义化：`is-*` 表示状态（`is-active`、`is-hidden`），`js-*` 不使用（本项目以 `data-*` 承载行为）。
- CSS 变量统一在 `:root` / `[data-theme="dark"]` 定义，组件内不写死颜色。

## 9. 提交规范

采用 Conventional Commits：

```text
feat: 新增 Excel 导入导出
fix: 修复静态资源提前结束响应
docs: 补充部署说明
test: 补充导入去重用例
refactor: 拆分联系人服务
chore: 初始化仓库
```

要求：

- 一个提交只做一件事，提交信息能独立说明变更。
- 提交前本地跑通 `npm test`。
- 不提交 `data/`、`node_modules/`、临时文件。

## 10. 评审清单（Code Review Checklist）

- [ ] 新增接口有参数校验与错误分支
- [ ] 数据库字段有默认值，删除联系人会级联清理联系方式
- [ ] 动态内容已转义
- [ ] 新增功能有对应用例
- [ ] README / 接口文档同步更新
- [ ] 移动端宽度 375px 下页面不横向滚动
