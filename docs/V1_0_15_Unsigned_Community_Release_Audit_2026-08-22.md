# v1.0.15 无签名社区版发布审计

状态：**无签名社区版已发布并完成远端附件复核**

渠道：`community-unsigned`

企业发布候选：`releaseCandidate=false`（无商业签名，不作为企业签名版）

## 候选范围

- 顶部标签与全软件标题提示层统一。
- WebView 默认右键菜单按编辑语义收敛，专用菜单保持可用。
- 原生确认、提示和输入迁移到应用内对话框。
- 资料库长格式菜单的滚动、层级、透明度与窄屏边界修复。
- 应用内更新进度反馈和设置页交互细节修复。

## 已完成的发布门禁

- v1.0.15 交互治理真实 Tauri 七图验收通过，运行时错误 0。
- Quality Gate 已通过，前端、Rust 锁定构建、生产依赖与发布契约检查成立。
- v1.0.15 托管安装生命周期 22/22、安装后工作区检查 18/18 通过，运行时错误 0。
- NSIS、MSI 与发布可执行文件均已构建，版本一致为 1.0.15，SHA-256 已记录，签名状态为 `NotSigned`。
- 安装、卸载、升级、默认打开、DOCX 外部编辑链路和用户资料排除均已验证。
- 软件仍保持原始左侧资料库/功能入口、顶部标签和右侧阅读编辑区结构。

## 发布证据

- 产品源码冻结：`9aaa810f9a96bb3e741551b966091bd1b67f5b1e`
- Quality Gate：[32516202564](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/32516202564)
- 安装生命周期：[32518530525](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/32518530525)
- 本地证据：`docs/evidence/v1.0.15-release/`
- GitHub Release：[v1.0.15](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.15)，Release ID `374954902`
- 三个公开附件已重新下载；大小与 SHA-256 均与冻结清单一致。

## 精简后的后续工作流

- 日常修改只运行与改动相关的定向检查和构建。
- 候选冻结后只运行一次完整 Quality Gate 和一次安装生命周期。
- 审计脚本修正可复用同一候选安装包，不重复 Rust/前端打包。
- 具体执行边界见 `docs/CI_and_Release_Workflow.md`。

## 当前边界

- 当前公开稳定版为 v1.0.15；发布附件已完成回下载核验。
- 社区安装包无 Authenticode 商业签名，Windows 可能显示未知发布者或 SmartScreen。
- 用户可手动下载安装，自动更新也必须先确认并通过 SHA-256 校验。
