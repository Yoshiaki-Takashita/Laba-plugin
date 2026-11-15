/* 建築スタジオ：配置図・街区図・ダイアグラム  担当 F4
   ───────────────────────────────────────────────────────────────────────────────
   tools/archdraw/site（siteplan.py・block.py・model.py・drawcommon.py・svgkit.py）と
   tools/archdraw/diagram（model.py・base.py・sheets.py・svgw.py）の作図規則を JS に移したもの。外部ライブラリなし。
   公開（window.GnotoArchStudio.views に足す。archstudio-views.js が後から views を丸ごと代入しても残るよう、代入を受けて混ぜる）：
     views.site(m, opt)            → 配置図 1:200（紙 420×206）。opt.recess（1 階の外壁面の引き）・opt.fig（図番号）・opt.title:false
     views.block(m, opt)           → 街区図 1:500（紙 420×192）。A 現況・B 個別の建替え・C 共同の建替え
     views.diagram(m, kind, opt)   → ダイアグラム A3 横。kind：'zoning'|'circulation'|'light_wind'|'fire'（'1'〜'4' も可）
     views.site(m,{kind:'block'}) は views.block と同じ。views.diagramScale(m) → ダイアグラムの各階の縮尺。
   第 1〜3 部の街区（区画・木造の家・道路）は架空の文脈で、見本の住戸（SPEC §4。A.site.blockLike(m)）にだけ使う。建物モデルから次を読む：
   間口（通り芯 X の幅）・敷地の奥行（site.polygon）・路地の幅（site.roads[0].width）・後退（site.setback）・外壁厚・階（levels）・屋上（roof）。
   それ以外のモデルは第 4 部（モデルから描く配置図・街区図・ダイアグラム。2026-10-25 S-C）。
   色は SPEC §2 の黒 #1A1A1A・灰 #8C9493・強調 #943522・白だけ（灰の塗りと同じ見た目の縁取り #DCDFDF を除く）。 */
(function(){
'use strict';
const A=window.GnotoArch=window.GnotoArch||{};
const MINE={};
function install(v){ v=v||{}; Object.keys(MINE).forEach(k=>{ if(!v[k]) v[k]=MINE[k]; }); return v; }
try{
  let cur=install(A.views);
  Object.defineProperty(A,'views',{ configurable:true, enumerable:true, get:()=>cur, set:(v)=>{ cur=install(v); } });
}catch(_){ A.views=install(A.views); }

const INK='#1A1A1A', GREY='#8C9493', ACCENT='#943522', PAPER='#FFFFFF';
const FONT="'Noto Sans JP','IPAGothic','Helvetica Neue',Arial,sans-serif";
const T_NOTE=2.0, T_NAME=2.5, T_TITLE=3.5;           // 配置図・街区図：3 段
const T_S=2.0, T_M=2.8;                              // ダイアグラム：2 段
const W={xheavy:0.70, cut:0.50, med:0.35, vis:0.25, thin:0.18, fine:0.13};
const _D=0.25;
const DASH={ solid:null, dashed:(12*_D)+' '+(3*_D), dashdot:(24*_D)+' '+(3*_D)+' '+(0.5*_D)+' '+(3*_D),
  dashdot2:(24*_D)+' '+(3*_D)+' '+(0.5*_D)+' '+(3*_D)+' '+(0.5*_D)+' '+(3*_D), dotted:(0.5*_D)+' '+(3*_D) };
const f=(v)=>{ let s=(+v).toFixed(3).replace(/0+$/,'').replace(/\.$/,''); return (s==='-0'||s==='')?'0':s; };
const esc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtN=(v)=>Math.round(v).toLocaleString('en-US');
function fmt(x, nd){ nd=nd==null?1:nd; const p=Math.pow(10,nd); const r=Math.round((Math.round(x*1e9)/1e9)*p+1e-9)/p; return r.toFixed(nd); }
function textWidth(s, size){ let w=0; for(const ch of String(s)){ const o=ch.codePointAt(0); if(o<0x80||(o>=0xFF61&&o<=0xFF9F)) w+=(" .,:;'|!il1()".indexOf(ch)>=0)?0.36:0.56; else w+=1.0; } return w*size; }
function tint(op, base){ base=base||GREY; const c=[1,3,5].map(i=>parseInt(base.slice(i,i+2),16)); return '#'+c.map(v=>Math.round(255-op*(255-v)).toString(16).toUpperCase().padStart(2,'0')).join(''); }
const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function bbox(P){ let x0=1e18,y0=1e18,x1=-1e18,y1=-1e18; P.forEach(p=>{ x0=Math.min(x0,p[0]); y0=Math.min(y0,p[1]); x1=Math.max(x1,p[0]); y1=Math.max(y1,p[1]); }); return [x0,y0,x1,y1]; }
function polyArea(P){ let a=0; for(let i=0;i<P.length;i++){ const p=P[i], q=P[(i+1)%P.length]; a+=p[0]*q[1]-q[0]*p[1]; } return Math.abs(a)/2; }
class Rand{ constructor(seed){ this.s=(Math.imul(seed>>>0,2654435761)+1013904223)>>>0; } u(){ this.s=(Math.imul(1664525,this.s)+1013904223)>>>0; return this.s/4294967296; } }

/* ── View：実寸 mm → 紙 mm（y は反転） ───────────────────────────────────────── */
class View{ constructor(scale, ox, oy, x0, y0){ this.s=scale; this.ox=ox; this.oy=oy; this.x0=x0; this.y0=y0; }
  p(x,y){ return [this.ox+(x-this.x0)/this.s, this.oy-(y-this.y0)/this.s]; } len(d){ return d/this.s; } }

/* ── Doc：SVG の部品（線の体系・文字・ハッチ・切り抜き・文字の重なりの検査） ───────────── */
let SEQ=0;
class Doc{
  constructor(w,h,title,desc){ this.w=w; this.h=h; this.paper=true; this.title=title||''; this.desc=desc||''; this.defs=[]; this.body=[]; this.labels=[]; this._ids=0; this.pre='gas'+(++SEQ)+'_'; }
  uid(p){ this._ids++; return this.pre+(p||'id')+this._ids; }
  add(s){ this.body.push(s); }
  static stroke(o){ o=o||{}; const w=o.w==null?'fine':o.w; let a='fill="none" stroke="'+(o.color||INK)+'" stroke-width="'+f(typeof w==='string'?W[w]:w)+'"';
    const d=o.dash&&DASH[o.dash]!==undefined?DASH[o.dash]:(o.dash&&typeof o.dash==='string'&&!DASH.hasOwnProperty(o.dash)?o.dash:null);
    if(d) a+=' stroke-dasharray="'+d+'"'; if(o.cap&&o.cap!=='butt') a+=' stroke-linecap="'+o.cap+'"'; if(o.join&&o.join!=='miter') a+=' stroke-linejoin="'+o.join+'"';
    if(o.opacity!=null) a+=' stroke-opacity="'+f(o.opacity)+'"'; return a; }
  line(a,b,o){ this.add('<line x1="'+f(a[0])+'" y1="'+f(a[1])+'" x2="'+f(b[0])+'" y2="'+f(b[1])+'" '+Doc.stroke(o)+'/>'); }
  polyline(pts,o){ o=o||{}; const d='M'+pts.map(p=>f(p[0])+' '+f(p[1])).join(' L')+(o.closed?' Z':''); let st=Doc.stroke(o);
    if(o.fill!=null){ st=st.replace('fill="none"','fill="'+o.fill+'"'); if(o.fillOpacity!=null) st+=' fill-opacity="'+f(o.fillOpacity)+'"'; }
    this.add('<path d="'+d+'" '+st+'/>'); }
  fillpoly(pts,fill,opacity,rule){ const d='M'+pts.map(p=>f(p[0])+' '+f(p[1])).join(' L')+' Z'; let a='fill="'+fill+'"'; if(opacity!=null) a+=' fill-opacity="'+f(opacity)+'"'; if(rule) a+=' fill-rule="'+rule+'"'; this.add('<path d="'+d+'" '+a+' stroke="none"/>'); }
  path(d,attrs){ this.add('<path d="'+d+'" '+attrs+'/>'); }
  circle(c,r,o){ o=o||{}; let st=(o.w!=null||o.color||o.dash)?Doc.stroke(o):'fill="none" stroke="none"'; st=st.replace('fill="none"','fill="'+(o.fill||'none')+'"'); this.add('<circle cx="'+f(c[0])+'" cy="'+f(c[1])+'" r="'+f(r)+'" '+st+'/>'); }
  ellipse(c,rx,ry,o){ this.add('<ellipse cx="'+f(c[0])+'" cy="'+f(c[1])+'" rx="'+f(rx)+'" ry="'+f(ry)+'" '+Doc.stroke(o).replace('fill="none"','fill="'+((o&&o.fill)||'none')+'"')+'/>'); }
  text(xy,s,o){ o=o||{}; const size=o.size||T_NOTE, anchor=o.anchor||'start', base=o.baseline||'alphabetic'; const x=xy[0], y=xy[1];
    const a=['x="'+f(x)+'" y="'+f(y)+'"','font-size="'+f(size)+'"','fill="'+(o.color||INK)+'"'];
    if(anchor!=='start') a.push('text-anchor="'+anchor+'"'); if(o.weight) a.push('font-weight="'+o.weight+'"'); if(base!=='alphabetic') a.push('dominant-baseline="'+base+'"');
    if(o.halo){ a.push('stroke="'+(o.haloColor||PAPER)+'" stroke-width="'+f(typeof o.halo==='number'?o.halo:0.7)+'" stroke-linejoin="round" paint-order="stroke"'); }
    if(o.rotate) a.push('transform="rotate('+f(o.rotate)+' '+f(x)+' '+f(y)+')"');
    this.add('<text '+a.join(' ')+'>'+(o.raw?s:esc(s))+'</text>');
    if(o.check!==false){ const wd=textWidth(o.plain||s,size); const x0=x-(anchor==='middle'?wd/2:anchor==='end'?wd:0); const y0=base==='central'?y-size*0.5:y-size*0.88; this.labels.push([o.plain||s,x0,y0,wd,size,o.rotate||0]); } }
  /* ダイアグラム用：白抜きの面＋白い縁取り（svgw.py の knock／halo） */
  knock(x,y,w,size,anchor){ const x0=anchor==='start'?x:(anchor==='middle'?x-w/2:x-w); const pad=0.7; const y0=y-size*0.95-0.2, y1=y+size*0.25+0.2; this.fillpoly([[x0-pad,y0],[x0+w+pad,y0],[x0+w+pad,y1],[x0-pad,y1]],PAPER); }
  dtext(x,y,s,o){ o=o||{}; const size=o.size||T_S, anchor=o.anchor||'start'; if(o.halo) this.knock(x,y,textWidth(s,size),size,anchor);
    let a='<text x="'+f(x)+'" y="'+f(y)+'" font-size="'+f(size)+'" fill="'+(o.color||INK)+'" text-anchor="'+anchor+'"'; if(o.weight&&o.weight!==400) a+=' font-weight="'+o.weight+'"';
    if(o.halo) a+=' stroke="'+PAPER+'" stroke-width="'+f(size*0.32)+'" stroke-linejoin="round" paint-order="stroke"';
    this.add(a+'>'+esc(s)+'</text>'); if(o.check!==false){ const wd=textWidth(s,size); const x0=x-(anchor==='middle'?wd/2:anchor==='end'?wd:0); this.labels.push([s,x0,y-size*0.88,wd,size,0]); } }
  runs(x,y,parts,o){ o=o||{}; const size=o.size||T_S, anchor=o.anchor||'start'; const all=parts.map(p=>p[0]).join(''); if(o.halo) this.knock(x,y,textWidth(all,size),size,anchor);
    let a='<text x="'+f(x)+'" y="'+f(y)+'" font-size="'+f(size)+'" fill="'+INK+'" text-anchor="'+anchor+'"'; if(o.halo) a+=' stroke="'+PAPER+'" stroke-width="'+f(size*0.32)+'" stroke-linejoin="round" paint-order="stroke"';
    const inner=parts.map(p=>p[1]&&p[1]!==400?'<tspan font-weight="'+p[1]+'">'+esc(p[0])+'</tspan>':esc(p[0])).join(''); this.add(a+'>'+inner+'</text>');
    const wd=textWidth(all,size); const x0=x-(anchor==='middle'?wd/2:anchor==='end'?wd:0); this.labels.push([all,x0,y-size*0.88,wd,size,0]); }
  hatchPattern(angle,gap,w,color,opacity){ const id=this.uid('h'); this.defs.push('<pattern id="'+id+'" patternUnits="userSpaceOnUse" width="'+f(gap)+'" height="'+f(gap)+'" patternTransform="rotate('+f(angle)+')"><line x1="0" y1="0" x2="0" y2="'+f(gap)+'" stroke="'+(color||INK)+'" stroke-width="'+f(w||0.13)+'"'+(opacity!=null?' stroke-opacity="'+f(opacity)+'"':'')+'/></pattern>'); return id; }
  clipRect(x,y,w,h){ const id=this.uid('c'); this.defs.push('<clipPath id="'+id+'"><rect x="'+f(x)+'" y="'+f(y)+'" width="'+f(w)+'" height="'+f(h)+'"/></clipPath>'); return id; }
  clipBegin(pts){ const id=this.uid('c'); this.defs.push('<clipPath id="'+id+'"><polygon points="'+pts.map(p=>f(p[0])+','+f(p[1])).join(' ')+'"/></clipPath>'); this.add('<g clip-path="url(#'+id+')">'); return id; }
  openG(attrs){ this.add('<g '+(attrs||'')+'>'); } closeG(){ this.add('</g>'); }
  /* 多角形を紙の上の間隔で斜線に（位相を紙の原点にそろえる＝隣り合う面で連続して見える） */
  hatch(pts,spacing,angle,color,w,phase){ const b=bbox(pts); const cx=(b[0]+b[2])/2, cy=(b[1]+b[3])/2; const r=Math.hypot(b[2]-b[0],b[3]-b[1])/2+spacing; const a=(angle==null?45:angle)*Math.PI/180;
    const dx=Math.cos(a), dy=-Math.sin(a), nx=-dy, ny=dx; const base=cx*nx+cy*ny; const k0=Math.floor((base-r)/spacing), k1=Math.ceil((base+r)/spacing);
    this.clipBegin(pts); let d=''; for(let k=k0;k<=k1;k++){ const off=k*spacing+(phase||0)-base; const px=cx+nx*off, py=cy+ny*off; d+='M'+f(px-dx*r)+' '+f(py-dy*r)+'L'+f(px+dx*r)+' '+f(py+dy*r); }
    this.add('<path d="'+d+'" fill="none" stroke="'+(color||INK)+'" stroke-width="'+f(w||W.fine)+'"/>'); this.closeG(); }
  stipple(pts,spacing,r,fill){ const b=bbox(pts); this.clipBegin(pts); let d='', j=0; let y=Math.floor(b[1]/spacing)*spacing;
    while(y<=b[3]+spacing){ const off=(j%2)?spacing/2:0; let x=Math.floor(b[0]/spacing)*spacing+off; while(x<=b[2]+spacing){ d+='M'+f(x-r)+' '+f(y)+'a'+f(r)+' '+f(r)+' 0 1 0 '+f(2*r)+' 0a'+f(r)+' '+f(r)+' 0 1 0 '+f(-2*r)+' 0'; x+=spacing; } y+=spacing*0.866; j++; }
    this.add('<path d="'+d+'" fill="'+(fill||INK)+'" stroke="none"/>'); this.closeG(); }
  toSvg(){ const out=['<svg xmlns="http://www.w3.org/2000/svg" width="'+f(this.w)+'mm" height="'+f(this.h)+'mm" viewBox="0 0 '+f(this.w)+' '+f(this.h)+'" font-family="'+FONT+'">'];
    if(this.title) out.push('<title>'+esc(this.title)+'</title>'); if(this.desc) out.push('<desc>'+esc(this.desc)+'</desc>');
    if(this.paper) out.push('<rect width="'+f(this.w)+'" height="'+f(this.h)+'" fill="'+PAPER+'"/>'); if(this.defs.length) out.push('<defs>'+this.defs.join('')+'</defs>'); return out.concat(this.body,['</svg>']).join('\n'); }
  checkLabels(margin){ margin=margin||0; const probs=[]; const B=this.labels.filter(b=>!b[5]);
    B.forEach((a,i)=>{ const [s,x,y,w,h]=a; if(x<margin||y<margin||x+w>this.w-margin||y+h>this.h-margin) probs.push('版面の外: '+s+' ('+x.toFixed(1)+','+y.toFixed(1)+')');
      for(let j=i+1;j<B.length;j++){ const [s2,x2,y2,w2,h2]=B[j]; if(x<x2+w2-0.05&&x2<x+w-0.05&&y<y2+h2*0.95-0.05&&y2<y+h*0.95-0.05) probs.push('文字の重なり: '+s+' と '+s2); } });
    return probs; }
}

/* ── 製図の記号（配置図・街区図） ─────────────────────────────────────────── */
function tick(doc,p,ang,size,w){ size=size||0.9; const c=Math.cos(ang+Math.PI/4), s=Math.sin(ang+Math.PI/4), h=size/2; doc.line([p[0]-c*h,p[1]-s*h],[p[0]+c*h,p[1]+s*h],{w:w||'vis'}); }
function dimH(doc,v,xs,y,o){ o=o||{}; const size=o.size||T_NOTE, extGap=o.extGap==null?0.8:o.extGap, over=o.overshoot==null?1.0:o.overshoot, side=o.side==null?1:o.side, textOff=o.textOff==null?0.6:o.textOff;
  const vals=[]; const pts=xs.map(x=>v.p(x,y)); const py=pts[0][1]; doc.line([pts[0][0]-over,py],[pts[pts.length-1][0]+over,py],{w:'fine'});
  xs.forEach((x,i)=>{ const px=pts[i][0]; if(o.extFrom!=null){ const ef=Array.isArray(o.extFrom)?o.extFrom[i]:o.extFrom; const ey=v.p(x,ef)[1]; const dirn=ey>py?1:-1; doc.line([px,ey-dirn*extGap],[px,py-dirn*over],{w:'fine'}); } tick(doc,[px,py],0); });
  for(let i=0;i<xs.length-1;i++){ const d=xs[i+1]-xs[i]; vals.push(Math.round(d)); const lab=o.labels?o.labels[i]:fmtN(d); if(lab==null) continue; const mx=(pts[i][0]+pts[i+1][0])/2, seg=pts[i+1][0]-pts[i][0];
    const ty=side>0?py-textOff:py+size*0.88+textOff; const so=o.smallOut?(Array.isArray(o.smallOut)&&Array.isArray(o.smallOut[0])||(Array.isArray(o.smallOut)&&o.smallOut.some(x=>x===null))?o.smallOut[i]:o.smallOut):null;
    if(textWidth(lab,size)+0.6>seg&&so){ const [dx,dy]=so; const tx=mx+dx, tyy=ty+dy; doc.line([mx,py],[dx?tx-(textWidth(lab,size)/2+0.3)*(dx>0?1:-1):tx, tyy+(dy<0?0.5:-size*0.9)],{w:'fine'}); doc.text([tx,tyy],lab,{size,anchor:'middle',halo:o.halo}); }
    else doc.text([mx,ty],lab,{size,anchor:'middle',halo:o.halo}); }
  return vals; }
function dimV(doc,v,ys,x,o){ o=o||{}; const size=o.size||T_NOTE, extGap=o.extGap==null?0.8:o.extGap, over=o.overshoot==null?1.0:o.overshoot, side=o.side==null?-1:o.side, textOff=o.textOff==null?0.6:o.textOff;
  const vals=[]; const pts=ys.map(y=>v.p(x,y)); const px=pts[0][0]; doc.line([px,pts[0][1]+over],[px,pts[pts.length-1][1]-over],{w:'fine'});
  ys.forEach((y,i)=>{ const py=pts[i][1]; if(o.extFrom!=null){ const ef=Array.isArray(o.extFrom)?o.extFrom[i]:o.extFrom; const ex=v.p(ef,y)[0]; const dirn=ex>px?1:-1; doc.line([ex-dirn*extGap,py],[px-dirn*over,py],{w:'fine'}); } tick(doc,[px,py],-Math.PI/2); });
  for(let i=0;i<ys.length-1;i++){ const d=ys[i+1]-ys[i]; vals.push(Math.round(Math.abs(d))); const lab=o.labels?o.labels[i]:fmtN(Math.abs(d)); if(lab==null) continue; const my=(pts[i][1]+pts[i+1][1])/2, seg=Math.abs(pts[i+1][1]-pts[i][1]);
    const tx=side<0?px-textOff:px+textOff+size*0.88; const so=o.smallOut?(Array.isArray(o.smallOut[0])||o.smallOut.some(x=>x===null)?o.smallOut[i]:o.smallOut):null;
    if(textWidth(lab,size)+0.6>seg&&so){ const [dx,dy]=so; doc.line([px,my],[px+dx*0.8,my+dy],{w:'fine'}); doc.text([px+dx+(dx>0?0.3:-0.3),my+dy+size*0.35],lab,{size,anchor:dx>0?'start':'end',halo:o.halo}); }
    else doc.text([tx,my],lab,{size,anchor:'middle',rotate:-90,halo:o.halo}); }
  return vals; }
function northArrow(doc,c,length){ length=length||14; const x=c[0], y=c[1]; const top=[x,y-length/2], bot=[x,y+length/2]; doc.line([x,top[1]+4.2],bot,{w:'vis'}); const hw=1.5, baseY=top[1]+5.0;
  doc.fillpoly([top,[x-hw,baseY],[x,baseY-1.1]],INK); doc.polyline([top,[x+hw,baseY],[x,baseY-1.1],[x-hw,baseY],top],{closed:true,w:'thin'}); doc.text([x,top[1]-1.2],'N',{size:T_NAME,anchor:'middle',weight:'bold'}); }
function scaleBar(doc,xy,scale,marks,o){ o=o||{}; const h=o.height||1.2, unit=o.unit||'m', size=o.size||T_NOTE; const L=(m)=>m*1000/scale; const x0=xy[0], y0=xy[1];
  for(let i=0;i<marks.length-1;i++){ const a=x0+L(marks[i]), b=x0+L(marks[i+1]); const r=[[a,y0],[b,y0],[b,y0+h],[a,y0+h]]; if(i%2===0) doc.fillpoly(r,INK); doc.polyline(r,{closed:true,w:'fine'}); }
  marks.forEach((m,i)=>{ const last=i===marks.length-1; const lab=String(m)+(last?' '+unit:''); let xx=x0+L(m), anchor='middle'; if(last){ anchor='start'; xx-=textWidth(String(m),size)/2; } doc.text([xx,y0+h+size+0.4],lab,{size,anchor}); }); }
function treePlan(doc,c,r,o){ o=o||{}; const x=c[0], y=c[1]; const n=Math.max(9,Math.floor(r*3.2)); const rnd=new Rand(o.seed==null?1:o.seed); const pts=[];
  for(let i=0;i<=n*4;i++){ const t=2*Math.PI*i/(n*4); const rr=r*(1.0-0.10*Math.pow(Math.sin(Math.PI*(i%4)/4),2))*(0.97+0.06*rnd.u()); pts.push([x+rr*Math.cos(t),y+rr*Math.sin(t)]); }
  const d='M'+pts.map(p=>f(p[0])+' '+f(p[1])).join(' L')+' Z'; const fill=o.fillOpacity==null?'none':PAPER; doc.add('<path d="'+d+'" fill="'+fill+'" '+Doc.stroke({w:o.w||'fine'}).replace('fill="none" ','')+' stroke-linejoin="round"/>');
  if(o.trunk!==false) doc.circle([x,y],Math.max(0.18,r*0.06),{fill:INK}); }
function shrub(doc,c,r){ doc.circle(c,r,{w:'fine'}); doc.circle(c,r*0.45,{w:'fine'}); }
function arrowOpen(doc,tip,ang,size,w){ size=size||1.0; for(const s of [1,-1]){ const a=ang+Math.PI+s*(28*Math.PI/180); doc.line(tip,[tip[0]+size*Math.cos(a),tip[1]+size*Math.sin(a)],{w:w||0.18,cap:'round'}); } }

/* ══════════════════════════════════════════════════════════════════════════════
   街区のモデル（tools/archdraw/site/model.py の移植）。実寸 mm。x 東・y 北。原点＝西の道路の境界 × 路地の中心線。
   建物モデルから：路地の幅・後退・間口・奥行・外壁厚・通り芯。その他は架空（判断）。
   ══════════════════════════════════════════════════════════════════════════════ */
function readSpec(m){
  m=m||{}; const gx=((m.grid||{}).x||[]).map(g=>g.at), gy=((m.grid||{}).y||[]).map(g=>g.at);
  const ext=(m.walls||[]).find(w=>w.kind==='exterior'||w.kind==='fire');
  const WALL=ext&&ext.t||150;
  const site=m.site||{}; const road=(site.roads||[])[0]||{};
  const ALLEY_W=road.width||2700; const SETBACK=site.setback!=null?site.setback:650;
  const GRID_X=gx.length>=2?gx:[0,2700,5400]; const GRID_Y=gy.length>=2?gy:[0,2700,5400,8100];
  const LOT_W=GRID_X[GRID_X.length-1]-GRID_X[0];
  let LOT_D=9000; if(site.polygon&&site.polygon.length>=3){ const b=bbox(site.polygon); LOT_D=b[3]-b[1]; }
  const SETBACK_LINE=ALLEY_W/2+SETBACK;                     // 中心線から後退線まで（2,000）
  const lv=(m.levels||[]).slice().sort((a,b)=>a.fl-b.fl); const roof=m.roof||{};
  const RFL=roof.fl!=null?roof.fl:(lv.length?lv[lv.length-1].fl+(lv[lv.length-1].height||2700):8650);
  const PARAPET_TOP=RFL+(roof.parapet!=null?roof.parapet:1100);
  // 階段の上の踊り場（ルーフハッチの位置）と出入口（1 階の路地側の引戸の中央）
  let hatchY=null, entryX=2700;
  const st=(m.stairs||[]).slice().sort((a,b)=>((lv.find(l=>l.id===a.from)||{}).fl||0)-((lv.find(l=>l.id===b.from)||{}).fl||0)).pop();
  if(st&&st.origin){ const run=(st.n-1)*st.tread; const yTop=st.dir==='N'?st.origin[1]+run:st.dir==='S'?st.origin[1]-run:st.origin[1]; hatchY=yTop; }
  const sw=(m.walls||[]).find(w=>(w.kind==='exterior'||w.kind==='fire')&&w.level===(lv[0]||{}).id&&Math.abs(w.a[1]-w.b[1])<1&&Math.abs(w.a[1]-GRID_Y[0])<WALL);
  if(sw){ const op=(m.openings||[]).filter(o=>o.wall===sw.id&&(o.type==='sweep'||o.type==='slide'||o.type==='door')).sort((a,b)=>b.width-a.width)[0]; if(op){ const f0=Math.min(sw.a[0],sw.b[0]); const dir=sw.b[0]>=sw.a[0]?1:-1; const a0=dir>0?sw.a[0]:sw.a[0]; entryX=(a0+dir*(op.at+op.width/2))-GRID_X[0]; void f0; } }
  return {WALL,ALLEY_W,ALLEY_HALF:ALLEY_W/2,SETBACK,SETBACK_LINE,GRID_X,GRID_Y,LOT_W,LOT_D,RFL,PARAPET_TOP,hatchY,entryX,levels:lv};
}
function blockModel(m){
  const S=readSpec(m); const M={};
  Object.assign(M,S);
  M.N_LOTS=9; M.BLOCK_W=58000; M.X_P1=5000; M.ROAD_W={west:4000,east:4000,north:6000,south:8000};
  M.N1_REAR=S.ALLEY_HALF+S.LOT_D; M.N2_FRONT=M.N1_REAR+11000; M.S2_FRONT=-20350; M.SIDEWALK=1500; M.CORNER_CUT_BASE=2000;
  M.BLDG_S=S.SETBACK_LINE; M.BLDG_N=M.BLDG_S+S.WALL/2+(S.GRID_Y[S.GRID_Y.length-1]-S.GRID_Y[0])+S.WALL/2; M.REAR_GAP=M.N1_REAR-M.BLDG_N; M.B_SIDE_GAP=250;
  M.lot_x=(i)=>{ const a=M.X_P1+S.LOT_W*(i-1); return [a,a+S.LOT_W]; };
  M.SUBJECT=5; [M.X1,M.X3]=M.lot_x(M.SUBJECT); M.Y1=M.BLDG_S+S.WALL/2;
  const cum=(x0,ws)=>{ const xs=[x0]; ws.forEach(w=>xs.push(xs[xs.length-1]+w)); return xs; };
  const N2_W=[6200,7000,5500,8400,6000,7600,5800,11500], S1_W=[4600,6000,5200,7400,4800,6600,5000,5600,6800,6000], S1_D=[9000,9400,8600,9000,9800,8800,9200,9000,8400,9600], S2_W=[8000,6500,12000,5500,7000,9000,10000];
  // 間口の合計が街区の幅と合うよう東端を調整（間口が 5,400 でないモデルでも破綻しない）
  const fix=(ws)=>{ const s=ws.reduce((a,b)=>a+b,0); const out=ws.slice(); out[out.length-1]+=M.BLOCK_W-s; return out; };
  M.BLOCK_W=Math.max(58000, M.X_P1+S.LOT_W*M.N_LOTS+4400);
  const N1_XS=[0,...Array.from({length:M.N_LOTS},(_,i)=>M.lot_x(i+1)[0]),M.lot_x(M.N_LOTS)[1],M.BLOCK_W];
  const N2_XS=cum(0,fix(N2_W)), S1_XS=cum(0,fix(S1_W)), S2_XS=cum(0,fix(S2_W));
  M.N1_XS=N1_XS; M.S1_XS=S1_XS;
  const s1rear=(x)=>{ for(let i=0;i<S1_W.length;i++){ if((S1_XS[i]<=x&&x<S1_XS[i+1])||(i===S1_W.length-1&&x===S1_XS[S1_XS.length-1])) return -S.ALLEY_HALF-S1_D[i]; } return -S.ALLEY_HALF-9000; };
  function lots(){ const out=[]; const names=['NW',...Array.from({length:M.N_LOTS},(_,i)=>'P'+(i+1)),'NE'];
    names.forEach((nm,k)=>{ const a=N1_XS[k], b=N1_XS[k+1]; out.push({name:nm,row:'N1',poly:[[a,S.ALLEY_HALF],[b,S.ALLEY_HALF],[b,M.N1_REAR],[a,M.N1_REAR]],front:'alley_n',x0:a,x1:b,fy:S.ALLEY_HALF,depth:S.LOT_D}); });
    for(let k=0;k<N2_W.length;k++){ const a=N2_XS[k], b=N2_XS[k+1]; out.push({name:'N2-'+(k+1),row:'N2',poly:[[a,M.N1_REAR],[b,M.N1_REAR],[b,M.N2_FRONT],[a,M.N2_FRONT]],front:'north',x0:a,x1:b,fy:M.N2_FRONT,depth:M.N2_FRONT-M.N1_REAR}); }
    for(let k=0;k<S1_W.length;k++){ const a=S1_XS[k], b=S1_XS[k+1], r=-S.ALLEY_HALF-S1_D[k]; out.push({name:'S1-'+(k+1),row:'S1',poly:[[a,-S.ALLEY_HALF],[b,-S.ALLEY_HALF],[b,r],[a,r]],front:'alley_s',x0:a,x1:b,fy:-S.ALLEY_HALF,depth:S1_D[k]}); }
    for(let k=0;k<S2_W.length;k++){ const a=S2_XS[k], b=S2_XS[k+1]; const xs=Array.from(new Set([a,b,...S1_XS.filter(x=>a<x&&x<b)])).sort((p,q)=>p-q); const top=[];
      for(let j=0;j<xs.length-1;j++){ const y=s1rear((xs[j]+xs[j+1])/2); top.push([xs[j],y],[xs[j+1],y]); }
      const poly=[[a,M.S2_FRONT],[b,M.S2_FRONT]].concat(top.slice().reverse()); const mind=Math.min(...top.map(p=>p[1]))-M.S2_FRONT;
      out.push({name:'S2-'+(k+1),row:'S2',poly,front:'south',x0:a,x1:b,fy:M.S2_FRONT,depth:mind}); }
    out.forEach(l=>{ l.w=l.x1-l.x0; }); return out; }
  M.lots=lots; const LOTS=lots(); M.LOTS=LOTS; const L={}; LOTS.forEach(l=>L[l.name]=l);
  const local=(lot)=>{ if(lot.front==='alley_n') return (u,v)=>[lot.x0+u,lot.fy+v]; if(lot.front==='alley_s'||lot.front==='north') return (u,v)=>[lot.x0+u,lot.fy-v]; return (u,v)=>[lot.x0+u,lot.fy+v]; };
  const gable=(T,u0,u1,v0,v1,along)=>{ if(along==='v'){ const um=(u0+u1)/2; return [[T(um,v0),T(um,v1)]]; } const vm=(v0+v1)/2; return [[T(u0,vm),T(u1,vm)]]; };
  const hip=(T,u0,u1,v0,v1)=>{ const w=u1-u0, d=v1-v0; let a,b,nearA,nearB; if(d>=w){ const h=w/2, um=(u0+u1)/2; a=[um,v0+h]; b=[um,v1-h]; nearA=[[u0,v0],[u1,v0]]; nearB=[[u0,v1],[u1,v1]]; } else { const h=d/2, vm=(v0+v1)/2; a=[u0+h,vm]; b=[u1-h,vm]; nearA=[[u0,v0],[u0,v1]]; nearB=[[u1,v0],[u1,v1]]; }
    const segs=[[T(...a),T(...b)]]; nearA.forEach(c=>segs.push([T(...c),T(...a)])); nearB.forEach(c=>segs.push([T(...c),T(...b)])); return segs; };
  function woodHouse(lot,gl,gr,gf,depth,roof,floors,notch,annex){ const T=local(lot); const u0=gl, u1=lot.w-gr, v0=gf, v1=gf+depth; let pts, main, wing=null;
    if(notch){ const [side,nw,nd]=notch; if(side==='l'){ pts=[[u0,v0],[u1,v0],[u1,v1],[u0+nw,v1],[u0+nw,v1-nd],[u0,v1-nd]]; } else { pts=[[u0,v0],[u1,v0],[u1,v1-nd],[u1-nw,v1-nd],[u1-nw,v1],[u0,v1]]; }
      main=[u0,u1,v0,v1-nd]; wing=side==='l'?[u0+nw,u1,v1-nd,v1]:[u0,u1-nw,v1-nd,v1]; } else { pts=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]]; main=[u0,u1,v0,v1]; }
    const poly=pts.map(p=>T(p[0],p[1])); let segs;
    if(wing){ roof='gu'; const [mu0,mu1,mv0,mv1]=main; const vr=(mv0+mv1)/2; segs=[[T(mu0,vr),T(mu1,vr)]]; const [wu0,wu1,wv0,wv1]=wing; const uc=(wu0+wu1)/2; const vj=Math.max(wv0-(wu1-wu0)/2,vr); segs.push([T(uc,wv1),T(uc,vj)],[T(wu0,wv0),T(uc,vj)],[T(wu1,wv0),T(uc,vj)]); }
    else if(roof==='hip') segs=hip(T,...main); else segs=gable(T,...main,roof==='gv'?'v':'u');
    const ann=[]; if(annex){ const [al,ar,ad]=annex; ann.push([T(u0+al,v1),T(u1-ar,v1),T(u1-ar,v1+ad),T(u0+al,v1+ad)]); }
    return {lot,kind:'wood',poly,floors,roof:segs,annex:ann,label:null,T,main,roofType:roof}; }
  const fireBox=(lot,x0,x1,y0,y1,floors)=>({lot,kind:'fire',poly:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],floors:floors||3,roof:[],annex:[],label:null});
  const N1_WOOD={NW:[300,900,200,7400,'hip',2,['r',1500,2600],null],P1:[450,300,0,7600,'gv',2,null,null],P2:[300,600,250,6200,'gu',2,null,[300,1200,1800]],P3:[0,450,0,7800,'gv',2,['l',1600,2400],null],P4:[500,300,300,6800,'hip',2,null,null],P5:[300,500,0,7200,'gv',2,null,[0,1800,1200]],P6:[400,0,150,8000,'gv',2,['r',1800,3000],null],P7:[300,450,0,6400,'gu',1,null,[500,600,1600]],P8:[450,450,200,7600,'hip',2,null,null],P9:[0,600,0,7400,'gv',2,['l',1400,2200],null],NE:[900,300,100,7000,'gv',2,null,[600,300,1400]]};
  const S1_WOOD=[[300,300,150,7200,'hip',2,['l',1400,2400],null],[450,300,0,7600,'gv',2,null,[600,1500,1200]],[300,450,300,6800,'gv',2,null,null],[500,600,0,6200,'gu',2,null,[400,2400,1800]],[0,450,200,8200,'gv',2,null,null],[450,300,0,7000,'hip',2,['r',2000,2200],null],[300,0,0,7600,'gv',2,null,null],[450,450,300,6400,'gu',1,null,[500,500,1500]],[300,500,0,6600,'gv',2,['l',1800,2000],null],[300,300,100,7400,'hip',2,null,null]];
  const N2_WOOD=[[300,450,500,8200,'gv',2,null,null],[450,600,1000,7200,'hip',2,['l',2000,2400],null],[300,300,600,8000,'gv',2,null,null],null,[300,600,800,7800,'gv',2,null,null],[450,300,400,7400,'hip',2,['r',1800,2600],null],[300,300,900,7600,'gv',2,null,null],[600,3400,900,7600,'hip',2,null,[900,1800,1300]]];
  const S2_WOOD=[[500,450,1200,7600,'hip',2,['r',2200,2400],null],[300,450,900,6800,'gv',2,null,null],null,[300,300,1000,7000,'gv',2,null,null],[450,600,1400,6400,'gu',2,null,[600,1200,1500]],[600,450,800,6800,'hip',2,['l',2400,2200],null],[450,300,1200,7000,'gu',2,null,null]];
  M.B_NORTH=[2,5,7,8]; M.B_SOUTH=[2,4,6,8,10];
  const wood=(lot,sp)=>woodHouse(lot,sp[0],sp[1],sp[2],Math.min(sp[3],lot.depth-sp[2]-200),sp[4],sp[5],sp[6],sp[7]);
  const cache={};
  M.buildings=function(state){ if(cache[state]) return cache[state]; const out=[];
    Object.keys(N1_WOOD).forEach(nm=>{ const lot=L[nm]; if(nm[0]==='P'){ const i=+nm.slice(1); if(state==='C') return; if(state==='B'&&M.B_NORTH.indexOf(i)>=0){ const [a,b]=M.lot_x(i); out.push(fireBox(lot,a+M.B_SIDE_GAP,b-M.B_SIDE_GAP,S.SETBACK_LINE,M.BLDG_N)); return; } } out.push(wood(lot,N1_WOOD[nm])); });
    if(state==='C'){ const b={lot:null,kind:'fire',poly:[[M.X_P1,M.BLDG_S],[M.lot_x(M.N_LOTS)[1],M.BLDG_S],[M.lot_x(M.N_LOTS)[1],M.BLDG_N],[M.X_P1,M.BLDG_N]],floors:3,roof:[],annex:[],label:'joint'}; out.push(b); }
    S1_WOOD.forEach((sp,k)=>{ const lot=L['S1-'+(k+1)]; if(state==='B'&&M.B_SOUTH.indexOf(k+1)>=0){ const far=Math.max(-S.ALLEY_HALF-lot.depth+M.REAR_GAP,-(S.SETBACK_LINE+M.BLDG_N-M.BLDG_S)); out.push(fireBox(lot,lot.x0+M.B_SIDE_GAP,lot.x1-M.B_SIDE_GAP,far,-S.SETBACK_LINE)); return; } out.push(wood(lot,sp)); });
    N2_WOOD.forEach((sp,k)=>{ const lot=L['N2-'+(k+1)]; if(!sp) out.push(fireBox(lot,lot.x0+300,lot.x1-300,M.N1_REAR+2000,M.N2_FRONT-400,3)); else out.push(wood(lot,sp)); });
    S2_WOOD.forEach((sp,k)=>{ const lot=L['S2-'+(k+1)]; if(!sp){ const top=Math.min(...lot.poly.slice(2).map(p=>p[1])); out.push(fireBox(lot,lot.x0+400,lot.x1-400,M.S2_FRONT+700,top-1200,4)); } else out.push(wood(lot,sp)); });
    cache[state]=out; return out; };
  M.acrossBlocks=function(){ const out=[]; const xw=-M.ROAD_W.west, xe=M.BLOCK_W+M.ROAD_W.east; const BW=M.BLOCK_W;
    const y0=M.N2_FRONT+M.ROAD_W.north; [[-16000,-10200,xw],[0,6400,11800,18600,24000,31400,36800,43600,49200,BW],[xe,xe+5500,xe+12000]].forEach(xs=>{ for(let k=0;k<xs.length-1;k++){ const a=xs[k]+400, b=xs[k+1]-400; out.push(['N','wood',[[a,y0+600],[b,y0+600],[b,y0+9000],[a,y0+9000]]]); } });
    const y1=M.S2_FRONT-M.ROAD_W.south; [[-16000,-9800,xw],[0,7400,12800,21600,27000,33200,40600,45800,52000,BW],[xe,xe+6200,xe+12000]].forEach(xs=>{ for(let k=0;k<xs.length-1;k++){ const a=xs[k]+450, b=xs[k+1]-450; out.push(['S','wood',[[a,y1-700],[b,y1-700],[b,y1-9000],[a,y1-9000]]]); } });
    [[[M.S2_FRONT,-14500,-8800,-2600,2400,8600,14200,M.N2_FRONT],xw,-1],[[M.S2_FRONT,-15600,-9400,-3400,3000,9000,15800,M.N2_FRONT],xe,1]].forEach(([ys,xin,sgn])=>{ for(let k=0;k<ys.length-1;k++){ const a=ys[k]+350, b=ys[k+1]-350; const x0=xin+sgn*500, x1=xin+sgn*9000; out.push([sgn<0?'W':'E','wood',[[x0,a],[x0,b],[x1,b],[x1,a]]]); } });
    return out; };
  M.GARDEN_TREES=[[3300,11850,800],[16000,12000,900],[36500,12050,950],[43500,12000,900],[39600,12400,1000],[21900,-8800,900],[11500,-11400,1000],[50200,-11050,950],[3900,8950,800]].map(t=>[t[0],t[1]>0?t[1]+(M.N1_REAR-10350):t[1],t[2]]);
  M.STREET_TREES=[]; for(let x=3500;x<M.BLOCK_W;x+=8500) M.STREET_TREES.push([x,M.S2_FRONT-M.SIDEWALK/2,1700]);
  M.pots=function(){ const out=[]; S1_WOOD.forEach((sp,k)=>{ const lot=L['S1-'+(k+1)]; const [gl,gr,gf]=sp; if(gf>=250){ const n=lot.w-gl-gr>4500?3:2; for(let j=0;j<n;j++){ const u=gl+500+j*650; out.push([lot.x0+u,-S.ALLEY_HALF-gf/2,j%2?170:210]); } } }); return out; };
  M.cornerCuts=function(){ const leg=M.CORNER_CUT_BASE/Math.SQRT2; const out=[]; [[0,1],[M.BLOCK_W,-1]].forEach(([cx,sx])=>{ [1,-1].forEach(sy=>{ out.push([[cx,sy*S.SETBACK_LINE],[cx+sx*leg,sy*S.SETBACK_LINE],[cx,sy*(S.SETBACK_LINE+leg)]]); }); }); return out; };
  M.facadeRuns=function(state,side){ const segs=[]; M.buildings(state).forEach(b=>{ if(b.kind!=='fire') return; const bb=bbox(b.poly); if(side==='N'&&Math.abs(bb[1]-S.SETBACK_LINE)<1) segs.push([bb[0],bb[2]]); if(side==='S'&&Math.abs(bb[3]+S.SETBACK_LINE)<1) segs.push([bb[0],bb[2]]); });
    segs.sort((a,b)=>a[0]-b[0]); const runs=[]; segs.forEach(([a,b])=>{ if(runs.length&&a-runs[runs.length-1][1]<=2*M.B_SIDE_GAP+1) runs[runs.length-1]=[runs[runs.length-1][0],b]; else runs.push([a,b]); }); return runs; };
  M.longestRun=(state)=>{ const r=M.facadeRuns(state,'N').concat(M.facadeRuns(state,'S')); return r.length?Math.max(...r.map(([a,b])=>b-a)):0; };
  M.woodFrontageNorth=(state)=>M.BLOCK_W-M.facadeRuns(state,'N').reduce((s,[a,b])=>s+(b-a),0);
  M.rebuiltCount=(state)=>state==='A'?[0,0]:state==='B'?[M.B_NORTH.length,M.B_SOUTH.length]:[M.N_LOTS,0];
  return M;
}

