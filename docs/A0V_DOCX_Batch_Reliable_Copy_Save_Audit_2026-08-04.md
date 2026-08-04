# A0V DOCX 批量可靠另存副本审计

日期：2026-08-04  
需求：UX-33E 批量另存副本  
结论：2–32 项草稿的可靠新副本链路已完成，UX-33 保持“进行中”。

## 本阶段完成

- 新增 `save_docx_patch_batch_copy`，把已验证的多目标草稿写入同目录、由用户命名且不存在的新 `.docx`。
- 写入前再次校验工作区路径、源文件签名、64 MiB 上限、三生产者证据、批量操作边界和隔离输出摘要。
- 写入后验证目标字节、SHA-256、DOCX 结构、整批语义重放和源文件字节/签名不变。
- 目标已存在或等于源文件时拒绝写入；复读失败时只清理与本次输出完全一致的未验收副本。
- 前端多目标清单可直接另存并打开结果，单项仍沿用原可靠另存命令。

## 需求对齐

- 编辑仍只驻留内存，只有用户点击“保存到原文件”或“另存新 DOCX 并打开”才写盘。
- 覆盖源文件继续要求二次确认；另存副本从不覆盖已有文件。
- Word、WPS Writer、LibreOffice Writer 三类项目 fixture 均通过两目标另存、目标复读和源文件不变回归。

## 保持边界

- 可编辑对象仍限于安全文本目标、基础粗体/斜体/下划线和单个内嵌图片说明。
- 复杂运行、浮动图片、页眉页脚、批注、脚注、域和嵌入对象继续只读。
- 本阶段的三生产者 fixture 回归不替代安装版真实桌面复测。

## 验证

- `cargo test --manifest-path src-tauri/Cargo.toml commands::docx::tests --lib`：8/8 通过。
- `npm.cmd run build`
- `node scripts/check-docx-page-editing-experience.mjs`
- `node scripts/check-docx-batch-patch-contract.mjs`
- `node scripts/check-current-development-audit.mjs`

## 下一步

进入 UX-33F：先审计页眉页脚、超链接、批注等候选对象的可编辑风险，只开放能建立精确语义目标、隔离补丁、确定性重放和三生产者复读证明的安全子集；随后执行安装态多页、多目标保存复测。
