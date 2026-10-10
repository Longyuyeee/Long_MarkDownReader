# v1.0.26 发布审计

当前为候选，公开稳定版仍为 v1.0.25。范围：搜索主区打开、显式参考、摘录插入及撤销、来源定位和失效重关联、参考刷新。

Markdown 闭环 22 项原生 Debug 检查及 32 项相关回归通过；普通文本/PDF 跨格式实测通过，包括 PDF 第 2 页定位、只读主区禁止 Markdown 插入、普通文本两处命中切换。截图及报告见 `docs/evidence/v126-cross-format/`。

通道 community-unsigned；企业推广标志 releaseCandidate=false。安装包可能出现未知发布者提示；自动更新失败可手动下载安装，发布时提供 SHA-256。v1.0.24→v1.0.25 官方应用内更新观察仍待完成，不继承为本版通过。

v1.0.26 MSI/NSIS 构建与安装、覆盖升级验收待完成。通过固定候选门禁前不发布，旧版本证据不作为本版安装通过依据。

## 当前发布接续点

- 固定产品提交：`c5c136140ad68fefb81b50898051012cfc865a20`，已推送 GitHub。
- [发布流水线 38060835862](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38060835862)：GitHub 全新 Windows 环境的 `npm run ci:patch-release` 已通过，记录时正在执行完整 Rust 回归；后续依次生成 MSI/NSIS、验证官方 v1.0.25 安装器、执行隔离 NSIS 安装/覆盖升级/回滚/卸载与安装态场景。
- 本地同一版本完整质量门禁通过，生产依赖审计为 0 漏洞。跨格式截图已复查实际 PDF 第 2 页画布及页码框，不只检查 URL 参数。
- 流水线成功后下载 `v126-candidate-lifecycle-38060835862`，核对安装器原始回执、固定提交和 SHA-256；导入本版原始报告，复查安装态截图，再更新发布清单、README 和 Release。不得仅以构建成功判定可发布。
- 目前尚未创建 v1.0.26 正式 Release，公开稳定版仍为 v1.0.25；不提前标记安装、应用内更新或发布通过。
- 下一版建议见 [用户工作流提升计划](Post_v1_0_26_Next_Version_Plan_2026-10-10.md)。
