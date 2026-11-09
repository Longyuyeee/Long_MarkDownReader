# 移动端：输入 PDF 页码并回到阅读

2026-10-28，阶段 4B1，起点 `18a3d7970`。继续在独立移动分支 `codex/mobile-0.1.0-foundation`，遵循[每次一个用户任务](Development_User_Task_Plan_2026-09-22.md)与[移动交互重设计](design/mobile-interaction-v2/interaction-spec.md)。本轮只完成“打开页码 → 输入／纠错 → 确认跳页或返回阅读”，桌面工作目录未修改。文内查找接着作为阶段 4B2，阅读设置、书签和批注编辑后续分别推进。

[基线实测](evidence/mobile-pdf-page-task-2026-10-28/before-report.json)确认两处问题：输入 `8` 后返回再打开被重置为 `3`；当前第 3 页放大滚动至 196px，确认第 3 页会回到 0px。[旧实页](evidence/mobile-pdf-page-task-2026-10-28/before-initial.png)仍将表单摊在阅读器上方并缩小阅读区域。现在改成短弹窗，未确认准备保留在本次阅读中，确认当前页直接关闭，阅读现场不重置。

## 竞品依据与取舍

2026-10-28 查阅官方帮助；没有安装竞品，公开流程不等于当前完整布局、原生返回或输入法实测。

