# Android 菜单读屏与节点采集边界

2026-10-30接续：已通过旧包TalkBack、独立WebView原型和新包验证，修复问号说明正文被名称替代；外形、滚动和逐层Back保持。返回设置后仍有辅助服务漏采导航而真实TalkBack可到达的差异，未标记完整树通过，详见[本轮正文与焦点记录](Mobile_Native_Help_Accessibility_2026-10-30.md)。

后续更新：[同名接收记录辨认与实际SAF核对](Mobile_Incoming_Identity_2026-10-29.md)已完成候选D；旧WebView完整树仍失败，下文为当时记录。

后续：已在无原生存储桥的同前端WebView中复现恢复后的缺失子树，并修复独立发现的“继续草稿不交接输入焦点”。新1002049候选C的实际输入／撤销、图稿对照及仍未通过的完整树记录见[继续草稿接续](Mobile_Draft_Continue_Focus_2026-10-29.md)。下文保留B候选阶段事实。

2026-10-29，接续 `dbc7b654d`，沿用移动工作树和 `codex/mobile-0.1.0-foundation`。本轮只推进“恢复未保存文字后，能用读屏打开操作菜单、查看收到的内容并返回原稿”。主应用没有改源码、重新打包、覆盖安装或提升版本；继续使用上一轮1002049修正版B。本轮仅改独立测试工具，未推送或发布。

## 用户操作与竞品依据

