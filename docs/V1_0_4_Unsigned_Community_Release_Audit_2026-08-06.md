# v1.0.4 无签名社区发布审计

状态：**已发布并完成远端附件复核**
渠道：`community-unsigned`
企业候选边界：`releaseCandidate=false`
发布方式：**手动下载安装**

## 审计结论

v1.0.4 的产品构建、Rust 锁定检查、本地 MSI/NSIS 产物和隔离 Windows 安装生命周期均已通过。GitHub Actions 运行 `31062756515` 绑定源码提交 `2b5d4d750da0f3e3ee913a4cc461784ffa8ea947`，完成 18/18 生命周期、15/15 安装态功能和 11/11 路由检查。

公开候选附件为：

| 附件 | SHA-256 | 签名 |
| --- | --- | --- |
| `LongEdit_1.0.4_x64-setup.exe` | `cd68e19d9daab198f9bca7f97d3eeb432314f5f3e7895295845e7b48d4b29ff3` | `NotSigned` |
| `LongEdit_1.0.4_x64_zh-CN.msi` | `dacbd99ed0f6fe148bdecb99378cf49b4afd68f16e9dcc4b5492233b1e358ee9` | `NotSigned` |

## 发布边界

- 社区渠道允许无签名发布，但必须提示“未知发布者”并提供 SHA-256。
- 能力矩阵的 `releaseCandidate=false` 指企业签名候选未成立，不阻止经用户批准的无签名社区发布。
- 自动更新保持关闭，不发布 `latest.json` 或 `.sig`；原更新公钥不变。
- GitHub Release 已于 `2026-08-06T02:06:55Z` 发布，标签 `v1.0.4` 指向提交 `acfc86b937307eee70e8063884ef405ba2c0a7fa`。
- 已从 Release 重新下载三个公开附件：NSIS 与 MSI 哈希均与候选清单一致，`SHA256SUMS.txt` 的 SHA-256 为 `e119688e4cde6520a4ccf8463d7e4b5e6e2a33d5a0c5ec428333b24e034b0c52`。
- 正式发布地址：<https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.4>