| 对象 | 官方资料支持 | 本项目决定 |
| --- | --- | --- |
| [Acrobat Android 导航与搜索](https://www.adobe.com/devnet-docs/acrobat/android/en/navigatesearch.html) | 点击页码控制，进入 Go To Page 对话框，输入后选择 OK；也提供上次查看页面入口 | 使用短输入弹窗和明确确认。先保留当前页和未确认输入，不为对标额外增加“上次查看”历史功能。 |
| [Xodo 跳页帮助](https://feedback.xodo.com/support/solutions/articles/35000202863-jumping-to-a-page) | 点击页码，输入页码并明确确认 | 把输入与阅读分层，返回不跳页。该帮助修改于 2022 年，只参考任务组织，不断言现在入口仍在相同位置。 |

按 PDF 物理页面顺序从 1 开始，继续使用原有页码解析和边界规则，不解释印刷页号。返回保留输入／选区、当前页确认不重置等契约来自本项目用户要求，不声称竞品提供相同恢复保证。

## 先冻结设计，再实现

[四屏设计源](design/mobile-pdf-page-v1/index.html)覆盖初始、修改、越界和空输入。[冻结回执](evidence/mobile-pdf-page-task-2026-10-28/design-freeze.json)时间为 `2026-10-28T02:28:39.739Z`，HTML SHA-256 为 `a8d86e708c69321bb331aa9386769c560d8ad72f21f465155e5fcad978753453`。先实际查看四张冻结图，再修改运行时代码；冻结源、背景字节、时间和四张冻结图没有覆盖。

设计背景来自基线第 3 页的阅读器原图，逐字节复制到设计目录，SHA-256 为 `45e5a0a4821602540400688534deb3bbfbb2dd0143a36b5aad150ccbaf64b5bf`。弹窗由独立 HTML/CSS 绘制；正式 App 原图全部重新捕获，没有把弹窗或内容合成到截图。背景仅用于 mock，不进入运行时。

- 弹窗显示文件、当前页和总页数；只保留输入、返回与前往动作，一般页号／准备保留说明放在问号。阅读区不重排，背景控件 inert，不会误点翻页、主题或批注。
- 首次打开默认当前页并选中；用户编辑后，返回阅读、X、系统返回桥接、Escape 和背景关闭均保留原始输入、错误、选区与正文位置。重开自动聚焦输入，帮助先关闭并恢复问号焦点，Tab／Shift+Tab 留在当前弹窗。
- 准备仅在这份 PDF 的本次阅读会话保留，成功确认后下一次默认新的当前页；关闭 PDF 或换来源后清除。未确认输入不另写入存储，不承诺进程恢复；已有页码、缩放和页内位置继续按原引擎持久化。
- 显式前往／Enter 才校验与跳页。范围外、空值、0、负数、正号、小数、指数、前导零和全角数字保持原输入并显示关联错误；修改输入即清除旧错误。继承原规则允许首尾空白，接受实际范围内的正整数。
- 返回和确认都读取输入框实际值，不依赖 Vue 延迟模型；浏览器模拟合成中的 DOM 输入验证了该边界，不等于真实 Android 输入法验证。没有替用户改写为另一个有效页码。
- 确认当前页只关闭弹窗，保留缩放、横向／纵向滚动和视口尺寸。确认其他页按原引擎跳转与记录，原 PDF 字节不变；打开页码之前沿用批注草稿保护，保护失败不离开。
- 底层文内查找准备继续保留。页码弹窗打开时先消费自己的返回，再返回才关闭查找；取消不清空查询，明确选择不同页才收起查找回到阅读。页码弹窗打开期间不能直接打开导航，先返回阅读后再进入；阶段 4A 关于旧内联页码面板可以直接切换导航的说明由此取代。导航关闭不会清空会话页码准备。

实现集中在新增 `MobilePdfPageDialog.vue`、PDF 宿主接入和帮助主题。沿用既有物理页码解析、渲染、手势、连续阅读、权限和数据模型；共享 App、全局样式、书签／批注存储、依赖均未修改。常驻 PDF 底栏和旧查找表单本轮没有全量重设计。

## 实页核对与修复

[并排对照与原图](evidence/mobile-pdf-page-task-2026-10-28/comparison.html)收录四个冻结状态、八张最终弹窗原图、普通阅读图与相关失败原图。最终标准、窄屏、大字、短屏滚动和深色原图均已逐张查看。[量测](evidence/mobile-pdf-page-task-2026-10-28/comparison.json)的 152 项坐标属性最大偏差 0px，156 项字体、字重、行高、字距和颜色属性一致。保留真实焦点与 PDF 栅格，不宣称整屏逐像素相同。

标准原视口为 390×872，只裁去真实 28px 桥接提示条得到 390×844；320px／200% 时提示条自然换行为 73px，短屏实际工作区为 320×273。没有通过隐藏正式内容、偏移截图或修改冻结稿贴合。设计与实页中的选区、焦点轮廓均保留。

实际看图和扫描确认以下修复；另记录一项滚动范围约束，原图和报告都保留：

1. [首轮 320px／200%](evidence/mobile-pdf-page-task-2026-10-28/before-responsive-error-320-200.png)标题和动作换行过碎，错误位于正文可见区外。缩窄标题字体，常规高度窄屏改为上下动作，并在高度允许时自动露出输入和错误。该轮 axe 为待复核，不记通过。
2. [中间大字图](evidence/mobile-pdf-page-task-2026-10-28/before-dark-scroll-fix-error-320-200.png)的文件行部分滚出正文，最初看图误判断为外层移动；后续坐标和 PNG 摘要核对确认其与最终常规高度大字图相同，不能证明外层曾误滚动。实现将 `scrollIntoView` 收紧为仅滚动弹窗正文，最终专项断言外层滚动为零；这是滚动范围约束，不记作已复现缺陷。[深色失败图](evidence/mobile-pdf-page-task-2026-10-28/before-dark-scroll-fix-error-dark.png)还显示错误颜色未生效；修正被 Vue 编译为仅祖先选择器的规则，保留可读深色错误色。
3. [中间六组通过版本](evidence/mobile-pdf-page-task-2026-10-28/before-short-fix-report.json)仍在[短屏大字](evidence/mobile-pdf-page-task-2026-10-28/before-short-fix-error-short-320-200.png)让两行动作占据太多高度，输入不好找。看图后继续修复：短屏动作并排、收起文件信息，观察正文尺寸变化并让当前焦点输入完整进入正文视口。
4. [短屏五字按钮](evidence/mobile-pdf-page-task-2026-10-28/before-short-action-fix-error-short-320-200.png)仍换行，axe 无法判断部分背景；再收紧短屏字号与内边距。最终两个动作单行，输入完整可见，正文可实际滚动查看错误，标题与动作栏保持固定。如此短的大字视口不能同时展示全部标签和错误，没有把这一限制藏掉。

首个专项在重新打开资料库文件时[失败](evidence/mobile-pdf-page-task-2026-10-28/identity-test-failure-report.json)：脚本用原显示名称查找导入副本，而实际路径包含唯一标识。改为从真实导入结果读取身份，未修改产品或样本。旧导航任务测试也改为先关闭页码弹窗再开导航，回来重开仍断言输入 `8` 保留，未删除原场景。

## 针对性验证与下一项

- `npm run build:mobile`：最终类型检查和构建通过，保留既有包体积提示。最终资源为 `mobile-L4GSThTq.js`、`mobile-Csj6wsTn.css`；PDF 核心 `pdf-D9v26WHW.js` 与工作线程 `pdf.worker.min-CLrFZWeq.mjs` 不变，之后未再编辑运行时代码。
- `node --test scripts/test-mobile-pdf-reading.mjs`：既有十项通过，包括实际二进制、页码边界、画布预算、阅读位置／配额、查找取消与预算。解析和引擎未改，没有新增镜像实现单测。
- [页码专项](evidence/mobile-pdf-page-task-2026-10-28/browser-report.json)：最终六组通过，覆盖模态背景、各种返回／帮助／焦点环、原始输入和选区、错误与无写入、当前页无重排／重渲染复位、首末页和其他页、模拟未提交 DOM 输入、底层查找优先级、会话清理、窄屏／200%／346px 短屏／实际滚动及深色。七个命名状态 axe A/AA 无违规或待复核，无页面异常及外部请求。当前页确认前后纵向 196px、横向 45px、390×531 阅读视口完全相同；PDF 字节和其他笔记／草稿保持原样。
- [导航任务](evidence/mobile-pdf-page-task-2026-10-28/navigation-task-report.json)：同一最终构建七组通过，包括真实目的地、批次／滚动／焦点、失败退路、书签保护失败、会话页码准备与查找、窄屏和深色。[帮助](evidence/mobile-pdf-page-task-2026-10-28/help-report.json)：同一最终构建十四组通过。
- [既有导航回归](evidence/mobile-pdf-page-task-2026-10-28/navigation-regression-report.json)：九组通过，运行于深色修复和局部滚动约束后的构建；其后只修改新页码组件的视口观察与响应式样式，由最终页码与导航任务专项覆盖。没有把此前构建报告冒称为同一最终资源，也未重跑全部历史测试。

复查：先 `npm run build:mobile`，使用 Vite preview 监听本机 9012；`LONGEDIT_PLAYWRIGHT_MODULE` 指向本机 Playwright 后执行 `npm run test:mobile-pdf-page-task-browser`。设计服务监听本机 9027，证据对照监听本机 9026。Vite 返回的 HTML 已与 `dist/mobile.html` 字节核对相同。

[来源与构建](evidence/mobile-pdf-page-task-2026-10-28/build-provenance.json)、[原图副本映射](evidence/mobile-pdf-page-task-2026-10-28/original-copy-map.json)和[摘要清单](evidence/mobile-pdf-page-task-2026-10-28/manifest.json)记录冻结、实际捕获、失败／修复和源码／制品身份。

下一项按阶段 4B2 收整 PDF 文内查找的输入、结果与返回，随后阅读设置与书签／批注编辑。Android 物理返回、真实输入法、TalkBack、后台和进程恢复仍待原生验收；浏览器桥接及 axe 不代替实机。本轮仅本地提交，没有推送，没有构建、安装或提升 APK，没有发布。
