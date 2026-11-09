# 第二十一批：手机 JSON 结构浏览与字段修改

继续使用 `codex/mobile-0.1.0-foundation`，功能基线 v1.2.11。承接第二十批的 JSON 源码流程，本批完成按层浏览和标量值修改；桌面工作区独立推进。

## 从用户任务决定页面

用户在手机上打开配置文件，通常先找某个字段，核对当前值，再作少量修改。本批采用单列工作区：

1. 「浏览结构」进入当前 JSON 的根值，源码编辑器继续保留实例和历史，结构区域占据正文空间。
2. 每层只呈现当前对象或数组的直接子项，显示名称、类型和源码预览；每页 30 项，可按字段名或完整标量源码值筛选本层。
3. 点击进入详情，显示当前位置、原始值和「前往这段源码」。返回上一层保留筛选和所在页，并聚焦刚才的字段；系统返回键和文稿顶部返回键都先取消当前修改、再逐层返回、最后回到源码。
4. 编辑状态可修改文字、数值、布尔值和 null。文字无需手写 JSON 引号，数值保留完整写法；先「核对这次修改」，再「应用并回到源码」。未改文字不重写原有转义，取消不产生草稿。
5. 应用是一次可撤销的编辑，立即进入原有私有草稿保护流程；用户仍需明确保存到文件。保存冲突、恢复、副本和导出继续使用既有流程。

这里没有横向展开的桌面树形、多列检查器或每行多组操作菜单。路径用于识别位置；同名键额外显示第几项，内部身份使用分析节点编号与精确源码范围。

## 竞品和桌面审计

2026-10-24 阅读官方材料，未安装竞品，也未向竞品或在线转换器传输文件：

