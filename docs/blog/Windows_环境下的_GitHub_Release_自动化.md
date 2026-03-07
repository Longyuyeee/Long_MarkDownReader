# 工程化实践：在 Windows 环境下实现稳定的 Release 自动化

> **技术关键词**：GitHub API, Release 自动化, 二进制资源上传, PowerShell, 字符转义 (Escape), CI/CD

在持续集成（CI）和自动化发布流程中，利用 GitHub API 自动创建 Release 并上传二进制资源（如 .exe）是提升分发效率的关键。但在 Windows 终端环境下，这一过程往往充满挑战。

### 1. 现象描述
在尝试使用 `curl` 命令行调用 GitHub API 时，如果提交的内容包含中文、嵌套双引号或多行更新日志，命令行经常返回 `400 Bad Request` 报错。此外，直接上传大型二进制文件也时常因为字符编码问题导致文件损坏。

### 2. 原因分析
核心冲突在于 Windows 终端（PowerShell 或 CMD）与 Linux 风格命令行工具对**转义字符（Escape Characters）**的处理差异：
- **引号地狱**：JSON 格式要求使用双引号，而命令行传递字符串也需要双引号，这种嵌套在 Windows 下极易解析失败。
- **编码干扰**：中文字符在不同的 Shell 编码（GBK vs UTF-8）下传输，会导致 API 端解析出的内容变成乱码。

### 3. 解决方案
为了构建一个“工业级”稳健的自动化脚本，我们采取了以下最佳实践：
1. **文件中转法（Payload-to-File）**：
   不直接在命令行拼接复杂的 JSON 字符串。而是先由程序（或脚本）生成一个标准的 UTF-8 编码 JSON 文件，然后使用 `curl --data-binary "@filename.json"` 引用该文件。这彻底规避了 Shell 对引号的转义干扰。
2. **二进制流上传（Octet-stream）**：
   对于 `.exe` 或 `.msi` 资源的上传，使用 PowerShell 的 `Invoke-RestMethod`。通过 `[System.IO.File]::ReadAllBytes` 将文件读取为字节数组，并设置 `Content-Type: application/octet-stream`，确保数据在传输过程中不经过任何字符集转换。

### 4. 经验总结
自动化流程的终极目标是“幂等性”和“稳定性”。在跨平台（Windows 环境操作 Linux 风格 API）开发时，**“以文件代替字符串参数”**是解决转义逻辑冲突、确保数据原汁原味传输的最优解。
