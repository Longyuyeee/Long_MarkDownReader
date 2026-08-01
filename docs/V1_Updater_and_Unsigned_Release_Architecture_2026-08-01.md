# Long编辑 v1.0.0 自动更新与无签名社区版发布设计

日期：2026-08-01  
目标版本：1.0.0  
当前状态：候选安装包与更新签名已生成，等待安装生命周期和最终质量门禁

## 1. 发布决策

本版本按用户明确决策发布为 Windows 无 Authenticode 签名社区版。历史 R5N 的商业代码签名与双 Windows 客户端签名门禁不再阻止此发行通道，但仍保留为未来正式签名通道的审计记录。

无 Authenticode 签名意味着 Windows 可能显示“未知发布者”或 SmartScreen 提示。README 与发布说明必须明确此限制，用户应只从官方 GitHub Release 下载并核对 SHA-256。

## 2. 自动更新架构

应用使用 Tauri v2 updater：

1. 启动后延迟 4 秒检查；同一设备 24 小时内不重复自动检查。
2. 设置页提供手动检查入口，显示当前版本、可用版本和错误状态。
3. 下载完成后先验证 Tauri updater 完整性签名，再被动安装并重启应用。
4. 更新源固定为 `https://github.com/Longyuyeee/Long_MarkDownReader/releases/latest/download/latest.json`。
5. 仓库只保存 updater 公钥；私钥和密码位于 `.release-secrets/`，由 `.gitignore` 排除。

Tauri updater 签名只验证更新包未被替换，不等同于 Windows Authenticode 发布者签名，也不会消除系统的未知发布者提示。

## 3. 发布资产

正式 Release 至少包含：

- `Long编辑_1.0.0_x64-setup.exe`：推荐的 NSIS 安装器与 Windows 自动更新载体；
- `Long编辑_1.0.0_x64-setup.exe.sig`：NSIS 更新完整性签名；
- `Long编辑_1.0.0_x64_zh-CN.msi`：MSI 安装器；
- `Long编辑_1.0.0_x64_zh-CN.msi.sig`：MSI 更新完整性签名；
- `latest.json`：Tauri 静态更新清单；
- `SHA256SUMS.txt`：面向用户的安装包校验摘要。

Windows 更新端优先指向 NSIS 安装器，和当前用户级安装模式一致。

## 4. 密钥交接

`.release-secrets/longedit-updater.key` 与 `.release-secrets/longedit-updater.password` 不能提交、上传到 Release 或发送到公开渠道。更换开发电脑时应通过独立的加密介质复制；如果丢失，已安装的 1.0.0 将无法验证由新密钥签发的更新，只能手工安装新版本。

## 5. 收口门禁

- 前端生产构建和 Rust locked 检查通过；
- MSI、NSIS 以及两个 `.sig` 文件均生成；
- 1.0.0 安装、启动、代表性格式与管理流程、升级/卸载生命周期通过；
- 仓库 `ci:check` 与 GitHub Quality Gate 通过；
- README、发布说明、哈希清单和 `latest.json` 与最终资产一致；
- 标签 `v1.0.0` 与 GitHub Release 成功发布。
