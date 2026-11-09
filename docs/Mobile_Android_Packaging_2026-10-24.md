# Android 安装、离线与覆盖升级：第八批

本批在 `codex/mobile-0.1.0-foundation` 完成，继续使用独立 worktree。移动里程碑仍为 `0.1.0-dev`；本批提供两个开发调试包，并未完成正式发布或全部移动功能迁移。

## 从用户拿到安装包开始

参考 [Obsidian 的 Android 安装说明](https://obsidian.md/help/install)和 [Joplin 的 APK 安装入口](https://joplinapp.org/help/install/)，本批先核对直接安装后的真实使用条件。调研为官方资料分析，没有安装竞品实测。

用户应当能知道安装哪个包、打开失败时怎么处理，以及覆盖安装是否保留刚才的输入。相应实现为：

- ARM64 和 x86_64 分别构建，按目标路径取包；不再从所有目录挑“最新 APK”。CLI 显式使用 `--split-per-abi`，避免正常符号链接环境返回 universal 包。
- 打包后检查实际 ABI、ELF machine、应用原生库摘要、包名、版本、API 下限和有效 APK 签名；原生库必须与刚构建的 Rust 产物相同。复制后的 APK 再核对摘要。
- Android 10 原始镜像自带的 WebView 74 无法解析当前脚本，旧包表现为空白页。新增原生启动检查，在加载 Tauri / 编辑器前显示更新说明、当前组件版本、更新入口、系统组件设置和重新检查。
- 组件更新后可继续启动已有安装，无需卸载应用或清除资料。文档页保留原有单任务行为；手机图标启动入口改为 `.LauncherActivity`。Tauri CLI 的开发启动仍显式使用 `.MainActivity`，因此保留该开发入口的导出设置；开发设备需先更新运行组件。[Tauri CLI 启动实现](https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-cli/src/mobile/android/run.rs)

Tauri 不随包携带浏览器，设备 WebView 与 Android 系统版本应分别记录，依据见 [Tauri WebView 版本说明](https://v2.tauri.app/reference/webview-versions/)和 [Android WebView 管理](https://developer.android.com/develop/ui/views/layout/webapps/managing-webview)。本项目声明 WebView 111 为当前最低组件版本，涉及 `inert`、`structuredClone`、`randomUUID` 和动态视口；本批实际文档任务运行于 124.0.6367.219，111 上的完整任务仍待验证。

## 安装包与版本规则

| 项目 | 当前值 |
| --- | --- |
| 开发 applicationId | `com.longyuye.mdreader.mobile.dev` |
| Android 要求 | Android 10 / API 29 起；WebView 111 起，实际验证 124 |
| 原生 versionName | `1.2.11`，继续与当前共享源码基线对应 |
| Android versionCode | `1002012`，此前调试包为 `1002011` |
| 签名类型 | 本机 Android debug key，开发测试用途 |
| 签名证书 SHA-256 | `ef701afe0abfd947b75ef07d4be1ede42829f42f9639a879392ec016d7b2e188` |

Android 的升级序号现在显式保存在 `tauri.android.conf.json`。后续分发新的开发版本时人工递增，两个 ABI 保持相同序号；不因一次构建或重试自动增加。versionName 与移动里程碑暂时分别记录，避免改动桌面包版本。正式身份、正式签名和正式版本名在 M5 一起确定；同一包名覆盖升级需要兼容的签名，不能用卸载旧应用来处理签名不匹配。[Android 签名规则](https://developer.android.com/studio/publish/app-signing)、[Tauri Android 版本配置](https://v2.tauri.app/reference/config/#androidconfig)

当前产物位于本 worktree 的 `release-artifacts/mobile-debug/`：

| 目标 | 文件 | 字节数 | SHA-256 |
| --- | --- | ---: | --- |
| 常见 ARM64 手机 | `aarch64/app-arm64-debug.apk` | 126202385 | `64fa7c318c798d28b9f7cfd6ea981827b3ba2e4a291d91d00a1d952442632903` |
| 本机 x86_64 模拟器 | `x86_64/app-x86_64-debug.apk` | 126859750 | `a1615f2fe6281cb68983a33dc3f4a9c5a62d049594120144af5a8b5ad4896465` |

各包的 `build-record.json` 包含基线 commit、dirty 状态、ABI、原生库摘要、签名证书、版本和 SDK。本批包基于 `4b7786b4` 加本提交的原生及构建改动，记录保留其实际构建时状态。本机两个最终构建均通过带 `--split-per-abi` 的脚本执行，并走受限符号链接的按架构 Gradle 后备路径。

开发机重新构建：

```powershell
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/build-mobile-debug.ps1 -Target x86_64
```

脚本仅在 Cargo 已成功、且 CLI 明确报告 Windows 符号链接限制时使用校验后的复制打包，不吞掉其他编译错误。后备 app 构建目录和临时文件放在 `E:/Android/BuildCache`，按 worktree 路径隔离，避免低空间系统盘继续积累大文件；普通 Android Studio 构建仍沿用默认目录。

手机可复制匹配的 APK 后通过系统安装器安装；也可明确指定已连接的测试设备：

```powershell
E:/Android/Sdk/platform-tools/adb.exe -s <设备序号> shell getprop ro.product.cpu.abilist
E:/Android/Sdk/platform-tools/adb.exe -s <设备序号> install -r release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk
E:/Android/Sdk/platform-tools/adb.exe -s <设备序号> shell am start -n com.longyuye.mdreader.mobile.dev/.LauncherActivity
```

首次打开若提示组件过旧，先在系统商店更新 WebView，再返回重新检查。具备运行组件后，手机资料库的本地文稿读写可断网使用；外部云文件的离线能力仍取决于提供器。覆盖安装保留数据与卸载后的恢复是不同任务，后者仍需独立的备份 / 导出方案。

## 本批实际验收

| 层次 | 结果与范围 |
| --- | --- |
| 打包反例 | Windows PowerShell 5.1 上 17 项通过：更晚的另一架构包、目标缺失、错误 ELF、混入 ABI、缺少应用库、截断库、旧库、错误身份 / 版本 / 升级序号 / API、缺签名元数据和错误构建类型 |
| 原生 JVM 测试 | 6 项版本判断通过，覆盖 WebView 74、110、111、124、缺提供器和未知版本；这些是版本判断测试，不代替设备任务 |
| 既有逻辑 | 45 项通过 |
| 浏览器基础任务 | 6 组通过，见 `evidence/mobile-0.1.0/browser-1792791383438/report.json`；没有将浏览器结果记为 Android 原生通过 |
| API 29 / Android 10 | 专用 `LongEdit_Compat_API29` AVD：WebView 74 显示原生提示，系统组件设置与重新检查可达；安装匹配的 WebView / Trichrome 124 后，离线进入资料库、新建、保存、强制停止和重新打开正文通过，实际文件为 `OfflineSavedBody` |
| API 35 覆盖升级 | 专用 `LongEdit_A11y_Fresh_API35`：旧调试包 `1002011` → 新包 `1002012`，同证书覆盖安装；安装后未继续编辑时，已保存文稿及恢复草稿字节与安装前相同；界面可发现并继续 `NativeSavedBody UpgradePending`，原文件仍为 `NativeSavedBody` |
| 离线条件 | 两个 AVD 均关闭 Wi-Fi / 移动数据，`dumpsys connectivity` 的活动默认网络为 `none`；应用内源文件与已安装 APK 摘要单独核对 |
| ARM64 | 首次实际编译打包并校验 ELF 183、ABI `arm64-v8a`、原生库摘要和有效签名；没有 ARM64 真机运行记录 |

原生结果与失败过程在 `evidence/mobile-0.1.0/packaging-native-2026-10-24/`，最终包主要机器可核对结果为 `api29-verification.json`、`upgrade-final/before.json`、`upgrade-final/after.json`、`upgrade-final/resumed.json`、`packaging-tests.json` 和 `runtime-unit-tests.xml`。初轮 `upgrade/` 记录与调整 CLI 入口前的包记录单独保留。最终包复测升级时，仅对专用测试 AVD 先覆盖安装原始 debug 基线，再从 `1002011` 覆盖到最终 `1002012`；没有卸载或清除应用数据。WebView 74 提示 / 组件设置截图来自初轮包，之后仅恢复 `MainActivity` 的开发入口导出，提示实现未改变；最终包在更新后的同一 API 29 AVD 上重新安装、打开并核对正文及安装摘要。

复核命令：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/test-mobile-packaging.ps1
node scripts/verify-mobile-compatibility-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/packaging-native-2026-10-24
node scripts/verify-mobile-upgrade-native.mjs --serial emulator-5556 --output docs/evidence/mobile-0.1.0/packaging-native-2026-10-24/upgrade-final --stage resumed
```

升级夹具必须在旧包上准备 `NativeAccessibility.md = NativeSavedBody`，输入并保护 `NativeSavedBody UpgradePending`，先执行 `--stage before`，安装新包并在任何“继续草稿”操作前执行 `--stage after`。用户选择继续后使用 `--stage resumed`，核对正文、来源签名和身份，同时允许保护代次 / 时间前进。不要在继续后重跑“安装后尚未操作”的严格字节比较。

## 首次失败与验收边界

- 原始 API 29 / WebView 74 首次空白，日志为 `Unexpected token ?`，对应截图和 XML 保留；新增的原生提示在相同组件上复核。
- 首次从 API 35 复制 WebView APK 安装失败，原因是缺配套 Trichrome 静态库。安装同版本库后成功；只用于本机测试镜像，项目 APK 不捆绑或重新分发这两个系统组件。
- PowerShell 5.1 首轮打包测试缺 `System.IO.Compression` 类型，补显式装载后 17 项通过。
- 首次 API 29 注入的命令字符串以 `OfflineSavedBody` 结尾，但实际第一次保存结果为 `OfflineSavedBod`；未把注入命令当成成功输入的证据。保留首次保存 XML，补齐末字符并核对保存前正文、保存后源文件及重开三者一致。初次注入时序未定位，其他厂商输入与快速输入边界仍需专项验证。
- 升级恢复后的草稿会更新保护代次和时间。最初将此时的记录与安装前逐字节比较而失败；现将“安装后尚未操作”和“用户选择继续”拆为两个阶段，各自保留记录。

仍待完成：ARM64 真机、WebView 111 完整任务、API 29 外部提供器与权限故障矩阵、完整 TalkBack 触摸任务、干净检出重建、正式签名 / release 包升级、备份迁移及大库 / 大文稿预算。A11 / A12 保持进行中，未将 APK 生成等同于首版完整验收。
