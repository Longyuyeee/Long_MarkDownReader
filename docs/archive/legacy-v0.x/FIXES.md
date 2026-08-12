# 问题修复报告 (2026-07-16)

## 修复内容

### 1. ✅ 知识图谱节点不显示问题
**问题**: 知识图谱有节点（悬浮显示），但 Canvas 没有渲染出来
**原因**: Canvas 2D 上下文的 `scale(dpr, dpr)` 累积调用，导致变换矩阵叠加错误
**修复**: `src/components/GraphView.vue:295`
- 添加 `ctx.setTransform(1, 0, 0, 1, 0, 0)` 重置变换矩阵
- 修改 `clearRect` 使用正确的 `width, height` 参数而非 `canvas.width, canvas.height`

### 2. ✅ Mermaid 图表节点首字母强制大写问题
**问题**: 编辑区域 Mermaid 图表节点文字首字母被强制大写
**原因**: CSS 样式 `text-transform: uppercase` 应用到了 H5 标题和代码块语言标签
**修复**: `src/styles/vditor-content-themes.scss`
- 移除 H5 标题的 `text-transform: uppercase` (line 137)
- 移除代码块语言标签的 `text-transform: uppercase` (line 435)
- 为 Mermaid 图表添加专门样式，强制 `text-transform: none !important`
- 添加 `overflow-x: auto` 和 `display: block` 优化图表显示

### 3. ✅ 页面切换加载生硬问题
**问题**: 界面转换时空白显示过于生硬
**修复**: `src/App.vue`
- 为 `router-view` 添加 `mode="out-in"` 确保旧页面完全退出后再加载新页面
- 添加 `.route-wrapper` 包装器，避免过渡动画冲突
- 优化过渡动画层级，新页面 `z-index: 2`，旧页面 `z-index: 1`
- 保留原有的模糊和缩放效果，使切换更加平滑

## 修改文件
1. `src/components/GraphView.vue` - Canvas 渲染修复
2. `src/styles/vditor-content-themes.scss` - 文字大小写和图表样式优化
3. `src/App.vue` - 页面切换动画优化

## 测试建议
1. **知识图谱**: 打开知识图谱，确认节点和连线正常显示
2. **Mermaid 图表**: 创建包含中文/英文混合的 flowchart，确认文字大小写正常
3. **页面切换**: 在文件树、图谱、设置页之间切换，确认过渡平滑无闪烁
