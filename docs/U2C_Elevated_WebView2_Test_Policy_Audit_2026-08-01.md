# U2C 提升权限 WebView2 测试策略审计

日期：2026-08-01

状态：`policy-remediated-awaiting-reused-artifact-rerun`

发布状态：`releaseCandidate=false`

## 根因

第三轮托管 U2（run `30656781375`）在 120 秒诊断窗口后确认：已安装应用仍在运行、会话可交互、Explorer 存在、WebView2 运行时 `150.0.4078.105` 已产生 6 个进程，但调试端口没有监听。

Microsoft WebView2 官方文档说明，`remote-debugging-port` 可通过 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 提供，但提升权限的宿主应用会忽略来自本地设备环境变量的 flags，并应改用受支持的策略覆盖。GitHub 托管 Windows runner 的管理员上下文因此解释了“WebView2 已运行但参数未生效”。

参考：

- https://learn.microsoft.com/microsoft-edge/webview2/concepts/webview-features-flags
- https://learn.microsoft.com/microsoft-edge/webview2/reference/win32/webview2-idl

## 修复与安全边界

- 一次性生命周期脚本在启动已安装应用前，仅为 `tauri-app.exe` 写入 WebView2 `AdditionalBrowserArguments` 与隔离 `UserDataFolder` 策略。
- 若 runner 已存在同名策略则拒绝覆盖，避免破坏未知机器状态。
- 无论成功或失败，`finally` 都删除本次策略值和空键。
- 该策略只存在于明确确认的一次性 runner，不进入产品默认配置，不把远程调试端口带给正式用户。

## 构建复用

工作流新增可选 `artifact_run_id`。指定时从同一仓库的既有 U2 artifact 下载两个安装包，随后仍由 `Capture runner build receipt` 重新计算 SHA-256、检查版本数量与 `NotSigned` 状态。这样只复用已经构建的字节，不复用上一轮结论，也不跳过当前生命周期门禁。

下一轮复用 run `30656781375` 的安装包；若 CDP 可用，则继续执行 TXT/JSON、路由、管理备份、索引、降级拒绝、卸载和回滚链路。
