# F1 正文保存协调与草稿调用链审计

2026-10-11，接续 `db485677`。本轮后端协调改动，无 UI 修改、无归档执行入口开放。

## 实际调用链结论

- LibraryMode.vue 的 saveCurrentFile 调用 write_text_document，携带 textSignature；定时 startShadowSaveTimer 调用 save_history_version，只保存历史快照，不是正文自动保存。
- TextEditorView 使用 pendingTextSaves.ts 串行化当前前端上下文的保存；LibraryMode 未使用该辅助逻辑，且它不能协调其他窗口。
- App.vue 汇总 tabs.isDirty、临时内容与窗口草稿数量后调用 set_window_dirty；后端 lifecycle::WindowDrafts 只有窗口级布尔值，不是逐文件草稿登记或归档握手。
- 既有归档历史 lease 只覆盖历史链，通用正文写入并未共用它。因此不能把历史锁当成正文/草稿执行门禁。

## 本轮实现

增加同进程、失败即返回的文档路径 lease，一次原子申请多个路径，冲突时不占用其中任何新路径，释放使用 RAII。规范父目录和文件名形成键，使不存在的目标及移动后的旧路径仍可被保留；不会创建目标文件。

接入通用 write_resolved_text_document，在恢复检查、快照读取、签名校验、写入及回读期间持有；覆盖经过该函数的库内/外部文本保存。旧 write_markdown_file/write_external_markdown_file 同样接入。内部归档在正文指纹、历史暂存、移动及发布前申请源/目标 lease，并持有至回执返回。冲突保存报 document-busy，提示保留修改后重试。

## 验证

- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib archive -- --nocapture`：80 passed / 0 failed（新增 2 项，并扩充现有归档测试；含既有压缩包测试）。
- `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib commands::formats::tests -- --nocapture`：12 passed / 0 failed，与上一筛选重叠 1 项，不能相加称为 92 项独立测试。
- 新测试验证多路径申请原子失败/释放、保存冲突不改正文及释放后重试；现有移动测试增加移动后源与目标均仍被锁住的断言。`git diff --check` 通过。

## 尚未解决与接续

不是跨进程锁，也不是文件 ID 锁；硬链接、叶符号链接及特殊大小写别名不保证统一。其他未接入写入器、旧文件移动/删除、只读入口中的中断恢复等未获得完整互斥。父目录必须已存在。新锁只防止同时执行的已接入操作，不能防止归档结束后旧窗口再对原路径发起保存。

尚未解决逐文件/跨窗口草稿登记、保存期间继续输入的前端回执处理、路径迁移后标签页身份更新，也未进行真实窗口忙碌提示验收。不要由此开放归档执行或宣称草稿闭环完成。

下一步先制定并接入跨窗口草稿确认/未知状态拒绝策略，明确保存中的窗口处理；同步盘点剩余写入/恢复入口，再接事务写回、标签/索引与恢复。涉及 UI 修改必须实际查看页面，新状态先示意审批。

**尚未封板**，F1 归档用户闭环未完成。公开及运行版本仍为 1.0.26，目标 1.1.0。
