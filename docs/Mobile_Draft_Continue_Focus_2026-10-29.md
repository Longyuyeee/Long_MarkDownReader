# 继续草稿后直接接着写

后续更新：[同名接收记录辨认与实际SAF核对](Mobile_Incoming_Identity_2026-10-29.md)已完成候选D；旧WebView完整树仍失败，下文为当时记录。

2026-10-29，接续 `6d1727020`，沿用 `codex/mobile-0.1.0-foundation`。本轮从原生节点断点调查中发现并修复一个实际操作问题：恢复草稿后没有把输入焦点交给正文。双架构1002049开发候选已重新构建，x86在专用API29覆盖安装并实际操作；未推送或发布。

## 用户遇到的问题和改动

首次新建笔记后可以直接输入；重开、点击“继续这份草稿”后，文字虽然恢复了，原生EditText却是`focused=false`，输入焦点停在WebView。浏览器新增断言也在旧构建上复现同一问题。

先冻结[接续交互](design/mobile-draft-continue-focus-v1/Interaction.md)及[改前源码／原图依据摘要](design/mobile-draft-continue-focus-v1/freeze.json)，再修改`MobileApp.vue`：先确定编辑模式并恢复会话，等待编辑器挂载后，将焦点交给同一文档的正文。若已转到别的文档、面板、帮助、导航或关闭流程，则不抢焦点。沿用编辑器当前选区，没有新增跨进程光标位置持久化，也没有更改源文件、冲突判断或保存协议。

