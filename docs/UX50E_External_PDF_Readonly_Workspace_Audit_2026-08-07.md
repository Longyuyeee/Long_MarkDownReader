# UX-50E / EA-3B 外部 PDF 只读工作区审计

日期：2026-08-07

## 本阶段结论

EA-3B 已完成。PDF 现在可以由“打开外部文件”、Windows 启动参数或用户主动设置的默认应用入口直接进入 LongEdit。外部 PDF 只开放专业阅读能力，不写 PDF 原文，不写同目录 Sidecar，也不生成页面操作副本。

外部打开能力现为：

- `edit`：23 类 Markdown、文本、代码和结构化源码，只有点击保存才写回。
- `preview`：图片、视频和 PDF 共 3 类，只读打开且永不写回。

## 需求对齐

- 外部 PDF 保留渐进 Range 读取、4 MiB 以内快速读取、密码输入、缩略图、目录、正文搜索、页码跳转、缩放、适合宽度和阅读位置恢复。
- 外部标题明确显示“外部文件 · 只读 · 不会写回”，并纳入统一标签会话，可返回资料库。
- 新增 `read_external_pdf_info` 与 `read_external_pdf_range`；两者只能解析已经由用户授权且注册为 `preview` 的 PDF。
- Range Transport 显式选择资料库命令或外部命令，不接受伪造知识库根路径。
- 批注、OCR、引用、页面整理、页面提取、合并和插页只在资料库 PDF 中显示；外部模式不加载 Sidecar，也不初始化页面修改草稿。
- 资料库内 PDF 原有 Sidecar、OCR、引用和可靠新副本能力没有改变。
- 文件选择器和启动参数已自动纳入 PDF，但安装器关联仍只有 `.md/.markdown`；是否让 LongEdit 打开 PDF 由用户在 Windows 中逐项决定。
- 格式能力页现在显示 23 类可编辑和 3 类只读文件，不再把所有只读格式统称为媒体。

## 自动化证据

- `check:external-pdf-preview`：通过，锁定授权读取、只读界面、资料库专属 Sidecar/页面操作和无 PDF 安装器关联。
- `check:external-media-preview`：通过，图片与视频的两类媒体边界未漂移。
- `check:external-file-workspace`：通过，23 类外部编辑能力未回退。
- `check:ux38d1-pdf-workspace`：通过，资料库 PDF 工作区及已接受运行证据未回退。
- `vue-tsc --noEmit` 与 Vite 生产构建：通过。
- `services::external_file_access::tests`：4/4 通过，包含 PDF preview 授权与禁止 edit。
- `commands::pdf::tests`：26/26 通过，覆盖外部格式隔离、渐进读取、Sidecar、页面计划、提取、合并、插页和可靠副本。
- `cargo check --locked`：通过。

## 保留边界

- 外部 PDF 不创建 `.annotations.json` 或 `.ocr.json`。后续若要为外部 PDF 提供批注，应先设计用户明确选择的 Sidecar 目标位置，不能默认污染源目录。
- 外部 PDF 不开放页面整理、提取、合并和插页。若后续开放，必须使用用户选择的新目标路径，并保持源文件与已有目标不变。
- 本阶段没有把 ODS、ODP、DOCX、PPTX、XLSX 或图形格式批量改为外部打开。
- 安装态仍需覆盖双击 PDF、单实例二次打开、大 PDF Range 读取、加密 PDF、关闭标签和返回资料库。

## 下一入口

进入 EA-3C：审计纯只读结构格式，优先评估 ODS 与 ODP。只有当解析命令能够复用独立授权、界面能隐藏资料库索引与写入语义、并保持源文件零变化时，才登记为 `preview`。DOCX、PPTX、XLSX 等带保存或可靠副本能力的格式继续单独处理。
