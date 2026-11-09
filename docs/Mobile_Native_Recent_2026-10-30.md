# 不让未保存草稿的入口随最近记录一起消失

后续已完成[PDF书签、名称草稿与撤销的原生持久化](Mobile_Native_Pdf_Bookmarks_2026-10-30.md)，其余本机状态按[元数据审计](Mobile_Metadata_Audit_2026-10-30.md)继续推进。

2026-10-30，接续 `5cb6b2a16`，沿用 `codex/mobile-0.1.0-foundation`。本轮完成“最近记录不可用后仍能找到未保存草稿”的用户任务，并补上保存回调在等待元数据时的文档身份保护。最终1002049候选F已构建双ABI，x86在专用API29实际冷启动恢复；未推送、未发布，移动端整体仍待验收。

## 用户问题与设计

内核对照中，同一E包从Chromium159切回Google WebView124后，主页原来的继续入口消失；100份资料和9份原生草稿仍在。旧实现只从WebView的localStorage读取最近记录，而未保存的新笔记没有源文件，用户无法从资料列表重新找到它。

实测确定的是入口不可用。切换前没有保存完整app_webview备份，尚不能区分清空、迁移或读取隔离；也不能宣称其他WebView元数据保持或原有历史顺序已还原。此处修正早期“已经清空”的解释，不将推断当成结论。

