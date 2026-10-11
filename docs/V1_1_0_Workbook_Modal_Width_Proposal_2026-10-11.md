# Workbook 设置弹窗限宽提案（待确认）

日期：2026-10-11。状态：仅预览，尚未获用户确认，未修改正式 Vue/CSS，未封板。

范围仅为页面设置、打印选项、页眉页脚三个既有弹窗。保留所有字段、选项、页签及按钮；恢复代码原设计的居中 680px 上限，左右至少 16px，不扩展到其他弹窗。

实际页面预览使用 `scripts/preview-workbook-modal-width.mjs`，在隔离后台 Chromium 中临时注入 CSS，未接管桌面。1280×800 下三个弹窗实测均由 1280px 宽、x=0，变为 680px 宽、x=300；高度不变。已查看全部提案截图，当前桌面尺寸下字段及操作无裁切。不是正式实施验收；窄窗口/深色主题/缩放与原生 WebView 需在确认后验证。

| 页面 | 修改前 | 提案 |
| --- | --- | --- |
| 页面设置 | [原页面](evidence/v110-workbook-modal-width-proposal/page-layout-before.png) | [限宽预览](evidence/v110-workbook-modal-width-proposal/page-layout-proposal.png) |
| 打印选项 | [原页面](evidence/v110-workbook-modal-width-proposal/print-options-before.png) | [限宽预览](evidence/v110-workbook-modal-width-proposal/print-options-proposal.png) |
| 页眉页脚 | [原页面](evidence/v110-workbook-modal-width-proposal/header-footer-before.png) | [限宽预览](evidence/v110-workbook-modal-width-proposal/header-footer-proposal.png) |

实施方向：使限宽选择器匹配 Teleport 后的实际弹窗节点，避免依赖不存在的作用域祖先。先确认上方视觉方向，再做代码修复；不以预览截图代替最终页面验收。其他结构写入和原生回归仍待继续。
