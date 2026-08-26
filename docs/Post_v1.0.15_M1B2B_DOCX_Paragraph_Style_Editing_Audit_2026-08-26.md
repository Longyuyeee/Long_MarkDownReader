# v1.0.15 后 M1B2B DOCX 已有段落样式编辑审计

日期：2026-08-26
状态：通过
版本：保持 `1.0.15`，`releaseCandidate=false`

## 1. 阶段目标与结论

本阶段只开放简单顶层正文段落在当前 DOCX 已有段落样式之间切换。样式定义不新增、不删除、不改写；表格内段落、内容控件、页眉页脚、域、批注、脚注尾注、浮动对象和复杂段落属性继续只读。

M1B2B 已通过。Microsoft Word、WPS Writer、LibreOffice Writer 三份真实生产者 DOCX 均完成目标读取、内存草稿、撤销/重做、隔离验证、确认后覆盖、Long编辑结构与语义复读。只有 `word/document.xml` 发生变化，`word/styles.xml` 和其余包部件逐项保持。M1B2 尚未整体收口：外部 Word/WPS/LibreOffice 对本轮修改输出的原生复开留给 M1B2C。

## 2. 预期、实际与修正

| 检查项 | 修正前预期 | 真实实际 | 本轮修正 |
| --- | --- | --- | --- |
| 样式库存 | 三生产者至少有两个已有样式 | Word/WPS/LibreOffice 分别为 `21/2/8` | UI 只列出当前文件真实样式名与 ID |
| 段落属性 | 替换样式后段落类型应保持 | 标题切为 Normal/Body Text 后会从 heading 变为 paragraph | 语义验证改为稳定目标 ID、文本和新样式，不错误要求旧类型 |
| `w:pPr` | 只需处理单一 `pStyle` | WPS 与 LibreOffice 的 `pPr` 含多种兄弟属性 | 只替换现有空 `pStyle` 标签，兄弟节点逐字节保持 |
| 草稿撤销 | 选择框聚焦即可建立历史 | 自动化焦点路径不稳定，草稿存在时撤销按钮可能无前置快照 | 鼠标按下、键盘和聚焦三条入口去重捕获历史 |
| 桌面启动 | CDP 端口监听即可开始 | E2E WebView 固定使用 `14200`，且资料库初始化会覆盖过早导航 | 统一端口并等待真实资料库初始化完成 |
| 工具提示按钮 | 可按原生 `title` 定位 | 全局工具提示把 `title` 转为 `aria-label` / `data-app-tooltip` | 测试改按可见按钮的无障碍名称操作 |
| 摘要工具 | npm 启动的 PowerShell 可直接使用 `Get-FileHash` | 默认入口中该模块未自动加载 | 改用 .NET `SHA256`，不依赖 PowerShell 模块 |
| 截图证据 | 尺寸断言通过即可 | 后续生产者截图残留前一文件成功通知 | 等待旧通知退出后重新采集并人工复核 |

## 3. 实现边界

- Rust 从 `word/styles.xml` 读取段落样式定义，并只暴露具有现有空 `w:pStyle`、单一 `w:pPr` 容器和安全顶层正文文本锚点的目标。
- 补丁要求源签名、目标样式摘要和目标样式 ID 同时有效；不存在样式、过期摘要、重复目标或复杂结构均拒绝。
- 单项和批量事务均支持 `paragraphStyle`；批量可与文本修改合并，且要求确定性重放和最终语义复读。
- Vue 页面编辑增加“段落”模式，沿用统一修改清单、撤销/重做、离开保护、隔离验证和“保存到原文件”确认。
- 草稿、撤销、重做和隔离验证均不写盘；只有用户确认覆盖后才执行可靠替换。

## 4. 真实验收结果

| 生产者 | 原样式 -> 新样式 | 保存前源摘要 | 保存后源摘要 | 结果 |
| --- | --- | --- | --- | --- |
| Microsoft Word 16 | `1` -> `ab` / Intense Quote | `cae776e4...3176` | `57fa623a...e8eb` | 通过 |
| WPS Writer | `2` -> `1` / Normal | `0da9fad1...868b` | `9efb2ecd...566b` | 通过 |
| LibreOffice Writer | `Heading1` -> `BodyText` | `a549705f...dea3` | `391f728c...258de` | 通过 |

三份文件共同满足：保存前摘要不变、撤销后摘要不变、重做恢复 1 项草稿、隔离验证不写盘、确认保存后摘要变化、Long编辑复读新样式、960x720 无横向溢出、运行时错误 0。人工复核三张截图未发现按钮越界、面板遮挡或旧通知残留。

执行与证据：

- `cargo test --locked --manifest-path src-tauri/Cargo.toml m1b2b -- --nocapture`：2/2 通过。
- `npm run audit:post-v115-m1b2b-docx-paragraph-styles`：完整生产构建、真实 Tauri 和三生产者临时副本入口。
- `npm run check:post-v115-m1b2b-docx-paragraph-styles`：证据身份、摘要、三生产者、交互和截图机器门禁。
- 证据目录：[`docs/evidence/post-v115-m1b2b-docx-paragraph-styles/`](./evidence/post-v115-m1b2b-docx-paragraph-styles/)

## 5. 下一步

进入 **M1B2C DOCX 外部生产者复开与收口**，本步不增加新编辑对象：

1. 使用 M1B2B 生成的三份输出，分别由 Microsoft Word、WPS Writer、LibreOffice Writer 原生程序打开。
2. 记录是否出现修复提示、目标段落实际样式、页面/表格/图片/页眉页脚可见性及保存退出后的二次复开。
3. 外部生产者输出再由 Long编辑反向复读，核对目标样式和未修改对象；缺少生产者时保持明确阻断，不能以内读替代。
4. 三生产者通过后更新格式能力事实并审计 M1B2 退出条件；失败则保留失败样本并回到补丁边界修正。

当前不提升版本、不打包、不更新 README 或 Release。
