# 第四十三批：看正混合方向PDF并保持阅读位置

继续在独立移动worktree的codex/mobile-0.1.0-foundation推进，桌面工作区保持。Android开发序号1002047，应用版本仍为1.2.11。顺序是用户任务/竞品补查、先出图、代码、真实页面对照，再本地浏览器和Android验收。

## 用户流程与实现

横置或倒置的图表看不正时，在已有“阅读方式”面板里调整“文档显示方向”，向左/向右按90°转动；点击后回原文立即看结果，恢复原始方向可发现。设置作用于整份文档，仅保存在本机，并逐份文件隔离。它相对每页原有内置方向叠加，不编辑源PDF的/Rotate，也不改变系统自动旋转设置。

原版逐页和连续阅读都支持。画布由PDF.js按原始裁切与内置旋转叠加偏移清晰重绘，文字层使用旋转前尺寸后整层旋转；高亮从原始视口的归一化矩形转到显示坐标，选文反向转换后保存，sidecar仍与桌面兼容。已有批注与原PDF字节保持。笔记回链及批注跳转仍使用源坐标，显示时转到对应方向。页面文字模式仍按提取顺序阅读。

旋转尽可能围绕当前可见原文焦点，超出纸边时按真实滚动范围夹紧。连续窗口仍最多8画布/1200万像素，每页150万；不宣称整个PDF.js内存被限制到该值。旧阅读记录未提供rotation时默认0；指纹变化不沿用旧方向，非法方向不覆盖最后完成的位置。

设备横竖屏另行处理：每次重建读取实际可用宽度，保存布局变化前的阅读边缘锚点，用新视口中心x和上沿12px恢复。修复原连续组件computed读取DOM宽度而不会失效的问题，以及ResizeObserver在变化之后取新视口中心导致偏移的问题。页面内置旋转的文字层也补齐PDF.js整层旋转样式，避免纸面正确而选文偏离。

主要实现为[pdfOrientation.ts](../src/mobile/pdfOrientation.ts)、[文字层样式](../src/mobile/pdfTextLayer.css)、[MobilePdf.vue](../src/mobile/MobilePdf.vue)及连续阅读组件。

## 竞品、图稿与实际形状

核对Acrobat移动组织页面旋转、Xodo Android旧版视图入口及PDF.js官方viewport说明；明确文档编辑和阅读显示的区别。Xodo另一份说明位于iOS资料目录，仅作概念参考。只查官方资料，未安装竞品或比较性能、收费和系统一致性。来源与项目推论见[竞品记录](Mobile_Competitor_Research_2026-10-23.md)。

用内置imagegen先生成新面板，旧连续阅读截图只作品牌参考；实现后保留原图，不根据代码倒改。完整[prompt](design/mobile-0.1.0/pdf-orientation-v1-prompt.txt)、[设计约束与量测](design/mobile-0.1.0/pdf-orientation-v1-brief.md)、[原图](design/mobile-0.1.0/pdf-orientation-v1.png)、[实页](design/mobile-0.1.0/pdf-orientation-v1-implemented.png)、[深色](design/mobile-0.1.0/pdf-orientation-v1-dark.png)和[并排对照](design/mobile-0.1.0/pdf-orientation-v1-comparison.png)均留档。

第一候选后实际修正正文上留白、方式卡内边距、选中状态的列表/勾选图标和文字颜色、关闭圆底、恢复按钮间距，并去除图稿没有的顶栏遮罩。最终390×844：面板y65，第一卡y170.39、高72，第二卡y252.39、高72；方向分隔线y384.78，左右按钮y496.56、高48，恢复y558.56、高48。内容x16/宽358。按原图人工近似量测的y169/251/383/493/556，逐项差异小于4px，专项采用6px容差，并独立要求触摸高度≥48。保留系统字体光栅和图标线条的差异，不称逐像素一致。

## 样本与本地验收

新增自制6页真实PDF，包含竖页、横页、内置90°、小尺寸、非零裁切原点+内置270°、大尺寸矢量图及2048×1024嵌入图片；全部为合成内容，没有第三方文档。用PDF技能的ReportLab/pypdf生成，Poppler渲染六页后肉眼核对，接着由应用PDF.js实际阅读。源74962字节，SHA-256 `98b5c92f4f9e18c3462551de600249ce7cd820fbbcef36ff816dd3710f0488b6`，可用[生成脚本](../scripts/create-mobile-pdf-orientation-fixture.py)在新路径重现，拒绝覆盖旧文件。[六页预览](evidence/mobile-0.1.0/pdf-orientation-native-2026-10-26/fixture-all-pages.png)。

274项逻辑、17项打包保护与本批12组浏览器专项通过。新增6项逻辑检查四方向点/矩形/焦点往返、文字层尺寸及旧记录兼容。浏览器直接对实际字形包围区域采样画布深色像素，要求文字层落在真实字形上，再检查高亮覆盖实际Range；不仅断言文字节点存在。

