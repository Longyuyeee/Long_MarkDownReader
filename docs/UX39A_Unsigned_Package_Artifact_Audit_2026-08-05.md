# UX-39A v1.0.4 无签名安装包产物审计

状态：**本地产物审计通过，隔离安装回归已派发**  
版本：`v1.0.4`  
源码提交：`1bec2972958a455300f904140daa1a13cabc47f8`

## 审计结论

`npm run build:ux39-unsigned` 已完成前端类型检查、生产构建、Rust release 构建以及 MSI/NSIS 封装。主程序与 NSIS 的文件版本、产品版本均为 `1.0.4`，两个安装器文件名也与目标版本一致；本轮不再沿用或发布旧 `1.0.3` 产物。

本轮保持无签名社区构建边界：主程序、MSI、NSIS 的 Authenticode 状态均为 `NotSigned`，没有生成 `latest.json` 或 `.sig`，不得据此宣称企业签名或应用内自动更新已经恢复。

## 产物

| 目标 | 大小 | SHA-256 |
| --- | ---: | --- |
| `tauri-app.exe` | 86,062,592 B | `3a43abf67a74000aa3f87e60ed0f0af94f967102439ee5969aefde77445b54e9` |
| `Long编辑_1.0.4_x64_zh-CN.msi` | 58,384,384 B | `669cd81a5983503a1dcb9876305f325a7dc7c2cdadb78573a3706f39f56e55e4` |
| `Long编辑_1.0.4_x64-setup.exe` | 53,542,875 B | `8754e0ccb63c0027a6201b1de4feffcb4590cc76f96ddfc63c815af83577cb8f` |

安装器二进制保留在被 Git 忽略的 `src-tauri/target/release/bundle`，仓库只提交可复核清单，不提交大体积产物。

## 运行边界

本机已有 `E:/Long/Long编辑/tauri-app.exe` 正在运行。为避免关闭用户实例或污染现有资料库，未强行启动本地 release 候选；该状态记录为 `deferred-existing-single-instance`，不能冒充便携运行通过。

一次性 Windows 安装生命周期已派发到 GitHub Actions 运行 `30989527026`，绑定同一源码提交。下一步等待执行器完成后导入安装态证据，复核控制台弹窗、安装态界面一致性、升级/卸载恢复和代表性格式路径；通过前 `releaseCandidate=false`，不创建 v1.0.4 Release。
