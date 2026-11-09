# 移动端：图片不可用、取消与同任务重试

2026-10-28，阶段5C5，起点 `d4b0180df`，沿用 `codex/mobile-0.1.0-foundation`。按[一次推进一个用户任务的规则](Development_User_Task_Plan_2026-09-22.md)，本轮处理“图片读不到时继续核对，或重新选择后回到原笔记”。仅修改移动工作树，未写入桌面目录，仅本地提交。

## 观察与竞品

[改前正式App实测](evidence/mobile-image-unavailable-2026-10-28/before-v2/report.json)确认：图片读取失败时仍占用224px空预览区，底部保留不能使用的插入动作；恢复副本不可读时还提供写入重试，详情没有重新选择入口。短屏顶部返回实际保持在y=0，不能将本轮问题说成顶部返回完全不可达；问题在于恢复动作分散在滚动内容和页尾，短屏页尾仍可能被截断。

本轮阅读官方资料，未安装或录制竞品。[Bear附件说明](https://bear.app/faq/insert-attachments/)提供iOS编辑键盘里的相机／附件入口，图片有内容预览；[Joplin附件说明](https://joplinapp.org/help/apps/attachments/)区分始终下载、点击下载和打开笔记时下载。采用上下文内添加、区分内容是否可用与正文编辑的思路；具体失败分支、重新选择和返回保留是本项目设计判断，官方资料没有证明其采用同样的重试界面。见[调研来源与边界](evidence/mobile-image-unavailable-2026-10-28/research-sources.json)。

## 当前操作

| 当前状态 | 用户可执行的动作 | 保留与返回 |
| --- | --- | --- |
| 图片无法读取 | 底部固定“重新读取图片”；当前可写笔记另有“重新选择图片” | 重读沿用原记录，不提供无效插入或写入重试 |
| 取消重新选择 | 留在原详情，显示取消状态 | 原错误、记录、图片说明、说明选区和选择按钮焦点保留 |
| 成功重新选择 | 显示新图片，仍需明确确认插入／替换 | 新记录与旧记录分别保留；一次返回直接回原历史或原添加任务，不叠加相同详情 |
| 恢复副本可读取，写入未确认 | 可预览，在原笔记位置重试导入 | 失败保留完整恢复副本；成功保留同一编号和较早尝试位置，仍不自动更新草稿 |
| 设置中的图片不可用 | 只核对原笔记的图片、重新读取 | 显示原资料库和笔记，不把其他文档推断成插入目标；重新选图需回原笔记 |
| 确认前图片丢失或变化 | 再次读取并核对，失败停止确认 | 原草稿继续保留；变化时展示当前图片，要求重新确认 |

不可用预览区缩为96px图标，实际错误、文件身份与正文未改动状态继续显示。顶部和页尾固定，仅内容区域滚动；沿用原来的图片添加、引用、替换和历史分层。重新选择成功立即更新本次历史列表，沿用原来最近25条的展示上限。未变化的深历史返回保留非零滚动和原行焦点。

一般规则补入问号，不新增常驻说明段落。取消、失败、来源身份和未确认状态是当前决策信息，仍就地显示。设置、普通添加和指定引用修复各自保留实际来源。重新选择会保留独立图片副本，取消核对不会删除它；只有明确确认才改变草稿，仍需保存正文。指定引用替换只改选中一处，同地址的另一处和周围文字继续保留，撤销恢复原稿。

原生选择回复为空时，等繁忙状态结束、按钮恢复可用后再恢复原焦点；读取、选择或核对等待中消费重复Back并禁止重复动作。浏览器和注入的原生分支共用空回复处理。实际Android选择器仍需另外验证。

## 冻结设计与实页核对

修改业务代码前冻结[11状态v1](evidence/mobile-image-unavailable-2026-10-28/design-freeze-v1.json)，复用正式Vue组件、字体、图标和问号，保存交互原型、HTML和未加工PNG。首次类型检查提示选图接口可能返回空，不能将其直接当作图片；在生产修复前冻结[v2](evidence/mobile-image-unavailable-2026-10-28/design-freeze-v2.json)，统一空回复处理并同步新记录到历史。v2的11张PNG与v1逐字节相同；测量改用可见折叠标题，不把关闭状态下的动态文件路径当作页面文案。

实测还发现，浏览器预览中缺失恢复副本被报成“文件名或位置无效”。修正前冻结[v3](evidence/mobile-image-unavailable-2026-10-28/design-freeze-v3.json)，明确为“图片恢复数据不可读，请重新选择原图”。v3其余10张图与v2相同。正式组件与v3仅模块路径不同，见[原型／源码核对](evidence/mobile-image-unavailable-2026-10-28/prototype-runtime-match.json)。父页面另修正动态弹层名称，使读屏名称跟随图片子页可见标题。

[设计／实页对照](evidence/mobile-image-unavailable-2026-10-28/comparison.html)包含11对状态及短屏真实键盘焦点、深历史。最终13张实页均已查看：12张与已逐张审阅的上一候选逐字节相同，1张真实Tab焦点图另行审阅，见[原图复核记录](evidence/mobile-image-unavailable-2026-10-28/visual-review-reuse.json)。[544项坐标／尺寸及字号、行高、颜色、可见名称](evidence/mobile-image-unavailable-2026-10-28/visual-comparison.json)测量差为0。

不声明像素完全相同。实际窄屏图保留键盘Tab留下的按钮焦点，短屏图保留内容区域的可见轮廓；没有隐藏焦点、改字体或加工截图。图片是项目原有320×200真实夹具，显示原始像素，不以占位框代替图片解码。320px、200%大字和346px高视口仅为浏览器模拟，完整内容仍需滚动，不能据此宣布Android输入法验收通过。

## 验证和保留问题

最终 `npm run build:mobile`通过，保留既有大包体警告。`mobile-B_MBIBJx.js`、`mobile-Dcw360uA.css`已与9012服务逐字节核对，源码、冻结原型和PNG摘要见[来源记录](evidence/mobile-image-unavailable-2026-10-28/provenance.json)。

| 验证 | 结果 |
| --- | --- |
| [图片异常正式App专项](evidence/mobile-image-unavailable-2026-10-28/browser-report.json) | 8组：同记录重读、取消、来源恢复／确认前丢失、独立重新选择、窄屏／短屏与真实键盘焦点、私有副本失败／成功重试、设置与指定引用替换、深历史返回。5次Host UI扫描无违规、无未决。 |
| [既有图片任务](evidence/mobile-image-unavailable-2026-10-28/image-layers-report.json) | 12组：五层返回、忙碌保护、说明和插入位置、读失败与图片变化、确认、撤销、长历史、短屏、重复引用、重试及设置来源。 |
| [附件回归](evidence/mobile-image-unavailable-2026-10-28/attachments-report.json) | 7组：PNG／JPEG／WebP、字节与像素上限、恢复副本、重启、跨库图片搬迁、显式纯文字退路、只读来源与历史。 |
| [延迟选择回复](evidence/mobile-image-unavailable-2026-10-28/picker-replies-report.json) | 3组：取消回复恢复原错误／焦点、失败回复保留原记录及同编号重读、成功选择更新历史并返回真实父层。直接编译生产组件，非Android IPC。 |
| [附件逻辑](evidence/mobile-image-unavailable-2026-10-28/attachment-logic-summary.json) | 7项：引用定位、复杂块退路、转义及路径、跨库副本、损坏／容量保护、图片头边界、真实CodeMirror选区与撤销。摘要如实转录本轮执行结果。 |

合计27组浏览器、3组延迟回复组件、7项逻辑验证。旧脚本只更新已变化的页面名称、不可用动作状态、当前库最近范围、与文件一致状态及文档返回入口；原始内容、回执、图片字节、恢复、复制和只读断言保留。

保留的实际修正与验证缺口：

- [首个构建失败](evidence/mobile-image-unavailable-2026-10-28/first-build-failure.json)：空选择回复的类型契约，已统一处理。
- [弹层名称不跟随子页](evidence/mobile-image-unavailable-2026-10-28/first-failure-stale-dialog-label.json)：图片内容变化后仍停在核对页，错误在可访问名称滞后，已修正父层名称。
- [恢复错误原图](evidence/mobile-image-unavailable-2026-10-28/before-misleading-recovery-error.png)：仅给浏览器预览适配器增加一条缺失恢复副本判断，原生写入及重试机制未改。
- [首轮焦点证据不足](evidence/mobile-image-unavailable-2026-10-28/before-insufficient-keyboard-focus.png)：程序聚焦不能证明键盘可见轮廓，现改为真实Tab、活动元素和`:focus-visible`断言，保留首轮报告。
- [基线断言](evidence/mobile-image-unavailable-2026-10-28/before/first-setup-failure.json)原先误期望LF；编辑器正确保留原文CRLF，旧图保留，修正期望后另存before-v2。新专项的[未先回根页](evidence/mobile-image-unavailable-2026-10-28/first-failure-root-navigation-setup.json)、[未选择继续草稿](evidence/mobile-image-unavailable-2026-10-28/first-failure-resume-draft-setup.json)及[未限定同名元素](evidence/mobile-image-unavailable-2026-10-28/first-failure-unscoped-record-name.json)均为测试入口问题，已按可见操作修正。
- 旧附件专项仍使用[旧撤销状态](evidence/mobile-image-unavailable-2026-10-28/first-failure-old-undo-status.json)、[跨库最近假设](evidence/mobile-image-unavailable-2026-10-28/first-failure-old-library-scope.json)和[固定返回名称](evidence/mobile-image-unavailable-2026-10-28/first-failure-old-document-return.json)，现按现行交互进入，不归因为本轮附件数据失败。

`imageFile`、引用定位、`taskPosition`、文字／附件包导入和Android存储源码均未改变。浏览器存储适配器除上述一条错误判断外与基线一致；图片写入、恢复字节、目标分配和较早路径保护继续复用。

本轮未生成APK、推送或发布。Android真实选择器、URI授权、SAF、系统／预测性返回、IME、TalkBack与后台恢复仍待真机验收，阶段5整体不标完成。下一项5D先审计恢复记录的读取失败、来源不可用与同任务重试，只修实际断点。
