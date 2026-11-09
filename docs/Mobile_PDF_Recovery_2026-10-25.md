# 第三十五批：批注删除恢复与阅读笔记回链

接续第三十四批，围绕“删错后恢复、从摘录回到原文、读完回到笔记”的任务推进。移动端工作仍在 `codex/mobile-0.1.0-foundation`，桌面检出未修改。开发包序号 `1002039`，开发签名、最低 API29。

## 竞品与设计

2026-10-25 查阅官方资料，未安装竞品。[Acrobat 移动评论管理](https://helpx.adobe.com/acrobat/mobile/review-files/manage-comments.html)在共享审阅场景提供评论列表定位与菜单删除；本项目借鉴集中回看和明确操作入口，不据此声称它的本地文件或撤销持久性行为。[Zotero Android](https://www.zotero.org/support/android)介绍移动阅读、批注与研究笔记，并说明回到电脑后可将移动批注整理到笔记或导出 Markdown；[Zotero PDF/笔记指南](https://www.zotero.org/support/pdf_reader)展示摘录附带原文页链接的整理方式，该指南主要讨论桌面编辑器，不能当作 Android 同等能力的实测证据。

本项目据此设计：每条批注提供删除确认；恢复入口持续显示，不依赖短暂倒计时。阅读笔记里的来源可点击，同时提供顶层“原文来源”列表，便于触摸与辅助技术访问；进入 PDF 后显示来源上下文和“返回笔记”。

使用 `imagegen` 技能、内置 `image_gen` 新建一张完整界面参考，未走 CLI/API 密钥方式。[参考图](design/mobile-0.1.0/pdf-recovery-v1.png)与[完整提示词/原始路径](design/mobile-0.1.0/pdf-recovery-v1-prompt.txt)已保存。实际图和同尺寸对照在验证后归档，保留 PDF 真正的文字、排版和平台字体。

## 实现规则

- 列表卡片增加“删除”，展开本条确认，可选择“保留批注”。确认后仅删除目标 ID，PDF 和已经生成的 Markdown 不变。手机资料库可写，外部 SAF 仍只读。
- 每个完整资料库/路径身份保留最近一次删除，重新打开或进程重启后可撤销。再次删除前明确提示会替换上次恢复记录；本批不是多步删除历史或回收站。
- 删除前必须先持久化恢复日志。日志同时保留上一条可撤销记录和待确认的新删除，原生保存完成后才提升为新恢复记录。中途退出、写入未确认或日志最终整理失败，重新读取 sidecar 后按 ID 是否存在核对；没有确认删除时保留原恢复记录，不凭界面状态假定文件已修改。
- 撤销读取最新 PDF/sidecar，核对完整 PDF SHA 和来源后，只把删除前的那一条批注恢复进最新集合。原 ID、引文、评论、矩形、颜色和时间保持；其他批注较新的编辑不被旧快照覆盖。来源变化、同 ID 已存在、页码异常、文件损坏、预算超限或版本再次变化时拒绝写入，保留恢复摘录。
- 每份新生成笔记的“原文第 N 页”链接沿用桌面 `longedit://pdf` 的 path/page/annotation/sha256 参数，并增加移动端 root 身份。显示标题省去导入 UUID，精确文件路径、批注编号和摘要仍在链接中；原笔记不会被自动改写。
- 来源 URI 按固定语法解析：仅允许已知且不重复的参数，单次 UTF-8 百分号解码，拒绝绝对路径、越界段、控制字符、非法资料库身份和缺失摘要。内部文件名中的百分号只作为字面字符交给受限存储边界，不再次解码路径。没有根据文件名到其他资料库猜测定位，也没有新增系统级协议处理器。
- 原文链接经过独立清洗后映射为最多200个索引；不把源文件的 data 属性或任意 URL 直接传给原生存储。固定 reader bridge 的 SHA 同步到 reader CSP 与 Android CSP。外部脚本、越界路径和非本 frame/channel 的消息不能触发定位。
- 点击前先读 PDF 核对摘要，失败时保留当前笔记；PDF 打开时再次核对，避免两次读取之间发生变化。找到批注时定位当前页和标记；原批注已删则如实打开引用页并保留摘录。页码越界或 sidecar 来源异常时说明未完成精确定位。当前引用被删除/恢复时同步更新上下文。
- 顶层“原文来源”列表按20处显示更多，包含页码和文件名；正文中仍可直接点击来源链接。返回时打开同一笔记并沿用既有阅读位置机制。超预算的纯源码阅读路径暂不建立交互来源列表；旧版本生成的纯文字来源也不自动补链，可重新生成新笔记。

## 顺序与边界

本批先实现上述闭环，再核对逻辑、浏览器、原生文件和双架构安装包。下一步推进批注筛选与选择摘录、阅读笔记整理，再按 M4 计划继续剩余 PDF 功能。多步撤销、跨设备重定位、外部 SAF 批注写入、高级 PDF、完整 TalkBack、真机/iOS 与正式发布仍独立验收。

## 最终验收

执行中 Android 首轮生成链接未通过校验，原 PDF/批注未改变。改为固定 URI 语法解析并补充不依赖平台 URL 构造器的测试后，实际 Android 生成、跳页、返回、删除与重启撤销均复验通过。首轮候选全部保留并纳入新的保护集合；详细过程和未确定的底层差异见[执行记录](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/test-notes.md)。

- 220 项逻辑通过：[最终日志](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/logic-tests.txt)。reader bridge SHA 与双端 CSP pin 一致，双架构均通过 TypeScript 与构建。
- 最终固定构建一次完整串行回归通过 34 脚本 / 263 组：[完整摘要](evidence/mobile-0.1.0/browser-regression-1792871540370/summary.json)。[新专项11组](evidence/mobile-0.1.0/pdf-recovery-browser-1792871989398/report.json)覆盖真实来源链接、删除最后一条、持久日志两阶段、配额/并发保护、原文变化、清洗边界、深色/200%/短屏等，无页面异常和外部请求。
- 最终 API29 原生13阶段通过：[摘要](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/summary.json)。85 个原有及候选文件、8份草稿、18个文字导入文件、6个包文件完整保留；结束88文件。只读提供器源及每份 PDF 原字节不变，原ID/坐标/时间恢复已核对，生成笔记持续字节一致。可检查[生成的合成阅读笔记](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/generated-reading-note.md)与[恢复后的 sidecar](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/annotations-restored.json)。
- 17 项打包保护通过：[报告](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/packaging-verification.json)。[构建一致性](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/artifact-consistency.json)核对双APK摘要、序号及SO内最终前端文件名；原生安装摘要匹配最终x86包。构建基线如实保留为 `453fe852e9e83d42ce7f5ed8e32cf1b5097bd5e1 + dirty`。
- [恢复实际启动辅助设置并关闭专用模拟器](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/lifecycle.json)，[环境实测](evidence/mobile-0.1.0/pdf-recovery-native-final-2026-10-25/environment.json)与WebView日志留存；没有用模拟器代替ARM真机或iOS验收。

最终[浅色实页](design/mobile-0.1.0/pdf-recovery-v1-implemented.png)、[深色实页](design/mobile-0.1.0/pdf-recovery-v1-dark.png)、[设计/实现对照](design/mobile-0.1.0/pdf-recovery-v1-comparison.png)均来自可操作程序。390×844应用区中，恢复卡为x16/宽358/高100px；面板约530px，来源上下文72px，均有几何记录。实际保留更完整的核对反馈与44px触控目标，面板高于生成参考，未声称逐像素一致。

| 开发包 | 字节 | SHA-256 |
|---|---:|---|
| `release-artifacts/mobile-debug/aarch64/app-arm64-debug.apk` | 128940989 | `80615aca6b815ee6fc13e442783eb2c319cc36e8aabbedb14749d488e21cf504` |
| `release-artifacts/mobile-debug/x86_64/app-x86_64-debug.apk` | 129587418 | `a7d076086bb62aa5ea1307ac307344e80c640c9a1bada7e53c84bb66e12db01f` |
