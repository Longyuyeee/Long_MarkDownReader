# 第二十四批：YAML 结构定位与受限标量编辑

日期：2026-10-24。分支 `codex/mobile-0.1.0-foundation`，基础版本 1.2.11，Android 调试包序号 `1002028`。接续上批源码工作流，完成按层浏览、源码定位及常见单行值的核对后修改。

## 审计和设计依据

桌面 `replace_yaml_value_source` 会重新分析选中范围、限定简单单值，并重新解析候选，避免改变其他字段和集合结构。移动端此前只有 YAML 检查及源码编辑，本批复用现有文件、草稿和恢复流程，增加结构入口。

补查 [QuickEdit 官方工具栏](https://rhmsoft.com/qedit/toolbar.html)的保存 / 另存为、撤销重做、查找、行定位和只读入口，以及 [Acode QuickTools](https://docs.acode.app/user-guide/quicktools)针对手机键盘符号输入提供的工具。调研仅使用官方公开文档，未安装竞品；这些文档不能证明竞品具备 YAML 结构表单或无损修改。

本项目的设计选择是让用户先确认位置和原值，再修改：按层进入映射或列表，展示文档 / 父项 / 字段路径及行列；普通值用类型表单减少引号和符号输入。所有修改先核对、再应用，文件仍由用户明确保存。复杂内容给出原因和源码入口，避免表单隐藏配置含义。

## 已实现的用户路径

1. 阅读或编辑 YAML 时点「浏览结构」，独立区域按层呈现映射和列表。多文档先选择文档，别名保持为引用叶节点，不展开成重复树。
2. 本层可筛选字段或值，30 项分页；返回上一层恢复筛选、页码及原条目焦点。字段身份基于源节点编号和范围，嵌套同名字段不共用位置。
3. 查看字段时显示原值、所在路径及源码行列。可直接「前往这段源码」；文档查找和阅读操作也会退出结构区域。
4. 普通单行值提供文字、数值、布尔值、空值表单。数值修改支持十进制和指数，保留输入写法；不变的数值、布尔、空值和字符串保留原字面量，包括原引号及转义。
5. 「核对这次修改」在 Worker 中重新检查完整候选，未应用前不产生草稿或写文件。核对后明确应用，回到源码并保护草稿；一次撤销 / 重做对应一次值替换，保存另行进行。

新文字会生成带引号的单个 YAML 字符串，输入 `false`、`null`、冒号、括号、换行或标签样式文字不会意外变成其他类型或新字段。大整数、负零、指数尾零等数值写法不通过 JS 数值重新序列化。

## 编辑边界和实现

`yamlStructure.ts` 使用现有 `yaml@2.9.0` AST 的 UTF-16 范围构建扁平节点表，保留原始值结束位置，不包含行尾注释。没有把映射转为 JS 对象，也不调用 AST 的 `toJS` / `toJSON` / `stringify`。数字、布尔和空值键会标明键类型；复杂键按序号呈现。

以下内容可浏览和定位源码，结构表单保持只读：多文档、YAML 1.1 等其他版本、锚点或标签及其内部值、别名、复杂键或隐式键对应内容、块标量、跨行原值、隐式空值和超长值。单个 YAML 1.2 文档中无这些限制的其他字段仍可修改。十六进制等数值原样保留；新输入这些写法可通过源码编辑完成。

准备修改时重新按全文和节点编号确认目标，检查可编辑性与输入预算。只拼接当前值的精确源范围，再重新分析候选；比对节点总数、父子关系、字段名称、字段类型和其他叶节点的原文，确认结构及其他值不变。主界面应用前再次核对完整源文、文档类型和保存状态。编辑器的守卫范围事务改为通用 `replaceSourceRange`，JSON 继续复用；完整候选的换行元数据随历史事务一同撤销和重做。

结构分析和候选核对均运行在专用 Worker。取消、离开、文档身份 / 内容变化、模式变化及超时终止任务，旧结果不会发布。继续沿用 262,144 个 UTF-16 单元、40,000 个分析节点、64 层、128 份文档及 1,800 ms；结构表额外限制 5,000 项，原值 / 输入 / 生成值各最多 16,384 个 UTF-16 单元。节点预算在解析后检查，耗时解析由 Worker 终止保护，不代表硬内存限额。超预算或语法错误不显示部分树，完整源码流程继续可用。

未实现 YAML 字段新增、删除、排序、重命名、别名展开编辑、任意块文本表单、全树结构查找或应用 Schema。现有源码查找可处理更广的定位任务，不把本批表述为所有 YAML 或所有桌面功能迁移完成。

## 检查与证据

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
| 逻辑 | 129 项通过，含新增 11 项结构逻辑，见 [输出](evidence/mobile-0.1.0/yaml-structure-native-2026-10-24/logic-tests.txt) |
| 全量浏览器 | 23 个脚本、166 组通过，见 [完整回归索引](evidence/mobile-0.1.0/browser-regression-1792837735021/summary.json) |
| YAML 结构专项 | 7 组通过，见 [首次独立验收](evidence/mobile-0.1.0/yaml-structure-browser-1792837472849/report.json)及 [完整回归中的复验](evidence/mobile-0.1.0/yaml-structure-browser-1792837925003/report.json) |
| 打包保护 | 17 项通过，见 [核对结果](evidence/mobile-0.1.0/yaml-structure-native-2026-10-24/packaging-verification.json) |
| Android 原生 | 13 阶段通过，见 [原生汇总](evidence/mobile-0.1.0/yaml-structure-native-2026-10-24/summary.json) |

逻辑覆盖精确范围、重复显示名、字符串类型保持、数值注入拒绝、流集合上下文、锚点 / 标签继承限制、复杂键、空值、多文档、其他 YAML 版本及预算。浏览器实际运行 Worker，覆盖预览取消、应用与历史、分页焦点、源码切换、启动失败、停止 / 超时 / 卸载及取消预览后的旧结果丢弃。360px 暗色界面、200% 字号下无所检查的 WCAG 违规或页面横向溢出，未请求源文中的外部地址，原有笔记和草稿保持一致。

原生运行在专用 API29 x86_64 AVD，实际 MemTotal 2,040,592 KiB，WebView 124.0.6367.219，见 [WebView 原始记录](evidence/mobile-0.1.0/yaml-structure-native-2026-10-24/webview.txt)。从只读提供器真实分享合成 `.yml`，核对并存入后进入 `server / enabled`；使用系统布尔选择器，核对后把 `true` 改为 `false`，撤销、重做、保存、系统 DocumentsUI 导出并回读、终止应用后重新打开结构。另验证锚点内部字段只读，以及 Android 返回键按“叶节点 → 父映射 → 文档根 → 源码”退出。

- 原始文件 SHA-256：`d47676915c4a3c034f6885b3396ad3af6c006c4e890ea9bde56decb79a2cbe16`。
- 保存与导出 SHA-256：`9861b4cdc95188e697d10dacaccfdc5283624a0380c5c75b82f3e73924941e4d`。仅选中布尔值由 `true` 改为 `false`，其余范围原样。
- 原有 60 份资料、8 份草稿、18 条文字导入记录和 6 个附件包文件保持一致。最终保留新增的独立 YAML 笔记，共 61 份资料；只经产品界面确认移除本轮导入回执。
- 无障碍测试服务设置已恢复为启用前 `null / 0`，仅关闭 emulator-5558。浏览器预览仍可在本机 9012 端口使用。

上述文件期望由独立固定夹具及手工范围替换定义，不用产品解析器生成期望结果。原生具名按钮动作回执之后继续等待业务结果并核对实际文件，未把点击接受回执当作保存成功。

## 开发包与后续

两包应用 ID `com.longyuye.mdreader.mobile.dev`，版本名 1.2.11、序号 1002028、minSdk 29、targetSdk 36，开发调试签名；构建来源如实记录为 `2c40f7f4672cde9eef2039370cb5d642063ef560 + dirty`。

| 架构 | 文件 | 大小 | SHA-256 |
| --- | --- | --- | --- |
| x86_64 | `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | 127,194,542 B | `00e1983a189bcf2832481a698ca6cf3c64c709d98915df635a1eb066f30a3b5a` |
| ARM64 | `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | 126,537,729 B | `0e7795183662ca70bf0915322ad4733f9bba1080ce98a379ea61be9f2f4f92e6` |

[x86 构建记录](evidence/mobile-0.1.0/yaml-structure-native-2026-10-24/build-x86_64.json)与 [ARM64 构建记录](evidence/mobile-0.1.0/yaml-structure-native-2026-10-24/build-aarch64.json)包含 ABI、ELF、原生库摘要、版本与签名检查；模拟器实际安装包摘要与 x86 文件一致。继续使用既有 Windows 符号链接限制下的核验后复制打包流程。

下一轮按 M4 顺序审计并迁移 XML 源文、结构定位及受限编辑，再推进 TOML。真机、真实云提供器、完整 TalkBack 触摸、正式发布和 iOS 仍按原有退出条件独立验收。
