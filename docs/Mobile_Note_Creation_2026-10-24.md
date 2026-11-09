# 第十二批：新笔记的创建、失败与接续

本批继续推进 M2 / A05 / A08 / A10，以及 T02 / T04。移动分支为 `codex/mobile-0.1.0-foundation`，里程碑仍为 `0.1.0-dev`；桌面原工作目录未修改。

## 用户任务和竞品依据

| 用户此时的想法 | 本批处理 |
| --- | --- |
| 我要记一条笔记，保存到哪里 | 保留可见新建入口、目标资料库及文件夹说明 |
| 点了按钮没立刻打开，再点一次 | 准备状态即时可见，名称 / 提交 / 关闭在处理中锁定，同次请求只创建一个草稿 |
| 准备失败了，我还得重新输入名字吗 | 留在命名页面，名称保留，解除锁定后可重试 |
| 这个名字其实已经有资料了 | 查询真实来源；即使条目在 1,000 项列表快照之外，也不以空位置开始记录 |
| 文件夹没按这个名字新建 | 保存未确认，保留完整草稿和恢复记录，可另存手机资料库 |
| 保存后我要回到列表接着做事 | 新建直接进入编辑，编辑器关闭后维持工作区；阅读器关闭仍按既有路径恢复列表和焦点 |

