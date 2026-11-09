# 移动端阶段5收口：接收期间继续原任务与原生验收准备

2026-10-29，起点 `d1c377ab2`，分支 `codex/mobile-0.1.0-foundation`。本轮选择一个用户任务：“我正在写，收到其他应用的文件，核对后还能继续刚才的输入。”复用阶段5已有导入、图片、导出与恢复证据，只补跨入口观察和本地测试环境的实际断点。没有新增产品页面或改动桌面目录，仅本地提交。

## 观察、竞品与取舍

[Obsidian 手机说明](https://obsidian.md/help/mobile)把导航、编辑工具与更多动作分开，历史不可用时禁用对应操作；[Notion 手机导出](https://www.notion.com/help/export-your-content)从当前页菜单进入，选格式后打开系统分享菜单。由此继续采用“当前对象 → 按需子任务 → 明确执行”的顺序，不在主页面堆叠说明和设置。这些官方资料没有证明竞品接收时的草稿保护、取消后精确回退或本机重试方式，本轮也未安装或录制竞品。

[Android 返回指南](https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture)要求通过系统返回 API 处理自定义返回，并按回调职责与启用状态管理返回栈。本项目当前使用 AndroidX `OnBackPressedCallback`，但其始终启用、根层由异步网页回复后 `finish()` 的实现，尚不能证明预测性返回动画与手势取消满足预期。该项进入新包原生验收，不用浏览器桥调用或旧包截图代替。

实际复测先失败在 PDF 首页预览：[首次报告](evidence/mobile-stage5-native-preparation-2026-10-29/first-failure-report.json)、[原图](evidence/mobile-stage5-native-preparation-2026-10-29/first-failure.png)。进一步查看浏览器控制台及响应，发现本轮临时 `python -m http.server` 在这台 Windows 上把 PDF 工作线程 `.mjs` 返回为 `text/plain`；模块加载被拒绝，页面正确显示了预览不可用的退路。这是预览环境故障，不据此重写 PDF 页面或伪造预览成功。

新增 [固定 MIME 的本地服务](../scripts/serve-mobile-preview.py)：只监听 `127.0.0.1`，显式发送 JavaScript 模块、Wasm 等类型，禁用缓存，缺失工作线程仍返回404。只替换本轮自己启动、命令行和工作目录已核对的9012进程；图库9026和其他应用服务未改。正式 Vue、存储、原生代码及已构建 dist 均保持。

## 当前实页复核

[本轮原图与既有冻结稿](evidence/mobile-stage5-native-preparation-2026-10-29/review.html)保留9张正式浏览器实页、首次失败及3张已有设计参考。参考沿用接收列表／错误页原稿和阶段5C4文字预览v2，没有为当前截图重画设计。

| 观察点 | 结果与限制 |
| --- | --- |
| 编辑期间收到混合文件 | 不自动切换文档或打开弹窗；进入收件列表前保护完整输入 |
| 列表、核对、正文、附件图片 | 逐层返回；保留同一编辑器、撤销／重做、原文和草稿；列表恢复滚动及真实入口焦点 |
| 新到达与错误 | 不替换正在核对的内容；错误单独查看和确认，不吞掉有效待接收项 |
| 失败和重试 | 保护失败留在编辑器；列表失败保留缓存；核对失败不存入；写入后打开失败重试同一目标，不生成第二份 |
| 大字与短屏 | 320px、200%文字和346px短视口下主要动作可达；完整信息仍需要正文滚动。这不是 Android 输入法证明 |
| 与设计的外形 | 列表／错误沿用64px任务栏、16px横向边距及固定底部操作；文字完整预览沿用阶段5C4独立页。旧接收原稿的字符图标、字体基线与正式SVG仍有已知差异；本轮合成文字也与预览参考不同，不宣称像素相同 |

一般说明继续经问号打开；实际文件名、来源、待存入状态、授权失败原因及删除风险保留。没有因“删说明”而隐藏操作后果。

## 可重复的本地验证

完成一次 `npm run build:mobile` 后再启动服务；收集同一候选证据期间不重建 dist。本轮复用上一轮已完成构建，入口资源仍为 `mobile-D1cSHYaV.js`、`mobile-CHPzoowG.css`，没有重复构建未改变的产品源码。

```powershell
Set-Location 'C:\Users\39633\.codex\worktrees\mobile-0-1-0-foundation\MDReader'
python scripts/serve-mobile-preview.py --port 9012
```

在另一个终端运行：

```powershell
$env:LONGEDIT_PLAYWRIGHT_MODULE = 'C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
node scripts/test-mobile-incoming-browser.mjs
python scripts/test-mobile-preview-server.py
python scripts/inspect-mobile-native-candidate.py --output docs/evidence/mobile-0.1.0/native-inventory-NEW.json
```

原生清点的输出必须用新文件名；脚本拒绝覆盖既有证据。它只读源码、构建文件、SDK文件及5037端口是否监听，不调用adb，不启动模拟器、不安装应用。源码文件摘要也不自动证明 dist 是由这份源码构建，实际构建对应关系仍须构建回执。

结果：原场景重跑14组通过、7次axe扫描无违规，扫描器未收集全部未决项，不能据此宣称完整无障碍验收；9张实页原图逐张查看；预览服务HTTP测试在强制 `.mjs=text/plain` 的环境下通过模块／Wasm响应、无缓存和缺失文件404检查。新服务实际PDF工作线程响应为 `application/javascript`，原始工作线程字节未改。浏览器没有页面异常或外部HTTP请求。详见[最终报告](evidence/mobile-stage5-native-preparation-2026-10-29/browser-report.json)、[HTTP记录](evidence/mobile-stage5-native-preparation-2026-10-29/preview-http.json)、[来源与摘要](evidence/mobile-stage5-native-preparation-2026-10-29/provenance.json)。

## Android 候选与环境

[离线清点](evidence/mobile-stage5-native-preparation-2026-10-29/native-inventory.json)实际核对1267份已跟踪输入、dist入口、两个精确路径的APK及内部应用SO，不按“最新文件”猜包。

| 项目 | 本轮事实 |
| --- | --- |
| 配置候选 | `com.longyuye.mdreader.mobile.dev`，versionName `1.2.11`，versionCode `1002049`仍为预留检查点，未产出新包 |
| 两个已有APK | 均为`1002048`；APK及SO摘要与旧构建记录相符，记录的来源为`0d672730c`且dirty |
| 内嵌页面 | 旧包包含`mobile-DLDLbscP.js`／`mobile-DE-jZ7dK.css`，与当前dist不同，不能验收本轮新交互 |
| SDK文件 | API36、Build Tools36、NDK27.2.12479018、adb组件及emulator文件存在；JDK目录环境值为`E:\JDK\17.0.8`。文件存在不等于当前可成功编译 |
| 设备 | 5037未监听；未启动adb、未发现或选择设备，也未读取已安装应用。不能据此断言没有手机连接 |
| 原生完成状态 | 当前重设计候选未通过原生验收；旧APK历史验收继续只对应旧候选 |

## 下一项按顺序执行

先沿用现有双ABI构建脚本冻结新候选，核对包名、序号、有效签名、SO和前端内容；构建前明确1002049预留检查点的归属，不因重试自动递增。只读清点不能替代这一步。之后选择专用模拟器，核对实际AVD和安装摘要，再迁移需要的旧原生验证入口；例如旧`verify-mobile-text-export-native.mjs`仍断言1002017及旧夹具目录，直接套跑会验错候选。本轮未执行这些旧脚本。

第一条原生验收链继续使用本轮用户任务，步骤见[执行表](evidence/mobile-stage5-native-preparation-2026-10-29/native-itinerary.json)。先在专用模拟器执行，再在ARM实体机执行：

| 顺序 | 操作与通过条件 |
| --- | --- |
| 1 | 记录新包摘要、设备API／ABI／WebView／输入法、导航方式及独立合成数据基线；原有文件／草稿摘要保持 |
| 2 | 输入中文、emoji及多行未保存文字；真实系统Back先收键盘，仍在同一编辑器、选区和输入 |
| 3 | 从其他应用分别分享文字、PDF、附件包；不自动覆盖正文或抢走正在输入的任务 |
| 4 | 进收件列表，文字核对→完整预览→返回；PDF核对→稍后；包核对→清单→图片→逐层返回，回原编辑器并继续撤销／重做 |
| 5 | 后台再前台、核对期间再到达、受控提供器失败／重读、草稿保护失败；保留真实来源、完整内容及原任务 |
| 6 | 原稿发起文字／附件包导出；真实系统选择器取消、重新选择及成功后，回同一快照和原任务；独立读取输出字节／ZIP CRC，原件不变 |
| 7 | 捕获完整私有保护副本后，再做专用测试进程终止／重启；通过产品恢复入口继续，不能以清数据或重装绕过 |
| 8 | API35及以上用真实手势核对完成／取消预测性返回、根页回系统；TalkBack逐控件完成任务。键盘、系统选择器和应用层各只消费一层 |

每步保留原图、UI树、候选与安装摘要、输入／输出数据核对；首次失败保留后再必要修复。实体ARM、真实云提供器和厂商输入法另列结果，不与模拟器通过合并。阶段5的网页跨入口收口检查完成，阶段5原生出口及阶段6整体验收仍未完成；本轮没有启动设备、安装新APK、推送或发布。
