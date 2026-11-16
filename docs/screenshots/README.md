# 运行截图目录

这里存放博客与 README 引用的运行截图（均为真实运行抓取，非设计稿）：

| 文件 | 说明 |
| --- | --- |
| `01-home.png` | 首页三栏工作台（浅色） |
| `02-starred.png` | 收藏夹视图 |
| `03-detail.png` | 联系人详情（多联系方式） |
| `04-new-contact.png` | 新建联系人弹窗 |
| `05-import.png` | 导入 Excel 弹窗 |
| `06-dark.png` | 深色模式 |
| `07-mobile.png` | 移动端列表（430×932） |
| `08-git-log.png` | Git 提交历史（6+ 次提交） |
| `09-import-result.png` | 导入结果报告（新增 3 / 跳过 1 / 失败 1） |
| `10-mobile-detail.png` | 移动端详情抽屉 |

## 重新生成

```powershell
# 0. 先重置演示数据，保证截图里的数字一致
node scripts/seed.js
node server.js

# 1. 一键抓取桌面端与移动端截图（Windows + Edge）
powershell -ExecutionPolicy Bypass -File tools/capture-screenshots.ps1
```

或双击 `tools/capture-screenshots.cmd`。

`09-import-result.png` 依赖真实上传，脚本不会生成，手动操作：打开「导入」→ 选择
`docs/sample-import.xlsx` → 出现结果后再截图。`08-git-log.png` 用终端执行
`git log --oneline --graph` 后截图，或直接用仓库里已有的这张。

## 手动截图时的状态地址

```text
/?theme=light                      首页（浅色）
/?theme=light&view=starred         收藏夹
/?theme=light&contact=2            选中第 2 位联系人
/?theme=light&open=new             新建联系人弹窗
/?theme=light&open=import          导入弹窗
/?theme=dark&view=starred          深色模式
```

桌面端建议 1440×940，移动端 430×932，浏览器缩放 100%，隐藏书签栏。
