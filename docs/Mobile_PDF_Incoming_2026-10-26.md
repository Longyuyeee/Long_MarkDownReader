# 第四十批：Android 系统打开与分享接收 PDF

接续本机书签，补上从其他应用进入 PDF 的路径。读者可从 Android 打开方式或分享选择 Long编辑；应用先在私有区完整保留这份文件，显示待核对提示，用户确认后再存入手机资料库并打开阅读。不会在内容刚到达时自动替换当前文稿。

## 用户流程与竞品调查

2026-10-26 核对 [Acrobat 默认打开方式](https://helpx.adobe.com/acrobat/mobile/get-started/set-default.html)、[打开文件](https://helpx.adobe.com/acrobat/mobile/view-manage-files/open-files.html)及 [Xodo 外部文件权限与副本](https://feedback.xodo.com/support/solutions/articles/35000202914-why-are-my-files-saved-as-duplicates-instead-of-rewrite-the-original-pdf-)。前者提供系统打开/分享路径，后者指出从其他应用打开时可能没有写权限。只调查官方资料，没有安装竞品或比较性能；Xodo 说明更新于2022年，不能代表所有当前版本。Android 元信息接口另参阅[官方共享文件指南](https://developer.android.com/training/secure-file-sharing/retrieve-info)。

本项目选择显式核对和独立副本：用户能看到文件名、大小和实际首页，决定“存入并开始阅读”或“稍后处理”。当前正在写的文稿先保护草稿，再进入核对页；保护失败则留在原处。已接收内容可从“设置 → PDF 接收记录”继续，列表显示接收时间、来源和状态，帮助区分同名的多次接收。

## 设计与实际页面

内置 imagegen 先生成[新设计图](design/mobile-0.1.0/pdf-incoming-v1.png)，以前一批书签图作为配色参考；[完整提示词](design/mobile-0.1.0/pdf-incoming-v1-prompt.txt)及[设计约定](design/mobile-0.1.0/pdf-incoming-v1-brief.md)保留。图稿与实际都用“阅读导航.pdf”、32.7KiB、九页和对应真实首页标题。程序预览始终使用原 PDF 的完整首页与比例，模型示意中的字形、文字排布及较宽页面不会贴回应用。图稿遮罩后的背景为书签页，实页是用户当前资料库，作为上下文差异记录。

按真实390×844视口核对：

| 项目 | 实页几何 |
| --- | --- |
| 面板起点 / 标题 | y76 / 24px |
| 提示卡 | x16、y156、358×62 |
| 文件身份卡 | x16、y232、358×65，红色PDF标识 |
| 首页预览卡 | x16、y307、358×300 |
| 固定底栏 | y687，高157 |
| 存入按钮 / 稍后按钮 | y700 / 758，至少48 / 44高 |
| 底部接续说明 | y814 |

逐项复核后修正了未继承的红色 PDF 标识、被固定底栏部分挤住的移除入口，以及过淡的次要按钮描边。主按钮从图稿约41px扩为48px触控高度；预览卡比示意约短10px，用留白调整保留主要操作和底部接续说明。真实PDF与系统字体的差异明确保留，不宣称像素完全一致。长文件名允许换行，大字号与短屏通过独立滚动内容区保留关闭、存入及稍后入口；深色仍显示白色原PDF页面。

## 接收与保存边界

Manifest 增加 `application/pdf` 的 VIEW 和 SEND。复用既有运行时门槛与 Intent 转交，仍只接收带读取授权的单个 content URI；不接受设备绝对路径、网络打开请求、自身 FileProvider 或多文件投递。MIME及显示名用于分类，实际读取仍核对20MiB预算和PDF文件头。通用二进制MIME下的`.pdf`文件也进入这条路径。

接收任务在既有串行IO队列中执行；立即保存至 `files/pdf-imports-v1`，不依赖用户稍后仍持有来源授权。元数据和二进制分别原子写入并回读完整SHA-256，记录初始准备、完整、已存入或失败状态；来源读取未完成时保留明确失败记录。最多6条、暂存内容合计80MiB，不自动逐出其他记录；移除已存入记录只删除接收暂存，不删除资料库PDF。

确认存入要求相同接收摘要，使用稳定独立路径、私有待写文件、重命名和目录同步。重复确认或重放同一投递不重复创建；目标已被改动、移动或回执不一致时拒绝覆盖。原PDF、其他资料、文字/附件包记录及旧草稿不参与写入。PDF仍是独立二进制文件，没有因这次接收创建批注sidecar或Markdown。

首页预览只渲染第一页，画布不超过220×252像素；页面保持实际比例，不执行PDF内脚本或外部动作。预览失败与完整性失败分别说明：渲染失败仍可保留完整副本，打开阅读时重试；字节核对失败则不能确认存入。密码、OCR、连续/复杂PDF和其他高级工具仍按既有退出条件单独处理。

## 验证与候选记录

逻辑新增6项，覆盖安全命名、完整Unicode、稳定投递路径、PDF实际大小与文件头、6条/80MiB预算和可读大小；总计256项通过，打包保护17项通过。浏览器专项11组覆盖当前编辑任务保护、实际首页、图稿几何、稍后和重开、深浅色、重复确认、移除、保存失败重试、目标改变、内容损坏、渲染失败、长名/大字/短屏及错误类别路由。

初轮测试工具误用了旧按钮名称“编辑笔记”和原生inputValue读取CodeMirror，修正为实际按钮“编辑”及编辑器行文本；这些不是生产保存故障。最初全页长截图把固定面板置于长文档底部，改为真实视口截图后按几何逐项核对。完整性测试注入了一个刻意损坏摘要的记录，通用保留断言随后错误地把它当完整记录；修正为断言该条故意损坏状态仍保留。候选、失败截图、报告和最终复验分别保留。

最终同一冻结构建通过 **39脚本 / 306组完整浏览器回归**，与256项逻辑、17项打包保护及API29原生 **21阶段** 一起完成验收。完整运行期间没有重建dist或并发其他浏览器任务；全部39脚本在同一轮通过，未组合不同构建的结果。

原生包含真实打开/分享选择器、冷/热投递、通用MIME与Clip URI、进程终止后的待核对恢复、重复确认与无来源授权的同投递ID重放，以及无授权/多文件/网络/损坏/超限/不可用/容量上限。待存入副本与已存入接收记录均通过明确确认移除；后者的库内PDF仍保持完整字节。实际手势滚动后查看保留状态和移除入口；展开移除确认在较短视口中可能继续需要滚动，原生命名操作先请求显示按钮再激活。

所有原95资料 / 8草稿 / 18文字导入记录 / 6包文件及提供器95文件保持。新增3份独立PDF保留，共98资料；最终保留4条本批PDF接收记录，原有待接收3项仍在。启动设置核对一致，核对后sync，正常关闭专用AVD并确认离线。测试辅助标题节点曾误选View类名，更正为新鲜树中的TextView后继续，生产代码与已安装APK未因此改变。

证据：

- [设计与实页对照](design/mobile-0.1.0/pdf-incoming-v1-comparison.png)及[对照页](design/mobile-0.1.0/pdf-incoming-v1-comparison.html)，[普通](design/mobile-0.1.0/pdf-incoming-v1-implemented.png)、[深色](design/mobile-0.1.0/pdf-incoming-v1-dark.png)、[移除确认](design/mobile-0.1.0/pdf-incoming-v1-remove.png)、[预览失败](design/mobile-0.1.0/pdf-incoming-v1-preview-failed.png)。
- [最终专项与几何](evidence/mobile-0.1.0/pdf-incoming-browser-1792988892528/report.json)、[固定构建完整浏览器汇总](evidence/mobile-0.1.0/browser-regression-1792989241875/summary.json)、[256项逻辑输出](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/logic-tests.txt)、[17项打包保护](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/packaging.json)。
- [原生21阶段汇总](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/summary.json)、[打开选择器](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/open-chooser.png)、[分享选择器](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/share-chooser.png)、[实际确认页](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/cold-ready.png)、[进程恢复](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/cold-reopened.png)、[实际滚动](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/pending-scrolled.png)、[已存入记录移除](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/remove-imported-confirm.png)及[收尾回执](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/closeout.json)。
- [人工复核、候选与失败修正](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/review-notes.json)。Kotlin守护编译器连接失败后，Gradle内置回退编译成功；未停止其他项目的守护进程。

浏览器设计样本为33,504字节/32.7KiB，SHA `588ca161bbf480a8972d1918fdbf5e00cc20f3cc60fea7ad7bfd2a9486e1678a`；原生沿用既有34,506字节/33.7KiB的MobileNavigation.pdf，SHA `fa81e52cef0295c3fe166385d999ac1ac0141c6006360563dcd3624f8f980d11`。两者均九页且首页对应阅读指南，但不是同字节样本，未用这个差异冒充原生与图稿完全相同。名称/字节差异和短视口滚动状态均保留在实际截图中。写入空间不足与目标变化的专项为浏览器故障注入，未宣称对实体设备执行了真实磁盘耗尽测试。

## 安装包

最终两ABI均为 `1.2.11 / 1002044`，应用ID `com.longyuye.mdreader.mobile.dev`、minSdk29 / targetSdk36、开发调试签名。两份APK和SO摘要及当前移动JS/CSS/PDF资源路径已复核，[产物一致性](evidence/mobile-0.1.0/pdf-incoming-native-2026-10-26/artifact-consistency.json)保留详情；x86实际安装摘要与构建匹配。

| 架构 | 字节 | SHA-256 |
| --- | ---: | --- |
| ARM64 | 128976345 | `069aad229b286d9400cef55e3205f69a43600f7a3a423195b8e2bdd72f70d74c` |
| x86_64 | 129622774 | `4741143b2576d3b1b47a0b7156eee60b1cf555c057b503d0625538075e303258` |

安装包保存为工作树 `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` 和 `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk`，目录被Git忽略，摘要单独入证据。ARM64完成构建和静态核对，原生交互仅在API29 / WebView124 / x86_64专用模拟器执行，不代替实体ARM、所有提供器、完整TalkBack、iOS或正式签名发布。

## 后续顺序

继续审计连续与双指阅读等剩余PDF阅读体验，保持“用户任务 → 竞品资料 → 出图 → 实现 → 实页对齐”的顺序。更多真实文件/云提供器、实体ARM设备、完整TalkBack、iOS系统分享入口和正式签名分发均独立验收。
