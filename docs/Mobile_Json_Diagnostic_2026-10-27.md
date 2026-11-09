# 移动端：检查 JSON 并回到源码修正

2026-10-27。阶段 3C6，起点 `632ab9c03`，继续在独立移动分支 `codex/mobile-0.1.0-foundation` 开发。遵循[每次一个用户任务](Development_User_Task_Plan_2026-09-22.md)和[交互重设计](design/mobile-interaction-v2/interaction-spec.md)，完成“主动检查 → 看清问题位置 → 定位原文 → 修正 → 重新检查 → 显式保存”。桌面工作目录未修改。

[旧实页](evidence/mobile-json-diagnostic-2026-10-27/before-invalid.png)把检查结果、一般说明和定位动作放在源码工具下方，挤占正文。现在检查结果进入独立任务页，正文编辑器继续保留；检查状态、问题位置和下一步动作分别清楚呈现。

## 竞品依据与取舍

本轮在 2026-10-27 查阅以下官方公开资料，未安装竞品，不把商店描述记为已验证的原生布局、手势或返回细节，也不据此断言其全部功能质量。

| 对象 | 官方资料支持的行为 | 本项目决定 |
| --- | --- | --- |
| [JSON Editor / UKM APPS](https://play.google.com/store/apps/details?id=com.sanca.jsoneditor) | Android 编辑器提供文本/树视图、实时验证、有效状态及行列位置，问题文件有状态标记 | 检查结果和位置必须能辨认。本轮采用主动检查的完整任务，保留阅读与编辑现场，避免输入时持续展开说明。 |
| [JSONVEdit / CosmoVex](https://play.google.com/store/apps/details?hl=en&id=com.cosmovex.jsonvedit) | 开发者介绍包括实时验证、详细行列错误、JSON Schema 与修复工具 | 本轮明确检查当前原文的语法，把行列位置和源码入口关联；Schema、业务含义等边界放进问号说明，不用语法通过暗示配置正确。 |
| [JSON Formatter & Validator / Tahatec](https://play.google.com/store/apps/details?id=com.tahatec.json_formatter) | 商店介绍明确包含行列信息和将光标放到问题处的按钮 | 采用“前往问题源码”作为问题页主动作，用真实原文偏移定位。具体整页布局和逐层返回为本项目设计，不声称复制其安装态页面。 |

另参考成熟编辑器的[错误列表与源码定位](https://code.visualstudio.com/docs/editing/editingevolved)方式；这是编辑器交互参照，不将 VS Code 桌面的问题面板当作手机原生竞品，也不照搬大屏布局。

## 冻结设计与交互契约

[五屏设计](design/mobile-json-diagnostic-v1/index.html)覆盖语法问题、通过、检查中、超范围和失败。[冻结回执](evidence/mobile-json-diagnostic-2026-10-27/design-freeze.json)为 `2026-10-27T05:15:20.734Z`，早于运行时代码修改；设计源 SHA-256 为 `62fd94e58810a33af25a5d3c30527b62238e60e7b8b151fc15ee9005175f308f`。

- 点击“检查 JSON”进入独立页，隐藏宿主标题、查找、正文和编辑底栏；原阅读器或编辑器保持挂载。检查完成、停止和返回均不修改已保存文件或当前草稿记录。
- 问题页显示首个语法问题附近的行列，以及最多三行源码。问题行有行号和边线；长行按 Unicode 码点围绕问题位置省略显示，每行最多 160 个码点及两侧省略号，避免截断代理对。预览不会改变定位所用的完整原文。
- “前往问题源码”关闭检查页，显式进入编辑并聚焦原文位置，兼容 BOM、混合换行和表情字符。修正后可重新检查；检查不会清除编辑历史，也不阻止保存未完成的 JSON。
- 检查通过只显示明确结果和返回动作。语法/Schema/业务边界、位置可能不是错误起因、预览范围等说明收进 `?`，不常驻结果页。
- 字符、结构深度及 token 超范围显示“暂不检查”，与语法问题区分，不发布部分定位结果。停止、线程失败或超时没有旧位置入口，可显式重试；返回会终止未完成工作并拒绝迟到结果。
- 返回或关闭帮助只消费一层。退出检查恢复原检查入口焦点、原阅读/编辑模式、编辑选区和滚动；底层文档内查找的输入继续保留，再返回才关闭该查找。
- 结果绑定准确原文和文稿身份。原文变化后清除旧位置并要求重新检查；关闭检查再修改、切换文稿后不会复用旧结果。

语法引擎、`json.worker.ts`、MobileApp 返回分发、编辑器的原文偏移转换及保存实现未修改。新增的是检查页、受限摘录显示和 JsonTools 的任务接入；复用现有完整原文检查与定位能力。排版流程本轮保持可用，独立排版核对留作下一任务。

## 实页核对与验证

[五屏并排对照及八张适配原图](evidence/mobile-json-diagnostic-2026-10-27/comparison.html)保留冻结设计、最终实页及实际滚动位置。标准视口为 390×872，仅裁去 28px 预览提示条得到 390×844；适配截图按真实提示条高度裁切，没有移动或重绘页面元素。

[量测](evidence/mobile-json-diagnostic-2026-10-27/comparison.json)比较 156 项坐标，偏差均在 0.5px 内；144 项字体、字重、行高、字距和颜色属性一致。五种主要状态及八张窄屏/大字/暗色/短屏原图均已逐张查看，问题行与前一行的完整预览区域通过实际滚动检查；二者可同时显示时，两次目标截图可以相同。不声明整屏逐像素一致。

实际比图发现[加载图标](evidence/mobile-json-diagnostic-2026-10-27/before-icon-checking.png)缺口方向与冻结设计不同，且[问号图标](evidence/mobile-json-diagnostic-2026-10-27/before-icon-invalid.png)略小；只修正本页图形和尺寸，未改冻结图。最终专项直接从冻结 HTML 读取预期，核对 22×22 问号和加载路径，保留修改前通过的报告及原图。

- `npm run build:mobile`：最终类型检查与构建通过，保留既有包体积提示。初次类型检查发现未使用的正文引用，已移除后通过。
- `node scripts/test-mobile-json-diagnostic.mjs`：3 项摘录检查通过，覆盖原文偏移、混合换行、Unicode 长行、空文档、边界与无效/超预算输入；新检查加入 `test:mobile`，另提供单独运行入口。
- `node scripts/test-mobile-json-source.mjs`：5 项既有语法、预算、原文保真、撤销及未完成内容保存逻辑通过，引擎未改动。
- [最终诊断实页](evidence/mobile-json-diagnostic-2026-10-27/browser-report.json)：9 组任务通过。包括独立结果与帮助返回、同一编辑器的选区/滚动和查找恢复、真实定位/修正/重查/撤销重做/保存、BOM/混合换行/表情/空文档、工作线程停止/返回/失败/超时、三类预算、当前草稿与文稿切换、未完成内容保存及原排版回归、窄屏大字暗色短屏、长行定位、只读返回与 HTML 字面显示。9 个命名状态的 axe A/AA 检查未检出违规或待复核项，无页面异常或外部请求；不等同全面无障碍认证。
- 最终构建的[帮助交互](evidence/mobile-json-diagnostic-2026-10-27/help-report.json)14 组通过。图标修正前，同轮构建的[数组移动及共享结构返回](evidence/mobile-json-diagnostic-2026-10-27/move-report.json)9 组通过；此后仅修改诊断页图标，JsonTools 与结构返回未再改动，不冒充最终构建重跑。

保留首轮[测试定位器失败](evidence/mobile-json-diagnostic-2026-10-27/failure-test-return-selector-report.json)：测试同时命中了头部和底部两个同名返回动作，改为限定底栏操作；没有为通过该测试修改产品文案或行为，也没有改写失败报告。

[构建与源码身份](evidence/mobile-json-diagnostic-2026-10-27/build-provenance.json)记录源码、测试、产物摘要与原始输出映射；[摘要清单](evidence/mobile-json-diagnostic-2026-10-27/manifest.json)用于逐字节核对冻结设计和证据。

下一步收整 JSON“整理缩进”的独立核对流程，再处理其他格式。阶段 3 整体未完成。Android 物理返回、真实输入法、TalkBack、后台及进程恢复仍待原生验收；浏览器桥接、合成故障与文档研究不代替实机结果。本轮没有生成、覆盖安装或提升 APK。
