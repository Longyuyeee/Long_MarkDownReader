# v1.0.13 发布后小尺寸 UI 审计

## 范围

本轮针对“窗口缩小时局部卡片、文字或工具栏被压缩变形”进行横向审计。隔离 Edge 加载实际 Vue 页面，在 900 × 720 与 720 × 640 两档窗口下检查资料库、工作台、8 个设置分类、格式能力、关系网络和思维导图，共 26 个页面样本。

每个样本自动检查页面横向溢出、文字异常纵向换行、控件文字裁切、设置激活分类可见性和运行时错误；设置分类额外要求标题纵向基线一致。既有 UI-4B 证据继续覆盖 Markdown、TXT、JSON、PDF、DOCX、PPTX、CSV、XLSX、Mermaid、OPML 和 Canvas 11 类编辑器，以及三类主题和 100%/125%/150% Windows 等效缩放。

## 发现与修复

第一轮没有发现资料库、工作台、格式能力或图谱存在与左下角资料库卡片相同的文字竖排或控件越界问题，但发现设置页两个窄布局缺陷：

1. 分类切换只重置内层面板，窄布局实际滚动的外层内容区会保留旧位置。
2. 单列 Grid 没有设置 `align-content: start`，内容较少时剩余高度会拉伸隐式行，导致分类标题随内容多少上下浮动。

修复后，分类切换会同时回顶实际滚动容器，并以最小横向位移让当前分类完整进入导航视口；窄布局网格轨道固定从顶部排列。

## 实际结果

- 26/26 页面样本通过，失败数 0。
- 900 × 720 与 720 × 640 下，8 个设置分类标题顶边均为 184 px。
- 16/16 设置样本的当前分类完整可见。
- 全部样本页面横向溢出 0，异常纵向换行 0，控件文字裁切 0，运行时错误 0。
- 截图和结构化结果位于 [`evidence/post-v1013-small-window-ui`](./evidence/post-v1013-small-window-ui/)。

## 验证

- `npm run audit:small-window-ui`：通过
- `npm run check:ui4b-editor-visual-evidence`：11 类编辑器、99 张 Tauri 证据通过
- `npm run check:command-strip-layout`：通过
- `npm run check:horizontal-wheel-navigation`：40 个横向区域通过
- `npm run check:sidebar-tabs-responsive`：通过
- `npm run check:text-workspace-layout`：通过
- `npm run check:structured-source-workspace`：通过
- `npm run check:workbook-workspace-experience`：通过
- `npm run check:media-workspace`：通过
- `npm run build`：通过

本次属于 v1.0.13 发布后的源码体验修复，不提升版本、不重新打包。后续新增管理页或改变设置布局时，应继续以 `audit:small-window-ui` 作为窄窗口门禁。
