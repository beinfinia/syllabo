// Small, dependency-free text PDF exporter. WinAnsi preserves Spanish accents.
export function createPlanPDF(text) {
  const extra = {'€':128,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'…':133};
  const literal = value => [...value].map(char => {
    const code = extra[char] ?? char.codePointAt(0);
    return code >= 32 && code <= 255 ? '\\' + code.toString(8).padStart(3,'0') : '?';
  }).join('');
  const widths = {" ": 278, "!": 278, "\"": 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, "A": 667, "B": 667, "C": 722, "D": 722, "E": 667, "F": 611, "G": 778, "H": 722, "I": 278, "J": 500, "K": 667, "L": 556, "M": 833, "N": 722, "O": 778, "P": 667, "Q": 778, "R": 722, "S": 667, "T": 611, "U": 722, "V": 667, "W": 944, "X": 667, "Y": 667, "Z": 611, "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333, "a": 556, "b": 556, "c": 500, "d": 556, "e": 556, "f": 278, "g": 556, "h": 556, "i": 222, "j": 222, "k": 500, "l": 222, "m": 833, "n": 556, "o": 556, "p": 556, "q": 556, "r": 333, "s": 500, "t": 278, "u": 556, "v": 500, "w": 722, "x": 500, "y": 500, "z": 500, "{": 334, "|": 260, "}": 334, "~": 584, "\u007f": 761, "\u0080": 761, "\u0081": 761, "\u0082": 761, "\u0083": 761, "\u0084": 761, "\u0085": 761, "\u0086": 761, "\u0087": 761, "\u0088": 761, "\u0089": 761, "\u008a": 761, "\u008b": 761, "\u008c": 761, "\u008d": 761, "\u008e": 761, "\u008f": 761, "\u0090": 761, "\u0091": 761, "\u0092": 761, "\u0093": 761, "\u0094": 761, "\u0095": 761, "\u0096": 761, "\u0097": 761, "\u0098": 761, "\u0099": 761, "\u009a": 761, "\u009b": 761, "\u009c": 761, "\u009d": 761, "\u009e": 761, "\u009f": 761, "\u00a0": 278, "\u00a1": 333, "\u00a2": 556, "\u00a3": 556, "\u00a4": 556, "\u00a5": 556, "\u00a6": 260, "\u00a7": 556, "\u00a8": 333, "\u00a9": 737, "\u00aa": 370, "\u00ab": 556, "\u00ac": 584, "\u00ad": 333, "\u00ae": 737, "\u00af": 333, "\u00b0": 400, "\u00b1": 584, "\u00b2": 333, "\u00b3": 333, "\u00b4": 333, "\u00b5": 556, "\u00b6": 537, "\u00b7": 278, "\u00b8": 333, "\u00b9": 333, "\u00ba": 365, "\u00bb": 556, "\u00bc": 834, "\u00bd": 834, "\u00be": 834, "\u00bf": 611, "\u00c0": 667, "\u00c1": 667, "\u00c2": 667, "\u00c3": 667, "\u00c4": 667, "\u00c5": 667, "\u00c6": 1000, "\u00c7": 722, "\u00c8": 667, "\u00c9": 667, "\u00ca": 667, "\u00cb": 667, "\u00cc": 278, "\u00cd": 278, "\u00ce": 278, "\u00cf": 278, "\u00d0": 722, "\u00d1": 722, "\u00d2": 778, "\u00d3": 778, "\u00d4": 778, "\u00d5": 778, "\u00d6": 778, "\u00d7": 584, "\u00d8": 778, "\u00d9": 722, "\u00da": 722, "\u00db": 722, "\u00dc": 722, "\u00dd": 667, "\u00de": 667, "\u00df": 611, "\u00e0": 556, "\u00e1": 556, "\u00e2": 556, "\u00e3": 556, "\u00e4": 556, "\u00e5": 556, "\u00e6": 889, "\u00e7": 500, "\u00e8": 556, "\u00e9": 556, "\u00ea": 556, "\u00eb": 556, "\u00ec": 278, "\u00ed": 278, "\u00ee": 278, "\u00ef": 278, "\u00f0": 556, "\u00f1": 556, "\u00f2": 556, "\u00f3": 556, "\u00f4": 556, "\u00f5": 556, "\u00f6": 556, "\u00f7": 584, "\u00f8": 611, "\u00f9": 556, "\u00fa": 556, "\u00fb": 556, "\u00fc": 556, "\u00fd": 500, "\u00fe": 556, "\u00ff": 500};
  const width = value => [...value].reduce((sum,char)=>sum+(widths[char] || 600),0);

  const W=595.28,H=841.89,M=46,CW=W-M*2,BOTTOM=62;
  const teal=[0.08,0.35,0.36],ink=[0.12,0.17,0.21],muted=[0.36,0.43,0.46],pale=[0.91,0.95,0.94],lineColor=[0.69,0.79,0.78];
  const pages=[];let commands=[],y=48;
  const raw=String(text||'').replace(/\r/g,'').split('\n');
  const title=(raw[0]||'Plan de clase').replace(/^PLAN DE CLASE/i,'Plan de clase');
  const subject=title.split('|').slice(1).join('|').trim();
  const rgb=c=>c.join(' ');
  function write(value,x,top,size=10,font='F1',color=ink){commands.push('BT /'+font+' '+size+' Tf '+rgb(color)+' rg 1 0 0 1 '+x.toFixed(2)+' '+(H-top-size).toFixed(2)+' Tm ('+literal(value)+') Tj ET');}
  function rect(x,top,w,h,fill,stroke=null){commands.push('q '+rgb(fill)+' rg '+(stroke?rgb(stroke)+' RG 0.5 w ':'')+x+' '+(H-top-h)+' '+w+' '+h+' re '+(stroke?'B':'f')+' Q');}
  function rule(top){commands.push('q '+rgb(lineColor)+' RG 0.5 w '+M+' '+(H-top)+' m '+(W-M)+' '+(H-top)+' l S Q');}
  function wrap(value,maxWidth=CW,size=10,font='F1'){
    const result=[];const limit=maxWidth/size*1000/(font==='F2'?1.07:1);
    for(const p of String(value||'').split('\n')){
      let current='';
      for(let word of p.split(/\s+/).filter(Boolean)){
        if(current&&width(current+' '+word)>limit){result.push(current);current='';}
        while(width(word)>limit){let cut=1;while(cut<word.length&&width(word.slice(0,cut+1))<=limit)cut++;result.push(word.slice(0,cut));word=word.slice(cut);}
        if(word)current+=(current?' ':'')+word;
      }
      result.push(current);
    }return result;
  }
  function newPage(){if(commands.length)pages.push(commands);commands=[];y=48;}
  function ensure(h){if(y+h>H-BOTTOM)newPage();}
  function paragraph(value,{size=10.4,font='F1',color=ink,gap=7}={}){
    const lines=wrap(value,CW,size,font),leading=size*1.38;
    for(const l of lines){ensure(leading);write(l,M,y,size,font,color);y+=leading;}y+=gap;
  }
  function heading(label){const lines=wrap(label,CW-20,11,'F2');const h=lines.length*15+13;ensure(h+35);rect(M,y,CW,h,pale);lines.forEach((l,i)=>write(l,M+10,y+6+i*15,11,'F2',teal));y+=h+10;}
  function documentTitle(value){const lines=wrap(value,CW,18,'F2');for(const l of lines){write(l,M,y,18,'F2',teal);y+=23;}y+=8;}
  const criteriaAt=raw.findIndex(l=>/^\s*(?:Lista de cotejo|Criterios de evaluaci[oó]n)/i.test(l));
  const answerAt=raw.findIndex((l,i)=>i>criteriaAt&&/^\s*RESPUESTAS ORIENTATIVAS/i.test(l));
  const worksheetAt=raw.findIndex(l=>/^\s*FICHA Y EVALUACI[OÓ]N\s*$/i.test(l));
  const contentEnd=criteriaAt>=0?criteriaAt:raw.length;
  documentTitle(title);
  function renderLines(lines){
    for(const original of lines){
      const value=original.trim();if(!value){y+=4;continue;}
      if(/^FICHA Y EVALUACI[OÓ]N$/i.test(value)){newPage();documentTitle('Ficha de trabajo');continue;}
      if(/^(INDICADOR DE LOGRO|RECURSOS Y PREPARACI[OÓ]N|RESPUESTAS ORIENTATIVAS Y APOYO|GUÍA CONCEPTUAL PARA EL DOCENTE|EJEMPLOS RESUELTOS|GLOSARIO DOCENTE|RETO OPCIONAL DE AMPLIACIÓN)$/i.test(value)||/^(?:\d+[.)]\s*)?(Inicio|Desarrollo|Cierre)\s*\|/i.test(value)){heading(value.replace(/^[A-ZÁÉÍÓÚÑ ]+$/,s=>s.charAt(0)+s.slice(1).toLowerCase()));continue;}
      const isMeta=/^(Docente:|Fecha:|Nombre:)/i.test(value);
      paragraph(value,{size:isMeta?9.5:10.4,font:isMeta?'F2':'F1',color:isMeta?muted:ink});
      if(worksheetAt>=0&&/^\d+[.)]\s/.test(value)){ensure(42);rule(y+18);y+=36;}
    }
  }
  renderLines(raw.slice(1,contentEnd));
  if(criteriaAt>=0){
    let criteria=raw.slice(criteriaAt+1,answerAt>=0?answerAt:raw.length).map(v=>v.trim()).filter(Boolean).map(v=>v.replace(/^\[\s*\]\s*/,'').replace(/\s+S[ií]:\s*_+\s+En proceso:\s*_+\s*$/i,'')).filter(Boolean);
    if(!criteria.length)criteria=['Registrar el avance del estudiante según el indicador de logro.'];
    newPage();documentTitle('Lista de cotejo');
    paragraph(subject,{size:11,font:'F2',color:teal});
    const meta=raw.slice(1,4).filter(v=>/^(Docente:|Fecha:)/.test(v));meta.forEach(v=>paragraph(v,{size:9.5,color:muted}));
    paragraph('Estudiante: __________________________________________',{size:10});
    paragraph('Marque una opción por criterio según el aprendizaje observado.',{size:9.5,color:muted});
    const widths=[CW-144,52,92];let size=10.2;let heights;
    const available=H-BOTTOM-y-40;
    do{heights=criteria.map(v=>Math.max(35,wrap(v,widths[0]-18,size).length*size*1.35+17));if(heights.reduce((a,b)=>a+b,0)<=available)break;size-=0.3;}while(size>=7.5);
    if(heights.reduce((a,b)=>a+b,0)>available)throw new Error('La lista de criterios es demasiado extensa para una página. Acortá los criterios antes de exportar.');
    rect(M,y,CW,31,pale,lineColor);let x=M;
    ['Criterio observable','Sí','En proceso'].forEach((h,i)=>{write(h,x+8,y+9,9.5,'F2',teal);x+=widths[i];});y+=31;
    criteria.forEach((criterion,i)=>{
      const height=heights[i];let x=M;
      widths.forEach((w,col)=>{rect(x,y,w,height,i%2?[0.97,0.98,0.98]:[1,1,1],lineColor);
        if(col===0)wrap(criterion,w-18,size).forEach((v,j)=>write(v,x+9,y+8+j*size*1.35,size));
        else{const boxX=x+w/2-4,top=y+height/2-4;commands.push('q '+rgb(muted)+' RG 0.6 w '+boxX+' '+(H-top-8)+' 8 8 re S Q');}
        x+=w;
      });y+=height;
    });y+=15;
    paragraph('Observaciones de la docente:',{size:10,font:'F2',color:teal});
    for(let i=0;i<2;i++){if(y+22<H-BOTTOM){rule(y+12);y+=22;}}
    if(answerAt>=0){heading('Respuestas orientativas y apoyo');renderLines(raw.slice(answerAt+1));}
  }
  if(commands.length)pages.push(commands);
  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]='<< /Type /Pages /Kids ['+pages.map((_,i)=>(5+i*2)+' 0 R').join(' ')+'] /Count '+pages.length+' >>';
  objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((page,i)=>{
    const id=5+i*2;
    objects[id]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+(id+1)+' 0 R >>';
    const label=(subject?subject+' | ':'')+'Syllabo';
    const footer='q '+rgb(lineColor)+' RG 0.5 w '+M+' 45 m '+(W-M)+' 45 l S Q\nBT /F1 8 Tf '+rgb(muted)+' rg '+M+' 30 Td ('+literal(label.slice(0,95))+') Tj ET\nBT /F1 8 Tf '+(W-M-68)+' 30 Td ('+literal('Página '+(i+1)+' de '+pages.length)+') Tj ET';
    const body=page.join('\n')+'\n'+footer+'\n';
    objects[id+1]='<< /Length '+body.length+' >>\nstream\n'+body+'endstream';
  });
  let pdf='%PDF-1.4\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=pdf.length;pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';}
  const start=pdf.length;pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF';
  return new Blob([pdf],{type:'application/pdf'});
}
