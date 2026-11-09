# 移动端：文字导入记录读取失败后继续原任务

2026-10-28，阶段5C1，起点 `af65ae76b`。沿用 `codex/mobile-0.1.0-foundation`，按[一个用户任务的开发规则](Development_User_Task_Plan_2026-09-22.md)处理“读不到导入记录，继续读取同一份文字”。仅修改移动工作树，未写入桌面目录；本轮仅本地提交。

## 实页问题与竞品依据

[改前报告](evidence/mobile-import-read-retry-2026-10-28/before-report.json)在正式构建、合成资料和浏览器存储读取故障下复现三个断点：首次列表读取失败仍显示“暂无导入记录”；刷新成功后旧错误继续存在；普通详情读取失败没有原地重试入口。已有导入、返回、完整内容核对和受保护写入继续复用，不重建存储流程。

本轮浏览了官方资料，未安装或录制竞品：[Notion 导入说明](https://www.notion.com/help/import-data-into-notion)明确导入支持桌面和网页，尚不支持手机，因此不能把它的桌面导入状态页当成手机重试交互证据。[Joplin 附件说明](https://joplinapp.org/help/apps/attachments/)区分始终下载、手动下载和打开笔记时下载；附件链接存在与内容当前可用是不同状态。本项目据此区分记录读取失败、原有导入失败和空列表；具体按钮及风险文案属于本项目设计判断。详见[调研来源](evidence/mobile-import-read-retry-2026-10-28/research-sources.json)。

## 接入行为

- 列表读取失败就地显示错误，不冒充空列表；刷新失败保留上次列表，并明确它尚未更新。重读成功清理本次列表错误，保留其他操作错误的归属。
- 历史详情、刚选择文件后读取详情、收到的文字共用同一记录读取逻辑。失败保留身份，原地“重新读取这条记录”；等待时保留该按钮并禁用，防止重复读取。正在读取时向父层报告忙碌并消费返回，避免把未完成任务意外关闭。
- 重读沿用同一编号，不重新选择、不自动存入、不创建重复笔记。格式错误或中断记录继续显示其真实状态，不冒充临时读取失败；内容核对未通过时没有存入入口。
- 读不到内容时，移除确认明确提醒可能移除尚未存入笔记的文字。取消先回详情，再返回同一列表记录、批次、滚动和焦点。说明仍在问号；保留有用错误、处理状态和数据风险。

仅修改 `FileImportPanel.vue` 的界面与任务状态。存储适配器、导入内容校验、摘要、编号、固定目标、写入回执、原文保护、任务位置和父页面均未修改。浏览器保存会保留原始 BOM、混合换行及 emoji；页面只读输入显示浏览器正常的换行归一化结果。

## 冻结设计与实际页面

[设计／实页对照](evidence/mobile-import-read-retry-2026-10-28/comparison.html)保留两版静态 HTML、原始 PNG、冻结时间和 SHA。v1 原型序列化遗漏文本框的 `.value`，短屏截图范围又裁掉弹层顶部；修改业务代码前冻结的 v2 修正这两处采集问题，另外五张与已查看 v1 原图逐字节一致。原稿未覆盖。

延迟回复测试随后实际发现：点击重试时按钮暂时消失。已按原冻结交互要求修正为等待期间保留并禁用。检查此状态时另发现移除警告无法表达内容未知的风险，先保存原图、冻结[确认文案和参考图](evidence/mobile-import-read-retry-2026-10-28/confirmation-freeze.json)，再接入修改。

逐张查看9张最终实页。根据实页修正重试按钮间距及触摸点击残留；保留真实键盘焦点。7个主要状态的全部已测坐标、字体、颜色及按钮名称与 v2 一致，坐标最大差为0，详见[测量](evidence/mobile-import-read-retry-2026-10-28/visual-comparison.json)。Vue 文本框 `.value` 与静态文本节点分开核对，不把空 `textContent` 误作丢失正文。确认弹窗另作原图目视核对，其两侧使用不同合成资料，不宣称背景像素一致。

320px、200%文字下，整体弹层允许滚动；滚到重试按钮时页头离开视口，需要上滚访问顶部返回。当前截图如实保留这个位置，没有通过裁切、缩字、隐藏焦点或更改字体伪造整页同时可见。后续导入整体页面审计仍需评估固定页头与完整任务页。

## 验证与保留的首次失败

`npm run build:mobile` 通过，已有大包体警告保留。最终正式资源为 `mobile-4xgRRfTT.js`、`mobile-DgXF5YzT.css`；已核对磁盘与9012服务字节一致，未修改模块与起点 Git 内容一致，见[来源核对](evidence/mobile-import-read-retry-2026-10-28/provenance.json)。

| 验证 | 结果与范围 |
| --- | --- |
| [正式App读取重试专项](evidence/mobile-import-read-retry-2026-10-28/browser-report.json) | 7组通过：首次失败／刷新恢复、详情同编号重试、旧列表保留、重复失败与确认取消、窄屏深色大字、精确内容存入、深列表现场与新选择记录读取失败；4次Host UI扫描无违规。 |
| [延迟回复组件专项](evidence/mobile-import-read-retry-2026-10-28/replies-report.json) | 3组通过：等待时禁止重复操作和返回；注入选择器取消回复；收到的文字读列表失败与读详情失败分别重试。直接编译生产组件并注入存储回复，没有原生IPC。 |
| [原文字导入回归](evidence/mobile-import-read-retry-2026-10-28/text-import-report.json) | 12组通过：内容、重复名、重载、回执失败固定目标、编码／容量、确认移除、冲突、不完整记录、长文与容量上限。 |
| [收到的内容回归](evidence/mobile-import-read-retry-2026-10-28/incoming-report.json) | 14组通过，7次Host UI扫描无违规，包含读取与文档接纳失败重试及原草稿保留。 |
| [任务分层回归](evidence/mobile-import-read-retry-2026-10-28/task-layers-report.json) | 9组通过，含确认／文件夹子层／帮助逐层返回、长列表焦点与滚动、PDF及附件包分层和写入后打开失败。 |

未删首次失败：[等待时按钮消失](evidence/mobile-import-read-retry-2026-10-28/first-failure-deferred-retry-button-disappeared.json)促成修复；[旧接收按钮名称](evidence/mobile-import-read-retry-2026-10-28/first-failure-incoming-obsolete-button-name.json)仅更新该读取故障场景的断言，保留原失败；[旧确认角色](evidence/mobile-import-read-retry-2026-10-28/first-failure-task-layers-obsolete-confirmation-role.json)原断言寻找普通dialog，实际是既有alertdialog，修正角色和完整名称后通过。

浏览器注入的是存储读取故障和cancel事件，组件注入的是延迟回复，均不代表 Android SAF、真实选择器取消、系统／预测返回、TalkBack、输入法、进后台恢复或来源授权已验收。未生成APK，未推送或发布。

阶段5整体继续进行。下一项5C2先实测附件包记录读取失败、来源不可用和重试，再决定最小修复；图片任务已具备独立详情与核对，继续按实际断点推进。原生出口单独验证。
