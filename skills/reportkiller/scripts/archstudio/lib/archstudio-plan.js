/* 建築スタジオ：平面図（GnotoArch.plan）  担当 S1
   ───────────────────────────────────────────────────────────────────────────────
   plan.render(m, level, opt) → SVG 文字列（紙の上の mm。width/height は mm、viewBox は紙の mm）
   plan.layout(m, level, opt) → { svg, width, height, scale, viewBox:[x,y,w,h], toPaper(X,Y)→[x,y], texts:[[x0,y0,x1,y1,s,tag]] }
     opt.scale   50（作り込み：枠・額縁・扉の厚み・段の番号・内法）か 100（簡略）。既定 100。50 以下は作り込み
     opt.layers  ['walls','openings','stairs','fixtures','finish','rooms','levels','grid','dims','sections','site','north','scale','caption',
                  'columns','voids','ramps','screens','roofs'] の配列か {名前:false} の形。既定はすべて
   2026-10-24（ELEMENTS.md・担当 S-A）
     壁は model.wallJoin の多角形で描く：軸にそった長方形のままの壁は従来の格子（cells）で合成、接合（L・T・十字・厚さ違い・斜め）
     と曲面壁は、開口で分けた区間ごとに塗り（線なし）、輪郭は model.joinEdges（共有する辺を落とす）＝継ぎ目の線を出さない。
     柱（ad-cut の中、塗り）・吹抜（ad-hidden：破線の輪郭と「吹抜」）・斜路（ad-ramp：両側の線・中心線と矢印・白丸・切断の線・
     FL+cut より上は破線・「勾配 1:n」・上／下）・ブリーズ・ソレイユ（ad-screen：切断に当たる羽根は塗り、横の板は輪郭、
     切断より上は破線）・屋根（その階の上に載るものは ad-hidden の破線の輪郭と孔。roof.level がその階なら ad-roof の屋根伏）。
     決め打ちを外した：凡例・図題・注記の「耐火の外壁」「防火設備」は m.materials.exterior / .fire（無ければ「外壁」、fire の開口が
     無ければ防火設備を書かない）、「構造：木造…」は m.structure が無ければ書かない、「路地」は site.roads[].name から、
     階の名は level.name（無ければ「n 階」）、FL の無い階に NaN を書かない。見本（model.sample）の出力は変わらない。
     opt.accent  false で強調色（#943522）を使わない
     opt.caption 図題の文字列（false で無し。既定「図 n　n 階平面図（1:s）」）、opt.captionBody 図題の本文（折り返す）
     opt.idPrefix 模様・切り抜きの id の頭（同じ HTML に何枚も置くとき。既定は自動の連番）
     opt.captionBody true で図題の本文を模型から組み立てる（captionBody）
   plan.sheet(m, level, {scale:50, size:'A3', orient:'L', margin:15}) → 1 枚の紙（plan.py の sheet_150）：左に平面、右に凡例・室面積・開口の表・注記、下に図題
   plan.sheetAll(m, {scale:100, levels:[…]})                       → 1 枚に全階（plan.py の sheet_1100）：下に方位・スケールバー・凡例・床面積・図題
     どちらも layout と同じ形を返す（svg は紙の大きさ）。図題の本文は level.caption / m.captionAll、無ければ模型から組み立てる。
     階ごとの注記は level.notes、構造の語は m.structure。
   plan.parts.{legend, legendRows, areaTable, openingTable, notes, notesFor, captionBlock, northArrow, scaleBar} は他の図（シート）からも使える。
   室名の置き場：与えた label に入らなければ、補足→面積→字の大きさの順に減らして室の中の空いた所へ動かし、
     それでも入らない小さな室は外壁の外に出して引出線で結ぶ（1:200 の見開きで便所・物入が壁で切れていたのを直した）。
   1:200 以下（coarse）：寸法は通り芯間と全体の 2 段、断面の符号は矢の脇、敷地の線の名前は線の東の端。
   作図の規則は tools/archdraw/plan/*.py（svg.py・parts.py・annot.py・plan.py）をそのまま移した。
   線：切断 0.50・見えがかり 0.25・細線 0.13・破線 0.18。文字：2.0・2.5・3.5。色：#1A1A1A・#943522（・#8C9493）。
   要素は <g class="ad-…"> で包む（archstudio-check.js の点検の鍵：ad-cut・ad-opening・ad-stair・ad-visible・ad-hidden・
   ad-room-name・ad-grid・ad-grid-label・ad-dim・ad-section-mark・ad-north・ad-scalebar・ad-scale-text・ad-title・ad-site）。
   モデルの形は archstudio-model.js の冒頭の約束（開口の at・swing・flip、階段の origin・dir、家具の at・rot）。 */
