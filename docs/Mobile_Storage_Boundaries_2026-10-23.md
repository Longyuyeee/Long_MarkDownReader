# Android 存储边界与恢复流程验收

本批接续首轮移动基础实现，分支为 `codex/mobile-0.1.0-foundation`。目标是让用户遇到授权失效、只读目录或保存异常时，知道当前内容在哪里，并能取回原文与草稿。桌面工作目录与桌面分支未改动。

## 用户任务与实现

| 用户遇到的问题 | 现在的处理 |
| --- | --- |
| 不想继续授予某个文件夹访问权限 | 管理资料库中可以停止访问，确认页说明撤销授权；原文件、登记名称及私有草稿继续保留 |
| 原文件夹已无法访问，但还有未保存输入 | 从最近打开读取私有草稿，明确来源不可用，允许继续并存入手机资料库；不伪造可写的原文件 |
| 文件所在位置只读 | 编辑后主按钮显示“存入手机库”，副本使用独立名称，原文仍留在原位置 |
| 提供器接受写入，但读回内容不一致 | 不报告成功，保留写入前原文和候选内容；设置中的“保存恢复记录”可以核对两个版本 |
| 想把恢复材料带走 | 可分别生成手机库副本，或经系统选择器导出完整 JSON；导出回读确认后才提示成功，取消不删除记录 |
| 目录提供器离线 | 显示读取未完成与重试、切换资料库入口；不把失败呈现为空目录，不展示旧数量 |
| 撤销编辑回到已保存原文 | 清理已放弃的旧草稿；仅选择先阅读原文时，仍保留尚未选择的恢复草稿 |

副本名称限制基础名称长度并保留 Unicode 码点，附加随机编号，降低长中文及表情名称超出文件名限制的风险。恢复列表先显示最近 25 条，其他记录仍保留；暂时不能解读的记录显示失败状态，未提供删除入口。

普通草稿与异常写入记录用途不同：普通草稿从“最近”打开资料后继续；恢复记录页保留异常写入时的原文和候选版本。手机资料库使用应用私有存储，卸载或清除应用数据会移除这些内容；导出是用户显式选择的外部保留路径。

## 调研对本批的影响

