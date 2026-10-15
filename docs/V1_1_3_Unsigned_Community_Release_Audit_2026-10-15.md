# v1.1.3 基础功能深化发布记录

[正式版本](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.1.3) 已发布，发布时刻 2026-10-15T05:18:54Z。固定产品源码 `2854d7792caee2027e1138491a4754fa7a4871cc`，运行时和公开版本均为 1.1.3，下一开发目标 1.1.4，开发标记 `releaseCandidate=false`。

延续 community-unsigned 社区正式发布方式，Windows MSI/NSIS 支持手动下载安装。安装器从公开 1.1.2 覆盖升级的流程已验证；正式应用内自动更新观察仍独立 pending，不用安装器升级结果代替。

本版交付自定义模板、多文档固定/关闭/恢复/排序与阅读位置、常用标签固定与集合多标签筛选、手动关系编辑，以及资料库 TXT 历史比较和恢复。入口沿用右键、菜单、按需弹窗，保留原有六种风格、主题和正常动效。完整范围与限制见 [发布说明](RELEASE_NOTES_v1.1.3.md)。

- [固定源码构建](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38681814716)：完整发布检查、699 项 Rust 功能及 1 项独立性能回归通过，5 项历史忽略。生成 MSI/NSIS，附带原始源码和 SHA-256 记录。
- [相同安装包复核](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38685649568)：生命周期 22、工作区 18、路由 11、管理 7、原工作流 8、收集箱/关系 8、文件管理 9、版本身份 4、新基础功能 8 项全部通过；使用真实安装版、原生 IPC 与独立测试资料库。新增流程覆盖模板保存与默认值、变量和重名、标签固定、多标签筛选、关系修改、TXT 历史恢复副本。
- [发布与公开附件回下载](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38686056344)：发布的是同一批安装器，三个公开附件的文件大小与 SHA-256 均与构建记录一致，失败 0。
- 浏览器组件另有模板 7 组/12 组布局、基础功能 7 组/12 组实际入口操作，覆盖六风格与宽窄窗口，不冒充原生安装结果。

首次云端构建因旧检查逐字匹配 import 被拦截，修正为核对必要导入后完整检查通过。窄窗口复核确认侧栏按现有设计自动收起；点击“导航”后新建菜单与模板弹窗可用，保留原有响应布局和动效。

安装记录和截图见 [安装证据](evidence/v1-1-3-candidate-lifecycle/installed-v113-workflow.json)，附件摘要与发布身份见 [制品清单](evidence/v1.1.3-release/artifact-manifest.json) 和 [发布回执](evidence/v1.1.3-release/release-receipt.json)。
