# U2E 已安装 CodeMirror 输入审计

日期：2026-08-01

状态：`input-assertion-remediated-awaiting-rerun`

发布状态：`releaseCandidate=false`

## 第五轮结果

第五轮 U2（run `30659549859`）证明 U2D 的 AppId 策略解析修正有效：已安装 0.7.0 Release 应用启动、WebView2 CDP 连接、应用初始化、右侧 Library TXT 工作面加载及初始 TXT 内容读取均已通过。流程首次进入真实编辑动作，在 `CodeMirror document replacement` 断言超时。

该失败不是安装包无法启动，也不是 TXT 无法打开。输入脚本使用 `innerText` 与目标字符串严格全等；CodeMirror 以多个 `.cm-line` 块表达文档，浏览器可在 `innerText` 末尾增加换行，导致已输入内容仍无法满足严格断言。

## 修正

- 保留原严格相等检查，同时允许仅移除结尾换行后相等；不使用全局 `trim()`，避免掩盖正文开头或行内空白损坏。
- 后续磁盘标记检查、离开工作面、重新打开和内容复读保持不变，因此放宽 DOM 表示差异不会绕过真实保存验证。
- WebView2 策略清理从 PowerShell 泛型列表数组转换改为按索引逆序迭代，消除 `Argument types do not match`，确保失败路径也能可靠清理。

下一轮继续执行 TXT 保存重开、JSON 保存重开、代表路由、性能证据、备份/索引、降级拒绝、卸载、回滚和恢复。
