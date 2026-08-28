# M4B-2 工作台对象行动退出审计

日期：2026-08-29

阶段：M4B-2

状态：通过；M4B 收口，下一接续点为 M4C-0 受控转换工作流选择审计

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 退出结论

M4B 在有界行动范围内通过退出审计。工作台保留三个经过真实验证的对象行动族：

- Markdown 待办：签名保护的行级完成/恢复，撤销逐字节恢复。
- 内部 Table 显式布尔任务：签名、稳定 row/column ID 和旧值保护的定点写回，撤销逐字节恢复。
- PDF 未引用批注：从“需要处理”精确打开到 PDF 页与 sidecar 批注，只查看、不自动修改。

本阶段没有新增产品运行代码。OPML、DOCX、ODS、ODP、PPTX 与 Workbook 没有通用任务语义，或受只读、可靠副本、上下文草稿与事务保存边界约束，因此不制造工作台通用写回。它们仍可从“继续工作”进入文件，并通过 M4A 已验收的搜索、图谱和关系上下文打开到安全内部位置。

## 2. 原始需求对齐与范围纠偏

原始 M4 要求新增格式对象可被搜索、工作台和图谱定位，并能返回正确文件和内部位置；原始 M2 又要求 `WorkspaceHome` 围绕“继续工作、今天要做、需要处理”收敛，而不是格式能力页。结合实际代码，这不等于每种格式都必须拥有一个工作台写回按钮。

M4A 已负责七类跨格式对象的统一内部定位；M4B 的正确职责是只把具有明确行动语义且写回边界成熟的对象带入“今天要做”，并让治理对象从“需要处理”准确查看。把 DOCX 标题、OPML 节点或任意 Workbook 单元格解释成任务会发明用户未表达的语义；把 ODS 可靠副本或 PPTX 上下文事务压缩成通用完成按钮会隐藏必要的保存决策。因此 M4B-0 的窄选择没有偏离原始需求，M4B-2 正式按该有界范围收口。

下一阶段也不能直接开始批量转换实现。按照路线图“先审计、后选择”的规则，接续点冻结为 M4C-0：先对 CSV→Table、OPML→Canvas 和图谱输出的来源、目标、覆盖、损失、自动打开及源安全现状做选择审计。

## 3. 实际代码复核

- `WorkspaceHome.vue` 只调用 `set_workspace_markdown_task_state` 与 `set_workspace_table_task_state` 两个状态写回命令。
- `workspace.rs` 的两条写回分别核对资料库、签名、位置、旧值与格式边界；Table 另有 8 MiB 工作台上限和稳定行列身份。
- `WorkspaceHealthQueue.vue` 的 PDF 批注只发出 `openAnnotation`，`WorkspaceHome` 再通过共享导航打开 PDF 页与批注 ID。
- `fileNavigation.ts` 同时保留 `markdown-line`、`table-row` 与 `pdf_annotation` 等定位合同，没有新增 Workspace 专用路由分叉。
- M4B-1 独立证据继续覆盖 Table 的取消、恢复后重做、陈旧签名拒绝、逐字节撤销和共享行定位，本阶段没有用组合截图替代其安全证据。

## 4. 真实桌面组合结果

真实 Tauri 临时资料库同时包含 Markdown 待办、内部 Table 两条任务、有效单页 PDF 与一条未引用 sidecar 批注。

| 指标 | 实际结果 |
| --- | --- |
| 初始未完成/已完成任务 | 2 / 1 |
| Markdown / Table 任务 | 1 / 2 |
| 未引用 PDF 批注 | 1 |
| Markdown 完成与撤销 | 源摘要变化；撤销逐字节恢复 |
| Table 完成与撤销 | 源摘要变化；撤销逐字节恢复 |
| PDF 批注入口 | 唯一激活 `workspace-review`，PDF 与 sidecar 均未写入 |
| 首个行动入口 | 540 ms，预算 5,000 ms |
| 视口 | 1280×820、480×700 均无横向溢出 |
| 运行时错误/阻断错误面 | 0 / 无 |
| 审计结束源文件 | Markdown、Table、PDF、sidecar 四份 SHA-256 全部等于初始值 |

## 5. 审计过程纠偏

首轮运行把 Vite 启动在 14210，但 `tauri.e2e.conf.json` 的开发地址固定为 14200，WebView 因此进入 `ERR_CONNECTION_REFUSED`。审计脚本已对齐现有 E2E 端口后重跑。

第二轮已成功打开并唯一选中 PDF 批注，但 Windows PowerShell 5.1 以系统代码页读取无 BOM 的 `.ps1`，临时 sidecar 中的中文测试评论被错误编码，导致中文文本断言超时。临时测试标识改为 ASCII，最终仍同时核对唯一激活批注与标识文本；产品 PDF 定位逻辑未修改，验收门槛没有放宽。

证据中还真实显示 `.pdf.annotations.json` 会作为 JSON 最近文件出现在“继续工作”。这是既有资料库可见性行为，不构成新的行动或写回，也不阻塞 M4B 的对象行动退出；它作为内部 sidecar 可见性残余风险保留，后续发布清理阶段应独立决定是否隐藏，不能在本退出审计中顺带改变全局索引范围。

## 6. 视觉证据

证据目录：[`evidence/post-v115-m4b2-workspace-object-action-exit-audit`](./evidence/post-v115-m4b2-workspace-object-action-exit-audit/)

- `workspace-actions-combined-1280.jpg`：Markdown 与 Table 共用“今天要做”。
- `markdown-task-completed-1280.jpg`：Markdown 完成与撤销入口。
- `table-task-completed-1280.jpg`：Table 完成与撤销入口。
- `pdf-annotation-locator-1280.jpg`：从治理队列打开到唯一激活 PDF 批注。
- `workspace-actions-restored-480.jpg`：全部恢复后的 480px 工作台。

五张截图已逐张人工复核，无本机完整路径或用户内容，manifest 状态为 `accepted-after-visual-review`。

## 7. 验证命令

```text
npm run audit:post-v115-m4b2-workspace-object-action-exit
npm run check:post-v115-m4b2-workspace-object-action-exit
npm run check:post-v115-m4b1-internal-table-task
npm run check:post-v115-m4b0-workspace-object-action-selection
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::workspace::tests
npm run build
npm run check:development-version-identity
git diff --check
```

## 8. 下一接续点

唯一接续点为 **M4C-0 受控转换工作流选择审计**。先读取 CSV/TSV→Table、OPML→Canvas、图谱→Canvas/项目笔记/思维导图的实际实现与用户披露，建立来源、目标路径、覆盖策略、转换损失、自动打开和源文件不变矩阵，只选择一个最小完整批次。不得直接把所有转换统一，不得开始 `M4-release-freeze`，版本继续保持 `1.0.15` / 开发目标 `1.0.16` / `releaseCandidate=false`。
