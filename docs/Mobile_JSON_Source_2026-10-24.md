# 第二十批：手机 JSON 源码工作闭环

继续使用 `codex/mobile-0.1.0-foundation`，桌面功能基线仍为 v1.2.11。本批从主计划 M4 的结构化文本开始接入 JSON 源码：新建 / 导入 / 打开、阅读、检查、编辑、保存、搜索和导出。它是 JSON 迁移的第一部分，树形结构、字段级修改、Schema 和其他结构化格式继续分批实施。

## 用户任务和竞品调研

用户拿到一份配置或数据文件，首先需要看清内容，找到有问题的地方，改完明确保存，出错时保留可取回的源文。手机页面沿用单文稿工作区，增加「检查 JSON」；编辑时提供「整理缩进」，先预览、主动应用，仍需单独保存。Markdown 的标题、加粗、列表、图片和 TextPack 操作不出现在 JSON 工作区。

2026-10-24 阅读官方资料，没有安装竞品，也没有推断其内部存储或数值保留实现：

| 来源 | 观察 | 本项目的设计取舍 |
| --- | --- | --- |
| [Acode 设置帮助](https://docs.acode.app/user-guide/settings)、[Formatter API](https://docs.acode.app/docs/global-apis/acode) | 提供原始 settings.json 编辑和按语言选择格式化工具；API 将格式化作为编辑器操作 | 按文件类型显示工具；整理排版是用户主动执行的独立编辑动作，可取消和撤销。没有借此声称 Acode 对重复键或大整数采用本项目的保留方式 |
| [QuickEdit 概览](https://rhmsoft.com/qedit/intro.html)、[工具栏](https://rhmsoft.com/qedit/toolbar.html)、[设置](https://rhmsoft.com/qedit/settings.html) | 支持 JSON 语法、文件 / 编辑 / 更多菜单，以及撤销重做、换行与编码设置 | 核心操作保持可见，其他动作放文档菜单；源码有行号与语法颜色，复用现有草稿、保存回执和来源冲突流程。没有采用竞品宣传的设备性能数字作为本项目预算 |

这些材料支持交互方向；「保留所有数值词法、重复键、字段顺序和转义」是本项目根据文件任务作出的实现选择，并由实际字节测试验证。

## 实现

- `.json` 接入内置资料库、授权文件夹的读写、文件导入、系统 VIEW / SEND、最近打开、整库源文搜索、副本保存与恢复副本。创建名称以 `.json` 结尾时，从受保护的空对象开始。
- 系统登记 `application/json`，保留已有文本、ZIP 与 octet-stream 边界。单文件选择器接受 JSON；分享 JSON 文字时使用独立 `.json` 名称。多 URI、授权、UTF-8 和实际字节限制沿用既有核对。
- 阅读按文字呈现 JSON 源码，字符串中的 HTML 或地址不会被当作页面执行或自动访问。编辑使用现有 CodeMirror 实例、JSON 语言、行号与主题颜色；切换阅读和编辑保留历史。
- `@lezer/json` 固定为已有的 `1.0.3`，直接用于独立 Worker；没有升级其他依赖。Worker 约 54.56 kB，不将整套编辑视图依赖带入检查线程。
- 语法检查显示附近行列，并可进入源码定位。检查只涉及 JSON 语法，未完成的源文仍可显式保存；没有 Schema、业务字段或远程 `$ref` 验证。
- 排版按源文词法整理空白，不使用 `JSON.stringify(JSON.parse(source))` 生成候选，因此大整数、指数的原始写法、负零、重复键、顺序和字符串转义均保留。UTF-8 BOM 保留，使用首个换行风格，结尾空白保留；排版会统一内部混合换行，撤销恢复原始混合换行。
- 预览没有修改文稿。应用时再次核对完整源文和文档身份，经单次历史事务进入草稿，再保护草稿；文件只有显式保存才写回。应用后可一次撤销或重做。内容变化、切换文档、停止或卸载都会终止检查，旧结果不能作用到新内容。
- 副本、导入、导出与恢复名称保留 `.json`，原生创建 / 导出 MIME 使用 `application/json`。TextBundle V2 的笔记与附件包仍保持 Markdown / TXT 范围。

## 移动预算

文稿读取 / 保存 / 导入 / 导出仍最多 4 MiB UTF-8。JSON 检查和排版单独限制为 262,144 个 UTF-16 单元、40,000 个分析节点、64 层结构，排版候选最多 1 MiB UTF-8；Worker 等待超过 1,800 ms 即终止。超出时明确说明本次未检查或未整理，完整源码仍可阅读、查找、编辑和保存。语法颜色与行号仅在当前编辑内容不超过检查长度预算时启用。

这些是当前产品限制，不是 Android 真机性能承诺。200% 字号、深色和短横屏使用现有布局策略，JSON 工具区域可独立滚动。

## 可复现验证

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory E:/Android/BuildCache/json-source-packaging-20261024
```

浏览器回归期间不重建 dist。94 项逻辑、132 组浏览器用户任务（19 个脚本）和 17 项打包检查通过。最终[汇总索引](evidence/mobile-0.1.0/browser-regression-json-source-final-20261024/summary.json)如实组合最终产品代码上通过的前 18 脚本与修正夹具后单独复核的 JSON 11 组，未将组合结果描述为一次全部重跑。新增任务覆盖实际文件输入、显式核对、源码阅读、排版预览 / 取消 / 应用 / 撤销、无效语法定位、保留未完成内容、JSON 下载、过期结果、Worker 启动失败 / 超时 / 取消 / 重试、来源冲突与 `.json` 副本、预算、200% 深色无障碍、新建、整库查找和移除后的结果定位。浏览器故障是明确的测试注入；外部地址未产生请求。最终 JSON 报告：[json-source-browser-1792827738378](evidence/mobile-0.1.0/json-source-browser-1792827738378/report.json)。

独立 Android 测试 APK 的 `JsonFixtureActivity` 与 `json-source / json-invalid` 提供确定的 UTF-8 合成文件，正常来源包含 BOM、混合换行、中文 / emoji、重复键、大整数和指数原文。`tests/fixtures/mobile-json-source-expected.json` 是人工写出的完整排版预期，验收只补回既定 BOM / CRLF；没有调用产品排版函数来生成原生验收预期。原始夹具的 Git 属性禁止换行转换。

`mobile-json-source-ui.ps1` 只操作专用 API29 / emulator-5558，使用实际界面状态；`verify-mobile-json-source-native.mjs` 按 before / received / reviewed / imported / formatted / undone / redone / saved / exported / reopened / removed / final 核对真实私有文件。所有原有正文、草稿的内容 / 来源签名 / 代次、文字导入记录和完整包文件保持原样。测试不清空应用数据。

## 原生验收与安装包

原生[任务索引](evidence/mobile-0.1.0/json-source-native-2026-10-24/summary.json)保留所有阶段。设备为专用 LongEdit_Compat_API29 / emulator-5558、API29 / WebView124.0.6367.219；实际 MemTotal 2,040,592 kB，不作为真机预算承诺。没有将本次运行写成断网验收。

| 原生任务 | 实际结果 |
| --- | --- |
| 系统 JSON 文件分享 | 实际分享面板选择 Long编辑；只读核对后主动存入，BOM、混合换行、所有数值和重复键的原始字节一致；`normal-received / reviewed / imported` |
| 检查与排版 | 实际 Worker 检查通过；先预览，再应用到草稿。原文件保持原文，候选与人工预期完整匹配；`normal-format-preview / formatted` |
| 撤销 / 重做 / 保存 | 撤销恢复原始字节，重做恢复完整候选，来源签名和草稿代次正确；显式保存后候选写入文件并清除对应草稿；`normal-undone / redone / saved` |
| 系统 JSON 导出 | ACTION_CREATE_DOCUMENT 显示 `.json` 文件名，实际保存至 Downloads 并回读；完整 SHA-256 为 `7d33cd6a15e5958b1402b39922409526b7acfd4b145b7661774b920b2a97e279`，与已保存排版一致；`normal-export-picker / exported` |
| 导入记录接续 | 再次打开已导入笔记读取最新排版，移除记录后文件保留；`normal-reopened / removed` |
| 未完成 JSON | UTF-8 内容完整存入；显示语法问题并进入源码定位，正文没有被自动修正；移除回执后原文仍保留；`bad-*` |
| VIEW 与 JSON 文字 | `application/json` 直接打开和分享文字均独立暂存、核对、按用户确认清理，未自动发布新笔记；`open-*`、`text-*` |
| 原有数据 | 最初 55 文件、8 草稿、18 条文字导入记录和 3 份包（6 个原包 / 元数据文件）均保持原样；最终 57 文件，仅增加正常和未完成 JSON 两份独立测试副本；`baseline-final.json` |

原生最后发现并修复了长核对页移除后的定位问题：现在完成提示得到焦点并回到可见区域，关闭入口也可见。`text-removal-feedback.xml / .png` 保存最终 APK 的实际结果。重建前的原生排版、保存与导出对应 `initial-x86-build-record.json`；该修复没有改动 JSON 处理或存储代码。最终覆盖安装后又验证 JSON 文字接收、移除反馈、已有文件检查及无需再排版状态、全部数据和安装包身份；没有用新摘要重标早期结果。

最终开发包为 `1.2.11 / 1002024`，应用 ID `com.longyuye.mdreader.mobile.dev`，minSdk29 / targetSdk36，Android debug key：

| 架构 | 字节数 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 127050274 | `5bb0e6cf8d20d40da69df230e4721f072cbecc16a8d44bba8a61afa77f399426` |
| arm64-v8a | 126393077 | `771369dcbc58c7d11b3250c3343adac2513eb903a18fce9f0507942c7a96c618` |

来源如实记录为 `8d4afc888 + dirty`；实际安装 APK 与最终 x86_64 构建副本摘要相同，见 [installed-apk.json](evidence/mobile-0.1.0/json-source-native-2026-10-24/installed-apk.json)。ARM64 已构建并核对 ABI / ELF / 库身份 / 版本 / 签名，尚未真机运行。原无障碍设置 `null / 0` 已恢复，专用模拟器已同步停止，9012 预览返回 200，见 [cleanup.json](evidence/mobile-0.1.0/json-source-native-2026-10-24/cleanup.json)。其他模拟器未操作。

## 本次修正和未完成范围

首轮编译发现 `.at()` 超出本项目 TypeScript 库目标，已改为索引；复杂度测试首个样本没有真正达到节点上限，扩大后正确触发预算。首次浏览器撤销检查在异步清理草稿完成前读取，现等待持久记录消失；保留[实际失败报告](evidence/mobile-0.1.0/json-source-browser-1792825287661/report.json)，没有将其当作正文损坏。

移除反馈回归的首个夹具放入 18 条 ready 待导入记录，触发既有的 12 份待导入上限，后续选择因此被正确拒绝；这不是反馈修复失效。改用 18 条失败历史记录复现长列表，JSON 11 组单独复核通过。原始[完整运行记录](evidence/mobile-0.1.0/browser-regression-1792827419071/summary.json)保留失败，该运行的前 18 脚本已通过；产品容量限制没有放宽。

构建盘一度耗尽，中断了测试日志。整目录缓存迁移被自动审批拦截，未执行；随后观察到可用空间恢复，继续沿用原缓存，没有删除项目资料。另一次组合编辑 / 构建命令被自动审批拦截，改用可审阅的文件补丁与独立构建后继续完成。不能从空间变化推断其他任务做了何种清理。

API29 在键盘收缩后的一次 UIAutomator 状态给出了倒置的重做按钮矩形，截图中按钮实际可见；辅助脚本确认键盘正在显示后先收起，再获取新的可用状态，完成重做和字节核对。诊断截图与 XML 保留，不据此宣称完成所有无障碍触摸验收。

JSON 树形浏览、字段级操作、JSONC / JSON5、Schema、YAML / XML / TOML 等继续按主计划迁移。真机、真实云提供器、完整 TalkBack 触摸、iOS 主机和 release 签名分发仍有独立退出条件；本批是开发包。
