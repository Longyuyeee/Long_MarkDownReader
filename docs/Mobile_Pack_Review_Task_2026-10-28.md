# 移动端：附件包核对任务分层与固定返回

2026-10-28，阶段5C3，起点 `80139a8b7`，沿用 `codex/mobile-0.1.0-foundation`。按照[一次推进一个用户任务的规则](Development_User_Task_Plan_2026-09-22.md)，本轮完成“核对一份附件包，再存入手机资料库”。仅修改移动工作树，桌面目录未写入；仅本地提交。

## 改前观察与竞品

[正式构建的改前测量](evidence/mobile-pack-review-task-2026-10-28/before/report.json)复现：首页同时摊开正文、附件清单、图片及全部操作，普通390×844视口的存入按钮底部已超出视口。320px、200%大字滚到存入操作时，页头在640px高视口中位于y=-1152；346px短视口中位于y=-1181.39。用户需要上滚很长距离才能触达顶部返回。

本轮查阅官方资料，未安装或录制竞品。[Bear附件说明](https://bear.app/faq/working-with-photos-gifs-pdfs-and-other-attachments/)将阅读PDF、图片调整等操作放在点击或上下文入口中；[Obsidian手机端说明](https://obsidian.md/help/mobile)提供返回／前进，并把部分操作收在菜单入口。取其按需进入内容任务、保持导航可触达的思路；具体附件包首页、页尾动作与现场保存属于本项目设计判断，不声称竞品使用同样的导入流程。[调研来源](evidence/mobile-pack-review-task-2026-10-28/research-sources.json)记录了依据及边界。

## 现在的操作路径

| 当前页面 | 展示与操作 | 返回去向 |
| --- | --- | --- |
| 导入记录 | 历史列表、刷新，底部选择附件包 | 原设置／资料入口 |
| 核对附件包 | 完整文件身份、状态、正文入口、附件清单入口、存入位置；底部明确存入及移除记录 | 普通入口回同一历史记录；接收入口回收到的内容 |
| 正文预览 | 完整只读正文，长文继续使用现有分段与查找 | 回核对页，恢复原触发按钮与位置 |
| 附件清单 | 完整路径、大小、图片尺寸；图片可进入预览，其他类型仅显示真实信息 | 回核对页 |
| 包内图片 | 独立图片、完整路径、尺寸与大小 | 先回清单，恢复原图片按钮和清单滚动 |
| 移除确认 | 保留现有短确认与数据影响提示 | 取消先回核对页及原移除按钮 |

顶部返回和页尾操作固定，只有任务内容区域滚动，接收入口复用同一任务。短屏也保留正常字号，不靠缩字塞满。正文和长文组件保留挂载；各层分别记住滚动、触发焦点，返回保留正文选区、长文查询／分段／内部滚动。附件以完整路径区分同名图片。存入失败的错误归属核对页，打开正文不会把写入错误带成正文错误，回核对页仍可继续重试。

原有读取失败、同编号重读、忙碌时防重复和返回保护继续保留。确认之前不发布笔记或附件；写入后回执失败继续核对同一目标，不创建第二份。正文BOM、混合换行和附件字节保留，页面输入框按浏览器规则显示换行。原文、草稿、存储适配器、ZIP安全校验、固定目标、原子发布和回执机制没有修改。Android实现、`RecoverySource`、`SourceReader`、`taskPosition`及纯文字导入组件也均未修改，见[来源核对](evidence/mobile-pack-review-task-2026-10-28/provenance.json)。

没有新增常驻说明段落；通用规则继续放在问号。状态、去向、实际错误和移除风险保留。存入按钮的可见名称缩为“存入手机资料库”，无障碍名称仍明确正文与附件一起存入，包含完整可见名称。

## 先冻结设计，再接入与核对

先在仓库设计目录制作可交互Vue原型，存储使用合成回复，覆盖10个状态并保存HTML及原始PNG。第一版的模拟父层漏掉确认居中类，问号也未完全复用现有组件；保留[v1](evidence/mobile-pack-review-task-2026-10-28/design-freeze-v1.json)，修改业务代码前冻结[v2](evidence/mobile-pack-review-task-2026-10-28/design-freeze-v2.json)。没有覆盖旧图。

正式组件以v2为底稿接入模块路径，补上键盘focus-visible轮廓；[原型与正式组件核对](evidence/mobile-pack-review-task-2026-10-28/prototype-runtime-match.json)可复核这两类差异。父页面接入动态标题、真实返回名称和完整任务容器；接收中心转发当前子页状态。在实页核对中发现接收入口确认弹窗被重复加了16px内边距，保留[改前原图](evidence/mobile-pack-review-task-2026-10-28/before-source-confirmation-inset.png)，再修正父层适配。

[设计／实页对照](evidence/mobile-pack-review-task-2026-10-28/comparison.html)包含10对设计及正式页面，并保留短屏滚到底、键盘焦点、保存失败、长文、深附件清单和接收入口等补充状态。18张最终实页已核对：16张与已经逐张查看的候选原图逐字节一致，另2张深列表和键盘焦点图单独查看，见[原图复核记录](evidence/mobile-pack-review-task-2026-10-28/visual-review-reuse.json)。10状态的[328项坐标及字号／行高／颜色／名称测量](evidence/mobile-pack-review-task-2026-10-28/visual-comparison.json)最大坐标差为0。确认弹窗的背景使用不同合成资料，仅核对确认层，不宣称背景像素一致。

原图没有人为模糊、隐藏真实焦点、缩小字体或图像加工。小图样本是实际解码的1×1位图，尺寸和字节如实显示，不把空白框当作照片效果验收。短屏内容仍需滚动才能读完完整文件名和正文，这是物理视口限制；返回与操作保持可见。346px只是浏览器短视口模拟，不代表真实系统键盘已验收。

## 有效验证与保留的失败

`npm run build:mobile`最终通过，保留已有大包体警告。最终资源 `mobile-DzKcJgoV.js`、`mobile-CAl-c-P7.css`已与9012服务逐字节核对，原型及PNG冻结摘要也已核对。

| 验证 | 结果 |
| --- | --- |
| [新的正式App任务专项](evidence/mobile-pack-review-task-2026-10-28/browser-report.json) | 8组：精简首页、正文只读与选区、帮助／图片／移除逐层返回、短屏固定操作及可见键盘焦点、读取及回执失败、历史非零滚动、长文查找与真正深清单、接收入口返回。4次Host UI扫描无违规、无未决。 |
| [附件包完整回归](evidence/mobile-pack-review-task-2026-10-28/pack-import-report.json) | 10组：整包字节、独立存入、导出往返、同名包、最新内容、回执失败、损坏及不安全包、冲突和容量边界。 |
| [接收中心回归](evidence/mobile-pack-review-task-2026-10-28/incoming-report.json) | 14组：混合接收、草稿保护、包内多层返回、原文及完整包保持，相关子页按现行导航进入。 |
| [读取重试回归](evidence/mobile-pack-review-task-2026-10-28/read-retry-report.json) | 7组：列表／详情失败、暂存字节缺失、同编号重试、取消、深历史及刚选择包后的读取失败。 |
| [任务分层回归](evidence/mobile-pack-review-task-2026-10-28/task-layers-report.json) | 9组：同时覆盖未改动文字导入、文件夹子层、PDF、附件包及写入后打开失败的返回保护。 |
| [延迟回复组件回归](evidence/mobile-pack-review-task-2026-10-28/replies-report.json) | 4组：忙碌时消费Back及禁重复、异常／返回失败详情、注入选择器取消回复、接收详情恢复与格式错误区分。生产组件直接编译，非Android IPC。 |

合计48组浏览器验证、4组延迟回复组件验证。旧专项仅更新页面入口、名称和返回步骤，原始字节、目标冲突、回执、草稿与容量断言继续保留。

首次问题没有隐藏：[新专项未限定当前弹层](evidence/mobile-pack-review-task-2026-10-28/first-failure-unscoped-return-selector.json)同时命中两个返回名称，限定任务后通过；[旧接收专项初始化仍等待内联正文](evidence/mobile-pack-review-task-2026-10-28/first-failure-old-inline-preview-setup.json)按新路径进入正文、逐层退出后14组通过。实页补查还发现[原同名图片夹具停在首屏](evidence/mobile-pack-review-task-2026-10-28/before-insufficient-deep-fixture.png)，不构成深列表证据；保留原报告，独立Python夹具改为把同名图片排在18份资料后，并新增非零滚动断言后通过。最终样本为23附件、2050余行正文，保留1×1图片原始字节，没有绕过包上限。

原生系统／预测返回、SAF与真实来源授权、系统选择器、输入法、TalkBack及进后台恢复仍需Android验收；没有生成APK、推送或发布。纯文字导入页尚未随本轮改成相同任务结构，不将导入整体标记完成。

下一项5C4审计并收整纯文字导入的核对／预览／固定返回，再继续图片来源不可用与重试断点。
