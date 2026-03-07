# 坑点：GitHub API 自动化发布与资源上传

> **技术关键词**：GitHub API, Release Assets, PowerShell, cURL, 字符转义, 二进制流

## 1. 复杂字符串在命令行中的转义
**现象**：直接使用 `curl -d "{...}"` 在 PowerShell 或 CMD 中由于换行符和中文引号导致解析失败（400 Error）。
**原因**：Windows 终端对双引号内部的嵌套字符处理极度复杂且不统一。
**方案**：**使用文件引用。** 先将 JSON 数据写入 `temp.json`，然后使用 `curl --data-binary "@temp.json"`。这是目前最稳定、最能保证格式不乱码的方式。

## 2. 二进制资源上传
**现象**：普通的 `POST` 请求无法上传 `.exe` 附件。
**原因**：GitHub Release Assets 必须使用 `uploads.github.com` 域名，且 `Content-Type` 需设为 `application/octet-stream`。
**方案**：
- 使用 PowerShell 的 `[System.IO.File]::ReadAllBytes` 读取文件。
- 使用 `Invoke-RestMethod` 发送字节流到 `upload_url`。
- 注意 URL 中的 `?name=filename` 参数必须与实际文件名一致。