补查[Joplin的移动读屏导航](https://joplinapp.org/help/apps/screen_reader_accessibility/)和[无障碍开发指南](https://joplinapp.org/help/dev/accessibility/)：列表、阅读、编辑、配置应有可识别的页面与焦点顺序，自动检查和读屏实测分别记录，并在启动应用前开启读屏。[Obsidian移动说明](https://obsidian.md/help/mobile)将编辑工具与导航区分、把其他操作放入菜单；[Notion移动说明](https://www.notion.com/help/notion-for-mobile)明确手机没有悬停状态，使用可见操作图标并收为单列。

据此检查现有“文档操作 → 收到的内容 → 返回原稿”的路径，关注能否发现入口、焦点是否留在当前任务、退出后能否接上原处。本轮是官方资料研究，没有安装或录制竞品，不能据此推断其草稿恢复或全部无障碍行为。

本轮没有修改页面外形，沿用已冻结的[恢复设计](design/mobile-new-draft-recovery-v1/Reference.vue)和[上一轮图稿／实页对照](evidence/mobile-redesign-native-2026-10-29/review-v2.html)，没有为节点采集故障改布局、删语义或加说明文字。[本轮原图册](evidence/mobile-accessibility-boundary-2026-10-29/review.html)保留完整系统栏、真实绿色读屏焦点和初次失败，所有原图按摘要原样复制，没有裁切或重绘焦点框。

## 已确认的结果

设备为专用 `LongEdit_Compat_API29` / `emulator-5558`，WebView124.0.6367.219。主应用APK SHA256始终为 `2ee989658ece9023fdfa7c08d72f10952e36042fa0c6462b16e339e325072c95`。全程没有连接CDP、注入DOM操作或模拟IPC回复。

| 观察方式 | 实际结果 | 结论范围 |
| --- | --- | --- |
| UIAutomator，不连接CDP | 恢复卡片有节点，继续后打开菜单只剩WebView根；新转储仍相同 | 排除“必须连接CDP才复现”，没有证明具体根因 |
| 持续连接的辅助服务，全程不用UIAutomator | 冷启动加载后主页102节点、恢复页15、编辑页28；菜单4节点 | 瞬时UIAutomator连接也不是复现的必要条件 |
| 原生根刷新／逐节点刷新 | 子节点仍不可取得，刷新本身返回成功 | 刷新成功不代表树完整；不能据此推断页面没有按钮 |
| 真正TalkBack15.0.0.639625893，先启动读屏再重开应用 | 遍历恢复卡片并Alt+Enter继续；找到文档操作并激活；依次经过菜单标题、关闭、阅读、查找、图片、收到内容；激活收到列表；系统Back回编辑器，绿色焦点回文档操作 | 这条键盘读屏路径实际可用。初次进入文档通过辅助服务的原生按钮动作，后续上述遍历／激活使用TalkBack内核键盘事件 |
| 同一时段的辅助服务快照 | TalkBack可移动到菜单项并激活，辅助服务却仍只有4节点，某父节点声明1个孩子但取回null | 采集结果与真实读屏行为不一致；不能把空树直接判成全部读屏失效，也不能把它改记为通过 |
| 最终工具正例／反例 | 原配置冷启动加载后102节点、缺失孩子0，主页文字断言通过；仅要求应用标题时，缺失子树仍被拒绝 | 只证明本次采证守卫和该主页观察，不替代完整原生回归 |

TalkBack来自已有专用API35系统镜像的系统APK，SHA256 `6fb39f6f7d8381ce161b3e96d310660f378742ff364ea0e0a593d035d71e1385`，minSdk26；先核对API29上原先未安装，再临时安装到同一API29设备。API35仅启动读取系统APK，未安装主应用、修改设置或访问私有资料，随后sync关闭。

API29的实际键盘为 `/dev/input/event12`、`AT Translated Set 2 keyboard`；旧脚本只允许API35并固定event1。工具现接受显式选择的event1或event12，仍核对专用AVD、root、实际键盘名称和Alt键，才发送Alt+左右／Enter。TalkBack欢迎页及最终确认也通过真实键盘完成。未验证中文语音发音质量、手指触摸探索、全部弹窗或厂商设备。

## 采证工具修正与仍未解决的部分

新增[持续服务观察脚本](../scripts/observe-mobile-accessibility-service.py)和测试APK的按需快照广播。仅允许专用API29模拟器、前台开发包和持DUMP权限的请求；不采集事件内容，不通过DOM读树，不执行节点动作。每次记录实际APK摘要、服务flags／事件掩码、原生节点、缺失孩子、PNG和服务状态。阶段和设备端快照均拒绝覆盖；无 `--expect` 时 `assertionsPassed=null`，只采证，不算UI通过。

最后补充父节点声明孩子数与实际遍历数的一致性守卫，覆盖空孩子和深度上限造成的缺口。用已保留的102节点正例与4节点反例进行[原始记录核对](evidence/mobile-accessibility-boundary-2026-10-29/traversal-consistency.json)，分别为0处和1处不一致；该补充未重启设备重跑，也不新增原生场景通过数。

此前TalkBack守卫只匹配Bound services的第一行；同时启用辅助服务时，TalkBack在下一行，误判为未绑定。现只在完整的已绑定服务区间匹配TalkBack，避免把Enabled或Binding列表误作绑定成功。实际内核键盘编译和本次连续操作均已执行。

对include-not-important和全部事件掩码的配置试探没有作为修复留下。覆盖安装测试APK后，Android仍可能让已有绑定沿用旧配置：记录中一次flags仍为80，下一次为82且事件掩码仍2080，不能把它们当作预期配置的对照结果。显式重绑后实际全部事件掩码为-1，树仍不完整。最终恢复原flags80和事件掩码2080。辅助服务原95个文件未改，新增22个明确请求的诊断快照。

[Android UiAutomation文档](https://developer.android.com/reference/android/app/UiAutomation#FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)说明默认会抑制其他无障碍服务，因此连续TalkBack操作没有插入UIAutomator。[Chromium124源码](https://raw.githubusercontent.com/chromium/chromium/124.0.6367.219/content/public/android/java/src/org/chromium/content/browser/accessibility/WebContentsAccessibilityImpl.java)也存在无服务时自动停用与查询时重启的逻辑，但当前证据没有确认这就是本次故障原因。具体节点桥接／缓存／服务差异仍未定位；不为通过测试改主应用的inert或弹窗结构。

## 失败保留与数据收尾

- 冷启动最初只取得2节点，截图已显示准备中的主页；最终复测也出现主页已渲染、节点尚未完整的帧。稍后新观察为102节点主页。原帧都保留，没有将节点缺失说成画面空白，也未计启动性能通过。
- 第一次计划冷启动时，严格逐字节守卫拒绝了自身草稿的修订号／时间变化，重启未执行；紧随其后名称带cold的快照实际仍属原编辑器，见`persistent-restart.json`说明。随后核对只有这两个字段变化才实际重启，未放宽正文或其他资料保护。
- TalkBack欢迎页仍在前台时，快照因包名不符返回-3，没有记录其他应用节点。重复设备端快照令牌返回-21，没有覆盖证据。
- 最初收尾使用Windows默认编码读取含中文的原生JSON失败；原tar保留，显式UTF-8重试完成。不是应用或文件保护故障。
- 测试APK最终Gradle构建成功；Python和PowerShell解析、NDK实际编译、差异空白检查通过。没有为了工具改动重跑无关产品全套测试或重建主APK。

[收尾回执](evidence/mobile-accessibility-boundary-2026-10-29/closeout.json)核对100份资料、9份草稿、164个files／shared_prefs文件及原接收记录保持；唯一变化为本轮测试草稿的修订号／更新时间，完整78字节正文不变。该新笔记源文件仍不存在，上一轮系统导出的78字节副本不变。临时TalkBack已卸载、原辅助服务保持启用、输入法／字号／旋转／离线设置恢复，adb退出root，无诊断转发，sync后关闭本轮两台专用AVD。完整私有tar和APK留本机忽略目录，不进入Git。

1002049仍是待完整验收候选。本轮增加了真实TalkBack关键链路证据，没有解决一般节点树采集的不完整，也没有完成修正版B的全部接收核对／SAF重跑。下一项仍先处理这个采证断点，再补最终原生组合；API35预测性返回、完整触摸读屏、ARM实体机和正式发布保持独立验收。
