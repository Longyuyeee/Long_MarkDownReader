export const structuredV3 = [
 {format:'yaml',name:'reader.yaml',source:'\uFEFFreader:\r\n  theme: "forest"\r\n  fontSize: 17\r\napp:\r\n  name: "Long编辑"\r\n  language: "zh-CN"\r\nlibrary:\r\n  path: "资料"\r\n  types: [yaml, xml, toml, pdf]\r\n',group:'reader',field:'theme',next:'night',expected:'"forest"'},
 {format:'xml',name:'library.xml',source:'\uFEFF<?xml version="1.0" encoding="UTF-8"?>\r\n<library>\r\n  <book id="b1" category="design">\r\n    <title>界面设计指南</title>\r\n    <author>李明</author>\r\n  </book>\r\n  <book id="b2" category="develop" />\r\n  <book id="b3" category="tools" />\r\n</library>\r\n',group:'book[1]',field:'@category',next:'reading & design',expected:'design'},
 {format:'toml',name:'reader.toml',source:'\uFEFF[reader]\r\ntheme = "forest"\r\nfontSize = 17\r\nwrap = true\r\nshowLineNumber = false\r\n\r\n[library]\r\npath = "资料"\r\ntypes = ["yaml", "xml", "toml"]\r\nrecentLimit = 10\r\ncaseSensitive = false\r\n',group:'reader',field:'theme',next:'night',expected:'"forest"'}
]
export async function openStructuredTask(page,format,task='structure'){
 const button=n=>page.getByRole('button',{name:n,exact:true})
 const legacy=page.locator('.'+format+'-actions,.toml-initial').filter({visible:true})
 if(await legacy.count()){await legacy.getByRole('button',{name:task==='structure'?'浏览结构':'检查 '+format.toUpperCase(),exact:true}).tap();return}
 if(await page.locator('.code-touch-tools').isVisible()){await page.locator('.code-tool-selector').tap();await button('源码操作').tap()}else await button('文档操作').tap()
 await button(task==='structure'?'浏览结构':'检查 '+format.toUpperCase()).tap()
}
