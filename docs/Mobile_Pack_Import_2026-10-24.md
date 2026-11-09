# 第十七批：把笔记和附件一起带进手机

在独立移动 worktree、分支 `codex/mobile-0.1.0-foundation` 继续实现 `0.1.0-dev`。本批衔接上一批 TextPack 导出，完成应用内选择、核对、持久保留、独立存入、重试和记录清理。系统打开 / 分享 `.textpack` 的入口仍按下一阶段接入；桌面原工作目录未修改。

## 用户任务与页面顺序

| 用户在想什么 | 对应行为 |
| --- | --- |
| 我想把另一台设备上的笔记和图片带进手机 | 资料页「导入笔记与附件」、设置「附件包导入记录」进入同一个流程 |
| 这个包里是什么，会不会直接改动已有笔记 | 选择后先保留完整包，展示只读正文、附件名称、大小和图片预览，不自动存入 |
| 包里缺了图片，或者看起来不正常 | 在确认存入前检查包结构、内容引用和实际图片解码；缺失或不支持时说明具体原因 |
| 核对到一半离开应用了 | 通过保留记录继续；完整暂存的包不依赖源文件继续在线或原来的临时授权 |
| 同名笔记会覆盖原来那份吗 | 每份导入记录有固定 UUID，存入独立、带原始名称的目录；同名包互不覆盖 |
| 失败后再点一次会不会多出一份 | 重试核对同一目标；完整目录已存在但回执未记上时确认原目标，不重复创建 |
| 已经改过导入的笔记，再打开记录会怎样 | 已完成记录读取当前本机笔记，保留之后的编辑，不用旧包覆盖 |
| 可以清理记录吗 | 确认后只清理私有暂存包和记录；源文件及已存入的笔记、附件继续保留 |

页面直接使用现有移动弹层、焦点约束和相对字号；长正文复用分段源码阅读器，图片由用户显式查看，其他文件作为附件携带，不在导入核对中执行或打开。

## 本轮竞品与规范依据

2026-10-24 核对官方资料，未安装竞品，也不宣称竞品实机往返验证。

