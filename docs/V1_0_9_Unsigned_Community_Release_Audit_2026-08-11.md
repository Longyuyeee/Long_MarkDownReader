# v1.0.9 无签名社区版发布审计

状态：**v1.0.9 已发布、远端附件已复核、官方自动更新链已收口**

渠道：`community-unsigned`

## 当前结论

- 冻结产品提交 `8f668bc402ca45b4c621193ba5b65ece63de51a7` 的 Quality Gate `31489160736` 已通过，本地 MSI/NSIS 构建、版本、未签名状态和 SHA-256 已核对。
- GitHub 托管安装生命周期 `31490343424` 已通过 22/22 生命周期和 18/18 安装态工作区检查。
- GitHub Release [`v1.0.9`](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.9) 已公开，Release ID 为 `368579987`，Tag 指向 `7ed1defb967bc0521b100e5e6057c61aa8a5537f`。
- NSIS、MSI 和 `SHA256SUMS.txt` 已从远端重新下载，名称、大小和 SHA-256 与冻结候选一致。
- 官方 `v1.0.8 -> v1.0.9` 托管更新运行 `31495885209` 已通过 12/12。它验证用户确认、SHA-256、覆盖安装、更新助手自动重启、最新版状态及覆盖/卸载后的合成资料保留。
- v1.0.8 的自动重启失败已由 v1.0.9 的延迟启动、存活检查、失败重试和脱敏日志修复；历史 Release 与证据未被替换。

## 已发布资产

- `LongEdit_1.0.9_x64-setup.exe`：`53,795,116` 字节，SHA-256 `2b188fee7f30667e0df80c5389c2fc0f4a464e685c4d507645d3e0c98fe7dd19`。
- `LongEdit_1.0.9_x64_zh-CN.msi`：`58,785,792` 字节，SHA-256 `3bd409f09db2ffc4e9401c2267bf5fb3cdbe54d41593137aec856c3cfd22539f`。
- `SHA256SUMS.txt`：`190` 字节，SHA-256 `fabb9e4290927396c97c0127e396de2d43fa65b1d3a3a26a8123a50469bba1d8`。

## 发布边界

- 安装包无 Authenticode 商业签名，Windows 仍可能显示未知发布者或 SmartScreen；只应从官方 GitHub Release 下载并核对 SHA-256。
- v1.0.4 及更早版本需要手动下载安装 v1.0.5 或当前版本一次；受控应用内更新从 v1.0.5 开始生效。
- 无签名社区版已经收口；企业签名候选仍为 `releaseCandidate=false`，真实签名不在本阶段范围内。

## 后续

进入维护模式。只处理可复现回归、安全问题或新的真实 Office/Excel 生产者证据，不再追加本版本发布步骤。
