# U2D WebView2 AppId 策略解析审计

日期：2026-08-01

状态：`appid-policy-resolution-awaiting-rerun`

发布状态：`releaseCandidate=false`

## 第四轮结论

第四轮 U2（run `30659072116`）成功复用了第三轮安装包并重新校验哈希、版本与未签名状态，证明 artifact 复用通道有效。生命周期仍在 WebView2 CDP 端口处 fail-closed，表明仅以 `tauri-app.exe` 为 HKCU 策略值名没有命中 WebView2 实际采用的 AppId。

## 官方解析规则与修正

Microsoft WebView2 Win32 文档说明：策略查找先使用进程 Application User Model ID，再尝试编译代码名，最后尝试 `*`；注册表根先查 HKLM，再查 HKCU。Tauri 可以为进程设置 AUMID，因此只登记可执行文件名不足以覆盖该解析链。

本阶段在一次性 runner 中为以下值名写入测试参数：

- `com.longyuye.mdreader`；
- `tauri-app.exe`；
- `tauri-app`；
- `*`（仅 AdditionalBrowserArguments；官方禁止用通配符覆盖 UserDataFolder）。

同一集合写入 HKLM 和 HKCU，以符合官方根查找顺序。任何已有同名值都会使脚本拒绝执行；成功写入的每个值均登记到清理列表，并在 `finally` 中逐项移除。该覆盖仍只服务一次性自动化，不进入用户产品配置。

参考：https://learn.microsoft.com/microsoft-edge/webview2/reference/win32/webview2-idl

下一轮继续复用 run `30656781375` 的同一组安装包，仅验证修正后的动态生命周期。
