# 系统凭据存储与 AI 密钥安全规范

状态：FR-BASE-003 已实现  
实现版本：keyring `3.6.3`（精确锁定）

## 1. 安全目标

API Key 不进入 `config.json`、localStorage、标签页状态或日志，也不从后端回传给前端。应用只向界面公开“是否已配置”的布尔状态。远程 AI 请求由 Rust 后端在发送前从操作系统凭据库读取 Key，并直接设置 Authorization 头。

## 2. 平台存储

- Windows：Credential Manager。
- macOS：Keychain Services。
- Linux：Secret Service。
- 服务标识固定为 `LongEdit Knowledge Workspace`，账户标识为 `ai-api-key`。

采用 keyring 3 的 `set_password`、`get_password` 与 `delete_credential` API，并显式启用各桌面平台后端。凭据调用放入阻塞任务，避免阻塞异步网络运行时。

## 3. 配置迁移

旧版 `config.json` 中的 `aiApiKey` 只用于一次性反序列化迁移：

1. 启动读取旧值。
2. 尝试写入系统凭据库。
3. 无论迁移是否成功，都以可靠写入方式从配置文件清除明文字段；失败时用户需要在设置页重新输入，软件不会为了可用性继续保留不安全副本。
4. `AppConfig` 对该兼容字段使用 `skip_serializing`，后续任何保存和 IPC 返回均不能输出它。

## 4. 使用边界

- 设置页不会回显已保存 Key；输入框只用于新增或替换，保存成功后立即清空。
- 删除凭据需要明确确认，配置文件中没有恢复副本。
- 非本机回环地址缺少凭据时拒绝请求。
- `localhost`、`127.0.0.1` 和 `::1` 可无 Key 调用，支持本地 Ollama 等兼容服务。
- Key 最长 8192 字符，拒绝空值与 NUL 字符。

## 5. 验收证据

- Rust 测试验证空值、NUL 和超长凭据被拒绝。
- 配置序列化测试验证明文值及 `aiApiKey` 字段均不出现，同时保留旧配置反序列化迁移能力。
- 前端生产构建验证 Vue/Pinia 不再包含或传递已保存 Key。
- 真实凭据的写入和删除不进入自动化测试，避免测试套件修改开发者的操作系统凭据库。

官方依据：[keyring-rs 3.6.3 使用说明](https://docs.rs/crate/keyring/3.6.3/source/README.md)、[Apple Keychain Services](https://developer.apple.com/documentation/Security/keychain-services)。
