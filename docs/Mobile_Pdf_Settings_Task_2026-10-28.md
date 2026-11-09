# 移动端：按需调整 PDF 阅读显示

2026-10-28，阶段 4C，起点 `d70633220`。继续在独立移动分支 `codex/mobile-0.1.0-foundation`，按[每次一个用户任务](Development_User_Task_Plan_2026-09-22.md)与[移动交互重设计](design/mobile-interaction-v2/interaction-spec.md)推进。本轮完成“阅读 → 设置总览 → 选择显示方式／准备缩放 → 应用或逐层返回”，桌面工作目录未修改。

[基线](evidence/mobile-pdf-settings-task-2026-10-28/before-report.json)实际量测：390×844 工作区的底栏占 165px，阅读视口 531px；旧大字面板关闭重开，滚动从 213px 回到 0。[旧实页](evidence/mobile-pdf-settings-task-2026-10-28/before-reader.png)常驻阅读方式、缩放与翻页多排控件，[旧设置](evidence/mobile-pdf-settings-task-2026-10-28/before-settings.png)又把方式卡片、说明和旋转操作同时铺开。现在底栏收成一行 65px，阅读视口 631px，标准尺寸多出 100px；设置按任务展开。

## 竞品依据与取舍

2026-10-28 查阅官方资料；没有安装竞品，不把公开帮助当成当前全部 UI、Android 返回或输入法实测。

