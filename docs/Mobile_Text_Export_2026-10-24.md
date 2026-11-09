# 第十三批：把手机上的文字带走

移动分支为 `codex/mobile-0.1.0-foundation`，本批继续推进 Markdown / TXT 的移动使用闭环。工作位于独立移动 worktree，桌面原工作目录未修改；里程碑仍是 `0.1.0-dev`。

## 用户任务与设计依据

| 用户的想法 | 本批行为 |
| --- | --- |
| 想把这份笔记交给电脑或其他编辑器继续写 | 阅读、编辑页的文档操作都提供「导出当前内容副本」，通过 Android 系统保存窗口选择位置 |
| 刚写的内容还没保存，导出的是哪个版本 | 打开导出面板时固定当前完整文字，说明包含未保存内容；不将原笔记标为已保存 |
| 图片能否一起带走 | 明确只导出文字，保留图片和附件引用；附件打包继续独立推进 |
| 取消后内容会不会丢 | 原文件和私有草稿保留；正常取消仅清理本次导出快照，可再次选择位置 |
| 保存窗口打开时应用被关闭 | 在打开系统窗口前保护完整导出快照，重启后从「保存恢复记录」取回独立笔记 |
| 目标位置拒写，或者写完却读不到 | 不报告成功，保留完整快照，提供重新选择位置和恢复页入口 |

2026 年 10 月 24 日核对的官方材料：

