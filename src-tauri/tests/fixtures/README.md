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

超限样本由测试基于 `MAX_CANVAS_BYTES` 动态构造，避免在仓库中保存超过 20 MB 的无效文件。测试同时确认校验发生在落盘前。
