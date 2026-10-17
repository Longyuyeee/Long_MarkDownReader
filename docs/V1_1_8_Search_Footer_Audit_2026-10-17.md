# v1.1.8 E2d：搜索底部原位恢复审计

## 用户问题与路线对齐

接续 E2c 真实 Wry 检查后，不只读 passed，还查看原图：[过期现场](evidence/v118-native-user/run-38977308342/user-expired-page.png)。用户滚动到列表底部点击续载，失败说明却在顶部、底部只剩禁用按钮；驱动能找到顶部按钮并滚过去，不代表普通用户知道下一步。该问题属于既定“稳定续载、错误可理解且能恢复”，不是新平台或额外归档步骤。

沿用已批准的紧凑页尾状态行，不新开弹窗或重排界面。在原位置给出“续载未完成，已保留 N 个文件”及准确恢复动作；不滚动用户视图、不清空旧结果、不自动全量重试、保存或切库。顶部完整说明和恢复入口仍保留，正常续页恢复后回到原“加载更多文件”。

## 实际代码与修正

- `SearchPageStatus.vue` 的底部此前只显示加载数和因 `error` 禁用的续载按钮。现在在已有文件且出错时就地替换为恢复动作；忙碌/页面禁用时仍不可重复触发。
- 顶部和底部共用同一标签计算：普通失败“重试”，过期/无效游标/请求不匹配“重新搜索”，快照变化“刷新可用结果”。没有改控制器的游标、预算、来源校验或排序规则。
- `LibraryMode.vue` 和 `CommandPalette.vue` 的底部都显式接到原 `retryKnowledgeSearch` / `retryPages`；快照变化仍走原可用结果刷新。打开、参考、返回深度和草稿保护不减项。
- 新检查不先滚动到恢复按钮：先从用户点击“加载更多”的位置核对失败后按钮在视野中且可命中；普通失败重试同一已发游标，过期重新创建会话并恢复 80 文件深度。

## 失败与最终验证

1. 原实现的实际组件检查 **6 通过 / 2 失败**，实际 Vue 页面因底部恢复入口为 0 而失败；原日志/截图保存于 `status-before.log` 和 `browser-before/`。
2. 首次实现显示了按钮，但漏接两个父页面的 footer 事件，实际点击后没有新请求，原 40 文件不变。`browser-after-first/`、补充诊断的 `browser-after-diagnostics/` 与对应日志保留；诊断只有原查询和失败续页两次请求。修正的是产品事件接线，不是绕过点击、直接调用处理函数或删掉等待断言；新增合同同时约束两处接线。
3. 最终搜索/分组/定位/恢复/返回/草稿等相关合同 **116 通过 / 0 失败**。新增两项实际组件渲染合同覆盖底部错误、恢复标签、禁用状态、正常续页及双入口接线。
4. 新实际 Vue 流程 **4 组 / 24 布局 / 0 pageerror**：资料库/命令面板各普通失败及过期恢复；六种风格，侧栏 1000/1280、面板 480/1000 视口宽，均高 700。最初失败后的可发现性检查不允许事后滚动补救；布局矩阵单独允许滚动检查按钮及无横向溢出。`browser-final/report.json` 另存实际失败游标和重新搜索请求序列。
5. 原刷新回归 **6 组 / 0 pageerror**，核对真实页面编辑输入、dirty 和隔离模拟磁盘没有被恢复操作改变；原分页 **9 组 / 12 布局 / 0 pageerror**、旧导航 **12 组 / 12 布局 / 0 pageerror** 保持。
6. 已实际查看修正前失败、修正后资料库与命令面板原位“重试”及“重新搜索”截图，而非只信报告。最终图：[资料库](evidence/v118-search-footer/browser-final/library-visible-retry.png)、[命令面板](evidence/v118-search-footer/browser-final/palette-visible-retry.png)。本批日志、截图、报告与独立源码哈希清单置于 `evidence/v118-search-footer/`，不覆盖 E2c。

本批完整 `npm run ci:patch-release` **退出 0 / 通过**，包含生产构建、全部当前开发/历版能力合同、locked Rust check 和生产依赖 **0 漏洞**；原日志为同目录 `quality-gate.log`，只有既有 `scan_visible` dead-code 警告。本批没有 Rust 产品修改，未新增或重跑一套“976 项原生功能”；该数字属于上批固定产品回归。上批驱动 `041eea4f` 的远端完整质量门/原生 CI **[38977312511 success](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38977312511)**，最终收据 `prior-041-ci-final.json` 与原 pending 快照分开，不把它算成本批新提交的 CI。

## 原生证据与发布边界

E2c 的 **[38977308342 success](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38977308342)** 已完成原 12 项 IPC/重启及 6 项真实 WebView 输入；固定产品 `13e77754efc4fe3d7b4cef73e96e8165cdb45cae`、驱动 `041eea4f`、同程序 SHA-256 `2155a32a9e580de42092899feb756ae2a1adcd663bcdfb9741ec76052fe256bf`。这些是真实 Debug Wry 结果，不是安装态，也**不能覆盖本批新改的底部前端**。本批实际 Vue 使用隔离模拟 IPC，不冒充原生输入/安装器证据；旧证据清单保持原提交身份，不因工作树改变而重新计算成新产品。

下一步把底部恢复和 Office 精确位置一起纳入新固定程序真实输入，再扩展到 1.1.8 的所有历史安装流程白名单、本版安装报告和候选/复核/发布编排；之后才固定安装器、安装升级及同包独立复核。公开/运行时仍 **1.1.7**、开发目标 **1.1.8**，未封板/未发布，不提前改 README 下载、版本标签或 Release。独立的 1.1.6→1.1.7 官方更新观察仍 pending，不改写历史。

已读实际定位代码，下一批按现有能力定断言：`fileNavigation.ts` 的 DOCX block locator 由 `DocxReaderView.vue` 滚到对应块；PPTX 的 slide/object locator 由 `PptxReaderView.vue` 选页并标记对象，备注命中还展开详情；`WorkbookView.vue` 目前支持命中工作表及同文件重复 locator token 切表，**不能把它写成已有单元格级搜索定位**。夹具必须包含真实可解析 Office 原文件，不能用模拟返回替代这些页面。安装接线则检查 `installed-release-runtime.mjs` 的报告继承、`installed-version-identity.mjs` 白名单和 `installed-v1-1-7-workflow.mjs` 的严格版本限制，不能只改工作流默认值。

本机只运行仓库的隔离无头浏览器，未启动原生软件、接管用户桌面、安装程序或修改注册表；只提交自有夹具和生成证据，不含用户正文，两份 `.misty_order.json` 保留且不提交。
