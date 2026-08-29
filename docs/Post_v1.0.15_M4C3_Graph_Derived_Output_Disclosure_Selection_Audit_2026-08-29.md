# M4C-3 图谱派生输出披露选择审计

日期：2026-08-29

阶段：M4C-3

状态：通过；唯一下一接续点为 M4C-4 图谱→项目笔记披露闭环

版本边界：运行时/公开 `1.0.15`，开发目标 `1.0.16`，`releaseCandidate=false`

## 1. 结论

M4C-3 已对照原始 M4 受控转换要求、实际 `GraphView`、Rust 图谱/Canvas 命令和真实 Tauri 写盘行为，分别审计图谱→Canvas 与图谱→项目笔记。本阶段只做选择，没有修改产品运行代码。

下一最小实现唯一选择 **M4C-4 图谱→项目笔记披露闭环**。该路径的前后端均明确只允许顶层 Markdown/PDF 中心，目标、编号、新文件写入和自动打开边界一致；当前缺口集中在写盘前披露。图谱→Canvas 继续延期，因为代码复核发现其前端资格与后端实际资格不一致，必须作为独立批次先纠偏，不能顺带包装成已支持全部顶层对象。

## 2. 原始需求对齐

原始 M4 要求受控跨格式输出在写盘前披露来源、目标路径、覆盖策略和转换损失，保持来源安全，并在完成后自动打开后端返回的实际目标。两条图谱输出目前都满足“新文件、编号不覆盖、来源不写入、自动打开”，但都没有写盘前确认，也没有向用户解释派生范围与损失。

“设为思维导图中心”仍只是同一图谱的派生视图切换，不生成文件，不纳入转换矩阵。图谱负责派生关系探索；Canvas 和 Markdown 才是生成后可独立编辑的目标事实源。

## 3. 两条实际工作流

| 项目 | 图谱→Canvas | 图谱→项目笔记 |
| --- | --- | --- |
| 来源 | 选中中心及 1～4 层局部图谱 | 顶层 Markdown/PDF 中心及 1～4 层局部图谱 |
| 目标 | 资料库根目录“`标题 思维导图.canvas`”，碰撞递增 | 中心对象同目录“`标题 项目.md`”，碰撞递增 |
| 目标内容 | 所有纳入节点成为资料库相对文件节点；关系保留类型与方向；按广度深度重新布局 | 生成追溯元数据、目标/下一步任务模板、中心和关联链接；关联对象按标题/路径排序 |
| 有界事实 | 深度收敛到 1～4 层；是当前时刻关系快照，不保留图谱手工布局 | 深度收敛到 1～4 层；最多写入 100 个关联对象，正文记录省略数 |
| 完成行为 | 自动打开真实 Canvas | 自动打开真实 Markdown |
| 当前披露 | 无，按钮立即写盘 | 无，按钮立即写盘 |

两者不是同一种“无损转换”：Canvas 是关系结构与文件引用的空间快照，项目笔记会主动生成管理模板并截断关联清单。

## 4. 代码偏差与选择理由

`GraphView` 的 Canvas 按钮仅排除子对象，因此 CSV、TSV、Table 等顶层节点也会显示为可用。`create_canvas_from_graph` 的入口先允许 Markdown、PDF、CSV、TSV 和开放 Table JSON，但随后调用 `build_local_graph`；后者再次解析中心时只允许 Markdown/PDF。结果是非 Markdown/PDF 顶层对象会在点击后失败。

项目笔记没有这项漂移：`canCreateProjectNote` 与 `create_project_note_from_graph` 都限定 Markdown/PDF。为了保持单批次最小且不掩盖实际支持范围，M4C-4 先关闭项目笔记披露；Canvas 的资格统一与快照披露继续作为独立后续批次。

## 5. 真实桌面与文件结果

真实 Tauri Debug WebView2 使用两份互链 Markdown 的隔离资料库，分别通过真实按钮执行两条输出。为避免第一条生成物进入第二条实时图谱，审计在复读 Canvas 证据后仅删除隔离临时资料库中的两个已验证 Canvas，再重新进入图谱执行项目笔记；用户资料和仓库内容未参与。

| 项目 | 实际结果 |
| --- | --- |
| 写盘前披露 | 两条均无确认框，按钮立即写盘 |
| Canvas 首个/编号目标 | `Graph Center 思维导图.canvas`、`Graph Center 思维导图 1.canvas` |
| Canvas 结构 | 2 个相对文件节点、2 条 `links-to` 有向边；自动打开并从磁盘复读 |
| 项目笔记首个/编号目标 | `Graph Center 项目.md`、`Graph Center 项目 1.md` |
| 项目笔记结构 | `longedit-generated`、中心、实际 3 层深度元数据；固定目标/下一步模板；1 个关联对象 |
| 来源安全 | 两份 Markdown 最终 SHA-256 均与初始值相同 |
| 视口 | 1280×820 与 480×700 均可用；窄屏详情内部滚动后两个输出入口可达 |
| 运行时/阻断错误面 | 0 / 无 |

四张截图已逐张人工复核并接受，不含本机绝对路径或用户内容。

## 6. 审计过程纠偏

1. 首轮 Canvas 已正确打开，但路由查询把空格编码为 `+`，脚本用普通空格比对导致误判超时；改用目标工作区和可见标题共同断言后，从全新隔离资料库重跑。
2. 第二轮确认真实按钮使用界面的默认 3 层，而脚本曾按直接命令的 1 层预期追溯元数据；断言改为实际 `longedit-depth: 3`。
3. 同轮还确认先生成的 Canvas 会被实时图谱扫描并进入随后生成的项目笔记。最终审计把两条候选的临时生成物隔离，避免候选互相污染；没有修改产品扫描逻辑。
4. 480px 图谱详情本身是有界滚动面板，不能以内部 `scrollHeight` 判为横向溢出。最终改为验证容器留在视口内，并把“生成项目笔记”滚动到可见位置取证。

## 7. 证据与验证

证据目录：[`evidence/post-v115-m4c3-graph-derived-output-disclosure-selection`](./evidence/post-v115-m4c3-graph-derived-output-disclosure-selection/)

Manifest 状态为 `accepted-after-visual-review`，交互证据状态为 `passed`。

```text
npm run audit:post-v115-m4c3-graph-output-selection
npm run check:post-v115-m4c3-graph-output-selection
cargo test --locked --manifest-path src-tauri/Cargo.toml commands::canvas::tests
npm run build
npm run check:post-v115-m4c2-opml-canvas-projection
npm run check:post-v115-m4c1-csv-tsv-table-conversion
npm run check:development-version-identity
git diff --check
```

## 8. 下一接续点

唯一下一阶段为 **M4C-4 图谱→项目笔记披露闭环**：

- 写盘前显示资料库相对中心、实际深度、同目录候选目标、不覆盖/编号策略和完成后自动打开；
- 明确目标是独立、可继续编辑但不会与图谱同步的时间点派生笔记；
- 明确会生成追溯元数据、固定目标/下一步任务模板，关联对象按标题/路径排序且最多 100 个，超出数量写入省略说明；
- 保留现有 Markdown/PDF 资格、新文件写入和源安全；
- 真实覆盖首个/编号目标、超过 100 个关联对象的截断与省略数、目标复读、1280/480、自动打开、源摘要不变和 0 错误。

图谱→Canvas 的中心资格纠偏与快照披露、全局转换框架、临时产物清理和 `M4-release-freeze` 均继续延期。
