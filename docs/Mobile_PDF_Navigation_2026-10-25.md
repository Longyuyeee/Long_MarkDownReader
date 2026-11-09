# 第三十七批：PDF目录与页面导航

延续移动分支 `codex/mobile-0.1.0-foundation`，基线 `0d620b2cf`。从“知道章节名”和“记得页面外观”两类用户任务出发，保留底部页码直接输入，新增顶部“目录与页面”。不修改原桌面工作区。

## 行为与边界

- 目录来自PDF自带Outline，保留中文标题、层级和收放。普通列表提供按50项继续显示，限制500项和13层；超出或不规则结构明确提示部分结果。不从正文猜目录。
- 只解析本文件数字页目标、命名目标或间接页引用。选择后打开物理页顶部，保留当前缩放；PDF目录中的坐标/缩放意图暂不应用。外部URL、动作保持禁用；失效目标说明当前位置未改变。关闭、切换标签或离开文件后忽略迟到的目标解析结果。
- 页面预览以当前物理页所在的6页批次开始，支持前后批次与回到当前页，末批可以少于6页。串行渲染，每画布最多160×210像素；最多6个画布，不生成整本或永久图片缓存。关闭或切换后取消任务，卸载后释放画布；不清理仍被主阅读器使用的共享PDF页资源。
- 缩略图绘制失败时说明预览不可用，页码按钮仍可打开。预览是原PDF页面，包含原PDF自身可渲染标记，不叠加本机sidecar批注；打开正文后显示本机批注。缩略图小图不反色，深色主题用于界面控件。
- 关闭导航不会翻页或重置阅读位置。打开导航先保护批注输入，并收起批注/查找/页码面板；底层正文、摘要和翻页工具暂时不可交互，主题切换仍可用。关闭后可恢复原批注输入，选择摘录/预览状态也保留在该PDF组件中。原生返回键与Escape先关闭导航。
- 原PDF、sidecar、旧笔记不因导航改写。目录不支持编辑；没有增加OS深链、连续/双指阅读、OCR或自建书签。

## 竞品与视觉设计

