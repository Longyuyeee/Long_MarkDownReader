# UX50Q 默认应用逐格式候选审计

日期：2026-08-10
阶段：EA-5A 完成

## 本阶段完成

- “格式能力”页不再让每一种格式都跳到同一个无上下文的系统页面。用户展开格式后，可以只为当前格式准备 LongEdit 打开候选，并看到准确的扩展名和准备状态。
- 候选范围严格来自统一格式注册表，仅允许 29 类 `edit` 与 8 类 `preview`。旧 Office/WPS 六类继续使用显式转换或系统应用，不会注册给 LongEdit。
- 用户点击后，后端只在当前用户范围写入 LongEdit ProgID、`OpenWithProgids`、应用能力清单和 `RegisteredApplications`，随后打开 LongEdit 专属的 Windows 默认应用页面。
- LongEdit 不写扩展名默认值，不触碰受 Windows 保护的 `UserChoice`，也不调用 `reg.exe`。是否成为默认应用以及选择哪些扩展名，最终仍由用户在 Windows 页面确认。
- 安装器的静态文件关联继续只有 `.md/.markdown`；安装或更新不会自动把其余受支持格式全部交给 LongEdit。
- 外部启动继续覆盖首实例启动参数与单实例二次打开。路径必须先通过格式注册表和外部授权，再进入带 `external=1` 的专用工作区。
- 外部工作区不再挂载依赖资料库的“文件上下文”，编辑器占满可用区域，也避免空资料库关系查询。

## 需求对齐

- 每种格式独立选择：已完成。
- 未选择的格式不注册、不接管：已完成。
- Windows 最终确认默认应用：已完成。
- 外部编辑仍需点击保存或 Ctrl+S 才写回：保持不变。
- 只读格式永不写回，旧 Office/WPS 不伪装成 LongEdit 原生编辑：保持不变。

## 验证

- Rust 策略单测覆盖 OPML 可注册、旧 DOC/WPS 与未知格式拒绝。
- 前端生产构建通过。
- `check:default-app-candidate-workflow` 锁定 37 类候选、注册表边界、Windows 确认、安装器白名单和安装态路由。
- `check:r2-windows-lifecycle-contract` 已更新为区分“用户触发的 Open with 候选”和“禁止直接改默认应用”。

## 下一步

进入 EA-5B：对测试安装包执行真实 Windows 回归，逐项验证候选注册、LongEdit 专属默认应用页、冷启动、已有实例二次打开、带空格/中文路径和卸载后恢复；不在开发机自动修改用户现有默认应用。
