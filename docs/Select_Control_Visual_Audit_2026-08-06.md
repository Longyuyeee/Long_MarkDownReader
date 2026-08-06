# 下拉控件视觉适配审计

日期：2026-08-06  
结论：代码侧完成，纳入当前开发审计。

## 审计范围

- 13 个 Vue 组件中的 59 个原生 `select`，以及另外 2 个仅使用 Naive 下拉的组件。
- 设置、资料库、工作簿和画布使用的 Naive UI `NSelect`、`NDropdown` 及其传送到页面根部的弹层。
- 九套颜色主题，以及 hover、focus、disabled、selected、active 和分隔线状态。

## 完成内容

- 原生下拉统一移除 Windows 默认外观，使用随主题文字变化的轻量箭头；局部组件继续控制高度和宽度。
- 全局补齐悬停边框、键盘焦点环、禁用状态、选项文字与选项背景；深色和高对比主题启用深色原生弹层。
- Naive UI 选择框统一输入表面、边框、箭头、占位符和焦点态；弹出列表统一背景、阴影、悬停、选中、禁用和分隔线。
- 样式使用现有主题注册表生成，不为各页面复制固定颜色；新增下拉会自动继承合同。

## 验证

- `npm.cmd run build`
- `npm.cmd run check:select-control-contract`
- `npm.cmd run check:ui-consistency`
- `npm.cmd run check:current-development-audit`

安装包复测仍应抽查工作簿紧凑下拉、脑图工具栏、图表设置、DOCX/PPTX 编辑面板和设置页多选框，确认 Windows WebView2 弹层方向及边缘定位正常。
