# 第十五批：从其他应用带入文件和文字

继续使用独立移动 worktree 与 `codex/mobile-0.1.0-foundation`；桌面原工作目录未参与修改。里程碑仍为 `0.1.0-dev`。本批把 Android「打开方式 / 分享」接入已有单文件导入流程。

## 从用户任务出发

| 用户的想法 | 本批行为 |
| --- | --- |
| 文件管理器里有一份 Markdown，想用 Long编辑处理 | 系统打开方式可选 Long编辑，先接收为独立待导入文字；核对后明确存入本机笔记 |
| 浏览器中选了一段文字，想留下来 | Android 分享面板可选 Long编辑，保留原文和链接，不自动抓取网页 |
| 正在写一半，另一个应用又分享进来 | 顶部提示有内容待核对，保留当前输入和焦点，不自动打开弹窗或替换文稿 |
| 想马上处理收到的内容 | 点「查看收到的内容」时先保护并关闭当前草稿；保护失败则留在编辑页，收到的记录仍待处理 |
| 又收到第二份内容 | 独立记录分别保留，不替换正在核对的第一份；查看一条只确认该条提示 |
| 应用重启或系统重复递送同一次内容 | 已暂存文字可继续；相同递送编号复用原记录，不重新读取来源，不制造重复笔记 |
| 收到文件但来源没给读取权限 | 明确提示重新分享或选择文件；不制造空笔记，不把失败说成成功接收 |
| 有有效内容，也有另一次接收失败 | 错误说明与可核对文字分别保留，选中有效内容不会清掉失败原因 |

## 竞品和平台依据

2026 年 10 月 24 日核对官方资料，未安装竞品：

