# 胧编辑 · md助手 开发阶段总结 (2026-03-03)

## 1. 当前项目状态
项目目前已完成核心框架的搭建与交互逻辑的深度修复，进入了**稳定可用阶段**。

### 已实现核心功能：
- **编辑器本地化**：Vditor 资源已完全本地化（`/public/vditor`），彻底解决了 WebView2 拦截 CDN 资源导致的加载失败和 404 错误。
- **文件系统集成**：实现了知识库模式下的文件/文件夹扫描、增删改查、重命名及拖拽移动。
- **UI 交互优化**：
    - **虚拟拖拽引擎**：攻克了 Windows 透明窗口下 DND 失效的难题，实现了基于鼠标事件模拟的拖拽移动功能。
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

### 2.6 文件树静默局部刷新方案 (Silent Partial Refresh)
- **现象**：新建、移动或重命名文件后调用全局 `refresh`，导致整棵树所有已展开的文件夹全部收缩，并伴随剧烈闪烁。
- **原因**：Naive UI 的 `n-tree` 在懒加载模式下，如果直接替换 `treeData` 数组，所有节点会丢失已加载的 `children` 状态。
- **对策**：
    - **深层状态同步 (`syncNodes`)**：对比新旧数据，若旧节点已加载子项，则强制保留其 `children` 引用，从而维持 UI 展开状态。
    - **外科手术式更新 (`refreshNode`)**：递归查找受影响的父节点，仅对该分支进行 `patch`。
    - **触发响应式**：通过 `treeData.value = [...treeData.value]` 浅拷贝根数组，在不重置组件内部状态的情况下触发视图静默更新。

### 2.7 知识库拖拽功能兼容性瓶颈 (Resolved)
- **现象**：在 Windows 平台上，由于 Tauri 的透明窗口与无边框配置，HTML5 标准拖拽 (DND) 事件会被 OS 层级拦截，导致 `n-tree` 无法拖拽。
- **对策**：**实现虚拟拖拽引擎**。
    - 弃用 HTML5 DND 接口，改用 `mousedown`、`mousemove`、`mouseup` 模拟。
    - **长按判定**：设置 350ms 延迟，区分点击与拖拽。
    - **影子元素 (Ghost)**：创建一个跟随鼠标的浮动层，设置 `pointer-events: none` 防止干扰碰撞检测。
    - **碰撞测试**：利用 `document.elementFromPoint` 结合 `closest('[data-key]')` 实时识别落点。
    - **属性注入**：在树节点 DOM 上注入 `data-is-dir` 属性，实现“仅允许拖入目录”的严格判定逻辑。

### 2.8 重命名后缀干扰与路径解析
- **现象**：重命名 Markdown 文件时，弹窗中默认显示 `.md` 后缀，且用户手动输入后缀后会导致后端生成双后缀（如 `file.md.md`）。
- **对策**：
    - **后缀剥离**：在触发重命名的瞬间（右键或 F2），通过 `lastIndexOf('.')` 结合 `isDir` 判定，仅对文件执行后缀剥离。
    - **鲁棒路径解析**：改用 `path.split(/[\\/]/).filter(Boolean)` 方案，解决跨平台路径分隔符的解析差异。
    - **UI 引导**：更新 `placeholder` 明确提示用户“无需输入后缀”。

---

## 3. 当前存在问题与未完成功能 (Pending Issues)

### 3.1 核心缺陷
- [x] **文件树拖拽失效**：已通过虚拟模拟方案解决。
- [ ] **多平台路径分隔符兼容性**：目前在 Windows 下工作正常，但对于 Linux/macOS 的 `/` 分隔符在部分局部刷新逻辑中可能存在偏差。

### 3.2 待实现功能
- [ ] **全文搜索**：实现 UI 界面与 Rust 后端搜索算法的联动。
- [ ] **双向链接升级**：完善 `[[ ]]` 的实时悬浮预览、反向链接面板及点击跳转。
- [ ] **图片自动化管理**：实现剪贴板粘贴图片自动保存至库中 `.assets` 文件夹并生成相对路径引用。
- [ ] **高级导出**：完成 PDF、HTML、Word 及长图导出的功能联调。
- [ ] **版本回滚**：基于影子副本（Shadow Copy）的文件修改历史可视化与一键恢复。

---

## 4. 下一步计划 (Milestones)
- [ ] 优先攻克全文搜索的 UI 展现。
- [ ] 实现粘贴图片自动入库功能。
- [ ] 完善双模式切换时的编辑器状态缓存。
