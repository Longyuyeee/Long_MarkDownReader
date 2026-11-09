# 移动端第三批：图片、文档内查找与阅读接续

本批在 `codex/mobile-0.1.0-foundation` 接续存储边界工作，产品实现提交为 `b98e0025282b190362773c433c0b5e49cee99abf`。开发与验证跨越香港时间 2026 年 10 月 23 日至 24 日；证据目录沿用开始日期。桌面工作目录及共享 HTML 预览工具没有修改。

## 用户现在可以完成的任务

| 用户任务 | 实际行为 |
| --- | --- |
| 手机打开笔记，也能看到旁边的图片 | Markdown 按笔记所在目录解析相对 PNG、JPEG、WebP 路径；允许访问同一已授权资料库中的上级、同级与子目录 |
| 找到正文里的某句话 | 文档顶部有查找按钮；阅读模式查找渲染文字，编辑模式明确标为源码内查找；支持中文、符号及不区分大小写的拉丁文字 |
| 确定找到了哪一处 | 显示当前命中与数量，提供上一处、下一处及首尾循环；阅读命中和编辑选区都有可见高亮 |
| 下次接着读 | 以资料库与相对文件路径分别记录段落及段内位置；重开时接续，并提供从头阅读 |
| 原文已经被别处修改 | 内容指纹不一致时从头打开并说明原因，避免套用旧位置 |
| 图片暂时不可读 | 保留正文，显示具体原因；读取失败可重试。错误内容同步到无障碍标签 |
| 键盘打开后继续操作 | 文档工作区随可用高度收缩，正文独立滚动，查找和底部工具保持可达 |

查找为字面匹配，不把输入解释成正则表达式或资料库搜索语法；单次输入最多 128 字符，先定位前 1,000 处。阅读文字可以跨加粗等行内标签匹配；源码模式包含 Markdown 标记，两种模式的命中数可能不同。查找和阅读接续不会替用户保存正文。

图片本批仅加载授权库内的相对地址。远程、设备绝对路径、越出资料库的路径、SVG 和其他尚未接入的图片形式显示说明。每张上限 2 MiB、8 百万像素，任一边不超过 8,192 像素；本页最多尝试 12 张，去重后的图片累计上限 8 MiB、12 百万像素。重复图片复用读取结果，重试继续使用同一页预算。正文先呈现，图片逐张补入。

阅读记录保存在当前应用或浏览器的本地数据中，最多保留最近 100 份，包含文档身份、内容指纹与位置，不保存查找词。它不提供跨设备同步；清除应用数据或卸载会移除记录。按段落恢复在排版变化时属于附近位置接续，不宣称逐像素还原。

## 竞品与平台依据

