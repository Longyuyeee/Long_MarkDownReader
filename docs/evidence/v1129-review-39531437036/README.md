# 修复后同包安装验证通过

[同包复核 39531437036](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39531437036) 成功，直接使用构建 39527436771 的 c177bbe9952684b61fcf0f253f77d88a6cfbcb9a 原包。既有 328 与新增 8 项功能任务共 336 项通过；新增八份原始 Markdown/批注输出由严格导入核对字节及来源身份。

实际结果 readingReturnExact、annotationEditExact、cancelExact、staleRejected、draftOnly、undoExact、redoExact、explicitSaveExact、appendExact、otherDraftsPreserved 均为 true；runtimeErrors 为空，errorOverlay=false，原 PDF SHA-256 未变。实际截图确认更新弹窗内容清晰可读。

完整原始报告及输出位于 ../v1-1-29-candidate-lifecycle/，导入及摘要清单位于 ../v1.1.29-release/。本目录保存原始 run/jobs/full.log，未改写结果。此前失败 39524694691 保留，不能借本次成功覆盖。
