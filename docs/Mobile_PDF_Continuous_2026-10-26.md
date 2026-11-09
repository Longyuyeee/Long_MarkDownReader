# 第四十二批：PDF 连续阅读与真实页界

继续在 `codex/mobile-0.1.0-foundation` 的独立移动 worktree 开发，桌面工作区保持。用户任务是上下滑动接着读、认出物理页边界、知道当前页、需要时逐页细看，以及重开继续原处。Android开发包版本序号1002046，应用版本仍为1.2.11。

## 实现与范围

- 阅读方式在已有底栏提示行打开选择面板：逐页/连续两项，每份文件独立记住，旧记录默认逐页。180px短屏从缩放行进入；关闭面板与原生返回保持位置，焦点回到实际入口。页面文字仍是独立的提取文字模式。
- 连续排布真实PDF页面，页间显示第n页。当前页按可见纸面面积判断；保存视口上沿的物理页、页内比例、固定页隙与横向位置，兼容旧v1记录。局部窗口增删前后保留真实页锚点，异步载入期间继续滑动也取最新位置。
- 通常保留2–4页，最多8页，每画布最多150万像素、合计最多1200万像素，顺序渲染且当前页优先。文字层和批注覆盖同一纸面；离开窗口取消任务、释放画布和页面渲染资源。元数据缓存最多128条；这不是整个PDF.js堆内存的上限。
- 双指先整体预览，松手按同一物理页焦点清晰重绘；按钮也保留焦点。导航、书签、查找、页码、笔记引用继续使用真实页码。每页失败有重试和逐页查看路径，极端尺寸页明确转逐页，避免静默裁掉内容。
- 同页选文绑定实际被选择的页，保存桌面兼容sidecar；跨页保留系统复制并说明分段高亮，不生成错误单页坐标。选文期间暂停回收。原PDF、已有批注和笔记字节保持。

主要代码：[MobilePdfContinuous.vue](../src/mobile/MobilePdfContinuous.vue)、[MobilePdfContinuousPage.vue](../src/mobile/MobilePdfContinuousPage.vue)、[pdfContinuous.ts](../src/mobile/pdfContinuous.ts)，由现有[MobilePdf.vue](../src/mobile/MobilePdf.vue)接入。

## 竞品、设计图与实际形状

先补查Acrobat Android阅读模式（2026-08-18更新）与Xodo移动指南（2026-05-25），区分原版连续、逐页和文字重排。只读官方资料，没有安装竞品或比较性能/收费。来源与本项目推论见[竞品记录](Mobile_Competitor_Research_2026-10-23.md)。

在写产品代码前使用内置imagegen生成v1，再针对触摸尺寸迭代v2。保留两版原图、完整prompt和SHA-256；实现后没有按代码倒改设计图。

[设计原图](design/mobile-0.1.0/pdf-continuous-v2.png) · [完整prompt](design/mobile-0.1.0/pdf-continuous-v2-prompt.txt) · [约束与量测](design/mobile-0.1.0/pdf-continuous-v2-brief.md) · [真实浅色](design/mobile-0.1.0/pdf-continuous-v2-implemented.png) · [深色](design/mobile-0.1.0/pdf-continuous-v2-dark.png) · [阅读方式面板](design/mobile-0.1.0/pdf-continuous-v2-chooser.png) · [并排对照](design/mobile-0.1.0/pdf-continuous-v2-comparison.png)。

实页390×844：标题65、摘要49、阅读区531、保存状态34、底栏165px；纸张x16/宽358；第2页顶398.56；页界标签24px、上下各8px。方式行44、缩放48、翻页48px。原图底栏约115px、原文标题也被模型放大；实页保留可触摸尺寸与真实PDF的字体/换行，因此保存状态比图稿提前约50px。已经逐项核对纸边、页界、按钮轮廓、入口、配色和普通/深色，不声称逐像素一致。

浏览器与本次原生沿用相同三页reading-guide.pdf，SHA-256 `85f40067324cb3c861766eed8b77fd0f337b3626eb253d85846252ee435c932a`。浏览器在创建测试批注之前拍无批注场景；不是隐藏已有批注计数。Android打开已有2bf50408文件，保留原文件名省略、系统栏与原有3项待接收提示，其可用高度不同于844px。

## 验收记录

268项逻辑、17项打包保护、41脚本/328组固定构建完整浏览器回归及连续阅读11组专项通过。完整回归为[browser-regression-1792995811684](evidence/mobile-0.1.0/browser-regression-1792995811684/summary.json)，运行期间未重建dist或并行跑浏览器任务；最后连续阅读使用截图等待修正，产品保持同一构建。专项覆盖向前/向后、窗口回收、重开位置、200%焦点、同页批注、跨页提示、查找、文字模式、导航、201页长文连续滚动至第12页并跳末页、文档隔离、320px/200%文字和180px短屏；页面无错误、无外部请求、原资料保持。最终专项为[pdf-continuous-browser-1792996402883](evidence/mobile-0.1.0/pdf-continuous-browser-1792996402883/report.json)。另复验旧逐页阅读及手势专项，原始证据一并保留。

