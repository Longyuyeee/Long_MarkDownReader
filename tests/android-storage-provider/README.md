# Android 存储边界测试提供器

这是单独安装在开发模拟器中的测试 APK，不进入 Long编辑安装包。它只创建自身私有目录中的固定测试文本，没有网络权限，也不访问用户资料。

| 系统文件选择器中的位置 | 确定性故障 |
| --- | --- |
| LongEdit Test readonly | 文件可读，不声明写入能力，写入请求会拒绝 |
| LongEdit Test offline | 根目录元数据可读，枚举子目录时抛出异常 |
| LongEdit Test unconfirmed | 接受写入管道的数据但保留旧文件，触发应用读回不一致 |
| LongEdit Test nulls | 时间和大小列为 null，名称和正文仍可读取 |
| LongEdit Test duplicate | 两个文档 ID 返回相同显示名称，原生定位必须拒绝歧义 |
| LongEdit Test nospace | 声明可写，但在打开写入目标前报告 ENOSPC；原文保持不变 |
| LongEdit Test interrupted | 接收真实管道写入，仅将最前 8 字节写入并同步到夹具文件，再阻塞，供专用验收终止应用进程 |
| LongEdit Test create-safe | 独立可新建目录，按请求名称创建空文件，并记录实际打开写入的次数 |
| LongEdit Test create-renamed | 新建返回 `Renamed-<请求名称>` 的新空文件；Android 允许提供器改名，应用当前选择保留草稿并另存 |
| LongEdit Test create-alias | 故意违反新建契约，返回已有 `Existing.md` 的 ID；用于验证应用不向该句柄发送正文 |

`unconfirmed` 与 `interrupted` 使用 Android `DocumentsProvider` 和 `ParcelFileDescriptor.createReliablePipe()`，经过真实系统授权和应用原生存储接口。它们不等同真实云盘离线、设备整体磁盘耗尽、断电或所有第三方提供器行为。旧场景的创建标志只用于使既有文件写入场景可选，没有实现新建文档；新建验收只使用独立的三个 `create-*` 场景。

在移动 worktree 根目录执行：

```powershell
. ./scripts/enter-mobile-environment.ps1
./src-tauri/gen/android/gradlew.bat -p tests/android-storage-provider assembleDebug --max-workers=4 --console plain
& 'E:/Android/Sdk/platform-tools/adb.exe' -s emulator-5556 install -r tests/android-storage-provider/build/outputs/apk/debug/longedit-storage-fixture-debug.apk
```

在 Long编辑选择手机文件夹，通过系统选择器侧栏选择上述位置。只读场景编辑后应明确存入手机资料库；离线场景应显示失败与重试入口；未确认写入场景应保留原文、草稿和恢复记录。撤销授权、取消导出、导出 JSON 和另存两个版本的操作步骤与证据见 `docs/Mobile_Storage_Boundaries_2026-10-23.md`。

完成操作后可用 `scripts/verify-mobile-boundaries-native.mjs` 按字节检查夹具原文、副本、私有草稿与导出记录。脚本要求显式设备序列号和记录编号，不清除或重置应用数据。

## 空间不足与部分写入

新增两个场景各自使用独立的 `nospace.md` / `interrupted.md` 私有夹具，不改动旧场景文件。通过系统选择器授权后，使用 `scripts/verify-mobile-write-interruption-native.mjs` 的 `before` 阶段核对完整原文；编辑时分别只插入一次 `NoSpaceDraft` / `InterruptedDraft`，等待草稿保护回执。

`nospace` 保存失败后保存 `nospace-failed.xml`，运行 `failed` 阶段；随后在应用恢复页分别另存原文和草稿。`interrupted` 保存中先保存 `interrupted-saving.xml`，立即运行 `kill` 阶段。提供器写入 `interrupted-started.json` 标记真实前缀已经落盘；验收脚本先核对两份完整私有版本与草稿，再强制停止专用应用，最后创建 `interrupt-release-<attempt>` 释放该次管道。提供器也有 60 秒超时，不会无限等待。正文必须足够长，使应用写入在管道容量处阻塞。

