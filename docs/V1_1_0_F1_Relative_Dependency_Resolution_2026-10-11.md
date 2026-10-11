# F1 普通相对引用定位证据

2026-10-11，接续 `23ddc0d0`。无 UI 修改、无执行入口、无版本发布。

## 本步实现

实际检查 archive 命令、依赖扫描及前端 TabInfo.isDirty 后，优先补已有候选的实际路径定位。DependencyEvidence 增加可选 resolution，扫描时为普通 Markdown、引用定义及 HTML src/href 候选附加 resolved_file/missing/outside_library/unsupported/unreadable 分类及适用路径。

相对路径从引用所在文档目录开始解析；先拆 URL 查询/片段，再百分号解码，避免把文件名中编码的 # 当锚点。允许库内 ..，拒绝越出库根；逐级检查符号链接，不跟随。文件存在和目录存在分别处理。

Wiki、PDF 自定义引用、绝对/盘符/URI 路径、反斜杠和需转义/HTML 实体处理的目标仍标为不支持，不猜测语义。同名候选继续保留，不因为本步定位而删除潜在入链。

## 审计边界

这不是完整 Markdown 解析器：旧正则提取仍可能截断复杂目标或抓取代码示例，resolution 仅对提取结果给出路径证据，不能宣称原始语法已精确解析。dependency complete 仍为 false，canExecute 仍为 false，未写链接、移动附件或开放归档。

初始请求中的草稿安全要求没有忘记：当前 ArchiveItem.hasUnsavedChanges 是必传调用方状态，已读 TabInfo.isDirty，但执行期间编辑锁/重新采样尚未接入，不能把传入 false 当成持久授权。后续执行许可需同时绑定正文变化、草稿和完整依赖范围。

没有非 Markdown 入链、外部库入链或外部进程锁；扫描后磁盘仍可能改变。大库路径查验成本未验收，本轮不声称性能收口。

## 验证

新增三项真实临时目录测试：相同文件名在不同目录时按来源正确定位、编码 # 与片段处理；缺失、越界（含编码 ..）、绝对路径和目录分类；扫描回执附加定位但 Wiki 仍不支持、整体仍不完整、正文不变。保留既有全部归档安全检查。

最终 `cargo test --locked --manifest-path src-tauri/Cargo.toml --lib archive -- --nocapture`：56 passed / 0 failed，新增 3 项（含既有名称筛选附带的 2 项压缩包测试）；git diff --check 通过。UI 未修改，未进行页面/安装态验收。

## 接续 / 封板

继续补受支持 Markdown 语法的准确解析及移动后的引用策略，再完成草稿/身份执行门禁、标签/索引和用户恢复流程。UI 改动前后实际查看页面，新的部分失败/恢复界面先出示意。

**尚未封板**；公开及运行 1.0.26，目标 1.1.0。现有底层步骤不等于 F1 用户闭环完成。