- [Notesnook 分享帮助](https://notesnook.com/help/mobile-integration/share-things-from-other-apps)说明 Android / iOS 分享入口可接收文字、链接和文件，经保存创建新笔记，也提供追加到已有笔记的选择。本项目据此优先完成“收到 → 核对 → 明确存入独立笔记”，追加操作继续后续设计。
- [Markor 更新记录](https://github.com/gsantner/markor/blob/master/CHANGELOG.md)包含从其他应用分享文件进入 Markor 的功能；[DocumentActivity 官方源码](https://github.com/gsantner/markor/blob/master/app/src/main/java/net/gsantner/markor/activity/DocumentActivity.java)包含外部文件打开和 Intent 归一化。本项目接收后先保护独立文字，不写回分享来源。
- [Android 接收其他应用数据](https://developer.android.com/develop/ui/compose/sharing/receive)建议只声明实际支持的 MIME 类型、检查不可信数据、在主线程之外处理 IO，并让用户确认收到的内容。页面中的 Compose 导航示例没有被当成本项目采用 Compose；本项目使用原生 Activity / Tauri 插件与 Vue 界面。

这些资料用于形成产品设计，不是竞品实机验收，也不证明本项目完成了竞品全部能力。分享链接本批仅保留链接文字，不做网页剪藏、附件打包、自动同步或追加已有笔记。

## 接收流程和保护边界

系统入口位于已有 `LauncherActivity`，保留 WebView 兼容性检查。仅注册 `ACTION_VIEW` 的 `content:` 文件，以及 `ACTION_SEND` 的 `text/plain`、`text/markdown`、`text/x-markdown`；未注册任意 MIME、网络地址或批量分享。入口只向主 Activity 转交校验过的单个 URI / 纯文字及读取授权，不转交任意附带操作、写授权或任务标记。

文件内容必须通过临时 `content:` 授权读取。拒绝设备路径、网络打开地址、自己的 FileProvider、多个文件及不一致的多个 URI；`EXTRA_STREAM` 与单个 ClipData URI 均可接收。同一 URI 同时出现在合法字段中不会被当作两份文件。收到错误类型或大小仍由既有完整流与扩展名校验拒绝。直接分享的文字使用严格 UTF-8 编码，保留原有字符和换行；不使用分享主题自动改写内容或拼入网页正文。

存储插件在串行 IO 线程复用 `text-imports-v1`：读取文件前先写 `preparing` 元数据，完整读取、解码、核对后才写 `ready` 全文。新增 `source` 与未查看标记；正文从不通过网页事件传递，也不将外部 URI 存入记录。原生事件只通知界面刷新摘要；冷启动和恢复时也读取持久状态，事件竞态会合并为下一次刷新，不定时扫描全文。

每次从系统入口递送生成独立 UUID，并直接作为私有记录编号。重放该编号时只读取既有记录，不再读取来源或创建另一条记录；不同的用户分享操作仍是独立记录。同一记录后续存入、失败重试及已完成笔记的再次打开继续复用第十四批保护流程。读取中断的 `preparing` 记录显示未完成，不声称已经保留全文。

界面只提示待核对数量，不自动导航。显式查看前调用既有草稿保护与关闭流程；失败时留在原编辑器，收到的条目不确认。接收失败而尚未建立全文记录时，在本机持久保存错误说明。打开面板后错误和其他收到的内容分别展示；查看 / 确认提示不会删除记录、源文件或已有笔记。

本批仍沿用 4 MiB、UTF-8、MD / TXT、12 份待存全文与 100 条记录上限。过多排队任务会提示重新分享。提供器一直不返回、整机断电、真实云盘和真实空间耗尽仍需要后续设备验证；完整文字的保护承诺从成功完成暂存开始。

## 本地复现

```powershell
npm run build:mobile
npm run test:mobile
npm run test:mobile-incoming-browser
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory E:/Android/BuildCache/incoming-packaging-final-20261024

# 仅专用 LongEdit_Compat_API29 / emulator-5558；独立合成发送器与只读提供器。
# 通过实际系统打开方式 / 分享面板选择 Long编辑。
node scripts/verify-mobile-incoming-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/incoming-native-2026-10-24 --case cold --stage before
# 接收后 received；先核对全文才可 kill；重开并明确存入后 committed。
```

`ShareFixtureActivity` 只发送固定合成资料；不读取用户文件、不发送网络消息。`mobile-emulator-incoming-sender.ps1` 仅用于专用 AVD 的合成按钮定位，拒绝其他设备。没有用 shell 直接伪造文件访问授权；文件接收使用实际跨应用 Intent / ClipData 临时授权。

## 验收与安装包

69 项逻辑测试、89 组浏览器任务、17 项打包检查通过。完整 Vue 界面回归包含新增 7 组外部接收任务，检查焦点、草稿保护失败留页、多个未查看条目、重载继续、失败提示与其他有效内容共存，以及 360px / 深色 / 200% 字号。随后仅补充原生显式读取授权检查，重新构建两种 ABI 并重复打包检查；最终原生包验证正常新授权 URI 与真正无授权 URI。索引为 `incoming-native-2026-10-24/browser-regression-summary.json`；大文稿旧报告不含 `passed`，索引记录成功退出和 7 组断言 / 无错误 / 无外部请求 / 无 axe 违规的依据。

原生使用 `emulator-5558` / `LongEdit_Compat_API29`，API 29 / WebView 124，无默认网络。通过独立合成发送器的真实跨应用 Intent 验证：

| 场景 | 实际结果 |
| --- | --- |
| 系统打开方式冷启动 | Long编辑被系统解析为目标，完整 62 字节 Markdown 暂存，未自动创建笔记 |
| 暂存后终止专用应用 | 先核对全文再终止进程，重开记录仍完整，明确存入后独立文件与原文一致 |
| 编辑中从系统分享面板接收文件 | 明确点击系统面板中的 Long编辑；返回后编辑器仍显示 `NativeDraftMarker`，来源签名 / 草稿代次 / 内容保持；点查看才关闭编辑器进入核对 |
| ClipData URI 与纯文字分享 | 均得到独立完整记录；纯文字中的中文、emoji、混合换行与原始链接不变，没有抓取网页 |
| 错误编码、实际 4 MiB + 1、离线、错误扩展名 | 保留失败记录，不生成笔记，不更改来源 |
| 全新正常授权 URI | 最终权限检查仍允许完整接收，全文与只读来源完全一致 |
| 无读取授权、多个文件、网络 URI | 最终包显示明确的接收失败说明，不建立全文记录或笔记；失败说明可与之前有效条目并存 |
| 同次递送重放 | 使用既有 UUID 再递送，不增加记录、笔记，也不再次打开来源流；提供器读取审计摘要前后相同 |

共 13 个原生场景保存 `final`，核对最终安装 APK 摘要、已有笔记、已有草稿语义和无默认网络；拒绝场景在查看并确认错误前保存，之后的错误确认不被伪称为仍持久保留未读错误。最终又显式继续原来的新建草稿并查看完整 `NativeDraftMarker`，该用户操作会正常更新草稿代次；接收过程的代次检查已在这一步之前完成。原生只使用合成资料，浏览器草稿配额失败属于替身注入，没有声称真实填满设备磁盘。

首次失败与修复：浏览器最初用精确文字匹配包含提示子节点的段落，并将 CodeMirror 当作 textarea 读取，导致测试超时 / DOM 接口断言；改为正确控件读取后，私有草稿全文仍按精确换行核对。草稿保护失败提示补充了明确的“已留在编辑页”。有效条目与另一次失败并存时，初始错误曾被选中条目的任务状态清掉，现独立保留该说明，并增加组合任务验收。

最初的无授权发送器用 `ACTION_SEND / EXTRA_STREAM`；系统自动补上临时授权，断言发现它实际成功读取，不能把它算作拒权成功。已改用从未授予权限的新 URI 与无授权 `ACTION_VIEW`，并在转交前和插件读取前检查授权；最终正常新 URI 与拒权两侧都通过。初次重放时，已有发送器任务仅被带到前台，没有更新递送编号，实际变成了新分享；使用 `--activity-single-top` 明确递送新 extras 后，重复编号 / 零新增 / 零读取才通过。测试准备期间这些实际成功收到的合成内容保留在专用模拟器，没有删除或误报为失败。

两种 ABI 均完成开发打包，原生运行仅 x86_64；应用 ID 为 `com.longyuye.mdreader.mobile.dev`，版本码 `1002019`，基础版本 `1.2.11`，移动里程碑 `0.1.0-dev`。构建记录真实来源为 `c0e1da8a + dirty`，本批提交在验收后建立；开发签名不是 release。

| ABI | 字节数 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 126919378 | `a1b513ca0dcb121ef828f0ddd9c1ad680e9cdb4be54686f057f58f7c8d20d0c6` |
| arm64-v8a | 126262093 | `0420459215dd67bb439ca098db492b2b8bfd8497adb80f2063d5eb5e573b85d1` |

APK 位于 `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` 和 `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk`。测试服务收尾恢复为原设置，专用模拟器停止；浏览器预览继续保留在 9012。连续无障碍连接只用于测试，服务不读取 / 保存事件内容、不请求触摸探索，不进入产品包。


首版仍未完成物理安卓手机、更多系统 / WebView、真实云盘、完整 TalkBack 触摸、iOS 和 release 验收。
