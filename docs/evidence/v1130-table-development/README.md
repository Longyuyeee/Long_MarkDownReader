# 1.1.30 针对性开发证据

`browser/result.json`：实际 TableView，9 项页面流程，六种风格截图；`workbook/result.json`：实际 WorkbookView，3 项流程，含可信剪贴板输入。两者使用模拟原生 IPC，不作为安装器通过证据。

`native-rules.log`：3 项 Rust 真实文件保存、读取、格式升级、CSV 副本及精确数值边界测试。`rule-tests.log`：5 项规则、稳定行纠错、一次撤销、XLSX 共用输入及原生测试表达式契约。

`quality-initial.log` 保留完整构建通过后字号检查的首次失败；规则入口改用统一字号后，`quality-resumed.log` 从失败项开始完成全部剩余检查（含 cargo check 和依赖检查），没有重复运行已通过的构建。远端固定源码会重新执行完整命令。正式构建及原包安装工作流另存各自 run ID 目录。自有样例，不含用户内容。
