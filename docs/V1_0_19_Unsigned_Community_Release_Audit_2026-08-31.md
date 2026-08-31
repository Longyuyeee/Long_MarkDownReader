# v1.0.19 无签名社区发布审计

日期：2026-08-31

渠道：`community-unsigned`

企业发布候选边界：`releaseCandidate=false`

当前状态为完整质量门、本地 WebView2、GitHub 托管安装生命周期、最终制品冻结与公开发布全部通过；`v1.0.19` Tag 精确解析到固定候选，GitHub Release 的三个附件已经独立回下载复核。

固定候选 `9655b021…` 的 `NotSigned` MSI/NSIS 已在 Run `33409497055` 重建并通过 22/22 生命周期、18/18 安装态、11/11 路由和 7/7 管理回滚。用户可从官方 GitHub Release 手动下载安装，或在受控应用内更新确认并通过 SHA-256 校验后升级；Windows 仍可能显示未知发布者或 SmartScreen 提示。剩余收口项仅为官方 v1.0.18 → v1.0.19 应用内更新观察。
