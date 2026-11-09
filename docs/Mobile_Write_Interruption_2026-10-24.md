# 第十一批：保存失败与写入中断后的恢复

本批继续推进 M2 / A05 / A08 / T10，移动里程碑保持 `0.1.0-dev`，分支为 `codex/mobile-0.1.0-foundation`。代码与验收位于独立移动 worktree，桌面原工作目录未修改。

## 从用户任务决定页面

| 用户此时的想法 | 本批处理 |
| --- | --- |
| 保存失败了，我刚才写的还在吗 | 解释保存未确认、草稿仍保护；提示直接提供“查看保存恢复” |
| 我有多个文件夹，同名文件是哪一份 | 恢复列表与详情显示记录时的来源文件夹和时间；旧记录使用缓存名称，无需重新访问提供器 |
| 原文和修改稿分别是什么 | 默认查看“准备保存的草稿”，可切换“写入前的原文”；说明外部文件可能只写入一部分 |
| 这份恢复内容很长，我想核对最后一句 | 只渲染当前源码段，搜索完整所选版本；切换版本重建查询状态 |
| 先把内容拿出来，之后再处理原文件 | 两个版本分别另存到手机资料库，或导出包含两者的 JSON；原记录继续保留 |
| 另存也失败了怎么办 | 保留所选版本和记录，显示失败原因，允许重试 |

