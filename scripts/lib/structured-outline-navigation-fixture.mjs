export const outlineNavigationSources={
 json:'{"first":"原稿","second":"保留😀","third":"最后"}\n',
 yaml:'first: 原稿\nsecond: 保留😀\nthird: 最后\n',
 xml:'<root>\n  <first>原稿</first>\n  <second>保留😀</second>\n  <third>最后</third>\n</root>\n',
 toml:'first = "原稿"\nsecond = "保留😀"\nthird = "最后"\n',
}
export const outlineNavigationPrefix=mode=>mode==='json'?'\n   \n':mode==='xml'?'<!-- 位置更新 -->\n':'# 位置更新\n'
export const outlineNavigationDraft=mode=>outlineNavigationPrefix(mode)+outlineNavigationSources[mode].replace('原稿','我的草稿')
