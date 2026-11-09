# 第十批：大文稿阅读与编辑边界

本批继续完成 M2 / A09 的大文稿任务，移动里程碑仍为 `0.1.0-dev`。代码位于独立移动 worktree，桌面工作目录未改动。

## 用户任务与竞品依据

| 用户此时的想法 | 本批实现 |
| --- | --- |
| 这篇资料很长，先让我打开并阅读 | 普通文稿继续排版；较长、行数较多、长行或排版密集的文稿按段显示源码，明确解释显示方式 |
| 记得的那句话在最后，不想逐段翻 | 搜索完整源文，自动转到命中段；换词或关闭查找取消旧任务 |
| 我要稍后接着读 | 按文档身份、内容摘要保存段落与段内滚动；内容变化后从头打开，避免错用旧位置 |
| 修改一处，不要丢掉文末或改变换行 | 编辑器保留完整源文；分段只影响阅读，保存仍由既有草稿 / 签名核对 / 写回流程执行 |
| 排版准备很慢，还能做什么 | 准备期间可直接阅读源文，也可返回；后台解析超时会终止并转入源码阅读 |

2026 年 10 月 24 日核对 [Obsidian 视口说明](https://docs.obsidian.md/Plugins/Editor/Viewport)，其编辑器只渲染可见区域及少量邻近内容；[Joplin Android 变更记录](https://joplinapp.org/help/about/changelog/android/)继续记录 CodeMirror 更新、编辑器只读状态和性能修复。另查阅 [Joplin 2021 年移动编辑器介绍](https://joplinapp.org/news/20210729-103234/)中对大文稿的探索；该历史文章使用推测措辞，不能作为当前手机性能保证。

设计推论是把“持有完整源文”与“创建全部阅读 DOM”分开，并让用户知道当前显示的是源码。没有安装竞品、测试竞品速度或照搬其容量承诺；项目自身的浏览器与 Android 结果分别记录。

## 阅读与查找实现

- 文件访问、草稿及保存仍保留 4 MiB UTF-8 文本上限。本批没有提高读取上限，也没有按段写回原文件。
- 普通阅读的初始预算为 128 KiB UTF-8、2,000 行及 16,384 UTF-16 单元的单行。超过任一预算直接进入分段源码阅读，Markdown 符号和图片引用保持文字，不自动加载图片。
- 普通 Markdown / TXT 的排版准备在独立 Worker 中进行。完成、失败、离开页面或用户选择直接阅读时终止 Worker；2 秒准备计时到期时也终止。计时只约束后台解析等待，不承诺完整打开、原生读取或所有设备上的单帧时间。
- Worker 结果先按 384 Ki UTF-16 单元及 4,000 个 `<` 标记进行保守检查，再交给原有 DOM 清理与隔离 iframe。原文脚本、外部地址和文档中的内部属性仍经过原有处理；没有放宽 iframe sandbox 或读取外部网络。
- 源码每段最多 16,384 UTF-16 单元，倾向在邻近换行处分段，不拆开 CRLF 或代理对。不裁剪、改写或丢弃任何片段。上一段、下一段和有效段号跳转可达，翻段后焦点进入阅读区域。
- 阅读区域使用 `document` 语义，避免用区域名称覆盖正文；内部以最多 128 单元 / 8 个换行的小片段暴露文本，视觉上仍连续显示。Android 界面树必须包含实际正文，不能只检查截图或区域标签。
- 源码阅读与编辑内查找每次处理有界片段并让出事件循环，保留跨片段的字面命中、Unicode 不区分大小写和最多 1,000 处提示。换词、文稿变化、切到阅读或离开编辑会取消旧任务，查找进行时显示进度状态。
- 编辑器沿用 CodeMirror 的视口渲染。新增缓存避免父组件回传刚发出的内容时重复序列化全篇；每次实际编辑仍需要产生完整源文供草稿使用。未引入增量原生草稿或严格的总进程内存上限。

## 返回页面的原生问题

API 29 / WebView 124 复核中，普通 iframe 文稿关闭后，文件列表视觉正常，但无障碍树只剩应用根节点。关闭阶段原先同时使用整个工作区的 `inert` / `aria-busy`，触摸返回又未必将活动焦点移出 iframe；仅重建 Vue 工作区或只移除关闭阶段的 `inert` 都未解决该设备上的现象。

本批保留弹窗所需的 `inert`；关闭文稿期间捕获并阻止点击 / 键盘事件，以状态文本播报返回进度，先将焦点移至主页面返回按钮并等待一帧，再销毁 iframe。此组合在原生界面树复核中恢复了实际文件条目。首次状态在 `after-small-back.xml/png`，仅移除 `inert` 的失败状态在 `after-return-fix.xml`，最终组合在 `after-host-focus.xml` 与 `final-library.xml`。

源码阅读的首次实现也出现区域名称可见、正文未暴露的问题；增加命名 region 和小片段仍未充分解决，最终使用不以标签覆盖正文的 `document` 阅读区域。最终界面树包含 `BudgetSaved`、正文和末尾文字；完整 TalkBack 触摸导航仍保持待验收，不将 UIAutomator 等同于人工读屏。

## 本地复现

```powershell
npm run test:mobile
npm run build:mobile
npm run test:mobile-document-budget-browser
node scripts/create-mobile-document-budget-fixture.mjs

# 专用 AVD 为 LongEdit_Compat_API29，serial 必须显式指定。
E:/Android/Sdk/platform-tools/adb.exe -s emulator-5558 push E:/Android/BuildCache/mobile-document-budget-fixture/library/. /sdcard/Documents/LongEdit-DocumentBudget-20261024/
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64

# 从系统文件选择器授权上述合成文件夹后执行。
node scripts/verify-mobile-document-budget-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/document-budget-native-2026-10-24 --stage before
# 编辑后使用 pending；实际保存完成后使用 saved；saved 通过后才强制停止并重开，最后使用 final。
```

夹具含 `Large.md`（4,193,280 字节，距 4 MiB 上限留 1 KiB）、普通文稿、密集 HTML 和 100,024 字节的单行 TXT。大文稿含中文、emoji、CRLF / LF / CR 混合换行、首尾唯一标记与文本形式的外部链接。原生只改合成文件，并在写入前后核对完整字节和其余文件摘要。

浏览器大文件任务对预览数据键使用隔离的内存 Storage 替身，避免浏览器 localStorage 的配额干扰 UI 验证；阅读位置仍使用实际 localStorage。浏览器保存不能代替原生文件保存，Worker 超时用明确标记的停滞替身触发，普通排版则使用真实 Worker。

## 验证记录与限制

57 项逻辑测试、54 组浏览器任务（既有 47 组与新增 7 组）、17 项打包检查通过。新增源码阅读在 200% 字号下通过本次选择的 axe 规则，浏览器 ARIA 快照包含正文。接近 4 MiB 的夹具初始页面实测为 181 个元素、16,383 个源文字单元；这些是浏览器规模数据，不是手机速度或峰值内存承诺。

API 29 / WebView 124 最终 `final.json` 通过：从实际 SAF 文件找到末尾，保护完整候选，等待保存回执并核对源文件，再强制停止及重开。`Large.md` 仅增加 `BudgetSaved` 的 11 个字节，其余原始字节及混合换行保留；另外三份文件摘要未变，已保存代次的私有草稿已清理。源码阅读原生界面树包含实际正文与末尾，普通 Markdown 使用包内 Worker 离线排版，密集 HTML 与超长行按源码阅读，返回普通文稿后的文件条目可达。

| 调试目标 | 字节数 | SHA-256 |
| --- | ---: | --- |
| ARM64 | 126220697 | `f97791c17029d8aff77acf38bfa59f043026e1938b7372ce3f4672785bc792b5` |
| x86_64 | 126877982 | `70c3bce47b53772188d269807925dc9c5f25879baa22fcf21e79044a41e23569` |

产物位于 `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` 及 `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk`。两个 ABI 的 versionCode 均为 `1002014`，versionName 保持 `1.2.11`。开发签名、原生 ABI / ELF / 摘要及构建时的 `51a54867 + dirty` 状态随包记录，没有把中途包摘要冒充最终产物；ARM64 仅完成构建和产物校验，未做真机运行验收。

结果与构建信息在本批完成复核后记录于 `evidence/mobile-0.1.0/document-budget-native-2026-10-24/verification-summary.json`。原生界面使用 ADB 输入和 UIAutomator，不通过 WebView 调试端口操作。进程内存快照只是该时刻样本，浏览器堆、应用进程和独立 WebView renderer 不应混为同一指标，也不能据单次样本宣称峰值内存上限。

首次浏览器密集夹具的行数先触发了行预算，修正夹具以独立验证排版密度；另一轮脚本在重建浏览器上下文后复用了旧页面定位器，修正测试脚本后重跑。失败报告保留，不将其算入通过组数。原生首次辅助定位没有先滚动到文件，不将该次未打开视为大文稿读取失败。

返回期间现在异步完成焦点切换，旧规模脚本在点击后立刻统计文件行产生竞争，已改为等待文件和焦点恢复。其 MutationObserver 立即点击新建按钮还遇到 Vue 捕获监听器的同一毫秒事件时间戳过滤，改为下一任务触发点击；仍要求在扫描让出期间停止、无部分结果、重试得到完整计数。首次草稿检查早于持续输入完成和保护回执，最终流程先等待完整输入及“草稿已保护”，再读取私有文件核对。

尚待推进：ARM64 厂商真机、完整 TalkBack 触摸探索、WebView 111 全流程、真实云提供器、增量草稿 / 历史的长期内存预算、干净检出构建及正式 release。分段源码不是完整的大文稿富排版方案；M2 / A11 / A12 继续按原退出条件验收。
