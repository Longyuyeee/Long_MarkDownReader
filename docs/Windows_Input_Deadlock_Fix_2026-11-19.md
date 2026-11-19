# Windows 输入时窗口无响应

2026-11-19 在桌面安装版 1.3.15 中观察到外部 Markdown 编辑窗口永久无响应，主进程 CPU 基本停止增长。未保存内容已从仍存活的渲染进程提取为用户本机的独立恢复文件。

主线程调用栈包含 `WaitOnAddress`、Tao 窗口回调、`DefSubclassProc`、WebView2 焦点切换和外层 `PeekMessageW`。原依赖为 Tauri 2.10.2／Tao 0.34.5。旧键盘处理在持有 `KEY_EVENT_BUILDERS` 与布局缓存锁时查看消息，焦点消息可以重入同一线程，再次申请同一锁，导致永久等待。

该路径与 [Tao #1379](https://github.com/tauri-apps/tao/issues/1379) 一致。上游建议使用新的输入处理，见 [维护者讨论](https://github.com/tauri-apps/tao/issues/1349)。本次将 Tauri 的最低依赖提升到 2.12.5，锁文件解析到 Tao 0.37.3。

针对性原生回归使用独立测试窗口，同时发送按键和焦点消息，并从其他线程探测窗口响应。先使用原 Tao 0.34.5 复现死锁，再使用项目实际解析的版本检查持续响应。运行入口为 GitHub Actions 的 `Windows keyboard and focus regression`，避免操作用户的编辑窗口。

当前修复处于编译和原生回归验证阶段。公开稳定版仍为 1.3.15，正在运行的旧进程仍保留。恢复文件和现场内存数据仅存放在用户本机。
