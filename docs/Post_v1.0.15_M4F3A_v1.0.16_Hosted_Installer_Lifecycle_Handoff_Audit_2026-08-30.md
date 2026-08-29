# M4F-3A v1.0.16 托管安装包与生命周期交接审计

日期：2026-08-30

结论：本地 MSI 构建成功但 NSIS 工具链不可作为完整证据，已纠偏为精确候选的托管双安装包与生命周期工作流；执行仍待回执

M4F-3 必须同时证明 MSI、NSIS、`NotSigned`、`1.0.15 → 1.0.16` 升级、安装态路由与 I/O、卸载保留和管理备份/索引回滚。旧 U2 工作流固定使用 0.6.2 且只构建 NSIS，不能满足当前阶段原始需求。

本机从 detached 候选提交 `34f8ce2badb5224cda658e350cd1ec2f70b1c6b1` 成功生成 MSI；NSIS 在官方 3.11 缓存重建及官方 3.12 修复安装后，`makensis.exe` 仍以 Windows Loader `0xC0000135` 退出。该半完成产物不进入发布事实。

新增 `v116-candidate-lifecycle.yml`，强制输入精确 40 位候选 SHA，上一版本固定为公开 Tag `v1.0.15`，在 `windows-latest` 构建 MSI 与 NSIS并逐一核验 SHA-256 和 `NotSigned`。随后复用成熟的 R5I/R5J/R5L 脚本完成升级、安装态工作区、TXT/JSON 保存重开、关联边界、卸载保留和管理恢复，并上传结构化回执及两种安装包。

当前仍为 `releaseCandidate=false`，未创建 `v1.0.16` Tag 或 GitHub Release。下一步仅允许推送本交接审计、触发精确候选工作流并导入不可变回执；工作流没有通过前不得把发布门禁 5–7 标为完成。
