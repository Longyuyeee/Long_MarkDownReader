# v1.0.6 无签名社区版发布审计

状态：**v1.0.6 社区版已发布，Tag、Release 与三项远端附件均已复核**

渠道：`community-unsigned`

冻结产品提交：`9349c334b22753dacd0a58fad7f1ce55aa0bf6dc`

## 需求对齐

- EA-5C 已对 43 类格式完成外部打开边界审计：29 类直接编辑、8 类只读预览、6 类显式转换或系统打开。
- 37 类格式、85 个扩展名可以由用户逐项加入 Windows 默认应用候选；安装不会静默接管全部格式。
- 外部编辑仍遵守“只改草稿，点击保存才写回源文件”，并保留撤销/重做、冲突保护与单实例文件转交。
- `v1.0.6` 是当前公开稳定版；README 下载入口只指向已经复核的正式附件。

## 质量与构建

- 本地 `npm run ci:patch-release` 完整通过，用时约 345 秒；Vite 处理 6225 个模块，Rust 锁定检查编译 `tauri-app v1.0.6`，生产依赖审计为 0 个漏洞。
- GitHub Quality Gate 运行 [`31392652689`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31392652689) 通过并绑定冻结产品提交。
- 候选证据提交 `257c12e1795e9de2d5629e8053cbeaa1fb802cc8` 的完整 Quality Gate 运行 [`31399100657`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31399100657) 再次通过。
- 本地 `npm run build:ux39-unsigned` 完成前端、Rust release、MSI 与 NSIS 构建，用时约 1116 秒。

| 产物 | 字节数 | SHA-256 | 签名 |
| --- | ---: | --- | --- |
| `tauri-app.exe` | 87,552,512 | `d8d22c9805d3edd9eabb3536dd209cd9e3f26e42310afaab3053b5b9d5a1b9ac` | `NotSigned` |
| `LongEdit_1.0.6_x64_zh-CN.msi` | 58,814,464 | `ae93e0217c7f8df6cba09ac29541d2792b1203a8750de69793af6eecff272114` | `NotSigned` |
| `LongEdit_1.0.6_x64-setup.exe` | 53,839,365 | `e65d374732ef7f8777df25fb82e7dec1161165fd87f91c93db21cca647bfb36c` | `NotSigned` |

`SHA256SUMS.txt` 为 190 字节，自身 SHA-256 为 `1dc8570d4550a739b405fc9dcd019a807f72e925f56607b207146fb43dd35348`。安装包保存在被 Git 忽略的发布目录，不提交二进制到源码仓库。

## 安装态审计

- GitHub 托管 Windows 生命周期运行 [`31394967949`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31394967949) 通过，用时约 30 分钟。
- 22/22 安装、升级、关联、回退、卸载及资料保留检查通过；18/18 安装态工作区检查通过。
- 已验证 Unicode/空格路径冷启动、已有实例的二次文件转交，以及 OPML、PNG、AVIF 被用户选择后成为候选而 JSON 保持未接管。
- 托管 runner 生成的 NSIS 哈希为 `2fc770380e08a5b8733fdced9d4919ae5aadf01aeaa2674f1773c8c493758361`。它与本地 NSIS 分别绑定同一冻结源码；安装器封装并非确定性构建，因此不要求二者哈希相同。
- 本机已有 LongEdit 单实例在运行，本次未终止用户进程、未执行本机安装器；本地运行冒烟如实记录为 `blocked-existing-single-instance`，由托管安装生命周期补足当前版本的安装态验证。
- 核心脱敏证据位于 `docs/evidence/v1.0.6-release/`，不含用户资料正文或发布二进制。

## 发布回执

- GitHub Release [`v1.0.6`](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.0.6) 编号为 `367990618`，发布时间为 `2026-08-10T14:43:31Z`。
- 轻量 Tag `v1.0.6` 与 Release 目标均绑定候选证据提交 `257c12e1795e9de2d5629e8053cbeaa1fb802cc8`。
- 公开 NSIS、MSI 与 `SHA256SUMS.txt` 已下载到独立私有目录复核；三项名称、字节数和 SHA-256 与本地候选全部一致。
- 结构化远端回执位于 `docs/evidence/v1.0.6-release/release-receipt.json`。

## 发布边界

- 当前 `releaseCandidate=true` 只表示用户批准的无签名社区渠道已经发布并通过附件复核。
- `release-capability-matrix` 与托管证据中的企业候选仍为 `releaseCandidate=false`；不得宣称 Authenticode、未知发布者提示消失或企业签名完成。
- v1.0.4 及更早版本没有受控更新链，升级时必须手动下载安装 v1.0.6；v1.0.5 才是应用内受控更新观察的起点。
- 不发布旧 Tauri 私钥链要求的 `latest.json` 或 `.sig`。社区更新继续使用 GitHub Release、固定资产命名和 SHA-256 校验。
- `1.0.5 -> 1.0.6` 应用内受控更新观察必须在 Release 发布后进行，当前仍是待验证项。

## 下一步

1. 提交并推送发布回执与 README，等待回执提交的远端 Quality Gate。
2. 在不会干扰用户现有进程和资料的测试环境中，单独执行 `1.0.5 -> 1.0.6` 应用内发现、确认、下载、校验、覆盖安装与资料保留观察。
3. 继续收集系统视频解码器差异；后续 Excel/Office 增强保持现有能力边界，不扩大未经验证的公开承诺。