| 对象 | 官方资料支持 | 本项目采用 |
| --- | --- | --- |
| [Acrobat Mobile 显示模式](https://helpx.adobe.com/acrobat/mobile/view-manage-files/viewing-modes.html) | 2026-08-18 更新；通过更多中的 View settings 选择连续／单页等方式，并提供夜间开关 | 显示设置按需打开，先展示当前值，再展开具体选项。只保留本项目已有逐页／连续功能，不增加 Liquid Mode、双页或常亮设置。 |
| [Xodo 显示方式](https://feedback.xodo.com/support/solutions/articles/35000202742-changing-view-modes) | 2022-07-06 帮助列出连续、单页和整份文档旋转等入口 | 把阅读显示与内容操作分开；显示方向提供四个明确值，不要求反复打开后每次旋转 90°。旧帮助只参考任务组织，不照搬其按钮位置。 |

本项目的深色开关继续调整应用界面，原版 PDF 页面颜色保持原样；它不等同于 Acrobat 的文档夜间反色。保留本机阅读位置、查找上下文和未应用选择来自本项目用户要求，不声称竞品提供同样的恢复保证。

## 冻结设计与操作契约

当前使用 [v3 八屏](design/mobile-pdf-settings-v3/index.html)：阅读器、设置总览、阅读方式、方向、初始缩放、未应用缩放、已应用当前值和文字阅读状态。[冻结回执](evidence/mobile-pdf-settings-task-2026-10-28/design-freeze-v3.json)为 `2026-10-28T03:23:23.618Z`，HTML SHA-256 为 `9946777ec498ef66d81c9b3b75ca71cf30f650324358d159722af0102a6d790e`。先逐张查看这八屏，再实施。

v1/v2 在多行 SVG 数组导出时遗漏路径；v2 尝试仍未解决，源摘要相同。v3 完整导出并断言图标节点数后才进入运行时开发。三个版本的源、图片和时间均保留，未覆盖旧冻结稿。阅读原型中的 PDF 图是实施前真实 canvas.toDataURL 的原样导出，三个设计目录中的 PNG 与原导出字节相同；没有重画原文，正式 App 截图独立生成。

- 常驻底栏为上一页、页码、下一页和批注；目录与查找保持顶部已接入位置，阅读设置替代顶部外观快捷位置。以常用翻页操作优先，避免重复入口；这更新了旧原型对底部目录入口的位置安排。重复总页数和常驻缩放／方式行收起，能力继续可用。
- 设置总览按行展示阅读方式、显示方向、当前缩放和深色开关。一般解释进入问号；关闭重开恢复本次 PDF 的列表滚动与可恢复焦点，不强制回顶部。
- 阅读方式和方向各自打开短选择层。选择逐页／连续或四个方向值后直接应用并回阅读；选择当前方式／方向不重绘。返回设置、X、背景关闭、Escape 或系统返回桥接只取消选择层，再返回才离开设置。帮助优先关闭，并回到原问号。
- 缩放保留原 100%–300%、每次 25% 的范围；支持滑块、加减和适合宽度。先准备，只有“应用缩放”才改变阅读；返回保留本次 PDF 未应用值、选择层浏览位置与可恢复焦点。成功应用后下一次使用实际缩放；关闭 PDF 后清除准备。应用当前缩放不重绘或移动阅读。
- 设置覆盖时背景控件隐藏且不可操作，阅读视口维持挂载与原尺寸。取消时页、缩放、横纵位置保持原样；实际应用沿用原锚点／旋转／连续阅读与画布预算逻辑，不改原 PDF。
- 深色使用整行可点的原生开关，标签稳定，状态由控件语义表达；改变后留在设置，原版纸张不反色。文档尚未读出、密码输入或读取失败时保留原外观快捷键，避免因设置入口依赖已打开文档而失去外观操作。
- 页面文字状态保留外观操作，显示具体的原版页面返回动作，禁用不适用的方式／方向／缩放；不靠灰色控件让用户猜原因。
- 批注入口沿用原组件的 Teleport 和 opener 引用，只新增紧凑呈现参数并移到单行底栏。保存／关闭后焦点回到实际入口；批注存储、正文和草稿算法未改。进入设置前继续保护评论输入，保护失败不离开。
- 设置不清掉查找命中页的返回关系，也不丢独立页码输入。返回按选择层 → 设置 → 阅读 → 原结果列表逐层处理；真正的显示修改才更新既有阅读记录。书签／批注编辑、密码和权限完整任务重设计继续后续阶段。

实现集中在新增 MobilePdfSettings.vue、PDF 宿主与帮助文案，以及批注入口的呈现参数。共享 MobileApp.vue、全局样式、存储层、PDF 解析／手势／方向模型、连续阅读组件、书签、页码与查找组件及依赖均未修改。旧专项改为走真实设置入口再使用缩放／外观，原有断言与组数保留。

## 实页核对与修复

[八屏并排与适配原图](evidence/mobile-pdf-settings-task-2026-10-28/comparison.html)收录 14 张最终原图，均已查看。[量测](evidence/mobile-pdf-settings-task-2026-10-28/comparison.json)的 340 项坐标属性最大偏差 0px，300 项字体属性一致。保留真实焦点：文字阅读和深色状态里的开关焦点环来自实际操作恢复，不为贴图模糊或清空；不宣称整屏逐像素相同。

标准 390×872 只裁掉真实 28px 桥接提示条，得到 390×844。320px／200% 提示条自然换行为 73px，346px 高度的实际工作区为 273px。短屏固定标题与取消／应用动作，正文可实际滚动，不能同时显示所有控件；没有通过裁掉正式内容、移动或补画截图来对齐。

实际修复保留了原始报告和相关原图：

- [设置名称失败](evidence/mobile-pdf-settings-task-2026-10-28/label-failure-report.json)：自定义名称没有完整包含可见当前值，改为由可见文字生成名称。开关改用原生 checkbox/switch 与稳定标签，不把可变状态塞进名称。[原生命中失败](evidence/mobile-pdf-settings-task-2026-10-28/switch-hit-failure-report.json)还发现装饰圆点遮挡输入命中区域，修正装饰层 pointer-events 与输入层级，未强制点击绕过问题。
- 标题字距实际继承为 0.1px，与冻结稿 normal 不符，正式选择层补齐字距；冻结图未改。
- [七组已通过版本](evidence/mobile-pdf-settings-task-2026-10-28/before-responsive-fix-report.json)的[320px／200% 缩放](evidence/mobile-pdf-settings-task-2026-10-28/before-responsive-fix-zoom-320-200.png)仍把四字动作换行。看图后，普通高度窄屏改为上下动作，短屏恢复紧凑并排；最终另外断言动作文字单行，并保留实际滚动截图。
- [导航待复核诊断](evidence/mobile-pdf-settings-task-2026-10-28/background-paper-failure-report.json)：工作区 visibility 为 hidden，原版 pdf-paper 却被行内 visible 覆盖，仍在覆盖任务后绘制；错误色实际为 rgb(161,62,50)，扫描因重叠无法判断背景。现在完整任务明确隐藏原版画布，维持布局尺寸；没有改错误色或放宽断言，最终导航七组通过且无待复核项。

两个测试等待假设也已纠正并保留失败报告：[连续阅读](evidence/mobile-pdf-settings-task-2026-10-28/continuous-wait-failure-report.json)存储的页号表示顶部锚点，可能不同于当前可见页，改为核对真实页码控件；[文字模式](evidence/mobile-pdf-settings-task-2026-10-28/text-mode-wait-failure-report.json)应等待当前文字文章，而不是已替换的原版 textLayer。没有修改引擎／数据去迎合断言。保存批注后等待实际卡片出现再核对关闭焦点，避免把未完成写入当成成功。

## 验证与下一项

- 最终 `npm run build:mobile` 类型检查与构建通过，保留既有包体积提示。资源 `mobile-_aTKcyY_.js`、`mobile-Cn9fiqq1.css`；PDF 核心 `pdf-D9v26WHW.js` 和工作线程 `pdf.worker.min-CLrFZWeq.mjs` 不变。初次迁移有未使用／重复导入的类型错误，修正后才进入候选验证；最终构建后未再改运行时代码。
- `node --test scripts/test-mobile-pdf-orientation.mjs scripts/test-mobile-pdf-gestures.mjs`：既有十二项通过，覆盖四方向坐标、批注矩形反算、裁切文字层、锚点、双指几何、缩放与阅读记录边界。引擎及这些测试未改，没有新增镜像实现单测。
- [设置专项](evidence/mobile-pdf-settings-task-2026-10-28/browser-report.json)：最终七组通过。包括层级返回／帮助／焦点、未应用 175% 保留、100%–300% 边界、相同值不重绘、模式／方向／缩放重开恢复、四方向真实文字与批注、文字模式、深色、草稿保护失败、窄屏大字／短屏／实际滚动、结果返回及页码输入。取消前后阅读纵向 96px、横向 45px、视口 390×631 相同。
- 真实混合方向 PDF 的六个墨迹样本均与文字层重合；四方向及连续模式的批注覆盖另断言误差小于 3px，连续画布保持最多八个区域与 1600 万像素预算。原 PDF 字节和原有笔记／草稿保持原样。
- 设置专项十三个命名状态的 axe A/AA 无违规或待复核，范围明确为应用界面；排除 aria-hidden 的 PDF.js 透明选文层。[首次原文扫描](evidence/mobile-pdf-settings-task-2026-10-28/original-pdf-axe-incomplete-report.json)的待复核记录保留。原 PDF 内容另由实际画布、墨迹／文字／批注对齐和原图检查，不宣称任意 PDF 的对比度通过，也不把 axe 当成 TalkBack。
- 同一最终构建的[页码六组](evidence/mobile-pdf-settings-task-2026-10-28/page-task-report.json)、[导航七组](evidence/mobile-pdf-settings-task-2026-10-28/navigation-task-report.json)、[查找七组](evidence/mobile-pdf-settings-task-2026-10-28/search-task-report.json)、[帮助十四组](evidence/mobile-pdf-settings-task-2026-10-28/help-report.json)均通过。没有重跑全部历史专项。

复查先 npm run build:mobile，再用 Vite preview 提供本机 9012。LONGEDIT_PLAYWRIGHT_MODULE 指向本机 Playwright 后运行 npm run test:mobile-pdf-settings-task-browser。设计服务 9027，证据服务 9026，均只监听本机；Vite HTML 已与 dist/mobile.html 字节核对一致。[源码与构建](evidence/mobile-pdf-settings-task-2026-10-28/build-provenance.json)、[原图映射](evidence/mobile-pdf-settings-task-2026-10-28/original-copy-map.json)和[摘要清单](evidence/mobile-pdf-settings-task-2026-10-28/manifest.json)记录实际来源、三个冻结版本、修复与提交字节。

下一项阶段 4D1 先处理书签操作菜单／命名／删除与返回，再处理批注编辑。Android 物理返回、真实输入法、TalkBack、后台和进程恢复仍待原生验收；浏览器桥接不代替实机。本轮仅本地提交，没有推送，没有构建／安装／提升 APK，没有发布。
