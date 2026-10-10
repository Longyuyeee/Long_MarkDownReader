# v1.0.25 发布记录

范围冻结：搜索、预览、定位、返回、固定参考与带来源摘录。

当前状态：v1.0.25 已正式发布，三个公开附件已回下载并核对大小及 SHA-256。旧版证据不作为本版通过依据。

发布通道 community-unsigned，企业推广标志保持 releaseCandidate=false。安装包可能出现未知发布者提示；自动更新失败时支持手动下载安装，并提供 SHA-256 校验。

真实 Tauri 调试流程已修复 Windows canonical 路径摘录和窄窗残留分隔条问题；宽窄截图已经人工检查。依赖更新为 Vue 3.5.43、DOMPurify 3.4.16、source-map-js 1.2.2，Mermaid 保留 11.16.1，仅覆盖 KaTeX 到修复版 0.18.2。生产依赖审计为 0 项。最终依赖构建、完整发布检查及安装包验证已通过。

最终依赖版本的真实 Tauri 流程 8 项通过：固定参考、摘录来源、跨搜索保留、窄窗无遮挡、Markdown 多处跳转、粘贴后来源跳转、无全局错误遮罩和源文件未被自动保存。截图：`docs/evidence/v125-search-flow/reference-wide.png`、`reference-narrow.png`；二者均已查看。剪贴板测试捕获实际复制内容，未改动用户系统剪贴板。

发布源码：`2f44e143b32b2ac4fb317e24ff6beb9652b95429`。托管运行 [38039833628](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38039833628) 通过完整 `ci:patch-release`、570 项 Rust 回归和 MSI/NSIS 构建；首次安装观察因脚本版本白名单失败；复核脚本同时修正 Windows PowerShell 读取中文包名的 UTF-8 编码，随后 [38042755266](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38042755266) 复用相同字节通过 22 项安装生命周期、18 项安装后工作区、11 个路由和 7 项管理回滚检查。

制品与发布回执：`docs/evidence/v1.0.25-release/`；安装流程报告：`docs/evidence/v125-candidate-lifecycle/`。官方 v1.0.24 → v1.0.25 应用内更新观察仍待单独完成，覆盖安装通过不等同该链路已观察通过。

安装态系统与更新页、文本保存重开截图已直接查看，版本显示与编辑区域正常。
