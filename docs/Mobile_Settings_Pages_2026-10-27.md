# 手机端设置分类、外观与返回

阶段2C推进“调整外观、查看已有资料和记录，再回到原来的操作位置”。沿用移动工作目录与分支，没有改动桌面目录、文档格式引擎、原生授权协议、保存和导入持久化格式。

## 改前观察与竞品依据

[改前实页](evidence/mobile-settings-pages-2026-10-27/before/report.json) 显示首页有8个混杂动作、内嵌深色开关和关于卡片。外观只在本次运行中保留，没有跟随系统变化或保存明确选择。原型中的“默认阅读”等未来入口不作为本轮已经实现的功能。

| 官方资料 | 可确认的事实 | 本项目的设计决定 |
| --- | --- | --- |
| [Obsidian Settings](https://obsidian.md/help/settings) | 手机设置在应用上方打开；设置分General、Editor、Files and links、Appearance等类别，外观有适应系统、浅色和深色。 | 设置先列目的地，再进入单个任务；外观提供三种实际可用选择。整页二级页和隐藏主导航是本项目的决定，不声称照搬其sheet布局。 |
| [Notion手机工作区](https://www.notion.com/en-us/help/workspaces-on-mobile) | 官方说明移动设置比桌面精简，保留外观等适用于手机的选项。 | 不为了与桌面数量一致而加入未接入的默认阅读、同步或账户开关；保留已有的记录和恢复能力。 |
| [Joplin Configuration](https://joplinapp.org/help/apps/config_screen/) | 手机从菜单进入Configuration。该文档没有证明其具体分类页布局。 | 设置作为稳定目的地，不将配置项铺进资料主页；具体分类和返回契约由本项目确定。 |

这是官方文档复核，未安装或录制竞品。调研结果支持取舍，不代替本项目的实际交互验收。

## 页面和操作

- 首页只列外观、资料库、导入与导出、保存恢复记录、关于Long编辑；保留资料/搜索/设置主导航。关于与各类记录不再常驻首页。
- 外观、资料库、导入与导出、关于进入独立二级页，有持续可见的顶部返回，隐藏品牌栏和主导航。恢复沿用已有记录中心，也隐藏主导航。返回一次只回父页，设置首页再返回资料。
- 导入与导出保留文件、PDF、图片、附件包导入和附件包导出五个入口。关闭任务回到对应条目，再返回设置首页；保留各页自己的滚动与最后操作的条目。
- 资料库页与原有资料库选择层共用库列表组件，继续使用现有授权、选择和停止访问方法。切换库后留在当前资料库页；停止访问后保留原件和私有草稿，失效库显示需要重新授权。浏览器的系统目录选择仍诚实报能力限制。
- 停止访问使用居中确认，显示具体库和后果。返回或取消恢复原按钮；确认后仍留在库页，当前库失去授权时回到手机资料库。目录选择或停止访问尚未完成时，返回受忙碌守卫保护；真实系统取消仍待原生验收。
- 外观页只有已实现的主题选项，三种选择收进短弹层，选定立即应用并关闭。帮助、Escape、遮罩和系统返回模拟均只关当前层；取消不写偏好。
- 跟随系统会响应系统深浅色变化；固定浅色/深色保持用户选择。现有顶部快捷切换改为保存明确的浅/深色选择。偏好只使用本机独立键，不迁移或改写文档和草稿。
- 偏好写入失败仍应用当前外观，但说明没有保存，保留上次存储值；再次选择同一项可重试。读取失败或未知值回退跟随系统，不自行覆盖旧值。页面和短弹层不持久化为启动目的地。

分类位置只在当前运行中记录，包含滚动和语义焦点键，不保存DOM或笔记内容。大字体长列表中，返回栏保持可见，按父页返回不会因滚回页首而覆盖上次位置；点击返回按钮也不会取代最后操作的条目。

## 设计与实际核对

[最初六屏设计](design/mobile-settings-pages-v1/index.html) 在正式实现前冻结；[原件摘要](evidence/mobile-settings-pages-2026-10-27/design/capture.json) 保存源文件、图片SHA-256和时间。首轮实测发现旧停止访问仍为底部面板后，另行冻结 [确认设计](design/mobile-settings-confirm-v1/index.html) 及 [补充摘要](evidence/mobile-settings-pages-2026-10-27/design-disconnect/capture.json)，再修复确认；最初六屏没有改写。

| 页面 | 设计与实页 |
| --- | --- |
| 首页 | [对照](evidence/mobile-settings-pages-2026-10-27/comparison-home/comparison.png) |
| 外观 | [对照](evidence/mobile-settings-pages-2026-10-27/comparison-appearance/comparison.png) |
| 主题选择 | [对照](evidence/mobile-settings-pages-2026-10-27/comparison-theme/comparison.png) |
| 资料库 | [对照](evidence/mobile-settings-pages-2026-10-27/comparison-storage/comparison.png) |
| 导入与导出 | [对照](evidence/mobile-settings-pages-2026-10-27/comparison-transfers/comparison.png) |
| 关于 | [对照](evidence/mobile-settings-pages-2026-10-27/comparison-about/comparison.png) |
| 停止访问确认 | [对照](evidence/mobile-settings-pages-2026-10-27/comparison-disconnect/comparison.png) |

[六屏几何记录](evidence/mobile-settings-pages-2026-10-27/alignment.json) 核对页栏、标题、卡片、首行、底栏、主题层及关于区域。实测修正了首页标题范围、浏览器默认蓝色点按高亮、长列表返回位置和焦点。保留自身按下反馈、键盘轮廓和已有SVG字形，不宣称逐像素相同。

截图只裁去浏览器28px调试横条，保留产品控件和原始图像。固定于整个视口中央的确认框，在裁后应用区域会比无横条设计高14px；[确认几何记录](evidence/mobile-settings-pages-2026-10-27/confirmation-alignment.json) 同时保留原坐标与横条影响的计算，没有平移截图或修改设计来遮盖偏差。[视口测量](evidence/mobile-settings-pages-2026-10-27/viewport.json) 来自生产构建；这不是Android原生截图。

## 验证和后续

本轮构建、26项针对性逻辑测试、52组浏览器任务通过。所列无障碍专项共32次扫描未检出违规；其中资料分段的伪元素背景有自动检查无法判定的对比度项，已在最终构建补测浅色5.38:1、深色7.90:1，见 [颜色补测](evidence/mobile-settings-pages-2026-10-27/segmented-contrast.json)。自动检查不代表原生读屏已通过。

构建、针对性测试、原始失败候选及源码/制品摘要见 [验证清单](evidence/mobile-settings-pages-2026-10-27/verification.json)。新任务检查五个目的地、所有旧记录入口、逐层取消、主题跨重启/系统变化/读写失败、授权变化、恢复返回、非零滚动和焦点、320px/200%文字/深色/短屏，以及原文件和无关私有草稿的精确值。

历史记录用例通过可见分类进入入口，离开二级页也实际点按返回；没有用隐藏控件或程序改页跳过导航。更新的旧脚本保留原文、草稿、错误、取消与幂等断言；只有验证清单列出的用例在本轮执行，其他入口调整只作语法检查。

初次失败没有计为通过：旧停止访问面板与约定不符，随后修复；长列表再次进入丢失位置及条目也修复并复测。原始失败图和报告保留，设计与最终实页各自做摘要校验。

本轮未启动模拟器、未生成APK，也未验证真实Android目录选择取消、系统返回分发、输入法、TalkBack、后台恢复、实体机或iOS。浏览器事件、持久化及CSS像素不替代原生出口。阶段2的三组源码已接入，但阶段1/2原生条件仍保留；下一步进入阅读、编辑与源码工具的按需展开。
