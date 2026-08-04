# A0T DOCX 批量补丁事务审计

日期：2026-08-04  
需求：UX-33C 后端基础  
结论：批量事务安全证明完成，UX-33 保持“进行中”。

## 本阶段完成

- 新增 2–32 项 DOCX 批量补丁构建器，支持现有安全文本、基础字符样式和内嵌图片说明操作。
- 所有操作先基于同一份原始文档解析目标和摘要；同一段落、表格单元格或图片每批只允许一个操作，明确拒绝文本与样式等重复语义锚点。
- 每个操作仍通过原有未修改部件保真、结构复读和单项语义复读；整批完成后再次枚举最终目标，确认所有预期修改同时存在。
- 从原始字节按同一顺序完整重放整批操作，要求输出逐字节一致；批量数量、操作类型、目标、整体摘要和变更部件进入结构化回执。
- 批量预览写入临时 DOCX 并逐字节重开，验证期间源文件签名和摘要必须保持不变。
- 批量源文件保存再次检查签名、源摘要和整体输出摘要，只执行一次可靠替换；落盘后结构复读和整批重放必须一致，失败则恢复保存前原始字节。
- 新命令已通过 WorkspaceGuard 注册，不接受资料库外路径。

## 验证

- `cargo test --locked --manifest-path src-tauri/Cargo.toml ux33c_`
- `cargo test --locked --manifest-path src-tauri/Cargo.toml commands::docx::tests`
- `cargo check --locked --manifest-path src-tauri/Cargo.toml`
- `npm.cmd run check:docx-batch-patch-contract`
- `npm.cmd run check:docx-producer-matrix`
- `git diff --check`

## 保留边界与下一步

本阶段只交付后端事务和自动证据，用户界面仍只保存单个目标。下一步 UX-33D 在前端建立按语义锚点索引的多目标草稿集合、跨目标撤销/重做、修改清单和整批验证/保存入口；另存批量副本仍需单独接入。复杂运行、合并单元格、浮动图片和高级 Word 对象继续只读。
