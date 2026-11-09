# 第三十九批：本机 PDF 书签

本批接续 PDF 长文导航，让读者一键记住当前页，按需要命名，再从书签回到原页。先补查移动竞品公开资料，生成界面设计图，再实现并逐项核对实际页面。书签入口放在现有导航内的第三栏，保持阅读页顶栏紧凑。

## 用户流程与竞品依据

2026-10-26 查阅 [Acrobat Android 添加书签](https://helpx.adobe.com/acrobat/mobile/view-manage-files/bookmark-page.html)、[管理书签](https://helpx.adobe.com/acrobat/mobile/view-manage-files/manage-bookmarks.html)及 [Xodo Android 页面跳转](https://feedback.xodo.com/support/solutions/articles/35000202863-jumping-to-a-page)。Adobe 管理说明提供查看、跳转、改名与删除；Xodo 列出页码、目录、书签和缩略图几种定位方式。只调查官方公开资料，没有安装竞品或测量性能；Xodo 说明更新于 2022 年，不能当成所有现版本界面的证明，Adobe 的 Android 说明也不作为 iOS 功能验收。

本项目据此设计“添加本页 → 可选命名 → 找回原页”。普通添加不强制输入；每个物理页一枚，按页码排序，当前页高亮。改名和删除使用可见按钮，避免必须发现长按手势。删除前确认，最近一次删除可撤销，且重开应用后仍保留。关闭导航维持原页、滚动位置与缩放；选择书签前往相应物理页顶并保留缩放。

## 图稿与实页核对

- [原始设计图](design/mobile-0.1.0/pdf-bookmarks-v1.png)、[完整提示词](design/mobile-0.1.0/pdf-bookmarks-v1-prompt.txt)、[状态和尺寸约定](design/mobile-0.1.0/pdf-bookmarks-v1-brief.md)。使用内置 imagegen，以上一批导航图为样式和几何参考生成新图；未修改上一批原图。
- 图稿采用真实九页 PDF、当前第 3 页，及“阅读从这里开始 / 安静阅读 / 复习与整理”三枚书签。实现截图由真实 PDF.js 和通过界面保存的书签生成，没有贴图或替换页面文字。
- 普通、空列表、名称编辑、删除确认、撤销、深色、旧版记录与窄屏分别截图，普通状态再做同尺寸并排对照。截图中的系统字体字形不能宣称与模型栅格字形完全一致。

| 核对项（390 × 844 应用区） | 实页 |
| --- | --- |
| 面板起点 / 标题 | y106 / 24px |
| 提示卡 | x16、y230、358 × 66 |
| 添加或编辑本页 | x16、y310、358 × 48 |
| 第一 / 当前 / 第三张书签 | y394 / 464 / 534，高 62，间距 8 |
| 卡片标题 / 页码 | 16px / 14px |
| 编辑和删除点击目标 | 至少 44 × 44 |
| 当前页提示 / 继续阅读 | y713.5 / y761.5，继续按钮高 49 |

添加按钮在图稿中约 39px，实现保留 48px 触控高度并缩短按钮后的留白，使卡片位置仍对齐。文字采用真实系统字体、16px 标题和 14px 页码，视觉上比图稿部分文字更大；这是可读性取舍，不将其写成像素完全一致。极短视口和 200% 字号采用可滚动内容区，优先保留关闭、切换入口和继续阅读，用户可滚动找到列表。

## 数据与失败恢复

书签保存在独立本机键 `longedit-mobile-pdf-bookmarks-v1`，按资料根、相对路径及完整文件 SHA-256 区分版本，并核对物理页数。书签不写入 PDF、桌面批注 sidecar 或 Markdown，也不承诺跨设备同步。文件内容变化时显示当前版本记录和只读旧版列表，不把旧页码套用到新文件；重新打开原字节可恢复原版本书签。

每个文件版本最多 200 枚，列表每次显示 50 枚；名称 1–80 个 Unicode 字符，未完成输入最多保留 160 个 UTF-16 单元。全部书签记录有 512KiB UTF-8 预算，不自动清理或截断其他记录。单次 localStorage 写入前比较当前整条记录，保留其他文件、根目录及旧版本数据；这是当前 WebView 内的版本保护，不是跨进程事务或云同步保证。

中文组合输入及未提交名称作为本机草稿保留，只有“保存名称”才应用新名称。草稿写入失败时保留输入，并拦住关闭、切换分类、返回资料库及跳转等可能丢失当前输入的动作。错误提供重新读取；当前记录冲突时仍保留输入，必要时由用户明确放弃。损坏记录、未来版本、页数不符、空间不足均显示错误并保留原数据，不伪装成空列表。撤销不覆盖较新的同页书签；名称编辑期间先保存或取消，再进行其他记录修改。

## 验收范围

浏览器专项使用真实九页 PDF，另用实际 201 页合成 PDF 验证 200 枚上限和 50 → 100 枚渐进显示。201 页夹具由既有三页样本重复生成，三个不同页面均渲染检查；夹具及原样本摘要保存在原生证据目录的 `fixture.json`，不导入模拟器资料库。

Android 验收只操作专用 API29 / x86_64 模拟器已有的九页 PDF，逐阶段比较 95 份资料、8 份草稿正文、18 份文字导入记录、6 份包文件及测试提供器 95 份文件。中文输入通过专用测试辅助 APK 的可访问文本动作完成：仅 SDK29 模拟器、开发包当前窗口和已聚焦可编辑输入框允许；接收器要求 shell 的 DUMP 权限，最多 160 单元。没有剪贴板、CDP、端口转发或来源事件采集，该辅助能力不进入消费者 APK。

初轮 TypeScript 检查发现未使用组件引用，已移除。浏览器初轮对阅读位置的断言错误地比较了自动更新时间，保留失败报告后改为比较页码、滚动比例和缩放；正式页面行为未因此放宽。候选 x86 包在“旧版”文案改为普通序号后重新构建，候选记录与最终记录分别保留。首次原生启动动作赶在应用可访问树就绪前执行，被测试辅助拒绝；待实际开发包窗口和控件出现后继续，没有绕过辅助的包名限制。

最终通过 250 项逻辑测试（新增书签 12 项）、17 项打包保护，以及同一最终构建的 **38 脚本 / 295 组完整浏览器回归**。书签专项 11 组覆盖真实操作、中文组合输入、关闭与切换保护、失败重试、记录冲突、持久删除撤销、旧版本区分、320/360/430 宽度、200% 字号、极短视口和 201 页上限。

Android API29 / WebView 124 / x86_64 原生 **16 阶段通过**，包含添加、中文命名、未提交草稿杀进程恢复、三页记录、删除确认与保留、删除后重开撤销、滚动查看第三枚、跳到第 7 页、关闭导航及再次杀进程恢复。安装包摘要与最终 x86 构建一致。原有 95 资料 / 8 草稿 / 18 文字导入记录 / 6 包文件，以及提供器 95 文件全部保持；没有新增原生 PDF、sidecar 或笔记文件。原有待接收 3 项内容保留。测试设置与启动值一致，设置核对后同步、正常关闭专用 AVD，并确认设备已离线。

证据：

- [同尺寸设计 / 实页对照](design/mobile-0.1.0/pdf-bookmarks-v1-comparison.png)及[可打开的对照页](design/mobile-0.1.0/pdf-bookmarks-v1-comparison.html)。
- [普通](design/mobile-0.1.0/pdf-bookmarks-v1-implemented.png)、[深色](design/mobile-0.1.0/pdf-bookmarks-v1-dark.png)、[空列表](design/mobile-0.1.0/pdf-bookmarks-v1-empty.png)、[名称编辑](design/mobile-0.1.0/pdf-bookmarks-v1-edit.png)、[删除确认](design/mobile-0.1.0/pdf-bookmarks-v1-delete.png)。
- [最终书签专项及几何记录](evidence/mobile-0.1.0/pdf-bookmarks-browser-1792985929551/report.json)、[完整浏览器汇总](evidence/mobile-0.1.0/browser-regression-1792986235665/summary.json)、[逻辑输出](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/logic-tests.txt)、[打包保护](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/packaging.json)。
- [原生 16 阶段汇总](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/summary.json)、[三枚书签原生截图](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/three.png)、[滚动后实际列表](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/undo-list.png)、[草稿恢复](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/reopened-draft.png)、[跳转原页](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/jump.png)、[收尾回执](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/closeout.json)。
- [失败、修正和人工视觉检查记录](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/review-notes.json)。最初浏览器报告及原生辅助拒绝、坐标尝试截图均保留，不将失败记录标成通过。

原生滚动检查中，第一次拖动起点落入固定底栏，未滚动；改用实际第一张卡片位置后，截图中三枚均完整可见。该 API29 / WebView124 可访问树仍报告滚动前坐标，几何断言因此失败；保留 XML 和截图，以实际截图及命名控件激活后第 7 页的结果复核。没有修改生产页面来迎合旧坐标。测试辅助的 findFocus 同样漏掉虚拟输入节点，已在相同聚焦/可编辑/EditText/开发包条件下遍历当前树补取，并验证无聚焦输入时被拒绝；不作为完整 TalkBack 验收。

## 安装包

两架构最终序号均为 `1002043`，`minSdk29 / targetSdk36`，版本名 `1.2.11`，使用开发调试签名。Windows 不允许符号链接时使用既有的校验复制打包路径；打包的 SO 与 Rust 输出摘要一致。

| 架构 | 字节 | SHA-256 |
| --- | ---: | --- |
| ARM64 | 128955197 | `a2fba5d4ef6914a50c060197b0eb9058b07b42d3d45fc4b2671ffeda214f4d5a` |
| x86_64 | 129601626 | `e1a0466af52f2f55345df105760f0d97466b7f90bf63ce3528c5943e5a1d1cda` |

安装包位于工作树 `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` 和 `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk`。此目录被 Git 忽略，构建摘要保存在证据中。两个 APK 的当前移动 JS/CSS/PDF 动态资源路径已在原生库中确认，详见[产物一致性](evidence/mobile-0.1.0/pdf-bookmarks-native-2026-10-26/artifact-consistency.json)。ARM64 完成构建与静态打包核对，原生交互只在专用 x86_64 模拟器上执行，没有据此宣称实体 ARM 真机或 iOS 已验收。

## 后续顺序

继续按 M4 推进 Android 系统 PDF 打开与分享接收，再审计剩余高级 PDF 能力。书签仍为本机功能；嵌入式 PDF 书签写回、批量管理、跨设备迁移、真实云提供器、实体 ARM 设备、完整 TalkBack、iOS 和正式签名发布分别验收，不由本轮模拟器结果代替。
