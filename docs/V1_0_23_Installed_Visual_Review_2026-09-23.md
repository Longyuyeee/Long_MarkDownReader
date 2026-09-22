# v1.0.23 安装包原图复审

产品候选 `403a5122d169dfb238cd0a424d83e356f644fb08` 保持不变。托管运行 [35754325807](https://github.com/Longyuyeee/Long_MarkDownReader/actions/runs/35754325807) 成功，artifact `10707843931` 已下载。原始 JSON/JPG 原样归档于 `evidence/v123-candidate-lifecycle/`，不覆盖失败观察。

独立回执校验通过：MSI SHA-256 `18cbe4d115a5611ae81ecafc21fe8b4ebc6999362c8479fd5f5b8d516db98fce`；NSIS `b5b144beba17c86e4bdd029bb3740f00e8b30b1a0243974dd714e6d63ca5054a`。报告声明安装生命周期 22 项、工作面 18 项、管理回滚 7 项、版本身份 4 项通过。报告通过不替代人工视觉审阅。

## 发现与边界

已实际查看版本资料库、设置、能力页及 TXT/JSON 保存截图。资料库显示 v1.0.23 无 DEV，能力页显示运行 v1.0.23、已核对远端 v1.0.22；保存原图显示安全保存与已同步。**设置截图正文空白，不接受为视觉通过，不发布。** 其余截图尚待逐张查看。

`SettingsView.vue` 的 `.animate-item` 从 opacity 0 入场，时长 0.65 秒并有延迟。旧观察脚本只检查 DOM 文本和点击命中，没有检查祖先透明度，可能在动画前点击并截取透明页面。此为有代码依据的待验证原因，不宣称产品已证实无问题。

## 同包复验

`installed-version-identity.mjs` 新增只读观察：更新行位于视口、未遮挡、所有祖先可见且 opacity 至少 0.99、入场动画结束，双帧后再次确认。超时失败，不修改 DOM/CSS、不关闭动画、不模拟更新成功。12 项专项测试通过，包括透明祖先、动画、裁切及遮挡拒绝。

`v123-installed-visual-review.yml` 在一次性 Windows runner 下载同一 artifact，独立核对全部字节后安装；不重新构建、不操作用户安装目录。保留成功或失败的原图，收到结果后再判断。如仍空白则继续诊断产品，不降低验收门槛。正式公开版继续为 v1.0.22。

下一版本方向见 [用户痛点计划](./After_v1_0_23_User_Pain_Priorities_2026-09-23.md)，优先退出/未保存保护一致性，当前不混入新功能。
