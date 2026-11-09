# 第四十一批：PDF 双指缩放与位置保持

本批在 `codex/mobile-0.1.0-foundation` 的独立移动 worktree 推进；桌面工作区没有修改。Android 调试包序号 `1002045`，应用版本仍为 `1.2.11`。范围是看清局部、继续原处阅读和回到适合宽度；连续阅读另行推进。

## 用户流程与实现

- 在原版页面双指张合，围绕双指中点缩放，范围为适合宽度的 100%–300%。两指移动时焦点随中点移动，纸边按可滚动范围夹紧。
- 手指移动中只缩放已有画布/文字层/标记的整体预览；松手后用 PDF.js 清晰重绘。仍为一张页面画布，沿用 4,000,000 像素、8192 单边上限；不在每次触摸移动中启动 PDF 渲染。
- 加减按钮围绕当前可视区中心缩放，不再跳回页首；适合宽度收回横向溢出，并尽可能保持原文纵向焦点。无需学习手势也能操作。
- 仍以单指滚动/平移、长按选择原文。开始双指时仅清除临时选文，已保存批注、sidecar、笔记和 PDF 字节保持。页面文字模式保留系统滚动和选文，不启用文档缩放。
- 保存页码、比例、纵向和新增可选横向位置；兼容旧 v1 记录。来源指纹变化仍从首页重开；笔记回链仍到目标物理页，旧横向位置不带入引用。
- 触摸取消、第三指、切到后台、翻页/切文档、查找/页码/导航及销毁时清理预览；未完成的手势不覆盖最后一次完成的位置。画布渲染继续受取消任务和递增序号保护。

主要实现为 [MobilePdf.vue](../src/mobile/MobilePdf.vue)、[pdfGestures.ts](../src/mobile/pdfGestures.ts) 和向后兼容的 [pdfDocument.ts](../src/mobile/pdfDocument.ts)。

## 调研、先出图与真实页面对齐

补查 Acrobat Android Smart zoom、Xodo 2026 移动指南及旧版视图说明，区分官方描述和本项目的设计推论；没有安装竞品或比较其性能、收费。来源和取舍见[竞品记录](Mobile_Competitor_Research_2026-10-23.md)。

使用内置 imagegen 先生成新图，旧阅读截图只作品牌参考；完整 [prompt](design/mobile-0.1.0/pdf-gestures-v1-prompt.txt) 和 [设计约束/实页核对](design/mobile-0.1.0/pdf-gestures-v1-brief.md) 留档。原图 SHA-256 `b44576d5254f062508a13ebd48006335acfdc76c78dff2654c39c195a4a0aa96`，没有根据代码倒改设计图。

[设计图](design/mobile-0.1.0/pdf-gestures-v1.png) · [真实页面](design/mobile-0.1.0/pdf-gestures-v1-implemented.png) · [同尺寸对照](design/mobile-0.1.0/pdf-gestures-v1-comparison.png) · [深色](design/mobile-0.1.0/pdf-gestures-v1-dark.png) · [Android原生150%实页](evidence/mobile-0.1.0/pdf-gestures-native-2026-10-26/visual-aligned.png)

本次不是只补截图：第一轮对照后实际修正 PDF 标识的浅红胶囊、纸张细边和加减/上一页的圆角描边。真实视口为390×844，标题65px、摘要49px、纸张x16/y126/宽537px（358×1.5）、状态34px、底栏141px；提示20px，缩放/翻页各48px。生成图的按钮约34–38px高，实际保留48px触摸尺寸，状态行因此比图稿提前约30px；该差异明确保留，不声称逐像素一致。原 PDF 的字体、列间距和换行不按模型图改写，真实批注计数与目录入口保留。

浏览器和本次 Android 原生核对使用同一三页 `reading-guide.pdf`，SHA-256 `85f40067324cb3c861766eed8b77fd0f337b3626eb253d85846252ee435c932a`。Android 打开已有 `MobileReading-导入-2bf50408-efc2-4e8c-a7d9-af1f41b30b05.pdf`，没有新增副本；原文件名省略和原有3项待接收提示保留，原生屏幕还有系统栏，所以不将其可用高度冒称844px。

## 测试与证据

| 验收 | 结果与范围 |
| --- | --- |
| 逻辑 | 262项通过，新增6项覆盖手势几何、焦点/边界、精度和旧阅读记录兼容 |
| 打包保护 | 17项通过 |
| 新浏览器专项 | 11组通过；合成 DOM 多点事件检查几何、取消和状态，不冒充 Android 触摸 |
| 完整浏览器回归 | 40脚本 / 317组通过，固定构建完整运行；无浏览器错误 |
| API29原生 | 13检查点通过，另有测试前基线；真实双指、单指拖动、重启、边界、长按选文、文字模式、翻页和按钮 |

