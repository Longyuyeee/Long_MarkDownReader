# M7-7 v1.0.19 已发布 Release 与远端附件审计

日期：2026-09-01

阶段结论：**通过；v1.0.19 已正式发布并完成三个远端附件回下载复核。**

- annotated Tag `v1.0.19` 对象：`ad023d0cbf407acb0eea9a89bc0197b15f84bb0d`。
- Tag 精确解析到候选源码：`9655b02142b64bd8e7f1ad4056a4b9c6f0367990`。
- GitHub Release：[`Long编辑 v1.0.19`](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.19)，数据库 ID `379909457`，非草稿、非预发布，并通过官方 `releases/latest` API确认为最新。
- 远端回下载 NSIS：66,777,917 bytes，SHA-256 `996e1221…6582`，`NotSigned`。
- 远端回下载 MSI：75,386,880 bytes，SHA-256 `04aca041…63f0`，`NotSigned`。
- 远端回下载 `SHA256SUMS.txt`：192 bytes，SHA-256 `d101e50c…cefb`。

三个附件与 M7-6 冻结清单逐字节一致。下一步为 M7-8 官方 `v1.0.18 → v1.0.19` 应用内更新、SHA-256 校验、静默安装与自动重启观察；该观察不回滚已验证的公开 Release，但必须作为阶段收口证据。