/* ── 配置図と街区図で共通の描き方（drawcommon.py） ───────────────────────────── */
const STYLE={500:{road:0.25,alley:0.18,lot:0.13,wood_line:0.13,ridge:0.13,wood_fill:0.42,across_fill:0.22,setback:0.18,center:0.13,accent:0.70,party:0.18},
             200:{road:0.35,alley:0.25,lot:0.13,wood_line:0.13,ridge:0.13,wood_fill:0.30,across_fill:0.20,setback:0.25,center:0.13,accent:0.70,party:0.25}};
const pts=(v,P)=>P.map(p=>v.p(p[0],p[1]));
function roadEdges(doc,v,M,st){ const Wb=M.BLOCK_W, Ry=M.ROAD_W, big=80000; const H=M.ALLEY_HALF;
  doc.polyline(pts(v,[[0,H],[0,M.N2_FRONT],[Wb,M.N2_FRONT],[Wb,H]]),{w:st.road}); doc.polyline(pts(v,[[0,-H],[0,M.S2_FRONT],[Wb,M.S2_FRONT],[Wb,-H]]),{w:st.road});
  const xw=-Ry.west, xe=Wb+Ry.east, yn=M.N2_FRONT+Ry.north, ys=M.S2_FRONT-Ry.south;
  [[[xw,-big],[xw,ys]],[[xw,M.N2_FRONT],[xw,M.S2_FRONT]],[[xw,yn],[xw,big]],[[xe,-big],[xe,ys]],[[xe,M.N2_FRONT],[xe,M.S2_FRONT]],[[xe,yn],[xe,big]],
   [[-big,yn],[xw,yn]],[[0,yn],[Wb,yn]],[[xe,yn],[big,yn]],[[-big,ys],[xw,ys]],[[0,ys],[Wb,ys]],[[xe,ys],[big,ys]],
   [[-big,M.N2_FRONT],[xw,M.N2_FRONT]],[[xe,M.N2_FRONT],[big,M.N2_FRONT]],[[-big,M.S2_FRONT],[xw,M.S2_FRONT]],[[xe,M.S2_FRONT],[big,M.S2_FRONT]]].forEach(l=>doc.polyline(pts(v,l),{w:st.road}));
  [M.S2_FRONT-M.SIDEWALK, ys+M.SIDEWALK].forEach(yy=>doc.polyline(pts(v,[[-big,yy],[big,yy]]),{w:0.13})); }
function alley(doc,v,M,st,hatchId,x0,x1){ x0=x0||0; x1=x1==null?M.BLOCK_W:x1; if(hatchId){ [1,-1].forEach(sy=>{ const [a,b]=[sy*M.ALLEY_HALF,sy*M.SETBACK_LINE].sort((p,q)=>p-q); doc.fillpoly(pts(v,[[x0,a],[x1,a],[x1,b],[x0,b]]),'url(#'+hatchId+')'); }); }
  [1,-1].forEach(sy=>doc.line(v.p(x0,sy*M.ALLEY_HALF),v.p(x1,sy*M.ALLEY_HALF),{w:st.alley})); }
function alleyOverlay(doc,v,M,st,o){ o=o||{}; const x0=o.x0==null?-6000:o.x0, x1=o.x1==null?M.BLOCK_W+6000:o.x1; doc.line(v.p(x0,0),v.p(x1,0),{w:st.center,dash:'dashdot'});
  [1,-1].forEach(sy=>{ const skip=[]; if(o.state){ M.buildings(o.state).forEach(bl=>{ const bb=bbox(bl.poly); if(bl.kind==='fire'&&Math.abs((sy>0?bb[1]:-bb[3])-M.SETBACK_LINE)<1) skip.push([bb[0],bb[2]]); }); }
    skip.sort((a,b)=>a[0]-b[0]); let a=0; skip.concat([[M.BLOCK_W,M.BLOCK_W]]).forEach(([s0,s1])=>{ if(s0>a) doc.line(v.p(a,sy*M.SETBACK_LINE),v.p(s0,sy*M.SETBACK_LINE),{w:st.setback,dash:'dashed'}); a=Math.max(a,s1); }); });
  if(o.cuts!==false) M.cornerCuts().forEach(([apex,p1,p2])=>doc.line(v.p(...p1),v.p(...p2),{w:st.setback,dash:'dashed'})); }
function lotLines(doc,v,M,st){ const seen=new Set(); M.LOTS.forEach(lot=>{ const P=lot.poly; for(let i=0;i<P.length;i++){ const a=P[i], b=P[(i+1)%P.length]; const key=JSON.stringify([a.map(Math.round),b.map(Math.round)].sort()); if(seen.has(key)) continue; seen.add(key);
    if(a[1]===b[1]&&Math.abs(a[1])===M.ALLEY_HALF&&(lot.row==='N1'||lot.row==='S1')) continue; if(a[1]===b[1]&&(a[1]===M.N2_FRONT||a[1]===M.S2_FRONT)) continue; if(a[0]===b[0]&&(a[0]===0||a[0]===M.BLOCK_W)) continue;
    doc.line(v.p(...a),v.p(...b),{w:st.lot,color:GREY}); } }); }
function drawWood(doc,v,b,st){ [b.poly].concat(b.annex).forEach(P=>{ doc.fillpoly(pts(v,P),PAPER); doc.fillpoly(pts(v,P),GREY,st.wood_fill); }); b.annex.forEach(P=>doc.polyline(pts(v,P),{closed:true,w:st.wood_line}));
  doc.polyline(pts(v,b.poly),{closed:true,w:st.wood_line}); b.roof.forEach(([a,c])=>doc.line(v.p(...a),v.p(...c),{w:st.ridge})); }
function drawAcross(doc,v,M,st){ M.acrossBlocks().forEach(([side,kind,P])=>{ doc.fillpoly(pts(v,P),GREY,st.across_fill); doc.polyline(pts(v,P),{closed:true,w:0.13,color:GREY}); }); }
function accentRuns(doc,v,M,st,state){ M.buildings(state).forEach(bl=>{ if(bl.kind!=='fire') return; const bb=bbox(bl.poly); const hw=st.accent/2*v.s, gap=(st.accent+0.1)*v.s;
  [[1,Math.abs(bb[1]-M.SETBACK_LINE)<1],[-1,Math.abs(bb[3]+M.SETBACK_LINE)<1]].forEach(([sy,hit])=>{ if(!hit) return; const y=sy*(M.SETBACK_LINE+hw); doc.line(v.p(bb[0],y),v.p(bb[2],y),{w:st.accent,color:ACCENT}); const yw=sy*(M.SETBACK_LINE+gap); doc.line(v.p(bb[0],yw),v.p(bb[2],yw),{w:0.2,color:PAPER}); }); }); }
function labelSpot(b,wReal,hReal,margin,avoidY){ margin=margin||300; avoidY=avoidY||[]; let [x,y]=labelSpot0(b,wReal,hReal,margin); const bb=bbox(b.poly); const lo=bb[1]+hReal/2+150, hi=bb[3]-hReal/2-150;
  for(let k=0;k<12;k++){ const hit=avoidY.filter(a=>Math.abs(y-a)<hReal/2+250); if(!hit.length) break; const a=hit[0]; const y2=a+(hReal/2+300)*(y>=a?1:-1); y=(lo<=y2&&y2<=hi)?y2:a-(hReal/2+300)*(y>=a?1:-1); } return [x,y]; }
function labelSpot0(b,wReal,hReal,margin){ const [u0,u1,v0,v1]=b.main; const w=u1-u0, dd=v1-v0, um=(u0+u1)/2, vm=(v0+v1)/2, rt=b.roofType;
  if(rt==='gv'&&(um-u0)>=wReal+margin) return b.T((u0+um)/2,vm); if(rt==='gu'&&(vm-v0)>=hReal+margin) return b.T(um,(v0+vm)/2);
  if(rt==='hip'){ if(dd>=w&&(um-u0)>=wReal+margin) return b.T((u0+um)/2,vm); if(dd<w&&(vm-v0)>=hReal+margin) return b.T(um,(v0+vm)/2); } return b.T(um,vm); }

/* ══════════════════════════════════════════════════════════════════════════════
   配置図 1:200（siteplan.py）
   ══════════════════════════════════════════════════════════════════════════════ */
