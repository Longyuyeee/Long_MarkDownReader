# 胧编辑 · md助手 开发阶段总结 (2026-03-02)

## 1. 当前项目状态
项目目前已完成核心框架的搭建与交互逻辑的深度修复，进入了**稳定可用阶段**。

### 已实现核心功能：
- **编辑器本地化**：Vditor 资源已完全本地化（`/public/vditor`），彻底解决了 WebView2 拦截 CDN 资源导致的加载失败和 404 错误。
- **文件系统集成**：实现了知识库模式下的文件/文件夹扫描、增删改查、重命名及拖拽移动。
- **UI 交互优化**：
    - 丝滑的侧边栏拖拽体验（通过动态禁用 Transition 解决卡顿）。
    - 树组件点击行展开、支持 Delete 键物理删除。
    - 左右侧边栏一键折叠/展开。
- **模式支持**：支持临时编辑模式、知识库模式及禅定模式。
- **系统集成**：支持 Windows 自定义标题栏、窗口毛玻璃效果。

---

## 2. 踩过的坑点与解决方案 (Pitfalls)

### 2.1 WebView2 跟踪保护 (Tracking Prevention)
- **现象**：加载 Vditor 时控制台报错 `Tracking Prevention blocked access to storage`，导致编辑器初始化失败或语言包无法加载。
- **原因**：Tauri 底层的 WebView2 对跨域（CDN）访问 IndexDB/LocalStorage 有严格限制。
- **对策**：将 `node_modules/vditor/dist` 物理复制到 `public/vditor/dist`，使资源同域化。

### 2.2 Tauri 2.0 参数命名规则
- **现象**：调用 Rust 命令时明明参数传了，后端却报错 `missing field` 或 `Invalid arguments`。
- **坑点**：Tauri 强制要求：Rust 端定义的 `snake_case` 参数，前端 `invoke` 时**必须**写成 `camelCase`（驼峰式）。
- **对策**：统一修正前端调用，例如 `library_root` -> `libraryRoot`。

### 2.3 Naive UI `n-tree` 懒加载陷阱
- **现象**：文件夹节点不显示展开箭头，或者点击没反应。
- **坑点**：在 `lazy` 模式下，如果文件夹的 `children` 初始化为 `[]`，树组件会认为内容已加载过且为空。
- **对策**：目录节点的 `children` 初始值必须设为 `undefined` 才能触发 `on-load` 事件显示箭头。

### 2.4 CSS Transition 导致的拖拽卡顿
- **现象**：手动拖拽分割线改变区域大小时，侧边栏移动有严重的滞后感和粘滞感。
- **原因**：侧边栏设置了 `transition: width 0.3s`，拖拽产生的每一像素变动都在触发一段 300ms 的动画。
- **对策**：定义 `.is-dragging` 类，在拖拽期间强制设置 `transition: none !important`。

### 2.5 Vditor 内部 Bug (TypeError)
- **现象**：编辑时报错 `vditor.options.customWysiwygToolbar is not a function`。
- **原因**：部分 Vditor 版本在所见即所得模式下会尝试调用未定义的默认回调。
- **对策**：在初始化配置中显式注入一个空的 `customWysiwygToolbar: () => {}` 函数。

---

## 3. 下一步计划
- [ ] 实现全文搜索功能的 UI 联动。
- [ ] 完善双向链接 `[[ ]]` 的实时预览与跳转。
- [ ] 增加图片粘贴自动保存至 `.assets` 的功能。
- [ ] 导出 PDF/长图功能的联调。
