# v1.3.4：切换文件后从原位置继续工作

- JSON、YAML、XML、TOML按当前打开的文件接续源码光标、选区与阅读位置。
- 接续提纲和JSON树的滚动，窄窗口按需打开结构区域后继续原位置。
- 首次打开或正文改变时自然回退，提纲、搜索、正文中的主动操作优先，恢复不抢焦点。
- 实际改名后沿原标签接续，关闭后重新打开从默认状态开始；位置仅在当前窗口的打开标签间保留。
- 保护未保存正文、显式保存与既有撤销，保留全部风格和正常动效，沿用现有界面。

8组重建／复用场景、72组风格／窗口，既有提纲接续与导航各72组、YAML删除12项回归通过。固定源码完整发布检查、Rust1464项功能及1项性能、87组/808项安装版任务通过。NSIS、MSI及SHA256SUMS.txt三份公开附件已回下载核对。

未签名社区版，可手动下载安装。NSIS完成实际安装、手动升级和卸载；MSI完成构建与摘要核对。应用内1.3.3→1.3.4自动更新实际观察独立待完成。JSON大文件分段导航沿原有方式使用；软件重启及跨文件Undo历史不在本版接续范围。

[本版审计](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/V1_3_4_Unsigned_Community_Release_Audit_2026-10-28.md) · [下一版路线](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/Foundation_Deepening_Roadmap_1_3_5_2026-10-28.md)
