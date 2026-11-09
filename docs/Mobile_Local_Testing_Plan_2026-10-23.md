# Long编辑移动端本地测试方案

2026-10-29 当前已构建双ABI1002049待验收候选，并在专用API29实测接收、返回、系统文字导出与草稿重启。修复PowerShell5原生stderr／ANSI日志判定和测试发送器任务栈入口；仅在原生编译确已成功且明确为符号链接失败时继续副本打包。新增`node scripts/test-mobile-new-draft-recovery-browser.mjs`验证真实来源决定恢复操作及不写原件；`python scripts/observe-mobile-redesign-native.py --help`说明原生观察参数，每次核对实际安装摘要和旧数据，不能把空树的截图观察当成读屏通过。修正版存在待定位的Android无障碍树断点，候选／首次失败／设计和下一步见[本轮记录](Mobile_Redesign_Native_2026-10-29.md)。

2026-10-29 本机临时`python -m http.server`把`.mjs`返回为`text/plain`，导致PDF预览工作线程被拒绝。构建完成后改用`python scripts/serve-mobile-preview.py --port 9012`，固定模块MIME且禁用缓存；不要在采证期间重建dist。修正服务后同一接收链14组／7次axe扫描无违规，9张实页已复核。`python scripts/inspect-mobile-native-candidate.py --output <新的JSON路径>`只做离线清点，不调用adb或启动设备；现存1002048不是当前交互候选。新包、真实IME／SAF／预测性返回及ARM真机的下一步见[阶段5收口与执行表](Mobile_Stage5_Native_Preparation_2026-10-29.md)。本轮没有新APK或原生通过记录。

2026-10-26 全量设计原型使用独立检查：`node scripts/test-mobile-interaction-design.mjs`，覆盖返回、输入、导入/导出和 55 页布局。[设计与证据](design/mobile-interaction-v2/interaction-spec.md)明确区分浏览器原型验证和正式 Android 验收。本轮未产出新 APK；系统键盘、预测性返回与真实授权仍按下文原生方案验收。

2026-10-23 首轮实现已执行浏览器与 Android 模拟器任务，结果、环境和已知缺口见[首轮实施记录](Mobile_Foundation_Implementation_2026-10-23.md)。下文保留完整验收方案；有安装包不表示所有场景已经通过。

在 Windows 上使用浏览器、Android 模拟器和安卓真机分层测试。浏览器负责快速验证页面；模拟器负责真实 Android 文件访问、安装和生命周期；真机负责输入法、触摸、设备性能与厂商差异。每条结果记录执行层次，浏览器 IPC 模拟通过不等于 Android 功能通过。

本方案对应[移动端开发计划](Mobile_Development_Plan_2026-10-23.md)中的 0.1.0-dev。下方环境表保留首次安装前的检查结果；当前已建立 Android 工程、SDK、模拟器及调试 APK，最新构建和实际任务见各批验收记录。

## 本机条件和准备顺序

| 检查 | 2026 年 10 月 23 日结果 | 下一步 |
| --- | --- | --- |
| CPU 与内存 | Ryzen 7 5800H、16 个逻辑处理器、约 39.4 GiB 内存 | 可尝试运行一台 x86_64 AVD，实测编译和模拟器并行表现 |
| 虚拟化 | 固件虚拟化开启，检测到 hypervisor | 使用 emulator 的加速检查及实际启动确认；现有标志不构成通过证据 |
| Node / npm | 24.14.0 / 11.9.0 | 新 worktree 运行 npm ci；CI 当前使用 Node 22，后续统一支持版本 |
| Rust | 1.93.1，仅 Windows target | 添加 Android ARM64 和 x86_64 target |
| Java | 17.0.8，JAVA_HOME 路径存在 | 核对 javac 和生成工程要求，锁定匹配的 JDK、AGP 与 Gradle wrapper |
| Android | 常见 SDK 位置未发现安装，ANDROID_HOME / NDK_HOME 未配置，PATH 未发现 adb | 安装最小 SDK、NDK 和一个系统镜像 |
| 浏览器 | Chrome 与 Edge 已存在 | 接入页面自动化和 Android WebView 调试 |
| 磁盘 | 建立 worktree 后 C 约 25.2 GiB 可用；此前 E 约 49.4 GiB 可用 | SDK、AVD 与 Android 缓存优先放 E 盘；安装前重新核对空间 |
| 手机 | 尚未检查设备 | 真机接入后记录型号、系统、WebView 和输入法版本 |

完整原始数据见[环境记录](evidence/mobile-0.1.0/environment-2026-10-23.json)。未发现常见 SDK 路径不排除其他位置已有安装；正式配置前继续检查 Android Studio 的实际 SDK 设置。

先配置 Node 依赖和浏览器页面检查，再安装 Android Studio 或 command-line tools。SDK 组件包括 Platform、Platform Tools、Build Tools、Command-line Tools、NDK；模拟器测试另外安装 Emulator 和一个 x86_64 系统镜像。使用工程的 Gradle wrapper，不要求全局安装 Gradle。

以下目录是建议配置，尚未创建。JDK 与 NDK 使用实际已安装、经验证的版本；不将示例占位路径直接写入系统环境。

```powershell
Set-Location 'C:\Users\39633\.codex\worktrees\mobile-0-1-0-foundation\MDReader'
npm ci
rustup target add aarch64-linux-android x86_64-linux-android

# 在组件安装完成后，为当前终端设置实际目录。
$env:ANDROID_HOME = 'E:\Android\Sdk'
$env:ANDROID_AVD_HOME = 'E:\Android\Avd'
$env:CARGO_TARGET_DIR = 'E:\Android\BuildCache\longedit-mobile-cargo'
$env:GRADLE_USER_HOME = 'E:\Android\GradleCache'

# NDK_HOME 指向实际版本目录，例如 SDK 下 ndk/<已安装版本>。
# JAVA_HOME 指向与生成工程兼容的 JDK。
```

M0 将 NDK、SDK、JDK、Gradle、Rust、CLI 和系统镜像的准确版本写入环境记录，并核对生成配置。compileSdk、targetSdk 和 minSdk 分别管理；暂定最低产品版本 API 29，不据此推断应用商店的 targetSdk 要求。

## 浏览器快速验证

M1 建立显式的移动原型入口与开发用存储适配器，执行与实际移动页面相同的组件和路由。浏览器适配器只用于开发和测试；Android 安装包必须连接原生接口，权限或 IO 失败不得自动回退到模拟数据。

```powershell
Set-Location 'C:\Users\39633\.codex\worktrees\mobile-0-1-0-foundation\MDReader'
$env:LONGEDIT_DEV_PORT = '9010'
npm run dev
```

当前项目已支持 LONGEDIT_DEV_PORT；独立端口避免与桌面开发的 9000 冲突。移动入口为 `/mobile.html`，从本机 9010 的移动开发服务打开；构建后的静态预览可使用独立的 9012 服务。

页面检查使用 Playwright 和已安装的 Chrome / Edge；现有测试支持 LONGEDIT_PLAYWRIGHT_MODULE 指定 Playwright 安装位置。新 worktree 不共享原目录的 node_modules，也不依赖未登记的全局库。M1 选定自动化依赖、锁定版本，并创建独立的移动页面任务。

| 测试视口 | 用途 |
| --- | --- |
| 360 × 800 CSS px | 紧凑手机、工具栏、长文件名、更多菜单 |
| 412 × 915 CSS px | 常见大屏手机、抽屉和列表 |
| 800 × 1280 CSS px | 平板及并排参考布局 |
| 横屏及缩短可用高度 | 导航、弹窗、保存入口和内容滚动 |

启用触摸和移动设备模拟，检查浅色、深色、长中文内容、空库、加载、错误、权限失效、未保存和保存失败状态。自动化断言可见结果、焦点及草稿内容；截图作为布局证据。用鼠标触发 JS 回调不替代触摸或输入法检查。

## Android 模拟器集成验证

