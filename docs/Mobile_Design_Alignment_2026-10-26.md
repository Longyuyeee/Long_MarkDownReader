# 第三十八批：对照原设计修正 PDF 导航实页

继续 `codex/mobile-0.1.0-foundation`，代码基线 `a37f2b39d`。本批先处理用户指出的还原不足，再推进下一项功能。上一批只确认了16px边距、两个入口和固定底栏，未充分检查标题字重、目录层级、连接线、下划线长度及关闭按钮；这些属于应修正的实现差异。

## 核对方法

保留第三十七批的[原始设计图](design/mobile-0.1.0/pdf-navigation-v1.png)和[内置 imagegen 提示词](design/mobile-0.1.0/pdf-navigation-v1-prompt.txt)，没有重新画一张接近旧实现的图来代替它。新增[验收规格](design/mobile-0.1.0/pdf-navigation-alignment-spec.json)，把853×1844图稿的主要锚点换算为390×844应用区域，再核对可操作应用的截图和DOM几何。

新增独立的六条目录PDF，与图稿的中文章节、九个物理页、当前第三页一致。它复用已有九页的页面内容，不修改原九条目录安全样本，也不在截图中替换文字或隐藏真实测试项。PDF技能操作标记执行一次后由pypdf创建，重新读取检查九页文字相同，Poppler渲染第三页并人工查看；Symbol/ArialUnicode别名警告保留，实际中英文字形正常。字节摘要与来源见原生证据目录的design-fixture.json。

Android另用模拟器中**原有的同一份九条目录PDF**，在第三页分别截取旧包和新包。保留三项待核对内容提示、状态栏和系统导航栏，截图不修饰。新的浏览器专项实测预览条高度为28px，按真实应用起点裁出完整390×844区域；没有继续套用旧专项固定26px的近似值，原设计图不变。

## 修正的用户体验

| 核对项 | 修改前实际页面 | 本批实现 |
| --- | --- | --- |
| 面板标题 | 20px绿色，与次级文字层级接近 | 24px深色、700字重 |
| 关闭入口 | 白色描边，仅有文字 | 浅绿色底、关闭图标，至少44px触控高度 |
| 导航标签 | 下划线铺满179px半栏；页面使用网格图标 | 约70px文字下划线，页面使用文档图标 |
| 目录结构 | 根章节与子章节均15px普通字；只缩进12px | 16px文字，根章节加粗、子章节普通字，20px缩进及连接线 |
| 行尾入口 | 箭头 | 统一右向折线，明确打开章节 |
| 继续阅读 | 13px按钮文字，无方向图标 | 16px按钮文字、右向图标、48px触控范围 |
| 当前页面 | 14px普通提示 | 16px浅色卡片、文档图标 |
| PDF页头 | 导入UUID挤占标题，副标题可能换行 | 显示可读文档名，完整身份仍保留；导航时紧凑页头和背景遮罩 |
| PDF摘要 | 绿色胶囊，批注无图标 | 与图稿一致的红色PDF标识及批注图标 |

关闭、章节、原生返回键、批注草稿保护、只读PDF和六页预览队列的行为继续保留。没有子目录的叶章节不显示虚假的展开按钮。连接线不进入辅助阅读树，实际展开按钮保留44px以上触控范围。

首轮在320×346、200%字体下发现：新关闭图标使五字标题折行，正文区不足40px。已在短屏隐藏装饰性关闭图标并缩减底栏留白，保留“关闭导航”和实际章节操作，再次通过实际点击和正文高度检查。没有通过删掉大字体用例来绕过问题。

首个双架构候选的深色截图中，目录连接线仍偏亮。收尾检查实际编译CSS发现，局部global选择器只落到了父容器，随后被组件自身的浅色变量覆盖。修正完整选择器后增加真实computed borderLeftColor断言，浅色必须为rgb(199,210,197)，深色必须为rgb(100,117,100)。此前已通过的候选原生记录和被主动中止的全量浏览器记录保留于candidate证据目录；两架构包及最终完整回归均重新构建/运行，不能用候选的通过结果代替最终包验收。

## 竞品复查与设计取舍

