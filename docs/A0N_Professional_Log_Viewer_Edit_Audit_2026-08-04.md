# A0N LOG 专业查看与受保护编辑审计

日期：2026-08-04
需求：UX-29
结论：实现完成，等待下一安装包复测。

## 本阶段完成

- 保留专业查看模式：512 KiB 范围读取、4 MiB 显示缓冲、内容筛选、级别高亮、自动刷新、日志轮转重读和尾部跟随。
- 新增“查看 / 编辑”显式模式切换。编辑模式使用统一 CodeMirror 主题，支持行号、撤销、重做、光标位置和 `Ctrl+S`。
- 编辑只开放给 8 MiB 以内日志；进入前说明自动刷新会暂停、源文件只在点击保存后覆盖、并发写入会阻止保存。
- 新增后端 `write_log_document`。命令要求 `acknowledgedOverwrite=true`、执行工作区与格式校验、校验源签名并可靠写入。
- 通用 `write_text_document` 明确拒绝 LOG，不能绕过专用确认和大小门禁。
- LOG 已从严格只读通道迁移到 `signature-protected-overwrite`，发布能力档案更新为 `professional-log`。

## 安全与需求对齐

- 不自动保存，不因筛选、查看、切换模式或自动刷新写入文件。
- 外部程序在编辑期间追加或改写日志时，旧签名保存会失败，当前草稿保留。
- 大日志继续走有界查看，不会为了编辑一次性载入超过 8 MiB 的内容。
- 文件标签保留未保存草稿；返回查看模式不会把草稿写入磁盘。

## 自动检查

- `npm.cmd run build`
- `npm.cmd run check:log-workspace-editing`
- `npm.cmd run check:code-editor-theme-contract`
- `node scripts/check-format-contract.mjs`
- `npm.cmd run check:r1-release-capability-matrix`
- `npm.cmd run check:d2-safe-degradation-contract`
- Rust `commands::formats` 专项测试

## 安装包复测

1. 小于 8 MiB 的 `.log` 可进入编辑；取消确认不会进入编辑。
2. 修改后未点击保存即返回查看或资料库，磁盘文件保持不变，标签草稿仍可恢复。
3. 点击保存后源日志更新；编辑期间由外部程序追加内容时，保存被冲突提示阻止且草稿不丢失。
4. 大于 8 MiB 的日志只能专业查看，筛选、级别高亮、尾随和轮转刷新保持流畅。
5. 九个主题下查看器高亮、编辑器文字、行号、光标和选区均清晰可辨。

## 下一步

进入 UX-30：HTML 默认源码编辑，增加安全网页预览；代码格式统一语法高亮、括号匹配、自动缩进与有界基础补全。所有格式继续遵守“仅点击保存才写入”和撤销/重做要求。
