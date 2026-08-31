# M5-7 v1.0.17 最终产物清单与发布就绪审计

审计日期：2026-08-31

结论：**通过；只使用 GitHub 托管生命周期已通过的 MSI/NSIS，最终清单、公开文件名和 SHA256SUMS 已冻结，下一步进入 M5-8 Tag、GitHub Release 与远端回下载复核。**

## 预期与实际

预期两份发布安装器必须绑定产品提交 `2b6235d420ceffd291dab72c4af17caffe464333`、Actions `33361759629` 和 artifact `9747835764`，均为 `NotSigned`，并与 M5-6 的 22/22、18/18、11/11、7/7 真实结果相连。实际逐文件复核完全匹配；没有采用本地 M5-5 的不同摘要。

- `LongEdit_1.0.17_x64-setup.exe`：65,778,243 bytes，SHA-256 `154ace58e2e20b6ebe9947c2690f03b0d9737f69fecb9ffca90c0cdf3b2ba282`。
- `LongEdit_1.0.17_x64_zh-CN.msi`：73,863,168 bytes，SHA-256 `1453fa9a911d934fdacda88f63d3bac783100b9ef210fb02362ebe9aa0f16c3e`。
- `SHA256SUMS.txt`：192 bytes，SHA-256 `026d80f0aaed1af8d8141b5a81abc1ed5882c99d2a56e347041db7a25ae4bf61`。

## 发布边界

本阶段把无签名社区候选提升为 `releaseCandidate=true`，只表示具备发布资格；尚未创建 Tag 或 GitHub Release。M5-8 必须让 `v1.0.17` Tag 精确绑定产品提交，上传上述三项资产，再从公开地址重新下载并复算大小与 SHA-256。任何差异都必须停止发布并修正。
