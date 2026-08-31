# M5-6 v1.0.17 托管安装生命周期审计

审计日期：2026-08-31

阶段结论：**通过；真实 GitHub 托管 Windows 已完成双安装包、1.0.16→1.0.17 升级、安装态工作区、卸载保留和管理回滚，下一步只进入 M5-7 最终发布就绪审计。**

## 目标与不可变身份

- 候选源码：`2b6235d420ceffd291dab72c4af17caffe464333`，版本 `1.0.17`。
- 升级基线：公开 Tag `v1.0.16`，提交 `757d54309ddb35f445344d909fa4c7ba2567bc58`。
- 工作流：`.github/workflows/v117-candidate-lifecycle.yml`，只接受精确 40 位提交。
- 本地候选摘要只作为 M5-5 构建观察；托管环境从源码重新构建，单独记录其真实大小与摘要，不要求非确定性安装包与本地逐字节相同。

## 真实测试：预期、实际与差异

托管 Windows 必须生成 MSI、NSIS 和上一公开版本 NSIS，三者均为 `NotSigned`；随后完成 `1.0.16 → 1.0.17` 升级、22 项安装/降级/卸载/保留检查、18 项安装态文件与知识工作区检查、11 条真实路由和 7 项管理备份/索引回滚。任何一项失败都记录预期与实际差异并修正后重跑，不能用本地烟测替代。

[GitHub Actions 33361759629](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/33361759629) 在 `windows-latest` 用时 45分55秒，一次通过：R5I 22/22、R5J 18/18、路由 11/11、R5L 7/7，失败 0。artifact ID `9747835764`，206,517,643 bytes，服务端 SHA-256 `f321741bee7a3527750659cf83197e851efa6db717757eacd5dbb0430ca6f51a`。

独立下载后复核：

- MSI `Long编辑_1.0.17_x64_zh-CN.msi`：73,863,168 bytes，SHA-256 `1453fa9a911d934fdacda88f63d3bac783100b9ef210fb02362ebe9aa0f16c3e`，`NotSigned`。
- NSIS `Long编辑_1.0.17_x64-setup.exe`：65,778,243 bytes，SHA-256 `154ace58e2e20b6ebe9947c2690f03b0d9737f69fecb9ffca90c0cdf3b2ba282`，`NotSigned`。
- 升级基线 NSIS `Long编辑_1.0.16_x64-setup.exe`：65,795,604 bytes，SHA-256 `993f54681a83e484b066fec776f64fccce48d271c912e2591ae2d5fa52d94926`，`NotSigned`。

预期不要求托管重建与本地 M5-5 安装器逐字节相同；实际托管摘要和大小确实不同，但候选提交、1.0.17 产品版本、未签名状态及全部生命周期语义一致。修正方式是分别保留本地观察和托管回执，并规定 M5-7 只晋级已经通过安装生命周期的托管产物，不混用本地摘要。

GitHub 另提示 `actions/upload-artifact@v4` 的 Node 20 运行时被强制到 Node 24；上传成功且证据完整，因此不阻断 1.0.17，本项登记为后续工作流维护债务。

仓库导入 29 个结构化回执和必要截图，不含安装器、内嵌 ZIP 或用户源内容。原始下载证据树为 1,546,366 bytes / `27a5e6eb6ddaa7f3820d25e8ee70890adc4d8b4dcafd2aa60e2cc53e3387818c`；跨平台规范树为 1,543,457 bytes / `defb7ae3c255f211b1d4d68ce405e6b2dea0b1b67bc42503d180f70595c336f1`。

## 发布边界与接续点

当前仍为 `releaseCandidate=false`，尚未创建 `v1.0.17` Tag 或 GitHub Release。唯一接续点为 **M5-7 v1.0.17 最终安装包清单、SHA256SUMS、发布说明与发布就绪审计**；只能使用本次已通过生命周期的托管 MSI/NSIS，审计全绿后再决定 Tag 和 GitHub Release。
