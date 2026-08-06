# UX-39A v1.0.4 无签名安装包产物审计

状态：**产物与托管安装回归通过**
版本：`v1.0.4`
源码提交：`2b5d4d750da0f3e3ee913a4cc461784ffa8ea947`

## 审计结论

`npm run build:ux39-unsigned` 已完成前端类型检查、生产构建、Rust release 构建以及 MSI/NSIS 封装。主程序与 NSIS 的文件版本、产品版本均为 `1.0.4`，两个安装器名称与目标版本一致。

最终本地产物：

| 目标 | 大小 | SHA-256 |
| --- | ---: | --- |
| `tauri-app.exe` | 86,062,592 B | `85acb595da2b345d0ce637543f497501e21f210ed2cee412aed91e62483fee5d` |
| `Long编辑_1.0.4_x64_zh-CN.msi` | 58,384,384 B | `dacbd99ed0f6fe148bdecb99378cf49b4afd68f16e9dcc4b5492233b1e358ee9` |
| `Long编辑_1.0.4_x64-setup.exe` | 53,554,162 B | `cd68e19d9daab198f9bca7f97d3eeb432314f5f3e7895295845e7b48d4b29ff3` |

三个文件均为 `NotSigned`，没有生成 `latest.json` 或 `.sig`。安装器二进制保留在 Git 忽略目录，仓库只提交可复核清单。

## 安装回归

前两次托管运行暴露并帮助修复了后台路由动画兜底与发布能力版本冲突。最终 GitHub Actions 运行 [31062756515](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31062756515) 对冻结源码提交完成验证：18/18 安装生命周期、15/15 安装态功能和 11/11 路由挂载全部通过。

详细安装态结论见 [`UX39B_Installed_Lifecycle_Closure_Audit_2026-08-06.md`](./UX39B_Installed_Lifecycle_Closure_Audit_2026-08-06.md)。
