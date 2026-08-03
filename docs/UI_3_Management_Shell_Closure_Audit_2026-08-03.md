# UI-3 管理页面壳层收口审计

日期：2026-08-03  
范围：工作台、设置、格式能力、知识图谱

## 结论

UI-3 已完成，需求与实施对齐：三个管理页面共享页头、返回资料库入口、内容宽度和操作区；图谱保留沉浸画布，同时统一导航、筛选控件、状态栏和检查器尺寸。应用根路由仍进入资料库，工作台没有重新成为默认启动页。

## 已完成

- 新增共享 `WorkspaceManagementHeader` 与 `WorkspaceManagementContent`，工作台、设置、格式能力均已接入。
- 所有管理页与图谱均通过命名路由一步返回 `LibraryMode`，不再依赖浏览历史。
- 图谱布局模式使用共享分段控件，底部统计使用共享状态栏。
- 图谱节点详情和知识治理面板统一为 320px 检查器，并共享浮层边距、surface、border 与 shadow 令牌。
- `check:ui-management-shell` 已加入 `ci:patch-release`，锁定默认资料库启动和 UI-3 结构合同。

## 验证

- `npm.cmd run build`
- `npm.cmd run check:graph-product-contract`
- `npm.cmd run check:ui-shared-components`
- `npm.cmd run check:ui-management-shell`
- `npm.cmd run check:ui-typography`

## 接手后的下一步

按 UI-4 执行真实视觉回归：使用代表性文件覆盖资料库和主要编辑器，在专业浅色、专业深色、高对比主题及 Windows 100%、125%、150% 缩放下检查截断、重叠、焦点、状态切换和保存回执。完成截图矩阵与门禁后，再判定是否发布 `1.0.2`。
