# F1 表格保存回执修复与后台页面验证

日期：2026-10-11；基线 `d32c2b71`；目标 1.1.0，仍未封板。

## 修复范围

针对上一轮 Table 两项缺陷修改实际 `TableView.vue`，没有修改 Workbook，也没有改布局或取消保存期间编辑能力。

- 捕获文档对象、路径、资料库、外部文件标志和加载代次。旧回执不再更新其他文档或销毁后的页面；保存事件使用提交路径。
- `markDirty` 递增编辑版本并上报窗口活动；成功回执只清除提交版本的 dirty，后续修改保留并明确提示“已保存提交的内容，新增修改尚未保存”。保留后续修改时更新原文档磁盘签名，供下一次保存使用。
- 提交 payload 是独立 JSON 快照，后续输入不修改已提交批次；窗口级保存保护持续到回执/失败结束。
- 外部文件确认前占用保存动作，确认后复查文档归属，避免重复弹窗及导航后写错文件。
- 卸载递增加载代次；类型推断定时器只作用于原文档对象。

## 验证结果

1. `node --test scripts/test-table-save-lifecycle.mjs`：10 项通过，其中 6 项是当前实现检查，4 项是导入的历史缺陷复现/对照，不能把后者算修复验收。
2. 联合 main/text 保存、加载、模式回归共 41 项通过（包括上述历史用例）。
3. `npx vue-tsc --noEmit`、`check-table-row-editing-experience.mjs`、`check-external-table-workspace.mjs`、`git diff --check` 通过。未改 Rust，未重跑 Rust 测试。
4. `test-table-save-browser.mjs` 使用独立 headless Chromium，装载生产 TableView、Pinia、Vue Router 和 Naive UI；仅配置和原生 IPC 使用隔离 fixture。输入、点击保存通过真实 DOM 操作，控制保存回执的完成时刻。验证连续编辑、后续 dirty、再次保存、模拟失败及重试，未捕获 pageerror。

后台运行方式：先运行 Vite（127.0.0.1:9000），然后 `node scripts/test-table-save-browser.mjs`。需可用 Playwright/Chromium；模块不在项目依赖时，可通过 `LONGEDIT_PLAYWRIGHT_MODULE` 指向已有 Playwright 模块，未修改生产依赖。`LONGEDIT_TABLE_AUDIT_OUTPUT` 可指定证据目录。

实际查看的后台页面截图：

- [初始页面](evidence/v110-table-save-browser/01-before.png)
- [旧回执后保留新草稿](evidence/v110-table-save-browser/02-new-draft-retained.png)
- [再次保存完成](evidence/v110-table-save-browser/03-saved.png)
- [模拟失败保留草稿](evidence/v110-table-save-browser/04-failed-draft-retained.png)

截图显示原有工具栏及表格内容保留，回执后按钮为“保存”而不是误标“已保存”，元信息栏提示新增修改未保存。没有新增界面结构。本次生成截图已随仓库保存；截图的初始页面是修复后操作前状态，不是旧版本对比图。

## 用户要求及验收边界

起初使用 computer-use 尝试查看隔离原生窗口，尚未进入表格页面即遇到用户操作；询问后用户要求不接管电脑。此后停止桌面控制并关闭本次启动的测试进程，改为后台浏览器。后续优先保持不抢焦点、不操作用户桌面的方式。

**本轮不是原生磁盘验收。** fixture 的 disk 为模拟持久化状态，不能据此宣称 CSV/TSV 真正落盘、原生慢写失败、原生窗口关闭、外部文件覆盖均已验收。函数测试覆盖旧回执归属和卸载失效，但跨实例离开/立即返回时等待旧保存、重载和草稿恢复仍需专项补齐。不要把本修复当作整个 Table 保存生命周期已闭环。

## 接续

先补 Table 跨实例重开协调与可后台执行的原生写入验证，再修 Workbook 的提交批次/后续草稿协调和撤销历史；之后推进跨窗口确认与归档执行/恢复。Workbook 清空新草稿问题仍是封板阻塞，整体 F1 未闭环，不提升版本、不发布。
