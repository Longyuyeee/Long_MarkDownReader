# 手机端定位并修改源码

阶段3B推进一个任务：打开脚本，前往指定行，移动光标、插入符号或调整缩进，再继续阅读或返回。沿用移动工作目录与 `codex/mobile-0.1.0-foundation`。结构浏览、字段修改和诊断界面的整理是下一切片。

## 改前观察与竞品依据

[改前实页](evidence/mobile-code-workflow-2026-10-27/before/symbols.png) 同时显示模式切换、语言/折行/定位卡、重复文件名、符号与行操作、撤销及阅读底栏。定位表单继续推低正文，光标移动和缩进挤在同一横排。

| 2026-10-27 核对的官方资料 | 能确认的事实 | 本项目决定 |
| --- | --- | --- |
| [Acode QuickTools](https://docs.acode.app/user-guide/quicktools) | 触摸工具提供括号、符号和方向键，采用两行工具并支持按行横向展开，可调整可见性。 | 以当前任务选择符号、光标、缩进；将历史和阅读整合进工具区，保留横向查看工具。三类分组是本项目的设计，不声称照搬其分类。 |
| [Acode Editor Settings](https://docs.acode.app/user-guide/settings/editor-settings) | 编辑器提供行号、折行、Tab大小等选项；部分历史选项已不再生效。 | 只提供已经工作的折行和定位，不新增无作用设置；通过实际宽度及原文校验验证折行。 |
| [Obsidian Mobile](https://obsidian.md/help/mobile) | 编辑动作集中在底部移动工具栏，较多动作可以横向展开。 | 阅读页保持简洁，编辑时显示当前工具；临时定位使用短子层。 |

调查依据是官方资料，没有声称完成竞品安装后的真机走查。

## 冻结设计与实现

[六屏设计](design/mobile-code-workflow-v1/index.html) 覆盖阅读、符号、光标、缩进、更多菜单、定位行。[冻结记录](evidence/mobile-code-workflow-2026-10-27/design/capture.json) 在运行时代码修改前生成，原文件及六张参考图保留摘要，对比脚本拒绝覆盖或使用改过的参考。

- 普通源码阅读与文字阅读共用紧凑入口：返回、文件名、更多和明确编辑按钮。编辑时保留保存。删除常驻模式条、定位卡与重复文件名；语言高亮、行号、未保存草稿和真正错误保留。
- 底部只挂载符号、光标、缩进中的一类。撤销、重做和阅读集中在同一区域，位置稳定。分类与动作按各自区域滚动，触摸分类不抢编辑焦点。读取同一文档后继续原分类，换文档恢复符号。
- 更多菜单提供查找、折行、定位、接收、保存副本和文字导出。普通高度不重复格式工具；极矮高度下原底栏隐藏，更多继续提供撤销/重做和阅读切换。收件沿用稳定圆点，不推移代码或抢输入。
- 定位行使用菜单的短子层，自动聚焦数字输入。非法行号和越界就地显示，修正输入后清除旧错误。帮助保留输入并回帮助按钮；返回或关闭先回菜单，恢复原条目与滚动，再返回文档。提交定位才关闭任务并把输入焦点交还指定行。
- 取消时不修改正文、选择范围或历史；折行只改变显示。符号、选行、缩进和撤销继续调用既有转换方法。缩进数量、1000行边界等细节放入问号帮助。
- 退出编辑前继续等待草稿保护，失败保留输入并恢复焦点；只有明确保存才写文件。BOM、CRLF/LF/CR、组合字符、表情和其他资料的草稿继续隔离。

适用范围是登记的20种代码模式、32种扩展名；JSON、YAML、XML、TOML 的结构和诊断控件未在本轮重做。源码不会执行。

## 观察后的修复与对图

保留了以下候选证据：

- [定位错误对比度](evidence/mobile-code-workflow-2026-10-27/candidates/error-contrast-before/report.json)：错误色未达到正文对比度，改为高对比文字和错误背景。
- [定位返回焦点](evidence/mobile-code-workflow-2026-10-27/candidates/line-return-before/report.json)：菜单重建使旧DOM按钮失效，增加稳定入口标识，恢复新按钮和原菜单滚动。
- [大字与极矮视口](evidence/mobile-code-workflow-2026-10-27/candidates/layout-before/layout.json)：阅读按钮换行增高、状态行距未随字号变化，以及127px高度只有45px编辑区；固定历史/阅读区，分类自行滚动，状态行距随字号变化，极矮高度移除底部空边。
- [正文排版及折行](evidence/mobile-code-workflow-2026-10-27/candidates/typography-before/metrics.json)：CodeMirror原有19.6px行距与稿件22.4px不同。并且正文最小宽度为整页宽度，额外叠加35px行号栏，长文折行仍有横向溢出。调整代码正文行距、文字起点及可用宽度；极矮视口保留紧凑行距。长行的开关及原文不变均有实际验证。

六组对照：[阅读](evidence/mobile-code-workflow-2026-10-27/comparison-reading/comparison.png)、[符号](evidence/mobile-code-workflow-2026-10-27/comparison-symbols/comparison.png)、[光标](evidence/mobile-code-workflow-2026-10-27/comparison-cursor/comparison.png)、[缩进](evidence/mobile-code-workflow-2026-10-27/comparison-indent/comparison.png)、[菜单](evidence/mobile-code-workflow-2026-10-27/comparison-menu/comparison.png)、[定位](evidence/mobile-code-workflow-2026-10-27/comparison-locate/comparison.png)。

[外框测量](evidence/mobile-code-workflow-2026-10-27/alignment.json) 在0.5 CSS px容差内没有差异；[首行正文测量](evidence/mobile-code-workflow-2026-10-27/typography-alignment.json) 中字号14px、行距22.4px、文字起点及文字区域尺寸一致。截图只裁去调试条，没有重画实际截图或移动图片。

保留的差异包括实际词法高亮、现有图标、选区和按压/焦点反馈，以及随正文延伸的行号栏。阅读正文沿用通用沙箱渲染器，保留默认`pre`上下留白与应用背景，和静态稿仍有16px首段留白及底色差异；没有为静态图修改通用阅读器或宣称像素完全一致。

## 验证和出口

生产构建通过。25项针对性逻辑检查覆盖源码身份、MIME、32扩展名、符号事务、行偏移、混合换行和缩进历史。浏览器专项14组，另有文字阅读9组、导航8组、问号帮助14组，共45组通过。20种代码模式逐一打开、编辑和返回，保留原文和行号；具名axe扫描17次未发现违规，符号标签的人工待检项仍保留，不能据此认定完成TalkBack验收。

专项在最终构建上验证；三组上下文回归在此前候选上通过，此后仅调整代码正文的行距及宽度，最终专项重新覆盖了这些显示变更。未重复运行全部历史脚本。旧帮助脚本原来直接点常驻源码问号，已改成从更多进入；错误期待帮助关闭后聚焦输入框的候选也保留，按实际发起按钮恢复焦点，保留了输入断言。

完整结果及产物摘要见 [verification.json](evidence/mobile-code-workflow-2026-10-27/verification.json)，候选来源见 [candidate-provenance.json](evidence/mobile-code-workflow-2026-10-27/candidate-provenance.json)。Android真实键盘、实体返回、TalkBack、接收授权和后台恢复仍待原生出口；合成输入法和127px视口不是原生设备验证。本轮没有生成或提升新APK，桌面工作目录未改动。
