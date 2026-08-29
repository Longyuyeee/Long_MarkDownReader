# M4F-2A v1.0.16 候选门禁纠偏审计

日期：2026-08-30

阶段：M4F-2A（M4F-2 的候选源码修复子步）

结论：完整 Quality Gate 暴露的实现与检查器偏移已纠正，R5F 浏览器生产预览由真实崩溃恢复为 11/11 路由通过；本子步仍不声明 M4F-2 完成，也不构建安装包或提升 `releaseCandidate`。

## 从实际代码发现的问题

以已推送的 M4F-1 提交 `28f53f5183bf17c75b82ec52b753007143d9ab43` 为基线运行 `ci:patch-release`，门禁依次发现：

- 知识图谱近期新增面板存在 8/9/10px 未注册字号，偏离统一 UI 字体合同。
- 工作簿条件格式与校验菜单仍使用黑色透明边框/阴影，偏离主题颜色语义合同。
- 索引自动准备、文本外部修改与托管文件导航三个检查器仍绑定旧类型名、旧单字段赋值或只接受 `openManagedFile`，没有识别当前更完整的 `WorkspaceIndexStatus`、`updateTabFromTextSnapshot` 与 `openManagedObject` 实现。
- R5F 历史证据没有可重复采集入口；重新建立生产浏览器采集后，确认 `App.vue` 在非 Tauri 环境无条件执行 `getCurrentWindow()`，因缺少 Tauri 内部 metadata 在所有路由挂载前进入全局崩溃页。
- R5G 采集器把证据版本硬编码为 `1.0.0`，无法为 v1.0.16 生成真实身份清单。

## 纠偏结果

- 图谱紧凑文本统一使用 `--text-compact`；工作簿边框与阴影统一使用 workspace 主题令牌。
- 三个过时检查器对齐当前真实实现，但没有降低行为约束：索引仍必须自动准备，文本保存仍必须更新完整身份快照，文件与内部对象仍必须经过统一资料库导航器。
- `App.vue` 只在真实 Tauri 运行时获取窗口对象；浏览器预览保持主窗口语义，桌面窗口最小化、最大化、隐藏与外部窗口关闭逻辑不变。
- 新增可重复的 `audit:r5f-safe-tauri-runtime`：构建生产前端、启动隔离 Edge/EdgeCore headless 会话、通过 CDP 验证 11 个代表路由，并写入不包含用户资料的结构化证据。
- R5G 清单版本改为读取 `package.json`，不再写死历史版本。

## 本子步验证

- `npm run build`：通过，6275 个模块。
- Quality Gate 在逐项纠偏后，其剩余链通过：43 格式/91 扩展、Windows 生命周期、D2 安全降级、社区发布合同、当前开发审计、Rust locked check 与生产依赖审计（0 漏洞）。
- `npm run audit:r5f-safe-tauri-runtime -- --SkipBuild`：通过，v1.0.16 生产浏览器预览 11/11 路由挂载，无全局崩溃页。
- R5F 明确只证明浏览器生产预览路由挂载，不冒充桌面文件 I/O 或安装包证据。

## 接续边界

本审计推送后的精确提交将替代 `28f53f5` 成为新的候选源码。下一步必须在该不可变提交上重新从头执行完整 `ci:patch-release`，再执行 R5F 与 R5G 当前候选烟测。当前公开版本仍为 v1.0.15；`v1.0.16` Tag、MSI/NSIS 与 GitHub Release 仍不存在。
