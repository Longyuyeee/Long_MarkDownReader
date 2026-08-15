# P1-B3B PDF 永久脱敏栅格后端审计

日期：2026-08-15
状态：后端与保存命令已完成；产品入口仍关闭，下一入口为 P1-B3C 原 PDF 右侧工作区

## 1. 需求对齐与结论

本阶段实现 P1-B3A 批准的唯一安全路线，没有缩减为视觉黑框，也没有提前另做窗口或界面。它服务“在统一管理器中完成日常 PDF 基础编辑”的原始需求，但把保密性放在功能数量之前：只有全部页面均已形成有界、不透明且矩形像素确实烧入的栅格输入，后端才创建可靠新副本。

P1-B3B 只交付后端构建器、Tauri 预览/保存命令与测试，不在 `PdfView` 暴露按钮。`currentWriteCapability` 仍为 `false`，避免把尚未完成真实 PDF.js 页面渲染、交互与桌面证据的内部命令宣传为用户能力。

## 2. 后端实现

- 新模块 `src-tauri/src/formats/pdf_redaction.rs` 接收按源页顺序排列的全部 PNG 页面和规范化脱敏矩形；不接受缺页、乱序或局部页面集。
- PNG 解码使用 `ImageReader` 严格限制单边 4096 像素和单页分配，随后累计检查最多 64 页、1.2 亿像素、256 MB 栅格输入及 256 个矩形。
- 每个像素的 alpha 必须为 255；矩形内部必须已经是精确纯黑或纯白，否则判定前端尚未烧入并拒绝输出。
- 页面像素宽高比必须与源 PDF 继承后的 CropBox/MediaBox 和 Rotate 一致，防止错页、拉伸或错误方向输入。
- 通过验证的 RGB 像素重新编码为质量 90 的 JPEG，去除 PNG 文本块、ICC、EXIF 等输入元数据。
- 输出从 `Document::with_version` 空文档创建，并强制传统交叉引用表，避免额外 XRef 对象；每页只包含一个 DCT Image XObject、一个绘制流和一个 Page 对象。
- Catalog 只含 Pages，Trailer 只保留写出所需索引与 Root；源内容流、字体、图片、对象、Info/XMP、批注、表单、动作、图层、附件、书签和标签均不复制。

## 3. 安全验证

预览命令 `preview_pdf_redaction_copy` 仅允许资料库内 PDF，读取源文件后绑定 SHA-256，运行完整构建与复读但不落盘。签名或加密 PDF 返回稳定 blocker；摘要失配、透明像素、未烧入矩形、页面/资源超限均直接失败且不产生输出。

可靠另存命令 `save_pdf_redaction_copy` 重新执行相同构建，要求输出 SHA-256 与预览一致，只允许同目录新 `.pdf` 文件。写入使用 `write_new_bytes` 的 `create_new` 语义；源路径和已有目标都不能覆盖。落盘后要求目标字节与预览完全一致、SHA-256 一致、页数和对象数量一致、逐页文本提取为空，并再次复核源 SHA-256 未变化。

输出对象数被固定为 `3 × 页数 + 2`：每页图片、内容流、Page 三个对象，加 Pages 与 Catalog。Catalog/页面/Trailer 的非白名单键会阻断，逐页必须恰好一个 `Im0` 图片且没有 Annots。

## 4. 测试与视觉复核

Rust 回归共 3 项：

1. `builds_fresh_image_only_pdf_and_removes_source_markers` 验证源秘密文本与 Info 标记存在，但输出字节不含标记、文本提取为空、对象图和页面几何通过。
2. `blocks_incomplete_transparent_or_unburned_rasters_and_signatures` 验证缺页、透明画布、矩形未烧入与数字签名均失败关闭。
3. `permanent_redaction_copy_saves_new_target_reopens_and_preserves_source` 验证预览摘要、可靠新建、目标重开、源不变、已有目标和源覆盖拒绝。

使用同一 Rust 保存测试导出纯合成临时 PDF，并由 Poppler 96 DPI 独立渲染。源页文字清晰；目标页为图片型页面，黑色脱敏区域边界清晰、完全不透明，没有裁切、透明或渲染错误。该临时证据已目视检查后从交付范围排除；B3C 将用 PDF.js 真实全页渲染验证非脱敏区域的视觉保真。

Windows 本地 Cargo 偶发报告增量编译工作目录清理“拒绝访问”，但测试进程退出码为 0，3 项脱敏测试全部通过；该警告不影响产物或断言。

## 5. 当前边界与下一步

当前后端不会自行渲染源 PDF，也不能证明任意调用方提交的栅格与屏幕预览完全一致；它验证的是页序、几何、不透明性、矩形烧入、资源预算和安全输出对象图。可信页面渲染必须由下一步原工作区内的 PDF.js 完成。

P1-B3C 将在原 `PdfView` 右侧侧栏加入脱敏矩形草稿、黑/白选择、全量图片型降级说明、验证与可靠另存。它必须复用现有 PDF.js 文档实例逐页渲染，不新增窗口或路由；外部 PDF 无入口。完成宽窄屏和真实保存证据前，公开能力仍不得加入 `permanent-redaction-copy`。
