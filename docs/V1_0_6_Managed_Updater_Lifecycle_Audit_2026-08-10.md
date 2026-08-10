# v1.0.6 受控更新生命周期审计

状态：**隔离执行工具已完成，GitHub 托管 Windows 真实更新待运行**

## 审计目标

验证正式发布链上的 `v1.0.5 -> v1.0.6`，而不是重新构建或直接调用新安装器冒充自动更新：

1. 下载并安装官方 v1.0.5 NSIS。
2. 由已安装 v1.0.5 访问固定 GitHub 最新 Release，发现 v1.0.6。
3. 更新弹窗必须展示用户确认、SHA-256 与覆盖安装说明；点击前不得下载或启动安装器。
4. 点击“下载并安装”后，核对缓存文件名、字节数与 SHA-256，再等待静默覆盖安装。
5. 验证安装目录不变、v1.0.6 二进制与发布清单一致、首次启动成功，手动检查显示已经是最新版。
6. 验证合成资料库标记和应用配置标记在覆盖安装及最终卸载后仍然存在。

## 安全边界

- 本机当前正在运行的 v1.0.5 不参与测试，不关闭、不覆盖，也不读取用户资料。
- 生命周期脚本只有同时收到 disposable 环境变量和两个显式破坏性开关才允许执行安装器。
- GitHub Actions 只下载官方 v1.0.5/v1.0.6 Release 资产，不从当前源码重新打包。
- 测试使用固定的 `C:\LongEditManagedUpdater*` 合成目录，证据声明 `sourceUserContentIncluded=false`。
- 社区包仍为 `NotSigned`；该观察不能提升企业签名或 Authenticode 结论。

## 当前实现

- `.github/workflows/v106-managed-updater-lifecycle.yml`：下载官方资产、核对 GitHub digest/Tag、执行隔离生命周期并上传小型证据。
- `scripts/run-v106-managed-updater-lifecycle.ps1`：安装、覆盖、首启、当前版本、资料保留和卸载编排。
- `scripts/capture-v106-managed-updater-lifecycle.mjs`：通过安装态 WebView2/CDP 验证更新弹窗、用户点击与更新后设置页。
- `scripts/check-v106-managed-updater-lifecycle.mjs`：锁定发布资产、测试安全门和导入证据哈希。

## 下一步

先推送工具提交并等待 Quality Gate，通过后手动触发托管工作流。只有工作流成功、截图人工复核且结构化证据导入仓库后，才能把 `1.0.5-to-1.0.6-pending` 更新为已通过。