脚本严格限制为 `LongEdit_Compat_API29` 专用 AVD / API 29，只停止 `com.longyuye.mdreader.mobile.dev`。重启后记录恢复提示，另存两个版本，并通过系统选择器实际导出完整 JSON 到 Downloads；`final` 阶段逐字节核对来源、私有记录、草稿、副本、导出与最终安装包摘要。详细命令、范围和本次实际记录见 `docs/Mobile_Write_Interruption_2026-10-24.md`。

脚本不自动重置截断夹具或清除应用数据。重复故障验收需先准备新的专用夹具状态，再运行 `before`；不能用已截断来源跳过原文检查。

## 新笔记创建

三个 `create-*` 根目录各自保留 `Existing.md`（中文、emoji、CRLF），不修改旧场景。`create-safe` 创建请求文件；`create-renamed` 返回不同名称的空文件；`create-alias` 返回原有文件。根目录之外的 `<root>-writes.txt` 只在实际以写模式打开文件时追加 ID，因此可以区分“创建了句柄”和“应用提交了正文”。

使用 `scripts/verify-mobile-creation-native.mjs` 的 `before / prepared / failed / saved / final` 分阶段复核。输入前等待文件标题与完整编辑器，保存前使用 `prepared` 检查私有候选，避免把自动输入抢在页面完成之前造成的缺字当作存储结果。正常新建核对恰好一次写入与草稿清理；另两个场景要求零次打开写入、原资料未变、草稿 / 恢复记录保留，随后在产品中另存完整副本。脚本仅针对专用 API 29 AVD，不清理文件或重置应用。

本轮首次注入未等编辑器准备完成，断言拒绝不完整候选；保留该恢复记录，将其零字节测试占位文件移到提供器私有目录中的 `first-create-renamed-empty-20261024.md` 后重试。该移动是验收资料整理，产品不会自动删除或移动提供器创建的文件。操作与证据见 `docs/Mobile_Note_Creation_2026-10-24.md`。

## 文字导出目标

新增 `export-safe / export-unconfirmed / export-nospace` 三个独立根目录，允许系统 `ACTION_CREATE_DOCUMENT` 创建 Markdown / TXT。每个目录仍有自身合成的 `Existing.md`，不访问或修改用户文件。健康目标保存实际字节；未确认目标通过真实可靠管道接收并丢弃写入，回读仍为空；空间不足目标在打开写入时抛出合成 ENOSPC。根目录外的 `<root>-writes.txt` 记录尝试打开写入的次数。

使用 `verify-mobile-text-export-native.mjs` 核对源文未变、完整导出快照、私有草稿及实际目标。`create-alias` 也用于验证导出前拒绝非空已有文件。测试不自动删除系统选择器留下的空占位文件；重复验收需准备新夹具。详见 `docs/Mobile_Text_Export_2026-10-24.md`。

## 原生无障碍测试工具

### 离线无障碍对照

`AccessibilityControlActivity`只在专用API29模拟器运行。plain / contents / reader / reader-contents / navigation / navigation-contents / busy / busy-contents用于隔离编辑、iframe移除、内容替换和aria-busy；frontend使用隔离的WebView预览数据，所有资源从APK内拦截，网络阻断，没有Tauri桥，也不读取主应用私有资料。普通快照默认仍只允许开发包；`--target control`还校验测试包和活动窗口标题。

先冻结现有dist，再构建本测试APK：

```powershell
python scripts/prepare-mobile-accessibility-control.py
. ./scripts/enter-mobile-environment.ps1
./src-tauri/gen/android/gradlew.bat -p tests/android-storage-provider assembleDebug --max-workers=4 --console plain
```

