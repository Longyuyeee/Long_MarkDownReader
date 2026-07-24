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
| A4-Y2 YAML 专业工作面 | 已完成 | 注册 `.yaml/.yml`，交付语言感知源码编辑、实时诊断、结构提纲、草稿恢复、可靠保存与文本索引 | 生产构建、格式契约、YAML/Rust 注册定向测试、差异检查 | A4-Y3 全量回归与能力收口 |
| A4-Y3 YAML 全量回归 | 已完成 | 对 YAML 接入后的前端、格式、主题、XLSX、Rust、PDF 性能和生产依赖执行发布级回归 | `npm run ci:check` 全部通过 | A4-Y4 YAML 创建闭环 |

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

## 5. A4-Y2 审计

### 交付

- 在共享格式事实源注册 `.yaml` 和 `.yml`，两种扩展名统一进入 `YamlEditor`，8 MiB 分析上限与后端一致。
- 新增独立 YAML 工作面，提供 CodeMirror YAML 高亮、查找、折叠/展开、行列状态和响应式双栏布局。
- 实时调用 Rust 权威解析器，显示多文档数、节点数、深度、锚点、别名、标签、块标量、诊断和可定位结构提纲。
- 复用统一标签页与内存草稿，切换文件时保留未保存内容；关闭脏标签仍由统一会话层确认。
- 保存路径使用 `write_yaml_source_document`，默认阻断非法 YAML，显式确认后才允许原样保存；磁盘签名变化触发外部修改冲突提示。
- YAML 使用 `text` 索引适配器进入现有知识库搜索；创建仍保持 `planned`，没有虚报能力。
- 格式契约检查新增 YAML 注册、前后端命令、资源预算、可靠保存、路由、会话标签和大纲边界的静态门禁。

### 验证

- `npm run build` 通过，YAML 工作面独立懒加载。
- `npm run check:format-contract` 通过：schema v2、12 种格式、16 个扩展名。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml yaml -- --nocapture` 通过。
- `git diff --check` 通过。

### 能力结论

YAML 的读取、基础编辑和索引闭环现已满足 `supported` 门禁；创建保持 `planned`。A4-Y3 将执行全量 CI、补足最终验收证据，并根据回归结果决定是否进入下一格式。

## 6. A4-Y3 全量回归审计

### 发布门禁结果

- 前端 TypeScript 检查与 Vite 生产构建通过；YAML 工作面保持独立懒加载资源。
- 主题契约、格式契约、工作簿契约和 XLSX 发布门禁全部通过。
- Rust 功能测试 251/251 通过，工作簿性能测试 1/1 通过。
- 100 MiB PDF 范围读取基准：单次请求约 255.9 KiB，本机耗时 120 ms。
- 生产依赖审计为 0 个漏洞。

### 非阻断项

- Vite 仍报告既有的少量大于 500 KiB 懒加载资源，主要来自 UI、Mermaid 与复杂图表依赖；YAML 自身资源约 24 KiB，不是新增体积风险源。
- 本轮没有执行 Windows 安装包人工冒烟；桌面安装、文件关联、升级/卸载仍属于独立的 A5 发布审计。

### 结论

YAML 读取、编辑、诊断、提纲、草稿、可靠保存、统一标签页和索引没有破坏现有能力，可以进入创建闭环。创建完成后可将 YAML 用户能力提升为 `complete-edit`。