[Obsidian 附件说明](https://obsidian.md/help/attachments)将附件作为库中的普通文件，并允许放在笔记同级或相邻子目录。本项目据此优先打通已有笔记与附件的相对关系，后续再接入插入、修复与分享。

[Joplin 搜索说明](https://joplinapp.org/help/apps/search/)区分搜索方式，并专门讨论中文等语言的分词限制。本批的设计取舍是先提供容易预测的中文与符号字面查找，界面明确限定到当前文档。资料库全文索引仍是下一批工作，不能将当前功能当作全库检索。

以上是官方公开文档调研，没有安装竞品完成逐项移动端实测。阅读位置恢复及按钮安排是本项目围绕“接着读、找到内容”的设计决定，不作为竞品已验证行为陈述。

## 阅读页的隔离与控制器

为了读取滚动位置及标记渲染文字，移动阅读页加入固定的 `readerBridge.js` 控制器。原共享预览工具继续先移除来源脚本、事件、嵌套框架和外部资源地址；移动层进一步移除来源样式及内部属性，将相对图片转换为受限文档身份，再通过原生适配器读取。

iframe 仅开放 `allow-scripts`，保持独立的不透明来源，没有 `allow-same-origin`。iframe CSP 只允许固定控制器的 SHA-256，Android 父页面 CSP 同时锁定该摘要。控制器不拼接来源文字成 JavaScript；源文中的脚本和事件不因此获准执行。图片只通过受控消息接收已验证的 raster data URL。

父页面只接收当前 iframe 窗口和当前随机通道的消息，并校验位置与数量范围；消息协议仅处理就绪、位置、命中和图片失败，不转发任意原生调用。原生层读取图片前继续验证目录授权、路径、文件类型、字节数及图片尺寸。

此设计参考 MDN 的 [iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)、[postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage) 和 [script-src 摘要策略](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src)。浏览器任务实际验证父文档和 localStorage 访问受阻、任意内联脚本与事件被 CSP 拒绝、源脚本与框架已移除、外部网络请求为零及伪造通道被忽略。

修改控制器后执行 `node scripts/sync-mobile-reader-csp.mjs --write`，同步两处摘要。`npm run test:mobile` 会独立计算实际文件摘要检查一致性；只改代码或只改一侧 CSP 会使检查失败。

## 已完成的验证

| 层次 | 本批结果 | 证据 |
| --- | --- | --- |
| 会话与纯逻辑 | 21 项通过，包含原 16 项和新增 5 项路径、位置及 CSP 检查 | `npm run test:mobile` |
| 类型与生产构建 | Vue 类型检查、Vite 移动构建及 x86_64 APK 打包通过 | [构建记录](evidence/mobile-0.1.0/reading-native-2026-10-23/build-record.json) |
| 基本浏览器任务 | 6 组通过，360 / 412 / 800 视口 | [基本回归](evidence/mobile-0.1.0/browser-1792771730170/report.json) |
| 存储边界浏览器任务 | 4 组通过 | [恢复及权限回归](evidence/mobile-0.1.0/boundaries-browser-1792771851032/report.json) |
| 新增阅读浏览器任务 | 6 组通过，无未捕获页面异常，外部请求为零；含附件恢复后的重试及 640 × 360 短视口 | [阅读任务](evidence/mobile-0.1.0/reading-browser-1792772035913/report.json) |
| 原生系统目录与图片 | 系统授权后读取上级目录 PNG；缺失、超大、超分辨率、损坏和不支持地址均有反馈 | [原生任务](evidence/mobile-0.1.0/reading-native-2026-10-23/tasks.json) |
| 原生重开与查找 | 强制停止前后首个可见节均为第 10 节；阅读及源码查找均可到第 2 / 3 处 | [机器核对](evidence/mobile-0.1.0/reading-native-2026-10-23/verification.json) |
| 原生文件与草稿 | 两份 Markdown 与原 PNG 按字节一致；测试撤销后没有遗留旧草稿 | 同上 |
| 原生键盘 | Gboard 打开时查找、正文和底部操作可用；源码当前命中可见高亮 | [键盘截图](evidence/mobile-0.1.0/reading-native-2026-10-23/source-search-keyboard.png) |

设备为专用 `LongEdit_API35` / `emulator-5556`，Android 15 / API 35、x86_64，WebView 124.0.6367.219。应用身份为 `com.longyuye.mdreader.mobile.dev`，versionName 1.2.11；界面 0.1.0 是移动里程碑。最终 debug APK 为 126,790,538 字节，SHA-256 `d8437e27a3a3944bef21136f156e3ea760b4102ce24138f6310fca1471481ac1`。构建时本批代码尚未提交，记录保留 `sourceDirty: true`，不是干净发布提交的正式包。

正向图片解码在本批实际覆盖 PNG。JPEG、WebP 已接入类型识别，但正向样本仍待补测。键盘测试使用 ASCII 输入并核对中文原文，不能替代中文输入法合成、选文或 TalkBack 验收。没有将模拟器结果当作真机性能数据。

## 本地复现

```powershell
npm run test:mobile
npm run build:mobile

$env:LONGEDIT_PLAYWRIGHT_MODULE = 'C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL = 'http://127.0.0.1:9012/mobile.html'
npm run test:mobile-browser
npm run test:mobile-boundaries-browser
npm run test:mobile-reading-browser

./scripts/build-mobile-debug.ps1 -Target x86_64
# 只在专用测试目录生成夹具，会替换目录内的具名测试文件。
node scripts/create-mobile-reading-fixture.mjs E:/Android/Downloads/LongEdit-Reading-20261023
& 'E:/Android/Sdk/platform-tools/adb.exe' -s emulator-5556 push E:/Android/Downloads/LongEdit-Reading-20261023 /sdcard/Documents/
```

在系统选择器授权该测试目录，进入 `notes/reading-note.md`。核对相对图片、阅读查找及源码查找，保留键盘截图。回到阅读后滚到较后段落，记录截图与 XML；执行 `am force-stop` 后重新启动，从最近资料重开，再核对段落。打开 `image-limits.md` 核对 PNG、字节、尺寸、解码与路径边界。全部操作完成并保存界面证据后运行：

```powershell
node scripts/verify-mobile-reading-native.mjs --serial emulator-5556 --fixture-dir E:/Android/Downloads/LongEdit-Reading-20261023 --output docs/evidence/mobile-0.1.0/reading-native-2026-10-23
```

核对脚本只读设备数据和已保存的 XML，不选择或清除设备，不代替上述 UI 操作。APK 与完整构建日志在忽略目录 `release-artifacts/mobile-debug/x86_64/`；夹具生成器使用仓库已有图标，不提交大文件测试样本。

## 首次失败与修复

- 异步生成 srcdoc 时曾出现空白阅读页。改为内容准备后才创建 iframe，并按当前通道重建；[首次基本回归失败](evidence/mobile-0.1.0/browser-1792770201846/report.json)及[首次阅读失败](evidence/mobile-0.1.0/reading-browser-1792770298261/report.json)保留，最终基本及阅读任务完整重跑通过。
- 恢复提示与图片失败摘要合并显示，原精确文字定位不适用；改为按状态区内容查找，并同时检查实际滚动和本地记录。[该次记录](evidence/mobile-0.1.0/reading-browser-1792770603879/report.json)保留。
- 自动化在特权求值上下文中调用 eval 不能证明网页 CSP 的执行结果；改为实际插入未授权内联脚本和事件处理器，验证未执行。[旧断言失败](evidence/mobile-0.1.0/reading-browser-1792770646465/report.json)不是产品允许源脚本运行的证据。
- 安卓截图显示源码当前选区不够醒目，已加入 CodeMirror 选区绘制与高亮。图片错误原本只显示在画面中，无障碍标签仍是图片名称；已同步具体原因，[修复前 XML](evidence/mobile-0.1.0/reading-native-2026-10-23/image-limits-before-a11y-fix.xml)与最终 XML 均保留。
- 测试驱动曾将文本输入到正文编辑器而非查找框；通过撤销恢复，重新执行查找。最终文件按字节一致，旧测试草稿已清理。未把这次驱动误点当作查找通过依据。

## 下一批顺序与边界

1. 接入资料库全文索引，明确当前授权范围、索引状态、更新与结果返回位置，补中文与符号查询任务。
2. 补齐图片正向格式样本、插入与修复，继续量化大文档、目录及图片累计预算；当前上限不代表所有边界规模已做性能验收。
3. 完成中文 IME、真实屏幕阅读器、横屏与字号等任务；构建 arm64，在真机执行权限、重开、升级、离线及性能检查。
4. 继续剩余原生存储故障及既定多格式迁移；iOS 原生工作仍需 macOS / Xcode。

M0 / M2 和首个分发里程碑的完整退出条件仍保持待验收。
