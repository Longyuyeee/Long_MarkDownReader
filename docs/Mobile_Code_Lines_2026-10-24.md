# 第三十一批：手机源码导航与行操作

日期：2026-10-24。接续第三十批，在 `codex/mobile-0.1.0-foundation` 完成一次“找到代码 → 选中几行 → 调整缩进 → 核对 → 保存 / 导出”的触摸操作闭环。Android 开发包序号 `1002035`。

## 从手机使用任务设计

手机修改几行代码时，拖动光标、长按选区和切换键盘符号会反复打断操作。本批把既有符号与新增行操作分成两个可见分类；保留原来的行定位、视觉折行、保存、草稿状态及阅读切换。两种工具共用一处底部区域，阅读时收起，返回编辑时保留当前分类；更换文件后恢复符号分类。

| 公开一手资料 | 核对到的行为 | 本批选择 |
| --- | --- | --- |
| [Acode QuickTools](https://docs.acode.app/user-guide/quicktools) | 为触摸提供导航键、符号、工具分组与横向滑动 | 光标导航可以点按；普通字号直接显示七个行工具，放大字号允许区域内横向滚动 |
| [QuickEdit Selection](https://rhmsoft.com/qedit/selection.html) | 支持拖动选区，并为所选行提供增加 / 减少缩进 | 保留原生选文，另提供选行和明确触发的缩进操作；选区不会因点工具按钮而丢失 |
| [QuickEdit Toolbar](https://rhmsoft.com/qedit/toolbar.html) | 编辑菜单区分撤销、选区、缩进；更多菜单包含行定位与折行 | 保存入口独立；行定位、折行只导航，缩进才生成可撤销草稿 |

仅核对开发者公开文档，没有安装、计时或推断竞品隐私与无损保存情况。保持轻量源码定位，不增加终端、运行器、自动格式化、补全或语法诊断。

## 本批交互和边界

- 左移 / 右移使用编辑内核的字符移动，组合字素不从中间拆开；已有选区先收拢至对应端点。行首 / 行尾指向物理源文行，视觉折行不改变行号或原文。
- “选行”选择当前涉及的物理行内容，保留正向 / 反向方向；最后一行的换行符不进入选区，初始 BOM 也不作为所选文字。选区恰好止于下一行行首时，不把那一行纳入缩进。
- 增加缩进在每行 BOM 后、已有缩进前插入两个 ASCII 空格；减少缩进移除一个首部 Tab 或最多两个 ASCII 空格。其他空白与非缩进行不改动。包括选中的空行；不自动推断语言缩进风格。
- 单次最多处理 1000 个物理行；超限先说明并拒绝，不生成部分修改。缩进是独立历史事务，可一次撤销 / 重做；没有可移除的缩进时不创建历史。
- 仍沿用原文换行映射，保留 BOM、CRLF、孤立 CR、LF、原缩进及 Unicode。导航与分类切换不创建正文草稿，也不保存文件。保存、导出快照、冲突副本沿用已有文稿保护流程。
- 行操作与符号操作在输入法组合已产生文字变化时拒绝执行，提示先完成当前输入；Android 仅将光标放到单词上、尚未改字的组合状态仍可导航。浏览器模拟组合输入并实际输入一个字符，核对辅助操作不更改待提交草稿，不替代厂商真机中文输入法验收。
- 状态显示当前行及已选行数；按钮朗读名称包含可见文字。浅深色、200% 字号及极短视口分别检查。180px 高度时收起辅助区，至少保留 40px 正文与可达的文档菜单。

## 出图与实际页面对齐

使用内置 `image_gen` 新图生成模式，按既有米白 / 深绿样式生成单页参考图，并保存完整提示词。组件由 Vue、CodeMirror、Lucide 和现有颜色变量实现，参考图不作为页面背景。

- [设计图](design/mobile-0.1.0/code-lines-v1.png) · [完整提示词](design/mobile-0.1.0/code-lines-v1-prompt.txt)
- [设计与实际页面对照](design/mobile-0.1.0/code-lines-v1-comparison.png) · [并排 HTML](design/mobile-0.1.0/code-lines-v1-comparison.html)
- [实际浅色页](design/mobile-0.1.0/code-lines-v1-implemented.png) · [实际深色页](design/mobile-0.1.0/code-lines-v1-dark.png)

以 390 × 844 应用区域核对。截图只裁去浏览器预览提示条；在真实新建的 `hello.js` 中输入源码，再实际选中第三 / 四行并增加缩进，没有注入文稿状态来制作外形。保留真实选区范围、平台选择颜色和重做禁用状态，不把生成图中的下拉箭头伪装成尚未实现的语言选择器。

| 项目 | 参考图折算（约） | 实际页面 |
| --- | --- | --- |
| 文档栏 / 模式栏高度 | 60 / 47 px | 60 / 44 px |
| 源码卡左边距 / 宽度 | 12 / 366 px | 16 / 358 px |
| 源码卡顶部 / 底部 | 176 / 619 px | 174 / 613 px |
| 触摸工具区顶部 | 653 px | 653 px |
| 底栏顶部 / 高度 | 784 / 59 px | 780 / 64 px |

实际源文保持准确，不按生成图改写引号、行尾或选区来提高相似率。最终几何与页面专项证据在验收表中关联。

## 剩余语言审计与顺序

本批不增加格式入口；第三十批五类八个扩展名继续适用。核对 `shared/file-formats.json` 后，剩余轻量源码扩展名有 24 个，需要逐组核对文件身份、MIME、语法模式与混合源文保存，不能因为依赖中存在一个高亮模块就标记迁移完成。

| 后续组 | 尚未接入普通文件入口的扩展名 | 需核对 |
| --- | --- | --- |
| JavaScript / TypeScript 变体 | `.jsx .tsx .mts .cts` | 嵌入语法、精确扩展名与无名称 MIME 回退 |
| Rust / Go / JVM | `.rs .go .java .kt .kts` | 各语言高亮与默认名称、平台分享身份 |
| C / C++ / C# | `.c .h .cc .cpp .cxx .hpp .cs` | 共用头文件扩展名含义、模式选择和源码导出 |
| Shell / PowerShell / SQL | `.sh .bash .zsh .ps1 .sql` | 原文编辑及导出，不能以编辑入口隐式执行 |
| Web 嵌入与样式变体 | `.scss .less .vue` | 嵌入源文、外部引用不执行与高亮降级 |

下一批继续这些语言的文件闭环，再进入既定 M4 PDF 阅读 / 搜索 / 批注阶段。真实设备、真实云提供器、完整 TalkBack 触摸、iOS 和正式发布仍有各自验收条件。

## 验证入口

```powershell
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
npm run test:mobile
npm run build:mobile
node scripts/test-mobile-code-lines-browser.mjs
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory <新的证据目录>
. ./scripts/mobile-code-lines-ui.ps1 -Serial emulator-5558
```

9012 使用构建产物预览，修改页面后须先重建。原生复用独立只读 JavaScript 夹具，固定期望仅在 `const name = ;` 前增加两个空格；该未完成表达式继续原样保留，证明没有隐式修复或执行源码。校验器独立读取真实文件、草稿、系统导出及基线资料，不通过编辑器产生期望。

| 验证 | 最终结果与证据 |
| --- | --- |
| 核心逻辑 | 185 项，通过；新增行操作 10 项，见[输出](evidence/mobile-0.1.0/code-lines-native-final-2026-10-24/logic-tests.txt) |
| 完整浏览器 | 30 脚本 / 221 组，通过，见[摘要](evidence/mobile-0.1.0/browser-regression-1792855932018/summary.json) |
| 新页面专项 | 10 组，通过，见[报告](evidence/mobile-0.1.0/code-lines-browser-1792856280859/report.json)及[几何记录](evidence/mobile-0.1.0/code-lines-browser-1792856280859/alignment.json) |
| 打包保护 | 17 项，通过，见[记录](evidence/mobile-0.1.0/code-lines-native-final-2026-10-24/packaging-verification.json) |
| Android 原生 | 13 个最终通过阶段，见[摘要](evidence/mobile-0.1.0/code-lines-native-final-2026-10-24/summary.json)及[环境恢复](evidence/mobile-0.1.0/code-lines-native-final-2026-10-24/lifecycle.json) |

最终原生运行 API29 / x86_64、约 2GB 内存及 WebView124 的专用模拟器。重新分享原始夹具，按唯一回执身份独立存入；明确核对第二行后通过真实按钮完成行首尾、左右光标、选行、缩进、撤销 / 重做和显式保存，再核对物理返回关闭行号表单、折行、阅读 / 编辑切换、系统 DocumentsUI 导出回读以及结束进程后继续阅读。原有 71 个文件、8 份草稿、18 个文字导入记录与 6 个包文件在最终通过阶段保持一致；保留新增合成源码为 72 个文件，仅移除本轮回执。基线中的一个源码笔记来自首个未通过的原生候选包，原文仍保留。

原始夹具 SHA-256 为 `26eaa0e091c6775e530a0ca591d45839805e87d3b3783be7345895ab55228755`；第二行增加两空格后的固定期望、草稿、保存、导出和重启回读均核对为 `6f7215f59798d44f9ccb2ff0d485344fb9a44ee03e924e956fd82792c12801d4`。安装应用 APK 与原生夹具 APK 也分别核对摘要。多数原生 Button 使用受限测试服务的具名 ACTION_CLICK，折行与系统保存使用实际点击；这验证真实页面流程，不表述为完整手工触摸或 TalkBack 触摸验收。环境恢复后只关闭本轮拥有的 emulator-5558；9012 预览保留。


## 首次检查失败与修正

首轮字符移动断言少移动了一次，将引号前的位置误当成组合字符前的位置；改用三次真实触摸左移，再以分号插入验证实际位置。页面几何首次使用了样式变更前的构建产物；随后重新构建。另一轮导入成功提示仍占据顶部，几何条件发现正文高度不足；外形任务改为真实新建同名参考文稿，不隐去产品提示或改截图。

首个 Android 候选包将防护扩大到“组合已开始”，但真实模拟器显示，光标落在单词上、未改字也会触发该状态，导致全部行工具被误拦。候选包没有完成缩进验收；原文未改变，已通过页面移除该轮测试回执并保留原文笔记，完整基线核对见[未通过候选包记录](evidence/mobile-0.1.0/code-lines-native-2026-10-24/preflight.json)。最终改用编辑内核的“组合已产生文字变化”状态，只保护真实待提交的组合文本；浏览器组合任务也改为实际输入字符后核对原草稿，避免用空组合事件代表真实输入。无障碍规则发现四个按钮的名称未包含完整可见文字，已统一左移、右移、选行和退缩进的名称并重验。全量回归初轮还与页面重建及专项任务重叠，导致构建切换、专项报告被归入另一脚本结果的问题；回归收集器已按当前脚本证据前缀过滤，最终在两架构构建完成后固定产物、串行执行浏览器任务。最终包原生首轮坐标操作还遇到 WebView 返回过期控件矩形，点击误落入源码区，导致后续缩进作用于末尾空行；字节断言拦截后，在保存前通过原生撤销恢复。随后改用受专用模拟器 / API / 包名约束的具名 Button 动作，不直接操作编辑器状态。第二次行号框保留原先的 2，测试追加为 22，被真实行号校验拒绝；脚本现通过按键清空、输入并核对目标，确认表单关闭及当前行后才继续。上述两次草稿观察和首轮坐标截图保留在最终原生目录；期望仍固定为第二行两空格，没有按错误结果改写断言。失败报告继续保留，不能将其中的中间截图当作最终页面。

## 当前开发安装包

开发签名、应用 ID `com.longyuye.mdreader.mobile.dev`、versionName `1.2.11`、versionCode `1002035`，最低 API29、目标 API36。两架构构建来源如实保留 `a24feb66ba3baaa23de9c3c877ce9a2674a0aaf7 + dirty`；Windows 使用已核对的原生库副本打包回退，未将其写成正式分发包。

| 架构 | 调试 APK / 记录 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| ARM64 | [安装包](../release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk) · [记录](evidence/mobile-0.1.0/code-lines-native-final-2026-10-24/build-aarch64.json) | 126722765 | `6618c7d00fc63b6e4ae545bd966e44099458bf76ecc76316bddd3a5f48014219` |
| x86_64 | [安装包](../release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk) · [记录](evidence/mobile-0.1.0/code-lines-native-final-2026-10-24/build-x86_64.json) | 127379250 | `d018ae635a7156785d2dd976640f2ae926e52149c65793135ecdba001a22e8f5` |

本批实际运行 API29 / x86_64 模拟器。ARM64 完成构建与身份检查，尚未在实体手机运行；模拟器不替代真机、厂商输入法与完整 TalkBack 触摸验收。