- [Markor 官方仓库](https://github.com/gsantner/markor)说明 Android 本地文本文件可供其他纯文本软件使用，并提供向其他应用分享文件的入口。本项目据此优先补齐可带走的文字文件。
- [Joplin 导入导出](https://joplinapp.org/help/apps/import_export/)将包含笔记及元数据的 JEX 备份与其他导出格式区分。设计推论是将「单份文字副本」和「完整备份 / 附件迁移」明确分开；该通用页面没有被当成 Joplin Android 支持某种导出的实机证明。
- [Obsidian 本地库与远端库](https://obsidian.md/help/Obsidian+Sync/Local+and+remote+vaults)用于区分本地文件和同步。本批导出不提供自动同步。
- [Android SAF 官方文档](https://developer.android.com/training/data-storage/shared/documents-files)说明 `ACTION_CREATE_DOCUMENT` 的另存流程及同名自动编号。应用仍在写入前检查目标和源身份，并确认新目标为空。

以上为官方资料调研，没有安装竞品，也没有根据竞品声明认定本项目通过测试。

## 实现与内容保护

`captureTextExport` 固定文稿身份、当前完整文本、来源签名、草稿代次和未保存状态，生成独立 UUID。UTF-8 文本上限沿用 4 MiB，按字节核对；不格式化、不解析 Markdown、不规范化换行。文件名限制为单层安全名称，按 Unicode 字符及 UTF-8 字节截断，保留 `.md` / `.txt` 扩展名。

Android 在串行 IO 线程中使用 `AtomicFile` 写入 `purpose: text-export` 的恢复记录并回读，之后才启动系统保存窗口。重试只复用身份和完整候选内容相符的导出记录，不覆盖普通保存恢复记录。系统返回结果后，再从持久记录读取候选内容，而非依赖页面当时的输入。

写入前拒绝指向同一来源文档的结果；目标必须可读且为空。写入后关闭流，再完整回读核对字节。成功或取消只清理本次导出快照，清理失败仍显示记录保留；异常及进程中断保留快照。源文件、来源签名、草稿内容和代次不因导出而提交或清除。准备导出时的正常草稿刷新可能更新草稿保护时间。

这些检查不使 SAF 具备原子比较交换能力，无法消除提供器在检查后的并发修改，也不证明所有第三方云盘行为。用户可能在失败目标处看到空文件或部分副本，应用不自动删除该目标。

恢复页保留普通写入记录的原文 / 草稿核对流程；导出记录单独标为「导出副本」，详情为「取回这次导出」，说明原笔记未被此次导出修改。可生成完整手机资料库副本，也可导出完整 JSON 记录，原记录继续保留。

浏览器使用明确的预览适配器，通过实际 Blob 下载生成文件。页面只说明「下载已发起」，不能将下载发起当作浏览器文件系统的成功回读。原生失败不会回退到浏览器存储。

## 本地复现

```powershell
npm run test:mobile
npm run test:mobile-text-export-browser
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory E:/Android/BuildCache/text-export-packaging-tests-20261024

node scripts/create-mobile-text-export-fixture.mjs E:/Android/BuildCache/LongEdit-Export-20261024
# 生成器只接受新目录；将两份合成文本放入专用模拟器 Documents 子目录。
# 通过实际系统选择器授权 LongEdit-Export-20261024，再打开 Portable.md。
# 等待完整编辑器，只输入一次 ExportDraft，不保存原文件。
node scripts/verify-mobile-text-export-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/text-export-native-2026-10-24 --case cancel --stage before
# 按界面操作；选择器打开时用 picker，取消后用 cancelled。
# 其他场景采用 safe / txt / unconfirmed / nospace / alias / kill。
```

验收脚本仅针对 `LongEdit_Compat_API29` / API 29，要求显式 serial。终止进程的 `kill` 阶段先检查完整持久快照，且只停止 `com.longyuye.mdreader.mobile.dev`。脚本不清空应用、重置夹具或删除导出文件；重复测试应另备新夹具。实际构建记录保留构建时的来源提交和 dirty 状态。

## 验收记录

64 项逻辑测试、70 组浏览器用户任务（既有 64 组及本批新增 6 组）、17 项打包检查通过。最终撤回试改后，重新跑完全部浏览器任务；检查了实际下载、错误重试、恢复页及 360 CSS px / 200% 字号。完整运行索引在 `browser-regression-summary.json`；大文稿测试的旧报告格式不含 `passed` 字段，索引注明其成功退出及 7 组已完成断言的判断依据。

原生使用专用 `LongEdit_Compat_API29` / `emulator-5558`、API 29 / WebView 124；没有默认网络。合成源文的完整 SHA-256：Markdown 为 `9704c14b7a3925a912b27951e9669770bdb45963dc90a061801f37dd61a7db7e`（125 字节），TXT 为 `48dfbd43420194d4b72142f80f7613ec303f2811efe4d4e79beb0ebebeefc26c`（50 字节）。Markdown 只插入一次 `ExportDraft`，完整候选为 136 字节，SHA-256 为 `aff47401e1d10b59ae7b62d491adafa10789e15a139cffa002a13b4b9d3ae31c`。

| 场景 | 实际结果 |
| --- | --- |
| 取消系统保存窗口 | 已保护快照在正常取消后清理；原文及未保存草稿保留 |
| 导出未保存 Markdown | Downloads 实际文件与 136 字节候选完全相同；原文、草稿内容 / 来源签名 / 代次不变，界面继续说明尚未保存原文件 |
| 未确认目标 | 独立提供器通过真实管道接收但丢弃字节，回读仍为空；应用拒绝报成功，保留完整记录，并取回独立手机资料库笔记 |
| ENOSPC 后重试 | 目标在打开写入时拒绝；完整快照保留。同一面板重新选择健康提供器后，实际目标为完整 136 字节，仅本次导出记录清理 |
| 返回已有文件 ID | `create-alias` 故意返回非空 `Existing.md`；应用在发送候选字节前拒绝，原有 56 字节中文文件未变，候选可完整取回 |
| 保存窗口中进程终止 | 脚本先核对完整私有快照，再只终止专用应用并确认其进程结束；重开后恢复页显示新导出记录，取回完整独立笔记，记录和草稿继续保留 |
| 未编辑 TXT 导出 | Downloads 实际文件精确为原来的 50 字节，包含 BOM、中文 / emoji、混合换行；未制造草稿，也未改动源文件 |

最终产品包重新验证恢复草稿的菜单、Markdown 成功导出、进程中断恢复及 TXT 成功导出，随后对 7 个场景运行 `final`：核对实际内容、保留记录和副本、原文、草稿、离线状态及最终安装 APK 的摘要。此前拒写 / 异常句柄任务也包含在本批原生记录中；其中用于定位界面问题的中间包没有修改原生导出逻辑。最终包已撤回所有无效的界面试改，摘要与本批首次正常构建一致。

证据目录为 `docs/evidence/mobile-0.1.0/text-export-native-2026-10-24`，含逐阶段 JSON、原生界面 XML、截图、完整浏览器索引和两个构建记录。测试脚本通过 ADB 读取私有合成资料用于核对；产品仍使用原生适配器和实际系统授权。

## 原生界面检查的诊断与首次失败

恢复草稿后打开菜单时，截图正常，但逐次 UIAutomator 检查曾只返回 WebView 根节点。依次尝试提前移走编辑焦点、改用读屏隐藏、暂时隐藏文稿以及将弹窗移出应用容器，均未解决；这些产品试改全部撤回。`nospace-navigation-root-only.png`、`after-aria-only-menu.xml`、`after-hidden-workspace-menu.png` 保留对应观察。

独立测试 APK 新增默认禁用的 `FixtureAccessibilityService`，仅保持连续无障碍连接；不读取、保存或发送事件内容，不开启触摸探索，也没有网络权限。在连接持续存在并重新打开应用后，原有弹窗结构的菜单完整出现在真实原生树中，后续导出、错误恢复和系统窗口操作也可检查。`final-original-menu.xml` 是最终产品界面的记录。这一结果用于区分该模拟器的瞬时检查连接问题，不等同所有设备或完整 TalkBack 触摸验收。测试结束恢复原来的服务设置。

首次原生验证器只识别 `primary:Documents`，实际系统选择器授予了 `home:` 文档 URI；修正验证器对同一明确合成目录的识别后重试，没有修改产品目录身份。系统返回键在保存窗口内先返回上层目录，取消测试因此检查真正返回应用后的取消回执。进程被终止后，系统保存窗口仍可能留在任务前台；本次关闭该孤立窗口，再重新打开应用核对恢复记录，没有清空应用或源文。

浏览器早期断言还修正了原稿 CRLF 会被编辑器保留、草稿保护时间可以刷新、恢复操作本身会产生新代次的预期，并限制测试初始化代码只在顶层页面执行，避免向沙箱阅读 iframe 读取 localStorage。失败尝试和中间运行报告均保留，不重复计入通过数量。

## 构建产物与本地空间

| 调试目标 | 字节数 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 126897886 | `74fbe47a2ebeb96c120e2879976472c2bcdcef0513b6e59465718f46203d1a55` |
| ARM64 | 126240601 | `80599875775e68e449be8d84daeb840e4a08d8e8a0b26a95544589ae31e7348b` |

升级编号为 `1002017`，应用 ID 为 `com.longyuye.mdreader.mobile.dev`，基本引擎版本仍为 `1.2.11`。构建记录真实注明 `2144a03d` 加未提交变更；本批提交在构建和验收后形成。它们是开发调试包，ARM64 已校验包内架构和 ELF，但未在 ARM 真机运行。

本机 C 盘初始只剩约 65 MB。移动 worktree 自有的 `node_modules` 先复制到 `E:/Android/BuildCache/mobile-node-modules-foundation/node_modules`，逐一核对 31,966 个文件 SHA-256；原 C 盘目录先在同卷改名，再建立原路径的 junction，原始文件逐个移至 E 盘备份，没有递归删除或处理桌面工作目录。随后逻辑测试、前端及两架构构建均从此映射运行。`dependency-relocation.json` 记录路径与摘要核对完成状态。

## 继续推进的范围

附件打包迁移、直接接收其他应用分享的文件、多格式阅读与编辑、真实手机和厂商输入法、完整 TalkBack 触摸探索、真实云提供器以及 release 签名 / 升级 / 分发仍需后续验收。已生成调试 APK 不等于 M2 或全部平台功能完成。
