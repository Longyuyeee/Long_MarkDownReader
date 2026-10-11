# F1 本地草稿登记活动审计

日期：2026-10-11；基线 `4bc3c217`；目标 1.1.0，未封板。

## 本轮范围与结论

沿接续计划检查 `useWindowDraft` 共用入口及 App 状态上报。当前调用方包括 DiagramStudio、CanvasView、WorkbookView、PdfView、DrawioEditorView、OdfContentReaderView、TableView、MindMapView、DocxReaderView、PptxReaderView，共 **10 类** 本地草稿视图（最初工作口头更新误计为 11，本文以代码检索为准）。主 Markdown、普通文本和 QuickNote 使用其他活动上报入口，不计入此数。

旧实现只更新草稿 Map；App 观察聚合 dirty 布尔值和活动版本。如果其他草稿已经使聚合 dirty 为 true，第二个编辑器的 dirty 切换、登记或注销可能不产生新的上报。dirty 本身仍阻断就绪，不能将此遗漏夸大为已证明的归档误执行。

`src/services/windowDrafts.ts` 现在在首次登记、dirty 布尔状态变化及作用域销毁时，先更新 Map，再推进活动版本。使用同步 `watch` 回调而不是在 `watchEffect` 内读写活动 ref，避免把活动版本变成自身依赖。销毁只移除自己的草稿，不释放独立的在途保存计数。

## 验证及限制

- `node --experimental-strip-types --test scripts/test-window-draft-lifecycle.mjs`：5 项通过；直接运行生产服务与 Vue effectScope/ref/watch，覆盖同步生命周期、聚合 dirty 不变、无活动反馈循环、销毁后惰性和独立保存计数保留。
- 四个既有 main/text 保存、加载、模式脚本：31 项通过。
- `node --experimental-strip-types scripts/check-text-save-receipt.mjs`：通过。
- `npx vue-tsc --noEmit`、`git diff --check`：通过。

本轮只修改共用状态服务，无模板、样式、布局、按钮或用户操作流程修改；未进行新的原生页面验收，也不复用上一轮截图声称本轮 UI 已通过。未改 Rust，未重跑 Rust 测试。本轮没有实现逐次正文活动监测：dirty 连续保持 true 时的正文变化仍需各编辑器具体接入，尤其不能用此补丁宣称全部编辑器保存保护完成。

## 接续与封板门槛

1. 按实际编辑器代码继续核对连续编辑活动和异步保存生命周期；优先表格与工作簿入口，补实际数据和页面验收。
2. 完成跨窗口最新确认请求/响应及失效处理，之后才推进归档执行、逐项回执与恢复流程。
3. UI 修改先遵守已有示意审批并实际查看对应页面；新恢复界面仍需示意审批。

F1 未闭环，后续功能和版本合同仍未完成，当前运行/发布版本未改变，未开放归档执行，未发布。