[Joplin 冲突处理说明](https://joplinapp.org/help/apps/conflict/)描述保留本地冲突副本、由用户核对版本的流程。本项目据此采用“先保留，再核对与另存”的交互；这是设计取舍，未照搬其同步实现，也未实现自动合并。

[Android 文件访问说明](https://developer.android.com/training/data-storage/shared/documents-files)说明持续授权仍可能因文件移动或删除而失效，并通过提供器标志查询能力。导出使用系统 `ACTION_CREATE_DOCUMENT`；该系统流程遇到同名文件会创建不同名称。应用仍逐次处理读取、写入和回读错误，授权或能力标志不能保证实际操作成功。

[Obsidian 附件说明](https://obsidian.md/help/attachments)将附件作为资料库中的普通文件，允许与笔记同级或放入邻近子目录。下一批相对图片据此优先解决“笔记与附件一起移动仍可阅读”，再考虑插入、修复与更大格式范围。此处属于后续设计依据，当前版本尚未接入相对图片。

以上为官方公开资料调研，未安装竞品做完整移动任务实测。调研日期为 2026 年 10 月 23 日。

## 原生实现要点

`StoragePlugin.kt` 在串行 IO 队列中管理目录授权、私有草稿及恢复记录。根目录登记名称独立缓存，撤销后仍能识别来源；导出和选目录共享忙状态，避免叠加系统选择器。恢复记录编号与根目录编号均按固定格式校验，前端不提交任意文件 URI。

外部目录枚举改用 `ContentResolver.query`。原 `DocumentFile.listFiles()` 会吞掉提供器查询错误并返回空数组，容易把离线目录误认为空库。直接查询失败或返回空 cursor 时，应用给出读取失败；正常的零条目 cursor 才是空目录。子文件仍通过所授权的 tree URI 访问。

原文摘要核对、写前记录及写后回读沿用既有保存语义。SAF 没有可依赖的全局比较交换或跨提供器原子替换保证；本批不宣称任意时间断电都能恢复原文件。导出及副本成功也不会自动清除原异常记录。

## 验证结果

| 层次 | 本批结果 | 证据 |
| --- | --- | --- |
| 会话协调 | 16 项通过，包括新增 4 项草稿与不可用来源场景 | `npm run test:mobile` |
| 移动生产构建 | Vue 类型检查、Vite 构建、x86_64 debug APK 打包通过 | [构建记录](evidence/mobile-0.1.0/boundaries-native-2026-10-23/build-record.json) |
| 浏览器基本任务 | 6 组通过，无页面异常；360、412、800 视口 | [基本任务](evidence/mobile-0.1.0/browser-1792769222111/report.json) |
| 浏览器边界任务 | 4 组通过，无页面异常；明确注入预览夹具 | [边界任务](evidence/mobile-0.1.0/boundaries-browser-1792769222150/report.json) |
| Android 系统任务 | 撤销真实授权、恢复草稿、只读副本、取消及导出恢复记录、离线目录失败与重试通过本次任务 | [原生任务记录](evidence/mobile-0.1.0/boundaries-native-2026-10-23/tasks.json) |
| Android 文件核对 | 原提供器文件未变，导出包含两个版本，草稿与副本按字节一致 | [机器核对结果](evidence/mobile-0.1.0/boundaries-native-2026-10-23/byte-verification.json) |

设备为自有开发 AVD `LongEdit_API35` / `emulator-5556`，Android 15 / API 35、x86_64，WebView 124.0.6367.219；APK 身份为 `com.longyuye.mdreader.mobile.dev`，versionName 1.2.11。最终包 SHA-256 为 `b61de7d915d9d059afd76c88b6c58587172bba71f9ad3c08aeae57518817aaaa`，开发签名，126,775,178 字节。本机构建时本批变更尚未提交，记录明确保留 `sourceDirty: true`；这不是从干净发布提交构建的正式包。

只读、离线和读回不一致由[单独的测试提供器](../tests/android-storage-provider/README.md)提供固定故障，经过真实系统选择器、持续授权及原生 DocumentsProvider 接口。测试 APK 不进入产品包。它不能替代真实云盘、磁盘不足、提交中断、设备断电或全部第三方提供器的验证。

## 本地复现

```powershell
npm run test:mobile
npm run build:mobile

# 使用已运行的移动预览服务；本机捆绑的 Playwright 路径可按环境调整。
$env:LONGEDIT_PLAYWRIGHT_MODULE = 'C:/Users/39633/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'
$env:LONGEDIT_MOBILE_PREVIEW_URL = 'http://127.0.0.1:9012/mobile.html'
npm run test:mobile-browser
npm run test:mobile-boundaries-browser

./scripts/build-mobile-debug.ps1 -Target x86_64
```

安装测试提供器后，通过系统选择器完成以下任务：

1. 选择 unconfirmed 目录，打开 `provider-note.md`，进入编辑，输入测试标记并等待草稿保护，再保存。应提示写入结果未确认。读回提供器原文件与私有恢复记录。
2. 返回资料库，停止访问 unconfirmed 并确认；从最近打开原资料，继续私有草稿，将副本存入手机库。原草稿与原文件必须仍在。
3. 设置 → 保存恢复记录 → 选择该记录，检查两个版本。分别将原文和草稿存入手机库。先取消一次系统导出，再实际保存 JSON，等待应用返回并完成回读后核对导出内容。
4. 选择 readonly 目录，编辑后使用存入手机库。核对提供器原文未变，手机库副本包含输入。
5. 选择 offline 目录，检查错误与重新读取入口，再通过选择其他资料库返回。错误状态不可显示空库引导或旧文件数量。

记录本次 journal UUID 后执行只读核对，例如：

```powershell
node scripts/verify-mobile-boundaries-native.mjs --serial emulator-5556 --recovery-id b5ca7ecf-db36-475f-bb56-aa6a92118745 --export-path '/sdcard/Download/Long编辑-保存恢复-b5ca7ecf.json' --readonly-marker READONLY_COPY_20261023 --output docs/evidence/mobile-0.1.0/boundaries-native-2026-10-23
```

脚本不选择或重置设备，不清理应用数据；新的测试应使用实际 UUID、路径及输入标记。脚本只核对数据结果，界面步骤仍需单独执行。

## 发现的问题与记录边界

- 首次浏览器边界任务失败：测试数据注入脚本也在隔离阅读 iframe 内执行，引起 localStorage 异常；另存后通知由已卸载子组件发出，反馈不稳定。已限制注入到顶层页面，由父页面持有通知，并增加实际渲染标题断言。[首次失败记录](evidence/mobile-0.1.0/boundaries-browser-1792767839628/report.json)保留，最终两组脚本完整重跑通过。
- 原生枚举错误曾被呈现为空目录，已改为直接查询并验证离线失败。之后发现错误页仍有旧数量、且继续卡片挤占错误入口，最终 APK 已修复并复核。[离线截图](evidence/mobile-0.1.0/boundaries-native-2026-10-23/offline-final.png)
- 旧 WebView 的无障碍树对动态提示可能更新滞后；出现过提示截图可见但文本定位超时。另有包含匹配误点“停止访问”按钮而进入确认页，测试取消后改为完整标签定位。这些驱动失败未计入功能通过依据，使用最终截图、明确标签及文件回读核对结果。
- 首次导出文件的 ADB 拉取早于异步写入完成，读到刚创建的空文件；等待应用完成后重新读取，JSON 与私有记录一致。导出操作仍以应用回读确认结束，不能用选择器已创建文件推断写入完成。

下一批按计划接入相对图片、文档内查找与阅读接续。大目录完整性、真实写入中断、中文 IME、arm64 真机、release/升级及 iOS 尚待后续验收，M0 / M2 退出条件继续保持原标准。
