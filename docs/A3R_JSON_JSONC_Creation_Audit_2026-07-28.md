# A3R JSON/JSONC 软件内创建阶段审计

> 审计日期：2026-07-28
> 产品基线：LongEdit `v0.7.0`
> 阶段状态：A3R 已完成；下一开发入口为 E0 WPS/OpenDocument/旧版 Office 格式与转换审计

## 1. 交付结论

A3R 已把普通 `.json` 和 `.jsonc` 接入现有统一新建、专用编辑、可靠保存和知识管理链路，没有创建第二套文件管理或编辑工作区。

1. 统一新建菜单由 `shared/file-formats.json` 自动列出“新建 JSON”和“新建 JSONC”。
2. 两种格式均以最小合法源码 `{}\n` 创建，并直接进入现有 `JsonEditorView`。
3. 注册表的创建与索引能力已从 `planned` 对齐为 `supported`；创建适配器为 `text-template`，索引适配器为 `text`。
4. 通用格式创建命令改用原子 `write_new_bytes`，在候选检查与最终落盘之间仍保持仅新建、不覆盖保证。
5. JSON 首次编辑、语法门禁、可靠覆盖保存、跨路由重开、树形预览、重名自动编号、JSONC 注释/尾随逗号保真、全文搜索和最近记录均已通过真实桌面验证。

## 2. 安全边界

- Library 路径继续由 `WorkspaceGuard` 约束，创建目标必须位于当前知识库内。
- 同名文件不会被静默覆盖；普通名称使用稳定编号，最终写入使用原子仅新建语义。
- JSON/JSONC 保存继续经过专用 Rust 语法分析、读取签名冲突检测、可靠替换与写后重读。
- JSONC 的注释、尾随逗号、重复键和高精度风险继续遵守既有保真门禁。
- `.table.json` 仍由最长扩展名路由到 Open Table，不会被普通 JSON 工作面抢占。

## 3. 自动化与真实桌面证据

代码与契约覆盖：

- `json_templates_are_valid_indexable_and_never_overwrite_existing_files` 验证两种模板合法、重名不覆盖。
- `json_source_formats_are_basic_edit_and_preserve_compound_routing` 验证创建、索引、适配器和复合扩展名路由。
- `check:format-contract` 验证前后端共享注册表、最小模板、原子创建与统一菜单契约。
- `check:a3r-json-creation-evidence` 固化真实桌面清单、哈希、视口和截图门禁。
- 完整 `npm run ci:check` 已通过：Rust 功能测试 `354/354`、性能测试 `1/1`、生产构建与全部历史证据门禁通过，生产依赖审计为 `0` 漏洞。

真实 Tauri Debug WebView2 在隔离临时知识库完成 8 项检查：

1. 统一菜单同时列出 JSON/JSONC。
2. 最小合法 JSON 创建后进入专用工作面。
3. 首次编辑、保存和跨路由重开。
4. 同名创建生成新文件且首个文件字节不变。
5. JSONC 注释和尾随逗号保存保真。
6. 重建索引后可以从正文搜索到新 JSON。
7. JSON 与 JSONC 均进入最近记录。
8. `1280×820` 与 `960×720` 布局可用。

证据目录：`docs/evidence/a3r-json-creation/`

- `a3r-create-options-1280.jpg`
- `a3r-json-saved-tree-1280.jpg`
- `a3r-json-search-960.jpg`
- `a3r-json-recent-capability-960.jpg`
- `audit-manifest.json`

## 4. 阶段判定与下一步

A3R 的软件内创建与完整管理闭环已经关闭，FR-JSON-001 可由“进行中”更新为“已完成”。JSON/JSONC 的更深语义编辑仍是增强项，不影响本阶段收口。

下一阶段只执行 **E0 WPS/OpenDocument/旧版 Office 格式与转换审计**：

1. 盘点 `.odt/.ods/.odp/.wps/.et/.dps/.doc/.xls/.ppt` 的公开规范、容器与安全风险。
2. 审计可用解析/转换器、许可证、包体积、离线能力和 Windows 分发约束。
3. 定义每类格式的识别、外部打开、只读预览、索引或显式安全转换等级。
4. 先形成决策矩阵和 fixture 计划，再选择最小实现切片；不把转换能力描述为原生等价编辑。
