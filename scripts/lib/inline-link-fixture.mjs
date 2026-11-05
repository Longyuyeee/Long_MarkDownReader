export const linkSourceText='# 链接修正\n\n保留正文与标点。\n\n[同一份资料](missing.md#本周任务 "说明标题")\n\n不要修改下面同名的链接：\n\n[同一份资料](missing.md#本周任务 "说明标题")\n\n[表格](C.json) 与 [文本](D.txt)。\n\n末尾正文。\n'
export const linkTargetText='# 本周任务\n\n目标原文。\n'
export const replacementDestination='%E8%B5%84%E6%96%99/%E6%96%B0%20%E7%9B%AE%E6%A0%87.md#%E6%9C%AC%E5%91%A8%E4%BB%BB%E5%8A%A1'
export const replacedSource=source=>source.replace('missing.md#本周任务',replacementDestination)
