# A0B 手动更新体验与发布事实对齐审计

日期：2026-08-04
需求对齐：UX-03
状态：代码、生产构建与发布合同完成，等待下一安装包外部浏览器复测

## 问题

v1.0.3 Release 和 README 已明确：原 Tauri Updater 私钥在当前发布环境不可用，本版本不发布 `latest.json` 或 `.sig`，采用手动下载安装。但运行态仍每 24 小时请求 `releases/latest/download/latest.json`，设置页“检查更新”也调用同一路径，最终向用户显示 `Could not fetch a valid release JSON from the remote`。

该错误不是用户网络配置问题，而是客户端行为与当前发布策略冲突。

## 修复

1. 移除根组件中的自动更新弹层，不再启动 24 小时自动检查。
2. 设置页将“检查更新”改为“查看最新版本”，展示当前版本、手动安装方式和 SHA-256 核对提醒。
3. 点击按钮只通过 Tauri Opener 打开官方 `https://github.com/Longyuyeee/Long_MarkDownReader/releases/latest`，不下载、不安装、不重启应用。
4. 更新服务移除 `checkForUpdates`、`downloadAndInstall` 和 `relaunch` 运行路径。
5. 共享社区发布策略改为 updater 未启用、自动检查间隔为 0、`latestManifestAsset=null`，同时保留旧公钥和插件配置，为未来持有原私钥时恢复签名更新保留信任连续性。
6. 更新 V1 社区发布机器合同：阻止自动检查或应用内安装代码重新进入当前运行态，并要求设置页包含手动发布入口与 SHA-256 提示。

## 验证

- `npm.cmd run build`：通过，Vue TypeScript 检查和 Vite 生产构建完成。
- `npm.cmd run check:v1-community-release`：通过，v1.0.3 手动未签名分发事实一致。
- `npm.cmd run check:ui4c-release-fact-alignment`：通过，公开版本与社区发布状态一致。
- `npm.cmd run check:v1-installed-hotfix`：通过，既有 v1.0.3 安装热修复证据未被破坏。

## 验收边界

UX-03 当前标记为“待复测”。下一安装包需要在设置页确认：

1. 不会在启动后自动请求更新 JSON。
2. 按钮显示“查看最新版本”，没有英文 JSON 错误。
3. 点击后由系统默认浏览器打开官方 GitHub 最新 Release。
4. 关闭浏览器返回应用后，设置页面状态正常且不会重复弹窗。

四项通过后才能把 UX-03 标记为“已验收”。
