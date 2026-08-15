# v1.0.10 受管更新生命周期审计

> 审计日期：2026-08-15
>
> 更新路径：官方 `v1.0.9 -> v1.0.10`
>
> 当前状态：**托管 Windows 验证工具就绪，真实执行 pending。**

## 1. 需求对齐

本阶段只验证已经发布的 v1.0.10 更新链，不增加产品功能。验收必须覆盖用户确认、官方安装器 SHA-256、同目录覆盖、自动重启、更新后当前版本以及资料保留；不能把源码构建或直接运行新版伪装成应用内更新。

## 2. 已完成工具链

- `shared/v110-managed-updater-lifecycle-policy.json` 固定官方 v1.0.9 与 v1.0.10 Release、Tag、安装器名称、大小和 SHA-256。
- `.github/workflows/v110-managed-updater-lifecycle.yml` 只在手动触发时使用 GitHub 托管一次性 Windows，并只下载公开 Release 资产。
- 安装编排复用已经真实捕获过 v1.0.8 自动重启失败、并验证 v1.0.9 恢复的通用 runner 与 WebView 探针。
- 新增机器检查，固定显式确认、安装前哈希校验、静默覆盖、自动重启、更新后状态、卸载和资料保留边界。

## 3. 安全边界

- 工作流必须运行在 `windows-latest` 且显式设置一次性环境标志。
- runner 同时要求 `-ConfirmDisposableMachine` 和 `-AllowInstallerMutation`。
- 只安装官方发布的 NSIS，不从当前源码构建候选安装器。
- 更新弹窗出现但用户点击前，不得提前下载或启动安装器。
- 测试脚本不能在覆盖完成后手动启动新版，必须观察更新助手自动重启。
- 证据不包含用户源内容，合成资料仅用于验证覆盖和卸载后的保留行为。

## 4. 当前验证

- `npm.cmd run check:v110-managed-updater-lifecycle`
- `npm.cmd run check:current-development-audit`
- `npm.cmd run build`

当前只能证明验证工具和发布资产绑定正确。真实托管工作流成功、12/12 检查、三张截图人工复核及九份证据导入前，状态必须保持 `hosted-execution-pending`。

首次托管运行 `31872467104` 的升级动作和 12 项检查全部通过，但证据生成器仍遗留 v1.0.9 专用阶段名称，并把旧版安装检查写成 `official-v1.0.8-fresh-install`。该运行因此只作为身份漂移反例，不进入正式证据目录，也不能关闭 pending。runner 与探针随后改为从 `PreviousVersion/CurrentVersion` 生成阶段、环境和检查 ID，必须重新运行后再验收。

## 5. 托管执行后的关闭条件

1. 下载工作流 artifact，并核对运行提交和官方安装器摘要。
2. 人工复核“发现更新”“安装中”“当前已是 v1.0.10”三张截图。
3. 生成带字节数与 SHA-256 的九文件导入清单。
4. 更新策略中的安装后二进制身份、GitHub 运行、12 项 gate 和最终状态。
5. 更新社区发布策略、发布回执、开发对齐与交接文档。

只有这些条件全部满足，才能把 `1.0.9 -> 1.0.10` 从 pending 改为 passed，并进入图片基础编辑阶段。
