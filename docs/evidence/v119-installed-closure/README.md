# v1.1.9 安装收尾审计

固定产品 `b92c18a1705cf787a05c2b3a97e78feeb29d46fb`；构建与安装运行 `39020293589` **整体 failure**。MSI/NSIS 和四个构建门成功，但首轮真实文件选择驱动超时；不能将制品生成或 CI 通过算作安装通过。原包已下载并按原收据核对大小与摘要，见 `downloaded-installer-verification.json`，不重建。

- `source-ci-39020369233.json/.log`：开发/候选及原始驱动的完整 CI success，head `67f4e81febb12a704b111ab6624414b4bbb06525`，随后 PR #58 合入 main `7bda962c`。
- `cancelled-dispatch-39020282562.json`：首次调度填错完整源码 SHA 后立即取消；不引用其为候选或验收来源。
- `cross-report-contract.log`：9 项本版/上版严格来源和报告正反检查通过；额外拒绝现场与搜索报告 EXE 摘要不一致，属于内存验证器测试，不是安装证明。
- `driver-audit.log`：当前完整开发审计通过；历史证据/业务断言保留，当前合法版本与阶段枚举已补充 1.1.9。

主开发原图和本地完整门、988 原生功能及独立性能原日志见 `../v119-session-ui/`。本机未安装产品、未接管桌面。此处后续只追加真实运行/原始报告，不重写历史证据或混用 Debug 程序。

`run-39020293589/` 是从 GitHub 原始 ZIP 仅提取的根层报告/原图，未改写；失败原图已实看。`build-39020293589.json`/`build-39020293589-failed.log` 保留原始运行和日志。原生文件框等待期间主页面没有报错，但这不能单独证明选择成功或产品正常；需修复定位驱动后同包重跑。UIA 桌面树定位补为精确 HWND/已验证进程及 owner，再用真实 UIA 控件或原生文件名输入框/OK 通知；不伪造返回路径，不放弃真实预检/草稿/磁盘/位置断言。旧 `ProcessIdProperty` 源码 token 检查改为新的真实 `GetWindowThreadProcessId` / owner / 精确标题 / FromHandle 边界检查，不用注释保留旧 token 换通过；早期 8/1 失败日志保留。嵌入的 Win32 interop 仅做本地编译校验，未在本机调用；实际调用只允许一次性远端宿主。