function sitePlan(m, opt){
  opt=opt||{}; const M=blockModel(m); const SCALE=200; const SHEET_W=Math.max(opt.width||420,(M.BLOCK_W+14000)/SCALE+2), SHEET_H=opt.title===false?185:206;
  const X_MIN=-7000, X_MAX=M.BLOCK_W+7000, Y_MIN=-14600, Y_MAX=M.N1_REAR+6050;
  const FRAME_X=(SHEET_W-(X_MAX-X_MIN)/SCALE)/2, FRAME_Y=13.0, FRAME_W=(X_MAX-X_MIN)/SCALE, FRAME_H=(Y_MAX-Y_MIN)/SCALE;
  const HATCH=700; const HATCH_Y=[M.BLDG_N-M.WALL-100-HATCH, M.BLDG_N-M.WALL-100];   // ルーフハッチ：階段の上・3 階の北端（判断）
  const PARAPET_TOP=M.PARAPET_TOP; const RECESS_1F=opt.recess||0; const ENTRY_X=M.entryX; const DRAIN_OFF=300, AC=[800,300], ENSHO=[3000,5000];
  const fig=opt.fig||1;
  const doc=new Doc(SHEET_W,SHEET_H,'配置図 1:200','路地の北側の 9 区画を 1 棟に建て替えた状態（提案）。中央の住戸 5 が平面図・断面図の住戸（架空の街区）。');
  const v=new View(SCALE,FRAME_X,FRAME_Y,X_MIN,Y_MAX); const st=STYLE[200];
  const unitInner=(i)=>{ const [xa,xb]=M.lot_x(i); return [xa+(i===1?M.WALL:M.WALL/2), xb-(i===M.N_LOTS?M.WALL:M.WALL/2), M.BLDG_S+M.WALL, M.BLDG_N-M.WALL]; };
  const hid=doc.hatchPattern(45,0.9,0.13); const cid=doc.clipRect(FRAME_X,FRAME_Y,FRAME_W,FRAME_H); doc.openG('clip-path="url(#'+cid+')"');
  drawAcross(doc,v,M,st); roadEdges(doc,v,M,st); alley(doc,v,M,st,hid); M.cornerCuts().forEach(([apex,p1,p2])=>doc.fillpoly(pts(v,[apex,p1,p2]),'url(#'+hid+')')); lotLines(doc,v,M,st);
  const blds=M.buildings('C');
  blds.forEach(b=>{ if(b.kind==='wood') drawWood(doc,v,b,st); else if(b.label!=='joint'){ doc.fillpoly(pts(v,b.poly),PAPER); doc.fillpoly(pts(v,b.poly),GREY); doc.polyline(pts(v,b.poly),{closed:true,w:0.18}); } });
  M.GARDEN_TREES.forEach(([x,y,r])=>treePlan(doc,v.p(x,y),r/SCALE,{seed:Math.round(x+y),fillOpacity:1}));
  M.pots().forEach(([x,y,r])=>shrub(doc,v.p(x,y),r/SCALE));
  // 屋根の伏せ
  { const xa=M.X_P1, xb=M.lot_x(M.N_LOTS)[1]; const outer=[[xa,M.BLDG_S],[xb,M.BLDG_S],[xb,M.BLDG_N],[xa,M.BLDG_N]]; doc.fillpoly(pts(v,outer),PAPER);
    let d='M'+pts(v,outer).map(p=>f(p[0])+' '+f(p[1])).join(' L')+' Z'; for(let i=1;i<=M.N_LOTS;i++){ const [ix0,ix1,iy0,iy1]=unitInner(i); d+=' M'+pts(v,[[ix0,iy0],[ix1,iy0],[ix1,iy1],[ix0,iy1]]).map(p=>f(p[0])+' '+f(p[1])).join(' L')+' Z'; }
    doc.path(d,'fill="'+INK+'" fill-rule="evenodd" stroke="none"');
    doc.fillpoly(pts(v,[[xa,M.BLDG_S],[xb,M.BLDG_S],[xb,M.BLDG_S+M.WALL],[xa,M.BLDG_S+M.WALL]]),ACCENT);
    for(let i=1;i<=M.N_LOTS;i++){ const [ix0,ix1,iy0,iy1]=unitInner(i); const hx1=ix1-50, hx0=hx1-HATCH;
      doc.polyline(pts(v,[[hx0,HATCH_Y[0]],[hx1,HATCH_Y[0]],[hx1,HATCH_Y[1]],[hx0,HATCH_Y[1]]]),{closed:true,w:'thin'});
      doc.polyline(pts(v,[[hx0+90,HATCH_Y[0]+90],[hx1-90,HATCH_Y[0]+90],[hx1-90,HATCH_Y[1]-90],[hx0+90,HATCH_Y[1]-90]]),{closed:true,w:'fine'});
      const c=v.p(ix1-DRAIN_OFF,iy0+DRAIN_OFF); doc.circle(c,0.55,{w:'fine'}); doc.circle(c,0.18,{fill:INK});
      const xs=ix0+(ix1-ix0)*0.42; let a=v.p(xs,iy1-1200), b=v.p(xs,iy0+DRAIN_OFF+(6000-2300)); doc.line(a,b,{w:'fine'}); arrowOpen(doc,b,Math.PI/2,1.1,0.13);
      a=v.p(ix0+(i===M.SUBJECT?2000:700),iy0+DRAIN_OFF); b=v.p(ix1-DRAIN_OFF-330,iy0+DRAIN_OFF); doc.line(a,b,{w:'fine'}); arrowOpen(doc,b,0,1.1,0.13);
      for(let k=0;k<2;k++){ const x0=ix0+350+k*(AC[0]+250), y1=iy1-80; doc.polyline(pts(v,[[x0,y1-AC[1]],[x0+AC[0],y1-AC[1]],[x0+AC[0],y1],[x0,y1]]),{closed:true,w:'fine'}); doc.circle(v.p(x0+AC[0]*0.38,y1-AC[1]/2),AC[1]*0.36/SCALE,{w:'fine'}); }
      doc.text(v.p((ix0+ix1)/2+1100,M.BLDG_S+2300),i===M.SUBJECT?'住戸 '+i:String(i),{size:T_NAME,anchor:'middle',baseline:'central',weight:i===M.SUBJECT?'bold':null}); }
    if(RECESS_1F){ const y1f=M.BLDG_S+RECESS_1F; for(let i=1;i<=M.N_LOTS;i++){ const [ix0,ix1]=unitInner(i); doc.line(v.p(ix0,y1f),v.p(ix1,y1f),{w:'thin',dash:'dashed'}); } }
    for(let i=1;i<=M.N_LOTS;i++){ const x=M.lot_x(i)[0]+ENTRY_X; const tip=v.p(x,M.BLDG_S-80); doc.polyline([[tip[0],tip[1]],[tip[0]-0.85,tip[1]+1.35],[tip[0]+0.85,tip[1]+1.35]],{closed:true,w:0.18,fill:PAPER}); } }
  alleyOverlay(doc,v,M,st,{x0:-1200,x1:M.BLOCK_W+1200,state:'C'});
  ENSHO.forEach(yy=>doc.line(v.p(0,yy),v.p(M.BLOCK_W+600,yy),{w:'thin',dash:'dashdot2'}));
  { const xa=M.X_P1, xb=M.lot_x(M.N_LOTS)[1]; doc.polyline(pts(v,[[xa,M.ALLEY_HALF],[xb,M.ALLEY_HALF],[xb,M.N1_REAR],[xa,M.N1_REAR]]),{closed:true,w:'med',dash:'dashdot'}); }
  [9800,33600,50800].forEach(x=>{ doc.circle(v.p(x,0),300/SCALE,{w:'fine'}); doc.circle(v.p(x,0),220/SCALE,{w:'fine'}); });
  [[13900,-M.ALLEY_HALF-200],[45000,-M.ALLEY_HALF-220]].forEach(([x,y])=>{ doc.circle(v.p(x,y),160/SCALE,{fill:PAPER,w:'thin'}); doc.circle(v.p(x,y),0.15,{fill:INK}); });
  // 寸法と直接のラベル
  const dims={}; const xsLots=[0,M.X_P1].concat(Array.from({length:M.N_LOTS},(_,i)=>M.lot_x(i+1)[1]),[M.BLOCK_W]);
  dims.lots=dimH(doc,v,xsLots,520,{extFrom:M.ALLEY_HALF,side:1});
  dims.run=dimH(doc,v,[M.X_P1,M.lot_x(M.N_LOTS)[1]],-520,{side:-1,labels:[fmtN(M.lot_x(M.N_LOTS)[1]-M.X_P1)+'（9 区画）']});
  dims.alley1=dimV(doc,v,[-M.SETBACK_LINE,-M.ALLEY_HALF,0,M.ALLEY_HALF,M.SETBACK_LINE],-800,{extFrom:0,side:-1});
  dims.alley2=dimV(doc,v,[-M.ALLEY_HALF,M.ALLEY_HALF],-1950,{extFrom:0,side:-1,labels:[fmtN(M.ALLEY_W)+'（現況）']});
  dims.alley3=dimV(doc,v,[-M.SETBACK_LINE,M.SETBACK_LINE],-3100,{extFrom:0,side:-1,labels:[fmtN(2*M.SETBACK_LINE)+'（後退後）']});
  dims.depth1=dimV(doc,v,[M.ALLEY_HALF,M.SETBACK_LINE,M.BLDG_N,M.N1_REAR],M.X_P1-450,{extFrom:M.X_P1,side:-1,halo:0.6,smallOut:[null,null,[-3.2,-1.6]]});
  dims.depth2=dimV(doc,v,[M.ALLEY_HALF,M.N1_REAR],M.lot_x(M.N_LOTS)[1]+450,{side:1,halo:0.6});
  const T=(x,y,s,o)=>doc.text(v.p(x,y),s,o||{});
  T(-2000,9800,'道路',{anchor:'middle',size:T_NAME}); T(-2000,8500,'幅員 '+fmtN(M.ROAD_W.west),{anchor:'middle'}); T(M.BLOCK_W+2000,11800,'道路',{anchor:'middle',size:T_NAME}); T(M.BLOCK_W+2000,10500,'幅員 '+fmtN(M.ROAD_W.east),{anchor:'middle'});
  T(M.BLOCK_W+1500,0,'道路中心線',{baseline:'central'}); T(M.BLOCK_W+900,ENSHO[0],'1 階 3 m',{baseline:'central'}); T(M.BLOCK_W+900,ENSHO[1],'2 階以上 5 m',{baseline:'central'}); T(M.BLOCK_W+900,ENSHO[1]+2600,'延焼ライン',{baseline:'central'}); T(M.BLOCK_W+900,ENSHO[1]+1500,'（中心線から）',{baseline:'central'});
  T(400,-620,'路地（2 項道路）',{size:T_NAME,baseline:'central'});
  { let tip=v.p(330,M.SETBACK_LINE+380), lab=v.p(-2000,5200); doc.text(lab,'隅切り',{anchor:'middle'}); doc.text([lab[0],lab[1]+2.6],'底辺 '+fmtN(M.CORNER_CUT_BASE),{anchor:'middle'}); doc.line([lab[0]+1.5,lab[1]+3.4],tip,{w:'fine'}); doc.circle(tip,0.25,{fill:INK});
    tip=v.p(55300,-M.SETBACK_LINE); lab=v.p(55300,-900); doc.text(lab,'後退線',{anchor:'middle',baseline:'central'}); doc.line([tip[0],lab[1]+1.2],tip,{w:'fine'});
    tip=v.p(M.lot_x(1)[0]+2600,M.N1_REAR); lab=v.p(M.lot_x(1)[0]+2600,M.N1_REAR+2250); doc.text(lab,'敷地境界線',{anchor:'middle',halo:0.6}); doc.line([tip[0],lab[1]+0.8],tip,{w:'fine'}); }
  { const [ix0,ix1,iy0,iy1]=unitInner(M.SUBJECT); const xs=ix0+(ix1-ix0)*0.42; T(xs+250,iy0+(7600-2300),'1/50',{baseline:'central'}); T(ix1-50-HATCH-200,(HATCH_Y[0]+HATCH_Y[1])/2,'ハッチ',{anchor:'end',baseline:'central'}); T(ix0+350+1050,iy1-900,'室外機',{anchor:'middle',baseline:'central'}); T(ix0+300,iy0+DRAIN_OFF,'ドレン',{baseline:'central'});
    if(RECESS_1F) T(ix0+250,M.BLDG_S+RECESS_1F+330,'1 階の外壁面',{baseline:'central'}); }
  T(M.lot_x(M.SUBJECT)[0]+ENTRY_X+450,M.ALLEY_HALF+330,'出入口',{baseline:'central',halo:0.8}); T(M.lot_x(7)[0]+ENTRY_X+450,M.ALLEY_HALF+330,'道路とみなす部分',{baseline:'central',halo:0.8});
  const hc=tint(st.wood_fill);
  const labAt=(name,s,at)=>{ const b=blds.find(b=>b.lot&&b.lot.name===name); if(!b) return; let [x,y]=at||labelSpot(b,textWidth(s,T_NOTE)*SCALE,T_NOTE*SCALE,300,ENSHO.concat([M.SETBACK_LINE,-M.SETBACK_LINE])); y=Math.min(Math.max(y,Y_MIN+1600),Y_MAX-1800); T(x,y,s,{anchor:'middle',baseline:'central',halo:1.4,haloColor:hc}); };
  const labFire=(name,s)=>{ const b=blds.find(b=>b.lot&&b.lot.name===name); if(!b) return; const bb=bbox(b.poly); const y=Math.min(Math.max((bb[1]+bb[3])/2,Y_MIN+1600,bb[1]+1200),Y_MAX-1800,bb[3]-1200); T((bb[0]+bb[2])/2,y,s,{anchor:'middle',baseline:'central',color:PAPER}); };
  labAt('NW','木造 2 階',[2200,4430]); labAt('NE','木造 2 階',[M.BLOCK_W-1900,4000]); ['S1-2','S1-6','N2-3','N2-7','S2-6'].forEach(nm=>labAt(nm,'木造 2 階')); labAt('S1-8','木造 1 階'); labFire('N2-4','RC 3 階'); labFire('S2-3','RC 4 階');
  doc.closeG();
  if(opt.title!==false){
    const cy=FRAME_Y+FRAME_H+10.0; doc.text([FRAME_X,cy],'図'+fig,{size:T_TITLE,weight:'bold'}); doc.text([FRAME_X+9.0,cy],'配置図（1:200）',{size:T_TITLE});
    const lines=['路地の北側の 9 区画を 1 棟（9 戸）に建て替えた状態（提案）を示す。中央の住戸 '+M.SUBJECT+' が平面図・断面図の住戸である。',
      '赤は路地に面する耐火の外壁（長さ '+fmt((M.lot_x(M.N_LOTS)[1]-M.X_P1)/1000,1)+' m、パラペットの天端 GL+'+fmtN(PARAPET_TOP)+'）。路地は幅員 '+fmt(M.ALLEY_W/1000,1)+' m の 2 項道路で、中心線から '+fmt(M.SETBACK_LINE/1000,1)+' m の後退線までを道路とみなす（斜線。隅切りを含む）。',
      '二点鎖線は延焼のおそれのある部分の線（道路中心線から 1 階 3 m・2 階以上 5 m）'+(RECESS_1F?'、破線は 1 階の外壁面':'')+'。灰は木造、濃い灰は既存の RC。上が北。筆者作成（街区は架空）。'];
    lines.forEach((s,i)=>doc.text([FRAME_X,cy+6.0+i*4.4],s,{size:T_NAME}));
    scaleBar(doc,[FRAME_X+FRAME_W-50-16,cy+3.0],SCALE,[0,1,2,3,4,5,10]); northArrow(doc,[FRAME_X+FRAME_W-3.0,cy+5.0],13.0);
  } else { scaleBar(doc,[FRAME_X+FRAME_W-50-16,FRAME_Y+FRAME_H+3.0],SCALE,[0,1,2,3,4,5,10]); northArrow(doc,[FRAME_X+FRAME_W-3.0,FRAME_Y+FRAME_H+5.0],13.0); }
  doc.dims=dims; return doc;
}

/* ══════════════════════════════════════════════════════════════════════════════
   街区図 1:500（block.py）：A 現況・B 個別の建替え・C 共同の建替え
   ══════════════════════════════════════════════════════════════════════════════ */
function blockPlan(m, opt){
  opt=opt||{}; const M=blockModel(m); const SCALE=500; const SHEET_W=Math.max(opt.width||420,300), SHEET_H=opt.title===false?168:192; const MARGIN=14.0, GAP=8.0; const PANEL_W=(SHEET_W-2*MARGIN-2*GAP)/3;
  const Y_TOP=M.N2_FRONT+M.ROAD_W.north+1500, Y_BOT=M.S2_FRONT-M.ROAD_W.south-1500; const PANEL_H=(Y_TOP-Y_BOT)/SCALE; const PANEL_Y=19.0; const X_C=M.BLOCK_W/2;
  const PATHS_C=[[800,8600],[M.BLOCK_W-550,M.BLOCK_W-7900]]; const STATES=[['A','現況'],['B','個別の建替え（9 棟）'],['C','共同の建替え（9 区画）・提案']]; const fig=opt.fig||2;
  const doc=new Doc(SHEET_W,SHEET_H,'街区図 1:500','路地沿いの 9 区画が建て替わるときの耐火の外壁の連続を、同じ街区・同じ縮尺・同じ向きで 3 つ並べる（架空の街区）。');
  const panelView=(k)=>new View(SCALE,MARGIN+k*(PANEL_W+GAP),PANEL_Y,X_C-PANEL_W*SCALE/2,Y_TOP);
  const arrow=(tip,ang)=>arrowOpen(doc,tip,ang,1.1,0.25);
  const fireArrow=(v,x)=>{ const a=v.p(x,-M.ALLEY_HALF-900), b=v.p(x,M.ALLEY_HALF+1300); doc.line(a,[b[0],b[1]+0.25],{w:0.25,dash:'dotted',cap:'round'}); arrow(b,-Math.PI/2); };
  const firePath=(v,P)=>{ const [[x0,y0],[x1,y1],[x2,y2]]=P.map(p=>v.p(...p)); const d='M'+f(x0)+' '+f(y0)+' L'+f(x1)+' '+f(y1+4)+' Q'+f(x1)+' '+f(y1)+' '+f(x1+(x2>x1?4:-4))+' '+f(y1)+' L'+f(x2)+' '+f(y2); doc.path(d,Doc.stroke({w:0.25,dash:'dotted',cap:'round'})); arrow([x2,y2],x2>x1?0:Math.PI); };
  const woodAt=(state,x,side)=>!M.facadeRuns(state,side).some(([a,b])=>a-300<=x&&x<=b+300);
  const crossingXs=(state)=>{ const runs=M.facadeRuns(state,'N'); const gaps=[]; let x=0; runs.forEach(([a,b])=>{ if(a-x>2500) gaps.push([x,a]); x=b; }); if(M.BLOCK_W-x>2500) gaps.push([x,M.BLOCK_W]);
    const out=[]; gaps.forEach(([a,b])=>{ const n=(b-a)<14000?1:Math.max(2,Math.round((b-a)/14000)); for(let j=0;j<n;j++){ const c=a+(b-a)*(j+0.5)/n; for(const dx of [0,900,-900,1800,-1800,2700,-2700]){ if(a+700<c+dx&&c+dx<b-700&&woodAt(state,c+dx,'S')){ out.push(c+dx); break; } } } }); return out; };
  function labels(v,state){ const ynRoad=M.N2_FRONT+M.ROAD_W.north/2, ysRoad=M.S2_FRONT-M.ROAD_W.south/2; const T=(x,y,s,o)=>doc.text(v.p(x,y),s,Object.assign({anchor:'middle',baseline:'central'},o||{}));
    if(state==='A'){ T(29000,ynRoad-400,'道路　幅員 '+fmt(M.ROAD_W.north/1000,1)+' m'); T(29000,ysRoad,'道路　幅員 '+fmt(M.ROAD_W.south/1000,1)+' m');
      const xs=[0].concat(crossingXs('A'),[M.BLOCK_W]); let best=[0,0]; for(let i=0;i<xs.length-1;i++) if(xs[i+1]-xs[i]>best[1]-best[0]) best=[xs[i],xs[i+1]]; T((best[0]+best[1])/2,-650,'路地 '+fmt(M.ALLEY_W/1000,1)+' m（2 項道路）',{halo:0.5});
      const b=M.buildings('A').find(b=>b.lot&&b.lot.name==='S1-5'); const cx=b.poly.reduce((s,p)=>s+p[0],0)/b.poly.length; T(cx,-6200,'木造',{halo:0.5}); T(20500,-16200,'耐火',{color:PAPER});
      const yb=M.N1_REAR+450; const p0=v.p(M.X_P1,yb), p1=v.p(M.lot_x(M.N_LOTS)[1],yb), q0=v.p(M.X_P1,M.N1_REAR+60), q1=v.p(M.lot_x(M.N_LOTS)[1],M.N1_REAR+60); doc.polyline([q0,p0,p1,q1],{w:0.18});
      T((M.X_P1+M.lot_x(M.N_LOTS)[1])/2,yb+900,'対象の 9 区画（間口 '+fmt(M.LOT_W/1000,1)+' m × 9）',{halo:0.6}); }
    if(state==='B'){ const lab=v.p(13400,-700), tip=v.p(13400,-M.SETBACK_LINE); doc.text(lab,'後退線（中心から '+fmt(M.SETBACK_LINE/1000,1)+' m）',{anchor:'middle',baseline:'central',halo:0.6}); doc.line([tip[0],lab[1]+1.15],[tip[0],tip[1]-0.15],{w:0.13});
      const runs=M.facadeRuns('B','N'); const r=runs.reduce((p,q)=>(q[1]-q[0])>(p[1]-p[0])?q:p); T((r[0]+r[1])/2,760,'最長 '+fmt((r[1]-r[0])/1000,1)+' m',{weight:'bold',halo:0.6}); }
    if(state==='C'){ const r=M.facadeRuns('C','N')[0]; T((r[0]+r[1])/2,760,'耐火の外壁 '+fmt((r[1]-r[0])/1000,1)+' m',{weight:'bold',halo:0.6}); T((M.X_P1+M.lot_x(M.N_LOTS)[1])/2,4300,'1 棟・9 戸',{color:PAPER}); T(3000,5200,'木造',{halo:0.5}); T(M.BLOCK_W-1900,5600,'木造',{halo:0.5}); } }
  function panel(k,state,title){ const v=panelView(k); const st=STYLE[500]; const px=v.ox, py=PANEL_Y; const cid=doc.clipRect(px,py,PANEL_W,PANEL_H); doc.openG('clip-path="url(#'+cid+')"');
    drawAcross(doc,v,M,st); roadEdges(doc,v,M,st); M.STREET_TREES.forEach(([x,y,r])=>treePlan(doc,v.p(x,y),r/SCALE,{seed:Math.round(x),trunk:true})); alley(doc,v,M,st); lotLines(doc,v,M,st);
    const blds=M.buildings(state); blds.forEach(b=>{ if(b.kind==='wood') drawWood(doc,v,b,st); }); M.GARDEN_TREES.forEach(([x,y,r])=>treePlan(doc,v.p(x,y),r/SCALE,{seed:Math.round(x+y),fillOpacity:1}));
    blds.forEach(b=>{ if(b.kind==='fire') doc.fillpoly(pts(v,b.poly),INK); });
    if(state==='C') for(let i=1;i<M.N_LOTS;i++){ const xx=M.lot_x(i)[1]; doc.line(v.p(xx,M.BLDG_S),v.p(xx,M.BLDG_N),{w:st.party,color:PAPER}); }
    alleyOverlay(doc,v,M,st,{state}); accentRuns(doc,v,M,st,state);
    if(state==='C') PATHS_C.forEach(([x0,x1])=>firePath(v,[[x0,-5200],[x0,M.N1_REAR+3250],[x1,M.N1_REAR+3250]])); else crossingXs(state).forEach(x=>fireArrow(v,x));
    for(let i=1;i<=M.N_LOTS;i++){ const [a,b]=M.lot_x(i); const rebuilt=state==='C'||(state==='B'&&M.B_NORTH.indexOf(i)>=0); doc.text(v.p((a+b)/2,6600),String(i),{size:T_NOTE,anchor:'middle',color:rebuilt?PAPER:INK,halo:rebuilt?false:0.5,check:false}); }
    labels(v,state); doc.closeG(); doc.polyline([[px,py],[px+PANEL_W,py],[px+PANEL_W,py+PANEL_H],[px,py+PANEL_H]],{closed:true,w:0.18}); doc.text([px,py-2.2],state,{size:T_NAME,weight:'bold'}); doc.text([px+4.2,py-2.2],title,{size:T_NAME}); }
  STATES.forEach(([s,t],k)=>panel(k,s,t));
  function table(y0){ const rc=M.rebuiltCount('B'); const rows=[['建て替え',['なし',(rc[0]+rc[1])+' 棟（北 '+rc[0]+'・南 '+rc[1]+'）',M.rebuiltCount('C')[0]+' 区画を 1 棟に']],
      ['路地沿いに続く耐火の外壁（最長）',['A','B','C'].map(s=>M.longestRun(s)?fmt(M.longestRun(s)/1000,1)+' m':'0 m')],['路地の北側で木造が路地に面する間口',['A','B','C'].map(s=>fmt(M.woodFrontageNorth(s)/1000,1)+' m')]];
    const rh=6.2, xl=MARGIN, xr=SHEET_W-MARGIN; doc.line([xl,y0],[xr,y0],{w:0.25});
    rows.forEach(([head,vals],j)=>{ const yb=y0+rh*(j+1)-2.0; doc.text([xl,yb],head,{size:T_NOTE}); vals.forEach((val,k)=>{ const xr2=MARGIN+k*(PANEL_W+GAP)+PANEL_W; doc.text([xr2,yb],val,{size:T_NOTE,anchor:'end',weight:j===1?'bold':null}); }); if(j<rows.length-1) doc.line([xl,y0+rh*(j+1)],[xr,y0+rh*(j+1)],{w:0.13}); });
    doc.line([xl,y0+rh*rows.length],[xr,y0+rh*rows.length],{w:0.25}); return y0+rh*rows.length; }
  const yb=table(PANEL_Y+PANEL_H+6.0);
  if(opt.title!==false){ const capY=yb+8.5; doc.text([MARGIN,capY],'図'+fig,{size:T_TITLE,weight:'bold'}); doc.text([MARGIN+9.0,capY],'同じ街区の 3 つの状態（街区図 1:500）',{size:T_TITLE});
    ['黒は耐火の建物、灰は木造の建物、赤は路地に面する耐火の外壁。点線の矢印は、南から火が来たときに路地を越えうる位置の例。','B の建替えの位置は一例で、すき間 0.5 m をはさんで並ぶ 2 棟は連続とみなした。C の白い線は界壁で、両端の区画には木造が残る。','3 図とも上が北。筆者作成（街区は架空）。'].forEach((s,i)=>doc.text([MARGIN,capY+6.0+i*4.4],s,{size:T_NAME}));
    scaleBar(doc,[SHEET_W-MARGIN-60-6,capY+5.0],SCALE,[0,5,10,20,30]); northArrow(doc,[SHEET_W-MARGIN-1.5,capY+6.0],12.0); }
  else { scaleBar(doc,[SHEET_W-MARGIN-60-6,yb+4.0],SCALE,[0,5,10,20,30]); northArrow(doc,[SHEET_W-MARGIN-1.5,yb+5.0],12.0); }
  return doc;
}

/* opt.width：紙の幅（mm。版面に合わせる。配置図は街区が入る最小の幅まで）。opt.paper:false：白い紙の矩形を描かず図題も省く（シートに置くとき） */
function out(doc,opt){ if(opt.paper===false) doc.paper=false; return doc.toSvg(); }
MINE.site=function(m,opt){ opt=Object.assign({},opt||{}); if(opt.paper===false&&opt.title==null) opt.title=false; if(opt.kind==='block'||opt.scale===500) return out(blockPlan(m,opt),opt); return out(sitePlan(m,opt),opt); };
MINE.block=function(m,opt){ opt=Object.assign({},opt||{}); if(opt.paper===false&&opt.title==null) opt.title=false; return out(blockPlan(m,opt),opt); };
A.site={ blockModel, readSpec, sitePlanDoc:sitePlan, blockPlanDoc:blockPlan, Doc, View, textWidth };
install(A.views);
/* ── ダイアグラム（views.diagram）は同じファイルの続き（第 2 部）で定義する ── */
window.__gnotoArchSitePart1={A,MINE,install,Doc,View,INK,GREY,ACCENT,PAPER,T_S,T_M,T_NOTE,T_NAME,T_TITLE,W,DASH,f,esc,fmt,fmtN,textWidth,tint,rect,bbox,polyArea,blockModel,readSpec,dist,dimH,dimV,northArrow,scaleBar,arrowOpen,treePlan,tick};
})();

/* ══════════════════════════════════════════════════════════════════════════════
   第 2 部：ダイアグラム（tools/archdraw/diagram の移植）。4 枚は同じ枠・同じ縮尺・同じ下図で主題の層だけを替える。
   下図は灰、主題は黒、赤は「路地沿いの耐火の外壁」だけ。線：主題 0.50／補助 0.18／下図 0.13。文字は 2 段（2.0・2.8）。
   ══════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const P1=window.__gnotoArchSitePart1; if(!P1) return; delete window.__gnotoArchSitePart1;
const {A,MINE,install,Doc,INK,PAPER,T_S,T_M,f,fmt,textWidth,rect,bbox,polyArea,blockModel,readSpec}=P1;
const GRAY='#8C9493', RED='#943522', WHITE=PAPER;
const W_THEME=0.50, W_THIN=0.18, W_FINE=0.13, W_FIRE=0.50;
const CHAIN='2.4 0.6 0.3 0.6', CHAIN2='2.4 0.5 0.3 0.5 0.3 0.5', HIDDEN='1.2 0.6', DASH='2 1', DOT='0 1.05';
const ARROW_L=1.8, ARROW_A=22*Math.PI/180;
const SHEET_W=420, SHEET_H=297, ML=15.0;
const deg1=(x)=>fmt(x,1);

/* svgw.py と同じ呼び方の薄い包み（移植を Python に近く保つため） */
class SVG{
  constructor(doc){ this.d=doc; }
  line(x1,y1,x2,y2,stroke,w,dash,cap){ this.d.line([x1,y1],[x2,y2],{color:stroke||INK,w:w==null?W_THIN:w,dash:dash||null,cap:cap||'butt'}); }
  poly(pts,closed,o){ o=o||{}; const st=o.stroke===null?null:(o.stroke||INK); let attrs='fill="'+(o.fill||'none')+'"'+(st?' stroke="'+st+'" stroke-width="'+f(o.w==null?W_THIN:o.w)+'"'+(o.dash?' stroke-dasharray="'+o.dash+'"':'')+(o.cap&&o.cap!=='butt'?' stroke-linecap="'+o.cap+'"':'')+(o.join&&o.join!=='miter'?' stroke-linejoin="'+o.join+'"':''):' stroke="none"');
    this.d.add('<'+(closed?'polygon':'polyline')+' points="'+pts.map(p=>f(p[0])+','+f(p[1])).join(' ')+'" '+attrs+'/>'); }
  circle(cx,cy,r,o){ o=o||{}; const st=o.stroke===null?null:(o.stroke||INK); this.d.add('<circle cx="'+f(cx)+'" cy="'+f(cy)+'" r="'+f(r)+'" fill="'+(o.fill||'none')+'"'+(st?' stroke="'+st+'" stroke-width="'+f(o.w==null?W_THIN:o.w)+'"':' stroke="none"')+'/>'); }
  ellipse(cx,cy,rx,ry,o){ o=o||{}; this.d.add('<ellipse cx="'+f(cx)+'" cy="'+f(cy)+'" rx="'+f(rx)+'" ry="'+f(ry)+'" fill="'+(o.fill||'none')+'" stroke="'+(o.stroke||INK)+'" stroke-width="'+f(o.w==null?W_FINE:o.w)+'"/>'); }
  path(d,o){ o=o||{}; this.d.add('<path d="'+d+'" fill="'+(o.fill||'none')+'" stroke="'+(o.stroke||INK)+'" stroke-width="'+f(o.w==null?W_THIN:o.w)+'"'+(o.dash?' stroke-dasharray="'+o.dash+'"':'')+(o.cap&&o.cap!=='butt'?' stroke-linecap="'+o.cap+'"':'')+'/>'); }
  text(x,y,s,size,o){ o=o||{}; this.d.dtext(x,y,s,{size:size||T_S,weight:o.weight||400,anchor:o.anchor||'start',color:o.fill||INK,halo:!!o.halo}); }
  runs(x,y,parts,size,o){ o=o||{}; this.d.runs(x,y,parts,{size:size||T_S,anchor:o.anchor||'start',halo:!!o.halo}); }
  clipBegin(pts){ return this.d.clipBegin(pts); } clipRectBegin(x0,y0,x1,y1){ return this.d.clipBegin([[x0,y0],[x1,y0],[x1,y1],[x0,y1]]); } groupEnd(){ this.d.closeG(); }
  hatch(pts,spacing,angle,stroke,w){ this.d.hatch(pts,spacing,angle,stroke||INK,w||W_FINE); }
  stipple(pts,spacing,r){ this.d.stipple(pts,spacing,r,INK); }
}
function arrowhead(svg,x,y,ang,stroke,w,length){ length=length||ARROW_L; const p1=[x-length*Math.cos(ang-ARROW_A),y-length*Math.sin(ang-ARROW_A)], p2=[x-length*Math.cos(ang+ARROW_A),y-length*Math.sin(ang+ARROW_A)]; svg.poly([p1,[x,y],p2],false,{stroke:stroke||INK,w:w==null?W_THEME:w,join:'miter'}); }
function stopbar(svg,x,y,ang,stroke,w,half){ half=half||1.2; const nx=-Math.sin(ang), ny=Math.cos(ang); svg.line(x-nx*half,y-ny*half,x+nx*half,y+ny*half,stroke||INK,w==null?W_THEME:w); }
function polylineArrow(svg,pts,stroke,w,o){ o=o||{}; stroke=stroke||INK; w=w==null?W_THEME:w; svg.poly(pts,false,{stroke,w,dash:o.dash||null,cap:o.cap||'butt',join:'miter'});
  if(o.head!==false){ const [xa,ya]=pts[pts.length-2], [xb,yb]=pts[pts.length-1]; arrowhead(svg,xb,yb,Math.atan2(yb-ya,xb-xa),stroke,w); } if(o.startDot) svg.circle(pts[0][0],pts[0][1],0.55,{stroke:null,fill:stroke}); }

