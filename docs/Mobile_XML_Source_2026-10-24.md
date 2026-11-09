# 第二十五批：XML 源码与检查

日期：2026-10-24。继续分支 `codex/mobile-0.1.0-foundation`，基础版本 1.2.11，Android 调试包序号 `1002029`。本批接通 UTF-8 XML 源码工作流，下一批继续结构定位与受限属性值编辑。

## 审计、调研与设计

桌面 `src/views/XmlEditorView.vue` 和 `src-tauri/src/formats/xml.rs` 已有源码分析、结构位置和受限属性范围替换。手机端需要先将 XML 纳入文件入口、私有副本、草稿、搜索及导出，再增加结构表单。

补查 [FuryXML 的开发者商店介绍](https://play.google.com/store/apps/details?id=com.furyform.furyxml)，其公开描述包含树 / 文本切换、属性编辑、检查、查找和分享；复查 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html)的查找、行定位、保存及另存为。此次仅做公开文档调研，未安装竞品，不将开发者宣传视作本机性能或隐私实测。

本项目选择先贯通“收到 XML → 核对原文 → 阅读或查找 → 修改 → 主动检查定位 → 保存或导出”。检查和格式修改分开，未完成的源码也能保存。XML 中的空白、注释、CDATA、处理指令、实体写法和命名空间可能承载用户意图，因此不自动格式化或重建文档。

## 已实现

- `.xml` 新建、文件导入、Android 打开方式 / 分享路由、手机资料库、最近记录及全库内容查找。新文件以 `<root />` 和末尾换行开始，进入既有草稿保护流程。
- 阅读模式按文字显示完整源码；XML 样式表、CDATA 中的图片及链接不作为网页资源加载。编辑模式有 XML 高亮、行号和原有查找、撤销重做；关闭自动补结束标签，避免在源码修复时额外插入内容。
- 主动「检查 XML」，遇到问题可以跳到相应行列附近。检查不写草稿或文件；语法未完成、检查取消、超时或暂不支持完整检查时，源码编辑与保存继续可用。
- 复用来源冲突保护、独立本机副本、私有草稿恢复及固定快照导出，保持 XML 扩展名。仅导出文本，不打包外部资源。
- Android 的 `application/xml` / `text/xml` 选择和接收路由、分享文字默认名称、导出 MIME 已接通。沿用单文件、来源临时读取授权、先暂存核对再存入的流程。

未改动内容保持原字节，检查不通过解析结果重新生成源文。文件仍使用既有严格 UTF-8、无零字节及 4 MiB 存储限制；未接入 UTF-16 / 其他编码转换、二进制 Android XML、SVG 或 XHTML 的专门路由。

## 检查范围与实现

新增精确依赖 `@xmldom/xmldom@0.9.12`，并将已有的 `@lezer/xml@1.0.6` 登记为精确直接依赖。[xmldom 官方说明](https://github.com/xmldom/xmldom)及其类型文档描述了纯 JavaScript DOM 解析、定位和错误回调；本项目不使用其序列化器。浏览器和 Android 都在独立 Worker 中检查，不依赖主线程浏览器 DOMParser，也不将解析后的 DOM 插入页面。

检查按 XML 1.0、UTF-8 源码处理，先遍历源码语法树，限制节点和深度，定位语法错误、DOCTYPE 和字符引用，再进行 DOM 解析。所有解析器 warning / error / fatalError 都中止，不把解析器恢复后的 DOM 当作原文通过。额外检查原始 XML1.0 字符、数值字符引用、保留命名空间绑定及属性的展开名称重复。

测试发现 DOM 的 NamedNodeMap 会合并某些展开名称相同的属性，因此同时核对源码中的属性数量和解析结果，再检查 `{namespaceURI, localName}`，避免只比较属性拼写而误报通过。定位使用原始 UTF-16 源偏移，展示列按 Unicode 字符计数；CRLF / CR / LF 和初始 BOM 均映射回源码。解析器给出的某些位置只定位到问题标签附近，界面明确标注“附近”。

DOCTYPE 在进入 DOM 解析前停止，不解析 DTD、自定义实体、外部实体或外部资源。XML1.1 等其他版本、其他编码声明明确报告本轮检查边界，不发布通过结果。CDATA / 注释中的类似文字不会误判成 DOCTYPE 或字符引用。此功能是受限源码检查，不是 DTD / Schema、应用配置语义或完整标准一致性认证；手机检查器与桌面 Rust 分析器也不保证诊断完全相同。

单次检查最多 262,144 个 UTF-16 单元、40,000 个分析节点、64 层及 1,800 ms。输入、语法树和 DOM 遍历有预算，耗时工作通过终止 Worker 退出，不代表解析器有硬内存限额。取消、内容 / 文档身份变化、离开、启动失败或超时都会丢弃旧结果。更大文件保留完整源码流程，暂停检查和语法高亮。

依赖通过 package-lock-only 登记，新增包单独安装到 E 盘任务缓存后接入现有依赖目录；没有替换工作区原来的 node_modules 联接。正常检出后仍可按锁文件安装依赖，无需使用本机缓存路径。

## 本地验证

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory <新的证据目录>
```

| 检查 | 结果与证据 |
| --- | --- |
| 逻辑 | 137 项通过，含新增 8 项 XML 任务，见 [完整输出](evidence/mobile-0.1.0/xml-source-native-2026-10-24/logic-tests.txt) |
| 完整浏览器 | 24 个脚本、174 组通过，见 [完整回归索引](evidence/mobile-0.1.0/browser-regression-1792839719787/summary.json) |
| XML 专项浏览器 | 8 组通过，见 [独立复验](evidence/mobile-0.1.0/xml-source-browser-1792839370928/report.json)；最终整轮复验见完整回归索引 |
| 打包保护 | 17 项通过，见 [打包结果](evidence/mobile-0.1.0/xml-source-native-2026-10-24/packaging-verification.json) |
| Android 原生 | 11 阶段通过，见 [原生汇总](evidence/mobile-0.1.0/xml-source-native-2026-10-24/summary.json) |

浏览器使用真实文件输入和真实 Worker，验证注释补齐与定位、撤销重做、显式保存、未保存快照下载、重启草稿恢复、来源冲突副本、未完成 XML 保存、新建和全库搜索。展开名称重复、非法字符引用及未绑定前缀还与浏览器原生 XML DOMParser 交叉核对。外部样式表、图片地址及 DOCTYPE 样本均没有外部请求，原有笔记和草稿保持一致。

360px 暗色 / 200% 字号检查发现小源码视口的 `.cm-scroller` 缺少键盘焦点入口，已在共享编辑器补充命名滚动区域；实际键盘 PageDown 可滚动。最终无所检查的 WCAG 违规或页面横向溢出，既有 JSON / YAML 及编辑器完整回归也通过。早期的定位按钮选择器错误与无障碍失败记录保留在前三份 `xml-source-browser-*` 调试目录，验收以最后完整回归为准。

## Android 文件核对

专用 `LongEdit_Compat_API29`，API29 x86_64，实际 MemTotal 2,040,592 KiB、WebView 124.0.6367.219，见 [WebView 记录](evidence/mobile-0.1.0/xml-source-native-2026-10-24/webview.txt)。实际通过 ACTION_SEND 和只读 content URI 收到未完成 `.xml`，核对并存入后跳到第 8 行末尾，使用实际输入补上 `</root>`。验证一次撤销、重做、保存、DocumentsUI 系统导出回读、终止应用后的重新打开与检查。

PackageManager 另行核对两种 MIME 的 VIEW / SEND 共 4 条注册路由；此项是路由查询，不表述为全部入口的完整交互实测。

- 原始文件 SHA-256：`73e16578db419d42bf288c47503e9e881a6098cdb29a8788418c1d0128065062`。
- 修复、保存及导出 SHA-256：`6e02b6bd1d78c62369b42550d2cde704752e768d3ef2cb2ba986e4c3478eaa8f`，仅增加末尾 `</root>`。
- 原有 61 份资料、8 份草稿、18 条文字导入记录和 6 个附件包文件保持一致。最终 62 份资料，保留本轮新存入的独立 XML 笔记；只通过产品界面移除本轮回执。
- 无障碍设置恢复为启用前的 `null / 0`，仅关闭 emulator-5558。预览继续保留在本机 9012 端口。

每阶段的实际私有文件、草稿和导出字节独立读取核对；期望来自固定夹具加结束标签，不通过产品解析器生成。按钮动作回执之后仍需等待业务状态并核对文件。

## 安卓调试包与后续

两包为 `com.longyuye.mdreader.mobile.dev`，版本名 1.2.11、序号 1002029、minSdk29、targetSdk36，开发调试签名。构建来源真实记录 `7a2a0cc82608b71152a92dc9d7ab085ffbe5b3bf + dirty`，不反写之后的提交号。

| 架构 | 文件 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| x86_64 | `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | 127,258,590 B | `df7bbc9be3b146d2c9b8199d21d267f036c753a75e524f86765ed2edd740e290` |
| ARM64 | `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | 126,601,793 B | `1b24e274a7f8ab6fb56e3ef44638f45d3ef37af9b0e0a71a0a919594039e1219` |

见 [x86 构建记录](evidence/mobile-0.1.0/xml-source-native-2026-10-24/build-x86_64.json)与 [ARM64 构建记录](evidence/mobile-0.1.0/xml-source-native-2026-10-24/build-aarch64.json)。已核对 ABI、ELF、原生库摘要、版本和签名，模拟器实际安装摘要与 x86 包一致；继续使用既有 Windows 符号链接限制下的核验后复制打包流程。

下一轮继续 XML 按层结构定位和受限属性值编辑，再推进 TOML。真机、真实云提供器、完整 TalkBack 触摸、正式发布及 iOS 仍按原有退出条件独立验收。
