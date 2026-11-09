# 移动端：检查 YAML 并回到源码修正

2026-10-27，阶段 3D2，起点 eabb88032。继续在独立移动分支 codex/mobile-0.1.0-foundation 开发，遵循[每次一个用户任务](Development_User_Task_Plan_2026-09-22.md)与[移动交互重设计](design/mobile-interaction-v2/interaction-spec.md)。本轮完成“检查 → 结果列表 → 单条详情 → 源码修正 → 重新检查”，桌面工作目录未修改。

[旧实页](evidence/mobile-yaml-diagnostic-2026-10-27/before-detail.png)将检查结果与源码放在同一层，没有单条详情页面。现在将结果和修正分开：先辨认问题，再查看附近源码，明确前往源码才进入编辑；检查不会改动文稿，也不阻止保存尚未完成的配置。

## 竞品依据与取舍

2026-10-27 查阅以下官方资料。本轮未安装竞品；商店描述和帮助文档不代表已验证其真实返回、键盘、数据保护或具体页面布局。

| 对象 | 官方资料支持的行为 | 本项目决定 |
| --- | --- | --- |
| [YAML Studio，开发者商店介绍](https://play.google.com/store/apps/details?id=info.camposha.yaml_studio) | 开发者列出手机／平板本地 YAML 编辑、行号、实时语法提示及行位置／原因、树视图等能力 | 将“在哪里、为什么、如何继续修正”作为检查任务的核心。商店介绍只是移动 YAML 工具的公开能力参考，不把它当成成熟度或隐私验证；本项目仍采用显式检查，结果列表和逐条详情由我们设计。 |
| [Obsidian 属性](https://obsidian.md/help/properties) | 属性区分名称、值和类型，也可使用源码显示；官方说明嵌套属性不受属性界面支持，建议源码方式 | 结构工具保留真实能力边界。诊断提供准确源码退路，警告不冒充错误；不增加未支持的自动修复、业务规则或结构重写。 |
| [Obsidian 移动端](https://obsidian.md/help/mobile) | Android／iOS 提供移动工具栏与导航；编辑时的工具区域随上下文改变 | 每层只呈现当前任务动作，检查页使用完整正文空间，帮助使用问号；返回逐层恢复，底层编辑器与查找继续保留。完整的返回现场契约是本项目要求，不声称竞品采用完全相同实现。 |
| [VS Code 代码导航](https://code.visualstudio.com/docs/editing/editingevolved) | 桌面编辑器提供错误／警告导航和问题定位 | 借鉴区分问题严重程度与前往源码的关系。这是桌面定位参考，不将其列作手机竞品，也不搬入桌面面板布局。 |

不在页面常驻解释解析机制、只读状态或开发流程。一般说明放入问号；当预算不足、检查失败或结果被截断时，才保留帮助用户判断下一步的短说明。

## 冻结设计与交互契约

运行时代码修改前先冻结两版设计，均完整保留：

- [v1 八屏设计](design/mobile-yaml-diagnostic-v1/index.html)，[冻结回执](evidence/mobile-yaml-diagnostic-2026-10-27/design-freeze.json)：2026-10-27T06:49:59.212Z，源 SHA-256 为 e6636e397e4d29c9047da689de9205eb7a392542677698f00a7ceec09a8f1497。
- [v2 八屏设计，主要对照](design/mobile-yaml-diagnostic-v2/index.html)，[冻结回执](evidence/mobile-yaml-diagnostic-2026-10-27/design-v2/design-freeze.json)：2026-10-27T06:51:38.989Z，源 SHA-256 为 380638149602e57c001b3fd700514230b2f93a976a0d54d26208ee3516621c59。审阅 v1 时发现提示详情的源码行边框仍用错误红色，v2 改成提示色；其他七张图逐字节相同。两次冻结都早于运行时代码修改，之后没有修改任一冻结源或冻结图。

设计覆盖问题列表、问题详情、提示列表、提示详情、通过、检查中、超范围和失败。

- 点击“检查 YAML”进入结果任务页；根层只显示文件、结果摘要、可点击的简短结果行及必要动作。单条详情显示中文问题标题、行列附近、原始原因和附近三行源码。
- 详情返回结果，恢复原结果行的焦点和列表滚动；结果根层返回源码，恢复“检查 YAML”入口。帮助先消费一层返回，再回到自己的入口；底层查找随后才关闭。
- 同一源码编辑器持续挂载，普通返回保留选区、滚动和查找词。进入检查、结果、详情、帮助、停止或返回都不写草稿；原本只读仍只读。明确“前往问题／提示源码”才切到编辑并定位原始偏移。
- 诊断和片段都来自检查时的准确原文。源码修订清除旧结果，要求重新检查；切换文稿拒绝旧工作线程的迟到结果，不套用旧偏移。停止／返回终止工作线程，超时与启动失败提供可重试状态。
- 问题和提示分别计数，真实错误优先显示。提示使用自己的标题、颜色和源码行标记，不显示为绿色通过。无结果的空流、只有注释的文稿、多文档、YAML 1.1 指令保持既有解析行为。
- 最多保留 20 条结果。前面的警告占满名额时，后出现的真实错误替换已保留的最后一条警告；结果页再按错误优先、同类源码顺序展示。标题中的“已列出”及列表末尾的短说明明确这不是全部结果，说明可通过真实滚动到达。
- 仍遵守现有字符、深度、节点、文档和时间预算。只要整体检查未完成，即使早期文档已经发现错误，也不发布部分列表或旧定位；全文仍能阅读、查找、编辑和保存。
- 片段最多三行、每行最多 160 个 Unicode 码点，保护代理对；当前长行围绕偏移截取，行内可以真实滚动。展示去掉开头 BOM，但定位仍使用原文准确偏移，支持 CRLF／CR／LF 混用。HTML 作为普通文字显示。
- 编辑两处实际问题后重新检查通过，修改保留两步撤销／重做；检查不重写 BOM 或换行。文件只有在用户显式保存后更新，检查也不禁止保存非法但未完成的内容。
- YAML 结构组件保持挂载，检查后返回结构仍保留原字段的未确认输入；没有通过切换工具来清空准备内容。

新增 YamlDiagnostic.vue，YamlTools.vue 负责两项完整任务的入口和关闭。提取 sourceDiagnostic.ts 供 JSON／YAML 共用有界源码片段；jsonDiagnostic.ts 保留原导出接口及 JSON 预算。MobileApp、MobileEditor、YamlStructure、文稿保存会话及两个工作线程入口文件没有改动。

yamlSource.ts 的变化仅为有界诊断收集优先保留错误，未改变解析选项、各类预算、引用不展开或源文写入方式。YAML 两个工作线程的产物因共同依赖而更新，不能因为入口文件未改就声称产物未变。

## 实页核对与验证

[八屏并排对照与十一张适配／限额实页](evidence/mobile-yaml-diagnostic-2026-10-27/comparison.html)中的 19 张最终原图均逐张查看。标准 390×872 浏览器视口只按真实 28px 桥接提示条裁为 390×844；窄屏、大字、短屏和行内滚动保留当时实际尺寸与位置，没有为贴图移位、隐藏或重绘内容。

[量测结果](evidence/mobile-yaml-diagnostic-2026-10-27/comparison.json)：296 项坐标最大偏差 0px，276 项字体、字重、行高、字距与颜色属性一致；问号及结果图标均为冻结的 22×22，读取图标路径也一致。实页仍保留浏览器焦点／按下反馈，静态设计不覆盖这些状态；不声明整屏逐像素一致。

保留的观察与修复：

1. [首轮失败报告](evidence/mobile-yaml-diagnostic-2026-10-27/failure-test-line-ending-report.json)及[原图](evidence/mobile-yaml-diagnostic-2026-10-27/failure-test-line-ending.png)：测试把 CRLF 文稿的整段替换预期错写成 LF，实际编辑器与受保护草稿继续保留原 CRLF。修正测试预期，没有改产品换行规则。
2. [早期 9 组通过报告](evidence/mobile-yaml-diagnostic-2026-10-27/before-priority-and-icons-report.json)和[原图](evidence/mobile-yaml-diagnostic-2026-10-27/before-icon-issues.png)仍使用 24px 结果图标，比冻结设计大 2px，并导致标题横移 2px。最终按冻结的 22px 修正，未回改设计。
3. 专项深查发现真实限额缺陷：[修复前复现](evidence/mobile-yaml-diagnostic-2026-10-27/hidden-error-before.json)的前 20 条警告隐藏了后面的重复字段错误，整体却已判定非法。[相同原文修复后](evidence/mobile-yaml-diagnostic-2026-10-27/hidden-error-after.json)保留 1 个错误和 19 条提示；实页优先呈现该错误，能够进入详情并前往源码。补充跨文档重复字段、同文档未定义别名、仅警告和全错误达到限额的断言。
4. 该修复的一次中间类型检查因现有编译目标不包含 Array.findLastIndex 而失败（TS2550／TS7006）；改用最多 20 项的反向循环，编译配置未变。最终类型检查与构建通过。

最终验证范围：

- npm run build:mobile：类型检查和构建通过，保留既有包体积提示。最终主资源为 mobile-oHu1kzE8.js、mobile-D4VjeIiX.css；YAML 工作线程为 yaml.worker-_WiaMrO4.js、yamlStructure.worker-Dmp2wUFR.js；JSON 检查工作线程仍为 json.worker-Dw7UdZ9z.js。
- node --test scripts/test-mobile-yaml-source.mjs scripts/test-mobile-yaml-structure.mjs scripts/test-mobile-json-diagnostic.mjs：最终 23 项通过（YAML 语法 9、YAML 结构 11、JSON 源码片段 3），覆盖预算、限额、原文范围、引用不展开、精确值与共用片段的原接口。
- [最终 YAML 诊断实页](evidence/mobile-yaml-diagnostic-2026-10-27/browser-report.json)：9 组通过，覆盖逐层返回、准确定位、真实两处修正／重查／撤销／保存、警告与空流／多文档、停止／返回／启动失败／超时／重试、各预算无部分结果、源文及文稿变化、同一编辑器／查找／草稿与字段输入、BOM／混合换行／emoji／长行／HTML 字面内容及非法内容保存。
- 15 个命名状态的 axe A/AA 检查无违规或待复核项，未记录页面异常和外部请求。不是完整无障碍认证或 TalkBack 验收。320px、200% 文字、深色与短屏有真实滚动及可视边界断言，不仅判断元素存在。
- 同一最终构建的 [YAML 字段回归](evidence/mobile-yaml-diagnostic-2026-10-27/yaml-value-report.json)9 组、[JSON 诊断回归](evidence/mobile-yaml-diagnostic-2026-10-27/json-diagnostic-report.json)9 组、[帮助回归](evidence/mobile-yaml-diagnostic-2026-10-27/help-report.json)14 组通过。未重复全部历史任务。

[构建与源码身份](evidence/mobile-yaml-diagnostic-2026-10-27/build-provenance.json)记录实际源码／LF 摘要、测试和产物、36 项原始证据复制映射及失败修复记录；[摘要清单](evidence/mobile-yaml-diagnostic-2026-10-27/manifest.json)用于核对冻结与提交字节。最后一次诊断专项仅增加相同最终构建的限额实页截图和断言，没有再次修改运行时代码。

下一步处理 XML 的结构、详情、值修改与核对任务，再处理 TOML；阶段 3 整体仍未完成。Android 物理返回、真实键盘与选择控件、TalkBack、后台和进程恢复仍需原生验收；浏览器桥接及合成故障不代替实机结果。本轮仅本地提交，没有生成、安装、提升 APK 或发布。
