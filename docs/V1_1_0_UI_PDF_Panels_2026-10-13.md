# PDF 高级面板草稿保护

实际页面先复现：属性读取失败后输入标题，切换水印再返回属性，读取恢复成功时磁盘标题覆盖用户输入。修复首次读取/重试保留已有草稿，添加文档/资料库归属检查，迟到结果和错误不再回填其他文档。

`test-pdf-panel-drafts.mjs` 修复前失败（用户标题被替换），修复后通过；水印跨面板草稿、480px 操作可达通过，截图已查看。`test-pdf-redesign-browser.mjs` 完整页面回归通过，`test-office-handoff-browser.mjs` 也重新通过。均未生成 PDF 副本、未宣称原生输出验收。

外部 Markdown（TempMode）补保留窄窗口明确保存提示，`test-temp-redesign-browser.mjs` 通过实际编辑器渲染、大纲显示/隐藏和保存/导入入口检查。夹具使用 base URL 以加载真实 Vditor，不改变生产资源路径。

全页面复跑中的主导航、六种风格、历史页通过；日常工作流程在参考摘录插入后等待脏标记超时，仍在调查，不能宣称全页面完成。测试启动改为默认 Chromium 或可选 LONGEDIT_BROWSER_CHANNEL，仅解决本机 Edge 不存在的问题，不改变业务断言。
