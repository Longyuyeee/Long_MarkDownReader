# 第十六批：把笔记和附件一起带走

移动 worktree：`C:\Users\39633\.codex\worktrees\mobile-0-1-0-foundation\MDReader`；分支：`codex/mobile-0.1.0-foundation`。本批完成单份 Markdown / TXT 的 TextPack 导出和本机保留记录，继续使用 `0.1.0-dev` 里程碑。桌面原工作目录不参与修改。TextPack 导入与完整资料库迁移列入下一阶段。

## 从用户任务确定顺序

| 用户想完成的事 | 本批设计 |
| --- | --- |
| 将这份手机笔记交给电脑或另一个编辑器 | 文档操作提供「导出笔记与附件」，采用公开 TextPack 格式 |
| 不确定附件是否一起带走 | 先逐项读取并显示路径、数量、大小，再由用户选择导出位置 |
| 刚输入的文字还没保存 | 打开面板时固定完整当前内容并保护草稿；说明原笔记仍需另行保存 |
| 图片丢失、提供器离线或引用太复杂 | 明确显示具体文件及失败，不生成成功的残缺包，不自动降级文字导出 |
| 保存窗口打开后取消或应用被关闭 | 系统窗口打开前保留完整附件包；设置中的「附件包导出记录」可继续导出 |
| 原文件夹已撤销授权 | 对已保护的包直接核对和重试，不重新读取来源 |
| 本机保留的包占空间 | 显示记录，最多 6 份；确认后只移除该私有包，源文件和已导出文件不删 |

先完成上述任务流和检查清单，再打通导出原生持久化与系统保存，最后按真实用户路径验证。没有将桌面菜单整体缩放到手机。

## 本轮竞品与格式核对

资料于 2026-10-24 查阅，均为官方公开说明；未安装竞品，未宣称真实竞品应用往返兼容。

