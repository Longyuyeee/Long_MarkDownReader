# 移动端：文字导入核对与完整预览

2026-10-28，阶段5C4，起点 `ca398d746`，沿用 `codex/mobile-0.1.0-foundation`。遵循[一次推进一个用户任务的规则](Development_User_Task_Plan_2026-09-22.md)，本轮完成“核对一份文字，再存入手机资料库”。仅修改移动工作树，桌面工作目录未写入，仅本地提交。

## 改前观察与竞品依据

[改前正式App测量](evidence/mobile-text-import-task-2026-10-28/before/report.json)确认：原页同时展开只读文字、存入、移除和连接文件夹。320px、200%大字滚到存入按钮时，640px高视口的页头位于y=-396；346px短视口位于y=-425.39。用户看过文字后，需要上滚才能返回，存入位置也未作为独立信息交代。

本轮阅读官方资料，未安装或录制竞品。[Bear导入说明](https://bear.app/faq/import-your-notes/)列出文字和Markdown导入，并将iOS导入放在侧栏菜单入口；[Obsidian手机端说明](https://obsidian.md/help/mobile)提供返回／前进，并把部分工具放进菜单。采用明确进入任务、按需展开内容、保持返回可达的思路。具体核对页、页尾动作、同目标重试及状态保持是本项目设计判断；这些资料没有证明竞品采用相同的导入重试界面。[来源记录](evidence/mobile-text-import-task-2026-10-28/research-sources.json)保留依据与边界。

## 现在的操作路径

| 当前页面 | 内容和动作 | 返回结果 |
| --- | --- | --- |
| 文件导入 | 历史、刷新，页尾选择文件／连接原文件夹 | 回真实的资料、最近、搜索或设置入口 |
| 核对文字 | 文件名、状态、大小、完整预览入口、手机资料库去向；底部存入／移除 | 普通入口回同一历史记录；接收入口回收到的内容 |
| 文字预览 | 完整只读文字；长文复用分段和全文查找 | 回核对页及原预览按钮；再次进入保留选区和滚动 |
| 选择资料库 | 复用已有文件夹子层 | 取消或选择后回原核对页，保留原文字与触发焦点 |
| 移除确认 | 保留现有短确认，说明未存入文字会被移除 | 取消回核对页及移除按钮；接收入口确认移除直接回收件列表 |

顶部返回与底部动作固定，只有内容区域滚动。预览按需挂载后保留同一节点；核对与预览分别保存位置、焦点，长文保留查找词、查询选区、未确认的跳段输入和片段内部滚动。历史保留已加载批次、非零滚动和选中记录。读取失败同编号重试；写入错误留在核对页，不串到预览。

“连接原文件夹”继续访问授权原件；导入副本仍明确存入手机资料库。两者关系放进问号，页面保留实际去向。通用说明不常驻，真实状态、错误和移除风险仍就地显示。存入可见文字缩为“存入手机资料库”，无障碍名称为“存入手机资料库并打开”，包含完整可见文字。

确认前不创建笔记。回执失败继续校验同一固定目标，重试不产生第二份；原始BOM、混合换行和完整内容保持，textarea按浏览器规则显示换行。原笔记、未保存草稿、内容摘要校验、容量上限及冲突拒绝继续复用。存储适配器、文字／附件包引擎、Android来源接收、`RecoverySource`、`SourceReader`和`taskPosition`均未修改，见[源码与服务核对](evidence/mobile-text-import-task-2026-10-28/provenance.json)。

## 设计冻结与实页核对

业务代码修改前冻结[11状态v1原型、HTML与PNG](evidence/mobile-text-import-task-2026-10-28/design-freeze-v1.json)。原型复用正式图标、问号、文件夹组件和字体。接入后旧回归发现浅色错误文字对比度不足：保留首次失败与v1，在应用颜色修正之前冻结[v2](evidence/mobile-text-import-task-2026-10-28/design-freeze-v2.json)，将本任务错误文字改为正文颜色，保留警示背景和边框。v2其余10张原图与v1逐字节相同。

正式组件以v2为底稿，仅适配模块路径，另补两处接收来源守卫：移除时不切换到全局历史，也不短暂显示“文件导入”标题。专项通过MutationObserver核对此路径。[原型与正式组件核对](evidence/mobile-text-import-task-2026-10-28/prototype-runtime-match.json)记录允许差异。

[设计／实页对照](evidence/mobile-text-import-task-2026-10-28/comparison.html)包含11对设计和正式页面，补充大字滚到底、键盘焦点、保存失败、深历史、普通长文字选区、全文查找、接收键盘与触摸入口。19张最终实页均已审阅：17张与逐张查看的首轮候选完全相同，2张错误颜色变化图另行查看，见[原图复核](evidence/mobile-text-import-task-2026-10-28/visual-review-reuse.json)。11状态[376项坐标／尺寸及字号、行高、颜色、名称](evidence/mobile-text-import-task-2026-10-28/visual-comparison.json)测量差为0。

测量一致不等于全部像素相同。接收键盘入口保留真实标题焦点框，原图也记录了上一层短暂的浏览器触摸蓝块；另存触摸入口原图，不通过隐藏焦点、修图或延迟抓图掩盖。确认层背景是不同合成资料。320px、200%大字和346px短屏保持返回与动作可见，完整文字仍需滚动；浏览器短视口不能代表真实Android输入法。

## 有效验证与保留失败

`npm run build:mobile`通过，保留既有大包体警告。最终 `mobile-BLtErwsz.js`、`mobile-B3AssWdo.css`与9012服务逐字节核对，冻结文件摘要及Git换行身份已核对。

| 验证 | 结果 |
| --- | --- |
| [正式App任务专项](evidence/mobile-text-import-task-2026-10-28/browser-report.json) | 8组：精简核对、完整预览及选区、文件夹与帮助、确认取消、大字／短屏与可见键盘焦点、读取／回执重试、历史批次、普通文字内部滚动、长文现场及接收返回。5个Host UI扫描无违规、无未决。 |
| [原文字导入](evidence/mobile-text-import-task-2026-10-28/text-import-report.json) | 12组：完整字节、显式存入、重启、同名副本、最新笔记、回执重试、编码／扩展名／字节上限、移除、冲突、损坏摘要、长文及容量。 |
| [读取重试](evidence/mobile-text-import-task-2026-10-28/read-retry-report.json) | 7组：空状态区分、旧列表、同编号恢复、取消、草稿保护、深历史与刚暂存记录。两处axe重叠未决保留，并单独核对。 |
| [混合接收](evidence/mobile-text-import-task-2026-10-28/incoming-report.json) | 14组：文字／PDF／包、晚到内容不替换预览、原编辑节点和草稿、错误确认、正文存入后打开失败及PDF返回。 |
| [任务分层](evidence/mobile-text-import-task-2026-10-28/task-layers-report.json) | 9组：确认、文件夹取消／选择／停止访问、帮助、历史、PDF与包、重复返回及存入后打开失败。 |
| [附件包共用框架](evidence/mobile-text-import-task-2026-10-28/pack-task-report.json) | 8组：正文／清单／图片、短屏返回、同目标重试、深列表和接收入口；附件包组件未修改。 |
| [延迟回复组件](evidence/mobile-text-import-task-2026-10-28/replies-report.json) | 3组：读取等待防重复并消费Back、注入选择器取消回复、接收来源列表与详情失败恢复。直接编译生产组件，非Android IPC。 |

合计58组浏览器验证、3组延迟回复组件验证。旧专项更新新预览入口、返回名称与步骤；原始字节、回执、冲突、草稿和容量断言保留。单次Back契约在专项逐层断言；通用关闭辅助用于退出整个已知任务，不能作为“单次返回”证据。

首次失败均保留：[浅色警示对比度](evidence/mobile-text-import-task-2026-10-28/first-failure-light-warning-contrast.json)是实际缺陷，已修正；[旧标题横坐标](evidence/mobile-text-import-task-2026-10-28/first-failure-old-header-metric.json)仍使用旧页56px，新任务设计为64px；[预览高度](evidence/mobile-text-import-task-2026-10-28/first-failure-rounded-preview-metric.json)原断言误写630px，实测与冻结设计均为631px，现断言允许1px取整范围，精确设计对齐另由专项测量检查。

读取重试回归的两处axe未决原样保留：旧列表错误段落与大字主按钮被自动工具判断可能重叠。实际原图已查看，计算样式的前景／背景对比度分别11.244和8.984，达到对应4.5和3要求，见[补查证据](evidence/mobile-text-import-task-2026-10-28/contrast-review.json)。这属于人工补查，未改写成自动扫描已解决。

Android系统／预测性返回、真实IME、选择器取消、SAF与来源授权、TalkBack和后台恢复仍需真机验收。本轮没有生成APK、推送或发布，阶段5整体不标完成。

下一项5C5先实测图片来源不可用、取消和同任务重试，再按观察到的断点冻结设计并开发。
