# U2O 托管未签名安装生命周期收口审计

日期：2026-08-01  
应用版本：0.7.0  
产品源码：`dfe5e9c424ab4a3b71f1eee3924dc43f8f7d400f`  
GitHub Actions：`30664431101`  
结论：通用托管 Windows 未签名内部候选链路通过；`releaseCandidate=false`。

## 1. 本阶段关闭的问题

此前安装产物中的 TXT 编辑器虽然能保存和重开，但保存标记被同一工作面的状态栏遮挡。产品在文档状态替换后现在会将 CodeMirror 视口确定性复位到文首。本轮重新构建 0.7.0 NSIS，而不是复用旧安装包，然后完成安装生命周期验证。

人工复核与机器证据一致：

- TXT 的 `R5J_TEXT_SAVED` 和 `installed-right-side-workspace=true` 在主窗口右侧嵌入式编辑器中可见；
- JSON 的 `R5J_JSON_SAVED`、语法有效状态和结构面板可见；
- 两个标记的有效对比度均为 16.41:1、累计不透明度为 1、命中测试可见；
- 编辑器没有打开成独立产品窗口，仍处于 Library 右侧工作区。

## 2. 已验证的运行能力

一次性托管环境为 `Microsoft Windows Server 2025 Datacenter`，不是 Windows 10 或 Windows 11 客户端。固定合成数据完成了 18 项生命周期检查：

- 0.6.2 全新安装、0.7.0 受控升级和升级后首次启动；
- Markdown 文件关联注册与卸载恢复；
- 安装产物 TXT/JSON 读取、编辑、保存、重开；
- `/workspace`、`/library`、`/text`、`/json`、`/pdf`、`/workbook`、`/diagram`、`/mindmap`、`/graph`、`/canvas`、`/release-capabilities` 共 11 个右侧路由挂载；
- 遗留 0.6.2 降级被识别，并自动恢复经哈希验证的 0.7.0；
- 静默卸载、用户数据保留、回滚版本安装与启动；
- 管理备份导出和隐私预检、知识索引删除重建、回滚后当前版本重装、备份恢复、索引再建以及代表性 TXT/JSON 重开。

管理证据显示备份只包含 5 个脱敏管理条目，正文、API 密钥、系统凭据、绝对用户路径、可恢复缓存正文和外部库内容均被排除。恢复前后索引均为 `ready`，对象数和来源数均为 3。

## 3. 证据与防伪边界

导入证据位于 `docs/evidence/r5k-windows-matrix/imported`，绑定：

- 当前安装包 SHA-256：`d6ec52af91096158ee117c93342c8767b0f649ebf11a8a47005112171ef2dafb`；
- 回滚安装包 SHA-256：`2be92e76f0fbffa685b2956ebe3e80094e8f9c8204a5a0aad330e3d89103e97e`；
- 托管产物清单：`docs/evidence/u2-disposable-install-lifecycle/hosted-artifact-manifest.json`。

导入器校验固定成员集合、平面安全文件名、成员大小与摘要、源码提交、安装包摘要、截图有效性、完整检查集和隐私字段。4/4 恶意或漂移证据用例继续被拒绝，错误 Windows 通道也会在落盘前拒绝。

## 4. 与初始产品目标的对齐

本阶段证明的是“安装后的统一管理器可用性”，而不是只证明开发服务器可运行。TXT/JSON 的基础编辑与保存重开已有真实安装证据；PDF、表格、图表、思维导图、知识图谱和画布的右侧工作面已完成安装产物路由挂载验证。各高级格式的细分编辑能力仍以既有格式能力矩阵和专项审计为准，不能由路由挂载结果替代。

R5K 当前状态为 `generic-hosted-windows-evidence-imported-client-matrix-pending`。R5L 当前状态为 `generic-hosted-management-recovery-proven-client-matrix-pending`。U2 当前状态为 `hosted-unsigned-lifecycle-passed-signed-client-matrix-pending`。

通用运行证据使 R5K 可以越过已经获得运行证明的 R5L 通用恢复环节并交给 R5M 的双客户端发布门禁；R5M 的 Windows 10/11、签名运行和人工批准条件没有被本轮结果放宽。

## 5. 尚未关闭的发布门禁

当前安装包 Authenticode 状态为 `NotSigned`。托管 runner 是 Windows Server 2025，因此不能登记为 Windows 10 或 Windows 11 客户端证据，也不能证明签名安装包运行。以下门禁继续为 false：

- Windows 10 x64 客户端安装生命周期；
- Windows 11 x64 客户端安装生命周期；
- 有效 Authenticode 签名和时间戳；
- 两个客户端通道中的签名产物运行；
- 人工发布批准与正式候选提升。

下一阶段是 R5N 外部发布执行，动作标识为 `execute-signed-windows-10-and-windows-11-client-matrix`。需要提供受信任代码签名证书、时间戳服务以及相互独立的一次性 Windows 10/11 客户端。任何仓库内模拟结果都不得替代这四项外部事实。