/* ── 建物モデル → ダイアグラムの幾何（diagram/model.py の形）。y は路地の北側の境界を 0 にずらす ── */
const ZONE_BY_ID={DOMA:'pub',LDK:'com',B1:'pri',B2:'pri',BATH:'pri',SAN:'pri',CLO:'pri',WC:'srv',HALL:'srv',ST:null};
const ZONE_BY_NAME=[[/土間|店|作業/,'pub'],[/居間|食堂|台所|LDK|リビング|ダイニング/,'com'],[/寝室|浴室|洗面|物入|書斎|和室|子供/,'pri'],[/便所|WC|トイレ|廊下|ホール|玄関/,'srv'],[/階段/,null]];
function zoneOf(r){ const suf=String(r.id||'').split('-').slice(1).join('-'); if(ZONE_BY_ID.hasOwnProperty(suf)) return ZONE_BY_ID[suf]; for(const [re,z] of ZONE_BY_NAME) if(re.test(r.name||'')) return z; return 'srv'; }
function wallRectOf(w){ const h=(w.t||100)/2; if(Math.abs(w.a[1]-w.b[1])<1e-6) return [Math.min(w.a[0],w.b[0]),w.a[1]-h,Math.max(w.a[0],w.b[0]),w.a[1]+h]; if(Math.abs(w.a[0]-w.b[0])<1e-6) return [w.a[0]-h,Math.min(w.a[1],w.b[1]),w.a[0]+h,Math.max(w.a[1],w.b[1])]; return null; }
function diagModel(m, opt){
  opt=opt||{}; const S=readSpec(m); const D={};
  D.ALLEY_W=S.ALLEY_W; D.SETBACK=S.SETBACK; D.LOT_W=S.LOT_W; D.LOT_D=S.LOT_D; D.T_EXT=S.WALL; D.T_PART=100;
  const gx0=S.GRID_X[0]; D.X=S.GRID_X.map(x=>x-gx0); const dy=S.SETBACK+S.WALL/2-S.GRID_Y[0]; D.Y=S.GRID_Y.map(y=>y+dy); D.PLAN_DY=dy;
  const lv=S.levels; D.GL=0; D.FL=lv.map(l=>l.fl); D.H=lv.map(l=>l.height||2800); D.FL1=D.FL[0]; D.FL2=D.FL[1]!=null?D.FL[1]:D.FL1+D.H[0]; D.FL3=D.FL[2]!=null?D.FL[2]:D.FL2+D.H[1]; D.H1=D.H[0]; D.H2=D.H[1]||2800; D.H3=D.H[2]||2700;
  D.RFL=S.RFL; D.TOP=S.PARAPET_TOP; D.PARAPET=D.TOP-D.RFL; D.UNITS=9;
  D.ALLEY_C=-D.ALLEY_W/2; D.WALL_S0=D.SETBACK; D.WALL_S1=D.SETBACK+D.T_EXT; D.WALL_N0=D.Y[D.Y.length-1]-D.T_EXT/2; D.WALL_N1=D.Y[D.Y.length-1]+D.T_EXT/2; D.IN_W0=D.X[0]+D.T_EXT/2; D.IN_W1=D.X[D.X.length-1]-D.T_EXT/2;
  D.FLOOR_T=m.slab||300; D.ROOF_T=400; D.FOOT_D=600; D.FOOT_W=450; D.CUT_H=(m.plan&&m.plan.cut)||1200; D.SECTION_X=(D.X[0]+D.X[D.X.length-1])/2;
  const cy=(y)=>y+dy, cx=(x)=>x-gx0;
  // 階ごと
  D.FLOORS={}; const parts={};
  lv.forEach((l,i)=>{ const fno=i+1; const walls=(m.walls||[]).filter(w=>w.level===l.id); const P=[]; const pm={};
    walls.filter(w=>w.kind==='partition').forEach(w=>{ const r=wallRectOf(w); if(!r) return; const rr=[cx(r[0]),cy(r[1]),cx(r[2]),cy(r[3])]; P.push({id:w.id,rect:rr}); pm[w.id]={w,rect:rr}; });
    const rooms=(m.rooms||[]).filter(r=>r.level===l.id).map(r=>({id:r.id,name:r.labelText||r.name,sub:r.sub||null,zone:zoneOf(r),poly:(r.polygon||[]).map(p=>[cx(p[0]),cy(p[1])]),label:r.label?[cx(r.label[0]),cy(r.label[1])]:null,small:!!r.small}));
    const openings=[], doors=[];
    (m.openings||[]).forEach(o=>{ const w=walls.find(x=>x.id===o.wall); if(!w) return; const dir=[Math.sign(w.b[0]-w.a[0])||0,Math.sign(w.b[1]-w.a[1])||0];
      if(pm[o.wall]){ const r=pm[o.wall].rect; const h=(r[2]-r[0])>=(r[3]-r[1]); const s0=h?cx(w.a[0])+dir[0]*o.at:cy(w.a[1])+dir[1]*o.at; const s1=h?cx(w.a[0])+dir[0]*(o.at+o.width):cy(w.a[1])+dir[1]*(o.at+o.width);
        const d={part:o.wall,orient:h?'h':'v',t0:h?r[1]:r[0],t1:h?r[3]:r[2],a:Math.min(s0,s1),b:Math.max(s0,s1),head:o.head||2000}; const dot=h?1:-1;
        if(o.type==='door'){ d.kind='swing'; d.hinge=(o.swing||'L')==='L'?'a':'b'; d.side=(o.flip?1:-1)*dot; } else if(o.type==='slide'&&o.variant==='closet'){ d.kind='closet'; d.side=1; } else if(o.type==='slide'){ d.kind='slide'; d.side=(o.side||1)*dot; } else { d.kind='swing'; d.hinge='a'; d.side=1; }
        doors.push(d); return; }
      if(w.kind!=='exterior'&&w.kind!=='fire') return; if(Math.abs(w.a[1]-w.b[1])>1) return;   // 東西の壁の開口は扱わない
      const yw=cy(w.a[1]); const side=Math.abs(yw-(D.WALL_S0+D.WALL_S1)/2)<D.T_EXT?'S':Math.abs(yw-(D.WALL_N0+D.WALL_N1)/2)<D.T_EXT?'N':null; if(!side) return;
      const s0=cx(w.a[0])+dir[0]*o.at, s1=cx(w.a[0])+dir[0]*(o.at+o.width); const n=o.panels||1; const kind=(o.type==='sweep'&&(o.sill||0)===0)?(n===4?'slide4':'win'):(n===4?'win4':n===2?'win2':'win');
      openings.push({wall:side,a:Math.min(s0,s1),b:Math.max(s0,s1),sill:o.sill||0,head:o.head||2000,kind,rail:!!o.rail}); });
    const fixtures=(m.fixtures||[]).filter(x=>x.level===l.id).map(fx=>{ const t=fx.kind; const at=[cx(fx.at[0]),cy(fx.at[1])]; const rot=((fx.rot||0)%360+360)%360; const g={type:t,upper:!!fx.upper};
      if(t==='toilet'){ const s=rot===0?1:-1; g.x=at[0]; g.y=at[1]-s*362.5; g.rot=rot; return g; } if(t==='handbasin'){ g.x=at[0]+130; g.y=at[1]; g.rot=90; return g; } if(t==='shower'){ g.x=at[0]; g.y=at[1]+110; return g; }
      if(t==='rod'){ g.line=[[at[0]-fx.w/2,at[1]],[at[0]+fx.w/2,at[1]]]; g.upper=true; return g; }
      let w=fx.w||0, d=fx.d||0; if(rot===90||rot===270){ const q=w; w=d; d=q; } g.rect=[at[0]-w/2,at[1]-d/2,at[0]+w/2,at[1]+d/2];
      if(fx.div) g.div=fx.div; if(fx.head) g.head=fx.head; if(fx.sink) g.sink=[at[0]+fx.sink[0],at[1]+fx.sink[1],at[0]+fx.sink[2],at[1]+fx.sink[3]]; if(fx.hob) g.hob=[at[0]+fx.hob[0],at[1]+fx.hob[1]]; return g; });
    D.FLOORS[fno]={fl:l.fl,id:l.id,name:fno+'階',parts:P,rooms,openings,doors,fixtures}; parts[fno]=pm; });
  // 階段（東の界壁沿いの直階段を同じ向きに重ねる）
  const sts=(m.stairs||[]).slice().sort((a,b)=>(lv.findIndex(l=>l.id===a.from))-(lv.findIndex(l=>l.id===b.from)));
  if(sts.length){ const s=sts[0]; const d=s.dir==='S'?-1:1; D.STAIR={x0:cx(s.origin[0]),x1:cx(s.origin[0])+s.width,dir:d,flights:sts.map(q=>({fl:(lv.find(l=>l.id===q.from)||{}).fl||0,n:q.n,y0:cy(q.origin[1])}))}; }
  else D.STAIR={x0:D.IN_W1-800,x1:D.IN_W1,dir:-1,flights:[{fl:D.FL1,n:15,y0:7850},{fl:D.FL2,n:14,y0:7850}]};
  while(D.STAIR.flights.length<2) D.STAIR.flights.push(Object.assign({},D.STAIR.flights[0],{fl:D.FL2}));
  D.STAIR_X0=D.STAIR.x0; D.STAIR_X1=D.STAIR.x1; D.STAIR_DIR=D.STAIR.dir; D.STAIR_W=D.STAIR_X1-D.STAIR_X0; D.RISER=(sts[0]&&sts[0].rise)||200; D.TREAD=(sts[0]&&sts[0].tread)||220; D.N1=D.STAIR.flights[0].n; D.N2=D.STAIR.flights[1].n;
  D.risers=(k)=>{ const fl=D.STAIR.flights[k]; return Array.from({length:fl.n},(_,i)=>fl.y0+D.STAIR_DIR*i*D.TREAD); };
  D.STAIR1_FOOT=D.risers(0)[0]; D.STAIR2_FOOT=D.risers(1)[0]; D.STAIR1_TOP=D.risers(0)[D.N1-1]; D.STAIR2_TOP=D.risers(1)[D.N2-1];
  // 南の隣家と日射（断面の担当 tools/archdraw/section/defaults.json の値。判断）
  const nb=opt.neighborSouth||{}; D.NB_WALL_Y=nb.wall_y!=null?nb.wall_y:-D.ALLEY_W-450; D.NB_OVER=nb.overhang||450; D.NB_PITCH=nb.pitch||0.4; D.NB_DEPTH=nb.depth||7280; D.NB_TIP_Y=D.NB_WALL_Y+D.NB_OVER;
  D.NB_TIP_Z=(nb.eave_wall_z||5800)+(nb.roof_thickness||150)-D.NB_PITCH*D.NB_OVER; D.NB_FLOOR2=nb.floor2||3300; D.LAT_DEG=opt.latitude||35.68; D.S_NEIGHBOR_Y=-D.ALLEY_W;
  D.sunAlt=(decl)=>90-D.LAT_DEG+decl; D.SUN_WINTER=D.sunAlt(-23.44); D.SUN_SUMMER=D.sunAlt(23.44);
  D.winterShadow=()=>D.NB_TIP_Z-(D.WALL_S0-D.NB_TIP_Y)*Math.tan(D.SUN_WINTER*Math.PI/180);
  D.sunPatch=(fl,sill,head,shadowZ,stopY,alt)=>{ const t=Math.tan((alt==null?D.SUN_WINTER:alt)*Math.PI/180); let near=D.WALL_S1+sill/t; if(shadowZ!=null) near=Math.max(near,D.WALL_S0+(shadowZ-fl)/t); let far=D.WALL_S0+head/t; if(stopY!=null) far=Math.min(far,stopY); return near>=far?null:[near,far]; };
  D.firstWallNorth=(fno,x,yFrom)=>{ const ys=[D.WALL_N0]; D.FLOORS[fno].parts.forEach(p=>{ const [x0,y0,x1,y1]=p.rect; if((x1-x0)>=(y1-y0)&&x0<=x&&x<=x1&&y0>yFrom) ys.push(y0); }); return Math.min(...ys); };
  // 街区（第 1 部の街区のモデル。C の状態。y を路地の中心線から北側の境界へ）
  const B=blockModel(m); const sy=-B.ALLEY_HALF; D.UNIT_X0=B.X_P1; D.BLOCK_W=B.BLOCK_W; D.ROAD=Object.assign({},B.ROAD_W); D.BLOCK_N=B.N2_FRONT+sy; D.BLOCK_S=B.S2_FRONT+sy;
  D.HOUSES=B.buildings('C').filter(b=>b.label!=='joint').map(b=>({row:b.lot.row,name:b.lot.name,kind:b.kind,poly:b.poly.map(p=>[p[0],p[1]+sy]),annex:b.annex.map(a=>a.map(p=>[p[0],p[1]+sy]))}));
  D.UNIT_SHOWN=B.SUBJECT-1; D.unitX=(k)=>D.UNIT_X0+k*D.LOT_W; D.houses=(row)=>D.HOUSES.filter(h=>h.row===row).sort((a,b)=>bbox(a.poly)[0]-bbox(b.poly)[0]);
  D.neighborAt=(row,xb)=>D.houses(row).find(h=>{ const b=bbox(h.poly); return b[0]<=xb&&xb<=b[2]; })||null;
  const nn=D.neighborAt('N2',D.unitX(D.UNIT_SHOWN)+D.SECTION_X); D.N_NEIGHBOR_Y=nn?bbox(nn.poly)[1]:D.LOT_D+500;
  D.area=(poly)=>polyArea(poly)/1e6;
  return D;
}

/* ── 座標の変換（base.py） ── */
class PlanView{ constructor(ox,oy,s,win,xoff){ this.ox=ox; this.oy=oy; this.s=s||100; [this.x0r,this.x1r,this.y0r,this.y1r]=win; this.xoff=xoff||0; }
  px(x){ return this.ox+(x-this.x0r)/this.s; } py(y){ return this.oy+(this.y1r-y)/this.s; } pt(x,y){ return [this.px(x),this.py(y)]; } pts(P){ return P.map(p=>this.pt(p[0],p[1])); }
  clip(svg){ svg.clipRectBegin(this.px(this.x0r),this.py(this.y1r),this.px(this.x1r),this.py(this.y0r)); } }
class SectionView{ constructor(ox,oy,s,win){ this.ox=ox; this.oy=oy; this.s=s||100; [this.yn,this.ys,this.z0,this.z1]=win; }
  px(y){ return this.ox+(this.yn-y)/this.s; } py(z){ return this.oy+(this.z1-z)/this.s; } pt(y,z){ return [this.px(y),this.py(z)]; } pts(P){ return P.map(p=>this.pt(p[0],p[1])); }
  clip(svg){ svg.clipRectBegin(this.px(this.yn),this.py(this.z1),this.px(this.ys),this.py(this.z0)); } }
function solidSegments(a0,a1,holes){ const segs=[]; let cur=a0; holes.slice().sort((p,q)=>p[0]-q[0]).forEach(([h0,h1])=>{ if(h1<=cur||h0>=a1) return; if(h0>cur) segs.push([cur,h0]); cur=Math.max(cur,h1); }); if(cur<a1) segs.push([cur,a1]); return segs; }

/* ── 下図（base.py） ── */
function Base(M){
  const B={};
  B.ceiling=(fno)=>[M.FL2-M.FLOOR_T,M.FL3-M.FLOOR_T,M.RFL-M.ROOF_T][fno-1];
  B.openings=(fno,wall,ks)=>{ ks=ks||[-1,0,1]; const out=[]; ks.forEach(k=>M.FLOORS[fno].openings.forEach(o=>{ if(o.wall===wall) out.push(Object.assign({},o,{a:o.a+k*M.LOT_W,b:o.b+k*M.LOT_W})); })); return out; };
  B.splitParts=(fno)=>{ const F=M.FLOORS[fno]; const out=[]; F.parts.forEach(p=>{ const [x0,y0,x1,y1]=p.rect; const h=(x1-x0)>=(y1-y0); const holes=F.doors.filter(d=>d.part===p.id).map(d=>[d.a,d.b]); if(h) solidSegments(x0,x1,holes).forEach(([a,b])=>out.push(rect(a,y0,b,y1))); else solidSegments(y0,y1,holes).forEach(([a,b])=>out.push(rect(x0,a,x1,b))); }); return out; };
  B.planWalls=(fno)=>{ const walls=[]; const xlo=-M.LOT_W-200, xhi=2*M.LOT_W+200; [['S',[M.WALL_S0,M.WALL_S1]],['N',[M.WALL_N0,M.WALL_N1]]].forEach(([wall,[w0,w1]])=>{ const holes=B.openings(fno,wall).map(o=>[o.a,o.b]); solidSegments(xlo,xhi,holes).forEach(([a,b])=>walls.push(rect(a,w0,b,w1))); });
    [-1,0,1,2].forEach(k=>{ const xc=k*M.LOT_W; walls.push(rect(xc-M.T_EXT/2,M.WALL_S0,xc+M.T_EXT/2,M.WALL_N1)); }); return walls; };
  B.planStructure=(svg,v,fno,env)=>{ env=env||GRAY; B.splitParts(fno).forEach(r=>svg.poly(v.pts(r),true,{stroke:GRAY,w:W_THIN,fill:WHITE})); M.FLOORS[fno].doors.forEach(d=>door(svg,v,d)); B.planWalls(fno).forEach(r=>svg.poly(v.pts(r),true,{stroke:null,fill:env})); ['S','N'].forEach(w=>B.openings(fno,w).forEach(o=>window_(svg,v,o,w))); };
  B.planBase=(svg,v,fno,env)=>{ env=env||GRAY; const g=GRAY; v.clip(svg);
    M.HOUSES.forEach(h=>{ if(h.row!=='S1'&&h.row!=='N2') return; const poly=h.poly.map(p=>[p[0]-v.xoff,p[1]]); const b=bbox(poly); if(b[2]<v.x0r||b[0]>v.x1r) return; svg.poly(v.pts(poly),true,{stroke:g,w:W_THIN,fill:h.kind==='fire'?g:'none'}); });
    svg.line(v.px(v.x0r),v.py(M.ALLEY_C),v.px(v.x1r),v.py(M.ALLEY_C),g,W_FINE,CHAIN); [0,M.LOT_D].forEach(yb=>svg.line(v.px(v.x0r),v.py(yb),v.px(v.x1r),v.py(yb),g,W_FINE,CHAIN2));
    M.FLOORS[fno].fixtures.forEach(fx=>fixture(svg,v,fx)); B.stairPlan(svg,v,fno); B.planStructure(svg,v,fno,env); svg.groupEnd();
    svg.line(v.px(v.x0r),v.py(M.WALL_S0),v.px(v.x1r),v.py(M.WALL_S0),RED,W_FIRE);
    const sx=v.px(M.SECTION_X); [[-2600,-2100,'A'],[M.LOT_D+420,M.LOT_D-20,"A'"]].forEach(([yo,yi,lab])=>{ const po=v.py(yo), pi=v.py(yi); svg.line(sx,po,sx,pi,g,W_THEME); svg.line(sx,po,sx+2.4,po,g,W_FINE); arrowhead(svg,sx+2.4,po,0,g,W_FINE,1.2); svg.text(sx-0.8,(po+pi)/2+0.7,lab,T_S,{anchor:'end',fill:g}); }); };
  B.planRoomNames=(svg,v,fno,skip)=>{ skip=skip||[]; M.FLOORS[fno].rooms.forEach(rm=>{ if(rm.label&&rm.zone!==null&&skip.indexOf(rm.name)<0) svg.text(v.px(rm.label[0]),v.py(rm.label[1])+T_S*0.35,rm.name,T_S,{anchor:'middle',halo:true}); }); };
  B.planRefNames=(svg,v)=>{ const x=v.px(v.x0r)+0.8; [[M.ALLEY_C,'路地中心線',-0.8],[0,'敷地境界',2.6],[M.WALL_S0,'後退線（外壁の面）',2.6],[M.LOT_D,'敷地境界',-0.8],[M.S_NEIGHBOR_Y,'南の木造',2.6]].forEach(([y,s,dy])=>svg.text(x,v.py(y)+dy,s,T_S,{fill:GRAY,halo:true})); };
  function window_(svg,v,o,wall){ const g=GRAY; const [w0,w1]=wall==='S'?[M.WALL_S0,M.WALL_S1]:[M.WALL_N0,M.WALL_N1]; const a=o.a, b=o.b;
    if(o.sill>0){ svg.line(v.px(a),v.py(w0),v.px(b),v.py(w0),g,W_FINE); svg.line(v.px(a),v.py(w1),v.px(b),v.py(w1),g,W_FINE); }
    const n={slide4:4,win4:4,win2:2}[o.kind]||1; if(n>1){ const pw=(b-a)/n, t0=w0+(w1-w0)*0.36, t1=w0+(w1-w0)*0.64; for(let i=0;i<n;i++){ const outer=n===4?(i===0||i===n-1):(i===0); const tr=outer?t0:t1; const xa=a+i*pw-(i?30:0), xb=a+(i+1)*pw+(i<n-1?30:0); svg.line(v.px(xa),v.py(tr),v.px(xb),v.py(tr),g,W_THIN); } }
    else { const tm=(w0+w1)/2; svg.line(v.px(a),v.py(tm),v.px(b),v.py(tm),g,W_THIN); } }
  function door(svg,v,d){ const g=GRAY; const o=d.orient, t0=d.t0, t1=d.t1, a=d.a, b=d.b; const P=o==='h'?(u,t)=>v.pt(u,t):(u,t)=>v.pt(t,u);
    if(d.kind==='slide'||d.kind==='closet'){ if(d.kind==='slide'){ const base=(d.side||1)>0?t1+40:t0-40; const p0=P(a-50,base), p1=P(b+50,base); svg.line(p0[0],p0[1],p1[0],p1[1],g,W_THIN); } else { const tm=(t0+t1)/2, mm=(a+b)/2; [[a,mm+40,tm-25],[mm-40,b,tm+25]].forEach(([u0,u1,tt])=>{ const p0=P(u0,tt), p1=P(u1,tt); svg.line(p0[0],p0[1],p1[0],p1[1],g,W_THIN); }); } return; }
    const side=d.side||1, L=b-a, face=side>0?t1:t0; const hu=(d.hinge||'a')==='a'?a:b, ou=hu===a?b:a; const ph=P(hu,face), pl=P(hu,face+side*L), pj=P(ou,face); svg.line(ph[0],ph[1],pl[0],pl[1],g,W_THIN);
    const r=L/v.s; const cross=(pl[0]-ph[0])*(pj[1]-ph[1])-(pl[1]-ph[1])*(pj[0]-ph[0]); const sweep=cross>0?1:0; svg.path('M'+f(pl[0])+' '+f(pl[1])+'A'+f(r)+' '+f(r)+' 0 0 '+sweep+' '+f(pj[0])+' '+f(pj[1]),{stroke:g,w:W_FINE}); }
  const ROT={0:[0,1],90:[-1,0],180:[0,-1],270:[1,0]};
  function fixture(svg,v,fx){ const g=GRAY, t=fx.type; const dash=fx.upper?HIDDEN:null;
    if(fx.rect){ const [x0,y0,x1,y1]=fx.rect; svg.poly(v.pts(rect(x0,y0,x1,y1)),true,{stroke:g,w:W_FINE,fill:fx.upper?'none':WHITE,dash});
      if(t==='bed'){ const head=fx.head||'N', k=380; if(head==='N'||head==='S'){ const yy=head==='N'?y1-k:y0+k; svg.line(v.px(x0),v.py(yy),v.px(x1),v.py(yy),g,W_FINE); } else { const xx=head==='E'?x1-k:x0+k; svg.line(v.px(xx),v.py(y0),v.px(xx),v.py(y1),g,W_FINE); } }
      else if(t==='tub') svg.poly(v.pts(rect(x0+90,y0+90,x1-90,y1-90)),true,{stroke:g,w:W_FINE});
      else if(t==='vanity'||t==='washer'){ const [cx,cy]=v.pt((x0+x1)/2,(y0+y1)/2); const r=Math.min(x1-x0,y1-y0)/v.s*0.32; svg.ellipse(cx,cy,r*1.2,r,{stroke:g,w:W_FINE}); }
      else if(t==='shelf'&&fx.div){ let yy=y0+fx.div; while(yy<y1){ svg.line(v.px(x0),v.py(yy),v.px(x1),v.py(yy),g,W_FINE); yy+=fx.div; } }
      else if(t==='skylight'){ const p0=v.pt(x0,y0), p1=v.pt(x1,y1); svg.line(p0[0],p0[1],p1[0],p1[1],g,W_FINE,dash); svg.line(p0[0],p1[1],p1[0],p0[1],g,W_FINE,dash); }
      if(fx.sink) svg.poly(v.pts(rect(...fx.sink)),true,{stroke:g,w:W_FINE}); if(fx.hob){ const [hx,hy]=fx.hob; [-170,170].forEach(dx=>svg.circle(v.px(hx+dx),v.py(hy),1.2,{stroke:g,w:W_FINE})); } }
    else if(t==='toilet'||t==='handbasin'){ const [dx,dy]=ROT[fx.rot||0]||[0,1]; const x=fx.x, y=fx.y; const [w2,d1]=t==='toilet'?[220,200]:[220,330]; const box=[[x-dy*w2,y-dx*w2],[x+dy*w2,y+dx*w2],[x+dy*w2+dx*d1,y+dx*w2+dy*d1],[x-dy*w2+dx*d1,y-dx*w2+dy*d1]]; svg.poly(v.pts(box),true,{stroke:g,w:W_FINE,fill:WHITE});
      if(t==='toilet'){ const [cx,cy]=v.pt(x+dx*470,y+dy*470); const [rx,ry]=dx===0?[1.8,2.6]:[2.6,1.8]; svg.ellipse(cx,cy,rx,ry,{stroke:g,w:W_FINE,fill:WHITE}); } }
    else if(t==='shower') svg.circle(v.px(fx.x),v.py(fx.y-150),0.9,{stroke:g,w:W_FINE});
    else if(t==='rod'){ const [[x0,y0],[x1,y1]]=fx.line; svg.line(v.px(x0),v.py(y0),v.px(x1),v.py(y1),g,W_FINE,HIDDEN); } }
  B.stairPlan=(svg,v,fno)=>{ const g=GRAY; const x0=M.STAIR_X0, x1=M.STAIR_X1, xc=(x0+x1)/2, d=M.STAIR_DIR; const ncut=Math.floor(M.CUT_H/M.RISER);
    if(fno===1){ const fl=M.risers(0); const cut=fl[0]+d*(ncut+0.5)*M.TREAD; fl.forEach(y=>svg.line(v.px(x0),v.py(y),v.px(x1),v.py(y),g,W_FINE,d*(y-cut)<0?null:HIDDEN)); cutline(svg,v,x0,x1,cut); stairArrow(svg,v,xc,fl[0]-d*250,cut-d*120,'上'); }
    else if(fno===2){ const up=M.risers(1), low=M.risers(0); const cut=up[0]+d*(ncut+0.5)*M.TREAD; Array.from(new Set(up.concat(low))).sort((a,b)=>a-b).forEach(y=>svg.line(v.px(x0),v.py(y),v.px(x1),v.py(y),g,W_FINE)); cutline(svg,v,x0,x1,cut); stairArrow(svg,v,xc,up[0]-d*250,cut-d*120,'上'); stairArrow(svg,v,xc,low[low.length-1]+d*250,cut+d*120,'下'); }
    else { const up=M.risers(1); up.forEach(y=>svg.line(v.px(x0),v.py(y),v.px(x1),v.py(y),g,W_FINE)); stairArrow(svg,v,xc,up[up.length-1]+d*250,up[0]+d*150,'下'); }
    if(!M.FLOORS[fno].parts.some(p=>Math.abs(p.rect[2]-x0)<120)) svg.line(v.px(x0),v.py(M.risers(0)[0]),v.px(x0),v.py(M.risers(0)[M.N1-1]),g,W_FINE); };
  function cutline(svg,v,x0,x1,y){ const xm=(x0+x1)/2; svg.poly([v.pt(x0-60,y-160),v.pt(xm-60,y-30),v.pt(xm,y-120),v.pt(xm+60,y+120),v.pt(xm+60,y+30),v.pt(x1,y+160)],false,{stroke:GRAY,w:W_FINE}); }
  function stairArrow(svg,v,x,yFrom,yTo,lab){ const g=GRAY; svg.circle(v.px(x),v.py(yFrom),0.45,{stroke:g,w:W_FINE,fill:WHITE}); const up=yTo>yFrom; svg.line(v.px(x),v.py(yFrom)-(up?0.45:-0.45),v.px(x),v.py(yTo),g,W_FINE); arrowhead(svg,v.px(x),v.py(yTo),up?-Math.PI/2:Math.PI/2,g,W_FINE,1.2); svg.text(v.px(x),v.py(yFrom)+(up?3.0:-1.4),lab,T_S,{anchor:'middle',fill:g}); }
  B.gridBubbles=(svg,v,xAxis,yAxis,r)=>{ r=r||1.8; const g=GRAY; if(xAxis){ const yb=v.py(v.y1r)-r-0.6; M.X.forEach((xg,i)=>{ svg.circle(v.px(xg),yb,r,{stroke:g,w:W_FINE,fill:WHITE}); svg.text(v.px(xg),yb+0.72,'X'+(i+1),T_S,{anchor:'middle',fill:g}); svg.line(v.px(xg),yb+r,v.px(xg),v.py(v.y1r),g,W_FINE); }); }
    if(yAxis){ const xb=v.px(v.x0r)-r-0.6; M.Y.forEach((yg,i)=>{ svg.circle(xb,v.py(yg),r,{stroke:g,w:W_FINE,fill:WHITE}); svg.text(xb,v.py(yg)+0.72,'Y'+(i+1),T_S,{anchor:'middle',fill:g}); svg.line(xb+r,v.py(yg),v.px(-M.T_EXT/2),v.py(yg),g,W_FINE,CHAIN); }); } };
  // 断面
  B.cutParts=(fno)=>{ const out=[]; const F=M.FLOORS[fno]; F.parts.forEach(p=>{ const [x0,y0,x1,y1]=p.rect; if((x1-x0)>=(y1-y0)&&x0<=M.SECTION_X&&M.SECTION_X<=x1){ const ds=F.doors.filter(d=>d.part===p.id&&d.a<=M.SECTION_X&&M.SECTION_X<=d.b); out.push([y0,y1,ds.length?ds[0].head:null]); } }); return out; };
  B.sectionCutPolys=()=>{ const P=[[[M.WALL_S0,-M.FOOT_D],[M.WALL_S0+M.FOOT_W,-M.FOOT_D],[M.WALL_S0+M.FOOT_W,0],[M.WALL_N1-M.FOOT_W,0],[M.WALL_N1-M.FOOT_W,-M.FOOT_D],[M.WALL_N1,-M.FOOT_D],[M.WALL_N1,M.FL1],[M.WALL_S0,M.FL1]]];
    [['S',[M.WALL_S0,M.WALL_S1]],['N',[M.WALL_N0,M.WALL_N1]]].forEach(([wall,[w0,w1]])=>{ const holes=[]; Object.values(M.FLOORS).forEach(F=>F.openings.forEach(o=>{ if(o.wall===wall&&o.a<=M.SECTION_X&&M.SECTION_X<=o.b) holes.push([F.fl+o.sill,F.fl+o.head]); })); solidSegments(M.FL1,M.TOP,holes).forEach(([z0,z1])=>P.push(rect(w0,z0,w1,z1))); });
    [[M.FL2,M.FLOOR_T],[M.FL3,M.FLOOR_T],[M.RFL,M.ROOF_T]].forEach(([zt,t])=>P.push(rect(M.WALL_S1,zt-t,M.WALL_N0,zt)));
    Object.keys(M.FLOORS).forEach(k=>{ const fno=+k, F=M.FLOORS[fno]; B.cutParts(fno).forEach(([y0,y1,head])=>P.push(rect(y0,head?F.fl+head:F.fl,y1,B.ceiling(fno)))); }); return P; };
  const FIX_H={bench:450,counter:850,wardrobe:2000,table:700,bed:450,desk:720,shelf:1800,fridge:1800,washer:900,vanity:800,tub:550,sofa:400,lowtable:350,tvboard:450,shoebox:1000};
  B.sectionCutFixtures=()=>{ const out=[]; Object.values(M.FLOORS).forEach(F=>F.fixtures.forEach(fx=>{ if(fx.rect&&!fx.upper&&FIX_H[fx.type]){ const [x0,y0,x1,y1]=fx.rect; if(x0<=M.SECTION_X&&M.SECTION_X<=x1) out.push([y0,F.fl,y1,F.fl+FIX_H[fx.type]]); } })); return out; };
  B.beyondParts=(fno)=>{ const F=M.FLOORS[fno]; const c=F.parts.filter(p=>(p.rect[2]-p.rect[0])<(p.rect[3]-p.rect[1])&&p.rect[0]>M.SECTION_X).sort((a,b)=>a.rect[0]-b.rect[0]); const shown=[], cov=[]; c.forEach(p=>{ const y0=p.rect[1], y1=p.rect[3]; const s=cov.reduce((t,[a,b])=>t+Math.max(0,Math.min(y1,b)-Math.max(y0,a)),0); if(s<0.9*(y1-y0)) shown.push(p); cov.push([y0,y1]); }); return shown; };
  B.stairHidden=(storey)=>{ const [y0,y1]=[M.risers(0)[0],M.risers(0)[M.N1-1]].sort((a,b)=>a-b); return M.FLOORS[storey].parts.some(p=>{ const [px0,py0,px1,py1]=p.rect; return (px1-px0)<(py1-py0)&&M.SECTION_X<px0&&px0<M.STAIR_X0&&py0<=y0+200&&py1>=y1-200; }); };
  const NB_N_EAVE=5900;
  B.sectionBase=(svg,v,env,under)=>{ env=env||GRAY; const g=GRAY; v.clip(svg); const gy0=v.py(0), gy1=v.py(-900), xl=v.px(v.yn), xr=v.px(v.ys);
    svg.hatch([[xl,gy0],[xr,gy0],[xr,gy1],[xl,gy1]],0.9,45,g,W_FINE); svg.poly(v.pts(rect(M.WALL_S0,-M.FOOT_D,M.WALL_N1,0)),true,{stroke:null,fill:WHITE}); neighborsSection(svg,v);
    Object.keys(M.FLOORS).forEach(k=>{ const fno=+k, F=M.FLOORS[fno]; B.beyondParts(fno).forEach(p=>{ [p.rect[1],p.rect[3]].forEach(yy=>svg.line(v.px(yy),v.py(F.fl),v.px(yy),v.py(B.ceiling(fno)),g,W_THIN)); F.doors.forEach(d=>{ if(d.part===p.id) svg.poly(v.pts([[d.a,F.fl],[d.a,F.fl+d.head],[d.b,F.fl+d.head],[d.b,F.fl]]),false,{stroke:g,w:W_FINE}); }); }); });
    stairSection(svg,v); B.sectionCutFixtures().forEach(([y0,z0,y1,z1])=>svg.poly(v.pts(rect(y0,z0,y1,z1)),true,{stroke:g,w:W_FINE,fill:WHITE}));
    Object.values(M.FLOORS).forEach(F=>F.openings.forEach(o=>{ if(!(o.a<=M.SECTION_X&&M.SECTION_X<=o.b)) return; const [w0,w1]=o.wall==='S'?[M.WALL_S0,M.WALL_S1]:[M.WALL_N0,M.WALL_N1]; const z0=F.fl+o.sill, z1=F.fl+o.head; [(w0+w1)/2-20,(w0+w1)/2+20].forEach(yy=>svg.line(v.px(yy),v.py(z0),v.px(yy),v.py(z1),g,W_FINE)); if(o.rail) svg.poly(v.pts(rect(w0-60,F.fl+1060,w0,F.fl+1100)),true,{stroke:g,w:W_FINE}); }));
    [[-2250,0],[6500,M.FL1]].forEach(([y,z])=>person(svg,v,y,z)); if(under) under(svg,v);
    B.sectionCutPolys().forEach(p=>svg.poly(v.pts(p),true,{stroke:null,fill:env})); [[M.WALL_S0-30,M.WALL_S1+30],[M.WALL_N0-30,M.WALL_N1+30]].forEach(([w0,w1])=>svg.poly(v.pts(rect(w0,M.TOP,w1,M.TOP+40)),true,{stroke:null,fill:env}));
    svg.line(xl,gy0,xr,gy0,g,W_THEME); svg.line(v.px(M.ALLEY_C),v.py(-500),v.px(M.ALLEY_C),v.py(1800),g,W_FINE,CHAIN); svg.groupEnd(); svg.line(v.px(M.WALL_S0),v.py(M.FL1),v.px(M.WALL_S0),v.py(M.TOP+40),RED,W_FIRE); };
  function neighborsSection(svg,v){ const g=GRAY; const yw=M.NB_WALL_Y, yf=yw-M.NB_DEPTH, ry=(yw+yf)/2; const zw=M.NB_TIP_Z+M.NB_PITCH*M.NB_OVER; const rz=zw+M.NB_PITCH*(yw-ry);
    svg.poly(v.pts([[M.NB_TIP_Y,M.NB_TIP_Z],[ry,rz],[yf,zw]]),false,{stroke:g,w:W_THIN}); svg.line(v.px(yw),v.py(0),v.px(yw),v.py(zw-150),g,W_THIN); svg.line(v.px(M.NB_TIP_Y),v.py(M.NB_TIP_Z),v.px(M.NB_TIP_Y),v.py(M.NB_TIP_Z-150),g,W_THIN); svg.line(v.px(M.NB_TIP_Y),v.py(M.NB_TIP_Z-150),v.px(yw),v.py(zw-150),g,W_THIN);
    svg.line(v.px(yw),v.py(M.NB_FLOOR2),v.px(yf),v.py(M.NB_FLOOR2),g,W_FINE); [[1350,2250],[M.NB_FLOOR2+800,M.NB_FLOOR2+1800]].forEach(([z0,z1])=>svg.poly(v.pts(rect(yw,z0,yw-120,z1)),true,{stroke:g,w:W_FINE}));
    const yb=M.N_NEIGHBOR_Y; svg.poly(v.pts([[yb,0],[yb,NB_N_EAVE],[yb+4000,NB_N_EAVE+4000*0.4]]),false,{stroke:g,w:W_THIN}); svg.line(v.px(yb),v.py(3000),v.px(v.yn),v.py(3000),g,W_FINE); }
  B.stairProfile=(k)=>{ const fl=M.STAIR.flights[k]; let y=fl.y0, z=fl.fl; const pts=[[y,z]]; for(let i=0;i<fl.n;i++){ z+=M.RISER; pts.push([y,z]); if(i<fl.n-1){ y+=M.STAIR_DIR*M.TREAD; pts.push([y,z]); } } return pts; };
  function stairSection(svg,v){ const g=GRAY; [[0,1],[1,2]].forEach(([k,storey])=>{ const pts=B.stairProfile(k); const dash=B.stairHidden(storey)?HIDDEN:null; svg.poly(v.pts(pts),false,{stroke:g,w:W_THIN,dash}); const [y0,z0]=pts[0], [y1,z1]=pts[pts.length-1]; const off=260/Math.cos(Math.atan((z1-z0)/Math.abs(y1-y0))); svg.line(v.px(y0),v.py(z0),v.px(y1),v.py(z1-off),g,W_THIN,dash); }); }
  function person(svg,v,y,z,h){ h=h||1650; const s=h/1650; const half=[[0,820],[55,0],[165,0],[185,900],[215,790],[250,810],[235,1330],[170,1410],[60,1440]]; const pts=half.concat(half.slice(1).reverse().map(([x,zz])=>[-x,zz])); svg.poly(v.pts(pts.map(([x,zz])=>[y+x*s,z+zz*s])),true,{stroke:GRAY,w:W_FINE,fill:WHITE}); const [cx,cy]=v.pt(y,z+1545*s); svg.circle(cx,cy,105*s/v.s,{stroke:GRAY,w:W_FINE,fill:WHITE}); }
  B.levelMarks=(svg,v,xText)=>{ const g=GRAY; const marks=[['GL',M.GL],['1FL',M.FL1],['2FL',M.FL2],['3FL',M.FL3],['RFL',M.RFL],['最高',M.TOP]]; const xEnd=v.px(v.yn);
    marks.forEach(([lab,z])=>{ const y=v.py(z); svg.line(xText,y,xEnd,y,g,W_FINE); const tx=xEnd-2.6; svg.poly([[tx-0.9,y-1.4],[tx+0.9,y-1.4],[tx,y]],true,{stroke:g,w:W_FINE,fill:WHITE}); const val=z===0?'±0':'+'+Math.round(z).toLocaleString('en-US'); svg.text(xText,lab==='GL'?y+2.5:y-0.6,lab+' '+val,T_S); }); };
  B.sectionDims=(svg,v,zDim)=>{ zDim=zDim==null?-1150:zDim; const g=GRAY; const ticks=[M.S_NEIGHBOR_Y,0,M.WALL_S0,M.WALL_N1,M.N_NEIGHBOR_Y]; const names=['路地','後退','建物','北の隣家まで']; const yy=v.py(zDim); svg.line(v.px(ticks[0]),yy,v.px(ticks[ticks.length-1]),yy,g,W_FINE);
    ticks.forEach(t=>{ const x=v.px(t); svg.line(x-0.6,yy+0.6,x+0.6,yy-0.6,g,W_THIN); svg.line(x,yy-1.0,x,yy+1.0,g,W_FINE); });
    for(let i=0;i<4;i++){ const a=ticks[i], b=ticks[i+1]; const xm=(v.px(a)+v.px(b))/2; svg.text(xm,yy-0.7,Math.round(Math.abs(b-a)).toLocaleString('en-US'),T_S,{anchor:'middle'}); svg.text(xm,yy+2.6,names[i],T_S,{anchor:'middle'}); } };
  B.blockBase=(svg,v,unitsFill)=>{ const g=GRAY; v.clip(svg); [rect(0,0,M.BLOCK_W,M.BLOCK_N),rect(0,M.BLOCK_S,M.BLOCK_W,-M.ALLEY_W)].forEach(r=>svg.poly(v.pts(r),true,{stroke:g,w:W_THIN}));
    const far=90000, xw=-M.ROAD.west, xe=M.BLOCK_W+M.ROAD.east, yn=M.BLOCK_N+M.ROAD.north, ys=M.BLOCK_S-M.ROAD.south; [rect(-far,yn,M.BLOCK_W+far,yn+far),rect(-far,ys-far,M.BLOCK_W+far,ys),rect(-far,ys,xw,yn),rect(xe,ys,M.BLOCK_W+far,yn)].forEach(r=>svg.poly(v.pts(r),true,{stroke:g,w:W_THIN}));
    svg.line(v.px(xw),v.py(M.ALLEY_C),v.px(xe),v.py(M.ALLEY_C),g,W_FINE,CHAIN);
    M.HOUSES.forEach(h=>{ h.annex.forEach(a=>svg.poly(v.pts(a),true,{stroke:g,w:W_FINE,fill:WHITE})); svg.poly(v.pts(h.poly),true,{stroke:g,w:W_FINE,fill:h.kind==='fire'?g:WHITE}); });
    const x0=M.UNIT_X0, x1=M.UNIT_X0+M.UNITS*M.LOT_W; svg.poly(v.pts(rect(x0,M.WALL_S0,x1,M.WALL_N1)),true,{stroke:unitsFill||g,w:W_THIN,fill:unitsFill||WHITE}); for(let k=1;k<M.UNITS;k++){ const xk=M.unitX(k); svg.line(v.px(xk),v.py(M.WALL_S0),v.px(xk),v.py(M.WALL_N1),unitsFill?WHITE:g,unitsFill?W_FINE:W_THIN); }
    svg.groupEnd(); svg.line(v.px(x0),v.py(M.WALL_S0),v.px(x1),v.py(M.WALL_S0),RED,W_FIRE); };
  return B;
}
window.__gnotoArchSitePart2={P1,SVG,PlanView,SectionView,Base,diagModel,arrowhead,stopbar,polylineArrow,solidSegments,GRAY,RED,WHITE,W_THEME,W_THIN,W_FINE,DASH,DOT,SHEET_W,SHEET_H,ML,deg1};
})();