最终专项为 [pdf-gestures-browser-1792992944920](evidence/mobile-0.1.0/pdf-gestures-browser-1792992944920/report.json)；完整回归为 [browser-regression-1792992197498](evidence/mobile-0.1.0/browser-regression-1792992197498/summary.json)，量测在专项同目录 `alignment.json`，包含浅色、深色、320px/200%和180px短屏截图。逻辑、打包、原生原始 XML/PNG、真实手势完成回执、摘要与收尾均在 [pdf-gestures-native-2026-10-26](evidence/mobile-0.1.0/pdf-gestures-native-2026-10-26/summary.json)。

专用 `LongEdit_Compat_API29` / `emulator-5558`，1080×2280、density440、WebView124。真实两指来自单独测试包的 `dispatchGesture`，两条路径同时开始，并等待 Android 回报完成。该辅助入口要求shell DUMP权限、API29模拟器、开发包前台和可见PDF画布；文字模式/资料库拒绝。交付APK的DEX核对不含该测试入口或服务。未使用CDP或应用内JavaScript注入来代替原生操作。

拖动后的原文区域与终止进程重开后按同一物理矩形 `(0,650)-(1080,1640)` 直接比较：1,069,200像素，差异0；没有平移对齐、掩膜或替换图像。[比较结果](evidence/mobile-0.1.0/pdf-gestures-native-2026-10-26/reopen-image-comparison.json) · [原生前后图](evidence/mobile-0.1.0/pdf-gestures-native-2026-10-26/native-reopen-comparison.png)。这证明本样本、本次设备的恢复结果，不推论所有设备均逐像素一致。

原有98资料文件（包括PDF/批注/笔记）、8草稿正文与修订、18文字导入文件、6包文件、PDF接收记录/负载以及95提供器文件逐阶段保持。所有动作只更改本机阅读位置；保留3项待接收内容。安装包摘要与构建记录一致。已恢复测试前实际辅助设置，核对后执行sync，正常关闭专用AVD，见[收尾](evidence/mobile-0.1.0/pdf-gestures-native-2026-10-26/closeout.json)。

## 发现和修正

1. 首个浏览器候选发现恢复偏移：渲染提示仍占文档高度就计算了位置。修正为移除提示、等待最终布局再应用焦点/保存，后续专项和真实进程重开复验通过。首次失败保留于 `pdf-gestures-browser-1792991291700`，功能候选保留于 `pdf-gestures-browser-1792991444812`。
2. 首轮 Android 等待把“页面文字”当成普通 Button；它实际是 ToggleButton。改用新树中的真实控件类，原始候选截图保留；不改产品可访问角色来迁就测试。
3. APK资源核对的首个证据脚本漏匹配HTML中的 `./`，只列出了动态PDF块。修正匹配并要求3项资源全部存在后重新核对两个APK；不完整候选与最终记录均留档。没有因此改动冻结产品或重写构建来源。

4. 完整回归后仅给测试截图加上深色切换后的触摸高亮等待，重新执行11组专项，浅/深色最终截图均稳定；产品/dist未改，未重建或替换APK。此前带瞬时高亮的原始截图仍保留。

## 安装包与后续顺序

两包均为开发debug签名，minSdk29/targetSdk36，版本序号1002045；不是上架发行包。两个ABI顺序构建，Windows符号链接限制使用已核对的复制打包。构建记录如实保留旧HEAD和dirty状态，未在提交后改写成已提交来源。

| 架构 | 字节 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 129624310 | `c4447f2b6a9be1bae26485c73a44bfddbd123759b2706bb676c366db4e7d6ac5` |
| arm64-v8a | 128977881 | `71c422cab6e273b70d3d0c096da0aa4b1fe4c025da158e19f5b7d5c21544cc2d` |

`assets/mobile-DscAyVDz.js`、`assets/mobile-Cj6OP-o1.css` 和 `assets/pdf-D9v26WHW.js` 在两包SO中核对一致；SO摘要、测试入口缺席和APK信息见[最终包核对](evidence/mobile-0.1.0/pdf-gestures-native-2026-10-26/artifact-consistency.json)。可在本地预览运行逻辑/浏览器专项；安装x86包在上述专用AVD复现，arm64包供后续真机验收。

下一步先审计连续阅读的按需页面窗口、总画布预算、当前页判定和跨页锚点，再画普通/页界/缩放状态，实现后核对长文跳转、选文、批注和阅读位置。双击自动分栏、连续阅读、复杂大图、密码、OCR、真实云提供器、实体ARM、完整TalkBack、iOS和正式发布仍分别验收；本批没有将它们标为完成。
