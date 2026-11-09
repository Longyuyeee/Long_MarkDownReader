# 第十八批：从系统打开 / 分享 TextPack

本批接续第十七批附件包导入，在移动分支上完成 Android 系统接收入口。用户可以在文件应用选择打开方式，或从分享面板将 `.textpack` 交给 Long编辑，再核对正文与附件并存入独立本机笔记。桌面端继续在原 checkout 推进。

## 用户任务与竞品依据

先确定交互顺序，再接原生入口：

1. 收到包时只提示，不抢走正在写的笔记或已经打开的核对面板。
2. 用户主动查看，先保护当前完整草稿；保护失败时继续留在编辑页，包保持未读。
3. 显示只读全文、附件清单和主动图片预览，再由用户确认整份存入。
4. 读取授权可能随来源应用离开而失效，因此完整包先在本机保留；之后从记录继续。
5. 同时收到文字和附件包时，按接收时间选择最新项，查看只确认这一项。其他项仍在提示中。

本轮查阅官方资料（2026-10-24），没有安装竞品或宣称完成竞品间真实往返：

| 参照 | 观察 | 本批取舍 |
| --- | --- | --- |
| [Bear iOS 分享扩展](https://bear.app/faq/ios-app-extension/) | 从系统分享进入，先预览，再保存；也提供插入已有笔记的选项 | 借鉴预览与主动确认。本批创建独立笔记，避免共享包改动正在写的文件；这不是 Bear Android 能力 |
| [Notesnook TextBundle 导入](https://notesnook.com/help/importing-notes/import-notes-from-textbundle-files) | 单个 `.textpack` 方便携带正文、图片和文件；所抓取的导入步骤是 Web / Desktop | 保留整包和附件清单；不据此推断其 Android 原生接收入口 |
| [Joplin 附件说明](https://joplinapp.org/help/apps/attachments/) | 移动端需要考虑附件大小、离线可用和按需下载 | 沿用已验证的体积预算，先保留完整本机包，图片由用户主动展开。没有照搬其附件或同步模型 |
| [Android 接收分享](https://developer.android.com/develop/ui/compose/sharing/receive) | 通过动作与 MIME 注册接收，建议使用前让用户确认内容，并避免无差别注册所有 MIME | 只登记现有文本和 ZIP / octet-stream 类型；核对文件显示名称及 ZIP 内容，不登记 `*/*` |
| [TextBundle 规范](https://textbundle.org/spec/) | `.textpack` 是 ZIP 压缩变体，正文和 `assets/` 一起携带；规范给出 Apple UTI，没有规定 Android 专用 MIME | 同时接受常见 ZIP 和二进制 MIME，通过提供器的文件显示名识别 `.textpack` / `.textpack.zip` |

## 实现与边界

- `LauncherActivity` 仍先检查 WebView 运行条件，再携带临时读取授权转发给 `MainActivity`。冷启动和 `onNewIntent` 走同一个串行存储接收器。
- `IncomingIntent` 接受 `ACTION_VIEW` / `ACTION_SEND` 的单个 `content://` 文件，包括 `EXTRA_STREAM` 与仅 ClipData 的文件。不同 URI、多个文件、设备路径、网络打开地址、应用内部 FileProvider 和缺少读取授权会拒绝。ZIP / octet-stream 缺少文件时，不将分享说明文字误存为笔记。
- 原生依据 `DISPLAY_NAME` 和传递的 MIME 路由。ZIP 类型的普通 `.zip` 会进入明确失败记录；只有 `.textpack` / `.textpack.zip` 且符合前一批内容限制的包可以确认存入。扩展名不是 ZIP 安全验证的替代品。
- 为兼容常见文件应用，系统会把 Long编辑列为 ZIP / 二进制文件的候选应用，无法只根据不透明 `content://` 文档 ID 限定文件名扩展名。普通 ZIP 会说明受支持范围；不支持任意压缩包浏览。
- 附件包复用已有 SHA-256 保留、ZIP 路径与实际展开限制、图片解码、引用验证和完整目录发布流程。原生继续独立验证压缩包和文件系统边界；共享 Markdown 引用验证仍在 Android 适配器详情与提交前执行。
- 原生保留 `source` / `incoming`，接收编号直接作为本机包编号；同一编号已存在时不再次读取来源。用户再次主动分享同一个文件会有新的接收编号，可独立核对。
- 文本与附件包的未读状态分别存储，统一展示数量和最新项。提示确认只关闭对应未读状态，不删除完整原包。删除导入记录仍须用户确认，已发布正文与附件继续保留。
- 最多保留 6 条附件包记录，包括失败和已经存入的记录。达到上限时保留已有内容并给出接收未完成说明，等待用户清理后重新分享。原生任务队列仍有已有的 8 个接收任务上限。
- 不自动跳转 `info.json` 内的来源 URL，不向源包写回，不新增网络访问或存储权限。浏览器预览只模拟接收后的存储契约，系统授权由原生验收。

## 本地验证入口

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64

# 单独的测试提供器不进入产品 APK；要求专用 API29 AVD 和显式 serial。
. ./scripts/mobile-pack-incoming-ui.ps1 -Serial emulator-5558
Send-MobilePackIncomingFixture -Action 'Share pack chooser'
# 通过系统分享面板选择 Long编辑，再通过普通产品页面核对和存入。
# verify-mobile-pack-incoming-native.mjs 分阶段读取实际私有记录及文件字节。
```

## 验收记录

84 项逻辑测试和 114 组浏览器用户任务通过，新增 9 组系统包接收后的交互任务；17 项打包检查通过。最终完整索引：[browser-regression-1792820119154](evidence/mobile-0.1.0/browser-regression-1792820119154/summary.json)，本批最终任务：[pack-incoming-browser-1792820227038](evidence/mobile-0.1.0/pack-incoming-browser-1792820227038/report.json)。浏览器覆盖活跃编辑、保护失败重试、混合接收顺序、核对时新到达、完整包确认、异常包移除、提示确认写入失败、错误说明并存、360px / 200% 文字和弹层键盘焦点。

收尾增加错误类别的持久保留：没有待核对项、只有附件包接收失败时，主动查看会进入附件包历史及失败说明，方便管理已保留的包。确认提示时同时清除错误类别。未按中文错误字符串推测路由，旧记录仍兼容。补齐正常 SHA-256 的混合文字夹具并单独复核后，又在此变更上完成全套 114 组回归；更早的 113 组索引保留为实际过程记录。

原生使用专用 `LongEdit_Compat_API29` / `emulator-5558`、API29 / WebView124。保留了实际 UIAutomator 状态、截图、独立提供器读取计数与分阶段私有文件检查；未使用模拟的前端桥接替代系统投递。

原生任务索引：[summary.json](evidence/mobile-0.1.0/pack-incoming-native-2026-10-24/summary.json)。最终安装 APK 与构建副本的 SHA-256 一致，见[安装核对](evidence/mobile-0.1.0/pack-incoming-native-2026-10-24/installed-apk.json)。结束时共保留 49 个资料库文件、8 份草稿及原来的 3 份包记录；新增差异只有本批独立测试笔记、附件及草稿，所有本批临时导入记录均通过产品界面清理。原来无障碍设置 `null / 0` 已恢复，来源离线标记已移除，专用模拟器已同步并停止；9012 浏览器预览保留可用。

| 原生任务 | 结果与证据 |
| --- | --- |
| 冷启动系统打开 | 实际通过打开方式启动、保留完整 947 字节 ZIP；`cold-received.json`。设备只有一个匹配的打开目标时，系统会直接进入应用，没有捏造手动点击选择器步骤 |
| 重启后来源离线 | 核对原包摘要后终止应用，启用合成提供器离线标记；重开后主动核对图片，正文和 3 个附件完整存入；`cold-kill / cold-reviewed / cold-imported` |
| 编辑时系统分享 | 在本批新建的合成笔记中实际输入 `PackInboxDraft18`，系统分享面板选择 Long编辑；编辑内容与受保护草稿保持一致，主动查看后独立存入；`warm-*`、`share-chooser.xml` 与 `warm-editor-arrival.png` |
| 重放相同编号 | 测试发送器明确将已保留编号再次交给 MainActivity，来源处于离线；原包和原核对面板保留，没有再次读取来源或新增记录；`replay-replayed.json` |
| MIME 与传递形式 | octet-stream 与只有 ClipData 的单个包均保留、核对并可移除；`octet-*`、`clip-*` |
| 无效包与来源 | 普通 `.zip`、CRC 损坏包和离线来源均阻止存入，可核对失败原因和清理记录；`wrongzip-*`、`crc-*`、`offline-*` |
| 真正缺少授权 | 不带授权的 VIEW，来源读取计数不变，没有产生导入记录；`nogrant-view-rejected.json` |
| 多文件 / 没有文件 | 明确拒绝，不把说明文字存成笔记；`multiple-rejected.json`、`nofile-rejected.json` |
| 错误与正常包同时保留 | 错误提示随有效包进入核对页，确认错误只清理提示，不影响其他未读项；`explanation-review.xml` / `.png` |
| 清理导入记录 | 用户通过产品确认移除本轮记录，已发布的正文与所有附件继续保留；`cold-removed.json`、`warm-removed.json` |

所有阶段保护最初 34 个资料库文件、7 份草稿和 3 份既有附件包；18 条既有文字导入记录编号保持不变。新增测试笔记与草稿独立保留，未重置或清空应用。

首次无授权用例使用 SEND + EXTRA_STREAM，实际获得读取授权并进入保留记录，因此**没有计入无授权拒绝验收**；保留该次真实结果 `nogrant-received.json`，通过界面移除后，改用 VIEW 并终止旧活动授权重新验收。此行为与 [AOSP Intent 的流迁移实现](https://android.googlesource.com/platform/frameworks/base/+/27d4317fba00fc573e686df3b637b68ddf486910/core/java/android/content/Intent.java)一致。另修正测试辅助的边缘裁切按钮命中、原生按钮以 text 暴露而非 content-desc 的定位，以及核对提示写入尚未完成就读状态的测试时序；现在等待完整可用控件及核对任务结束。

冷启动第一次额外快照 `cold-before.json` 采集晚于实际投递，未用作冷启动基线；相关阶段显式使用更早的 `baseline-before.json`，报告内有 `baseline` 字段。收尾增加失败类别路由后重新构建，早期原生任务对应初版实际 APK，`initial-*-build-record.json` / `initial-installed-apk.json` 保留当时摘要；最终 APK 的覆盖安装、实际分享、终止后离线接续、完整存入与失败类别另有 `final-*` 复核。

两架构最终开发 APK 为 `1.2.11` / `1002022`，应用 ID `com.longyuye.mdreader.mobile.dev`，minSdk29 / targetSdk36：

| 架构 | 字节数 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 127012938 | `e1e06c5114d1c2b837b4563e84ecee1133362cb3309abcbd5d0ab7e0c905f742` |
| arm64-v8a | 126355717 | `fdee8e3d5b6b97a5ebfd6f0d386c17959ad6636e9eb099d4f1702ef6f0d1ad72` |

构建来源如实记录为 `e8e650a5c + dirty`，不在提交后重新标记构建来源。实际安装操作是 x86_64 模拟器；ARM64 完成构建与 APK / ELF / 证书核对，尚未真机运行。真实云盘、生产应用导出的更多包、竞品安装往返、完整 TalkBack 触摸、iOS 与 release 仍待专项验收。

构建后发现系统盘空间接近用尽，将本 worktree 已忽略的 `src-tauri/gen/android/app/build` 缓存保留到 E 盘并建立原路径 junction，移动前后逐文件名称与长度一致；两架构随后重新成功构建。位置见 `generated-cache-location.json`，没有清理桌面源码或用户文件。

## 后续顺序

1. 用真实 Android 设备和更多文件 / 云盘提供器验证入口与包兼容性，补充实际生产应用输出样本。
2. 扩展主计划中尚未迁移的格式与编辑能力，继续完整 TalkBack 触摸验收。
3. 在相应主机上验证 iOS 文件与分享入口，以及 release 签名和分发；本批开发包不代表这些工作完成。
