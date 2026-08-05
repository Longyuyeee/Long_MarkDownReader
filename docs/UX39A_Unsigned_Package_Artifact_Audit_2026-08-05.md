# UX-39A v1.0.4 无签名安装包产物审计

状态：**本地产物审计通过，隔离安装回归已派发**  
版本：`v1.0.4`  
源码提交：`efe03d21f9dfbaa2e0005b5508669a55fb9b8c4f`

## 审计结论

`npm run build:ux39-unsigned` 已完成前端类型检查、生产构建、Rust release 构建以及 MSI/NSIS 封装。主程序与 NSIS 的文件版本、产品版本均为 `1.0.4`，两个安装器文件名也与目标版本一致；本轮不再沿用或发布旧 `1.0.3` 产物。

本轮保持无签名社区构建边界：主程序、MSI、NSIS 的 Authenticode 状态均为 `NotSigned`，没有生成 `latest.json` 或 `.sig`，不得据此宣称企业签名或应用内自动更新已经恢复。

## 产物

| 目标 | 大小 | SHA-256 |
| --- | ---: | --- |
| `tauri-app.exe` | 86,062,592 B | `bd85c8ef368fea8e8d45ee46c13f463cdbd7a20375e860a1af7cb59b2fd57f0e` |
| `Long编辑_1.0.4_x64_zh-CN.msi` | 58,384,384 B | `0bcb813cd20d7561eae94cc9bfe7050eb56de819b4fba8cafd4bfd72218c09b6` |
| `Long编辑_1.0.4_x64-setup.exe` | 53,529,193 B | `21214f91ac3c9499f0b44e13e45a76a82f8353ff7b47af8b45c2c0664369eaa9` |

安装器二进制保留在被 Git 忽略的 `src-tauri/target/release/bundle`，仓库只提交可复核清单，不提交大体积产物。

## 运行边界

本机已有 `E:/Long/Long编辑/tauri-app.exe` 正在运行。为避免关闭用户实例或污染现有资料库，未强行启动本地 release 候选；该状态记录为 `deferred-existing-single-instance`，不能冒充便携运行通过。

第一次一次性 Windows 安装生命周期运行 `30989527026` 成功构建 v1.0.4，但在无人值守 WebView2 从 Canvas 跳转格式能力页时发现路由遮罩仅依赖动画帧、后台窗口可能无法收尾的问题。产品已加入带路由代次保护的 250ms 兜底，并由提交 `efe03d21f9dfbaa2e0005b5508669a55fb9b8c4f` 重新构建。

修复后的隔离安装回归已派发为 GitHub Actions 运行 `30992573469`。下一步等待执行器完成后导入安装态证据，复核控制台弹窗、安装态界面一致性、升级/卸载恢复和代表性格式路径；通过前 `releaseCandidate=false`，不创建 v1.0.4 Release。
