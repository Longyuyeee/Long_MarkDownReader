# 第十九批：公开 TextBundle 样本与 ZIP 兼容

在独立移动分支 `codex/mobile-0.1.0-foundation` 上继续附件迁移。用户任务是把其他应用的一篇笔记连同图片带进手机，核对后存成独立副本。本批发现并修复有效 TextBundle V2 的 `.zip` 后缀被入口拒绝的问题，补充公开许可样本、内容失败提示和实际系统投递验证。桌面工作目录未改动。

## 调研与设计依据

2026-10-24 核对以下官方材料。没有安装竞品，也没有把公开样本测试当作竞品实机往返。

| 来源 | 观察 | 本项目采取的设计 |
| --- | --- | --- |
| [TextBundle 官网](https://textbundle.org/)及 [V2 规范](https://textbundle.org/spec/) | 官方同时提供 TextPack 和完整 V2 目录的 ZIP 下载；后者附带 Finder 元数据 | 同时接受 `.textpack`、`.textpack.zip`、`.zip`，继续核对实际 ZIP、V2 元信息、正文与附件；文件名只是入口条件 |
| [Ulysses 导出帮助](https://help.ulysses.app/export?kb_language=en_US)及 [导入帮助](https://help.ulysses.app/en_US/integrations/123456-import-into-ulysses) | iPhone / iPad 在导出预览中选择格式和操作；TextBundle / TextPack 携带图片；文档说明 Bear 经 TextBundle 分享到 iOS Ulysses | 保留先看正文和图片、再确认完整存入的流程，明确只接收一篇笔记。这是资料分析，未宣称本项目已经在这些应用中往返 |
| [Notesnook 导入说明](https://notesnook.com/help/importing-notes/)及 [TextBundle 导入器](https://notesnook.com/help/importing-notes/import-notes-from-textbundle-files) | 当前导入器在 Web / Desktop，导入结果可同步到手机；公开测试库复用官方 TextPack | 不把桌面导入写成 Android 本机功能，也不把同一份样本计为多个独立来源 |
| [FSNotes 官方源码与说明](https://github.com/glushchenko/fsnotes/blob/ca305e464c469e6372cccba11b37d4a58bb51e2c/README_zh_CN.md) | 随应用提供 iOS TextBundle 初始笔记，包含图片、双链、公式与 Mermaid 源码 | 原文字节和图片完整保留；界面明确特殊语法按原文保留，阅读显示以当前能力为准，不借导入宣称完成双链 / 公式 / 图表功能 |

入口说明使用用户可理解的名称：选择 TextPack / ZIP 附件包。普通 ZIP、多篇笔记备份应回到来源应用导出单篇；失败后可查看原因并移除记录。确认存入后去掉完整容器后缀，生成 `公开示例.md` 等笔记名，每次主动导入具有独立 UUID 目录。

## 样本来源与可复现性

离线语料位于 [`tests/fixtures/mobile-external-packs`](../tests/fixtures/mobile-external-packs/README.md)，附 MIT 许可与逐成员 SHA-256 / Git blob 身份。只有两个独立的笔记内容：

1. [Shiny Frog 的 TextBundle 测试库](https://github.com/shinyfrog/TextBundle/tree/28027bff3e606ec3290e8c55fff340a826fedd41)：原始 `textpack sample.textpack`，4569 字节，Git blob `e3fa7ff977629320389b910feaab9d7365017dcd`。正文 221 字节，64×64 PNG。官网及 Notesnook 测试库中的 TextPack 内容相同，不能当作三个互不相同的案例。
2. [FSNotes 随应用分发的 iOS 初始笔记](https://github.com/glushchenko/fsnotes/tree/ca305e464c469e6372cccba11b37d4a58bb51e2c/Resources/Initial)：`info.json`、1467 字节正文和 128×128 PNG 的上游字节不变，由独立 Python `zipfile` 打包，固定时间戳，6295 字节。它不是从已安装 FSNotes 导出的包。

另有普通 ZIP、包含两篇笔记的 ZIP、去掉图片的 ZIP 三个负面样本，后两者从已许可样本派生。测试不调用产品 ZIP 写出器生成这些材料；Python 独立核对 ZIP / CRC、所有成员摘要及上游 blob 身份。

额外下载[官方完整 V2 ZIP](https://textbundle.org/downloads/example-bundle-v2.zip)，6756 字节，SHA-256 `3e39756bf50c8310680a32ee12399e05034101a0f4e681f5e3dc0eb1b35f3f00`。产品解析通过，正文和图片与 TextPack 一致，Finder 元数据经既有预算检查后忽略；见 [official-v2-zip-parser.json](evidence/mobile-0.1.0/external-packs-native-2026-10-24/official-v2-zip-parser.json)。未将此下载作为第三篇独立笔记，也未加入离线许可语料。

## 实现范围

- 浏览器与 Kotlin 原生入口均接受 ZIP 名称；即使分享 MIME 为 `application/octet-stream`，仍按实际显示名识别附件包。
- 正文目标剥离 `.textpack.zip`、`.textpack` 或 `.zip`，沿用固定 UUID 目标、独立目录发布、保存回执与移除记录保护。
- 路径、CRC、加密 / ZIP64 / symlink 拒绝、重复名称、实际展开大小、UTF-8、资源身份及图片解码约束保持生效。包与展开内容最多 13 MiB，正文 4 MiB，24 个附件，附件合计 8 MiB、单个 2 MiB。
- 仍只支持单篇 TextBundle V2 的 Markdown / TXT。V1、整库备份、任意 ZIP 浏览、特殊语法功能迁移均不在本批范围。
- `info.json` 中 creator / source URL 保持惰性，不自动访问或转为笔记正文。语料只进入独立测试 APK，不进入产品 APK。
- 原生结构核对与公共引用核对分层执行：缺失图片的包可在原生暂存为 ready，但打开详情后会被公共适配器拒绝，不能出现确认存入按钮。原生 ready 不等于已完成全部引用验收。

第十七 / 十八批的 `pack-import-wrongtype` / `Wrong ZIP` 是有效 V2 内容仅改名为 `Wrong.zip`，本批之后应接受；历史证据保留当时结果，不改写。当前普通压缩包拒绝测试使用真正只有 readme.txt 的 `not-a-bundle.zip`。

## 本地验证

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory E:/Android/BuildCache/external-pack-packaging-20261024
```

浏览器任务运行时不重建 dist。原生使用独立测试 APK 的 `ExternalPackFixtureActivity` 与 `external-*` 来源，经实际系统分享面板或明确的测试目标投递。`verify-mobile-external-packs-native.mjs` 要求显式 serial 和专用 `LongEdit_Compat_API29` / API29；按 before / received / reviewed / imported / removed / final 核对实际文件、原包、私有草稿和回执。移除必须在产品页面确认，不清空应用数据。

## 验收结果

89 项逻辑测试、121 组浏览器用户任务、17 项打包检查通过。完整浏览器索引：[browser-regression-1792823223119](evidence/mobile-0.1.0/browser-regression-1792823223119/summary.json)；新增 7 组兼容任务：[external-packs-browser-1792823353767](evidence/mobile-0.1.0/external-packs-browser-1792823353767/report.json)。浏览器通过实际文件输入核对原始公开包、正文和图片真实解码、同名不同容器独立目标、删除回执后笔记保留、重载、无外部元数据请求和 360px 深色 / 200% 字号。

原生任务索引：[summary.json](evidence/mobile-0.1.0/external-packs-native-2026-10-24/summary.json)。专用 `LongEdit_Compat_API29` / `emulator-5558`，API29 / WebView124.0.6367.219 / x86_64；实际 MemTotal 2,040,592 kB，详见 [runtime.json](evidence/mobile-0.1.0/external-packs-native-2026-10-24/runtime.json)。这是模拟器验收，不是真机性能结果，也未将本次运行写成断网验收。

| 原生用户任务 | 结果与证据 |
| --- | --- |
| ZIP 分享 | 实际系统分享面板选择 Long编辑，正文和 64×64 图片先核对，再确认存入 `公开示例.md`；完整原文 / 图片摘要等于上游。`share-chooser.xml / .png`、`shiny-*` |
| octet-stream 分享 | FSNotes 公开成员经 `.zip` 显示名接收，核对 128×128 图片，存入 `FSNotes笔记.md`；原文字节含双链、公式及 Mermaid 源码，完整图片摘要不变。`fsnotes-*` |
| 直接打开 ZIP | 有读取授权的 VIEW 进入同一核对流程，确认接收来源为 open；本次只核对后移除原包，没有重复发布笔记。`open-*` |
| 普通 / 多篇 ZIP | 实际内容校验失败，给出原因，没有确认存入按钮，也没有部分笔记或附件；可通过产品确认清理。`generic-*`、`multi-*` |
| 缺失图片 | 原生保留结构完整的 ZIP，公共引用检查显示具体缺失路径，界面没有确认存入按钮；资料库文件数量不变。`missing-reviewed.xml / .png / .json` |
| 删除回执 | 只在产品确认后移除本批六份导入记录，已发布两篇正文和两张图片继续保留。每个场景的 `removed.json` |
| 原有资料 | 所有阶段保护最初 49 个文件、8 份草稿及 3 条原包记录；收尾共 55 个文件（新增两篇正文、两张图片、两个归属标记），仍为原来的 8 份草稿和 3 条原包记录。`baseline-before / final.json` |

最终安装 APK 与 x86_64 构建副本摘要一致，见 [installed-apk.json](evidence/mobile-0.1.0/external-packs-native-2026-10-24/installed-apk.json)。收尾恢复原有无障碍设置 `null / 0`、同步并停止专用模拟器；9012 预览返回 200，见 [cleanup.json](evidence/mobile-0.1.0/external-packs-native-2026-10-24/cleanup.json)。没有重置应用数据。

两架构开发包为 `1.2.11 / 1002023`、`com.longyuye.mdreader.mobile.dev`、minSdk29 / targetSdk36，使用 Android debug key：

| 架构 | 字节数 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 127013130 | `f82cbbe09ca4c0c8efe3240d5ddafb7a5fd0ca7b0d91c6f839966b5ad59b035f` |
| arm64-v8a | 126355845 | `2fcfe30ec0dedf00b7bf5b22139da7a2023669511ffe07de5182d3a1c120303f` |

来源如实记录为 `8884158d2 + dirty`，未在提交后重写构建身份。x86_64 已实际安装验证；ARM64 完成构建、ABI / ELF / 原生库身份 / 版本和证书核对，尚未真机运行。

## 本次失败与修复

首次浏览器任务从顶层页面查找阅读标题，但标题在阅读 iframe 内；失败诊断保留在 [external-packs-browser-1792822251929](evidence/mobile-0.1.0/external-packs-browser-1792822251929/report.json)。改为 iframe 定位和图片实际解码等待后，新增任务及完整回归通过，没有为此改动阅读器。测试发送器首次 Java 编译将返回 void 的 `setClipData` 当作链式调用，改成独立语句后构建成功。

原生测试辅助首次等待了错误的清理提示文本，且关闭按钮在滚出视口后出现倒置的无障碍矩形；另一次手势进入长正文核对框自己的滚动区域，无法移动外层面板。辅助脚本改用实际文案、有效高度以及外层留白手势，再按原有记录继续核对，没有重复投递、清空记录或跳过正文检查。长文手势诊断保留为 `fsnotes-scroll-diagnostic.xml / .png`。

系统盘耗尽中断了首次新测试语料的写入。将本 worktree 已忽略的 JNI 构建输出移动至 E 盘并核对文件，原路径保留 junction；重新生成语料后逐文件摘要 / CRC / 上游 blob 身份全部核对通过。位置见 [generated-jni-location.json](evidence/mobile-0.1.0/external-packs-native-2026-10-24/generated-jni-location.json)。没有移动桌面源码或用户资料。

首次 ARM64 APK 的中间 merged JNI 库仍为旧摘要，源 Rust 库与 JNI 副本一致，现有门禁因此拒绝交付，见 [arm-first-build-rejected.json](evidence/mobile-0.1.0/external-packs-native-2026-10-24/arm-first-build-rejected.json)。按 [Gradle 文件系统监视说明](https://docs.gradle.org/current/userguide/file_system_watching.html)，复制打包回退关闭跨构建的文件系统监视（`--no-watch-fs`）；随后两架构重新构建并通过全部库身份校验。由 junction 后的更新与保留快照导致旧中间库是本次定位推论，没有把一次现象宣称为 Gradle 所有构建的通用缺陷。

## 后续顺序

优先验证 Android 真机与更多实际文件 / 云盘提供器、安装竞品后的实际导出往返；公开许可样本仅补充文件兼容证据。随后按主计划 M4 的顺序评估结构化文本等尚未迁移能力，同时继续完整 TalkBack 触摸和首版退出条件；iOS 需要对应主机，release 签名分发单独验收。本批构建不代表完整移动迁移完成。
