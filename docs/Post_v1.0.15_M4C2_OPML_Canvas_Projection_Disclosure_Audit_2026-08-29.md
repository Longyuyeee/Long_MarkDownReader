# M4C-2 OPML→Canvas 投影披露审计

日期：2026-08-29

阶段：M4C-2

状态：通过；下一接续点为 M4C-3 图谱派生输出披露选择审计

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 结论

M4C-2 已按原始 M4 受控转换要求关闭 OPML→Canvas 的写盘前披露缺口。用户现在可以在确认创建前看到资料库相对来源、同目录候选目标、绝不覆盖与同名编号策略、具体保留和损失事实；创建后继续自动打开后端返回的实际 Canvas，原 OPML 逐字节不变。

本阶段只处理 OPML→Canvas，并补齐真实审计暴露的窄 Canvas 标题收缩问题；没有修改图谱派生输出、抽取全局转换框架或进入发布冻结。

## 2. 原始需求与实际代码

原始 M4 要求每条跨格式转换披露来源、目标路径、覆盖策略和转换损失，保持源安全，并自动打开实际目标。实际 Rust 代码已有下列可靠边界，本阶段继续原样使用：

- OPML 最大 8 MiB、最多 10,000 个节点、最多 64 层；节点标题最多 2,000 字符，备注最多 20,000 字符；
- 来源必须是资料库内已存在的 `.opml`，外部 OPML 不能旁路向资料库写入；
- 目标通过 Canvas schema 和 20 MiB 上限校验；
- 同目录使用“`文件名 画布.canvas`”，碰撞时递增编号；
- 使用可靠 UTF-8 新文件写入，已有来源和目标不覆盖；
- 后端返回真实目标，前端自动打开。

修正前唯一产品缺口是按钮点击后立即写盘，没有转换前确认。

## 3. 实际投影语义与需求纠偏

对 `opml_to_canvas` 的逐字段核对确认：

| OPML 事实 | Canvas 实际结果 |
| --- | --- |
| 每个 outline | 一个可编辑文本节点 |
| 标题与 `_note` | 合并为节点文本，中间空一行 |
| 父子层级 | `relationType=contains` 的有向边 |
| 来源 | 增加一个资料库相对路径的文件节点 |
| 折叠主题 | 仍全部投影 |
| `<head>` 元数据 | 不成为 Canvas 字段 |
| 自定义 outline 属性、折叠状态 | 不成为 Canvas 字段 |
| OPML 当前主题、布局和手工位置 | 不复刻；按深度与原顺序重新排布并按深度配色 |
| 后续编辑 | Canvas 是时间点快照，不与 OPML 双向同步 |

路线图早期“图谱子集到思维导图”的表述也在本阶段再次按实际代码修正：图谱“思维导图”是同一图谱内的派生视图，不生成文件；真实图谱输出是 Canvas 与 Markdown 项目笔记。

## 4. 产品实现

`MindMapView` 的“投影到 Canvas”现在先打开结构化确认框：

- 显示资料库相对来源和候选 Canvas；
- 明确绝不覆盖、同名编号和自动打开实际目标；
- 列出上述全部保留与损失事实；
- 只有已保存 OPML 可以确认创建；
- 写盘期间入口禁用，成功后通知资料库并打开真实目标。

对话框按实际思维导图工作区宽度收敛，内容高度受限且可滚动。真实窄屏复核又发现 Canvas 标题按整窗 `55vw` 计算，编号标题与保存状态挤压；`CanvasView` 已增加容器宽度断点，让标题在实际工作区中省略且状态保持独立。

## 5. 真实桌面与文件结果

真实 Tauri Debug WebView2 使用仓库固定 OPML 夹具，包含 4 个主题、备注、`ownerName` 元数据、自定义 `category` 属性和折叠状态。

| 项目 | 实际结果 |
| --- | --- |
| 1280 披露 | 来源、候选目标、编号策略、全部投影规则/损失和源不变均可见 |
| 首个目标 | `Conversion Outline 画布.canvas`；自动打开；磁盘复读 5 节点/4 边 |
| 480 披露 | 对话框位于实际工作区内，内容滚动、取消和确认可达 |
| 编号目标 | `Conversion Outline 画布 1.canvas`；自动打开；磁盘复读 5 节点/4 边 |
| 结构 | 源文件节点、标题+备注文本节点、全部折叠主题和 4 条 `contains` 边均存在 |
| 损失 | `ownerName`、`category` 和折叠字段不在 Canvas 中 |
| 源安全 | 最终 OPML SHA-256 等于初始值 |
| 运行时/阻断错误面 | 0 / 无 |

四张最终截图已逐张人工复核并接受，不包含本机绝对路径或用户内容。

## 6. 审计过程纠偏

1. 首次运行中，PowerShell 已观察到 CDP 端口监听，但 Node 第一次请求遇到短暂 `ECONNREFUSED`。目标发现改为有界重试，再从全新隔离资料库重跑。
2. 第二次运行的手写 PowerShell 临时 OPML 生成了非法 XML，产品正确显示解析失败。审计改用仓库固定真实 OPML 夹具，没有放宽 XML 解析或安全门禁。
3. 第三次完整交互与结构门禁通过，但人工视觉复核发现 480px Canvas 编号标题和保存状态挤压。产品改为容器级收缩后，第四次完整重跑通过并重新生成全部证据。

## 7. 证据与验证

证据目录：[`evidence/post-v115-m4c2-opml-canvas-projection-disclosure`](./evidence/post-v115-m4c2-opml-canvas-projection-disclosure/)

Manifest 状态为 `accepted-after-visual-review`，交互证据状态为 `passed`。

```text
npm run audit:post-v115-m4c2-opml-canvas-projection
npm run check:post-v115-m4c2-opml-canvas-projection
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::mindmap::tests
npm run build
npm run check:post-v115-m4c1-csv-tsv-table-conversion
npm run check:post-v115-m4c0-controlled-conversion-selection
npm run check:post-v115-m4b2-workspace-object-action-exit
npm run check:development-version-identity
git diff --check
```

## 8. 下一接续点

下一阶段固定为 **M4C-3 图谱派生输出披露选择审计**。先分别核对图谱→Canvas 与图谱→项目笔记的实际来源范围、目标目录、编号策略、有界深度、关系快照、关联对象上限、生成模板、自动打开和事实源安全，再只选择一个最小实现批次。

不得把两条工作流描述为同一种无损转换，也不提前抽取全局转换框架、清理证据或进入 `M4-release-freeze`。
