# v1.0.19 M7-1 本地 JSON Schema 可行性审计

## 1. 结论

M7-1 可行性通过。现有 JSON/JSONC 解析、路径条目和行列定位足以支撑可选 JSON Schema；新后端内核可以只读发现 `<document-stem>.schema.json`，使用 Draft 2020-12 验证，并把实例 JSON Pointer 映射回既有 JSONPath、字节范围和源码行列。

这不是产品验收：当前没有注册 Tauri 命令，也没有 UI、文件变化刷新或真实桌面证据。运行时和公开版本保持 1.0.18，开发目标保持 1.0.19，`releaseCandidate=false`。

## 2. 对齐最初需求

- Schema 是可选能力；没有同名 sidecar 时返回 `no-schema`，业务诊断为 0，不把“未配置”误报为错误。
- 语法事实仍由原 JSON 分析器负责，Schema 只在语法与资源门通过后运行，两种事实不会混为一谈。
- Schema 错误带 `local-sibling-sidecar` 来源、关键字、实例路径、Schema 路径及源码行列。
- JSONC 的注释和尾逗号通过原解析器转换，不写回或格式化用户源码。
- YAML/TOML 投影与 XML/XSD 没有被并入本阶段。

## 3. 安全与预算

`jsonschema = 0.52.1` 使用 `default-features=false`，未启用 `resolve-http` 或 `resolve-file`。内核在构造验证器前再次遍历 Schema，只允许 `#` 开头的内部 `$ref`/`$dynamicRef`；HTTP、file URI 和相对引用均失败关闭。同级文件会比较 canonical 父目录，跨目录符号链接被拒绝。

预算冻结为 Schema 1 MiB、5 万节点、64 个引用、200 条诊断。Schema 必须是 UTF-8 严格 JSON 和 Draft 2020-12；损坏、旧 Draft、超限与不安全引用均返回安全错误。诊断使用脱敏消息，测试确认示例文档值不会进入消息。

## 4. 验证结果与实际纠偏

- 新内核定向测试：9 通过、0 失败；补充覆盖数字对象键与数组索引的 Pointer 歧义。
- 原 JSON 回归：28 通过、0 失败。
- `cargo check`：通过。
- 真实临时目录中的 JSONC 与 sidecar 完成只读验证，前后两文件 SHA-256 不变。

实现中没有直接依赖验证器默认网络策略：在关闭依赖默认特性的基础上又加了一层引用白名单。也没有把验证器原始错误直接暴露给 UI，而是使用 masked message。格式化审计曾发现当前工具链机械重排了 13 个无关 Rust 文件，已全部撤回，无关改动未进入阶段提交。

补充执行的全仓 `cargo clippy -D warnings` 不是现有发布门，实际暴露 43 条历史 lint（参数数量、类型复杂度和旧式写法等），新模块命中 0；因此不伪报 Clippy 全绿，也不在 M7-1 混入无关重构。正式 `cargo check` 与本阶段测试均通过。

## 5. 接续点与发布边界

唯一接续点为 **M7-2 有界本地 JSON Schema 产品实现与真实桌面审计**：注册只读 Tauri 命令并复用资料库路径授权，在现有 JSON 编辑器中分开展示语法与 Schema 状态，显示 Schema 来源，响应文档/sidecar 变化，同时保持显式保存和外部冲突保护。随后必须完成真实 Tauri 宽窄窗口、源文件/Schema 不变与零运行时错误验收。

M7-2 完成前不提升版本、不打包、不创建 Tag 或 Release。版本迁移与发布仍需在产品验收、完整质量门和发布就绪审计之后独立执行。
