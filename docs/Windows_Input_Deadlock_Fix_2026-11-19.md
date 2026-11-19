# Windows 输入时窗口无响应

2026-11-19 在桌面安装版 1.3.15 中观察到外部 Markdown 编辑窗口永久无响应，主进程 CPU 基本停止增长。未保存内容已从仍存活的渲染进程提取为用户本机的独立恢复文件。

主线程调用栈包含 `WaitOnAddress`、Tao 窗口回调、`DefSubclassProc`、WebView2 焦点切换和外层 `PeekMessageW`。原依赖为 Tauri 2.10.2／Tao 0.34.5。旧键盘处理在持有 `KEY_EVENT_BUILDERS` 与布局缓存锁时查看消息，焦点消息可以重入同一线程，再次申请同一锁，导致永久等待。

该路径与 [Tao #1379](https://github.com/tauri-apps/tao/issues/1379) 一致。上游建议使用新的输入处理，见 [维护者讨论](https://github.com/tauri-apps/tao/issues/1349)。本次将 Tauri 的最低依赖提升到 2.12.5，锁文件解析到 Tao 0.37.3；前端 `@tauri-apps/api` 同步到 2.12 系列，当前锁定 2.12.5，满足正式构建的 Rust／JavaScript 版本一致性检查。

针对性原生回归使用独立测试窗口，同时发送按键和焦点消息，并从其他线程探测窗口响应。先使用原 Tao 0.34.5 复现死锁，再使用项目实际解析的版本检查持续响应。运行入口为 GitHub Actions 的 `Windows keyboard and focus regression`，避免操作用户的编辑窗口。

前端生产构建与 `cargo check --locked` 通过。[原生对照运行 44451757888](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/44451757888) 完整通过，旧 Tao 0.34.5 触发死锁，Tao 0.37.3 在 12590 轮按键和 129122 次焦点消息后正常退出。结果保存在[对照记录](evidence/windows-input-2026-11-19/keyboard-reentrancy-results.json)。第一轮脚本依赖空闲事件结束，在持续消息压力下无法收尾，随后改为独立终止消息压力，完整重跑通过。

用户已明确授权替换本机程序并重开恢复副本。旧的死锁进程已结束，恢复副本已在响应正常的修复窗口中显示；原文档没有覆盖，原程序备份仍保留。恢复文件和现场内存数据仅存放在用户本机。

本机首次直接执行 `cargo build --release` 虽然完成了优化编译，但没有启用 Tauri 正式资源协议，启动时仍访问开发地址，不能视为可交付程序。已改用标准入口 `npm run tauri -- build --no-bundle`，由 CLI 执行前端生产构建并传入 `tauri/custom-protocol`，完整构建通过；此前的仅原生优化产物已作废。本机最后替换尚未完成，恢复副本继续保留。

后续已提升 1.3.16 并通过固定源码的正式安装包构建、完整 Rust 回归和实际安装／升级，安装后的界面与编辑操作正常，不依赖临时预览服务。详见[1.3.16 发布记录](V1_3_16_Unsigned_Community_Release_Audit_2026-11-19.md)。本机当前编辑窗口不强制重启，用户保存后可安装新版本。
