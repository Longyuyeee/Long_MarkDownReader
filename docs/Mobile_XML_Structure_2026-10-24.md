# 第二十六批：XML 结构定位与属性文字编辑

日期：2026-10-24。分支 `codex/mobile-0.1.0-foundation`，基础版本 1.2.11，Android 开发包序号 `1002030`。延续第二十五批源码闭环，本批完成按层定位及受限属性编辑，随后按 M4 顺序推进 TOML。

## 审计、竞品与用户路径

桌面 `src-tauri/src/formats/xml.rs` 使用精确源范围替换属性：命名空间声明只读，保留引号，未修改的解码文字保持原实体写法，替换后重新分析。手机沿用这个边界，但需要独立适配 Worker、手机返回、草稿和源码编辑历史。

本轮复查 [FuryXML 开发者商店介绍](https://play.google.com/store/apps/details?id=com.furyform.furyxml)，公开说明有树 / 源码双向切换、属性编辑和筛选；页面更新说明还提到大文件筛选 ANR 和树节点显示修复。这是开发者声明，本轮未安装或测量竞品。由此选择显式预算、可停止的后台任务与按层分页，不能据此推断竞品当前性能。

复查 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html)的源码查找、行定位、保存和撤销重做；[Acode QuickTools](https://docs.acode.app/user-guide/quicktools)展示手机输入括号、引号和导航符号的辅助方式。本项目提供无需手动转义的属性文字表单，以降低手机修改配置值的输入负担，同时保留源码入口。以上均为公开文档调研，未测试竞品数据处理或隐私行为。

用户路径为“找到元素 → 核对属性文字与原始写法 → 修改文字 → 核对替换内容 → 应用到草稿 → 保存或导出”。

- 根元素和同名兄弟显示序号，位置如 `/root[1]/p:item[2]/@id`；保留限定名称，不将 XML 转成键值对象。序号按同一父级、相同限定名称计算，只用于本次结构位置，不是 XPath 求值或持久 ID。
- 本层同时列出属性与直接子元素，支持筛选和 30 项分页；返回保留该层筛选、页码和原行焦点。文字、注释、CDATA 等仍通过源码查看和修改。
- 属性同时展示解码文字和引号内源码。数字、布尔样式值始终按文字编辑，长数字不会经过 JavaScript Number 转换。
- 阅读时可浏览；切换编辑后才提供修改。预览、取消和只读定位不写文件或草稿。应用后回到源码，形成一次撤销事务，草稿先持久保护，文件仍须显式保存。
- 命名空间声明及过长属性说明只读原因，直接定位源码。无效或暂不支持检查的文件不发布部分可编辑结构。

## 实现边界

复用 XML 1.0 / UTF-8 检查器，保留其 DTD、自定义实体、编码 / 版本和非法字符边界。检查成功后，将 Lezer 的元素 / 属性词法范围与 xmldom 的名称、属性次序及解码值逐项对应。两者不一致即退出，不通过按名称搜字符串猜测属性位置，也不使用序列化器重建全文。

修改重新分析当前完整源码，确认属性仍可编辑，保留原引号；转义 `&`、`<`、`>`、当前引号和需保留的制表 / 换行字符。未改的解码文字直接保留原始实体和空白写法。候选完整重检后，还核对属性解码结果、元素拓扑和其他属性值，最后只返回引号内的精确范围补丁。BOM、混合换行、注释、CDATA 和其余源码保持原样。

结构预算为 262,144 个 UTF-16 单元、5,000 个元素、5,000 个属性、每元素 256 个属性，继承 40,000 分析节点、64 层和 1,800 ms Worker 时间。单个表单值最多 16,384 个 UTF-16 单元；较长值仍可定位源码。结构超限不返回部分树；这些是工作量限制，不是解析器硬内存额度。

检查、结构分析和预览均在可终止的真实 Worker 中执行；主应用只导入类型和轻量预算模块。取消、离开、内容 / 身份变化、超时和启动失败会终止旧任务，丢弃旧结果。头部返回、Android 返回、源码查找和阅读切换均接入 XML 结构状态。

本批不增加元素 / 属性新增删除、重命名、文本节点表单、XPath、Schema、格式化或其他编码转换，也不将 XML 的桌面功能标记为全部迁移完成。

## 验证入口

```powershell
npm run test:mobile
npm run build:mobile
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory <新的证据目录>
. ./scripts/mobile-xml-structure-ui.ps1 -Serial emulator-5558
```

| 检查 | 结果与证据 |
| --- | --- |
| 逻辑 | 146 项通过，含新增 9 项 XML 结构检查，见[完整输出](evidence/mobile-0.1.0/xml-structure-native-2026-10-24/logic-tests.txt) |
| 完整浏览器 | 25 脚本 / 181 组通过，见[回归汇总](evidence/mobile-0.1.0/browser-regression-1792841063162/summary.json) |
| XML 专项 | 真实 Worker 的 7 组浏览器任务通过，见[首次专项](evidence/mobile-0.1.0/xml-structure-browser-1792840954239/report.json)；最终整轮复验见回归汇总 |
| 打包 | 17 项通过，见[结果](evidence/mobile-0.1.0/xml-structure-native-2026-10-24/packaging-verification.json) |
| Android 原生 | 13 阶段通过，见[汇总](evidence/mobile-0.1.0/xml-structure-native-2026-10-24/summary.json) |

逻辑检查覆盖精确属性范围、单 / 双引号、实体注入、空属性、长数字、Unicode / 混合换行位置、命名空间只读与同前缀重新绑定、非法字符 / 输入 / 位置和预算退出。浏览器实际导入文件、分析与预览，检查单次撤销重做和显式保存，并用独立的浏览器 DOMParser 核对结果，确认第一个同名元素及其他字节未变。真实 Worker 的取消、超时、启动失败、重试、离开属性和源码切换均有检查。

360px 暗色 / 200% 字号下无所检查的 WCAG 违规或页面横向溢出，见[截图](evidence/mobile-0.1.0/xml-structure-browser-1792840954239/360-xml-structure-200.png)。没有外部请求，原有测试笔记和草稿保持一致。这些结果不等同于完整 TalkBack 触摸验证。

## Android 文件核对与产物

使用专用 API29 AVD 和独立的只读 `xml-structure` 根，通过实际 ACTION_SEND content URI 接收，再存入私有副本。预期从固定源码中将第二个元素的 `id='second'` 唯一替换为 `id='updated &amp; checked'`，不调用产品解析器生成期望。实际输入文字为 `updated & checked`，属性表单完成转义；另验证原生返回取消表单、逐层返回和命名空间声明只读。

早期 `received-ui.png` 在启动空白期截图，不作为就绪证据；之后等待实际应用控件再操作。预览自动化初次按转义文字查找未命中：该 `<pre>` 在 API29 UIA 中暴露为有名称的文本区域；随后按实际就绪状态、截图和应用后的文件字节共同核对，不将按钮动作回执视为业务完成。完整 TalkBack 触摸与预览内容读出仍待专门验收。

- 原始源文件 SHA-256：`2d61033c75ba2ad76c2064fe4f02445086d31da042df8d76845f668c48176e52`。
- 修改后 SHA-256：`08d4115cd7c72eaf8bf3dd2dca3aa189d115e1a302730f2c0fc0a64227edbacc`。
- 原有基线为 62 份文件、8 份草稿、18 条文字导入记录及 6 个附件包文件；每阶段逐项核对，禁止清空应用。新笔记保持独立。

最终 63 份文件，保留本轮新存入的独立 XML 笔记，原有 8 份草稿 / 18 条文字回执 / 6 个附件包文件保持一致；只通过产品界面确认移除本轮回执。实际验证预览不写、应用保护草稿、一次撤销重做、保存、DocumentsUI 系统导出回读和终止应用后重新打开。导出文件和本机文件摘要均与唯一属性替换的期望一致，模拟器实际安装包摘要与本轮 x86 构建记录一致。

设备为 `LongEdit_Compat_API29`、API29 x86_64、MemTotal 2,040,592 KiB、WebView 124.0.6367.219，见[环境记录](evidence/mobile-0.1.0/xml-structure-native-2026-10-24/webview.txt)。恢复启用前的无障碍设置 `null / 0`，同步后仅关闭 emulator-5558，9012 预览保持 HTTP200，见[收尾记录](evidence/mobile-0.1.0/xml-structure-native-2026-10-24/lifecycle.json)。

两种架构均为 `com.longyuye.mdreader.mobile.dev`，版本名 1.2.11、序号 1002030、minSdk29 / targetSdk36，Android 开发调试签名。来源如实记录 `8cdaf99de98106ab7572a4ba8d75dee974d4fbad + dirty`，不反写之后的提交号；Windows 符号链接限制继续使用经原生库摘要核对的复制打包流程。

| 架构 | 文件 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| x86_64 | `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | 127,319,190 B | `c8c8ceb10b738b44e3cfdc8b09aef6a77dc7d982001205e868e7fa86bc5ee24b` |
| ARM64 | `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | 126,662,473 B | `64bd0f11a7bb1981e278de4369dd3f0242ceb75e5e5e0640d9f6170edb4025fe` |

构建校验包含 ABI、ELF、原生库摘要、版本和签名，见[x86 记录](evidence/mobile-0.1.0/xml-structure-native-2026-10-24/build-x86_64.json)与[ARM64 记录](evidence/mobile-0.1.0/xml-structure-native-2026-10-24/build-aarch64.json)。

下一步按 M4 顺序推进 TOML。真机、真实云提供器、完整 TalkBack 触摸与内容读出、iOS 和正式发布继续独立验收。
