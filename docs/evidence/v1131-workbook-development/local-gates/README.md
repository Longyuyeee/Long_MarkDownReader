# 本地检查记录

页面交互另见 browser/result.json（11 项）与 list-regression/result.json（3 项），IPC 模拟，不充当安装版验收。

完整 patch 检查在新增版本文档和旧的源码契约适配期间分段续跑。quality、remaining、final、complete 保存修正前的真实失败，quality-tail 接续最后失败点并完成剩余检查。前面已通过的检查保留在各原始日志中；后续 Windows 冻结候选质量检查将从头完整运行。

rust-gate 为修正计时夹具预算后按项目要求完整运行：1107 项功能、1 项单独性能检查通过，5 项既有忽略。修改仅影响固定测试夹具等待，不改变产品交互时间片或性能预算。
