# 第四批：从一句话找回资料

本批继续在 `codex/mobile-0.1.0-foundation` 开发，工作目录为独立移动 worktree；桌面目录不参与变更。目标是让用户记得正文却忘记文件名时，也能找到、打开并返回原来的搜索位置。本批是有明确容量边界的本地全文检索，不代表桌面全部格式或大规模索引迁移完成。

## 官方竞品资料与设计取舍

2026 年 10 月 24 日再次阅读官方帮助，未安装竞品实测：

- [Obsidian Search](https://obsidian.md/help/plugins/search)区分整个 vault 的搜索与当前笔记查找，提供内容、名称和路径范围及大小写控制。Long编辑把底部「查找」独立出来，资料页继续保留当前文件夹名称筛选；搜索结果同时显示文件位置和源文片段。
- [Joplin Searching](https://joplinapp.org/help/apps/search/)说明默认 FTS 在中文等语言的分词限制，以及搜索符号时的 basic search。Long编辑这一批采用整个输入的字面匹配，中文、空格和符号不解释为运算符，英文忽略大小写；明确告诉用户规则，不要求先学习语法。

用户点开一条结果后仍先进入阅读。Markdown 地址或语法中的命中可能不出现在渲染正文，页面提供「查看源文命中」，定位到 CodeMirror 选择区；这个动作本身不修改文件。返回后保留关键词、范围、结果和滚动位置。打开时重新读取文件并比较签名，来源已变化则展示最新内容并提示更新搜索。

关闭文档时暂时将工作区标记为不可交互 / 忙碌，等待草稿保护、页面替换和列表刷新完成后再恢复，并将焦点放回原结果项，不唤起键盘。该顺序同时避免返回期间重复操作，以及本轮模拟器中旧 WebView 返回后未刷新无障碍子树的问题。

## 实现范围

`src/mobile/librarySearch.ts` 管理单个资料库的内存文本快照和查询，`LibrarySearch.vue` 负责范围、进度、结果、停止与重试。通过已有 Storage 契约逐个读取，Android 连接真实 SAF / 私有文件，浏览器使用明确标记的 PreviewStorage。浏览器适配器现能列出夹具中的子文件夹，原生错误不会回退到浏览器资料。

- 搜索整个所选资料库，包含子文件夹内已保存的 UTF-8 Markdown / TXT；不查私有草稿、点号开头的文件或文件夹、图片和其他格式。
- 范围为「全部」「文档源文」「名称与路径」。按整句字面匹配，忽略首尾空白和英文大小写，输入最多 128 个 UTF-16 code units。结果按路径排序，名称 / 路径命中优先；每文件展示第一处源文片段。
- 片段使用 Vue 文本插值和独立 mark 元素，源文中的 HTML 始终是文字，不渲染外部图片、脚本或事件。未改变既有阅读隔离与 CSP。
- 每次最多尝试 1,000 份文本、200 个文件夹、16 层子目录、24 MiB UTF-8 文本；单文件 4 MiB。目录适配器每层最多返回 1,000 项。完整遍历才显示「已读取所选资料库」，限制、错误、停止均显示部分读取及具体说明。
- 结果最多展示 100 份文件，另外统计已读范围内的实际匹配文件数。结果展示上限和读取不完整分别反馈。读取说明最多展开前 20 条，保留完整问题数量。
- 首次输入后读取；正在读取时可停止，换库或离开搜索页时停止尚未完成的遍历。已经开始的单次原生 IO 可能仍会返回，但代次校验阻止其污染后续状态。
- 内容仅留在当前应用进程的内存中，不新增 localStorage / 文件 / 数据库持久索引，也不持久保存查询词。关闭或重启后重新读取。它是有界文本快照上的线性匹配，尚未采用分词倒排索引、SQLite 或后台增量监控。
- 「更新搜索内容」每次重读字节，不依赖提供器修改时间，新增、删除、同时间戳外部修改都可反映。应用内保存 / 恢复副本使对应快照失效；回到搜索页按现有查询重新准备。后台返回标记可能变化，更新按钮始终可用。
- 查询、首次读取、完成时与应用恢复前台检查资料库可访问性。授权失效会清除该库内存文稿及结果；换库不会合并上个库的内容。异常路径、错误文件身份、重复名称都跳过并记录说明。

内存 UTF-8 容量预算不等于整个 WebView 峰值堆内存；读取是逐文件时间快照，尚不保证跨文件事务一致性。提供器 IO 的硬超时 / 强制取消、千万级目录性能和真实云盘变更通知仍待专项实现及实测。

## 自动检查

```powershell
npm run test:mobile
npm run build:mobile

$env:LONGEDIT_PLAYWRIGHT_MODULE='C:\Users\39633\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
npm run test:mobile-search-browser
npm run test:mobile-browser
npm run test:mobile-reading-browser
npm run test:mobile-boundaries-browser
```

预览 URL 应指向本分支 `dist/mobile.html` 的本地静态服务。本轮服务已在 9012 运行；另开服务时可用 `npm exec vite preview -- --host 127.0.0.1 --port 9012`。

28 项逻辑测试全部通过：原有 21 项及新增 7 组全文检索正确性任务。新增组覆盖递归与范围、中文和符号、UTF-16 偏移、同时间戳修改与删除、部分失败、容量 / 数量预算、取消的迟到回执、授权丢失、越界位置、身份不一致、同名歧义、数据保持纯文本及新实例不继承内容。

| 浏览器任务 | 结果与记录 |
| --- | --- |
| 全文检索 6 组 | [报告](evidence/mobile-0.1.0/search-browser-1792774377547/report.json)：递归 / 范围与符号；源码地址命中；返回列表位置与结果焦点；外部变化与显式保存；前台权限检查；停止、目录截断和 100 结果限制 |
| 基础流程 6 组 | [报告](evidence/mobile-0.1.0/browser-1792774377545/report.json)：创建、保护 / 恢复、冲突副本、名称筛选和全文无结果、外观与宽屏 |
| 阅读流程 6 组 | [报告](evidence/mobile-0.1.0/reading-browser-1792774377560/report.json)：图片、文档查找、接续与隔离安全 |
| 存储边界 4 组 | [报告](evidence/mobile-0.1.0/boundaries-browser-1792774377556/report.json)：撤销授权后的草稿、撤销编辑、恢复记录导出与副本 |

全文检索及阅读的浏览器任务没有未捕获页面错误或外部网络请求。360 px 截图检查后压缩顶部间距，保证第一条命中的片段更早可见；同时检查 800 px 深色和横向溢出。这些是浏览器夹具结果，不能替代安卓文件提供器或真实输入法任务。

初次全文浏览器运行在保存回执处因同名文本有两个元素而严格定位失败；将断言限定到第一处状态。旧基础任务仍把「查找」当成名称筛选而超时，已改为先在资料页检查名称筛选，再独立检查全文无结果。两次失败报告均保留：[首次查找任务](evidence/mobile-0.1.0/search-browser-1792773046189/report.json)、[旧基础定位任务](evidence/mobile-0.1.0/browser-1792773363412/report.json)。这两项是测试定位问题，未作为产品通过记录。

## Android 实测复现

使用本任务的 `LongEdit_API35` / `emulator-5556`，API 35、x86_64、旧 WebView 与 Gboard。与其他开发中的模拟器分开，不清除原应用数据。夹具仅包含本任务生成的测试文字和故障样本：

```powershell
node scripts/create-mobile-search-fixture.mjs release-artifacts/mobile-search-fixture
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5556 push release-artifacts/mobile-search-fixture/source /sdcard/Documents/LongEdit-Search-20261024
./scripts/build-mobile-debug.ps1 -Target x86_64
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5556 install -r release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk
```

在应用内选择手机文件夹，通过系统目录选择器授权上述专用目录。输入 `NativeSearchNeedle` 应得到 2 份，包含 `nested/detail.txt`；隐藏 Markdown 与 CSV 不纳入。普通非 UTF-8 和超 4 MiB 文件分别列出读取失败原因，状态应是部分资料 3 份可搜索。输入 `SourceHiddenNeedle` 后打开，阅读页可转到源码的 1 / 1 命中；返回应保留查询。

用夹具 `updates/outline.md` 通过 adb push 更新专用目录同名原文。返回 `NativeSearchNeedle` 列表点开旧 outline 结果，应读取最新文件并提示变化；更新搜索后旧词剩余 1 份，`UpdatedNativeNeedle` 命中 1 份。最后停止该测试目录的访问，确认结果清除、系统持久授权撤销、文件字节保持预期。

本批原生 7 项任务与只读复核通过：[交互任务记录](evidence/mobile-0.1.0/search-native-2026-10-24/tasks.json)、[字节 / UI / 授权复核](evidence/mobile-0.1.0/search-native-2026-10-24/verification.json)。7 份文件均符合预期，其中 outline 是测试明确推送的外部新版本，其余 6 份保持生成时的原字节。启动时曾遇到模拟器 System UI 无响应，选择等待后继续；不据此宣称真机性能。原生搜索输入使用 ADB ASCII，文件含中文且按字节核对；这不能代替中文 IME 合成验证。

最终安装包位于 `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk`，126,796,234 字节，SHA-256 `41ec0f4c2862123edad6113df6d2b3389222e8fd72201e118be02ca2fab16644`。构建时基于 `c69a4d91` 加本批未提交源码，记录如实标注 `sourceDirty: true`，是 x86_64 debug 测试包，不是正式发布包。[构建记录](evidence/mobile-0.1.0/search-native-2026-10-24/build-record.json)保留原始时间与摘要。安装后版本仍为 `1.2.11 / 1002011`、minSdk 29、targetSdk 36；页面中的 0.1.0 是移动开发里程碑标签。

首次原生返回时，截图已显示正确查询与结果，UiAutomator 却只返回一个空 WebView 子树；直接恢复 DOM 焦点仍未解决。保留了 `returned-query-before-focus-fix.*` 和 `returned-query-before-touch.xml`。管理面板的不可交互切换能恢复子树后，调整文档关闭的忙碌 / inert 顺序并重新聚焦结果项；最终包从源码页和阅读页返回都重新获得完整节点，`returned-query.xml` 可独立核对查询与结果。浏览器另外断言焦点确实回到原结果项。该单设备修复不等于完整 TalkBack 或全部 WebView 版本验收。

原生只读复核命令：

```powershell
node scripts/verify-mobile-search-native.mjs --serial emulator-5556 --fixture-dir release-artifacts/mobile-search-fixture --output docs/evidence/mobile-0.1.0/search-native-2026-10-24
```

脚本检查实际设备中的 7 份夹具字节（outline 使用明确推送的外部新版本）、初始部分结果、失败原因、源码定位、返回后的查询节点、外部变化 / 刷新结果，以及撤销后的 UI 和系统持久 URI 授权。UI 操作独立执行，截图与 XML 保留供检查；脚本不替代真实手势或屏幕阅读器测试。

## 接下来按顺序推进

1. 图片插入 / 失效引用修复与附件保存边界，补充 JPEG / WebP 正向样本及大文档 / 附件预算。
2. 中文 IME 合成、选文 / 撤销、系统字号、原生横屏与 TalkBack；继续剩余存储故障及真实云盘检查。
3. arm64、离线 release、升级与真机验收，再进入资料组织及其他格式。大库索引持久化和增量更新须另设格式、权限失效与升级策略，不能直接把本次内存快照当作完成。

移动 0.1.0、M0 / M2 与分发里程碑仍以原退出条件验收。
