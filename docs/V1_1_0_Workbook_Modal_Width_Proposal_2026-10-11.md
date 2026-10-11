# Workbook 设置弹窗限宽提案（待确认）

日期：2026-10-11。状态：用户在提案后确认按顺序继续，已实施三个弹窗的限宽修复；整体未封板。以下提案截图保留为实施前审批记录。

## 实施与验证

正式 `WorkbookView.vue` 仅将三个限宽选择器由 `:deep` 改为 `:global`，不依赖 Teleport 前的祖先作用域。680px 上限、左右 16px 与原有响应式布局保持不变；未删除或新增字段、按钮及功能。

`test-workbook-modal-width-browser.mjs` 在无临时 CSS 的实际组件上验证三个弹窗 × 1280/800/640px：宽度分别为 680/680/608px，左右留白达标，无弹窗横向溢出，取消/应用按钮可见。已查看桌面及三个 640px 截图：[桌面页面设置](evidence/v110-workbook-modal-width-implemented/page-layout-1280.png)、[窄页面设置](evidence/v110-workbook-modal-width-implemented/page-layout-640.png)、[窄打印选项](evidence/v110-workbook-modal-width-implemented/print-options-640.png)、[窄页眉页脚](evidence/v110-workbook-modal-width-implemented/header-footer-640.png)。

类型检查通过；`test-workbook-page-settings-browser.mjs` 的失败/重试/重开及两个清空确认回归通过，并确认三个限宽选择器 matches 均为 true。后台 Chromium 模拟 IPC，不接管桌面，不代表原生 WebView/文件落盘验收。深色主题、系统缩放与原生专项仍未覆盖，本次不宣称全环境 UI 验收或版本封板。

范围仅为页面设置、打印选项、页眉页脚三个既有弹窗。保留所有字段、选项、页签及按钮；恢复代码原设计的居中 680px 上限，左右至少 16px，不扩展到其他弹窗。

实际页面预览使用 `scripts/preview-workbook-modal-width.mjs`，在隔离后台 Chromium 中临时注入 CSS，未接管桌面。1280×800 下三个弹窗实测均由 1280px 宽、x=0，变为 680px 宽、x=300；高度不变。已查看全部提案截图，当前桌面尺寸下字段及操作无裁切。不是正式实施验收；窄窗口/深色主题/缩放与原生 WebView 需在确认后验证。

| 页面 | 修改前 | 提案 |
| --- | --- | --- |
| 页面设置 | [原页面](evidence/v110-workbook-modal-width-proposal/page-layout-before.png) | [限宽预览](evidence/v110-workbook-modal-width-proposal/page-layout-proposal.png) |
| 打印选项 | [原页面](evidence/v110-workbook-modal-width-proposal/print-options-before.png) | [限宽预览](evidence/v110-workbook-modal-width-proposal/print-options-proposal.png) |
| 页眉页脚 | [原页面](evidence/v110-workbook-modal-width-proposal/header-footer-before.png) | [限宽预览](evidence/v110-workbook-modal-width-proposal/header-footer-proposal.png) |

实施方向：使限宽选择器匹配 Teleport 后的实际弹窗节点，避免依赖不存在的作用域祖先。先确认上方视觉方向，再做代码修复；不以预览截图代替最终页面验收。其他结构写入和原生回归仍待继续。