/* ── 第 3 部：骨組みと 4 つの主題（sheets.py） ── */
(function(){
'use strict';
const P2=window.__gnotoArchSitePart2; if(!P2) return; delete window.__gnotoArchSitePart2;
const {P1,SVG,PlanView,SectionView,Base,diagModel,arrowhead,stopbar,polylineArrow,GRAY,WHITE,W_THEME,W_THIN,W_FINE,DASH,DOT,SHEET_W,SHEET_H,ML,deg1}=P2;
const {A,MINE,install,Doc,INK,T_S,T_M,fmt,textWidth,rect,bbox,fmtN}=P1;
const HATCH={pub:0.9,com:1.8,pri:3.6}, ZONE_WORD={pub:'公',com:'共',pri:'私'};
const nf=(v)=>Math.round(v).toLocaleString('en-US');

function wrap(s,width,size){ const lines=[]; let cur=''; for(const ch of s){ if(textWidth(cur+ch,size)>width&&cur){ if('、。）」，．・'.indexOf(ch)>=0){ lines.push(cur+ch); cur=''; continue; } if('（「'.indexOf(cur[cur.length-1])>=0){ lines.push(cur.slice(0,-1)); cur=cur[cur.length-1]+ch; continue; } lines.push(cur); cur=ch; } else cur+=ch; } if(cur) lines.push(cur); return lines; }
function scaleBar(svg,x,y,s,lengthM,stepM,label){ const L=lengthM*1000/s; svg.line(x,y,x+L,y,INK,W_THIN); for(let i=0;i<=Math.round(lengthM/stepM);i++){ const xi=x+i*stepM*1000/s; svg.line(xi,y-1.0,xi,y,INK,W_THIN); svg.text(xi,y+2.6,String(i*stepM),T_S,{anchor:'middle'}); } svg.text(x+L+1.6,y+2.6,'m　'+label,T_S); }
function northArrow(svg,x,y,h){ h=h||7.0; svg.line(x,y,x,y-h,INK,W_THIN); arrowhead(svg,x,y-h,-Math.PI/2,INK,W_THIN,1.8); svg.text(x,y-h-1.4,'N',T_S,{anchor:'middle'}); }

function build(M, th){
  const B=Base(M); const doc=new Doc(SHEET_W,SHEET_H,'図'+th.n+' '+th.name); const svg=new SVG(doc);
  const plans={}; let ox=24.0; for(const fno of [1,2,3]){ plans[fno]=new PlanView(ox,22.5,100,[-700,6100,-3000,9700],M.unitX(M.UNIT_SHOWN)); ox+=68.0+8.0; }
  const blk=new PlanView(SHEET_W-ML-136.0,22.5,500,[-5000,63000,-24500,23000]); const sec=new SectionView(37.0,166.0,100,[12500,-7000,-1400,10000]);
  const env=th.envelope||GRAY;
  const C={}; // 主題ごとの計算（sheets.py のモジュール定数）
  C.T_W=Math.tan(M.SUN_WINTER*Math.PI/180); C.T_SU=Math.tan(M.SUN_SUMMER*Math.PI/180); C.ZS=M.winterShadow(); C.ZS_R=Math.round(C.ZS/10)*10; C.W_DEG=deg1(M.SUN_WINTER); C.S_DEG=deg1(M.SUN_SUMMER);
  C.D=M.STAIR_DIR; C.southOpening=(fno)=>M.FLOORS[fno].openings.filter(o=>o.wall==='S')[0]||{a:900,b:4500,sill:0,head:2200};
  C.XS=(M.STAIR_X0+M.STAIR_X1)/2-180; C.X_DOMA=Math.min(C.southOpening(1).b,M.STAIR_X0)-800; C.X_HALL=M.STAIR_X0-525; C.CUT1=M.STAIR1_FOOT+C.D*5.5*M.TREAD; C.CUT2=M.STAIR2_FOOT+C.D*5.5*M.TREAD; C.CUS=[[1200,M.ALLEY_C],[1200,3800]];
  const ctx={M,B,svg,C,plans,blk,sec};
  for(const fno of [1,2,3]) if(M.FLOORS[fno]) B.planBase(svg,plans[fno],fno,env);
  B.blockBase(svg,blk,th.unitsFill||null); B.sectionBase(svg,sec,env,th.under?(s,v)=>th.under(ctx,v):null);
  // 共通
  for(const fno of [1,2,3]){ const v=plans[fno]; svg.text(v.px(v.x0r),16.0,fno+'階',T_M,{weight:700}); }
  svg.runs(blk.px(blk.x0r),16.0,[['街区',700],['　1:500',400]],T_M); svg.runs(ML,162.5,[["断面 A-A'",700],['　東を見る　1:100',400]],T_M);
  B.gridBubbles(svg,plans[1],true,true); B.gridBubbles(svg,plans[2],true,false); B.gridBubbles(svg,plans[3],true,false);
  scaleBar(svg,plans[1].px(plans[1].x0r),155.0,100,5,1,'平面・断面 1:100'); northArrow(svg,plans[3].px(plans[3].x1r)-1.0,158.5);
  scaleBar(svg,blk.px(blk.x0r),blk.py(blk.y0r)+5.0,500,20,10,'街区 1:500'); northArrow(svg,blk.px(blk.x1r)-1.0,blk.py(blk.y0r)+9.0);
  B.levelMarks(svg,sec,ML); B.sectionDims(svg,sec);
  for(const fno of [1,2,3]){ if(!M.FLOORS[fno]) continue; th.plan(ctx,plans[fno],fno); if(th.planNames) B.planRoomNames(svg,plans[fno],fno,th.skipNames||[]); }
  B.planRefNames(svg,plans[1]); th.block(ctx,blk); th.section(ctx,sec);
  table(svg,blk.px(blk.x0r),132.0,136.0,th.numbers(ctx)); caption(svg,th.n,th.title,th.paras(ctx));
  doc.sources=true; return doc;
}
function caption(svg,n,title,paras){ const x0=SHEET_W-ML-136.0, yBottom=281.0, width=136.0; let body=[]; paras.forEach(p=>{ body=body.concat(wrap(p,width,T_S)); }); const lh=T_S*1.62; const y=yBottom-lh*(body.length-1); const yt=y-lh-2.0; svg.runs(x0,yt,[['図'+n,700],['　'+title,700]],T_M); body.forEach((ln,i)=>svg.text(x0,y+i*lh,ln,T_S)); return yt; }
function table(svg,x0,y0,width,rows){ const lh=4.7, c2=x0+74.0, c3=x0+78.0; svg.line(x0,y0,x0+width,y0,INK,W_THIN); const yh=y0+3.4; svg.text(x0,yh,'項目',T_S,{weight:700}); svg.text(c2,yh,'値',T_S,{weight:700,anchor:'end'}); svg.text(c3,yh,'求め方',T_S,{weight:700}); let y=y0+lh+0.4; svg.line(x0,y,x0+width,y,INK,W_FINE);
  rows.forEach(([a,b,c])=>{ y+=lh; svg.text(x0,y-1.3,a,T_S); svg.text(c2,y-1.3,b,T_S,{anchor:'end'}); svg.text(c3,y-1.3,c,T_S); }); svg.line(x0,y+0.6,x0+width,y+0.6,INK,W_THIN); return y+0.6; }
const tail=()=>'4 枚（ゾーニング・動線・光と風・延焼）は同じ枠・同じ縮尺・同じ下図で、主題の層だけを替えた。下図は灰、主題は黒、赤は路地沿いの耐火の外壁（4 枚で同じ意味）。平面・断面 1:100、街区 1:500。下図の幾何は建築スタジオの建物モデルによる（街区は架空）。筆者作成。';
function lbl2(svg,x,y,l1,l2,anchor){ anchor=anchor||'middle'; svg.runs(x,y,l1,T_S,{anchor,halo:true}); if(l2) svg.text(x,y+T_S*1.35,l2,T_S,{anchor,halo:true}); }
function sectionIntervals(M,fno){ const out=[]; const x=M.SECTION_X; M.FLOORS[fno].rooms.forEach(r=>{ const ys=[]; const P=r.poly; for(let i=0;i<P.length;i++){ const [x0,y0]=P[i], [x1,y1]=P[(i+1)%P.length]; if((x0-x)*(x1-x)<0&&x0!==x1) ys.push(y0+(y1-y0)*(x-x0)/(x1-x0)); } ys.sort((a,b)=>a-b); for(let i=0;i+1<ys.length;i+=2) out.push([Math.max(ys[i],M.WALL_S1),Math.min(ys[i+1],M.WALL_N0),r]); }); return out.sort((a,b)=>a[0]-b[0]); }

/* ── 1 ゾーニング ── */
const ZONING={ n:'1', name:'ゾーニング', title:'ゾーニング　階ごとの公・共・私（ダイアグラム）', planNames:false,
  plan({M,B,svg},v,fno){ const F=M.FLOORS[fno]; v.clip(svg); if(fno===1) svg.hatch(v.pts(rect(v.x0r,-M.ALLEY_W,v.x1r,M.WALL_S0)),HATCH.pub,45,INK,W_FINE);
    svg.clipBegin(v.pts(rect(M.IN_W0,M.WALL_S1,M.IN_W1,M.WALL_N0))); F.rooms.forEach(rm=>{ if(HATCH[rm.zone]) svg.hatch(v.pts(rm.poly),HATCH[rm.zone],45,INK,W_FINE); }); svg.groupEnd(); B.planStructure(svg,v,fno); svg.groupEnd();
    F.rooms.forEach(rm=>{ if(!rm.label||rm.zone===null) return; const [lx,ly]=rm.label; const z=rm.zone; const a=M.area(rm.poly); if(ZONE_WORD[z]&&!rm.small){ const name=rm.name+(rm.sub?'（'+rm.sub+'）':''); lbl2(svg,v.px(lx),v.py(ly),[[ZONE_WORD[z]+' ',700],[name,400]],fmt(a,1)+' m²'); } else svg.text(v.px(lx),v.py(ly)+0.7,rm.name,T_S,{anchor:'middle',halo:true}); });
    if(fno===1) lbl2(svg,v.px(1200),v.py(-1950),[['公 ',700],['路地',400]],'幅 '+nf(M.ALLEY_W)); else svg.text(v.px(1200),v.py(-1950),'路地（下）',T_S,{anchor:'middle',fill:GRAY}); },
  section({M,B,svg},v){ v.clip(svg); for(const k of [1,2,3]){ const F=M.FLOORS[k]; sectionIntervals(M,k).forEach(([y0,y1,r])=>{ if(HATCH[r.zone]) svg.hatch(v.pts(rect(y0,F.fl,y1,B.ceiling(k))),HATCH[r.zone],45,INK,W_FINE); }); } svg.groupEnd();
    for(const k of [1,2,3]){ const F=M.FLOORS[k]; sectionIntervals(M,k).forEach(([y0,y1,r])=>{ if(ZONE_WORD[r.zone]&&(y1-y0)>1500){ const zm=F.fl+(B.ceiling(k)-F.fl)*0.62; svg.runs(v.px((y0+y1)/2),v.py(zm),[[ZONE_WORD[r.zone]+' ',700],[r.name,400]],T_S,{anchor:'middle',halo:true}); } }); }
    svg.runs(v.px(-1350),v.py(2700),[['公 ',700],['路地',400]],T_S,{anchor:'middle',halo:true}); },
  block({M,svg},v){ v.clip(svg); svg.hatch(v.pts(rect(-M.ROAD.west,-M.ALLEY_W,M.BLOCK_W+M.ROAD.east,M.WALL_S0)),HATCH.pub,45,INK,W_FINE); for(let k=0;k<M.UNITS;k++) svg.hatch(v.pts(rect(M.unitX(k)+75,M.WALL_S1,M.unitX(k+1)-75,M.WALL_N0)),HATCH.pub,45,INK,W_FINE); svg.groupEnd();
    svg.runs(v.px(M.UNIT_X0+M.UNITS*M.LOT_W/2),v.py(-1900),[['公 ',700],['路地と 9 つの土間（1 階）',400]],T_S,{anchor:'middle',halo:true}); },
  numbers({M}){ const F=M.FLOORS; const s=(fno,z)=>F[fno].rooms.filter(r=>r.zone===z).reduce((t,r)=>t+M.area(r.poly),0); const pri=F[3].rooms.filter(r=>r.zone==='pri').map(r=>r.name).join('・'); let srv=0; const sn=new Set(); Object.values(F).forEach(f=>f.rooms.forEach(r=>{ if(r.zone==='srv'){ srv+=M.area(r.poly); sn.add(r.name); } }));
    return [['公　'+(F[1].rooms.find(r=>r.zone==='pub')||{name:'土間'}).name+'（1 階）',fmt(s(1,'pub'),1)+' m²','壁芯で測る。階段・物入と便所を除く'],['共　'+(F[2].rooms.find(r=>r.zone==='com')||{name:'居間・食堂・台所'}).name+'（2 階）',fmt(s(2,'com'),1)+' m²','壁芯。階段を除く'],['私　3 階の個室と水回り',fmt(s(3,'pri'),1)+' m²',pri],['白　'+Array.from(sn).sort().join('・'),fmt(srv,1)+' m²','階段の面積は含めない'],['路地沿いの公の縁',fmt(M.UNITS*M.LOT_W/1000,1)+' m',M.UNITS+' 住戸 × 間口 '+fmt(M.LOT_W/1000,1)+' m']]; },
  paras({M}){ return ['路地の公は 1 階の土間までひと続きに入り、2 階は家族の共、3 階は個人の私になる。斜線は密なほど公（公・共・私の 3 段）、白は階段・廊下・便所。面積は壁芯で測った値。'+M.UNITS+' 住戸の土間が路地に面して並び、路地沿いに '+fmt(M.UNITS*M.LOT_W/1000,1)+' m の公の縁ができる。',tail()]; } };

/* ── 2 動線 ── */
function resPaths(M,C){ const D=C.D, XS=C.XS, X_HALL=C.X_HALL;
  const p1=[[C.X_DOMA,M.ALLEY_C],[C.X_DOMA,M.STAIR1_FOOT-D*400],[XS,M.STAIR1_FOOT-D*400],[XS,M.STAIR1_FOOT],[XS,C.CUT1]];
  const t1=M.STAIR1_TOP+D*150; const p2=[[XS,t1],[XS,t1+D*450],[X_HALL,t1+D*450],[X_HALL,M.STAIR2_FOOT-D*400],[XS,M.STAIR2_FOOT-D*400],[XS,M.STAIR2_FOOT],[XS,C.CUT2]];
  const t2=M.STAIR2_TOP+D*150; const wdoors=M.FLOORS[3].doors.filter(d=>d.orient==='v'&&X_HALL-1200<d.t0&&d.t0<X_HALL&&d.kind!=='closet'); let turn=t2+D*450; if(wdoors.length&&D>0) turn=Math.max(turn,Math.max(...wdoors.map(d=>(d.a+d.b)/2)));
  const p3=[[XS,t2],[XS,turn],[X_HALL,turn]]; const br=[]; const node=p3[p3.length-1];
  M.FLOORS[3].doors.forEach(d=>{ if(d.orient==='h'&&d.a<X_HALL&&X_HALL<d.b){ const yy=node[1]>d.t1?d.t0-700:d.t1+700; br.push(['trunk',[node,[X_HALL,yy]]]); } });
  wdoors.forEach(d=>{ const yc=(d.a+d.b)/2; br.push(['west',[[X_HALL,yc],[d.t0-500,yc]]]); }); return [p1,p2,p3,br]; }
const plen=(pts)=>{ let s=0; for(let i=0;i+1<pts.length;i++) s+=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]); return s; };
function walkLengths(M,C){ const [p1,p2,p3,br]=resPaths(M,C); const run1=Math.abs(M.STAIR1_TOP-M.STAIR1_FOOT), run2=Math.abs(M.STAIR2_TOP-M.STAIR2_FOOT); const trunk=br.filter(b=>b[0]==='trunk').map(b=>b[1]);
  const res=plen(p1.slice(0,-1))+Math.hypot(run1,M.H1)+plen(p2.slice(0,-1))+Math.hypot(run2,M.H2)+plen(p3)+(trunk.length?plen(trunk[0]):0); return [plen(C.CUS),res]; }