生成资源和摘要位于忽略的`build/generated/control-assets`。已有不同快照时脚本拒绝覆盖，应先保留它再准备下一份。沿用已核对的专用测试服务，显式指定serial安装及打开`.AccessibilityControlActivity --es mode frontend`；用`observe-mobile-accessibility-service.py --target control`保存新阶段。不要把这里的浏览器预览数据当成原生存储或系统选择器验证。[实际对照与焦点修复](../../docs/Mobile_Draft_Continue_Focus_2026-10-29.md)保留旧／新资源身份及所有失败边界。

### 连续服务的历史观察

2026-10-29补充：连续服务不能保证WebView树完整，已出现该服务空树、真正TalkBack仍可遍历并激活菜单的差异。新增 `scripts/observe-mobile-accessibility-service.py` 可按需采集Android节点、原图及实际配置，不连接UiAutomation；仅支持专用API29、前台开发包及DUMP权限。阶段不覆盖；缺失子树即拒绝UI断言，无`--expect`只采证。快照留测试APK私有目录，不记录事件内容。使用前构建并安装本测试APK，核对服务实际绑定配置；覆盖安装可能沿用旧绑定。实际结果和保留的失败见[边界报告](../../docs/Mobile_Accessibility_Boundary_2026-10-29.md)。以下10月24日记录仍为当时的有限观察，不能理解为已解决所有空树问题。

API 29 / WebView 124 上逐次启动 UIAutomator 后，恢复草稿的菜单曾只返回 WebView 根节点。单纯调整网页焦点、隐藏背景和移动弹窗位置都未改善，这些产品试改已撤回。测试 APK 中的 `FixtureAccessibilityService` 用于保持连续连接：它不读取、保存或发送事件内容，不请求触摸探索，也没有网络权限。默认禁用，不进入 Long编辑 APK。它用于区分瞬时界面检查连接问题，不替代实际 TalkBack 触摸验收。

只在合成资料的专用 AVD 上使用：

```powershell
./scripts/mobile-emulator-accessibility.ps1 -Serial emulator-5558 -Mode Enable -StateFile E:/Android/BuildCache/text-export-a11y-settings.json
# 完成原生检查后必须恢复原设置；脚本拒绝覆盖其他既有服务。
./scripts/mobile-emulator-accessibility.ps1 -Serial emulator-5558 -Mode Restore -StateFile E:/Android/BuildCache/text-export-a11y-settings.json
```

状态文件必须是新文件；复测前先检查和另行保存旧验收状态。此次最初启用通过同等的显式 ADB 步骤记录，恢复由上述脚本核对。


## 单文件导入夹具（第十四批）

`import-safe / import-same / import-txt / import-invalid / import-large / import-offline / import-wrongtype` 为独立只读来源。正常文本包含 UTF-8 BOM、中文、emoji、混合换行与图片引用；safe 和 same 同名 `Import.md`、内容不同。invalid 含 UTF-16 字节，large 实际为 4 MiB + 1，wrongtype 在受支持 MIME 下返回 `.pdf` 名称，offline 在打开流时拒绝读取。每种来源使用独立 `.source` 文件，读取次数写入本测试 APK 私有审计文件。仅对 safe 创建 `files/import-safe-offline` 标记，可在完整暂存后使提供器拒读，验证应用重启存入不依赖来源；标记和夹具都只属于此测试 APK。

当前验收模拟器为 `LongEdit_Compat_API29` / `emulator-5558`。安装和操作均显式指定 serial；不得清空主应用或触碰用户真实资料。详见[单文件导入报告](../../docs/Mobile_Text_Import_2026-10-24.md)。


## 外部接收发送器（第十五批）

`ShareFixtureActivity` 发送合成 Markdown、文字、单独 ClipData URI、非法编码、超限、不可读、错误类型、多文件和网络 URI。打开方式 / 分享面板会真实解析目标应用；常规异常按钮显式指向开发包的兼容性入口。`Replay delivery` 使用显式传入的既有合成 UUID 指向 MainActivity，仅验证重复递送；不会读取其他应用的私有记录。`incoming-*` 来源使用独立 `.source` 文件，读取审计与之前夹具分开。