先冻结[交互约定与源码摘要](design/mobile-native-recent-v1/Interaction.md)，以已有主页继续卡片和恢复页原图为外形参考，再实现持久化。参考[Joplin移动端的列表／阅读／编辑分层](https://joplinapp.org/help/apps/screen_reader_accessibility/)、[Obsidian移动工具与导航](https://obsidian.md/help/mobile)及[Notion移动端的单列和无悬停操作](https://www.notion.com/help/notion-for-mobile)。研究限官方资料，没有安装实录竞品；原生存储与草稿兜底是针对本项目实测问题的设计，不推断竞品有同样机制。

原生最近记录改存私有 `recent-v1.json`，使用AtomicFile，最多12个文档身份。首次读取可迁移仍可读的旧列表；旧列表缺失时，从私有草稿恢复入口，按更新时间排序。只返回身份，不把正文塞进主页，也不自动应用草稿。显式空列表仍为空；损坏的现有记录报错并保留，不用空列表覆盖。读取和写入都有长度、路径、身份、重复项及预算校验。

继续卡片→原有恢复核对→明确继续→编辑器。Back从恢复页回原最近列表，保留对应行焦点；不创建源文件或改写其他草稿。等待有真实读取状态，防重复刷新；刷新失败仍可使用已加载行。首次失败有重新读取按钮，不同时显示“暂无最近记录”。看图发现的重复错误说明已收整为页面内一次提示，一般帮助仍在问号，没有新增常驻操作说明。

新增原生等待后，还发现保存回调在等待最近记录期间直接访问可变的当前文档。冻结中间实现、提取实际save函数的延期测试复现空引用后，改为持有已保存文档的引用；关闭或切换文档后仍只使原保存目标的搜索索引失效。

## 实际页面与验证

[18张原图对照册](evidence/mobile-native-recent-2026-10-30/review.html)包括冻结参考、入口消失、最终包恢复、真实键盘、错误／重试、返回行焦点、内核对照及首次重复说明。所有图原样复制，[清单](evidence/mobile-native-recent-2026-10-30/manifest.json)记录尺寸、来源及SHA256；未裁切、遮盖、重绘或后补键盘。浏览器预览条和即时触摸反馈也保留。

| 核对 | 结果与范围 |
| --- | --- |
| 最终包冷启动恢复 | 真正重启专用AVD、覆盖安装后，主页重新出现AndroidTask入口。仍需选择“继续这份草稿”；原生EditText取得焦点，实际Gboard可见，完整三行中文／emoji为78字节。不是用浏览器缩高模拟键盘；未验收中文组合输入 |
| 原生记录 | 从9份私有草稿重建9个身份入口，当前手机资料库为3项，其余属于其他资料库。打开后生成原子记录，再启动仍可读取。没有把9项全部宣称为当前资料库项目，也未还原未备份的完整旧历史 |
| 原生损坏记录 | 只对本轮新建的近期记录注入坏JSON，完整好记录先备份。实际页面显示读取失败／重新读取，没有假空列表，坏记录未被覆盖。测试工具明确恢复好记录后，页面重试成功；这不代表产品自动修复了坏JSON |
| 原生返回 | 从恢复核对页系统Back回最近列表，原目标行focused=true；重开、继续后仍是同一78字节原稿。这里是输入焦点，不是TalkBack焦点 |
| 外形对齐 | 同一API29／WebView124，最终包主页继续卡片、恢复标题、状态和主按钮四个矩形与冻结原参考完全一致。[几何记录](evidence/mobile-native-recent-2026-10-30/native-reference-geometry-final.json)。没有宣称整屏或跨内核像素一致 |
| 浏览器专项 | [4组通过](evidence/mobile-native-recent-2026-10-30/browser-report.json)：缺失记录恢复、原有／显式空列表、损坏记录保留及重试、刷新失败保留旧行。两次axe扫描违规0；选中标签的伪元素背景各有1处未决，实际背景补查对比度5.38:1且无遮挡，原始未决保留 |
| 保存回调专项 | [3组通过](evidence/mobile-native-recent-2026-10-30/save-lifetime-report.json)：等待期间关闭、切换文档、原有另存副本分支。提取实际生产函数并控制等待，不是Android IO实测；[修正前失败](evidence/mobile-native-recent-2026-10-30/save-lifetime-before-report.json)保留 |
| 相关回归与打包 | [草稿恢复3组通过](evidence/mobile-native-recent-2026-10-30/draft-regression-report.json)，四状态axe违规0、短屏大字1处未决保留；[22项打包检查通过](evidence/mobile-native-recent-2026-10-30/packaging-check.log)。未把自动未决项改记为全项通过 |

原生损坏／重试及返回测试使用修正保存回调前的中间包；最终包的全部Java DEX与该包逐字节一致，并重新完成覆盖安装、冷启动恢复、正文焦点及四处几何核对。[最终升级记录](evidence/mobile-native-recent-2026-10-30/final-upgrade.json)明确区分两次APK身份。浏览器专项在最终前端构建完成后重跑通过。没有通过主应用DOM、CDP或隐藏接口操作这些安卓页面；动作来自新鲜完整原生节点，旧树不完整时的观察按原图记录。

## 内核对照的结论与限制

先用同一E APK（SHA256 `38bcff2a…bafb0`）在API29保持产品源码和资料不变进行对照：

| 实际内核 | 菜单节点 | 后续结果 |
| --- | --- | --- |
| Google WebView124.0.6367.219 | 4，1个孩子不可取，明确断言失败 | 原图中菜单可见，不能把不完整树说成页面没有按钮 |
| Chromium159.0.8132.0开发快照 | 16，孩子完整，断言通过 | 核对20、完整预览14、Back回核对18、回编辑27节点，正文完整 |
| F中间包／Google WebView124 | 4，仍失败 | 最近记录修复没有作为菜单语义或焦点的采集绕行修复；最终包未重新接纳完整菜单树 |

对照包来自[Chromium官方快照桶](https://storage.googleapis.com/chromium-browser-snapshots/index.html?prefix=AndroidDesktop_x64/1730388/)，核对x64、minSdk29、APK v2签名后，仅临时装入专用userdebug模拟器允许的com.android.webview。签名是开发快照测试证书，不是Google稳定版证书；[官方WebView构建说明](https://raw.githubusercontent.com/chromium/chromium/main/android_webview/docs/build-instructions.md)说明了允许的包名与调试设备边界。试验后已切回原Google包并核对原APK摘要，卸载临时快照，恢复原provider设置；没有root、替换系统分区或将该快照打进产品。

这支持内核兼容性方向，不能确定确切修复提交、最低修复版本或官方稳定版表现。159的编辑工具栏还出现可见的图标／对齐差异，原图保留，因此没有认定它为完整兼容候选，也没有把现有111功能门槛改成159。旧树失败不等于全部读屏不可用；历史TalkBack键盘证据仍按原范围保留，本轮没有使用TalkBack或验收触摸探索。

采集脚本新增实际WebView身份及原始状态摘要，支持 `--expect-webview package@version`；错误身份在请求节点之前拒绝，正例／反例记录均保留。首个冷启动查询的2节点帧和稍后独立ready帧分别保存，不计作空白页或启动性能结论。没有放宽完整子树守卫。

## 制品、数据保护与后续

最终F仍为debug签名、未分发的1002049，versionName1.2.11，包名 `com.longyuye.mdreader.mobile.dev`，minSdk29／targetSdk36。

| 架构 | 最终APK SHA256 | 字节 |
| --- | --- | --- |
| x86_64（实际运行） | `33a86fa4b3d6d883f713c67f2365f5e01e6ae21bcaef6221ba9933156fd94021` | 129720374 |
| ARM64（构建／静态核对） | `a65a39d13c3e6c107c8848c24a6854dffcf027d87937967674171446452e29a0` | 129073945 |

[制品回执](evidence/mobile-native-recent-2026-10-30/candidate-artifacts.json)保持真实基准 `5cb6b2a160cf65bfca6251e6801747ad67ac90e9`、sourceDirty=true，不改写为之后提交。签名、版本、ABI／ELF、原生库与保存副本核对通过，两个DEX不含测试诊断端点。最终JS为 `mobile-BRygGNX6.js`，CSS为 `mobile-B1nN_Mi7.css`，[资源及源码摘要](evidence/mobile-native-recent-2026-10-30/frontend-assets.json)已保存；没有读回运行中JS字节。E及本轮中间包、日志、回执都先原样归档并验摘要后再覆盖。

[收尾](evidence/mobile-native-recent-2026-10-30/closeout.json)：原165个files／shared_prefs文件仍在，新增1份原生近期记录；100份资料、9份草稿的正文／身份、全部旧导入记录保持，测试原稿仍未保存为源文件。只有自有草稿revision／updated和Android派生状态变化。原生记录故障探针已恢复好记录并关闭。原测试提供器249个文件逐字节保持，新增45份明确请求的快照。发现入口问题后补齐完整WebView备份；最终覆盖安装前后的203个私有文件在首次启动前完全相同。该结论不覆盖切换内核前未备份的WebView元数据。

原输入法、字体、旋转、离线、辅助服务与provider设置已核对，adbd UID2000，无TalkBack、无转发，sync后专用AVD退出。完整私有tar、APK和下载快照留本机忽略目录，不进入Git。

[首次问题与边界记录](evidence/mobile-native-recent-2026-10-30/harness-and-boundary-notes.json)保留：CodeMirror被误按input读取、一次测试早于构建结束、一次过期点击守卫及ToggleButton被过窄按钮守卫拒绝；均未执行被拒绝的后续点击。首轮APK已完成校验，但外层输出收集进程未退出，只收尾该已完成任务的收集进程，未停止共享SDK服务。长度边界和保存回调修正后重新构建并验证最终双ABI，不将中间包冒充最终包。

下一项优先审计仍仅存WebView中的PDF书签、阅读位置、批注草稿和外观偏好，再补官方稳定Google WebView对照。API35预测性Back、完整TalkBack触摸、ARM实体机及正式发布继续独立验收；阶段5／6整体不在本轮标为完成。
