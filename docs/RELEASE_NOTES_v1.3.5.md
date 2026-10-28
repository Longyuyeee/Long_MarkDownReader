# v1.3.5：切换文件后继续查找与替换

- JSON、YAML、XML、TOML分别保留查找及替换输入、大小写／完整词／正则条件和面板开闭。
- 现有面板中文化，无效正则与没有匹配就地反馈。
- 主动选文查找优先，返回文件不自动跳到匹配，也不抢正文、筛选框或弹窗焦点。
- 替换只修改当前草稿，保留撤销／重做，保存后才写回；只读文件隐藏替换操作。
- 改名沿原标签接续，关闭后重开及切换归属重新开始；保留全部风格、正常动效和上版阅读位置接续。

8组重建／复用、72组风格／窗口及4个深色窄窗口，上版位置接续8组／72组回归通过。固定源码完整检查、Rust1464项功能及1项性能、88组/817项安装任务通过。NSIS、MSI及SHA256SUMS.txt三份公开附件回下载核对通过。

未签名社区版，可手动下载安装。NSIS完成实际安装、手动升级和卸载，MSI完成构建与摘要核对；应用内1.3.4→1.3.5自动更新实际观察独立待完成。JSON大文件分段查找保留既有边界，重启后的状态持久化不计入本版。

[本版审计](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/V1_3_5_Unsigned_Community_Release_Audit_2026-10-28.md) · [下一版路线](https://github.com/Longyuyeee/Long_MarkDownReader/blob/main/docs/Foundation_Deepening_Roadmap_1_3_6_2026-10-28.md)
