# UX-39B v1.0.4 安装生命周期收口审计

状态：**通过**
版本：`v1.0.4`
源码提交：`2b5d4d750da0f3e3ee913a4cc461784ffa8ea947`
GitHub Actions：[运行 31062756515](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31062756515)

## 结论

一次性 Windows 环境完成了从 `0.6.2` 到 `1.0.4` 的安装、升级、卸载、回滚和恢复流程。18 项生命周期检查、15 项安装态功能检查和 11 条关键路由挂载检查全部通过，没有阻断项。

安装态已实际覆盖 TXT/JSON 编辑、显式保存与复开，DOCX 对 Microsoft Word、WPS Writer 和 LibreOffice Writer 的交接，知识网络入口、代表性工作区路由、资料备份与索引、卸载保留、回滚恢复和文件复开。`/release-capabilities` 的预发布版本冲突也在最终源码提交中修复并通过安装态挂载。

## 发布边界

- 安装器与已安装主程序均为 `NotSigned`，不宣称 Authenticode 签名。
- 本版本仅发布 MSI、NSIS 和 `SHA256SUMS.txt`，不发布 `latest.json` 或 `.sig`。
- 托管构建哈希用于绑定测试运行；最终公开附件使用本地冻结提交重建后的哈希，并在 Release 上传后再次下载复核。
- 机器摘要见 `docs/evidence/ux39-installed-lifecycle/summary.json`，路由清单见 `route-mount.json`。