const pathA=(svg,pts,o)=>polylineArrow(svg,pts,INK,W_THEME,Object.assign({startDot:true},o||{}));
const CIRC={ n:'2', name:'動線', title:'動線　路地から土間へ、階段で上の階へ（ダイアグラム）', planNames:true, skipNames:['廊下'],
  plan({M,C,svg},v,fno){ const [p1,p2,p3,br]=resPaths(M,C); const XS=C.XS;
    if(fno===1){ pathA(svg,v.pts([[C.X_DOMA,-1900]].concat(p1.slice(1)))); pathA(svg,v.pts([[C.CUS[0][0],-1900],C.CUS[1]]),{dash:DASH}); svg.text(v.px(C.X_DOMA)+1.2,v.py(-1900)+0.7,'住む人',T_S,{halo:true}); svg.text(v.px(C.CUS[0][0])-1.2,v.py(-1900)+0.7,'客',T_S,{anchor:'end',halo:true}); svg.text(v.px(C.CUS[1][0])+1.2,v.py(C.CUS[1][1])+0.7,'土間まで',T_S,{halo:true}); svg.text(v.px(M.STAIR_X0-150),v.py(C.CUT1)+0.7,'2階へ',T_S,{anchor:'end',halo:true}); }
    else if(fno===2){ pathA(svg,v.pts(p2)); pathA(svg,v.pts([[C.X_HALL,5000],[1000,5000],[1000,2900]]),{startDot:false}); svg.text(v.px(XS)-1.2,v.py(p2[0][1])+0.7,'1階から',T_S,{anchor:'end',halo:true}); svg.text(v.px(M.STAIR_X0-150)-6.0,v.py(C.CUT2)+0.7,'3階へ',T_S,{anchor:'end',halo:true}); svg.text(v.px(2500),v.py(5000)-1.0,'居間へ',T_S,{anchor:'middle',halo:true}); }
    else { pathA(svg,v.pts(p3),{head:false}); br.forEach(b=>pathA(svg,v.pts(b[1]),{startDot:false})); svg.text(v.px(XS)-1.2,v.py(p3[0][1])+0.7,'2階から',T_S,{anchor:'end',halo:true}); } },
  under({M,C,svg},v){ const D=C.D, oR=600, oC=1100, y0=-1000; const f1=M.STAIR1_FOOT, t1=M.STAIR1_TOP, f2=M.STAIR2_FOOT, t2=M.STAIR2_TOP;
    const res=[[y0,M.GL+oR],[M.WALL_S0,M.GL+oR],[M.WALL_S0,M.FL1+oR],[f1-D*300,M.FL1+oR],[f1,M.FL1+oR],[t1,M.FL2+oR],[t1+D*600,M.FL2+oR],[f2-D*300,M.FL2+oR],[f2,M.FL2+oR],[t2,M.FL3+oR],[t2+D*600,M.FL3+oR],[2600,M.FL3+oR]]; pathA(svg,v.pts(res));
    pathA(svg,v.pts([[y0,M.GL+oC],[M.WALL_S0,M.GL+oC],[M.WALL_S0,M.FL1+oC],[3800,M.FL1+oC]]),{dash:DASH}); },
  section({M,C,svg},v){ svg.text(v.px(-1000)+1.2,v.py(M.GL+600)+0.7,'住む人',T_S,{halo:true}); svg.text(v.px(-1000)+1.2,v.py(M.GL+1100)+0.7,'客',T_S,{halo:true}); const D=C.D; svg.text(v.px(M.STAIR2_FOOT-D*300)+(D>0?1.0:-1.0),v.py(M.FL2+600)-1.2,'北で折り返して次の段へ',T_S,{anchor:D>0?'start':'end',halo:true});
    [[2300,M.FL1+2000,(M.FLOORS[1].rooms.find(r=>r.zone==='pub')||{name:'土間'}).name],[2300,M.FL2+1900,(M.FLOORS[2].rooms.find(r=>r.zone==='com')||{name:'居間・食堂・台所'}).name]].forEach(([y,z,s])=>svg.text(v.px(y),v.py(z),s,T_S,{anchor:'middle',halo:true})); },
  block({M,C,svg},v){ const y=M.ALLEY_C; svg.line(v.px(-M.ROAD.west),v.py(y),v.px(M.BLOCK_W+M.ROAD.east),v.py(y),INK,W_THEME); for(let k=0;k<M.UNITS;k++){ const x=M.unitX(k)+C.X_DOMA; polylineArrow(svg,v.pts([[x,y],[x,3200]]),INK,W_THEME); }
    svg.text(v.px(M.UNIT_X0+M.UNITS*M.LOT_W/2),v.py(-2250)+0.8,M.UNITS+' 住戸の入口は路地だけ',T_S,{anchor:'middle',halo:true}); svg.text(v.px(-M.ROAD.west/2),v.py(y)-1.0,'通りへ',T_S,{anchor:'middle',halo:true}); svg.text(v.px(M.BLOCK_W+M.ROAD.east/2),v.py(y)-1.0,'通りへ',T_S,{anchor:'middle',halo:true}); },
  numbers({M,C}){ const [c,r]=walkLengths(M,C); return [['客の歩く長さ',fmt(c/1000,1)+' m','路地の中心から土間の中ほどまで'],['住む人の歩く長さ',fmt(r/1000,1)+' m','路地の中心から 3 階の南の寝室まで（階段は斜辺）'],['階段 1→2 階',M.N1+' 段','蹴上 '+Math.round(M.H1/M.N1)+'・踏面 '+M.TREAD+'・幅 '+M.STAIR_W],['階段 2→3 階',M.N2+' 段','蹴上 '+Math.round(M.H2/M.N2)+'・踏面 '+M.TREAD+'・幅 '+M.STAIR_W],['住戸の入口','1 か所','路地の側だけ（北は境界まで '+fmt((M.LOT_D-M.WALL_N1)/1000,1)+' m）']]; },
  paras({M}){ return ['客（破線）は路地から土間までで止まり、住む人（実線）は土間の奥から東の界壁沿いの直階段を 2 度上がる。階段は同じ向きに重ねたので（1→2 階 '+M.N1+' 段、2→3 階 '+M.N2+' 段）、2 階と 3 階では北の上がり口から階段の脇を戻って次へ進む。断面の動線は奥（東）の廊下を通る所が手前の間仕切りに隠れる。'+M.UNITS+' 住戸とも入口は路地の 1 つだけ。黒丸は出発の点、矢じりは人の移動にだけ付けた。',tail()]; } };

/* ── 3 光と風 ── */
function patchRects(M,C,fno,alt){ const o=C.southOpening(fno); const fl=M.FLOORS[fno].fl; const p=M.sunPatch(fl,o.sill,o.head,alt?null:C.ZS,null,alt); if(!p) return []; const [near,far]=p; let xs=new Set([o.a,o.b]);
  M.FLOORS[fno].parts.forEach(q=>{ const [x0,y0,x1,y1]=q.rect; if((x1-x0)>=(y1-y0)&&y0>near){ [x0,x1].forEach(x=>{ if(o.a<x&&x<o.b) xs.add(x); }); } }); xs=Array.from(xs).sort((a,b)=>a-b); const out=[];
  for(let i=0;i+1<xs.length;i++){ const a=xs[i], b=xs[i+1]; const y1=Math.min(far,M.firstWallNorth(fno,(a+b)/2,near)); if(out.length&&Math.abs(out[out.length-1][3]-y1)<1) out[out.length-1]=[out[out.length-1][0],near,b,y1]; else out.push([a,near,b,y1]); } return out; }
const patchAtSection=(M,C,fno,alt)=>{ for(const [a,y0,b,y1] of patchRects(M,C,fno,alt)) if(a<=M.SECTION_X&&M.SECTION_X<=b) return [y0,y1]; return null; };
const patchDepthMax=(M,C,fno,alt)=>{ const r=patchRects(M,C,fno,alt); return r.length?Math.max(...r.map(q=>q[3]-q[1])):0; };
function ray(svg,v,yHit,zHit,t,o){ o=o||{}; const yFar=o.yFar==null?-20000:o.yFar; const zFar=zHit+(yHit-yFar)*t; const p0=v.pt(yFar,zFar); const p1=o.yEnd==null?v.pt(yHit,zHit):v.pt(o.yEnd,o.zEnd); svg.line(p0[0],p0[1],p1[0],p1[1],INK,o.w==null?W_THIN:o.w); }
function angle(svg,v,y,z,deg,r,label,above,sub){ const [x0,y0]=v.pt(y,z); svg.line(x0,y0,x0+r+2.0,y0,INK,W_FINE); const a=deg*Math.PI/180; const x1=x0+r*Math.cos(a), y1=y0-r*Math.sin(a); svg.path('M'+(x0+r).toFixed(3)+' '+y0.toFixed(3)+'A'+r.toFixed(3)+' '+r.toFixed(3)+' 0 0 0 '+x1.toFixed(3)+' '+y1.toFixed(3),{stroke:INK,w:W_FINE});
  if(above) svg.text(x0+r+2.6,y0-0.9,label,T_S,{halo:true}); else { const am=a/2; const tx=x0+(r+1.0)*Math.cos(am)+0.8, ty=y0-(r+1.0)*Math.sin(am)+0.8; svg.text(tx,ty,label,T_S,{halo:true}); if(sub) svg.text(tx,ty+T_S*1.35,sub,T_S,{halo:true}); } }
function windRoutes(M,C,fno){ const F=M.FLOORS[fno]; const norths=F.openings.filter(o=>o.wall==='N'); const S=C.southOpening(fno); const out=[]; const xin=(x)=>Math.min(Math.max(x,S.a+300),S.b-300); const X_HALL=C.X_HALL;
  norths.forEach(w=>{ const xc=(w.a+w.b)/2; let room=null; F.rooms.forEach(r=>{ const [x0,y0,x1,y1]=bbox(r.poly); if(x0<=xc&&xc<=x1&&y1>=M.WALL_N0-10&&['pub','com','pri','srv'].indexOf(r.zone)>=0) room=r; }); if(!room||room.zone==null) return;
    const d1=F.doors.filter(d=>d.orient==='h'&&d.a<X_HALL&&X_HALL<d.b);
    if(fno===3&&d1.length){ const ytop=M.WALL_N0-650; if(room.zone==='srv') out.push([[X_HALL,-2300],[X_HALL,ytop],[xc,ytop],[xc,9500]]); else { const dw=F.doors.filter(d=>d.orient==='v'&&X_HALL-1200<d.t0&&d.t0<X_HALL&&d.a<=ytop&&ytop<=d.b); if(dw.length) out.push([[X_HALL,ytop],[xc,ytop],[xc,9500]]); } return; }
    if(room.zone==='srv'&&fno===1) return;
    const crosses=(x)=>F.parts.filter(p=>(p.rect[2]-p.rect[0])>=(p.rect[3]-p.rect[1])&&p.rect[0]<x&&x<p.rect[2]);
    if(S.a<xc&&xc<S.b&&!crosses(xc).length){ out.push([[xc,-2300],[xc,9500]]); return; }
    let lo=w.a, hi=w.b; crosses(xc).forEach(p=>{ const ds=F.doors.filter(d=>d.part===p.id); if(ds.length){ lo=Math.max(lo,Math.max(...ds.map(d=>d.a))); hi=Math.min(hi,Math.min(...ds.map(d=>d.b))); } else { lo=1; hi=0; } });
    if(lo<hi&&S.a<(lo+hi)/2&&(lo+hi)/2<S.b){ const xm=(lo+hi)/2; out.push([[xm,-2300],[xm,9500]]); } else { const ytop=M.WALL_N0-650; const x0=xin(X_HALL); out.push([[x0,-2300],[x0,ytop],[xc,ytop],[xc,9500]]); } });
  return out; }
function freeSpot(M,fno,cands,w,h,routes){ const boxes=[]; M.FLOORS[fno].rooms.forEach(r=>{ if(r.label){ const [lx,ly]=r.label; const tw=textWidth(r.name,T_S)*100; boxes.push([lx-tw/2-100,ly-150,lx+tw/2+100,ly+250]); } }); M.FLOORS[fno].fixtures.forEach(fx=>{ if(fx.rect&&!fx.upper) boxes.push(fx.rect); });
  routes.forEach(r=>{ for(let i=0;i+1<r.length;i++){ const [xa,ya]=r[i], [xb,yb]=r[i+1]; boxes.push([Math.min(xa,xb)-80,Math.min(ya,yb)-80,Math.max(xa,xb)+80,Math.max(ya,yb)+80]); } });
  for(const [cx,cy] of cands){ const bx=[cx-w/2,cy-h/2,cx+w/2,cy+h/2]; if(!boxes.some(q=>bx[0]<q[2]&&q[0]<bx[2]&&bx[1]<q[3]&&q[1]<bx[3])) return [cx,cy]; } return cands[0]; }
const LIGHT={ n:'3', name:'光と風', title:'光と風　南の路地からの採光と通風（ダイアグラム）', planNames:true,
  plan({M,C,svg},v,fno){ const rects=patchRects(M,C,fno); const routes=windRoutes(M,C,fno); rects.forEach(([a,y0,b,y1])=>svg.stipple(v.pts(rect(a,y0,b,y1)),0.85,0.16));
    if(rects.length){ const cands=[]; rects.slice().reverse().forEach(([a,y0,b,y1])=>{ [y1-450,y0+450,(y0+y1)/2].forEach(cy=>{ [b-650,(a+b)/2,a+650].forEach(cx=>cands.push([cx,cy])); }); }); const [cx,cy]=freeSpot(M,fno,cands,1000,650,routes); lbl2(svg,v.px(cx),v.py(cy+130),[['日だまり',700]],'奥行 '+fmt(patchDepthMax(M,C,fno)/1000,1)+' m'); }
    else svg.text(v.px(1700),v.py(1900)+0.7,'冬至 12 時の直射なし',T_S,{anchor:'middle',halo:true});
    routes.forEach(r=>polylineArrow(svg,v.pts(r),INK,W_THEME,{dash:DOT,cap:'round'})); const starts=routes.map(r=>r[0]).filter(s=>s[1]<0);
    if(starts.length){ const x0=Math.min(...starts.map(s=>s[0])); if(Math.abs(x0-M.SECTION_X)<700) svg.text(v.px(x0)+1.2,v.py(-1700)+0.7,'風',T_S,{halo:true}); else svg.text(v.px(x0)-1.2,v.py(-2300)+0.7,'風',T_S,{anchor:'end',halo:true}); }
    if(fno===3){ const sky=M.FLOORS[3].fixtures.filter(fx=>fx.type==='skylight'); if(sky.length){ const [x0,y0,x1,y1]=sky[0].rect; svg.text(v.px((x0+x1)/2),v.py((y0+y1)/2)+0.7,'天窓',T_S,{anchor:'middle',halo:true}); } } },
  under({M,svg},v){ for(const k of [1,2,3]){ const z=M.FLOORS[k].fl+1500; polylineArrow(svg,v.pts([[-2300,z],[10200,z]]),INK,W_THEME,{dash:DOT,cap:'round'}); } },
  section({M,C,svg},v){ const p2=patchAtSection(M,C,2), p3=patchAtSection(M,C,3); const o2=C.southOpening(2), o3=C.southOpening(3); v.clip(svg);
    ray(svg,v,M.NB_TIP_Y,M.NB_TIP_Z,C.T_W,{w:W_THEME,yEnd:M.WALL_S0,zEnd:C.ZS});
    if(p2){ ray(svg,v,M.WALL_S0,C.ZS,C.T_W,{yFar:M.WALL_S0,yEnd:p2[0],zEnd:M.FL2}); ray(svg,v,M.WALL_S0,M.FL2+o2.head,C.T_W,{yEnd:p2[1],zEnd:M.FL2}); }
    if(p3){ const ze=M.FL3+o3.head-(p3[1]-M.WALL_S0)*C.T_W; ray(svg,v,M.WALL_S0,M.FL3+o3.head,C.T_W,{yEnd:p3[1],zEnd:Math.max(ze,M.FL3)}); ray(svg,v,M.WALL_S1,M.FL3+o3.sill,C.T_W,{yEnd:p3[0],zEnd:M.FL3}); }
    [[M.FL2,o2],[M.FL3,o3]].forEach(([fl,o])=>ray(svg,v,M.WALL_S0,fl+o.head,C.T_SU,{yEnd:M.WALL_S0+o.head/C.T_SU,zEnd:fl})); svg.groupEnd();
    [[p2,M.FL2],[p3,M.FL3]].forEach(([p,fl])=>{ if(p){ svg.line(v.px(p[0]),v.py(fl)-0.35,v.px(p[1]),v.py(fl)-0.35,INK,0.7); svg.text(v.px((p[0]+p[1])/2),v.py(fl)-1.4,'日だまり 奥行 '+fmt((p[1]-p[0])/1000,1)+' m',T_S,{anchor:'middle',halo:true}); } });
    const [hx,hy]=v.pt(M.WALL_S0,C.ZS); svg.line(hx,hy,hx+3.0,hy,INK,W_THIN); svg.text(hx+3.6,hy+0.7,'+'+nf(C.ZS_R)+'　冬至の日影の線',T_S,{halo:true});
    angle(svg,v,M.NB_TIP_Y,M.NB_TIP_Z,M.SUN_WINTER,13.0,'冬至 南中 '+C.W_DEG+'°',false,'軒先をかすめる光'); angle(svg,v,M.WALL_S0,M.FL3+o3.head,M.SUN_SUMMER,5.0,'夏至 南中 '+C.S_DEG+'°',true);
    svg.text(v.px(2700),v.py(M.FL1+2050),'冬至の南中は直射なし（路地の照り返し）',T_S,{anchor:'middle',halo:true}); for(const k of [1,2,3]) svg.text(v.px(-2300),v.py(M.FLOORS[k].fl+1500)-1.2,'風',T_S,{halo:true}); svg.text(v.px(10300),v.py(M.FL3+1500)-1.2,'北の窓から',T_S,{anchor:'middle',halo:true}); },
  block({M,C,svg},v){ const r1=windRoutes(M,C,1); for(let k=0;k<M.UNITS;k++) r1.forEach(r=>{ const x=M.unitX(k)+r[0][0]; polylineArrow(svg,v.pts([[x,-2300],[x,9500]]),INK,W_THEME,{dash:DOT,cap:'round'}); });
    if(r1.length) svg.text(v.px(M.unitX(0)+r1[0][0][0])-1.0,v.py(-2300)+2.2,'風',T_S,{anchor:'end',halo:true}); const xd=M.UNIT_X0-900; const y0=v.py(M.S_NEIGHBOR_Y), y1=v.py(M.WALL_S0); svg.line(v.px(xd),y0,v.px(xd),y1,INK,W_FINE); [y0,y1].forEach(yy=>svg.line(v.px(xd)-0.6,yy+0.6,v.px(xd)+0.6,yy-0.6,INK,W_THIN)); svg.text(v.px(xd)-1.0,(y0+y1)/2+0.7,fmt((M.WALL_S0-M.S_NEIGHBOR_Y)/1000,2)+' m',T_S,{anchor:'end',halo:true}); },
  numbers({M,C}){ const p2=patchAtSection(M,C,2), p3=patchAtSection(M,C,3); const dep=(p)=>p?fmt((p[1]-p[0])/1000,1):'0';
    return [['冬至の南中高度',C.W_DEG+'°','90° − 緯度 '+M.LAT_DEG+'° − 23.44°'],['夏至の南中高度',C.S_DEG+'°','90° − 緯度 '+M.LAT_DEG+'° ＋ 23.44°'],['冬至の日影の線（南の外壁）','GL+'+nf(C.ZS_R),'軒先 '+nf(M.NB_TIP_Z)+' − '+nf(M.WALL_S0-M.NB_TIP_Y)+' × tan '+C.W_DEG+'°'],["冬至 12 時の日だまり 2 階／3 階",dep(p2)+'／'+dep(p3)+' m',"A-A' の線の上。まぐさの外の角と窓台・日影の線の間"],['夏至 12 時の日だまり 2 階',fmt(patchDepthMax(M,C,2,M.SUN_SUMMER)/1000,1)+' m','同じ求め方（夏は窓際だけ）'],['北の隣家まで',fmt((M.N_NEIGHBOR_Y-M.WALL_N1)/1000,1)+' m','北の窓から風が抜ける空き']]; },
  paras({M,C}){ return ['冬至の南中（'+C.W_DEG+'°）で、日は南の木造の軒先（GL+'+nf(M.NB_TIP_Z)+'）をかすめて外壁の +'+nf(C.ZS_R)+' から上に当たり、2 階の床に奥行 '+fmt(patchDepthMax(M,C,2)/1000,1)+' m、3 階に奥行 '+fmt(patchDepthMax(M,C,3)/1000,1)+' m（最大）の日だまりをつくる。1 階の土間には直射が届かない。風（点線）は三つの階とも南の開口から戸を通って北の窓へ抜ける。断面の風は奥（東）の戸と窓を通る経路で、手前の壁に隠れる所は描かない。南中高度は北緯 '+M.LAT_DEG+'° として計算した。',tail()]; } };

/* ── 4 延焼 ── */
function fireArrow(svg,pts,stop){ svg.poly(pts,false,{stroke:INK,w:W_THEME,dash:DOT,cap:'round'}); const [xa,ya]=pts[pts.length-2], [xb,yb]=pts[pts.length-1]; const ang=Math.atan2(yb-ya,xb-xa); (stop?stopbar:arrowhead)(svg,xb,yb,ang); }
const fireZone=(M,fno)=>{ const d=fno===1?3000:5000; return [M.ALLEY_C+d,M.LOT_D-d]; };
const cen=(h)=>{ const b=bbox(h.poly); return [(b[0]+b[2])/2,(b[1]+b[3])/2]; };
const FIRE={ n:'4', name:'延焼', title:'延焼　耐火の外壁の連続で火の経路を切る（ダイアグラム）', planNames:true, envelope:INK, unitsFill:INK,
  plan({M,svg},v,fno){ const [ys,yn]=fireZone(M,fno); const d=fno===1?3:5; [ys,yn].forEach(yy=>svg.line(v.px(-75),v.py(yy),v.px(M.X[M.X.length-1]+75),v.py(yy),INK,W_THIN,DASH));
    if(fno===1){ svg.text(v.px(4400),v.py(ys)+2.6,'路地中心から '+d+' m',T_S,{anchor:'end',halo:true}); svg.text(v.px(4400),v.py(yn)-1.4,'北の境界から '+d+' m',T_S,{anchor:'end',halo:true}); } else { svg.text(v.px(5550),v.py(ys)+2.4,d+' m',T_S,{halo:true}); svg.text(v.px(5550),v.py(yn)-0.8,d+' m',T_S,{halo:true}); }
    [1300,4100].forEach(x=>fireArrow(svg,[v.pt(x,M.S_NEIGHBOR_Y+100),v.pt(x,M.WALL_S0-60)],true));
    if(fno===1){ svg.text(v.px(2700),v.py(-1000)+0.7,'南の木造からの火',T_S,{anchor:'middle',halo:true}); svg.text(v.px(2700),v.py(250)+0.7,'耐火の外壁で止まる',T_S,{anchor:'middle',halo:true}); svg.text(v.px(2700),v.py(7300)+0.7,'外壁と界壁は耐火',T_S,{anchor:'middle',halo:true}); } },
  section({M,svg},v){ const [s1,n1]=fireZone(M,1), [s2,n2]=fireZone(M,2); [[s1,M.GL,M.FL2],[n1,M.GL,M.FL2],[s2,M.FL2,M.TOP],[n2,M.FL2,M.TOP]].forEach(([yy,z0,z1])=>svg.line(v.px(yy),v.py(z0),v.px(yy),v.py(z1),INK,W_THIN,DASH)); [[s1,s2],[n1,n2]].forEach(([a,b])=>svg.line(v.px(a),v.py(M.FL2),v.px(b),v.py(M.FL2),INK,W_THIN,DASH));
    svg.text(v.px(s1)-0.8,v.py(500),'路地中心から 3 m',T_S,{anchor:'end',halo:true}); svg.text(v.px(n1)+0.8,v.py(500),'北の境界から 3 m',T_S,{halo:true}); svg.text(v.px(s2)+0.8,v.py(9150),'路地中心から 5 m',T_S,{halo:true}); svg.text(v.px(n2)-0.8,v.py(9150),'北の境界から 5 m',T_S,{anchor:'end',halo:true});
    [[1500,1500],[4300,4300],[M.NB_TIP_Z+200,7600]].forEach(([z0,z1])=>fireArrow(svg,v.pts([[M.NB_WALL_Y-100,z0],[M.WALL_S0-80,z1]]),true));
    svg.text(v.px(-5000),v.py(2400),'出火を想定した',T_S,{anchor:'middle',halo:true}); svg.text(v.px(-5000),v.py(2400)+3.0,'南の木造',T_S,{anchor:'middle',halo:true}); svg.text(v.px(-1350),v.py(3000),'耐火の外壁で止まる',T_S,{anchor:'middle',halo:true});
    [[2300,M.FL1+2000,(M.FLOORS[1].rooms.find(r=>r.zone==='pub')||{name:'土間'}).name],[2300,M.FL2+1900,(M.FLOORS[2].rooms.find(r=>r.zone==='com')||{name:'居間・食堂・台所'}).name]].forEach(([y,z,s])=>svg.text(v.px(y),v.py(z),s,T_S,{anchor:'middle',halo:true})); },
  block({M,svg},v){ const s1=M.houses('S1'), n2=M.houses('N2'), n1=M.houses('N1'); const xo=M.unitX(M.UNIT_SHOWN)+M.SECTION_X; let i0=0; s1.forEach((h,i)=>{ if(Math.abs(cen(h)[0]-xo)<Math.abs(cen(s1[i0])[0]-xo)) i0=i; }); const [ox,oy]=cen(s1[i0]); const ya=(h)=>bbox(h.poly)[3]-1800;
    [-1,1].forEach(step=>{ let i=i0; while(i+step>=0&&i+step<s1.length){ const a=s1[i], b=s1[i+step]; const yy=(ya(a)+ya(b))/2; fireArrow(svg,v.pts([[cen(a)[0]+step*900,yy],[cen(b)[0]-step*900,yy]])); i+=step; } });
    const ux0=M.UNIT_X0, ux1=M.UNIT_X0+M.UNITS*M.LOT_W; s1.forEach(h=>{ const cx=cen(h)[0]; if(ux0+600<cx&&cx<ux1-600) fireArrow(svg,v.pts([[cx,M.S_NEIGHBOR_Y+300],[cx,M.WALL_S0-250]]),true); });
    [[0,n1[0]],[1,n1[n1.length-1]]].forEach(([end,h1])=>{ const cx=cen(h1)[0]; const [hx0,hy0,hx1,hy1]=bbox(h1.poly); fireArrow(svg,v.pts([[cx,M.S_NEIGHBOR_Y+300],[cx,hy0+600]])); let tgt=n2[0]; n2.forEach(h=>{ if(Math.abs(cen(h)[0]-cx)<Math.abs(cen(tgt)[0]-cx)) tgt=h; }); fireArrow(svg,v.pts([[cx,hy1-400],[cx,bbox(tgt.poly)[1]+1200]]));
      let j=n2.indexOf(tgt); const step=end===0?1:-1; const yy=bbox(tgt.poly)[1]+3200; while(j+step>=0&&j+step<n2.length){ const a=n2[j], b=n2[j+step]; const rc=b.kind==='fire'; const xEnd=step>0?bbox(b.poly)[0]-250:bbox(b.poly)[2]+250; fireArrow(svg,v.pts([[cen(a)[0]+step*700,yy],[rc?xEnd:cen(b)[0]-step*700,yy]]),rc); if(rc) break; j+=step; } });
    svg.circle(v.px(ox),v.py(oy-1500),0.9,{stroke:null,fill:INK}); svg.text(v.px(ox),v.py(oy-1500)+3.4,'出火（想定）',T_S,{anchor:'middle',halo:true});
    svg.text(v.px((ux0+ux1)/2),v.py(5900)+0.7,'耐火の '+M.UNITS+' 住戸　路地沿いの外壁 '+fmt((ux1-ux0)/1000,1)+' m',T_S,{anchor:'middle',fill:WHITE}); svg.text(v.px((ux0+ux1)/2),v.py(3300)+0.7,'南からの火はこの外壁で止まる',T_S,{anchor:'middle',fill:WHITE});
    n1.forEach(h=>svg.text(v.px(cen(h)[0]),v.py(M.LOT_D+3000),'端を回る',T_S,{anchor:'middle',halo:true})); n2.filter(h=>h.kind==='fire').forEach(h=>svg.text(v.px(cen(h)[0]),v.py(cen(h)[1])+0.7,'既存 RC',T_S,{anchor:'middle',halo:true}));
    const yd=M.BLOCK_N+2400; const ticks=[0,ux0,ux1,M.BLOCK_W]; svg.line(v.px(0),v.py(yd),v.px(M.BLOCK_W),v.py(yd),INK,W_FINE); ticks.forEach(t=>{ const x=v.px(t); svg.line(x-0.6,v.py(yd)+0.6,x+0.6,v.py(yd)-0.6,INK,W_THIN); });
    [[0,ux0,fmt(ux0/1000,1)],[ux0,ux1,'耐火の外壁 '+fmt((ux1-ux0)/1000,1)+' m'],[ux1,M.BLOCK_W,fmt((M.BLOCK_W-ux1)/1000,1)]].forEach(([a,b,s])=>svg.text((v.px(a)+v.px(b))/2,v.py(yd)-0.8,s,T_S,{anchor:'middle',halo:true})); svg.text(v.px(M.BLOCK_W/2),v.py(yd)+2.7,'街区の幅 '+fmt(M.BLOCK_W/1000,0)+' m',T_S,{anchor:'middle',halo:true}); },
  numbers({M}){ const ux1=M.UNIT_X0+M.UNITS*M.LOT_W; return [['耐火の外壁の長さ',fmt(M.UNITS*M.LOT_W/1000,1)+' m',M.UNITS+' 区画 × 間口 '+fmt(M.LOT_W/1000,1)+' m'],['街区の幅／両端に残る木造',fmt(M.BLOCK_W/1000,0)+'／'+fmt(M.UNIT_X0/1000,1)+'・'+fmt((M.BLOCK_W-ux1)/1000,1)+' m','両端の区画は建て替えに入らない'],['外壁から路地の中心まで',fmt((M.WALL_S0-M.ALLEY_C)/1000,1)+' m',nf(-M.ALLEY_C)+' ＋ 後退 '+M.SETBACK],['外壁から北の境界まで',fmt((M.LOT_D-M.WALL_N1)/1000,1)+' m','北の隣家までは '+fmt((M.N_NEIGHBOR_Y-M.WALL_N1)/1000,1)+' m'],['延焼のおそれのある部分','3 m／5 m','路地中心・境界から 1 階／2 階以上（建築基準法 2 条 6 号）']]; },
  paras({M}){ return [M.UNITS+' 住戸の耐火の外壁と界壁が路地沿いに '+fmt(M.UNITS*M.LOT_W/1000,1)+' m 続くと、南の木造から北へ向かう火の経路（点線）は路地で切れる（短い棒が止まる所）。ただし街区の両端の '+fmt(M.UNIT_X0/1000,1)+' m と '+fmt((M.BLOCK_W-M.UNIT_X0-M.UNITS*M.LOT_W)/1000,1)+' m には木造が残り、端を回る経路は北の列の既存の RC まで続く。外壁は路地中心から '+fmt((M.WALL_S0-M.ALLEY_C)/1000,1)+' m、北の境界から '+fmt((M.LOT_D-M.WALL_N1)/1000,1)+' m で、どの階も延焼のおそれのある部分（破線の内側）に入る。黒は耐火の外壁・界壁・床。',tail()]; } };

