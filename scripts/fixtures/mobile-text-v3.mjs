export const textV3Name='雨后随记.txt'
export const textV3Source='\uFEFF'+[
 '雨停的时候，天色已经晚了。院里的石板还带着温意，空气里有很淡的泥土味，夹着草木的清香。屋檐下的水珠偶尔落下，在地上溅起小小的水花。',
 '我沿着小路慢慢走，远处的山被云雾轻轻遮着，轮廓柔和了许多。雨后的世界显得格外安静，连平时吵闹的街巷也收了声。这样的时刻，总能让人放慢脚步，注意到一些平日里忽略的细节：新绿的叶子更亮了，墙角的苔痕也更鲜润。',
 '回到屋里，我沏了一杯热茶。窗外的天色渐渐暗下去，偶尔有几声鸟啼掠过。雨后的清凉让人心情格外平和，仿佛一些烦扰也在这场雨里被轻轻洗去。生活依旧平常，但这样的片刻，足以让人觉得踏实而满足。'
].join('\r\n\r\n')
export const longTextV3Name='长文随记.txt'
const trail=[
 '清晨的雾还没有散，山谷里一片朦胧。我背着简单的行囊出发，沿着河边的小路往上走。脚下是被露水打湿的石阶，偶尔能听见林间传来的鸟鸣，清脆而悠远。',
 '走到一处开阔的平台，雾气渐渐被阳光驱散，远处的山峰露出青灰的轮廓。风从松林间穿过，带着树叶的清香。停下脚步时，心里忽然觉得格外轻松，仿佛一路的疲惫都被这片风景悄悄抚平。',
 '午后在山居的小院里歇息，泡一壶茶，翻看随身带来的笔记。阳光落在桌面上，斑驳而温暖。这样的时光并不热闹，却让人觉得充实而安稳。'
].join('\r\n\r\n')+'\r\n\r\n'
// Synthetic 1.8 MiB travel prose, below the actual native 4 MiB file limit.
// Page counts are always calculated by the product; no fake page metadata.
export const longTextV3Source=trail.repeat(2780)+'\r\nTrailFocusToken\r\n'
