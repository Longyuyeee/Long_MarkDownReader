# v1.0.5 无签名社区版发布审计

状态：**安装包与 Quality Gate 已通过，准备发布**

渠道：`community-unsigned`

企业签名候选边界：`releaseCandidate=false`；本次社区候选与企业候选相互独立。

## 收口结论

v1.0.5 已完成版本同步、生产构建、43 类格式能力审计、Windows MSI/NSIS 打包、依赖安全审计和 GitHub Quality Gate。产品源码候选为 `7cf9e23f6cea284fbc1c1b0ce89aee0b07c01f41`，远端门禁运行 `31086396133` 已通过。

本版是无 Authenticode 证书的社区发布，Windows 可能显示“未知发布者”或 SmartScreen 提示。安装包只应从官方 GitHub Release 下载，并用 `SHA256SUMS.txt` 核对 SHA-256。

## 发布附件

| 附件 | 大小 | SHA-256 | 签名 |
| --- | ---: | --- | --- |
| `LongEdit_1.0.5_x64-setup.exe` | 53,661,708 B | `51223ef679f2f58746c3ebe470ddc9dbc24155573b4000e1f4887ab1bb7b84e7` | `NotSigned` |
| `LongEdit_1.0.5_x64_zh-CN.msi` | 58,511,360 B | `103b94fa4a119cc6b74f22a0f320576e18afdae7c646df43c298eca0d090b012` | `NotSigned` |
| `SHA256SUMS.txt` | 190 B | `8389eadf54b8b71d532e55fef11610927f6fb9d7804b942515a24bf583e78730` | 校验清单 |

## 验证边界

- `npm run ci:patch-release` 在本地通过；GitHub Quality Gate `31086396133` 通过。
- Rust 更新器专项测试 3/3 通过，生产依赖审计为 0 个漏洞。
- 本机构建时已有一个 LongEdit 实例正在运行。为避免终止用户进程，未启动第二个便携实例，也未执行安装器，因此 v1.0.5 的本机运行烟测和完整安装生命周期不声明为已通过。
- v1.0.4 的安装生命周期证据仅作为历史基线，不继承为 v1.0.5 当前证据。

## 更新迁移

v1.0.5 首次启用基于 GitHub Release 和 SHA-256 的受控自动更新。v1.0.4 不包含这条新链路，需要用户手动下载安装 v1.0.5 一次；之后可使用每日自动检查或设置页手动检查。发布中不包含旧 Tauri 私钥更新器的 `latest.json` 或 `.sig`。
