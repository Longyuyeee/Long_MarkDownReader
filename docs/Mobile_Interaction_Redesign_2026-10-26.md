# 移动端全量交互重设计记录

后续进展：[正式源码交互复核与说明清理](Mobile_Interaction_Polish_2026-10-26.md)。已落地触屏问号、首页添加菜单和部分返回修正，另附正式实页截图；本文保留最初设计阶段的记录。

本轮按用户要求重新梳理现有移动端全部界面：减少首页和阅读页的常驻操作，把持续输入与核对任务移到二级页面，统一弹层、系统返回、来源状态和草稿保护。

完成范围为设计方案与独立可操作原型。现有36个Vue界面组件均已登记新去向，原型包含55个页面，另有添加、更多、单项选择与确认弹层。正式App尚未全量替换，本轮没有新APK。

## 可审阅结果

- [可点按原型](design/mobile-interaction-v2/prototype/index.html)：示例数据，支持模拟返回、收到分享、外部打开、保存失败与深色预览；源码示例格式在原型外的审阅工具中切换。
- [完整方案与竞品依据](design/mobile-interaction-v2/interaction-spec.md)：Obsidian、Notion、Acrobat、Android与Material官方资料及本项目的设计决定。
- [55页实际截图](design/mobile-interaction-v2/validation/gallery.html)：页面目录可直接进入对应原型。
- [返回清单](design/mobile-interaction-v2/back-behavior.md)、[36组件映射](design/mobile-interaction-v2/coverage.json)：实际进入历史优先，逐项记录状态保留和正式迁移要求。
- [首页设计对照](design/mobile-interaction-v2/validation/library-comparison/comparison.png)、[PDF阅读设计对照](design/mobile-interaction-v2/validation/reader-comparison/comparison.png)：原始生成图与实际原型等宽展示；原图、提示词、哈希均保留。
- [视觉核对与差异](design/mobile-interaction-v2/visual-review.md)：记录布局修正、字形与图标差异，以及六屏概念图未采用的错误标签和格式文案。

## 已验证

命令：`node scripts/test-mobile-interaction-design.mjs`。

最终37组检查通过，覆盖页面栈、键盘优先返回、来源历史、目录滚动、搜索返回、输入与光标、保存失败、导入取消、导出返回、批注编辑/删除/撤销、书签、结构预览、密码不持久化及按格式显示已有工具。55页分别经过基准、窄屏、短视口和200%界面文字检查，正文未发现横向溢出；保留55张基准截图、5种源码示例及浅/深色和异常截图。

最终证据：[result.json](design/mobile-interaction-v2/validation/result.json)。早期候选修正过草稿来源键、光标恢复和测试重载等待等问题，失败未计为通过；[候选记录](evidence/mobile-interaction-v2/candidate-history.json)保留摘要，重复原始截图留在本机候选目录。

系统键盘、Android返回分发和预测性手势、SAF授权、真实文件读写、PDF引擎和进程恢复尚未由本原型验证。正式接入时仍需运行现有逻辑与浏览器回归、原生UI验收和双ABI构建。1002048仍是上一份已验收开发包；[1002049权限工作检查点](Mobile_Interaction_Redesign_Checkpoint_2026-10-26.md)未升级为可发布结果。

## 后续实施

按完整方案的阶段表推进：先统一页面/临时层栈与草稿离开守卫，再替换资料/搜索/设置及接收，随后接阅读编辑与格式工具、PDF、附件导出与恢复，最后按真机截图复核并产出开发包。沿用现有格式引擎和存储服务，不在页面重设计中重写这些基础能力。

所有工作位于移动分支的独立worktree，桌面开发目录未修改。
