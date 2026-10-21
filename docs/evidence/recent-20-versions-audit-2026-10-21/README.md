# 最近二十个版本审计资料

审计源码基线 eb13b3fcd22f6439bbc08e8aced48f4379f907ae，2026-10-21，用户时区 Asia/Hong_Kong。

- recent20.json：GitHub Release API 返回的已公开、非预发行版本中最近二十条原始记录的子集，保留原字段。不是安装包重新下载记录。
- tags.json：GitHub matching-refs/tags/v1.1. 的原始返回；带注释标签通过 Git 解引用后再比较源码，不能直接把 tag 对象 SHA 当作产品提交。
- result.json / audit.log：公开附件名、大小及 GitHub SHA-256 与归档清单比较；现有运行验证器通过；4054 份导入输出（按版本累计，含历代重复保留）独立重算摘要；发布说明逐字归一比较。20/20 通过、60 个附件、无发布说明差异。
- audit.mjs：在仓库根运行 `node docs/evidence/recent-20-versions-audit-2026-10-21/audit.mjs` 可重新核对本次快照和已归档资料。它不访问实际用户库、不重装、不重跑完整 CI；实时发布状态需先重新从 GitHub 获取。需要本地相应标签对象（包含注释标签）与已归档证据。
- workbook-input-diagnostic.json / workbook-diagnostic.mjs：从实际 WorkbookView 提取单格提交和批量输入函数，在模拟单元格上下文隔离执行。列表外值单格被拒绝、批量进入模拟草稿。不是原生安装态测试，也未读写真实 XLSX；说明前端入口行为不一致，不能据此宣称原生数据损坏。

脚本均为本次诊断复核材料，不加入产品测试或发布门禁。未运行安装器、未操作日常应用，未包含用户正文。
