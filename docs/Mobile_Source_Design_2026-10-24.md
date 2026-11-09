# 第二十八批：先出图，再对齐 TOML 手机界面

日期：2026-10-24。用户在第二十七批收尾时追加“出图设计界面，再与页面外形对齐”。本批以刚完成的 TOML 阅读 / 源码页为设计样板，继续 `codex/mobile-0.1.0-foundation`；Android 开发包序号 `1002032`。

## 设计依据与交付

沿用项目米白、深绿色和浅鼠尾草色，不另造品牌。参考本轮已调查的 [QuickEdit 工具栏](https://rhmsoft.com/qedit/toolbar.html)与 [Acode QuickTools](https://docs.acode.app/user-guide/quicktools)，优先让文件身份、阅读 / 源码切换、检查定位、保存和撤销保持清楚；源码占据主要空间，诊断细节按需展开。

通过内置 `image_gen` 生成高保真竖屏设计图，之后两次局部修正末行的结束括号，确保“未结束的数组”与示意源码一致。选定图已复制到仓库，原始输出保留在工具默认生成目录。

- [选定设计图](design/mobile-0.1.0/toml-source-v1.png)
- [完整提示词与两次修正](design/mobile-0.1.0/toml-source-v1-prompts.txt)
- [设计 / 实际页面对照图](design/mobile-0.1.0/toml-source-v1-comparison-final.png) · [并排 HTML](design/mobile-0.1.0/toml-source-v1-comparison-final.html)
- [实际浅色页](design/mobile-0.1.0/toml-source-v1-implemented-final.png) · [实际深色页](design/mobile-0.1.0/toml-source-v1-dark-final.png)

实现使用真实 Vue / CodeMirror 控件和现有 Lucide 图标，设计 PNG 只作为评审参考，不作为页面背景或可点击的替身。此轮覆盖 TOML 页；其他格式后续在各自交互边界下复用，不声称全部移动页面均已重设计。

## 已落地

- 文档栏显示文件名、文档实际所属资料库和保存状态，保存按钮明确；长名称仍省略显示，完整身份保留在文件工作流。
- 阅读 / 源码切换是实际操作，切换前保护草稿，保留编辑实例、历史与当前内容。结构化文稿仍沿用独立保存。
- 紧凑的检查反馈卡，用中文解释常见问题；版本边界、原始诊断和完整说明由信息按钮展开。检查、取消、超时、预算和只读原文保留原有行为。
- 文件 / UTF-8 标题栏、圆角源码卡、行号分栏、明确的字符串和数字颜色、固定底部撤销 / 重做 / 草稿状态 / 阅读工具条。
- 错误波浪线来自实际检查的源偏移，使用独立的 CodeMirror 装饰状态。只显示当前完整原文的结果；正文一变就清除，并随编辑映射位置，避免旧范围越界。定位、修改、撤销和重检均不通过装饰改写源码。
- 浅色与深色分别使用语义色，放大文字允许换行 / 内部滚动；极短视口收起模式栏和文件标题栏，文档菜单保留阅读 / 编辑路径。

TOML 样式限定在对应文稿类名下，其他格式保留原来的主要 DOM 与布局；共享编辑器的新装饰状态在无 TOML 问题时为空。

## 同尺寸外形核对

以 390 × 844 的应用区域核对；浏览器截图仅裁掉开发预览提示条，不隐藏、改造产品控件或编辑参考 PNG。对照 HTML 并列展示原始设计图和实际截图，再通过浏览器渲染为对照 PNG；两张源图保持原文件。

| 项目 | 设计图折算位置（约） | 实际页面 |
| --- | --- | --- |
| 文档栏 / 模式栏 | 60 / 44 px 高 | 60 / 44 px |
| 检查卡左右边距 | 16 px | 16 px |
| 检查卡顶部 / 高度 | 109 / 100 px | 110 / 101.6 px |
| 源码卡左侧 / 宽度 | 16 / 358 px | 16 / 358 px |
| 源码卡顶部 | 222 px | 223.6 px |
| 文件标题栏 | 约 42 px 高 | 42 px |
| 底部工具条 | 约 60 px 高 | 64 px，为实际触摸控件留空间 |

模型生成的文字、图标和抗锯齿不能作为像素级程序规范。实际页面保留完整保存状态、检查说明入口和满足对比度的颜色；这些差异用于真实操作。此表比较几何层级和外形，不虚报自动像素相似率。

第一轮实图的检查卡高约 109.6 px，收紧标题间距后为 101.6 px。最初专项脚本在修复恰好回到已保存原文时等待“草稿已保护”，与正确的“无待保存草稿”状态矛盾；已改为等待草稿清除。第一次全量命令漏设预览地址而连接旧端口 9010，未执行产品任务，修正为 9012 后重跑。相关早期证据保留，验收使用最终结果。

后续全量回归在核对附件包接收前所保护的草稿时发现重复正文；首次脚本未先回读编辑器内容，不能仅凭一次失败确定唯一成因。去掉共享编辑器对其他格式的无效空装饰更新，同时将脚本改为真实全选 / 粘贴并立即核对正文，再重跑相关任务与完整回归。首次失败保留在 `browser-regression-1792846032751`，后续验收以最终通过结果为准。

初步原生预检验证了接收 / 存入和检查说明。之后补充极短视口样式与验证，正式验收使用新目录和最终 APK 重新执行；预检的独立合成文件保留，仅通过产品界面移除其导入回执，纳入正式基线保护。

## 验证入口

```powershell
npm run test:mobile
npm run build:mobile
node scripts/test-mobile-toml-design-browser.mjs
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory <新的证据目录>
. ./scripts/mobile-toml-design-ui.ps1 -Serial emulator-5558
```

| 检查 | 最终结果与证据 |
| --- | --- |
| 逻辑 | 154 项通过，见[完整输出](evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24/logic-tests.txt) |
| 完整浏览器 | 27 脚本 / 194 组通过，见[最终回归](evidence/mobile-0.1.0/browser-regression-1792846682021/summary.json) |
| 页面专项 | 5 组通过，见[最终专项](evidence/mobile-0.1.0/toml-design-browser-1792846594381/report.json)和[几何记录](evidence/mobile-0.1.0/toml-design-browser-1792846594381/alignment.json)；完整回归另行复验 |
| 相关输入复验 | 9 组通过，见[附件包接收专项](evidence/mobile-0.1.0/pack-incoming-browser-1792846587705/report.json)，完整回归也通过 |
| 打包保护 | 17 项通过，见[打包结果](evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24/packaging-verification.json) |
| Android 原生 | 12 阶段通过，见[最终摘要](evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24/summary.json)和[环境恢复记录](evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24/lifecycle.json) |

实图核对之外，还验证了说明展开、真实模式切换、保护草稿、历史保留、修改立即清除旧标记、定位修复和重新检查。浅深色、360px / 200% 文字没有所检查的 WCAG 违规或横向溢出；180px 高度仍可通过文档菜单切换，源码视口不少于 40px。旧笔记与旧草稿保持一致，未发生外部请求。

原生模式按钮被 WebView 映射为 `android.widget.ToggleButton`，测试服务只允许 `Button`，第一次具名动作未匹配。保留原服务限制，改用新鲜 UIA 快照中的 ToggleButton 实际坐标点击，再等待阅读 / 编辑业务状态并核对文件；未将动作失败误报为产品切换失败。

最终原生验收在 API29 / x86_64、约 2GB 内存、WebView 124.0.6367.219 的专用模拟器执行：通过真实只读分享 URI 接收，存入独立 TOML 文件，展开说明、定位错误并补入 `]`，撤销 / 重做、保存、切换阅读 / 源码、通过系统 DocumentsUI 导出并回读，再终止应用和重启打开。12 阶段逐一核对实际文件与草稿。原有 66 个文件、8 份草稿、18 个文字导入记录和 6 个包文件保持不变；最终共 67 个文件，保留本批独立合成笔记，仅通过产品界面移除本批导入回执。

固定未完成源文件的 SHA-256 为 `ecac036f36d9405b2baa6a398c643bdc3cb3f3c12c7a31abd5866cdbbd6a8538`；增加结束括号后的预期、保存文件与系统导出文件一致，为 `6cf91fc808c846397c41ba3143f371d239c4994532ff3941287678dcf88844b2`。预期由夹具字节加一个字符定义，不使用产品解析结果生成。安装包摘要也与 x86_64 构建记录一致。测试后恢复记录中的原无障碍设置，执行文件同步，仅关闭本轮拥有的 emulator-5558；本地 9012 预览继续可用。

## 当前开发安装包

两架构均为开发签名，应用 ID `com.longyuye.mdreader.mobile.dev`，versionName `1.2.11`、versionCode `1002032`，最低 API29、目标 API36。构建记录如实保留 `e224cae274ac13900ab4b0fa3cb291f2a7aa291f + dirty`，后续文档提交不回写该来源。

| 架构 | 安装包与构建记录 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| ARM64 | [手机调试包](../release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk) · [记录](evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24/build-aarch64.json) | 126681081 | `a244bf1258880972c60e20e90f05f40f3cb9dce3aab9f0ebd1fe662ed3c1a864` |
| x86_64 | [模拟器调试包](../release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk) · [记录](evidence/mobile-0.1.0/toml-design-native-verified-2026-10-24/build-x86_64.json) | 127337718 | `5f9f3f4aaaab30456c4b6cb7ff9d027fcd60b1715788ec4e07355ddd9ad1dc48` |

本批已实跑 x86_64 模拟器；ARM64 已构建和检查打包身份、ELF 与签名，尚未在实体手机执行本批流程。Windows 不能创建符号链接时使用已有构建脚本的副本回退，并核对打包的实际原生库摘要。

下一步继续 TOML 结构定位和受限值编辑，并以本批的出图、实现、同尺寸截图核对流程推进后续页面；真机、真实提供器、完整 TalkBack、iOS 和正式发布仍独立验收。
