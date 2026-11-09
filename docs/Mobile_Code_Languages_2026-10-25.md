# 第三十二批：源码语言与格式说明

日期：2026-10-25，承接 10 月 24 日开始的调研与设计。分支 `codex/mobile-0.1.0-foundation`，Android 开发包序号 `1002036`。本批接入剩余 24 个源码扩展名；基础源码文件闭环覆盖基线中 32 个扩展名，不能据此宣称桌面的补全、诊断、运行或预览能力已经迁移完成。

## 从用户选择文件的任务设计

用户需要知道“能否打开这个文件、被识别为什么语言、当前显示能提供什么帮助”，然后小幅编辑、保存或导出。本批沿用上一批触摸行工具，在源码工具栏增加“格式”说明，并让导入前的支持列表可查；不要求用户先去设置中了解文件类型。

| 一手公开资料 | 查阅内容 | 本批决定 |
| --- | --- | --- |
| [QuickEdit Syntax Language](https://rhmsoft.com/qedit/syntax.html) | 根据扩展名自动识别，另有手动语法切换与文件关联 | 自动识别保持确定性，展示扩展名与当前高亮边界；“格式”只解释当前文件，没有伪装成语言选择器 |
| [Acode Editor Settings](https://docs.acode.app/user-guide/settings/editor-settings) | 行号、折行、Tab 与格式化分别配置 | 沿用已有行号 / 视觉折行 / 显式保存；本批不自动格式化或改变缩进策略 |
| [Code Editor Overview](https://rhmsoft.com/icode/intro.html) | 将多语言高亮、编译运行与网页预览分别列出 | 文件支持、高亮、语法正确性、执行和网页预览分别声明，不把高亮当成编译通过 |

依据开发者公开资料，没有安装或测量竞品，也不由宣传推断性能、隐私或无损保存。

## 格式与明确边界

| 家族 | 已支持的扩展名 | 当前显示 |
| --- | --- | --- |
| JavaScript / TypeScript | `.js .mjs .cjs .jsx .ts .mts .cts .tsx` | JS / TS 模式；JSX 与 TSX 使用原文编辑和行号 |
| Python、Rust、Go | `.py .rs .go` | 对应源码高亮、行号与完整文件闭环 |
| Java / Kotlin | `.java .kt .kts` | Java / Kotlin 高亮，不编译或执行 |
| C / C++ / C# | `.c .h .cc .cpp .cxx .hpp .cs` | C、C / C++、C# 高亮；`.h` 按 C / C++ 模式，不从内容推断头文件所属编译器 |
| Shell / PowerShell | `.sh .bash .zsh .ps1` | Shell / PowerShell 高亮，所有文字只作源文 |
| SQL | `.sql` | 通用 SQL 高亮，不连接或执行数据库 |
| Web 源码 | `.html .htm .css .scss .less .vue` | HTML / CSS / SCSS / Less 高亮；Vue 使用原文编辑与行号 |

共 20 个语言身份、32 个扩展名、31 个登记的源码 MIME；17 个高亮模式用于 29 个扩展名。JSX / TSX / Vue 未引入混合语法解析依赖，明确显示“暂不提供混合语法高亮”。其原文阅读、查找、行号、编辑、触摸辅助、历史、草稿、冲突、副本、保存与导出同样可用。

`shared/file-formats.json` 继续作为桌面基线范围事实；`shared/mobile-code-formats.ts` 登记移动端接入范围、标签、MIME 和高亮状态。逻辑检查将基线十个源码家族的完整扩展名集合与移动登记严格比较；Android `CodeFiles.kt` 及 Manifest 的 VIEW / SEND MIME 区段由同一移动登记生成，再用 `--check` 防止快照漂移。

导入仅在没有名称时按已登记 MIME 生成代表扩展名；有名称时保留其具体后缀。C++ MIME 的默认名称使用 `.cpp`；不把 `video/mp2t` 推断为 TypeScript，也不把 Java 二进制或未知文件变成源码。编码继续限定严格 UTF-8、4 MiB、没有零字节；BOM、CRLF、孤立 CR、LF、Unicode、缩进和标签保留。源码标签、脚本、样式与导入引用均按文字处理。

“格式说明”与行号表单互斥；关闭和 Android 返回只收起当前说明，继续保留文稿。超过 256Ki UTF-16 单元的源码关闭高亮，全文与行号仍可用；格式说明反映真实状态。JSX / TSX / Vue 从未开启高亮，不误报为大文件导致的临时关闭。

## 出图与页面外形

用内置 `image_gen` 的新图生成模式绘制 Rust 编辑页，保留原有米白、深绿、源码卡和触摸行工具。页面由真实 Vue / CodeMirror / Lucide 控件实现。

- [设计图](design/mobile-0.1.0/code-languages-v1.png) · [完整提示词](design/mobile-0.1.0/code-languages-v1-prompt.txt)
- [设计 / 实际页面对照](design/mobile-0.1.0/code-languages-v1-comparison.png) · [并排 HTML](design/mobile-0.1.0/code-languages-v1-comparison.html)
- [实际浅色页](design/mobile-0.1.0/code-languages-v1-implemented.png) · [实际深色页](design/mobile-0.1.0/code-languages-v1-dark.png)

实际截图在真实新建的 `hello.rs` 中输入源码、定位第三行、选择行操作并展开格式说明后取得。仅裁去浏览器预览提示条，不改变产品控件、源图、字号或原文来制造匹配；保留真实重做禁用状态与完整行工具名称。

以 390 × 844 应用区域对齐 16px 边距、358px 源码卡、展开说明、底部工具区与固定保存状态。工具栏在展开时保持位置稳定，原文继续可读。最终几何与验证证据见下方验收记录。

## 本地验证入口

```powershell
node --experimental-strip-types scripts/generate-mobile-code-formats.mjs --check
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
node scripts/test-mobile-code-languages-browser.mjs
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
. ./scripts/mobile-code-languages-ui.ps1 -Serial emulator-5558
```

先固定构建产物，再串行执行浏览器任务；9012 是构建产物预览，不以源码已修改代替重建。专项通过真实文件输入覆盖全部 32 个扩展名、20 个语言身份新建、保存 / 导出字节、草稿恢复与 Rust 冲突副本，另检查原文展示、负向网络行为、大文件降级、深色、200% 字号及 180px 高度。逻辑测试还实际将全部 32 种源码纳入资料库搜索，并确认隐藏和未知格式继续排除。

原生使用新增独立只读 Rust / Vue 夹具及固定 SQL 文字分享，不覆盖此前夹具。Rust 的固定期望仅为第二行增加两空格，独立校验器直接读取原文、草稿、系统导出、重启文件及基线资料。Vue 经 VIEW 接收，按原文导出；SQL 经指定 MIME 的无名称文字分享进入独立 `.sql` 笔记。导航、历史、保存和回执按钮使用受专用模拟器、SDK、硬件与包名限制的具名 ACTION_CLICK；行工具和系统保存使用观察到的真实控件点击。测试服务空 root 时只回退到 active / focused 的应用窗口，仍检查开发包名。不能据此声称完成所有应用 MIME 或完整 TalkBack 触摸验收。

## 最终验收与可安装产物

| 核对范围 | 结果 | 证据 |
| --- | --- | --- |
| 移动逻辑 | 192 项通过；原生命名修正后重跑 | [最终输出](evidence/mobile-0.1.0/code-languages-native-2026-10-25/logic-tests-final.txt) |
| 全量浏览器 | 31 脚本 / 231 组全部通过 | [总表](evidence/mobile-0.1.0/browser-regression-1792858955261/summary.json) |
| 本批浏览器专项 | 10 组，全部 32 后缀真实输入 / 编辑 / 保存 / 下载，20 个语言身份新建 | [逐项结果](evidence/mobile-0.1.0/code-languages-browser-1792859356997/report.json) |
| Android 打包保护 | 两个实际 ABI 的 17 项检查通过 | [打包结果](evidence/mobile-0.1.0/code-languages-native-2026-10-25/packaging-verification.json) |
| 最终 Android 安装包 | API29 / x86_64 / 约 2 GiB / WebView124，21 阶段全部通过 | [原生总表](evidence/mobile-0.1.0/code-languages-native-2026-10-25/summary.json) |
| 环境收尾 | 辅助服务恢复为 null / 0，资料已同步，专用 AVD 已关闭，预览返回 200 | [生命周期](evidence/mobile-0.1.0/code-languages-native-2026-10-25/lifecycle.json) |

浏览器全量在固定前端构建上串行完成。其后唯一产品改动为 Android Kotlin 的导出名称去后缀；前端源码保持一致。两 ABI 均重建，原生 21 阶段从新回执重新验证，安装 APK 的 SHA-256 与最终构建记录严格匹配。测试夹具窗口修复单独构建并安装，不包含在用户应用包内。

最终原生基线保护 73 个笔记、8 份草稿、18 条文字回执与 6 个包文件；包括原先 72 个笔记和保留的候选笔记。最终新增 Rust / Vue / SQL 三份独立笔记，总数 76；本轮回执经界面移除，全部基线记录保持不变。只读 Rust / Vue 来源未改写。Rust 文件、导出和重启后的 SHA-256 均为 `2ddf6a3fbaabf126d45939ee867259d507dba64267c27e51ffbbb143fd0df8d7`；Vue 原文及导出为 `e9424c4235adb70820cfcc5566628f8895f2b23b28bf085957f4ccb5817adca7`；SQL 为 `1fc661836051e83ccd5c479aa723876bd28887e02bfc4aab1b6a4d6b93462547`。

设计对齐的实页几何为：390 × 844，左右边距 16px，源码卡 `(16,294,358,319)`，底部辅助区 `(16,653,358,117)`，固定状态栏 `(0,780,390,64)`。格式说明高度 120px。设计与实页的边距、层级和卡片位置已经核对；真实字体、图标、禁用状态和完整控件名称保留差异，未修改截图制造逐像素相同。详见[几何记录](evidence/mobile-0.1.0/code-languages-browser-1792859356997/alignment.json)。本批完成的是源码格式说明页，未将其他页面统一标为重设计完成。

| 架构 | 调试 APK | 字节数 | SHA-256 |
| --- | --- | ---: | --- |
| ARM64 | [app-arm64-debug.apk](../release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk) | 126750053 | `8b14fe66d36472d67698b69483fb71561389333f903bdf7d804ab6d9722adb91` |
| x86_64 | [app-x86_64-debug.apk](../release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk) | 127406602 | `24b388122ac0a55f27fe0dc24f30f195eecbd259669c3c287a241cd0cb0f706b` |

包名 `com.longyuye.mdreader.mobile.dev`，versionCode `1002036`，versionName `1.2.11`，minSdk29 / targetSdk36，开发调试签名。ARM64 包已完成打包核对，实际运行验收使用 x86_64 专用模拟器；不把构建通过表述为真机或 iOS 通过。构建时来源如实记录为 `0d7f8181e76c2ac0a857333e95a7be15dc5b0aae + dirty`，不回写成之后的提交哈希；分别见 [ARM64 记录](evidence/mobile-0.1.0/code-languages-native-2026-10-25/build-aarch64.json)和 [x86_64 记录](evidence/mobile-0.1.0/code-languages-native-2026-10-25/build-x86_64.json)。

## 首次检查与修正

生成器首次只允许扩展名包含字母，因 `.ps1` 正确含数字而拒绝生成；已改成首字符字母、后续允许字母数字，并保留唯一性与 MIME 校验。首轮浏览器负向 DOM 检查误把阅读器自身的样式与桥接脚本算成源码 DOM；改为核对来源元素是否进入文稿 DOM，并独立检查外部请求和源码执行标记。原文与导出字节断言保持不变。

导出错误文案改为面向当前文件的说明后，旧测试仍匹配“Markdown”，已更新错误说明断言；不支持格式仍必须抛错。失败逻辑输出保留，未据此放宽文件或编码限制。

首次原生系统导出发现 Android 的文件名去后缀逻辑仍用旧白名单，Rust 名称出现两次 `.rs`；导出内容字节正确。改为移除当前已识别后缀长度，两 ABI 重建，再从新的接收记录开始复验。候选构建摘要、实际错误名称和候选阶段均保留；最终浏览器前端没有变化，192 项逻辑在修正后重跑，最终安装包的系统导出独立验收。旧模拟器还出现辅助窗口为空、键盘坐标过期及具名触摸工具使光标转到文末的测试问题，已按真实触摸和固定原文恢复后复验；完整经过见[测试与候选记录](evidence/mobile-0.1.0/code-languages-native-2026-10-25/test-harness-notes.md)。

下一步进入既定 M4 PDF 阅读、搜索与批注迁移。混合语法高亮、补全、基础诊断、HTML 安全预览、真机、真实云提供器、完整 TalkBack、iOS 和正式发布继续作为独立待办与退出条件。
