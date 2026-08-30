# M4F-3A v1.0.16 托管安装包与生命周期交接审计

日期：2026-08-30

结论：本地 MSI 构建成功但 NSIS 工具链不可作为完整证据；三轮托管均构建双安装包并逐步暴露真实生命周期偏移，第三轮已推进到图谱主题深链，最终纠偏候选待重跑

M4F-3 必须同时证明 MSI、NSIS、`NotSigned`、`1.0.15 → 1.0.16` 升级、安装态路由与 I/O、卸载保留和管理备份/索引回滚。旧 U2 工作流固定使用 0.6.2 且只构建 NSIS，不能满足当前阶段原始需求。

本机从 detached 候选提交 `34f8ce2badb5224cda658e350cd1ec2f70b1c6b1` 成功生成 MSI；NSIS 在官方 3.11 缓存重建及官方 3.12 修复安装后，`makensis.exe` 仍以 Windows Loader `0xC0000135` 退出。该半完成产物不进入发布事实。

新增 `v116-candidate-lifecycle.yml`，强制输入精确 40 位候选 SHA，上一版本固定为公开 Tag `v1.0.15`，在 `windows-latest` 构建 MSI 与 NSIS并逐一核验 SHA-256 和 `NotSigned`。随后复用成熟的 R5I/R5J/R5L 脚本完成升级、安装态工作区、TXT/JSON 保存重开、关联边界、卸载保留和管理恢复，并上传结构化回执及两种安装包。

当前仍为 `releaseCandidate=false`，未创建 `v1.0.16` Tag 或 GitHub Release。下一步仅允许推送本交接审计、触发精确候选工作流并导入不可变回执；工作流没有通过前不得把发布门禁 5–7 标为完成。

首轮托管运行 `33264898797` 已从旧候选成功生成 MSI 与 NSIS，并由本地独立复核大小、SHA-256 和 `NotSigned`；随后 R5J 在工作台等待 M2A2 已移除的知识网络脉搏而失败，未进入路由/I/O。第二轮运行 `33267563652` 也完成双安装包和哈希回执，但安装态首次直接进入图谱治理时只出现面板壳，覆盖率扫描未启动。实际组件复核确认 `GraphHealthPanel` 对初始 `open=true` 缺少即时加载，属于产品首挂载缺陷，不计入发布门禁。

第三轮运行 [`33319332897`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33319332897) 已通过前两处失败点，并继续通过治理覆盖、可执行建议、图谱到设置、观察会话与 UX-33J；最终在点击治理主题后发现画布已经居中，但当前窗口仍停留 `#/graph?focus=overview`，没有最初 G11/G16 要求的 `Graph?root=` 对象深链。下载 artifact `9735022187` 后独立核对：MSI 73,887,744 bytes / SHA-256 `57757e0e52a9c115a64a3a5ec8e4406a42016df431ad4adb7b861f792a7146a1`，NSIS 65,770,293 bytes / SHA-256 `92ebd50a159e0c0828f6578ec9d7ccb7f14417999f3145cef942cc095e4dc73f`，均与回执一致且为 `NotSigned`；完整生命周期仍未通过，故不晋级发布门禁。

`focusHealthNode` 现已在居中选中后以 `router.replace` 保留原查询并写入 `root=node.id`，G11 契约锁定该行为。最终产品候选为 `757d54309ddb35f445344d909fa4c7ba2567bc58`，已重新通过完整 `ci:patch-release`、R5F 11/11 与 R5G 6/6 + 11/11，必须重新构建并执行完整生命周期。
