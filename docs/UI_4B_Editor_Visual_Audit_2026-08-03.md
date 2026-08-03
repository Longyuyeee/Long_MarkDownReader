# UI-4B 主要格式编辑器视觉审计

日期：2026-08-03
当前状态：采集器与证据合同已建立，真实桌面矩阵待执行

## 需求对齐

UI-4B 对齐最初的“完整 Excel 等价编辑器、新文件格式编辑器、更多主题预设”需求，但当前阶段不再横向扩张能力，而是验证已实现的主要格式工作面能否在桌面产品中稳定使用。覆盖 Markdown、TXT、JSON、PDF、DOCX、PPTX、CSV、XLSX、Mermaid 图表、OPML 脑图和 JSON Canvas。

每个工作面验证专业浅色、专业深色、高对比主题，以及 Windows 100%、125%、150% 等效缩放，共 99 个截图槽位。检查重点是布局截断、页面溢出、工具栏可达性、底部状态、加载完成和受管文件路由。

## 工具基线

- `scripts/ui4b-editor-visual-matrix.mjs` 固定 11 个格式工作面及其真实加载完成标志。
- `scripts/run-ui4b-editor-visual-audit.ps1` 创建隔离审计资料库；文本类样例使用确定性内容，PDF 使用版本化双页样例，DOCX/PPTX/XLSX 复用仓库兼容性样例。
- `scripts/capture-ui4b-editor-visual-audit.mjs` 只连接真实 Tauri WebView2，并统一从 `LibraryMode?path=...` 受管文件入口打开样例。
- `scripts/check-ui4b-editor-visual-harness.mjs` 校验矩阵、样例、Tauri 边界、路由和几何合同。
- `scripts/check-ui4b-editor-visual-audit.mjs` 只接收完整 99 张截图，并拒绝错误主题、错误缩放、路由漂移、外壳溢出、工具栏裁切或底栏越界。

## 接收顺序

1. 提交并推送工具基线，形成可追溯的干净采集提交。
2. 运行 `npm run audit:ui4b-editor-visual` 生成 99 张真实桌面截图。
3. 运行机器证据检查，并人工抽查每个工作面的三主题与三缩放代表图。
4. 发现问题时拒收整批证据，修复后在新提交上完整重采。
5. 证据接收后将 `check:ui4b-editor-visual-evidence` 加入补丁发布质量门禁，再进入 UI-4C。

在完整采集和人工复核前，UI-4B 不标记为完成。

首轮采集探针确认资料库会在消费 `LibraryMode?path=...` 后将 URL 规范化为 `#/library`。证据合同因此分别记录请求入口与最终规范路由，并额外要求样例文件名出现在活动编辑器中；这保留了受管入口证明，也避免把规范化行为误报为路由漂移或误拍空资料库。
