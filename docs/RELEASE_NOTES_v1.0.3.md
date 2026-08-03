# Long编辑 v1.0.3

v1.0.3 是安装运行态热修复，不扩大格式编辑能力承诺。

## 修复

- 修复 Tauri 打包后的 CSP nonce 改写导致 Naive UI 动态样式被 WebView2 拒绝的问题。
- 修复安装版按钮、输入框、空状态与 SVG 图标退化为浏览器默认样式的问题。
- Office、WPS 与 LibreOffice 探测改为进程内读取 Windows 注册表，不再启动 `reg.exe`。
- `where.exe` 与版本探测 PowerShell 统一使用隐藏窗口标志，避免控制台闪烁。

## 安装验证

- Windows 200% 缩放下，安装态 Naive UI 样式计算通过，图标为 18px，超大 SVG 数量为 0。
- 从 v1.0.2 覆盖安装到 v1.0.3 成功，安装路径和用户资料保持不变。
- 启动后连续观察 15 秒，`reg.exe` 启动次数为 0。
- Rust 外部应用模块 4 项测试、前端生产构建、Cargo locked check 与相关契约均通过。

## 下载与校验

- `LongEdit_1.0.3_x64-setup.exe`：`2b01ec0a51f9b9423eec1febc897c26567536394c20fc340da25576dcb87973c`
- `LongEdit_1.0.3_x64_zh-CN.msi`：`a3a421974c6ef9be2a583267e76554dbcd69c3354089e64365d0f179f82671b8`

本版本仍为未签名社区版，可能显示“未知发布者”或 SmartScreen 提示。请只从官方 GitHub Release 下载并核对 `SHA256SUMS.txt`。原自动更新私钥不可用，因此本版本继续采用手动下载安装，不发布 `latest.json` 或 `.sig`。