| 来源 | 已核对的能力 | 本项目的设计推论 |
| --- | --- | --- |
| [Json Genie 开发者 Google Play 页面](https://play.google.com/store/apps/details?id=com.tuyware.jsongenie) | Android 对象 / 数组结构视图、键 / 值 / 路径查找、字段编辑、原文视图及分享；页面声明 JSON 在本地处理 | 把找字段、确认位置和修改值串成一条手机流程。本批只实现本层筛选，不将它描述为全树路径搜索；也不采用竞品的大文件性能宣传作为自己的预算 |
| [QuickEdit 官方工具栏说明](https://rhmsoft.com/qedit/toolbar.html) | 撤销重做、源码查找、跳转行、保存及另存 | 保留源码作为完整操作入口，结构编辑回到同一编辑器历史，显式保存和原有来源保护继续可用 |
| [Acode 设置帮助](https://docs.acode.app/user-guide/settings) | 原始 settings.json 编辑及按语言选择格式化工具 | 结构浏览作为 JSON 专用工具，继续保留原文编辑和独立排版操作 |

上述资料支持产品取舍，不证明竞品对重复键、超大数值或原始转义的具体保留方式。本项目的保留能力来自独立字节比较。

审计当前桌面 `JsonEditorView.vue` 和 `formats/json.rs`：桌面已经有树形和标量范围替换，并对重复键与精度敏感数字限制结构编辑。移动端保留范围编辑、确认和失效保护的思想，使用独立的有界语法树范围，不通过 JS 对象映射重建文档。移动结构模型使用 UTF-16 源码下标，经既有 CodeMirror 换行映射转换；没有把桌面 Rust 的字节下标直接用于 WebView。

## 实现和预算

- `jsonStructure.ts` 基于现有 Lezer JSON 语法树记录对象 / 数组 / 标量范围。对象键只用于显示与同名计数，使用 Map，重复键不合并，`__proto__`、空键、斜线和转义键均作为数据处理。
- `jsonStructure.worker.ts` 独立分析；不导入桌面视图或 CodeMirror 编辑视图。Worker 结果只在完整源文和文档身份仍匹配时接受；取消、内容变化、切换文档、卸载或超时均终止实例。
- 单值修改只生成当前标量的替换文字。数值按严格 JSON 数值语法验证，保留大整数、负零及指数写法；文字只序列化用户输入的字符串。其余字节不经过 `JSON.parse` / `JSON.stringify` 往返。
- 复用第二十批的 262,144 UTF-16 单元、40,000 分析节点、64 层和 1,800 ms 等预算；结构另限最多 5,000 个值节点、每页 30 项。超过时不发布部分树，提示回到完整源码。
- 字段表单的原值和输入均最多 16,384 UTF-16 单元。较长的原值只能浏览部分预览并前往源码编辑。所有列表预览最多 160 单元，完整原值不会被预览截断后写回。
- 应用前再次核对完整源文、编辑状态和 CodeMirror 当前源文，阻止合成输入期间的替换。范围替换以独立事务进入历史，BOM 和未改动的混合换行保持原样。
- 文稿内容 / 身份变化后结构和候选立即失效，必须主动重新浏览；不会自动重新分析后把原候选套到新位置。

尚未实现 JSONC、Schema、全树键值 / 路径搜索、重命名键、增加 / 删除 / 调整字段或数组项。本批仅允许标量值替换，其他操作可继续使用完整源码编辑。

## 复现命令

```powershell
npm run test:mobile
npm run build:mobile
$env:LONGEDIT_PLAYWRIGHT_MODULE='C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL='http://127.0.0.1:9012/mobile.html'
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory E:/Android/BuildCache/json-structure-packaging-20261024
```

`test-mobile-json-structure.mjs` 包含 7 项新增逻辑检查；`test-mobile-json-structure-browser.mjs` 包含 10 组新增用户任务，包括实际 Worker 延迟 / 启动失败 / 超时注入，数据字节、旧笔记和草稿比较，以及 360px 深色 200% 字号下的可达性。注入与原生设备验证分别记录。

原生测试使用既有只读 `json-source.json` 合成夹具，分享后存入新独立 JSON 笔记，修改第二个 `same` 字段。预期内容由验证脚本对固定原文作唯一文字替换得到，没有调用产品分析器或编辑器生成预期。`verify-mobile-json-structure-native.mjs` 只读取专用 emulator-5558 / LongEdit_Compat_API29，先记录本轮所有既有资料摘要，然后逐阶段核对源文件、私有草稿、已保存内容、真实导出和原记录。

## 验证结果与产物

- 逻辑回归 101 / 101 通过，原始输出保存在[本轮日志](evidence/mobile-0.1.0/json-structure-native-2026-10-24/logic-tests.txt)。
- 新增结构浏览任务 10 组通过；第一次完整回归 20 脚本 / 142 组通过，见[初版完整索引](evidence/mobile-0.1.0/browser-regression-1792829206548/summary.json)。收尾发现从结构页进入文档查找或阅读时应先显示源码，修正后[专项 10 组再次通过](evidence/mobile-0.1.0/json-structure-browser-1792830019263/report.json)，[最终完整回归 20 脚本 / 142 组通过](evidence/mobile-0.1.0/browser-regression-1792830272096/summary.json)。两次完整回归均为各自连续运行，没有拼接分批结果。
- 打包异常门禁 17 项通过，原始记录在 `E:/Android/BuildCache/json-structure-packaging-20261024/verification.json`；每个实际 APK 另经过 ABI、ELF、嵌入原生库摘要、版本、应用 ID 和签名检查。
- API29 / WebView 124.0.6367.219 / x86_64，实际 MemTotal 2,040,592 KiB。使用真实系统分享面板、应用内字段表单、草稿、撤销 / 重做、明确保存、系统 Downloads 导出及回读、终止应用后从导入记录重新打开、Android 逐层返回和确认移除记录。各阶段断言、构建与截图见[原生索引](evidence/mobile-0.1.0/json-structure-native-2026-10-24/summary.json)。
- 原文 SHA-256 为 `3e4125585cd15d63fc3f40f2176d85759750007e16052ee59925ce38a044dd8c`；只修改第二个 `same` 为 `123456789012345678901234567890e+9999` 后为 `4060e84001d989d9ef73ff5fe9ff963a91ab143de9d69092819c350e6f0955ce`。原生草稿、重做、保存、重启重新打开与导出均按这个独立预期核对；撤销恢复原文摘要。
- 原有 57 个资料文件、8 份草稿内容 / 签名 / 修订、18 条文字导入记录和 3 份包记录（6 个文件）逐项保持。最终 58 个资料文件，唯一新增是本轮 UUID 命名的 JSON 笔记；本轮接收记录通过产品确认流程移除，来源只读夹具保持原字节。

最终开发包使用 `versionName=1.2.11`、`versionCode=1002025`、`com.longyuye.mdreader.mobile.dev`、minSdk 29 / targetSdk 36 和开发调试签名：

| 架构 | 本地文件 | 字节数 | SHA-256 |
| --- | --- | --- | --- |
| x86_64 | `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | 127,076,442 | `867579708f1dfe0607ecab15f1245b993a8c9a3be48026c9863ee5e45e87d465` |
| ARM64 | `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | 126,419,261 | `cf20a87481e756d7182528b271186d8bb787fbfe4789c3cb7f33017736b9c850` |

构建记录如实保留 `4b647519396947ffb25a3409206522fcba291c87 + dirty`，不是之后的源码提交。完整字段修改原生周期使用初版 APK（x86_64 摘要 `64aaa709…345b6c`）；最终入口修正后重新构建两个架构，并用最终 x86_64 覆盖安装核对查找 / 阅读路由和全部资料。初版 ARM 原始记录、初版 x86_64 已观察字段及最终两份原始构建记录分别保留，避免把早期截图归于后来的构建。

最终安装摘要与本轮 x86_64 产物一致。专用模拟器的无障碍设置已恢复为本轮记录的 `null / 0`，完成 sync 后仅停止 emulator-5558；其他设备未操作。9012 本地交互预览继续运行，结束时 HTTP 200。

## 首次失败和验收边界

- 新逻辑测试最初把固定夹具的根字段数量误记为 8，独立枚举实际为 7；修正测试预期后通过，未改产品解析结果来迁就断言。
- API29 的 UIAutomator 在容器滚动后曾继续返回旧按钮边界，第一次同名字段点击落在原列表。保留 `duplicate-detail.png`（实际上仍是根列表）及后来的 `duplicate-detail-visible.png`；依据实际截图坐标进入新详情后再读取新页面状态。此现象没有被算作已完成 TalkBack 触摸探索验证。
- 导出流程首次等待了不存在的「导出成功」短文案；实际已显示「文字副本已导出并回读确认，原文和草稿继续保留。」。重新按真实文案和导出文件摘要核对通过。最终查找输入在 UIAutomator 中是空文字 EditText，使用关联标签的实际界面和唯一输入框完成输入，并确认 1 / 2 命中。
- 结构页调用全局文档查找 / 阅读的可见性缺口在收尾审计中修复，专项回归覆盖对应入口，最终包另行验证。

本轮没有安装竞品、操作真实个人资料、连接云提供器、使用安卓真机、验证完整触摸无障碍、构建 iOS 或发布正式签名版本。M0 / M2 / A11 / A12 尚未满足的退出条件继续保留。下一步先完成 JSON 全树查找及键 / 容器操作，再按 M4 顺序推进其他结构化格式。