(function(){
'use strict';
const A=window.GnotoArch=window.GnotoArch||{};
if(A.plan&&typeof A.plan.render==='function') return;   // m3d-arch.js の plan（関数）があれば壊さず、その上に render などを足す

const INK='#1A1A1A', GREY='#8C9493', ACCENT='#943522', PAPER='#FFFFFF';
const FONT="'Noto Sans JP','IPAGothic','Helvetica Neue',Arial,sans-serif";
const T_NOTE=2.0, T_ROOM=2.5, T_TITLE=3.5;
const _D=0.25;
const DASH={ hidden:[12*_D,3*_D], chain:[24*_D,3*_D,0.5*_D,3*_D], chain2:[24*_D,3*_D,0.5*_D,3*_D,0.5*_D,3*_D] };
const DIM_TEXT_GAP=0.8, EXT_OVER=1.0, TICK=1.8;
const arr=(x)=>Array.isArray(x)?x:[];
let UID=0;

function fmt(v){ let s=(+v).toFixed(3).replace(/0+$/,'').replace(/\.$/,''); if(s==='-0'||s==='') s='0'; return s; }
function fmtmm(v){ return Math.round(v).toLocaleString('en-US'); }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function textWidth(s, size){ let w=0; for(const ch of String(s)){ const o=ch.codePointAt(0); if(o<0x2E80) w+=('MW@'.indexOf(ch)>=0)?0.62:(" .,'’:;|".indexOf(ch)>=0?0.30:0.56); else w+=1.0; } return w*size; }

/* ── 紙の mm で描く SVG（svg.py の移植） ─────────────────────────────────── */
function Svg(prefix){ this.parts=[]; this.defs=[]; this.bbox=[1e9,1e9,-1e9,-1e9]; this.texts=[]; this._id=0; this.prefix=prefix; }
Svg.prototype={
  grow(xs, ys, pad){ if(!xs.length) return; pad=pad||0; const b=this.bbox; b[0]=Math.min(b[0],Math.min(...xs)-pad); b[1]=Math.min(b[1],Math.min(...ys)-pad); b[2]=Math.max(b[2],Math.max(...xs)+pad); b[3]=Math.max(b[3],Math.max(...ys)+pad); },
  uid(p){ this._id++; return this.prefix+'-'+(p||'g')+this._id; },
  style(stroke, sw, fill, dash, cap, join, extra){
    const s=[]; if(fill!==null) s.push('fill="'+(fill===undefined?'none':fill)+'"');
    if(sw!=null&&stroke!=null){ s.push('stroke="'+stroke+'" stroke-width="'+fmt(sw)+'"'); if(dash) s.push('stroke-dasharray="'+DASH[dash].map(fmt).join(' ')+'"'); s.push('stroke-linecap="'+(cap||'butt')+'" stroke-linejoin="'+(join||'miter')+'"'); }
    else s.push('stroke="none"');
    if(extra) s.push(extra); return s.join(' ');
  },
  line(x0,y0,x1,y1,sw,o){ o=o||{}; this.parts.push('<line x1="'+fmt(x0)+'" y1="'+fmt(y0)+'" x2="'+fmt(x1)+'" y2="'+fmt(y1)+'" '+this.style(o.stroke||INK, sw, null, o.dash, o.cap)+'/>'); this.grow([x0,x1],[y0,y1],sw/2); },
  polyline(pts,sw,o){ o=o||{}; if(pts.length<2) return; const tag=o.closed?'polygon':'polyline';
    this.parts.push('<'+tag+' points="'+pts.map(p=>fmt(p[0])+','+fmt(p[1])).join(' ')+'" '+this.style(sw==null?null:(o.stroke||INK), sw, o.fill||'none', o.dash, o.cap, o.join)+'/>');
    this.grow(pts.map(p=>p[0]), pts.map(p=>p[1]), (sw||0)/2); },
  rect(x0,y0,x1,y1,sw,o){ o=o||{}; const xa=Math.min(x0,x1), xb=Math.max(x0,x1), ya=Math.min(y0,y1), yb=Math.max(y0,y1);
    this.parts.push('<rect x="'+fmt(xa)+'" y="'+fmt(ya)+'" width="'+fmt(xb-xa)+'" height="'+fmt(yb-ya)+'" '+this.style(sw==null?null:(o.stroke||INK), sw, o.fill||'none', o.dash)+'/>'); this.grow([xa,xb],[ya,yb],(sw||0)/2); },
  circle(cx,cy,r,sw,o){ o=o||{}; this.parts.push('<circle cx="'+fmt(cx)+'" cy="'+fmt(cy)+'" r="'+fmt(r)+'" '+this.style(sw==null?null:(o.stroke||INK), sw, o.fill||'none', o.dash)+'/>'); this.grow([cx-r,cx+r],[cy-r,cy+r],(sw||0)/2); },
  ellipse(cx,cy,rx,ry,sw,o){ o=o||{}; const tr=o.rot?' transform="rotate('+fmt(o.rot)+' '+fmt(cx)+' '+fmt(cy)+')"':''; const R=Math.max(rx,ry);
    this.parts.push('<ellipse cx="'+fmt(cx)+'" cy="'+fmt(cy)+'" rx="'+fmt(rx)+'" ry="'+fmt(ry)+'"'+tr+' '+this.style(sw==null?null:(o.stroke||INK), sw, o.fill||'none')+'/>');
    this.grow(o.rot?[cx-R,cx+R]:[cx-rx,cx+rx], o.rot?[cy-R,cy+R]:[cy-ry,cy+ry], (sw||0)/2); },
  path(d,sw,o){ o=o||{}; const extra=o.rule?'fill-rule="'+o.rule+'"':''; this.parts.push('<path d="'+d+'" '+this.style(sw==null?null:(o.stroke||INK), sw, o.fill||'none', o.dash, o.cap, null, extra)+'/>'); if(o.bbox) this.grow(o.bbox.map(p=>p[0]), o.bbox.map(p=>p[1]), (sw||0)/2); },
  text(x,y,s,size,o){ o=o||{}; const anchor=o.anchor||'middle', rot=o.rot||0; const w=textWidth(s,size), h=size;
    const dx0=anchor==='start'?0:(anchor==='end'?-w:-w/2), dx1=anchor==='start'?w:(anchor==='end'?0:w/2), dy0=-h/2, dy1=h/2;
    let bx; if(rot%180===0) bx=[x+dx0,y+dy0,x+dx1,y+dy1]; else if(rot===-90) bx=[x+dy0,y-dx1,x+dy1,y-dx0]; else bx=[x-dy1,y+dx0,x-dy0,y+dx1];
    this.texts.push([bx[0],bx[1],bx[2],bx[3],String(s),o.tag||'']);
    if(o.mask){ const pd=0.35; this.parts.push('<rect x="'+fmt(bx[0]-pd)+'" y="'+fmt(bx[1]-pd*0.4)+'" width="'+fmt(bx[2]-bx[0]+2*pd)+'" height="'+fmt(bx[3]-bx[1]+pd*0.8)+'" fill="'+PAPER+'" stroke="none"/>'); }
    this.grow([bx[0],bx[2]],[bx[1],bx[3]]);
    const tr=rot?' transform="rotate('+fmt(rot)+' '+fmt(x)+' '+fmt(y)+')"':'';
    const wt=o.weight&&o.weight!=='normal'?' font-weight="'+o.weight+'"':'';
    this.parts.push('<text x="'+fmt(x)+'" y="'+fmt(y)+'" font-size="'+fmt(size)+'" text-anchor="'+anchor+'" dominant-baseline="central" fill="'+(o.fill||INK)+'"'+wt+tr+'>'+esc(s)+'</text>'); },
  hatch(spacing, sw, angle, color){ const id=this.uid('hatch'); spacing=spacing||0.8; angle=angle==null?45:angle;
    this.defs.push('<pattern id="'+id+'" patternUnits="userSpaceOnUse" width="'+fmt(spacing)+'" height="'+fmt(spacing)+'" patternTransform="rotate('+fmt(angle)+')"><rect width="'+fmt(spacing)+'" height="'+fmt(spacing)+'" fill="'+PAPER+'"/><line x1="0" y1="0" x2="0" y2="'+fmt(spacing)+'" stroke="'+(color||INK)+'" stroke-width="'+fmt(sw)+'"/></pattern>'); return id; },
  open(cls, attrs){ this.parts.push('<g'+(cls?' class="'+cls+'"':'')+(attrs?' '+attrs:'')+'>'); },
  close(){ this.parts.push('</g>'); },
  group(cls, fn){ this.open(cls); fn(); this.close(); },
};

function Weights(){ this.cut=0.5; this.vis=0.25; this.thin=0.13; this.hid=0.18; }

/* ── 幾何 ───────────────────────────────────────────────────────────────── */
/* 壁の枠：archstudio-model.js のもの（曲面壁 curve では弧に沿う）。model が無いときだけ直線の枠 */
function wallFrame(w){ if(A.model&&A.model.wallFrame) return A.model.wallFrame(w);
  const dx=w.b[0]-w.a[0], dy=w.b[1]-w.a[1], L=Math.hypot(dx,dy)||1; const d=[dx/L,dy/L], n=[-d[1],d[0]];
  return { L, d, n, W:(u,v)=>[w.a[0]+d[0]*u+n[0]*v, w.a[1]+d[1]*u+n[1]*v] }; }
function wallAxis(w){ if(w.curve) return null; if(Math.abs(w.a[1]-w.b[1])<1e-6) return 'x'; if(Math.abs(w.a[0]-w.b[0])<1e-6) return 'y'; return null; }
function wallPoly(w){ if(A.model&&A.model.wallPolygon) return A.model.wallPolygon(w); const f=wallFrame(w), h=w.t/2; return [f.W(0,-h),f.W(f.L,-h),f.W(f.L,h),f.W(0,h)]; }
function wallRect(w){ const h=w.t/2, ax=wallAxis(w);
  if(ax==='x') return [Math.min(w.a[0],w.b[0]), w.a[1]-h, Math.max(w.a[0],w.b[0]), w.a[1]+h];
  if(ax==='y') return [w.a[0]-h, Math.min(w.a[1],w.b[1]), w.a[0]+h, Math.max(w.a[1],w.b[1])]; return null; }
const DIRV={N:[0,1], E:[1,0], S:[0,-1], W:[-1,0]};
function stairGeom(s){ const d=DIRV[s.dir]||DIRV.N, r=[d[1],-d[0]], treads=s.n-1, run=treads*s.tread;
  return { d, r, treads, run, W:(ss,cc)=>[s.origin[0]+d[0]*ss+r[0]*cc, s.origin[1]+d[1]*ss+r[1]*cc] }; }
function inside(poly, x, y){ let c=false; const n=poly.length; for(let i=0;i<n;i++){ const [x0,y0]=poly[i], [x1,y1]=poly[(i+1)%n]; if((y0>y)!==(y1>y)){ if(x<x0+(y-y0)*(x1-x0)/(y1-y0)) c=!c; } } return c; }
function polyArea(pts){ let s=0; for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length]; s+=a[0]*b[1]-b[0]*a[1]; } return Math.abs(s)/2; }
function mulberry(seed){ let a=seed>>>0; return ()=>{ a=(a+0x6D2B79F5)>>>0; let t=a; t=Math.imul(t^(t>>>15), t|1); t^=t+Math.imul(t^(t>>>7), t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }

/* ── 描く場（実寸 → 紙） ────────────────────────────────────────────────── */
function Ctx(svg, m, level, s, fine, accent){
  this.svg=svg; this.m=m; this.level=level; this.s=s; this.fine=fine; this.accent=accent; this.w=new Weights(); this.ox=0; this.oy=0;
}
Ctx.prototype={
  P(X,Y){ return [this.ox+X/this.s, this.oy-Y/this.s]; },
  L(d){ return d/this.s; },
  line(X0,Y0,X1,Y1,sw,o){ const a=this.P(X0,Y0), b=this.P(X1,Y1); this.svg.line(a[0],a[1],b[0],b[1],sw,o); },
  lineP(p,q,sw,o){ this.line(p[0],p[1],q[0],q[1],sw,o); },
  poly(pts,sw,o){ this.svg.polyline(pts.map(p=>this.P(p[0],p[1])),sw,o); },
  rect(r,sw,o){ const a=this.P(r[0],r[1]), b=this.P(r[2],r[3]); this.svg.rect(a[0],a[1],b[0],b[1],sw,o); },
  circle(X,Y,R,sw,o){ const c=this.P(X,Y); this.svg.circle(c[0],c[1],this.L(R),sw,o); },
};

/* ======================================================================== 壁（ポシェ）parts.py */
function cells(byClass, holes){
  const xs=new Set(), ys=new Set();
  Object.keys(byClass).forEach(k=>byClass[k].forEach(r=>{ xs.add(r[0]); xs.add(r[2]); ys.add(r[1]); ys.add(r[3]); }));
  holes.forEach(r=>{ xs.add(r[0]); xs.add(r[2]); ys.add(r[1]); ys.add(r[3]); });
  const X=[...xs].sort((a,b)=>a-b), Y=[...ys].sort((a,b)=>a-b), nx=X.length-1, ny=Y.length-1;
  const cls=[]; for(let i=0;i<nx;i++){ cls.push(new Array(Math.max(ny,0)).fill(null)); const cx=(X[i]+X[i+1])/2;
    for(let j=0;j<ny;j++){ const cy=(Y[j]+Y[j+1])/2;
      if(holes.some(h=>h[0]<cx&&cx<h[2]&&h[1]<cy&&cy<h[3])) continue;
      Object.keys(byClass).forEach(c=>{ if(byClass[c].some(r=>r[0]<cx&&cx<r[2]&&r[1]<cy&&cy<r[3])) cls[i][j]=c; }); } }
  return {X, Y, cls};
}
function loops(X, Y, cls, want){
  const nx=X.length-1, ny=Y.length-1;
  const C=(i,j)=>i>=0&&i<nx&&j>=0&&j<ny&&want.indexOf(cls[i][j])>=0;
  const edges=new Map(); const add=(a,b)=>{ const k=a[0]+','+a[1]; if(!edges.has(k)) edges.set(k,[]); edges.get(k).push(b); };
  for(let i=0;i<nx;i++) for(let j=0;j<ny;j++){ if(!C(i,j)) continue;
    if(!C(i,j-1)) add([i,j],[i+1,j]); if(!C(i+1,j)) add([i+1,j],[i+1,j+1]); if(!C(i,j+1)) add([i+1,j+1],[i,j+1]); if(!C(i-1,j)) add([i,j+1],[i,j]); }
  const out=[];
  while(edges.size){
    const sk=edges.keys().next().value, start=sk.split(',').map(Number); const loop=[start]; let cur=start, prev=null;
    for(;;){ const k=cur[0]+','+cur[1], nxts=edges.get(k); if(!nxts||!nxts.length) break;
      if(nxts.length>1&&prev){ const c=cur, pd=prev; nxts.sort((p,q)=>{ const t=(n)=>{ const d=[n[0]-c[0],n[1]-c[1]]; return -(pd[0]*d[1]-pd[1]*d[0]); }; return t(p)-t(q); }); }
      const n=nxts.shift(); if(!nxts.length) edges.delete(k);
      prev=[n[0]-cur[0], n[1]-cur[1]]; cur=n; if(cur[0]===start[0]&&cur[1]===start[1]) break; loop.push(cur); }
    const pts=loop.map(([i,j])=>[X[i],Y[j]]), L=pts.length, simp=[];
    for(let k=0;k<L;k++){ const a=pts[(k-1+L)%L], b=pts[k], c=pts[(k+1)%L]; if((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0])!==0) simp.push(b); }
    if(simp.length>=3) out.push(simp);
  }
  return out;
}
function pathD(C, lps){ return lps.map(lp=>'M'+lp.map(p=>{ const q=C.P(p[0],p[1]); return fmt(q[0])+','+fmt(q[1]); }).join(' L')+' Z').join(' '); }
function levelWalls(C){ return arr(C.m.walls).filter(w=>w.level===C.level.id&&w.a&&w.b&&w.t>0); }
function levelOpenings(C){ const ws=new Map(levelWalls(C).map(w=>[w.id,w])); return arr(C.m.openings).filter(o=>ws.has(o.wall)).map(o=>({o, w:ws.get(o.wall)})); }
function openingHole(w, o){ const f=wallFrame(w), r=wallRect(w); if(!r) return null; const p0=f.W(o.at,0), p1=f.W(o.at+o.width,0);
  return wallAxis(w)==='x'?[Math.min(p0[0],p1[0]), r[1], Math.max(p0[0],p1[0]), r[3]]:[r[0], Math.min(p0[1],p1[1]), r[2], Math.max(p0[1],p1[1])]; }
/* 壁の多角形を開口で区間に分ける（u＝a からの距離）。接合で延びた端（u<0・u>L）は端の区間に含める */
function wallPieces(C, x, poly){
  const M=A.model, f=wallFrame(x);
  const ops=arr(C.m.openings).filter(o=>o.wall===x.id&&o.width>0).map(o=>[o.at,o.at+o.width]).sort((a,b)=>a[0]-b[0]);
  if(!ops.length) return [poly];
  let u=0; const segs=[]; ops.forEach(([a,b])=>{ if(a>u) segs.push([u,a]); u=Math.max(u,b); }); if(u<f.L) segs.push([u,f.L]);
  if(f.curve&&M) return segs.map(([a,b])=>M.arcPoints(x,a,b));
  const n=segs.length;
  return segs.map(([a,b],i)=>{ const h=x.t/2;
    if(!M) return [f.W(a,-h),f.W(b,-h),f.W(b,h),f.W(a,h)];
    return M.clipBand(poly, f, i===0?a-1e7:a, i===n-1?b+1e7:b); }).filter(p=>p.length>=3);
}
function onBoundary(poly, p){ const n=poly.length; for(let i=0;i<n;i++){ const a=poly[i], b=poly[(i+1)%n], dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy||1; let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2; t=Math.max(0,Math.min(1,t)); if(Math.hypot(a[0]+dx*t-p[0], a[1]+dy*t-p[1])<0.1) return true; } return false; }
function drawWalls(C){
  const w=C.w, svg=C.svg, walls=levelWalls(C), M=A.model;
  const holes=[], cl={P:[], S:[], A:[]}, others=[];
  // 接合（L・T・十字・厚さ違い・斜め）：model.wallJoin の多角形。軸にそった長方形のままの壁は従来の格子（cells）で合成
  const joins=(M&&M.wallJoin)?M.wallJoin(C.m, C.level.id):null;
  const isRect=(pg)=>pg.length===4&&pg.every((p,i)=>{ const q=pg[(i+1)%4]; return Math.abs(p[0]-q[0])<1e-6||Math.abs(p[1]-q[1])<1e-6; });
  const klass=(x)=>x.kind==='partition'?'P':(x.accent&&C.accent?'A':'S');
  walls.forEach(x=>{ const j=joins&&joins.find(q=>q.id===x.id), pg=j?j.polygon:null, r=wallRect(x);
    if(r&&(!pg||isRect(pg))) cl[klass(x)].push(r); else others.push({x, poly:pg||wallPoly(x)}); });
  const rectIds=new Set(walls.filter(x=>!others.some(o=>o.x===x)).map(x=>x.id));
  levelOpenings(C).forEach(({o,w:ww})=>{ if(!rectIds.has(ww.id)) return; const h=openingHole(ww,o); if(h) holes.push(h); });
  const {X,Y,cls}=cells(cl, holes);
  const hatch=svg.hatch(C.fine?0.8:0.7, w.thin);
  const bb=(lp)=>lp.flat().map(p=>C.P(p[0],p[1]));
  let lp=loops(X,Y,cls,['P']); if(lp.length) svg.path(pathD(C,lp), w.cut, {fill:'url(#'+hatch+')', rule:'evenodd', bbox:bb(lp)});
  if(C.accent){ lp=loops(X,Y,cls,['A']); if(lp.length) svg.path(pathD(C,lp), w.cut, {stroke:ACCENT, fill:ACCENT, rule:'evenodd', bbox:bb(lp)}); }
  lp=loops(X,Y,cls,['S']); if(lp.length) svg.path(pathD(C,lp), w.cut, {fill:INK, rule:'evenodd', bbox:bb(lp)});
  if(!others.length) return;
  // 接合・斜め・曲面の壁：開口で分けた区間ごとに塗り（線なし）、輪郭は共有する辺を落として描く＝継ぎ目の線を出さない
  const pieces=[]; others.forEach(({x,poly})=>wallPieces(C,x,poly).forEach(p=>pieces.push({k:klass(x), poly:p})));
  pieces.forEach(({k,poly})=>{ const fill=k==='P'?'url(#'+hatch+')':(k==='A'?ACCENT:INK); C.poly(poly, null, {closed:true, fill}); });
  const edges=M&&M.joinEdges?M.joinEdges(pieces.map(p=>p.poly)):pieces.flatMap(({poly})=>poly.map((p,i)=>[p, poly[(i+1)%poly.length]]));
  const acc=pieces.filter(p=>p.k==='A').map(p=>p.poly);
  edges.forEach(([p,q])=>{ const mid=[(p[0]+q[0])/2,(p[1]+q[1])/2]; const red=acc.some(pg=>onBoundary(pg, mid)); C.lineP(p,q,w.cut,{stroke:red?ACCENT:INK}); });
}
/* ======================================================================== 新しい要素（ELEMENTS.md）：柱・吹抜け・斜路・ブリーズ・ソレイユ・屋根 */
function drawColumns(C){
  const M=A.model; if(!M) return;
  arr(C.m.columns).filter(c=>c&&c.at&&c.w>0&&M.coversLevel(C.m, c, C.level.id)).forEach(c=>C.poly(M.columnPolygon(c), C.w.cut, {closed:true, fill:INK}));
}
function levelVoids(C){ const M=A.model; return M?arr(C.m.voids).filter(v=>v&&arr(v.polygon).length>=3&&M.coversLevel(C.m, v, C.level.id)):[]; }
function voidName(v){ return v.kind==='stairwell'?'階段室':(v.kind==='ramp'?'斜路の吹抜':'吹抜'); }
function drawVoids(C){
  const M=A.model, vs=levelVoids(C); if(!vs.length) return;
  C.svg.open('ad-hidden');
  vs.forEach(v=>{ C.poly(v.polygon, C.w.hid, {closed:true, dash:'hidden'}); const c=M.polyCentroid(v.polygon), p=C.P(c[0],c[1]); C.svg.text(p[0],p[1],voidName(v),T_NOTE,{mask:true,tag:'void'}); });
  C.svg.close();
}
function drawRamps(C, labels){
  const M=A.model; if(!M) return; const id=C.level.id, w=C.w, svg=C.svg, cut=(C.m.plan&&C.m.plan.cut)||1200;
  arr(C.m.ramps).forEach(r=>{ if(!r||(r.level!==id&&r.to!==id)) return; const g=M.rampGeom(C.m, r); if(!g.segs.length) return;
    const lower=r.level===id, S=g.segs;
    // 切断：下の階では、床から cut の高さに達した先（上る向きの奥）は破線（上部の輪郭）
    const uCut=(lower&&g.slope>0)?cut/g.slope:Infinity;
    let acc=0; const segParts=[];   // 区間ごとに [実線部の t 0..1, 破線部]
    S.forEach(s=>{ const t=Math.max(0, Math.min(1, (uCut-acc)/s.L)); segParts.push(t); acc+=s.L; });
    const sideLine=(pts, hidden)=>{ for(let i=0;i<S.length;i++){ const a=pts[i], b=pts[i+1], t=segParts[i]; const mid=[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
      if(!hidden&&t>0) C.lineP(a, mid, w.vis); if(hidden&&t<1) C.lineP(mid, b, w.hid, {dash:'hidden'}); } };
    svg.open('ad-ramp');
    sideLine(g.left,false); sideLine(g.right,false);
    C.lineP(g.left[0], g.right[0], w.thin); const n=g.left.length-1;
    if(segParts[S.length-1]>=1) C.lineP(g.left[n], g.right[n], w.thin);
    // 中心線と矢印（上る向き＝path の終わり）、始まりに白丸
    const mids=S.map((s,i)=>{ const t=segParts[i]; return [[s.a, [s.a[0]+s.d[0]*s.L*t, s.a[1]+s.d[1]*s.L*t]], t]; });
    mids.forEach(([[a,b],t],i)=>{ if(t>0) C.lineP(a,b,w.thin); if(t>=1&&i===S.length-1) arrowHead(C, b, S[i].d, w.thin); else if(t>0&&t<1) arrowHead(C, b, S[i].d, w.thin); });
    const p0=C.P(S[0].a[0],S[0].a[1]); svg.circle(p0[0],p0[1],C.fine?0.55:0.45,w.thin,{fill:PAPER});
    if(segParts.some(t=>t<1)){ svg.open('ad-hidden'); sideLine(g.left,true); sideLine(g.right,true); C.lineP(g.left[n], g.right[n], w.hid, {dash:'hidden'}); svg.close(); }
    // 切断線（cut に達する所）
    if(isFinite(uCut)&&uCut<g.run){ let a=0; for(let i=0;i<S.length;i++){ if(uCut<=a+S[i].L){ const t=(uCut-a)/S[i].L, s=S[i]; const c=[s.a[0]+s.d[0]*s.L*t, s.a[1]+s.d[1]*s.L*t], h=g.width/2;
      C.lineP([c[0]+s.n[0]*h-s.d[0]*h*0.25, c[1]+s.n[1]*h-s.d[1]*h*0.25],[c[0]-s.n[0]*h+s.d[0]*h*0.25, c[1]-s.n[1]*h+s.d[1]*h*0.25], w.thin); break; } a+=S[i].L; } }
    // 勾配の注記（例 1:12）：最も長い区間の脇。外壁の外に出る側なら反対の側
    const s=S.reduce((b,q)=>q.L>b.L?q:b, S[0]), c=[s.a[0]+s.d[0]*s.L/2, s.a[1]+s.d[1]*s.L/2], off=g.width/2+C.s*1.6, f=C.faces;
    if(g.label){ let q=[c[0]+s.n[0]*off, c[1]+s.n[1]*off]; const inF=(z)=>z[0]>f.W+200&&z[0]<f.E-200&&z[1]>f.S+200&&z[1]<f.N-200;
      if(!inF(q)){ const q2=[c[0]-s.n[0]*off, c[1]-s.n[1]*off]; if(inF(q2)) q=q2; }
      const p=C.P(q[0],q[1]); svg.text(p[0],p[1],'勾配 '+g.label,T_NOTE,{mask:true,tag:'ramp',rot:Math.abs(s.d[1])>Math.abs(s.d[0])?-90:0}); }
    const e=S[S.length-1], far=[e.b[0]+e.d[0]*(C.fine?260:380), e.b[1]+e.d[1]*(C.fine?260:380)];
    labels.push([lower?'上':'下', lower?far:[S[0].a[0]-S[0].d[0]*(C.fine?190:380), S[0].a[1]-S[0].d[1]*(C.fine?190:380)]]);
    svg.close();
  });
}
function drawScreens(C){
  const M=A.model; if(!M) return; const id=C.level.id, w=C.w, svg=C.svg, cut=(C.m.plan&&C.m.plan.cut)||1200;
  arr(C.m.screens).filter(s=>s&&s.level===id&&s.a&&s.b&&s.depth>0).forEach(s=>{
    const g=M.screenGeom(C.m, s), from=+s.from||0, top=from+(+s.height||0), cutHit=from<=cut&&cut<top, below=top<=cut;
    svg.open('ad-screen');
    if(cutHit){ g.fins.forEach(f=>C.poly(f, w.cut, {closed:true, fill:INK})); if(g.horizontal) C.poly(g.plate, w.vis, {closed:true}); }
    else if(below){ g.fins.forEach(f=>C.poly(f, w.thin, {closed:true})); C.poly(g.plate, w.vis, {closed:true}); }
    else { svg.open('ad-hidden'); g.fins.forEach(f=>C.poly(f, w.hid, {closed:true, dash:'hidden'})); C.poly(g.plate, w.hid, {closed:true, dash:'hidden'}); svg.close(); }
    svg.close();
  });
}
function drawRoofs(C){
  const M=A.model; if(!M||!M.roofFor) return; const w=C.w, svg=C.svg;
  M.roofFor(C.m, C.level.id).forEach(({roof, above})=>{ const pg=arr(roof.polygon); if(pg.length<3) return; const holes=M.roofHoles(roof).filter(h=>h.length>=3);
    if(above){ svg.open('ad-hidden'); C.poly(pg, w.hid, {closed:true, dash:'hidden'}); holes.forEach(h=>C.poly(h, w.hid, {closed:true, dash:'hidden'})); svg.close(); }
    else { svg.open('ad-roof'); C.poly(pg, w.vis, {closed:true}); holes.forEach(h=>C.poly(h, w.vis, {closed:true}));
      if(roof.name){ const c=M.polyCentroid(pg), p=C.P(c[0],c[1]); svg.text(p[0],p[1],roof.name,T_NOTE,{mask:true,tag:'roof'}); } svg.close(); }
  });
}

/* ======================================================================== 開口 parts.py */
function Frame(C, wall){ this.C=C; this.f=wallFrame(wall); this.v0=-wall.t/2; this.v1=wall.t/2; }
Frame.prototype={
  XY(u,v){ return this.f.W(u,v); },
  /* 曲面壁では u 方向の線を弧に沿って分ける（1 点 5°以下） */
  along(u0,v0,u1,v1){ const f=this.f; if(!f.curve||Math.abs(u1-u0)<1e-9) return [this.XY(u0,v0), this.XY(u1,v1)]; const n=Math.max(1, Math.ceil(Math.abs(u1-u0)/f.arc.r/(5*Math.PI/180))), out=[]; for(let k=0;k<=n;k++) out.push(this.XY(u0+(u1-u0)*k/n, v0+(v1-v0)*k/n)); return out; },
  line(u0,v0,u1,v1,sw,o){ const p=this.along(u0,v0,u1,v1); if(p.length===2) this.C.lineP(p[0], p[1], sw, o); else this.C.poly(p, sw, o); },
  rect(u0,v0,u1,v1,sw,o){ const pts=this.along(u0,v0,u1,v0).concat(this.along(u1,v1,u0,v1)); this.C.poly(pts, sw, Object.assign({closed:true}, o||{})); },
  poly(pts,sw,o){ this.C.poly(pts.map(p=>this.XY(p[0],p[1])), sw, o); },
};
function sashPanels(a, b, fw, n, ov){ const W=(b-a)-2*fw, pw=(W+(n-1)*ov)/n, out=[]; for(let k=0;k<n;k++){ const u0=a+fw+k*(pw-ov); out.push([u0, u0+pw, n===4?(k===0||k===n-1):(k===0)]); } return out; }
function outsideSign(C, wall){
  const f=wallFrame(wall), p=f.W(f.L/2, wall.t/2+200);
  const rooms=arr(C.m.rooms).filter(r=>r.level===C.level.id&&arr(r.polygon).length>=3);
  if(!rooms.length) return wall.kind==='partition'?1:1;
  return rooms.some(r=>inside(r.polygon,p[0],p[1]))?-1:1;
}
function drawWindow(C, o, wall){
  const w=C.w, F=new Frame(C, wall), a=o.at, b=o.at+o.width, out=outsideSign(C, wall);
  const vo=out<0?F.v0:F.v1, vi=out<0?F.v1:F.v0, s=out<0?1:-1;
  const col=o.fire&&C.accent?ACCENT:INK, shop=!!o.shutter, n=o.panels||2;
  if(C.fine){
    const fw=shop?50:40;
    [[a,a+fw],[b-fw,b]].forEach(([u0,u1])=>F.rect(u0,vo+s*20,u1,vo+s*110,w.vis,{stroke:col, fill:PAPER}));
    const tOut=vo+s*45, tIn=vo+s*85;
    sashPanels(a,b,fw,n,40).forEach(([u0,u1,outer])=>{ const vv=outer?tOut:tIn; F.line(u0,vv,u1,vv,w.vis,{stroke:col}); [u0,u1].forEach(uu=>F.line(uu,vv-18,uu,vv+18,w.vis,{stroke:col})); });
    [[a,-1],[b,1]].forEach(([uu,du])=>F.poly([[uu,vi],[uu+du*25,vi],[uu+du*25,vi+s*15],[uu-du*10,vi+s*15],[uu-du*10,vi]], w.thin, {fill:PAPER, closed:true}));
    if(o.sill>0){ F.poly([[a,vi],[a,vi+s*20],[b,vi+s*20],[b,vi]], w.thin); F.poly([[a-20,vo],[a-20,vo-s*30],[b+20,vo-s*30],[b+20,vo]], w.thin); }
    else { F.line(a,vi,b,vi,w.thin); F.line(a,vo,b,vo,w.thin); }
  } else {
    F.line(a,vo,b,vo,w.thin); F.line(a,vi,b,vi,w.thin);
    const tOut=vo+s*50, tIn=vo+s*100;
    sashPanels(a,b,0,n,60).forEach(([u0,u1,outer])=>{ const vv=outer?tOut:tIn; F.line(u0,vv,u1,vv,w.vis,{stroke:col}); });
  }
  if(shop){
    [[a-60,a+40],[b-40,b+60]].forEach(([u0,u1])=>F.rect(u0,vo,u1,vo-s*90,w.vis,{stroke:col, fill:PAPER}));
    C.svg.open('ad-hidden'); F.rect(a-120,vo,b+120,vo-s*330,w.hid,{stroke:col, dash:'hidden'}); C.svg.close();
  }
  if(o.rail){ F.rect(a,vo-s*70,b,vo-s*100,w.thin); [a+150,(a+b)/2,b-150].forEach(uu=>F.line(uu,vo,uu,vo-s*70,w.thin)); }
}
function drawDoorSwing(C, o, wall){
  const w=C.w, F=new Frame(C, wall), a=o.at, b=o.at+o.width;
  const sw=o.flip?1:-1, vs=sw<0?F.v0:F.v1, fr=C.fine?25:0, L=(b-a)-2*fr;
  const uh=(o.swing||'L')==='L'?a+fr:b-fr, du=(o.swing||'L')==='L'?1:-1;
  if(C.fine){ [[a,a+fr],[b-fr,b]].forEach(([u0,u1])=>F.rect(u0,F.v0-10,u1,F.v1+10,w.vis,{fill:PAPER})); F.rect(uh,vs,uh+du*36,vs+sw*L,w.vis,{fill:PAPER}); }
  else F.line(uh,vs,uh,vs+sw*L,w.vis);
  const pts=[]; for(let k=0;k<=24;k++){ const t=Math.PI/2*k/24; pts.push([uh+L*Math.sin(t)*du, vs+L*Math.cos(t)*sw]); }
  F.poly(pts, w.thin);
}
function drawDoorSlide(C, o, wall){
  const w=C.w, F=new Frame(C, wall), a=o.at, b=o.at+o.width, side=o.side||1, vf=side>0?F.v1:F.v0, t=36, gap=10;
  F.rect(a-40, vf+side*gap, b+40, vf+side*(gap+t), w.vis, {fill:PAPER});
  const [u0,u1]=(o.park||'b')==='b'?[a-40, b+(b-a)+40]:[a-(b-a)-40, b+40];
  C.svg.open('ad-hidden'); F.line(u0, vf+side*(gap+t+25), u1, vf+side*(gap+t+25), w.hid, {dash:'hidden'}); C.svg.close();
}
function drawClosetSlide(C, o, wall){
  const w=C.w, F=new Frame(C, wall), a=o.at, b=o.at+o.width, vc=0, n=o.panels||2;
  sashPanels(a,b,0,n,40).forEach(([u0,u1],k)=>{ const vv=k%2===0?vc-22:vc+22; F.line(u0,vv,u1,vv,w.vis); if(C.fine) [u0,u1].forEach(uu=>F.line(uu,vv-18,uu,vv+18,w.vis)); });
}
function drawOpenings(C){
  levelOpenings(C).forEach(({o,w})=>{
    if(o.type==='window'||o.type==='sweep') drawWindow(C,o,w);
    else if(o.type==='door') drawDoorSwing(C,o,w);
    else if(o.type==='slide'){ if(o.variant==='closet') drawClosetSlide(C,o,w); else drawDoorSlide(C,o,w); }
  });
}

/* ======================================================================== 階段 parts.py（JIS A 0150 13.2.9） */
function arrowHead(C, tipW, dirW, sw, length, width){
  length=length||2.0; width=width||0.9;
  const tip=C.P(tipW[0],tipW[1]), q=C.P(tipW[0]+dirW[0],tipW[1]+dirW[1]); let ux=q[0]-tip[0], uy=q[1]-tip[1]; const L=Math.hypot(ux,uy)||1; ux/=L; uy/=L;
  const nx=-uy, ny=ux;
  C.svg.polyline([tip,[tip[0]-ux*length+nx*width/2, tip[1]-uy*length+ny*width/2],[tip[0]-ux*length-nx*width/2, tip[1]-uy*length-ny*width/2]], sw, {closed:true, fill:INK});
}
function drawFlight(C, U, D, labels){
  const w=C.w, svg=C.svg, F=U||D, G=stairGeom(F), Wp=(s,c)=>G.W(s,c);
  const width=F.width, g=F.tread, hasCut=!!U;
  const cut=(C.m.plan&&C.m.plan.cut)||1200;
  const kCut=cut/(U?U.rise:200), yc=(kCut+0.5)*g, dy=1.1*g;
  const xd=(s)=>(s-(yc-dy))/(2*dy)*width;
  const seg=(s,part)=>{ if(!hasCut) return [0,width]; if(s<=yc-dy) return part==='low'?[0,width]:null; if(s>=yc+dy) return part==='low'?null:[0,width]; const x=xd(s); return part==='low'?[x,width]:[0,x]; };
  const nos=(fl)=>{ const o=[]; for(let i=0;i<fl.n;i++) o.push(i*fl.tread); return o; };
  const lastS=(fl)=>(fl.n-1)*fl.tread;
  const sl=(s,c0,c1,sw,o)=>C.lineP(Wp(s,c0),Wp(s,c1),sw,o);
  const hand=width-60, xm=width/2;
  if(U){ nos(U).forEach(s=>{ const q=seg(s,'low'); if(q) sl(s,q[0],q[1],w.thin); });
    if(!D){ svg.open('ad-hidden'); nos(U).forEach(s=>{ const q=seg(s,'high'); if(q) sl(s,q[0],q[1],w.hid,{dash:'hidden'}); }); svg.close(); } }
  if(D){ nos(D).forEach(s=>{ const q=seg(s,'high'); if(q) sl(s,q[0],q[1],w.thin); }); }
  if(hasCut){
    const pa=C.P(...Wp(yc-dy,0)), pb=C.P(...Wp(yc+dy,width)); const L=Math.hypot(pb[0]-pa[0],pb[1]-pa[1]);
    const ux=(pb[0]-pa[0])/L, uy=(pb[1]-pa[1])/L, nx=-uy, ny=ux, h=1.1, mm=[(pa[0]+pb[0])/2,(pa[1]+pb[1])/2];
    svg.polyline([pa,[mm[0]-ux*h*0.6, mm[1]-uy*h*0.6],[mm[0]-ux*h*0.2+nx*h, mm[1]-uy*h*0.2+ny*h],[mm[0]+ux*h*0.2-nx*h, mm[1]+uy*h*0.2-ny*h],[mm[0]+ux*h*0.6, mm[1]+uy*h*0.6],pb], w.thin);
  }
  let span; if(U&&!D) span=[0, yc-dy*0.2]; else if(U&&D) span=[0, lastS(D)]; else span=[0, lastS(D)];
  if(C.fine){ [hand-17.5, hand+17.5].forEach(c=>C.lineP(Wp(span[0],c),Wp(span[1],c),w.thin)); span.forEach(s=>sl(s,hand-17.5,hand+17.5,w.thin)); }
  else C.lineP(Wp(span[0],hand),Wp(span[1],hand),w.thin);
  const rDot=C.fine?0.55:0.45;
  if(U){ const yEnd=hasCut?(yc-dy*0.35):lastS(U); C.lineP(Wp(0,xm),Wp(yEnd,xm),w.thin); const p=C.P(...Wp(0,xm)); svg.circle(p[0],p[1],rDot,w.thin,{fill:PAPER}); arrowHead(C,Wp(yEnd,xm),G.d,w.thin);
    labels.push(['上', Wp(C.fine?-190:-380, xm)]); }
  if(D){ const yStart=hasCut?(yc+dy*0.45):0; C.lineP(Wp(yStart,xm),Wp(lastS(D),xm),w.thin);
    if(!hasCut){ const p=C.P(...Wp(0,xm)); svg.circle(p[0],p[1],rDot,w.thin,{fill:PAPER}); }
    arrowHead(C,Wp(lastS(D),xm),G.d,w.thin); labels.push(['下', Wp(lastS(D)+(C.fine?260:380), xm)]); }
  if(C.fine){
    const xn=130;
    const number=(fl,part)=>{ for(let i=1;i<=fl.n-1;i++){ const yy=(i-0.5)*fl.tread, lo=yy-90, hi=yy+90;
      if(hasCut){ const a=seg(lo,part), b=seg(hi,part); if(!a||!b) continue; if(part==='low'&&(a[0]>xn-80||b[0]>xn-80)) continue; if(part==='high'&&(a[1]<xn+80||b[1]<xn+80)) continue; }
      const p=C.P(...Wp(yy,xn)); svg.text(p[0],p[1],String(i),T_NOTE,{mask:true, tag:'step'}); } };
    if(U) number(U,'low'); else if(D) number(D,'high');
  }
}
function drawStairs(C, labels){
  const id=C.level.id, st=arr(C.m.stairs);
  const up=st.filter(s=>s.from===id), dn=st.filter(s=>s.to===id), used=new Set();
  const same=(a,b)=>a.dir===b.dir&&Math.abs(a.origin[0]-b.origin[0])<1&&Math.abs(a.origin[1]-b.origin[1])<1&&Math.abs(a.width-b.width)<1;
  up.forEach(U=>{ const D=dn.find(d=>!used.has(d.id)&&same(U,d)); if(D) used.add(D.id); drawFlight(C,U,D||null,labels); });
  dn.filter(d=>!used.has(d.id)).forEach(D=>drawFlight(C,null,D,labels));
}

/* ======================================================================== 家具・設備 parts.py */
function fixtureT(f){ const th=(f.rot||0)*Math.PI/180, c=Math.cos(th), s=Math.sin(th); return (lx,ly)=>[f.at[0]+c*lx-s*ly, f.at[1]+s*lx+c*ly]; }
function drawFixture(C, f){
  const w=C.w, sw=w.thin, T=fixtureT(f), hw=(f.w||0)/2, hd=(f.d||0)/2, r=[-hw,-hd,hw,hd];
  const R=(x0,y0,x1,y1,s,o)=>C.poly([T(x0,y0),T(x1,y0),T(x1,y1),T(x0,y1)], s, Object.assign({closed:true}, o||{}));
  const Ln=(x0,y0,x1,y1,s,o)=>C.lineP(T(x0,y0),T(x1,y1),s,o);
  const Ci=(x,y,rr,s,o)=>{ const p=T(x,y); C.circle(p[0],p[1],rr,s,o); };
  const El=(x,y,rx,ry,s,o)=>{ const p=C.P(...T(x,y)); C.svg.ellipse(p[0],p[1],C.L(rx),C.L(ry),s,Object.assign({rot:-(f.rot||0)},o||{})); };
  const P={fill:PAPER};
  switch(f.kind){
    case 'toilet': R(-220,-362.5,220,-152.5,sw,P); El(0,97.5,185,265,sw,P); El(0,117.5,120,190,sw); break;
    case 'handbasin': R(...r,sw,P); El(-5,0,90,140,sw); break;
    case 'bench': R(...r,sw,P); if(C.fine){ [0,1].forEach(k=>{ const xx=k===0?r[0]+250:r[2]-250-350; [r[1]-380, r[3]+30].forEach(yy=>Ci(xx+175,yy+175,170,sw,P)); }); } break;
    case 'shelf': { R(...r,sw,P); const dv=f.div||900; let y=r[1]+dv; while(y<r[3]-1){ Ln(r[0],y,r[2],y,sw); y+=dv; } if(C.fine) Ln(r[0]+40,r[1],r[0]+40,r[3],sw); break; }
    case 'shoebox': R(...r,sw,P); if(C.fine){ Ln(r[0],0,r[2],0,sw); } break;
    case 'fridge': case 'wardrobe': R(...r,sw,P); Ln(r[0],r[1],r[2],r[3],sw); Ln(r[0],r[3],r[2],r[1],sw); break;
    case 'counter': { R(...r,sw,P); const sk=f.sink; if(sk){ R(...sk,sw); if(C.fine){ R(sk[0]+30,sk[1]+30,sk[2]-30,sk[3]-30,sw); Ci((sk[0]+sk[2])/2,(sk[1]+sk[3])/2,30,sw); Ci((sk[0]+sk[2])/2,sk[3]+60,25,sw); } }
      if(f.hob){ const [hx,hy]=f.hob; [[-170,-100,95],[170,-100,95],[0,120,75]].forEach(([dx,dy,rr])=>Ci(hx+dx,hy+dy,rr,sw)); } break; }
    case 'hood': case 'skylight': R(...r,w.hid,{dash:'hidden'}); break;
    case 'rod': Ln(-hw,0,hw,0,w.hid,{dash:'hidden'}); break;
    case 'table': { R(...r,sw,P); const cw=430; [0.27,0.73].map(q=>r[0]+(r[2]-r[0])*q).forEach(xc=>[-1,1].forEach(side=>{ const ye=side<0?r[1]:r[3], y0=ye+side*60, y1=y0+side*cw;
      R(xc-cw/2,Math.min(y0,y1),xc+cw/2,Math.max(y0,y1),sw,P); Ln(xc-cw/2,y1-side*60,xc+cw/2,y1-side*60,sw); })); break; }
    case 'sofa': R(...r,sw,P); Ln(r[0]+200,r[1]+180,r[0]+200,r[3]-180,sw); Ln(r[0],r[1]+180,r[2],r[1]+180,sw); Ln(r[0],r[3]-180,r[2],r[3]-180,sw); if(C.fine) Ln(r[0]+200,0,r[2],0,sw); break;
    case 'bed': { R(...r,sw,P); const n=f.pillows||1;
      if(f.head==='E'){ const L=r[3]-r[1], pw=(L-100*(n+1))/n; for(let k=0;k<n;k++){ const y0=r[1]+100+k*(pw+100); R(r[2]-120-330,y0,r[2]-120,y0+pw,sw); } Ln(r[0]+650,r[1],r[0]+650,r[3],sw); }
      else { const L=r[2]-r[0], pw=(L-100*(n+1))/n; for(let k=0;k<n;k++){ const x0=r[0]+100+k*(pw+100); R(x0,r[3]-120-330,x0+pw,r[3]-120,sw); } Ln(r[0],r[1]+650,r[2],r[1]+650,sw); } break; }
    case 'desk': R(...r,sw,P); R(-220,r[1]-80-440,220,r[1]-80,sw,P); break;
    case 'tub': R(...r,sw,P); R(r[0]+70,r[1]+70,r[2]-70,r[3]-70,sw); Ci(0,r[1]+220,35,sw); break;
    case 'shower': R(-150,40,150,110,sw,P); Ci(0,-50,60,sw); break;
    case 'vanity': R(...r,sw,P); El(0,-20,230,160,sw); break;
    case 'washer': R(...r,sw,P); R(r[0]+40,r[1]+40,r[2]-40,r[3]-40,sw); Ci(0,0,200,sw); break;
    default: R(...r,sw,P);
  }
}
function fixtureBox(f){ const T=fixtureT(f), hw=(f.w||0)/2, hd=(f.d||0)/2; const p=[T(-hw,-hd),T(hw,-hd),T(hw,hd),T(-hw,hd)]; const xs=p.map(q=>q[0]), ys=p.map(q=>q[1]); return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]; }
function drawFixtures(C){
  const fs=arr(C.m.fixtures).filter(f=>f.level===C.level.id&&f.at);
  fs.filter(f=>!f.upper).forEach(f=>drawFixture(C,f));
  const up=fs.filter(f=>f.upper); if(up.length){ C.svg.open('ad-hidden'); up.forEach(f=>drawFixture(C,f)); C.svg.close(); }
}

/* 土間：まばらな点（紙 7 mm² に 1 点）。乱数は種 150 の mulberry32（Python 版は random.Random(150)。点の位置は違う） */
function drawDoma(C, room, keep){
  const poly=room.polygon, xs=poly.map(p=>p[0]), ys=poly.map(p=>p[1]);
  const x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  const rnd=mulberry(150), n=Math.floor((x1-x0)*(y1-y0)/(C.s*C.s)/7.0), pts=[];
  for(let i=0;i<n;i++){ const x=x0+(x1-x0)*rnd(), y=y0+(y1-y0)*rnd(); if(!inside(poly,x,y)) continue; if(keep.some(k=>k[0]-40<x&&x<k[2]+40&&k[1]-40<y&&y<k[3]+40)) continue; pts.push(C.P(x,y)); }
  const r=C.fine?0.09:0.075;
  const d=pts.map(p=>'M'+fmt(p[0]-r)+','+fmt(p[1])+'a'+fmt(r)+','+fmt(r)+' 0 1,0 '+fmt(2*r)+',0a'+fmt(r)+','+fmt(r)+' 0 1,0 '+fmt(-2*r)+',0').join(' ');
  if(d) C.svg.path(d, null, {fill:INK});
}

/* ======================================================================== 注記 annot.py */
function dimChain(C, side, pos, dist, labels, extFrom, extLen){
  const svg=C.svg, w=C.w, face=C.faces[side], sgn={S:1,N:-1,W:-1,E:1}[side];
  if(!labels) labels=pos.slice(0,-1).map((p,k)=>fmtmm(pos[k+1]-p));
  C.dims.push({side, pos:pos.slice(), labels:labels.slice()});
  const t2=TICK/2/Math.SQRT2;
  if(side==='S'||side==='N'){
    const yface=C.P(0,face)[1], yd=yface+sgn*dist, ps=pos.map(p=>C.P(p,0)[0]);
    const ye0=yface+sgn*(extFrom!=null?extFrom:dist-(extLen||2.5));
    ps.forEach(x=>{ svg.line(x,ye0,x,yd+sgn*EXT_OVER,w.thin); svg.line(x-t2,yd+t2,x+t2,yd-t2,w.vis); });
    svg.line(ps[0]-1.2,yd,ps[ps.length-1]+1.2,yd,w.thin);
    const ty=yd-DIM_TEXT_GAP-T_NOTE/2;
    labels.forEach((s,k)=>{ const xa=ps[k], xb=ps[k+1], tw=textWidth(s,T_NOTE);
      if(tw+0.8<=xb-xa) svg.text((xa+xb)/2,ty,s,T_NOTE,{mask:true,tag:'dim'});
      else if(k===0) svg.text(xa-1.2,ty,s,T_NOTE,{anchor:'end',mask:true,tag:'dim'});
      else if(k===labels.length-1) svg.text(xb+1.2,ty,s,T_NOTE,{anchor:'start',mask:true,tag:'dim'});
      else svg.text((xa+xb)/2,ty-T_NOTE-0.3,s,T_NOTE,{tag:'dim-raised'}); });
  } else {
    const xface=C.P(face,0)[0], xd=xface+sgn*dist, ps=pos.map(p=>C.P(0,p)[1]);
    const xe0=xface+sgn*(extFrom!=null?extFrom:dist-(extLen||2.5));
    ps.forEach(y=>{ svg.line(xe0,y,xd+sgn*EXT_OVER,y,w.thin); svg.line(xd-t2,y+t2,xd+t2,y-t2,w.vis); });
    svg.line(xd,ps[0]+1.2,xd,ps[ps.length-1]-1.2,w.thin);
    const tx=xd-DIM_TEXT_GAP-T_NOTE/2;
    labels.forEach((s,k)=>{ const ya=ps[k], yb=ps[k+1], tw=textWidth(s,T_NOTE);
      if(tw+0.8<=ya-yb) svg.text(tx,(ya+yb)/2,s,T_NOTE,{rot:-90,mask:true,tag:'dim'});
      else if(k===0) svg.text(tx,ya+1.2,s,T_NOTE,{rot:-90,anchor:'end',mask:true,tag:'dim'});
      else if(k===labels.length-1) svg.text(tx,yb-1.2,s,T_NOTE,{rot:-90,anchor:'start',mask:true,tag:'dim'});
      else svg.text(tx-T_NOTE-0.3,(ya+yb)/2,s,T_NOTE,{rot:-90,tag:'dim-raised'}); });
  }
}
function gapped(svg, x0, y0, x1, y1, sw, gaps, pad){
  pad=pad==null?0.35:pad; const vertical=Math.abs(x1-x0)<1e-9;
  const a=vertical?Math.min(y0,y1):Math.min(x0,x1), b=vertical?Math.max(y0,y1):Math.max(x0,x1), cuts=[];
  gaps.forEach(g=>{ if(vertical&&g[0]-pad<=x0&&x0<=g[2]+pad) cuts.push([g[1]-pad,g[3]+pad]); else if(!vertical&&g[1]-pad<=y0&&y0<=g[3]+pad) cuts.push([g[0]-pad,g[2]+pad]); });
  cuts.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
  let t=a; const seg=(p,q)=>vertical?svg.line(x0,p,x0,q,sw,{dash:'chain'}):svg.line(p,y0,q,y0,sw,{dash:'chain'});
  cuts.forEach(([c0,c1])=>{ if(c1<=t||c0>=b) return; if(c0>t) seg(t,c0); t=Math.max(t,c1); });
  if(t<b) seg(t,b);
}
function drawGrid(C, lay, gaps){
  const svg=C.svg, w=C.w, f=C.faces, r=lay.r, sides=lay.bubbleSides, dist=lay.bubble;
  const yN=C.P(0,f.N)[1], yS=C.P(0,f.S)[1], xW=C.P(f.W,0)[0], xE=C.P(f.E,0)[0];
  const gx=arr(C.m.grid&&C.m.grid.x), gy=arr(C.m.grid&&C.m.grid.y), labels=[];
  svg.open('ad-grid');
  gx.forEach(g=>{ const x=C.P(g.at,0)[0]; const yt=sides.indexOf('N')>=0?yN-dist.N+r:yN-2, yb=sides.indexOf('S')>=0?yS+dist.S-r:yS+2; gapped(svg,x,yt,x,yb,w.thin,gaps);
    ['N','S'].forEach(sd=>{ if(sides.indexOf(sd)>=0) labels.push([x, sd==='N'?yN-dist.N:yS+dist.S, g.id]); }); });
  gy.forEach(g=>{ const y=C.P(0,g.at)[1]; const xl=sides.indexOf('W')>=0?xW-dist.W+r:xW-2, xr=sides.indexOf('E')>=0?xE+dist.E-r:xE+2; gapped(svg,xl,y,xr,y,w.thin,gaps);
    ['W','E'].forEach(sd=>{ if(sides.indexOf(sd)>=0) labels.push([sd==='W'?xW-dist.W:xE+dist.E, y, g.id]); }); });
  svg.close();
  svg.open('ad-grid-label'); labels.forEach(([x,y,s])=>{ svg.circle(x,y,r,w.thin,{fill:PAPER}); svg.text(x,y,s,T_ROOM,{tag:'grid'}); }); svg.close();
}
function sectionMarks(C, d0, seglen){
  seglen=seglen||5.5; const svg=C.svg, w=C.w, f=C.faces;
  const yN=C.P(0,f.N)[1], yS=C.P(0,f.S)[1], xW=C.P(f.W,0)[0], xE=C.P(f.E,0)[0];
  arr(C.m.sections).forEach(sec=>{ if(!sec.a||!sec.b) return; const key=sec.id;
    if(Math.abs(sec.a[1]-sec.b[1])<1e-6){
      const y=C.P(0,sec.a[1])[1], look=sec.look==='S'?1:-1, aW=sec.a[0]<=sec.b[0];
      [['W',xW,-1,aW?key:key+"'"],['E',xE,1,aW?key+"'":key]].forEach(([side,xf,sg,lab])=>{ const a=xf+sg*d0[side], b=a+sg*seglen;
        svg.line(a,y,b,y,w.cut); const ax=b, tip=[ax,y+look*4.2]; svg.line(ax,y,tip[0],tip[1]-look*1.6,w.vis);
        svg.polyline([tip,[ax-0.75,tip[1]-look*1.8],[ax+0.75,tip[1]-look*1.8]],w.thin,{closed:true,fill:INK});
        if(C.lay&&C.lay.coarse) svg.text(ax+sg*1.6,y+look*2.2,lab,T_ROOM,{weight:'bold',anchor:sg<0?'end':'start',tag:'section'});   // 1:200：符号の丸に当たらないよう矢の脇に
        else svg.text(ax,tip[1]+look*2.3,lab,T_ROOM,{weight:'bold',tag:'section'}); });
    } else if(Math.abs(sec.a[0]-sec.b[0])<1e-6){
      const x=C.P(sec.a[0],0)[0], look=sec.look==='E'?1:-1, aS=sec.a[1]<=sec.b[1];
      [['S',yS,1,aS?key:key+"'"],['N',yN,-1,aS?key+"'":key]].forEach(([side,yf,sg,lab])=>{ const a=yf+sg*d0[side], b=a+sg*seglen;
        svg.line(x,a,x,b,w.cut); const ay=b, tip=[x+look*4.2,ay]; svg.line(x,ay,tip[0]-look*1.6,ay,w.vis);
        svg.polyline([tip,[tip[0]-look*1.8,ay-0.75],[tip[0]-look*1.8,ay+0.75]],w.thin,{closed:true,fill:INK});
        svg.text(tip[0]+look*2.0,ay,lab,T_ROOM,{weight:'bold',tag:'section'}); });
    }
  });
}
function northArrow(svg, cx, cy, r, w, deg){
  svg.open('ad-north', deg?'transform="rotate('+fmt(-deg)+' '+fmt(cx)+' '+fmt(cy)+')"':'');
  svg.circle(cx,cy,r,w.thin); svg.line(cx,cy+r,cx,cy-r-1.0,w.thin);
  const tip=[cx,cy-r*0.95];
  svg.polyline([tip,[cx+r*0.38,cy+r*0.55],[cx,cy+r*0.25]],w.thin,{closed:true,fill:INK});
  svg.polyline([tip,[cx-r*0.38,cy+r*0.55],[cx,cy+r*0.25]],w.thin,{closed:true,fill:PAPER});
  svg.text(cx,cy-r-3.0,'N',T_ROOM,{weight:'bold',tag:'north'});
  svg.close();
}
function scaleBar(svg, x, y, scale, meters, w, sub){
  sub=sub||1; const L=meters*1000/scale, h=1.4, step=1000/scale*sub, n=Math.round(meters/sub);
  svg.open('ad-scalebar');
  for(let k=0;k<n;k++) svg.rect(x+k*step,y,x+(k+1)*step,y+h,w.thin,{fill:k%2===0?INK:PAPER});
  for(let k=0;k<=n;k++){ if(k%Math.max(1,Math.round(1/sub))===0||k===n) svg.text(x+k*step,y+h+2.2,String(+(k*sub).toFixed(3)),T_NOTE,{tag:'scale'}); }
  svg.text(x+L+2.0,y+h/2,'m',T_NOTE,{anchor:'start',tag:'scale'});
  svg.close(); return L;
}
function levelMark(C, X, Y, label){
  const svg=C.svg, w=C.w, p=C.P(X,Y), s=1.3;
  svg.polyline([[p[0]-s,p[1]-s],[p[0]+s,p[1]-s],[p[0],p[1]]],w.thin,{closed:true,fill:PAPER});
  svg.line(p[0]-s*1.6,p[1],p[0]+s*1.6,p[1],w.thin);
  const m2=C.lay&&C.lay.coarse?String(label).match(/^([^＝=]+)([＝=].+)$/):null;
  if(m2){ svg.text(p[0]+s*2.2,p[1]-s*0.6,m2[1],T_NOTE,{anchor:'start',mask:true,tag:'level'}); svg.text(p[0]+s*2.2,p[1]+s*0.6+T_NOTE*0.4,m2[2],T_NOTE,{anchor:'start',mask:true,tag:'level'}); }   // 1:200：2 行にして階段や家具にかからないように
  else svg.text(p[0]+s*2.2,p[1]-s*0.6,label,T_NOTE,{anchor:'start',mask:true,tag:'level'});
}
/* ── 室名：置き場が壁・設備・階段・戸の開きにかかるときは、中身を減らし（補足→面積→字の大きさ）、室の中で空いている所へ動かす。
      それでも入らない小さな室は、外壁の外に出して引出線で結ぶ（1:200 の見開きで「便所」「物入」が壁で切れていた）。
      与えられた置き場に入るときは Python 版（plan.py）とまったく同じ描き方。 */
function segHitsRect(a, b, r){
  const inR=(p)=>r[0]<=p[0]&&p[0]<=r[2]&&r[1]<=p[1]&&p[1]<=r[3];
  if(inR(a)||inR(b)) return true;
  const cross=(p,q,u,v)=>{ const d=(q[0]-p[0])*(v[1]-u[1])-(q[1]-p[1])*(v[0]-u[0]); if(Math.abs(d)<1e-9) return false;
    const t=((u[0]-p[0])*(v[1]-u[1])-(u[1]-p[1])*(v[0]-u[0]))/d, s=((u[0]-p[0])*(q[1]-p[1])-(u[1]-p[1])*(q[0]-p[0]))/d; return t>=0&&t<=1&&s>=0&&s<=1; };
  const c=[[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]];
  for(let i=0;i<4;i++) if(cross(a,b,c[i],c[(i+1)%4])) return true;
  return false;
}
function rectOverlap(a, b){ return !(a[2]<=b[0]||b[2]<=a[0]||a[3]<=b[1]||b[3]<=a[1]); }
function roomObstacles(C){
  if(C._obst) return C._obst;
  const out=[], id=C.level.id, pad=40;
  arr(C.m.fixtures).filter(f=>f.level===id&&f.at).forEach(f=>{ const b=fixtureBox(f); out.push([b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad,'fixture']); });
  arr(C.m.stairs).filter(st=>st.from===id||st.to===id).forEach(st=>{ const G=stairGeom(st), p=[G.W(0,0),G.W(G.run,0),G.W(G.run,st.width),G.W(0,st.width)];
    const xs=p.map(q=>q[0]), ys=p.map(q=>q[1]); out.push([Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)+pad,Math.max(...ys)+pad]); });
  levelOpenings(C).forEach(({o,w})=>{ if(o.type!=='door') return; const f=wallFrame(w), L=o.width, sw=o.flip?1:-1;
    const uh=(o.swing||'L')==='L'?o.at:o.at+o.width, du=(o.swing||'L')==='L'?1:-1;
    const p=[f.W(uh,0), f.W(uh+du*L,0), f.W(uh,sw*L), f.W(uh+du*L,sw*L)]; const xs=p.map(q=>q[0]), ys=p.map(q=>q[1]);
    out.push([Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]); });
  // 斜め・曲面の壁（室の多角形の中を通る）：壁に沿って小さな箱を並べる
  levelWalls(C).filter(x=>wallAxis(x)===null).forEach(x=>{ const f=wallFrame(x), h=x.t/2+pad, step=Math.max(200, x.t*2); for(let u=0;u<=f.L;u+=step){ const p=f.W(Math.min(u,f.L),0); out.push([p[0]-h,p[1]-h,p[0]+h,p[1]+h]); } });
  // 柱と「吹抜」の文字（室名が載らないように）
  const M=A.model; if(M){
    arr(C.m.columns).filter(c=>c&&c.at&&c.w>0&&M.coversLevel(C.m, c, id)).forEach(c=>{ const b=M.polyBox(M.columnPolygon(c)); out.push([b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad]); });
    levelVoids(C).forEach(v=>{ const c=M.polyCentroid(v.polygon), hw=textWidth(voidName(v),T_NOTE)*C.s/2+pad, hh=T_NOTE*C.s/2+pad; out.push([c[0]-hw,c[1]-hh,c[0]+hw,c[1]+hh]); }); }
  C._obst=out; return out;
}
function boxFitsRoom(C, room, box, loose){
  const poly=room.polygon, n=poly.length, inset=60;   // 壁の面から 60 は空ける（間仕切り 100 の半分＋余裕）
  const r=[box[0]-inset, box[1]-inset, box[2]+inset, box[3]+inset];
  const corners=[[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]],[(r[0]+r[2])/2,(r[1]+r[3])/2]];
  if(!corners.every(p=>inside(poly,p[0],p[1]))) return false;
  for(let i=0;i<n;i++) if(segHitsRect(poly[i],poly[(i+1)%n],r)) return false;
  return !roomObstacles(C).some(o=>(!loose||o[4]!=='fixture')&&rectOverlap(box,o));   // loose：家具には白抜きで重ねてよい（階段・戸の開きは避ける）
}
function labelVariants(room, area, small, nameOnly){
  const a=area.toFixed(2)+' m²', name=room.labelText||room.name, v=[];
  if(nameOnly){ v.push({kind:'name', lines:[[name,T_NOTE,'bold']]}); return v; }
  if(!small){ const full=[[name,T_ROOM,'bold']]; if(room.sub) full.push([room.sub,T_NOTE,'normal']); full.push([a,T_NOTE,'normal']); v.push({kind:'stack', lines:full});
    if(room.sub) v.push({kind:'stack', lines:[[name,T_ROOM,'bold'],[a,T_NOTE,'normal']]}); }
  v.push({kind:'row', lines:[[name,T_NOTE,'bold'],[a,T_NOTE,'normal']]});
  if(!small) v.push({kind:'stack', lines:[[name,T_ROOM,'bold']]});
  v.push({kind:'name', lines:[[name,T_NOTE,'bold']]});
  return v;
}
function variantSize(v){   // 紙の mm：[幅, 高さ]
  if(v.kind==='row') return [textWidth(v.lines[0][0],T_NOTE)+1.2+textWidth(v.lines[1][0],T_NOTE), T_NOTE];
  return [Math.max(...v.lines.map(l=>textWidth(l[0],l[1]))), v.lines.reduce((s,l)=>s+l[1],0)+0.6*(v.lines.length-1)];
}
function drawVariant(C, v, p){
  const svg=C.svg;
  if(v.kind==='row'){ const wn=textWidth(v.lines[0][0],T_NOTE), x0=p[0]-variantSize(v)[0]/2;
    svg.text(x0,p[1],v.lines[0][0],T_NOTE,{anchor:'start',weight:'bold',mask:true,tag:'room'}); svg.text(x0+wn+1.2,p[1],v.lines[1][0],T_NOTE,{anchor:'start',mask:true,tag:'room'}); return; }
  const total=variantSize(v)[1]; let y=p[1]-total/2;
  v.lines.forEach(([s,sz,wt])=>{ svg.text(p[0],y+sz/2,s,sz,{weight:wt,mask:true,tag:'room'}); y+=sz+0.6; });
}
function roomLabel(C, room, area, small, nameOnly){
  const s=C.s, poly=arr(room.polygon);
  const at=room.label||(()=>{ const xs=poly.map(q=>q[0]), ys=poly.map(q=>q[1]); return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2]; })();
  const variants=labelVariants(room, area, small, nameOnly);
  const worldBox=(v, X, Y)=>{ const [w,h]=variantSize(v); return [X-w*s/2, Y-h*s/2, X+w*s/2, Y+h*s/2]; };
  const v0=variants[0];
  if(!poly||poly.length<3||boxFitsRoom(C, room, worldBox(v0, at[0], at[1]))){ drawVariant(C, v0, C.P(at[0],at[1])); return; }
  // 中身を減らしながら、与えられた置き場 → 室の中の近い所の順に探す
  const xs=poly.map(q=>q[0]), ys=poly.map(q=>q[1]), x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
  // 候補：与えた置き場・室の中心・中心の列と行、そのあと粗い格子→細かい格子（狭い室は入る所が 1 点しかないことがある）
  const cx0=(x0+x1)/2, cy0=(y0+y1)/2, byDist=(p,q)=>Math.hypot(p[0]-at[0],p[1]-at[1])-Math.hypot(q[0]-at[0],q[1]-at[1]);
  const grid=(step)=>{ const o=[]; for(let y=y0+step;y<y1;y+=step) for(let x=x0+step;x<x1;x+=step) o.push([x,y]); return o.sort(byDist); };
  const base=[[at[0],at[1]],[cx0,cy0],[cx0,at[1]],[at[0],cy0]];
  const s1=Math.max(50, Math.round(0.5*s/10)*10), s2=Math.max(20, Math.round(s1/5));
  const passes=[base, grid(s1), grid(s2)];
  for(const loose of [false,true]) for(const v of variants) for(const pts of passes) for(const p of pts){
    if(boxFitsRoom(C, room, worldBox(v,p[0],p[1]), loose)){ drawVariant(C, v, C.P(p[0],p[1])); return; } }
  // 入らない：外壁の外へ出して引出線（名前だけ・2.0）
  const v=variants[variants.length-1], f=C.faces, [tw]=variantSize(v);
  // 外壁に接している辺を優先（引出線が他の室を横切らない）。同じ辺に並ぶときは紙の上でずらす
  const touch=(d)=>d<300?-1e6+d:d;
  const cands=[['W',touch(x0-f.W)],['E',touch(f.E-x1)],['N',touch(f.N-y1)],['S',touch(y0-f.S)]].sort((a,b)=>a[1]-b[1]);
  const side=cands[0][0], gap=1.2, cx=(x0+x1)/2, cy=(y0+y1)/2;
  let tp, anchor='middle', from;
  if(side==='W'){ from=C.P(x0+inset0(C), cy); tp=[C.P(f.W,0)[0]-gap, from[1]]; anchor='end'; }
  else if(side==='E'){ from=C.P(x1-inset0(C), cy); tp=[C.P(f.E,0)[0]+gap, from[1]]; anchor='start'; }
  else if(side==='N'){ from=C.P(cx, y1-inset0(C)); tp=[from[0], C.P(0,f.N)[1]-gap-T_NOTE/2]; }
  else { from=C.P(cx, y0+inset0(C)); tp=[from[0], C.P(0,f.S)[1]+gap+T_NOTE/2]; }
  const used=C._outside=C._outside||[], tw2=tw+0.4;
  const tbox=()=>{ const x=anchor==='end'?tp[0]-tw2:(anchor==='start'?tp[0]:tp[0]-tw2/2); return [x,tp[1]-T_NOTE/2-0.3,x+tw2,tp[1]+T_NOTE/2+0.3]; };
  for(let k=0;k<20&&used.some(u=>rectOverlap(u,tbox()));k++){ if(side==='W'||side==='E') tp[1]+=(k%2?-1:1)*(k+1)*(T_NOTE+0.6); else tp[0]+=(k%2?-1:1)*(k+1)*(tw2+0.8); }
  used.push(tbox());
  const svg=C.svg, inner=C.P(at[0],at[1]);
  const te=[tp[0], tp[1]+(side==='N'?T_NOTE/2+0.3:(side==='S'?-T_NOTE/2-0.3:0))];
  svg.line(inner[0],inner[1],from[0],from[1],C.w.thin); svg.line(from[0],from[1],te[0],te[1],C.w.thin);
  svg.circle(inner[0],inner[1],0.35,null,{fill:INK});
  svg.text(tp[0],tp[1],v.lines[0][0],T_NOTE,{anchor,weight:'bold',mask:true,tag:'room'});
  void tw;
}
function inset0(C){ return 100+0.4*C.s; }

