# 运行截图目录

这里存放博客与 README 引用的运行截图，命名与用途如下：

| 文件 | 说明 |
| --- | --- |
| `01-home.png` | 首页三栏工作台 |
| `02-starred.png` | 收藏夹视图 |
| `03-detail.png` | 联系人详情（多联系方式） |
| `04-new-contact.png` | 新建联系人弹窗 |
| `05-import.png` | 导入 Excel 弹窗 |
| `06-dark.png` | 深色模式 |
| `07-mobile.png` | 移动端布局 |
| `08-git-log.png` | Git 提交历史（`git log --oneline --graph` 截图） |

一键生成（Windows + Edge）：

```powershell
powershell -ExecutionPolicy Bypass -File tools/capture-screenshots.ps1
```

或双击 `tools/capture-screenshots.cmd`。脚本会启动服务、按预设状态截图，并把结果写回本目录。

手动截图时，各状态对应的深链接：

```text
/                          首页
/?view=starred             收藏夹
/?contact=2                选中第 2 位联系人
/?open=new                 新建联系人弹窗
/?open=import              导入弹窗
/?theme=dark&view=starred  深色模式
```

截图建议 1440×940（移动端 430×932），浏览器缩放 100%，隐藏书签栏。
