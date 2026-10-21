# 已被后续修复替代的构建（未发布）

[构建 39522001235](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39522001235) 成功，固定产品 cadedc30f40c11bd2671265b9330b7bc96baaf88。质量检查、1100 项功能与 1 项性能回归、MSI/NSIS 及回执通过，5 项既有忽略。

独立同包复核 [39524694691](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/39524694691) 发现实际内嵌 PDF 返回状态丢失，因此此包不发布。原始构建成功并不等于产品可以发布。失败输出见相邻 v1129-review-failure-39524694691 目录；修复后重新固定源码及构建。

首轮 39519644997 在打包时取消以修复弹窗透明；两个旧构建都不作为最终发布包。
