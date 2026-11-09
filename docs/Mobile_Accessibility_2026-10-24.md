# 第七批：移动端无障碍与操作接续

本批沿用 `codex/mobile-0.1.0-foundation`，从第六批提交 `8bd27b3fffad68e20ae4a669ff29260ad1556433` 推进 A06 / A11。用户任务是：知道当前打开了什么页面，能继续找到刚才的文件，读屏时知道开关和保存结果，在弹窗中能发现错误并返回操作。

## 调研与设计决定

本轮调查官方文档和开源实现说明，没有安装竞品，也没有把其无障碍声明视作本项目的验收结果。

| 依据 | 对本项目的决定 |
| --- | --- |
| [Joplin 移动读屏导航](https://joplinapp.org/help/apps/screen_reader_accessibility/#navigating-the-mobile-app)将列表、阅读、编辑和配置作为可识别的屏幕，并解释新增操作的焦点顺序 | 给页面和文档提供标题，切换后定位标题；返回文档列表时找回文件行，创建后回到新文件。 |
| [Joplin 无障碍开发指南](https://joplinapp.org/help/dev/accessibility/)要求有标签的控件、键盘和读屏验证，并分别说明自动检查与读屏测试 | 设置按钮和库选择明确表达状态；自动检查覆盖实际任务状态，原生读屏另记证据。 |
| [Obsidian 移动端说明](https://obsidian.md/help/mobile)提供可见的常用操作、编辑工具栏和返回入口 | 保留现有可见导航；本批完善返回后的任务位置与小屏控件，不新增隐藏手势依赖。 |
| [W3C 模态弹窗模式](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)说明焦点应停留在弹窗内，关闭后回到触发位置或后续合理操作 | 只循环可见、可用的控件，包含链接、折叠说明和文本区域；后续操作已聚焦编辑器时不再抢回旧菜单。 |
| [Android 无障碍测试](https://developer.android.com/guide/topics/ui/accessibility/testing)和 [axe-core](https://github.com/dequelabs/axe-core) | 检查结果只代表实际运行规则和任务；不以网页自动扫描代替设备、读屏及真人可用性。 |

表中的产品设计为本项目依据这些资料作出的取舍，不代表竞品在所有设备上的实际行为。

## 已实现

1. 文档标题改为可聚焦的一级标题，阅读 / 编辑正文提供主要内容区域；导航、恢复记录、文件夹切换和文档阅读有明确的焦点去向。
2. 记录打开文档前的列表入口和滚动位置。返回后恢复对应文件行；「接着上次」与「最近」保留各自入口。新建笔记返回列表时定位新文件。
3. 深色外观和当前资料库提供 `aria-pressed`，选择库的入口提供弹窗状态；文档查找关闭后回到查找按钮。
4. 提示组件在模态面板内呈现当前错误，背景保持 inert；键盘循环过滤隐藏 / 禁用控件，保留正确的工作流焦点。
5. 草稿保护的视觉进度继续即时显示；读屏仅在保护稳定后提示，不随每个按键反复播报进行中状态。显式保存分别反馈进行中和完成。
6. 提高浅色辅助文字和深色搜索高亮的对比度，恢复搜索输入的键盘焦点轮廓；48 CSS px 图标触控区域和减少动态效果继续有效。

所有改动限于移动端组件、样式和测试工具；存储协议、原文、附件及阅读隔离策略保持既有契约。

## 本地复核

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
npm run test:mobile-accessibility-browser
./scripts/build-mobile-debug.ps1 -Target x86_64
```

构建完成后再运行静态预览任务，避免 Vite 重建 dist 时浏览器读取到不完整资源。新检查使用固定的 `axe-core@4.14.0` 开发依赖，扫描 WCAG 2 A / AA、2.1 A / AA、2.2 AA 标签规则，保存页面截图、ARIA 树、违规及需人工复核项。沙箱正文 iframe 不注入检查脚本，保留 CSP；其设备阅读另行核对。

## 浏览器结果

45 项逻辑测试通过。新增 5 组用户任务、12 个页面状态检查通过，与原有 35 组浏览器回归分别留存。扫描通过仅表示所选自动规则没有返回违规，不代表全部无障碍要求已满足。

| 范围 | 最终证据 |
| --- | --- |
| 新增 5 组、12 个状态 | [无障碍任务](evidence/mobile-0.1.0/accessibility-browser-1792789244137/report.json) |
| 基础创建、恢复、冲突副本 6 组 | [基础任务](evidence/mobile-0.1.0/browser-1792789244137/report.json) |
| 阅读 6 组 | [阅读任务](evidence/mobile-0.1.0/reading-browser-1792786558528/report.json) |
| 整库查找 6 组 | [查找任务](evidence/mobile-0.1.0/search-browser-1792786558701/report.json) |
| 编辑与输入 6 组 | [编辑任务](evidence/mobile-0.1.0/editor-browser-1792786558722/report.json) |
| 存储边界 4 组 | [边界任务](evidence/mobile-0.1.0/boundaries-browser-1792786602051/report.json) |
| 图片与附件 7 组 | [附件任务](evidence/mobile-0.1.0/attachments-browser-1792786602121/report.json) |

首轮对比度报告和失败截图继续保留：浅色辅助文字原为 3.38–3.75:1，深色命中高亮原为 3.69:1，低于小字号文字规则的 4.5:1。首次基线扫描在创建错误步骤因驱动断言文案写错而结束，已扫描的八个状态仍可查；不将基线中的未执行行为断言计入通过。修复后另一次扫描发现深色高亮问题，修复并重新运行。基础旧测试原先要求返回底部导航，已改为核对刚创建的文件行。最终复核补充了保存失败后清除「正在保存」的过期读屏状态，并在原有来源冲突任务中加入断言；基础及新增无障碍任务再次通过。

## 原生范围与环境

原 C 盘剩余约 1 GiB，模拟器拒绝启动。本批在 E 盘建立独立测试环境，保留原 `LongEdit_API35` 的文件和用户数据，不清理历史证据。先创建克隆副本 `LongEdit_A11y_API35`，再创建全新 `LongEdit_A11y_Fresh_API35`。在当前镜像 / 模拟器组合中未找到可用的主屏内核触摸节点；尝试旧输入后端 `-feature -VirtioInput` 后，最终采用已核对的内核键盘设备完成下述任务。相关触摸尝试不计为产品验收，也未据此修改应用的原生输入代码。

`mobile-talkback-emulator.ps1` / `mobile-talkback-keyboard.c` 仅用于专用、可 root 的模拟器，校验 AVD 与实际键盘设备，通过 NDK 编译独立小工具，发送 TalkBack 的 Alt+右 / 左、Alt+Enter。工具不进入 APK、不注入 WebView、不改应用数据，也不需要原生网页调试桥。普通 ADB 导航 / 文本输入与 TalkBack 键盘遍历分别记录；[Google 键盘操作说明](https://support.google.com/accessibility/android/answer/6110948?hl=en-GB)供复核。UIAutomator 读取可能重启读屏服务，因此连续读屏遍历中不穿插 UI 树读取，操作和视觉朗读字幕按截图确认。

最终设备为 Android 15 / API 35、WebView 124.0.6367.219、TalkBack 15.0.0.639625893。以下主体任务在[首个 APK](evidence/mobile-0.1.0/accessibility-native-2026-10-24/build-before-failed-save-status.json)上完成，为真实 TalkBack 的键盘遍历 / 激活与人工检查的绿色焦点框、朗读字幕。随后仅补充保存报错时清除过期播报，基础来源冲突与无障碍浏览器任务重跑通过；最终 APK 更新安装后，另行核对文件、草稿和安装包摘要。更新后的连续读屏尝试受欢迎页最终确认和启动时序影响，没有计为重复通过。中文语音发音质量没有在本轮验收。

| 原生任务 | 核对结果与截图 |
| --- | --- |
| 资料库弹窗 | Alt+Enter 打开弹窗，依次遍历标题、关闭和当前库；当前库字幕显示 On，激活后回到原库选择入口。[选中状态](evidence/mobile-0.1.0/accessibility-native-2026-10-24/final-library-dialog-next-3.png) / [返回](evidence/mobile-0.1.0/accessibility-native-2026-10-24/final-picker-return.png) |
| 外观状态 | 普通 ADB 点击进入设置；TalkBack 键盘遍历至深色外观，字幕由 Off 变为 On，界面同步变化。[关](evidence/mobile-0.1.0/accessibility-native-2026-10-24/theme-state-before.png) / [开](evidence/mobile-0.1.0/accessibility-native-2026-10-24/theme-state-after.png) |
| 创建与保存 | 普通 ADB 操作打开创建面板，注入 ASCII 名称并用 Enter 提交，正文输入 `NativeSavedBody` 后保存；这是普通键盘事件，不计为拼音输入或 TalkBack 触摸验收。[输入](evidence/mobile-0.1.0/accessibility-native-2026-10-24/draft-protected.png) / [保存](evidence/mobile-0.1.0/accessibility-native-2026-10-24/save-confirmed.png) |
| 隔离正文 | 切换阅读后，通过 TalkBack 的 Alt+右遍历进入 article，字幕包含实际正文 `NativeSavedBody`。[正文](evidence/mobile-0.1.0/accessibility-native-2026-10-24/reading-next-4.png) |
| 文件与标题接续 | 系统返回后焦点回到新文件行，TalkBack 激活重开后定位文件标题，再返回仍定位同一文件。[返回](evidence/mobile-0.1.0/accessibility-native-2026-10-24/return-created-note.png) / [重开标题](evidence/mobile-0.1.0/accessibility-native-2026-10-24/reopen-title-focus.png) |

[只读核对脚本](../scripts/verify-mobile-accessibility-native.mjs)确认源文件仍精确等于 `NativeSavedBody`、没有遗留私有草稿、截图是有效 PNG，实际已安装 APK 摘要与构建记录一致。[核对结果](evidence/mobile-0.1.0/accessibility-native-2026-10-24/verification.json)将 `touchExplorationVerified` 和 `completeTalkBackAcceptance` 明确设为 false；文件与摘要检查不代替字幕人工检查。完整动作及首次失败见[交互记录](evidence/mobile-0.1.0/accessibility-native-2026-10-24/tasks.json)。

最终开发 APK 为 x86_64 / debug，126,843,342 字节，SHA-256 为 `51d048f7c220812b72fc8e2d157d77afb8e7799afa64328819d5d587d099b9db`。构建来源为父提交 `8bd27b3f` 加本批未提交源码，构建记录明确标记 `sourceDirty=true`。APK 信息见[构建记录](evidence/mobile-0.1.0/accessibility-native-2026-10-24/build-record.json)。退出测试时关闭 TalkBack、恢复 1.0 字号并退出 adb root；专用 AVD 的字幕开关和测试通知授权保留供复测。原模拟器、测试 AVD、截图和日志继续保留。

## 后续退出条件

继续完成所有核心弹窗 / 来源失效 / 图片恢复状态的完整 TalkBack 遍历、中文语音效果与真机触摸；最低 API 29、厂商输入法、arm64、离线 release、升级和性能矩阵仍按既定计划验收。A11 / A12 保持进行中。