在 AMD Windows 主机上优先验证 Windows Hypervisor Platform 路径。通过 Android Emulator 加速检查后启动 AVD；若启动或图形加速不稳定，按实际诊断处理，并可先接入真机推进，不以硬件信息推定模拟器一定可用。[Android 加速说明](https://developer.android.com/studio/run/emulator-acceleration)

首台 AVD 使用 Android 15 / API 35 x86_64，初始建议 4 GiB RAM、2 至 4 个 vCPU，按运行情况调整。核心流程完成后再增加暂定最低版本 API 29 的兼容任务。发布前补充当时选定的新系统版本；每次记录设备 API 和 WebView 版本。

M0 先隔离桌面 API，建立 Android 配置，再初始化工程。调试配置将应用身份与日常应用区分，并与 Vite 同步使用 9010。Tauri CLI 在 Android 上自动读取 tauri.android.conf.json；确需其他调试覆盖时再显式传入 --config。

```powershell
# 在本方案的 worktree 中运行，依赖和工具链须先就绪。
npm run tauri -- android init

$env:LONGEDIT_DEV_PORT = '9010'
npm run tauri -- android dev

# 需要在 Android Studio 中检查原生工程时，保持该进程运行。
npm run tauri -- android dev --open
```

Windows Android dev 默认可能选择本机网络地址。现有 Vite 支持 TAURI_DEV_HOST；M0 核对 devUrl、监听地址和 HMR 端口，移动工作使用独立 HMR 端口。根据设备使用同网段连接或 USB 端口转发。只将必要的开发端口用于调试，随后还要验证完全不依赖 Vite 的离线安装包。

通过模拟器系统文件选择器创建专用测试目录，从其他测试应用修改夹具，再返回 Long编辑验证来源变化。不得直接把本机路径塞进模拟 IPC 来替代授权目录测试。重启模拟器后验证持续授权；撤销授权或移走文件后验证恢复入口。

## 真机验证和问题定位

准备一台能与电脑连接的安卓手机，启用开发者选项和 USB 调试，并在手机上完成调试授权。首次接入记录厂商型号、系统/API、内存、WebView、输入法及文档提供器。先使用自建测试目录和开发应用身份执行任务。

```powershell
# SDK 安装后可通过其完整路径调用，无需先修改系统 PATH。
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices -l
```

多设备同时连接时，所有 adb 操作指定设备 serial；Tauri dev 按 CLI 提示选定设备，也可使用其显示的设备名。UI 检查可通过 Chrome 的 chrome://inspect/#devices 查看调试版 WebView，原生和权限问题使用 Android Studio Logcat。自动化后续选用 Appium UiAutomator2，原生选择器和 WebView 分别切换上下文，锁定与设备 WebView 匹配的驱动。[WebView 调试](https://developer.android.com/develop/ui/views/layout/webapps/debug-chrome-devtools)、[UiAutomator2 混合应用支持](https://appium.github.io/appium-uiautomator2-driver/latest/guides/hybrid/)

中文输入必须覆盖拼音合成中切换标点、候选词提交、连续输入、换行、撤销，以及合成期间的草稿记录。触摸测试覆盖选区手柄、长按菜单、滚动、返回手势、软键盘关闭、系统字号放大、横竖屏和长列表。PDF、OCR、工作簿和图谱迁移后，再增加对应性能任务。

## 首版必测任务

| 编号 | 场景 | 通过条件 | 最低执行层次 |
| --- | --- | --- | --- |
| T01 | 首次启动、新建库、授权外部库与取消 | 操作结果明确，取消后原状态可继续 | 模拟器 |
| T02 | 中文、空格、长名称、重名和相对图片 | 定位准确，附件可读，创建不覆盖已有内容 | 模拟器 |
| T03 | Markdown / TXT 编辑、保存、关闭重开 | 内容与编码按支持范围保留，保存状态准确 | 模拟器与真机 |
| T04 | 快速笔记连续点击、失败与重试 | 草稿保留，同次提交不重复创建 | 模拟器 |
| T05 | 搜索、打开结果、返回及切换资料库 | 结果定位准确，当前位置和未保存输入受保护 | 模拟器 |
| T06 | 收起应用、旋转、进程终止后重开 | 恢复最后已持久化草稿，来源不被静默覆盖 | 模拟器与真机 |
| T07 | 保存期间再输入、切换文档或重试 | 旧回执不清除新输入，不写入错误文档 | 模拟器 |
| T08 | 外部修改原文件后保存或恢复草稿 | 识别冲突，可比较或另存，原稿和新草稿均保留 | 模拟器 |
| T09 | 授权失效、文件移动、提供器暂不可读 | 保留当前输入，解释原因并提供重试或重新授权 | 模拟器 |
| T10 | 注入磁盘不足、写入失败和提交中断 | 不误报成功；保留恢复材料；重新读取可确定结果 | 原生适配器测试及模拟器故障验证 |
| T11 | 中文输入法、选择与软键盘 | 合成文字不丢失，保存和返回入口可达 | 真机 |
| T12 | 安装包离线启动和同签名覆盖升级 | 无开发服务器也可用，资料库登记和草稿可接续 | 模拟器与真机 |

草稿开始时设定候选目标：最后一次已完成的编辑操作在 2 秒内进入持久恢复记录；切后台时尝试立即刷新。M2 用真实计时验证并记录尚未持久化的时间窗口，不能宣称任意瞬间终止都零丢失。输入法合成期间保留可恢复状态，并单独核对提交和恢复语义。原文件始终由显式保存流程写入。

T06 分开执行三类任务：页面状态恢复、系统允许的后台进程终止、用户强制停止后的冷启动。设置测试应用 ID 和 serial 后，可以通过 adb 对测试应用执行终止；确认实际进程已结束，手动重新打开，再比较草稿和原文件摘要。一次 WebView 重载不能作为完整进程重启的结果。

```powershell
# 应用身份和 serial 使用实际测试 APK 与 adb 清单中的值。
$mobileDeviceSerial = '<测试设备 serial>'
$mobileTestAppId = '<开发版 applicationId>'

# 应用已进入后台后测试普通后台进程终止，并核对 pid。
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s $mobileDeviceSerial shell am kill $mobileTestAppId
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s $mobileDeviceSerial shell pidof $mobileTestAppId

# 另行测试强制停止后的冷启动，之后手动重新打开测试应用。
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s $mobileDeviceSerial shell am force-stop $mobileTestAppId
```

## 测试资料和结果记录

建立专用 mobile-baseline 夹具，包含 Unicode / BOM / CRLF 的 Markdown 与 TXT、相对图片、重复标题和重名目录。M3 起补充 .longedit 关系元数据、工作现场与备份包；M4 按当前迁移格式增加 PDF、Table、XLSX、DOCX 等已有测试样本。每项记录输入摘要、操作步骤和预期输出，新增故障夹具可重复创建。

迁移同一份资料时，检查 Windows 到 Android 再返回的内容与引用。外部文档提供器、应用私有库、云提供器的离线状态分别记录；系统文件选择器展示云盘不代表应用已实现跨设备自动同步。

每次验证记录以下字段：

- commit、里程碑、包版本、applicationId、构建类型、ABI、APK 摘要。
- 测试层次、设备/API、WebView、输入法、提供器和授权状态。
- 任务编号、实际步骤、结果、关键截图和必要日志。
- 源文件与输出文件的摘要、恢复草稿代次及保存回执。
- 首次失败、修复提交和完整重跑结果；跳过或未测任务保持原状态。

证据目录按 `docs/evidence/mobile-0.1.0/<任务或运行标识>/` 组织。测试日志和夹具不包含日常资料或 API Key。

## 安装包和性能验收

开发期使用匹配设备 ABI 的 debug APK。Android 工程和签名规则就绪后，构建独立安装包；CLI 的 aarch64 对应 ARM64 真机，x86_64 对应本机模拟器。

```powershell
npm run tauri -- android build --debug --apk --target x86_64
npm run tauri -- android build --debug --apk --target aarch64

# M5 的 release 构建需要先完成签名配置。
npm run tauri -- android build --apk --target aarch64
```

离线验收使用安装后的包启动，关闭开发服务器，再核对编辑器资源、字体、图片、搜索和已迁移的离线工具。升级使用固定身份和相同签名；生产发布前执行 release 包任务，debug 包结果不能替代 release 验证。本文命令参数已对照当前本地 Tauri CLI 的 --help；工程和工具链未就绪时不直接视为可执行完成。

首个完整文档闭环完成时记录冷启动、文件列表、首篇文档打开、输入响应、保存、搜索、恢复及峰值内存。分别测紧凑夹具与较大夹具，记录设备、文件大小和重复运行结果，再据实确定各格式预算。PDF 页面、OCR 并发、工作簿规模和图谱节点数进入对应批次的预算；超出能力时提供可取消操作或明确反馈。

Android 0.1.0-dev 的退出条件是首版必测任务完成，并提供至少一台模拟器与一台真机的实际记录。尚无真机时可以交付明确标记的模拟器预览包，真机任务继续待验证，不能标记该里程碑全部通过。

2026 年 10 月 23 日第二批已在 API 35 模拟器完成授权撤销、只读与离线测试提供器、异常写入记录导出及副本核对。本批步骤、脚本、证据和未测边界见[存储边界验收](Mobile_Storage_Boundaries_2026-10-23.md)。真实云盘、磁盘不足、提交中断及真机仍按上表继续验收。

第三批已在相同模拟器验证相对 PNG、图片字节与尺寸限制、文档内查找、Gboard 布局与强制停止后阅读接续；新增了阅读夹具生成及只读核对脚本。复现命令、浏览器隔离检查和实际截图见[第三批验收](Mobile_Text_Reading_2026-10-24.md)。中文 IME、TalkBack、原生横屏和字号任务继续待验收。

第四批增加 `npm run test:mobile-search-browser`、全文检索逻辑测试和 `scripts/create-mobile-search-fixture.mjs`。本轮 28 项逻辑与 22 组浏览器任务通过；整库范围、原生错误 / 超限、来源变化、命中返回与授权撤销按[第四批验收](Mobile_Library_Search_2026-10-24.md)的专用夹具分别核对。

第五批增加 `npm run test:mobile-attachments-browser`、合成图片夹具与 `verify-mobile-attachments-native.mjs` 分阶段复核。插入前后、重启前后的候选图片、不同格式 / 大小、携图副本与 CRLF 位置均按[第五批验收](Mobile_Attachments_2026-10-24.md)独立记录。

第六批增加 `npm run test:mobile-editor-browser`、写作夹具与 `verify-mobile-writing-native.mjs`。原生 Gboard 候选栏、Inline composing、中文标点 / 回车与来源字节分别核对；浏览器合成事件只证明浏览器行为。系统字号、旋转、阅读切换、撤销 / 重做及未保存输入接续的实际范围见[第六批验收](Mobile_Writing_2026-10-24.md)，T11 的真机要求继续保留。

第八批已补 [Android 打包、最低系统和覆盖升级任务](Mobile_Android_Packaging_2026-10-24.md)。后续按 `build-mobile-debug.ps1` 输出的目标 APK 和 `build-record.json` 安装；系统启动入口使用 `com.longyuye.mdreader.mobile.dev/.LauncherActivity`。WebView 的最低声明版本为 111，实际任务已在 API 29 / 35 的 WebView 124 上执行；API 29 原始 WebView 74 验收原生更新提示。升级核对分安装前、安装后尚未操作和用户继续草稿三个阶段，避免把合法保护代次更新误判为安装损坏。

## iOS 的本地测试衔接

Windows 可继续开发公共逻辑、页面和浏览器任务。iOS 编译、模拟器、真机和签名由 macOS / Xcode 承担；接入后复用同一份测试任务，补充文件持续授权、Keychain、系统分享和 WKWebView 输入体验。浏览器的 iPhone 尺寸模拟用于页面检查，iOS 通过状态以模拟器及真机任务为准。[Tauri iOS 要求](https://v2.tauri.app/start/prerequisites/#ios)

## 第七批：无障碍与接续验收

运行 `npm run test:mobile-accessibility-browser`，在实际任务中保存 12 个状态的截图、ARIA 树、axe-core 自动违规和需人工复核项。另核对页面 / 列表返回焦点、模态循环、状态语义及稳定保护提示。新增 5 组任务与原有 35 组浏览器任务通过；45 项逻辑测试继续通过。

原生使用 E 盘专用 API 35 AVD、TalkBack 15 和 WebView 124，已核对真实内核键盘触发的 TalkBack 遍历 / 激活、库和外观状态、沙箱正文以及文件 / 标题返回。普通 ADB 创建 / 输入与读屏操作分别登记；完整触摸探索、中文语音和真机仍待验收。步骤、失败环境、调试包摘要与范围见[第七批记录](Mobile_Accessibility_2026-10-24.md)。

## 第九批：规模与响应

运行 `npm run test:mobile-library-scale-browser` 检查 1,000 文件、批次、返回焦点、独立路径快照、停止 / 重试和换词竞争；逻辑测试包含接近 24 MiB 的可取消扫描。原生通过系统选择器授权合成目录，检查 1,000 个源文件的摘要以及最后一份文档的读写；按 `before`、`pending`、`saved`、`final` 四阶段核对，必须等保存回执和 `saved` 文件检查通过后才能进行重启验收。补充测试提供器的离线、可空元数据和同名 ID，详细范围和首次失败见[第九批验收](Mobile_Library_Scale_2026-10-24.md)。浏览器计时不作为真机性能承诺。

## 第十批：文稿阅读预算

运行 `npm run test:mobile-document-budget-browser`，检查普通文稿的真实 Worker、接近 4 MiB 的分段源码、末尾查找、换词取消、阅读位置、完整源文编辑与保存、密集排版、超长行及 200% 字号下的自动无障碍规则。浏览器预览数据键使用内存替身以隔离 localStorage 配额，不能代替原生持久化。

`create-mobile-document-budget-fixture.mjs` 生成 4,193,280 字节的混合换行文稿及三个边界样本；通过系统 SAF 授权后，使用 `verify-mobile-document-budget-native.mjs` 按 `before / pending / saved / final` 核对实际文件。`saved` 字节核对必须先于强制停止；重启后再验证命中、草稿清理、包摘要和离线状态。原生无障碍树、进程内存样本和测试脚本失败分别记录，见[第十批验收](Mobile_Document_Budget_2026-10-24.md)。

## 第十一批：保存拒写与进程中断

运行 `npm run test:mobile-write-recovery-browser` 验证失败提示入口、来源文件夹、原文 / 草稿选择、长内容全文查找、返回焦点、实际下载、另存失败后重试及 200% 字号。预览故障来自显式测试配置，不替代 Android 提供器验收。

单独安装测试提供器，通过系统选择器授权 `nospace` / `interrupted`。使用 `verify-mobile-write-interruption-native.mjs` 的 `before` 核对原文，再进行真实写入。ENOSPC 使用 `failed`；部分写入使用 `kill`，必须先保存“保存中”界面，且由脚本核对完整私有版本后才终止进程。重启后分别另存两份完整内容，并通过系统选择器导出 JSON，最后使用 `final` 核对来源、草稿、私有记录、副本、导出和当前安装包。脚本限制专用 API 29 AVD，详细步骤和边界见[第十一批验收](Mobile_Write_Interruption_2026-10-24.md)。T10 中设备整体磁盘耗尽、断电及真实提供器仍待验收。

## 第十二批：新建与重复提交

运行 `npm run test:mobile-creation-browser`，验证首次草稿持久化失败后重试、连续提交、已有名称、列表快照之外的同名文件、取消后保留名称，以及 200% 字号的错误面板。配额失败由浏览器测试注入，不等同设备实际填满。

系统选择器分别授权 `create-safe / create-renamed / create-alias`，使用 `verify-mobile-creation-native.mjs` 的 `before / prepared / failed / saved / final`。输入前等待编辑器，保存前核对完整私有候选；正常创建检查恰好一次提供器写入，另外两种情况检查零次打开写入及完整另存副本。冷启动后重新打开正常文件并重跑三个 `final`。同时核对直接编辑和阅读返回的真实 Android 界面树，记录失败尝试与最终修复，见[第十二批验收](Mobile_Note_Creation_2026-10-24.md)。

## 第十三批：文字导出与中断恢复

运行 `npm run test:mobile-text-export-browser`，检查实际下载的完整 UTF-8、未保存候选、源文 / 草稿代次保护、下载受阻后重试、重载后恢复、快照保护失败及 200% 字号。浏览器只能报告下载发起，不代替 Android 文件回读。

使用 `create-mobile-text-export-fixture.mjs` 生成两份合成文稿，通过实际 SAF 目录授权打开。在完整编辑器里只输入一次 `ExportDraft`，使用 `verify-mobile-text-export-native.mjs` 的 `before` 核对完整候选，打开系统保存窗口后用 `picker` 核对持久快照。取消用 `cancelled`；实际导出用 `exported`；受控提供器拒写或回读不一致用 `failed`；重试到健康目标用 `retried`；只在完整快照已验证后用 `kill` 终止专用测试应用。恢复独立副本后用 `recovered`，最后 `final` 核对安装包、离线状态与完整内容。具体本次场景和首次失败见[第十三批验收](Mobile_Text_Export_2026-10-24.md)。


## 第十四批：单文件导入和重复存入保护

运行 `npm run test:mobile-text-import-browser`，检查真实文件选择、只读全文核对、重载继续、同名独立副本、来源和已有草稿不变、已完成记录打开最新笔记、文件写完但回执持久化失败时重试，以及损坏编码 / 字节超限 / 扩展名 / 中断元数据 / 记录损坏 / 长文尾部查找 / 容量上限。360px 深色与 200% 字号检查布局和无障碍，浏览器配额和损坏状态均明确为测试注入。

独立测试提供器增加只读 `import-*` 合成文稿。`verify-mobile-text-import-native.mjs` 要求显式 serial 和专用 `LongEdit_Compat_API29`；`before / ready / kill / imported / failed / removed / final` 分别核对原文件、完整候选摘要、先核对再终止专用应用、独立本机副本、失败无笔记、只移除记录及安装包摘要。`mobile-emulator-import-picker.ps1` 仅为此 1080px 专用 AVD 的真实系统选择器测试辅助。重开前启用独立无障碍测试服务，完成后恢复原设置。首次脚本错误、正常结果与未覆盖范围见[第十四批验收](Mobile_Text_Import_2026-10-24.md)。


## 第十五批：外部打开和分享接收

运行 `npm run test:mobile-incoming-browser`，用明确的浏览器记录替身验证接收通知、编辑焦点、显式查看时的草稿保护、保护失败留页、多个未查看条目、重载继续、独立存入以及失败说明与其他有效内容并存。360px / 200% 深色与无障碍规则检查不代替原生 Intent 测试。

专用 API 29 使用独立 `ShareFixtureActivity` 发送固定资料，通过真实 Android 打开方式 / 分享面板选择 Long编辑，及受控显式目标测试异常。`verify-mobile-incoming-native.mjs` 的 `before / received / kill / committed / rejected / replayed / final` 核对完整候选、已存笔记、来源、草稿代次、同次递送重放、实际安装包与离线状态。无授权夹具必须使用从未授权的新 URI，且采用 ACTION_VIEW；ACTION_SEND 的 EXTRA_STREAM 可能被系统自动补入 ClipData 和读取授权。详见[第十五批验收](Mobile_Incoming_Content_2026-10-24.md)。

## 第十六批：笔记与附件的 TextPack 导出

运行 `npm run test:mobile`、`npm run test:mobile-portable-pack-browser`，或 `node scripts/test-mobile-browser-regression.mjs` 完整跑 15 个浏览器脚本。需设置预览 URL 为 `http://127.0.0.1:9012/mobile.html` 及可用 Playwright 模块路径。独立 Python zipfile 读取实际下载，核对 CRC、公共格式、正文和二进制；检查保护包重载重试、源附件消失、配额、损坏、确认移除、焦点和 200% 字号。不得在这些回归运行中重建 dist。

`create-mobile-pack-fixture.mjs` 仅在全新目录生成合成资料；上传专用模拟器 Documents 后，通过真实选择器授权。`verify-mobile-pack-native.mjs` 显式限制 emulator-5558 / LongEdit_Compat_API29 / API29，按 before / protected / cancel / safe / unconfirmed / nospace / kill / retry / alias / missing / final 核对实际源文件、完整包、持久草稿、提供器、回执和安装 APK。alias 返回零字节源附件，必须在写打开前阻止；kill 核对保护后才终止开发包；retry 在系统设置撤销来源授权后执行。完整记录、首次失败、构建摘要和范围见[第十六批验收](Mobile_Portable_Pack_2026-10-24.md)。

## 第十七批：TextPack 导入与实际往返

运行 `npm run test:mobile`、`npm run test:mobile-pack-import-browser` 或完整浏览器回归脚本。独立 Python 生成 STORED / DEFLATE、CRC、symlink、越界、伪造展开长度与损坏编码夹具；浏览器核对真实解码、完整存入、重启、配额、容量、目标占用、回执失败、确认移除、后续编辑与导出字节。原生使用专用只读 pack-import-* 提供器与实际系统窗口，验证脚本显式限定 API29 / emulator-5558；完整包保护后才终止应用和阻断合成来源。

`verify-mobile-pack-import-native.mjs` 的 lose-receipt / edit-latest 明确限定本轮生成的 UUID 目标，并记录测试注入；其余选择、存入、取消、清理和打开通过界面。`verify-mobile-pack-roundtrip-native.mjs` 独立读取 Downloads 中的实际应用导出包，再核对实际系统导入后的文本与所有资源。完整任务、最终包复核、APK 摘要和未验收范围见[第十七批验收](Mobile_Pack_Import_2026-10-24.md)。

## 第十八批：系统接收整包

`test-mobile-pack-incoming-browser.mjs` 覆盖 9 组接收后的用户任务，完整浏览器回归共 114 组。单独测试 APK 的 `PackShareFixtureActivity` 发送固定 TextPack，实际系统分享面板选择 Long编辑，`mobile-pack-incoming-ui.ps1` 使用新鲜 UIAutomator 状态操作。`verify-mobile-pack-incoming-native.mjs` 限定专用 API29 AVD 和显式 serial，检查既有文件 / 草稿、包摘要、接收编号、来源读取次数、拒绝说明和独立发布的全部正文 / 附件。测试发送器中的真正无授权请求使用不带授权的 `ACTION_VIEW`，避免 `ACTION_SEND` 的流迁移自动补授读取权。步骤、最终包与范围见[第十八批验收](Mobile_System_Pack_Import_2026-10-24.md)。

## 第十九批：公开包与有效 ZIP

`test-mobile-external-packs.mjs` 用独立 Python ZIP / CRC 与固定上游 blob 身份核对两种许可内容，检查完整正文、图片、特殊语法原文、容器后缀与负面样本。`test-mobile-external-packs-browser.mjs` 新增 7 组真实文件输入任务，完整浏览器回归现为 18 脚本 / 121 组；包括单篇 ZIP、普通 / 多篇 / 缺失附件拒绝、同名独立副本、回执移除、重载及 360px / 200% 字号。公开元数据不能发起外部请求。

单独测试 APK 将语料注册为 `external-*` 只读来源，`ExternalPackFixtureActivity` 经真实分享面板、octet-stream 分享或 VIEW 投递 ZIP；`mobile-external-packs-ui.ps1` 通过新鲜状态检查操作。长正文核对框独立滚动，外层面板手势使用专用设备的右侧留白；关闭面板前先滚回可用标题。`verify-mobile-external-packs-native.mjs` 要求 emulator-5558 / LongEdit_Compat_API29 / API29，按 before / received / reviewed / imported / removed / final 核对完整 ZIP、原文和附件字节、原有草稿、旧记录及独立发布结果。缺失附件由共享适配器的引用检查阻止提交，不能只看原生 ready 状态。[第十九批记录](Mobile_Pack_Compatibility_2026-10-24.md)保留样本出处和首次失败。

## 第二十批：JSON 源码

`test-mobile-json-source.mjs` 核对词法保留、BOM / 混合换行的撤销重做、非法语法、复杂度 / 输出预算与 `.json` 名称和快照；逻辑回归现为 94 项。`test-mobile-json-source-browser.mjs` 新增 11 组用户任务，完整浏览器回归为 19 脚本 / 132 组；实际文件输入与下载、字节比较和真实 Worker 与明确注入的延迟 / 失败分开记录。

`JsonFixtureActivity` 提供 `application/json` 文件分享面板、VIEW、未完成源文与 JSON 文字；`json-source / json-invalid` 是独立只读合成来源。`verify-mobile-json-source-native.mjs` 仅用于指定 API29 AVD，按 before / received / reviewed / imported / formatted / undone / redone / saved / exported / reopened / removed / final 核对真实资料。排版预期来自人工固定文件，未调用产品排版器生成；原生导出到独立的 UUID 文件名并回读 SHA-256。测试辅助只在确认键盘显示后收起键盘，再重新获取可用控件。完成后恢复原无障碍设置并停止专用模拟器；其他模拟器不在本批操作范围。详见[第二十批记录](Mobile_JSON_Source_2026-10-24.md)。

## 第二十一批：JSON 结构与字段

`test-mobile-json-structure.mjs` 增加 7 项独立逻辑检查，总计 101 项；覆盖重复 / 转义同名键、原型名称、根标量 / 空容器、范围、类型验证、预算和混合换行历史。`test-mobile-json-structure-browser.mjs` 增加 10 组用户任务，总回归 20 脚本 / 142 组，包括只读浏览、分页返回、字段修改和实际草稿 / 保存比较、取消、错误与超时、源文变化使模型失效，以及深色 360px / 200% 字号。

原生复用只读 JSON 夹具，`mobile-json-structure-ui.ps1` 记录真实分享面板和字段页面；`verify-mobile-json-structure-native.mjs` 在本轮独立基线之上，按 before / received / imported / changed / undone / redone / saved / reopened / exported / removed / final 核对。预期是固定原文中第二个同名字段的唯一替换；既有资料、草稿内容 / 签名 / 修订、导入记录和完整包文件均单独保留。API29 自动化的滚动坐标以实际截图和新页面状态共同核对，不将 UIAutomator 旧边界当作新的按钮位置。详见[第二十一批记录](Mobile_JSON_Structure_2026-10-24.md)。

## 第二十二批：JSON 全树查找和结构修改

`test-mobile-json-operations.mjs` 增加 9 项逻辑检查，现为 110 项；`test-mobile-json-operations-browser.mjs` 增加 10 组用户任务，完整回归为 21 脚本 / 152 组。原始文字与解码值搜索、前 200 项结果和总数、返回页 / 焦点、名称冲突、空容器、每种逗号位置、完整元素移动、混合换行、旧结果、取消和 Worker 故障均有对应检查。深色 360px / 200% 字号另外核对确认按钮可达性和自动规则。

`verify-mobile-json-operations-native.mjs` 使用本轮独立基线；预期由固定 JSON 源文逐次替换组成，按 renamed / added / appended / moved / deleted / undone / redone / saved / exported / reopened / removed / final 核对真实文件与草稿。来源仍为独立只读夹具，所有修改通过产品页面，测试脚本只读校验应用数据；原记录和本轮新增笔记分别核对。详见[第二十二批记录](Mobile_JSON_Operations_2026-10-24.md)。


## 第二十三批增量：YAML 源文与检查

逻辑任务 `scripts/test-mobile-yaml-source.mjs` 随 `npm run test:mobile` 运行；浏览器任务 `node scripts/test-mobile-yaml-source-browser.mjs` 已接入全量回归。覆盖多文档、注释、锚点与别名、不展开循环引用、块标量、精确数字、自定义标签提示、重复键、预算退出、取消 / 超时 / 启动失败和旧结果丢弃。实际文件输入验证 .yaml / .yml、未完成内容保存、错误定位修复、撤销重做、草稿恢复、冲突副本、下载字节、全库查找与 360px / 200% 字号。

原生使用新增的合成 `YamlFixtureActivity` 和只读 yaml-source / yaml-invalid 根，保留已有文件和草稿，禁止清空应用。`. ./scripts/mobile-yaml-source-ui.ps1 -Serial emulator-5558` 提供仅限专用 API29 AVD 的具名按钮操作和独立证据目录；`verify-mobile-yaml-source-native.mjs` 逐阶段只读核对源文件、草稿、导出及旧资料。编辑器的 Android EditText 节点以实际正文为 text，不能用“笔记正文”查找其 text；错误定位后用当前 EditText 确认输入界面，再输入修复字符。自动点击的接受回执之后仍须等待业务状态并核对文件。

完成后恢复启用前的无障碍设置，只关闭 emulator-5558；真机、第三方云提供器、完整 TalkBack 触摸、iOS 和 release 继续独立验收。完整命令与证据见[第二十三批记录](Mobile_YAML_Source_2026-10-24.md)。


## 第二十四批增量：YAML 结构定位与标量编辑

`test-mobile-yaml-structure.mjs` 随 `npm run test:mobile` 运行，检查源范围、嵌套同名字段、字符串类型、精确数值、标点注入、元数据继承只读、复杂键、隐式值、多文档、1.1 版本、预算和一次历史事务。`test-mobile-yaml-structure-browser.mjs` 接入全量浏览器回归，实际运行 Worker，并验证分页 / 筛选返回、核对与取消、应用后撤销、源码查找、只读边界、故障恢复和 360px / 200% 字号。

原生专用 API29 AVD 使用新增只读 `yaml-structure` 根和合成 `yaml-structure.yml`，通过 `YamlFixtureActivity` 的 Share YAML structure 接收。`. ./scripts/mobile-yaml-structure-ui.ps1 -Serial emulator-5558` 独立记录按钮动作；`verify-mobile-yaml-structure-native.mjs` 逐阶段比对原有资料及实际草稿 / 文件。系统布尔选择器可以从“值的类型”的 View 节点打开并选回布尔值，再用 Tab / 确认进入下一个选择器，避免使用内层滚动后可能陈旧的 UIA 坐标。按钮仍用专用测试服务的具名动作，回执后另等业务结果并核对字节。

测试不得清空应用或覆盖前批证据。最终恢复原有无障碍设置，只关闭 emulator-5558；完整结果见[第二十四批记录](Mobile_YAML_Structure_2026-10-24.md)。


## 第二十五批增量：XML 源码与检查

`test-mobile-xml-source.mjs` 随 `npm run test:mobile` 执行，覆盖 UTF-8 源码往返、注释 / CDATA / 处理指令、标签与属性错误、非法 XML1.0 字符和引用、命名空间绑定及展开名称重复、DTD / 实体拒绝解析、编码 / 版本边界和预算。`test-mobile-xml-source-browser.mjs` 已接入完整回归；实际文件输入及真实 Worker 验证修复、撤销重做、恢复草稿、冲突副本、下载、全库查找、取消 / 超时 / 启动失败和旧结果丢弃，另用浏览器原生 DOMParser 交叉检查三个错误样本。

在 360px 暗色 / 200% 字号下运行无障碍检查；源码滚动区域提供键盘焦点，实际 PageDown 验证可滚动。检查带外部 DOCTYPE、样式表地址与 CDATA 中图片地址的文件，不应产生外部请求，也不应改写原有资料和草稿。

原生使用 `XmlFixtureActivity` 与只读 xml-source / xml-invalid 根，禁止清空应用。`. ./scripts/mobile-xml-source-ui.ps1 -Serial emulator-5558` 独立保存动作和截图，`verify-mobile-xml-source-native.mjs` 逐阶段读取字节；通过问题定位补入完整 `</root>`，再验证撤销、重做、保存、系统导出和重启读取。文本输入必须给 Android shell 保留引号，避免把尖括号解释为重定向。最终恢复原来的无障碍设置，仅关闭 emulator-5558；详见[第二十五批记录](Mobile_XML_Source_2026-10-24.md)。


## 第二十六批增量：XML 结构与属性

`test-mobile-xml-structure.mjs` 随逻辑测试运行；`test-mobile-xml-structure-browser.mjs` 接入完整浏览器回归，真实 Worker 验证重复兄弟位置、命名空间只读、解码 / 原文对照、预览取消、精确替换、数字文字、分页返回、故障退出、源码切换和 360px / 200% 字号。修改结果另用浏览器原生 DOMParser 交叉核对。

原生新增独立只读 `xml-structure` 根和 `Share XML structure` 入口，不覆盖前批夹具文件。`. ./scripts/mobile-xml-structure-ui.ps1 -Serial emulator-5558` 记录本批控件动作；`verify-mobile-xml-structure-native.mjs` 逐阶段只读核对私有文件、草稿、系统导出和原有资料。期望由固定源文件中第二个 `id` 属性的唯一文字替换定义，不由产品解析器生成。测试不清空应用，最终恢复无障碍设置，只关闭本批拥有的 emulator-5558。结果与限制见[第二十六批记录](Mobile_XML_Structure_2026-10-24.md)。


## 第二十七批增量：TOML 源码

`test-mobile-toml-source.mjs` 接入逻辑测试，覆盖表 / 表数组、点号与引号键、注释、多行 / 原义字符串、精确长整数、日期、重复定义、非法输入和预算。`test-mobile-toml-source-browser.mjs` 接入完整浏览器回归；真实文件输入及 Worker 验证定位修复、撤销重做、草稿恢复、冲突副本、下载、取消 / 超时 / 启动失败、全库查找与 360px / 200% 字号。另可运行 `node --experimental-strip-types scripts/test-mobile-toml-oracle.mjs`，需要 Python 3.11+，对 16 个常见 1.0 样本使用独立 tomllib 交叉核对。

原生使用 `TomlFixtureActivity`、新的只读 toml-source / toml-invalid 根，以及 `. ./scripts/mobile-toml-source-ui.ps1 -Serial emulator-5558`。逐阶段只读校验脚本为 `verify-mobile-toml-source-native.mjs`，固定期望是未完成夹具末尾增加一个 `]`。不清空应用，不覆盖前批证据；测试后恢复原有无障碍设置，只关闭本轮拥有的模拟器。实际范围及结果见[第二十七批记录](Mobile_TOML_Source_2026-10-24.md)。


## 第二十八批：设计图与真实页面对齐

`test-mobile-toml-design-browser.mjs` 接入全量回归，使用真实保存文件减去一个结束括号产生草稿和问题。采集 390 × 844 应用区域，记录文档栏、模式栏、检查卡、源码卡、文件标题栏与底部工具条的边界；设计 PNG 不作为网页背景或交互替身。`mobile-design-comparison.mjs` 将两份原图放在只读 HTML 中，再用浏览器渲染对照图，不修改源图。检查模式切换、历史、详情折叠、错误标记清除 / 重检、浅深主题、360px / 200% 字号和 180px 极短视口；原有笔记和草稿分别核对。

`. ./scripts/mobile-toml-design-ui.ps1 -Serial emulator-5558` 使用独立 `toml-design-native-verified-2026-10-24` 证据目录，`verify-mobile-toml-design-native.mjs` 增加 mode-switched 阶段，以固定未完成源文件加 `]` 独立核对。早期预检和最终 APK 验收分开，不能覆盖前批记录。测试不清空应用，保留独立合成文件，最后恢复原无障碍设置并关闭本轮拥有的模拟器。完整范围见[第二十八批记录](Mobile_Source_Design_2026-10-24.md)。

最终完整浏览器回归为 27 脚本 / 194 组；逻辑 154 项、打包保护 17 项、原生 12 阶段均通过。运行全量浏览器任务时须设置 `$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'`，避免基础脚本的默认 9010 端口与本轮服务不符。代码编辑输入采用实际全选 / 粘贴后立即回读正文，保护性测试先确认测试草稿内容，再检查接收流程结果。

## 第二十九批：TOML 结构与值表单

`test-mobile-toml-structure.mjs` 接入逻辑回归；`test-mobile-toml-structure-browser.mjs` 接入完整浏览器回归。检查点号 / 引号键、表数组实例、内联表、精确数值、原样值、文字转义、注入拒绝、日期 / 跨行文字只读、预算退出及单次历史。浏览器使用真实 Worker 检查筛选、分页与焦点返回、预览取消、应用保存、失败重试、源码 / 阅读切换、浅深色、200% 字号和 180px 极短视口菜单入口，采集 390 × 844 几何记录与设计对照。

`node --experimental-strip-types scripts/test-mobile-toml-structure-oracle.mjs <新的证据目录>` 使用 Python 3.11+ 的独立 tomllib 核对十个候选值的类型、语义和其他表；另断言替换范围外字节不变。捆绑 Playwright 使用上文绝对路径变量，预览仍指定 9012。

原生夹具增加独立只读 `toml-structure` 根与 `Share TOML structure` 入口，既有夹具不变。`. ./scripts/mobile-toml-structure-ui.ps1 -Serial emulator-5558` 使用独立目录；`verify-mobile-toml-structure-native.mjs` 以唯一端口值 8080 → 8081 作为固定期望，逐阶段只读核对真实文件、草稿、导出和旧资料。WebView 模式按钮按 ToggleButton 的新鲜 UIA 坐标点击，普通按钮用测试服务具名动作；面板中屏外控件先滚动到可见，再等待业务状态并核对实际字节。测试不得清空应用，结束后恢复原无障碍设置，只关闭本轮拥有的模拟器。详见[第二十九批记录](Mobile_TOML_Structure_2026-10-24.md)。

最终验收：167 项逻辑、10 个独立语义样本、28 脚本 / 202 组浏览器任务、17 项打包保护和原生 13 阶段均通过。原生 `pre` 显示值在 UIA 中映射为具名原值节点，使用实际截图与独立文件摘要核对，不依赖其内部存在独立数字文本节点。测试后原无障碍设置已恢复，专用模拟器已关闭，9012 预览继续可用。

## 第三十批：代码源码与触摸辅助

`test-mobile-code-source.mjs` 接入逻辑回归，验证扩展名 / MIME 身份、完整 UTF-8 源文、按行偏移、成对符号、正反向选择、混合换行和独立历史。`test-mobile-code-source-browser.mjs` 接入完整回归，实际文件输入覆盖五类八个扩展名，新建覆盖五种语言；检查源码高亮、折行、行定位、原生返回处理、符号辅助、导出字节、恢复与冲突副本。HTML/CSS 任务核对来源标签按原文显示，没有来源 DOM 或外部请求。另核对大源码降级、浅深色、200% 字号、180px 高度和原有资料保护，保存设计 / 实际截图与几何记录。

新增独立只读 `code-source` 提供器根和 `CodeFixtureActivity`；`. ./scripts/mobile-code-source-ui.ps1 -Serial emulator-5558` 配合 `verify-mobile-code-source-native.mjs` 只读核对固定原文中 `const name = ;` 被双引号辅助键改为 `const name = "";`。预期不由产品生成；新增阶段 located 验证行定位尚未改写文件或草稿。使用真实分享、编辑 / 阅读模式、源码光标、Android 返回、撤销重做、系统导出和重启任务，不清空应用或覆盖前批记录；测试后恢复原设置并只关闭拥有的模拟器。详见[第三十批记录](Mobile_Code_Source_2026-10-24.md)。

最终通过 175 项逻辑、29 脚本 / 211 组完整浏览器任务、17 项打包检查和原生 13 阶段。Android `CodeFiles.defaultName` 参数按可空 MIME 处理，编译器首次拒绝记录保留；实际安装包通过身份、ABI、版本、签名与摘要核对。原生行定位后由真实辅助按钮插入引号，固定期望另经 Node `--check` 解析而不执行。完成后恢复原无障碍设置，关闭 emulator-5558，并保留 9012 预览。

最终产品错误文案修订后，重新构建两架构并全量复验。证据目录为 `code-source-native-final-2026-10-24`，保护基线 69 文件 / 8 草稿 / 18 文字导入记录 / 6 包文件，保留新增源码笔记为 70 文件。无障碍服务根节点不可用时改用新鲜 UIAutomator 边界物理点击；待核对入口在重启后可能选中较早项目，脚本应进入“文件导入记录”按唯一文件身份选择。此次误选合成 Inbox 回执被基线断言检出，精确恢复该回执并移除摘要已核对的新增副本后继续；失败与恢复证据不得覆盖。复验结束恢复原设置，只关闭本轮专用模拟器。

## 第三十一批：源码导航、选行与缩进

`test-mobile-code-lines.mjs` 增加 10 项有意义的核心检查，覆盖 BOM、混合换行、正反向选区、下一行行首排除、空白规则、单次历史、相邻输入隔离和 1000 行上限。`test-mobile-code-lines-browser.mjs` 接入完整回归，从真实按钮验证光标、组合字素、缩进、草稿导出、恢复、外部冲突、合成组合事件防护及极短视口，保存新设计对照。原生 `. ./scripts/mobile-code-lines-ui.ps1 -Serial emulator-5558` 配合独立字节校验器；复用只读 JavaScript 夹具，仅增加固定两空格，不修复原有未完成表达式。通过文件导入记录里的唯一名称选择本轮回执，禁止把重启后的最早待核对项目当作当前夹具。完成后恢复原设置并只关闭拥有的模拟器。完整结果见[第三十一批记录](Mobile_Code_Lines_2026-10-24.md)。

最终证据使用 `code-lines-native-final-2026-10-24`；185 项逻辑、30 脚本 / 221 组完整浏览器、17 项打包与 13 个原生阶段通过。多数原生 Button 经测试服务按具名 ACTION_CLICK 操作，避免 WebView 过期矩形误点；折行与系统保存使用实际点击，完整 TalkBack 触摸不由此推断。`GoTo-MobileCodeLine -Line 2` 会清空旧行号、核对输入值、表单关闭及当前行。原生初轮误拦、错误位置草稿与撤销记录保留；禁止将错误预期替换为观察到的输出。浏览器回归收集器按脚本证据前缀过滤，最终构建完成后再串行测试，避免构建切换和其他专项报告干扰。最终恢复 null / 0 无障碍设置，仅停止 emulator-5558，保留 9012。

## 第三十二批新增本地验证（2026-10-25）

运行 `node --experimental-strip-types scripts/generate-mobile-code-formats.mjs --check` 检查生成的 Kotlin / Manifest 快照，再执行原有 `npm run test:mobile` 与移动构建。新增 `test-mobile-code-languages.mjs` 对完整桌面 32 后缀集合、MIME 默认名称、实际高亮树、复制 / 导出字节、行缩进撤销及全部源码入库搜索做独立核对。`test-mobile-code-languages-browser.mjs` 经真实文件输入覆盖 32 后缀、20 个语言身份新建、逐项保存和下载，并检查 JSX / TSX / Vue 不渲染源标签或执行源码、大文件高亮降级、格式说明的返回行为、浅深色 / 200% 字号及极短视口。

全量浏览器回归必须对最终构建串行运行；本批结果为 31 脚本 / 231 组。API29 专用模拟器使用独立只读 Rust / Vue 资产及固定 SQL 文字分享；通过 `mobile-code-languages-ui.ps1` 和 `verify-mobile-code-languages-native.mjs` 分阶段核对导入、草稿、行操作、保存、系统导出读回、重启及仅移除本轮回执。已有文件、草稿、回执和包文件作为保护基线，测试结束恢复辅助服务设置并关闭本轮专用模拟器。原生结果与失败记录见[第三十二批记录](Mobile_Code_Languages_2026-10-25.md)；代表性三种接收方式不等同全部 MIME、真机或完整 TalkBack 验收。

## 第三十三批新增本地验证：PDF（2026-10-25）

新增 PDF 逻辑测试覆盖二进制文件头 / 20 MiB 限制、页码、画布预算、回弹与小数滚动归一化、按身份保存 / 配额失败，以及逐页搜索的中文、大小写、取消和部分结果预算。浏览器以真实 PDF.js worker、三页含中文嵌入字体的 PDF 及已有 URI 注释样本，检查实际渲染、输入法 composition 提交、文字提取 / 搜索跳页、二进制保真、恢复、来源变化、失败 / 返回、深色 / 200% 和 180px 视口。完整回归必须串行对固定构建运行。

原生辅助为 mobile-pdf-reading-ui.ps1，独立校验器为 verify-mobile-pdf-reading-native.mjs，显式限定 emulator-5558 / LongEdit_Compat_API29 / API29。阶段 before / imported / page-two / zoomed / located / search-results / searched / text / returned / reopened / cancelled / paused / final 核对真实 DocumentsUI、页面控件、辅助树中文字、原文与副本摘要、原有文件 / 草稿 / 回执 / 包及最终安装 APK。逐轮候选不删除，最终复验将其纳入保护集合；结束恢复测试辅助设置并关闭专用 AVD。具体结果见[第三十三批记录](Mobile_PDF_Reading_2026-10-25.md)，不把模拟器或浏览器结果当成全部提供器、完整 TalkBack 或真机验收。

## 第三十四批：PDF 批注与阅读笔记

逻辑入口 test-mobile-pdf-annotations.mjs，浏览器 test-mobile-pdf-annotations-browser.mjs；覆盖桌面 schema、归一化真实选文、保存版本、未确认 IME 输入/草稿、配额阻离开、独立 Markdown 与来源保护。原生入口 mobile-pdf-annotations-ui.ps1 / verify-mobile-pdf-annotations-native.mjs，限定专用 API29 AVD，以真实长按、侧录文件原子保存、进程恢复和读取实际文件摘要验收。固定构建后串行完整浏览器回归；双 ABI 包核验结束恢复辅助设置并关闭专用模拟器。全部证据索引见[第三十四批记录](Mobile_PDF_Annotations_2026-10-25.md)。

## 第三十五批：删除恢复与笔记回链

逻辑入口 test-mobile-pdf-recovery.mjs，覆盖固定 URI、桌面兼容、非法/重复参数、来源摘要、单次解码、可读标题、双阶段恢复日志与最新集合中的单条恢复。浏览器 test-mobile-pdf-recovery-browser.mjs 覆盖真实 PDF/笔记链接、确认/取消、配额阻止删除、并发冲突、日志整理失败后的重启恢复、删除最后一条、来源变更拒绝、清洗/消息边界、深色/大字体/短屏和设计对照。完整回归对固定构建串行运行，必须显式设置9012预览地址。

原生 mobile-pdf-recovery-ui.ps1 / verify-mobile-pdf-recovery-native.mjs 限定专用 API29 AVD；候选失败留存并纳入最终新基线保护。验收真实触摸批注、删除冲突、重启后撤销、原 ID/坐标/时间恢复、来源列表跳转、已删批注回退与返回笔记，以及生成 Markdown 的持续字节保真。最终 APK/环境恢复证据见[第三十五批记录](Mobile_PDF_Recovery_2026-10-25.md)。


## 第三十六批：筛选与阅读笔记整理

新增 test-mobile-pdf-selection.mjs / test-mobile-pdf-selection-browser.mjs；完整浏览器入口35脚本串行对固定构建，显式设置 LONGEDIT_MOBILE_PREVIEW_URL=http://127.0.0.1:9012/mobile.html 与本机 Playwright 模块。筛选组合、中文可见组合输入、隐藏选择、原子200条、50条列表、预览取消、配额重试、修订冲突、失效ID和128KiB预算分别核对。旧批注/回链专项更新为先预览再保存，语义名称明确为“全部批注生成笔记”。短屏验收除了无横向溢出，还断言正文至少40px并实际滚动点击筛选/批量选择，避免零高度区域被误判通过。

原生 mobile-pdf-selection-ui.ps1 / verify-mobile-pdf-selection-native.mjs 限定 emulator-5558、LongEdit_Compat_API29、API29。先记录既有资料/草稿/导入回执/包文件，再真实系统选择器导入、UI新增三条评论、跨筛选选两条、预览无新文件、仅本批sidecar换行故障注入、修订拒绝、重新读取后保存、原页跳转、等待笔记真正打开再杀进程和重开。候选数据保留，短屏修正后的两架构包另重建；最终从包含候选资料的新基线完整复验，不能把旧APK上的结果写成新包完整验收。最终摘要和环境收尾见[第三十六批记录](Mobile_PDF_Selection_2026-10-25.md)。


## 第三十七批：PDF目录与缩略图

逻辑入口test-mobile-pdf-navigation.mjs，组合验证Outline的层级/预算/纯文本、局部目标解析与迟到取消、六页批次及串行画布预算。浏览器入口test-mobile-pdf-navigation-browser.mjs新增9组真实PDF/Outline流程和绘制失败回退；画布完成等待同时核对v-show可见状态，不能把默认300×150画布当作已完成。完整入口36脚本，固定构建后串行，显式设置9012预览与本机Playwright；不能在完整回归期间重建dist或并行浏览器专项。

原生mobile-pdf-navigation-ui.ps1 / verify-mobile-pdf-navigation-native.mjs限定emulator-5558、LongEdit_Compat_API29、API29。先保存94资料/8草稿/18导入文件/6包文件，以及提供器自身已有文件摘要，再系统选择器导入独立pdf-navigation样本，通过真实目录收放、物理页/命名目标跳转、失效位置保留、缩略图前后批次、选最后页、关闭和重开验收。所有导航只读，结束只能新增一个独立PDF；原资料和提供器旧文件原SHA保持，草稿正文/签名/版本保持（忽略updated时间）。当前样本为9物理页、重复的3页原页面，实际印刷编号不等于物理编号；不以此样本推断大型复杂PDF性能。完整证据见[第三十七批记录](Mobile_PDF_Navigation_2026-10-25.md)。


## 第三十八批：外形对齐也需要实际验收

新增test-mobile-pdf-navigation-alignment-browser.mjs并纳入完整37脚本入口。独立六条目录PDF与原图场景一致，按真实预览条高度（当前28px）裁出390×844应用区域，核对面板106px起点、24px深色标题、16px行文字/父子字重、短下划线、目录连接线及固定底栏。浅色/深色连接线computed颜色分别断言，不能仅凭主题类名判断切换成功。320/360/430px、320×346与200%字体须实际点击章节和关闭，正文至少40px。

原生verify-mobile-pdf-navigation-alignment-native.mjs复用模拟器中原有PDF，保留95资料文件/8草稿/18文字回执/6包文件及提供器95文件，比较文件集合和SHA。不导入或覆盖源文件。保存旧包和最终新包的同一第三页截图，检查真实目录、缩略图、深色、系统返回和进程重开；最终安装APK摘要必须匹配最终构建。候选失败、主动中止的浏览器轮次、最终完整轮次和收尾回执分别保留。

第三十八批最终：238项逻辑、17项打包保护、API29原生11条记录及固定构建37脚本/284组浏览器组合验收通过。深色连接线候选重建双ABI后复验；回链夹具显式刷新测试修正后，与原全量前33脚本及余下PDF专项组合，生产资源保持不变，失败与组合来源均保留。两架构最终调试包序号1002042，95资料/8草稿/18导入文件/6包文件及提供器95文件保持。图稿对照、安装包摘要与收尾回执见[第三十八批记录](Mobile_Design_Alignment_2026-10-26.md)。


## 第三十九批：书签与原图复核（2026-10-26）

新增 `scripts/test-mobile-pdf-bookmarks.mjs`（12 项）和 `scripts/test-mobile-pdf-bookmarks-browser.mjs`（11 组）。逻辑覆盖物理页/根/路径/摘要隔离、名称草稿、精确撤销、过期记录、损坏/未来版本、200 枚与 512KiB 预算及保留其他元数据。浏览器以真实九页 PDF 和通过 UI 添加的三枚书签比对未改动的新设计图；另以真实 201 页夹具核对分页和上限。检查名称组合输入、关闭/切换/返回保护、失败重试、冲突、重开撤销、旧版只读、窄屏/大字/短屏、源字节和其他草稿保留。

执行：`npm run test:mobile`；预览固定 9012，设置 `LONGEDIT_PLAYWRIGHT_MODULE` 及 `LONGEDIT_MOBILE_PREVIEW_URL=http://127.0.0.1:9012/mobile.html` 后执行 `node scripts/test-mobile-browser-regression.mjs`。完整浏览器运行期间不要重建 dist 或并发运行其他浏览器任务。两个 ABI 顺序构建，避免共享原生输出交叉；产物验证后安装最终 x86 APK。

原生辅助 `scripts/mobile-pdf-bookmarks-ui.ps1` 和 `scripts/verify-mobile-pdf-bookmarks-native.mjs` 明确限制专用 `emulator-5558 / LongEdit_Compat_API29`，对已有九页 PDF 进行添加、中文输入、草稿进程恢复、三页记录、确认/保留/删除、重开撤销、滚动、跳转/关闭/恢复，并逐阶段保护原资料和提供器文件。输入通过独立辅助 APK 的当前聚焦可编辑节点动作；API29 findFocus 漏虚拟节点时按相同条件遍历当前开发包树。无输入框时必须拒绝。滚动后的 XML 坐标可能旧于真实画面，保留截图和实际跳转结果，不以旧坐标证明视觉正确。收尾比较启动设置、设置核对后 sync，再正常关闭 AVD。

最终：250 项逻辑、17 项打包、38 脚本 / 295 组固定构建完整浏览器和原生 16 阶段通过。两架构序号 1002043；95 资料 / 8 草稿 / 18 文字导入记录 / 6 包文件以及提供器 95 文件均保留。失败、修正、图稿、普通/深色/空/编辑/删除状态及最终 APK 摘要见[第三十九批记录](Mobile_PDF_Bookmarks_2026-10-26.md)。ARM64 只完成构建和静态产物核对，实体机、真实提供器、完整 TalkBack 和 iOS 另行验收。


## 第四十批：系统接收 PDF 与实际页面（2026-10-26）

新增 `scripts/test-mobile-pdf-import.mjs`（6项）及 `scripts/test-mobile-pdf-incoming-browser.mjs`（11组）。前者核对安全文件名、Unicode、稳定投递路径、20MiB/6条/80MiB边界；后者在真实 PDF.js 首页中验证当前任务与草稿保护、确认前不创建库文件、稍后重开、精确几何和颜色、深色、重复确认、删除保留、写入失败重试、目标变化、摘要错误/渲染错误区分、长名/窄屏/大字/短屏及错误路由。

390×844必须使用视口截图，避免 fullPage 长截图改变固定面板。图稿原件保持；普通状态核对 y76 面板、24px标题、358px卡片、y232文件、y307预览和y700主要按钮。原PDF比例/内容与模型示意不同，分别记录。冻结双ABI构建后再跑39脚本完整入口；运行期间不重建 dist 或并发其他浏览器任务。

原生辅助 `scripts/mobile-pdf-incoming-ui.ps1` / `scripts/verify-mobile-pdf-incoming-native.mjs` 限定专用 API29 AVD，使用真实系统打开/分享选择器、发送者/Clip URI、content读取授权、进程重开和重放。21阶段还检查无授权、多文件、网络地址、错误文件头、20MiB流、来源不可用、6条记录边界，以及失败/待存入/已存入记录的移除。来源失败流不落地额外提供器文件。每阶段保护原95资料、8草稿、18文字回执、6包文件和95提供器文件；保留三份真实独立PDF，共98资料，移除已存入接收记录后原库文件摘要仍相同。原有待接收3项保留，设置核对后sync并正常关闭AVD。

浏览器使用33,504字节设计样本，原生沿用既有34,506字节合成样本；分别检查完整摘要，不混称同字节图稿对照。更短原生视口须滚动内容区，截图和实际动作分别核对。选择器辅助曾误用Heading类名，已按新鲜树的TextView更正；失败、候选及完整复验见[第四十批记录](Mobile_PDF_Incoming_2026-10-26.md)。ARM64只完成构建和静态产物核对；实体机、真实提供器、完整TalkBack、iOS及正式签名另行验收。

第四十批最终：256项逻辑、17项打包保护、39脚本 / 306组同一构建完整浏览器和API29原生21阶段通过；双ABI调试包序号1002044。原95资料、8草稿、18文字回执、6包文件和95提供器文件保留，新增3份PDF共98资料；移除接收记录后库内PDF保持原字节。设置核对后同步并关闭AVD。候选、失败、实际对照、样本差异、APK摘要与退出条件见[第四十批记录](Mobile_PDF_Incoming_2026-10-26.md)。


## 第四十一批：PDF 手势与恢复验收（2026-10-26）

新增 `scripts/test-mobile-pdf-gestures.mjs` 并加入 `npm run test:mobile`；新增 `scripts/test-mobile-pdf-gestures-browser.mjs` 并加入完整浏览器回归。先 `npm run build:mobile`，预览固定 `http://127.0.0.1:9012/mobile.html`，使用现有 LONGEDIT_PLAYWRIGHT_MODULE/LONGEDIT_MOBILE_PREVIEW_URL 设置运行。完整回归期间不重建dist或并行跑浏览器专项。逻辑检查焦点几何/夹紧/精度/旧位置兼容；浏览器合成多点检查预览、松手重绘、横纵恢复、取消/第三指/后台、按钮、文字/翻页、4M像素和文字层重合，并保留同尺寸设计对照/深色/大字/短屏。

原生继续使用专用 `LongEdit_Compat_API29` / `emulator-5558`。新增测试包 `TEST_PDF_PINCH` 通过Android dispatchGesture向可见开发PDF发送真正两指输入；shell DUMP权限、API29模拟器、开发包前台、跨度与画布边界限制不可省略。使用 `scripts/mobile-pdf-gestures-ui.ps1` 和 `scripts/verify-mobile-pdf-gestures-native.mjs`，先保存98资料/8草稿/18文字导入/6包文件/PDF接收文件/95提供器基线；不重新导入PDF。两个ABI顺序构建，核对开发包不含测试手势入口，安装最终x86包并验证实际摘要。

原生13检查点：ready、zoom-in、panned、reopened、zoom-out、maximum、minimum、text-mode、paging、selected、visual-aligned、fit-return、final。两指放大/缩小/上下限、单指拖动、进程结束后重开、长按选文、模式隔离、翻页和适合宽度逐阶段对照；后台取消等额外分支由浏览器专项覆盖，不冒称都做过原生验证。对比重开前后同一PDF原文区域的原始像素，不平移/替换截图。原有3项待接收提示保持。读取并恢复实际辅助设置，设置后sync，再正常关闭AVD。

图稿、修正、完整回归结果和限制统一见[第四十一批记录](Mobile_PDF_Gestures_2026-10-26.md)。连续阅读、实体ARM、其他OEM/WebView、复杂PDF、真实提供器、完整TalkBack及iOS保持独立退出条件。


第四十一批最终结果：262项逻辑、17项打包、40脚本/317组完整浏览器及API29原生13检查点通过。完整构建回归为 `browser-regression-1792992197498`；仅修正截图等待后的最终11组专项为 `pdf-gestures-browser-1792992944920`，不改产品/dist/APK。原生 `pdf-gestures-native-2026-10-26` 保存每阶段摘要、四次真实双指完成回执、重启原文区域0像素差异、最终安装包摘要和设置恢复/关闭AVD回执。

## 第四十二批：连续页面与原文锚点（2026-10-26）

新增test-mobile-pdf-continuous.mjs的6项逻辑（画布/选页/页边缘/位置兼容/渲染队列），加入test:mobile；新增11组test-mobile-pdf-continuous-browser.mjs并加入41脚本完整入口。完整回归固定最终双ABI构建后的dist，不重建、不并行跑其他浏览器任务。专项保存浅色/深色/模式面板/320px的200%文字/180px短屏、真实页界并排图和量测；201页PDF反复滚动回收至12页再跳201页，每个采样最多8画布/1200万像素，不宣称测过整个堆的峰值。

原生用mobile-pdf-continuous-ui.ps1与verify-mobile-pdf-continuous-native.mjs；测试前保护98资料/8草稿/18文字导入/6包文件/6 PDF接收文件/95提供器。实际单指向前/逆向滑动、两指200%、适合宽度、终止进程重开、模式/文字/导航/原生返回、已有批注和最终库共18检查点。固定原文区域993600像素重开差异0；页界节点存在不等于可见，必须肉眼检查截图，本次补拍visual-boundary保留旧候选。原3项待接收保留，实际辅助设置恢复并核对后sync/正常关闭AVD。详见[第四十二批记录](Mobile_PDF_Continuous_2026-10-26.md)。

第四十二批最终：268项逻辑、17项打包保护、固定构建41脚本/328组完整浏览器回归和API29原生18检查点通过；两架构开发包序号1002046。98资料/8草稿/18文字导入/6包文件/6 PDF接收文件/95提供器文件保持，原有3项待接收保留。固定原文区域重开差异0，实际设置核对后sync并关闭AVD。最终图稿、实页差异、失败候选和包摘要见[第四十二批记录](Mobile_PDF_Continuous_2026-10-26.md)。

## 第四十三批：混合方向与屏幕尺寸（2026-10-26）

新增test-mobile-pdf-orientation.mjs的6项逻辑并加入test:mobile；新增12组test-mobile-pdf-orientation-browser.mjs加入42脚本完整入口。用真实字形区的画布像素证明文字层重合，选文Range与高亮在四方向对应且sidecar保持默认源坐标。原图人工量测与实页的卡片/分隔线/旋转按钮位置采用6px容差，触摸高度独立≥48。混合6页含90/270内置方向、裁切、小页、横页、大图；844/320宽度分别适配812/288px纸张且保留同一原文上沿；大字和短屏滚动到操作。固定双ABI构建后完整回归期间不重建dist或并发浏览器任务。

原生mobile-pdf-orientation-ui.ps1和verify-mobile-pdf-orientation-native.mjs先保存98资料/8草稿/18文字导入/6包文件/6 PDF接收文件/95提供器基线，以及实际辅助设置、系统自动旋转与user_rotation值。仅允许显式导入一份摘要匹配的LongEdit-Mixed合成PDF，逐阶段检查原98资料完整。通过系统文件选择器、真实左右旋转、两指、进程重开、Android系统横竖屏及已有批注读取验收；不使用CDP/应用JS注入。收尾恢复两类实际设置、sync并关闭专用AVD，证据和限制见[第四十三批记录](Mobile_PDF_Orientation_2026-10-26.md)。

第四十三批最终：274项逻辑、17项打包保护、固定构建42脚本/340组完整浏览器及API29原生24检查点通过，双ABI开发包序号1002047。原98资料/8草稿/18文字导入/6包文件/6 PDF接收文件/95提供器保持，显式新增一份混合PDF共99资料，原3项待接收保留。原生重开原文区域像素差异0；横竖屏往返保留1物理像素舍入差异并公开原图。实际辅助与旋转设置恢复、sync并关闭AVD，完整证据与限制见[第四十三批记录](Mobile_PDF_Orientation_2026-10-26.md)。

## 第四十四批：密码与复杂页面组合（2026-10-26）

新增5项密码回调逻辑与15组真实浏览器组合，加入完整43脚本入口；279项逻辑、17项打包、固定构建355组通过。用AES-256/AES-128/RC4-128/空打开密码样本，核对缺少/错误密码、原样空格、一次提交、取消、后台、重新询问和已存位置不被锁定阶段覆盖。真实目录、书签、混合6页、旋转连续阅读、侧文件和阅读笔记回链联合验证；320px+200%字和300px高可滚动到操作。先生成图，再按同尺寸真实390×844截图核对五个位置、x16/w358表单与≥48px按钮，不把局部几何当整页像素一致。

原生从99资料/8草稿/18文字导入/6包文件/6 PDF接收文件/95提供器保存实际基线，只允许新增一份指定SHA的加密PDF。系统选择器、真实密码输入、键盘Go、错误时滚动、取消、系统返回、后台清空、深色、目录/书签、进程重开、旋转连续和125%恢复及原有批注读回分别检查；UI采集的根节点瞬态失败保留并单列，不替代完整TalkBack。两个APK和实际安装包资源/摘要核对，收尾恢复实际辅助与旋转设置后sync关闭AVD。详见[第四十四批记录](Mobile_PDF_Password_2026-10-26.md)。

第四十四批收尾：原生19项交互/界面加1项最终数据保护通过，原99资料与8草稿等基线保持，仅新增指定加密PDF共100资料，原3项待接收保留；重开固定原文区域928,800像素差异0。实际辅助/旋转设置恢复后sync，专用AVD已关闭。UI根节点候选采集问题和其成因未完全确定，原始失败保留，完整TalkBack仍独立验收。

## 分段长文续读专项（2026-10-30）

`test-mobile-source-reading-repository.mjs`已加入353项模型入口；`test-mobile-source-position-task-browser.mjs`检查首写时机、跳段／帮助／Back、查询与选区、迟到回复、故障和短屏，连同8项相关实页合计72组。分段弹窗最终截图保留完整视口，防止已滚出屏幕的预览条被错误扣除；标题、关闭及两项动作均无需滚动可见和命中。

`verify-mobile-source-position-persistence-native.mjs`保存172文件及300提供器文件完整基线；仅新增明确命名的长文与原生位置文件，收尾174／301，旧资料、9草稿、原生PDF及普通阅读记录保持。`capture-mobile-source-position-legacy.mjs`记录旧键实际缺失；`verify-mobile-source-position-native.mjs`按初始、续读和收尾阶段检查迁移、Back／Home／冷启动、查询／选区、读写失败、CAS、严格编码、AtomicFile备份、原生大文件读取保护及横屏。原生超大IPC堆不足、服务树2节点false和一次失败截图覆盖均明确披露；不据此宣称大包写入、真实输入法或完整TalkBack通过。双ABI和22项打包验证通过，实际设置恢复、专用转发移除，sync后关闭AVD，详见[报告与原图](Mobile_Native_Source_Position_2026-10-30.md)。

## 外观偏好专项（2026-10-30）

`test-mobile-appearance-repository.mjs`的21项加入374项模型入口；`test-mobile-appearance-task-browser.mjs`验证已知／未知旧值、读写失败、延迟、合并、冲突、系统跟随和短屏大字。连同设置、普通／分段阅读及PDF设置，最终46组实页通过。状态条对图、短屏标题／关闭／三个选项及重试无需滚动可见和命中；Android原生系统栏另核对属性、图标标志和原图像素。

`verify-mobile-appearance-preservation-native.mjs`保存174私有文件和301提供器文件完整基线，仅新增偏好文件，收尾175／302，原103资料及旁车、9草稿、全部阅读／批注和最近记录保持。`capture-mobile-appearance-legacy.mjs`保存原缺失键后种入已知Dark样本；`verify-mobile-appearance-native.mjs`区分前候选迁移和最终8组，验证系统配置、Back／Home／冷启动、失败恢复、CAS、16 KiB、编码、备份和横屏。普通夜间命令被锁定模拟器忽略的失败保留；最终专用模拟器使用已有su单次执行并核对真实配置，应用无root依赖，adbd保持shell，原夜间模式和设置恢复。跨日WebView日期缓存仅在全部其他XML节点吻合后从已核对TAR成员恢复，其他文件严格比较。原生服务树仍2节点false，不代替完整TalkBack；双ABI及22项打包通过，sync后关闭AVD，详见[报告](Mobile_Native_Appearance_2026-10-30.md)。
