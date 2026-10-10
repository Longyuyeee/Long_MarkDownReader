# v1.0.26 发布审计

v1.0.26 已正式发布并设为最新稳定版。范围：搜索主区打开、显式参考、摘录插入及撤销、来源定位和失效重关联、参考刷新。

Markdown 闭环 22 项原生 Debug 检查及 32 项相关回归通过；普通文本/PDF 跨格式实测通过，包括 PDF 第 2 页定位、只读主区禁止 Markdown 插入、普通文本两处命中切换。截图及报告见 `docs/evidence/v126-cross-format/`。

通道 community-unsigned；企业推广标志 releaseCandidate=false。安装包可能出现未知发布者提示；自动更新失败可手动下载安装，发布时提供 SHA-256。v1.0.24→v1.0.25 官方应用内更新观察仍待完成，不继承为本版通过。

v1.0.26 MSI/NSIS 构建及摘要核验通过；NSIS 安装生命周期 22/22、安装态工作区 18/18、路由 11/11、管理回滚 7/7，失败 0。MSI 本轮仅验证构建与文件摘要，不宣称完成 MSI 安装生命周期。原始报告见 `docs/evidence/v126-candidate-lifecycle/`，安装包清单和导入摘要见 `docs/evidence/v1.0.26-release/`。

人工复查了安装态资料库版本、系统更新版本、JSON 保存重开和知识图谱治理四张截图；版本为 1.0.26，未出现错误回退页。产品新增闭环仍按原生 Debug 证据单独记录，不与安装态覆盖范围混称。

## 当前发布接续点

- 固定产品提交：`c5c136140ad68fefb81b50898051012cfc865a20`，已推送 GitHub。
- [发布流水线 38060835862](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38060835862) 已成功：完整质量检查、Rust 回归、MSI/NSIS 构建、官方 v1.0.25 安装器核验及隔离 NSIS 安装/覆盖升级/回滚/卸载与安装态场景均通过。
- 本地同一版本完整质量门禁通过，生产依赖审计为 0 漏洞。跨格式截图已复查实际 PDF 第 2 页画布及页码框，不只检查 URL 参数。
- 已下载 `v126-candidate-lifecycle-38060835862` 并核对原始回执、固定提交、安装包大小和 SHA-256；发布就绪检查通过。
- [v1.0.26 正式 Release](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.26) 已公开，Tag 绑定上述固定产品提交；MSI、NSIS 和 SHA256SUMS.txt 三个公开附件均已回下载核对大小与 SHA-256，回执见 `docs/evidence/v1.0.26-release/release-receipt.json`。
- 下一版建议见 [用户工作流提升计划](Post_v1_0_26_Next_Version_Plan_2026-10-10.md)。
