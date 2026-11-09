# 移动端：逐层修改 TOML 字段并核对

2026-10-27 冻结设计，2026-10-28 完成阶段 3F1。起点 3db783f34，继续在独立移动分支 codex/mobile-0.1.0-foundation 开发，遵循[每次一个用户任务](Development_User_Task_Plan_2026-09-22.md)与[移动交互重设计](design/mobile-interaction-v2/interaction-spec.md)。本轮完成“浏览结构 → 字段详情 → 修改 → 核对 → 应用草稿／撤销／保存”；下一轮收整 TOML 诊断。桌面工作目录未修改。

[旧编辑页](evidence/mobile-toml-value-2026-10-27/before-edit.png)与[旧核对页](evidence/mobile-toml-value-2026-10-27/before-review.png)把原值、类型、输入、候选结果和宿主工具放在同一层，返回会清除准备内容。现在四个任务层各自承担一个操作，通用范围说明收进问号，只有具体受限原因和验证错误留在当前页面。移除重复模式切换与“TOML 源码”标签，使用文稿既有阅读／编辑入口。

## 竞品依据与取舍

2026-10-27 查阅以下官方资料；本轮没有安装竞品，不把开发者介绍当成系统返回、键盘、数据保真或 TOML 类型编辑的实测结果。

| 对象 | 官方资料支持的行为 | 本项目决定 |
| --- | --- | --- |
| [Acode QuickTools](https://docs.acode.app/user-guide/quicktools) | 触摸工具可配置为一行／两行、隐藏，滑动展开额外按键 | 按当前任务呈现动作；结构、修改、核对各用独立页面，保留源码入口，窄屏允许完整按钮换行排列。 |
| [Obsidian 移动版帮助](https://obsidian.md/help/mobile) | 移动编辑工具栏与导航、前进／后退以及按需菜单 | 返回只消费当前层，保留位置和输入；帮助先关闭，底层文档查找之后才返回。具体任务栈契约来自本项目用户要求，不声称竞品具备相同 TOML 编辑流程。 |
| [QuickEdit 开发者介绍](https://play.google.com/store/apps/details?id=com.rhmsoft.edit) | 文本／源码编辑、指定行定位、撤销／重做、纵横滚动与主题 | 结构操作接回准确源码现场，应用可单步撤销，显式保存才更新文件，检查窄屏、深色和滚动。这里只引用列出的能力，不比较未经实测的性能。 |

公开资料不足以证明上述软件提供与我们相同的 TOML 类型表单。普通值、精确数字与日期等边界继续由现有源码解析器和用户数据保护要求决定，不因共用 JSON 外观而增加不支持的结构操作。

## 冻结设计与返回契约

[七屏设计](design/mobile-toml-value-v1/index.html)包括列表、详情、修改、核对、日期限制、分析中和失败。[冻结回执](evidence/mobile-toml-value-2026-10-27/design-freeze.json)为 2026-10-27T12:19:52.379Z，早于运行时代码修改；源 SHA-256 为 5b593a6307a82fc22ccb452c5efcea5c874625093f3c9c238840c08a38b4b858。七屏先逐张审阅再实施，修复没有改冻结源、时间或图片。

- 结构页显示当前文件与完整逻辑路径，逐层浏览表、数组、内联表和表数组。每页 30 项，筛选匹配本层名称与值的摘要；不声称搜索完整值。带点号的引号键、嵌套点号路径和表数组实例保持不同身份。
- 字段详情先看原始写法，再进入类型／值表单；核对页只显示原值和候选写法，不同时摊开表单。只有显式“应用到草稿”才修改正文，原值不变时不产生历史或草稿。
- 普通返回依次从核对回修改、详情、父层及源码。按字段和类型保留未确认文字／整数／浮点数／布尔输入、选区方向、输入滚动及当前焦点；显式取消只清当前字段的准备。
- 关闭再打开结构仍能继续输入；层内筛选、页码、滚动与原字段焦点保留。帮助先消费一层返回并恢复问号焦点，结构返回优先于隐藏的文档查找；之后返回才关闭查找。
- 源码编辑器保持挂载，原选区和滚动不丢失。明确前往源码才进入编辑并定位原始范围。应用成功或草稿保护失败均恢复源码焦点；已有草稿和其他文稿记录不因浏览／检查被改写。
- 数值使用完整词法文字，修改只替换一个准确范围，不序列化 JS 数字或日期。保留 BOM、CRLF／LF 混合换行、注释、引号键及未选字段。新整数使用十进制并保留有符号 64 位检查，新浮点数需小数点或指数；不变的进制、下划线、正负零、特殊浮点和转义字符串保留原字面量。
- 日期／时间保持时区与原始精度，跨行文字和超长值继续使用源码入口。容器只浏览，不显示尚未支持的 JSON 增删或重命名操作。具体限制原因可见，一般说明在问号内。
- 停止／返回终止工作线程；超时、启动失败和重试保留输入，不接受迟到候选。字符、深度、节点、字段等预算与 TOML 1.0 边界不变，不发布部分可编辑树。源码修订或文稿身份变化清除过时准备与结果。
- 文字和候选作为普通文本展示，HTML 不执行或发起资源请求；有界 Unicode 预览保护代理对，应用仍使用完整内容。窄屏、大字、长路径和短屏通过真实滚动到达当前值和动作。

改动集中在 TomlStructure.vue、TomlTools.vue、MobileApp.vue 与帮助文案。结构组件保留挂载以承接返回，宿主栏在任务页隐藏，TOML 返回接入已有优先级。解析、预算、工作线程、范围修改引擎、编辑器事务、源码格式和文稿存储会话均未修改；package.json 仅新增专项命令，依赖和版本不变。

## 实页核对与实际修复

[七屏并排对照与其他实页](evidence/mobile-toml-value-2026-10-27/comparison.html)包含最终 20 张原始截图。逐张审阅或核对与已审阅图逐字节相同：最终七张任务图与首个完整通过版本一致，入口修复后的四张变化图另行查看。标准 390×872 视口裁去真实 28px 桥接提示条，得到 390×844；200% 文字时提示条自然换行，截图保留剩余真实视口。没有移位、重画或隐藏实际内容来贴图。

[量测记录](evidence/mobile-toml-value-2026-10-27/comparison.json)：248 项坐标属性最大偏差 0px，240 项字体、字重、行高、字距与颜色属性一致。问号为 22×22，读取中的图标路径与冻结源一致。浏览器焦点、按下反馈与字体栅格差异保持真实，不声明整屏逐像素相同。

实际走查推动两项修复，原失败与原图均保留：

1. [首次返回失败](evidence/mobile-toml-value-2026-10-27/before-return-repair-report.json)：结构组件为保留输入而挂载，关闭后其旧条件分支也隐藏了根工具入口。[原失败实页](evidence/mobile-toml-value-2026-10-27/before-return-repair.png)确实缺少入口。将工具入口显示绑定到当前是否打开，重新验证返回及继续输入。
2. [首个完整任务报告](evidence/mobile-toml-value-2026-10-27/before-entry-task-report.json)九组通过后，额外观察发现 [320px 入口](evidence/mobile-toml-value-2026-10-27/before-source-entry-320.png)把按钮挤成两行字，检查目标只有 36px。[观察脚本](evidence/mobile-toml-value-2026-10-27/before-entry-observation-report.json)的溢出／axe 检查仍通过，不能代替看图。删除重复格式标签，按钮保留完整文字、48px 高度，大字允许按按钮换行排列；[最终入口](evidence/mobile-toml-value-2026-10-27/actual-source-entry-320.png)与 [200% 入口](evidence/mobile-toml-value-2026-10-27/actual-source-entry-320-200.png)另有实页断言。此处记录为可用性修复，不冒充七屏冻结稿中的界面。

本地预览跨轮停止，第一轮浏览器在 App 加载前连接失败；[原环境失败](evidence/mobile-toml-value-2026-10-27/preview-stopped-report.json)保留。恢复仅监听本机的 Vite 预览后重新验证，HTTP HTML 与最终 dist/mobile.html 逐字节一致。冻结前还修复了设计服务未运行和准备脚本转义错误，未进入产品测试；证据整理时资产前缀识别错误也已修正。完整环境记录见[构建来源](evidence/mobile-toml-value-2026-10-27/build-provenance.json)，没有把这些中断计作应用通过结果。

## 验证与剩余工作

- npm run build:mobile：最终类型检查与构建通过，保留既有包体积提示。资源为 mobile-DDfqEtg1.js、mobile-DNC7J6Ud.css；TOML 工作线程仍为 toml.worker-C8Cx_jVI.js 和 tomlStructure.worker-CiZBYjaA.js。最终构建后没有再改运行时代码。
- node --test scripts/test-mobile-toml-source.mjs scripts/test-mobile-toml-structure.mjs：既有 21 项通过。此后仅改根入口排版，解析与事务代码保持未改。
- [TOML 实页](evidence/mobile-toml-value-2026-10-27/browser-report.json)：最终 10 组通过。包括各层返回／帮助／重开继续、逐字段和逐类型输入、反向选区与滚动、精确数值及注入拒绝、一次应用／撤销／重做／保存、字面量不变、日期等源码边界、停止／失败／超时／重试、预算退出、筛选分页现场、原编辑器与隐藏查找、现有草稿、源文／身份变化、草稿存储失败、HTML 字面内容及大字／窄屏／深色／短屏。
- 独立 Python 3.12 tomllib 实际解析浏览器产生的草稿，核对 9223372036854775806、引号点号键与嵌套路径、其他表以及两个表数组实例；不是只用本项目解析器核对自己。原文逐字比较另行覆盖 BOM、混合换行、日期精度和注释。
- 16 个命名状态的 axe A/AA 无违规及待复核项，无页面异常和外部请求。这不是完整无障碍认证或 TalkBack 验收；入口挤字问题也说明自动通过仍需实际看图。
- 同一最终构建的 [XML 属性](evidence/mobile-toml-value-2026-10-27/xml-value-report.json)9 组和[帮助](evidence/mobile-toml-value-2026-10-27/help-report.json)14 组回归通过，覆盖宿主返回与共享帮助语境；没有重跑全部历史专项。

本地复查先执行 npm run build:mobile，再运行 node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 9012 --strictPort。浏览器专项使用本机 Playwright 模块路径环境变量 LONGEDIT_PLAYWRIGHT_MODULE；不要用将 PDF .mjs 返回为纯文本的预览服务替代 Vite。

[源码、测试与产物摘要](evidence/mobile-toml-value-2026-10-27/build-provenance.json)记录 39 项证据复制映射、修复与环境来源；[摘要清单](evidence/mobile-toml-value-2026-10-27/manifest.json)用于核对冻结及提交字节。

下一步处理 TOML 检查结果、问题详情和准确源码定位，阶段 3 整体仍未完成。Android 物理返回、真实输入法与选择控件、TalkBack、后台及进程恢复仍待原生验收，浏览器桥接不代替实机。本轮只做本地提交，没有生成、安装、提升 APK 或发布。
