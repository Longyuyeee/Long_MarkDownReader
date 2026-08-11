# UX-51 更新重启与外部独立窗口审计

## 结论

两项发布阻断问题已修复，当前可以进入 `1.0.8` 版本提升与打包阶段。

- 自动更新：安装助手隐藏运行，等待 NSIS 安装结束、校验退出码，再重启当前 Long编辑可执行文件。
- 外部打开：系统启动参数和应用内“打开外部文件”都创建独立 `external-*` 顶层窗口，不再改变或占用主资料库窗口，也不增加软件内标签页。
- 窗口边界：外部窗口使用对应格式的完整编辑/预览页面，隐藏资料库标签栏和更新提示；主窗口仍负责资料库、托盘和更新生命周期。
- 格式覆盖：37 个允许外部打开的编辑/预览格式均通过统一注册表映射，导入转换格式不会被误开放。

## 验证

- `npm.cmd run build`：通过。
- Rust：`479 passed / 2 ignored / 0 failed`。
- `npm.cmd run check:current-development-audit`：通过。
- Tauri WebView2 多窗口审计：同一进程同时保留主资料库、外部 TXT、外部 JSON 三个 WebView；主窗口路由未变化，运行时错误为 0。
- 证据：[`docs/evidence/ux51-external-window-lifecycle`](./evidence/ux51-external-window-lifecycle)。证据绑定实现提交 `a0a3ab3b0ebaacbee679c8f76585b52f34ddac41`。

## 下一步

1. 等待实现提交的 GitHub Quality Gate 通过。
2. 将版本从 `1.0.7` 提升到 `1.0.8`，同步 package、Cargo、Tauri、能力事实源、README 与 Release Notes。
3. 从冻结提交构建 MSI/NSIS，记录大小与 SHA-256，并完成安装态多窗口和自动更新重启复测。
4. Quality Gate 与安装生命周期均通过后发布 GitHub Release，再验证远端附件和 `1.0.7 -> 1.0.8` 更新链。
