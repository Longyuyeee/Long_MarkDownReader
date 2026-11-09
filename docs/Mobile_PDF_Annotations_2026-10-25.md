# 第三十四批：PDF 选文、批注与阅读笔记

本批接续第三十三批的基础阅读，面向“读到重点→标记→记下理解→回看→整理笔记”的完整任务。开发继续在 `codex/mobile-0.1.0-foundation`；桌面检出不修改。两架构开发包序号为 `1002038`，仍为开发签名、最低 API29。

## 竞品与设计依据

2026-10-25 查阅官方公开资料，未安装竞品测试。[Acrobat Android 审阅指南](https://www.adobe.com/devnet-docs/acrobat/android/en/mv-review.html)描述选文评论、长按拖动标记、提交保存和点击批注编辑；该页讨论共享审阅，不能据此推断全部本地文件行为。[Xodo Android 文字标记](https://feedback.xodo.com/support/solutions/articles/35000202834-creating-a-text-markup-annotation)描述工具栏与长按快捷入口，以及拖动选区手柄。两者共同启发是让标记发生在阅读上下文中，再集中回看；本项目采用本机工作流，未照搬账号或共享审阅系统。

设计采用原版 PDF 上的长按选文、明确的“高亮与评论”操作、可滚动的底部批注面板。页评论不要求先选文字；颜色同时带文字标签。阅读笔记生成后另存新文件，避免把后续修改静默写入用户已经整理的笔记。

已使用 `imagegen` 技能和内置 `image_gen` 新建界面参考，未使用 CLI/API 密钥。参考：[设计图](design/mobile-0.1.0/pdf-annotations-v1.png)，[完整提示词及原始路径](design/mobile-0.1.0/pdf-annotations-v1-prompt.txt)。程序保留真实 PDF 页面内容与字体，不把参考图片铺进页面。最终实页、深色图、并排对照及几何数据在验收后归档。

## 实现与保存规则

- 原版画布上叠加同版本 PDF.js legacy TextLayer；系统原生选文产生引用文字及页面归一化矩形。换页、缩放或切换阅读方式会清除临时选区，已保存高亮随页面缩放。提取失败、扫描页等仍可以添加页评论。本批不提供 OCR、手写、区域绘制或 PDF 内嵌批注导出。
- 复用桌面 `PdfAnnotationDocument` schema v1 与 `<原文件名>.annotations.json` 命名。支持读取已有 highlight / area / comment，新增文字高亮、页评论、修改评论和颜色；保留载入对象的其他已有字段。位置使用当前显示页面左上角的比例坐标，与桌面 `PdfPage` 一致；未开放移动端旋转。已有 PDF 内嵌批注仍由画布显示静态外观，本侧录批注不等同 Acrobat 内嵌批注。
- 手机资料库中的 PDF 可写批注；外部 SAF 来源的批注可读，暂不写入。PDF 本身不改写。每次保存同时核对 PDF SHA-256 与批注原始字节 SHA-256，来源或版本变化则拒绝覆盖，保留当前输入。恢复前后内容一致性以原生文件摘要验收。
- Android 单 IO 队列串行处理；本机 sidecar 使用 AtomicFile 恢复中断写入、原子替换与读回核验。只允许库内规范路径，JSON 在前端和原生写边界均验证。限制沿用桌面：5 MiB、5000 条、每条 200 个矩形、引用和评论各 20000 Unicode 字符。界面 textarea 的 20000 UTF-16 上限更保守；列表每次显示 50 条，继续加载。
- 当前输入以完整库/路径身份暂存在独立 localStorage 草稿区；包括可见的尚未确认 IME 输入及保存基线，关闭/重启后恢复。草稿存储失败时保留表单并阻止离开。冲突后不自动把旧输入合并进新的批注；用户可核对、明确放弃输入后重新读取。保存过程中暂阻离开。
- 来源名称、大小、PDF.js 指纹或实际页码不符时停止绘制旧标记、定位、修改和生成笔记，并保留原文件。PDF.js 指纹沿用桌面约定，不声称它等同整个 PDF 的密码学摘要；同一打开会话的保存另核对完整字节 SHA-256。
- 阅读笔记先复验来源与批注版本，按页整理 1–200 条批注，保留引用、评论、原 PDF 路径、页码及批注编号。新建带 UUID 的 Markdown，使用既有受保护文本保存流程；可立即在真实阅读器打开。它是生成时快照，目前不包含可点击的 PDF 精确回链、筛选汇总、追加到已有笔记或桌面自动更新块。

## 本地测试与后续顺序

逻辑：schema/预算/坐标/Unicode/未知字段/草稿隔离与存储故障/Markdown 转义。浏览器：真实三页 PDF、TextLayer 选区、高亮缩放、中文 IME 保存与草稿重启、并发修改拒绝、配额失败、笔记打开、来源不匹配与损坏保护、深色、200% 字体和键盘高度。全量浏览器回归必须在固定构建完成后串行运行，不与构建交叉。

原生：专用 `emulator-5558 / LongEdit_Compat_API29`，复用只读 DocumentsProvider PDF。保护所有既有资料库文件、草稿和导入记录，真实导入、长按选文、保存 sidecar、页评论、杀进程恢复输入、冲突拒绝及新 Markdown 读回。结束恢复辅助服务状态、同步并关闭专用模拟器。ARM 仅构建/打包验证，不能代替真机。

下一批先完善批注删除/撤销、回链与笔记整理，再依现有 M4 计划推进剩余 PDF 工具；外部提供器写入、复杂排版/旋转/RTL、大文件选择性能、完整 TalkBack、真机与 iOS 仍独立验收。本批不表示所有桌面 PDF 能力迁移完毕。

## 验收结果

- 209 项逻辑通过：[日志](evidence/mobile-0.1.0/pdf-annotations-native-2026-10-25/logic-tests-final.txt)。类型检查随两架构构建通过。
- 同一固定构建合计 33 脚本 / 252 组浏览器通过：[组合验收索引](evidence/mobile-0.1.0/pdf-annotations-native-2026-10-25/browser-validation-summary.json)。首次完整串行运行前 31 脚本通过，旧 PDF 断言误计测字 canvas，修正为页面区域后顺序复验 PDF 阅读 11 组、批注 10 组；未声称单次完整全绿。批注最终报告在 [pdf-annotations-browser-1792868629089](evidence/mobile-0.1.0/pdf-annotations-browser-1792868629089/report.json)，无页面异常或外部请求。
- API29 原生 11 阶段通过：[摘要](evidence/mobile-0.1.0/pdf-annotations-native-2026-10-25/summary.json)，保护 79 个原有文件、8 份草稿、18 个文字导入文件及6个包文件；结束共82个资料文件，新增PDF/批注/阅读笔记均保留。真实触摸选文、原生版本冲突拒绝、杀进程恢复和实际 UTF-8 文件内容已核对。
- 17 项打包保护通过：[结果](evidence/mobile-0.1.0/pdf-annotations-native-2026-10-25/packaging-verification.json)。[双架构构建一致性](evidence/mobile-0.1.0/pdf-annotations-native-2026-10-25/artifact-consistency.json)核对 APK SHA、序号1002038与 SO 内最终内容哈希前端文件名。构建记录保留实际基线 `c5a2df591cc52ceb866369738dc4debe26742d28 + dirty`，没有改写成事后提交号。
- 已[恢复辅助设置并关闭专用模拟器](evidence/mobile-0.1.0/pdf-annotations-native-2026-10-25/lifecycle.json)，预览仍可访问。首次问题、恢复范围与原生 iframe 辅助树边界如实记录在[执行记录](evidence/mobile-0.1.0/pdf-annotations-native-2026-10-25/test-notes.md)。

最终[浅色实页](design/mobile-0.1.0/pdf-annotations-v1-implemented.png)、[深色实页](design/mobile-0.1.0/pdf-annotations-v1-dark.png)、[图稿/实现对照](design/mobile-0.1.0/pdf-annotations-v1-comparison.png)均来自可操作程序。核对顶部65px、摘要49px、左右16px及358px卡片、批注面板和保存反馈；实际面板约530px，占可用区63%，顶部比生成参考稍高，保留更大操作空间。触控尺寸、真实PDF内容与平台字体优先，底部说明可滚动，未宣称逐像素一致。

| 开发 APK | 字节 | SHA-256 |
|---|---:|---|
| `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | 128934909 | `5965a36b662de5efb4f7d513bb92678fb7d54386a38089ca79897165f920b299` |
| `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | 129581338 | `dd6f07aa70f26a5a811e12763da5eab5f31c17d6c4848b5ebaab02982cea003a` |

ARM包只完成构建/打包，原生操作验收使用x86专用模拟器；真机、完整TalkBack及iOS仍待验收。