`No grant` 使用从未发放读取授权的 `incoming-denied` URI，通过 ACTION_VIEW 发送且无 ClipData / 授权标记；最初用 EXTRA_STREAM 的版本被 Android 自动补上读取授权，不能当作拒权测试。`Open fresh` 使用独立全新 URI 验证新增授权检查仍接受正常授权。测试只针对专用 AVD，不触碰真实文件，不发送网络消息，详见[外部接收报告](../../docs/Mobile_Incoming_Content_2026-10-24.md)。

## TextPack 导出夹具（第十六批）

既有 export-safe / export-unconfirmed / export-nospace 同时接受二进制导出任务，根 MIME 声明加入 ZIP 和 octet-stream。写打开审计保留，目标按返回名称写入，仅创建合成目标。`pack-alias` 是单独根：Existing.md 仅引用 empty.pdf（零字节）。createDocument 故意返回该空源附件的 ID，用于证明主应用在打开写流前核对所有源身份；原笔记和空附件必须不变，pack-alias-writes.txt 不应产生。

普通成功 / 取消 / 中断恢复 / 撤销授权后重试使用全新合成 Documents 目录。APK 和所有操作仅针对专用 AVD，不清空主应用或其他夹具，见[TextPack 验收](../../docs/Mobile_Portable_Pack_2026-10-24.md)。

## TextPack 导入夹具（第十七批）

pack-import-safe / same / stored / traversal / missing / invalid / wrongtype / txt / offline / crc / bomb / symlink 提供只读合成 ZIP 来源。资源位于本测试 APK assets/pack-import，由 Python 标准库独立生成，正常 PNG 具有有效块校验。safe 与 same 同名、内容不同；bomb 为声明 1 字节但实际展开 32 MiB 的压缩流；危险内容只保存在私有测试来源内，不解压到共享目录。safe 可用 files/pack-import-safe-offline 暂时阻断读取，验收完成移除该测试标记；源 .source 字节不改动。

`mobile-pack-import-ui.ps1` 仅辅助专用模拟器通过实际系统根目录选择夹具。脚本不会清空应用、重置旧资料或访问真实源包，详见[导入与往返验收](../../docs/Mobile_Pack_Import_2026-10-24.md)。

## 系统打开 / 分享 TextPack

`PackShareFixtureActivity` 只发送 `pack-import-*` 合成内容，可打开实际系统打开方式 / 分享选择器，或明确向开发应用发送单个包、ClipData、octet-stream、错误 ZIP、损坏包、离线来源、无授权打开、多文件及缺少文件的请求。包来源增加独立读取计数，重放相同接收编号时可核对没有重新读取来源。

`No pack grant` 必须使用不带标志的 `ACTION_VIEW`，并先结束接收应用的旧活动授权；`ACTION_SEND` 的 `EXTRA_STREAM` 可能被 Android 自动转为带授权的 ClipData，不能据此宣称测试了无授权拒绝。首次用例实际得到授权并完整保留了包，已如实记录并通过界面移除，随后使用真正的无授权打开重新验收。

辅助脚本为 `mobile-pack-incoming-ui.ps1` 和 `verify-mobile-pack-incoming-native.mjs`。仅操作专用 `LongEdit_Compat_API29` / `emulator-5558`，不重置数据；清理通过产品内确认，只删除当次导入记录。完整结果见[系统包接收验收](../../docs/Mobile_System_Pack_Import_2026-10-24.md)。

## 公开许可 TextBundle 样本（第十九批）

`external-shiny / external-fsnotes / external-generic / external-multi / external-missing` 各自提供只读 ZIP，assets 从 [`mobile-external-packs`](../fixtures/mobile-external-packs/README.md) 引入，仅进入本测试 APK。前两份为固定公开许可内容，后面是普通 ZIP、两篇笔记与缺失图片的负面样本。完整上游 SHA-256 / Git blob 身份及许可随语料保留。每份来源生成独立 `external-*.source`，读取审计写入 `external-*-reads.txt`。

