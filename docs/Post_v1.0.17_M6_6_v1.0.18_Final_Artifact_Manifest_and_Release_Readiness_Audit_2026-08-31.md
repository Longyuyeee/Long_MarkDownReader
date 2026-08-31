# M6-6 v1.0.18 最终产物清单与发布就绪审计

审计日期：2026-08-31

结论：**通过；只使用 GitHub 托管生命周期已通过的 MSI/NSIS，最终清单、公开文件名和 SHA256SUMS 已冻结，下一步进入 M6-7 Tag、GitHub Release 与远端回下载复核。**

## 预期与实际

预期两份发布安装器必须绑定产品提交 `5988c03c0167b00cb86ed9a5f3cfe85f0b280a6a`、Actions `33378338422` 和 artifact `9754106849`，均为 `NotSigned`，并与 M6-5 的 22/22、18/18、11/11、7/7 真实结果相连。实际逐文件复核完全匹配；没有采用本地 M6-4 的不同摘要。

- `LongEdit_1.0.18_x64-setup.exe`：65,784,946 bytes，SHA-256 `477d1423909d660d5c60d238805b54248ac9f667b9f956036589ea55bf9e719d`。
- `LongEdit_1.0.18_x64_zh-CN.msi`：73,863,168 bytes，SHA-256 `379dc0ca3fc7cf362af6d29818b95ad98f38d03ae5ce78bdb53ceace20cb2955`。
- `SHA256SUMS.txt`：192 bytes，SHA-256 `fa9ff4cbabaa6a480b76942a6be19ae21ca9feb313211a3e618d308947e74c79`。

## 发布边界

本阶段把无签名社区候选提升为 `releaseCandidate=true`，只表示具备发布资格；企业签名候选仍为 false，且尚未创建 Tag 或 GitHub Release。M6-7 必须让 `v1.0.18` Tag 精确绑定产品提交，上传上述三项资产，再从公开地址重新下载并复算大小与 SHA-256。任何差异都必须停止发布并修正。
