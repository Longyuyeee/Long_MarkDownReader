# UX50R 默认应用候选卸载恢复审计

日期：2026-08-10
阶段：EA-5B1 完成

## 审计结论

- EA-5A 的运行时逐格式候选原本写入当前用户注册表，但卸载器只清理安装器自带的 Markdown ProgID，存在 LongEdit 候选残留。
- NSIS 卸载钩子现会逐项删除 37 类 `edit/preview` 格式对应的 85 个扩展名中的 `LongEdit.ExternalFile` 值。
- 卸载器同时清理 `LongEdit.ExternalFile` ProgID、LongEdit 应用能力清单和 `RegisteredApplications` 入口。
- 清理范围只包含 LongEdit 自己的值和命名空间；不删除扩展名键，不修改其他应用候选，不读取或写入 Windows `UserChoice`。
- 安装器静态关联仍只有 `.md/.markdown`，旧 Office/WPS 六类继续排除。

## 需求对齐

- 每种格式由用户独立选择：保持不变。
- 未选择的格式不接管：保持不变。
- Windows 最终确认默认应用：保持不变。
- 卸载后不留下 LongEdit 逐格式候选：源码和安装器契约已完成。
- 不影响其他应用和用户默认选择：已通过删除边界约束。

## 验证

- `check:default-app-uninstall-recovery` 从统一格式注册表生成期望集合，并与 NSIS 的 85 项清理清单逐项比较。
- `check:r2-windows-lifecycle-contract` 继续锁定静态关联和 Windows 所有权边界。
- `check:current-development-audit` 已纳入 EA-5B1，后续格式变化会自动触发清理清单漂移失败。
- 本地已实际生成新的 v1.0.5 未签名 NSIS 内部候选，证明卸载钩子可被 Tauri/NSIS 打包链接受；本轮未安装该产物，也未修改开发机注册表。
- 完整 `ci:patch-release` 已通过，生产依赖审计为 0 漏洞。

## 下一步

进入 EA-5B2：扩展可丢弃 Windows 安装生命周期，使用真实 NSIS 安装包触发逐格式候选，验证注册状态、冷启动、已有实例二次打开、中文/空格路径和卸载后注册表恢复。测试必须在 GitHub 托管 runner、Windows Sandbox 或明确标记的可丢弃虚拟机中执行，不修改开发机现有默认应用。
