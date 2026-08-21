# v1.0.14 无签名社区版发布审计

状态：**已发布，远端附件已复核**

渠道：`community-unsigned`

企业发布候选：`releaseCandidate=false`

## 候选范围

- 发布后窄侧栏资料库卡片响应式修复。
- 26 个小尺寸管理界面横向审计及设置布局稳定性修复。
- 资料库侧栏入口排序、常用搜索说明、Markdown 标签界面和关系面板收敛。
- 中英文句末标点标签解析修复。
- 真实侧栏审计强制使用当前二进制并核对运行版本。

## 发布门禁

1. 统一 `1.0.14` 版本事实源并通过完整补丁 Quality Gate。
2. 构建无签名 NSIS 与 MSI，记录大小、SHA-256 和 `NotSigned` 状态。
3. 发布 GitHub Release，上传两个安装器与 `SHA256SUMS.txt`。
4. 从远端重新下载三个附件并核对大小与 SHA-256。
5. 发布后单独观察官方 `v1.0.13 -> v1.0.14` 应用内更新、自动重启和合成资料保留。

## 实际结果

- 本地 `npm run ci:patch-release` 全部通过，生产依赖漏洞为 0。
- GitHub Quality Gate [32462815326](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/32462815326) 通过。
- 托管 Windows 生命周期 [32462354721](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/32462354721) 通过：22/22 安装生命周期、18/18 安装后工作区检查，失败 0。
- 本地构建生成 NSIS 与 MSI，版本均为 1.0.14，Authenticode 状态均为 `NotSigned`。
- [GitHub Release v1.0.14](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.14) 已发布；NSIS、MSI 与 `SHA256SUMS.txt` 回下载后的大小和 SHA-256 全部一致。

## 当前边界

- 当前公开稳定版本在 v1.0.14 Release 完成前仍为 v1.0.13。
- 社区安装包无 Authenticode 商业签名，Windows 可能显示未知发布者或 SmartScreen。
- 用户始终可以从官方 Release 手动下载安装，应用内更新也必须先确认并通过 SHA-256 校验。
- 正式附件只包含 NSIS、MSI 与 `SHA256SUMS.txt`，不发布遗留 `.sig` 或 `latest.json`。
