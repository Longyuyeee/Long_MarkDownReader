# 第三十三批：PDF 阅读、查找与位置恢复

日期：2026-10-25。分支 `codex/mobile-0.1.0-foundation`，Android 开发包序号 `1002037`。本批接续源码格式迁移，完成 PDF 只读阅读的第一段工作；批注编辑、阅读笔记和高级 PDF 工具仍有后续验收条件。

## 桌面审计与用户任务

桌面 `src/views/PdfView.vue`、`src/components/PdfPage.vue` 及 `pdfReadingContinuity.ts` / `pdfReadingNote.ts` 已有阅读、页面、笔记及副本操作体系，但依赖桌面文件路径、IPC、范围读取和大量桌面面板。移动端此前只有文本 / 图片 / 附件存储接口，不能把 PDF 二进制送入文本编辑会话，也不能直接缩小桌面整页。

本批先让用户完成：选中一份 PDF → 阅读原版页面 → 到达指定页面或找到文字 → 放大细节 → 返回资料库 → 重启后继续。只读阅读不出现“保存”或“编辑”入口。原有笔记和未保存草稿始终保留。

| 一手公开资料 | 查阅内容 | 本批决定 |
| --- | --- | --- |
| [Acrobat 移动阅读模式](https://helpx.adobe.com/acrobat/mobile/view-manage-files/viewing-modes.html) | 分别提供单页、连续、阅读和全屏模式，阅读重排有适用限制 | 先明确提供单页原版与独立页面文字；不把文字提取称作保持排版的重排 |
| [Acrobat Android 页面导航](https://www.adobe.com/devnet-docs/acrobat/android/en/navigatesearch.html) | 翻页与输入页码定位是独立操作 | 翻页、页码和缩放放在底部，页码直接打开定位表单 |
| [Xodo 移动工作流](https://xodo.com/blog/how-to-use-xodo-pdf-reader-and-editor-mobile-app) | 从文件 / 最近进入阅读，再使用缩放、查找和页面显示工具 | PDF 沿用现有资料库和最近记录；阅读时保留精简工具，不再显示全局底栏 |
| [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/api.js.html) 与仓库内锁定版本 | loading task、worker、字体 / CMap 及渲染生命周期 | 使用已有 `pdfjs-dist 6.2.108` 的 legacy 构建，按实际版本类型实现，不新增或升级依赖 |

以上为官方公开说明，没有安装竞品实测，不比较其性能、隐私、定价或字节保真程度。

## 已实现范围

- 资料库新增“导入 PDF 阅读”，使用真实系统文件选择器；选中后将独立副本存入手机资料库。选择前说明复制行为及 20 MiB 上限，取消不创建文件。已授权文件夹中的 `.pdf` 也允许打开。
- PDF 采用独立二进制 `readPdf` / `importPdf` 接口。检查扩展名、文件头、大小与副本回读；UUID 名称避免覆盖，原文件不写回。前端对字节数与 SHA-256 再核对。文本 `requireText` 仍不接受 PDF。
- 一次显示一页，适合宽度、100% 至 300% 的按钮缩放、上一页 / 下一页与输入页码。只有一个画布，背板不超过 400 万像素、单边不超过 8192、DPR 不超过 2；这不是对全部 PDF 图像解码内存的承诺。
- 页面文字按 PDF 提取顺序展示，支持系统字号与选文；不保留原排版。没有文字的页面说明可能为扫描图，不伪装成 OCR。
- 文内查找逐页提取，按页列出命中数与首个上下文。最多检查 500 页；逐页累计达到约 2 Mi UTF-16 单元或 1000 处命中阈值后停止。每页最多计数 1000 处，所以整页计数可能使总数略超阈值，仍明确标为部分结果；每页提取展示上限 20 万字符。显示实际检查页数；预算耗尽标为部分结果，失败不报成完整无匹配。停止 / 关闭 / 改词或退出会使延迟结果失效。
- 阅读位置按资料库与相对路径隔离，保存文件指纹、页码、页内相对位置和缩放，最多保留 100 条。滚动后约 200ms 记录，退出及后台时刷新；不承诺任意瞬间杀进程均无位置损失。重开指纹变化的文件时明确从首页重新阅读。
- 原版保留白色纸面，深色只改变界面背景与工具。渲染器允许已有静态批注外观，未创建表单 / 链接交互层，也不提供批注修改。
- 极短视口将翻页和缩放切为同一底栏中的两个可见工具组，保留触摸目标。Android 返回先关闭查找 / 定位，再返回资料库。

worker、185 个字体 / CMap 资源随 Android 应用打包，页面渲染不依赖公网资源。测试使用内嵌中文字体的真实合成 PDF，另用包含 URI 注释的仓库样本验证没有建立链接交互层或外部请求。PDF 文内查找当前在单份文档内进行，未并入资料库全文索引。

## 出图与外形对齐

使用内置 `image_gen` 的新图生成模式创建阅读页，随后用真实 Vue 组件和 PDF.js 画布实现。图只用作参考，没有将参考图覆盖在页面上。

- [设计图](design/mobile-0.1.0/pdf-reading-v1.png) · [完整提示词](design/mobile-0.1.0/pdf-reading-v1-prompt.txt)
- [设计 / 实页对照](design/mobile-0.1.0/pdf-reading-v1-comparison.png) · [并排 HTML](design/mobile-0.1.0/pdf-reading-v1-comparison.html)
- [浅色实页](design/mobile-0.1.0/pdf-reading-v1-implemented.png) · [深色实页](design/mobile-0.1.0/pdf-reading-v1-dark.png)

对照来自资料库中实际打开的“阅读指南.pdf”，PDF 内容由独立测试夹具绘制。截图只裁去浏览器预览提示条，不替换产品控件、PDF 内容或字体。以 390 × 844 核对顶部文档栏、PDF 身份 / 页面文字入口、16px 边距、358px 纸面、位置状态及底部翻页 / 缩放。PDF 字体和页面内容以原文件为准；工具保留真实触摸高度，不追求生成图中较小按钮的逐像素一致。

## 本地验证与首次问题

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
node scripts/test-mobile-pdf-reading-browser.mjs
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
. ./scripts/mobile-pdf-reading-ui.ps1 -Serial emulator-5558
```

每次固定最终构建后串行运行浏览器任务，不能在全量浏览器期间重建静态目录。`create-mobile-pdf-reading-fixture.py` 可在新路径复现三页英文 / 中文夹具；已用 Poppler 渲染检查全部三页。Poppler 报出系统 Symbol / ArialUnicode 替代字体提示，但实际三页中英文字形、间距、页码均已目视确认。

首次类型检查发现锁定的 PDF.js 6 已不接受旧 `isEvalSupported` 参数，proxy 也不再提供旧 `destroy` 方法；改用实际版本参数及对应 loading task 清理资源，没有压制类型错误。模拟器发现 Vue 合成输入尚未更新 model 时查找按钮被禁用；修正为显式查找读取当前可见输入，并等待已有 watcher。确认同一个候选词不再清空已得到的结果，真正改词仍取消旧任务。增加浏览器 composition-start / input / composition-end 检查，并在最终原生安装包上不加空格复验。

候选 PDF 和候选阶段保留。最终复验重新导入独立文件，将候选文件纳入保护基线；没有通过清空应用数据或修改源文件绕过失败。原生还发现外层聚焦 / 命名和 busy 分组导致辅助树不暴露正文，以及边界滚动比例被严格校验拒绝。已让文字自身可聚焦，移除外层分组，并归一化回弹 / 小数比例；新增边界测试。最终辅助树实际含中文正文，末端滚动、后台与进程重启均通过。完整过程见[候选与测试记录](evidence/mobile-0.1.0/pdf-reading-native-2026-10-25/test-notes.md)。

## 最终验收与安装包

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 移动逻辑 | 202 项通过，包含 10 项 PDF 逻辑 | [最终输出](evidence/mobile-0.1.0/pdf-reading-native-2026-10-25/logic-tests-final.txt) |
| 最终构建全量浏览器 | 32 脚本 / 242 组全部通过 | [完整总表](evidence/mobile-0.1.0/browser-regression-1792865488009/summary.json) |
| PDF 浏览器专项 | 11 组；真实 worker、英文 / 中文、合成输入、来源变化、URI 注释、浅深色、200% 和极短视口 | [逐项结果](evidence/mobile-0.1.0/pdf-reading-browser-1792865977594/report.json) |
| Android 打包 | 两实际 ABI 的 17 项保护检查通过 | [打包结果](evidence/mobile-0.1.0/pdf-reading-native-2026-10-25/packaging-verification.json) |
| 最终安装包原生 | API29 / x86_64 / 约 2 GiB / WebView124，13 阶段全部通过 | [原生总表](evidence/mobile-0.1.0/pdf-reading-native-2026-10-25/summary.json) |
| 环境恢复 | 辅助服务恢复为 null / 0，资料同步，专用 AVD 已关闭；预览返回 200 | [生命周期](evidence/mobile-0.1.0/pdf-reading-native-2026-10-25/lifecycle.json) |

最终原生基线为 78 个资料文件、8 份草稿、18 个文字回执文件、6 个包文件；包含之前 76 个资料文件和本轮保留的两份候选 PDF。最终新增一份独立 PDF，共 79 个资料文件；全部基线内容、草稿内容 / 签名 / revision 和回执 / 包文件摘要不变。只读来源与三个副本的 SHA-256 均为 `85f40067324cb3c861766eed8b77fd0f337b3626eb253d85846252ee435c932a`，原 PDF 为 31363 字节。重启后实际控件恢复第 3 / 3 页及 150% 缩放；取消选择器没有新增副本。

最终外形几何为：390 × 844，顶部 65px，身份栏 49px，纸面 `(16,126,358,562.5625)`，位置状态 `(0,693,390,34)`，底部工具 `(0,727,390,117)`。保留真实 44px 以上触摸目标及源 PDF 字体；参考图中文字和按钮并不作为像素级产品行为。详见[几何记录](evidence/mobile-0.1.0/pdf-reading-browser-1792865977594/alignment.json)。

| 架构 | 调试 APK | 字节数 | SHA-256 |
| --- | --- | ---: | --- |
| ARM64 | [app-arm64-debug.apk](../release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk) | 128910717 | `8739835c1f2f326de4e09346440e25816601529df32e3c6d98bd63ae93a98dbe` |
| x86_64 | [app-x86_64-debug.apk](../release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk) | 129557082 | `b9d58815a11b655fbcbdf90d6cd217e80f3d209c07092426a3dabc252336f6d7` |

包名 `com.longyuye.mdreader.mobile.dev`，versionName `1.2.11`，versionCode `1002037`，minSdk29 / targetSdk36，开发调试签名。ARM64 已完成构建与打包核对，实际运行验收为 x86_64 专用模拟器。构建时来源如实记录为 `e66fc6967f2a593984c632b3d04649c78453240c + dirty`，不回写成后续提交哈希；见 [ARM64](evidence/mobile-0.1.0/pdf-reading-native-2026-10-25/build-aarch64.json) 与 [x86_64](evidence/mobile-0.1.0/pdf-reading-native-2026-10-25/build-x86_64.json) 构建记录。所有产品修正后重新构建两 ABI、执行完整浏览器回归，并重新导入和完成最终 13 阶段原生核对。

## 后续顺序

下一批继续 PDF 选文、批注 sidecar 与阅读笔记，先审计桌面数据兼容和页内定位。内置目录 / 缩略图、连续滚动、双指手势、命中位置高亮、密码文档、PDF 系统分享接收、OCR、夜间反色、页面 / 表单 / 元数据等高级操作继续单独排期。更大复杂 PDF、真实云提供器、外部文件夹原生 PDF 任务、真机、完整 TalkBack、iOS 与正式签名发布尚未验收。
