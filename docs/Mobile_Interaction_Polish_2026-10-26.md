# 手机端交互复核与说明文字清理

本轮已修改正式移动端 Vue 源码，同时更新独立的 55 页设计原型。资料首页改用「＋添加」集中入口；导入、导出、搜索、源码、结构、PDF、附件和恢复页的常驻教程改为上下文问号。错误、未保存输入、权限限制和删除后果仍在发生操作的位置显示。

分支：`codex/mobile-0.1.0-foundation`。本轮起点：`ffdfad6f6`。所有正式实页截图来自 `build:mobile` 的浏览器预览与隔离示例数据，不接触原资料。

## 竞品复核与本项目的对应处理

本轮依据成熟软件的官方移动端操作文档及其中的界面示意核对；未声称安装、实测竞品的当前 Android 版本，也未据文档推测其内部保存机制。

| 用户任务 | 官方可核对的操作模式 | 本项目实际问题与本轮处理 | 仍待迁移的部分 |
| --- | --- | --- | --- |
| 找到要做的事 | Notion 移动端使用可见的 `+`、`•••`，不依靠悬停；桌面多列折为单列。 | 首页原有三条永久导入操作挤占列表，已集中到「＋添加」短菜单；问号直接点击，不复制桌面的 hover 行为。 | 原型的三项根导航尚未全部迁入正式 App；正式 App 仍保留「最近」根入口。 |
| 查看说明 | 触屏入口需要实际可点按；不能要求用户猜测鼠标悬停。 | 同桌面沿用 CircleHelp 图形，触控区域 48×48px；内容进入可滚动帮助弹窗。关闭、遮罩、Esc、系统返回入口都只消耗帮助这一层。 | TalkBack、实际 IME 与预测性返回需要原生验证。 |
| 专注阅读与编辑 | Obsidian 的编辑工具栏随编辑场景出现；移动端通过菜单提供其他动作。 | 阅读正文不再显示开发路线、格式宣讲和保存口号；结构工具的通用教程收到问号，真实结构路径、字段值与修改预览保留。 | 正式 PDF 阅读页的缩放、翻页等工具仍偏密集；应继续按原型合并到阅读设置。 |
| 调整 PDF 阅读方式 | Acrobat 通过更多菜单进入查看设置，选择连续、单页、阅读方式及夜间模式。 | 保留现有阅读方式面板，删除每次打开都出现的模式解释和底栏手势教程；模式差异及操作说明可在阅读问号中查阅。 | 本轮没有实现 Acrobat 的 Liquid Mode、扫描识别或新的全文重排能力。 |
| 返回上一步 | Android 官方导航原则要求返回栈保留任务上下文，临时目的地覆盖原目的地。 | 修复文件夹 Back 跳过父目录的问题；修复书签删除确认 Back 连同导航关闭的问题；帮助关闭恢复到原按钮，表单输入保留。 | 全局页面栈、外部打开历史、进程重建仍按原迁移计划推进。 |