const THEMES={zoning:ZONING,circulation:CIRC,light_wind:LIGHT,fire:FIRE,'1':ZONING,'2':CIRC,'3':LIGHT,'4':FIRE,'ゾーニング':ZONING,'動線':CIRC,'光と風':LIGHT,'延焼':FIRE};
MINE.diagram=function(m,kind,opt){ const th=THEMES[kind||'zoning']||ZONING; const M=diagModel(m,opt||{}); if(!M.FLOORS[1]||!M.FLOORS[2]||!M.FLOORS[3]) throw new Error('ダイアグラムには 3 つの階が要る'); return build(M,th).toSvg(); };
MINE.diagramKinds=()=>[['zoning','ゾーニング'],['circulation','動線'],['light_wind','光と風'],['fire','延焼']];
A.site.diagModel=diagModel; A.site.diagramDoc=(m,kind,opt)=>build(diagModel(m,opt||{}),THEMES[kind]||ZONING);
install(A.views);
window.__gnotoArchSitePart3={P1,P2};
})();

/* ══════════════════════════════════════════════════════════════════════════════
   第 4 部：モデルから描く配置図・街区図・ダイアグラム（2026-10-25 S-C。ELEMENTS.md「決め打ちを外す」）
   第 1〜3 部の見本の街区（路地の北側の 9 区画）は、見本の住戸（SPEC §4：路地・隣家 3 方・通り芯 2,700 の 3 階）にだけ使う。
   それ以外のモデル（ショーダン邸・ロンシャン・利用者の建物）は、site.polygon・roads・neighbors・north_deg・setback と
   levels・walls（model.wallJoin）・columns・ramps・screens・roofs（孔）・rooms・openings・stairs から描く。無いものは描かない。
   ══════════════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';
const P3=window.__gnotoArchSitePart3; if(!P3) return; delete window.__gnotoArchSitePart3;
const {P1,P2}=P3;
const {A,MINE,install,Doc,View,INK,GREY,ACCENT,PAPER,T_S,T_M,T_NOTE,T_NAME,T_TITLE,W,f,fmt,fmtN,textWidth,tint,rect,bbox,polyArea,dimH,dimV,northArrow,scaleBar,arrowOpen,treePlan}=P1;
const {SVG,PlanView,arrowhead,stopbar,polylineArrow,W_THEME,W_THIN,W_FINE,DASH,DOT}=P2;
const nf=(v)=>Math.round(v).toLocaleString('en-US');
const arr=(x)=>Array.isArray(x)?x:[];
const num=(v,d)=>{ const n=+v; return isFinite(n)?n:d; };
const DIRV={N:[0,1],S:[0,-1],E:[1,0],W:[-1,0]}, DIRJA={N:'北',S:'南',E:'東',W:'西'};
const mdl=()=>A.model||{};

/* 見本の街区を使うか：見本の住戸（SPEC §4）そのもののときだけ */
function blockLike(m){
  const s=(m&&m.site)||{}; if(s.block==='sample') return true; if(s.block===false) return false;
  const r=(s.roads||[])[0]; if(!(r&&r.width>0)||(s.neighbors||[]).length<3) return false;
  const gx=((m.grid||{}).x||[]).map(g=>g.at).sort((a,b)=>a-b), gy=((m.grid||{}).y||[]).map(g=>g.at).sort((a,b)=>a-b);
  const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>Math.abs(v-b[i])<1);
  return eq(gx,[0,2700,5400])&&eq(gy,[0,2700,5400,8100])&&(m.levels||[]).length===3;
}

/* ── モデルの読み取り ── */
function levelsOf(m){ return arr(m.levels).filter(l=>l&&isFinite(+l.fl)).slice().sort((a,b)=>a.fl-b.fl); }
function wallPolys(m,lid){
  const M=mdl(); const ws=arr(m.walls).filter(w=>w.level===lid&&w.a&&w.b&&w.t>0);
  if(typeof M.wallJoin==='function'){ try{ const J=M.wallJoin(m,lid); if(J&&J.length) return J.map(j=>({wall:j.wall||ws.find(w=>w.id===j.id)||{},polygon:j.polygon})); }catch(_){} }
  return ws.map(w=>{ let pg=null; try{ pg=M.wallPolygon?M.wallPolygon(w):null; }catch(_){} if(!pg){ const h=w.t/2, dx=w.b[0]-w.a[0], dy=w.b[1]-w.a[1], L=Math.hypot(dx,dy)||1, nx=-dy/L*h, ny=dx/L*h; pg=[[w.a[0]+nx,w.a[1]+ny],[w.b[0]+nx,w.b[1]+ny],[w.b[0]-nx,w.b[1]-ny],[w.a[0]-nx,w.a[1]-ny]]; } return {wall:w,polygon:pg}; });
}
function footprint(m){ // 全階の壁・柱・屋根の外接（mm）
  const pts=[]; arr(m.walls).forEach(w=>{ if(w.a&&w.b){ pts.push(w.a,w.b); } }); arr(m.columns).forEach(c=>{ if(c.at) pts.push(c.at); }); arr(m.roofs).forEach(r=>arr(r.polygon).forEach(p=>pts.push(p)));
  arr(m.screens).forEach(s=>{ if(s.a&&s.b) pts.push(s.a,s.b); });
  if(!pts.length){ (m.grid&&m.grid.x||[]).forEach(gx=>(m.grid.y||[]).forEach(gy=>pts.push([gx.at,gy.at]))); }
  if(!pts.length) return [0,0,5400,8100]; return bbox(pts);
}
function sitePoly(m){ const s=m.site||{}; if(arr(s.polygon).length>=3) return s.polygon.map(p=>[+p[0],+p[1]]); return null; }
function roadInfo(m){ // 道路ごとの多角形（境界の辺から幅の分だけ外）と名前
  const s=m.site||{}, poly=sitePoly(m); if(!poly) return [];
  const c=bbox(poly), cx=(c[0]+c[2])/2, cy=(c[1]+c[3])/2; const out=[];
  arr(s.roads).forEach(r=>{ if(!(r&&r.width>0)) return; let a,b,side;
    if(typeof r.edge==='number'){ a=poly[r.edge%poly.length]; b=poly[(r.edge+1)%poly.length]; }
    else if(typeof r.edge==='string'&&DIRV[r.edge]){ side=r.edge; const d=DIRV[side]; // 外接の辺
      if(d[0]) { a=[d[0]>0?c[2]:c[0],c[1]]; b=[a[0],c[3]]; } else { a=[c[0],d[1]>0?c[3]:c[1]]; b=[c[2],a[1]]; } }
    else return;
    const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2; const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1; let nx=-dy/L, ny=dx/L; if((mx-cx)*nx+(my-cy)*ny<0){ nx=-nx; ny=-ny; }
    if(!side) side=Math.abs(nx)>Math.abs(ny)?(nx>0?'E':'W'):(ny>0?'N':'S');
    const ext=4000; const ea=[a[0]-dx/L*ext,a[1]-dy/L*ext], eb=[b[0]+dx/L*ext,b[1]+dy/L*ext];
    out.push({r,name:r.name||(r.width<4000?'路地':'道路'),side,a,b,n:[nx,ny],poly:[ea,eb,[eb[0]+nx*r.width,eb[1]+ny*r.width],[ea[0]+nx*r.width,ea[1]+ny*r.width]],center:[[ea[0]+nx*r.width/2,ea[1]+ny*r.width/2],[eb[0]+nx*r.width/2,eb[1]+ny*r.width/2]]}); });
  return out;
}
function neighborInfo(m,depth){ const s=m.site||{}, poly=sitePoly(m); if(!poly) return []; const c=bbox(poly); depth=depth||6000; const roads=roadInfo(m); const out=[];
  arr(s.neighbors).forEach(n=>{ const side=n&&n.side; if(!DIRV[side]) return; const off=(roads.find(r=>r.side===side)||{r:{width:0}}).r.width||0; const g=300;
    const d=DIRV[side]; let p; if(d[0]){ const x0=d[0]>0?c[2]+off+g:c[0]-off-g; p=[[x0,c[1]+g],[x0+d[0]*depth,c[1]+g],[x0+d[0]*depth,c[3]-g],[x0,c[3]-g]]; } else { const y0=d[1]>0?c[3]+off+g:c[1]-off-g; p=[[c[0]+g,y0],[c[2]-g,y0],[c[2]-g,y0+d[1]*depth],[c[0]+g,y0+d[1]*depth]]; }
    out.push({n,side,poly:p,kind:n.kind||'隣家'}); });
  return out; }
function entrances(m){ // 最下階の外壁の戸・掃き出し（出入口の候補）：壁の外側の点と向き
  const ls=levelsOf(m); if(!ls.length) return []; const lid=ls[0].id; const M=mdl(); const fp=footprint(m); const cx=(fp[0]+fp[2])/2, cy=(fp[1]+fp[3])/2; const out=[];
  arr(m.openings).forEach(o=>{ const w=arr(m.walls).find(x=>x.id===o.wall); if(!w||w.level!==lid||w.kind==='partition'||!(o.type==='door'||o.type==='sweep'||o.type==='slide')) return; if(o.sill>50) return;
    const dx=w.b[0]-w.a[0], dy=w.b[1]-w.a[1], L=Math.hypot(dx,dy)||1; const u=(o.at||0)+(o.width||0)/2; const p=[w.a[0]+dx/L*u,w.a[1]+dy/L*u]; let n=[-dy/L,dx/L]; if((p[0]-cx)*n[0]+(p[1]-cy)*n[1]<0) n=[-n[0],-n[1]];
    out.push({o,w,p,n,width:o.width||0}); });
  void M; return out.sort((a,b)=>b.width-a.width); }
function stairArrowPts(st){ const d=DIRV[st.dir]||[0,1]; const run=Math.max(1,(st.n-1))*(st.tread||250); const o=st.origin||[0,0]; const w=st.width||900; const side=[-d[1],d[0]]; // origin は上る向きに見て左の端
  const c0=[o[0]-side[0]*w/2,o[1]-side[1]*w/2]; return [c0,[c0[0]+d[0]*run,c0[1]+d[1]*run]]; }
function roofHoles(r){ const M=mdl(); try{ if(M.roofHoles) return M.roofHoles(r).filter(h=>h&&h.length>=3); }catch(_){} return []; }
function zoneOf(r){ const nm=String(r.name||''); const id=String(r.id||'');
  if(/斜路|吹抜|孔|階段|エレベータ|昇降/.test(nm)||/VOID|RAMP|-ST$/.test(id)) return null;
  if(/土間|店|作業|玄関|ホール|入口|内陣|身廊|礼拝|テラス|屋上|庭|ピロティ|縁/.test(nm)) return 'pub';
  if(/居間|食堂|台所|応接|客間|客室|LDK|リビング|ダイニング|サロン|書庫|図書/.test(nm)) return 'com';
  if(/寝室|浴室|洗面|化粧|物入|書斎|和室|子供|衣裳|納戸|小礼拝/.test(nm)) return 'pri';
  if(/便所|WC|トイレ|廊下|配膳|聖具|倉庫|機械|塔/.test(nm)) return 'srv';
  return 'srv'; }
