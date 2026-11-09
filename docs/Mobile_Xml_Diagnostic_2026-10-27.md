# 移动端：检查 XML 并回到源码修正

2026-10-27，阶段 3E2，起点 d81e6c3b6。继续在独立移动分支 codex/mobile-0.1.0-foundation 开发，遵循[每次一个用户任务](Development_User_Task_Plan_2026-09-22.md)与[移动交互重设计](design/mobile-interaction-v2/interaction-spec.md)。本轮完成“检查 → 看首个问题 → 回源码修正 → 重新检查”，并恢复上一轮未跑通的旧 XML 源码回归；桌面工作目录未修改。

[旧实页](evidence/mobile-xml-diagnostic-2026-10-27/before-invalid.png)把说明、问题定位入口和源码放在同一层。现在检查使用独立任务页，直接显示首个问题的原因、行列附近和有界源码，不增加没有内容的结果列表。DOCTYPE、其他版本／编码和检查预算不足使用中性状态，保留适当的源码退路；检查不写草稿，也不禁止保存未完成内容。

## 竞品依据与取舍

2026-10-27 查阅以下官方资料。本轮未安装竞品，公开介绍不等于其真实系统返回、键盘、诊断布局或保存可靠性的验收结果。

| 对象 | 官方资料支持的行为 | 本项目决定 |
| --- | --- | --- |
| [JSON & XML Tool，开发者商店介绍](https://play.google.com/store/apps/details?id=com.vibo.jsontool) | 层级浏览／编辑 XML，提供文字预览、保存和分享 | 结构、检查和源码之间能接续，保留真实原文作为修正入口。不引入格式转换或全文重排，不声称该竞品提供与我们相同的首问题诊断和返回契约。 |
| [QuickEdit，开发者商店介绍](https://play.google.com/store/apps/details?id=com.rhmsoft.edit) | 提供 XML 高亮、指定行定位、查找替换、撤销／重做与纵横滚动 | 诊断必须能回到准确源码现场，允许真实编辑、撤销与保存；位置和原因比常驻一般说明更重要。这里只引用开发者列出的能力，不将性能或数据保真当成实测结论。 |
| [Acode QuickTools](https://docs.acode.app/user-guide/quicktools) | 触摸工具可显示一行／两行、隐藏及滑动展开额外按键 | 按当前任务提供动作，检查页只留返回、帮助及检查／源码操作。完整返回、原编辑器保留和问号内容由本项目用户要求决定，不复制桌面工具面板。 |

现有 XML 引擎返回首个问题，因此直接进入问题页。公开资料不足以证明上述软件采用相同诊断细节；中性声明状态、无部分定位和原文保护来自本项目的引擎边界与用户要求。一般范围解释放入问号，只有具体失败、受限原因和当前问题留在页面。

## 冻结设计与交互契约

[六屏设计](design/mobile-xml-diagnostic-v1/index.html)覆盖语法问题、通过、检查中、超范围、失败与声明核对。[冻结回执](evidence/mobile-xml-diagnostic-2026-10-27/design-freeze.json)为 2026-10-27T09:14:45.313Z，早于运行时代码修改；源 SHA-256 为 080af1846c863c1739acee4ad7691a7ca594e5d8e19fc0efa70c01a2974aefd4。六屏逐张审阅后实施，后续修复未改冻结源或冻结图。

- 从“检查 XML”进入完整任务页；宿主文稿顶栏、查找、收件提示和编辑底栏按既有任务契约隐藏。当前引擎只返回首个问题，修正后重新检查，不假装已经列出所有问题。
- 问题显示文件、中文状态、原始或精简后的具体原因、附近行列与最多三行源码。相邻上下文在文件开头／末尾尽量补齐，短文件不制造新行；长行最多 160 个 Unicode 码点并围绕真实列截取，保护代理对。
- 语法通过只在检查完整且有效时显示。DOCTYPE／自定义实体、其他版本与其他编码使用“暂不检查”，源码标记保持中性色；它们可以明确前往声明源码，不被冒充为语法错误。字符、深度和节点超预算不发布部分定位。
- 检查不验证 DTD、Schema 或配置含义，不读取外部资源。检查范围、首问题和位置附近的限制收进问号；通过状态不常驻开发说明。
- 普通返回只关闭当前检查页，恢复“检查 XML”入口、原阅读／编辑状态及源码现场；帮助先消费一层返回，底层文档查找之后才关闭。明确前往问题或声明源码才进入编辑并定位原始偏移。
- 源码编辑器保持挂载，保留选区、滚动和查找词。结构组件也保持挂载，检查前未确认的属性输入仍能继续；切换工具不丢弃准备内容。
- 停止／返回终止工作线程，超时和启动失败没有旧定位或应用入口，允许显式重试。结果绑定检查时的准确原文和文稿身份；源码修订清除旧结果，换文件拒绝迟到消息。
- 检查、停止、重试、帮助和普通返回不改文件或受保护草稿；已有草稿记录逐项保持。实际修正可撤销／重做，只有显式保存才更新文件，非法但未完成的 XML 仍可保存。
- 源码片段作为普通文字显示，HTML 不执行或请求资源。大字／短屏正文和长源码行能够真实滚动，底部动作可到达，声明与语法问题在深色中仍可区分。

新增 XmlDiagnostic.vue，XmlTools.vue 负责两项任务的打开、关闭和状态上报；MobileApp 沿用上一轮的 XML 宿主／返回集成，没有再次修改。XML 解析、词法偏移、命名空间、DOCTYPE／字符／版本／编码边界、预算、工作线程、属性修改、编辑器事务及文稿保存会话均未改动。

共用 sourceDiagnostic.ts 增加可选的补齐窗口参数，默认关闭；仅 XML 检查显式开启。JSON／YAML 继续使用原相邻行窗口，已有 JSON 包装接口和行为不变。package.json 仅新增专项命令，依赖、版本和原生包未改。

## 实页核对与验证

[六屏并排对照与八张适配实页](evidence/mobile-xml-diagnostic-2026-10-27/comparison.html)共 14 张诊断原图均已逐张核对；最终 Vite 环境生成的 14 图与此前已审阅的修复后原图逐字节相同。标准 390×872 视口仅去掉真实 28px 桥接提示条，得到 390×844。大字、深色、短屏、行内滚动以及旧源码专项图保留真实尺寸与位置，没有移位、重绘或隐藏内容来贴图。

[量测结果](evidence/mobile-xml-diagnostic-2026-10-27/comparison.json)：200 项坐标最大偏差 0px，192 项字体、字重、行高、字距和颜色属性一致。问号和结果图标均为冻结的 22×22，读取路径一致。保留真实浏览器焦点／按下反馈，字体栅格化也可能不同，不声明整屏逐像素一致。

实际审阅推动一次修复：[首轮八组通过报告](evidence/mobile-xml-diagnostic-2026-10-27/before-context-window-report.json)的[声明原图](evidence/mobile-xml-diagnostic-2026-10-27/before-context-window-declaration.png)仍只有两行上下文，预览和外卡片均比冻结稿矮 33px。XML 在边界补齐最多三行后对齐原稿，补充四项首末行／BOM／混合换行／Unicode／偏移／预算检查与真实声明页断言。原报告和图保留，没有用自动通过代替看图，也没有回改设计。

本地预览还有两次环境中断，见[环境记录](evidence/mobile-xml-diagnostic-2026-10-27/preview-environment.json)：预览停止导致页面连接失败，四组均未进入 App；随后临时 Python 服务将 PDF 模块以 text/plain 返回，帮助回归停在 PDF 加载。切换到仅监听本机的 Vite 预览，核对模块类型为 text/javascript、HTML 与最终构建逐字节相同后，重新跑通四组浏览器专项。环境修复没有修改应用代码，原失败报告和图均保留。

最终验证范围：

- npm run build:mobile：最终类型检查与构建通过，保留既有包体积提示。资源为 mobile-C5X69U8f.js、mobile-DVRFVixr.css；XML 工作线程仍为 xml.worker-BPhXUUYV.js、xmlStructure.worker-HWZhE3wx.js。最终构建后没有修改运行时代码。
- node --test scripts/test-mobile-source-diagnostic.mjs scripts/test-mobile-json-diagnostic.mjs scripts/test-mobile-xml-source.mjs scripts/test-mobile-xml-structure.mjs：24 项通过（新增边界窗口 4、既有 JSON 摘录 3、XML 语法 8、XML 结构 9）。
- [XML 诊断实页](evidence/mobile-xml-diagnostic-2026-10-27/browser-report.json)：8 组通过，涵盖整页与帮助返回、准确源码修正／重查／撤销／保存、停止／返回／失败／超时／重试、中性声明与各预算、BOM／混合换行／emoji／长行／HTML 字面内容、同一编辑器和隐藏查找、未确认属性输入、现有草稿、非法内容保存、源文及文稿身份变化、真实滚动与适配。独立浏览器 XML 解析器核对命名空间、字符引用等非法样本。
- 11 个命名状态的 axe A/AA 检查无违规或待复核项，没有页面异常或外部请求；不是完整无障碍认证或 TalkBack 验收。320px、200% 文字、深色、短屏和长源码行包含可视边界及真实滚动断言。
- [旧 XML 源码回归](evidence/mobile-xml-diagnostic-2026-10-27/xml-source-report.json)：8 组全部通过。适配“添加资料”入口、独立诊断及当前返回；完整保留导入／阅读、实际修正／撤销／保存、导出快照／重载／草稿恢复、工作线程、保存冲突／另存副本、非法 XML、声明／无障碍、超大内容／新建／搜索等覆盖。上一轮旧入口失败已解决，未通过删除任务来取得通过。
- 同一最终构建的 [XML 属性回归](evidence/mobile-xml-diagnostic-2026-10-27/xml-value-report.json)9 组和[帮助回归](evidence/mobile-xml-diagnostic-2026-10-27/help-report.json)14 组通过。没有重跑全部历史专项。

本地复查先运行 npm run build:mobile，再用 node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 9012 --strictPort 提供 dist。浏览器专项使用本机 Playwright 模块路径环境变量 LONGEDIT_PLAYWRIGHT_MODULE；不应使用把 .mjs 返回为纯文本的服务替代预览。

[构建与源码身份](evidence/mobile-xml-diagnostic-2026-10-27/build-provenance.json)记录源码／LF 摘要、测试与产物、34 项原始证据复制映射及修复记录；[摘要清单](evidence/mobile-xml-diagnostic-2026-10-27/manifest.json)核对冻结与提交字节。

下一步处理 TOML 的结构、字段详情、修改与核对，再收整 TOML 诊断；阶段 3 整体仍未完成。Android 物理返回、真实输入法和选择控件、TalkBack、后台及进程恢复仍待原生验收，浏览器桥接不代替实机。本轮仅本地提交，没有生成、安装、提升 APK 或发布。