专项包括所有四方向、已有批注不变、旋转后新选文与源坐标、源文件内置旋转/裁切/大图、150%重绘、精确重开、单页/连续、文档隔离与恢复。844px横屏纸宽812、320px竖屏纸宽288，阅读上沿仍是同一物理页内比例；320px/200%文字及180px短屏可滚动到全部方向操作。原文、草稿、源字节保持，无外部请求或浏览器错误。最终12组专项为[pdf-orientation-browser-1793000156626](evidence/mobile-0.1.0/pdf-orientation-browser-1793000156626/report.json)；固定构建42脚本/340组完整浏览器回归全部通过，见[browser-regression-1792998706581](evidence/mobile-0.1.0/browser-regression-1792998706581/summary.json)。运行期间不重建dist、不并行跑其他浏览器任务，且未出现浏览器错误。

## 候选与限制

首个浏览器候选1792997355591的高亮比对把span盒当成选文Range，两者含字体升降部的不同高度；改为实际Range矩形后四方向复验。原始失败保留，不能把测试预期错误称为产品数据错误。1792997530564为首个12组通过候选；1792997637696补查屏幕切换的原文比例；最后再核对关闭圆底和6px实页量测。

未宣称完成实体ARM、其他OEM/WebView、完整TalkBack、整个堆的低内存基准、密码/OCR、真实云提供器或iOS。后续先扩大真实复杂PDF与持续阅读组合语料，再评估密码文档的输入/错误/取消与持久边界，继续每项先设计再实现及真实页面核对。

## Android实际验收与产物

API29 / emulator-5558 / LongEdit_Compat_API29，WebView124。使用系统文件选择器从Downloads导入同一74962字节样本，新增文件LongEdit-Mixed-导入-23a26d9d-812a-44c1-8918-068ab7466d12.pdf；库从98到99，原98资料仍逐阶段摘要一致。原8草稿正文/修订、18文字导入文件、6包文件、6 PDF接收文件和95提供器文件保持，原有3项待接收保留。Downloads中的测试原件及一份库内副本保留供复查。

原生通过实际左右旋转、内置横置页转正、真实dispatchGesture两指200%、单指平移、终止进程重开、原生系统横竖屏/缩放/方向面板、逐页/连续、页面文字、裁切与大图进行核对；不使用CDP或应用内JS注入。旧的两条批注另行只读回看，sidecar字节保持。系统横屏实际为2280×1080（含侧边系统导航），对应应用可用区域不同于浏览器844px场景；不能冒称尺寸完全一致。

旋转/两指/平移后重开：固定原文矩形(0,650)-(1080,1570)，993600像素直接比较，差异0，未平移、掩膜或替换图像。[重开原始比较](evidence/mobile-0.1.0/pdf-orientation-native-2026-10-26/reopen-image-comparison.json)。原生横竖屏往返的同一区域有17044像素变化；实际四段文字行均下移1个物理像素（约0.36 CSS px），属于本次方向切换后的滚动舍入差异，不宣称同像素恢复。[方向切换原始比较](evidence/mobile-0.1.0/pdf-orientation-native-2026-10-26/orientation-image-comparison.json)。两组完整前后图保持，不用移位后图像作为通过证据。

首张原生options在系统界面仍收敛时截取，XML与瞬时画面不同步，未用作最终外形依据；等待稳定后补拍[options-stable](evidence/mobile-0.1.0/pdf-orientation-native-2026-10-26/options-stable.png)，核对纸面、72px卡片、关闭圆底和可滚动的方向区。初次横屏断言100%失败，是紧凑底栏有意隐藏比例；改为操作真实缩放入口和方向面板核对，未改产品，失败说明与原始截图保留。

两个ABI顺序构建，Windows符号链接限制使用已核对的复制打包；minSdk29/targetSdk36，版本序号1002047，开发debug签名，非正式发行包。来源记录如实保留旧HEAD与dirty状态，提交后不重写。

| 架构 | 字节 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 129632118 | `2cfea678f28af058e949e60b679f256b5bee91b3b56500f41de84fbc7edd6ac6` |
| arm64-v8a | 128985849 | `ecdef553e52b3bda660943b4e5df894a609daa33a09e30593ca47f6a0aa5b740` |

两包嵌入同一mobile-tdf1DSbt.js、mobile-D3RLAgLS.css及pdf-D9v26WHW.js；SO与构建记录一致，DEX不含测试服务/手势入口。最终x86包与实际安装摘要一致，见[产物核对](evidence/mobile-0.1.0/pdf-orientation-native-2026-10-26/artifact-consistency.json)。

原生24检查点通过，另有测试前基线；完整XML/PNG、真实双指完成回执和逐阶段摘要见[原生汇总](evidence/mobile-0.1.0/pdf-orientation-native-2026-10-26/summary.json)。已读取并恢复测试前实际辅助设置、系统自动旋转与user_rotation，核对后sync并正常关闭专用AVD，见[收尾](evidence/mobile-0.1.0/pdf-orientation-native-2026-10-26/closeout.json)。

额外外形差异：正文五个位置的6px验收不包含顶栏。既有PDF文档栏标题保留x72起点，生成图标题约x63，约9px水平差异；图稿卡片边缘约x18，实页沿用16px边距。图标线条与系统字体也未逐像素复制，原始对照完整呈现这些差异。

归档时工具自动审批策略拒绝临时预览文件清理命令（仅提供blocked by policy），未重试删除；tmp/pdfs/orientation-review保留并按生成中间产物精确忽略，不纳入提交，PDF原件和正式证据均已保存。
