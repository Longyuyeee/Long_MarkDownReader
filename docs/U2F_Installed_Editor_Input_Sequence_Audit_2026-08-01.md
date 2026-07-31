# U2F 已安装编辑器输入序列审计

日期：2026-08-01

状态：`input-sequence-aligned-awaiting-rerun`

发布状态：`releaseCandidate=false`

## 第六轮结论

第六轮 U2（run `30659780608`）再次稳定通过安装、升级、文件关联、Release WebView2 启动、CDP 连接、右侧 TXT 工作面和初始内容读取，但旧输入序列仍未修改 CodeMirror 文档。

对比仓库中已经通过真实桌面验证的 A3R CodeMirror 输入助手后，确认 R5J 少了两个关键步骤：等待编辑器真正获得焦点，以及全选后显式发送 Backspace。仅点击后立即发送 `Ctrl+A + Input.insertText` 在 Release WebView2 中不稳定。

## 修正

- 点击后显式聚焦 `.cm-content`，并等待 active element 或 `.cm-focused` 状态成立。
- `Ctrl+A` 后发送 Backspace，再执行 `Input.insertText`。
- DOM 阶段只检查本次输入的唯一 TXT/JSON 标记；真实正确性仍由磁盘标记、离开页面、重新打开和复读检查保证。
- 沿用 A3R 已验证输入序列，避免为安装包测试另造一套编辑器控制逻辑。

下一轮继续复用已校验安装包，从 TXT 保存链路向 JSON、路由、备份、索引、卸载和回滚推进。
