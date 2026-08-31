# M6-7 v1.0.18 正式发布与远端资产复核

审计日期：2026-08-31

结论：**v1.0.18 已正式发布；Tag 精确绑定产品提交，三项 GitHub Release 资产已从远端重新下载并逐文件匹配最终清单。**

## 发布身份

- Tag `v1.0.18` 解引用到 `5988c03c0167b00cb86ed9a5f3cfe85f0b280a6a`；注释 Tag 对象为 `dbcd6292c250691b85f0687619e4d74583637804`。
- GitHub Release ID `379760984`，非草稿、非预发布；官方 `/releases/latest` 返回同一 ID。
- Release 地址：https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.18

## 预期、实际与差异

预期公开 NSIS、MSI 与 `SHA256SUMS.txt` 的名称、大小和 SHA-256 完全匹配 M6-6。实际从 GitHub Release 下载后分别为 65,784,946 / 73,863,168 / 192 bytes，摘要为 `477d14…719d`、`379dc0…2955`、`fa9ff4…4c79`，全部一致。

唯一工具差异是当前 `gh release view` 不提供 `isLatest` JSON 字段；改用 GitHub 官方 `/releases/latest` API 比较数据库 ID，实际 ID `379760984` 与本次发布一致。该修正不改变发布资产或 Tag。

## 接续点

公开版本与运行时版本现均为 `1.0.18`，下一补丁目标登记为 `1.0.19`。本审计完成时的唯一接续点是 **M6-8 v1.0.17→v1.0.18 官方应用内更新观察**；该接续点随后已由运行 `33397305847` 以 12/12、失败 0 完成，v1.0.18 发布与更新链现已收口。