`ExternalPackFixtureActivity` 的 `Share public ZIP` 使用真正系统分享面板；FSNotes 用 ZIP 名称与 octet-stream；`Open public ZIP` 使用有授权的 VIEW；异常按钮显式指向开发包。它不安装或操纵竞品应用。`mobile-external-packs-ui.ps1` 辅助页面操作，`verify-mobile-external-packs-native.mjs` 分阶段核对原包、所有原文 / 图片、既有资料和移除后的保留结果。

第十七 / 十八批 `Wrong.zip` 实际含有效单篇 V2 内容，新版本应接受；旧证据保留历史语义。真正普通 ZIP 拒绝改由 external-generic 验证。详见[公开包兼容验收](../../docs/Mobile_Pack_Compatibility_2026-10-24.md)。

## JSON 源码夹具（第二十批）

`json-source` 提供 MobileData.json，含 UTF-8 BOM、CRLF / LF、中文 / emoji、重复键、大整数、指数与转义；`json-invalid` 提供 UTF-8 完整但 JSON 语法未完成的 Unfinished.json。原字节位于 assets/json-source，Git 属性禁止换行转换。它们仅属于测试 APK，首次查询复制到独立 `.source` 文件，此后不重置。

`JsonFixtureActivity` 的 Share JSON chooser 使用实际系统分享面板；Open JSON file 使用授权的 VIEW；另两个按钮发送未完成源文文件与 JSON 文字到开发应用。来源文件只读；新的根 MIME 同时允许在系统保存窗口创建 application/json 测试目标。

`mobile-json-source-ui.ps1` 使用新鲜 UIAutomator 状态，`verify-mobile-json-source-native.mjs` 校验完整原文、人工排版预期、草稿代次、撤销重做、实际导出与既有资料。仅使用专用 API29 / emulator-5558，不清空应用；详情见[JSON 源码验收](../../docs/Mobile_JSON_Source_2026-10-24.md)。


## PDF 长文导航

pdf-navigation为独立只读根，MobileNavigation.pdf共9页，复用原3页嵌入字体样本三次（页面印刷编号重复，应用物理页码不重复），添加中文嵌套目录、命名目标、失效位置与外部链接，来源与SHA见assets/pdf-navigation/manifest.json。首次使用才复制至自身pdf-navigation.source，更新测试APK不改旧pdf-reading.source或用户资料。用于目录收放、真实跳页、六页缩略图批次、关闭不跳页和进程重开位置核对。


## PDF 双指测试（第四十一批）

测试服务新增 `TEST_PDF_PINCH`，只在 API29 ranchu/goldfish 模拟器、前台开发包 `com.longyuye.mdreader.mobile.dev` 且存在命名 PDF 画布时接收。广播要求 shell 的 DUMP 权限；两条 GestureDescription 路径同时开始，650ms后回报实际完成/取消，不向应用注入 JavaScript。坐标、跨度和画布边界经过检查；不是生产应用功能，也不进入交付 APK。服务 XML 的 canPerformGestures 仅属于本测试包。

使用 `scripts/mobile-pdf-gestures-ui.ps1 -Serial emulator-5558` 在 `LongEdit_Compat_API29` 中执行，坐标必须来自新截图。先运行 `verify-mobile-pdf-gestures-native.mjs --stage before` 保存98资料/8草稿/95提供器的基线，再逐阶段核对；原PDF、sidecar、笔记、接收回执和提供器文件不写入。记录测试前实际辅助设置并在结束时恢复、同步和正常关闭AVD。浏览器合成多点事件不能替代这项原生验收。

## 连续页面的双指测试（第四十二批）

连续阅读同时存在多张命名画布。测试服务查找包含两指起点和终点的可见画布，跳过窗口里不包含手势的其他页面；保留原有shell DUMP、API29模拟器、开发包前台、跨度和屏幕边界检查。`mobile-pdf-continuous-ui.ps1` 与 `verify-mobile-pdf-continuous-native.mjs` 复用真实dispatchGesture，不向WebView注入代码。模式选择卡片实际映射为ToggleButton，按新鲜树操作；生产APK不包含此测试服务和广播入口。
