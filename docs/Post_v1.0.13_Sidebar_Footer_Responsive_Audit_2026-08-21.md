# v1.0.13 后续：窄窗口资料库卡片响应式审计

## 问题

当主窗口缩窄到 900 × 720、左侧栏被响应式规则压缩到 200 px 时，左下角“当前资料库”卡片仍沿用宽侧栏布局，导致标签逐字换行、名称与版本信息越界，卡片整体变形。

## 修复

- 侧栏成为独立的 inline-size 容器，底部卡片根据侧栏实际宽度切换紧凑布局，而不是只依赖整个窗口宽度。
- 侧栏不超过 230 px 时收紧内边距与图标尺寸，“当前资料库”保持单行，资料库名称使用省略显示。
- 窄侧栏隐藏非关键状态点和箭头，保留设置入口、资料库名称和当前软件版本。
- 外部应用探测统一经过 Tauri 运行时保护，普通浏览器审计环境不会误调用桌面命令。

## 真实结果

隔离 Edge 加载实际 Vue 页面并固定为 900 × 720：侧栏宽 200 px，卡片高 59.98 px，标签高 17.59 px且 `white-space: nowrap`；资料库名称和 `v1.0.13` 徽标均完整位于卡片边界内，页面横向溢出为 0，运行时错误为 0。

截图见 [`evidence/post-v1013-sidebar-footer-responsive/sidebar-footer-900x720.png`](./evidence/post-v1013-sidebar-footer-responsive/sidebar-footer-900x720.png)，结构化数据见 [`runtime-evidence.json`](./evidence/post-v1013-sidebar-footer-responsive/runtime-evidence.json)。

## 验收

- `npm run audit:sidebar-footer-responsive`：通过
- `npm run check:main-version-indicator`：通过
- `npm run check:sidebar-tabs-responsive`：通过
- `npm run check:ui-typography`：通过
- `npm run build`：通过

本次是 v1.0.13 发布后的源码修复，不提升版本、不重打安装包。后续版本发布时再随其他已验收改动一并进入版本审计。
