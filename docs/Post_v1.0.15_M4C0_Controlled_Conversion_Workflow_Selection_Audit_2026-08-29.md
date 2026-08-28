# M4C-0 受控转换工作流选择审计

日期：2026-08-29

阶段：M4C-0

状态：通过选择审计；下一接续点为 M4C-1 CSV/TSV→Table 披露与自动打开闭环

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 选择结论

M4C-0 已对照实际前后端代码和真实 Tauri 写盘行为审计四条现有文件输出工作流。唯一选择 **CSV/TSV→Table** 进入 M4C-1；OPML→Canvas、图谱→Canvas 和图谱→项目笔记延期，不能在同一批次统一重做。

CSV/TSV→Table 已具备最成熟的基础：32 MiB、20 万行、512 列和单元格长度上限；解码、形状与目标 schema 校验；源文件不变；同名目标递增；转换前已经显示来源上下文、候选目标名和碰撞策略。实际缺口仅集中在原始 M4 明确要求的两项：没有说明转换损失，成功后没有自动打开目标。因此它是风险最小、能够完整验证统一披露合同的首批。

## 2. 原始需求与语义纠偏

原始 M4 要求受控转换展示来源、目标路径、覆盖策略和转换损失，完成后自动打开目标，并以源文件不变作为硬门禁。

路线图早期写有“图谱子集→思维导图”。实际代码中，“设为思维导图中心”只在同一 `GraphView` 中切换派生视图，没有创建文件，所以不应纳入转换矩阵。当前真实图谱文件输出只有：

- `create_canvas_from_graph`：把有界局部关系快照写为新 Canvas。
- `create_project_note_from_graph`：把中心对象和至多 100 个关联对象写为带生成任务模板的 Markdown 项目笔记。

本审计据此把矩阵修正为四条真实工作流，后续文档不得把图谱视图切换描述成格式转换。

## 3. 当前能力矩阵

| 工作流 | 来源 | 目标与碰撞 | 转换前披露 | 损失/派生事实 | 完成后 | 决定 |
| --- | --- | --- | --- | --- | --- | --- |
| CSV/TSV→Table | 当前受管 CSV/TSV；源不写入 | 同目录 `.table.json`；存在则递增序号 | 已显示候选名、原文件不变、编号策略 | 未显示：首行作为标题、短行补空、前 2,000 个非空值推断类型、生成稳定 ID、仅初始化表格视图 | 当前弹成功框，由用户再次选择打开或定位 | **选择 M4C-1** |
| OPML→Canvas | 当前受管 OPML；源不写入 | 同目录“画布.canvas”；存在则递增 | 无确认；按钮立即写盘 | 未显示 OPML 元数据、折叠与布局如何投影 | 自动打开 Canvas | 延期 |
| 图谱→Canvas | 当前图谱中心及深度；事实源不写入 | 资料库根目录新 Canvas；存在则递增 | 无确认；按钮立即写盘 | 未显示这是当前时刻、有界深度的派生快照 | 自动打开 Canvas | 延期 |
| 图谱→项目笔记 | Markdown/PDF 中心；事实源不写入 | 中心文件旁新 Markdown；存在则递增 | 无确认；按钮立即写盘 | 未显示会生成任务模板、按标题排序并截断到 100 个关联对象 | 自动打开笔记 | 延期 |

四条后端工作流均使用资料库边界和可靠写入，真实审计均得到首个目标与编号碰撞目标，没有覆盖源或既有目标。

## 4. 真实桌面与写盘结果

同一隔离资料库包含一份 UTF-8 BOM/CRLF CSV、一份真实 OPML 和两份互链 Markdown。桌面交互与命令结果如下：

| 指标 | 实际结果 |
| --- | --- |
| CSV 当前确认 | 来源文件名在当前工作面；显示 `Conversion Matrix.table.json`、原 CSV 不变、同名使用新序号；无损失说明 |
| CSV 目标 | `Conversion Matrix.table.json`、`Conversion Matrix 1.table.json`；3 行 × 3 列 |
| CSV 当前完成行为 | 不自动打开；成功弹框要求再选“打开新文件”或“在文件树中定位” |
| OPML 目标 | `Conversion Outline 画布.canvas`、`Conversion Outline 画布 1.canvas`；点击后自动打开 |
| 图谱 Canvas 目标 | `Graph Center 思维导图.canvas`、`Graph Center 思维导图 1.canvas`；2 节点、2 条有向关系 |
| 图谱项目笔记目标 | `Graph Center 项目.md`、`Graph Center 项目 1.md`；包含可追溯生成元数据 |
| 转换前确认 | OPML 与两条图谱输出均无确认弹窗 |
| 源文件 | CSV、OPML、两份 Markdown 最终 SHA-256 全部等于初始值 |
| 运行时/阻断错误面 | 0 / 无 |
| 1280×820 | 四个工作面均可达，无页面级横向溢出 |

## 5. 审计过程纠偏

前三次运行都在产品行为已经正确出现后被过窄的自动化选择器阻断：

1. OPML 默认处于思维导图视图，脚本却只等待大纲节点。
2. 折叠分支使 4 个文档主题只渲染 3 个可见节点；脚本误把总数等同于可见数。
3. OPML 已自动打开真实 Canvas，但脚本等待不存在的 `.canvas-view`，实际根类为 `.canvas-page`。

修正后完整重跑通过。视觉复核又发现图谱根查询使用非规范化路径时回退选中了最强节点，并在详情显示临时绝对路径；最终脚本改从真实 `build_link_graph` 返回值取得 `Graph Center` 节点 ID，截图前脱敏路径，再次完整重跑。上述修正没有降低源安全、目标碰撞、结构、运行时或视觉门槛。

## 6. M4C-1 冻结边界

M4C-1 只完成 CSV/TSV→Table：

- 转换前明确显示当前源文件、同目录候选目标、绝不覆盖且同名递增的策略。
- 明确说明首行作为列名、短行补空、类型推断最多查看每列前 2,000 个非空值、生成新的稳定行列 ID、目标仅初始化一个表格视图，以及源编码/BOM/换行不会成为 Table JSON 的物理序列化格式。
- 沿用现有有界解析、内部 schema 校验和可靠新文件写入，不引入结构化文本自动猜测。
- 成功后自动打开后端返回的真实目标；失败留在来源并显示错误。
- 真实审计必须覆盖 CSV 与 TSV、首个目标、同名编号目标、内容复读、自动打开、源摘要不变、宽窄屏和 0 运行时错误。

不包含 OPML、图谱输出、新格式、提前抽取全局转换框架、版本提升或发布候选。

## 7. 证据与验证

证据目录：[`evidence/post-v115-m4c0-controlled-conversion-workflow-selection`](./evidence/post-v115-m4c0-controlled-conversion-workflow-selection/)

四张截图已逐张人工复核并接受，manifest 为 `accepted-after-visual-review`，不包含用户内容或未脱敏的本机路径。

```text
npm run audit:post-v115-m4c0-controlled-conversion-selection
npm run check:post-v115-m4c0-controlled-conversion-selection
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::table::tests
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::mindmap::tests
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::canvas::tests
npm run build
npm run check:development-version-identity
git diff --check
```

下一接续点固定为 **M4C-1 CSV/TSV→Table 披露与自动打开闭环**。M4C-1 完成审计后再决定 M4C-2，不得直接跳到 OPML、图谱或 `M4-release-freeze`。
