# 第三十六批：PDF 批注筛选与摘录整理

延续 `codex/mobile-0.1.0-foundation`。用户任务是从一份 PDF 的多条批注中找到重点、挑选有用内容、核对后生成阅读笔记。本批继续移动端开发，不修改原桌面工作区。

## 使用流程与范围

1. 在“批注与摘录”打开筛选，按摘录/想法关键词、已有标记颜色与“仅本页”组合查找。关键词不区分大小写，支持全半角与 Unicode 规范化，多词同时匹配；中文输入法尚在组合中的可见内容也用于筛选。结果显示匹配数与总数，支持清空。
2. “选择摘录”逐条选入；“选择筛选结果”操作全部匹配结果，包括尚未展开的后续批次。最多200条，超额整次拒绝，绝不只取前200条。列表仍按50条渐进显示。
3. 切换筛选保留已选 ID，单独说明多少条不在当前筛选中；可仅看已选或清空选择。“仅看已选”也属于结果范围，批量选择不会扩大到此时未显示的未选项；取消最后一条后仍可退出该视图。选择仅在本次打开 PDF 内有效，关闭文件后重新选择；这不是新的持久草稿承诺。重新读取后，尚存在的ID保留，已删除的选择明确提示移除。
4. “预览笔记”展示所选引用和想法，按原页码排序；返回选择不写文件。另保留明确命名的“全部批注生成笔记”入口，也先预览。生成结果超过128KiB时提示分批，以符合移动阅读预算；保留选择。
5. 保存只新建独立 Markdown，包含所选内容与现有的完整身份/摘要原文回链。预览与实际保存各核对一次 PDF SHA 和 sidecar 修订；预览后外部发生修改即拒绝，需要重新读取、预览。每次预览固定一个新目标名，保存失败重试沿用该目标，避免重试改变目标。沿用既有受保护文件写入。

原 PDF、sidecar 与旧阅读笔记不会因筛选、选择或生成而改写。已有删除确认、最近删除恢复、批注输入保护、只读外部来源和返回原页继续使用原路径。没有接入自动概括、批量改色/删除、跨PDF汇总或自动更新旧笔记。

## 竞品依据与设计

