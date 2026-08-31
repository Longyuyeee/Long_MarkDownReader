# M5-8 v1.0.17 正式发布与远端资产复核

审计日期：2026-08-31

结论：**v1.0.17 已正式发布；Tag 精确绑定产品提交，三项 GitHub Release 资产已从远端重新下载并逐文件匹配最终清单。**

## 发布身份

- Tag `v1.0.17` 解引用到 `2b6235d420ceffd291dab72c4af17caffe464333`；注释 Tag 对象为 `24ef92ff14fcee0f68b3d4865b57addcf2d8e936`。
- GitHub Release ID `379561360`，非草稿、非预发布；官方 `/releases/latest` 返回同一 ID。
- Release 地址：https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.17

## 预期、实际与差异

预期公开 NSIS、MSI 与 `SHA256SUMS.txt` 的名称、大小和 SHA-256 完全匹配 M5-7。实际从 GitHub Release 下载后分别为 65,778,243 / 73,863,168 / 192 bytes，摘要为 `154ace…a282`、`1453fa…6c3e`、`026d80…bf61`，全部一致。

唯一工具差异是当前 `gh release view` 不提供 `isLatest` JSON 字段；改用 GitHub 官方 `/releases/latest` API 比较数据库 ID，实际 ID `379561360` 与本次发布一致。该修正不改变发布资产或 Tag。

## 接续点

公开版本与运行时版本现均为 `1.0.17`，下一补丁目标登记为 `1.0.18`。唯一接续点为 **M5-9 v1.0.16→v1.0.17 官方应用内更新观察**：在一次性 Windows 上从公开 v1.0.16 安装，通过应用内受控更新发现并安装本次官方 NSIS，复核 SHA-256、覆盖安装、重启、最新版状态和资料保留。
