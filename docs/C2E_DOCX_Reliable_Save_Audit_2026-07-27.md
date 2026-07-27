# C2E DOCX 可靠另存与三生产者重开审计

> 审计日期：2026-07-27
>
> 阶段范围：C2B～C2D 安全编辑子集的用户入口、可靠另存、落盘复读和外部生产者重开
>
> 结论：**C2E 已完成，C2 进度为 5/5。DOCX 原件和已有目标继续禁止覆盖；下一开发入口为 C3 PPTX 只读工作面。**

## 1. 本批交付

- DOCX 注册能力升级为“基础编辑副本”，保存模式固定为 `copy`。
- 原 Library 右侧工作面新增文本、基础粗体/斜体/下划线和图片替代文本编辑入口。
- 每次事务只处理一个经 C2B～C2D 枚举的安全目标；列表项和简单表格单元格复用文本事务。
- 保存前先生成隔离副本并返回输出 SHA-256；保存命令根据同一结构化操作重新构建输出，不接受前端传入任意 OOXML 字节。
- 源签名、目标不存在、三生产者矩阵、预览摘要、包差异、结构复读和语义复读均通过后，才调用 `write_new_bytes` 原子创建同目录新文件。
- 落盘后逐字节复读、重新解析 DOCX、复核语义输出和源文件字节；验证失败时仅在目标仍等于本次输出时清理未验收副本。

## 2. 可靠性边界

保存命令稳定拒绝：

- 源 DOCX 在读取后被外部修改；
- 目标等于源文件；
- 目标文件已经存在；
- 预览摘要、目标摘要或编辑操作发生变化；
- 三生产者证据不完整；
- 目标包含修订、域、复杂运行、浮动图片、合并/多段落表格单元格或其他未进入安全目标清单的对象。

未编辑 ZIP 部件继续逐字节保留。原件覆盖、已有目标覆盖、多目标批量编辑、任意 OOXML 编辑、字号/颜色、图片二进制替换和高级 Word 排版仍未开放。

## 3. 自动化证据

Rust 新增三组 C2E 回归：

1. Microsoft Word、WPS Writer、LibreOffice Writer 三类真实来源 fixture 均完成新副本创建、落盘复读和源字节不变验证；
2. 陈旧预览摘要、源路径覆盖和已有目标稳定拒绝；
3. C2E0 保存准备报告在无 blocker 时升级为 `ready_to_save_copy`，但本身仍不写文件。

真实桌面证据：

- `docs/evidence/a5-stage-a/c2e-docx-reliable-save-reopen.jpg`
- `docs/evidence/a5-stage-a/c2e-docx-producer-reopen.json`
- `docs/evidence/a5-stage-a/audit-manifest.json`

真实 Tauri Debug/WebView2 从 Microsoft Word 生产者文件完成编辑、隔离验证、另存和应用内重开；源文件字节保持不变。随后 Microsoft Word 16、WPS Writer 和 LibreOffice Writer 均复开同一个 LongEdit 输出并读取 `C2E Desktop Verified Text` 标记。

## 4. 阶段判定

产品现在可以准确声明：

> 支持安全子集内的 DOCX 段落、标题、列表项、简单表格文本、基础字符样式和图片替代文本编辑，并可靠另存为新 DOCX 副本。

产品仍不能声明：

- 完整 Word/WPS 排版等价；
- 覆盖原 DOCX 或已有目标；
- 修订、域、内容控件、公式、嵌入对象、浮动绘图或未知扩展可编辑；
- 图片替换/插入、字号、颜色及复杂段落多运行编辑已经完成。

## 5. 下一开发入口

下一阶段进入 **C3 PPTX 只读工作面**：

1. 先建立 Microsoft PowerPoint、WPS Presentation、LibreOffice Impress 三类真实生产者 fixture；
2. 审计 PPTX ZIP/XML 安全预算、许可证和未知部件保真；
3. 实现幻灯片缩略图、顺序、文本、图片、基础形状、主题背景、备注和搜索；
4. 搜索结果定位到幻灯片和对象，高级动画、母版、SmartArt 和复杂图表显式只读；
5. 完成真实 Tauri 桌面打开、搜索、定位后，再进入 C4 基础编辑。
