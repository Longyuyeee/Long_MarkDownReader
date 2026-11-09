# 导出文字副本后看清实际名称

后续独立任务：[不让未保存草稿的入口随最近记录一起消失](Mobile_Native_Recent_2026-10-30.md)，含原生近期记录、实际恢复／失败重试及内核对照。下文保留E候选阶段事实。

2026-10-29，接续 `8df914f4d`，分支 `codex/mobile-0.1.0-foundation`。完成一个用户任务：在系统选择器改名、遇到重名后，结果与完整预览显示实际导出文件的显示名，逐层返回仍接回原稿。开发候选E已在专用API29运行；未推送、未发布。移动端整体及原生无障碍出口仍待验收。

## 用户问题与设计

上一轮实际安卓已发现：在SAF另改名称后，结果仍显示“建议文件名”，用户无法确认刚保存的是哪份副本。先冻结[三种状态图稿与交互约定](design/mobile-export-result-name-v2/Interaction.md)、[源码及HTML摘要](design/mobile-export-result-name-v2/freeze.json)，完成[正确渲染核对](design/mobile-export-result-name-v2/render-verification.json)，再应用最终实现。

沿用“核对→系统选择→结果→按需完整预览”的层级，不增加常驻说明。结果只保留成功标题、原稿身份、已导出文件、预览入口和返回动作；删除重复的原生成功说明。系统Back从预览回同一结果，再回原稿；取消／失败留在核对页，显示建议名称，等待时防重复且消费Back。一般帮助继续从问号进入。

