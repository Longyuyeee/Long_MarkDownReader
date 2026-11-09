# 第二十七批：TOML 源码工作流

日期：2026-10-24。分支 `codex/mobile-0.1.0-foundation`，基础版本 1.2.11，Android 开发包序号 `1002031`。本批将 TOML 纳入手机源码闭环，随后继续结构定位与受限值编辑。

## 审计与竞品调研

桌面 `src/views/TomlEditorView.vue` 与 `src-tauri/src/formats/toml.rs` 已有源码、分析结构、问题定位和受限值修改；当前依赖为 `toml_edit = 0.25.13`。手机先接通文件、草稿与保存，再增加结构表单。桌面和手机使用不同解析器，不承诺诊断完全一致。

本轮查阅 [QuickEdit 官方格式介绍](https://rhmsoft.com/qedit/intro.html)，其高亮列表包含 TOML / INI；[格式识别说明](https://rhmsoft.com/qedit/syntax.html)介绍按扩展名识别和手动切换；[工具栏](https://rhmsoft.com/qedit/toolbar.html)提供查找、行定位、撤销重做、保存及另存为。它们支持“先看懂原文、定位并改值”的手机任务，但高亮本身不能当作语法检查。

复查 [Acode QuickTools](https://docs.acode.app/user-guide/quicktools)：为手机输入括号、引号和导航提供辅助键。本项目本批保留直接源码编辑及清晰的问题定位，下一批再用字段表单降低常见值修改的符号输入负担。以上是公开文档调查，未安装、测量竞品或检查其隐私行为。

核对 [TOML 1.0 规范](https://toml.io/en/v1.0.0)及已发布的 [1.1 规范](https://toml.io/en/v1.1.0)。候选解析器的[官方文档](https://github.com/ota-meshi/toml-eslint-parser)仍将 1.1 标为实验支持，因此显式选择其稳定的 1.0 模式，不使用默认版本。界面明确说明检查版本；新版语法不通过 1.0 检查时，仍保留全文、编辑和保存入口。

## 用户路径与实现

用户可“收到配置文件 → 先核对原文 → 存入独立手机副本 → 阅读或查找 → 修改 → 主动检查与定位 → 保存或导出”。检查不修改内容，也不决定是否允许保存。

- `.toml` 新建、系统选择、Android 打开 / 分享、手机资料库、最近记录和全库内容查找。空文件是合法 TOML，新建从空白开始，沿用创建时的草稿保护。
- 阅读按文字显示，保留注释、表数组、引号键、日期时间、数字进制 / 下划线、BOM 和 CRLF / LF 原文。配置中的 HTML、URL 和类似脚本的文字不会执行或作为资源加载。
- 编辑有 TOML 高亮、行号、查找与撤销重做；格式工具不提供 Markdown 操作或自动格式化。超过高亮预算时继续使用完整源码编辑。
- 主动检查 TOML 1.0；首个问题可以跳到原始位置附近。无效、未完成、超预算及超出本轮数值范围的源码仍可保存。
- 沿用草稿持久保护、重启恢复、来源冲突保留、独立副本和固定快照导出。导出保留 `.toml`，Android 使用 `application/toml`。
- 接收允许 `application/toml`、`application/x-toml`、`text/toml`、`text/x-toml`；文件类型仍结合扩展名校验，不将其他任意扩展名改成 TOML。纯文字若以普通 text/plain 分享，继续按普通文字处理。

存储沿用严格 UTF-8、无零字节、单文件 4 MiB 限制；不接入其他编码转换或附件包格式扩大。

## 检查边界

精确依赖 `toml-eslint-parser@1.0.3`，只在独立 Worker 中解析 AST。显式 `tomlVersion: '1.0.0'`，不调用对象转换函数或序列化器，不使用解析后的 Number / Date 值重建原文。整数检查读取 AST 的 BigInt；日期时间、负零及数字词法均由原文保存。

检查未完成的容器、重复键 / 表定义、内联表扩展、引号 / 点号键冲突、数值和日期、非法转义 / Unicode 字符。定位保留原始 UTF-16 源偏移，显示列按 Unicode 字符计数，映射初始 BOM 和混合 CRLF / LF；解析器可能在问题后方或末尾报告位置，界面标注“附近”。移除一个初始 BOM 仅用于解析，不修改保存内容。

数值检查选择有符号 64 位整数范围；更大整数和溢出为非有限值的普通浮点写法报告“超出本轮检查范围”，不发布通过结果；合法的 `inf` / `nan` 仍可通过。该范围是本轮实现边界，不表示所有更大整数都违反 TOML 规范。

检查最多 262,144 个 UTF-16 单元、40,000 个 AST 节点和 40,000 个词法项 / 注释、64 层分析深度和 1,800 ms；点号键 / 已解析表路径也受深度限制。解析先于 AST 预算遍历，Worker 超时终止负责整体退出；这些预算不是解析器硬内存限额。内容 / 文档身份变化、取消、离开、启动失败和超时均丢弃旧结果。

这是受限语法检查，不是 Schema、配置应用语义或完整标准一致性认证。1.1 最终语法和检查器兼容升级单独推进；本批不标记 TOML 桌面能力全部迁移完成。

依赖通过 package-lock-only 登记，新增包单独安装至 E 盘任务缓存并联接现有依赖目录，没有替换工作区 node_modules 联接。正常检出仍使用锁文件安装，不依赖本机缓存绝对路径。

## 本地验证入口

```powershell
npm run test:mobile
npm run build:mobile
node scripts/test-mobile-browser-regression.mjs
node --experimental-strip-types scripts/test-mobile-toml-oracle.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory <新的证据目录>
. ./scripts/mobile-toml-source-ui.ps1 -Serial emulator-5558
```

独立核对脚本使用 Python 3.11+ 的 `tomllib` 检查同一组常见 1.0 样本；双方仅为解析移除初始 BOM。其 16 个样本不构成完整规范一致性测试。首次 Python stdin 使用 Windows 默认编码导致 JSON 输入读取失败，已改为 UTF-8 字节输入后重验，不把该失败算作产品检查器结果。

| 检查 | 结果与证据 |
| --- | --- |
| 逻辑 | 154 项通过，含新增 8 项 TOML 任务，见[完整输出](evidence/mobile-0.1.0/toml-source-native-2026-10-24/logic-tests.txt) |
| 完整浏览器 | 26 脚本 / 189 组通过，见[回归汇总](evidence/mobile-0.1.0/browser-regression-1792842733062/summary.json) |
| TOML 专项浏览器 | 8 组通过，见[首次专项](evidence/mobile-0.1.0/toml-source-browser-1792842526275/report.json)；最终整轮复验见回归汇总 |
| 打包 | 17 项通过，见[结果](evidence/mobile-0.1.0/toml-source-native-2026-10-24/packaging-verification.json) |
| Android 原生 | 11 阶段通过，见[汇总](evidence/mobile-0.1.0/toml-source-native-2026-10-24/summary.json) |
| 独立解析核对 | Python 3.12.10，16 个常见样本通过，见[交叉核对](evidence/mobile-0.1.0/toml-source-native-2026-10-24/oracle.json) |

浏览器使用实际文件输入和真实 Worker，核对完整原文、错误末尾定位、未完成内容仍可保存、撤销重做、未保存快照下载、重新载入恢复草稿、来源冲突独立副本、新建及全库查找。取消、正文变化、启动失败与超时丢弃旧检查。360px 暗色 / 200% 字号下无所检查的 WCAG 违规或页面横向溢出，见[截图](evidence/mobile-0.1.0/toml-source-browser-1792842526275/360-toml-check-200.png)；无外部请求，原有笔记和草稿保持一致。

本机开发使用 Node 24.14.0；新解析器声明的开发运行时范围为 `^20.19.0 || ^22.13.0 || >=24`。它在浏览器 / Android 中作为打包后的 JavaScript Worker 运行。

## Android 验收与后续

专用 API29 AVD 通过 ACTION_SEND 和只读 content URI 收到未完成 `.toml`，核对后存入独立副本。检查定位至第 18 行、第 16 列附近，通过实际输入增加末尾 `]`；一次撤销回到原字节，重做重新保护草稿，显式保存后使用 DocumentsUI 导出回读，终止应用后重新打开并再次检查。

- 原始只读源 SHA-256：`ecac036f36d9405b2baa6a398c643bdc3cb3f3c12c7a31abd5866cdbbd6a8538`。
- 修复后 SHA-256：`6cf91fc808c846397c41ba3143f371d239c4994532ff3941287678dcf88844b2`；只增加 `]`，不补末尾换行或重排原文。
- 原有基线 63 份文件、8 份草稿、18 条文字导入记录及 6 个附件包文件逐阶段核对。测试禁止清空应用，新增笔记保持独立。
- PackageManager 另核对四种 MIME 的 VIEW / SEND 共 8 条注册路由，见[路由查询](evidence/mobile-0.1.0/toml-source-native-2026-10-24/routes.json)。这是注册查询，不表述为所有入口的完整交互实测。

最终 64 份文件，保留本轮新笔记，只通过产品界面确认移除本轮回执；原有 8 份草稿、18 条文字回执及 6 个附件包文件均保持一致。实际安装包和本轮 x86 构建记录摘要一致。设备为 `LongEdit_Compat_API29`、API29 x86_64、MemTotal 2,040,592 KiB、WebView 124.0.6367.219，见[环境记录](evidence/mobile-0.1.0/toml-source-native-2026-10-24/webview.txt)。原无障碍设置恢复为 `null / 0`，同步后仅关闭 emulator-5558，9012 预览保留 HTTP200，见[收尾记录](evidence/mobile-0.1.0/toml-source-native-2026-10-24/lifecycle.json)。

下一步继续 TOML 结构定位与受限标量编辑，再推进轻量代码。TOML 1.1 检查兼容、真机、真实云提供器、完整 TalkBack、iOS 和正式发布继续按原有退出条件验收。

## 开发调试包

两包为 `com.longyuye.mdreader.mobile.dev`，版本名 1.2.11、序号 1002031、minSdk29 / targetSdk36、开发调试签名。来源如实记录 `3028fa24c489de37db1d54cb5a2f6d310bb8da9f + dirty`，不反写之后的提交号。

| 架构 | 大小 | SHA-256 |
| --- | --- | --- |
| x86_64 | 127,334,710 B | `d8e7dd4b89fd30769a0f2b79b8fffab77ad1991ba9db29e47ad733ef8bde4b53` |
| ARM64 | 126,678,073 B | `1045490a1bbb23bc52a9943cf2655e485899102dfb6d7649ae1c53e958237ac9` |

见[x86 构建记录](evidence/mobile-0.1.0/toml-source-native-2026-10-24/build-x86_64.json)与[ARM64 构建记录](evidence/mobile-0.1.0/toml-source-native-2026-10-24/build-aarch64.json)。ABI、ELF、原生库摘要、版本和签名均已核对。Windows 符号链接限制继续使用核验后的复制打包；ARM64 的 Kotlin daemon 连接异常自动回退独立编译后构建成功，见[编译摘要](evidence/mobile-0.1.0/toml-source-native-2026-10-24/arm64-compiler-fallback.txt)。
