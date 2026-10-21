# 同包安装复核发现的问题（未发布）

[复核 39524694691](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39524694691) 失败。固定产品 cadedc30f40c11bd2671265b9330b7bc96baaf88；构建 39522001235 的原包，未重新编译。

既有任务与本版实际生成笔记任务已完成。右键评论已保存，但返回 PDF 的筛选、勾选与选中批注未恢复。原始 report 的 readingReturnExact=false 如实保留，不能用作发布通过证据。

原因：主界面内嵌 PDF 在切换路由及慢 sidecar 读取期间先清空状态，滚动事件又把空状态回写到缓存。修复冻结加载前视图、加载恢复期间禁止回写，并把状态保存键绑定到原文件；增加实际 LibraryMode 内嵌、延迟 sidecar 的页面复测。必须重新固定产品、构建并进行完整同包复核。

四份 installed-v1129 原始输出与截图来自自有远端临时资料，无用户实际内容；原始 run/jobs/full.log 保留失败，未修改。
