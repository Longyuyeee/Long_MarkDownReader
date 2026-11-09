# 按接收时间辨认同名记录

后续独立任务已完成：[导出文字副本后看清实际名称](Mobile_Export_Result_Name_2026-10-29.md)，包含系统改名／重名、元数据异常、实际安卓返回及原图对照。本记录保留D候选时的历史观察。

2026-10-29，接续 `fa4f9f947`，分支 `codex/mobile-0.1.0-foundation`。本轮完成一个实际用户任务：从同名到达记录中找到刚收到的一条，核对后逐层返回原稿，再取消／完成副本导出。已构建1002049开发候选D并在专用API29实际操作；未推送、未发布。

## 用户问题与设计

实际C列表中，两条“分享文字.txt”都显示“文字 · 新收到”，用户无法知道哪条刚收到。图中其余三条Inbox.md也缺少区分信息。现有文件导入历史已经显示时间，本轮使接收列表一致：在原类型、状态后追加记录的本地接收时间，精确到秒。文件名、单行入口、详情层级和已有问号帮助保持原路径；窄屏大字自然换行，按钮随内容长高。不新增说明段落，不批量读取正文，不根据同名合并或提前确认记录。

先保存[交互约定](design/mobile-incoming-identity-v1/Interaction.md)、[独立图稿](design/mobile-incoming-identity-v1/index.html)、原始渲染图及[冻结摘要](design/mobile-incoming-identity-v1/freeze.json)，再改`IncomingCenter.vue`的一处模板表达式。

