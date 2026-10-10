# v1.0.25 发布记录

范围冻结：搜索、预览、定位、返回、固定参考与带来源摘录。

当前状态：候选构建与安装流程检查中，尚未公开发布。旧版证据不作为本版通过依据。

发布通道 community-unsigned，企业推广标志保持 releaseCandidate=false。安装包可能出现未知发布者提示；自动更新失败时支持手动下载安装，并提供 SHA-256 校验。

真实 Tauri 调试流程已修复 Windows canonical 路径摘录和窄窗残留分隔条问题；宽窄截图已经人工检查。依赖更新为 Vue 3.5.43、DOMPurify 3.4.16、source-map-js 1.2.2，Mermaid 保留 11.16.1，仅覆盖 KaTeX 到修复版 0.18.2。生产依赖审计为 0 项。最终依赖构建与安装包验证仍在执行。

最终依赖版本的真实 Tauri 流程 8 项通过：固定参考、摘录来源、跨搜索保留、窄窗无遮挡、Markdown 多处跳转、粘贴后来源跳转、无全局错误遮罩和源文件未被自动保存。截图：`docs/evidence/v125-search-flow/reference-wide.png`、`reference-narrow.png`；二者均已查看。剪贴板测试捕获实际复制内容，未改动用户系统剪贴板。
