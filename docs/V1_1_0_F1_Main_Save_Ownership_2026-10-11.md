# F1 主编辑区跨实例保存占用

2026-10-11，接续 `95212e6d`。运行版本 1.0.26，目标 1.1.0，**尚未封板**。

## 修复

此前 LibraryMode 的 savingTextTabs 位于组件作用域。离开路由再创建组件后，新 Set 不知道旧组件尚有保存回执在等待，可能再次提交同一文档。

新增模块级 mainTextSaveOwnership，按 store 的文档路径取得窗口内唯一占用。LibraryMode 在发起保存前取得占用，重复请求沿用既有“正在保存”提示，成功/失败后 finally 释放。所有权使用独立 Symbol，旧释放函数再次调用不会释放新请求的占用。不同路径可以并行，未引入自动保存或旧正文排队。没有新增弹窗、布局或样式修改。

该占用只覆盖同一 WebView 内 LibraryMode 实例，精确匹配路径字符串；不是操作系统文件锁，不处理路径别名、硬链接、其他编辑器/窗口或其他进程。后端路径占用和磁盘签名校验仍不可移除。页面重建时旧回执与新编辑器正文展示的完整协调仍需继续验证，不将“禁止重复提交”描述为整个保存生命周期闭环。

## 验证

- `node --test scripts/test-main-text-save-lifecycle.mjs`：11 passed。新增两个独立动作上下文共享实际占用模块的重入测试、失败释放/不同路径并行，以及旧 owner 重复释放不干扰新 owner。仍为模拟 IPC 的动作级测试，不是实际 Vue 路由卸载或慢磁盘验证。
- `node --test scripts/test-text-save-lifecycle.mjs`：已有 8 passed。
- `node --experimental-strip-types scripts/check-text-save-receipt.mjs`：通过。
- `npx vue-tsc --noEmit`、`git diff --check`：通过。未修改 Rust，未重新构建安装包或运行 Rust 回归。
- 按 computer-use 技能在隔离 debug 窗口修改前后查看主编辑区，未操作安装版资料。向 Note.md 末尾输入“补充：下午再核对交付时间。”，Ctrl+S 显示已安全保存，磁盘回读为：

  `今天整理项目资料。明天开会前再确认预算。补充：下午再核对交付时间。`

沿用临时隔离目录 `C:/Users/Administrator/AppData/Local/Temp/longedit-save-audit-65e4c43702054ae5a1450afcda27405d`，截图仅在会话中。收尾停止本轮测试进程，保留临时资料。普通保存成功不能代替保存等待期间重新进入路由的实窗验证。

## 接续

1. 实现并执行隔离原生延迟/失败验收，核对等待期间编辑、离开/重进、磁盘签名及新工作面内容一致性；必要时补新页面加载等待/回执同步。
2. 审计其他编辑器保存/活动上报，再接跨窗口新鲜确认与迟到回执故障场景。
3. 归档安全写回、恢复及索引闭环未完成，不开放执行。索引“需要处理”原因与目标版本展示偏移仍待核查。

没有达到封板条件，不升级版本、不发布 Release。
