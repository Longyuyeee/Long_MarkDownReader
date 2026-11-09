# 移动端：移除一个 JSON 字段或容器

2026-10-27。阶段 3C4，起点 `664948bbc`，继续在独立移动分支 `codex/mobile-0.1.0-foundation` 开发。遵循[每次一个用户任务](Development_User_Task_Plan_2026-09-22.md)与[交互重设计](design/mobile-interaction-v2/interaction-spec.md)，完成“选中字段 → 核对移除对象 → 应用到草稿 → 可撤销 → 显式保存”。桌面工作目录未修改。

[旧页面](evidence/mobile-json-remove-2026-10-27/before-legacy-review.png)将字段列表、源码入口、准备按钮和范围核对堆叠在同一页，用户需要向下寻找确认结果。现在短菜单只负责选动作；移除进入独立核对页，直接辨认目标、嵌套影响和待移除内容。

## 竞品依据与取舍

2026-10-27 查阅以下官方公开资料；没有安装竞品，不把文档描述记为已验证的 Android 手势、返回行为或弹窗布局。

| 对象 | 官方资料支持的事实 | 本项目决定 |
| --- | --- | --- |
| [Json Genie Android 商店介绍](https://play.google.com/store/apps/details?hl=en_US&id=com.tuyware.jsongenie) | 支持树形查看对象和数组，删除、移动和重排结构内容，并有源码视图 | 从当前项发起移除，显示路径与原内容；介绍不能证明其确认页面的具体形式。 |
| [Notion 删除与恢复](https://www.notion.com/help/duplicate-delete-and-restore-content) | 移动内容块的更多菜单包含删除；被删除页面和属性有恢复入口 | 删除收进对象菜单，采用本地草稿与撤销链，提前显示嵌套影响。独立核对页是本项目决定，不照搬云端回收站。 |
| [Obsidian Properties](https://obsidian.md/help/properties) | 属性具有类型，文档列出删除、撤销和重做操作；嵌套属性建议使用源码 | 保留类型辨认、源码回退和撤销。只删除选中范围，不重新序列化整份 JSON；其桌面快捷键不作为手机手势依据。 |

## 页面与返回契约

[五屏冻结设计](design/mobile-json-remove-v1/index.html)覆盖容器、普通字段、数组项、重复字段和核对失败。[冻结回执](evidence/mobile-json-remove-2026-10-27/design-freeze.json)为 `2026-10-27T04:40:16.768Z`，早于运行时代码修改；设计源 SHA-256 为 `86d8f1e3ba283537fb465f3794ae2dd546c0a1ac6784dd366f198db3b2867065`。

- 核对页显示文件、路径、类型与原内容。同名字段标明第几项；容器显示全部内部节点数量。预览包含字段名及值，不夹带分隔逗号；过长预览明确提示仍会移除完整内容。
- 打开时自动校验完整候选，不自动执行。检查未完成、失败、超时或主动停止时，不能“移除到草稿”；停止后可重试，错误保留可操作信息。
- 头部返回、系统返回桥接和“取消移除”只回原操作菜单，聚焦“移除此项”。关闭菜单再回父层或查询结果，保留筛选、分页、滚动及原项焦点。帮助关闭回原帮助按钮。
- 返回、取消和暂停终止未完成检查，拒绝迟到结果；目标、原文或文稿身份变化不能应用旧候选。只读不提供修改动作，根值不能移除。
- 应用回原源码编辑器并恢复焦点，是一个可撤销事务；保存才写文件。草稿保护失败仍保留已改内容与撤销能力，已保存文件和其他草稿不变。
- 一般说明放进 `?`。页面保留嵌套影响、预览截断、等待或错误等有用反馈；数组移动旧帮助也移除已迁出的增删说明。

范围补丁引擎、工作线程与草稿/保存实现未修改。现有删除规则负责连同必要分隔符移除首、中、末或唯一项，重新检查完整候选，保留其他内容的 BOM、混合换行、转义键、重复字段和大数原写法。

## 实页核对与验证

[五屏并排对照及六张适配原图](evidence/mobile-json-remove-2026-10-27/comparison.html)保留冻结设计和最终构建截图。标准视口 390×872，仅裁去 28px 预览提示条得到 390×844；大字、短屏按实际提示条高度裁切，没有移动或重绘页面元素。

[量测](evidence/mobile-json-remove-2026-10-27/comparison.json)比较 132 项坐标，偏差均在 0.5px 内；198 项字体、字重、行高、字距和颜色属性一致。五种主要状态、六张大字/暗色/短屏原图已逐张查看；真实滚动后，大字与短屏的完整预览位于正文可视区内。不声明整屏逐像素一致。

- `npm run build:mobile`：类型检查与最终构建通过，保留既有包体积提示。
- `node scripts/test-mobile-json-operations.mjs`：9 项范围操作与撤销逻辑通过，引擎未改动。
- [最终删除专项](evidence/mobile-json-remove-2026-10-27/browser-report.json)：9 组任务通过，覆盖对象与数组首中末/唯一项、嵌套影响、重复/空键和转义、大数/BOM/混合换行、取消与父层/查询现场、线程停止/失败/超时、旧目标失效、撤销重做/保存、草稿保护失败、只读/根值、大字暗色短屏。9 个命名状态的 axe A/AA 检查无检出违规或待复核项；无页面异常及外部请求。这不等同全面无障碍认证。
- 最终构建的[帮助交互](evidence/mobile-json-remove-2026-10-27/help-report.json)14 组通过。修正删除页暗色局部规则与帮助文案前，同轮候选的[重命名](evidence/mobile-json-remove-2026-10-27/rename-report.json)8 组、[新增](evidence/mobile-json-remove-2026-10-27/append-report.json)9 组、[字段值](evidence/mobile-json-remove-2026-10-27/value-report.json)10 组通过；不冒充最终构建重跑。共享返回路由此后未改动。

实际发现并修复[暗色错误对比度失败](evidence/mobile-json-remove-2026-10-27/failure-dark-contrast-report.json)：不完整的 `:global` 写法编译到祖先，变量被删除页自身覆盖。改为完整后代选择器后，暗色错误和确认控件使用正确配色，最终专项补查该状态。

另保留两次测试自身的失败：[分隔范围预期](evidence/mobile-json-remove-2026-10-27/failure-test-separator-report.json)漏算了移除项到下一字段之间的换行空白，只校正预期；[异步草稿等待](evidence/mobile-json-remove-2026-10-27/failure-test-draft-wait-report.json)在撤销尚未落盘时过早注入下一故障，改为等待真实存储状态。没有据此修改保存或范围引擎，也未改写失败报告。

[构建与源码身份](evidence/mobile-json-remove-2026-10-27/build-provenance.json)记录源码、测试、产物摘要及原始输出映射；[摘要清单](evidence/mobile-json-remove-2026-10-27/manifest.json)用于逐字节核对冻结设计与证据。

下一步收整数组移动，再处理诊断与其他格式。阶段 3 整体未完成。Android 物理返回、真实输入法、TalkBack、后台与进程恢复仍待原生验收；浏览器桥接和合成故障不代替实机结果，本轮没有生成或提升 APK。
