# 格式 fixture 说明

本目录保存可直接进入格式层和 Tauri 命令层的回归样本。

Canvas：

- `valid.canvas`：合法 JSON Canvas，验证标准格式兼容和读写往返。
- `damaged.canvas`：包含悬空连线的损坏画布，验证结构校验。
- `mindmap.md`：含标题、嵌套列表和代码块的 Markdown，验证脑图层级转换。
- `traversal-path.txt`：父目录跳转输入，验证命令无法读取知识库外文件。

PDF 批注：

- `pdf/valid.annotations.json`：合法的版本化 sidecar，覆盖来源元数据、归一化高亮坐标和评论。
- `pdf/damaged.annotations.json`：字段缺失且类型错误的 sidecar，验证损坏数据不会进入阅读器。

Workbook：

- `workbook/compatibility-baseline.xlsx`：包含多 Sheet、文本、数值、布尔值、日期/时间、错误值、命名区域与命名公式、公式缓存、表头样式、数字格式、条件格式、合并单元格、尺寸、冻结窗格、自动筛选、Excel Table、数据验证、柱形图、嵌入图片、透视表、切片器、外部链接、数据连接、打印区域/页面设置/页眉页脚及工作簿与 Sheet 保护的工作簿基线。
- `workbook/compatibility-baseline.json`：记录必须保持的语义单元格、文档特性和当前引擎能力等级。
- `shared/xlsx-release-gate.json`：定义复杂 fixture 覆盖下限、OOXML 全包差异白名单、10,000×12 Debug CI 性能负载和禁止宣传语。
- 运行 `cargo run --manifest-path src-tauri/Cargo.toml --example generate_workbook_fixture` 可重新生成 XLSX fixture。

超限样本由测试基于 `MAX_CANVAS_BYTES` 动态构造，避免在仓库中保存超过 20 MB 的无效文件。测试同时确认校验发生在落盘前。
