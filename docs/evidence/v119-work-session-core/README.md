# v1.1.9 安全核心与既有页面回归证据

当前开发目标 1.1.9，生产源码身份仍 1.1.8；未封板、未制作新安装器、未发布。只读原生核心已经接注册，正式导入/恢复 UI 未接，示意待确认。完整待办见 [开发审计](../../V1_1_9_Work_Session_Development_2026-10-17.md)。

## 原始复现与核心结果

- `search-privacy-before.log`：自动搜索现场摘要泄露检查 3/1，新增检查真实失败。
- `named-search-privacy-before.log`：命名现场摘要检查 7/1。
- `reference-identity-before.log`：独立参考预检身份检查 6/1。
- `record-identity-before.log`：空名称/同标识等记录安全检查 5/1。
- `view-identifier-before.log`：内部页面标识被误判为磁盘路径，7/1。
- `contracts-initial.log`、`search-privacy-after.log`、`privacy-and-return-final.log`、`core-final.log` 分别保留阶段验证，不用旧数量代替最终结果。
- `core-closure.log`：补审阶段 31 通过；`core-final-audit.log` 是内部页面标识兼容修复后最终 **32 通过/0 失败**，覆盖可迁移白名单、Windows/UNC 路径、模型合并、去重、配额、陈旧修复、原有现场及搜索返回；未删除旧断言。
- `native-core.log`：首次补审后的 10 项真实临时文件检查；追加 ADS/设备/目录检查后 `native-core-closure.log` 为 11 项，最终再加内部标识兼容检查，共 **12 项**（在完整原生最终日志中），不覆盖原轮。
- `rust-functional.log`：加固前 986 通过；`rust-functional-closure.log`：ADS 加固后 987 通过；最终 `rust-functional-final-audit.log`：**988 通过/0 失败/5 既有忽略/1 性能用例过滤**。既定独立性能入口单独运行，最终 `rust-performance-final-audit.log`：**1 通过，4,457ms**；此前两轮性能原始日志仍保留。
- `typecheck*.log`：阶段类型检查。`quality-gate.log` 是状态文档调整前完整质量门通过；`quality-gate-closure.log` 是状态对齐后完整通过。加入内部标识兼容后最终 `quality-gate-final-audit.log` **进程退出 0，生产依赖 0 漏洞**；不用前两轮冒充本轮。

日志使用原始字节属性；目录中的红测是保留的失败复现，不是当前仍未修复的失败。首次不支持 `Array.at` 的类型错误仅工具输出，修复后通过，未伪造一份原始日志。

## 真实 Vue 页面（模拟 IPC）

- `search-session-browser/`：3 个新增场景、0 页面异常，真实打开/离开后不持久化摘要；刷新页面后重新读取结果（摘要已不同）仍定位第 72 条、恢复 80 文件深度；旧 v1 含摘要记录读取不覆写，随后用户离开/命名才安全保存。`report.json` 与两张原图均保存，已实看。
- `search-page-regression/`：沿用 v118 实际 App/LibraryMode/命令页/参考完整回归，9 场景 + 12 个布局组合（六风格×宽窄）、0 页面异常；原图保留，已查看选中结果、参考草稿和深色窄窗等关键页。
- `work-session-regression/`：沿用实际 WorkspaceHome/WorkSessionBar，命名配额失败保留输入、重载、原草稿/新草稿合并、主编辑路由、重命名及删除取消/确认。无正文写 IPC。窄窗原图已实看；不覆盖 v110 历史目录。

正常动效保留；不接管本机桌面。截图中的旧版本号来自历史模拟夹具，不能冒充当前产品版本身份。新界面只有 [设计图](../v119-session-proposal/)，不计入生产页面通过项。

## 尚未证明

后续 [固定 Debug 程序真实 IPC 证据](../v119-native-session/README.md) 已补通过：四个主窗命令/快速笔记拒绝、真实文件和存储服务、同程序重启，共 13 检查；不能仍当作未做，也不能升级为安装证明。正式迁移交互、原生用户输入、安装重启/覆盖升级、当前版 MSI/NSIS 与同包独立复核仍未做，不具备封板发布条件。上版已发布事实和固定安装器不受本开发分支影响。
