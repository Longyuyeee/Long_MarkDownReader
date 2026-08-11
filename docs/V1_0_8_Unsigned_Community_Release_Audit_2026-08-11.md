# v1.0.8 无签名社区版发布审计

状态：**冻结构建、质量门与托管安装生命周期已通过，候选可进入发布门禁**

渠道：`community-unsigned`

企业签名候选边界：`releaseCandidate=false`；本次社区补丁不宣称真实签名或企业候选成立。

## 当前结论

- package、Cargo、Tauri、Windows 生命周期、性能、能力矩阵和社区发布策略统一提升为 `1.0.8`。
- 本版范围固定为 10 个代码/Web 格式族主动创建、自动更新安装后重启，以及 37 类外部编辑/预览格式的独立顶层窗口。
- UX-51 已在真实 Tauri WebView2 中同时验证主资料库、外部 TXT 与外部 JSON，主窗口未被占用且运行时错误为 0。
- 冻结产品提交 `b963b2b3a9abe6d1b45bcd8c8fb8fd967e45f561` 的 Quality Gate [`31478234776`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31478234776) 已通过。
- 本地 EXE、MSI 与 NSIS 均为 `1.0.8`、`NotSigned`；GitHub 托管安装生命周期 [`31482508935`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31482508935) 完成 22/22 生命周期和 18/18 安装态工作区检查。
- v1.0.7 的公开下载继续作为上一稳定版入口；v1.0.8 只有在本证据提交通过第二轮质量门后才创建 Release。

## 候选产物

| 产物 | 字节数 | SHA-256 | 签名 |
| --- | ---: | --- | --- |
| `tauri-app.exe` | 87,439,360 | `c06c60be0b214c75083255ae8cf50a174aa2ac3f69339649e0c3321d05116791` | `NotSigned` |
| `LongEdit_1.0.8_x64_zh-CN.msi` | 58,785,792 | `7ac53d4c0e5651ddef688e29107c83b006ec336b51323adc9662be42bb3b5e47` | `NotSigned` |
| `LongEdit_1.0.8_x64-setup.exe` | 53,789,070 | `3ff25f9a005a6ad7685d6545592395da297c34bf38efa81bd30d33c61b9c853b` | `NotSigned` |

`SHA256SUMS.txt` 为 190 字节，自身 SHA-256 为 `8c8fd5935054eace0af47e417f0ba768d17c0f78a06e185e711393f80cbc6eaf`。二进制保存在 Git 忽略的发布目录，不提交到源码仓库。

本机已有一个 LongEdit 实例在运行，本次未终止用户进程、未启动候选 EXE、未执行本机安装器；本机运行冒烟据实记录为 `blocked-existing-single-instance`。安装态结论由一次性 Windows runner 提供，证据位于 `docs/evidence/v1.0.8-release/`，不含用户资料正文。

## 发布顺序

1. 提交当前候选证据并通过第二次 Quality Gate。
2. 创建 `v1.0.8` GitHub Release，上传 NSIS、MSI 与 `SHA256SUMS.txt`，再从远端下载逐项复核名称、大小和哈希。
3. 使用官方 v1.0.7 与 v1.0.8 Release 验证应用内发现、确认、下载校验、覆盖安装、自动重启和资料保留。

## 发布边界

- `v1.0.8` 尚未发布，当前公开稳定版仍为 `v1.0.7`。
- v1.0.4 及更早版本仍需先手动下载安装 v1.0.5 或更高版本，才能进入受控更新链。
- 安装包无 Authenticode 商业签名，必须保留未知发布者提示和 SHA-256 校验说明。
- 不发布旧 Tauri 私钥链要求的 `latest.json` 或 `.sig`；受控更新使用固定 GitHub Release 与附件摘要。
- 宏执行、外部数据刷新、未验证复杂 Office 对象写回和企业签名不属于本补丁承诺。
