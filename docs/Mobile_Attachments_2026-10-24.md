# 第五批：插入图片、修复引用与携带附件的副本

本批继续在 `codex/mobile-0.1.0-foundation` 的独立 worktree 开发，桌面工作目录不参与修改。围绕「把图放进笔记」「原来的图不见了」「另存后图片还能否打开」三项用户任务实现；没有将手机页面直接缩成桌面布局。

## 官方竞品调研与页面决策

2026 年 10 月 24 日阅读官方资料，未安装竞品实测：

- [Obsidian 附件](https://obsidian.md/help/attachments)把附件作为普通文件，可放在笔记旁的子目录；[移动端工具栏](https://obsidian.md/help/mobile)为编辑动作提供就近入口。本项目在编辑工具栏增加图片入口，在阅读操作菜单与图片失败状态增加检查入口；新图统一复制到笔记旁的 `attachments` 目录，并插入相对引用。
- [Joplin 附件](https://joplinapp.org/help/apps/attachments/)说明移动附件容量和下载方式需要单独控制。本项目先限定 PNG / JPEG / WebP、2 MiB 和 800 万像素，选择后先校验内容，不因文件扩展名为 png 就直接接受。未承诺自动压缩、相机拍摄或全部图片格式。

用户选图后，应用创建新图片副本并回读核对，确认后才改正文；不会覆盖所选原图。正文先进入私有恢复草稿，保存原笔记仍由用户显式点击。取消选图不创建附件。面板明确标注保存位置、容量限制、光标 / 文末位置，以及有选区时将替换所选文字。

插入时保持段落边界和原文的 CRLF / LF，避免图片贴着标题而改变解析。失效图片先列出原说明、引用位置和读取原因，用户选择一处再选新图；只替换这一处 Markdown 图片语法，保留说明、标题及其他正文，不自动删除旧图。

## 原生存储与恢复记录

Android 使用系统 `ACTION_OPEN_DOCUMENT` 选择图片，接受 PNG、JPEG、WebP MIME；应用不申请全盘媒体权限，也不把 JS 传来的任意 URI 当文件打开。[Android SAF 官方说明](https://developer.android.com/training/data-storage/shared/documents-files)

1. 在原生线程有界读取所选文件，使用 `BitmapFactory` 只读取尺寸 / MIME；最大 2 MiB、单边 8,192、总像素 800 万。
2. 先用 `AtomicFile` 写入应用私有的图片记录与恢复字节，记录目标笔记、摘要、尺寸和状态。然后创建新的随机文件名 `attachments/longedit-UUID.ext`，文件类型由实际内容确定。
3. 外部目录通过 SAF 创建新文件；拒绝已知现存 URI 或意外返回的名称，不通过覆盖原图完成插入。内置库使用有边界校验的原子文件写入。
4. 回读与原字节一致后才将记录标为 ready，删除已不需要的私有候选副本；若失败则保留 unconfirmed 状态和可用恢复字节，正文保持不变。提供器可能留下不完整的新文件，应用不会自行删除它们。
5. 重试创建新的随机目标并保留较早尝试的位置；单条记录最多 5 次尝试。原文件、旧图和其他笔记引用不参与自动清理。

面板列出当前笔记最近 25 条导入记录，设置中可以查看全局最近记录。已确认的图片可以预览、再次插入；未确认的图片可以核对私有恢复副本、在原位置重试。换文档或正文已变化时，原插入位置失效，图片保留在记录中，不把迟到结果插进另一份文档。恢复数据不可读时会报错；损坏元数据单独计数，不显示为空记录集合。

当前最多保留 1,000 条元数据记录和 12 份待恢复图片（每份不超过 2 MiB）；没有引入自动垃圾回收或面向用户的批量删除。导入期间关闭按钮 / 返回关闭被阻止，完成后由父页面清理忙碌状态，避免子组件卸载后遗留锁定。关闭面板和撤销引用不会删除附件。

## 引用修复与副本边界

`imageReferences.ts` 使用现有 marked lexer 区分真实图片、代码示例和转义文字，将精确匹配的 token 范围映射回原文；支持普通内联图片和可精确定位的引用式图片。修复引用式图片时仅把选中的那一处改成内联引用，原共享定义和其他引用不动。处理前再次检查原文范围，前端还校验文档身份及编辑代次。

多行引用块、表格、HTML 等不能精确定位的语法不会猜测替换。面板明确提示这些限制，先列出前 25 处可定位引用；复杂图片仍可通过源码编辑。

普通「将副本存入手机资料库」增加图片预检与搬迁：

- 预先检查可定位的库内 PNG / JPEG / WebP，按原位置去重；一次最多 24 张、8 MiB 字节及 1,200 万像素。
- 图片先复制到目标笔记旁并确认，再重写相对引用、保存新的文字文件；原文和原草稿继续保留。只读来源可以读取并另存到手机资料库。
- 缺图、超限、未确认回执或不能自动定位的图片阻止默认副本；不把丢图默认为成功。用户可以重试，或明确选择「仅存文字副本」，页面会提示图片没有搬迁。
- 中途失败时，已完成的附件仍可能留在目标库；全局图片导入记录保留其笔记路径和状态。源图、原文与私有草稿不删除。

保存恢复记录页面中的历史文本另存 / JSON 导出沿用原流程，未改为完整附件包；此类文件的图片仍需核对或修复。外部链接不下载，SVG / GIF 不在本批范围。普通副本的预检与随后复制不是跨提供器事务；实际写入中断、提供器返回不一致图片等故障继续单独验收。

## 本地复现

```powershell
# 生成专用测试文件，覆盖的只有脚本列出的合成夹具名称。
& C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe scripts/create-mobile-attachment-fixture.py release-artifacts/mobile-attachment-fixture
npm run test:mobile
npm run build:mobile

# 浏览器静态预览服务须指向本分支 dist/mobile.html。
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:\Users\39633\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
npm run test:mobile-attachments-browser

./scripts/build-mobile-debug.ps1 -Target x86_64
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5556 push release-artifacts/mobile-attachment-fixture/library /sdcard/Documents/LongEdit-Attachments-20261024
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5556 push release-artifacts/mobile-attachment-fixture/picker /sdcard/Download/LongEdit-Attachments-20261024
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5556 install -r release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk
```

通过系统目录选择器授权 Documents 中专用目录。图片从 Download 中同名夹具目录选择；取消后确认没有新记录。新图导入后先回读原 Markdown 与私有草稿，再显式保存。检查 Formats.md 的 JPEG / WebP 正向样本与新导入图片，不能把浏览器预览作为原生解码证据。

`blocked/attachments` 是专门生成的普通阻挡文件，不是用户资料。向 `blocked/Conflict-Note.md` 导入时应保留失败记录；强制停止应用、重新进入后仍可预览候选图片。测试中将这个特定阻挡文件改名，再在应用内重试，不能删除实际用户目录来模拟恢复。

`verify-mobile-attachments-native.mjs` 支持分阶段只读复核：`before-save`、`pending-before-restart`、`pending-after-restart`、`before-invalid`、`after-invalid`、`final`，参数为 `--serial`、`--fixture-dir`、`--output`。UI 操作由独立 ADB 节点和截图完成，脚本回读真实原文件、导入图片、私有草稿 / 候选及元数据，按字节核对；不会自动点击、改原文件或重置应用。

## 检查结果与首次失败

35 项逻辑测试通过，包含本批新增 7 组；新增 7 组附件浏览器任务通过。既有基础 6 组、阅读 6 组、全文搜索 6 组和存储边界 4 组通过，共 29 组浏览器任务。浏览器没有未捕获页面错误或外部网络请求。

| 浏览器范围 | 最终报告 |
| --- | --- |
| 附件、CRLF、恢复与副本 7 组 | [附件报告](evidence/mobile-0.1.0/attachments-browser-1792780969006/report.json) |
| 基础流程 6 组 | [基础报告](evidence/mobile-0.1.0/browser-1792780969029/report.json) |
| 阅读 / 图片隔离 6 组 | [阅读报告](evidence/mobile-0.1.0/reading-browser-1792776813512/report.json) |
| 整库查找 6 组 | [查找报告](evidence/mobile-0.1.0/search-browser-1792780969085/report.json) |
| 存储边界 4 组 | [边界报告](evidence/mobile-0.1.0/boundaries-browser-1792776813541/report.json) |

- 首次原生编译发现新增 Kotlin 声明误用逗号，已改为独立声明后重新构建通过。
- 首次页面验收发现图片紧贴标题会改变标题解析，已补段落边界与 CRLF 处理；另一次测试未重新填写图片说明，却仍断言旧说明，已改为明确填入再检查。
- 面板子组件插入完成即卸载，造成父页面忙碌状态未清除；已由父页面在关闭时同步清理，回归覆盖再次打开只读面板并关闭。
- 安卓实测发现 CRLF 源文偏移大于 CodeMirror 的内部位置，导致安全校验拒绝插入。增加 `editorOffsets.ts`，在选区捕获和修改边界转换原文 / 编辑器位置，并修正新选区位置；不通过去掉安全检查或归一化整份文件来回避。35 项逻辑检查包含真实 CodeMirror 状态的中文 / emoji / CRLF，最终附件浏览器夹具也改为 CRLF；失败时已确认的图片通过导入记录继续使用。
- 原生长引用列表把导入错误挤到首屏外，已移到选择动作之后；附件浏览器任务新增错误完整可见的坐标检查。返回普通资料列表时旧 WebView 的可访问节点曾丢失，仅补焦点或等绘制仍未解决；改为关闭完成后重建普通列表容器并恢复当前导航焦点，页面数据保留在父组件。搜索保留已有的结果 / 滚动 / 焦点恢复实例；基础和搜索浏览器任务重新核对，原生结果单独记录。
- 嵌套笔记的恢复重试发现 `children` 返回的 `SingleDocumentFile` 不支持 `createDirectory`。外部附件目录改为 `DocumentsContract.createDocument` 创建，内置库继续原流程；失败记录和候选仍保留，使用同一条记录继续验收，没有重置数据掩盖失败。

实际报告、失败截图、最终原生文件验证与 APK 摘要归档在 `docs/evidence/mobile-0.1.0/` 对应本批目录。原生输入使用 ASCII 测试命令，中文源文按字节核对；中文输入法合成、完整 TalkBack、真实照片方向 / 颜色信息、原生横屏及字号矩阵仍待专项验证。

## Android 实测结果与包来源

本批使用 `LongEdit_API35` / Android 15 / x86_64 模拟器，WebView 124.0.6367.219，系统键盘为 Gboard。实际步骤、分阶段 APK 摘要、首次失败和修复复测见[交互记录](evidence/mobile-0.1.0/attachments-native-2026-10-24/tasks.json)；最终[文件与 UI 复核](evidence/mobile-0.1.0/attachments-native-2026-10-24/verification.json)通过，核对 7 个确认图片副本。

| 用户任务 | 实际结果 |
| --- | --- |
| 取消系统选图 | 没有新导入记录或源文写入；系统选择器返回键先导航上层，直至取消 |
| 导入后显式保存 | 保存前原 Markdown 与夹具逐字节相同，新引用只在私有恢复草稿；点击保存后写入，CRLF、中文标题与原正文保留 |
| 修复失效引用、三种格式 | 单处缺图换为 JPEG，另插入 PNG / WebP；原生阅读截图中三张图片均显示，原图和旧附件不覆盖 |
| 类型 / 字节 / 像素拒绝 | 三个异常样本均报错，提示在首屏内；前后 7 条记录 ID 和原文 SHA 完全一致 |
| 携图副本 | 手机资料库新笔记使用三张独立本地图片并重写引用；复制字节逐一与来源一致，外部源文保留 |
| 重启恢复与嵌套目录重试 | 相同待恢复 ID、候选 SHA 和原文跨强制停止 / 安装更新后保持；修复单文件包装对象建目录问题后，第 3 次尝试确认、插入并保存成功 |
| 阅读后返回列表 | 最终 XML 显示完整资料列表和导航节点，当前「资料」按钮 `focused=true`；浏览器同时复核普通列表与搜索结果返回 |

最终调试 APK 为 `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk`，126,820,874 字节，SHA-256：`b0403af9d09bd88e9c6db23be711d3826025e7c5e5526a149bffaa1ce7984b81`。[构建记录](evidence/mobile-0.1.0/attachments-native-2026-10-24/build-record.json)的父提交为 `03c1d0e710d7d57443ef7ac02e46ea76043adfe5`，`sourceDirty=true`，包含本批随后提交的应用源码；不是从该父提交的干净工作区构建。已回读设备上实际安装的 `base.apk` 摘要并[核对一致](evidence/mobile-0.1.0/attachments-native-2026-10-24/installed-apk.json)。Windows 符号链接受限时，脚本核对 Rust 已成功编译并校验库的复制摘要后再由 Gradle 打包；本次原生编译及打包成功。

这是 x86_64 开发签名预览包。原生图片任务在修复过程中分阶段执行，各 APK 和范围在交互记录中对应；最后一版另验证安装摘要、读取 / 返回及全体原生图片文件。真机、arm64、release、实际断电和提供器二进制写入不确定性继续待验收。

## 后续顺序

继续中文 IME、选文与撤销、字号、横屏、TalkBack 和剩余提供器故障任务，然后完成 arm64、离线 release、升级和真机检查。附件删除 / 垃圾回收、拍照与压缩、复杂图片语法和完整附件导出按独立契约扩展；本批不替代整个移动 0.1.0 或 M0 / M2 的退出条件。
