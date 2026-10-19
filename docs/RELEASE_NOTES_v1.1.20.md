# v1.1.20 · 结构化编辑与草稿保护

本版重点改进结构化文件的保存与草稿保护，让定位和修改内容更顺手。

- JSON/JSONC、YAML、XML、TOML 保存固定文件与正文，迟到结果不串写其他文件，后续输入仍保留为草稿。
- 切换、重新读取、关闭与错误确认补齐未保存保护；取消或读取失败不丢原内容，Ctrl+S 不重复保存。
- 新文件未成功载入时禁止使用旧正文保存；重试保留原标签草稿，并修复 JSON 重试后的正文空白。
- 外部修改可比较、继续编辑、另存副本，或保护同目录草稿副本后使用磁盘内容。
- JSON 格式化、压缩和结构修改提供可取消的差异预览，可整项撤销，保留原生注释与数字处理。
- 提纲右键与 Enter 定位、JSON Pointer 搜索；修复右键定位跳回开头，补齐 XML/TOML 提纲右键入口；过期诊断不定位到新正文的旧范围。
- 提纲 Enter 定位阻止默认回车继续写入源码，保留刚定位的字段与原草稿。
- 修复窄窗 JSON 标签行占用过多空间及换行造成保存状态不准，保留编码/BOM/换行惯例并尊重末尾换行编辑。

[用户指南](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/Structured_Editing_User_Guide.md) · [发布记录与校验](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/V1_1_20_Unsigned_Community_Release_Audit_2026-10-19.md)。保留全部原工具、格式、主题及正常动效，常规保存不增加步骤。

完整原生回归、实际安装与独立同包检查通过。提供 Windows x64 EXE、MSI 和 `SHA256SUMS.txt`；安装器沿用通过验证的原文件。社区包未签名，Windows 可能显示未知发布者；请从本仓库 Release 下载并核对摘要。覆盖安装已验证，应用内更新观察单独记录。