/* ======================================================================== 組み立て plan.py */
function Layout(fine, ground, coarse){
  if(coarse){   // 1:200 以下（見開きの平面）：寸法は通り芯間と全体の 2 段だけ。符号は北と西
    this.r=2.6; this.t={N:[7,12],E:[7,12],W:[7,12],S:[7,12]}; this.bubbleSides=['N','W']; this.bubble={N:17.5,W:17.5,S:0,E:0}; this.sec={N:16,W:16,E:16,S:16}; this.coarse=true; }
  else if(fine){ this.r=3.5; this.t={N:[10,17,24],E:[10,17,24],W:[10,17,24],S:ground?[18,25,32]:[10,17,24]}; this.bubbleSides=['N','S','W','E'];
    this.bubble={}; this.sec={}; 'NSWE'.split('').forEach(s=>{ this.bubble[s]=this.t[s][this.t[s].length-1]+7.5; this.sec[s]=this.t[s][this.t[s].length-1]+3.0; }); }
  else { this.r=3.0; this.t={N:[8,13,18],E:[8,13,18],W:[8,13,18],S:[10,15]}; this.bubbleSides=['N','W']; this.bubble={N:24.5,W:24.5,S:0,E:0}; this.sec={N:21.0,W:21.0,E:21.0,S:17.5}; }
}
function computeFaces(m, level){
  const ws=arr(m.walls).filter(w=>w.level===level.id&&w.kind!=='partition'&&w.a&&w.b);
  const gx=arr(m.grid&&m.grid.x).map(g=>g.at), gy=arr(m.grid&&m.grid.y).map(g=>g.at);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  ws.forEach(w=>{ const r=wallRect(w)||(()=>{ const p=wallPoly(w); return [Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))]; })();
    x0=Math.min(x0,r[0]); y0=Math.min(y0,r[1]); x1=Math.max(x1,r[2]); y1=Math.max(y1,r[3]); });
  if(x0>x1){   // 外壁の無い階（屋上・ピロティ）：柱の外接矩形、無ければ通り芯
    const M=A.model; if(M) arr(m.columns).filter(c=>c&&c.at&&c.w>0&&M.coversLevel(m, c, level.id)).forEach(c=>{ const b=M.polyBox(M.columnPolygon(c)); x0=Math.min(x0,b[0]); y0=Math.min(y0,b[1]); x1=Math.max(x1,b[2]); y1=Math.max(y1,b[3]); }); }
  if(x0>x1){ x0=gx.length?Math.min(...gx):0; x1=gx.length?Math.max(...gx):5400; y0=gy.length?Math.min(...gy):0; y1=gy.length?Math.max(...gy):8100; }
  return {W:x0, S:y0, E:x1, N:y1};
}
function levelText(m, level){
  if(!isFinite(+level.fl)) return level.id+'L';   // FL が無い階に NaN を書かない
  const ls=arr(m.levels).filter(l=>isFinite(+l.fl)).sort((a,b)=>a.fl-b.fl), i=ls.findIndex(l=>l.id===level.id);
  if(i<=0) return level.id+'L＝GL＋'+fmtmm(level.fl);
  return level.id+'L＝'+ls[i-1].id+'L＋'+fmtmm(level.fl-ls[i-1].fl);
}
function levelJa(id){ const n=String(id).match(/^(\d+)F$/); return n?n[1]+' 階':String(id); }
function levelName(level){ return level&&level.name?String(level.name):levelJa(level&&level.id); }
/* 凡例・図題の語：モデルの materials（exterior・fire）から。無ければ壁の kind（fire→耐火）か一般の語。「防火設備」は fire の開口があるときだけ */
function wordsOf(m){ const mat=m.materials||{}; const ws=arr(m.walls);
  const ext=mat.exterior||(ws.some(w=>w.kind==='fire')&&!ws.some(w=>w.kind==='exterior')?'耐火の外壁':'外壁');
  const fire=arr(m.openings).some(o=>o.fire)?(mat.fire||'防火設備'):null;
  const road=roadName(m), accent=ws.some(w=>w.accent);
  const accentLabel=accent?((road?road+'に面する':'強調する')+ext+(fire?'・'+fire:'')):null;
  return { ext, fire, road, accent, accentLabel, accentCaption:accent?((road?road+'に面する':'')+ext+(fire?'と'+fire:'')):null }; }
