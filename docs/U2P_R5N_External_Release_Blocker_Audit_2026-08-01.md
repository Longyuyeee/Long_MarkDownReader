# U2P / R5N 外部发布阻断审计与执行交接

日期：2026-08-01

结论：仓库内可执行的未签名安装、编辑、管理恢复和证据防伪链路已经完成。正式发布仍被外部签名与真实 Windows 客户端条件阻断，当前必须保持 `releaseCandidate=false`、`promotionEligible=false`。

## 当前环境事实

`docs/evidence/r5n-external-release/environment-audit.json` 已重新生成，结果为：

- Windows Sandbox：不可用；
- Hyper-V `New-VM`：不可用；
- `vmcompute` 服务：存在且运行，但单独存在不足以创建合格客户端；
- Windows SDK `signtool.exe`：不可用；
- 当前用户证书库中带私钥且未过期的代码签名证书：0；
- Windows 10 x64 一次性 runner：未提供；
- Windows 11 x64 一次性 runner：未提供。

最终准备审计还确认签名安装包清单、两个签名客户端运行通道和人工批准均缺失。3/3 不安全转换测试通过：未签名清单、缺失双通道或自动门禁未通过时都不能生成有效发布批准。

## 接手执行顺序

1. 在隔离签名环境安装 Windows SDK，并配置受信任代码签名证书与时间戳服务；不得把私钥、证书主题或凭据提交到仓库。
2. 对同一冻结产品提交构建 MSI 与 NSIS，签名并执行 `npm run capture:r5n-signed-installer-manifest`，生成只含证书 SHA-256 指纹和产物摘要的清单。
3. 分别在真实 Windows 10 x64 与 Windows 11 x64 一次性客户端执行 `scripts/run-r5i-isolated-install-lifecycle.ps1 -RequireSignedArtifact`。
4. 分别导入 `signed-windows-10-x64` 和 `signed-windows-11-x64` 证据；错误系统类别、源码提交或安装包摘要必须拒绝。
5. 执行 `npm run audit:r5n-release-promotion-readiness`。只有自动门禁全部通过后，授权发布负责人才能运行 `npm run approve:r5n-release`。
6. 再次执行 R5N 准备审计与完整 CI；人工批准仍不会自动把产品提升为 RC，最终提升应作为单独、显式且可审计的提交。

## 不可替代的边界

GitHub `windows-latest` 的 Windows Server 2025 证据已经足以关闭通用未签名工程链路，但不等于 Windows 10/11 客户端证据。自签名测试证书也不等于正式信任链。没有外部 runner 和批准签名材料时，继续在仓库内制造“通过”文件会破坏证据可信度，因此此处是实际依赖阻断，不是待补代码缺陷。
