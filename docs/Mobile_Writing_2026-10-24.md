# 第六批：写作接续、中文输入与字号布局

本批继续使用独立 worktree 和 `codex/mobile-0.1.0-foundation`，按「打开笔记 → 输入 → 修改 → 阅读检查 → 保存 / 恢复」设计。桌面工作目录不参与修改。安卓 0.1.0-dev 仍按原里程碑退出条件验收，模拟器结果不替代真机和发布包。

## 调研及用户任务

2026 年 10 月 24 日核对官方资料与官方源码，没有安装竞品进行体验比较：

- [Obsidian 移动端](https://obsidian.md/help/mobile)将编辑动作放在键盘附近，允许横向浏览工具栏；本批保留这个就近操作位置，补上重做及可用状态，让阅读入口有独立空间。
- [Joplin 官方移动编辑器源码](https://github.com/laurent22/joplin/blob/dev/packages/app-mobile/components/NoteEditor/NoteEditor.tsx)使用相对字号支持系统辅助字号，并提供撤销 / 重做深度变化接口。本批将页面与阅读样式的文字字号改为 rem，按钮保留触摸尺寸；Android 显式将系统 fontScale 映射至 WebView textZoom。
- [CodeMirror 参考](https://codemirror.net/docs/ref/#view.EditorView.composing)区分实际合成与 compositionStarted，并提示 Android 上单纯放置光标也可能开始合成。本批不使用该开始标志长期锁住编辑动作；保留编辑器原生输入处理，仅延后有关键词的查找刷新。
- 平台依据：[WebSettings.setTextZoom](https://developer.android.com/reference/android/webkit/WebSettings#setTextZoom(int))与 [Configuration.fontScale](https://developer.android.com/reference/android/content/res/Configuration#fontScale)。WebView 的百分比文字缩放不等同于所有厂商原生控件的非线性 sp 缩放。

| 用户想做的事 | 本批行为 |
| --- | --- |
| 读一下刚写的内容，再接着改 | 第一次编辑时才创建编辑器；阅读时隐藏并保留实例，返回后继续使用原选区、滚动及撤销历史 |
| 改错一步后重新找回 | 工具栏同时提供撤销和重做；不能执行时禁用，不显示一个始终可点却没有结果的动作 |
| 把当前段落变成标题或列表 | 按触及的整行处理，不在句子中间插入符号；选区末端恰在下一行起点时不误改下一行；可再次点击取消 |
| 加粗后直接写文字 | 空选区插入并选中「文字」；已有选区保留，普通输入直接替换；再次点击取消加粗，不不断套标记 |
| 输入中文、标点和换行 | 合成内容由系统 / CodeMirror 处理；已进入正文的变化继续保护私有草稿，原文件仍需显式保存 |
| 放大字号或横屏继续写 | 页面文字相对缩放；工具栏横向滚动，阅读动作占独立列；极短窗口改从标题栏更多菜单使用工具和阅读，正文保留一行以上空间，窗口变化后显示当前光标 |

当前撤销历史只保留在本次打开的文档会话中。关闭文档、换文档或终止进程后，恢复草稿保护正文，不恢复整条撤销历史。应用不能读取仍只停留在输入法候选栏、尚未交给 WebView 的文字。

## 实施顺序和变更

1. **先修写作状态。** 编辑 / 阅读切换保留同一 CodeMirror 实例，新的文档身份重新建实例；已保存同一文档不重置历史。新增重做和实际可用状态，图片插入与格式操作作为独立撤销步骤。
2. **再修选区和格式。** `editorCommands.ts` 对标题、列表、引用按完整行处理；加粗只改边界标记，保留选中文字与其中原有换行。中文 / emoji 和倒向选区按 CodeMirror 位置映射。
3. **核对真实输入。** 补齐 `defaultKeymap`，覆盖回车、常用选文与删除行为。输入时不反复安装空查找状态；存在查询时等待输入稳定 / 合成结束后更新匹配，不重新选择第一条结果。
4. **在源文边界维护换行。** `sourceFormat.ts` 让 CodeMirror 使用默认 LF 模型，原文输出才恢复来源的换行。首次出现的换行作为新增输入的偏好；不同于该偏好的原有换行由位置集合保留，随着编辑映射，删除及撤销时恢复。不会为了修输入而把整份混合换行文件统一改写。`editorOffsets.ts` 的图片选区映射同时读取该源文视图。
5. **最后核对字号与窗口。** Android 创建 WebView 和 configuration 更新时应用字号百分比，并处理 fontScale 配置，减少因改字号而重建 Activity。布局支持 360px、小高度、横屏与 200% 字号；原生 Gboard 留下约 127 CSS px 高度时，压紧标题栏并将工具移到更多菜单。编辑器观察窗口和自身尺寸，输入稳定后将当前光标移到可见区；只处理布局 / 滚动，不改正文或选区，也不在用户正常滚动时反复拉回。

首次浏览器合成检查发现缺少默认按键映射会让 CRLF 文档回车插入 LF；添加默认映射后浏览器通过。随后真实 Gboard 回车又发现强制 CRLF 的内部模型会产生非结构化换行，采用上述内部 / 源文分离后继续原生复测。保留首次失败的截图和候选草稿，不将浏览器通过当成原生输入已经通过。

## 本地复现

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:\Users\39633\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
npm run test:mobile-editor-browser

node scripts/create-mobile-writing-fixture.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5556 push release-artifacts/mobile-writing-fixture /sdcard/Documents/LongEdit-Writing-20261024
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5556 install -r release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk
```

静态浏览器任务先完成构建，再从另一终端使用 `npm exec vite preview -- --host 127.0.0.1 --port 9012`。构建会重建 dist，不能同时让浏览器回归读取同一份正在重建的预览资源。

通过系统目录选择器授权专用 Writing 目录。Gboard 添加简体拼音，分别检查默认候选栏模式和 Inline composing 模式；按截图定位触摸字母和候选词，不能用 `adb input text` 的英文字母代替拼音候选输入。光标定位可使用原生 Ctrl+End；恢复任务另用明确标记的 ASCII 输入。

在 `Writing.md` 末尾输入并选定「你好」、中文逗号、回车及「中文」。保存前读取原文件、私有草稿和预期来源摘要，保存后按字节核对 CRLF、正文和输入。切阅读再回编辑，分别撤销 / 重做，核对源文不被编辑动作静默改写。字体放大、旋转后再次验证历史与入口；完成后恢复模拟器字号和旋转设置。

`verify-mobile-writing-native.mjs` 是针对本轮夹具和交互证据的只读复核，阶段包括 `preedit`、`before-save`、`after-save`、`after-undo`、`selection-format`、`before-stop`、`after-stop` 和 `final`，参数为 `--serial` 与 `--output`。重复完整任务使用独立夹具状态，避免将上次的已保存 / 恢复输入当成本次初始状态。

## 验收结果

45 项逻辑测试通过，包含新增 10 项编辑 / 源文格式检查；浏览器新增 6 组任务与既有 29 组回归通过，共 35 组。最终报告没有未捕获页面错误，带网络检查的任务没有外部请求。

| 浏览器范围 | 最终报告 |
| --- | --- |
| 写作、合成、选区、字号 / 极短窗口 6 组 | [写作报告](evidence/mobile-0.1.0/editor-browser-1792785007459/report.json) |
| 基础 6 组 | [基础报告](evidence/mobile-0.1.0/browser-1792785007656/report.json) |
| 阅读 / 图片隔离 6 组 | [阅读报告](evidence/mobile-0.1.0/reading-browser-1792785007280/report.json) |
| 整库查找 6 组 | [查找报告](evidence/mobile-0.1.0/search-browser-1792785129282/report.json) |
| 存储边界 4 组 | [边界报告](evidence/mobile-0.1.0/boundaries-browser-1792785007532/report.json) |
| 附件 7 组 | [附件报告](evidence/mobile-0.1.0/attachments-browser-1792785007993/report.json) |

原生使用 Android 15 / API 35 / x86_64，WebView 124.0.6367.219，Gboard 14.2.09.629370537。按[实际交互记录](evidence/mobile-0.1.0/writing-native-2026-10-24/tasks.json)分阶段核对，最终[源文 / 草稿验证](evidence/mobile-0.1.0/writing-native-2026-10-24/verification.json)通过：

| 原生任务 | 结果与证据 |
| --- | --- |
| Gboard 候选栏 / Inline composing | 默认候选未进入正文；开启 Inline composing 后，私有草稿含实际 `ni hao`，截图同时显示「你好」候选；[合成草稿](evidence/mobile-0.1.0/writing-native-2026-10-24/preedit.json) |
| 中文、逗号、回车与显式保存 | 保存前源文摘要等于原夹具；保存后精确增加 `你好，`、CRLF、`中文`，没有遗留拼音或混合换行；[保存前核对](evidence/mobile-0.1.0/writing-native-2026-10-24/before-save.json) |
| 阅读切换与历史 | 返回后可撤销，源文件不变；重做恢复已保存内容；[撤销核对](evidence/mobile-0.1.0/writing-native-2026-10-24/after-undo.json) |
| 原生触摸选词 | 长按显示系统 Cut / Copy / Select all 与选区手柄；加粗只包住所选单词，撤销回到已保存内容；[选区格式核对](evidence/mobile-0.1.0/writing-native-2026-10-24/selection-format.json) |
| 系统 100% → 200% | 文件标题的实际节点高度从 58 增到 110 物理像素，工具 / 正文仍可达；[200% 竖屏截图](evidence/mobile-0.1.0/writing-native-2026-10-24/font-200-portrait.png) |
| 200% 横屏键盘 | 实际旋转为 1，Gboard 留下约 127 CSS px；更多菜单重做 / 撤销仍可用，当前中文输入光标可见；[最终横屏截图](evidence/mobile-0.1.0/writing-native-2026-10-24/font-200-landscape.png) |
| 强制停止与安装更新 | 捕获的 `Recovery Pending` 可见输入及来源摘要在停止 / 更新后完整恢复；通过普通退格移除本轮测试标记后回到已保存内容；[前](evidence/mobile-0.1.0/writing-native-2026-10-24/before-stop.json) / [后](evidence/mobile-0.1.0/writing-native-2026-10-24/after-stop.json) |

候选栏 / 内联合成使用真实 Gboard 触摸字母和候选词，光标定位使用原生快捷键。恢复标记由原生键盘事件输入，Gboard 将其分成两词，验收比较实际捕获的可见字节。浏览器 Chromium 合成事件和 200% 根字号用于网页任务，原生字号由系统设置触发，分别记录。

最终 APK 为 `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk`，126,842,126 字节，SHA-256：`dc82caafd0ee9c3579d510ea0ba9c93b8c4507d2e1330516934f0f3abf86b31b`。[构建记录](evidence/mobile-0.1.0/writing-native-2026-10-24/build-record.json)标明父提交 `d08119246a07cae89e3f117b51fb5cd37220af1f` 和 `sourceDirty=true`，包含本批随后提交的源码；已回读[实际安装包摘要并核对一致](evidence/mobile-0.1.0/writing-native-2026-10-24/installed-apk.json)。这是开发签名的 x86_64 包；原生任务在修复过程中分阶段执行，每版对应范围见交互记录。

首次失败还包括：Gboard 实际合成词带音节空格，修正了驱动对拼音的假设；仅改 user_rotation 设置未得到真实横屏，改用 `wm user-rotation lock` 并检查 XML rotation；极短窗口工具栏遮住正文、旋转后光标不在可视区，均保留修复前截图。浏览器有一次在 dist 重建时加载失败，调整为构建完成后执行；菜单操作和 CodeMirror 选区绘制是异步过程，断言改为等待实际结果，最终完整任务通过。失败报告继续保留。

## 下一步

继续完整 TalkBack 遍历、厂商 / 真机中文输入与手柄选文、最低 API 29、arm64、离线 release、覆盖升级和性能矩阵。实际断电、提供器写入中断以及更大资料库仍按既定计划单独验收。本批没有把这些任务标成完成。
