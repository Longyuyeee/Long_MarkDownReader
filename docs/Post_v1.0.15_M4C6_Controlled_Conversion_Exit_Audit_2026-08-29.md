# M4C-6 受控转换退出审计

日期：2026-08-29

阶段：M4C-6

状态：通过；M4C 在有界转换范围收口，下一接续点为 M4D-0 临时产物与冗余证据清理选择审计

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 退出结论

CSV/TSV→Table、OPML→Canvas、图谱→项目笔记、图谱→Canvas 四条实际文件输出已经在同一真实 Tauri 会话中完成组合复验。四条路径均在写盘前显示来源、候选目标、不覆盖/编号策略及各自损失边界；取消不创建目标，确认后创建编号目标并自动打开后端返回的实际文件，磁盘复读符合有界投影合同。10 个来源及预置碰撞目标最终 SHA-256 全部不变，运行时错误为 0。

原始路线中的“图谱思维导图”继续被正确视为派生视图切换，而不是文件转换。M4C 不扩展为全局转换框架，也不新增转换类型；本阶段通过不等于版本冻结或发布候选。

## 2. 组合审计结果

| 工作流 | 披露 | 取消不写盘 | 编号目标自动打开 | 磁盘复读 | 视口 |
| --- | --- | --- | --- | --- | --- |
| CSV→Table | 通过 | 通过 | `Conversion 1.table.json` | 2×3、类型与序列化损失符合合同 | 1280×820 |
| OPML→Canvas | 通过 | 通过 | `Outline 画布 1.canvas` | 5 节点、4 条 `contains` 边、损失字段不存在 | 480×700 |
| 图谱→项目笔记 | 通过 | 通过 | `Project Center 项目 1.md` | 追溯元数据、模板与关联链接符合合同 | 1280×820 |
| 图谱→Canvas | 通过 | 通过 | `Canvas Center 思维导图 1.canvas` | 2 个相对文件节点、1 条有类型关系 | 480×700 |

## 3. 审计中发现并纠正的偏移

首次数据断言把项目笔记实际带引号的 `longedit-center: "Project Center.md"` 当成无引号格式，已纠正审计 oracle，没有修改产品事实。首次人工视觉复核又发现窄屏证据在 Naive UI 进入动画中截取，同时实际确认框仍按侧栏旁内容区宽度计算；两者叠加造成披露过窄且半透明。

产品现统一按窗口覆盖层宽度计算 Table、OPML 和两类图谱确认框；组合审计等待进入动画完成后再截图，并要求对话框在视口内且达到不超过窗口可用宽度的 420px 最小可读宽度。重新完整执行后八张截图逐张人工复核通过，没有降低功能、来源安全或视觉门禁。

## 4. 证据与验证

证据目录：[`evidence/post-v115-m4c6-controlled-conversion-exit-audit`](./evidence/post-v115-m4c6-controlled-conversion-exit-audit/)

Manifest 状态为 `accepted-after-visual-review`，退出证据状态为 `passed`。

```text
npm run audit:post-v115-m4c6-controlled-conversion-exit
npm run check:post-v115-m4c6-controlled-conversion-exit
npm run check:post-v115-m4c5-graph-canvas
npm run check:post-v115-m4c4-graph-project-note
npm run check:post-v115-m4c3-graph-output-selection
npm run check:post-v115-m4c2-opml-canvas-projection
npm run check:post-v115-m4c1-csv-tsv-table-conversion
npm run check:post-v115-m4c0-controlled-conversion-selection
npm run check:post-v115-m4b2-workspace-object-action-exit
npm run check:development-version-identity
npm run build
git diff --check
```

## 5. 下一接续点

下一阶段固定为 **M4D-0 临时产物与冗余证据清理选择审计**。它对应原始 M4 中“清理本周期产生的临时脚本、候选输出和重复证据，只保留可重复生成或发布需要文件”的下一顺序。

M4D-0 必须先建立引用、可重复生成、发布依赖、历史审计链和删除候选清单，再决定实际删除范围；不得未经审计批量删除证据，不得把发布冻结提前并入，也不得改变 `releaseCandidate=false`。
