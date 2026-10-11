# F1 原生目录选择与进程重启验收

日期：2026-10-11。基线 `0f5e0ec2`。本轮完成此前保留的原生目录选择、取消、越界拒绝与重启持久化验收。整体未封板、不发布。

## 实际操作与结果

使用 computer-use 技能操作 Windows 原生“选择当前资料库内的收集目录”对话框，限定为仓库 debug 可执行文件启动的隔离测试窗口；未操作已安装应用或真实用户资料库。

1. 从真实收集箱“…”菜单打开选择器，取消；应用仍为默认 Inbox。
2. 再次打开，在原生列表中选中测试库的“原生收集箱”，点击“选择文件夹”；应用显示保存成功及该目录内的真实文件。
3. 再次打开，进入测试库父目录并确认选择；应用明确提示路径超出知识库范围，之前目录和磁盘配置均未改变。
4. 结束仅由本脚本启动的测试进程，保留其隔离 WebView 和配置目录，启动新进程；收集箱恢复自定义目录和真实文件列表。
5. 在新进程打开原生快速笔记独立窗口，“保存到”的实际目标值指向该自定义目录。

检查回执：[原生选择 4 项](evidence/v110-inbox-native/native-checks.json)、[新进程恢复 2 项](evidence/v110-inbox-native/restart-checks.json)。实际查看 [选择成功](evidence/v110-inbox-native/native-selected.png)、[越界拒绝](evidence/v110-inbox-native/outside-rejected.png)、[重启后的快速笔记](evidence/v110-inbox-native/restart-quick.png)；未用示意图或直接设置组件状态替代这轮目录选择。

自动化恢复记录：窗口最初未前置时截图受遮挡，未据此操作；前置隔离窗口后重新观察。原生子对话框的元素缓存失效后停止复用旧索引，改用新截图中的子对话框坐标完成操作。未因此改变产品代码或验收预期。

## 测试隔离改动

旧 LONGEDIT_E2E_LIBRARY 模式的 save_config 直接返回，无法证明配置落盘。新增仅在 debug 构建且同时设置 LONGEDIT_E2E_LIBRARY / LONGEDIT_E2E_CONFIG_DIR 时启用的临时配置目录选择。随后走既有 get_config / save_config 的序列化、校验、可靠写入和读取流程；未替换成测试专用的伪成功实现。

默认隔离模式仍不写配置；正式 release 构建不读取这个 override。新 runner 为每次运行创建唯一临时目录，把 config 与 library 分开，保存/恢复环境变量，结束时仅停止自有进程；测试资料、日志和配置留在临时目录便于复核，不写用户配置。没有放宽库边界校验或保存失败条件。

本轮无正式 UI 布局、文案或功能修改。新增 runner 是**有人操作原生对话框的验收脚本**，每阶段有等待上限，不应当作完全无人值守 CI。运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-v110-inbox-native.ps1` 时按控制台阶段操作指定隔离窗口。

原生 debug 构建通过；`cargo test --locked --manifest-path src-tauri/Cargo.toml commands::config::tests -- --nocapture` 为 8 passed / 0 failed；`git diff --check` 通过。尚未运行本轮 release 打包，不把 debug 验收说成发布包验收。

## 接续与封板

目录选择及正常进程重启持久化已经有真实证据；配置初始化与事件并发、磁盘不可写等异常仍不能由本轮推出全部通过。下一功能重点回到归档执行闭环：支持范围与阻止策略、执行时重校验、无覆盖移动、历史迁移、标签/索引一致性和逐项结果，再按批准方案接弹窗并查看实际页面。

v1.1.0 仍有 F1 归档、F2–F4、其他页面审批/重构与发布验收未完成。达到封板时明确通知用户，不将这 6 项测试通过当作版本封板。
