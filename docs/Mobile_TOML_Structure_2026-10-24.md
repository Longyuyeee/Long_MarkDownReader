# 第二十九批：TOML 按层浏览与受限值修改

日期：2026-10-24。继续独立移动分支 `codex/mobile-0.1.0-foundation`，本批开发包序号 `1002033`。按既定顺序完成“找到字段 → 查看原值 → 修改 → 核对 → 应用草稿 → 主动保存”，继续先出图、再实现、同尺寸截图核对。

## 用户任务与公开竞品资料

| 资料 | 本轮核对的公开交互 | 本批取舍 |
| --- | --- | --- |
| [Json Genie 开发者的商店介绍](https://play.google.com/store/apps/details?id=com.tuyware.jsongenie&hl=en_US) | 树形浏览、路径与字段查找、类型值编辑和原文入口 | 按层显示，展示完整路径和原值；表数组实例分别定位，普通值用表单 |
| [Acode QuickTools](https://docs.acode.app/user-guide/quicktools) | 为触摸输入提供括号、引号、导航等辅助键，可按需收起 | 表单自动保护文字引号，布尔值用选项，复杂内容仍可直接进入源码 |
| [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html) | 文件身份、保存 / 另存、撤销重做、查找、指定行和只读模式 | 文件身份和保存状态保持可见，结构操作支持撤销，应用草稿与写入文件分开 |

上述为本轮查阅的开发者公开资料；未安装或测量竞品，也不据商店声明判断性能、隐私或无损 TOML 编辑能力。Json Genie 的 JSON 交互用作手机结构化文本任务参照，不推断其支持 TOML。

## 设计图和实际页面

使用内置 `image_gen` 的新图生成模式，先生成 390 × 844 比例的结构页参考图；保留米白、深绿和鼠尾草灰色。进入 server 后可见完整所在位置、筛选框、带类型的字段卡、上一层及源码入口。设计文件仅供评审，页面使用真实 Vue 控件与 Lucide 图标。

- [选定设计图](design/mobile-0.1.0/toml-structure-v1.png)
- [完整生成提示词](design/mobile-0.1.0/toml-structure-v1-prompt.txt)
- [设计 / 实际页面对照](design/mobile-0.1.0/toml-structure-v1-comparison.png) · [并排 HTML](design/mobile-0.1.0/toml-structure-v1-comparison.html)
- [实际浅色页](design/mobile-0.1.0/toml-structure-v1-implemented.png) · [实际深色页](design/mobile-0.1.0/toml-structure-v1-dark.png) · [真实值修改预览](design/mobile-0.1.0/toml-value-v1-preview.png)

核对实际 390 × 844 应用区域，截图只裁去浏览器开发预览提示条，不隐藏或改造产品控件。首轮字段卡约 70px 高，已收紧为 64px；同时调整三个模式入口宽度，补充实际的“已保存”状态。原图、实图及几何记录分别保留，生成图片的字形、图标和抗锯齿不作为像素级程序规范，不虚报相似率。

| 几何项目 | 参考图折算（约） | 实际页面 |
| --- | --- | --- |
| 顶部文档栏 / 模式栏高 | 62 / 45 px | 60 / 44 px |
| 字段卡左右边距 / 宽度 | 16 / 358 px | 16 / 358 px |
| 当前标题顶部 | 166 px | 166 px |
| 筛选框高度 | 43 px | 44 px |
| 首张字段卡顶部 / 高度 | 344 / 62 px | 347.4 / 64 px |
| 底部工具栏 | 约 62 px | 64 px |

完整边界见[最终几何记录](evidence/mobile-0.1.0/toml-structure-browser-1792849859674/alignment.json)。实际界面保留禁用按钮的明确状态、可访问名称和原有字号体系，不以生成图中的图标或文字替代功能控件。

## 实现范围与边界

- TOML 1.0 逻辑树覆盖表、隐式表、点号键、引号键、内联表、数组和表数组。使用解析树的已解析路径与 `Map` 建立身份，不转换成普通 JS 对象；文字键 `"a.b"` 与路径 `a.b`、文字 `"0"` 与数组下标分别处理。
- 每层 30 项，按字段名与展示值筛选。返回恢复筛选、页码和原字段焦点；完整路径为需要时加引号的名称，空名称也可辨认。
- 阅读状态可浏览定位；进入编辑后，单行文字、有符号 64 位整数、浮点数和布尔值可用表单核对。新数值支持受限十进制，保持完整输入字符串；已有进制、分隔符、正负零、特殊浮点和转义写法在未修改时原样保留。
- 日期 / 时间、跨行文字及容器保留原值和定位，说明原因并提供源码入口，不通过 Date 或浮点对象重建原文。
- 文字转义为 TOML 基本字符串，额外转义 JSON 默认保留的 DEL 字符。非法 Unicode、数值注入、越界整数和溢出浮点拒绝应用；重新分析候选原文，核对字段身份、种类、结构及其他可编辑值。
- 预览和取消不写入；应用仅替换所选源码范围，作为一个独立历史事务，再保护私有草稿。用户主动保存文件；原有冲突、恢复和独立副本工作流继续使用。
- 分析与候选核对使用可终止 Worker：256Ki UTF-16 单元、5000 个结构项、每个表单 16384 单元、1800ms 期限。超限、错误、取消和旧结果不发布部分可编辑树，源码继续可用。
- 一次建立位置索引，避免逐字段拆分全文前缀。范围使用 UTF-16 偏移，显示行列按 Unicode 字符计数，处理 BOM 和 CRLF。
- 阅读 / 源码 / 结构切换真实可用；极短视口收起模式栏时，文档菜单仍有结构入口。查找和阅读切换会离开结构页，编辑器实例及历史保留。

TOML 1.1 新语法检查、高级键 / 容器操作、任意跨层移动、日期和跨行文字表单不属于本批。检查通过也不等同于具体配置应用接受该内容。

## 本地验证入口

```powershell
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
npm run test:mobile
npm run build:mobile
node scripts/test-mobile-toml-structure-browser.mjs
node scripts/test-mobile-browser-regression.mjs
node --experimental-strip-types scripts/test-mobile-toml-structure-oracle.mjs <新的证据目录>
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory <新的打包证据目录>
. ./scripts/mobile-toml-structure-ui.ps1 -Serial emulator-5558
```

Python 交叉核对需要 3.11+，使用标准库 `tomllib`：十个候选值逐一检查类型和语义，其他表的精确整数与日期语义独立比较；Node 另断言源码前缀和后缀不变。这不是完整 TOML 一致性测试集。

| 检查 | 已通过结果与证据 |
| --- | --- |
| 逻辑回归 | 167 项，见[输出](evidence/mobile-0.1.0/toml-structure-native-2026-10-24/logic-tests.txt)，本批 13 项涵盖源码与事务边界 |
| 独立语义交叉检查 | 10 个候选值，见[Python 记录](evidence/mobile-0.1.0/toml-structure-native-2026-10-24/oracle.json) |
| 完整浏览器回归 | 28 脚本 / 202 组，见[摘要](evidence/mobile-0.1.0/browser-regression-1792849590355/summary.json) |
| TOML 结构页面 | 8 组，见[最终专项](evidence/mobile-0.1.0/toml-structure-browser-1792849859674/report.json)，含浅深色、360px / 200% 字号、极短视口与旧资料保护 |
| 打包保护 | 17 项，见[记录](evidence/mobile-0.1.0/toml-structure-native-2026-10-24/packaging-verification.json) |
| Android 原生 | 13 阶段，见[最终摘要](evidence/mobile-0.1.0/toml-structure-native-2026-10-24/summary.json)及[测试环境恢复](evidence/mobile-0.1.0/toml-structure-native-2026-10-24/lifecycle.json) |

原生使用新增只读 `toml-structure` 根与 `Share TOML structure` 合成入口，不覆盖前批夹具。验证器以固定源文件中唯一 `port = 8080` 替换成 `port = 8081` 定义预期，不调用产品解析器生成期望。实际操作通过产品页面完成，脚本只读核对原有资料、草稿、导入回执和独立副本。

API29 / x86_64 专用模拟器、约 2GB 内存、WebView124.0.6367.219 实际执行分享接收、存入、表单预览、修改、一次撤销 / 重做、保存、日期 / 跨行文字只读入口、系统 DocumentsUI 导出回读、终止进程后从继续阅读入口打开及结构复查。原有 67 个文件、8 份草稿、18 个文字导入记录和 6 个包文件逐阶段保持一致；最终有 68 个文件，保留本轮合成笔记，仅通过产品界面确认移除本轮导入回执。已恢复原无障碍设置并同步文件，仅关闭本轮拥有的 emulator-5558，9012 预览保持可用。

固定来源 SHA-256 为 `dace4b77df81201240908a1f0e0968e3ea383a04cbf43b13389f8c6d8cf0947b`；修改端口后的预期、保存文件、系统导出与重启回读一致，为 `7470e043f35da5a5d50cd33996332c492da36a1f1380ad2bc46ad838a2c4fd03`。安装的应用和夹具 APK 摘要也与本地文件分别核对。

## 首次失败与复验说明

最初专项命令未设置捆绑 Playwright 绝对路径，未启动产品任务；设置后重跑。添加极短视口入口时，首轮模板插入位置有误，第八组未找到菜单项；已移至文档操作菜单，并从构建开始复验。首次模拟器启动未设置专用 AVD 目录而未找到设备，随后核对配置，使用原有专用目录启动，不新建或重置设备。早期记录保留，验收以最终通过结果为准。

原生流程初次在导入预览底部、修改预览底部及 server 长列表等待屏外按钮的可见矩形，未匹配而停止；源码与草稿校验仍保持正确。后续使用现有面板滚动，或测试服务的具名 `ACTION_SHOW_ON_SCREEN` / 点击，再独立等待业务状态和核对字节；不把 UIA 屏外边界误判为产品数据失败。测试服务不放宽硬件、API、包名与按钮类型限制；模式按钮依旧使用新鲜 UIA 中的 ToggleButton 坐标。

重启后最初等待 UIA 的独立 `8081` 文本节点，实际预格式区映射为具名“ TOML 字段原值 ”节点；后续保存原生截图确认可见值，并通过独立文件摘要核对，不伪造 UIA 文本或宣称完整 TalkBack 触摸已验收。

## 当前开发安装包

两架构均为开发签名，应用 ID `com.longyuye.mdreader.mobile.dev`、versionName `1.2.11`、versionCode `1002033`，最低 API29、目标 API36。构建记录保留实际来源 `2fbda17f3cdf1751b17e26f7c85a3147ea74721b + dirty`，不因后续提交文档而回写来源。Windows 不允许符号链接时，沿用已验证的原生库副本打包回退。

| 架构 | 安装包与构建记录 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| ARM64 | [手机调试包](../release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk) · [记录](evidence/mobile-0.1.0/toml-structure-native-2026-10-24/build-aarch64.json) | 126697993 | `f893cab355f7bf9c2d2cf7ac9e3266ed7d89dac39601a3d26ddfc8a3e000bc3b` |
| x86_64 | [模拟器调试包](../release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk) · [记录](evidence/mobile-0.1.0/toml-structure-native-2026-10-24/build-x86_64.json) | 127354542 | `272eb648224e36df36596ef7d2569ce9ad07a3c2dd02139f747b1631e30bef85` |

本批实际运行 x86_64 专用 API29 模拟器；ARM64 已完成构建和打包检查，尚未在实体手机执行本批流程。

下一步按 M4 顺序审计轻量代码格式，再推进对应手机工作流；本批不标记全部桌面能力迁移完成。真机、真实提供器、完整 TalkBack 触摸、TOML 1.1、iOS 和正式发布仍独立验收。
