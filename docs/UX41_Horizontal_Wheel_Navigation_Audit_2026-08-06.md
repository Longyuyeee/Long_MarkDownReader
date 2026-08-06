# UX-41 全局横向滚轮导航审计

## 用户目标

鼠标悬浮在横向内容区域时，普通纵向滚轮应直接驱动横向滚动。能力必须覆盖当前和后续新增的工具栏、标签栏、筛选条、工作表标签、横向卡片、表格列标题与类似区域，而不是依赖各页面重复实现。

## 实现结论

- 应用入口安装统一的委托式滚轮服务，按事件路径寻找最近且仍可继续滚动的横向容器。
- 纯横向容器自动生效，包括脑图与 Canvas 工具栏、文件 Tab、关系筛选、日志筛选、工作表标签、格式工具栏、横向卡片和预览集合。
- 共享 `WorkspaceToolbar` 与 `WorkspaceSegmentedControl` 已升级为无原生滚动条的横向滚动基础组件，窄窗口不再只能挤压或裁切操作项，后续使用共享组件的页面会自动继承该能力。
- CSV/Table 与 XLSX 工作簿的双轴数据区使用 `data-horizontal-wheel="headers"` 声明：鼠标位于表头或列标题时纵向滚轮转为横向，位于数据正文时仍执行纵向滚动。
- 原生触控板横向手势不被二次转换；`Ctrl/Command + 滚轮`、文本域、数字/范围输入和下拉框保留原行为。
- 脑图、Canvas 与知识图谱已有的画布缩放处理会先 `preventDefault`，全局服务检测后退出，不抢占缩放。
- 到达横向边界后不拦截事件，允许外层页面继续纵向滚动，避免滚轮被困住。

## 审计范围

静态审计扫描 `src/components`、`src/views` 和 `src/styles` 中全部 `overflow-x: auto/scroll` 与 `overflow: auto/scroll` 表面。专项门禁 `check:horizontal-wheel-navigation` 校验全局安装、非被动监听、方向判断、边界判断、双轴表头合同和缩放/原生控件保护，并已加入 `check:current-development-audit`。

Chromium 本地运行验证使用 `700 × 700` 窄窗口，设置页 `.settings-navigation` 的 `clientWidth` 为 642px、`scrollWidth` 为 797px。鼠标悬浮后输入普通纵向滚轮，`scrollLeft` 从 0 到 155；反向滚轮从 155 回到 0。证据保存在 [`runtime-summary.json`](./evidence/ux41-horizontal-wheel/runtime-summary.json)，专项门禁会校验双向结果。

## 后续复测

新安装包需用普通鼠标依次复测：文件 Tab、脑图工具栏、Canvas 工具栏、Table 表头、XLSX 列标题、Sheet 标签、日志筛选和关系筛选；同时确认画布滚轮仍缩放、表格正文仍纵向滚动、触控板横向手势没有加倍。
