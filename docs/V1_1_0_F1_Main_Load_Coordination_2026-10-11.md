# F1 主编辑区加载与保存回执协调

2026-10-11，接续 `68e1c18f`。运行版本 1.0.26，目标 1.1.0；**未封板**。

## 代码发现与修复

主编辑器重新加载缓存时没有等待旧组件保存回执，可能先展示旧正文而标签元数据随后被回执更新。另一个确定问题是 setEditorValue 的 50ms 回调恢复加载时的 dirty，用户在此期间输入会被误标干净。

mainTextSaveOwnership 现在提供释放通知和等待方法，等待会检查期间新取得的占用。LibraryMode 对有未完成保存的同路径暂时禁用编辑器，等待原保存处理完后再查标签缓存。加载请求同时校验代次、激活路径和编辑器对象，失效请求不回写；0ms 延迟启用也增加同样校验。移除 50ms 恢复旧 dirty 的赋值，避免抹掉新输入状态。未新增弹窗或改布局。

占用仍限单 WebView、LibraryMode 精确路径字符串，不代表跨窗口或原生文件锁。当前实现没有保存超时取消机制；原生保存未返回时继续等待，不能假装保存结束以恢复写入。

## 自动验证

- 新增 `node --test scripts/test-main-text-load-lifecycle.mjs`：5 passed。运行真实加载函数和实际占用模块，编辑器、计时器和环境用替身；涵盖等待回执后读新缓存、失败释放后保留空草稿、切走/销毁失效、延迟回调保护。用历史 `68e1c18f` 复现过早读缓存和 dirty 被清空，证明断言可发现旧缺陷。
- `node --test scripts/test-main-text-save-lifecycle.mjs`：11 passed。
- `node --test scripts/test-text-save-lifecycle.mjs`：8 passed。
- `npx vue-tsc --noEmit`、`git diff --check`：通过。未修改 Rust，未运行 Rust 全套或打包。

这 24 个用例不是原生延迟 IPC/真实 Vue 路由重建验收，不能替代磁盘故障测试。

## 页面检查

使用 computer-use 技能，修改前后查看独立 debug 主窗口。修改后从 Note 切到 Budget 确认预算正文，再返回 Note，聚焦正文末尾输入“回来后继续记录。”，Ctrl+S 后显示已安全保存；磁盘回读包含原内容及该新增句子。未操作安装版资料。

沿用隔离目录 `C:/Users/Administrator/AppData/Local/Temp/longedit-save-audit-65e4c43702054ae5a1450afcda27405d`，截图仅在会话中，测试 app/Vite 收尾停止，临时资料保留。实际操作是普通标签切换与保存，不宣称已在慢保存期间完成路由卸载/重建。

## 下一步与封板

继续原生可控延迟/失败验收，核对真实 Vditor 输入时序、模式切换、路由重建与签名；审计其他保存入口和活动上报，再接跨窗口确认及归档写回/恢复/索引闭环。页面已有的目标 v1.0.27 偏移和快速笔记索引提示原因仍待核查。未开放归档执行、未发布版本。
