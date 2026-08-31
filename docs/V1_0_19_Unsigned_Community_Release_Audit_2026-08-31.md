# v1.0.19 无签名社区候选审计

日期：2026-08-31

渠道：`community-unsigned`

企业发布候选边界：`releaseCandidate=false`

当前状态为原子版本迁移完成、候选质量门与安装包待执行；尚未创建 v1.0.19 Tag 或 GitHub Release，也不提供未验收候选的公开下载链接。

正式发布前必须重新通过完整质量门，构建并核验 `NotSigned` MSI/NSIS，完成本地 WebView2 烟测、GitHub 托管安装生命周期、最终制品冻结和公开附件回下载复核。用户始终可以在正式发布后从官方 GitHub Release 手动下载安装，或在受控应用内更新确认并通过 SHA-256 校验后升级。
