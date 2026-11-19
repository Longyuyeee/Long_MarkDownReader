# Windows 输入时窗口无响应

2026-11-19 在桌面安装版 1.3.15 中观察到外部 Markdown 编辑窗口永久无响应，主进程 CPU 基本停止增长。未保存内容已从仍存活的渲染进程提取为用户本机的独立恢复文件。

主线程调用栈包含 `WaitOnAddress`、Tao 窗口回调、`DefSubclassProc`、WebView2 焦点切换和外层 `PeekMessageW`。原依赖为 Tauri 2.10.2／Tao 0.34.5。旧键盘处理在持有 `KEY_EVENT_BUILDERS` 与布局缓存锁时查看消息，焦点消息可以重入同一线程，再次申请同一锁，导致永久等待。

该路径与 [Tao #1379](https://github.com/tauri-apps/tao/issues/1379) 一致。上游建议使用新的输入处理，见 [维护者讨论](https://github.com/tauri-apps/tao/issues/1349)。本次将 Tauri 的最低依赖提升到 2.12.5，锁文件解析到 Tao 0.37.3。

针对性原生回归使用独立测试窗口，同时发送按键和焦点消息，并从其他线程探测窗口响应。先使用原 Tao 0.34.5 复现死锁，再使用项目实际解析的版本检查持续响应。运行入口为 GitHub Actions 的 `Windows keyboard and focus regression`，避免操作用户的编辑窗口。

前端生产构建与 `cargo check --locked` 通过。[原生对照运行 44451757888](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/44451757888) 完整通过，旧 Tao 0.34.5 触发死锁，Tao 0.37.3 在 12590 轮按键和 129122 次焦点消息后正常退出。结果保存在[对照记录](evidence/windows-input-2026-11-19/keyboard-reentrancy-results.json)。第一轮脚本依赖空闲事件结束，在持续消息压力下无法收尾，随后改为独立终止消息压力，完整重跑通过。

Windows 修复程序的优化构建已通过，产物为本机 `release-artifacts/windows-input-fix-20261119/tauri-app.exe`。本机替换需要结束旧的无响应进程，已准备原程序备份与恢复副本，等待用户确认重启。公开稳定版仍为 1.3.15。恢复文件和现场内存数据仅存放在用户本机。