- [Bear 导入帮助](https://bear.app/faq/import-your-notes/)列出 TextBundle V2 / TextPack，说明 iOS 从侧栏更多菜单进入导入，且有名称选择。对应本项目的资料管理入口，并保留外层包名作为独立笔记名称。
- [Notesnook TextBundle 导入帮助](https://notesnook.com/help/importing-notes/import-notes-from-textbundle-files)说明文字、图片与文件附件、单文件 TextPack 传递，以及忽略 Finder `__MACOSX` 元数据。本项目据此保留完整附件，有限兼容系统元数据；页面所示 Web / 桌面步骤没有被推断为 Android 本机导入已可用。
- [Joplin Android 更新记录](https://joplinapp.org/help/about/changelog/android/)包含移动只读状态、避免同步覆盖正在输入的内容等改进；[导入导出说明](https://joplinapp.org/help/apps/import_export/)区分 JEX 备份和其他交换格式。设计推论：导入应有独立确认及目标身份，不能把迁移、备份和编辑原文件混作一个动作。本批不实现 JEX 或整库恢复。
- [TextBundle V2 规范](https://textbundle.org/spec/)规定正文、元信息与相对 `assets/` 资源。解析支持单个 `.textbundle` 顶层目录或 ZIP 根直接放置这些文件的常见布局；支持 STORED / DEFLATE。不将任意 ZIP 文件当作资料库恢复包。
- [Android ZIP 路径穿越说明](https://developer.android.com/privacy-and-security/risks/zip-path-traversal)指出 ZIP 库不会替应用验证 `../`，并要求安全、空白的输出位置。这里先在内存中受限读取，输出仅使用已验证的资源路径与应用生成的私有目录，完成后整体提升到新的资料库目录。

## 实现与边界

Android 使用独立 Kotlin 读取器，浏览器预览使用独立 TypeScript 读取器，没有新增第三方解压依赖。两侧先核对中央目录和本地头，再解压：拒绝绝对 / 父级 / 反斜杠 / 设备路径、重复 / 大小写 / Unicode 规范化别名、文件目录冲突、重叠成员、符号链接、加密、多卷和 ZIP64，检查真实展开大小及每个成员 CRC。没有把 ZIP 名称直接拼到用户选择的目录中解压。

包文件与展开总量最多 13 MiB、96 个 ZIP 条目；路径最多 1,024 UTF-8 字节、8 层、单段 200 字节。正文最多 4 MiB、UTF-8 且不含零字节；一份 `text.markdown` / `text.md` 或 `text.txt` 与 V2 `info.json`，元信息最多 64 KiB。附件最多 24 个、单个 2 MiB、合计 8 MiB。每张 PNG / JPEG / WebP 最多 800 万像素，总计 1,200 万像素，并进行实际图片解码。Finder 元数据只在有限大小内核对后忽略。未知格式、多个正文、HTML 正文和缺失资源不隐式降级导入。

ZIP / 文件写入边界由原生独立验证；Markdown 引用通过共享解析器在 Android 适配器核对，提交前再次针对同一受保护包摘要验证。原生暂存状态 `ready` 表示包已结构化保留，列表称「等待核对」；引用缺失时详情页明确阻止确认，不将暂存状态当作所有内容已可存入的承诺。TXT 不解释 Markdown 字面语法。

原生先持久元信息，再原子写入完整 ZIP、核对 SHA-256 并解析，记录保存在 `pack-imports-v1`。读取中断而 ZIP 完整时可以重新核对；缺失或损坏时保留记录说明失败，不伪造空正文。最多保留 6 份包，完成存入后也保留，用户可主动移除。

确认存入时保存固定目标身份，在私有 UUID `.pending` 目录原子写入正文、所有附件和所有者标记，逐字节核对后一次目录重命名进入手机资料库，并同步目录。任何未完成状态保留源包。回执中断时，重试检查相同目标的标记及全部内容；已有其他内容时拒绝覆盖。已完成的记录直接打开本机最新文件，移除记录只处理该 UUID 的私有元信息、ZIP 与暂存目录，不处理资料库目录。

保留原始 BOM、中文 / emoji 和混合换行，正文相对 `assets/` 路径无需改写。阅读排版仅去掉开头 BOM 再解释 Markdown，修复首行标题显示为字面 `#` 的问题；保存、导出和草稿中的原始 BOM 不变。

浏览器预览用单次 localStorage 事务同时发布整份笔记和附件，再单独记录回执，覆盖回执失败重试；这不是原生文件系统实现。实际原生失败不回退到浏览器存储。

## 本地复现

```powershell
npm run test:mobile
# 生成器只接受全新输出目录；Python 标准库独立生产正常及危险 ZIP 夹具。
python scripts/create-mobile-pack-import-fixtures.py E:/Android/BuildCache/LongEdit-PackImport-Valid-20261024
npm run test:mobile-pack-import-browser
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64

node scripts/verify-mobile-pack-import-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/pack-import-native-2026-10-24 --stage before
# 通过实际系统选择器选择专用提供器 pack-import-* 合成来源，再分阶段核对。
# ready / kill / imported / failed / removed / lose-receipt / latest / final
```

浏览器需设置 `LONGEDIT_MOBILE_PREVIEW_URL=http://127.0.0.1:9012/mobile.html`、可用 Playwright 路径；夹具路径可用 `LONGEDIT_PACK_IMPORT_FIXTURE` 指定。构建不得和浏览器回归并行，避免替换 dist。原生脚本限制专用 API29 AVD、显式 serial，校验安装 APK、原包字节、全部既有笔记和草稿；`lose-receipt` 是明确的私有测试记录故障注入，不等同于声称捕获了真实电源中断。

## 实际验收

84 项逻辑测试、105 组浏览器用户任务和 17 项打包检查通过。最终完整浏览器索引：[summary.json](evidence/mobile-0.1.0/browser-regression-1792816807994/summary.json)；本批新增 10 组：[report.json](evidence/mobile-0.1.0/pack-import-browser-1792816915017/report.json)。覆盖独立 Python 产生的 DEFLATE / STORED 包、图片实际解码及阅读、完整正文与二进制、同名独立存入、回执失败重试、保留后续编辑、确认清理、损坏 / 缺失 / 越界 / symlink / CRC / 伪造展开长度、配额、6 条保留记录上限、360px / 200% 字号与无障碍规则。大文稿旧报告不含 `passed`，索引按成功退出和实际完成断言记录依据。

原生使用专用 `LongEdit_Compat_API29` / `emulator-5558`，API29 / WebView124，无默认网络。每阶段核对原来 17 个本机文件、7 份草稿的内容、来源签名和代次。完整记录在 [pack-import-native-2026-10-24](evidence/mobile-0.1.0/pack-import-native-2026-10-24/safe-final.json)。独立 Python 正常包为 947 字节，包含 70 字节有效 PNG、6 字节二进制文件和 0 字节空附件；中文 / emoji、BOM、CRLF / CR / LF 逐字节保留。

| 原生任务 | 实际结果 |
| --- | --- |
| 选择后核对，不立即存入 | 完整包已持久保留，显示只读全文与 3 个附件，可实际预览图片；资料库还没有该 UUID 目录 |
| 暂存后终止、来源离线 | 先核对包摘要，再终止开发应用，并用测试提供器离线标记阻止再读；重启后从记录存入，文字与附件全部匹配 |
| 完整目录已存在，回执待恢复 | 对已验证目录的测试元信息明确注入 `ready` 状态并重启，模拟重命名后回执丢失；重试复用原目录，仍只有一份笔记 |
| 同名不同内容 | 第二个同名来源携带不同尾行，存入新的 UUID 目录，第一份笔记和所有既有资料不变 |
| TXT | BOM、混合分隔、中文 / emoji 精确保留，Markdown 示例作为纯文字，不要求不存在的示例图片 |
| 8 类异常来源 | 路径穿越、symlink、CRC、实际展开 32 MiB 但声明 1 字节、非法 UTF-8、缺失引用图片、错误扩展名、提供器离线均阻止存入；记录可清理，没有半份资料库目录 |
| 真实应用导出再导入 | 原生将已导入笔记导出到 Downloads，再通过系统选择器导回；独立 Python 校验实际 ZIP / CRC，3 个附件与原字节完全相同，正文只做原来导出流程的引用改写 |
| 清理与取消清理 | 取消保留记录；确认后移除私有原包，原先存入的正文及 3 个附件均继续保留 |
| 之后的本机编辑 | 明确只修改本批生成的合成本机笔记，重新从已完成记录打开，读取新内容，不用旧包回写；原包和其他资料未改 |
| 取消系统选择器 | 返回原面板，前后的保留记录 ID 完全相同 |

实际原生往返包为 1,138 字节、SHA-256 `47e5ec15d9e3c2230089b3c065c7ac588e7c1e5194d31b9cc455f1fd73f30e52`，见[往返检查](evidence/mobile-0.1.0/pack-import-native-2026-10-24/roundtrip-imported.json)及实际包 `native-roundtrip.textpack`。恢复 / 异常任务保留其实际安装摘要；最终包另复核同名与 TXT、应用实际往返、清理、后续编辑及全部保留内容。

首次逻辑夹具将 Buffer 与 Uint8Array 的类型差异误当作内容差异，已修正为按相同字节类型比较。另发现旧合成 PNG 的 IDAT 校验错误；本批更换为具有正确 PNG 块校验的样本，补实际解码与阅读检查。原生截图发现 BOM 导致首行 Markdown 标题显示为字面文本，修正排版后重新构建两架构并完成最终回归；原文 BOM 与换行仍保留。回执窗口与后续本机编辑属于明确的测试状态注入，普通系统选择、存入、导出、导回和取消均为实际界面操作。

两架构开发 APK 为 `1.2.11` / `1002021`，minSdk29 / targetSdk36。构建来源记录为 `05b89cd2 + dirty`，如实保留：

| 架构 | 字节数 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 127012498 | `b114f1ad8a16eb8701de42a74ab491fff34d72b0177147447770c2f6960d7a90` |
| arm64-v8a | 126355213 | `8da0c5ddf9a13c61423e692c58ab0e984f20bfbc9468ecff5d87a2b4a9fc198b` |

实际安装操作为 x86_64 模拟器；arm64 完成构建、APK / ELF / 签名检查。真机、真实云盘、竞品安装往返、完整 TalkBack 触摸、iOS 和 release 尚待专项验收。测试结束已移除本轮提供器离线标记、恢复模拟器无障碍原设置并停止专用模拟器；浏览器预览继续保留。

## 后续顺序

1. 在已验证的暂存与核对流程上接 `.textpack` 的系统打开 / 分享入口，收到包时保护当前写作上下文。
2. 实测更多生产应用导出的包和真机提供器，继续资源预算、长路径及并发边界验收。
3. 按主计划扩展移动格式与编辑能力、完整 TalkBack 触摸、iOS 构建和 release 分发；不以这一批完成当作桌面功能已全部迁移。
