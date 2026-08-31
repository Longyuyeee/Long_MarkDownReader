# v1.0.19 M7-2 本地 JSON Schema 产品与桌面审计

审计日期：2026-08-31

## 结论

M7-2 产品验收通过。M7-1 冻结的本地、离线、有界 Schema 内核已经接入真实 Tauri 命令和既有 JSON/JSONC 编辑器，没有扩张为联网 Schema Studio，也没有改变显式保存、摘要冲突保护或外部文件边界。

当前运行时和公开版本仍为 `1.0.18`，开发目标为 `1.0.19`；本阶段不是发布候选，不提升版本、不打包、不创建 Tag 或 Release。

## 与最初需求及实际代码对齐

- 资料库内 `.json` / `.jsonc` 只读发现同目录同 stem `<document-stem>.schema.json`；`.schema.json` 自身不递归发现 sidecar。
- 新命令复用 `WorkspaceGuard` 解析真实资料库文档路径，再调用 M7-1 内核；跨目录、软链接逃逸、损坏 Schema 和非内部引用均失败关闭。
- 编辑器把 JSON/JSONC 语法事实与 Schema 业务约束分开显示。无 sidecar 明确为“未配置”且产生 0 条业务诊断；损坏 sidecar 明确为“Schema 不可用”，不伪装成文档错误。
- 诊断显示 sidecar 来源、JSONPath、行列和脱敏消息，点击后定位既有源码编辑器。文档实际值不会进入界面证据。
- 外部文件不读取相邻 Schema；超过既有 4 MiB 阈值的 range mode 不运行 Schema；文档或 sidecar 变化会触发有界只读复验。
- 验证链没有任何源写入；保存仍只由用户显式触发，既有语法保存门和磁盘冲突保护不变。

## 自动化与真实桌面证据

- JSON Tauri 命令模块：13 通过、0 失败，其中覆盖资料库授权、JSONC sidecar、业务诊断定位、越界文档拒绝和外部引用失败关闭。
- Schema 内核：9 通过、0 失败。
- `cargo check --locked`：通过。
- `npm run build`：通过，Vite 转换 6,275 个模块。
- 真实 Tauri WebView2：`1280×800` 与 `720×680` 均通过，无横向溢出，运行时错误 0。
- 状态矩阵：无 sidecar → 0 诊断；拒绝型 sidecar → 2 条脱敏诊断；点击 `$.port` → 源码第 3 行；改为接受型 sidecar → 自动刷新为通过；损坏 sidecar → 失败关闭；恢复后文档与 sidecar SHA-256 均与基线一致。

机器证据位于 [`evidence/post-v118-m7-2-local-json-schema-desktop`](./evidence/post-v118-m7-2-local-json-schema-desktop/)，包含结构化运行回执和宽窄屏截图。样本完全由审计脚本临时生成，不包含用户内容。

## 偏移审计

未发现偏离最初路线。实现保持“可选 Schema、路径/行列定位、未配置零误报、离线只读”的原始目标；没有加入远程 provider、外部 `$ref`、YAML/TOML 投影、XSD、Schema 编辑或静默写回。真实验收中发现的偏差仅在证据层：初版窄屏截图没有把通过卡片滚入可视区，现已纠正并重新采集，产品行为本身未失败。

## 接续点

唯一接续点为 **M7-3 v1.0.19 质量债与发布就绪审计**：运行全仓 Rust 测试、完整 `ci:patch-release` 和生产依赖审计，并审查本增量没有引入新的质量债。M7-3 通过前仍不得提升版本或构建候选；通过后才可进入原子版本迁移与候选 MSI/NSIS 打包。
