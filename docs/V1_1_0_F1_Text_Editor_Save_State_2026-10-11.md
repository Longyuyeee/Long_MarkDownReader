# F1 普通文本编辑器保存状态审计

日期：2026-10-11。基线：`8f6315b2`。目标版本仍为 1.1.0，运行版本仍为 1.0.26，未封板、未发布。

## 问题与修复

继续检查主 Markdown 编辑器以外的保存入口，发现 `TextEditorView.vue` 已有路径级保存排队和回执协调，但未接窗口级在途保存计数；正文连续修改或保存策略变化也没有显式推进窗口活动版本。只依赖 dirty 布尔值不能表达 dirty 保持 true 期间的后续编辑。

- 在提交路径队列之前取得 `beginWindowSave`，直到整个保存与回执协调完成才在 finally 释放，包含页面销毁和失败路径。
- 在 `syncCurrentTab` 完成正文、dirty、编码等元数据同步后记录窗口活动。初始化同步也会保守地推进活动，不将其理解为新增用户输入。
- 保留既有磁盘签名校验、编码选项和新草稿保护；未改变布局、未开放归档执行。

## 验证

- `node --test scripts/test-main-text-save-lifecycle.mjs scripts/test-text-save-lifecycle.mjs scripts/test-main-text-load-lifecycle.mjs scripts/test-main-editor-mode.mjs`：31 项通过。新增两项验证窗口保护覆盖排队/销毁后等待回执，以及失败释放保护并保留 dirty。
- `npx vue-tsc --noEmit`：通过。
- `node --experimental-strip-types scripts/check-text-save-receipt.mjs`：通过，含重叠保存计数与幂等释放。直接用当前 Node 22.12.0 执行不带该参数时不支持导入 `.ts`；未修改测试规避问题。
- `git diff --check`：通过。无 Rust 代码修改，本轮未重新执行 Rust 测试。

使用 computer-use 技能实际观察隔离原生窗口的 TXT 页面（非仅模拟 IPC），按普通用户操作点击正文、输入和 Ctrl+S。已有 debug 隔离故障入口设置延迟 15000 ms、失败注入关闭：

1. 打开 Plain.txt，观察原有编码工具栏、正文及“已同步”。追加“先整理预算。”并保存。
2. 追加“再核对交付日期。”并保存。在日志出现 begin、尚无对应 end 且页面显示“保存中”时继续输入“保存时补充备注。”。
3. 回执后页面保留后续备注和未保存圆点；磁盘仅包含本次提交的“再核对交付日期。”，没有误将后续备注标成已落盘。
4. 再次保存，最终页面为“已同步”、圆点消失，磁盘包含全部内容。

证据目录（本机保留，不上传整个临时用户目录）：`C:\Users\Administrator\AppData\Local\Temp\longedit-save-audit-65e4c43702054ae5a1450afcda27405d`。日志 `native-plain-save.log` 有三对 `begin delay_ms=15000 fail=false` / `end fail=false`；end 是延迟入口结束，不单独代表写盘完成，以后续回执和磁盘回读为准。截图已在本次会话查看，未导出为仓库附件。

最终 `library/Plain.txt` SHA256：`5459B39226FAF964B14AACE9CF8D98C89DFE64094F4CE6D4E23F143DC8C9F94D`。

## 边界与下一步

本轮实际窗口只验证嵌入式 TXT 正常慢保存及继续输入；销毁后保护、失败释放由真实保存函数/模拟 IPC 回归覆盖，不宣称已完成独立文本窗口原生失败/销毁验收，也未直接读取后端活动 revision。现有成功提示仍为“文本已安全保存”，有后续草稿时的提示精度可以后续优化。

接续顺序：继续核对其他本地草稿编辑器的活动上报覆盖；连接跨窗口最新确认的请求/响应与失效处理；完成归档执行、逐项回执和失败恢复闭环及实际多窗口验收。涉及新恢复界面先出示意图审批，再修改并实际查看。F1 以及计划中的后续功能和 UI 审批、版本合同尚未完成，不能封板。
