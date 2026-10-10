# v1.0.26 跨格式复验

当前结论以 `cross-format.json` 和同目录截图为准。执行入口：`scripts/run-v126-cross-format.ps1`，仅使用临时资料库和独立 WebView 配置，不修改用户安装或资料。

- `pdf-reference.png`：页码框为 2/2，主区显示 Public Page Two，与右侧第 2 页参考一致。验收同时等待目标路由、页码框及第二页画布；不能仅以 URL 中的 page=2 判定通过。
- `plain-text.png`：普通文本在主区打开、右侧参考保留、命中切换至第二处。
- `attempt-1-initialization-failure.json`：早期尝试在资料库初始化完成前跳转而失败，保留失败记录；后续入口等待资料库和笔记实际加载后再开始操作。

证据级别为原生 Tauri Debug/WebView2，不是安装包验收。所有内容为合成测试数据。
