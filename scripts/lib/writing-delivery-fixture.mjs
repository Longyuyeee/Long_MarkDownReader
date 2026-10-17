import {deflateSync} from 'node:zlib'
const crc=bytes=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0}
export function writingImageFixture(){
 const width=240,height=100,header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2
 const rows=Buffer.alloc((width*3+1)*height)
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*(width*3+1)+1+x*3;rows[p]=x<120?35:245;rows[p+1]=y<50?115:185;rows[p+2]=210}
 const chunk=(name,data)=>{const kind=Buffer.from(name),size=Buffer.alloc(4),hash=Buffer.alloc(4);size.writeUInt32BE(data.length);hash.writeUInt32BE(crc(Buffer.concat([kind,data])));return Buffer.concat([size,kind,data,hash])}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))])
}
