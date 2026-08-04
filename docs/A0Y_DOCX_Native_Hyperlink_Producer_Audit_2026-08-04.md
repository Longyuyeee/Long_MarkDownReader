# A0Y DOCX 原生超链接生产者审计

日期：2026-08-04
阶段：UX-33H
结论：三生产者原生结构与安全降级证据通过，UX-33 继续进行中。

## 本步完成

- Microsoft Word 16、WPS Writer `12.1.0.26895`、LibreOffice Writer `26.2.4.2` 分别创建外部链接、内部锚点、跨运行样式标签和正文混排链接。
- 每款生产者均完成保存、退出，并由新应用实例或隔离用户配置重开；固定 DOCX 和 SHA-256 矩阵保存在 `fixtures/docx/hyperlinks`。
- 新增机器合同校验三份 fixture 的字节、摘要、生命周期和预期编辑边界，并接入 `check:docx-producer-matrix`。
- 新增 Rust 回归，对可编辑标签逐项执行隔离补丁并比较文本节点两侧字节；关系部件和其余 OOXML 部件必须保持不变。

## 生产者结论

| 生产者 | 原生结构 | 可编辑 | 只读 | 结论 |
| --- | --- | ---: | ---: | --- |
| Microsoft Word | 4 个 `<w:hyperlink>` | 2 | 2 | 外部链接与内部锚点的单运行标签可编辑；跨运行和混排只读 |
| WPS Writer | 4 个 `HYPERLINK` 字段 | 0 | 4 | 字段由五个运行承载，按既有字段门禁全部只读 |
| LibreOffice Writer | 4 个 `<w:hyperlink>` | 2 | 2 | 外部链接与内部锚点的单运行标签可编辑；跨运行和混排只读 |

WPS 的结果不是兼容失败。它证明该版本使用字段结构保存链接；在没有字段级事务和指令/结果一致性验证前，保持只读是需求对齐的安全行为。

## 验证

- 原生采集：`scripts/generate-ux33h-docx-hyperlink-fixtures.ps1`
- 机器合同：`node scripts/check-ux33h-docx-hyperlink-producer-matrix.mjs`
- Rust 原生 fixture 回归：`ux33h_round_trips_native_word_and_libreoffice_labels_and_keeps_wps_fields_read_only`
- DOCX 页面编辑合同继续验证链接标签提示、草稿和可靠保存通道。

## 下一步

UX-33I 使用包含本次改动的 LongEdit 桌面构建执行安装态/真实 WebView 复测：打开三份 fixture，确认 Word/LibreOffice 各显示两个“链接文字”编辑目标，WPS 不显示链接编辑入口；验证修改清单、撤销/重做、另存和覆盖提示。通过后再审计 UX-33 是否可收口。页眉页脚、批注、脚注、域和浮动对象继续留在未来跨部件事务阶段。
