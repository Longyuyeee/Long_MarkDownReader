# 移动端：恢复记录读取失败与原地重试

2026-10-28，阶段5D1，起点 `4c9a3ab51`，沿用 `codex/mobile-0.1.0-foundation`。按[一次推进一个用户任务的规则](Development_User_Task_Plan_2026-09-22.md)，本轮处理“这份恢复记录暂时打不开，继续核对并回原处”。仅修改移动工作树，桌面目录未写入，仅本地提交。

## 改前观察与竞品

[正式App改前报告](evidence/mobile-recovery-read-2026-10-28/before/report.json)复现：首次详情失败仍显示恢复列表，“刷新”只调用列表接口；没有同编号详情重读入口；暂时不可读的摘要按钮被禁用。已经读到的完整版本及原文选择原本能够在刷新失败时保留，继续复用这项保护，不将其重复记为新增能力。

本轮查阅官方资料，未安装或录制竞品。[Notion恢复说明](https://www.notion.com/help/duplicate-delete-and-restore-content)明确iOS与Android可从侧栏菜单进入垃圾箱，打开已删除页面查看后再决定恢复；采用先辨认、再核对的顺序。[Joplin版本历史](https://joplinapp.org/help/apps/note_history/)明确文档中的历史查看仍限桌面，恢复会复制到独立文件夹且不替换当前笔记；只参考独立副本保护，不把它误称为手机端历史界面。具体重读入口、固定操作与返回保持是本项目设计判断，见[调研依据](evidence/mobile-recovery-read-2026-10-28/research-sources.json)。

## 当前行为

| 状态 | 用户看到与可做的事 | 保留内容 |
| --- | --- | --- |
| 列表初次失败 | 明确读取失败，底部“重新读取恢复记录” | 不伪装成空列表，不写入或删除记录 |
| 列表刷新失败 | 保留上次列表，说明尚未刷新，底部可重读 | 原列表、选中行和返回位置 |
| 首次详情失败 | 保留摘要中的文件名、资料库与时间；仍是这次核对，底部原地重读 | 同一记录编号，不虚构正文或显示另存动作 |
| 不可读摘要 | 仍可点开；未知用途使用“核对恢复记录” | 不猜测它一定来自保存或导出，不删除记录 |
| 已读版本刷新失败 | 保留完整版本，标明是上次读到的内容，固定重读入口 | 当前原文／草稿选择、只读节点、选区；长文的查询、待确认跳段与内部滚动 |
| 重读成功 | 清除这次读取错误，显示真实身份与内容 | 不刷新整个列表来替代详情读取，不自动另存或打开文档 |

设置入口与原文／导出入口复用恢复组件。顶部返回与失败重试保持可达，只滚动内容；返回先退详情，再回列表，最后回真实来源。未变化的深列表保留精确滚动和行焦点。版本选择只在当前恢复任务内记忆，完全退出再进入不承诺继续保留该选择。

列表错误、详情读取错误与另存／导出结果分别归属当前任务。进入某条记录不会把列表刷新错误带成详情错误，回列表仍能继续处理原列表失败。读取等待时保留重试按钮并禁用，重复Back不离开当前任务。

恢复记录是本机已保护内容。来源文件夹不可用时，读取已有完整版本不要求重新授权，也不读取原件代替恢复内容。首次失败没有内容就不提供另存动作；已读完整版本、独立副本、同任务打开已存副本和导出恢复记录继续复用既有保护。原文、草稿、BOM、混合换行和恢复记录均未被读取操作改写。

列表更新只存摘要字段，避免退出详情后在列表缓存里继续保留多份长正文。常规说明仍在问号，本轮仅新增真实读取失败、旧列表／版本和重试状态，没有添加常驻操作教程。

## 设计冻结与实页核对

修改业务源码前冻结[12状态v1](evidence/mobile-recovery-read-2026-10-28/design-freeze-v1.json)，使用仓库原生Vue原型、正式字体、图标与帮助组件，保存HTML和未加工PNG。审图发现不可读摘要可能缺少用途，不能一律叫“核对这次保存”；生产接入前补冻[v2](evidence/mobile-recovery-read-2026-10-28/design-freeze-v2.json)。除中性标题外，其余11张PNG与v1逐字节相同。

正式组件从v2适配模块路径，去掉两项未使用的脚本绑定／Vue静态ref，并将列表缓存更新限定为摘要字段；这些差异在[原型与源码核对](evidence/mobile-recovery-read-2026-10-28/prototype-runtime-match.json)逐项验证。父弹层名称跟随实际子页，设置中的恢复页使用相同的整页布局。

[设计／实页对照](evidence/mobile-recovery-read-2026-10-28/comparison.html)包含12对状态，以及真实Tab焦点、完整长文失败与深历史。最终15张原图均已核对，并与已经逐张查看的上一候选逐字节相同，见[原图复核记录](evidence/mobile-recovery-read-2026-10-28/visual-review-reuse.json)。[508项坐标／尺寸及字号、行高、颜色与名称](evidence/mobile-recovery-read-2026-10-28/visual-comparison.json)测量差为0。

没有隐藏真实焦点、缩小字体或加工截图。320px、200%文字和346px短视口保留返回及重试；完整文件身份和长文仍需滚动。键盘进入时保留标题／内容区域轮廓，不将测量对齐扩大成全部像素一致，也不把浏览器短视口当成Android真实IME。

## 验证与保留的失败

最终 `npm run build:mobile`通过，保留既有大包体警告。`mobile-7LONdjkA.js`、`mobile-Bd_Il4ub.css`与9012服务逐字节核对，源码和冻结摘要见[来源记录](evidence/mobile-recovery-read-2026-10-28/provenance.json)。

| 验证 | 结果 |
| --- | --- |
| [正式App读取专项](evidence/mobile-recovery-read-2026-10-28/browser-report.json) | 8组：列表失败／旧列表、同编号详情读取、缓存原文与选区、未知摘要恢复、短屏与真实键盘焦点、导出用途、长文现场和深历史。5次Host UI扫描无违规，其中一处标题对比度自动判定未决另补查。 |
| [原恢复任务](evidence/mobile-recovery-read-2026-10-28/recovery-layers-report.json) | 9组：保存／导出真实父任务、撤销重做、版本、帮助、深列表、完整恢复导出、繁忙Back、写入后打开失败和同一副本重试。 |
| [写入恢复](evidence/mobile-recovery-read-2026-10-28/write-recovery-report.json) | 6组：空间不足、模拟部分写入、重启草稿、完整原文／草稿、长内容、独立另存失败重试和导出完整字节。 |
| [延迟回复组件](evidence/mobile-recovery-read-2026-10-28/replies-report.json) | 3组：列表等待防重复／消费Back、同编号详情重试与已读版本、未知用途恢复成真实导出任务。直接编译生产组件，不是Android IPC。 |

合计23组浏览器、3组延迟回复组件验证。原脚本保留数据、版本、完整字节与草稿保护断言；只将滚动检查移到实际内容区，并按当前库范围和真实文档返回名称更新入口。

短屏大字标题被axe报为可能重叠，不能自动判断背景。已查看[原始短屏图](evidence/mobile-recovery-read-2026-10-28/actual-short-failure.png)，并按实际计算样式核对：34px文字，前景`rgb(224,232,219)`、背景`rgb(32,39,34)`，对比度12.173，高于大字要求3。原始未决结果保留，[补查](evidence/mobile-recovery-read-2026-10-28/contrast-review.json)不冒充自动扫描已解决。

首次问题保留：

- [类型检查失败](evidence/mobile-recovery-read-2026-10-28/first-build-failure.json)：两个未使用绑定，已清理；类型检查停止前不声称候选可运行。
- [任务寿命假设错误](evidence/mobile-recovery-read-2026-10-28/first-failure-task-lifetime-assumption.json)：测试曾期望完全退出后仍记住版本；现改为在同一任务内验证真实约定，不扩大持久化承诺。
- 旧写入脚本的[跨库最近入口](evidence/mobile-recovery-read-2026-10-28/first-failure-old-global-recent.json)和[固定返回名称](evidence/mobile-recovery-read-2026-10-28/first-failure-old-return-label.json)已经过时，现通过可见资料库选择和实际返回按钮进入。
- [证据收集路径错误](evidence/mobile-recovery-read-2026-10-28/first-finalizer-attempt/failure.json)保留局部复制结果；收集器已先检查所有输入，未覆盖冻结设计或修改测试结论。

存储适配器、Android恢复／写入、`RecoverySource`、`SourceReader`、原导出和图片流程均未修改。本轮不生成APK、不推送、不发布。真实系统／预测性返回、IME、来源授权、SAF、TalkBack及后台恢复仍需Android验收，阶段5整体未完成。

下一项5D2收整恢复核对页的完整预览、版本选择与另存／导出分层，复用当前读取重试和副本保护。
