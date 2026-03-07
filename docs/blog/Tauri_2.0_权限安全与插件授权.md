# 解析 Tauri 2.0 的能力系统（Capability）与权限管控

> **技术关键词**：Tauri 2.0, Capability 系统, 权限管控 (Permissions), 安全模型, 自启动插件 (Autostart)

在将项目从 Tauri 1.0 迁移或直接使用 2.0 开发时，开发者遇到的第一个显著变化通常是权限报错。

### 1. 现象描述
在集成 `tauri-plugin-autostart`（自启动插件）后，前端调用其 API 时，浏览器控制台会抛出类似 `autostart.is_enabled not allowed` 的错误。即便 Rust 后端已经正确初始化了插件，前端依然无法获取权限。

### 2. 原因分析
Tauri 2.0 引入了一套全新的安全模型——**Capability（能力）系统**。
- **1.0 模式**：通过 `tauri.conf.json` 中的 `allowlist` 进行全局权限配置。
- **2.0 模式**：权限被细分到了具体的窗口和具体的指令。每一个窗口（Window）能执行哪些插件指令，必须在 `src-tauri/capabilities` 目录下的 JSON 文件中显式定义。

这种设计是为了防止“权限越界”：即应用中的某个小窗口如果被攻击，攻击者也无法调用主窗口才拥有的敏感系统接口。

### 3. 解决方案
在 `src-tauri/capabilities/default.json`（或对应的权限定义文件）中，将所需的插件权限加入 `permissions` 数组：

```json
{
  "permissions": [
    "core:default",
    "autostart:default", // 显式授权自启动插件
    "dialog:default"
  ]
}
```

### 4. 经验总结
在 Tauri 2.0 环境下，引入任何新插件或调用系统底层接口前，**“先授权，再调用”**是标准的开发工作流。如果遇到 API 无响应或权限报错，应首要检查 `capabilities` 配置文件。
