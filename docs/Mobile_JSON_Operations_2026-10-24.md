# 第二十二批：手机 JSON 全树查找与结构操作

继续在 `codex/mobile-0.1.0-foundation` 开发，功能基线 v1.2.11。本批承接已有结构浏览和标量修改，完成全树字段 / 值查找、重命名对象字段、对象新增、数组追加、移除字段 / 数组项及相邻数组项移动。

## 用户任务与竞品依据

2026-10-24 阅读 [Json Genie 开发者的 Google Play 页面](https://play.google.com/store/apps/details?id=com.tuyware.jsongenie)和 [QuickEdit 官方 Search/Replace 帮助](https://rhmsoft.com/qedit/search.html)。前者介绍跨层键 / 值 / 路径查找、查看上下文后返回，以及结构增删、移动；后者区分查找条件、进入查找状态与前后命中操作。这里是官方资料分析，没有安装竞品、向竞品传输资料或采用宣传中的大文件性能数字。

本项目据此作出以下设计选择：

1. 「筛选本层」继续负责眼前列表；「查找整个 JSON」打开独立结果列表，查找所有层级的字段名和标量值。匹配忽略大小写，采用字面查找，字符串同时检查原始写法和解码后的文字。
2. 每个结果显示所在层级、同名序号、类型和源码预览。进入详情后可返回同一结果页和按钮焦点；结束全树查找回到发起查找时的浏览位置。本批不提供路径查询语法或正则表达式。
3. 编辑状态下，在字段详情中展开「更多结构操作」。对象字段可重命名；对象可新增字段；数组可追加；除根值外可移除整项，数组项可与前 / 后一项交换。列表行只保留进入详情的动作。
4. 新增使用类型表单：文字无需输入 JSON 引号，数值保留完整写法，布尔值明确选择，null、空对象和空数组可直接创建。新容器可随后继续进入并添加内容。
5. 每项操作先准备候选，展示具体位置以及替换前后的源码范围。取消、返回、停止或处理失败都不会修改正文；只有主动「应用结构修改并回到源码」才进入原有草稿保护，文件仍需单独保存。

保存、来源冲突、私有草稿恢复、独立副本和导出继续复用已有工作流。未改动内容中的大整数、负零、指数写法、重复键、转义和换行仍保持原文。

## 实现边界

- 分析模型额外记录对象键的源文范围，继续使用值节点编号区分同名键。结构任务在独立 Worker 中根据完整源文重新分析目标，避免使用旧字段范围。
- 重命名只替换选中键的字面量，名称未改时保留原转义。新增和重命名主动阻止产生新的同名键，按解码后的名称比较；原文件中的重复键仍可分别选择、重命名、移除或编辑。
- 新增根据当前容器的分隔空白和首个属性的冒号风格构造条目，只插入新源码。移除按首项 / 中项 / 末项 / 唯一项处理相邻逗号，嵌套容器整体移除；根值禁止移除。
- 数组移动交换两个相邻值的完整源文，保留两者之间的分隔空白；不通过 JS 数组或对象重建文稿。数组边界按钮禁用，Worker 同时再次检查边界。
- 每份结构候选都重新验证完整 JSON 语法、层数和节点预算。Worker 结果必须与完整源文、文档身份和目标编号仍匹配；内容 / 身份变化、取消、卸载及超时都会终止任务。
- CodeMirror 仍使用单次隔离历史事务。结构操作可能插入或移动带混合换行的内容，因此事务同时采用候选全文的换行元数据，撤销恢复之前的完整格式信息。
- 原有结构上限继续为 262,144 UTF-16 单元、40,000 分析节点、64 层、5,000 个值节点与 1,800 ms。新名称和输入最多 16,384 UTF-16 单元；全树查找关键词最多 128 单元，统计全部命中但最多发布 200 个结果，每页 30 项。超过范围时明确回到完整源码，不发布部分树或部分修改。

未实现任意数组插入位置、批量替换、对象字段排序、剪贴板节点复制、跨层移动、JSONC、Schema 或路径查询语法。已有源码编辑可继续处理这些内容。

## 可复现检查

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory E:/Android/BuildCache/json-operations-packaging-20261024
```

`test-mobile-json-operations.mjs` 增加 9 项逻辑检查，涵盖跨层解码文字、命中上限、同名键、名称冲突、每种逗号位置、空容器、完整源码移动、预算和实际 CodeMirror 的撤销重做。`test-mobile-json-operations-browser.mjs` 增加 10 组用户任务，分别核对只读查找、实际表单修改、草稿与文件、取消、旧结果失效、真实 Worker 延迟 / 失败 / 超时，以及深色 360px / 200% 字号下的确认操作。

原生测试使用既有只读 JSON 夹具，经系统分享存入独立 UUID 笔记，再查找第二个 `same` 字段、重命名、新增、数组追加 / 移动、移除、撤销重做、保存和导出。`verify-mobile-json-operations-native.mjs` 的预期由固定原文的唯一文字替换组成，未调用产品生成器；逐阶段核对原有资料、草稿、接收记录和包文件，并比较新增文稿的实际字节。

## 验证和开发包

- 110 项逻辑检查通过，输出保存在[本轮原始日志](evidence/mobile-0.1.0/json-operations-native-2026-10-24/logic-tests.txt)。
- 新增 10 组浏览器任务通过。[初版完整回归](evidence/mobile-0.1.0/browser-regression-1792831742087/summary.json)和[入口位置修正后的最终完整回归](evidence/mobile-0.1.0/browser-regression-1792832263939/summary.json)均为 21 个脚本连续运行、152 组通过，没有拼接分批结果。
- 17 项打包门禁通过，原始记录在 `E:/Android/BuildCache/json-operations-packaging-20261024/verification.json`。实际两架构产物另校验 ABI、ELF、嵌入原生库摘要、版本、应用 ID 及签名。
- API29 / WebView 124.0.6367.219 的实际文件周期、各阶段草稿摘要、系统导出回读和原数据保护由[本轮原生索引](evidence/mobile-0.1.0/json-operations-native-2026-10-24/summary.json)汇总。读取 / 保存 / 导出仍使用真实插件和系统文件接口，没有用浏览器存储代替。

开发包为 `versionName=1.2.11`、`versionCode=1002026`、`com.longyuye.mdreader.mobile.dev`、minSdk 29 / targetSdk 36，采用开发调试签名：

| 架构 | 文件 | 字节数 | SHA-256 |
| --- | --- | --- | --- |
| x86_64 | `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | 127,103,378 | `dc3ba5cbff7974639c17287cf111b443ee7787fcac100f432876e1dce9862078` |
| ARM64 | `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | 126,446,405 | `8210c2e914d606c7a33f8bf5e7b349ca3aaa83f0b92ec1b4af316b3b7c58a302` |

构建记录如实保留 `40d57f77babdfce0aa898da192c291ea86e784e9 + dirty`，不改写为后续提交。首次系统接收和独立存入使用初版包；安卓检查发现查找按钮位于标题上方，被标题定位滚动带出视野，修正后重建两个架构并覆盖安装，全部结构操作使用最终 x86_64 包。初版与最终构建记录分别保留。

## 原生自动化的范围

API29 WebView 在容器滚动后持续向 UIAutomator 返回旧边界，出现已显示按钮的范围仍为 `[0,0][0,0]` 或位于页脚之下。实际截图和 DOM 所呈现页面与旧坐标分开保留，没有将这类错误点击算作操作成功，也没有通过改写应用数据完成测试。

专用测试 APK 的 `FixtureAccessibilityService` 增加显式 shell 请求：只在 API29 的 ranchu / goldfish 模拟硬件注册，发送方必须持有 `android.permission.DUMP`；根窗口必须属于开发版应用，再按精确名称激活可用按钮。使用 Android 的 [ACTION_SHOW_ON_SCREEN / ACTION_CLICK](https://developer.android.com/reference/android/view/accessibility/AccessibilityNodeInfo.AccessibilityAction)执行控件动作，结果回执只包含状态码。服务仍不处理事件内容、不保留界面内容、不请求触摸探索；动作名称由本轮脚本记录，截图和 XML 继续由既有工具采集。

类型选择和文字输入仍通过系统选择窗口及输入事件，系统导出保存也使用原生 DocumentsUI。本批这些控件动作验证真实业务和文件路径，不等于 Android 真机触摸验收、TalkBack 触摸探索或全部点击坐标验收。测试结束恢复原无障碍设置，仅停止本轮专用 emulator-5558。

## 首次失败与剩余工作

- TypeScript 构建首次拒绝 `Array.at`，已改用当前目标库支持的数组下标，未抬高运行环境要求。测试服务首次编译发现 `ACTION_SHOW_ON_SCREEN` 位于 `AccessibilityAction`，改为该类型的动作 ID 后独立编译通过。
- 安卓首次通过旧坐标误点了被页脚裁切的第二个结果，随后返回了浏览页；保留该截图，之后改用唯一值 `-0` 定位第二个同名字段，并使用控件动作完成后续流程。
- 查找 / 返回结果入口移到标题下方，并新增无需先滚动的可见范围断言；最终浏览器回归覆盖该修正。
- 原有 58 个资料文件、8 份草稿内容 / 签名 / 修订、18 条文本导入记录和 3 份包记录（6 文件）按本轮基线保护；本轮只发布新的独立 JSON 笔记，接收记录在确认后移除。
- 控件动作回执仅表示激活请求被接受。首次在冷启动 / 返回资料库尚未完成时继续操作，被窗口范围或页面切换保护拒绝；补上页面就绪等待后完成。逐层返回会聚焦原来的数组行，因此根标题可以离开视野，验收依据保存的页面状态及下一次返回源码，而不是强制根标题可见。

全部原生阶段通过，最终 59 个资料文件，唯一新增是本轮 UUID 命名的 JSON 笔记。固定原文 SHA-256 为 `3e4125585cd15d63fc3f40f2176d85759750007e16052ee59925ce38a044dd8c`，最终保存和实际导出均为 `ddf4577f7e786fc58a4bc4a3db6361c7cf48a9c75187776c65c04f26c76b741d`。本轮新增字段先被独立核对，随后移除；最终文稿保留重命名、数组追加与移动，原有大整数和转义保持。系统窗口上的测试控件动作明确返回拒绝，系统保存按钮通过原有真实 UI 操作完成。

下一步接入 YAML 源码与检查，再依次推进 XML / TOML；JSON 的 Schema、JSONC 和更高级节点操作继续后续增强。安卓真机、真实云提供器、完整触摸无障碍、iOS 和正式签名发布仍待独立验收。
