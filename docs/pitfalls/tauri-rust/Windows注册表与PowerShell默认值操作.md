> **技术关键词**：Windows Registry, PowerShell, HKCU, File Association

### 现象
在 Windows 10/11 下设置默认文件关联失败，或在执行注册表脚本时抛出参数绑定验证异常。

### 原因分析
1. **权限策略**：旧版代码操作 `HKEY_CLASSES_ROOT` (HKCR)，这属于系统级操作，需要管理员权限且优先级低于用户自定义选择。
2. **命令语法陷阱**：PowerShell 的 `Set-ItemProperty` 不允许将 `-Name` 设为空字符串 `''`。在注册表中，默认值（Default Value）并不是一个名为 `''` 的键，而是一个无名属性。

### 解决方案
1. **路径重定向**：改用 `HKEY_CURRENT_USER\Software\Classes` (HKCU)，无需管理员权限即可对当前用户生效。
2. **命令优化**：使用 `Set-Item -Path $path -Value $value` 直接设置项的默认值，避开 `Set-ItemProperty` 的参数限制。