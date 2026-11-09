import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Render a read-only HTML comparison. The reference and application PNG files remain unchanged. */
export async function renderMobileDesignComparison(browser, output, design) {
  const reference=path.relative(path.resolve(output),path.resolve(design.reference)).replaceAll('\\','/'), actual=design.actual || '390-toml-light.png'
  const title=design.title || 'Long编辑 · TOML 页面设计对齐'
  const description=design.description || '以 390 × 844 应用区域核对布局；实际页面来自可操作的应用。'
  const actualLabel=design.actualLabel || '实际页面 · 浏览器截图'
  let html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${title}</title><style>*{box-sizing:border-box}body{margin:0;padding:18px;font:14px "Microsoft YaHei",sans-serif;color:#263a30;background:#e9ede6}h1{font-size:19px;margin:0 0 8px}p{margin:0 0 14px;line-height:1.6}.comparison{display:grid;grid-template-columns:390px 390px;gap:24px}figure{margin:0}figcaption{font-size:14px;margin:0 0 8px}img{display:block;width:390px;height:auto;background:#fcfcf8;border:1px solid #d8dfd4}footer{font-size:12px;margin-top:14px;line-height:1.6;max-width:804px}@media(max-width:820px){.comparison{grid-template-columns:minmax(0,390px)}img{max-width:100%}}</style><h1>${title}</h1><p>${description}</p><div class="comparison"><figure><figcaption>${design.referenceLabel || '设计图 · 内置 imagegen'}</figcaption><img src="${reference}" alt="${design.referenceLabel || '界面设计图'}"></figure><figure><figcaption>${actualLabel}</figcaption><img src="${actual}" alt="同尺寸实际界面"></figure></div><footer>${design.footer || "核对项目：顶部文档栏、文稿模式切换、16px 左右边距、358px 内容卡与底部工具条。实际操作入口、完整保存状态和字符渲染以实际可用性为准；不将模型生成的字体与图标像素当作程序行为。"}</footer></html>`
  if (design.comparisonHeight) {
    // Compare the common app region when historical screenshots include a preview ribbon.
    // Preserve both source PNGs; cropping belongs only to this review presentation.
    const referenceImage = `<img src="${reference}" alt="${design.referenceLabel || '界面设计图'}">`
    const actualImage = `<img src="${actual}" alt="同尺寸实际界面">`
    const frame = (markup, top = 0) => `<div style="height:${design.comparisonHeight}px;overflow:hidden">${top ? markup.replace('<img ', `<img style="transform:translateY(-${top}px)" `) : markup}</div>`
    html = html.replace(referenceImage, frame(referenceImage, design.referenceCropTop)).replace(actualImage, frame(actualImage))
  }
  await writeFile(path.join(output,'comparison.html'),html)
  const dataUrl=async file=>'data:image/png;base64,'+(await readFile(file)).toString('base64')
  const referenceData=await dataUrl(design.reference), actualData=await dataUrl(path.join(output,actual))
  const page=await browser.newPage({viewport:{width:840,height:980},deviceScaleFactor:1})
  try { await page.setContent(html.replace(reference,referenceData).replace(`src="${actual}"`,`src="${actualData}"`)); await page.evaluate(()=>Promise.all(Array.from(document.images).map(image=>image.decode()))); await page.screenshot({path:path.join(output,'comparison.png'),fullPage:true}) } finally { await page.close() }
}
