# 同包复核：功能与字节断言通过，输入事件归类失败

[运行 39511993026](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39511993026) 使用最终产品 `eba705bce78744fa20d30a7acad422d7297f0ef1` 的原安装器。七项操作及未保存正文、延迟单次撤销/重做、其他草稿、原始文件与关系精确字节断言均通过；最终严格输入检查拒绝三条 `trusted:false` 的 click 事件，整轮失败，不作为通过证据。

已核对 Vditor 源码 `node_modules/vditor/src/ts/util/editorCommonEvent.ts` 第 227—229 行：真实快捷键会向工具栏发送 CustomEvent。原始 trace 的三条非可信 click 紧随命令、撤销、重做快捷键；非可信事件不是驱动直接派发的输入。测试改为真实点击界面上的命令、撤销和重做按钮，继续保留严格的所有输入可信断言、等待历史队列与完整字节核对，不过滤失败事件、不修改产品。必须重新运行同一个安装包。

原始失败报告、日志、截图和六份字节输出完整保留在本目录。
