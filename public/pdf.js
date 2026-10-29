// Small, dependency-free text PDF exporter. WinAnsi preserves Spanish accents.
export function createPlanPDF(text) {
  const extra = {'€':128,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'…':133};
  const literal = value => [...value].map(char => {
    const code = extra[char] ?? char.codePointAt(0);
    return code >= 32 && code <= 255 ? '\\' + code.toString(8).padStart(3,'0') : '?';
  }).join('');
  const widths = {" ": 278, "!": 278, "\"": 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, "A": 667, "B": 667, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778, "H": 722, "I": 278, "J": 500, "K": 667, "L": 556, "M": 833, "N": 722, "O": 778, "P": 667, "Q": 778, "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944, "X": 667, "Y": 667, "Z": 611, "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333, "a": 556, "b": 556, "c": 500, "d": 556, "e": 556, "f": 278, "g": 556, "h": 556, "i": 222, "j": 222, "k": 500, "l": 222, "m": 833, "n": 556, "o": 556, "p": 556, "q": 556, "r": 333, "s": 500, "t": 278, "u": 556, "v": 500, "w": 722, "x": 500, "y": 500, "z": 500, "{": 334, "|": 260, "}": 334, "~": 584, "\u007f": 761, "\u0080": 761, "\u0081": 761, "\u0082": 761, "\u0083": 761, "\u0084": 761, "\u0085": 761, "\u0086": 761, "\u0087": 761, "\u0088": 761, "\u0089": 761, "\u008a": 761, "\u008b": 761, "\u008c": 761, "\u008d": 761, "\u008e": 761, "\u008f": 761, "\u0090": 761, "\u0091": 761, "\u0092": 761, "\u0093": 761, "\u0094": 761, "\u0095": 761, "\u0096": 761, "\u0097": 761, "\u0098": 761, "\u0099": 761, "\u009a": 761, "\u009b": 761, "\u009c": 761, "\u009d": 761, "\u009e": 761, "\u009f": 761, "\u00a0": 278, "\u00a1": 333, "\u00a2": 556, "\u00a3": 556, "\u00a4": 556, "\u00a5": 556, "\u00a6": 260, "\u00a7": 556, "\u00a8": 333, "\u00a9": 737, "\u00aa": 370, "\u00ab": 556, "\u00ac": 584, "\u00ad": 333, "\u00ae": 737, "\u00af": 333, "\u00b0": 400, "\u00b1": 584, "\u00b2": 333, "\u00b3": 333, "\u00b4": 333, "\u00b5": 556, "\u00b6": 537, "\u00b7": 278, "\u00b8": 333, "\u00b9": 333, "\u00ba": 365, "\u00bb": 556, "\u00bc": 834, "\u00bd": 834, "\u00be": 834, "\u00bf": 611, "\u00c0": 667, "\u00c1": 667, "\u00c2": 667, "\u00c3": 667, "\u00c4": 667, "\u00c5": 667, "\u00c6": 1000, "\u00c7": 722, "\u00c8": 667, "\u00c9": 667, "\u00ca": 667, "\u00cb": 667, "\u00cc": 278, "\u00cd": 278, "\u00ce": 278, "\u00cf": 278, "\u00d0": 722, "\u00d1": 722, "\u00d2": 778, "\u00d3": 778, "\u00d4": 778, "\u00d5": 778, "\u00d6": 778, "\u00d7": 584, "\u00d8": 778, "\u00d9": 722, "\u00da": 722, "\u00db": 722, "\u00dc": 722, "\u00dd": 667, "\u00de": 667, "\u00df": 611, "\u00e0": 556, "\u00e1": 556, "\u00e2": 556, "\u00e3": 556, "\u00e4": 556, "\u00e5": 556, "\u00e6": 889, "\u00e7": 500, "\u00e8": 556, "\u00e9": 556, "\u00ea": 556, "\u00eb": 556, "\u00ec": 278, "\u00ed": 278, "\u00ee": 278, "\u00ef": 278, "\u00f0": 556, "\u00f1": 556, "\u00f2": 556, "\u00f3": 556, "\u00f4": 556, "\u00f5": 556, "\u00f6": 556, "\u00f7": 584, "\u00f8": 611, "\u00f9": 556, "\u00fa": 556, "\u00fb": 556, "\u00fc": 556, "\u00fd": 500, "\u00fe": 556, "\u00ff": 500};
  const width = value => [...value].reduce((sum,char)=>sum+(widths[char] || 600),0);
  const lines = [];
  for (const paragraph of String(text).replace(/\r/g,'').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (width(line + " " + word) > 45000 && line) { lines.push(line); line = ''; }
      let rest = word;
      while (width(rest) > 45000) { if (line) { lines.push(line); line=''; } let cut=1; while(width(rest.slice(0,cut+1))<=45000)cut++; lines.push(rest.slice(0,cut)); rest=rest.slice(cut); }
      line += (line ? ' ' : '') + rest;
    }
    lines.push(line);
  }
  const pages = [];
  for (let i=0;i<lines.length;i+=46) pages.push(lines.slice(i,i+46));
  if (!pages.length) pages.push(['']);
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pages.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  pages.forEach((page,i) => {
    const id=4+i*2;
    objects[id]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`;
    const body=`BT /F1 11 Tf 14 TL 48 785 Td ${page.map(line=>`(${literal(line)}) Tj T*`).join('\n')} ET\nBT /F1 9 Tf 48 32 Td (${literal(`Syllabo | Página ${i+1} de ${pages.length}`)}) Tj ET\n`;
    objects[id+1]=`<< /Length ${body.length} >>\nstream\n${body}endstream`;
  });
  let pdf='%PDF-1.4\n'; const offsets=[0];
  for(let i=1;i<objects.length;i++){ offsets[i]=pdf.length; pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`; }
  const start=pdf.length;
  pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([pdf],{type:'application/pdf'});
}
