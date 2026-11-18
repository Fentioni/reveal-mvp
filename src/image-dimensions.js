export async function dimensions(file) {
  const b = new Uint8Array(await file.slice(0, Math.min(file.size, 262144)).arrayBuffer());
  if(file.type === 'image/png') {
    const ok = [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v);
    if(!ok || b.length < 24) return null;
    return {width:(b[16]*16777216+b[17]*65536+b[18]*256+b[19]), height:(b[20]*16777216+b[21]*65536+b[22]*256+b[23])};
  }
  if(file.type === 'image/jpeg') {
    if (b[0] !== 255 || b[1] !== 216 || b[2] !== 255) return null;
    let p = 2;
    while(p + 8 < b.length) {
      if(b[p] !== 255) {p++;continue;}
      while(b[p] === 255 && p < b.length) p++;
      const marker = b[p++];
      if(marker === 0xD9 || marker === 0xDA) break;
      if(marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
      if(p + 2 >= b.length) break;
      const segmentLength = (b[p] << 8) + b[p+1];
      if(segmentLength < 2 || p + segmentLength > b.length) break;
      if ([0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF].includes(marker)) {
        return {height:(b[p+3]<<8)+b[p+4],width:(b[p+5]<<8)+b[p+6]};
      }
      p += segmentLength;
    }
    return null;
  }
  if(file.type === 'image/webp') {
    const ascii = (start,count) => String.fromCharCode(...b.slice(start,start+count));
    if(b.length < 30 || ascii(0,4) !== 'RIFF' || ascii(8,4) !== 'WEBP') return null;
    if(ascii(12,4) === 'VP8X') {
      const width = 1 + b[24] + (b[25]<<8) + (b[26]<<16);
      const height = 1 + b[27] + (b[28]<<8) + (b[29]<<16);
      return {width,height};
    }
    if(ascii(12,4) === 'VP8L') {
      if (b[20] !== 47) return null;
      return {
        width: 1 + (b[21] | ((b[22] & 63) << 8)),
        height: 1 + (((b[24] & 15) << 10) | (b[23] << 2) | ((b[22] & 192) >> 6))
      };
    }
    if(ascii(12,4) === 'VP8 ') {
      for(let p=20;p<Math.min(75,b.length-8);p++) {
        if(b[p] === 0x9d && b[p+1] === 1 && b[p+2] === 0x2a) {
          return {width:(b[p+3]+(b[p+4]<<8)) & 0x3fff,height:(b[p+5]+(b[p+6]<<8)) & 0x3fff};
        }
      }
    }
    return null;
  }
  return null;
}

