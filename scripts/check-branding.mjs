import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
const crc32=buffer=>{let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
for(const [name,size]of [['icon-192',192],['icon-512',512],['launcher/mdpi',48],['launcher/hdpi',72],['launcher/xhdpi',96],['launcher/xxhdpi',144],['launcher/xxxhdpi',192]]){
 const file='icons/'+name+'.png',data=readFileSync(file),parts=[];
 if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('PNG inválido: '+file);
 let offset=8,ended=false,width,height,color;
 while(offset<data.length){const length=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8),end=offset+12+length;if(end>data.length)throw Error('PNG truncado: '+file);if(crc32(data.subarray(offset+4,offset+8+length))!==data.readUInt32BE(offset+8+length))throw Error('CRC inválido: '+file);if(type==='IHDR'){width=data.readUInt32BE(offset+8);height=data.readUInt32BE(offset+12);color=data[offset+17];if(data[offset+16]!==8||data[offset+20]!==0)throw Error('Formato de ícone inesperado');}if(type==='IDAT')parts.push(data.subarray(offset+8,offset+8+length));if(type==='IEND')ended=true;offset=end;}
 const channels=color===6?4:color===2?3:0;
 if(!ended||width!==size||height!==size||!channels||inflateSync(Buffer.concat(parts)).length!==height*(width*channels+1))throw Error('Dados incompletos: '+file);
}
console.log('Ícones: dimensões, CRC e dados PNG completos em todas as densidades.');
