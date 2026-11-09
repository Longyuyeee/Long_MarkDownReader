# 移动端竞品调研与页面设计决定

2026-10-26 全量重设计补充了 Notion、Acrobat、Android 导航与 Material 的官方依据，及弹层、二级页面、输入保护和返回路径的具体决定，见[最新交互方案](design/mobile-interaction-v2/interaction-spec.md)。本页保留前期调研记录，当前一级导航和页面层级以新方案为准。

Long编辑移动端首先帮助用户完成三件事：接着读手头的资料，找到需要的文件，及时记下一点想法。首版围绕这些任务设计，逐步接入现有的多格式能力。调研采用产品官方说明和帮助资料，日期为 2026 年 10 月 23 日；尚未安装竞品逐项实测，以下区分产品公开能力和本项目的设计取舍。

## 调研对象与观察

| 产品 | 官方说明中的做法 | 对 Long编辑的启发 |
| --- | --- | --- |
| Obsidian Mobile | 移动端提供导航栏、键盘附近的编辑工具栏和可定制动作；工具栏内容可横向滚动。阅读导航与编辑工具随场景切换。[移动端说明](https://obsidian.md/help/mobile) | 正文是阅读页主体；进入编辑后才出现常用格式工具。常用动作有可见入口，保留逐步扩展的空间。 |
| Joplin | 桌面与手机支持显示 Markdown 源文及渲染结果；发生同步冲突时保留冲突笔记供比较和恢复。[Markdown](https://joplinapp.org/help/apps/markdown/)、[冲突处理](https://joplinapp.org/help/apps/conflict/) | 阅读、编辑、恢复草稿和保存原文件需要明确区分。文件已有外部变化时，提供另存路径，保留当前输入。首版不提前承诺同步。 |
| Flexcil | 官方手势说明提供缩放、翻页及选文后的弹出操作，并区分手势和手写场景；该说明最后更新于 2021 年，具体版本手势仍需实机核对。[手势说明](https://www.flexcil.com/support/%E2%98%85-instructions-on-how-to-use-gestures/) | 后续 PDF 阅读将选文与批注操作放到目标附近。首版所有关键动作仍提供按钮，手势作为可学习的补充。 |

这些启发用于用户任务和操作位置的选择，不代表复制竞品页面，也不代表竞品已验证 Long编辑的文件和保存实现。

## 从用户问题确定页面

| 用户此刻在想什么 | 页面给出的答案 | 主操作 |
| --- | --- | --- |
| 我上次读到哪里？ | 有最近资料时展示继续入口；打开后可核对恢复草稿 | 继续阅读 |
| 我的文件放在哪里？ | 显示当前资料库、文件夹位置及授权状态 | 选择资料库或打开文件 |
| 我想先记下来 | 新建时只询问名称，并明确保存位置 | 开始记录 |
| 我只是想读，不想误改 | 默认阅读；编辑动作明确；未保存内容有状态提示 | 编辑 |
| 刚才写的还在吗？ | 恢复草稿独立保存，显示保护结果；恢复前先展示选择 | 继续草稿或先读文件 |
| 文件保存失败怎么办？ | 保留输入，反馈原因，允许重试或另存副本 | 重新保存或另存 |

一级导航采用「资料、查找、最近、设置」，文档打开后进入独立阅读编辑页面。首批查找明确限定为当前文件夹名称筛选，全文搜索将在索引接入后开放。首页只显示真实数据，空库直接引导创建笔记和选择文件夹。

## 已接入的首轮页面

代码位于 `src/mobile`，通过 `mobile.html` 提供独立入口，桌面首页保持原有路由。

- 资料库选择、文件列表、目录返回、刷新、加载及失败重试。
- 当前文件夹的名称查找，区分无命中和读取失败。
- Markdown / TXT 阅读与 CodeMirror 编辑，常用格式工具按编辑场景出现。
- 新建笔记、显式保存、最近打开、恢复草稿提示和另存副本。
- 浅色与深色界面，安全区、横屏及软键盘可用高度处理。

浏览器明确显示「交互预览」，数据保存在浏览器本地。Android 运行时连接原生文档适配器，原生错误不回退到预览数据。页面完成程度以浏览器和安装包任务记录为准。

## 接下来的用户任务检查

先在 360 和 412 CSS px 手机视口运行创建、编辑、切换、恢复和另存，再检查 800 CSS px 视口。Android 模拟器使用系统选择器和真实文件，核对保存与重新打开。中文输入法、文本选择、返回手势和真机性能保持独立验收。

后续 PDF、表格和其他格式沿用同一资料导航，分别设计适合触摸的工作区。资料组织、历史和备份接入后再扩展「最近」的接续能力，不在当前预览中加入无法兑现的入口。

## 第二批：异常保存与附件接续

本批再次核对 [Joplin 冲突处理](https://joplinapp.org/help/apps/conflict/)，增加恢复记录的两个版本核对、分别另存和完整导出流程。用户不需要重新取得来源授权才能取回已保护的草稿。具体实现与原生故障验证见[存储边界验收](Mobile_Storage_Boundaries_2026-10-23.md)。

第二批当时尚未实现相对图片，后续调研与实现见下节。

## 第三批：打开已有图片、查找与接着读

2026 年 10 月 24 日，参考 [Obsidian 附件说明](https://obsidian.md/help/attachments)中附件与笔记同级或放入邻近子目录的组织方式，已接入授权库内的相对图片阅读。图片逐张加载，失败时正文继续可读，并显示原因与重试入口。

再次核对 [Joplin 搜索说明](https://joplinapp.org/help/apps/search/)中的搜索范围与中文限制后，本项目先实现当前文档的字面查找，并明确区分阅读文字与源码。最近资料接续增加阅读位置及从头阅读入口。全文索引仍待下一批；调研仍是官方资料分析，未进行竞品安装实测。[第三批实现与验收](Mobile_Text_Reading_2026-10-24.md)

## 第四批：从一句话找到整库资料

2026 年 10 月 24 日再次核对 [Obsidian Search](https://obsidian.md/help/plugins/search) 对库内检索与当前笔记查找的区分，以及名称 / 路径 / 内容的搜索范围；结合 [Joplin](https://joplinapp.org/help/apps/search/) 对中文分词与符号搜索的说明，移动端接入明确范围的字面全文检索。搜索页显示路径、源文片段、读取进度与未纳入说明，打开后返回保留查询位置；Markdown 语法中的命中可选择源码定位。实现采用有界、仅内存的已保存文本快照，尚未接入持久化倒排索引。[第四批实现与验收](Mobile_Library_Search_2026-10-24.md)

## 第五批：图片与附件

参考 [Obsidian 普通附件及笔记旁目录](https://obsidian.md/help/attachments)、[移动工具栏](https://obsidian.md/help/mobile)和 [Joplin 移动附件容量 / 下载说明](https://joplinapp.org/help/apps/attachments/)，本批把插图放在编辑工具栏和阅读操作附近，明确图片副本位置与显式保存。增加单处引用修复、导入记录及待确认恢复副本，普通跨库笔记副本携带可识别的图片；删除旧附件、压缩和完整附件导出继续独立处理。调研仍为官方材料分析，没有竞品安装实测。[第五批实现与验收](Mobile_Attachments_2026-10-24.md)

## 第六批：写作时的接续与可读性

再次核对 [Obsidian 移动工具栏](https://obsidian.md/help/mobile)的就近编辑和横向浏览，以及 [Joplin 移动编辑器官方源码](https://github.com/laurent22/joplin/blob/dev/packages/app-mobile/components/NoteEditor/NoteEditor.tsx)中的相对字号、撤销 / 重做深度接口。本批让阅读切换保留编辑实例和历史，补重做及按整行处理的格式操作，改用相对文字字号并接入 Android 系统字号。中文候选与内联合成通过项目自身的浏览器 / 原生任务验证，竞品仍只核对官方资料，详见[第六批实施与验收](Mobile_Writing_2026-10-24.md)。

## 第七批：无障碍与任务接续

补查 [Joplin 移动端读屏导航](https://joplinapp.org/help/apps/screen_reader_accessibility/#navigating-the-mobile-app)与[无障碍开发指南](https://joplinapp.org/help/dev/accessibility/)，并继续参照 [Obsidian 的可见移动导航](https://obsidian.md/help/mobile)。本批依据用户任务完善标题、返回文件、开关状态、弹窗焦点和错误可达性，将自动规则检查、原生 TalkBack 键盘操作与待验收的触摸探索分别记录。研究为官方材料分析，没有安装竞品或据其声明认定本项目通过。[实现与验收](Mobile_Accessibility_2026-10-24.md)

## 第八批：拿到安装包后的体验

核对 [Obsidian Android 安装](https://obsidian.md/help/install)和 [Joplin 官方安装页](https://joplinapp.org/help/install/)提供的 APK 入口，并参考 [Obsidian 本地库与远端库的区分](https://obsidian.md/help/Obsidian+Sync/Local+and+remote+vaults)。本项目据此补齐可识别的架构包、离线运行条件和覆盖安装资料保护。API 29 实测发现旧 WebView 空白后，新增独立于网页脚本的原生更新提示。两架构构建、API 29 本地文稿和 API 35 草稿升级分别验证；正式发布与真机仍保持待验收，见[第八批记录](Mobile_Android_Packaging_2026-10-24.md)。调研仍为官方资料分析，没有竞品安装测试。

## 第九批：大资料库里找到文件

核对 [Obsidian Search](https://obsidian.md/help/plugins/search)对路径 / 内容范围和较慢解析操作的说明、[Joplin 中文等自定义搜索模式的规模限制](https://joplinapp.org/help/apps/search/)以及[按需读取附件](https://joplinapp.org/help/apps/attachments/)的选项。本项目据此让“只记得文件名”走独立的目录读取，让全文匹配可停止、换词，并明确当前范围。原生实测进一步发现并修复了 SAF 排序 / 定位的反复元数据查询，形成 1,000 文件夹具和逐字节核对流程。未安装竞品，也未把其公开功能当作本项目的性能数字，见[第九批记录](Mobile_Library_Scale_2026-10-24.md)。

## 第十批：较长文稿也能打开并找到末尾

核对 [Obsidian 编辑视口](https://docs.obsidian.md/Plugins/Editor/Viewport)与 [Joplin Android 编辑器变更](https://joplinapp.org/help/about/changelog/android/)，并将 [Joplin 2021 年大文稿探索](https://joplinapp.org/news/20210729-103234/)作为历史背景。由此推导本项目的阅读 DOM 预算、可终止后台排版、完整源文的分段阅读及异步查找。竞品资料没有提供本项目的设备预算或真机数字，需由接近 4 MiB 的混合换行夹具分别验证浏览器与原生保存。[第十批实现与验收](Mobile_Document_Budget_2026-10-24.md)

## 第十一批：保存异常后知道内容在哪里

2026 年 10 月 24 日核对 [Joplin 冲突处理](https://joplinapp.org/help/apps/conflict/)保留本地冲突版本供检查的流程，以及 [Obsidian Sync 冲突选项](https://obsidian.md/help/Obsidian+Sync/Troubleshoot+Obsidian+Sync)中的独立冲突文件与手动核对。本项目据此推导“明确两个版本、保留来源、主动进入核对、另存独立副本”的操作方式。竞品材料讨论同步冲突，本批验证本地 SAF 拒写和部分提交，研究没有安装竞品或证明它们具备相同的故障处理能力，也没有新增自动同步。[第十一批实现与验收](Mobile_Write_Interruption_2026-10-24.md)

## 第十二批：从命名顺利进入记录

核对 [Obsidian 新建笔记流程](https://obsidian.md/help/Files+and+folders/Manage+notes)中命名后开始编辑的操作，以及 [Joplin 移动待办入口](https://joplinapp.org/help/apps/to-dos/)从笔记本内的加号菜单创建的说明。本项目保留目标文件夹和可见新建入口，补齐等待、失败、重试和重复提交状态。由 [Android 新建契约](https://developer.android.com/reference/android/provider/DocumentsProvider#createDocument(java.lang.String,%20java.lang.String,%20java.lang.String))确认提供器可以修改显示名称，但必须返回新分配的文档 ID；当前适配器对无法按原名称确认的结果保留草稿并提供另存。竞品调研仍为官方资料分析，Obsidian 此页是通用操作，未将其快捷键当作手机交互，也未假定竞品采用同样的文件创建保护。[第十二批实现与验收](Mobile_Note_Creation_2026-10-24.md)

## 第十三批：文字副本与完整迁移的边界

核对 [Markor 官方仓库](https://github.com/gsantner/markor)对本地纯文本互通和向其他应用分享文件的说明，以及 [Joplin 导出文档](https://joplinapp.org/help/apps/import_export/)对 JEX 备份与其他导出格式的区分。本项目据此补齐单份 Markdown / TXT 导出，明确未保存内容、图片仅为引用以及导出不等于同步或整库备份。Joplin 页面为通用文档，没有被当作 Android 导出能力的实机证明；竞品仍未安装。[第十三批实现与验收](Mobile_Text_Export_2026-10-24.md)记录系统选择器、导出快照及异常恢复的实际结果。


## 第十四批：单文件导入与原文件夹的不同任务

核对 [Obsidian Android](https://obsidian.md/help/android)的设备存储 / 应用存储选择、[Notesnook 导入帮助](https://notesnook.com/help/importing-notes/)目前要求 Web / 桌面端导入再同步至手机的说明，以及 [Joplin Markdown 导入](https://joplinapp.org/help/apps/import_export/)的桌面步骤与 [Android JEX 导入更新](https://joplinapp.org/help/about/changelog/android/)。本项目据此区分「单文件复制进应用内资料库」和「继续使用已授权文件夹」，先核对再存入，明确图片附件引用与完整迁移的边界。另阅读 [Markor DocumentActivity 官方源码](https://github.com/gsantner/markor/blob/master/app/src/main/java/net/gsantner/markor/activity/DocumentActivity.java)，为后续外部打开入口做准备。以上为官方材料分析，未安装竞品，不将通用桌面导入步骤视作竞品 Android 对应能力。实现和实际系统选择器结果见[第十四批验收](Mobile_Text_Import_2026-10-24.md)。


## 第十五批：其他应用带入内容时保留正在写的思路

[Notesnook 分享帮助](https://notesnook.com/help/mobile-integration/share-things-from-other-apps)说明 Android / iOS 分享文字、链接和文件后保存为新笔记，并可选择追加已有笔记。[Markor 更新记录](https://github.com/gsantner/markor/blob/master/CHANGELOG.md)包含分享文件进入应用的功能，其 [DocumentActivity 官方源码](https://github.com/gsantner/markor/blob/master/app/src/main/java/net/gsantner/markor/activity/DocumentActivity.java)处理外部文件打开。本项目据此完成收到内容后的独立核对与存入；收到时保留当前输入，查看前先保护草稿，暂未实现追加到原笔记或整页剪藏。以上为官方资料分析，未安装竞品。系统类型声明、临时授权、失败和重复递送的实际结果见[第十五批验收](Mobile_Incoming_Content_2026-10-24.md)。

## 第十六批：附件随笔记离开应用

[Bear 的 iPhone / iPad 导出步骤](https://bear.app/faq/export-your-notes/)从笔记更多菜单进入，并列出 TextBundle V2；其[导入帮助](https://bear.app/faq/import-your-notes/)列出 TextBundle / TextPack。结合 [Notesnook 的 TextBundle 导入器说明](https://notesnook.com/help/importing-notes/import-notes-from-textbundle-files)与 [TextBundle V2 规范](https://textbundle.org/spec/)，本项目选择公开 TextPack，把文字、图片和直接文件引用放入一个包，先展示清单再写出。实际下载官方示例核对顶层 `.textbundle` 结构，避免只凭扩展名猜格式。未安装竞品，不推断 Notesnook Android 本机导入能力，也未宣称与竞品实机互通；完整实现与验收边界见[第十六批记录](Mobile_Portable_Pack_2026-10-24.md)。

## 第十七批：核对后存入完整笔记与附件

重新核对 [Bear 的 iOS 导入入口](https://bear.app/faq/import-your-notes/)、[Notesnook TextBundle 帮助](https://notesnook.com/help/importing-notes/import-notes-from-textbundle-files)对文字、附件、单文件传递和 Finder 元数据的说明，以及 [Joplin Android 更新记录](https://joplinapp.org/help/about/changelog/android/)中的只读与编辑保护改进。设计推论是让导入具有独立核对、固定目标和恢复记录，避免重复操作覆盖已有资料。Joplin 的[通用导入导出文档](https://joplinapp.org/help/apps/import_export/)区分 JEX 备份与其他格式；本项目本批仅完成单份 TextPack 迁移。没有安装竞品，也没有把 Notesnook Web / 桌面步骤当作 Android 实机功能。依据、实现和实际应用往返见[第十七批记录](Mobile_Pack_Import_2026-10-24.md)。

## 第十八批：从其他应用收到整包

[Bear 的 iOS 分享扩展](https://bear.app/faq/ios-app-extension/)提供预览后保存，以及插入已有笔记的选择；本项目据此采用主动核对，再保存独立笔记，保护正在写的上下文。[Notesnook 的 TextBundle 帮助](https://notesnook.com/help/importing-notes/import-notes-from-textbundle-files)说明单个压缩包携带正文和附件的迁移价值；[Joplin 的附件说明](https://joplinapp.org/help/apps/attachments/)提示移动设备的资源与离线考虑。这里是结合已有实现作出的产品取舍，没有安装竞品，也没有把 iOS 分享或 Web / Desktop 导入步骤写成竞品 Android 实测能力。来源、系统 MIME 的取舍与本地验证见[第十八批记录](Mobile_System_Pack_Import_2026-10-24.md)。

## 第十九批：公开样本与实际后缀

核对 [Ulysses 移动导出预览](https://help.ulysses.app/export?kb_language=en_US)和 [iOS TextBundle 导入说明](https://help.ulysses.app/en_US/integrations/123456-import-into-ulysses)，并复查 [Notesnook 导入器的 Web / Desktop 限制](https://notesnook.com/help/importing-notes/)。下载官方 V2 ZIP 后发现入口按后缀拒绝有效包，现已允许单篇有效 V2 ZIP，并保留内容与资源预算核对。固定了 [Shiny Frog 原始 TextPack](https://github.com/shinyfrog/TextBundle/tree/28027bff3e606ec3290e8c55fff340a826fedd41)与 [FSNotes 随应用分发的 iOS 笔记](https://github.com/glushchenko/fsnotes/tree/ca305e464c469e6372cccba11b37d4a58bb51e2c/Resources/Initial)两个独立许可样本；后者只重新打包，成员字节不变。官网 / Notesnook 的相同 TextPack 不重复计数。特殊语法保留原文并说明阅读边界，没有安装竞品或声称完成竞品实机往返。[第十九批记录](Mobile_Pack_Compatibility_2026-10-24.md)列出来源、摘要与验收范围。

## 第二十批：手机上检查与修改 JSON

核对 [Acode 设置](https://docs.acode.app/user-guide/settings)对 settings.json 原文编辑和按语言格式化的说明，以及 [Formatter API](https://docs.acode.app/docs/global-apis/acode)将格式化作为编辑动作的接口；阅读 [QuickEdit 概览](https://rhmsoft.com/qedit/intro.html)、[工具栏](https://rhmsoft.com/qedit/toolbar.html)及[换行等设置](https://rhmsoft.com/qedit/settings.html)。本项目据此推导按格式提供工具、核心操作触摸可达、整理前主动核对的流程；保存、草稿和来源冲突沿用现有保护。数值词法、重复键、顺序和转义的完整保留由本项目独立测试证明，未归因于竞品，也未安装竞品或采用其性能宣传作为设备预算。实现、语法检查范围与实际文件核对见[第二十批记录](Mobile_JSON_Source_2026-10-24.md)。

## 第二十一批：找到字段，再核对修改

2026-10-24 核对 [Json Genie 的开发者 Google Play 页面](https://play.google.com/store/apps/details?id=com.tuyware.jsongenie)：Android 结构视图、键 / 值 / 路径查找、标量与容器编辑、源码视图及本地处理声明。复查 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html)对源码定位、撤销重做、保存 / 另存的说明和 [Acode 设置](https://docs.acode.app/user-guide/settings)的 JSON 原文入口。本项目的设计推论是使用逐层单列、保留返回位置、显示同名字段序号、先核对再应用的标量修改；本轮筛选仅限当前层，源码仍可全文查找。没有安装竞品、验证竞品性能或推断其大整数 / 重复键保留实现。桌面审计、预算和实际验证见[第二十一批记录](Mobile_JSON_Structure_2026-10-24.md)。

## 第二十二批：跨层定位与完整结构操作

复查 [Json Genie 开发者页面](https://play.google.com/store/apps/details?id=com.tuyware.jsongenie)对跨层查找、返回结果、结构增删和移动的介绍，以及 [QuickEdit 查找帮助](https://rhmsoft.com/qedit/search.html)对查找条件、查找状态和命中操作的区分。本项目据此提供独立的全树字段 / 标量值结果列表、详情返回位置，以及详情内的重命名、新增、移除和相邻数组项移动；每次修改都先展示源码范围供核对。原始词法保留和重复键处理由本项目独立实现与测试，没有据材料推断竞品内部实现；本批未安装竞品，也未实现路径查询或正则。设计与验收见[第二十二批记录](Mobile_JSON_Operations_2026-10-24.md)。


## 第二十三批：手机上修改 YAML 配置（2026-10-24）

本轮补查官方文档；未安装竞品，也未向第三方上传用户文件。

| 依据 | 可确认的交互 | 本项目的取舍 |
| --- | --- | --- |
| [QuickEdit 官方概览](https://rhmsoft.com/qedit/intro.html) | 语法高亮、行号、指定行跳转、查找及撤销重做 | YAML 保留源码入口，检查结果直接定位到可修改的位置；不将性能宣传当成本机验收结果 |
| [Acode 官方设置](https://docs.acode.app/user-guide/settings) | 编辑器设置与按语言配置格式化器 | 按文件类型显示工具，YAML 此阶段只检查，避免自动重排注释、锚点和块文本 |

用户任务定为“收到配置 → 核对原文 → 定位问题 → 修改 → 保存或导出”。未完成的语法也应能保护草稿和保存，语法检查不等同于配置应用接受该文件。详细实现、边界及实测证据见[第二十三批记录](Mobile_YAML_Source_2026-10-24.md)。


## 第二十四批：YAML 字段定位和修改（2026-10-24）

补查 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html)：区分保存 / 另存为，保留撤销重做、源码查找、指定行定位和只读模式；[Acode QuickTools](https://docs.acode.app/user-guide/quicktools)说明手机键盘输入括号、引号和导航键的负担，并提供按需显示的工具条。本次依据仍是官方公开文档，未安装竞品，不推断它们具备 YAML 结构表单或无损编辑。

本项目据此作出的设计选择是：源码入口一直可达，常见字段值使用类型表单减少键盘符号输入；按层呈现映射和列表，每页 30 项，显示完整所在位置、行列和原值。修改先核对，明确应用后进入草稿，保存仍由用户决定。锚点、标签、块文本、复杂键和多文档不在表单中重建，说明原因并直接定位源码。实现与证据见[第二十四批记录](Mobile_YAML_Structure_2026-10-24.md)。


## 第二十五批：XML 源码阅读、检查与保存（2026-10-24）

补查 [FuryXML 开发者的 Google Play 介绍](https://play.google.com/store/apps/details?id=com.furyform.furyxml)，其公布的交互包括 XML 树 / 文本切换、语法高亮、撤销重做、检查、查找与分享；这些是开发者公开声明，本轮未安装或测量该应用，不据此承诺性能或隐私结论。复查 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html)的源码查找、行定位、保存与另存为，作为普通配置文件任务的参照。

本项目选择先完成“核对原文 → 阅读或查找 → 修改 → 主动检查定位 → 保存 / 导出”的完整路径，再增加树与属性表单。XML 注释、CDATA、处理指令、命名空间、字符引用和引号写法由源码保留，不自动格式化。检查只在本机后台处理，未完成或暂不支持完整检查时仍可保存；不能把源码检查通过等同于 DTD / Schema 或具体配置应用认可。完整边界和结果见[第二十五批记录](Mobile_XML_Source_2026-10-24.md)。


## 第二十六批：XML 属性任务（2026-10-24）

复查 [FuryXML 商店的开发者说明](https://play.google.com/store/apps/details?id=com.furyform.furyxml)，其树 / 源码切换、属性编辑及筛选为手机定位提供参考；更新说明提到的大文件筛选与节点展示修复提示应单独设定预算和分页。复查 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html)与 [Acode QuickTools](https://docs.acode.app/user-guide/quicktools)，本项目将高频属性修改做成文字表单并自动转义，仍保留源码查找、定位和撤销。仅做公开资料调研，未安装或测量竞品，也不据开发者宣传作性能 / 隐私判断。具体取舍及证据见[第二十六批记录](Mobile_XML_Structure_2026-10-24.md)。


## 第二十七批：手机配置文件源码任务（2026-10-24）

查阅 [QuickEdit 的格式介绍](https://rhmsoft.com/qedit/intro.html)、[高亮识别](https://rhmsoft.com/qedit/syntax.html)和[工具栏](https://rhmsoft.com/qedit/toolbar.html)，其 TOML / INI 高亮、按扩展名识别、查找 / 行定位、撤销与保存可作为日常配置任务参照；高亮不作为语法检查通过的证据。复查 [Acode QuickTools](https://docs.acode.app/user-guide/quicktools)的符号键与触摸辅助，本批先提供源码闭环，下一批以受限字段表单降低常用值修改的符号输入负担。公开文档调查未安装或测量竞品，也不判断其隐私行为。明确 TOML 1.0 检查范围，避免版本差异阻断保存；实现与测试见[第二十七批记录](Mobile_TOML_Source_2026-10-24.md)。

## 第二十九批：TOML 结构和字段表单（2026-10-24）

查阅 [Json Genie 开发者的商店介绍](https://play.google.com/store/apps/details?id=com.tuyware.jsongenie&hl=en_US)：其公开的树形浏览、路径查找和字段表单提示手机任务应先帮助用户找到具体值，再进入修改。复查 [Acode QuickTools](https://docs.acode.app/user-guide/quicktools) 的触摸符号输入辅助及 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html) 的文件身份、保存 / 另存、撤销和源码定位。本轮仅调查公开资料，未安装竞品或推断性能、隐私与 TOML 无损编辑能力。

本项目采用按层字段卡、完整路径、每页 30 项与返回位置保留；普通值使用类型表单，修改先核对，应用草稿后仍需主动保存。表数组中的同名字段分别识别，复杂日期和跨行文字直接定位源码。先用内置 image_gen 生成结构页设计，再用真实页面的同尺寸截图核对。设计、实现和边界见[第二十九批记录](Mobile_TOML_Structure_2026-10-24.md)。

## 第三十批：手机代码源码任务（2026-10-24）

查阅 [Acode 编辑设置](https://docs.acode.app/user-guide/settings/editor-settings)与 [QuickTools](https://docs.acode.app/user-guide/quicktools)：行号、视觉折行、缩进与符号输入分别影响手机操作。复查 [Code Editor Accessory View](https://rhmsoft.com/icode/accessory.html)的上下文工具栏和 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html)的文件身份、保存与指定行定位，并查阅 [Squircle CE 官方仓库](https://github.com/massivemadness/Squircle-CE)的多语言编辑定位。本轮是公开资料调查，未安装竞品，不评判性能或隐私行为。

本项目先完成 JavaScript、TypeScript、Python、HTML、CSS 的源码闭环，使用行号、折行、数字行定位和可撤销的符号栏降低触摸成本；保存仍主动执行，HTML 与 CSS 按原文阅读，不运行或应用来源内容。先出图，再用真实页面核对外形。详细范围、桌面对照与验收见[第三十批记录](Mobile_Code_Source_2026-10-24.md)。

## 第三十一批补查：源码选区与行操作

2026-10-24 核对 [Acode QuickTools](https://docs.acode.app/user-guide/quicktools) 的导航键、分组和滑动工具；核对 [QuickEdit Selection](https://rhmsoft.com/qedit/selection.html) 的选区与增减缩进，以及[工具栏](https://rhmsoft.com/qedit/toolbar.html)的行定位 / 折行入口。只依据官方公开资料，不声称安装竞品实测。移动端将既有符号与行操作分为两个可见分类，保留原生选文，提供左右光标、物理行首尾、选行和明确缩进；具体规则与设计对照见[第三十一批记录](Mobile_Code_Lines_2026-10-24.md)。

## 第三十二批补查：语言识别与支持范围（2026-10-25）

本批再核对 [QuickEdit 语法语言](https://rhmsoft.com/qedit/syntax.html)、[Acode 编辑器设置](https://docs.acode.app/user-guide/settings/editor-settings) 和 [Code Editor 功能概览](https://rhmsoft.com/icode/intro.html) 的开发者公开说明。QuickEdit 根据扩展名自动识别并提供手动关联；Acode 分开配置行号、折行、Tab 和保存格式化；Code Editor 分列高亮、运行和网页预览。没有安装或测量竞品，不从公开功能表推断其性能或字节保真程度。

据此把用户选文件时的三个问题放进当前工作流：导入前可查看支持的 32 个扩展名；打开后可查看实际扩展名与语言；格式说明明确高亮、混合语法和大文件边界。本批补入剩余 24 个后缀，保持显式保存、源码只作为文字处理。详情见[第三十二批记录](Mobile_Code_Languages_2026-10-25.md)。

## 第三十三批补查：PDF 阅读任务（2026-10-25）

核对 [Acrobat 移动阅读模式](https://helpx.adobe.com/acrobat/mobile/view-manage-files/viewing-modes.html)、[Android 页面导航](https://www.adobe.com/devnet-docs/acrobat/android/en/navigatesearch.html) 及 [Xodo 移动工作流](https://xodo.com/blog/how-to-use-xodo-pdf-reader-and-editor-mobile-app)。公开说明把进入文件、阅读方式、页码 / 翻页、缩放和查找分开；据此沿用资料库与最近记录，将翻页和缩放放在底部，原版页面和页面文字分别说明，不把提取文字当成保持排版的重排。没有安装竞品实测，也未据公开介绍比较其性能或隐私。

本批先用内置 imagegen 出图，再通过真实三页 PDF 与实际控件截图核对。只接入只读阅读、文内查找和本机位置恢复；批注 / 阅读笔记及高级工具按后续顺序推进。设计与证据见[第三十三批记录](Mobile_PDF_Reading_2026-10-25.md)。

## 第三十四批补查：PDF 选文与批注（2026-10-25）

核对 [Acrobat Android 审阅指南](https://www.adobe.com/devnet-docs/acrobat/android/en/mv-review.html) 与 [Xodo Android 文字标记](https://feedback.xodo.com/support/solutions/articles/35000202834-creating-a-text-markup-annotation)。前者描述选文评论、长按标记和显式提交，且场景为共享审阅；后者提供工具栏和长按快捷入口。没有安装竞品或比较性能。将“在原文标记”和“集中回看整理”作为移动端主线，设计底部批注面板、明确保存状态与独立 Markdown 阅读笔记。范围、图稿与证据见[第三十四批记录](Mobile_PDF_Annotations_2026-10-25.md)。

## 第三十五批补查：删除恢复与摘录回链（2026-10-25）

核对 [Acrobat 移动评论管理](https://helpx.adobe.com/acrobat/mobile/review-files/manage-comments.html)、[Zotero Android](https://www.zotero.org/support/android) 及 [Zotero PDF/笔记指南](https://www.zotero.org/support/pdf_reader)。Acrobat 的共享审阅指南提供评论列表定位和菜单删除；Zotero Android 说明移动阅读/批注与研究笔记，桌面 PDF/笔记指南展示摘录附带原页链接。未安装竞品，也不把桌面指南当作其 Android 回链或持久撤销的实测证明。本项目采用明确删除确认、持久最近删除恢复、带摘要的内部回链和可访问的顶层来源列表；设计与证据见[第三十五批记录](Mobile_PDF_Recovery_2026-10-25.md)。


## 第三十六批补查：筛选、选择与阅读笔记（2026-10-25）

核对 [Acrobat 移动评论管理](https://helpx.adobe.com/acrobat/mobile/review-files/manage-comments.html)：共享 PDF 的评论可按评论者、未读与时间等条件筛选，界面显示筛选状态并可清空。适用场景是共享审阅，不能据此推断离线本机文件的全部行为。核对 [Xodo Android 导出批注汇总](https://feedback.xodo.com/support/solutions/articles/35000202844-exporting-summary-of-annotations)：从批注列表导出、选择保存目录，完成后打开新页。该说明更新于2022年，作为任务路径参考，不声称当前各版本入口完全一致。另核对 [Zotero PDF/笔记指南](https://www.zotero.org/support/pdf_reader)：桌面支持从全部或所选批注加入笔记，并带回原页链接；仅作为整理流程参考，不当成 Android 功能实测。

本项目由此设计“找到重点→明确挑选→核对预览→新建阅读笔记”：关键词/颜色/本页筛选、结果计数和清空、筛选之外的已选数量、完整结果的原子批量选择、保存前预览。颜色只作为现有标记分类，不擅自规定黄=重点/绿=行动等含义；笔记保留用户自己的理解。筛选不改 sidecar，生成不改原 PDF 或旧笔记。没有安装竞品，也没有比较性能、订阅或隐私。设计先用内置 imagegen 出图，再与实页对照；详见第三十六批实现记录。


## 第三十七批补查：PDF长文导航（2026-10-25）

核对[Acrobat Android目录](https://helpx.adobe.com/acrobat/mobile/view-manage-files/table-of-contents.html)、[Android导航与搜索](https://www.adobe.com/devnet-docs/acrobat/android/en/navigatesearch.html)及[Xodo跳转页面](https://feedback.xodo.com/support/solutions/articles/35000202863-jumping-to-a-page)。Adobe说明通过文档已有目录打开章节，旧版导航指南也列出缩略图入口；Xodo官方Android指南列出页码、目录、书签和缩略图滑条（页面更新于2022年），作为任务路径参考，不宣称当前版本入口或免费范围完全相同。本轮未安装竞品，不比较性能、订阅或隐私。

用户任务拆为“知道章节名→目录”和“记得页面外观→页面预览”，保留已有底部页码入口。目录来自PDF自身，支持嵌套收放；没有目录明确说明，不从正文猜章节。选择前关闭面板不改变阅读位置，选择后打开物理页顶并保留缩放。页面预览按6页一组、顺序渲染、单画布最多160×210像素；不一次生成整本文件。外部链接/动作不作为本文件章节打开，失效目标停在当前位置。先内置imagegen出图再对齐实际页面，设计/实现记录见[第三十七批记录](Mobile_PDF_Navigation_2026-10-25.md)。


## 第三十八批复查：目录实页的可辨识层级（2026-10-26）

重新打开[Acrobat Android目录说明](https://helpx.adobe.com/acrobat/mobile/view-manage-files/table-of-contents.html)及[Xodo跳转页面说明](https://feedback.xodo.com/support/solutions/articles/35000202863-jumping-to-a-page)。官方资料支持按文档内置目录定位，以及页码/目录/书签/缩略图多种路径。Xodo资料更新于2022年，旧截图不代表当前所有版本。此次未安装竞品，无性能和收费比较。

本项目推论：保留“知道章节名”和“记得页面外观”的两个入口；目录必须能一眼区分父子，展开与跳转各有真实操作。先修正上一批标题、字重、连接线、标签下划线、关闭和继续阅读按钮，再继续书签。以原图的相同六条章节和真实PDF对照，并用同一份原生PDF第3页截取修改前后，不把样本内容差异当作外形还原完成的依据。详见[实页复核记录](Mobile_Design_Alignment_2026-10-26.md)。

## 第三十九批补查：记住和找回 PDF 页面（2026-10-26）

核对 [Acrobat Android 添加书签](https://helpx.adobe.com/acrobat/mobile/view-manage-files/bookmark-page.html)、[管理书签](https://helpx.adobe.com/acrobat/mobile/view-manage-files/manage-bookmarks.html)和 [Xodo 页面跳转](https://feedback.xodo.com/support/solutions/articles/35000202863-jumping-to-a-page)。Adobe 说明添加、查看、跳转、改名和删除，管理中使用长按进入操作；Xodo 将书签与页码、目录和缩略图列为不同定位方式。只读官方资料，没有安装竞品；Xodo 2022 年说明不代表所有当前版本，Android 说明也不证明 iOS 对等功能。

本项目的设计推论是：添加本页一键完成，命名可选；编辑和删除采用可见按钮，降低发现长按的成本；确认删除后仍提供最近一次持久撤销。书签放入已有导航的第三栏，按物理页排序和标记当前页；文件内容变化时保留只读旧版记录，不将旧页码套用到新 PDF。这些保护是本项目的实现取舍，不宣称竞品具有同样的数据恢复或版本隔离行为。先生成新书签图，再按相同九页 PDF 和三枚真实记录核对实页；详见[第三十九批记录](Mobile_PDF_Bookmarks_2026-10-26.md)。


## 第四十批补查：系统打开和分享收到 PDF（2026-10-26）

核对 [Acrobat 默认打开方式](https://helpx.adobe.com/acrobat/mobile/get-started/set-default.html)和[打开文件](https://helpx.adobe.com/acrobat/mobile/view-manage-files/open-files.html)：外部应用可通过打开方式或分享进入 PDF 工作流；没有把 iOS 指南当成 Android 的实测。核对 [Xodo 从其他应用打开后出现副本](https://feedback.xodo.com/support/solutions/articles/35000202914-why-are-my-files-saved-as-duplicates-instead-of-rewrite-the-original-pdf-)：来源文件管理器可能只给予读取权限，直接写回原文件需要另行考虑。Xodo 页面更新于2022年，仅作为权限边界参考，不代表所有当前版本。

本项目据此保留读取授权边界，以私有完整接收记录和显式确认创建独立本机副本；不因外部打开而自动覆盖当前文稿或原 PDF。文件名、大小和实际首页帮助用户确认收到的是哪份文件，“稍后处理”与设置中的接收记录支持中断后继续。这是本项目的产品取舍，不宣称竞品具有同样的先核对、持久接收和重试策略。技术上另核对 [Android 共享文件元信息](https://developer.android.com/training/secure-file-sharing/retrieve-info)，元信息只辅助分类，实际内容仍按字节预算和完整摘要核对。先内置 imagegen 新出图，再对照真实视口与 Android 原生页面；详见[第四十批实现记录](Mobile_PDF_Incoming_2026-10-26.md)。


## 第四十一批补查：放大细节并继续原处阅读（2026-10-26）

核对 [Acrobat Android Smart zoom](https://www.adobe.com/devnet-docs/acrobat/android/en/navigatesearch.html)：双击会分析点击处的文字栏并适配，说明放大应围绕用户想看的内容。核对 [Xodo 2026 移动指南](https://xodo.com/blog/how-to-use-xodo-pdf-reader-and-editor-mobile-app)（页面标注2026-05-25），明确列出双指看细节、连续/逐页阅读和书签等任务；[Xodo 旧版模式说明](https://feedback.xodo.com/support/solutions/articles/35000202855-changing-view-modes-scrolling-direction-)更新于2022年，仅补充模式的概念。此次只读官方资料，没有安装竞品，不比较流畅度、收费、精确手势算法或各系统所有版本。

本项目的设计推论：先完成手势与按钮共同使用的焦点缩放，避免一次放大就回到页首；双指中点对应原文位置，松手后清晰重绘，仍以单指浏览和长按选文。保留可发现的适合宽度、加减和页码按钮；保存横纵位置兼容此前本机记录。不是 Acrobat 的自动分栏，也未宣称完成连续阅读。先 imagegen 新出图，再按同一真实三页 PDF 在150%状态核对实页；生成图中的正文版式不替换原文。技术另核对 [MDN 多点触摸](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events/Multi-touch_interaction)与 [Android dispatchGesture](https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#dispatchGesture(android.accessibilityservice.GestureDescription,%20android.accessibilityservice.AccessibilityService.GestureResultCallback,%20android.os.Handler))，浏览器合成事件和 Android 真正两指输入分别留证。实现、视觉差异和退出条件见[第四十一批记录](Mobile_PDF_Gestures_2026-10-26.md)。

## 第四十二批补查：连续读下去与原版页面（2026-10-26）

核对 [Acrobat Android 阅读模式](https://helpx.adobe.com/acrobat/mobile/view-manage-files/viewing-modes.html)（页面更新于2026-08-18）：连续、逐页和Reading Mode是不同选择，文字重排也受文件内容限制。核对 [Xodo 移动阅读指南](https://xodo.com/blog/how-to-use-xodo-pdf-reader-and-editor-mobile-app)（2026-05-25）：连续/逐页、双指放大、查找和书签共同服务阅读。本轮只读官方资料，没有安装竞品或比较性能、收费和各系统功能一致性。

本项目据此将用户任务定为“滑动接着读→认出页界→知道本页→重开继续”：原版连续排页与已有页面文字模式分开，旧记录默认逐页，每份文档记住阅读方式。通过已有底栏提示行打开选择，不加新的常驻工具条；短屏有缩放行入口。当前页按可见纸面判定，保存位置锚定真实原文页；跨页选文仍可系统复制，高亮明确要求分段。局部页面回收和画布预算是本项目的实现取舍，不能推论竞品采用相同算法。先内置imagegen出v1/v2，再核对同一三页PDF的真实页界、触摸尺寸和深色；详见[第四十二批记录](Mobile_PDF_Continuous_2026-10-26.md)。

## 第四十三批补查：看正横置纸面（2026-10-26）

核对[Acrobat移动旋转页面](https://helpx.adobe.com/acrobat/mobile/organize-pdfs/rotate-pages.html)（2026-08-18更新）：组织页面中的左右旋转属于文档页面操作。核对[Xodo Android视图/滚动方向说明](https://feedback.xodo.com/support/solutions/articles/35000202855-changing-view-modes-scrolling-direction-)；资料更新于2022年，不能推断当前版本全部入口与免费范围。[另一份Xodo视图说明](https://feedback.xodo.com/support/solutions/articles/35000202742-changing-view-modes)位于其iOS资料目录，仅补充概念，不当作Android实测。本轮只查官方资料，没有安装竞品或比较性能/订阅。

本项目取舍：在已有阅读方式面板中增加“文档显示方向”，明确整份文档与原文件保持原样；0/90/180/270°为相对源页面内置方向的显示偏移，每份文件仅本机记忆。按一次旋转即回原文查看，恢复原始方向可发现。技术核对[PDF.js官方viewport说明](https://mozilla.github.io/pdf.js/examples/)与当前锁定依赖源码：原始旋转与裁切由viewport处理，文字先按原尺寸布局再整层旋转。本项目的持久方向、原文锚点和sidecar反算是自己的实现，不推论竞品算法。先imagegen新图，再按同尺寸真实面板修正卡片/图标/分隔线与按钮位置；详见[第四十三批记录](Mobile_PDF_Orientation_2026-10-26.md)。
## 第四十四批补充：打开有密码的 PDF（2026-10-26）

核对 [Acrobat Android 官方打开指南](https://www.adobe.com/acrobat/hub/open-password-protected-pdfs-on-android.html)：选文件后输入密码，正确后打开；文档也提到系统自动填充，且忘记密码可向提供者询问。核对 [Xodo 官方指南](https://xodo.com/blog/how-to-open-a-pdf-with-password-protection)：移动应用支持密码文档，并区分打开密码和权限密码，提醒大小写。公开指南没有完整展示错误、取消和键盘布局，不能推断为已在竞品真机逐页测试。

本项目据用户任务设计：先显示文件身份，再让用户输入；错误原页重试；取消回到来源；默认不加入应用密码保存功能。空格和大小写完整传递，权限密码不等于必须输入打开密码。密码只交给本次PDF.js任务，不写入草稿、位置记录或PDF原文件；已有笔记功能仍由用户明确操作写侧文件，不能宣称摘录也自动加密。

技术核对 [PDF.js 官方加载任务](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentLoadingTask.html) 与仓库已安装的 `pdfjs-dist` 类型/实现：`onPassword(updatePassword, reason)`处理缺少/错误密码，销毁加载任务会终止等待。实现使用现有版本API，不因在线新文档而直接升级依赖。AES-256/AES-128/RC4-128及空打开密码用独立自造语料验证，不等于所有证书/DRM或损坏加密PDF均已支持。

## 第四十五批补充：允许阅读不等于允许复制或批注（2026-10-26）

补查[Acrobat移动保护说明](https://www.adobe.com/devnet-docs/acrobat/ios/en/protect.html)：公开文档提到Android上受保护文档的部分修改操作受限；这是移动端公开说明，未安装竞品真机逐项核对。补查[Xodo文档安全说明](https://feedback.xodo.com/support/solutions/articles/35000251306-document-security)：打开密码、权限密码、文本提取、无障碍提取、批注是不同项目；这页属于PDF Studio桌面资料，只用于权限语义，不能当作Xodo Android界面实测。前一批移动密码指南沿用。

本项目的设计决定：允许继续看原版页面、查找、目录和本机书签；复制和修改批注独立判断。复制受限时拦截应用内原文复制/剪切/选文摘录，页面文字和查找仍供阅读；用户自己的查询和评论输入可复制。若允许批注，可写不带原文摘录的个人评论；受限原文不进入新增摘录笔记。批注受限则阻止新增、修改、删除与恢复写入，已有记录和未完成输入保留。权限未确认时暂按受限处理；不增加绕过或权限密码修改功能。

[PDF.js官方文档](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html)当前站点API与仓库版本存在返回类型差别，本批以已安装pdfjs-dist的getPermissions数组类型和PermissionFlag.COPY=16、MODIFY_ANNOTATIONS=32为准，也核对同版本pdf_viewer的enablePermissions实现。无权限项的null与空数组分开处理；辅助提取、内容修改标志不能冒充复制或批注授权。以上是阅读器内的操作策略，不宣称替代文件加密或覆盖其他阅读器。