2026 年 10 月 24 日核对 [Obsidian 管理笔记](https://obsidian.md/help/Files+and+folders/Manage+notes)中命名后进入编辑的通用流程，以及 [Joplin 移动待办](https://joplinapp.org/help/apps/to-dos/)在笔记本内通过加号菜单创建的入口。设计推论是保持“在哪里创建”清楚，并让准备、失败和重试有明确状态。没有安装竞品；Obsidian 页面中的桌面快捷键没有作为手机操作要求，也没有据资料推定竞品的底层保存机制。

## 新建与草稿协调

`DocumentSession.create` 独占准备阶段，在串行队列中检查同名私有草稿与实际来源，只将明确的 `NOT_FOUND` 视为可新建位置。已有文件、读取失败、授权失效或其他错误均拒绝进入新文稿；没有把提供器读错当作不存在。

先保护空的私有新笔记草稿，再等待命名面板释放背景的 `inert` 状态，最后激活编辑文稿并聚焦编辑器。草稿持久化失败时不激活空文稿，原页面和名称仍在。失败的创建队列会正常收尾，使下一次重试不会重复抛出旧错误。准备期间重复创建、切换文稿和关闭请求被拒绝；UI 的系统返回也等待准备完成。

创建模式在异步激活之前明确设为编辑，避免临时挂载阅读页。浏览器 DOM 观察检查新建 / 保存流程未添加阅读 iframe。配额类浏览器错误显示可读的存储不足提示，原始 DOMException 名称不直接作为页面主要反馈。

## 初次保存的原生检查

[Android `DocumentsProvider.createDocument` 契约](https://developer.android.com/reference/android/provider/DocumentsProvider#createDocument(java.lang.String,%20java.lang.String,%20java.lang.String))允许提供器修改显示名称，但要求分配新的文档 ID。本批在发送任何正文之前检查：返回 ID 不在创建前的子项集合中；名称与请求一致；目标确为文件且为空；按名称重新定位能唯一回到同一 ID。

当前采用保守处理：合法改名也不自动改接文稿身份，而是显示无法按该名称新建，保留草稿和恢复记录，让用户另存。提供器可能已创建一个空占位文件，应用不会自动删除或移动它。后续支持改名后继续保存，需要同时处理文档身份、私有草稿、阅读位置和正在发生的后续编辑，继续独立推进。

这些检查不能使 SAF 具备比较交换或原子提交能力；真实提供器在检查后的并发变化仍需继续验收。旧来源签名、写前恢复记录和写后读回继续执行。

## 原生返回问题及修复

专用 API 29 / WebView 124 上，新建后编辑、保存、返回，截图中的列表正常，但 UIAutomator 只返回应用根节点。先调整进入编辑的模式，再延后激活以避开模态背景，两次尝试仍复现；对应 `after-direct-editor-return.xml`、`after-prepared-editor-return.xml` 保留。

最终将关闭时的工作区重建限制在实际有阅读器需要销毁的路径，直接编辑后返回保持工作区实例。原有关闭阶段阻止交互、焦点移出文稿及等待一帧的处理继续保留。`after-stable-editor-return.xml` 包含真实文件条目、新建、搜索与导航；再次打开普通阅读并返回的 `after-stable-reader-return.xml` 也包含列表。此结果来自该模拟器，不等同完整人工 TalkBack 触摸验收。

## 本地验证与实际范围

61 项逻辑测试、64 组浏览器任务（既有 60 组及新增 4 组）、17 项打包检查通过。最终返回逻辑修改后重跑全部 64 组；新错误面板在 360 CSS px / 200% 字号下无横向溢出，并通过所选 axe 规则。

原生使用专用 `LongEdit_Compat_API29` / `emulator-5558`、API 29、WebView `124.0.6367.219`，无默认网络连接。测试 APK 是独立提供器，三个根目录均保留同一份中文 / emoji / CRLF 原文，SHA-256 为 `85fdafec7f20f86caeac5480a96a31bf781aa96995ac1b37f570630f745872ce`。

| 场景 | 实际检查 |
| --- | --- |
| `create-safe` | `CreateSafe.md` 精确保存 `CreationSafeDraft`；恰好一次打开写入，已有原文未变，该代草稿和临时写前记录清理；冷启动重新打开正文 |
| `create-renamed` | 返回 `Renamed-CreateRenamed.md` 空文件；零次打开写入，原文未变，完整私有候选与恢复记录保留，另存完整本机副本 |
| `create-alias` | 故意返回已有 `Existing.md` 的 ID；零次打开写入，中文原文未变，完整私有候选与记录保留，另存完整本机副本 |

在当前最终包上强制停止测试应用并确认进程结束，重启后重新打开正常新建的文件，再重跑三个 `final`，核对内容、来源、私有草稿 / 记录、副本、提供器写入计数和安装包摘要。产品候选只通过真实系统目录授权和原生适配器写入；ADB 私有文件读取用于验收，不是产品的存储接口。

首次原生辅助脚本把 AVD 名称末尾的额外 CR 当作名称内容，修正裁剪后继续。另一次输入早于新编辑器准备完成，完整内容断言发现缺少 `Cre` 前缀；该次恢复记录继续保留，将其已核对的零字节合成占位文件移动到提供器私有归档位置后，修正输入重试。后续使用 `prepared` 阶段在保存前同时检查原生界面和完整私有候选。搜索脚本也曾在输入法提交与列表重排尚未稳定时点击旧坐标；重新读取实际结果后打开，未将该次点击当作文件打开通过。

浏览器新建测试第一次还发现失败的队列影响下一次创建，补充失败收尾后重跑。早期英文技术错误截图保留，最终截图使用中文存储不足提示。原生和浏览器的失败尝试不计入通过组数。

## 复现命令

```powershell
npm run test:mobile
npm run test:mobile-creation-browser
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64

# 独立测试提供器的构建方式见 tests/android-storage-provider/README.md。
# 在系统文件选择器授权准确场景后，先检查新夹具原文：
node scripts/verify-mobile-creation-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/creation-native-2026-10-24 --scenario create-safe --stage before
# 新建 CreateSafe，等待实际编辑器，再输入 CreationSafeDraft。
# 保存前保存 create-safe-prepared.xml，使用 prepared；保存回执后保存 create-safe-saved.xml，使用 saved。
# 其他场景使用 CreateRenamed / CreationRenameDraft、CreateAlias / CreationAliasDraft。
# 失败后保存 <scenario>-failed.xml 并运行 failed；通过产品另存副本，再运行 final。
```

脚本要求专用 AVD 和显式 serial；不自动删除占位文件、重置夹具或清除数据。`before` 必须在本次实际文件创建之前，`prepared` 的完整候选核对必须先于保存。重复验收需准备新的独立夹具状态。

## 安装包与未覆盖项

| 调试目标 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ARM64 | 126222685 | `3f5c839976fdbec7e9006d2d0df0753dfaded30b6fd9d9af4abbf66027c6417d` |
| x86_64 | 126879970 | `f8ff2a9642f2cda823fe4adb510b721b96a734200ece658bbbcf4a4dd5ecbec3` |

两个 ABI 的 versionCode 均为 `1002016`，versionName `1.2.11`，开发身份与签名保持一致。构建记录如实保存 `9a36ebfd + dirty`，最终模拟器安装摘要与上表 x86_64 一致；受限 Windows 符号链接仍使用既有经过校验的复制打包回退。

汇总见 [verification-summary.json](evidence/mobile-0.1.0/creation-native-2026-10-24/verification-summary.json)，各阶段 XML、截图、候选摘要、最终检查与构建记录在同目录。产物保持 `release-artifacts/mobile-debug/<target>/` 的既有路径，本机对应 E 盘产物目录。

ARM64 本批完成构建及产物校验，未做真机运行。真实云提供器、创建检查后的并发窗口、改名后自动接续身份、私有存储整体耗尽、断电、WebView 111 完整任务、完整 TalkBack、干净检出构建与正式签名 release 继续待验收。M2 未标为全部完成。
