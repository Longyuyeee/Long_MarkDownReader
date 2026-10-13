# Vditor 空预览点击异常修复

用户报告：切换样式后出现 `showCode` 读取 `null.classList` 的未捕获异常。

## 定位与范围

- 本地 Vditor 3.11.2 的 `showCode` 直接读取 `previewElement.firstElementChild.classList`。
- 实际 Vue/Vditor 页面中，Markdown 的 HTML 注释 `<!-- comment -->` 会生成没有元素子节点的预览。派发该预览的点击事件可稳定复现同一异常；普通 HTML 元素和普通 fenced code 不触发该异常。
- 这证明空预览是一个真实触发条件，不证明用户当时的文档内容或某种样式是唯一原因。

## 修复

在 Vite 中为该精确依赖表达式补充空值判断，开发预构建与生产构建共用同一函数。不直接修改 node_modules，不添加伪造预览节点，不拦截全局错误，也不阻止正常事件。源码展开、选区与滚动逻辑保持原样。

依赖升级后若匹配不再唯一则直接报构建错误，要求重新审查，而不是静默遗漏补丁。所有通过项目构建导入的 Vditor 编辑器均获得修复；静态复制的第三方原始发行文件未改动。

## 回归证据

- `scripts/test-vditor-empty-preview.mjs`：真实 Vue/Vditor、模拟原生 IPC。四组主题/代码风格切换后，空预览点击可选择源码、普通代码块可实际点击编辑；模拟保存后 HTML 注释、正文与修改内容仍在，未捕获异常为零。
- 空注释预览无可点击面积，因此专门回归使用派发点击事件；普通代码通过浏览器点击和键盘输入验证。不得把此测试描述成完整原生窗口/磁盘验收。
- `scripts/test-document-inline-shortcuts.mjs`：编辑模式重建、内容保留、宽度/导出/历史快捷项与窄屏菜单回归通过。
- `npm run build` 通过（类型检查与生产构建），并检查生成的 `editor-vendor` 包确实含有该空值保护；`git diff --check` 通过。
- 页面截图已经查看：[修复后页面](evidence/v110-vditor-empty-preview/after.png)，[结果](evidence/v110-vditor-empty-preview/results.json)。

不提升版本、不发版；此项仅修复空预览异常，不宣称关闭所有样式相关问题。