2026 年 10 月 24 日核对 [Joplin 官方冲突处理](https://joplinapp.org/help/apps/conflict/)：保留本地版本，供用户检查并取回需要的内容；[Obsidian Sync 官方排障](https://obsidian.md/help/Obsidian+Sync/Troubleshoot+Obsidian+Sync)提供自动合并或独立冲突文件选项。这些同步冲突材料支持本批“先保留可核对的两个版本”的设计推论；本批实际处理本地文件提供器异常，没有新增同步或自动合并，也没有安装竞品实测。

## 实现范围

原有原生流程在触碰提供器写入之前，用 `AtomicFile` 保存完整候选及可读取的原文；本批沿用该机制，补充来源文件夹名称和可发现的恢复入口。没有把私有恢复记录当作外部写入成功回执，也没有跳过原有签名、读回或草稿保护检查。

原生写入 / 另存 / 导出的 IOException 因果链包含 ENOSPC 时，显示提供器报告空间不足；其他失败仍说明保存未确认。恢复入口先完成当前草稿保护并退出文稿，再进入恢复列表；保存和返回期间不能重复触发。

短恢复内容继续使用只读文本框。超过既有阅读预算的内容复用 `SourceReader`，根据真实 SHA-256 隔离阅读位置；每次仅显示一个不超过 16,384 UTF-16 单元的源码段，支持完整版本内查找。中文、emoji 与 CRLF 保持原样，核对不会执行 Markdown / HTML 或加载链接。

本轮截图复核修复两个布局问题：错误文案和多个动作从同一行分开排布；长恢复页的查找 / 翻段工具随页面排布，正文保持至少 `12rem` 可读高度，避免只剩一行。查找输入有可见标签；详情和返回列表分别恢复标题 / 原条目的焦点。

浏览器预览适配器新增显式测试用的 `writeFaults` 配置；仅预览读该字段。预览的部分来源为前 8 个字符，用于页面任务；下述 Android 夹具实际提交前 8 个 UTF-8 字节，二者分别记录。

## 原生故障验收

使用专用 `LongEdit_Compat_API29` / `emulator-5558`、API 29、WebView `124.0.6367.219`，关闭 Wi-Fi / 移动网络。夹具是独立安装的 `DocumentsProvider` APK，没有进入产品包，也没有填满设备磁盘。两个新增场景不修改旧测试提供器的夹具文件。

### 提供器拒写 ENOSPC

系统选择器授权 `LongEdit Test nospace`；打开 `nospace-note.md`，插入 `NoSpaceDraft`，等待草稿保护后保存。提供器在打开目标之前抛出 ENOSPC，应用显示失败并提供恢复入口。核对结果：

- 原文仍为 55 字节，SHA-256 为 `544d75961d517d9899e68fd6da5c6d68a2c7f374af51543caf2d404791f69a2b`。
- 完整候选为 67 字节，私有草稿及新恢复记录均匹配。
- 通过失败提示进入记录；先选择原文，取消一次系统导出，原文选择及记录仍保留；随后原文和候选分别另存成功。
- 最终安装包复核仍能核对两个副本、私有草稿及原记录；没有覆盖或重置来源。

### 部分提交后进程被终止

`interrupted-note.md` 原文为 172,094 字节，包含中文、emoji、CRLF 和文末唯一标记。插入 `InterruptedDraft` 后候选为 172,110 字节。提供器通过真实可靠管道接收数据，仅将前 8 字节写入并同步到它的夹具文件，写入 attempt 标记后暂停读取，应用大块写入因管道容量阻塞。

保存中先记录界面，验收脚本在终止应用前核对完整私有原文、完整候选和草稿；随后仅强制停止测试应用，确认进程不存在，再释放对应 attempt 的提供器管道。`interrupted-protected.json` 和 `interrupted-killed.json` 分别记录这两个阶段，保存中没有成功回执。

重启后应用提示“上次的编辑还在”，并说明原文件已有变化。恢复的编辑正文包含 `InterruptedDraft`；进入恢复记录后可以查找 `TailRecover`，Android 界面树及截图包含真实文末“保留最后一句。”。通过系统选择器实际导出 JSON 到 Downloads，并分别另存两个版本。最终检查：

| 内容 | SHA-256 |
| --- | --- |
| 完整原文及原文副本 | `ffaf852d3137682c3a54f73da49dc823f172dec15445c5812d955d4e2c5bdbe0` |
| 完整候选、草稿及候选副本 | `9096fa6c029b17e8391b0de67c76ae186993ed98399a0c98741225f31d66159e` |
| 外部来源实际残留 8 字节 | `7df3ece286bcf0541b0ed8ca9bdc9ad1fe7617869af0426354e3ef312ad75064` |

导出内容包含两个完整版本；原私有恢复文件摘要不变，私有源草稿仍保留，外部来源仍为 8 字节。此结果证明该确定性部分提交场景的救回路径，不承诺第三方提供器的原子写入。

## 本地复现

```powershell
npm run test:mobile
npm run test:mobile-write-recovery-browser
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64

. ./scripts/enter-mobile-environment.ps1
./src-tauri/gen/android/gradlew.bat -p tests/android-storage-provider assembleDebug --max-workers=4 --console plain
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5558 install -r tests/android-storage-provider/build/outputs/apk/debug/longedit-storage-fixture-debug.apk

# 在系统选择器授权场景后，先运行 before。
node scripts/verify-mobile-write-interruption-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/write-interruption-native-2026-10-24 --scenario nospace --stage before
# 编辑 NoSpaceDraft，等待保护，保存失败后保存 nospace-failed.xml，再运行 failed。
# interrupted 使用同样的 before；编辑 InterruptedDraft，保存中保存 interrupted-saving.xml，立即运行 kill。
# 重启记录 interrupted-reopened.xml；应用中另存两份，实际导出到 Downloads，再运行对应 final。
```

阶段脚本严格限制专用 AVD 和 API 29，核对来源授权，拒绝跳过完整原文检查。界面操作使用 `mobile-emulator-ui.ps1`、ADB 与 UIAutomator。夹具超时为 60 秒，必须及时运行 `kill`；不自动清除应用数据或重置截断夹具。后续重复测试应准备新专用夹具状态，不能覆盖用户内容。

## 验证结果、首次失败与产物

57 项逻辑测试、60 组浏览器任务（既有 54 组与新增 6 组）、17 项打包检查通过。全套浏览器回归先完成，提示布局修改后重跑基础 / 边界 / 无障碍与恢复任务；恢复正文高度修改后再次重跑恢复任务。200% 字号检查包含可读正文高度、无横向溢出和所选 axe 规则，没有将自动规则等同完整 TalkBack 验收。

原生新脚本首次将 `ls` 输出按行解析，但设备返回空格分隔文件名，导致误报没有恢复记录；修正解析后核对通过。一次最终检查恰逢新包已构建、模拟器仍装旧包，安装摘要检查正确拒绝，覆盖安装最终包后两个场景均通过。另一次辅助定位等待 `1 / 1` 的可点击坐标，但查找已自动滚到正文而计数在屏外；最终按界面树中的计数和实际文末核对。中间 XML / 截图和构建记录保留，未把这些操作失败算作通过任务。

| 调试目标 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ARM64 | 126222297 | `dd2cd4215f7c1de9fe7338bfc157def837c7d91064eb5e0da2af7cf6b1c73fc4` |
| x86_64 | 126879582 | `173940b3b904bf06edcbba60d270ae77d173fcd900632514a21dc1c7e85fbbfb` |

两个 ABI 的 versionCode 均为 `1002015`，versionName `1.2.11`，开发身份和签名保持一致；构建记录保留实际 `7891164a + dirty` 状态。最终 x86_64 安装摘要与上表一致。Windows 符号链接受限时，构建脚本在 Rust 成功后使用既有验证复制回退，两架构均通过实际 ABI / ELF / 身份 / 签名检查。

开发包仍从 `release-artifacts/mobile-debug/<target>/` 取得。本轮 C 盘空间不足，先逐文件校验 SHA-256，将自有忽略产物迁到 `E:/Android/BuildCache/mobile-artifacts-foundation/`，原路径通过 junction 保持可用；旧文件保留在 `batch10-original/`。没有清理桌面资料或通过填盘构造故障。

汇总见 [verification-summary.json](evidence/mobile-0.1.0/write-interruption-native-2026-10-24/verification-summary.json)。截图、各阶段私有合成记录、两个最终核对和构建记录在同目录；浏览器完整报告在汇总所列目录。

继续待验收：真实 ARM64 厂商手机、真实云提供器、应用私有存储整体耗尽、断电、WebView 111 完整任务、完整 TalkBack 触摸探索、干净检出构建及 release。ARM64 本批完成构建和产物校验，未宣称真机运行；M2 仍按原退出条件推进。
