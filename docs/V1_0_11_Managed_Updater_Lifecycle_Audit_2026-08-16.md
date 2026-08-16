# v1.0.11 受管更新生命周期审计

> 审计日期：2026-08-16
>
> 更新路径：官方 `v1.0.10 -> v1.0.11`
>
> 当前状态：**托管 Windows 验证工具就绪，真实执行 pending。**

## 1. 需求对齐

本阶段只验证已经发布的 v1.0.11 更新链，不增加产品功能。验收必须覆盖用户确认、官方安装器 SHA-256、同目录覆盖、自动重启、更新后当前版本以及资料保留；不能把源码构建或直接运行新版伪装成应用内更新。

## 2. 已完成工具链

- `shared/v111-managed-updater-lifecycle-policy.json` 固定官方 v1.0.10 与 v1.0.11 Release、Tag、安装器名称、大小和 SHA-256。
- `.github/workflows/v111-managed-updater-lifecycle.yml` 只在手动触发时使用 GitHub 托管一次性 Windows，并只下载公开 Release 资产。
- 安装编排复用已经捕获过自动重启失败并验证恢复的参数化 runner 与 WebView 探针，不复制产品更新逻辑。
- 机器检查固定显式用户确认、安装前哈希校验、静默覆盖、自动重启、更新后状态、卸载和资料保留边界。

## 3. 安全边界

- 工作流必须运行在 `windows-latest` 且显式设置一次性环境标志。
- runner 同时要求 `-ConfirmDisposableMachine` 和 `-AllowInstallerMutation`。
- 只安装官方发布的 NSIS，不从当前源码构建候选安装器。
- 更新弹窗出现但用户点击前，不得提前下载或启动安装器。
- 测试脚本不能在覆盖完成后手动启动新版，必须观察更新助手自动重启。
- 证据不包含用户源内容，合成资料仅用于验证覆盖和卸载后的保留行为。

## 4. 当前验证

- `npm.cmd run check:v111-managed-updater-lifecycle`
- `npm.cmd run check:current-development-audit`
- `npm.cmd run build`

当前只能证明验证工具和发布资产绑定正确。真实托管工作流成功、12/12 检查、三张截图人工复核及九份证据导入前，状态必须保持 `hosted-execution-pending`。

## 5. 托管执行后的关闭条件

1. 下载工作流 artifact，并核对运行提交和官方安装器摘要。
2. 人工复核“发现更新”“安装中”“当前已是 v1.0.11”三张截图。
3. 生成带字节数与 SHA-256 的九文件导入清单。
4. 更新策略中的安装后二进制身份、GitHub 运行、12 项 gate 和最终状态。
5. 更新社区发布策略、发布回执、开发对齐与交接文档。

只有这些条件全部满足，才能把 `1.0.10 -> 1.0.11` 从 pending 改为 passed，并结束 v1.0.11 发布流程。
