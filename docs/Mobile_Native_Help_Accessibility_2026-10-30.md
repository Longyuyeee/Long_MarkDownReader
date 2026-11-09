# 问号说明的原生正文与返回焦点

2026-10-30，接续 `363134d991bcb1663ddfcad2f937ad35c0c7ee76`，沿用独立移动工作树和 `codex/mobile-0.1.0-foundation`。本轮修复一个已在旧包真实 TalkBack 中复现的问题：说明正文的自定义名称取代了段落，用户只能到达“外观说明内容”，无法取得实际说明。修改共享说明组件的两个语义属性，保留原问号、文案、外形、滚动和返回逻辑。

[完整原图册](evidence/mobile-native-help-accessibility-2026-10-30/review.html)保留改前、改后、失败、原生节点和数据回执。完整无障碍树尚未通过，不把本次正文修复记作整个 Android 验收完成。没有推送或发布。

## 用户任务与竞品依据

用户从“设置 → 外观 → 主题”进入短选择层，需要说明时点问号；Back先关说明并回到问号，再关主题并回到主题行，随后回设置。资料库说明同样按需打开，多段正文可读、可滚动，关闭后接回入口。正常页面继续只呈现任务所需内容。

本轮补查 [Acrobat移动手势说明](https://helpx.adobe.com/acrobat/mobile/accessibility/gesture-features.html)、[Joplin读屏导航](https://joplinapp.org/help/apps/screen_reader_accessibility/)、[Android TalkBack导航](https://support.google.com/accessibility/android/answer/6006598?hl=en-GB)和 [Chrome网页读屏](https://support.google.com/accessibility/answer/2633135?hl=en)。Acrobat使用标准TalkBack导航与激活方式；Joplin区分移动端列表、阅读、编辑、配置及折叠菜单。对应本项目的设计判断是：入口、正文和退出都要能被发现，弹层打开时背景退出当前操作顺序，返回接回原入口。这是官方资料研究，没有安装或录制竞品，不能推断它们全部弹窗的实际表现。

先冻结[任务约束](design/mobile-native-accessibility-v1/Interaction.md)和[组件原型](design/mobile-native-accessibility-v1/prototype/freeze.json)，再改产品。初始约束也列出阅读任务；本轮实际验收收敛到问号正文和返回链路，未把未执行的阅读任务计为通过。

## 复现与最小修复

产品只修改 [MobileHelpHost.vue](../src/mobile/MobileHelpHost.vue)：保留可聚焦滚动容器的 `tabindex="0"`，移除它的 `role="region"` 和 `aria-label="主题名 + 内容"`。弹窗仍使用标题关联的 `dialog` 和 `aria-modal`；CSS、焦点脚本、段落与格式明细完全不变。

WebView124在此结构下将可聚焦的非交互正文合为原生节点，作者提供的名称替代了段落。旧包的实际TalkBack键盘遍历依次到标题、关闭、名称“外观说明内容”，之后离开该正文节点；原始段落断言失败。独立测试WebView使用同CSS、同脚本的两份冻结原型：旧版仍缺实际段落，新版导出完整正文。最后在更新后的主应用中，真实TalkBack焦点取得了完整说明。

[Chromium Android无障碍架构](https://github.com/chromium/chromium/blob/main/docs/accessibility/browser/android.md)及 [124版本实现](https://raw.githubusercontent.com/chromium/chromium/124.0.6367.219/content/public/android/java/src/org/chromium/content/browser/accessibility/WebContentsAccessibilityImpl.java)用于理解节点桥接边界；没有据此认定一般缺树问题的具体根因。也没有为了树采集更改 `inert`、页面层次或产品CSP。

## 实际页面与设计核对

[对齐记录](evidence/mobile-native-help-accessibility-2026-10-30/alignment.json)核对冻结源码、CSS、脚本、矩形与完整PNG，不裁切、遮挡或重绘原图。

| 对照 | 结果与范围 |
| --- | --- |
| 外观／资料库正常尺寸原型，390×844 | 两组改前／候选PNG各自摘要完全相同 |
| 资料库短屏原型，320×372／200% | 弹窗和正文矩形相同；保留上沿／背景边缘141个差异像素，边界`[0,1,320,51]` |
| 冻结资料库原型与生产浏览器实页 | 弹窗高376.5、正文高296.5、宽390一致；实际页面多28px预览条，纵向偏移恰为28px，未宣称整屏一致 |
| Android旧包／新包外观说明 | 原生正文、关闭和弹窗bounds相同；固定原图区域`[0,1669,1080,2148]`的517,320像素差异0。区域比较只读取原图，没有生成裁切图 |
| 系统两倍字号、实际横屏2280×1080 | 看过完整滚动前后图：正文可继续滚动，标题和关闭保持可见，未滚动背景代替正文 |

Android截图保留系统栏、嵌套的主题层和真实绿色TalkBack焦点框。像素一致只针对上述明确区域／状态，不推广为所有设备、整个屏幕或所有主题一致。

## 验证结果与限制

原生环境为专用 `LongEdit_Compat_API29`、Google WebView124.0.6367.219，先开启真实TalkBack15.0.0.639625893，再启动应用。持续辅助服务采节点，没有对主应用连接CDP，也没有在连续读屏中插入UiAutomation。进入任务可用已核对的原生按钮动作；正文遍历和激活使用TalkBack的Alt+方向键／Enter内核键盘事件，Back使用系统返回键。

| 检查 | 实际结果 |
| --- | --- |
| 旧包正文 | 失败：正文节点只有作者名称，保留`tb-old-help-traversal.json`和实际焦点原图 |
| 独立WebView冻结原型 | 旧版缺段落、新版含段落，对照通过；CDP只连接测试进程并装载原型，测试文档使用临时CSP bypass，未改主应用 |
| 新包嵌套说明 | 实际TalkBack取得完整外观段落，说明层屏蔽主题选项；Back回问号，再Back回主题行，随后回设置 |
| 首轮原生脚本总结果 | **仍为失败**：完成上述2个检查后，找不到重挂载的“资料”导航原生节点而停止，未修改原失败报告 |
| 独立补验资料库说明 | 通过：按真实Settings根层Back回资料库，TalkBack取得全部3段；Back焦点回原问号 |
| 原生横屏／两倍字号 | 通过：Tab可达滚动正文、PageDown继续阅读，正文和关闭位置保持；Back恢复问号焦点。关闭按钮至少132物理像素的校验通过；系统字号／旋转恢复 |
| 生产浏览器相关回归 | 31组：说明3、外观9、分段定位8、设置11；含背景屏蔽、短屏滚动、Escape和逐层返回 |
| 共享说明组件 | 46个主题均核对浏览器AX中的全部段落、Tab正文及Escape回入口；导入格式明细另验证展开。属于组件环境，不称为46条原生实页路径 |
| axe | 25次无违规；13次采集了incomplete，其中5次有color-contrast未决，其余8次为空；设置脚本12次没有收集incomplete，不能记作全空 |
| 构建／打包 | 移动类型检查及Vite构建、双ABI开发包成功，22项打包保护通过；本轮没有重新运行上一轮382项模型／11项Rust测试 |

[浏览器汇总](evidence/mobile-native-help-accessibility-2026-10-30/browser-summary.json)和[原生汇总](evidence/mobile-native-help-accessibility-2026-10-30/native-summary.json)分别保留证据范围。DOM、浏览器AX、原生节点和真实TalkBack不互相代替。

仍有独立断点：冷启动测试WebView首次只取得2节点，稍后取得105；开启TalkBack后主应用冷启动为105节点，但外观返回设置后，辅助服务快照仍缺重挂载的页头和底部导航，仅14节点，且没有父子计数缺口。同一时刻实际TalkBack绿框能到达设置导航，快照却无对应焦点节点。保留`settings-return-native-walk.json`和`axf-new-settings-walk-6.png`；既不能用缺树认定整个页面不可读，也不能记树完整。根因仍未确定。

本次未验证中文语音发音／完整音频、真实手指触摸探索、完整阅读编辑链路、API35预测性返回或ARM/OEM实体机。其他具名预览／确认正文也需要分别做真实任务审计；仅相似源码不足以判为已确认缺陷。全部原生无障碍出口仍待验收。

## 保留的失败与工具修正

- 独立控制WebView初次data URL被请求拦截返回404；复用失败上下文也未找到预期页面。保留两份失败报告，重新创建测试Activity并核对进程／socket后完成原型对照。
- 首次观察的日志若先创建，会触发既有“该stage已有文件”守卫。之后在观察完成后写日志；最终还补上调用前目录守卫及独占日志写入。该最终工具守卫另作离线拒绝覆盖核对，未因此重启模拟器或增加原生通过数。
- 原生短屏初轮交互完成后，恢复原先不存在的font_scale时，Android将默认1.0写回，收尾断言失败，报告未能写出。原截图／节点／日志保留，另写明确标注的事后失败说明。修正测试恢复顺序：先恢复旋转、将有效字号设回1.0、等待稳定后删除原先缺失的键，并先落报告再断言；独立settled任务通过。这不是产品修复。
- 浏览器初轮固定等待120ms后断言滚动到底，撞上平滑滚动；保留失败后改为等待实际scrollTop达到同一阈值。第二轮组件夹具缺网页title导致axe失败，补夹具标题后另目录重跑。两轮失败原报告和PNG完整保留，没有改产品满足夹具。
- 证据汇总的临时只读Node命令首次未去PowerShell JSON的BOM而失败；没有改写原JSON，显式去BOM后读取成功。

测试键盘工具新增显式API29 `ScopedSu`和独立输出目录，仅核对专用AVD、实际键盘、已绑定TalkBack及已有su0后发送按键。adbd始终uid2000，没有执行adb root，产品没有root依赖。旧API35工具路径仍可使用。截图和观察拒绝复用证据名。

## 资料、环境与安装包收尾

基线完整私有TAR、测试提供器TAR、旧APK和完整观察留在本机忽略目录；Git仅存摘要、文字回执和原图。[原始清单](evidence/mobile-native-help-accessibility-2026-10-30/raw-manifest.json)记录当时496个文件，[复制清单](evidence/mobile-native-help-accessibility-2026-10-30/manifest.json)记录497个逐摘要复制件。

[图册验收](evidence/mobile-native-help-accessibility-2026-10-30/review-validation.json)通过：497个复制件与来源、496个原始文件、9个候选源码／资源摘要全部核对；6张原型图和两份原型源码／HTML摘要保持。浏览器实际加载13张图、19个唯一引用均200，JSON可解析，无页面异常，1440／390宽无横向溢出。观察工具的离线覆盖守卫拒绝既有stage，保留哨兵且不触碰设备。

[最终保护](evidence/mobile-native-help-accessibility-2026-10-30/closeout-final.json)通过：原103份资料、9份草稿、12条最近记录、4项待接收均保持。files／shared_prefs仍175个文件，只有`files/profileInstalled`变化，核对为24字节结构和APK更新时间；其余逐文件摘要不变。原302个提供器文件不变，新增65个明确命名的诊断快照，逐个与本机原生JSON核对，共367个。WebView的每日origin缓存从10/29变10/30，核对其他XML字段后按原TAR成员恢复并核对摘要，没有宽泛放行缓存变化。

[设置回执](evidence/mobile-native-help-accessibility-2026-10-30/settings-closeout.json)和[模拟器收尾](evidence/mobile-native-help-accessibility-2026-10-30/emulator-closeout.json)确认临时TalkBack已卸载、所记录系统设置与原辅助服务恢复；本轮9559／9560转发均不存在，adbd为shell，sync后停止专用模拟器。没有删除已有用户资料或`__pycache__`。

两架构均为版本1002049／1.2.11、min29／target36的debug包，没有升为发布候选。构建回执如实记录构建时的`363134d991…`及`sourceDirty=true`，不回填最终提交；[候选源码／dist摘要](evidence/mobile-native-help-accessibility-2026-10-30/candidate-source.json)核对实际验收内容。Windows已知符号链接复制回退仅在Rust构建成功后使用。覆盖前已将旧两ABI各4件构建产物归档并核对摘要。

| ABI | 本机APK | SHA256 |
| --- | --- | --- |
| x86_64，已安装并验证上述任务 | `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | `c59dc6534e08f04cb20cc79b88b0c8e2b2bb757faa779036f2be2c07ac5bb8c8` |
| aarch64，仅完成构建／打包检查 | `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | `183f9ccf2a8012b04e20da762b1a2add326e3fdf44242c5b8ae82c8c8676ae7c` |

后续先继续区分辅助服务采集与真实TalkBack的差异，并审计具名预览／确认正文的实际任务；再补完整触摸读屏、API35返回及ARM设备。继续按“官方竞品依据 → 用户任务与设计冻结 → 修改 → 实页原图核对 → 相关测试 → 数据收尾”推进，阶段5／6整体保持待验收。
