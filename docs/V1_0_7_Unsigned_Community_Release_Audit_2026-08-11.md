# v1.0.7 无签名社区版发布审计

状态：**v1.0.7 社区版已发布，远端附件与 v1.0.6 -> v1.0.7 更新链均已复核**

渠道：`community-unsigned`

冻结产品提交：`7cd90c52e024b1d0232277cb33c1eb9d74aeb3a1`

## 需求对齐

- package、Cargo、Tauri、Windows 生命周期、性能、能力矩阵和社区发布策略统一为 `1.0.7`。
- 本版范围固定为 XLSX 经典错误值编辑、已有日期时间单元格编辑、按工作表的本地缓存值索引及索引容器安全预算。
- 索引不执行公式、不刷新外部数据、不访问外部连接，也不写源文件；宏执行与未验证复杂 Office 对象写回继续位于能力边界外。
- v1.0.6 的外部打开、逐格式默认应用和基础体验收口完整保留；README 在 Release 真正发布前不提供失效的 v1.0.7 下载入口。

## 质量与构建

- 本地 `npm run ci:patch-release` 与 Rust 专项测试全部通过；GitHub Quality Gate 运行 [`31452738912`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31452738912) 通过并绑定冻结提交。
- 候选证据提交经证据字节属性修复后，完整 Quality Gate 运行 [`31456635064`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31456635064) 再次通过。
- 本地 `npm run build:ux39-unsigned` 完成前端、Rust release、MSI 与 NSIS 构建，用时约 1055 秒。

| 产物 | 字节数 | SHA-256 | 签名 |
| --- | ---: | --- | --- |
| `tauri-app.exe` | 87,534,592 | `7777b5e786f595a4cb7bceeb9127daa3b96bfb91ae0c657c841d855b65b22aaf` | `NotSigned` |
| `LongEdit_1.0.7_x64_zh-CN.msi` | 58,818,560 | `f9bb82adcc64979f5acc5535a942363dd970b075f6d4209b15d402743a776b70` | `NotSigned` |
| `LongEdit_1.0.7_x64-setup.exe` | 53,823,283 | `cabf41af31d2a35a2d9edaba679d35365265bc5f5b9f5f6216e98e55d4aad644` | `NotSigned` |

`SHA256SUMS.txt` 为 190 字节，自身 SHA-256 为 `701bdffd52964b60f4604f3bcbfb303d87bea15202c8ad15a38c79d04176e1d8`。安装包保存在被 Git 忽略的发布目录，不提交二进制到源码仓库。

## 安装态审计

- GitHub 托管 Windows 生命周期运行 [`31453750795`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31453750795) 通过，用时约 30 分钟。
- 22/22 安装、升级、关联、回退、卸载及资料保留检查通过；18/18 安装态工作区检查通过。
- 托管 runner 生成的 NSIS 哈希为 `d65c836f17d3a01b755597c5dd9eac79121538ce8695851222fa127266274620`。它与本地 NSIS 分别绑定同一冻结源码；安装器封装并非确定性构建，因此不要求二者哈希相同。
- 本机已有 LongEdit 单实例在运行，本次未终止用户进程、未执行本机安装器；本地运行冒烟如实记录为 `blocked-existing-single-instance`，由托管安装生命周期补足当前版本安装态验证。
- 核心脱敏证据位于 `docs/evidence/v1.0.7-release/`，不含用户资料正文或发布二进制。

## 发布回执

- GitHub Release [`v1.0.7`](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.7) 编号为 `368323686`，发布时间为 `2026-08-11T03:58:19Z`。
- 轻量 Tag `v1.0.7` 与 Release 目标均绑定已通过门禁的候选证据提交 `46128430c5eda3c1638097994b572df98cababd6`。
- 公开 NSIS、MSI 与 `SHA256SUMS.txt` 已下载到独立私有目录复核；三项名称、字节数和 SHA-256 与本地候选全部一致。
- 结构化远端回执位于 `docs/evidence/v1.0.7-release/release-receipt.json`。

## 受控更新审计

- GitHub 托管 Windows 运行 [`31458701294`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31458701294) 从官方 v1.0.6 安装态完成应用内更新到 v1.0.7。
- 11/11 检查通过：更新发现、用户确认边界、官方 NSIS SHA-256、同目录覆盖、升级首启、最新版状态及覆盖/卸载后的合成资料保留均成立。
- 三张关键截图已人工复核，九份脱敏证据位于 `docs/evidence/v1.0.7-managed-updater/`，每份文件均由字节数与 SHA-256 门禁保护。

## 发布边界

- `v1.0.7` 是当前公开稳定版，README 下载入口只指向已经复核的正式附件。
- 当前社区策略中的 `releaseCandidate=true` 只表示用户批准的无签名社区渠道已经发布并通过附件复核；能力矩阵与托管证据中的企业签名候选仍为 `releaseCandidate=false`。
- v1.0.4 及更早版本需要手动下载安装 v1.0.5 或更高版本后，才能进入受控应用内更新链。
- 安装包无 Authenticode 商业签名，必须保留未知发布者提示和 SHA-256 校验说明。
- 不发布旧 Tauri 私钥链要求的 `latest.json` 或 `.sig`；受控更新使用固定 GitHub Release 与附件摘要。
- 宏执行、外部数据刷新、未验证复杂 Office 对象写回和企业签名不属于本补丁承诺。

## 收口结论

v1.0.7 在当前可执行范围内已完成发布、远端附件复核、安装生命周期和应用内更新链验收。没有新的可复现回归时，不再增加补丁内功能；外部生产者证据和企业签名继续作为独立边界管理。
