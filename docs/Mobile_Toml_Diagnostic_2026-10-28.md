# 移动端：检查 TOML 并回到源码修正

2026-10-28，阶段 3F2，起点 d45b3f9a9。在独立移动分支 codex/mobile-0.1.0-foundation 完成“检查 → 看首个问题 → 回源码修正 → 重新检查”，遵循[每次一个用户任务](Development_User_Task_Plan_2026-09-22.md)和[移动交互重设计](design/mobile-interaction-v2/interaction-spec.md)。桌面工作目录未修改，本轮只做本地提交。

[旧问题实页](evidence/mobile-toml-diagnostic-2026-10-28/before-invalid.png)把简短结论、展开详情和源码并列，错误详情又重复版本与保存说明；[旧范围实页](evidence/mobile-toml-diagnostic-2026-10-28/before-range.png)将超出检查范围的数值放在问题配色中，并标出源码下划线。现在使用独立检查任务页，区分 TOML 1.0 问题、完整通过和中性“暂不检查”；具体原因与源码保留，一般说明放进问号。

## 竞品与规范依据

2026-10-28 查阅以下官方资料。本轮未安装竞品，不把公开介绍当成系统返回、输入法、诊断细节或保存可靠性的实测。

| 对象 | 资料支持的行为 | 本项目决定 |
| --- | --- | --- |
| [Acode QuickTools](https://docs.acode.app/user-guide/quicktools) | 触摸工具栏可以一行／两行显示、隐藏及滑动展开额外按键 | 检查页只呈现当前任务的返回、帮助、停止／重试及源码动作，不与编辑工具摊开。具体任务栈由用户要求和现有项目契约决定，不声称该竞品使用同样的 TOML 诊断页。 |
| [QuickEdit 开发者介绍](https://play.google.com/store/apps/details?id=com.rhmsoft.edit) | 指定行定位、源码编辑、撤销／重做、纵横滚动及主题 | 问题应接回准确源码现场，允许真实修改、撤销与保存；检查大字、短屏与深色。只引用列出的能力，不比较未经实测的性能。 |
| [TOML 1.0 官方规范](https://toml.io/en/v1.0.0) | 提供 1.0 的值、键、表及数值规则，网站另列 1.1 规范入口 | 保持项目既有 1.0 检查范围，在通过与问题标题中明确版本。1.1 新语法仍能保留、编辑和保存，本轮不升级解析器或依赖。检查范围和应用配置含义分开。 |

公开资料不能证明上述移动编辑器提供与我们相同的 TOML 结果层级。首问题、中性数值边界、预算退出和原文保护来自本项目真实引擎能力与用户要求，不复制不适用的桌面面板。

## 冻结设计与交互契约

[六屏设计](design/mobile-toml-diagnostic-v1/index.html)包括问题、通过、检查中、超范围、失败和数值范围。[冻结回执](evidence/mobile-toml-diagnostic-2026-10-28/design-freeze.json)为 2026-10-28T01:19:01.605Z，源 SHA-256 为 422a7cd3a13da8ab16bbe97a11a15b1a114e524820a0d32eef9d4c78b4980c3d。基线和冻结均在运行时代码修改前完成；六屏逐张查看后实施，后续修复未改冻结源、图片或时间。

- “检查 TOML”进入完整任务页。原文稿顶栏、底部编辑工具、文档查找和收件入口按已有任务框架隐藏；与当前操作有关的系统提示继续保留。现有引擎返回首个问题，修正后重查，不制造空的多问题列表。
- 问题直接显示文件名、明确的 TOML 1.0 检查范围、具体原因、附近行列和最多三行源码。边界补齐真实邻居，短文件不制造源行；长行围绕实际位置截取最多 160 个 Unicode 码点并保护代理对。前往源码始终使用完整原文偏移。
- 仅完整且有效的结果显示通过。整数或浮点数超出本轮范围时显示中性结论、真实数值片段和“前往这段源码”，不显示语法问题下划线；预算退出不发布部分定位。TOML 1.1 与其他未通过样本只说明未通过当前 1.0 检查，不阻止保存。
- 常见错误使用明确中文，未知错误保留解析器的实际原因。移除每个结果后重复的通用版本／草稿解释和通过统计，将检查含义、附近位置、检查边界与保存关系放进问号。
- 普通返回只关闭检查页，恢复原检查入口、阅读／编辑状态、同一编辑器、选区、滚动和查找词。帮助先消费一层返回；检查返回先于底层文档查找。明确“前往问题源码／这段源码”才进入编辑并定位。
- 结构组件继续挂载；检查前的逐字段／类型输入不因切换工具被丢弃。检查、停止、帮助、返回和重试不写正文或草稿，已有草稿记录逐项保持，其他文稿数据不变。
- 停止和返回终止线程，启动失败／超时可明确重试，不展示迟到定位。结果绑定检查时的文稿身份与准确源码；修订清除旧问题，换文稿拒绝旧工作。非法但未完成的源码仍可编辑并显式保存。
- 源码片段按普通文字展示，不执行 HTML、不请求外部资源。大字、短屏和长行提供真实滚动；代码片段可聚焦并使用键盘滚动，动作保持可达。

新增 TomlDiagnostic.vue，TomlTools.vue 协调结构和检查的打开、关闭及源码标记。沿用上一轮 MobileApp 的宿主隐藏与返回优先级，没有再次修改 App。TOML 解析、词法位置、数值边界、预算与工作线程、结构修改、源码格式、编辑器及文稿存储会话均未改动。sourceDiagnostic.ts 使用既有补齐窗口选项，未改共享实现；package.json 只新增专项命令，版本与依赖不变。

## 实页核对与实际修复

[六屏并排对照及适配实页](evidence/mobile-toml-diagnostic-2026-10-28/comparison.html)包含最终 14 张诊断原图，均已查看或确认与已查看图逐字节相同；另查看旧源码回归的 360px／200% 全视口图。标准截图从 390×872 裁去真实 28px 桥接提示条得到 390×844；大字时提示条自然换行。旧导入回归保留真实导入通知，未关闭提示、移位或重画内容来贴图。

[量测记录](evidence/mobile-toml-diagnostic-2026-10-28/comparison.json)：200 项坐标属性最大偏差 0px，192 项字体、字重、行高、字距与颜色属性一致。帮助和状态图标为 22×22，实页保存路径与尺寸记录。真实焦点、按下和字体栅格反馈保留，不声明整屏逐像素相同。

[首个八组通过报告](evidence/mobile-toml-diagnostic-2026-10-28/before-control-message-report.json)之后，实际查看发现[控制字符长行页](evidence/mobile-toml-diagnostic-2026-10-28/before-control-message-long-line-320-200.png)仍显示较长英文原因，大字时占据多行。将这项已确认错误译为简短中文，其他未知原因继续保留；[最终长行页](evidence/mobile-toml-diagnostic-2026-10-28/actual-long-line-320-200.png)与[滚动末端](evidence/mobile-toml-diagnostic-2026-10-28/actual-long-line-320-200-current.png)再次审阅。六屏冻结稿和其他十二张诊断图均保持原字节，没有回改设计掩盖差异。

测试脚本修正也保留来源，不冒充产品修复：旧源码回归先通过六组，但大字检查步骤已关闭任务页后仍寻找其源码，修正停留步骤后恢复八组。补强诊断验证时，即时装饰计数早于编辑器绘制；长行最初单独量测不可见字符，并在 PageDown 动画中立即发出滚轮。[专门观察](evidence/mobile-toml-diagnostic-2026-10-28/scroll-timing-observation.json)显示该滚轮被浏览器忽略，最终停在 147px；[等待键盘滚动稳定后](evidence/mobile-toml-diagnostic-2026-10-28/scroll-settled-observation.json)，真实滚轮到达 714px 末端。最终等待实际装饰绘制、十帧稳定滚动与真实末端，再量测包含相邻可见引号的定位范围，确认位于可视代码区。未强设滚动位置或修改布局让断言通过。

原失败报告与截图在[构建与证据来源](evidence/mobile-toml-diagnostic-2026-10-28/build-provenance.json)逐项记录。最终运行时代码在文案修复后构建，此后仅修正测试同步假设、整理文档，没有再改运行时代码。

## 验证与后续

- npm run build:mobile：最终类型检查与构建通过，保留既有包体积提示。资源为 mobile-BcmeKdkG.js、mobile-oilywahM.css；TOML 工作线程仍为 toml.worker-C8Cx_jVI.js 与 tomlStructure.worker-CiZBYjaA.js。Vite 提供的 HTML 与 dist/mobile.html 逐字节一致。
- node --test scripts/test-mobile-source-diagnostic.mjs scripts/test-mobile-json-diagnostic.mjs scripts/test-mobile-toml-source.mjs scripts/test-mobile-toml-structure.mjs：既有 28 项通过，覆盖摘录窗口及 TOML 解析、位置、边界与精确范围修改。没有为文案增加镜像实现测试。
- [TOML 诊断实页](evidence/mobile-toml-diagnostic-2026-10-28/browser-report.json)：八组通过，覆盖整页／帮助返回、准确修正／重查／撤销／保存、停止／失败／超时／重试、中性数值与字符／深度／节点预算、BOM／混合换行／Unicode／长行／HTML 字面内容、源码下划线修订失效、同一编辑器与隐藏查找、未确认字段输入、现有草稿、未完成内容保存、文稿修订与身份变化，以及大字／深色／短屏／真实滚动。
- 独立 Python tomllib 核对实际修复后的源码、重复键与 TOML 1.0 内联表非法样本。11 个命名状态的 axe A/AA 无违规或待复核项，无页面异常和外部请求。这不是完整无障碍认证或 TalkBack 实测。
- [旧 TOML 源码回归](evidence/mobile-toml-diagnostic-2026-10-28/toml-source-report.json)：完整八组通过。适配“添加资料”、独立检查和当前返回，保留导入／阅读、准确修正／撤销／保存、未保存快照导出、重载草稿恢复、工作线程、外部冲突／另存副本、非法与超范围内容保存、大字可访问上下文、超大源码、新建及全库搜索覆盖。通过统计不再作为常驻结果，实际样本仍通过检查。
- 同一最终构建的 [TOML 字段](evidence/mobile-toml-diagnostic-2026-10-28/toml-value-report.json)十组和[帮助](evidence/mobile-toml-diagnostic-2026-10-28/help-report.json)十四组回归通过。没有重跑全部历史专项。

本地复查先执行 npm run build:mobile，再运行 node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 9012 --strictPort。浏览器专项使用本机 Playwright 模块路径环境变量 LONGEDIT_PLAYWRIGHT_MODULE。冻结设计来自仅监听本机的 9027 设计服务；原 9025 服务未响应，未作为产品测试失败。

[源码、测试与构建摘要](evidence/mobile-toml-diagnostic-2026-10-28/build-provenance.json)记录 41 项原始证据复制及修复来源；[摘要清单](evidence/mobile-toml-diagnostic-2026-10-28/manifest.json)核对冻结和提交字节。

下一步按计划进入 PDF 导航与任务返回，先审计既有流程再选择一个用户任务。阶段 3 的这批源码结构与诊断已分层接入，原生出口仍未完成。Android 物理返回、真实输入法／选择控件、TalkBack、后台及进程恢复仍待验收，浏览器桥接不代替实机。本轮没有生成、安装、提升 APK 或发布。
