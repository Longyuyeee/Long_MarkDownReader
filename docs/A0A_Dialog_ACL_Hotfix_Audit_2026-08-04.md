# A0A 安装态确认对话框 ACL 修复审计

日期：2026-08-04
需求对齐：UX-07、UX-11、UX-16
状态：代码与静态门禁完成，等待下一安装包真实交互复测

## 问题

v1.0.3 安装版执行删除知识索引、CSV 行操作等确认流程时，出现：

`Promise Error: Command plugin:dialog|confirm not allowed by ACL`

源码中存在 `window.confirm` 和 `window.alert` 调用，但主窗口能力清单只允许打开和保存文件对话框。Tauri 生成 schema 已声明对应权限，故障属于安装态 ACL 漏配。

## 修复

1. `src-tauri/capabilities/default.json` 增加 `dialog:allow-confirm` 和 `dialog:allow-message`。
2. 新增 `scripts/check-dialog-acl.mjs`，扫描全部 Vue/TypeScript 源码；发现确认或消息调用时，必须存在匹配权限。
3. 新增 `check:dialog-acl`，并接入 `ci:patch-release`，防止后续能力清单再次漏配。

## 验证

- `npm.cmd run check:dialog-acl`：通过，扫描 83 个源码文件。
- `npm.cmd run build`：通过，Vue TypeScript 检查和 Vite 生产构建完成。
- `cargo check --locked --manifest-path src-tauri/Cargo.toml`：通过，Tauri 能力清单可由 Rust 构建解析。
- 能力 JSON 精确检查：`dialog:allow-confirm`、`dialog:allow-message` 均存在。

## 边界

本步只关闭未授权确认/消息命令，不改变删除索引、删除表格行或关闭未保存文件的业务语义。UX-07 仍需自动索引和用户化文案，UX-11 仍需把行号点击改成选择并提供明确删除命令，UX-16 仍需完成跨格式响应式布局，因此三项保持“开发中”。

下一个安装包必须真实点击知识索引清除、CSV 行删除、脏标签关闭和应用退出确认，确认不再出现 Promise/ACL 错误后，才完成安装态复测。
