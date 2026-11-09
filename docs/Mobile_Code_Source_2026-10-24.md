# 第三十批：手机轻量代码源码工作区

日期：2026-10-24。继续 `codex/mobile-0.1.0-foundation`，Android 开发包序号 `1002034`。按 M4 第一批接续结构化文本，先迁移常见代码的源码闭环，再扩展其他轻量语言和辅助能力。

## 从用户任务确定范围

用户需要把一个代码文件带进手机、查看原文、找到某一行、小幅修改，并可靠保存或导出。本批把文件身份、保存状态、行定位、视觉折行和触摸符号放在主要位置；不以桌面 IDE 的侧栏数量决定手机页面。

| 公开资料 | 核对的交互 | 本批选择 |
| --- | --- | --- |
| [Acode QuickTools](https://docs.acode.app/user-guide/quicktools)及[编辑设置](https://docs.acode.app/user-guide/settings/editor-settings) | 常用括号、引号、特殊键和导航；行号、软 Tab 与视觉折行 | 独立的符号栏，Tab 明确插入制表符；折行只改变显示，不改源码 |
| [Code Editor Accessory View](https://rhmsoft.com/icode/accessory.html)及[QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html) | 根据编辑状态提供触摸工具、撤销、保存及查找 / 行定位 | 明确区分阅读与编辑，常用操作在当前页面可达；主动保存和副本分开 |
| [Squircle CE 官方仓库](https://github.com/massivemadness/Squircle-CE) | 多语言编辑、语法着色和文件工作流 | 用文件扩展名选择语言，高亮与代码是否正确分开，不自动执行源码 |

调查依据为开发者公开资料，未安装或测量竞品；不由宣传推断性能、隐私或源码往返是否无损。本批没有运行器、终端、LSP、自动补全、语法诊断、自动格式化或 HTML 网页预览。

## 桌面审计与移动能力

审计 `shared/file-formats.json`、`src/config/fileFormats.ts` 和 `src/utils/codeEditingSupport.ts`。桌面还覆盖更多语言、词汇补全、基础诊断和部分安全预览；本批只声明下表中的基础源码能力。

| 类别 | 本批扩展名 | 当前能力 |
| --- | --- | --- |
| JavaScript | `.js` / `.mjs` / `.cjs` | 原文阅读、查找、源码高亮、行号、编辑、草稿恢复、主动保存、冲突副本、源码导出 |
| TypeScript | `.ts` | 同上；不按媒体 MIME 为无名称内容推断 `.ts` |
| Python | `.py` | 同上；保留制表符和原缩进，不自动调整缩进 |
| HTML | `.html` / `.htm` | 按原文处理标签和脚本，不建立来源网页 DOM；编辑器只做标记高亮 |
| CSS | `.css` | 按原文处理样式和 `@import`，不应用到阅读页面 |
| JSX / TSX、Rust、Go、JVM、C 系、Shell、SQL 等 | 后续分批 | 尚未接入本轮普通文件入口，不能标记全部桌面代码功能迁移完成 |

新建空源码保留请求扩展名；文件导入和 Android VIEW / SEND 沿用“先暂存 → 核对 → 独立存入”的流程。无名称代码内容按已登记 MIME 生成安全默认名；不支持的扩展名仍拒绝导入。输入保持 UTF-8、4 MiB 上限及零字节 / 非法编码检查，导出保留代码扩展名与相应 MIME。

## 出图与页面外形对齐

先用内置 `image_gen` 的新图生成模式绘制 JavaScript 编辑页，沿用米白、深绿、鼠尾草灰和真实等宽源码层级。参考图只作评审，实际页面由 Vue、CodeMirror 和 Lucide 控件实现。

- [选定设计图](design/mobile-0.1.0/code-source-v1.png)
- [完整生成提示词](design/mobile-0.1.0/code-source-v1-prompt.txt)
- [设计 / 实际页面对照](design/mobile-0.1.0/code-source-v1-comparison.png) · [并排 HTML](design/mobile-0.1.0/code-source-v1-comparison.html)
- [实际浅色页](design/mobile-0.1.0/code-source-v1-implemented.png) · [实际深色页](design/mobile-0.1.0/code-source-v1-dark.png)

以 390 × 844 应用区域核对文档栏、阅读 / 编辑切换、源码工具栏、16px 边距、358px 源码卡、符号栏和固定底栏。截图只裁去浏览器预览提示条，不隐藏产品控件，不编辑参考 PNG。拍摄静态状态时正常移开焦点，避免把键盘操作后标题的焦点框当成页面装饰。

第一轮实图源码卡从 y168 开始；依据参考图调整工具栏上间距后为 y174，并将符号按钮增大至 40px。设计图中的引号键、图标和字形以实际可用性为准，不虚报像素相似率。

| 外形项目 | 参考图折算（约） | 实际页面 |
| --- | --- | --- |
| 文档栏 / 模式栏高度 | 60 / 46 px | 60 / 44 px |
| 源码卡左右边距 / 宽度 | 14 / 362 px | 16 / 358 px |
| 源码卡顶部 / 底部 | 176 / 680 px | 174 / 682 px |
| 触摸符号栏顶部 | 722 px | 722 px |
| 底栏顶部 / 高度 | 776 / 68 px | 780 / 64 px |

实际页面显示真实的重做禁用状态、完整单引号对，以及产生当前草稿的末尾空行；不为截图隐藏这些功能差异。完整边界见[最终几何记录](evidence/mobile-0.1.0/code-source-browser-1792853533908/alignment.json)。

## 编辑与保护边界

- 高亮复用现有锁定的 CodeMirror legacy modes，不增加运行依赖。超过 256Ki UTF-16 单元收起高亮，全文、行号、查找、编辑和保存继续可用；高亮不代表语法检查通过。
- 视觉折行使用独立 compartment，不重建编辑器、不写入真实换行、不重置历史。文稿内切换阅读 / 编辑保留编辑器状态，切换文件时恢复默认折行。
- 定位行号处理初始 BOM、CRLF、孤立 CR、末尾空行和 UTF-16 偏移；无效输入只给出说明。Android 返回可以关闭行号表单；同时补齐此前 TOML 结构对原生返回键的处理。
- 成对符号包住所选原文，不重新插入所选文字，保留其原换行；空选择把光标留在符号对中。Tab 仅插入一个制表符，分号 / 等号替换当前选择。每次辅助操作是独立历史事务。
- 正在输入法组合时拒绝辅助符号插入，提示先完成输入；不以程序动作破坏组合文字。未声明已完成所有 Android 中文输入法 / 真机组合场景验收。
- 修改先成为私有草稿，保存仍由用户主动发起。导出固定当前快照，不提交或清空草稿；外部文件变化后保留原文件和草稿，由用户明确存入独立代码副本。
- 400px 以下收紧工具区；极短视口收起辅助行，为源码保留空间，文档菜单仍可切换阅读 / 编辑。浅深色和放大文字分别验证。

## 本地验证入口

```powershell
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
npm run test:mobile
npm run build:mobile
node scripts/test-mobile-code-source-browser.mjs
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory <新的证据目录>
. ./scripts/mobile-code-source-ui.ps1 -Serial emulator-5558
```

新原生夹具为独立只读 `code-source` 根及 `CodeFixtureActivity`，不覆盖此前夹具。固定期望为 `const name = ;` 插入双引号对后变为 `const name = "";`，由常量范围替换定义，不通过产品编辑器生成。操作在页面完成，校验器只读比较真实文件、草稿、导出和原有资料。

| 验证 | 已通过结果与证据 |
| --- | --- |
| 逻辑回归 | 175 项，见[输出](evidence/mobile-0.1.0/code-source-native-final-2026-10-24/logic-tests.txt)，本批新增 8 项覆盖身份、范围和历史 |
| 夹具独立解析 | Node `--check` 确认原始夹具未完成、预期加引号后可解析，见[记录](evidence/mobile-0.1.0/code-source-native-final-2026-10-24/fixture-syntax.json)；只解析、不执行，不声称应用具备语法诊断 |
| 完整浏览器 | 29 脚本 / 211 组，见[摘要](evidence/mobile-0.1.0/browser-regression-1792853221894/summary.json) |
| 代码页专项 | 9 组，见[最终报告](evidence/mobile-0.1.0/code-source-browser-1792853533908/report.json)，含文件输入、新建、恢复、冲突、导出、负向网络检查和视口验证 |
| 打包保护 | 17 项，见[记录](evidence/mobile-0.1.0/code-source-native-final-2026-10-24/packaging-verification.json) |
| Android 原生 | 13 阶段，见[最终摘要](evidence/mobile-0.1.0/code-source-native-final-2026-10-24/summary.json)及[环境恢复](evidence/mobile-0.1.0/code-source-native-final-2026-10-24/lifecycle.json) |

原生使用 API29 / x86_64、约 2GB 内存、WebView124.0.6367.219 的专用模拟器。真实只读分享 URI 接收后核对、独立存入，定位第二行，移动到空值位置后由触摸双引号键修复；验证单次撤销 / 重做、保存、物理返回关闭行号表单、折行与阅读 / 编辑切换、系统 DocumentsUI 导出回读、终止进程和继续阅读重开。首次完整验收的基线为 68 个文件，最终保留 69 个文件，见[初轮摘要](evidence/mobile-0.1.0/code-source-native-2026-10-24/summary.json)。最终文案修订包以已有 69 个文件、8 份草稿、18 个文字导入记录及 6 个包文件为保护基线，最终保留 70 个文件；本轮合成代码笔记保留，仅确认移除本轮导入回执。最终通过阶段核对所有基线文件、草稿、导入记录与包文件，测试脚本误选旧回执及其恢复见下文。原无障碍设置恢复后同步文件，只关闭本轮拥有的 emulator-5558，9012 预览保留。

原始 SHA-256 为 `26eaa0e091c6775e530a0ca591d45839805e87d3b3783be7345895ab55228755`；加入引号后的预期、已保存文件、导出文件与重启回读一致，为 `09c989c919b31d8d648c029438da0603a076fd3a5393b78a87cbb7dd696ed537`。安装 APK 和独立夹具 APK 的摘要也分别核对。原生输入使用行号、方向键和辅助符号动作，不将其表述为完整中文输入法或 TalkBack 触摸验收。

## 首次失败与复验

首轮专项把阅读 iframe 的 `innerText` 当成原始 CRLF 字节，断言失败；阅读 DOM 按浏览器规则将换行显示为 LF，已分别断言规范化显示与未修改的完整保存源文。首轮 Android 构建因分享入口的 MIME 为可空类型，而新默认名称函数只接收非空字符串，Kotlin 编译器拒绝构建；已把函数参数改为可空并显式保留未知类型返回空的行为，再重建两架构。首次编译日志保留在[构建失败记录](evidence/mobile-0.1.0/code-source-native-2026-10-24/build-initial-failure.txt)。未把失败构建标记成新安装包。

原生首次等待读取工具内的独立“原文阅读”节点，WebView UIA 实际将该静态区域映射为具名工具节点。随后以实际文件身份、原文截图和独立字节校验确认导入，再操作真实编辑按钮；不更改 UIA 文本或将节点映射差异报成导入失败。

最终审阅把错误提示中的“本批代码文件”改为实际支持格式列表，两架构重新构建，并重新完成全量浏览器与原生验收。最终原生复验时，测试无障碍服务返回空活动根；改用新鲜 UIAutomator 节点边界和物理点击，没有放宽服务的设备或包名检查。重启后的待核对入口默认指向最早的待核对项目，脚本误将既有合成 `Inbox.md` 回执存入，基线校验立即失败。核对副本与原回执源文摘要一致、且不在基线文件集合后，仅移除误生成副本，并精确恢复该合成回执；原始资料文件未覆盖。随后通过设置中的文件导入记录，按唯一 `MobileSource.js` 身份选择本轮项目。后续保护校验通过，失败与恢复见[记录](evidence/mobile-0.1.0/code-source-native-final-2026-10-24/harness-intake-restoration.json)。

## 当前开发安装包

开发签名、应用 ID `com.longyuye.mdreader.mobile.dev`、versionName `1.2.11`、versionCode `1002034`，最低 API29、目标 API36。两份构建记录如实保留 `8ed02d89548271146f6559cbf2e8ef359b303d34 + dirty`，不因文档提交而回写来源；Windows 使用已验证的原生库副本打包回退。

| 架构 | 安装包与构建记录 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| ARM64 | [手机调试包](../release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk) · [记录](evidence/mobile-0.1.0/code-source-native-final-2026-10-24/build-aarch64.json) | 126720929 | `5c92873fc50a7ea08561a460629ce17d6121a644ee73ec5a7afafe2002b86b66` |
| x86_64 | [模拟器调试包](../release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk) · [记录](evidence/mobile-0.1.0/code-source-native-final-2026-10-24/build-x86_64.json) | 127377390 | `8ff7e91b3b91abb9e24c3af51e69ec7a7ec50d394334963271364a8be86dfabe` |

本批实际运行 x86_64 专用模拟器；ARM64 完成构建与打包身份检查，尚未在实体手机运行本批流程。

下一步继续轻量代码的导航辅助和剩余语言审计，再按 M4 顺序推进 PDF。真机、真实云提供器、完整 TalkBack 触摸、iOS 和正式发布保持独立退出条件。
