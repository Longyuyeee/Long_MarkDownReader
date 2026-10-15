# v1.1.2 社区版发布记录

**状态：已正式发布，公开附件回下载核对通过。** 本版于 2026年10月15日 11:19:12（香港时间）发布为正式稳定版本，Release ID 为 413357055，非草稿、非预发布。

[正式下载与发布说明](https://github.com/Longyuyeee/Long_MarkDownReader/releases/tag/v1.1.2)

## 交付范围

文件右键移动/复制到、创建副本、多选、应用内剪切/复制/粘贴、撤销上次移动和资料库回收站；精简收集箱、集合、标签及关系侧栏。保留原有操作、43 类格式的能力边界、六种风格与动效设置。实现与已有功能验证见 [基础功能路线](Foundation_Features_Upgrade_Plan_2026-10-14.md) 和 [侧栏记录](V1_1_2_Compact_Sidebar_2026-10-14.md)。

## 源码和安装包

- 标签固定产品源码：`985ee7ff1a0b0e27627477d80206623f46ea339a`；[PR #50](https://github.com/Longyuyeee/Long_MarkDownReader/pull/50) 已合并。
- [Quality Gate](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38670852977) 通过。
- 安装包来自 [固定源码构建运行](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38670862467)，该运行的质量、Rust 和 MSI/NSIS 构建步骤通过；[同包真实安装及升级](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38675226932) 通过，发布使用相同 MSI/NSIS。

| 附件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| LongEdit_1.1.2_x64_zh-CN.msi | 76038144 | 25b2652fecd4410747203724bef6ea73fdff69c2f2caff3078d1b1b17143d533 |
| LongEdit_1.1.2_x64-setup.exe | 67289783 | a978fdb11733a42c7d18afe864a903aaf17c74acdab16211d61cabeddf657856 |
| SHA256SUMS.txt | 190 | 6278249fe6a425236215504790fc935792b8c3b00710aa967dd441483813a1b6 |

## 实际验证

类型检查、生产构建、原有功能合同、Rust locked 检查与生产依赖检查通过；692 项 Rust 功能测试与 1 项独立性能回归通过，0 失败、5 项既有忽略项。实际安装完成 22 项生命周期（包括正式 v1.1.1 → v1.1.2 升级）、18 项工作区、11 个路由、7 项管理恢复、8 项原有工作流、8 项收集箱/关系回归、4 项安装版本身份，均通过。

本版新增 **9 项真实安装文件操作检查**通过：右键副本、移动到新建嵌套目录、右键撤销、回收、回收弹窗恢复，以及复制/移动/撤销/永久删除原生命令和全局错误遮罩检查。浏览器夹具与六风格布局记录继续标明模拟 IPC，不替代安装包验证。

前两次检查分别停在刷新按钮的旧 title 定位、短窗口中未滚动的“更多操作”菜单；脚本改用无障碍名称并按实际用户操作滚动菜单后，复用同一安装包完成上述检查，产品源码和安装包没有为复验而更换。

原始安装报告、版本界面及移动/回收弹窗截图在 [安装证据](evidence/v1-1-2-candidate-lifecycle/)；导入清单、附件清单与公开回执在 [发布证据](evidence/v1.1.2-release/)。README 使用本次实际安装截图、下载链接和实际 SHA-256。所有公开附件已在 [GitHub 发布运行](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/38675578389) 中从公开 Release 回下载，大小和摘要与构建回执及 GitHub digest 一致。

## 接续与范围

剪贴板限当前资料库；撤销限当前应用会话最近一次成功移动。回收站保存在资料库的 `.longedit/trash`，恢复原位置重名时提示处理冲突。后续目标为 1.1.3，优先自定义模板，再按已确认路线逐批推进；本版不宣称模板等后续项已经实现。

发布渠道为 community-unsigned；企业能力矩阵仍保持 releaseCandidate=false。Windows“未知发布者”和 SHA-256 说明继续保留，用户可从官方 Release 手动下载安装。正式公网 1.1.1-to-1.1.2 自动更新观察独立保留 pending，安装器升级通过不替代官方自动更新观察。
