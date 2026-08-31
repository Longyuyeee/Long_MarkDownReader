# M7-3 v1.0.19 质量债与发布就绪审计

日期：2026-08-31

质量门基线：`main` / `233aa07c8d9fdb3b4b59407f4aa7c70d69683a5b`

阶段结论：**通过；允许进入 M7-4 原子版本迁移与候选打包，但本阶段仍未提升版本或生成安装包。**

## 1. 全量质量结果

完整执行 `cargo test --locked --manifest-path src-tauri/Cargo.toml`：**559 通过、0 失败、5 忽略**，总计 564 项。5 个忽略项仍是明确依赖 LibreOffice、PowerPoint 或审计产物的既有测试；M7 新增测试全部进入全仓结果，没有用聚焦测试替代全量门。

完整执行 `npm run ci:patch-release`，首次即通过：

- Vite 生产构建：**6,275 modules transformed**；
- 文件能力合同：43 格式 / 91 扩展名；
- M7-0～M7-2 与既有开发总审计全部通过；
- `cargo check --locked`：通过；
- `npm audit --omit=dev`：**found 0 vulnerabilities**。

## 2. 质量债审计

补充执行与 M7-1 相同口径的 `cargo clippy -D warnings`。它不是仓库现行发布门，仍报告 **43 条历史 lint**，集中在既有 DOCX/PDF/PPTX/工作簿等模块的参数数量、类型复杂度和旧式写法；新增 `formats/json_schema.rs` 与 `commands/json.rs` 命中 0。另行使用 `--all-targets --all-features` 会扩大到测试/工具目标，因此不与 M7-1 的 43 条基线混算。

结论是不伪报严格 Clippy 全绿，也不为本补丁混入大范围历史重构；正式发布门、全仓测试和本增量责任均已清零。

## 3. 需求与发布边界

本阶段没有新增功能或改变 M7-2 产品边界。本地 JSON/JSONC Schema 仍是资料库内、同目录、同 stem、离线只读、无外部引用；外部文件、大文件 range mode、Schema 递归和源写入继续关闭。

当前 package、Cargo、Tauri 与运行时仍为 `1.0.18`，公开版本仍为 `v1.0.18`，`releaseCandidate=false`。M7-3 没有生成 MSI/NSIS、Tag 或 Release。

## 4. 接续点

唯一接续点为 **M7-4 v1.0.19 原子版本迁移与候选打包**。必须同步所有版本事实源，再从通过门禁的精确候选构建真实 MSI/NSIS，记录大小、SHA-256 与 `NotSigned` 状态，并完成当前 WebView2 安装包烟测。随后仍需托管安装生命周期、最终制品冻结、GitHub Release 远端复核和官方应用内更新观察。