const ZONE_WORD={pub:'公',com:'共',pri:'私',srv:'奉仕'}, HATCH={pub:0.9,com:1.8,pri:3.6};
function roomCentroid(p){ let A=0,cx=0,cy=0; for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], g=a[0]*b[1]-b[0]*a[1]; A+=g; cx+=(a[0]+b[0])*g; cy+=(a[1]+b[1])*g; } if(Math.abs(A)<1e-9){ const b=bbox(p); return [(b[0]+b[2])/2,(b[1]+b[3])/2]; } return [cx/(3*A),cy/(3*A)]; }
function wrapJa(s,width,size){ const lines=[]; let cur=''; for(const ch of String(s)){ if(textWidth(cur+ch,size)>width&&cur){ if('、。）」，．・'.indexOf(ch)>=0){ lines.push(cur+ch); cur=''; continue; } lines.push(cur); cur=ch; } else cur+=ch; } if(cur) lines.push(cur); return lines; }
function structShort(m){ const s=String(m.structure||'').split(/[。（(]/)[0]; return s.slice(0,16); }

/* ── 建物の平面の下図（1 階ごと）：壁（接合した多角形）・柱・吹抜・斜路・ブリーズ・ソレイユ・室の輪郭 ── */
function planBase(svg,v,m,lid,o){
  o=o||{}; const env=o.env||GREY, g=GREY; const M=mdl(); const fl=levelsOf(m).find(l=>l.id===lid);
  arr(m.rooms).filter(r=>r.level===lid&&arr(r.polygon).length>=3).forEach(r=>svg.poly(v.pts(r.polygon),true,{stroke:g,w:W_FINE,fill:o.roomFill||'none'}));
  if(o.voids!==false) arr(m.voids).forEach(x=>{ if(!x||arr(x.polygon).length<3) return; let on=x.level===lid; try{ if(M.coversLevel) on=M.coversLevel(m,x,lid); }catch(_){} if(on) svg.poly(v.pts(x.polygon),true,{stroke:g,w:W_THIN,dash:'1.2 0.6'}); });
  arr(m.ramps).forEach(r=>{ if(r.level!==lid||arr(r.path).length<2) return; let G=null; try{ G=M.rampGeom?M.rampGeom(m,r):null; }catch(_){} if(G&&G.left&&G.right){ svg.poly(v.pts(G.left),false,{stroke:g,w:W_FINE}); svg.poly(v.pts(G.right),false,{stroke:g,w:W_FINE}); } else { const w=r.width||1000; for(let i=0;i+1<r.path.length;i++){ const a=r.path[i], b=r.path[i+1]; const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, nx=-dy/L*w/2, ny=dx/L*w/2; svg.line(v.px(a[0]+nx),v.py(a[1]+ny),v.px(b[0]+nx),v.py(b[1]+ny),g,W_FINE); svg.line(v.px(a[0]-nx),v.py(a[1]-ny),v.px(b[0]-nx),v.py(b[1]-ny),g,W_FINE); } } });
  arr(m.stairs).forEach(s=>{ if(s.from!==lid||!s.origin) return; const [p,q]=stairArrowPts(s); const d=DIRV[s.dir]||[0,1], w=s.width||900, side=[-d[1],d[0]]; for(let i=0;i<s.n-1;i++){ const t=(s.tread||250)*i; const a=[s.origin[0]+d[0]*t,s.origin[1]+d[1]*t]; svg.line(v.px(a[0]),v.py(a[1]),v.px(a[0]-side[0]*w),v.py(a[1]-side[1]*w),g,W_FINE); } void p; void q; });
  arr(m.screens).forEach(s=>{ if(s.level!==lid||!s.a||!s.b) return; let G=null; try{ G=M.screenGeom?M.screenGeom(m,s):null; }catch(_){} const dx=s.b[0]-s.a[0], dy=s.b[1]-s.a[1], L=Math.hypot(dx,dy)||1; const fp=footprint(m); let n=[-dy/L,dx/L]; const mx=(s.a[0]+s.b[0])/2, my=(s.a[1]+s.b[1])/2; if((mx-(fp[0]+fp[2])/2)*n[0]+(my-(fp[1]+fp[3])/2)*n[1]<0) n=[-n[0],-n[1]]; const d=s.depth||600;
    svg.poly(v.pts([s.a,s.b,[s.b[0]+n[0]*d,s.b[1]+n[1]*d],[s.a[0]+n[0]*d,s.a[1]+n[1]*d]]),true,{stroke:g,w:W_FINE}); const pitch=s.pitch||900; for(let u=pitch;u<L;u+=pitch){ const p=[s.a[0]+dx/L*u,s.a[1]+dy/L*u]; svg.line(v.px(p[0]),v.py(p[1]),v.px(p[0]+n[0]*d),v.py(p[1]+n[1]*d),g,W_FINE); } void G; });
  arr(m.columns).forEach(c=>{ if(c.level!==lid||!c.at) return; let pg=null; try{ pg=M.columnPolygon?M.columnPolygon(c):null; }catch(_){} if(!pg){ const w=(c.w||400)/2, d=(c.d||c.w||400)/2; pg=[[c.at[0]-w,c.at[1]-d],[c.at[0]+w,c.at[1]-d],[c.at[0]+w,c.at[1]+d],[c.at[0]-w,c.at[1]+d]]; } svg.poly(v.pts(pg),true,{stroke:null,fill:env}); });
  wallPolys(m,lid).forEach(j=>{ const fire=j.wall&&j.wall.kind==='fire'; svg.poly(v.pts(j.polygon),true,{stroke:null,fill:(o.fireAccent&&fire)?ACCENT:env}); });
  // 開口（外壁の）：壁の芯に白い切れ目
  arr(m.openings).forEach(op=>{ const w=arr(m.walls).find(x=>x.id===op.wall); if(!w||w.level!==lid||!w.a||!w.b||w.curve) return; const dx=w.b[0]-w.a[0], dy=w.b[1]-w.a[1], L=Math.hypot(dx,dy)||1; const u0=op.at||0, u1=u0+(op.width||0); if(u1<=u0) return; const n=[-dy/L*(w.t/2+1),dx/L*(w.t/2+1)]; const a=[w.a[0]+dx/L*u0,w.a[1]+dy/L*u0], b=[w.a[0]+dx/L*u1,w.a[1]+dy/L*u1];
    svg.poly(v.pts([[a[0]+n[0],a[1]+n[1]],[b[0]+n[0],b[1]+n[1]],[b[0]-n[0],b[1]-n[1]],[a[0]-n[0],a[1]-n[1]]]),true,{stroke:null,fill:PAPER}); if(op.sill>50){ const t=[dx/L,dy/L]; svg.line(v.px(a[0]),v.py(a[1]),v.px(b[0]),v.py(b[1]),g,W_FINE); void t; } });
  void fl;
}
function roomNames(svg,v,m,lid,o){ o=o||{}; arr(m.rooms).filter(r=>r.level===lid&&arr(r.polygon).length>=3).forEach(r=>{ if(polyArea(r.polygon)<(o.minArea||2.5e6)) return; const c=r.label||roomCentroid(r.polygon); const nm=String(r.name||'').replace(/（.*?）/g,''); if(!nm) return; svg.text(v.px(c[0]),v.py(c[1])+T_S*0.35,nm.length>7?nm.slice(0,7):nm,T_S,{anchor:'middle',halo:true,fill:o.fill||INK}); }); }

/* ══ 配置図（1:200 か 1:500）══ */
function siteSpec(m){
  const poly=sitePoly(m), fp=footprint(m); const s=m.site||{};
  const sb=poly?bbox(poly):[fp[0]-3000,fp[1]-3000,fp[2]+3000,fp[3]+3000];
  const roads=roadInfo(m), nbs=neighborInfo(m); const ls=levelsOf(m);
  const roofs=arr(m.roofs).filter(r=>r&&arr(r.polygon).length>=3);
  const est=/推定|不明/.test(String(s.note||''));
  return {poly,fp,sb,roads,nbs,ls,roofs,est,north:num(s.north_deg,0),setback:num(s.setback,null)};
}
function sitePlanG(m,opt){
  opt=opt||{}; const S=siteSpec(m); const roadW=Math.max(0,...S.roads.map(r=>r.r.width)); const nbD=S.nbs.length?6000:0;
  const X0=S.sb[0]-Math.max(2500,roadW+nbD+1000), X1=S.sb[2]+Math.max(2500,roadW+nbD+1000), Y0=S.sb[1]-Math.max(2500,roadW+nbD+1000), Y1=S.sb[3]+Math.max(2500,roadW+nbD+1000);
  const ML=22, MT=12, FOOT=opt.title===false?18:44;   // 下の帯：スケールバーと方位（18）＋図題（26）
  const maxW=opt.width||420, maxH=opt.height||297;
  let SCALE=opt.scale&&[200,500].indexOf(opt.scale)>=0?opt.scale:null;
  if(!SCALE){ SCALE=200; if((X1-X0)/200+ML*2+12>maxW||(Y1-Y0)/200+MT+FOOT>maxH) SCALE=500; }
  const FW=(X1-X0)/SCALE, FH=(Y1-Y0)/SCALE; const SHEET_W=FW+ML*2+12, SHEET_H=FH+MT+FOOT;
  const doc=new Doc(SHEET_W,SHEET_H,'配置図 1:'+SCALE,(m.name||'建物')+'の配置図。敷地・道路・隣地と建物の外形。GnotoArchStudio views.site（モデルから）');
  const v=new PlanView(ML,MT,SCALE,[X0,X1,Y0,Y1]); const svg=new SVG(doc); const g=GREY;
  const clipId=doc.clipRect(ML,MT,FW,FH); doc.openG('clip-path="url(#'+clipId+')"');
  // 隣地・道路
  S.nbs.forEach(nb=>{ svg.poly(v.pts(nb.poly),true,{stroke:g,w:W_FINE,fill:tint(0.25)}); const b=bbox(nb.poly); svg.text(v.px((b[0]+b[2])/2),v.py((b[1]+b[3])/2)+0.7,nb.kind,T_NOTE,{anchor:'middle',fill:INK,halo:true}); });
  S.roads.forEach(rd=>{ svg.poly(v.pts(rd.poly),true,{stroke:g,w:W_THIN,fill:'none'}); svg.line(v.px(rd.center[0][0]),v.py(rd.center[0][1]),v.px(rd.center[1][0]),v.py(rd.center[1][1]),g,W_FINE,'2.4 0.6 0.3 0.6');
    const c=[(rd.center[0][0]+rd.center[1][0])/2,(rd.center[0][1]+rd.center[1][1])/2]; svg.text(v.px(c[0]),v.py(c[1])+0.7,rd.name+'　幅員 '+fmt(rd.r.width/1000,1)+' m',T_NAME,{anchor:'middle',halo:true}); });
  // 敷地境界（一点鎖線 2 点）
  if(S.poly) svg.poly(v.pts(S.poly),true,{stroke:INK,w:W_THIN,dash:'2.4 0.5 0.3 0.5 0.3 0.5'});
  // 建物：下の階から順に壁を薄い灰で、最上階の壁は濃く。柱（ピロティ）は黒
  S.ls.forEach((l,i)=>{ const last=i===S.ls.length-1; planBase(svg,v,m,l.id,{env:last?INK:tint(0.35+0.25*i/Math.max(1,S.ls.length-1)),voids:last,fireAccent:last}); });
  // 屋根の板と孔（上部の輪郭）
  S.roofs.forEach(r=>{ svg.poly(v.pts(r.polygon),true,{stroke:INK,w:W_THEME,fill:'none'}); roofHoles(r).forEach(h=>{ svg.poly(v.pts(h),true,{stroke:INK,w:W_THIN}); svg.hatch(v.pts(h),0.9,45,g,W_FINE); }); const b=bbox(r.polygon); svg.text(v.px(b[0])+1.0,v.py(b[3])+T_NOTE+0.6,(r.name||'屋根の板')+(r.shell&&r.shell.kind==='curved'?'（曲面）':'')+'　版 '+nf(r.thickness||0),T_NOTE,{halo:true}); });
  // 出入口
  entrances(m).slice(0,3).forEach((e,i)=>{ const tip=v.pt(e.p[0]+e.n[0]*80,e.p[1]+e.n[1]*80); const ang=Math.atan2(-e.n[1],e.n[0]); const L=1.6; const p1=[tip[0]+L*Math.cos(ang+0.5),tip[1]+L*Math.sin(ang+0.5)], p2=[tip[0]+L*Math.cos(ang-0.5),tip[1]+L*Math.sin(ang-0.5)]; svg.poly([tip,p1,p2],true,{stroke:INK,w:W_THIN,fill:PAPER}); if(i===0) svg.text(v.px(e.p[0]+e.n[0]*900),v.py(e.p[1]+e.n[1]*900)+0.7,'出入口',T_NOTE,{anchor:'middle',halo:true}); });
  doc.closeG();
  svg.poly([[ML,MT],[ML+FW,MT],[ML+FW,MT+FH],[ML,MT+FH]],true,{stroke:INK,w:W_FINE});
  // 寸法：敷地の幅・奥行、建物と境界の間（各辺）
  const V=new View(SCALE,ML,MT,X0,Y1); const fp=S.fp, sb=S.sb;
  if(S.poly){ dimH(doc,V,[sb[0],sb[2]],Y1-900,{side:1,extFrom:null}); dimV(doc,V,[sb[1],sb[3]],X0+900,{side:-1,extFrom:null});
    const gaps=[['W',sb[0],fp[0]],['E',fp[2],sb[2]]]; gaps.forEach(([d,a,b])=>{ if(b-a>300) dimH(doc,V,[a,b],fp[3]+600,{side:1}); });
    [['S',sb[1],fp[1]],['N',fp[3],sb[3]]].forEach(([d,a,b])=>{ if(b-a>300) dimV(doc,V,[a,b],fp[2]+600,{side:1}); }); }
  dimH(doc,V,[fp[0],fp[2]],sb[1]+Math.min(600,(fp[1]-sb[1])/2),{side:-1,labels:['建物 '+nf(fp[2]-fp[0])]}); 
  // 名前と階
  { const st=structShort(m); const t=(m.name||'建物')+'　'+(st?st+'　':'')+S.ls.length+' 階'+(S.roofs.length?'＋'+S.roofs.map(r=>r.name||'屋根の板').join('・'):''); svg.text(v.px((fp[0]+fp[2])/2),v.py((fp[1]+fp[3])/2)+0.9,t.length>26?t.slice(0,26):t,T_NAME,{anchor:'middle',halo:true}); }
  if(S.poly){ const p0=S.poly[0]; svg.text(v.px(p0[0])+1.0,v.py(p0[1])-1.0,'敷地境界'+(S.est?'（推定）':''),T_NOTE,{halo:true}); }
  if(S.setback!=null&&S.setback>0&&S.roads.length){ const rd=S.roads[0]; const c=[(rd.a[0]+rd.b[0])/2-rd.n[0]*S.setback,(rd.a[1]+rd.b[1])/2-rd.n[1]*S.setback]; svg.text(v.px(c[0]),v.py(c[1])+0.7,'後退 '+nf(S.setback),T_NOTE,{anchor:'middle',halo:true}); }
  // 方位（north_deg は真北の向き。上が北を 0 として時計回り）とスケールバー
  const nx=ML+FW-6, ny=MT+FH+9; doc.openG('transform="rotate('+f(-S.north)+' '+f(nx)+' '+f(ny)+')"'); northArrow(doc,[nx,ny],13); doc.closeG();
  if(S.north) svg.text(nx-9,ny+1.0,'真北 '+fmt(S.north,1)+'°',T_NOTE,{anchor:'end'});
  scaleBar(doc,[ML,MT+FH+3.0],SCALE,SCALE===200?[0,1,2,3,4,5,10]:[0,5,10,20,30]);
  if(opt.title!==false){ const cy=MT+FH+24; const fig=opt.fig||1; doc.text([ML,cy],'図'+fig,{size:T_TITLE,weight:'bold'}); doc.text([ML+9,cy],'配置図（1:'+SCALE+'）',{size:T_TITLE});
    const parts=[(m.name||'建物')+'の敷地と建物の外形。'+(S.poly?'敷地は '+fmt((sb[2]-sb[0])/1000,1)+'×'+fmt((sb[3]-sb[1])/1000,1)+' m'+(S.est?'（形は推定）':'')+'、':'敷地の形はモデルに無い（site.polygon）。')+'建物の外形は '+fmt((fp[2]-fp[0])/1000,1)+'×'+fmt((fp[3]-fp[1])/1000,1)+' m、'+S.ls.length+' 階。',
      (S.roads.length?S.roads.map(r=>r.name+'（幅員 '+fmt(r.r.width/1000,1)+' m・'+DIRJA[r.side]+'）').join('、')+'。':'道路はモデルに無い。')+(S.nbs.length?'灰の面は隣地の建物（'+S.nbs.map(n=>DIRJA[n.side]+' '+n.kind).join('・')+'）。':'隣地の建物はモデルに無い。')+(S.roofs.length?'太線は'+S.roofs.map(r=>r.name||'屋根の板').join('・')+(S.roofs.some(r=>roofHoles(r).length)?'と孔（斜線）':'')+'。':'')+'黒は最上階の壁と柱、灰は下の階の壁'+(S.setback!=null&&S.roads.length?'、後退 '+nf(S.setback):'')+'。上が'+(S.north?'図の北（真北は矢印）':'北')+'。筆者作成（モデルから）。'];
    const lines=[]; parts.forEach(p=>wrapJa(p,SHEET_W-ML*2,T_NAME).forEach(l=>lines.push(l))); lines.slice(0,4).forEach((s,i)=>doc.text([ML,cy+6+i*4.4],s,{size:T_NAME})); }
  return doc;
}
/* ══ 街区図（周辺 1:500）：敷地のまわりを広く。道路・隣地が無ければその旨 ══ */
function blockPlanG(m,opt){
  opt=opt||{}; const S=siteSpec(m); const SCALE=500; const pad=Math.max(12000,(S.sb[2]-S.sb[0])*0.6);
  const X0=S.sb[0]-pad, X1=S.sb[2]+pad, Y0=S.sb[1]-pad, Y1=S.sb[3]+pad; const FW=(X1-X0)/SCALE, FH=(Y1-Y0)/SCALE; const ML=22, MT=12;
  const SHEET_W=Math.max(FW+ML*2+12,160), SHEET_H=FH+MT+(opt.title===false?18:44);
  const doc=new Doc(SHEET_W,SHEET_H,'街区図 1:500',(m.name||'建物')+'の周辺。GnotoArchStudio views.block（モデルから）'); const v=new PlanView(ML,MT,SCALE,[X0,X1,Y0,Y1]); const svg=new SVG(doc); const g=GREY;
  const clipId=doc.clipRect(ML,MT,FW,FH); doc.openG('clip-path="url(#'+clipId+')"');
  neighborInfo(m,9000).forEach(nb=>{ svg.poly(v.pts(nb.poly),true,{stroke:g,w:W_FINE,fill:tint(0.3)}); const b=bbox(nb.poly); svg.text(v.px((b[0]+b[2])/2),v.py((b[1]+b[3])/2)+0.7,nb.kind,T_NOTE,{anchor:'middle',halo:true}); });
  S.roads.forEach(rd=>{ const ext=40000; const dx=rd.b[0]-rd.a[0], dy=rd.b[1]-rd.a[1], L=Math.hypot(dx,dy)||1; const ea=[rd.a[0]-dx/L*ext,rd.a[1]-dy/L*ext], eb=[rd.b[0]+dx/L*ext,rd.b[1]+dy/L*ext]; const n=rd.n, w=rd.r.width;
    svg.poly(v.pts([ea,eb,[eb[0]+n[0]*w,eb[1]+n[1]*w],[ea[0]+n[0]*w,ea[1]+n[1]*w]]),true,{stroke:g,w:W_THIN}); svg.line(v.px(ea[0]+n[0]*w/2),v.py(ea[1]+n[1]*w/2),v.px(eb[0]+n[0]*w/2),v.py(eb[1]+n[1]*w/2),g,W_FINE,'2.4 0.6 0.3 0.6'); const c=[(rd.a[0]+rd.b[0])/2+n[0]*w/2,(rd.a[1]+rd.b[1])/2+n[1]*w/2]; svg.text(v.px(c[0]),v.py(c[1])+0.7,rd.name+' '+fmt(w/1000,1)+' m',T_NOTE,{anchor:'middle',halo:true}); });
  if(S.poly) svg.poly(v.pts(S.poly),true,{stroke:INK,w:W_THIN,dash:'2.4 0.5 0.3 0.5 0.3 0.5'});
  // 建物は黒い塊（最上階の壁と屋根の板の外形）
  const top=S.ls[S.ls.length-1]; if(top) wallPolys(m,top.id).forEach(j=>svg.poly(v.pts(j.polygon),true,{stroke:null,fill:INK}));
  S.ls.forEach(l=>arr(m.columns).forEach(c=>{ if(c.level!==l.id||!c.at) return; svg.circle(v.px(c.at[0]),v.py(c.at[1]),0.35,{stroke:null,fill:INK}); }));
  S.roofs.forEach(r=>{ svg.poly(v.pts(r.polygon),true,{stroke:INK,w:W_THEME}); roofHoles(r).forEach(h=>svg.poly(v.pts(h),true,{stroke:INK,w:W_FINE,fill:PAPER})); });
  doc.closeG(); svg.poly([[ML,MT],[ML+FW,MT],[ML+FW,MT+FH],[ML,MT+FH]],true,{stroke:INK,w:W_FINE});
  const fp=S.fp; svg.text(v.px((fp[0]+fp[2])/2),v.py(S.sb[3])-1.2,(m.name||'建物'),T_NAME,{anchor:'middle',halo:true});
  if(!S.roads.length&&!S.nbs.length) svg.text(ML+FW/2,MT+FH-3,'道路・隣地はモデルに無い（site.roads・site.neighbors）'+(S.est?'。敷地の形は推定':''),T_NOTE,{anchor:'middle',halo:true});
  const nx=ML+FW-5, ny=MT+FH+9; doc.openG('transform="rotate('+f(-S.north)+' '+f(nx)+' '+f(ny)+')"'); northArrow(doc,[nx,ny],12); doc.closeG();
  scaleBar(doc,[ML,MT+FH+3.0],SCALE,[0,5,10,20,30]);
  if(opt.title!==false){ const cy=MT+FH+24, fig=opt.fig||2; doc.text([ML,cy],'図'+fig,{size:T_TITLE,weight:'bold'}); doc.text([ML+9,cy],'周辺（街区図 1:500）',{size:T_TITLE});
    const s=(m.name||'建物')+'と敷地のまわり '+fmt(pad/1000,0)+' m。黒は最上階の壁と柱、太線は屋根の板。'+(S.roads.length?'道路は'+S.roads.map(r=>r.name+' '+fmt(r.r.width/1000,1)+' m').join('・')+'。':'')+(S.nbs.length?'灰は隣地の建物。':'')+(!S.roads.length&&!S.nbs.length?'道路・隣地はモデルに無いので描かない。':'')+'筆者作成（モデルから）。';
    wrapJa(s,SHEET_W-ML*2,T_NAME).slice(0,3).forEach((l,i)=>doc.text([ML,cy+6+i*4.4],l,{size:T_NAME})); }
  return doc;
}

/* ══ ダイアグラム（A3 横）：各階の平面を共通の縮尺で 1 列、下に表と図題。主題の層だけ替える ══ */
function diagScale(m,n,availW,availH){ const fp=footprint(m); const w=fp[2]-fp[0]+2400, h=fp[3]-fp[1]+2400; for(const s of [100,200,300,500]){ if(n*w/s+(n-1)*8<=availW&&h/s<=availH) return s; } return 500; }
function buildG(m,th,opt){
  const SHEET_W=420, SHEET_H=297, ML=15; const ls=levelsOf(m); const n=Math.max(1,ls.length); const fp=footprint(m);
  const availW=SHEET_W-ML*2, availH=150; const s=diagScale(m,n,availW,availH); const w=(fp[2]-fp[0]+2400)/s, h=(fp[3]-fp[1]+2400)/s; const gap=8;
  const ox0=ML+(availW-(n*w+(n-1)*gap))/2;
  const doc=new Doc(SHEET_W,SHEET_H,'図'+th.n+' '+th.name,(m.name||'建物')+'のダイアグラム（'+th.name+'）。各階 1:'+s+'。GnotoArchStudio views.diagram（モデルから）'); const svg=new SVG(doc);
  const views=ls.map((l,i)=>new PlanView(ox0+i*(w+gap),24,s,[fp[0]-1200,fp[2]+1200,fp[1]-1200,fp[3]+1200]));
  const ctx={m,svg,ls,s,fp,views,doc};
  ls.forEach((l,i)=>{ const v=views[i]; v.clip(svg); if(th.under) th.under(ctx,v,l,i); planBase(svg,v,m,l.id,{env:th.envelope||GREY,fireAccent:!!th.fireAccent}); th.plan(ctx,v,l,i); svg.groupEnd(); svg.text(v.px(v.x0r),19.5,(l.name||l.id).replace(/（.*?）/g,''),T_M,{weight:700}); svg.text(v.px(v.x0r)+textWidth((l.name||l.id).replace(/（.*?）/g,''),T_M)+2,19.5,l.id+'　FL+'+nf(l.fl),T_S); svg.poly([[v.px(v.x0r),v.py(v.y1r)],[v.px(v.x1r),v.py(v.y1r)],[v.px(v.x1r),v.py(v.y0r)],[v.px(v.x0r),v.py(v.y0r)]],true,{stroke:GREY,w:W_FINE}); });
  const yb=24+h+6; { const v=views[0]; const L=5000/s; svg.line(v.px(v.x0r),yb,v.px(v.x0r)+L,yb,INK,W_THIN); for(let i=0;i<=5;i++){ const xi=v.px(v.x0r)+i*L/5; svg.line(xi,yb-1,xi,yb,INK,W_THIN); svg.text(xi,yb+2.6,String(i),T_S,{anchor:'middle'}); } svg.text(v.px(v.x0r)+L+1.6,yb+2.6,'m　各階 1:'+s,T_S); }
  { const v=views[n-1]; const nx=v.px(v.x1r)-1, ny=yb+3; const nd=num((m.site||{}).north_deg,0); doc.openG('transform="rotate('+f(-nd)+' '+f(nx)+' '+f(ny)+')"'); svg.line(nx,ny,nx,ny-7,INK,W_THIN); arrowhead(svg,nx,ny-7,-Math.PI/2,INK,W_THIN,1.8); svg.text(nx,ny-8.4,'N',T_S,{anchor:'middle'}); doc.closeG(); }
  // 表（左）と図題（右）
  const tableTop=yb+14; const rows=th.numbers(ctx); const tb=table(svg,ML,tableTop,190,rows);
  if(opt.caption!==false&&opt.title!==false) caption(svg,th.n,th.title,th.paras(ctx),SHEET_W-ML-180,180,Math.min(281,Math.max(tb,tableTop+40)));   // シートに置くときは図題をシートが持つ（caption:false）
  doc.scale=s; return doc;
}
function table(svg,x0,y0,width,rows){ const lh=4.7, c2=x0+86, c3=x0+90; svg.line(x0,y0,x0+width,y0,INK,W_THIN); const yh=y0+3.4; svg.text(x0,yh,'項目',T_S,{weight:700}); svg.text(c2,yh,'値',T_S,{weight:700,anchor:'end'}); svg.text(c3,yh,'求め方',T_S,{weight:700}); let y=y0+lh+0.4; svg.line(x0,y,x0+width,y,INK,W_FINE);
  rows.forEach(([a,b,c])=>{ y+=lh; svg.text(x0,y-1.3,a,T_S); svg.text(c2,y-1.3,b,T_S,{anchor:'end'}); svg.text(c3,y-1.3,c,T_S); }); svg.line(x0,y+0.6,x0+width,y+0.6,INK,W_THIN); return y+0.6; }
function caption(svg,n,title,paras,x0,width,yBottom){ let body=[]; paras.forEach(p=>{ body=body.concat(wrapJa(p,width,T_S)); }); const lh=T_S*1.62; const y=yBottom-lh*(body.length-1); const yt=y-lh-2.0; svg.runs(x0,yt,[['図'+n,700],['　'+title,700]],T_M); body.forEach((ln,i)=>svg.text(x0,y+i*lh,ln,T_S)); return yt; }
const tailG=(s)=>'4 枚（ゾーニング・動線・光と風・延焼）は同じ枠・同じ縮尺（各階 1:'+s+'）・同じ下図で、主題の層だけを替えた。下図は灰、主題は黒、赤は耐火の壁（kind:fire）。下図の幾何は建築スタジオの建物モデルによる。筆者作成。';
function areaOf(m,lid){ try{ return mdl().area(m,lid); }catch(_){ return {total:0,rooms:{}}; } }
function lvName(l){ return (l.name||l.id).replace(/（.*?）/g,''); }
/* 1 ゾーニング */
const ZONING_G={ n:'1', name:'ゾーニング', title:'ゾーニング　階ごとの公・共・私（ダイアグラム）',
  plan({m,svg},v,l){ arr(m.rooms).filter(r=>r.level===l.id&&arr(r.polygon).length>=3).forEach(r=>{ const z=zoneOf(r); if(HATCH[z]) svg.hatch(v.pts(r.polygon),HATCH[z],45,INK,W_FINE); });
    arr(m.rooms).filter(r=>r.level===l.id&&arr(r.polygon).length>=3&&polyArea(r.polygon)>=3e6).forEach(r=>{ const z=zoneOf(r); const c=r.label||roomCentroid(r.polygon); const nm=String(r.name||'').replace(/（.*?）/g,''); const a=polyArea(r.polygon)/1e6;
      if(ZONE_WORD[z]&&z!=='srv'){ svg.runs(v.px(c[0]),v.py(c[1]),[[ZONE_WORD[z]+' ',700],[nm.slice(0,8),400]],T_S,{anchor:'middle',halo:true}); svg.text(v.px(c[0]),v.py(c[1])+T_S*1.35,fmt(a,1)+' m²',T_S,{anchor:'middle',halo:true}); } else svg.text(v.px(c[0]),v.py(c[1])+0.7,nm.slice(0,8),T_S,{anchor:'middle',halo:true}); }); },
  numbers({m,ls}){ const rows=[]; const tot={pub:0,com:0,pri:0,srv:0}; ls.forEach(l=>{ const t={pub:0,com:0,pri:0,srv:0}; arr(m.rooms).filter(r=>r.level===l.id&&arr(r.polygon).length>=3).forEach(r=>{ const z=zoneOf(r); if(z) t[z]+=polyArea(r.polygon)/1e6; }); Object.keys(t).forEach(k=>tot[k]+=t[k]); rows.push([lvName(l)+'　公／共／私／奉仕',[t.pub,t.com,t.pri,t.srv].map(x=>fmt(x,0)).join('／')+' m²','壁芯。斜路・吹抜・階段を除く']); });
    const all=tot.pub+tot.com+tot.pri+tot.srv||1; rows.push(['全階の割合　公／共／私／奉仕',[tot.pub,tot.com,tot.pri,tot.srv].map(x=>Math.round(x/all*100)).join('／')+' %','面積の比']); return rows.slice(0,7); },
  paras({m,ls,s}){ const pubs=[], coms=[], pris=[]; ls.forEach(l=>arr(m.rooms).filter(r=>r.level===l.id).forEach(r=>{ const z=zoneOf(r), nm=String(r.name||'').replace(/（.*?）/g,''); if(z==='pub'&&pubs.length<4) pubs.push(nm); if(z==='com'&&coms.length<4) coms.push(nm); if(z==='pri'&&pris.length<4) pris.push(nm); }));
    return ['斜線は密なほど公（公・共・私の 3 段）、白は奉仕（便所・廊下など）と斜路・吹抜・階段。室の区分は室名から判断した。公：'+(pubs.join('・')||'無し')+'。共：'+(coms.join('・')||'無し')+'。私：'+(pris.join('・')||'無し')+'。面積は壁芯。',tailG(s)]; } };
/* 2 動線 */
const CIRC_G={ n:'2', name:'動線', title:'動線　出入口から階段・斜路で上の階へ（ダイアグラム）',
  plan({m,svg,ls},v,l,i){ const ents=i===0?entrances(m):[]; const sts=arr(m.stairs).filter(st=>st.from===l.id&&st.origin), rps=arr(m.ramps).filter(r=>r.level===l.id&&arr(r.path).length>=2);
    const targets=sts.map(st=>stairArrowPts(st)[0]).concat(rps.map(r=>r.path[0]));
    ents.slice(0,2).forEach((e,k)=>{ const p0=[e.p[0]+e.n[0]*1800,e.p[1]+e.n[1]*1800], p1=[e.p[0]-e.n[0]*1200,e.p[1]-e.n[1]*1200]; polylineArrow(svg,v.pts([p0,p1]),INK,W_THEME,{startDot:true,dash:k?DASH:null}); svg.text(v.px(p0[0]),v.py(p0[1])+(e.n[1]>0?-1.2:3.0),k?'客':'住む人',T_S,{anchor:'middle',halo:true});
      const t=targets.sort((a,b)=>Math.hypot(a[0]-p1[0],a[1]-p1[1])-Math.hypot(b[0]-p1[0],b[1]-p1[1]))[0]; if(t&&!k){ polylineArrow(svg,v.pts([p1,[t[0],p1[1]],t]),INK,W_THEME,{head:false}); } });
    sts.forEach((st,k)=>{ const [a,b]=stairArrowPts(st); polylineArrow(svg,v.pts([a,b]),INK,W_THEME,{startDot:!ents.length}); if(k===0) svg.text(v.px(b[0]),v.py(b[1])-1.2,st.n+' 段',T_S,{anchor:'middle',halo:true}); });
    rps.forEach((r,k)=>{ polylineArrow(svg,v.pts(r.path),INK,W_THEME,{startDot:!ents.length}); if(k===0){ const e=r.path[r.path.length-1]; svg.text(v.px(e[0]),v.py(e[1])-1.2,'斜路',T_S,{anchor:'middle',halo:true}); } });
    arr(m.stairs).filter(st=>st.to===l.id&&st.origin).forEach(st=>{ const [a,b]=stairArrowPts(st); svg.circle(v.px(b[0]),v.py(b[1]),0.6,{stroke:INK,w:W_THIN,fill:PAPER}); }); roomNames(svg,v,m,l.id,{minArea:4e6}); },
  numbers({m,ls}){ const ents=entrances(m); const rows=[['出入口（最下階の外壁の戸）',ents.length+' か所',ents.slice(0,3).map(e=>DIRJA[(Math.abs(e.n[0])>Math.abs(e.n[1]))?(e.n[0]>0?'E':'W'):(e.n[1]>0?'N':'S')]+'面 幅 '+nf(e.width)).join('・')||'モデルに無い']];
    arr(m.stairs).slice(0,3).forEach(st=>rows.push(['階段 '+st.from+'→'+st.to,st.n+' 段','蹴上 '+nf(st.rise||0)+'・踏面 '+nf(st.tread||0)+'・幅 '+nf(st.width||0)]));
    arr(m.ramps).slice(0,2).forEach(r=>{ let L=0; for(let i=0;i+1<r.path.length;i++) L+=Math.hypot(r.path[i+1][0]-r.path[i][0],r.path[i+1][1]-r.path[i][1]); const f0=ls.find(x=>x.id===r.level), t0=ls.find(x=>x.id===r.to); const rise=f0&&t0?t0.fl-f0.fl:(r.rise||0); rows.push(['斜路 '+r.level+'→'+r.to,'勾配 '+(rise&&L?'1:'+fmt(L/rise,1):'—'),'長さ '+nf(L)+'・高さ '+nf(rise)+'・幅 '+nf(r.width||0)]); });
    return rows.slice(0,7); },
  paras({m,s}){ const ents=entrances(m); const st=arr(m.stairs).length, rp=arr(m.ramps).length; return ['住む人（実線）は出入口'+(ents.length?'（'+ents.length+' か所）':'')+'から'+(st?'階段':'')+(st&&rp?'と':'')+(rp?'斜路':'')+(st||rp?'で上の階へ進む':'の中へ進む')+'。黒丸は出発の点、白丸は上の階の到着、矢じりは人の移動にだけ付けた。'+(ents.length>1?'客（破線）は 2 つ目の出入口。':'')+(rp?'斜路の勾配は表のとおり。':''),tailG(s)]; } };
/* 3 光と風 */
function extOpenings(m,lid){ const fp=footprint(m); const cx=(fp[0]+fp[2])/2, cy=(fp[1]+fp[3])/2; const out=[];
  arr(m.openings).forEach(o=>{ const w=arr(m.walls).find(x=>x.id===o.wall); if(!w||w.level!==lid||w.kind==='partition'||!w.a||!w.b) return; const dx=w.b[0]-w.a[0], dy=w.b[1]-w.a[1], L=Math.hypot(dx,dy)||1; const u=(o.at||0)+(o.width||0)/2; const p=[w.a[0]+dx/L*u,w.a[1]+dy/L*u]; let n=[-dy/L,dx/L]; if((p[0]-cx)*n[0]+(p[1]-cy)*n[1]<0) n=[-n[0],-n[1]];
    const side=Math.abs(n[0])>Math.abs(n[1])?(n[0]>0?'E':'W'):(n[1]>0?'N':'S'); out.push({o,w,p,n,side,area:(o.width||0)*Math.max(0,(o.head||0)-(o.sill||0))/1e6}); }); return out; }
const LIGHT_G={ n:'3', name:'光と風', title:'光と風　外壁の開口から入る光と抜ける風（ダイアグラム）',
  plan({m,svg},v,l){ const ops=extOpenings(m,l.id); ops.forEach(e=>{ const d=Math.min(3000,800+e.area*600); const q=[e.p[0]-e.n[0]*d,e.p[1]-e.n[1]*d]; polylineArrow(svg,v.pts([[e.p[0]+e.n[0]*300,e.p[1]+e.n[1]*300],q]),INK,e.side==='S'?W_THEME:W_THIN,{}); });
    // 風：向かい合う開口（南↔北・東↔西）を点線で結ぶ
    const pair=(a,b)=>{ const A=ops.filter(e=>e.side===a), B=ops.filter(e=>e.side===b); A.slice(0,3).forEach(e=>{ const t=B.slice().sort((p,q)=>Math.hypot(p.p[0]-e.p[0],p.p[1]-e.p[1])-Math.hypot(q.p[0]-e.p[0],q.p[1]-e.p[1]))[0]; if(t) polylineArrow(svg,v.pts([[e.p[0]+e.n[0]*1500,e.p[1]+e.n[1]*1500],e.p,t.p,[t.p[0]+t.n[0]*1500,t.p[1]+t.n[1]*1500]]),INK,W_THEME,{dash:DOT,cap:'round'}); }); };
    pair('S','N'); pair('W','E');
    arr(m.voids).forEach(x=>{ if(x.level!==l.id||arr(x.polygon).length<3) return; svg.stipple(v.pts(x.polygon),0.85,0.16); const c=roomCentroid(x.polygon); svg.text(v.px(c[0]),v.py(c[1])+0.7,'吹抜から',T_S,{anchor:'middle',halo:true}); });
    arr(m.roofs).forEach(r=>{ if(!r||arr(r.polygon).length<3||r.level!==l.id) return; roofHoles(r).forEach(h=>{ svg.stipple(v.pts(h),0.85,0.16); const c=roomCentroid(h); svg.text(v.px(c[0]),v.py(c[1])+0.7,'孔から',T_S,{anchor:'middle',halo:true}); }); });
    roomNames(svg,v,m,l.id,{minArea:6e6}); },
  numbers({m,ls}){ const rows=[]; ls.forEach(l=>{ const t={S:0,N:0,E:0,W:0}; extOpenings(m,l.id).forEach(e=>t[e.side]+=e.area); const fa=areaOf(m,l.id).total||0; rows.push([lvName(l)+'　開口 南／北／東／西',[t.S,t.N,t.E,t.W].map(x=>fmt(x,1)).join('／')+' m²','幅×（上端−下端）の和'+(fa?'。床 '+fmt(fa,0)+' m² の '+Math.round((t.S+t.N+t.E+t.W)/fa*100)+' %':'')]); });
    const sc=arr(m.screens); if(sc.length) rows.push(['ブリーズ・ソレイユ',sc.length+' 面','奥行 '+Array.from(new Set(sc.map(x=>nf(x.depth||0)))).join('・')+'・羽根 @'+Array.from(new Set(sc.map(x=>nf(x.pitch||0)))).join('・')]);
    const holes=arr(m.roofs).reduce((t,r)=>t+arr(r.holes).length,0); if(holes) rows.push(['屋根の孔',holes+' か所','日傘の屋根を抜けて屋上へ']); return rows.slice(0,7); },
  paras({m,s}){ const sc=arr(m.screens).length; const nd=num((m.site||{}).north_deg,0); return ['矢印は外壁の開口から入る光で、長さは開口の面積に応じる（南は太線）。点線は向かい合う開口を結ぶ風の経路（南↔北・東↔西）。点の面は吹抜'+(arr(m.roofs).some(r=>arr(r.holes).length)?'と屋根の孔':'')+'で、上から光が落ちる。'+(sc?'南西・南のブリーズ・ソレイユ（'+sc+' 面）が直射を切る。':'')+(nd?'真北は図の上から '+fmt(nd,1)+'° 回る（方位の矢印）。':'')+'日射の角度はモデルに緯度が無いので描かない。',tailG(s)]; } };
/* 4 延焼 */
const FIRE_G={ n:'4', name:'延焼', title:'延焼　耐火の壁と境界までの距離（ダイアグラム）', fireAccent:true, envelope:INK,
  under({m,svg},v,l,i){ const S=siteSpec(m); if(S.poly) svg.poly(v.pts(S.poly),true,{stroke:GREY,w:W_FINE,dash:'2.4 0.5 0.3 0.5 0.3 0.5'});
    S.roads.forEach(rd=>{ const d=i===0?3000:5000; const n=rd.n, c=rd.center; const ln=[[c[0][0]-n[0]*(rd.r.width/2+d),c[0][1]-n[1]*(rd.r.width/2+d)],[c[1][0]-n[0]*(rd.r.width/2+d),c[1][1]-n[1]*(rd.r.width/2+d)]]; svg.line(v.px(ln[0][0]),v.py(ln[0][1]),v.px(ln[1][0]),v.py(ln[1][1]),INK,W_THIN,DASH); svg.text(v.px((ln[0][0]+ln[1][0])/2),v.py((ln[0][1]+ln[1][1])/2)-0.8,rd.name+'中心から '+(d/1000)+' m',T_S,{anchor:'middle',halo:true}); }); },
  plan({m,svg},v,l){ const fw=arr(m.walls).filter(w=>w.level===l.id&&w.kind==='fire'); if(fw.length){ const w0=fw[0]; svg.text(v.px((w0.a[0]+w0.b[0])/2),v.py((w0.a[1]+w0.b[1])/2)-1.4,'耐火の壁',T_S,{anchor:'middle',halo:true}); }
    const S=siteSpec(m); if(S.poly){ const fp=S.fp, sb=S.sb; const gaps=[['W',sb[0],fp[0],(fp[1]+fp[3])/2,'h'],['E',fp[2],sb[2],(fp[1]+fp[3])/2,'h'],['S',sb[1],fp[1],(fp[0]+fp[2])/2,'v'],['N',fp[3],sb[3],(fp[0]+fp[2])/2,'v']]; gaps.forEach(([d,a,b,c,o])=>{ if(b-a<300) return; if(o==='h'){ svg.line(v.px(a),v.py(c),v.px(b),v.py(c),INK,W_FINE); svg.text(v.px((a+b)/2),v.py(c)-0.8,fmt((b-a)/1000,1)+' m',T_S,{anchor:'middle',halo:true}); } else { svg.line(v.px(c),v.py(a),v.px(c),v.py(b),INK,W_FINE); svg.text(v.px(c)+0.8,v.py((a+b)/2)+0.7,fmt((b-a)/1000,1)+' m',T_S,{halo:true}); } }); }
    roomNames(svg,v,m,l.id,{minArea:6e6,fill:PAPER}); },
  numbers({m,ls}){ const rows=[]; ls.forEach(l=>{ const ext=arr(m.walls).filter(w=>w.level===l.id&&w.kind!=='partition'&&w.a&&w.b); const len=(ws)=>ws.reduce((t,w)=>t+Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),0); const fire=ext.filter(w=>w.kind==='fire'); rows.push([lvName(l)+'　耐火の壁／外壁',fmt(len(fire)/1000,1)+'／'+fmt(len(ext)/1000,1)+' m','壁の芯の長さ（kind:fire／exterior＋fire）']); });
    const S=siteSpec(m); if(S.poly){ const fp=S.fp, sb=S.sb; rows.push(['外壁から敷地境界まで（西・東・南・北）',[fp[0]-sb[0],sb[2]-fp[2],fp[1]-sb[1],sb[3]-fp[3]].map(x=>fmt(x/1000,1)).join('・')+' m','外接矩形の差'+(S.est?'（敷地は推定）':'')]); }
    rows.push(['延焼のおそれのある部分','3 m／5 m','道路中心・隣地境界から 1 階／2 階以上（建築基準法 2 条 6 号）'+(S.roads.length?'':'。道路はモデルに無い')]); return rows.slice(0,7); },
  paras({m,s}){ const S=siteSpec(m); const anyFire=arr(m.walls).some(w=>w.kind==='fire'); return [(anyFire?'赤は耐火の壁（kind:fire）、':'このモデルに耐火の壁（kind:fire）は無い。')+'黒は外壁と柱。'+(S.poly?'二点鎖線は敷地境界で、細線の寸法は外壁から境界までの距離。':'敷地の形はモデルに無い。')+(S.roads.length?'破線は延焼のおそれのある部分の境（道路中心から 1 階 3 m・2 階以上 5 m）。':'道路がモデルに無いので延焼の線は境界からの距離だけで読む。')+'法令への適合を示すものではない。',tailG(s)]; } };
const THEMES_G={zoning:ZONING_G,circulation:CIRC_G,light_wind:LIGHT_G,fire:FIRE_G,'1':ZONING_G,'2':CIRC_G,'3':LIGHT_G,'4':FIRE_G,'ゾーニング':ZONING_G,'動線':CIRC_G,'光と風':LIGHT_G,'延焼':FIRE_G};

/* ── 入口：見本の街区のモデルは第 1〜3 部、それ以外はモデルから ── */
function out(doc,opt){ if(opt.paper===false) doc.paper=false; return doc.toSvg(); }
const legacySite=MINE.site, legacyBlock=MINE.block, legacyDiagram=MINE.diagram;
MINE.site=function(m,opt){ opt=Object.assign({},opt||{}); if(blockLike(m)) return legacySite(m,opt); if(opt.paper===false&&opt.title==null) opt.title=false; if(opt.kind==='block'||opt.mode==='block'||opt.scale===500&&opt.kind!=='site') return out(blockPlanG(m,opt),opt); return out(sitePlanG(m,opt),opt); };
MINE.block=function(m,opt){ opt=Object.assign({},opt||{}); if(blockLike(m)) return legacyBlock(m,opt); if(opt.paper===false&&opt.title==null) opt.title=false; return out(blockPlanG(m,opt),opt); };
MINE.diagram=function(m,kind,opt){ opt=opt||{}; if(blockLike(m)) return legacyDiagram(m,kind,opt); const th=THEMES_G[kind||'zoning']||ZONING_G; if(!levelsOf(m).length) throw new Error('ダイアグラムには階が要る'); return buildG(m,th,opt).toSvg(); };
MINE.diagramScale=function(m){ if(blockLike(m)) return 100; const n=Math.max(1,levelsOf(m).length); return diagScale(m,n,390,150); };
A.site.blockLike=blockLike; A.site.sitePlanG=sitePlanG; A.site.blockPlanG=blockPlanG; A.site.diagramG=(m,kind,opt)=>buildG(m,THEMES_G[kind]||ZONING_G,opt||{});
['site','block','diagram','diagramScale'].forEach(k=>{ try{ A.views[k]=MINE[k]; }catch(_){} });
install(A.views);
})();
