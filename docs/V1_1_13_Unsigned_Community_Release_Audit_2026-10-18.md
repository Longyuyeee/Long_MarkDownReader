# v1.1.13 未签名社区版发布审计

## 当前结论

**v1.1.13已封板并正式发布。** 北京时间2026-10-18 **07:06:12**（UTC2026-10-17 23:06:12）[公开发布](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.1.13)，运行时/公开1.1.13，下一目标1.1.14。产品/标签 **8c5a50afcb594519fbe14f0009112491ce14308c**，独立同包 **39076247421 success**，驱动 **9daca4089925e11037527be2627facd52344b3c4**；封板main CI **39076982398 success**，文档头f4f27c75；原包发布与公开回下载 **39077645643 success**。两个已验收原安装器和校验文件大小、SHA-256及GitHub digest一致，只更改公开文件名前缀，不重建替换。原构建任务的旧驱动观察失败保留，下表不将它泛称success。

完整报告与原始发布收据已严格导入，产品实现相对固定源码无变化。README下载、末尾更新摘要、Release与交接已同步，开头图标/介绍及全部旧历史行保持；发布后文档提交受main完整CI核验，不为填写自身CI编号再制造新提交。

本版沿原PDF工作面完成“筛选批注—选择整理—预览—草稿/新笔记—核对来源回原页”，保留阅读、搜索、表单、OCR、脱敏、水印、属性和页面工具，不另建阅读器。实现和基线见[开发审计](V1_1_13_PDF_Reading_Development_2026-10-18.md)，用户操作见[PDF阅读笔记](PDF_Reading_Notes_User_Guide.md)。

## 证据与身份

| 项目 | 实际结果 |
| --- | --- |
| 产品/标签源码 | 8c5a50afcb594519fbe14f0009112491ce14308c |
| 原包构建 | [39073940910](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39073940910)：质量门禁、完整Rust、MSI/NSIS和不可变收据四项success；原安装驱动失败另记，**不称整个原任务success** |
| 原构建报告 | [原始目录入口](evidence/v1113-fixed-c-original-build-39073940910/installed-v1113-workflow.json)、[构建收据](evidence/v1113-fixed-c-original-build-39073940910/installer-build-receipt.json)、[完整日志](evidence/v1113-fixed-c-build-39073940910.log)，103个原文件保留 |
| 独立同包完整复核 | [39076247421](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39076247421) success；[完整日志](evidence/v1113-fixed-c-review-39076247421.log)，没有重建 |
| 本版实际安装任务 | [14项全部通过](evidence/v1-1-13-candidate-lifecycle/installed-v1113-workflow.json)，真实WebView输入/原生保存选择器/磁盘/页文字及画布，不替换native bridge |
| 全部继承任务 | 150项历版+14项本版=164项功能，另有22生命周期、18工作区、11路由、7管理恢复、4版本身份 |
| 真正重启 | [工作现场](evidence/v1-1-13-candidate-lifecycle/installed-v119-workflow.json)：40个阅读位置，首尾340/457；同EXE进程重启后仍340/457 |
| 严格导入 | [原文件清单](evidence/v1.1.13-release/import-manifest.json)、[安装器与运行报告](evidence/v1.1.13-release/artifact-manifest.json)，逐文件哈希、同源码/EXE/驱动核对 |
| 原生回归 | 1039功能+1独立性能=1040通过、0失败、5既有ignored；本版专项6包含在内 |
| 正式组件与逻辑 | 19个PDF组件场景、六风格深浅12组、760×620/480×800/360×620；逻辑5、协议4及编辑器序列化复放2项；模拟IPC不冒充磁盘证明 |
| 封板main CI | [39076982398](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39076982398) success，文档头f4f27c75；[原始元数据](evidence/v1.1.13-release/freeze-ci.json)；此前驱动9daca408的39075040226亦success |
| 原包发布/公开回下载 | [39077645643](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39077645643) success；[正式收据](evidence/v1.1.13-release/release-receipt.json)、[原API/下载校验清单](evidence/v1.1.13-release/publication-import-manifest.json)，Release ID416120851 |

原包身份如下，发行时只把中文文件名前缀换成LongEdit，不改字节：

| 文件 | 大小（字节） | SHA-256 |
| --- | ---: | --- |
| LongEdit_1.1.13_x64_zh-CN.msi | 77340672 | 6718f8bb300eeeaa4020fc05440143cf6bd245fafe2da581d911abb75590bcac |
| LongEdit_1.1.13_x64-setup.exe | 68185718 | 3142d613db486a22ff0a6bb1bac52fa36af44a7036b2169cb9553fbb7852aacd |
| SHA256SUMS.txt | 192 | cce3b18a594662076caf602c5e223fa4be2c959595c0c3647f349475d6abdb5d |
| 实际安装EXE | 见原报告 | a2326c455cb38eb9715e4a95d852780eb789e08261812a811c6fba532be27b24 |

前一正式1.1.12产品4fb14270513d556ed965a0c27308bdc727eacd4b，覆盖升级使用其官方原NSIS（摘要1fed0d5d40ef4c56efb9e8e23a6837217e56680b7e4187f8f825b8730b440409），不拿开发包充当旧稳定版。

## 实际用户场景与页面

生成真实86页PDF和240条批注，筛选12/15页得到6条，只选reading-11和reading-14整理两条；每组最多50行、全选上限200和隐藏选择由实际组件另覆盖。用户用可信输入写入未保存方案，插入只追加最新草稿，原草稿前缀、保存身份和磁盘保持；之后点击实际保存按钮，真实文件SHA-256与实际源编辑器按原编码/换行政策计算的预期字节**完全相同**。