function openingChain(C, side){
  const gx=arr(C.m.grid.x).map(g=>g.at), xs=[Math.min(...gx), Math.max(...gx)], f=C.faces;
  levelOpenings(C).forEach(({o,w})=>{ if(w.kind==='partition'||wallAxis(w)!=='x') return; const y=w.a[1];
    if(side==='N'?y<f.N-w.t-1:y>f.S+w.t+1) return; const fr=wallFrame(w); xs.push(fr.W(o.at,0)[0], fr.W(o.at+o.width,0)[0]); });
  return [...new Set(xs.map(v=>Math.round(v*2)/2))].sort((a,b)=>a-b);
}
function stairChain(C){
  const id=C.level.id, st=arr(C.m.stairs), gy=arr(C.m.grid.y).map(g=>g.at), y0=Math.min(...gy), y1=Math.max(...gy);
  const F=st.find(s=>s.from===id&&(s.dir==='N'||s.dir==='S'))||st.find(s=>s.to===id&&(s.dir==='N'||s.dir==='S')); if(!F) return null;
  const run=(F.n-1)*F.tread, a=F.dir==='N'?F.origin[1]:F.origin[1]-run, b=a+run;
  return {pos:[y0,a,b,y1], labels:[fmtmm(a-y0), F.tread+'×'+(F.n-1)+'＝'+fmtmm(run), fmtmm(y1-b)]};
}
function westChain(C){
  const gy=arr(C.m.grid.y).map(g=>g.at), f=C.faces, closet=new Set(arr(C.m.openings).filter(o=>o.variant==='closet').map(o=>o.wall));
  const ext=levelWalls(C).filter(w=>w.kind!=='partition'&&wallAxis(w)==='y'&&Math.abs(w.a[0]-w.t/2-f.W)<1);
  const inner=ext.length?f.W+ext[0].t:f.W+150;
  const ys=levelWalls(C).filter(w=>w.kind==='partition'&&wallAxis(w)==='x'&&!closet.has(w.id)&&Math.min(w.a[0],w.b[0])<=inner+1).map(w=>w.a[1]);
  if(!ys.length) return null;
  return [...new Set([Math.min(...gy), ...ys, Math.max(...gy)])].sort((a,b)=>a-b);
}
function innerDims(C){
  const svg=C.svg, w=C.w;
  const hdim=(xa,xb,Y)=>{ const pa=C.P(xa,Y), pb=C.P(xb,Y); svg.line(pa[0],pa[1],pb[0],pb[1],w.thin); [pa,pb].forEach(p=>svg.line(p[0]-0.64,p[1]+0.64,p[0]+0.64,p[1]-0.64,w.vis));
    const s=fmtmm(xb-xa); svg.text((pa[0]+pb[0])/2, pa[1]-DIM_TEXT_GAP-T_NOTE/2, s, T_NOTE, {mask:true, tag:'dim-in'}); C.dims.push({side:'in', pos:[xa,xb], labels:[s]}); };
  const up=arr(C.m.stairs).filter(s=>s.from===C.level.id&&(s.dir==='N'||s.dir==='S'));
  if(up.length){ const U=up[0], G=stairGeom(U), p0=G.W(-480,0), p1=G.W(-480,U.width); hdim(Math.min(p0[0],p1[0]), Math.max(p0[0],p1[0]), p0[1]); return; }
  // 廊下の有効幅：室の中で最も狭い東西の幅（壁芯）から、両側の間仕切りの厚さの半分を引く
  arr(C.m.rooms).filter(r=>r.level===C.level.id&&/廊下/.test(r.name||'')).forEach(r=>{
    const ys=r.polygon.map(p=>p[1]), y0=Math.min(...ys), y1=Math.max(...ys); let best=null;
    for(let y=y0+50;y<=y1-50;y+=10){ const xs=[]; const n=r.polygon.length; for(let i=0;i<n;i++){ const a=r.polygon[i], b=r.polygon[(i+1)%n]; if((a[1]>y)!==(b[1]>y)) xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1])); }
      xs.sort((p,q)=>p-q); for(let k=0;k+1<xs.length;k+=2){ const wd=xs[k+1]-xs[k]; if(!best||wd<best.wd-0.5) best={wd, xa:xs[k], xb:xs[k+1], ya:y, yb:y}; else if(Math.abs(wd-best.wd)<0.5&&Math.abs(xs[k]-best.xa)<0.5) best.yb=y; } }
    if(!best) return;
    const half=(x)=>{ const ww=levelWalls(C).find(q=>wallAxis(q)==='y'&&Math.abs(q.a[0]-x)<1); return ww?ww.t/2:50; };
    hdim(best.xa+half(best.xa), best.xb-half(best.xb), Math.max(best.ya, best.yb-400));
  });
}
function drawSite(C){
  const svg=C.svg, w=C.w, S=C.m.site, f=C.faces; if(!S||arr(S.polygon).length<3) return;
  const ext=C.fine?34:22, pg=S.polygon, n=pg.length, road=arr(S.roads)[0];
  const onWall=(p,q)=>levelWalls(C).some(x=>{ const fr=wallFrame(x); const chk=(z)=>{ const dx=z[0]-x.a[0], dy=z[1]-x.a[1], u=dx*fr.d[0]+dy*fr.d[1], v=dx*fr.n[0]+dy*fr.n[1]; return Math.abs(v)<1&&u>-1&&u<fr.L+1; }; const on=(z)=>{ const dx=z[0]-x.a[0], dy=z[1]-x.a[1]; return Math.abs(dx*fr.n[0]+dy*fr.n[1])<1; };
    // 界壁の芯に重なる境界（同じ直線上で一部でも重なる）は描かない：Python 版は東西の境界を描かない
    return (chk(p)&&chk(q))||(x.kind!=='partition'&&on(p)&&on(q)&&(chk(p)||chk(q)||(()=>{ const u=(z)=>(z[0]-x.a[0])*fr.d[0]+(z[1]-x.a[1])*fr.d[1]; const a=Math.min(u(p),u(q)), b=Math.max(u(p),u(q)); return a<fr.L&&b>0; })())); });
  const dirName=(nx,ny)=>{ const th=Math.atan2(nx,ny)*180/Math.PI-(S.north_deg||0); const a=((th%360)+360)%360; return a<45||a>=315?'北':a<135?'東':a<225?'南':'西'; };
  // 多角形の向き（外向きの法線のため）
  let sA=0; for(let i=0;i<n;i++){ const a=pg[i], b=pg[(i+1)%n]; sA+=a[0]*b[1]-b[0]*a[1]; } const ccw=sA>0;
  svg.open('ad-site');
  for(let i=0;i<n;i++){ const p=pg[i], q=pg[(i+1)%n]; if(onWall(p,q)) continue;
    const horiz=Math.abs(p[1]-q[1])<1e-6, vert=Math.abs(p[0]-q[0])<1e-6;
    let a, b;
    if(horiz){ const y=C.P(0,p[1])[1]; a=[Math.min(C.P(f.W,0)[0],C.P(Math.min(p[0],q[0]),0)[0])-ext,y]; b=[Math.max(C.P(f.E,0)[0],C.P(Math.max(p[0],q[0]),0)[0])+ext,y]; }
    else if(vert){ const x=C.P(p[0],0)[0]; a=[x,Math.min(C.P(0,f.N)[1],C.P(0,Math.max(p[1],q[1]))[1])-ext]; b=[x,Math.max(C.P(0,f.S)[1],C.P(0,Math.min(p[1],q[1]))[1])+ext]; }
    else { a=C.P(p[0],p[1]); b=C.P(q[0],q[1]); }
    svg.line(a[0],a[1],b[0],b[1],w.thin,{dash:'chain2'});
    const ex=q[0]-p[0], ey=q[1]-p[1], L=Math.hypot(ex,ey)||1, nx=ccw?ey/L:-ey/L, ny=ccw?-ex/L:ex/L;
    const isRoad=road&&road.edge===i;
    if(isRoad&&horiz){
      const name=road.name||'道路', gx=Math.min(...arr(C.m.grid.x).map(g=>g.at));
      const setback=Math.abs((ny<0?f.S:f.N)-p[1]);
      if(C.fine){ const pp=C.P(gx+1800,p[1]); svg.text(pp[0],pp[1]-1.0-T_NOTE/2,name+'境界線（外壁の面まで '+fmtmm(setback)+' 後退）',T_NOTE,{mask:true,tag:'site'}); levelMark(C, gx+150, p[1]+(ny<0?1:-1)*setback*0.25, 'GL±0'); }
      else if(road.width){ const yc=C.P(0,p[1]+ny*road.width/2)[1], yf=C.P(0,p[1]+ny*road.width)[1];
        svg.close(); svg.open('ad-grid'); svg.line(a[0],yc,b[0],yc,w.thin,{dash:'chain'}); svg.close(); svg.open('ad-site');
        svg.line(a[0],yf,b[0],yf,w.thin,{dash:'chain2'});
        if(C.lay&&C.lay.coarse){   // 1:200：寸法の数値と重ならないよう、線の東の端にそろえて置く
          const xe=b[0]-0.5;
          svg.text(xe,yc-1.0-T_NOTE/2,name+'の中心線',T_NOTE,{anchor:'end',mask:true,tag:'site'});
          svg.text(xe,a[1]-1.0-T_NOTE/2,name+'境界線',T_NOTE,{anchor:'end',mask:true,tag:'site'});
          svg.text(xe,(yc+yf)/2,name+'（幅 '+fmtmm(road.width)+'）',T_NOTE,{anchor:'end',mask:true,tag:'site'}); }
        else {
        svg.text(C.P(gx+1350,0)[0],yc-1.0-T_NOTE/2,name+'の中心線',T_NOTE,{mask:true,tag:'site'});
        svg.text(C.P(gx+1800,0)[0],a[1]-1.0-T_NOTE/2,name+'境界線',T_NOTE,{mask:true,tag:'site'});
        svg.text(C.P(gx+1350,0)[0],(yc+yf)/2,name+'（幅 '+fmtmm(road.width)+'）',T_NOTE,{mask:true,tag:'site'}); } }
    } else if(C.fine&&horiz){
      svg.text(C.P(f.W,0)[0]-2.0, a[1]-1.0-T_NOTE/2, dirName(nx,ny)+'の敷地境界', T_NOTE, {anchor:'end',mask:true,tag:'site'});
    }
  }
  svg.close();
}
function siteDims(C, lay){
  const S=C.m.site, road=S&&arr(S.roads)[0]; if(!road||!arr(S.polygon).length) return;
  const p=S.polygon[road.edge], q=S.polygon[(road.edge+1)%S.polygon.length]; if(!p||!q||Math.abs(p[1]-q[1])>1e-6||p[1]>=C.faces.S) return;
  const yb=p[1];
  if(C.fine) dimChain(C,'W',[yb,C.faces.S],4.0,null,null,2.0);
  else if(road.width){ const yc=yb-road.width/2, yf=yb-road.width; dimChain(C,'W',[yf,yc,yb,C.faces.S],3.5,null,null,2.0); dimChain(C,'W',[yc,C.faces.S],9.5,null,null,2.0); }
  void lay;
}