本轮参考[Obsidian移动1.8的创建／修改时间信息](https://obsidian.md/changelog/2024-12-18-mobile-v1.8.0/)和[Notesnook移动分享任务](https://notesnook.com/help/mobile-integration/share-things-from-other-apps)。本项目把接收时间直接放入需要辨认的列表，这是针对本次问题的设计取舍；没有声称竞品提供相同的接收记录、确认机制或行式布局，也未安装实录竞品。

## 图稿、浏览器与实际安卓

[原图对照册](evidence/mobile-incoming-identity-2026-10-29/review.html)包含16张原图，系统栏、输入法、测试标题与实际预览画面均保留。截图只原样复制，没有裁切、重绘或隐藏元素。

| 核对 | 结果与边界 |
| --- | --- |
| 浏览器同名辨认 | 旧样本两行文本相同；改后真实时间可见且不同。按可见时间选择较新记录，读取正确正文，只确认该条，返回后恢复该行焦点 |
| 编辑任务接续 | 原编辑器节点、源文件、保护草稿保持；在原光标位置键入一次并撤销，恢复完整原文。这里是浏览器键盘测试，不是安卓IME组合输入 |
| 图稿对齐 | 浅色390×844、深色320×700／200%文字的标题、各行和元数据矩形完全一致；逐行可滚动、可触达，无横向溢出。原始像素比较仍有差异，未记为像素一致 |
| 自动无障碍 | 两状态axe A/AA扫描违规为0；深色大字保留一个color-contrast待核对项，不记全项通过 |
| 实际安卓接收 | 通过独立发送器的真实Android分享Intent新增67字节中文／emoji／链接。原编辑内容没有被替换；D列表显示新记录12:13:03、旧记录09:42:53（设备本地时区） |
| 选择与Back | 根据原图时间点选新记录，进入摘要→完整文字；三次系统Back依次回摘要→列表→原稿。私有记录确认仅本轮新记录转为已查看，原36条导入记录逐字节保持 |
| 实际SAF | 真正进入AOSP DocumentsUI，系统Back取消后回原核对页并显示已取消；重试保存到新的`AndroidTask-20261029-identity-copy.md`。回读为78字节，与完整草稿一致；旧导出副本未变，最后Back回原稿 |

安卓菜单后仍缺失完整节点子树。后续动作依据逐张实际查看的原图发送Android输入，文件选择器依据新采集的原生XML操作；每次动作均保留原图或XML摘要。主应用没有CDP、DOM注入或隐藏动作。无断言采证的`assertionsPassed=null`继续保留，没有把截图操作、数据核对转换为完整树或TalkBack通过。发送器和系统文件选择器使用了UiAutomation，不能把整条操作链描述成无UiAutomation实验。原稿保持完整78字节，仍未保存为源文件。

## 旧WebView节点断点的进一步定位

隔离测试APK增加显式`frontend-inspect`模式，仅在专用API29启用WebView调试。它使用此前C的逐字节冻结前端和自己的预览存储，不连接主应用数据／原生存储桥。首次菜单失败在连接CDP之前取得：Android只有8个节点、1个子节点不可取。

随后只读DOM确认弹窗、祖先未被inert／aria-hidden／aria-busy隐藏，焦点在弹窗，工作区按约定inert；Chromium AX树包含菜单及按钮。读取DOM、开启Chromium AX查询都未修复Android树。只在这个隔离样本中分别试验移除aria-modal、改工作区display、解除背景inert，仍失败；恢复这些属性后，改变父容器语义得到完整21节点，撤回语义改动后仍保持21。该操作是诊断性DOM变更，不是用户操作或产品修复。

[固定源码对照与摘要](evidence/mobile-incoming-identity-2026-10-29/source-comparison.json)比较[Chromium124](https://raw.githubusercontent.com/chromium/chromium/124.0.6367.219/content/browser/accessibility/browser_accessibility_manager_android.cc)与[140源码](https://raw.githubusercontent.com/chromium/chromium/140.0.7339.0/content/browser/accessibility/browser_accessibility_manager_android.cc)：后者增加结构生成事件的Java缓存失效处理，覆盖部分未出现在原始变更列表中的平台事件目标。结合实测，这支持平台节点缓存方向的推断；没有测试新WebView二进制，因此尚未认定确切根因或最低修复版本。

没有把实验性标签、焦点跳转、删inert等改动带入产品来满足快照。D实际菜单仍明确断言失败。完整无障碍、TalkBack触摸、API35预测性Back、ARM实体机与正式发布继续独立验收。

## 开发包与资料保护

先逐字节归档C的两个APK、日志、回执到本机`release-artifacts/mobile-debug-archive/1002049-before-incoming-identity`，再依次构建x86和ARM。D仍为debug签名、未分发的1002049：

| 架构 | APK SHA256 | 字节 |
| --- | --- | --- |
| x86_64（实际运行） | `6b8727b20eefabc2e8aad74397712a447c75ff8a519b43310f3385a9e6ce4c2b` | 129719542 |
| ARM64（构建／静态核对） | `32c65399754025b398b26eaea222c3451f6ddd9fb48d405ecb074ba92ea4541d` | 129073113 |

[构建回执](evidence/mobile-incoming-identity-2026-10-29/candidate-artifacts.json)保留实际基准`fa4f9f9472af1519c9c4667304c4becf363d2123`、`sourceDirty=true`，没有改成之后的提交。包名、版本、debug证书、ABI、ELF与原生库核对通过，两个DEX均不包含诊断服务／Activity／端点。JS为`mobile-D12ZyEab.js`；CSS为`mobile-R1J2P1Xu.css`。Vue模板变化使scope标识从`ec26a205`变为`572c2738`，CSS原始摘要因此改变；[比较](evidence/mobile-incoming-identity-2026-10-29/css-comparison.json)确认去除该标识差异后全部规则逐字节相同。主包以安装APK、构建核对和实际新行为确认，未读回运行中JS字节。

[收尾](evidence/mobile-incoming-identity-2026-10-29/closeout.json)：C→D覆盖安装前后165个files／shared_prefs文件完全相同。全流程后100份资料、9份草稿、36条旧导入记录保持；只新增本轮接收记录，测试草稿仅revision／updated变化，另有Android ProfileInstaller派生文件变化。测试提供器原189个文件保持，新增39份明确请求的快照。输入法、字体、旋转、离线与原有服务设置保持，UID2000，没有root或TalkBack；诊断转发已撤除，sync后专用模拟器退出。完整备份和APK保留在本机忽略目录。

首次脚本问题如实保留：冷启动首帧节点尚未就绪；系统选择器最初误设Google包名守卫，实际为AOSP包名，失败后未执行后续操作；第一次收尾错误要求CSS原始摘要不变，已改为核对真实scope差异，先前备份未覆盖；一次截图读取早于采集命令完成，待命令结束才查看。以上不转记为产品失败或通过。

本轮接收／逐层返回／SAF功能观察已完成，不能据此关闭完整原生无障碍失败。后续优先用保留的最小对照验证新WebView兼容性。另一个实际观察是导出结果页仍显示“建议文件名”，没有回显用户在SAF中改选的最终名称；这作为下一独立用户任务审查，不混入本次接收列表改动。
