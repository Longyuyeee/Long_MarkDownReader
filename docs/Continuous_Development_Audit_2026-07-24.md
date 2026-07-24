# 连续开发审计与推送记录

更新日期：2026-07-24
开发分支：`codex/a4-format-closure`
起始基线：`main` / `3270248 docs: audit development pause and next stages`

## 1. 推进原则

本轮按“实现、验证、审计、独立提交、推送”的顺序连续推进。每个步骤必须形成可单独回退和验收的提交；未满足代码、测试和用户闭环门禁的能力不得标记为 `supported`。

用户本地 `.claude/settings.local.json` 不属于项目交付范围，所有提交均显式排除。

## 2. 步骤记录

| 步骤 | 状态 | 交付内容 | 验证 | 后续入口 |
|---|---|---|---|---|
| J0 JSON 能力说明收口 | 已完成 | 让 JSON/JSONC 用户能力说明与已经交付的树形预览、标量、键、对象属性和数组项受保护编辑保持一致 | 格式契约、生产构建和差异检查 | A4-Y1 YAML 格式与分析内核 |
| A4-Y1 YAML 分析与保存门禁 | 已完成 | YAML 1.2 权威解析、特殊构造统计、带位置有界大纲、稳定诊断和无效源码覆盖阻断 | YAML 定向测试 5/5、Cargo check、Rustfmt | A4-Y2 YAML 格式注册与前端工作面 |

## 3. J0 审计

### 原因

`shared/file-formats.json` 仍宣称普通 JSON 的树形编辑在后续批次、JSONC 结构化写回完全禁用，但当前代码已经提供：

- 树形预览和 JSON Path。
- 标量值替换。
- 对象键重命名。
- 对象属性追加与删除。
- 数组项追加与删除。
- 对重复键、精度风险、歧义注释和陈旧范围的稳定阻断。

旧说明会让文件树、标签页和能力提示低估当前实际能力。

### 变更

- JSON 能力标签从“源码编辑”调整为“基础编辑”。
- JSON 描述明确已开放的受保护结构编辑范围，并保留“创建、索引未完成”边界。
- JSONC 描述明确局部结构编辑能力与阻断条件，不宣称任意 AST 往返。

### 验收结论

本步骤只修正能力事实源和用户可见说明，不改变 JSON 写入算法。下一步骤进入 A4 YAML 第一段，先建立格式注册、后端权威分析和保存门禁。

## 4. A4-Y1 审计

### 交付

- 固定 `saphyr 0.0.11` 与 `saphyr-parser 0.0.11`；没有保留未消费的前端依赖。
- 新增 `formats/yaml.rs`，权威解析 YAML 1.2，并返回多文档数、节点/深度、锚点/别名、标签、块标量和带源码位置的结构大纲。
- 分析限制为 8 MiB、100,000 节点、128 层和 20,000 条大纲，防止超大结构跨 IPC 扩散。
- 新增 `commands/yaml.rs`；无效 YAML 默认返回 `invalid-yaml-save-blocked`，有效源码后续复用注册文本写入内核。
- Tauri handler 已登记分析和保存命令，但共享格式注册和用户路由保持关闭，避免半成品入口对用户可见。
- fixture 覆盖多文档、锚点/别名、标签、块标量和损坏输入。
- 新增 `YAML_Editor_Architecture_Decision.md` 固化源码事实源、保真边界和分批路线。

### 验证

- `cargo check --locked --manifest-path src-tauri/Cargo.toml` 通过。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml yaml -- --nocapture`：5/5 通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml` 已应用。
- Windows 仍有既有 Rust 增量目录清理警告，不影响测试退出码。

### 边界

本步骤没有注册 `.yaml/.yml`，也没有开放用户工作面，因此只标记为后端基础完成。下一步骤必须完成共享注册、独立前端路由、诊断定位、大纲导航和可靠保存，之后才能把 YAML 阅读/编辑能力声明为 `supported`。