补查 [Acrobat 移动评论管理](https://helpx.adobe.com/acrobat/mobile/review-files/manage-comments.html)、[Xodo Android 批注汇总导出](https://feedback.xodo.com/support/solutions/articles/35000202844-exporting-summary-of-annotations)，并参考 [Zotero 桌面 PDF/笔记流程](https://www.zotero.org/support/pdf_reader)。前两者分别说明共享审阅的筛选状态/清空和Android导出摘要路径；Zotero仅提供所选批注进入笔记的桌面参考。没有安装竞品，不推断当前订阅、性能或 Android 的桌面功能对等。来源范围与设计推论另记于[竞品记录](Mobile_Competitor_Research_2026-10-23.md)。

先使用内置 `image_gen.imagegen` 的 `ui-mockup` 新图模式生成 [设计图](design/mobile-0.1.0/pdf-selection-v1.png)，再实现筛选区、选择摘要、摘录卡和底部预览条。完整[提示词及原始输出路径](design/mobile-0.1.0/pdf-selection-v1-prompt.txt)保留；没有使用CLI/API替代。

对齐以390×844应用区域为准，浏览器实页只裁去26px预览提示条。保留16px边距、358px卡片、绿色主操作、主题变量和固定底部入口。实页采用最高720px/85%面板、44px以上触控目标，可滚动正文；短于400px的视口调整标题密度并隐藏底部补充提示，预览主按钮与正文仍可操作；图稿较紧凑，实页保留完整的选择范围/生存期说明和“仅看已选”入口，首屏可见卡片较少。真实PDF内容、计数和导入文件名来自当前测试，未替换成图稿文字；不声称逐像素一致。没有实现图中虚构的横向双页阅读。

## 验证与交付

逻辑测试228项、打包拒绝/一致性检查17项通过。新增逻辑覆盖组合筛选、规范化、稳定排序、不改原数组、隐藏选择、原子200条预算、失效ID拒绝、选择快照与128KiB上限。浏览器专项覆盖真实PDF.js选文、中文组合输入、颜色/本页过滤、隐藏选择、空选择、预览取消、存储失败后重试、仅所选内容的新笔记、来源回链、预览后修订冲突、重读移除已删ID、分页/超量结果、长文分批以及320px/200%文字。

Android 开发包序号 `1002040`，`com.longyuye.mdreader.mobile.dev`，min29/target36。两架构均经打包检查，签名为开发调试签名。构建记录保留真实的 `27e7b8dd2 + dirty` 基线，不改写成提交之后的来源。

ARM64 APK：`release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk`，128944189字节，SHA256 `16c2e31d1d8439b8d3d01b902ff476bddc73bb27bf53814cdd488851c3d0617a`。

x86_64 APK：`release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk`，129590618字节，SHA256 `a435cf10afbe21e5fd92c4d12b9ede2204be8578c93ec67f4bdd69a35b4457f7`。

Android最终10阶段全部通过。用专用API29/x86_64/WebView124 AVD真实导入、录入三条评论、跨筛选选两条、预览、外部修订拒绝、重读生成、原页跳转及进程重开；最终91个既有资料文件/8草稿/18文字导入文件/6包文件保护，新增三文件后共94资料文件。候选三文件也在保护集合内。实际安装APK SHA与最终x86构建记录一致，PDF和生成后的笔记持续保持原字节。辅助服务按启动时实际fixture/1恢复并同步，专用模拟器已关闭，预览9012可用。

原生[摘要](evidence/mobile-0.1.0/pdf-selection-native-final-2026-10-25/summary.json)、[逐项记录](evidence/mobile-0.1.0/pdf-selection-native-final-2026-10-25/test-notes.md)、[最终Markdown](evidence/mobile-0.1.0/pdf-selection-native-final-2026-10-25/generated-reading-note.md)、[APK/前端一致性](evidence/mobile-0.1.0/pdf-selection-native-final-2026-10-25/artifact-consistency.json)和[环境收尾](evidence/mobile-0.1.0/pdf-selection-native-final-2026-10-25/lifecycle.json)可复核。

候选全量34个既有专项通过，但新增正文高度断言拒绝旧短屏构建：browser-regression-1792873640871，270组、passed=false。失败与候选原生记录完整保留于pdf-selection-native-2026-10-25，不把旧APK结果替代最终包。冻结专项pdf-selection-browser-1792874372451已通过8组；最终固定构建完整回归35脚本/271组全部通过：[完整摘要](evidence/mobile-0.1.0/browser-regression-1792874563981/summary.json)；本批[8组专项](evidence/mobile-0.1.0/pdf-selection-browser-1792875019380/report.json)。运行期间没有重建dist，也没有启动其他浏览器专项。ARM真机、所有SAF提供器、完整TalkBack与苹果系统不在本次验证范围。


## 本地复核入口

当前静态预览为 `http://127.0.0.1:9012/mobile.html`，源码变化后运行 `npm run build:mobile`。若需要重新启动预览，可在单独终端运行 `node_modules/.bin/vite.cmd preview --host 127.0.0.1 --port 9012 --strictPort`，并打开 `/mobile.html`。完整回归期间保持该构建不变；设置 `LONGEDIT_MOBILE_PREVIEW_URL` 为上述地址，以及本机 `LONGEDIT_PLAYWRIGHT_MODULE` 后运行 `node scripts/test-mobile-browser-regression.mjs`。逻辑检查为 `npm run test:mobile`。

安装ARM开发包可在安卓手机检查阅读与整理流程；本报告中的自动原生辅助限定专用合成AVD，不能拿真实资料机替代。Windows构建沿用 `scripts/build-mobile-debug.ps1 -Target aarch64` 或 `x86_64` 与现有JDK17/Android SDK环境，签名不是正式发布签名。


最终[设计/实页对照](design/mobile-0.1.0/pdf-selection-v1-comparison.png)、[本地对照HTML](design/mobile-0.1.0/pdf-selection-v1-comparison.html)、[浅色实页](design/mobile-0.1.0/pdf-selection-v1-implemented.png)、[深色实页](design/mobile-0.1.0/pdf-selection-v1-dark.png)与[预览实页](design/mobile-0.1.0/pdf-selection-v1-preview.png)取自最终完整回归中的pdf-selection-browser-1792875019380。面板几何为x0、y154.31、390×715.69px（含浏览器26px提示条坐标）；筛选区/卡片x16、宽358px，底部操作区高93px。图稿、实际页面和提示词分别保存，未将生成图当作运行页面。
