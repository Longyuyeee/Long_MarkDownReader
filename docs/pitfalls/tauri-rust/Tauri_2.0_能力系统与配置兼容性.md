# 坑点：Tauri 2.0 插件权限与配置向下兼容

> **技术关键词**：Tauri 2.0, Capabilities, serde_json, 插件权限, 向下兼容性

## 1. Tauri 2.0 能力系统 (Capabilities)
**现象**：在前端调用 `isEnabled()` 等插件 API 时，浏览器控制台报错 `autostart.is_enabled not allowed`。
**原因**：Tauri 2.0 引入了极其严格的权限管控。即使在 Rust 端注册了插件，如果未在 `src-tauri/capabilities/default.json` 中显式授权，前端调用仍会被拦截。
**方案**：在 `permissions` 数组中添加对应的插件权限标识，如 `"autostart:default"`。

## 2. 结构体变更导致配置丢失
**现象**：向 `AppConfig` 增加新字段（如 `exit_strategy`）后，原有用户的配置文件无法读取，导致软件回退到默认设置，旧数据“丢失”。
**原因**：`serde_json` 在解析 JSON 时，如果 JSON 中缺少结构体定义的字段，会抛出错误并导致整个解析过程失败。
**方案**：
- 使用 `#[serde(default)]` 属性。
- 为复杂默认值定义辅助函数，如 `#[serde(default = "default_exit_strategy")]`。
- 这样当读取旧版本 JSON 时，缺失字段会自动使用默认值补全，确保平滑升级。