- [Bear 导出说明](https://bear.app/faq/export-your-notes/)：iPhone / iPad 从笔记右上角更多菜单进入导出，支持 TextBundle V2。借鉴笔记上下文中的明确入口，保留现有文字导出供用户另选。
- [Bear 导入说明](https://bear.app/faq/import-your-notes/)：列出 TextBundle（文字、Markdown、附件）与 TextPack V2，iOS 侧栏可进入导入。由此选择具有其他编辑器入口的公共格式；未把此文档支持等同于本产品已通过实机互通。
- [Notesnook TextBundle 导入说明](https://notesnook.com/help/importing-notes/import-notes-from-textbundle-files)：包内包含文字及 images / files，导入器识别 `.textbundle` 和 `.textpack`。本轮据此将普通本地文件链接与图片一起列入清单；不据页面推断 Android 本机导入已可用。
- [TextBundle V2 规范](https://textbundle.org/spec/)与[官方示例入口](https://textbundle.org/)：核对了实际 `example.textpack`，ZIP 内有一个 `.textbundle` 顶层文件夹。产物采用 `note.textbundle/info.json`、`text.markdown` / `text.txt`、`assets/`，元信息 `version: 2`，正文引用改成相对 `assets/...`。正文和元信息文件名使用小写；没有保存原始绝对路径或 SAF URI 到导出的公共包。

## 实现与保护边界

导出内容是打开面板时的文字和随后检查取得的附件字节；不会代存原笔记、清理源草稿或改写源附件。原始 BOM、中文 / emoji 和换行分隔保留，只有真实的附件引用区间被改写。普通 Markdown 内联与引用式图片 / 文件链接可携带，重复源路径只读取一次，同名不同文件有独立编号。页内锚点、HTTP(S)、mailto、tel 普通链接保持原样；不访问网络。

仅携带直接引用。链接到另一份笔记时只复制该文件，不递归解析其附件；TXT 中的 Markdown 语法按文字处理。网络图片、资料库外路径、设备 URI、无效编码、HTML 资源、无法精确定位的复杂块及嵌套附件语法会明确阻止打包。原来的图片副本流程未改变。

预算：正文改写前后最多 4 MiB；最多 24 个不同附件，每个最多 2 MiB，附件总共最多 8 MiB；内联图片仍限 PNG / JPEG / WebP，按既有图片读取接口验证，总像素最多 1,200 万。包总大小限制 13 MiB。不添加压缩包读取或解压逻辑。

Android IO 使用现有串行执行器。原生独立生成标准 STORED ZIP，逐项核对附件字节数和 SHA-256；私有 `pack-exports-v1` 的元信息先用 AtomicFile 持久化，再写完整 ZIP、回读核对。元信息中保留源文档和附件的提供器身份，公共 ZIP 不含这些私有身份。准备中断后，缺失 ZIP 的元信息、孤立 ZIP 或原子写入残留仍在列表中显现，可重试核对或明确移除；不伪造完整成功状态。

成功、取消均保留私有包，最多 6 个；失败不会自动删除。重试核对完整持久包，不再依赖来源读取授权；同 ID 不接受另一份候选。选择目标时先拒绝源笔记和所有源附件身份（包括零字节附件），再确认目标为空，随后写入并完整回读；未确认不报告完成。系统保存使用 `application/octet-stream` 保留 `.textpack` 扩展名：实测 `application/zip` 会被 Android DocumentsUI 追加 `.zip`，已据此修正。

浏览器预览使用独立小型 ZIP 写出器，并先保留完整包。下载启动仅显示「已开始下载」；无法承诺浏览器文件系统回读。配额失败不会假称已有完整保护。原生失败不会回退到浏览器存储。

## 本地复现与检查

```powershell
npm run test:mobile
node scripts/test-mobile-browser-regression.mjs
./scripts/build-mobile-debug.ps1 -Target x86_64
./scripts/build-mobile-debug.ps1 -Target aarch64
./scripts/test-mobile-packaging.ps1 -OutputDirectory E:/Android/BuildCache/pack-export-packaging-20261024

node scripts/create-mobile-pack-fixture.mjs E:/Android/BuildCache/LongEdit-Pack-20261024
# 生成器只接受新目录。上传到专用 API29 模拟器 Documents，系统选择器授权该合成目录。
# Portable.md 只输入一次 PackDraft，不保存原文；从文档操作检查附件再导出。
node scripts/verify-mobile-pack-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/portable-pack-native-2026-10-24 --stage before
node scripts/verify-mobile-pack-native.mjs --serial emulator-5558 --output docs/evidence/mobile-0.1.0/portable-pack-native-2026-10-24 --stage protected
# 按真实界面完成操作，再运行 cancel / safe / unconfirmed / nospace / kill / retry / alias / missing / final。
```

浏览器测试需设置 `LONGEDIT_MOBILE_PREVIEW_URL=http://127.0.0.1:9012/mobile.html` 和可用 Playwright 路径；构建不能与浏览器回归并行，以免替换正在测试的 dist。原生验证脚本限制专用 AVD `LongEdit_Compat_API29`、API29、`emulator-5558`，检查安装 APK 摘要、源文件完整摘要、已有本机笔记、草稿语义字段、完整 ZIP、每个二进制成员和界面回执。ZIP 内容由独立 Python `zipfile` 读取并核对 CRC，不用产品写出器自证。

## 实际验收

76 项逻辑测试、95 组浏览器用户任务、17 项打包检查通过。完整浏览器运行索引见 [summary.json](evidence/mobile-0.1.0/browser-regression-1792813144795/summary.json)，本批新增 6 组任务见 [report.json](evidence/mobile-0.1.0/portable-pack-browser-1792813234051/report.json)。覆盖实际下载、独立 ZIP / CRC 检查、正文 BOM / 混合换行、未保存候选、重复与同名附件、源附件消失后重试、损坏包、确认移除、缺失资源、配额失败、弹窗焦点和 360px / 200% 字号无障碍规则检查。

Android 使用专用 `LongEdit_Compat_API29` / `emulator-5558`、API29 / WebView124，无默认网络。源文 159 字节，包含 BOM、中文 / emoji、CRLF / CR / LF；只在末尾输入一次 `PackDraft`，未保存源文。图像 68 字节、二进制文件 6 字节、空文件 0 字节；重复图片只带一次。私有包和最终实际导出包均为 1,172 字节，SHA-256 `cd263d13ba3b7003d266dc92f9851fa53d0d677a6a106f8692624cacd29d999c`。原生记录位于 [portable-pack-native-2026-10-24](evidence/mobile-0.1.0/portable-pack-native-2026-10-24/final.json)。

| 原生任务 | 实际结果 |
| --- | --- |
| 系统窗口中核对持久保护 | 完整 ZIP、元信息、3 个去重附件、4 个源身份均已落盘并核对；独立 Python 校验成员 CRC 和完整内容 |
| 取消 | 最终包实际取消后回到面板，完整包仍保留，源文件与草稿语义字段未变 |
| Downloads 成功写出 | `.textpack` 实际文件完整回读，与私有包逐字节一致；已修复系统追加 `.zip` 的首次失败 |
| 提供器接受写入但丢弃字节 | 目标实际为空，应用提示回读不一致；完整包保留，仅打开一次写入 |
| 提供器 ENOSPC | 写入未确认，完整包保留，目标实际为空；仅尝试一次写入 |
| 系统窗口中终止进程 | 先校验持久包，再只终止开发应用；重开后记录仍完整 |
| 撤销来源授权后重试 | 通过实际设置撤销源目录的持续授权，再从记录页导出至健康提供器；实际字节仍完全相同 |
| 返回零字节源附件身份 | `pack-alias` 返回被引用的 `empty.pdf`；发送任何写入前拒绝，提供器写打开次数为 0，原笔记与空附件未改 |
| 缺失图片 | 显示 `files/missing.png` 的具体错误，未生成该笔记的附件包 |

最终脚本另核对已有 17 份本机笔记和先前草稿内容 / 来源签名；本批文稿草稿代次也与保护时一致。验证基线明确记录了当时已经暂存的合成附件包 ID，没有把事后记录伪称为导出前快照。前期失败保留在独立证据目录：浏览器夹具误把编辑器批量替换后的换行当作原始混合换行、主导航名称选错，以及外层错误清理丢失文件名；对应测试或产品问题均修正后重新通过。原生测试工具曾错误给 `adb exec-out` 参数加字面引号，现已修正并按真实字节重验。

两架构 APK 版本 `1.2.11` / `1002020`、minSdk29 / targetSdk36，均为开发签名。构建记录如实保留来源 `b88e0a29 + dirty`：

| 架构 | 字节数 | SHA-256 |
| --- | ---: | --- |
| x86_64 | 126957074 | `93e49b00d355dfe1cc07c9abea48681a0e896565a8bca8727d0306688a33b081` |
| arm64-v8a | 126299789 | `ba66894fc9bfc248d86d6b2fa8bf3dc632779a28e147f98680be32e90cc6880c` |

实际安装和操作为 x86_64 模拟器，arm64 仅完成构建与 APK / ELF / 签名检查。没有真机、真实云盘或 Bear / Notesnook 安装互通验收，不宣称整库备份、递归附件迁移或 TextPack 导入已完成。测试观察服务仅维持模拟器 WebView 的无障碍连接，不等同于完整 TalkBack 触摸验收；测试结束恢复原设置并停止专用模拟器。

## 下一阶段

1. TextPack 进入应用：先做受限目录解析、压缩包路径 / 重名 / 预算 / 编码核对和持久暂存，展示正文及附件清单；用户确认前不写资料库。
2. 原子化存入独立本机笔记和附件，固定重试身份，覆盖中断、回执丢失、同名与空间不足；与本批导出做完整往返验收。
3. 解析和恢复流程通过后，再接系统打开 / 分享的 `.textpack` 入口，避免先承诺无法完成的文件类型。
4. 扩展格式迁移、真机输入 / 提供器、完整 TalkBack 触摸、iOS 构建和 release 签名继续按主计划推进。