2026-10-26重新查阅[Acrobat Android目录说明](https://helpx.adobe.com/acrobat/mobile/view-manage-files/table-of-contents.html)和[Xodo跳转页面说明](https://feedback.xodo.com/support/solutions/articles/35000202863-jumping-to-a-page)。前者强调利用内置目录定位长文，后者列出页码、目录、书签和缩略图路径。由此保留按章节名与页面外观定位的两个入口；层级、字重和固定继续阅读按钮是本项目面向用户任务的设计推论。此次为官方文档研究，未安装竞品或验证它们的当前性能、收费与所有界面入口。Xodo文档更新于2022年，不能据其旧截图推断当前所有版本布局。

本批没有增加新导航功能；下一批继续本机PDF书签，再处理系统打开/分享接收。移动导航视觉验收增加到完整回归入口，后续功能不能仅以逻辑通过作为页面已还原的证据。

## 验收与可复现入口

- `test-mobile-pdf-navigation-alignment-browser.mjs`：真实六条Outline及PDF.js画布；检查原图锚点、24px标题、16px行文字、父子字重、短下划线、连接线与底栏，截取浅色/深色/折叠/页面状态；320/360/430px及320×346、200%字体真实操作。源码字节一致，无外部请求或页面错误。
- `test-mobile-pdf-navigation-browser.mjs`：继续独立检查九条目录中的本地/命名/外部/失效目标、关闭保留位置、缩略图预算/末批/失败回退及批注输入保护。
- `verify-mobile-pdf-navigation-alignment-native.mjs`：只允许emulator-5558 / LongEdit_Compat_API29 / API29；每阶段核对全部既有资料、草稿内容、文字导入、包导入及提供器文件集合和SHA。复用原PDF，不导入新文件；草稿仅忽略updated时间。
- `mobile-pdf-navigation-alignment-ui.ps1`：从新鲜UI树或限定测试辅助服务操作，不使用CDP、端口转发或远程DOM注入。

APK仍为开发调试签名，ARM64只做构建与打包验证；原生交互在专用API29 x86_64模拟器完成。真机、完整TalkBack、复杂PDF与iOS仍有独立验收要求。

## 设计与实页交付

- [原图与最终实页并排](design/mobile-0.1.0/pdf-navigation-aligned-v1-comparison.png) / [HTML对照](design/mobile-0.1.0/pdf-navigation-aligned-v1-comparison.html)：相同六条章节、九页、当前第三页。
- [最终浅色页面](design/mobile-0.1.0/pdf-navigation-aligned-v1-implemented.png)、[深色页面](design/mobile-0.1.0/pdf-navigation-aligned-v1-dark.png)、[真实缩略图页面](design/mobile-0.1.0/pdf-navigation-aligned-v1-pages.png)。
- [Android旧包与最终新包同页对照](design/mobile-0.1.0/pdf-navigation-aligned-v1-native-comparison.png)：同一原有PDF、第三页，完整保留原生状态栏及待接收内容提示。

最终390×844测量：面板起点106px；提示卡x16/y230、宽358、高66；标题24px；标签下划线70px；目录每行48px触控范围、含分隔线49px；根章节650字重、子章节400；当前页卡y713.5，继续阅读按钮y761.5、宽358、高49、文字16px。规格保留有限容差，未虚构相似度百分比。关闭按钮44px触控高度较图稿约35px更大，无子级的章节不制造虚假展开入口；其余系统字体和PDF示意正文差异如实保留。

## 最终 Android 验收与安装包

[原生验收摘要](evidence/mobile-0.1.0/pdf-navigation-alignment-native-2026-10-26/summary.json)包含11条阶段记录：修改前同页基准、打开第三页、目录、收放、真实缩略图、深色、跳到第7页、系统返回、杀进程重开恢复及最终安装核对。全部95资料文件、8份草稿内容、18个文字导入文件、6个包文件及提供器95文件集合和摘要一致；本批原生没有导入或新建资料文件。修改前截图来自旧包1002041，后续阶段在最终新包完成。初版候选未当作最终包证据。

[收尾记录](evidence/mobile-0.1.0/pdf-navigation-alignment-native-2026-10-26/lifecycle.json)：还原启动时实际辅助服务/启用值（fixture服务 / 1），核对后同步，再确认专用模拟器退出；预览9012返回200。没有清除应用、AVD或提供器数据。

开发包序号1002042，应用标识com.longyuye.mdreader.mobile.dev，minSdk29/targetSdk36；源为a37f2b39d及本批未提交修改，构建记录保留真实dirty状态。[两架构资源一致性](evidence/mobile-0.1.0/pdf-navigation-alignment-native-2026-10-26/artifact-consistency.json)确认均嵌入mobile-DIl4bseV.css、mobile-ClRrbBHh.js、pdf-D9v26WHW.js，SO及安装摘要匹配。

| 架构 | 调试包 | 字节数 | SHA256 |
| --- | --- | --- | --- |
| ARM64 | release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk | 128949501 | 216a01f2120edf7e9156f108fee99cb0710c380cf7acc4212487a670dc22950b |
| x86_64 | release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk | 129595930 | 9472070c7738a0332aace8ae7ecff058dd96f1c5536e0e7a7c84fd1293478f34 |

逻辑238项、打包保护17项通过；最终固定构建下的浏览器**37脚本 / 284组组合验收通过**：[组合摘要](evidence/mobile-0.1.0/browser-regression-combined-1792982478359/summary.json)、[报告索引与前端摘要](evidence/mobile-0.1.0/pdf-navigation-alignment-native-2026-10-26/browser-regression-index.json)。

最后一轮完整入口的前33脚本通过；回链专项在直接注入localStorage后没有刷新资料列表，等待新夹具文件超时。失败截图显示资料库仍是原四个文件，测试随后补上真实“刷新文件列表”操作；生产代码、APK和dist均未改变。回链及余下选择/导航/视觉四专项在同一固定构建串行通过，组合摘要列出各自原始报告。没有把首次失败写成单轮完整通过。失败原轮次保留于browser-regression-1792981543227，所有首轮发现、候选范围和复验说明见[test-notes](evidence/mobile-0.1.0/pdf-navigation-alignment-native-2026-10-26/test-notes.md)。