补查[Acrobat Android目录](https://helpx.adobe.com/acrobat/mobile/view-manage-files/table-of-contents.html)、[Android导航与搜索](https://www.adobe.com/devnet-docs/acrobat/android/en/navigatesearch.html)及[Xodo页跳转](https://feedback.xodo.com/support/solutions/articles/35000202863-jumping-to-a-page)。来源分别提供目录定位及页码/目录/书签/缩略图路径；旧版截图不当作当前所有版本入口。未安装竞品或比较性能、订阅与隐私。调研与本项目设计推论见[竞品记录](Mobile_Competitor_Research_2026-10-23.md)。

先以内置 `image_gen.imagegen` 新图模式生成[界面设计](design/mobile-0.1.0/pdf-navigation-v1.png)，[完整提示词和原始保存位置](design/mobile-0.1.0/pdf-navigation-v1-prompt.txt)保留。之后使用真实PDF.js/Outline与画布截图对齐，不把图稿作为应用界面。

保持16px边距、358px内容区、双入口、嵌套章节和固定继续阅读按钮，使用已有主题色和44px以上目标。实际面板最高720px/85%，长目录滚动；小于400px高时降低标题密度并隐藏底部补充说明，为正文留出可操作高度。设计图有6条示意章节，实际夹具另有命名/失效/外部目标，实页保留这些真实文字。沿用绿色PDF标识，未采用生成图偶然给出的红色标识。浏览器截图仅裁去26px预览提示条，不替换PDF或文字，不声称逐像素一致。

## 测试与夹具

新增逻辑10项，合计238项通过：目录层级/标题/循环/预算、纯文本、危险动作、显式/命名/引用目标、取消后的迟到结果、失败传播、六页批次、画布预算与串行失败恢复。新增浏览器专项9组通过：真实目录/收放/物理跳页、位置与缩放保留、命名/外部/失效目标、画布上限/最后批次、绘制失败、反复切换/进程重开、批注输入保护、无目录文档和320×346/200%实际操作。短屏断言正文至少40px，并真实滚动点击章节与关闭，避免只检查横向溢出。

独立只读 `pdf-navigation` 提供器根使用 [navigation-guide.pdf](../tests/android-storage-provider/src/main/assets/pdf-navigation/navigation-guide.pdf)，34506字节，9页，SHA256 `fa81e52cef0295c3fe166385d999ac1ac0141c6006360563dcd3624f8f980d11`。用pypdf复用原3页字体样本三次，添加嵌套/命名/外部/失效Outline；印刷页码仍是原1–3，应用采用物理1–9。原样本字节未改。PDF技能操作标记先执行一次，重新读取验证页数与目标，Poppler检查三个独特页面；字体别名警告保留，实际中英文字形图已查看。

测试提供器APK添加一个独立根，不修改旧场景。更新安装不清私有数据，首次使用才复制pdf-navigation.source。浏览器无目录场景复用既有两页Paper.pdf；原三页阅读指南实际含一条目录，首轮误以为没有目录的测试已纠正。首轮画布等待只判断width>1，会把默认300×150的未开始画布算成已完成，增加可见/完成状态等待后核对真实预算；绘制失败注入调整到组件挂载前，避免已开始渲染的旧任务影响断言。失败报告完整保留。

Android开发包序号1002041，min29/target36，标识com.longyuye.mdreader.mobile.dev，开发调试签名。两架构均通过打包验证。ARM64为release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk，128948925字节，SHA256 5bf8bc7d3ee57d2875d2d646a71686907cc2e5e82d392338de4d0846e10278aa。x86_64为release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk，129595354字节，SHA256 15274769861eb433583d28266a57a8d89b29e2daf430c3c31218c893f7bc3dc8。打包检查17项通过；[构建/前端资源一致性](evidence/mobile-0.1.0/pdf-navigation-native-2026-10-25/artifact-consistency.json)记录两个APK中实际嵌入的mobile-CAYBm9ct.css、mobile-DwhQMNPw.js及pdf-D9v26WHW.js。构建保留0d620b2cf + dirty来源，未伪写提交后的commit。测试提供器APK SHA为53a56660cb35565074a0db969b8cba19ef8553ee82fa4d4ff88e107d1d7569ad。

最终API29原生13阶段全部通过：[摘要](evidence/mobile-0.1.0/pdf-navigation-native-2026-10-25/summary.json)。真实DocumentsUI导入，目录收放与物理7页/命名2页跳转，失效目标停在2页，6页/末3页缩略图，选择9页、关闭后仍在9页、杀进程后重开恢复9页。全部94既有资料文件/8草稿/18文字导入文件/6包文件，以及提供器94个已有私有文件保持；新增一个PDF后95资料文件，无新增sidecar或笔记。原生草稿比较忽略updated时间，正文/预期签名/版本等保持。安装APK SHA与构建记录一致；所有阶段JSON/XML/PNG保留。

最终固定构建[完整浏览器回归](evidence/mobile-0.1.0/browser-regression-1792876366719/summary.json)36脚本/280组全部通过；[新增9组专项](evidence/mobile-0.1.0/pdf-navigation-browser-1792876852100/report.json)包含最终截图和画布尺寸。完整回归期间没有重建dist或启动其他浏览器专项。附加[native-back](evidence/mobile-0.1.0/pdf-navigation-native-2026-10-25/native-back.json)实测Android返回键关闭导航并保留第9页。

环境已按启动时实际fixture辅助服务/1恢复、读回核对并同步，只关闭专用emulator-5558；adb devices确认退出。旧资料保留，9012预览仍返回200，详见[收尾](evidence/mobile-0.1.0/pdf-navigation-native-2026-10-25/lifecycle.json)。真机、所有提供器、完整TalkBack和苹果系统不在本轮验收范围。


最终[设计与实页对照](design/mobile-0.1.0/pdf-navigation-v1-comparison.png)、[本地对照HTML](design/mobile-0.1.0/pdf-navigation-v1-comparison.html)、[浅色实页](design/mobile-0.1.0/pdf-navigation-v1-implemented.png)、[深色实页](design/mobile-0.1.0/pdf-navigation-v1-dark.png)和[页面预览实页](design/mobile-0.1.0/pdf-navigation-v1-pages.png)来自完整回归中的pdf-navigation-browser-1792876852100。面板x0、y154.31、宽390、高715.69px，内容区x16、宽358px；坐标含26px浏览器预览条。原始截图与图稿分别保存，未修改其内容。

本地复核沿用 `npm run build:mobile`，静态预览 `http://127.0.0.1:9012/mobile.html`（单独终端 `node_modules/.bin/vite.cmd preview --host 127.0.0.1 --port 9012 --strictPort`）。完整回归显式设置该预览地址与本机Playwright路径后运行 `node scripts/test-mobile-browser-regression.mjs`；原生辅助仅用于专用合成AVD，不使用真实资料机替代。
