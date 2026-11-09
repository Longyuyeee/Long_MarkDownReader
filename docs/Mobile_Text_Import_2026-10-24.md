# 第十四批：把单个文件带进手机资料库

继续使用独立移动 worktree 和 `codex/mobile-0.1.0-foundation` 分支。桌面原工作目录不参与修改。里程碑仍为 `0.1.0-dev`，本批完成系统文件选择器中的单文件导入；其他应用的「打开方式 / 分享」接收入口留给下一批复用。

## 从用户任务决定流程

| 用户的想法 | 界面与行为 |
| --- | --- |
| 手机中已有一个 Markdown / TXT，想放进资料库 | 「我的资料」提供「导入 Markdown / TXT 文件」，系统选择器只读取选定文件 |
| 想先确认选对了文件 | 完整文字先保留为私有待导入记录，详情只读预览，再点「存入手机资料库并打开」 |
| 还想直接使用原文件夹和图片 | 导入面板提供选择原文件夹的入口；明确单文件只复制文字，保留引用，附件不会一起复制 |
| 退出或重启后想继续 | 从「设置 → 文件导入记录」找到待导入文字，读取完成后不再依赖来源提供器 |
| 又导入了同名文件 | 每次导入采用独立 UUID 目标，不覆盖已有笔记；同条记录重试复用固定目标 |
| 已经写入，但最后确认时空间不足 | 仍保留完整待导入内容和目标位置；重试核对同一文件，不再生成重复笔记 |
| 导入过的笔记后来改过了 | 已完成记录打开笔记最新版本，不用旧导入文字覆盖后续编辑 |
| 不再需要此条记录 | 先确认再移除；源文件和已存入的笔记都保留，尚未存入的文字会明确提示被移除 |

## 竞品与平台资料

2026 年 10 月 24 日核对官方资料，未安装竞品，没有以竞品说明代替本项目实测：