function levelOf(m, levelId){ const level=arr(m.levels).find(l=>l.id===levelId)||arr(m.levels)[0]; if(!level) throw new Error('階が無い'); return level; }
function layerTest(opt){ const L=opt.layers; return (k)=>{ if(!L) return true; if(Array.isArray(L)) return L.indexOf(k)>=0; return L[k]!==false; }; }
/* 平面の本体を svg に描く（原点 ox,oy＝通り芯 X1×Y1 の紙の位置）。方位・スケールバー・図題は描かない */
function plot(svg, m, level, opt, ox, oy){
  opt=opt||{};
  const s=+opt.scale||100, fine=s<=50, accent=opt.accent!==false, on=layerTest(opt);
  const C=new Ctx(svg, m, level, s, fine, accent); C.faces=computeFaces(m, level); C.dims=[]; C.ox=ox||0; C.oy=oy||0;
  const lows=arr(m.levels).slice().sort((a,b)=>a.fl-b.fl), ground=lows[0]&&lows[0].id===level.id;
  const coarse=s>100;
  const lay=new Layout(fine, ground&&!!(m.site&&arr(m.site.roads).length), coarse); C.lay=lay;
  const gx=arr(m.grid&&m.grid.x).map(g=>g.at), gy=arr(m.grid&&m.grid.y).map(g=>g.at);
  const area={}; arr(m.rooms).filter(r=>r.level===level.id).forEach(r=>{ area[r.id]=+(polyArea(arr(r.polygon))/1e6).toFixed(2); });
  // 1) 床の仕上げ
  if(on('finish')){
    const keep=arr(m.fixtures).filter(f=>f.level===level.id&&!f.upper&&f.at).map(fixtureBox);
    arr(m.stairs).filter(st=>st.from===level.id||st.to===level.id).forEach(st=>{ const G=stairGeom(st); const p=[G.W(0,-120),G.W(G.run,-120),G.W(G.run,st.width),G.W(0,st.width)];
      const xs=p.map(q=>q[0]), ys=p.map(q=>q[1]); const r=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
      if(st.dir==='N') r[3]=C.faces.N-75; if(st.dir==='S') r[1]=C.faces.S+75; if(st.dir==='E') r[2]=C.faces.E-75; if(st.dir==='W') r[0]=C.faces.W+75; keep.push(r); });
    svg.open('ad-finish'); arr(m.rooms).filter(r=>r.level===level.id&&r.finish==='doma'&&arr(r.polygon).length>=3).forEach(r=>drawDoma(C,r,keep)); svg.close();
  }
  // 2) 通り芯は文字が決まってから、ここ（下の層）に差し込む
  const gridAt=svg.parts.length, text0=svg.texts.length;
  if(ground&&on('site')) drawSite(C);
  if(on('fixtures')) svg.group('ad-visible', ()=>drawFixtures(C));
  const labels=[];
  if(on('roofs')) drawRoofs(C);
  if(on('voids')) drawVoids(C);
  if(on('stairs')) svg.group('ad-stair', ()=>drawStairs(C, labels));
  if(on('ramps')) drawRamps(C, labels);
  if(on('walls')) svg.group('ad-cut', ()=>drawWalls(C));
  if(on('columns')&&arr(m.columns).length) svg.group('ad-cut', ()=>drawColumns(C));
  if(on('screens')) drawScreens(C);
  if(on('openings')) svg.group('ad-opening', ()=>drawOpenings(C));
  if(on('rooms')){
    svg.open('ad-room-name');
    arr(m.rooms).filter(r=>r.level===level.id&&(r.label||(r.label!==null&&arr(r.polygon).length>=3&&r.name))).forEach(r=>{
      const small=!!r.small; roomLabel(C, r, area[r.id]||0, small, !!r.labelText||(small&&!fine)); });
    svg.close();
  }
  if(on('stairs')){ svg.open('ad-stair'); labels.forEach(([t,W])=>{ const p=C.P(W[0],W[1]); svg.text(p[0],p[1],t,T_NOTE,{weight:'bold',mask:true,tag:'stair'}); }); svg.close(); }
  if(on('levels')){ const mk=level.mark||[(gx.length?Math.min(...gx):0)+600,(gy.length?Math.min(...gy):0)+600]; svg.open('ad-level'); levelMark(C, mk[0], mk[1], levelText(m, level)); svg.close(); }
  // 寸法
  if(on('dims')&&gx.length&&gy.length){
    svg.open('ad-dim');
    const t=lay.t, gxs=gx.slice().sort((a,b)=>a-b), gys=gy.slice().sort((a,b)=>a-b);
    const X0=gxs[0], X1=gxs[gxs.length-1], Y0=gys[0], Y1=gys[gys.length-1];
    const tier=(sd)=>coarse?{op:null, grid:t[sd][0], all:t[sd][1]}:{op:t[sd][0], grid:t[sd][1], all:t[sd].length>2?t[sd][2]:null};
    const TN=tier('N'), TS=tier('S'), TE=tier('E'), TW=tier('W');
    const nOp=openingChain(C,'N'); if(TN.op!=null&&nOp.length>2) dimChain(C,'N',nOp,TN.op,null,2.0);
    dimChain(C,'N',gxs,TN.grid); dimChain(C,'N',[X0,X1],TN.all);
    const sOp=openingChain(C,'S'); if(TS.op!=null&&sOp.length>2) dimChain(C,'S',sOp,TS.op,null,2.0);
    dimChain(C,'S',gxs,TS.grid); if(TS.all!=null) dimChain(C,'S',[X0,X1],TS.all);
    const sc=stairChain(C); if(sc&&TE.op!=null) dimChain(C,'E',sc.pos,TE.op,sc.labels,2.0);
    dimChain(C,'E',gys,TE.grid); dimChain(C,'E',[Y0,Y1],TE.all);
    const wc=westChain(C); if(wc&&TW.op!=null) dimChain(C,'W',wc,TW.op,null,2.0);
    if(ground&&on('site')) siteDims(C, lay);
    dimChain(C,'W',gys,TW.grid); dimChain(C,'W',[Y0,Y1],TW.all);
    if(fine) innerDims(C);
    svg.close();
  }
  if(on('sections')) svg.group('ad-section-mark', ()=>sectionMarks(C, lay.sec));
  if(on('grid')&&(gx.length||gy.length)){
    const gaps=svg.texts.slice(text0).map(q=>q.slice(0,4)), n0=svg.parts.length;
    drawGrid(C, lay, gaps);
    const nw=svg.parts.splice(n0); svg.parts.splice(gridAt,0,...nw);
  }
  return {C, lay, ground, s, fine, area};
}
function layout(m, levelId, opt){
  opt=opt||{};
  const level=levelOf(m, levelId), on=layerTest(opt);
  const svg=new Svg(opt.idPrefix||('ap'+(++UID)));
  const {C, s, fine}=plot(svg, m, level, opt, 0, 0);
  // 方位・スケールバー・縮尺・図題（図の下の帯）
  const b=svg.bbox.slice(); const bx=b[0]>b[2]?0:b[0], by=b[0]>b[2]?0:b[3];
  if(on('north')) northArrow(svg, bx+7, by+15, 6.0, C.w, (m.site&&m.site.north_deg)||0);
  if(on('scale')){ svg.open('ad-scale-text'); svg.text(bx+22, by+6, '縮尺 1:'+s, T_NOTE, {anchor:'start', tag:'scale'}); svg.close(); scaleBar(svg, bx+22, by+10, s, fine?5:10, C.w); }
  if(opt.caption!==false&&on('caption')){
    const idx=arr(m.levels).findIndex(l=>l.id===level.id)+1;
    const head=typeof opt.caption==='string'?opt.caption:'図 '+idx+'　'+levelJa(level.id)+'平面図（1:'+s+'）';
    svg.open('ad-title'); const y=by+(on('north')||on('scale')?30:8);
    captionBlock(svg, bx, y, head, opt.captionBody===true?captionBody(m, level, s):opt.captionBody, Math.max(80, svg.bbox[2]-bx));
    svg.close();
  }
  const mg=4, B=svg.bbox, vb=[B[0]-mg, B[1]-mg, (B[2]-B[0])+2*mg, (B[3]-B[1])+2*mg];
  const title=(opt.caption&&typeof opt.caption==='string')?opt.caption:levelJa(level.id)+'平面図（1:'+s+'）';
  return finish(svg, vb, title, s, C);
}
function finish(svg, vb, title, s, C){
  const out=['<svg xmlns="http://www.w3.org/2000/svg" width="'+fmt(vb[2])+'mm" height="'+fmt(vb[3])+'mm" viewBox="'+vb.map(fmt).join(' ')+'" font-family="'+FONT.replace(/"/g,'&quot;')+'" data-ad-kind="plan" data-ad-scale="1:'+s+'">',
    '<title>'+esc(title)+'</title>', '<rect x="'+fmt(vb[0])+'" y="'+fmt(vb[1])+'" width="'+fmt(vb[2])+'" height="'+fmt(vb[3])+'" fill="'+PAPER+'"/>'];
  if(svg.defs.length) out.push('<defs>'+svg.defs.join('')+'</defs>');
  const txt=out.concat(svg.parts, ['</svg>']).join('\n');
  return { svg:txt, width:vb[2], height:vb[3], scale:s, viewBox:vb, toPaper:(X,Y)=>[C.ox+X/s-vb[0], C.oy-Y/s-vb[1]], texts:svg.texts.map(t=>[t[0]-vb[0],t[1]-vb[1],t[2]-vb[0],t[3]-vb[1],t[4],t[5]]), dims:C.dims, bbox:svg.bbox.slice() };
}

/* ======================================================================== 図の外の欄と 1 枚の紙（plan.py の sheet_150・sheet_1100） */
function legendRows(m, accent){
  const W=wordsOf(m), rows=[], ws=arr(m.walls);
  if(ws.some(w=>w.kind!=='partition')) rows.push(['fill',INK,W.ext+'（構造・厚 '+fmtmm(wallT(m,'exterior'))+'）']);
  else if(arr(m.columns).length) rows.push(['fill',INK,'柱（構造）']);
  if(accent&&W.accentLabel) rows.push(['fill',ACCENT,W.accentLabel]);
  if(ws.some(w=>w.kind==='partition')) rows.push(['hatch',null,'間仕切り（厚 '+fmtmm(wallT(m,'partition'))+'）']);
  rows.push(['dash','hidden','上部の輪郭（破線）']);
  if(arr(m.grid&&m.grid.x).length||arr(m.grid&&m.grid.y).length) rows.push(['dash','chain','通り芯（一点鎖線）']);
  if(m.site&&arr(m.site.polygon).length>=3) rows.push(['dash','chain2','敷地境界（二点鎖線）']);
  return rows;
}
function wallT(m, kind){ const ws=arr(m.walls).filter(w=>kind==='partition'?w.kind==='partition':w.kind!=='partition'); const c={}; ws.forEach(w=>{ c[w.t]=(c[w.t]||0)+1; }); let best=kind==='partition'?100:150, n=-1; Object.keys(c).forEach(k=>{ if(c[k]>n){ n=c[k]; best=+k; } }); return best; }
function roadName(m){ const r=m.site&&arr(m.site.roads)[0]; return r?(r.name||'道路'):null; }
function legend(svg, x, y, w, rows, fine){
  const hp=svg.hatch(fine?0.8:0.7, w.thin); let yy=y;
  rows.forEach(([kind,val,label])=>{
    if(kind==='fill') svg.rect(x,yy-1.0,x+12,yy+1.0,val===INK?w.cut:null,{stroke:val, fill:val});
    else if(kind==='hatch') svg.rect(x,yy-1.0,x+12,yy+1.0,w.cut,{fill:'url(#'+hp+')'});
    else svg.line(x,yy,x+12,yy,val==='hidden'?w.hid:w.thin,{dash:val});
    svg.text(x+15,yy,label,T_NOTE,{anchor:'start',tag:'legend'}); yy+=4.6; });
  return yy;
}
function sectionLegend(svg, x, y, w, m){
  svg.line(x,y,x+5,y,w.cut); svg.line(x+5,y,x+5,y-3.0,w.vis);
  svg.polyline([[x+5,y-4.2],[x+4.25,y-2.4],[x+5.75,y-2.4]],w.thin,{closed:true,fill:INK});
  const ids=arr(m.sections).map(sc=>sc.id+'-'+sc.id+"'").join('・');
  svg.text(x+15,y-1.0,'断面の位置と見る向き'+(ids?'（'+ids+'）':''),T_NOTE,{anchor:'start',tag:'legend'});
}
function tableHead(svg, x, y, w, width, title){ svg.text(x,y,title,T_NOTE,{anchor:'start',weight:'bold',tag:'table'}); y+=3.2; svg.line(x,y,x+width,y,w.vis); return y+3.0; }
function areaTable(svg, x, y, w, m, level, width){
  width=width||112; const rooms=arr(m.rooms).filter(r=>r.level===level.id&&arr(r.polygon).length>=3);
  y=tableHead(svg,x,y,w,width,'室面積（壁芯）'); let tot=0;
  rooms.forEach(r=>{ const a=polyArea(r.polygon)/1e6; tot+=a; svg.text(x+1,y,r.name,T_NOTE,{anchor:'start',tag:'table'}); svg.text(x+width-1,y,a.toFixed(2)+' m²',T_NOTE,{anchor:'end',tag:'table'}); y+=4.2; });
  y-=1.2; svg.line(x,y,x+width,y,w.thin); y+=3.0;
  svg.text(x+1,y,levelJa(level.id)+'の床面積',T_NOTE,{anchor:'start',weight:'bold',tag:'table'}); svg.text(x+width-1,y,tot.toFixed(2)+' m²',T_NOTE,{anchor:'end',weight:'bold',tag:'table'});
  y+=2.8; svg.line(x,y,x+width,y,w.vis); return y;
}
function openingTypeJa(o){
  let t; if(o.type==='door') t='片開き戸'; else if(o.type==='slide') t=o.variant==='closet'?'引違い戸':'片引き戸（アウトセット）';
  else if(o.shutter) t='引違い戸・防火シャッター'; else { t='引違い窓'; if(o.type==='sweep'||!(o.sill>0)) t+='（掃き出し）'; }
  if(o.fire&&!o.shutter) t+='・防火設備'; return t;
}
function openingLoc(m, o, w, level){
  if(o.loc) return o.loc;
  const f=wallFrame(w), p=f.W(o.at+o.width/2, 0), rooms=arr(m.rooms).filter(r=>r.level===level.id&&arr(r.polygon).length>=3);
  const near=rooms.find(r=>inside(r.polygon,p[0]+f.n[0]*(w.t/2+100),p[1]+f.n[1]*(w.t/2+100)))||rooms.find(r=>inside(r.polygon,p[0]-f.n[0]*(w.t/2+100),p[1]-f.n[1]*(w.t/2+100)));
  if(w.kind!=='partition'){ const ax=wallAxis(w), fc=computeFaces(m, level); const side=ax==='x'?(Math.abs(w.a[1]-fc.N)<w.t?'北':'南'):(Math.abs(w.a[0]-fc.W)<w.t?'西':'東'); return side+(near?'・'+near.name:''); }
  return near?near.name:'';
}
function openingTable(svg, x, y, w, m, level, width){
  width=width||112; const ws=new Map(arr(m.walls).filter(wl=>wl.level===level.id).map(wl=>[wl.id,wl]));
  const ops=arr(m.openings).filter(o=>ws.has(o.wall));
  y=tableHead(svg,x,y,w,width,'開口（幅×高さ・床から下端まで）');
  ops.forEach(o=>{ const wl=ws.get(o.wall);
    svg.text(x+1,y,openingLoc(m,o,wl,level),T_NOTE,{anchor:'start',tag:'table'}); svg.text(x+21,y,openingTypeJa(o),T_NOTE,{anchor:'start',tag:'table'});
    svg.text(x+width-17,y,fmtmm(o.width)+'×'+fmtmm((o.head||0)-(o.sill||0)),T_NOTE,{anchor:'end',tag:'table'});
    svg.text(x+width-1,y,o.sill>0?fmtmm(o.sill):'0',T_NOTE,{anchor:'end',tag:'table'}); y+=4.2; });
  y-=1.2; svg.line(x,y,x+width,y,w.vis); return y;
}
function stairNote(m){
  const st=arr(m.stairs)[0]; if(!st) return [];
  const out=['階段：直階段・有効幅 '+fmtmm(st.width)+'・蹴上 '+fmtmm(st.rise)+'・踏面 '+fmtmm(st.tread), '　（2 × 蹴上＋踏面＝'+fmtmm(2*st.rise+st.tread)+'）',
    '段の番号は最下段を 1 とする（JIS A 0150 13.2.9）', '矢印は上りの向き（白丸＝最下段の段鼻）'];
  return out;
}
function notesFor(m, level){
  const cut=(m.plan&&m.plan.cut)||1200, lines=['切断の高さ：各階 FL＋'+fmtmm(cut), '寸法の単位：mm。面積は壁芯'];
  if(m.structure) lines.push('構造：'+m.structure);   // 無ければ書かない（木造・陸屋根と決め打ちしない）
  lines.push(...stairNote(m));
  const extra=arr(level.notes); if(!extra.some(n=>/FL/.test(n))) lines.push(levelText(m, level));
  extra.forEach(n=>lines.push(n));
  return lines;
}
function notes(svg, x, y, lines){ lines.forEach(sx=>{ svg.text(x,y,sx,T_NOTE,{anchor:'start',tag:'note'}); y+=3.6; }); return y; }
function captionBlock(svg, x, y, head, body, width){
  svg.text(x,y,head,T_TITLE,{anchor:'start',weight:'bold',tag:'caption'});
  if(!body) return y;
  y+=T_TITLE/2+1.6+T_NOTE/2; wrap(body, width, T_NOTE).forEach(line=>{ svg.text(x,y,line,T_NOTE,{anchor:'start',tag:'caption'}); y+=T_NOTE+1.2; }); return y;
}
/* 図題の本文を模型から組み立てる（SPEC §7-3：何を示すか＋読み方＋縮尺・出典の完全な文）。level.caption があればそれを使う */
function captionBody(m, level, s){
  if(level.caption) return level.caption;
  const rooms=arr(m.rooms).filter(r=>r.level===level.id&&r.label!==null&&arr(r.polygon).length>=3&&!/階段/.test(r.name||'')).map(r=>r.name);
  const road=roadName(m), ws=new Map(arr(m.walls).filter(w=>w.level===level.id).map(w=>[w.id,w]));
  const front=arr(m.openings).filter(o=>ws.has(o.wall)&&o.fire);
  const up=arr(m.stairs).find(st=>st.from===level.id), dn=arr(m.stairs).find(st=>st.to===level.id);
  const W=wordsOf(m);
  let t=levelName(level)+(rooms.length?'は'+rooms.join('・')+'。':'。');
  if(front.length&&road) t+=road+'側に幅 '+fmtmm(front[0].width)+' の'+openingTypeJa(front[0]).replace('・防火設備','（防火設備）')+'を置いた。';
  if(up&&dn) t+='階段は下の階からの '+dn.n+' 段と上の階への '+up.n+' 段が同じ位置に重なり、切断線の手前が上り、奥が下り。';
  else if(up) t+='階段（'+up.n+' 段で上の階へ）は'+(fmtmm(up.width))+' の有効幅。'; else if(dn) t+='階段は下の階からの '+dn.n+' 段。';
  const ramps=arr(m.ramps).filter(r=>r.level===level.id||r.to===level.id); if(ramps.length&&A.model){ const g=A.model.rampGeom(m, ramps[0]); t+='斜路（幅 '+fmtmm(ramps[0].width)+(g.label?'・勾配 '+g.label:'')+'）は矢印の向きに上る。'; }
  const vs=arr(m.voids).filter(v=>A.model&&A.model.coversLevel(m, v, level.id)); if(vs.length) t+='破線の「吹抜」は床の無い範囲。';
  if(arr(m.screens).some(s=>s.level===level.id)) t+='外壁の外の櫛の歯はブリーズ・ソレイユ。';
  if(arr(m.walls).some(w=>w.level===level.id&&w.accent)&&W.accentCaption) t+='赤は'+W.accentCaption+'、';
  t+='破線は上部の輪郭。';
  const secs=arr(m.sections).map(sc=>sc.id+'-'+sc.id+"'"); if(secs.length) t+=secs.join('・')+' は断面の位置。';
  t+='筆者作成'; void s; return t;
}
function sizeOf(opt){ const SZ={A3:[420,297], A4:[297,210], A2:[594,420]}; let [W,H]=SZ[(opt.size||'A3').toUpperCase()]||SZ.A3; if(opt.orient==='P') [W,H]=[H,W]; return [W,H]; }
/* 1 枚の紙（既定 A3 横・1:50）：左に平面、右に凡例・室面積・開口の表・注記、下に図題 */
function sheet(m, levelId, opt){
  opt=opt||{}; const level=levelOf(m, levelId), s=+opt.scale||50, fine=s<=50, MG=opt.margin!=null?+opt.margin:15;
  const [W,H]=sizeOf(opt), svg=new Svg(opt.idPrefix||('ap'+(++UID))), w=new Weights();
  const lows=arr(m.levels).slice().sort((a,b)=>a.fl-b.fl), ground=lows[0]&&lows[0].id===level.id;
  const lay=new Layout(fine, ground&&!!(m.site&&arr(m.site.roads).length), s>100), f=computeFaces(m, level);
  const westExt=lay.bubble.W+lay.r, northExt=Math.max(lay.bubble.N+lay.r, lay.sec.N+5.5+3);
  const blockW=westExt+(f.E-f.W)/s+lay.bubble.E+lay.r, colW=112.0, group=blockW+26.0+colW;
  const xBlock=MG+Math.max(1.0,(W-2*MG-group)/2);
  const ox=xBlock+westExt-f.W/s, oy=MG+2+northExt+f.N/s;
  const {C}=plot(svg, m, level, Object.assign({}, opt, {scale:s}), ox, oy);
  const xr=xBlock+blockW+26.0;
  northArrow(svg, xr+7, MG+13, 6.0, w, (m.site&&m.site.north_deg)||0);
  svg.open('ad-scale-text'); svg.text(xr+22, MG+6, '縮尺 1:'+s, T_NOTE, {anchor:'start', tag:'scale'}); svg.close(); scaleBar(svg, xr+22, MG+10, s, fine?5:10, w);
  let y=MG+34; svg.text(xr,y,'凡例',T_NOTE,{anchor:'start',weight:'bold',tag:'legend'});
  y=legend(svg, xr, y+5.0, w, legendRows(m, opt.accent!==false), fine);
  if(arr(m.sections).length){ y+=1.0; sectionLegend(svg, xr, y, w, m); y+=9; } else y+=4;
  y=areaTable(svg, xr, y, w, m, level, colW)+8;
  y=openingTable(svg, xr, y, w, m, level, colW)+8;
  svg.text(xr,y,'注記',T_NOTE,{anchor:'start',weight:'bold',tag:'note'}); notes(svg, xr, y+5.0, notesFor(m, level));
  const idx=arr(m.levels).findIndex(l=>l.id===level.id)+1;
  const head=typeof opt.caption==='string'?opt.caption:'図 '+idx+'　'+levelJa(level.id)+'平面図（1:'+s+'）';
  if(opt.caption!==false){ svg.open('ad-title'); captionBlock(svg, xBlock, H-MG-15.5, head, opt.captionBody===false?null:(opt.captionBody||captionBody(m, level, s)), 236.0); svg.close(); }
  return finish(svg, [0,0,W,H], head, s, C);
}
/* 1 枚に全階（既定 A3 横・1:100）：左から下の階→上の階、同じ通り芯の高さにそろえ、下に方位・スケールバー・凡例・床面積の表・図題 */
function sheetAll(m, opt){
  opt=opt||{}; const s=+opt.scale||100, fine=s<=50, MG=opt.margin!=null?+opt.margin:15, [W,H]=sizeOf(opt);
  const svg=new Svg(opt.idPrefix||('ap'+(++UID))), w=new Weights();
  const levels=arr(m.levels).slice().sort((a,b)=>a.fl-b.fl).filter(l=>!opt.levels||opt.levels.indexOf(l.id)>=0); if(!levels.length) throw new Error('階が無い');
  const lay=new Layout(fine, false, s>100), f=computeFaces(m, levels[0]);
  const westExt=Math.max(lay.bubble.W+lay.r, lay.sec.W+5.5+3.5), eastExt=lay.sec.E+5.5+3.5;
  const planW=(f.E-f.W)/s, block=westExt+planW+eastExt, gap=10.0, n=levels.length;
  const x0g=MG+(W-2*MG-(n*block+(n-1)*gap))/2;
  const northExt=Math.max(lay.bubble.N+lay.r, lay.sec.N+5.5+3);
  const site=m.site, road=site&&arr(site.roads)[0], farY=(road&&road.width&&arr(site.polygon)[road.edge])?site.polygon[road.edge][1]-road.width:f.S-1000;
  const southExt=Math.max(0,(f.S-farY)/s);
  const contentH=8+northExt+(f.N-f.S)/s+southExt+12+24+8+14;
  const top=MG+8+Math.max(0,(H-2*MG-contentH)/2), oy=top+northExt+f.N/s;
  let C=null;
  levels.forEach((lv,k)=>{ const xLeft=x0g+k*(block+gap), ox=xLeft+westExt-f.W/s;
    const r=plot(svg, m, lv, Object.assign({}, opt, {scale:s, idPrefix:undefined}), ox, oy); C=C||r.C;
    svg.text(xLeft+westExt-((f.W-(computeFaces(m,lv).W))/s), top-6, levelJa(lv.id), T_ROOM, {anchor:'start',weight:'bold',tag:'floor'});
    svg.text(xLeft+westExt+10, top-6, levelText(m, lv), T_NOTE, {anchor:'start',tag:'floor'}); });
  const yb=oy-f.S/s+southExt+12, bx=x0g;
  northArrow(svg, bx+7, yb+9, 6.0, w, (site&&site.north_deg)||0);
  svg.open('ad-scale-text'); svg.text(bx+22, yb+2, '縮尺 1:'+s, T_NOTE, {anchor:'start', tag:'scale'}); svg.close(); scaleBar(svg, bx+22, yb+6, s, fine?5:10, w);
  const lx=bx+140; svg.text(lx,yb+2,'凡例',T_NOTE,{anchor:'start',weight:'bold',tag:'legend'});
  const rows=legendRows(m, opt.accent!==false), fills=rows.filter(r=>r[0]!=='dash'), dashes=rows.filter(r=>r[0]==='dash').map(r=>r[1]==='chain'&&road?['dash','chain','通り芯・'+(road.name||'道路')+'の中心線（一点鎖線）']:r);
  legend(svg, lx, yb+7.5, w, fills, fine); legend(svg, lx+82, yb+7.5, w, dashes, fine);
  const tx=x0g+n*block+(n-1)*gap-40; svg.text(tx,yb+2,'床面積（壁芯）',T_NOTE,{anchor:'start',weight:'bold',tag:'table'});
  let yy=yb+7.5, tot=0;
  levels.forEach(lv=>{ const a=arr(m.rooms).filter(r=>r.level===lv.id&&arr(r.polygon).length>=3).reduce((q,r)=>q+polyArea(r.polygon)/1e6,0); tot+=a;
    svg.text(tx,yy,levelJa(lv.id),T_NOTE,{anchor:'start',tag:'table'}); svg.text(tx+38,yy,a.toFixed(2)+' m²',T_NOTE,{anchor:'end',tag:'table'}); yy+=4.6; });
  svg.line(tx,yy-2.4,tx+38,yy-2.4,w.thin); svg.text(tx,yy,'延床',T_NOTE,{anchor:'start',weight:'bold',tag:'table'}); svg.text(tx+38,yy,tot.toFixed(2)+' m²',T_NOTE,{anchor:'end',weight:'bold',tag:'table'});
  const head=typeof opt.caption==='string'?opt.caption:'図 '+(arr(m.levels).length+1)+'　各階平面図（1:'+s+'）';
  if(opt.caption!==false){ svg.open('ad-title'); captionBlock(svg, x0g, yb+30, head, opt.captionBody===false?null:(opt.captionBody||captionBodyAll(m, levels)), 250.0); svg.close(); }
  return finish(svg, [0,0,W,H], head, s, C);
}
function captionBodyAll(m, levels){
  if(m.captionAll) return m.captionAll;
  const st=arr(m.stairs)[0], W=wordsOf(m);
  let t='左から'+levels.map(l=>levelName(l)).join('・')+'。同じ縮尺と向きで並べ'+(arr(m.grid&&m.grid.x).length?'、通り芯・寸法の段をそろえた。':'た。');
  const named=levels.map(l=>[l, arr(m.rooms).filter(r=>r.level===l.id&&r.label!==null&&arr(r.polygon).length>=3&&!/階段/.test(r.name||'')).map(r=>r.name)]).filter(([,n])=>n.length);
  if(named.length) t+=named.map(([l,n])=>levelName(l)+'は'+n.join('・')).join('、')+'。';
  if(st) t+='階段は直階段（有効幅 '+fmtmm(st.width)+'、蹴上 '+fmtmm(st.rise)+'・踏面 '+fmtmm(st.tread)+'）'+(arr(m.stairs).length>1?'を各階同じ位置に重ねる。':'。');
  if(W.accentCaption) t+='赤は'+W.accentCaption+'、';
  if(m.site&&arr(m.site.polygon).length>=3) t+='二点鎖線は敷地境界。';
  const secs=arr(m.sections).map(sc=>sc.id+'-'+sc.id+"'"); if(secs.length) t+=secs.join('・')+' は断面の位置。';
  return t+'筆者作成';
}
function wrap(s, width, size){
  const out=[]; let rest=String(s);
  while(rest){ if(textWidth(rest,size)<=width){ out.push(rest); break; }
    let n=0; while(n<rest.length&&textWidth(rest.slice(0,n+1),size)<=width) n++;
    let cut=null; for(let k=n;k>0;k--){ if(textWidth(rest.slice(0,k),size)<width*0.55) break; if('、。）」'.indexOf(rest[k-1])>=0){ cut=k; break; } }
    if(cut==null) cut=Math.max(1,n); out.push(rest.slice(0,cut).trimEnd()); rest=rest.slice(cut).trimStart(); }
  return out;
}

const API={ render:(m, level, opt)=>layout(m, level, opt).svg, layout, sheet, sheetAll, textWidth, wrap, captionBody, parts:{legend, legendRows, areaTable, openingTable, notes, notesFor, captionBlock, northArrow, scaleBar},
  STYLE:{ INK, GREY, ACCENT, PAPER, FONT, T_NOTE, T_ROOM, T_TITLE, DASH, weights:new Weights() } };
if(typeof A.plan==='function') Object.assign(A.plan, API); else A.plan=API;
})();
