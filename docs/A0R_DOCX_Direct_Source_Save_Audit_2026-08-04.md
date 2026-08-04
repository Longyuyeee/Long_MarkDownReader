# A0R DOCX 直接保存基础审计

日期：2026-08-04  
需求：UX-33  
结论：完成 UX-33A 直接保存基础，UX-33 保持“进行中”。

## 本阶段完成

- DOCX 标题和编辑面板不再宣称“原文件只读”；明确草稿只驻留内存，只有用户点击保存并确认后才写入源文件。
- 可安全替换的段落、标题、列表项和单段表格单元格可从页面正文直接点击定位，输入内容即时显示为页面草稿；复杂运行、合并表格、浮动图片和高级对象继续只读。
- 新增源文件可靠保存命令：保存前复核打开时签名、源摘要和隔离输出摘要，要求未修改部件保真、结构复读和语义复读全部通过。
- 写盘复用同目录临时文件与恢复备份；落盘后逐字节、结构和语义再次复读。若复读失败，使用保存前原始字节恢复并确认恢复结果。
- 保存前使用应用内确认对话框明确提示覆盖；原有“另存副本”能力继续保留。

## 验证

- `npm.cmd run build`
- `npm.cmd run check:docx-page-editing-experience`
- `cargo test --locked --manifest-path src-tauri/Cargo.toml ux33_saves_verified_patch_to_source_and_rejects_stale_inputs`
- `cargo check --locked --manifest-path src-tauri/Cargo.toml`
- `git diff --check`

## 保留边界与下一步

本阶段仍是受控的单目标 OOXML 编辑，不等价于完整 Word。下一步 UX-33B 要处理显式分页的多页面画布、编辑工具栏与多操作草稿；随后 UX-33C 扩大段落/列表/表格/图片的安全编辑覆盖，并把撤销、重做和返回保护接入 UX-39。安装包还需用 Word、WPS、LibreOffice 生产的测试文档复测覆盖保存、另存副本、外部冲突和失败恢复。
