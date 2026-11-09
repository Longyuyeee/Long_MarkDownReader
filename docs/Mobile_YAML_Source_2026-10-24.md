# 第二十三批：YAML 源文与检查

日期：2026-10-24。继续在 `codex/mobile-0.1.0-foundation` 开发，基础版本为 1.2.11，Android 开发包序号为 `1002027`。本批完成 YAML 的源码工作流，后续继续迁移结构浏览与受限值编辑。

## 审计、调研与用户任务

桌面端 `src/views/YamlEditorView.vue` 通过 Rust 的 `analyze_yaml_source` 获取诊断和大纲，通过 `replace_yaml_value_source` 做有范围约束的单值修改。移动端原有文件入口、保存副本和原生存储白名单只接受 Markdown、TXT、JSON，需要先贯通文件流程，再扩展结构操作。

补查 [QuickEdit 官方概览](https://rhmsoft.com/qedit/intro.html)的行号、指定行跳转、查找与撤销重做，以及 [Acode 官方设置](https://docs.acode.app/user-guide/settings)中的编辑器和按语言格式化设置。此次是公开文档调研，未安装竞品，也未上传任何用户文件。

据此将手机用户任务安排为：收到一份配置，先核对完整原文；需要修改时进入编辑，主动检查并跳到问题行；改完明确保存，也可以导出当前内容副本。源码随时可用，不要求正在输入的文件先通过语法检查。

## 已实现

- `.yaml` / `.yml` 新建、系统文件接收与导入、手机资料库列表、最近记录及全库内容查找。新建 YAML 从空内容开始；导入与副本保留所选扩展名。
- 阅读模式显示原文，HTML 和 Markdown 记号按文字呈现。编辑模式使用 YAML 语法高亮、行号及现有全文查找、撤销和重做，隐藏 Markdown 排版及附件包工具。
- 主动「检查 YAML」，展示问题或提示，以及按 Unicode 字符计数的行列位置；「去这一行」进入编辑器的对应位置。自定义标签产生提示，不把语法检查等同于配置应用接受该文件。
- 复用已有私有草稿、显式保存、来源冲突保护、独立本机副本、重启恢复和固定快照导出。语法有误或超出分析预算时仍能保存、导出完整原文。
- Android 文件选择、VIEW / SEND 注册、文字分享默认文件名和导出 MIME 接入常见 YAML 类型；沿用来源临时授权、先暂存再核对及独立副本策略。

原文不经过解析再序列化。注释、锚点、别名、块标量、键顺序、大整数、负零、指数写法、BOM 和混合换行由现有源文编辑及存储链路保留；检查本身不写草稿或文件。

## 检查边界

使用项目已安装的 `yaml@2.9.0`，增加精确版本的直接依赖，没有升级其他依赖。[官方解析文档](https://eemeli.org/yaml/#parsing-documents)支持多文档 AST、错误与提示；本实现只分析这些节点，不调用 `toJS`、`toJSON` 或 `stringify`，也不展开别名。按文档和源码出现顺序核对别名的锚点，支持先定义的递归锚点，未定义及跨文档引用报告问题。

默认 YAML 1.2，尊重文件中的版本指令；启用严格解析和解析器的重复键检查。复杂键、应用自定义标签和应用 Schema 的语义不属于完整应用验证。本批的 JS 检查器与桌面 Rust 分析器不同，未宣称诊断完全一致。

分析在专用 Worker 中运行，超时、取消、卸载以及文档身份或全文变化都会终止任务并丢弃旧结果。检查最多接受 262,144 个 UTF-16 单元；AST 遍历预算为 40,000 个节点、64 层和 128 份文档；最多显示 20 条、每条 300 个单元的诊断。超时上限为 1,800 ms。节点预算在解析后检查，耗时解析由主线程终止 Worker，并非对解析器的硬内存限制。更大文件保留完整源码能力，暂停检查和语法高亮；文件存储仍沿用 4 MiB UTF-8 上限。

未实现 YAML 结构大纲、结构表单编辑、自动重排、应用 Schema、配置执行或桌面全部功能。下一步先补结构定位与有范围约束的标量编辑，再继续 XML / TOML。

## 验证与复现

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

| 检查 | 结果及证据 |
| --- | --- |
| 逻辑 | 118 项通过，包含新增的 8 项 YAML 检查，见 [完整输出](evidence/mobile-0.1.0/yaml-source-native-2026-10-24/logic-tests.txt) |
| 全量浏览器 | 22 个脚本、159 组通过，见 [完整索引](evidence/mobile-0.1.0/browser-regression-1792835917895/summary.json) |
| YAML 专项浏览器 | 7 组通过；真实文件输入、真实 Worker 及故障注入、修复与撤销、草稿恢复、冲突副本、下载字节、查找、大文件与 360px 暗色 / 200% 字号，见 [独立复验](evidence/mobile-0.1.0/yaml-source-browser-1792835806866/report.json)；全量回归索引还包含最终同组复验 |
| 打包保护 | 17 项通过，见 [核对结果](evidence/mobile-0.1.0/yaml-source-native-2026-10-24/packaging-verification.json) |
| Android 原生 | 11 阶段通过，见 [原生汇总](evidence/mobile-0.1.0/yaml-source-native-2026-10-24/summary.json) |

调试中修正了测试脚本的菜单 / 草稿按钮名称，并修复无障碍检查发现的定位按钮名称与可见文字不匹配。早期失败记录保留在 `yaml-source-browser-1792835582192` 和 `yaml-source-browser-1792835653744`；验收以最后完整回归为准。

原生运行于专用 `LongEdit_Compat_API29`，API 29、x86_64、实际 MemTotal 2,040,592 KiB。本轮未另行捕获 WebView 精确版本。实际经 ACTION_SEND 和只读 content URI 收到 `.yml`，先核对并存入；检查错误后定位第 12 行第 14 列，用实际键盘输入 `]` 修复，验证撤销、重做、显式保存、DocumentsUI 系统导出、回读及终止进程后的重新打开。PackageManager 另行核对四类 YAML MIME 的 VIEW / SEND 共 8 条注册路由，不将这项只读查询表述为全部入口的完整交互实测。

每一阶段独立读取私有文件并比对，未使用产品解析器生成期望结果：

- 原始文件 SHA-256：`fc753b190033d3e12ff4f660e84d786edb145f805f9640f99ae3924154ac8b2c`。
- 修复后的保存文件及导出 SHA-256：`d0f98807eab3988d7b84399f1c63be6bb330060dad060a9e03cdd99bba192a23`，只比原文增加末尾的 `]`。
- 原有 59 份资料、8 份草稿、18 条文字导入记录和 6 个附件包文件保持一致。最终 60 份资料，保留本轮新增的独立 YAML 笔记；只通过产品界面确认移除本轮回执。
- 无障碍测试服务设置已恢复为启用前的 `null / 0`，仅关闭本轮的 emulator-5558。

## 安卓开发包

两包均为 `com.longyuye.mdreader.mobile.dev`，版本名 1.2.11、序号 1002027、minSdk 29、targetSdk 36，使用开发调试签名。构建记录真实记录 `65dafe3d51333b2d5a151f87437841c16a82423c + dirty`，未将之后的提交反写为构建来源。

| 架构 | 文件 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| x86_64 | `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | 127,155,574 B | `e8d524eacebb605881da26b686f83973ae46b1dc8683bfdfc05a6950ddcb4662` |
| ARM64 | `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | 126,498,617 B | `4781e0db7185469827d36383ff8e425f8d18182de20282019f0b37342c0b514b` |

两架构均核对 APK 的 ABI、ELF、原生库摘要、版本和签名，见 [x86 记录](evidence/mobile-0.1.0/yaml-source-native-2026-10-24/build-x86_64.json)与 [ARM64 记录](evidence/mobile-0.1.0/yaml-source-native-2026-10-24/build-aarch64.json)。模拟器实际安装包摘要与 x86 文件一致。Windows 符号链接限制仍使用既有构建脚本的核验后复制打包流程。

本轮未完成真机、真实云提供器、完整 TalkBack 触摸、iOS 或正式发布验收。浏览器预览保留在本机 9012 端口。

登记依赖时 npm 替换了工作区的依赖目录联接，已停止该次安装并恢复联接，随后仅更新 package-lock；两架构构建及全部测试使用恢复后的目录。自动审批拒绝清理 `node_modules-aborted-yaml-install`（仅返回 blocked by policy），该中断安装目录仍保留并仅在本地 Git exclude 中忽略，未提交或再次尝试删除。