来源：[Notion 手机端差异](https://www.notion.com/help/notion-for-mobile)、[Notion 移动工作区](https://www.notion.com/en-us/help/workspaces-on-mobile)、[Obsidian Mobile](https://obsidian.md/help/mobile)、[Acrobat 移动查看设置](https://helpx.adobe.com/acrobat/mobile/view-manage-files/viewing-modes.html)、[Android 导航原则](https://developer.android.com/guide/navigation/principles)。查阅日期：2026-10-26。以上是本项目的设计取舍，并非声称竞品采用同一种问号弹窗。

## 逐组清理结果

源模板审阅覆盖原有 36 个 Vue 组件，其中 26 个组件有改动，新增 3 个共用帮助组件/状态文件。源码库存见 [copy-audit.json](evidence/mobile-copy-2026-10-26/copy-audit.json)，同时记录清理前后模板、条件及文件哈希；不把段落数量当作质量指标。

| 范围 | 已删除或收到问号的内容 | 保留在当前任务里的内容 |
| --- | --- | --- |
| MobileApp | 页面口号、首页导入按钮行、重复的离线说明、关于页路线图、页脚保存口号；新建/资料库/导入/导出/附件问号 | 文件名与库、授权状态、保存状态、当前目标目录、失去授权及恢复草稿提示 |
| FileImportPanel、PackImportPanel、PdfImportPanel | 格式、预算、兼容性、重试方法和接收教程 | 选择文件、内容核对、导入进度/结果、异常、删除暂存记录的影响 |
| TextExport、PortableExport | 一般流程、附件范围、预算与本地记录规则 | 包含未保存输入的提醒、选项、真实进度/结果与删除后果 |
| ImageAttachments | 固定使用教程、能力与预算说明 | 替换所选文字的后果、不可写、引用失效、恢复副本与真实记录 |
| LibrarySearch | 宣传句、整段检索说明、固定预算清单、空页面教程 | 搜索范围、检索/索引状态、部分读取、失败、命中片段 |
| CodeTools、SourceReader | 格式介绍、高亮免责声明、分段阅读说明 | 实际语言、行号、当前位置、查找与折行入口、实际降级原因 |
| JsonTools、JsonStructure、JsonFind、JsonOperations | 通用结构教程、搜索与语法说明、解析成功后的引导段落 | 字段位置、真实值、结果数、只读/超长状态、核对范围、输入错误、移除子树后果、应用后尚需保存 |
| YamlTools、YamlStructure、XmlTools、XmlStructure | 格式介绍、通用层级教程、转义与数值写法说明 | 自定义标签提醒、无法安全修改原因、实际诊断、XML 元素数、修改预览与保存状态 |
| TomlTools、TomlStructure | 默认能力介绍、长空态卡片、字段编辑教程 | 检查结果、诊断详情、字段原值、无法编辑原因、修改预览 |
| MobilePdf、MobilePdfNavigation、MobilePdfBookmarks | 阅读教程、目录/缩略图介绍、书签储存说明、关闭不改变位置的重复保证 | 页码、阅读模式、缩放/旋转状态、目录缺失、截断、书签数量、删除后果与旧版本记录 |
| MobilePdfAnnotations、MobilePdfPassword | 批注和导出教程、常驻隐私解释 | 权限受限与待保存评论、删除后果、未确认记录、密码输入要求与错误 |
| RecoveryCenter | 普通恢复说明、空态教程、导出常识 | 来源版本不确定、可能部分写入、恢复内容、独立副本结果 |
| CodeTouchTools、MobileEditor、MobileReader、MobileNotice、MobilePdfContinuous、MobilePdfContinuousPage、MobilePdfPermissions、MobilePdfThumbnail、PdfImportPreview、RecoverySource | 核对后无需删除模板内容 | 工具标签、用户正文、当前权限、加载失败、实际预览、恢复原文均为必要内容 |

问号目录共 24 个主题，集中在 `src/mobile/mobileHelp.ts`，由同步脚本生成原型的帮助内容，避免两套界面越改越不一致。导入支持的源码扩展名直接读取现有格式注册表，没有另造一份格式列表。

## 实际页面核对

- [首页清理前后](evidence/mobile-copy-2026-10-26/comparison-library/comparison.png)：删除三条常驻导入按钮，文件列表上移；「＋」打开五项短操作。文本与 PDF 沿用现有不同选择器，统一选择器仍是后续工作。
- [导入清理前后](evidence/mobile-copy-2026-10-26/comparison-text-import/comparison.png)：默认只保留选择文件、连接原文件夹和导入记录；格式与限制进入问号。
- [搜索清理前后](evidence/mobile-copy-2026-10-26/comparison-search/comparison.png)：去除顶部介绍、空态教程和常驻预算。
- [实际 JSON 结构页](evidence/mobile-copy-2026-10-26/final/json-structure.png)、[真实正文阅读页](evidence/mobile-copy-2026-10-26/final/reader.png)：截图等待文档及结构加载完成，没有用空白/加载中截图作为成品。
- [深色帮助](evidence/mobile-copy-2026-10-26/final/help-dark.png)、[320px 与 200% 字体帮助](evidence/mobile-copy-2026-10-26/final/help-320-large-text.png)、[极短视口书签](evidence/mobile-copy-2026-10-26/regressions/320-bookmarks-short-large.png)：关闭入口可用，滚动内容可获取键盘焦点；短屏标题单行省略，完整名称仍可由辅助技术读取。
- [删除后果仍然可见](evidence/mobile-copy-2026-10-26/final/bookmark-delete.png)、[表单问号保留输入](evidence/mobile-copy-2026-10-26/final/json-operation.png)。

原始 imagegen 设计图未改动，原型测试仍核对其哈希。本轮根据新要求增加问号、减少静态文字，属于有记录的设计调整；不再要求实际页面复刻旧图中的说明段落。独立原型的 [55 页审阅总览](design/mobile-interaction-v2/validation/gallery.html) 与正式源码实页证据分别保存，不能相互替代。

清理前证据中，早期阅读页与 JSON 截图曾停在内容加载前；它们不用于本轮视觉结论。并排图仅使用已加载完成的首页、文本导入和搜索。历史截图保留了顶部 28px 预览条，本轮并排展示对齐两者共同的 390×816 应用区域，原始 PNG 均保留。

## 验证与复现

| 检查 | 结果与证据 |
| --- | --- |
| 移动构建与类型检查 | `npm run build:mobile` 通过，见 [构建日志](evidence/mobile-copy-2026-10-26/build.log)。仍有现有的大包体积提示。 |
| 逻辑回归 | `npm run test:mobile`：285/285，见 [日志](evidence/mobile-copy-2026-10-26/logic.log)。 |
| 正式实页问号与返回专项 | 14 组通过，含 3 次 WCAG A/AA 自动扫描；见 [结果](evidence/mobile-copy-2026-10-26/final/result.json)。检查输入保留、问号不提交表单、焦点约束/恢复、遮罩与键盘、删除确认、小屏/大字、暗色和父目录 Back。 |
| 现有浏览器主流程 | 6 组通过，见 [报告](evidence/mobile-copy-2026-10-26/regressions/browser.json)。原库选择器文案断言已换为稳定控件定位。 |
| 现有可访问性浏览器回归 | 5 组操作、12 次扫描通过，见 [报告](evidence/mobile-copy-2026-10-26/regressions/accessibility.json)。 |
| 书签专项 | 11 组通过，见 [报告](evidence/mobile-copy-2026-10-26/regressions/bookmarks.json)。覆盖真实 PDF 页码、名称、删除/撤销、存储失败、旧版本和 200 枚边界，保留文件字节与既有草稿。旧的固定说明卡坐标断言已更新为问号触控尺寸、卡片顺序和可见操作区域。 |
| 独立设计原型 | 41 组、55 路由通过，见 [结果](design/mobile-interaction-v2/validation/result.json)。包括三种视口、200% 文字及帮助返回；非原生系统验证。 |

新增脚本：`scripts/test-mobile-help-browser.mjs`、`scripts/audit-mobile-copy.mjs`、`scripts/render-mobile-copy-comparison.mjs`、`scripts/sync-mobile-prototype-help.mjs`。运行浏览器脚本前先完成移动构建并启动静态预览，设置 `LONGEDIT_MOBILE_PREVIEW_URL`；Playwright 可通过 `LONGEDIT_PLAYWRIGHT_MODULE` 指定。原型使用原有 `scripts/test-mobile-interaction-design.mjs`，自行启动临时服务。

本轮没有生成、安装或发布新 APK，没有把浏览器模拟 Back 当作 Android 原生手势验收。原生键盘、安全区、读屏、系统选择器取消、预测性返回与后台恢复还需按 [既定迁移计划](design/mobile-interaction-v2/interaction-spec.md) 验证。权限批次 1002049 仍保持 [未验收检查点](Mobile_Interaction_Redesign_Checkpoint_2026-10-26.md) 的状态。
