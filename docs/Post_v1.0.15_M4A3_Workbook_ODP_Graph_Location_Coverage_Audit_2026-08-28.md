# Post-v1.0.15 M4A-3 Workbook/ODP 图谱定位覆盖审计

日期：2026-08-28

分支：`main`

开发目标：`1.0.16`

运行时与公开版本：`1.0.15`

发布状态：`releaseCandidate=false`

## 1. 结论

M4A-3 已按 M4A-2 冻结范围完成。Workbook 与 ODP 现在分别具有文档父节点和 `workbook_sheet` / `odp_slide` 内部对象节点，父子层级统一表达为 `contains`，没有把包结构伪造成正文 mention。统一语义事实源显式登记 `workbook`、`workbook_sheet`、`odp`、`odp_slide` 四类对象。

真实 Tauri/WebView2 固定夹具共生成 8 个节点（2 个父节点、6 个子节点）和 6 条 `contains`，结构 mention 为 0。从 Graph 精确打开 Workbook `Inventory` 与 ODP `Overview`，从父对象关系上下文精确打开 Workbook `Details` 与 ODP `Closure`；4 次均显示“内部对象上下文”，并 4/4 返回 Graph。运行时错误为 0，两个源文件摘要前后一致。

下一接续点冻结为 **M4A-4 DOCX/ODS 图谱粒度选择审计**。本阶段不把 DOCX block 或 ODS cell 直接加入图谱，也不混入工作台全对象行动、转换统一或版本冻结。

## 2. 实现与原始需求对齐

| 冻结要求 | 实际实现 | 结果 |
| --- | --- | --- |
| Workbook 父节点与 4 个 sheet 子节点 | 复用知识索引的有界 Workbook sheet 分段，生成稳定 `workbook-sheet` 定位器 | 通过 |
| ODP 父节点与 2 个 slide 子节点 | 解析真实 ODP 包，复用稳定 slide ID，生成 `odp-slide` 定位器 | 通过 |
| 6 条结构关系且 mention 为 0 | 两类包内层级均使用 `contains`，不写入 mention | 通过 |
| 四类显式语义 | `shared/graph-semantics.json` 登记父/子类型的名称、图形、颜色与顺序 | 通过 |
| Graph 与关系上下文精确打开 | 两个入口统一调用 `openManagedObject`，有定位器的节点统一保存对象焦点 | 通过 |
| 返回、安全与运行质量 | 4/4 返回 Graph，错误 0，两个源摘要不变 | 通过 |

实现继续遵循最初“以真实文件、真实桌面和可复核差异完成阶段”的要求。Workbook 没有另写一套工作表解析，而是复用既有索引生成器及其 64 sheet 上限；ODP 使用实际包解析结果，不从展示文本猜测幻灯片。内部对象焦点由原来的 PPTX 特判纠正为所有带稳定 locator 的对象通用处理，避免新增格式复制分派逻辑。

## 3. 真实验收结果

- 图谱节点：8；父节点：2；子节点：6。
- 关系：6 条 `contains`；结构 mention：0。
- 对象类型：`odp`、`odp_slide`、`workbook`、`workbook_sheet`。
- Graph 内部打开：2；父对象关系上下文内部打开：2。
- 返回 Graph：4/4。
- 运行时错误：0；阻断错误界面：未出现。
- 源文件：Workbook 与 ODP 的 SHA-256 前后一致。
- 三张 1280 宽截图已人工复核：图谱全景、Workbook 内部对象关系上下文、ODP 内部对象关系上下文均符合预期。

## 4. 开发与审计纠偏

首次 Rust 回归失败来自测试断言把真实夹具的首字母大写文本当成小写匹配，产品解析与图谱结果本身正确。断言改为大小写无关比较后，30 个图谱测试全部通过；没有为了迎合测试改变用户内容。

首次桌面审计在 Graph 组件仍挂载时只修改 `root` 查询参数，误以为会重新执行组件的初始居中流程，导致等待 Inventory 选择超时。审计脚本已改为先返回 Library、再进入指定 Graph 根节点，按实际路由生命周期验证；产品代码无需为测试脚本的错误假设增加副作用。

首次视觉复核发现图谱截图仍打开父节点详情，可能显示隔离审计临时路径；结构化路由也保留了临时文件路径。捕获流程已在截图前关闭详情并等待过渡结束，证据中的 `path` 统一替换为 `[fixture]`，最终截图与 JSON 均不含用户名、AppData 或审计临时目录。

历史图谱合同仍要求关系上下文存在 `pptx_slide` 专属分支，与 M4A-1 已建立的共享定位合同及本阶段的通用内部对象焦点不一致。门禁已改为核对稳定 locator 的通用焦点保留，PPTX 行为仍由共享导航合同和现有回归覆盖。

最终 TypeScript 构建还发现后端 locator 的 `page` 合同允许 `null`，而前端关系焦点状态只接受数字或未定义。真实 ODP 夹具有有效页码，因此桌面流程未触发异常，但静态类型门禁正确揭示了边界差异；Graph 与关系上下文入口现统一把 `null` 规范化为 `undefined`，没有改变有效页码。

仓库级 `cargo fmt --check` 会报告多处本阶段之外的既有 Rust 格式差异。为避免覆盖用户或历史工作的无关文件，本阶段只对 `src-tauri/src/commands/graph.rs` 执行并验证 `rustfmt`；该全仓历史漂移不改写为本阶段通过，也不作为扩大修改范围的理由。

## 5. 验证与证据

- 真实桌面：`npm run audit:post-v115-m4a3-workbook-odp-graph-location`
- 阶段合同：`npm run check:post-v115-m4a3-workbook-odp-graph-location`
- 图谱产品合同：`npm run check:graph-product-contract`
- 历史语义兼容：`npm run check:post-v115-m3a1-semantics`
- 开发版本身份：`npm run check:development-version-identity`
- 前端构建：`npm run build`
- Rust 图谱回归：`cargo test --locked --manifest-path src-tauri/Cargo.toml commands::graph::tests`
- 本阶段 Rust 格式：`rustfmt --check --edition 2021 src-tauri/src/commands/graph.rs`
- 结构化证据：`docs/evidence/post-v115-m4a3-workbook-odp-graph-location-coverage/interaction-evidence.json`
- 视觉证据：`workbook-odp-graph-1280.jpg`、`workbook-relation-context-location-1280.jpg`、`odp-relation-context-location-1280.jpg`，均已人工复核。

M4A-3 至此收口。M4A-4 只负责 DOCX/ODS 图谱粒度和规模选择；未经选择审计，不宣称剩余 M1 对象已经完成图谱覆盖。