点击实际来源链接，原来源、移动重关联来源与同字节恢复副本均读取第12页控件、reading-11批注、原页文字、612×792画布和138个采样墨迹像素。恢复检查是相对根下的同字节PDF副本，不宣称本版另做了一次全库切换；原1.1.12的真实内容恢复及打开回归仍完整继承。已删批注和旧引用提示均在真实侧栏可视范围y364–414，非“文本存在即可”。同大小、同Windows精确修改时间的替换副本仍被内容摘要拒绝。

新笔记由真实系统保存对话框选择库内名称，核对所属进程和HWND真正关闭；同名目标原生拒绝覆盖。来源被外部移动后，通过实际提示填写新相对路径、摘要验证，只修改原笔记草稿，磁盘不变；再次手动保存后返回相同原页原批注。原PDF、sidecar、未选文件最终摘要均不变；全部输入轨迹可信，runtimeErrors为空、无error overlay，原编辑模式恢复。

已实看独立安装原图：[预览](evidence/v1-1-13-candidate-lifecycle/installed-v1113-preview.jpg)、[来源返回](evidence/v1-1-13-candidate-lifecycle/installed-v1113-source-return.jpg)、[新笔记](evidence/v1-1-13-candidate-lifecycle/installed-v1113-new-note.jpg)、[移动重关联](evidence/v1-1-13-candidate-lifecycle/installed-v1113-moved-source.jpg)。预览原图包含正常入场过渡，稳态布局另由[实际组件截图](evidence/v1113-formal-ui/results.json)核对，不修改像素或关闭动效。原用户100%缩放、PDF左栏及右参考同时开启时，正文可横向滚动；不为截图强改用户视图偏好，也不以截图代替页控件/文本/画布的独立读取。

## 真实失败、纠偏与废止候选

- 基线7bb913ea在四种实际组件场景均调用write_markdown_file：插入代存草稿、外部改写会被旧草稿覆盖；继续输入没有复现丢字，不虚构丢字事实。[原始复现](evidence/v1113-baseline/results.json)保留。现改为草稿追加、显式保存和原生新文件无覆盖写入。
- 同名插入目标先只显示标题，补为文件名+所属文件夹。旧来源警告曾被240条列表挤到y3909而视口底仅900，[失败几何](evidence/v1113-notice-baseline/results.json)及[修复后](evidence/v1113-notice-fixed/results.json)保留；最后还保护异步改名、批注更新、惰性/只读目标和完整保存元数据。
- 产品db6481d5/39071096221、f2634cbb/39072276053均已废止发布资格，不能与8c5a50af混用。[A原报告](evidence/v1113-obsolete-a/installed-v1113-workflow.json)/[完整日志](evidence/v1113-obsolete-a-job.log)，[B原报告](evidence/v1113-obsolete-b-original/installed-v1113-workflow.json)保留。
- A及C原安装驱动把尚未序列化的标签模型当提交正文，因既有Vditor标题前连续空行与原生LF/单末尾换行政策而哈希不同。实际LibraryMode/Vditor[精确复放原两个摘要](evidence/v1113-save-observation/results.json)，原文、评论和来源未丢；仅修驱动观察真实源编辑DOM并按原编码/换行计算预期字节，仍要求独立磁盘完整摘要相等，另保留原草稿/来源断言。
- 旧B诊断39074631714遇到原生UTF-8与驱动小写utf-8标签差异，[原报告](evidence/v1113-obsolete-b-review-39074631714/installed-v1113-workflow.json)/[日志](evidence/v1113-obsolete-b-review-39074631714.log)保留；只接受编码名大小写等价，仍拒绝UTF-16LE、BOM/换行政策变化、缺失观察或不同存盘摘要，协议负例覆盖。
- 旧B二轮39075048002通过保存/来源前6项后，严格可视警告观察因该旧产品没有顶部reference-notice而失败，[报告](evidence/v1113-obsolete-b-review-39075048002/installed-v1113-workflow.json)/[日志](evidence/v1113-obsolete-b-review-39075048002.log)保留；不跳过此检查发布旧包。新的C同包39076247421已完整14项通过，未再修改产品或重建。
- [最新完整质量日志](evidence/v1113-driver-save-quality.log)通过、生产依赖0漏洞。早期文档缺项和样例父容器等失败记录见开发审计与Git历史，不为过门禁移除既有断言。

## 发布边界与下一步

通道 **community-unsigned**，Windows x64未签名，系统可能提示未知发布者；企业 **releaseCandidate=false**，社区通过不替代企业签名与系统矩阵。本版可**手动下载安装**；1.1.12→1.1.13应用内更新观测单独pending，不借用旧更新成功或覆盖安装来冒充通过。

每次1–200条，所选摘录/评论4MiB，笔记保存8MiB，sidecar5MiB，PDF仍沿原阅读器2GiB上限。流式摘要需要读取整份文件，不宣称大文件零等待或OCR质量新增提升。旧链接仍未经过内容摘要验证；不自动扫描全库猜同名来源、迁移或代存正文。新笔记仅库内新名称，不覆盖已有文件。

下一既定版本 **1.1.14 模板写作到交付**，从[实际代码预审](V1_1_14_Writing_Delivery_Preimplementation_Audit_2026-10-18.md)接续：先复现PDF/HTML/Markdown导出，深化模板参数、保存位置和本地图片依赖，保留旧模板、共享资源、显式保存和紧凑布局。仍有1.1.14—1.1.20七个后续规划版本，未全部开发完成，无需另起新平台。README开头图标/介绍与旧历史行保持，更新摘要放末尾。用户两份排序文件未动，无本机安装或桌面接管。