一般说明仍采用原有问号入口，本轮没有新增页面说明、布局或操作层级。补查[Joplin的移动读屏导航](https://joplinapp.org/help/apps/screen_reader_accessibility/)、[Obsidian移动工具与导航](https://obsidian.md/help/mobile)及[Notion移动差异](https://www.notion.com/help/notion-for-mobile)：继续保持可识别的阅读／编辑任务、可见常用动作和按需进入菜单的结构，重点修复完成动作后能否接上原任务。研究限官方资料，没有安装或录制竞品，也未推断竞品具备本项目的草稿保护机制。

## 对照调查得到的边界

在独立测试APK新增离线WebView对照，不连接CDP、不注入DOM、不加载主应用资料或原生存储桥。轻量页面覆盖普通编辑、display:contents、阅读转编辑、异步替换内容和aria-busy，共8个模式都取得完整菜单节点；其中7个模式另核对关闭后正文，plain模式未执行返回观察，不补记通过。

随后把同一份旧JS／CSS按字节冻结进独立WebView，使用隔离的浏览器预览数据。通过真实安卓点击和ASCII键盘事件新建`AXFrontend20261029.md`、输入`AXBodyControl`，重建WebView、恢复草稿再打开菜单，重现了缺失子树。这证明原生存储桥不是该样本复现的必要条件；不等于已定位WebView、缓存或前端结构的具体根因。Chromium124的[节点提供代码](https://raw.githubusercontent.com/chromium/chromium/124.0.6367.219/content/public/android/java/src/org/chromium/content/browser/accessibility/WebContentsAccessibilityImpl.java)返回空的文本查找列表，因此没有把按文本查询作为新的隐藏替代路径。

该对照还清楚显示了输入焦点差异：旧恢复页继续后正文`focused=false`；修复后为true，并能不再点击正文就输入，撤销回到完整原文。**菜单缺失子树在修复前后仍然复现**，两项结果分别记录，不能把焦点修复当作完整无障碍树修复。

工具的`--target control`仅允许专用API29、测试包及对应活动窗口标题；请求仍需DUMP权限，其他页面返回-3。默认main路径继续只读取开发包。所有资源来自APK本地拦截，网络加载阻断，预览条和原生测试标题都保留。独立WebView的预览存储不替代主应用IPC、SAF或URI授权验收。

## 实页核对和验证

[原图册](evidence/mobile-draft-continue-focus-2026-10-29/review.html)保留设计依据、浏览器原图、独立WebView和主候选实际画面。所有图原样复制并核对摘要，没有裁切系统栏、隐藏预览条、重绘光标或后补键盘。

| 核对 | 实际结果 |
| --- | --- |
| 浏览器三组接续 | 新笔记深色／320×346／200%文字、已有源文件阅读返回、外部新增同名来源，均取得实际正文焦点；不重新点击正文即可键入，草稿保护后一次撤销恢复完整文字，源文件未写入 |
| 冻结图稿 | 新笔记浅色、深色、已有文件共21项卡片相对几何差为0；没有将浏览器和Android宣称为跨平台像素一致 |
| 同设备恢复卡片 | 与上一轮原生B相比，区域、标题、状态和主要按钮四个矩形边界完全相同，见[原生几何](evidence/mobile-draft-continue-focus-2026-10-29/native-card-geometry.json) |
| 自动无障碍 | 四状态axe A/AA无违规；大字短屏仍有1个颜色对比度待复核项，原报告保留，不记为全项通过 |
| 独立安卓WebView | 修复后原生EditText取得焦点，ASCII输入得到`FocusProbeAXBodyControl`，点撤销回到`AXBodyControl`；旧／新资源分别从APK ZIP逐字节核对 |
| 实际主候选C | 恢复原三行中文／emoji后EditText为focused=true、hint为“笔记正文”；不点正文直接发送安卓ASCII键盘事件，得到`FocusProbe`加完整原文；系统Back收键盘后仍在原稿，点撤销恢复78字节原文 |
| 菜单后续 | C菜单快照仍缺失子树，断言明确失败；Back后的无断言快照仅采证，`assertionsPassed=null`。完整原生验收未通过 |

浏览器测试是浏览器键盘事件；安卓输入是系统ASCII键盘事件。截图中Gboard真实显示，但本轮没有验收拼音组合、触摸选文或厂商输入法，也没有使用TalkBack。系统Back收键盘依据实际前后原图：输入时键盘可见，Back后键盘消失而原稿仍在。`candidate-after-ime-back.txt`在点击撤销后才采集，此时编辑器重新聚焦，键盘再次显示；这份晚采集的记录不能用于判断Back当时的IME状态。

## 开发包身份

上一轮B的两个APK、构建日志和回执已先原样归档至本机`release-artifacts/mobile-debug-archive/1002049-before-continue-focus`并核对摘要。本轮继续用未分发的1002049，不因修复重试自动增号。以下为C，仍是debug签名开发候选：

| 架构 | APK SHA256 | 字节 |
| --- | --- | --- |
| x86_64 | `450cb7bc09d5695493b853207c3f1aa62fa0840f6b71e1e6e2619bbfd0a288ce` | 129719542 |
| ARM64 | `096f8a60fa494dc476e7a69bdab84aa9d6d3b21596c3f60e473a40629c854d99` | 129073113 |

[完整制品核对](evidence/mobile-draft-continue-focus-2026-10-29/candidate-artifacts.json)包含包名、版本、签名、ABI／ELF、原生库摘要和测试端点未进入DEX的检查。两个包的回执都保留真实基准`6d1727020d1ec76405b26832c678b473c986a969`和`sourceDirty=true`，没有改写成之后的提交。当前JS入口`mobile-RPLJ68XC.js`，CSS仍为`mobile-CHPzoowG.css`。独立对照资源逐字节核对；主候选以安装APK摘要、构建核对和实际新行为验证，没有通过CDP读回运行中JS。ARM64完成构建和静态核对，未上实体机。

## 首次失败和收尾

新增浏览器焦点检查最初放在点击继续之前，等待尚未存在的编辑器而超时；已移到实际继续之后。这个脚本错误和随后正确复现旧焦点错误的报告分别保留，前者不算产品缺陷。轻量对照最初错误要求EditText把“Note body”作为文本返回，后续改为核对实际正文；不据此宣称标签缺失。若前置点击守卫未通过，后续采集也不计作菜单操作。初次冷启动仅取得少量节点的原帧保留，未计启动性能通过。

[收尾回执](evidence/mobile-draft-continue-focus-2026-10-29/closeout.json)核对100份资料、9份草稿及164个files／shared_prefs文件。升级前后全部保持；实际输入／撤销后，仅本轮测试草稿的修订号和时间变化，完整正文仍为78字节，源文件仍未保存，上一轮导出副本未变。原117个测试提供器／诊断文件保持，新增72个明确请求的快照。输入法、字号、旋转、离线及已有服务设置保持，未启用root或TalkBack，无诊断转发，sync后关闭专用AVD。APK和完整私有备份留本机忽略目录，不进入Git。

下一项仍定位完整树断点，再补1002049的最终接收／SAF组合。API35预测性返回、完整TalkBack触摸、ARM实体机和正式发布继续独立验收。本轮只完成“继续草稿后能直接接着写”这一切片。