原生使用专用API29 / LongEdit_Compat_API29 / emulator-5558，1080×2280、density440、WebView124。新鲜UIAutomator树操作实际Button/ToggleButton，ADB单指滑动；真正两指由独立测试服务dispatchGesture，并等待系统完成回执。多画布时仅选包含两指起终点的命名PDF画布；保留shell DUMP、专用模拟器与开发包前台限制。交付APK的DEX不含测试入口或测试服务，没有用CDP或应用内JS注入替代原生测试。

跨页滑动后的panned与终止进程重开的reopened，按同一固定原文矩形(0,650)-(1080,1570)直接比较，993,600像素差异0；没有平移、掩膜或替换截图。只说明本样本本设备的本次恢复结果。见[比较结果](evidence/mobile-0.1.0/pdf-continuous-native-2026-10-26/reopen-image-comparison.json)。

API29原生18检查点通过，另有测试前基线：实际跨页/逆向滑动、页码、终止进程重开、200%双指/适合宽度、逐页/连续、文字、翻页、导航、原生返回、原有2条批注列表和最终资料库。原始XML/PNG、手势完成回执、逻辑/打包日志与摘要见[原生证据](evidence/mobile-0.1.0/pdf-continuous-native-2026-10-26/summary.json)。

最终[原生页界实页](evidence/mobile-0.1.0/pdf-continuous-native-2026-10-26/visual-boundary.png)已经肉眼核对：第一张visual-aligned只拍到第1页末段，可访问树虽有第2页节点但仍在屏外，故保留候选并额外滑动补拍。更短原生视口此场景第1页可见面积更大，底栏仍为第1页符合规则；不强行改成浏览器截图的第2页。

原98资料（含PDF/sidecar/笔记）、8草稿正文与修订、18文字导入文件、6包文件、6 PDF接收文件及95提供器文件逐阶段保持；仅更新本机阅读位置，原3项待接收保留。测试前实际辅助设置恢复并核对，再sync和正常关闭专用AVD，见[收尾回执](evidence/mobile-0.1.0/pdf-continuous-native-2026-10-26/closeout.json)。

## 发现与修正

实现阶段修复短页窗口反复补页：前向容量计入页内锚点偏移，达到8页上限不再触发同窗刷新；自动补页提交前捕获最新手指位置，避免异步载入拉回旧处。单页/连续切换按同一真实页的阅读边缘定位。

首个浏览器候选的文件选择器同时命中PDF与.annotations.json，改为完整文件名精确匹配；移动视觉拍摄到创建批注之前后，短屏用例从末页误点下一页，改为先到首页。保留1792994713108与1792994996344失败以及1792994791702候选，不将测试脚本错误描述成产品故障。最终专项和全量入口使用修正后的脚本。

最终面板截图复核发现模式入口的短暂蓝色触摸反馈仍在关闭后的背景上，截图脚本增加面板标题聚焦与400ms等待；未改产品、dist或APK。固定构建完整回归的最后一项使用此截图修正，再核对最终面板；前一截图保留。

## 调试包与后续顺序

两个ABI顺序构建，Windows符号链接限制采用已验证复制；minSdk29/targetSdk36，开发debug签名，非正式上架包。构建记录如实保留旧HEAD和dirty来源，提交后不改写。

| 架构 | 字节 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 129630838 | `d9a66ac54918cc4266b848df1ead611b4f0ab7b2ea5e38bfac221c2d01e02b84` |
| arm64-v8a | 128984409 | `0a73da07bb06ecdaaffe6b8f84265d301d494201dd886cadd3c962bbf4bbc372` |

两包嵌入同一mobile-DFK6brrb.js、mobile-Bb8ZsJ2y.css及pdf-D9v26WHW.js，SO摘要与构建来源一致；最终x86包与模拟器实际安装摘要一致，见[产物核对](evidence/mobile-0.1.0/pdf-continuous-native-2026-10-26/artifact-consistency.json)。

下一步扩展旋转/混合尺寸/复杂大图等真实PDF样本，复核连续阅读与目录、书签和笔记回链的更多组合，再评估密码和剩余高级体验。实体ARM、其他OEM/WebView、完整TalkBack、真实云提供器、iOS与正式发布分别验收；本批的画布预算不冒充低内存设备的堆内存或性能测试。