本轮查阅[Word Android另存位置与名称](https://support.microsoft.com/en-au/office/save-office-files-automatically?nochrome=true)、[Notesnook单项笔记导出](https://notesnook.com/help/export-notes-from-notesnook)，吸收用户选择、任务分层和结果反馈原则。没有安装实录竞品，也不声称它们有相同结果页或字节回读机制。依据[Android SAF官方说明](https://developer.android.com/training/data-storage/shared/documents-files)，CREATE_DOCUMENT会为重名追加编号，而DISPLAY_NAME由提供器定义，不能把它推断为真实文件系统路径。

## 实现与实际观察

原生桥在写入及内容回读验证后，尽力查询 `OpenableColumns.DISPLAY_NAME`，作为可选 `displayName` 返回。查询为空或抛错不改变已验证的导出成功，不诱导重复写入。界面只在成功后显示有效名称，保留空格、Unicode和系统编号；缺失、空白、异常类型或超过1024字符时显示“系统未提供文件名”。浏览器仍显示“已发起下载”、建议名称及下载记录核对提示，不宣称已取得磁盘最终名称。

[19张原图对照册](evidence/mobile-export-result-name-2026-10-29/review.html)保留系统栏、键盘、实际文字及原生失败状态。图片原样复制，[清单](evidence/mobile-export-result-name-2026-10-29/manifest.json)记录原始来源、尺寸及SHA256，没有裁切、遮盖或重绘。

| 实际任务 | 观察与证据边界 |
| --- | --- |
| 系统改名及重名 | 在真实AOSP DocumentsUI输入已有名称 `AndroidTask-20261029-identity-copy.md` 并保存，系统创建 `AndroidTask-20261029-identity-copy (1).md`。主应用结果和预览显示含空格的相同编号；新增文件回读完整78字节，旧副本摘要不变。[回读记录](evidence/mobile-export-result-name-2026-10-29/actual-name-verification.json) |
| 元数据查询异常 | 通过真实选择器进入合成测试提供器，新建 `MetadataUnknown-20261029.md`。提供器审计确认主应用UID10146在已有78字节后查询名称并触发异常。结果仍为“文字副本已导出／系统未提供文件名”；实际文件与原稿一致，Existing.md保持。[核对记录](evidence/mobile-export-result-name-2026-10-29/metadata-failure-verification.json) |
| 返回接续 | 系统Back按预览→结果→原稿逐层返回；第二项完成后同样回完整原稿。草稿仍未存为源文件，没有接收新记录或改动原接收状态 |
| 图稿对齐 | 浅色390×844、深色320×700／200%文字，结果与预览共四组受控组件截图：目标矩形一致，原始PNG字节及逐像素均一致。动作可达，无横向溢出。该结论限于此四组条件，不将原生字体、系统栏或选择器记为像素一致。[比较](evidence/mobile-export-result-name-2026-10-29/pixel-comparison.json) |

主应用操作依据逐张查看的实际截图发送Android输入；系统选择器使用新采集的原生UiAutomator XML，动作留有截图／XML摘要。没有主应用DOM、CDP或隐藏注入动作。本轮输入文件名使用ASCII Android键盘事件，不代表中文IME组合输入验收。

## 验证与未决项

| 验证 | 结果 |
| --- | --- |
| [新增组件专项](evidence/mobile-export-result-name-2026-10-29/component-report.json) | 4组通过：延迟／取消／失败、固定快照、成功名称与预览返回、缺失／异常名称、空格保留和恢复记录。四状态axe A/AA违规0、未决0。属于模拟存储回复，不替代IPC／SAF |
| [已有延迟回复专项](evidence/mobile-export-result-name-2026-10-29/deferred-replies-report.json) | 3组通过；同步移除已删除重复说明的旧断言 |
| [正式整页导出任务](evidence/mobile-export-result-name-2026-10-29/browser-task-report.json) | 8组通过，含真实浏览器下载、字节保真、原稿／草稿、长文、恢复记录及返回。12次axe扫描均无违规；问号帮助和320px大字预览各保留一处color-contrast未决，不记全项无障碍通过 |
| [打包检查](evidence/mobile-export-result-name-2026-10-29/packaging-check.log) | 22项通过；x86_64与ARM64均构建成功 |
| 原生可访问树 | API29／WebView124菜单仍只有4节点且有不可取子节点，[明确断言仍失败](evidence/mobile-export-result-name-2026-10-29/native-menu.json)。后续无断言快照保持 `assertionsPassed=null`，不把截图操作及文件回读换算为完整树通过 |

TalkBack触摸、API35预测性Back、ARM实体机、云文件提供器及正式发布仍待独立验证。下一步继续利用既有隔离对照定位旧WebView节点断点，再验上述原生出口；本轮不加入实验性语义或焦点改动来满足快照。

首次脚本问题也保留在[记录](evidence/mobile-export-result-name-2026-10-29/harness-failures.json)：精确可访问名称超时；静态textarea漏序列化正文；预览URL仍指向旧版造成404图。发现后保存候选实现，恢复三个产品文件至冻结摘要，再用未变HTML正确渲染并逐图检查，随后重应用实现。组件测试补齐缺少的title后四项axe清洁。整页旧脚本把恢复正文当内联区域，已改走现有“查看完整内容”子页及三次Back。首次Android `run-as … test -e` 无法执行，不能证明目标不存在；保留原错误记录，改以初始完整清单、真实选择器列表和提供器拒绝覆盖的createNewFile行为交叉核对。原始失败与备份留在本机忽略目录，没有覆盖成通过记录。

## 开发包与资料保护

先逐字节归档D的两个APK、构建日志及回执到本机 `release-artifacts/mobile-debug-archive/1002049-before-export-result-name`。E仍是未分发的debug签名1002049、versionName1.2.11、包名 `com.longyuye.mdreader.mobile.dev`、minSdk29／targetSdk36。

| 架构 | APK SHA256 | 字节 |
| --- | --- | --- |
| x86_64（实际运行） | `38bcff2a9a7c41987b9a0178a71b8d22cfcd32adff6b1cca84df6896c41bafb0` | 129719734 |
| ARM64（构建／静态核对） | `b80f1641578b62d882702d3518e2709d3be975ea25379abceeac9724b2a4e864` | 129073305 |

[构建回执](evidence/mobile-export-result-name-2026-10-29/candidate-artifacts.json)保持实际基准 `8df914f4d950e6f9aca18e0cc72cc18270933e92`、`sourceDirty=true`，不改写成之后提交。debug证书、包名、版本、ABI、ELF及原生入口核对通过；两个DEX不含诊断端点。内嵌JS为 `mobile-mk85k3yv.js`，CSS为 `mobile-B1nN_Mi7.css`，[资源摘要](evidence/mobile-export-result-name-2026-10-29/frontend-assets.json)已保存，未读回运行中JS字节。x86 Kotlin daemon失败后Gradle以无daemon回退构建成功，Windows复制回退也完成；不是未解决的构建阻塞。

[收尾记录](evidence/mobile-export-result-name-2026-10-29/closeout.json)：覆盖安装前后165个files／shared_prefs文件完全相同；全流程后100份资料、9份草稿、全部原接收记录及4条未查看状态保持。只有本轮自有草稿revision／updated和ProfileInstaller派生文件变化；正文仍是完整78字节，SHA256为 `3160db19838f5f6bfe637471a519e07b83dae4cf5b52eb4d2e619aeb74a3a91f`，源文件仍不存在。测试提供器原228文件逐字节保持，新增受控测试结果、审计及快照。输入法、字体、旋转、离线和原有辅助服务设置保持，UID2000，无root、无TalkBack、无端口转发；sync后专用模拟器退出。系统选择器最后位置为合成测试根，不声称其内部历史已恢复。完整备份与APK继续保留在本机忽略目录。
