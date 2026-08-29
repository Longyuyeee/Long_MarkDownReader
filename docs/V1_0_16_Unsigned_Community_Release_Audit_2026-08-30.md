# v1.0.16 无签名社区版发布审计

状态：**质量门禁与当前运行烟测已通过，安装包待构建**

渠道：`community-unsigned`

企业发布候选：`releaseCandidate=false`

## 候选范围

- 高频格式深化：XLSX、PPTX、DOCX、ODS、大 JSON、视频与字幕均按有界能力完成独立验收。
- 工作台行动闭环：Markdown 待办与内部 Table 布尔任务支持确认写回、冲突保护、撤销和精确定位。
- 知识图谱 2.0：语义探索、专业视觉、导航与 100/1,000/5,000 节点性能阶段已经退出审计。
- 跨格式工作流：统一对象定位、CSV/TSV→Table、OPML→Canvas、图谱→项目笔记和图谱→Canvas 均具有完整披露与来源保护。
- 有界证据清理：仅清除了四个可重建且已有结构化替代指标的大图导出负载。

## 已满足的发布前置

- 产品功能范围以 `7e10c340fa0d528b598c9ca6be391c48b15a463f` 为冻结入口；经过门禁纠偏后，精确产品候选固定为 `34f8ce2badb5224cda658e350cd1ec2f70b1c6b1`。
- package、Cargo、Tauri 和 38 个当前共享合同已在同一步迁移到 `1.0.16`；五个历史基线继续固定为 `1.0.15`。
- 精确候选已从头通过完整 `npm run ci:patch-release`：前端构建、Rust locked check 和生产依赖审计均通过，生产依赖漏洞为 0。
- 当前 R5F 浏览器预览路由挂载为 11/11；R5G 真实 Tauri Debug WebView2 为 6/6 检查、11/11 路由，TXT/JSON 保存重开和性能导出通过。
- v1.0.16 社区策略已绑定精确候选，但安装包、安装生命周期和远端 Release 回执仍为空。
- 当前公开稳定版仍为 `v1.0.15`，不存在 `v1.0.16` Tag 或可下载安装包。

## 待执行发布门禁

1. 从精确候选提交构建无签名 NSIS 与 MSI，记录大小、SHA-256 和 `NotSigned` 状态。
2. 在托管 Windows 中完成当前候选安装、升级、卸载和安装后工作区回归。
3. 最终确认发布说明，创建绑定候选提交的 Tag 与 GitHub Release，并从远端下载附件复核。

## 当前边界

- 质量门禁和运行烟测通过不等于安装包、安装态生命周期或公开 Release 已存在。
- 当前用户仍只能从 v1.0.15 官方 Release 手动下载安装；自动更新在 v1.0.16 正式发布前不会发现该版本。
- 社区安装包没有 Authenticode 商业签名，Windows 可能显示“未知发布者”或 SmartScreen。
- 自动更新和手动安装都必须使用官方 GitHub Release，并核对 SHA-256；不得继承 v1.0.15 的哈希作为 v1.0.16 证据。

## M4F-2A 纠偏记录

R5F 现有历史证据原本不可重复执行。新增采集器后确认当前生产浏览器预览会因 `App.vue` 无条件调用 Tauri 窗口 API 而崩溃；该实现已改为只在真实 Tauri 运行时取窗口对象，并完成 11/11 路由重新验证。详细问题与修复见 `Post_v1.0.15_M4F2A_Candidate_Gate_Remediation_Audit_2026-08-30.md`；完整质量门禁、R5F/R5G 结果与下一接续点见 `Post_v1.0.15_M4F2_v1.0.16_Candidate_Quality_Gate_and_Runtime_Smoke_Audit_2026-08-30.md`。
