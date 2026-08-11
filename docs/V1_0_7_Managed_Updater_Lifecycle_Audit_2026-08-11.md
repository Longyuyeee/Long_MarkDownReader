# v1.0.7 受控更新生命周期审计

状态：**托管应用内更新已通过，11/11 检查与截图证据均已复核**

## 执行结论

- GitHub 托管 Windows 运行 [`31458701294`](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/31458701294) 成功，绑定执行器提交 `c33114edc0a4dd821cb4387627cb9dd52300a3de`。
- 官方 `v1.0.6` 安装后，应用内检查正确发现 `v1.0.7`；确认前没有下载或启动安装器。
- 用户确认后下载的 `LongEdit_1.0.7_x64-setup.exe` SHA-256 为 `cabf41af31d2a35a2d9edaba679d35365265bc5f5b9f5f6216e98e55d4aad644`，与官方 GitHub Release 一致。
- 同目录静默覆盖、v1.0.7 首启、设置页“当前已是最新版本”均通过。
- 覆盖安装和卸载后，合成资料库与配置标记均保留；没有使用真实用户资料。
- 更新发现、确认边界、哈希校验、覆盖安装、首启、最新版状态和资料保留共 11 项检查全部通过，失败 0 项。

## 证据复核

- 三张关键截图已人工复核：更新可用、安装进行中、升级后当前版本。文字、按钮、版本号和状态均清晰，没有发现遮挡或错误状态。
- 安装态 `tauri-app.exe` 为 87,534,592 字节，SHA-256 为 `d71fa8a80ae250f58c6de5e48d8c610c3403e730d244eefdfd13a8d0f5b6ed34`，签名状态为 `NotSigned`。
- 安装态程序与本地独立 release 构建参考哈希不同；NSIS 封装不是确定性构建，本次信任锚为已核验的官方 NSIS 附件，不把两者哈希不同判定为更新失败。
- 九份脱敏原始证据与导入清单位于 `docs/evidence/v1.0.7-managed-updater/`，仓库门禁会校验每份文件的字节数与 SHA-256。

## 隔离与边界

- 测试只在 GitHub 托管 Windows 一次性环境运行，并同时提供 `ConfirmDisposableMachine` 与 `AllowInstallerMutation`。
- 工作流只下载公开 Release 资产，不重建产品，不接触本机 LongEdit，也不包含用户文档正文。
- 当前安装包仍为 `NotSigned`，可能触发“未知发布者”或 SmartScreen；本结论不构成企业签名或商业发布资格。
- Excel/WPS/LibreOffice 三生产者动态数组写回继续等待外部证据，复杂 Office 写回保持 fail-closed，不影响 v1.0.7 社区版收口。

## 收口结论

`v1.0.6 -> v1.0.7` 应用内受控更新链已完成。v1.0.7 在当前可执行范围内没有剩余发布阶段；后续只在出现可复现回归或新增真实生产者证据时继续开发。