- [Obsidian Android](https://obsidian.md/help/android)区分设备存储与应用存储的资料库，建议需要跨应用访问时选设备存储。本项目明确当前「手机资料库」存放在应用内，另提供原文件夹授权与文字导出；不承诺卸载后保留应用内数据。
- [Notesnook 导入说明](https://notesnook.com/help/importing-notes/)支持 Markdown / HTML / TXT 导入，但导入器目前位于 Web / 桌面端，再同步至手机。设计推论是单文件进入手机也应有明确入口与可继续的步骤；未声称 Notesnook Android 已支持该导入器。
- [Joplin 导入导出说明](https://joplinapp.org/help/apps/import_export/)中的 Markdown 文件 / 文件夹导入步骤针对桌面端；其 [Android 更新记录](https://joplinapp.org/help/about/changelog/android/)已有 JEX 导入，因此不能把桌面 Markdown 步骤推断成“移动端完全不能导入”。本批也不将单份文本导入称为完整备份恢复。
- [Markor DocumentActivity 官方源码](https://github.com/gsantner/markor/blob/master/app/src/main/java/net/gsantner/markor/activity/DocumentActivity.java)提供外部文件进入编辑器的参考。后续「打开方式 / 分享」必须复用已核对的私有导入流程，避免接收外部文件时替换未保存编辑。
- [Android SAF 官方文档](https://developer.android.com/training/data-storage/shared/documents-files)区分 `ACTION_OPEN_DOCUMENT` 单个文件和 `ACTION_OPEN_DOCUMENT_TREE` 文件夹。本批只申请选定文件的临时读取，不取得持久授权，不保存外部 URI，不写回来源。

## 存储与边界

Android 在串行 IO 线程中使用 `AtomicFile` 保存 `text-imports-v1` 记录。读取源流之前写入 `preparing` 元数据；流读取完成、严格 UTF-8 解码并核对后，才持久保存 `ready` 完整文字、真实字节数和 SHA-256。进程在读取中断时，重开显示未完成，不能冒充已保留全文。空文件允许导入；BOM、混合换行、中文和 emoji 不规范化。拒绝零字节、错误 UTF-8、非 `.md` / `.txt` 及超过 4 MiB 的实际流；不信任提供器声明的大小。

首次存入之前持久写下固定的安全目标名；使用既有本机写入保护和完整回读。如果该目标已经存在，只接受与受保护内容完全相同的字节，其他内容报冲突并保留记录。成功确认后，记录标为 `imported`，释放临时全文，保留摘要及本机位置。若回执持久化失败，完整 `ready` 记录继续存在，重试核对已写入目标。已完成的记录只打开当前笔记；笔记已被删除时提示读取失败，不复活旧内容。

最多保留 100 条记录和 12 份待导入全文；达到限制时需要先存入笔记或明确移除不需要的记录。列表分批显示，长文本复用分段源码阅读与全文查找。损坏的记录仍可查看失败说明并确认移除，不自动删除记录或源文件。浏览器使用明确的 localStorage 预览适配器，其容量和故障注入不等于 Android 文件系统实测。

## 本地复现

```powershell
npm run test:mobile
npm run test:mobile-text-import-browser
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory E:/Android/BuildCache/file-import-packaging-tests-20261024

# 仅专用 API 29 模拟器，分别记录操作前、完整待导入、终止进程、存入或失败后的事实。
node scripts/verify-mobile-text-import-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/file-import-native-2026-10-24 --case safe --stage before
# 通过真实系统选择器选择 LongEdit Test import-safe / Import.md。
# ready 阶段核对全文与摘要；kill 阶段先核对全文，再只停止专用应用。
```

新增独立测试提供器 `import-*` 只包含合成资料，来源均只读：正常 / 同名不同内容 / TXT / 非法编码 / 4 MiB + 1 / 不可读 / 错误扩展名。读取审计用于证明完成暂存后重启与存入不再读取来源；不读取用户真实文件。

## 验收结果

69 项逻辑测试、82 组浏览器任务和 17 项打包检查通过。完整浏览器回归在页面接入后执行，最后只修正导入详情的错误前缀显示，再重跑该模块的 12 组任务；其他 12 套没有使用这段提示。索引在 `docs/evidence/mobile-0.1.0/file-import-native-2026-10-24/browser-regression-summary.json`。大文稿旧报告不含 `passed` 字段，索引注明退出码 0、7 组断言及无错误 / 外部请求 / axe 违规的判断依据。

专用 `emulator-5558` / `LongEdit_Compat_API29`，API 29 / WebView 124，关闭默认网络，真实系统选择器和独立合成只读提供器：

| 原生任务 | 实际结果 |
| --- | --- |
| 取消系统选择器 | 不制造导入记录或本机笔记，原有笔记和草稿保持完整 |
| 暂存 Markdown 后关闭进程 | 先核对 60 字节全文、SHA-256 和私有记录，再只终止专用应用；重开可继续 |
| 暂存后来源离线 | 在测试提供器私有目录设置拒读标记，重开存入 60 字节本机笔记；来源读取次数相对该次基线仅增加一次，存入不再读取提供器 |
| 同名第二份 Markdown | `Import.md` 的 83 字节内容生成不同目标；两份均与各自来源完全相同 |
| UTF-8 TXT | BOM / 中文 / emoji / 混合换行及图片引用完整存入 60 字节本机文件 |
| 非法编码、4 MiB + 1、离线、错误扩展名 | 保留失败记录与明确状态，不制造本机笔记；来源字节完全不变 |
| 已完成记录再次打开、移除确认 | 再次打开同一 TXT 笔记，没有重复文件；取消移除保留记录，确认后仅移除记录，源文件和已存入笔记保持完整 |

对正常、同名、TXT、非法编码、超限、离线、错误类型和取消共 8 个场景，在最终安装包运行 `final`，核对实际来源、受保护记录、本机笔记、既有草稿、无默认网络及安装包 SHA-256。随后单独验证 TXT 回执再次打开和移除；因此最终取消基线中包含当时尚未移除的 TXT 回执，移除后的事实另记于 `txt-removed.json`。完整回执持久化失败、目标冲突、记录损坏、中断元数据和容量上限的故障注入属于浏览器适配器测试，没有声称在原生设备制造同样的磁盘故障。

首次失败也保留边界：浏览器回执故障注入最初误命中了先前已完成的记录，导致错误地在实际文件写入前拒绝；改为只匹配本次 UUID 后验证“已写文件、回执失败”的完整重试。首轮全回归遗漏预览 URL 环境变量，连接 9010 被拒，设置为现有 9012 后重跑全部。原生首个验收脚本对 `exec-out` 的 shell 引号处理有误，枚举到了错误输出，完整记录断言随即失败；改为明确 `ls / find` 参数并重新建立取消 / 正常基线后再验收。选择器抽屉动画曾导致脚本过早滑动，改为新界面树定位合成来源再继续。再次打开回执时，一次多余的滑动令脚本误点文件夹入口；按当前界面树直接操作可见按钮后通过，未据此修改产品导航。产品上的开发错误码前缀已移除，最终包实际检查为中文说明。

本次模拟器启动时检测到此前独立测试服务仍启用；使用已保存的原设置先恢复，再以新状态文件启用。收尾恢复服务为原来的 `null / 0` 并停止专用 AVD。该服务不读取事件内容、不启用触摸探索，不属于产品包；这些检查不代替完整 TalkBack 触摸验收。

## 开发安装包

两种 ABI 都通过编译与打包核对；原生运行仅使用 x86_64。应用 ID 为 `com.longyuye.mdreader.mobile.dev`，版本码 `1002018`，基础版本 `1.2.11`，移动里程碑 `0.1.0-dev`。使用开发签名，不是 release。

| ABI | 字节数 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 126901726 | `ce4d799a82801e2620f94b68484b55db189a353e0f9e7208eec06b3ec87b941c` |
| arm64-v8a | 126244441 | `ce8bf762dd52c20a4f42ede2be2b8dc7fc02705be84203d4d2b0632a739bf123` |

构建记录保留真实来源 `0f65cc7c + dirty`，本批提交在验收后建立，没有将产物伪称为该后续提交的干净构建。Windows 的符号链接限制由已有脚本执行摘要核对后的复制打包，不绕过编译失败。证据中保存两份构建记录与打包结果；APK 位于 `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` 和 `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk`。

本批不包含附件打包、跨设备同步、外部分享接收、其他文件格式、iOS 或正式发布。物理安卓手机、真实云盘提供器、完整 TalkBack 触摸、断电和整机磁盘耗尽仍按原计划验证。
