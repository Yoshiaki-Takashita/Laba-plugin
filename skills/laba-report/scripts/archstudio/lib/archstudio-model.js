/* 建築スタジオ：建物モデル（GnotoArch.model）  担当 S1
   ───────────────────────────────────────────────────────────────────────────────
   データの形は docs/archstudio/DESIGN.md §2。単位は実寸の mm、原点は通り芯 X1×Y1、X 東・Y 北。
   model.create(opt)        → 空のモデル（1 階・通り芯 2×2）
   model.sample()           → SPEC §4 の住戸（tools/archdraw/plan/model.json をそのまま起こしたもの）
   model.fromArchdraw(json) → model.json の形（壁＝長方形）から DESIGN §2 の形（壁＝芯の線分）へ
   model.apply(m, op)       → 新しいモデル（元は変えない）。op の履歴は戻り値に隠しで持つ
   model.undo(m) / redo(m)  → 1 手戻した／やり直したモデル（履歴が無ければ同じものを返す）
   model.canUndo(m) / canRedo(m)
   model.validate(m)        → [{level:'error'|'warn', msg, ref}]
   model.area(m, level?)    → {total, rooms:{id:m²}}（level 省略で {total, levels:{id:{total,rooms}}}）。壁芯
   model.wallRect(w) / wallFrame(w) / openingSpan(m, o) / stairGeom(s) は図の部品（plan・views・editor）用の道具。

   2026-10-24 追加（docs/archstudio/ELEMENTS.md。担当 S-A）
   model.wallJoin(m, level, opt) → [{ id, wall, polygon:[[x,y]…], curve, a:{node, joined:[壁id]}, b:{…} }]
     端点を共有する壁（L・T・十字・厚さ違い・斜め）を接合点ごとに合成した、壁ごとの多角形（世界座標 mm）。
     level は id か levels[] の要素（省略で全階）。接合点＝端点が opt.tol（既定 1 mm）以内で重なる所。
     接合点では、角度順に隣り合う壁どうしの面（左面と右面）の交点を角にする。まっすぐ続く同じ厚さの対（通し壁。T・十字の
     横棒）は自分の面のまま続き、他の壁はその面に突き当たる。通し壁が無い接合（L・Y）は接合点を頂点に含む扇形で分け合う
     （重ならず・隙間が無い）。平行で厚さが違う・交点が opt.maxExt（既定 6）×厚さより遠い鋭角は、自分の面の点で
     止める（厚さの違いは段として出る）。曲面壁（curve）は接合しない（弧の帯の多角形）。
     polygon は a 側の右面→（接合点）→a 側の左面→b 側の左面→（接合点）→b 側の右面の順。
   model.joinEdges(polys) → [[p,q]…]  多角形の集まりの輪郭だけ（2 つの多角形が共有する辺を落とす。継ぎ目の線を出さない塗り用）。
   model.wallPolygon(w) → 1 本の壁の四角形（曲面壁は弧の帯）。model.arcPoints(w, u0, u1) は弧の帯（部分）。
   model.wallFrame は curve を持つ壁では弧に沿う（u＝a からの弧長、v＝左へ。L＝弧長）。wallRect は null。
   model.clipBand(poly, frame, u0, u1) → 多角形を u0≤u≤u1 の帯で切る（開口の穴あけ）。
   model.coversLevel(m, el, levelId) → 要素（level・from・to を持つ）がその階にかかるか。levelFl(m, id)。
   model.columnPolygon(c) / rampGeom(m, r) → {run, rise, slope, label, segs, left, right} / screenGeom(m, s) → {f, side, fins:[…], plate}
   model.roofHoles(roof) → 孔ごとの多角形（楕円は 48 点）。roofFor(m, levelId) → その階の上に載る屋根。
   area(m, level) は {total, rooms, voids, net}（voids＝吹抜で抜ける床 m²、net＝total−voids）。全階は roofs:{id:m²（孔を除く）} も。

   約束（判断。DESIGN §2 に書かれていない所）
   ・壁：a→b の芯の線分。厚さ t は芯から両側へ t/2。端は延ばさない（外壁の角は外面まで a・b を取る）。
     kind：exterior（構造の外壁）・partition（間仕切り）・fire（耐火の界壁）。accent:true は強調色（路地に面する壁）。
   ・開口：at＝壁の a から開口の始まりまでの距離（mm）。幅 width。sill/head は FL から。
     type：window（窓）・sweep（床までの窓・戸。shutter:true で防火シャッター、rail:true で外の手摺）・
           door（片開き）・slide（引戸。variant:'outset' は片引きのアウトセット、'closet' は物入の引違い）。
     swing：'L'＝吊元が壁の a の側、'R'＝b の側。flip:false＝a→b の右側へ開く、true＝左側へ開く。
     panels（障子の数）・fire（防火設備＝強調色）・side（引戸の面：+1＝左側）・park（引き込む向き 'a'|'b'）。
   ・階段：origin＝1 段目の蹴込みの線の、上る向きに見て左の端。dir＝上る向き（N|E|S|W）。
     width＝有効幅（右へ）、rise＝蹴上、tread＝踏面、n＝蹴上の数（踏面は n−1）。
   ・家具：at＝外接矩形の中心、w×d＝回転前の幅×奥行、rot＝反時計回りの度。upper:true は上部の輪郭（破線）。
   ・op：{type:'add', kind, item} / {type:'remove', kind, id} / {type:'update', kind, id, set:{…}} /
         {type:'move', kind, id, dx, dy} / {type:'set', key, value}（name・grid・site・levels など上の階層）/
         {type:'batch', ops:[…]} / {type:'sheets', sheets:[…]}（シートの丸ごと差し替え）。kind は walls・openings・stairs・rooms・fixtures・sections・sheets。
         壁を消すと載っている開口も消える（戻すと戻る）。
         2026-10-24：kind に columns・voids・ramps・screens・roofs を足した（ELEMENTS.md の形。move は at・polygon・path・a/b・holes を動かす）。 */
(function(){
'use strict';
const A=window.GnotoArch=window.GnotoArch||{};
if(A.model) return;

const KINDS=['walls','openings','stairs','rooms','fixtures','sections','sheets','columns','voids','ramps','screens','roofs'];
const PREFIX={walls:'W', openings:'O', stairs:'ST', rooms:'R', fixtures:'F', sections:'S', sheets:'SH', columns:'C', voids:'V', ramps:'RP', screens:'BS', roofs:'RF'};
const clone=(o)=>o===undefined?undefined:JSON.parse(JSON.stringify(o));
const arr=(x)=>Array.isArray(x)?x:[];
const num=(v)=>{ const n=+v; return isFinite(n)?n:null; };

/* ── 幾何の道具 ─────────────────────────────────────────────────────────── */
function polyArea(pts){ let s=0; const n=pts.length; for(let i=0;i<n;i++){ const a=pts[i], b=pts[(i+1)%n]; s+=a[0]*b[1]-b[0]*a[1]; } return Math.abs(s)/2; }
const DEG=Math.PI/180;
/* 曲面壁の弧：c を中心に r、a0→a1（度。a1<a0 なら時計回り）。sgn＝回る向き、L＝弧長 */
function arcOf(w){ const c=w.curve; const d=(c.a1-c.a0)*DEG, sgn=d>=0?1:-1; return { c:c.c, r:c.r, a0:c.a0*DEG, da:d, sgn, L:Math.abs(d)*c.r }; }
function wallFrame(w){
  if(w.curve&&w.curve.c&&w.curve.r>0){
    const A=arcOf(w), th=(u)=>A.a0+A.sgn*u/A.r;
    // 進む向きの左は、反時計回りなら中心の側（v>0 で半径が減る）
    const W=(u,v)=>{ const t=th(u), rr=A.r-A.sgn*v; return [A.c[0]+rr*Math.cos(t), A.c[1]+rr*Math.sin(t)]; };
    const tm=th(A.L/2), d=[-Math.sin(tm)*A.sgn, Math.cos(tm)*A.sgn], n=[-d[1], d[0]];
    return { L:A.L, d, n, t:w.t, W, curve:true, arc:A, dirAt:(u)=>{ const t=th(u); return [-Math.sin(t)*A.sgn, Math.cos(t)*A.sgn]; } };
  }
  const dx=w.b[0]-w.a[0], dy=w.b[1]-w.a[1], L=Math.hypot(dx,dy)||1;
  const d=[dx/L, dy/L], n=[-d[1], d[0]];        // n＝a→b の左側
  return { L, d, n, t:w.t, W:(u,v)=>[w.a[0]+d[0]*u+n[0]*v, w.a[1]+d[1]*u+n[1]*v] };
}
/* 弧の帯（u0〜u1 の部分）。外側の弧→内側の弧（逆順）の多角形。1 点が 5°以下になるよう分ける */
function arcPoints(w, u0, u1){
  const f=wallFrame(w), h=w.t/2; if(u0==null) u0=0; if(u1==null) u1=f.L;
  if(!f.curve){ return [f.W(u0,-h), f.W(u1,-h), f.W(u1,h), f.W(u0,h)]; }
  const n=Math.max(2, Math.ceil(Math.abs(u1-u0)/f.arc.r/(5*DEG))), out=[];
  for(let k=0;k<=n;k++) out.push(f.W(u0+(u1-u0)*k/n, -h));
  for(let k=n;k>=0;k--) out.push(f.W(u0+(u1-u0)*k/n, h));
  return out;
}
/* 軸にそった壁の長方形 [x0,y0,x1,y1]。斜め・曲面の壁は null（四角形は wallQuad／wallPolygon） */
function wallRect(w){
  if(w.curve) return null;
  const h=w.t/2;
  if(Math.abs(w.a[1]-w.b[1])<1e-6) return [Math.min(w.a[0],w.b[0]), w.a[1]-h, Math.max(w.a[0],w.b[0]), w.a[1]+h];
  if(Math.abs(w.a[0]-w.b[0])<1e-6) return [w.a[0]-h, Math.min(w.a[1],w.b[1]), w.a[0]+h, Math.max(w.a[1],w.b[1])];
  return null;
}
function wallQuad(w){ const f=wallFrame(w), h=w.t/2; return [f.W(0,-h), f.W(f.L,-h), f.W(f.L,h), f.W(0,h)]; }
function wallPolygon(w){ return w.curve?arcPoints(w):wallQuad(w); }
function openingSpan(m, o){ const w=arr(m.walls).find(x=>x.id===o.wall); if(!w) return null; const f=wallFrame(w); return { wall:w, f, u0:o.at, u1:o.at+o.width }; }
function polyBox(pts){ const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
function polyCentroid(pts){ let a=0, cx=0, cy=0; const n=pts.length; for(let i=0;i<n;i++){ const p=pts[i], q=pts[(i+1)%n], c=p[0]*q[1]-q[0]*p[1]; a+=c; cx+=(p[0]+q[0])*c; cy+=(p[1]+q[1])*c; }
  if(Math.abs(a)<1e-9){ const b=polyBox(pts); return [(b[0]+b[2])/2,(b[1]+b[3])/2]; } return [cx/(3*a), cy/(3*a)]; }
function pointIn(poly, x, y){ let c=false; const n=poly.length; for(let i=0;i<n;i++){ const [x0,y0]=poly[i], [x1,y1]=poly[(i+1)%n]; if((y0>y)!==(y1>y)){ if(x<x0+(y-y0)*(x1-x0)/(y1-y0)) c=!c; } } return c; }
/* 多角形を半平面 (p−o)·n ≥ 0 で切る（Sutherland–Hodgman。切る側は凸） */
function clipHalf(poly, o, n){
  const out=[], N=poly.length; if(!N) return out;
  const side=(p)=>(p[0]-o[0])*n[0]+(p[1]-o[1])*n[1];
  for(let i=0;i<N;i++){ const a=poly[i], b=poly[(i+1)%N], sa=side(a), sb=side(b);
    if(sa>=0) out.push(a);
    if((sa>=0)!==(sb>=0)){ const t=sa/(sa-sb); out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]); } }
  return out;
}
/* 壁の枠（直線）の u0≤u≤u1 の帯で切る。曲面壁は arcPoints で部分を作ること */
function clipBand(poly, f, u0, u1){
  const o0=f.W(u0,0), o1=f.W(u1,0);
  return clipHalf(clipHalf(poly, o0, f.d), o1, [-f.d[0], -f.d[1]]);
}
/* 同じ点・まっすぐ続く点を落とす */
function simplify(pts, eps){
  eps=eps||1e-6; let p=pts.filter((q,i)=>{ const r=pts[(i+1)%pts.length]; return Math.hypot(q[0]-r[0],q[1]-r[1])>eps; });
  for(let pass=0;pass<2;pass++){ const n=p.length, out=[]; for(let i=0;i<n;i++){ const a=p[(i-1+n)%n], b=p[i], c=p[(i+1)%n]; const cr=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]); const l1=Math.hypot(b[0]-a[0],b[1]-a[1]), l2=Math.hypot(c[0]-b[0],c[1]-b[1]); if(Math.abs(cr)>1e-6*Math.max(1,l1*l2)) out.push(b); } p=out; }
  return p;
}
function lineMeet(p, d, q, e){ const den=d[0]*e[1]-d[1]*e[0]; if(Math.abs(den)<1e-9) return null; const t=((q[0]-p[0])*e[1]-(q[1]-p[1])*e[0])/den; return [p[0]+d[0]*t, p[1]+d[1]*t]; }

/* ── 壁の接合 ─────────────────────────────────────────────────────────────
   接合点（端点を tol 以内で共有する所）ごとに、端を角度順に並べ、隣どうしの面（自分の左面と次の右面）の交点を角にする。
   各壁の端の形＝[右の角, 接合点, 左の角]。接合点を含めるので、T・十字でも扇形が区間を分け合って隙間が出ない。
   平行（まっすぐ続く・重なる）か、交点が maxExt×厚さより遠い（鋭角）ときは自分の面の点。厚さの違いは段になって見える。 */
function wallJoin(m, level, opt){
  opt=opt||{}; const tol=opt.tol!=null?+opt.tol:1, maxExt=opt.maxExt!=null?+opt.maxExt:6;
  const lid=level==null?null:(typeof level==='object'?level.id:level);
  const walls=arr(m.walls).filter(w=>(lid==null||w.level===lid)&&w.a&&w.b&&w.t>0&&(w.curve||Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>=1));
  const nodes=[]; const nodeAt=(p)=>{ let n=nodes.find(q=>Math.hypot(q.at[0]-p[0],q.at[1]-p[1])<=tol); if(!n){ n={at:[p[0],p[1]], ends:[]}; nodes.push(n); } return n; };
  const ends=new Map();
  walls.forEach(w=>{ const E={}, f=wallFrame(w);
    [['a',0,1],['b',f.L,-1]].forEach(([k,u,s])=>{ const nd=nodeAt(w[k]); let d=f.curve?f.dirAt(u):f.d; d=[d[0]*s, d[1]*s];
      const e={ wall:w, end:k, d, n:[-d[1], d[0]], h:w.t/2, ang:Math.atan2(d[1],d[0]), curve:!!f.curve, node:nd, joined:[] };
      e.L=[nd.at[0]+e.n[0]*e.h, nd.at[1]+e.n[1]*e.h]; e.R=[nd.at[0]-e.n[0]*e.h, nd.at[1]-e.n[1]*e.h];
      nd.ends.push(e); E[k]=e; });
    ends.set(w.id, E); });
  const meet=(P, e, s1, g, s2)=>{   // e の面 s1（L/R）と g の面 s2 の交点。無理なら e 自身の面の点
    const own=s1==='L'?e.L:e.R;
    const p=[P[0]+(s1==='L'?1:-1)*e.n[0]*e.h, P[1]+(s1==='L'?1:-1)*e.n[1]*e.h];
    const q=[P[0]+(s2==='L'?1:-1)*g.n[0]*g.h, P[1]+(s2==='L'?1:-1)*g.n[1]*g.h];
    const x=lineMeet(p, e.d, q, g.d); if(!x) return own;
    if(Math.hypot(x[0]-P[0], x[1]-P[1])>maxExt*Math.max(e.h,g.h)*2) return own;
    return x; };
  nodes.forEach(nd=>{ const es=nd.ends.filter(e=>!e.curve).sort((p,q)=>p.ang-q.ang), k=es.length; if(k<2) return;
    // まっすぐ続く対（向きが 180°・同じ厚さ）：通し壁。最も厚い対が主で、自分の面の点のまま（T・十字で他の壁がその面に突き当たる）
    const paired=new Set(); let primary=null;
    const pairs=[]; for(let i=0;i<k;i++) for(let j=i+1;j<k;j++){ const e=es[i], g=es[j]; if(paired.has(e)||paired.has(g)) continue;
      const dot=e.d[0]*g.d[0]+e.d[1]*g.d[1]; if(dot<-Math.cos(1*DEG)&&Math.abs(e.h-g.h)<0.5){ paired.add(e); paired.add(g); pairs.push([e,g]); } }
    if(pairs.length){ pairs.sort((p,q)=>q[0].h-p[0].h); primary=pairs[0]; }
    const through=(e)=>primary&&(primary[0]===e||primary[1]===e);
    // 主の壁（exterior・fire）が 2 本以上あれば、それらだけで角を作り、間仕切りはその面に突き当たる（外壁の角に間仕切りの塗りが入らない）
    const rank=(e)=>e.wall.kind==='partition'?0:1, top=Math.max(...es.map(rank)), majors=es.filter(e=>rank(e)===top), minorMode=majors.length>=2&&majors.length<k;
    const nb=(e,dir)=>{ const list=minorMode&&rank(e)===top?majors:es; const i=list.indexOf(e); return list[(i+dir+list.length)%list.length]; };
    const L=es.map(e=>through(e)?e.L:meet(nd.at, e, 'L', nb(e,1), 'R')), R=es.map(e=>through(e)?e.R:meet(nd.at, e, 'R', nb(e,-1), 'L'));
    es.forEach((e,i)=>{ e.L=L[i]; e.R=R[i]; e.joined=es.filter(x=>x!==e).map(x=>x.wall.id); e.fan=!primary&&!(minorMode&&rank(e)<top); e.mid=null;
      if(minorMode&&rank(e)<top){   // 間仕切りの端：両隣の主の壁の面どうしの角（内の角）を間に入れて隙間を埋める
        const p=nb(e,-1), q=nb(e,1); if(p!==q){ const x=meet(nd.at, p, 'L', q, 'R'); const own=p.L; if(x&&x!==own&&Math.hypot(x[0]-nd.at[0],x[1]-nd.at[1])<=maxExt*Math.max(p.h,q.h)*2){
          // R→L の線より接合点の側にあるときだけ
          const s=(e.L[0]-e.R[0])*(x[1]-e.R[1])-(e.L[1]-e.R[1])*(x[0]-e.R[0]), s0=(e.L[0]-e.R[0])*(nd.at[1]-e.R[1])-(e.L[1]-e.R[1])*(nd.at[0]-e.R[0]);
          if(s*s0>0) e.mid=x; } } } }); });
  return walls.map(w=>{ const E=ends.get(w.id), a=E.a, b=E.b;
    let poly;
    if(a.curve) poly=arcPoints(w);
    else { poly=[a.R]; if(a.fan) poly.push(a.node.at); else if(a.mid) poly.push(a.mid); poly.push(a.L, b.R); if(b.fan) poly.push(b.node.at); else if(b.mid) poly.push(b.mid); poly.push(b.L); poly=simplify(poly); }
    return { id:w.id, wall:w, polygon:poly, curve:!!a.curve, a:{node:a.node.at.slice(), joined:a.joined.slice()}, b:{node:b.node.at.slice(), joined:b.joined.slice()} }; });
}
/* 多角形の集まりの輪郭：辺を他の多角形の頂点で分け、2 回現れる辺（共有）を落とす。戻りは [[p,q]…]（world） */
function joinEdges(polys){
  const K=(p)=>Math.round(p[0]*100)/100+','+Math.round(p[1]*100)/100;
  const verts=[]; polys.forEach(pg=>pg.forEach(p=>verts.push(p)));
  const segs=[];
  polys.forEach(pg=>{ const n=pg.length; for(let i=0;i<n;i++){ const a=pg[i], b=pg[(i+1)%n]; const dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy; if(L2<1e-12) continue;
    const ts=[0,1]; verts.forEach(v=>{ const t=((v[0]-a[0])*dx+(v[1]-a[1])*dy)/L2; if(t<=1e-6||t>=1-1e-6) return; const px=a[0]+dx*t, py=a[1]+dy*t; if(Math.hypot(px-v[0],py-v[1])<0.05) ts.push(t); });
    ts.sort((p,q)=>p-q); for(let k=0;k+1<ts.length;k++){ if(ts[k+1]-ts[k]<1e-9) continue; segs.push([[a[0]+dx*ts[k], a[1]+dy*ts[k]],[a[0]+dx*ts[k+1], a[1]+dy*ts[k+1]]]); } } });
  const cnt=new Map(); segs.forEach(s=>{ const k1=K(s[0]), k2=K(s[1]); const key=k1<k2?k1+'|'+k2:k2+'|'+k1; cnt.set(key,(cnt.get(key)||0)+1); });
  return segs.filter(s=>{ const k1=K(s[0]), k2=K(s[1]); const key=k1<k2?k1+'|'+k2:k2+'|'+k1; return cnt.get(key)===1; });
}

/* ── 新しい要素の幾何（ELEMENTS.md） ────────────────────────────────────── */
function levelFl(m, id){ const l=arr(m.levels).find(x=>x.id===id); return l&&isFinite(+l.fl)?+l.fl:null; }
function nextLevel(m, id){ const ls=arr(m.levels).filter(l=>isFinite(+l.fl)).sort((a,b)=>a.fl-b.fl), i=ls.findIndex(l=>l.id===id); return i>=0&&i+1<ls.length?ls[i+1]:null; }
/* 要素が階 lid にかかるか：from（無ければ level）の床から to の床の下まで。to が無ければ自分の階だけ */
function coversLevel(m, el, lid){
  if(!el) return false; const start=el.from||el.level; if(start===lid) return true;
  const f0=levelFl(m, start), fx=levelFl(m, lid); if(f0==null||fx==null) return false;
  const to=el.to; if(to==null) return false;
  const f1=levelFl(m, to); if(f1==null) return false;
  return f0<=fx&&fx<f1;
}
function columnPolygon(c){
  const w=+c.w||0, d=c.shape==='round'?w:(+c.d||w), x=c.at[0], y=c.at[1];
  if(c.shape==='round'){ const n=32, out=[]; for(let k=0;k<n;k++){ const t=2*Math.PI*k/n; out.push([x+w/2*Math.cos(t), y+w/2*Math.sin(t)]); } return out; }
  const th=(c.rot||0)*DEG, cs=Math.cos(th), sn=Math.sin(th), R=(lx,ly)=>[x+cs*lx-sn*ly, y+sn*lx+cs*ly];
  return [R(-w/2,-d/2), R(w/2,-d/2), R(w/2,d/2), R(-w/2,d/2)];
}
/* 斜路：path の中心線に沿う左右の縁（折れ点は面の交点）、run・rise・slope と注記の文（例「1:12」） */
function rampGeom(m, r){
  const P=arr(r.path).filter(p=>p&&isFinite(+p[0])&&isFinite(+p[1])), W=(+r.width||0)/2, segs=[];
  for(let i=0;i+1<P.length;i++){ const d=[P[i+1][0]-P[i][0], P[i+1][1]-P[i][1]], L=Math.hypot(d[0],d[1]); if(L<1e-9) continue; segs.push({a:P[i], b:P[i+1], d:[d[0]/L,d[1]/L], n:[-d[1]/L, d[0]/L], L}); }
  const run=segs.reduce((s,q)=>s+q.L,0);
  const f0=levelFl(m, r.level), f1=levelFl(m, r.to);
  const rise=isFinite(+r.rise)?+r.rise:(f0!=null&&f1!=null?f1-f0:null);
  const slope=isFinite(+r.slope)?+r.slope:(rise!=null&&run>0?Math.abs(rise)/run:null);
  const label=slope!=null&&slope>0?'1:'+(Math.round(1/slope*10)/10).toString().replace(/\.0$/,''):null;
  const side=(s)=>{ const out=[]; segs.forEach((q,i)=>{ const p0=[q.a[0]+q.n[0]*s, q.a[1]+q.n[1]*s], p1=[q.b[0]+q.n[0]*s, q.b[1]+q.n[1]*s];
      if(i===0) out.push(p0);
      else { const pr=segs[i-1], x=lineMeet([pr.a[0]+pr.n[0]*s, pr.a[1]+pr.n[1]*s], pr.d, p0, q.d); out.push(x&&Math.hypot(x[0]-q.a[0],x[1]-q.a[1])<4*Math.abs(s)+1?x:p0); }
      if(i===segs.length-1) out.push(p1); }); return out; };
  return { run, rise, slope, label, segs, left:side(W), right:side(-W), width:W*2 };
}
/* ブリーズ・ソレイユ：a→b に沿う面。side＝羽根が出る側（+1＝a→b の左。無ければ室の無い側、室が無ければ左）。
   fins＝縦の羽根（vertical・eggcrate）の四角形、plate＝横の板（horizontal・eggcrate）の外形 */
function screenGeom(m, s){
  const f=wallFrame({a:s.a, b:s.b, t:0}), depth=+s.depth||0, pitch=+s.pitch||0, th=+s.thickness||0;
  let side=s.side===-1||s.side===1?s.side:0;
  if(!side){ const rooms=arr(m.rooms).filter(r=>r.level===s.level&&arr(r.polygon).length>=3); const p=f.W(f.L/2, 200), q=f.W(f.L/2, -200);
    side=rooms.some(r=>pointIn(r.polygon,p[0],p[1]))?-1:(rooms.some(r=>pointIn(r.polygon,q[0],q[1]))?1:1); }
  const fins=[]; const vertical=s.kind==='vertical'||s.kind==='eggcrate';
  if(vertical&&pitch>0&&f.L>0){ const n=Math.floor(f.L/pitch+1e-6), off=(f.L-n*pitch)/2; for(let k=0;k<=n;k++){ const u=off+k*pitch; if(u<-1e-6||u>f.L+1e-6) continue; const u0=Math.max(0,u-th/2), u1=Math.min(f.L,u+th/2); fins.push([f.W(u0,0), f.W(u1,0), f.W(u1,side*depth), f.W(u0,side*depth)]); } }
  const plate=[f.W(0,0), f.W(f.L,0), f.W(f.L,side*depth), f.W(0,side*depth)];
  return { f, side, fins, plate, horizontal:s.kind==='horizontal'||s.kind==='eggcrate', depth };
}
function roofHoles(roof){
  return arr(roof.holes).map(h=>{
    if(h.shape==='polygon'||(!h.shape&&h.polygon)) return arr(h.polygon).slice();
    const c=h.c||[0,0], rx=h.shape==='circle'?(+h.r||+h.rx||0):(+h.rx||0), ry=h.shape==='circle'?rx:(+h.ry||rx), th=(h.rot||0)*DEG, cs=Math.cos(th), sn=Math.sin(th), n=48, out=[];
    for(let k=0;k<n;k++){ const t=2*Math.PI*k/n, lx=rx*Math.cos(t), ly=ry*Math.sin(t); out.push([c[0]+cs*lx-sn*ly, c[1]+sn*lx+cs*ly]); } return out; });
}
/* その階の上に載る屋根：roof.level がこの階なら「屋根伏」（above:false）。そうでなければ、この階がその屋根の fl の直下の階なら above:true */
function roofFor(m, lid){
  const fl=levelFl(m, lid), out=[];
  arr(m.roofs).forEach(r=>{ if(!r||!isFinite(+r.fl)) return;
    if(r.level===lid){ out.push({roof:r, above:false}); return; }
    if(fl==null||+r.fl<=fl) return;
    const between=arr(m.levels).some(l=>l.id!==lid&&isFinite(+l.fl)&&+l.fl>fl&&+l.fl<+r.fl&&l.id!==r.level);
    if(!between) out.push({roof:r, above:true}); });
  return out;
}
const DIRV={N:[0,1], E:[1,0], S:[0,-1], W:[-1,0]};
/* 階段の局所座標：s＝上る向き（1 段目の蹴込みが 0）、c＝右へ（左の端が 0） */
function stairGeom(s){
  const d=DIRV[s.dir]||DIRV.N, r=[d[1], -d[0]];
  const treads=s.n-1, run=treads*s.tread;
  return { d, r, treads, run, W:(ss,cc)=>[s.origin[0]+d[0]*ss+r[0]*cc, s.origin[1]+d[1]*ss+r[1]*cc],
    rect(){ const p=[this.W(0,0), this.W(run,0), this.W(run,s.width), this.W(0,s.width)]; const xs=p.map(q=>q[0]), ys=p.map(q=>q[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; } };
}

/* ── 空のモデル ─────────────────────────────────────────────────────────── */
function create(opt){
  opt=opt||{};
  return { version:1, name:opt.name||'無題', unit:'mm',
    grid:{ x:[{id:'X1',at:0},{id:'X2',at:opt.width||5400}], y:[{id:'Y1',at:0},{id:'Y2',at:opt.depth||8100}] },
    site:{ polygon:[], north_deg:0, roads:[] },
    levels:[{ id:'1F', fl:opt.fl!=null?opt.fl:150, height:opt.height||3000 }],
    walls:[], openings:[], stairs:[], rooms:[], fixtures:[], sections:[], sheets:[],
    plan:{ cut:1200 } };
}

/* ── model.json（archdraw/plan の形）→ DESIGN §2 の形 ─────────────────────── */
function fromArchdraw(J){
  const m=create({name:'路地の住戸（SPEC §4）'});
  const gx=J.grid.X, gy=J.grid.Y;
  m.grid={ x:Object.keys(gx).map(k=>({id:k, at:gx[k]})), y:Object.keys(gy).map(k=>({id:k, at:gy[k]})) };
  const S=J.site;
  const x0=S.boundary_west_x, x1=S.boundary_east_x, y0=S.boundary_south_y, y1=S.boundary_north_y;
  m.site={ polygon:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]], north_deg:0,
    roads:[{edge:0, width:S.alley_width, name:'路地'}], setback:S.setback_from_boundary_to_outer_face };
  const L=J.levels, FH=J.floor_height;
  m.levels=Object.keys(J.floors).map(fk=>({ id:fk, fl:J.floors[fk].fl, height:FH[fk] }));
  m.roof={ fl:L.RFL, parapet:L.parapet_top-L.RFL };
  m.plan={ cut:J.plan_cut_height_above_FL };
  m.walls=[]; m.openings=[]; m.rooms=[]; m.fixtures=[]; m.stairs=[];
  Object.keys(J.floors).forEach(fk=>{
    const F=J.floors[fk], wid={};
    F.walls.forEach(w=>{
      const r=w.rect, ax=(r[2]-r[0])>=(r[3]-r[1])?'x':'y';
      const id=fk+'-'+w.id; wid[w.id]={id, ax, r};
      const t=ax==='x'?r[3]-r[1]:r[2]-r[0];
      const a=ax==='x'?[r[0],(r[1]+r[3])/2]:[(r[0]+r[2])/2,r[1]], b=ax==='x'?[r[2],(r[1]+r[3])/2]:[(r[0]+r[2])/2,r[3]];
      const o={ id, level:fk, a, b, t, kind:w.kind==='struct'?'exterior':'partition' };
      if(w.side==='S') o.accent=true;
      m.walls.push(o);
    });
    F.openings.forEach(o=>{
      const h=wid[o.wall], a0=h.ax==='x'?h.r[0]:h.r[1];
      // 局所の左（n）が絶対座標の正の向きと同じか：x の壁（a→b が +X）は n＝+Y で同じ、y の壁（+Y）は n＝−X で逆
      const dot=h.ax==='x'?1:-1;
      const q={ id:fk+'-'+o.id.replace(/^\dF-/,''), wall:h.id, at:o.a-a0, width:o.b-o.a, sill:o.sill, head:o.head };
      if(o.type==='window_slide'){ q.type=o.sill>0?'window':'sweep'; }
      else if(o.type==='shop_slide'){ q.type='sweep'; q.shutter=true; }
      else if(o.type==='door_swing'){ q.type='door'; q.swing=(o.hinge||'a')==='a'?'L':'R'; q.flip=((o.swing||-1)*dot)>0; }
      else if(o.type==='door_slide'){ q.type='slide'; q.variant='outset'; q.side=(o.side||1)*dot; q.park=o.park||'b'; }
      else if(o.type==='closet_slide'){ q.type='slide'; q.variant='closet'; }
      if(o.panels) q.panels=o.panels;
      if(o.fire) q.fire=true;
      if(o.rail) q.rail=true;
      if(o.loc) q.loc=o.loc;
      if(o.note) q.note=o.note;
      m.openings.push(q);
    });
    F.rooms.forEach(r=>{
      const q={ id:r.id, level:fk, name:r.name, polygon:r.poly.map(p=>[p[0],p[1]]) };
      if(r.sub) q.sub=r.sub;
      q.label=r.label?[r.label[0], r.label[1]]:null;   // null＝室名を描かない（階段）。無指定（undefined）なら plan が自動で置く
      if(r.small) q.small=true;
      if(r.finish) q.finish=r.finish;
      m.rooms.push(q);
    });
    arr(J.fixtures[fk]).forEach((f,k)=>m.fixtures.push(fixtureFrom(f, fk, k)));
  });
  Object.keys(J.flights).forEach(k=>{
    const f=J.flights[k];
    m.stairs.push({ id:k, from:f.from, to:f.to, origin:[f.x0, f.y_first], dir:f.dir>0?'N':'S', width:f.x1-f.x0, rise:f.rise, tread:f.going, n:f.risers });
  });
  const gxs=m.grid.x.map(g=>g.at), gys=m.grid.y.map(g=>g.at);
  m.sections=Object.keys(J.sections).map(k=>{ const s=J.sections[k];
    return s.axis==='x' ? { id:k, a:[Math.min(...gxs), s.at], b:[Math.max(...gxs), s.at], look:s.look==='+Y'?'N':'S' }
                        : { id:k, a:[s.at, Math.min(...gys)], b:[s.at, Math.max(...gys)], look:s.look==='-X'?'W':'E' }; });
  m.notes=arr(J.notes).slice();
  return m;
}
function fixtureFrom(f, fk, k){
  const id=fk+'-F'+(k+1), t=f.type;
  const R=(r,extra)=>Object.assign({ id, level:fk, kind:t, at:[(r[0]+r[2])/2,(r[1]+r[3])/2], rot:0, w:r[2]-r[0], d:r[3]-r[1] }, extra||{});
  if(t==='toilet'){ const s=f.rot===0?1:-1; return { id, level:fk, kind:t, at:[f.x, f.y+s*362.5], rot:f.rot===0?0:180, w:440, d:725 }; }
  if(t==='handbasin') return R([f.x-260, f.y-200, f.x, f.y+200]);
  if(t==='shower') return R([f.x-150, f.y-220, f.x+150, f.y]);
  if(t==='rod'){ const p=f.line; return { id, level:fk, kind:t, at:[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2], rot:0, w:Math.abs(p[1][0]-p[0][0]), d:0, upper:true }; }
  const r=f.rect, cx=(r[0]+r[2])/2, cy=(r[1]+r[3])/2, x={};
  if(f.upper) x.upper=true;
  if(f.div) x.div=f.div;
  if(f.chairs) x.chairs=f.chairs;
  if(f.head) x.head=f.head;
  if(f.pillows) x.pillows=f.pillows;
  if(f.sink) x.sink=[f.sink[0]-cx, f.sink[1]-cy, f.sink[2]-cx, f.sink[3]-cy];
  if(f.hob) x.hob=[f.hob[0]-cx, f.hob[1]-cy];
  return R(r, x);
}

/* tools/archdraw/plan/model.json の中身（about を除く）。sample() はこれを fromArchdraw に通す */
const RAW={"grid":{"X":{"X1":0,"X2":2700,"X3":5400},"Y":{"Y1":0,"Y2":2700,"Y3":5400,"Y4":8100}},"wall_thickness":{"exterior_struct":150,"partition":100},"site":{"alley_width":2700,"setback_from_boundary_to_outer_face":650,"boundary_south_y":-725,"alley_center_y":-2075,"alley_far_y":-3425,"site_width":5400,"site_depth":9000,"boundary_north_y":8275,"boundary_west_x":0,"boundary_east_x":5400,"setback_line_from_alley_center":2000},"levels":{"GL":0,"1FL":150,"2FL":3150,"3FL":5950,"RFL":8650,"parapet_top":9750},"floor_height":{"1F":3000,"2F":2800,"3F":2700},"plan_cut_height_above_FL":1200,"flights":{"S1":{"from":"1F","to":"2F","risers":15,"rise":200,"going":220,"x0":4525,"x1":5325,"y_first":3750,"dir":1,"treads":14,"run":3080,"y_last":6830,"width":800,"total_rise":3000},"S2":{"from":"2F","to":"3F","risers":14,"rise":200,"going":220,"x0":4525,"x1":5325,"y_first":3750,"dir":1,"treads":13,"run":2860,"y_last":6610,"width":800,"total_rise":2800}},"floors":{"1F":{"level":"1FL","fl":150,"walls":[{"id":"W-S","kind":"struct","side":"S","rect":[-75,-75,5475,75]},{"id":"W-N","kind":"struct","side":"N","rect":[-75,8025,5475,8175]},{"id":"W-W","kind":"struct","side":"W","rect":[-75,-75,75,8175]},{"id":"W-E","kind":"struct","side":"E","rect":[5325,-75,5475,8175]},{"id":"P1-WCe","kind":"part","rect":[1350,6350,1450,8025]},{"id":"P1-WCs","kind":"part","rect":[75,6350,1450,6450]},{"id":"P1-ST","kind":"part","rect":[4425,3750,4525,8025]}],"openings":[{"id":"1F-S1","wall":"W-S","type":"shop_slide","a":900,"b":4500,"width":3600,"sill":0,"head":2400,"panels":4,"fire":true,"note":"引違い戸 4 枚・防火シャッター付き（防火設備）","loc":"路地側"},{"id":"1F-N1","wall":"W-N","type":"window_slide","a":400,"b":1000,"width":600,"sill":1000,"head":1600,"panels":2,"loc":"北・便所"},{"id":"1F-N2","wall":"W-N","type":"window_slide","a":3000,"b":3900,"width":900,"sill":900,"head":2000,"panels":2,"loc":"北・土間"},{"id":"1F-D1","wall":"P1-WCs","type":"door_swing","a":550,"b":1300,"width":750,"sill":0,"head":2000,"hinge":"b","swing":-1,"note":"便所の戸。外開き","loc":"便所"},{"id":"1F-D2","wall":"P1-ST","type":"door_swing","a":7050,"b":7850,"width":800,"sill":0,"head":2000,"hinge":"b","swing":-1,"note":"階段下の物入の戸","loc":"物入"}],"flights":["S1"],"rooms":[{"id":"1F-DOMA","name":"土間","sub":"作業場・店","poly":[[0,0],[5400,0],[5400,3750],[4475,3750],[4475,8100],[1400,8100],[1400,6400],[0,6400]],"label":[2350,3300],"finish":"doma"},{"id":"1F-WC","name":"便所","poly":[[0,6400],[1400,6400],[1400,8100],[0,8100]],"label":[700,6950]},{"id":"1F-ST","name":"階段・物入","poly":[[4475,3750],[5400,3750],[5400,8100],[4475,8100]],"label":null}]},"2F":{"level":"2FL","fl":3150,"walls":[{"id":"W-S","kind":"struct","side":"S","rect":[-75,-75,5475,75]},{"id":"W-N","kind":"struct","side":"N","rect":[-75,8025,5475,8175]},{"id":"W-W","kind":"struct","side":"W","rect":[-75,-75,75,8175]},{"id":"W-E","kind":"struct","side":"E","rect":[5325,-75,5475,8175]},{"id":"P2-ST","kind":"part","rect":[4425,3750,4525,6830]}],"openings":[{"id":"2F-S1","wall":"W-S","type":"window_slide","a":900,"b":4500,"width":3600,"sill":0,"head":2200,"panels":4,"fire":true,"rail":true,"note":"掃き出しの引違い窓 4 枚（防火設備）・外に手摺","loc":"路地側"},{"id":"2F-N1","wall":"W-N","type":"window_slide","a":1200,"b":2400,"width":1200,"sill":1050,"head":1750,"panels":2,"loc":"北・台所"},{"id":"2F-N2","wall":"W-N","type":"window_slide","a":4500,"b":5100,"width":600,"sill":900,"head":1800,"panels":2,"loc":"北・踊り場"}],"flights":["S2","S1"],"rooms":[{"id":"2F-LDK","name":"居間・食堂・台所","poly":[[0,0],[5400,0],[5400,3750],[4475,3750],[4475,6830],[5400,6830],[5400,8100],[0,8100]],"label":[2500,3350]},{"id":"2F-ST","name":"階段","poly":[[4475,3750],[5400,3750],[5400,6830],[4475,6830]],"label":null}]},"3F":{"level":"3FL","fl":5950,"walls":[{"id":"W-S","kind":"struct","side":"S","rect":[-75,-75,5475,75]},{"id":"W-N","kind":"struct","side":"N","rect":[-75,8025,5475,8175]},{"id":"W-W","kind":"struct","side":"W","rect":[-75,-75,75,8175]},{"id":"W-E","kind":"struct","side":"E","rect":[5325,-75,5475,8175]},{"id":"P3-B1","kind":"part","rect":[75,3700,5325,3800]},{"id":"P3-SAN","kind":"part","rect":[75,5850,3575,5950]},{"id":"P3-BATH","kind":"part","rect":[1725,3800,1825,5850]},{"id":"P3-COR","kind":"part","rect":[3475,3800,3575,8025]},{"id":"P3-ST","kind":"part","rect":[4425,3800,4525,6610]},{"id":"P3-CLOe","kind":"part","rect":[2725,3000,2825,3700]},{"id":"P3-CLOf","kind":"part","rect":[75,3000,2825,3100]}],"openings":[{"id":"3F-S1","wall":"W-S","type":"window_slide","a":900,"b":4500,"width":3600,"sill":700,"head":2100,"panels":4,"fire":true,"note":"引違い窓 4 枚（防火設備）","loc":"路地側"},{"id":"3F-N1","wall":"W-N","type":"window_slide","a":1200,"b":2400,"width":1200,"sill":800,"head":1900,"panels":2,"loc":"北・寝室 2"},{"id":"3F-N2","wall":"W-N","type":"window_slide","a":4500,"b":5100,"width":600,"sill":900,"head":1800,"panels":2,"loc":"北・廊下"},{"id":"3F-D1","wall":"P3-B1","type":"door_swing","a":3600,"b":4400,"width":800,"sill":0,"head":2000,"hinge":"b","swing":-1,"note":"寝室 1 の戸","loc":"寝室 1"},{"id":"3F-D2","wall":"P3-COR","type":"door_slide","a":4350,"b":5100,"width":750,"sill":0,"head":2000,"side":1,"park":"b","note":"洗面の戸。廊下側のアウトセット引戸","loc":"洗面脱衣"},{"id":"3F-D3","wall":"P3-BATH","type":"door_swing","a":4500,"b":5200,"width":700,"sill":0,"head":2000,"hinge":"b","swing":-1,"note":"浴室の戸。浴室側に開く","loc":"浴室"},{"id":"3F-D4","wall":"P3-COR","type":"door_swing","a":7000,"b":7800,"width":800,"sill":0,"head":2000,"hinge":"b","swing":-1,"note":"寝室 2 の戸","loc":"寝室 2"},{"id":"3F-C1","wall":"P3-CLOf","type":"closet_slide","a":75,"b":2725,"width":2650,"sill":0,"head":2000,"panels":2,"note":"物入の引違い戸","loc":"物入"}],"flights":["S2"],"rooms":[{"id":"3F-B1","name":"寝室 1","poly":[[0,0],[5400,0],[5400,3750],[2775,3750],[2775,3050],[0,3050]],"label":[2050,2250]},{"id":"3F-CLO","name":"物入","poly":[[0,3050],[2775,3050],[2775,3750],[0,3750]],"label":[1400,3590],"small":true},{"id":"3F-BATH","name":"浴室","poly":[[0,3750],[1775,3750],[1775,5900],[0,5900]],"label":[1300,4200]},{"id":"3F-SAN","name":"洗面脱衣","poly":[[1775,3750],[3525,3750],[3525,5900],[1775,5900]],"label":[2380,4720]},{"id":"3F-B2","name":"寝室 2","poly":[[0,5900],[3525,5900],[3525,8100],[0,8100]],"label":[1720,6640]},{"id":"3F-HALL","name":"廊下","poly":[[3525,3750],[4475,3750],[4475,6610],[5400,6610],[5400,8100],[3525,8100]],"label":[4000,7480],"small":true},{"id":"3F-ST","name":"階段","poly":[[4475,3750],[5400,3750],[5400,6610],[4475,6610]],"label":null}]}},"fixtures":{"1F":[{"type":"toilet","x":712,"y":8025,"rot":180},{"type":"handbasin","x":1350,"y":7000,"rot":90},{"type":"bench","rect":[1500,1700,3300,2450]},{"type":"shelf","rect":[75,1000,525,5500],"div":900},{"type":"shoebox","rect":[4025,4200,4425,5300]}],"2F":[{"type":"fridge","rect":[75,7325,775,8025]},{"type":"counter","rect":[775,7375,3325,8025],"sink":[1400,7465,2200,7865],"hob":[2850,7695]},{"type":"hood","rect":[2475,7525,3225,8025],"upper":true},{"type":"table","rect":[1050,5100,2550,5950],"chairs":2},{"type":"sofa","rect":[75,1000,925,3000]},{"type":"lowtable","rect":[1350,1500,1850,2500]},{"type":"tvboard","rect":[4875,1200,5325,2800]}],"3F":[{"type":"bed","rect":[3325,950,5325,2350],"head":"E","pillows":2},{"type":"bed","rect":[75,6025,1045,7975],"head":"N","pillows":1},{"type":"desk","rect":[1350,7475,2350,8025]},{"type":"wardrobe","rect":[2575,5950,3475,6550]},{"type":"tub","rect":[75,4025,875,5625]},{"type":"shower","x":1350,"y":5850},{"type":"vanity","rect":[1900,5300,2650,5850]},{"type":"washer","rect":[2760,5210,3400,5850]},{"type":"toilet","x":2950,"y":3800,"rot":0},{"type":"rod","line":[[125,3400],[2675,3400]],"upper":true},{"type":"skylight","rect":[4745,4300,5325,6000],"upper":true}]},"sections":{"A":{"axis":"x","at":4050,"look":"+Y","note":"建物の中央を東西に切る（Y=4,050）。北を見る"},"B":{"axis":"y","at":4925,"look":"-X","note":"階段の中心を南北に切る（X=4,925）。西を見る"}},"notes":["東西の外壁は敷地境界に芯を合わせた耐火の界壁とした（判断）。","路地の境界から外壁の外面まで 650 は、路地の中心線から 2,000 の線に当たる。","最高高さ：階高の和で屋上の床 GL+8,650、パラペットの天端 GL+9,750。SPEC の『GL+9,000 程度』とは合わない（断面担当の判断に委ねる）。","開口の sill/head は各階の FL からの高さ。"]};

function sample(){
  const m=fromArchdraw(clone(RAW));
  // model.json に無い、図の上の置き場所（tools/archdraw/plan/plan.py の値）
  const st=m.rooms.find(r=>r.id==='1F-ST'); if(st){ st.label=[4925,7480]; st.labelText='物入'; }
  const mk={'1F':[2350,650], '2F':[2050,4300], '3F':[600,600]};
  // 図題の本文と階ごとの注記（plan.py の CAPTION_BODY・notes の extra）。plan.sheet / sheetAll が使う。無ければ plan が模型から組み立てる
  const cap={
    '1F':'1 階は土間（作業場・店）と便所。路地側は幅 3,600 の引違い戸 4 枚に防火シャッターを付け、階段（15 段で 2 階へ）の下は物入とした。外壁の面は路地境界から 650 下がった後退線（路地の中心線から 2,000）にそろえる。赤は路地に面する耐火の外壁と防火設備、破線は上部の輪郭（切断より上の階段とシャッターケース）。A-A\'・B-B\' は断面の位置。筆者作成',
    '2F':'2 階は居間・食堂・台所を 1 室にし、路地側に幅 3,600 の掃き出しの引違い窓（防火設備）と外の手摺、北に台所の窓を置いた。階段は 1 階からの 15 段（北の踊り場に着く）と 3 階への 14 段が同じ位置に重なり、切断線の手前が 3 階への上り、奥が 1 階への下り。赤は路地に面する耐火の外壁と防火設備、破線は上部の輪郭（レンジフード）。筆者作成',
    '3F':'3 階は路地側の寝室 1（18.31 m²）と北の寝室 2、その間の浴室・洗面脱衣。廊下（有効 850）が階段の到着から寝室 1 まで通る。赤は路地に面する耐火の外壁と防火設備、破線は上部の輪郭（階段の上のトップライトと物入のパイプ）。筆者作成' };
  const nt={ '1F':['1FL＝GL＋150（土間。土間コンクリート金ごて）','北の敷地境界は外壁の外面から 100'], '2F':['2FL＝1FL＋3,000','北の踊り場の奥行 1,195（1 階からの到着）'], '3F':['3FL＝2FL＋2,800','便器は洗面脱衣に置く（判断）'] };
  m.levels.forEach(l=>{ if(mk[l.id]) l.mark=mk[l.id]; if(cap[l.id]) l.caption=cap[l.id]; if(nt[l.id]) l.notes=nt[l.id].slice(); });
  m.captionAll='左から 1 階・2 階・3 階。同じ縮尺と向きで並べ、通り芯・寸法の段をそろえた。1 階は土間（作業場・店）と便所、2 階は居間・食堂・台所、3 階は寝室 2 室と浴室。階段は東の界壁沿いの直階段（有効幅 800、蹴上 200・踏面 220）を各階同じ位置に重ねる。赤は路地に面する耐火の外壁と防火設備、二点鎖線は敷地境界で、外壁の面は路地の中心線から 2,000 の後退線にそろう。A-A\'・B-B\' は断面の位置。筆者作成';
  m.structure='木造在来軸組・3 階建て。陸屋根';
  // 平面の凡例・図題の語（SPEC §4「外壁厚 150（耐火の外壁）」「防火設備」）。plan はここから読む（無い建物には書かない）
  m.materials={ exterior:'耐火の外壁', fire:'防火設備' };
  m.sheets=[];
  // S2 の依頼（断面）：床・屋根の版の厚さと隣地。厚さ 300 は tools/archdraw/plan/README の『上の段の裏を鉛直 300』に合わせた判断
  m.slab=300;
  m.site.neighbors=[{side:'N', kind:'木造 2 階'},{side:'E', kind:'木造 2 階'},{side:'W', kind:'木造 2 階'}];
  return m;
}

/* ── op ─────────────────────────────────────────────────────────────────── */
function newId(m, kind){ const p=PREFIX[kind]||'E'; const used=new Set(arr(m[kind]).map(o=>o.id)); let i=arr(m[kind]).length+1; while(used.has(p+i)) i++; return p+i; }
function shift(o, kind, dx, dy){
  const P=(p)=>[p[0]+dx, p[1]+dy];
  if(kind==='walls'||kind==='sections'){ o.a=P(o.a); o.b=P(o.b); }
  else if(kind==='stairs') o.origin=P(o.origin);
  else if(kind==='rooms'){ o.polygon=o.polygon.map(P); if(o.label) o.label=P(o.label); }
  else if(kind==='fixtures') o.at=P(o.at);
  else if(kind==='openings') o.at=(o.at||0)+dx;   // 開口は壁に沿って動く（dx＝沿う距離）
  else if(kind==='columns') o.at=P(o.at);
  else if(kind==='voids') o.polygon=arr(o.polygon).map(P);
  else if(kind==='ramps') o.path=arr(o.path).map(P);
  else if(kind==='screens'){ o.a=P(o.a); o.b=P(o.b); }
  else if(kind==='roofs'){ o.polygon=arr(o.polygon).map(P); arr(o.holes).forEach(h=>{ if(h.c) h.c=P(h.c); if(h.polygon) h.polygon=h.polygon.map(P); }); }
}
/* op を 1 つ当て、戻すための op を返す（m は書き換える：呼ぶ側で複製してから） */
function exec(m, op){
  if(!op||!op.type) throw new Error('op に type が無い');
  const t=op.type;
  if(t==='batch'){ const inv=[]; arr(op.ops).forEach(o=>inv.unshift(exec(m,o))); return {type:'batch', ops:inv}; }
  if(t==='sheets') return exec(m, {type:'set', key:'sheets', value:arr(op.sheets)});   // S4 の依頼：シートの丸ごと差し替え
  if(t==='set'){ const old=clone(m[op.key]); if(op.value===undefined) delete m[op.key]; else m[op.key]=clone(op.value); return {type:'set', key:op.key, value:old}; }
  const kind=op.kind; if(KINDS.indexOf(kind)<0) throw new Error('kind が違う：'+kind);
  m[kind]=arr(m[kind]);
  const L=m[kind];
  if(t==='add'){
    const it=clone(op.item)||{}; if(it.id==null||L.some(o=>o.id===it.id)) it.id=newId(m,kind);
    const at=op.index!=null?Math.max(0,Math.min(L.length,op.index)):L.length;
    L.splice(at,0,it); return {type:'remove', kind, id:it.id};
  }
  const i=L.findIndex(o=>o.id===op.id); if(i<0) throw new Error(kind+' '+op.id+' が無い');
  if(t==='remove'){
    const it=L.splice(i,1)[0], inv=[{type:'add', kind, item:it, index:i}];
    if(kind==='walls'){ m.openings=arr(m.openings); for(let j=m.openings.length-1;j>=0;j--){ if(m.openings[j].wall===it.id){ inv.push({type:'add', kind:'openings', item:m.openings[j], index:j}); m.openings.splice(j,1); } } }
    // 戻すときは壁を先に、開口は小さい番号から差し戻す
    const ops=[inv[0]].concat(inv.slice(1).reverse());
    return ops.length===1?ops[0]:{type:'batch', ops};
  }
  if(t==='update'){
    const o=L[i], old={}; Object.keys(op.set||{}).forEach(k=>{ old[k]=clone(o[k]); if(op.set[k]===undefined) delete o[k]; else o[k]=clone(op.set[k]); });
    if(op.set&&op.set.id!=null&&op.set.id!==op.id){ // id を変えたら参照も
      if(kind==='walls') arr(m.openings).forEach(x=>{ if(x.wall===op.id) x.wall=op.set.id; });
    }
    return {type:'update', kind, id:o.id, set:old};
  }
  if(t==='move'){ const dx=+op.dx||0, dy=+op.dy||0; shift(L[i], kind, dx, dy); return {type:'move', kind, id:op.id, dx:-dx, dy:-dy}; }
  throw new Error('op の type が違う：'+t);
}
const HIST=typeof WeakMap!=='undefined'?new WeakMap():null;
function hist(m){ return (HIST&&HIST.get(m))||{past:[], future:[]}; }
function withHist(m, h){ if(HIST) HIST.set(m, h); return m; }
function apply(m, op){
  const n=clone(m), inv=exec(n, op), h=hist(m);
  return withHist(n, {past:h.past.concat([{op:clone(op), inv}]), future:[]});
}
function undo(m){
  const h=hist(m); if(!h.past.length) return m;
  const last=h.past[h.past.length-1], n=clone(m); exec(n, last.inv);
  return withHist(n, {past:h.past.slice(0,-1), future:[last].concat(h.future)});
}
function redo(m){
  const h=hist(m); if(!h.future.length) return m;
  const nx=h.future[0], n=clone(m), inv=exec(n, nx.op);
  return withHist(n, {past:h.past.concat([{op:nx.op, inv}]), future:h.future.slice(1)});
}

/* ── 検算 ───────────────────────────────────────────────────────────────── */
function validate(m){
  const out=[]; const E=(msg,ref)=>out.push({level:'error', msg, ref:ref||null}), Wn=(msg,ref)=>out.push({level:'warn', msg, ref:ref||null});
  if(!m||typeof m!=='object'){ E('モデルが無い'); return out; }
  if(m.version!==1) Wn('version が 1 でない');
  const lv=new Map(arr(m.levels).map(l=>[l.id,l]));
  KINDS.concat(['levels']).forEach(k=>{ const s=new Set(); arr(m[k]).forEach(o=>{ if(!o||o.id==null) E(k+' に id の無いものがある'); else if(s.has(o.id)) E(k+' の id が重なる：'+o.id, o.id); else s.add(o.id); }); });
  ['x','y'].forEach(ax=>{ const g=arr(m.grid&&m.grid[ax]); const s=new Set(); g.forEach(q=>{ if(s.has(q.id)) E('通り芯の符号が重なる：'+q.id, q.id); s.add(q.id); if(num(q.at)==null) E('通り芯 '+q.id+' の位置が無い', q.id); }); });
  arr(m.levels).forEach(l=>{ if(num(l.fl)==null) E('階 '+l.id+' の FL が無い', l.id); if(!(l.height>0)) E('階 '+l.id+' の階高が無い', l.id); });
  const walls=new Map(arr(m.walls).map(w=>[w.id,w]));
  arr(m.walls).forEach(w=>{
    if(!lv.has(w.level)) E('壁 '+w.id+' の階 '+w.level+' が無い', w.id);
    if(!w.a||!w.b||Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1])<1) E('壁 '+w.id+' の長さが 0', w.id);
    if(!(w.t>0)) E('壁 '+w.id+' の厚さが 0 以下', w.id);
    if(['exterior','partition','fire'].indexOf(w.kind)<0) Wn('壁 '+w.id+' の種類が無い（exterior|partition|fire）', w.id);
    if(w.curve){ const c=w.curve;
      if(!c.c||num(c.c[0])==null||num(c.c[1])==null||!(c.r>0)||num(c.a0)==null||num(c.a1)==null||Math.abs(c.a1-c.a0)<1e-6) E('曲面壁 '+w.id+' の curve（c・r・a0・a1）が無い', w.id);
      else { if(Math.abs(c.a1-c.a0)>360) E('曲面壁 '+w.id+' の角度が 360° を超える', w.id);
        if(w.a&&w.b){ const pa=[c.c[0]+c.r*Math.cos(c.a0*DEG), c.c[1]+c.r*Math.sin(c.a0*DEG)], pb=[c.c[0]+c.r*Math.cos(c.a1*DEG), c.c[1]+c.r*Math.sin(c.a1*DEG)];
          if(Math.hypot(pa[0]-w.a[0],pa[1]-w.a[1])>5||Math.hypot(pb[0]-w.b[0],pb[1]-w.b[1])>5) Wn('曲面壁 '+w.id+' の a・b が弧の端（a0・a1）と 5 mm 以上ずれる', w.id); }
        if(c.r<=w.t/2) E('曲面壁 '+w.id+' の半径が厚さの半分以下', w.id); } }
  });
  // 新しい要素（ELEMENTS.md）
  const colIds=new Set(arr(m.columns).map(c=>c.id));
  const lvAbove=(lo, hi, what, id)=>{ const a=levelFl(m, lo), b=levelFl(m, hi); if(a!=null&&b!=null&&b<=a) E(what+' '+id+' の to（'+hi+'）が '+lo+' より上でない', id); };
  arr(m.columns).forEach(c=>{ if(!c) return;
    if(!lv.has(c.level)) E('柱 '+c.id+' の階 '+c.level+' が無い', c.id);
    if(!c.at||num(c.at[0])==null||num(c.at[1])==null) E('柱 '+c.id+' の位置が無い', c.id);
    if(['rect','round'].indexOf(c.shape)<0) Wn('柱 '+c.id+' の形が無い（rect|round）', c.id);
    if(!(c.w>0)) E('柱 '+c.id+' の幅が 0 以下', c.id); else if(c.shape!=='round'&&!(c.d>0)) E('柱 '+c.id+' の奥行が 0 以下', c.id);
    if(c.from!=null&&!lv.has(c.from)) E('柱 '+c.id+' の from の階が無い', c.id);
    if(c.to!=null){ if(arr(m.roofs).some(r=>r&&r.id===c.to)){ /* 屋根の板まで（日傘の屋根を支える柱など） */ } else if(!lv.has(c.to)) E('柱 '+c.id+' の to の階（または屋根）が無い', c.id); else lvAbove(c.from||c.level, c.to, '柱', c.id); } });
  arr(m.voids).forEach(v=>{ if(!v) return;
    if(!lv.has(v.level)) E('吹抜 '+v.id+' の階 '+v.level+' が無い', v.id);
    const pg=arr(v.polygon); if(pg.length<3||polyArea(pg)<1) E('吹抜 '+v.id+' の形が無い', v.id);
    if(v.to!=null){ if(!lv.has(v.to)) E('吹抜 '+v.id+' の to の階が無い', v.id); else lvAbove(v.level, v.to, '吹抜', v.id); }
    if(v.kind!=null&&['atrium','stairwell','ramp'].indexOf(v.kind)<0) Wn('吹抜 '+v.id+' の種類が違う：'+v.kind, v.id); });
  arr(m.ramps).forEach(r=>{ if(!r) return;
    if(!lv.has(r.level)||!lv.has(r.to)){ E('斜路 '+r.id+' の階が無い（'+r.level+'→'+r.to+'）', r.id); return; }
    if(r.level===r.to) E('斜路 '+r.id+' の level と to が同じ', r.id);
    const g=rampGeom(m, r);
    if(g.segs.length<1) E('斜路 '+r.id+' の path が 2 点未満', r.id);
    if(!(r.width>0)) E('斜路 '+r.id+' の幅が 0 以下', r.id);
    if(g.rise!=null&&g.run>0){ const s=Math.abs(g.rise)/g.run;
      if(isFinite(+r.slope)&&Math.abs(+r.slope-s)>s*0.1+1e-9) Wn('斜路 '+r.id+'：slope '+r.slope+' が rise/run＝'+s.toFixed(4)+' と 10% 以上違う', r.id);
      if(s>1/8+1e-9) Wn('斜路 '+r.id+'：勾配 1:'+(1/s).toFixed(1)+' が 1/8 を超える（建築基準法施行令 26 条）', r.id); } });
  arr(m.screens).forEach(s=>{ if(!s) return;
    if(!lv.has(s.level)) E('ブリーズ・ソレイユ '+s.id+' の階 '+s.level+' が無い', s.id);
    if(!s.a||!s.b||Math.hypot(s.b[0]-s.a[0], s.b[1]-s.a[1])<1) E('ブリーズ・ソレイユ '+s.id+' の長さが 0', s.id);
    if(['vertical','horizontal','eggcrate'].indexOf(s.kind)<0) E('ブリーズ・ソレイユ '+s.id+' の種類が違う：'+s.kind, s.id);
    if(!(s.height>0)) E('ブリーズ・ソレイユ '+s.id+' の高さが 0 以下', s.id);
    if(!(s.depth>0)) E('ブリーズ・ソレイユ '+s.id+' の奥行が 0 以下', s.id);
    if(!(s.pitch>0)) E('ブリーズ・ソレイユ '+s.id+' の間隔が 0 以下', s.id);
    if(!(s.thickness>0)) E('ブリーズ・ソレイユ '+s.id+' の羽根の厚さが 0 以下', s.id); else if(s.pitch>0&&s.thickness>=s.pitch) E('ブリーズ・ソレイユ '+s.id+' の羽根の厚さが間隔以上', s.id);
    if(s.from!=null&&!(s.from>=0)) E('ブリーズ・ソレイユ '+s.id+' の from が負', s.id); });
  arr(m.roofs).forEach(r=>{ if(!r) return;
    if(num(r.fl)==null) E('屋根 '+r.id+' の fl が無い', r.id);
    if(!(r.thickness>0)) E('屋根 '+r.id+' の厚さが 0 以下', r.id);
    const pg=arr(r.polygon); if(pg.length<3||polyArea(pg)<1) E('屋根 '+r.id+' の形が無い', r.id);
    const top=arr(m.levels).reduce((s,l)=>Math.max(s, isFinite(+l.fl)?+l.fl:-Infinity), -Infinity);
    if(num(r.fl)!=null&&isFinite(top)&&+r.fl<top&&!lv.has(r.level)) Wn('屋根 '+r.id+' の fl が最上階の床より低い', r.id);
    arr(r.holes).forEach((h,k)=>{ const ref=r.id+'/'+(k+1);
      if(['ellipse','circle','polygon'].indexOf(h.shape)<0) E('屋根 '+r.id+' の孔 '+(k+1)+' の形が違う：'+h.shape, ref);
      else if(h.shape==='polygon'){ if(arr(h.polygon).length<3) E('屋根 '+r.id+' の孔 '+(k+1)+' の多角形が無い', ref); }
      else { if(!h.c||num(h.c[0])==null||num(h.c[1])==null) E('屋根 '+r.id+' の孔 '+(k+1)+' の中心が無い', ref);
        if(h.shape==='circle'?!((h.r||h.rx)>0):!(h.rx>0&&h.ry>0)) E('屋根 '+r.id+' の孔 '+(k+1)+' の半径が無い', ref); }
      if(pg.length>=3){ const hp=roofHoles({holes:[h]})[0]; if(hp&&hp.length){ const c=polyCentroid(hp); if(!pointIn(pg, c[0], c[1])) Wn('屋根 '+r.id+' の孔 '+(k+1)+' が屋根の外にある', ref); } } });
    arr(r.supports).forEach(id=>{ if(!colIds.has(id)) E('屋根 '+r.id+' の supports の柱 '+id+' が無い', r.id); });
    if(r.shell){ if(['flat','curved'].indexOf(r.shell.kind)<0) Wn('屋根 '+r.id+' の shell.kind が違う：'+r.shell.kind, r.id); if(r.shell.kind==='curved'&&!(r.shell.rise>0)) Wn('屋根 '+r.id+' の曲面の rise が無い（折れ線で近似）', r.id); } });
  const byWall={};
  arr(m.openings).forEach(o=>{
    const w=walls.get(o.wall); if(!w){ E('開口 '+o.id+' の壁 '+o.wall+' が無い', o.id); return; }
    const L=Math.hypot(w.b[0]-w.a[0], w.b[1]-w.a[1]);
    if(!(o.width>0)) E('開口 '+o.id+' の幅が 0 以下', o.id);
    else if(o.at<-0.5||o.at+o.width>L+0.5) E('開口 '+o.id+' が壁 '+w.id+' からはみ出す', o.id);
    if(num(o.sill)!=null&&num(o.head)!=null&&o.sill>=o.head) E('開口 '+o.id+' の下端が上端以上', o.id);
    const l=lv.get(w.level); if(l&&o.head>l.height) Wn('開口 '+o.id+' の上端が階高を超える', o.id);
    if(['door','slide','window','sweep'].indexOf(o.type)<0) E('開口 '+o.id+' の種類が違う：'+o.type, o.id);
    (byWall[o.wall]=byWall[o.wall]||[]).push(o);
  });
  Object.keys(byWall).forEach(k=>{ const L=byWall[k].slice().sort((a,b)=>a.at-b.at); for(let i=0;i+1<L.length;i++) if(L[i].at+L[i].width>L[i+1].at+0.5) E('開口 '+L[i].id+' と '+L[i+1].id+' が重なる', L[i+1].id); });
  arr(m.stairs).forEach(s=>{
    const f=lv.get(s.from), t=lv.get(s.to);
    if(!f||!t){ E('階段 '+s.id+' の階が無い（'+s.from+'→'+s.to+'）', s.id); return; }
    if(!DIRV[s.dir]) E('階段 '+s.id+' の向きが違う：'+s.dir, s.id);
    if(!(s.n>1)||!(s.rise>0)||!(s.tread>0)||!(s.width>0)) { E('階段 '+s.id+' の段・寸法が無い', s.id); return; }
    if(Math.abs(s.rise*s.n-(t.fl-f.fl))>0.5) E('階段 '+s.id+'：蹴上 '+s.rise+'×'+s.n+'＝'+(s.rise*s.n)+' が FL の差 '+(t.fl-f.fl)+' と合わない', s.id);
    const q=2*s.rise+s.tread; if(q<550||q>650) Wn('階段 '+s.id+'：2R＋T＝'+q+'（目安 550〜650）', s.id);
  });
  arr(m.rooms).forEach(r=>{
    if(!lv.has(r.level)) E('室 '+r.id+' の階が無い', r.id);
    const pg=arr(r.polygon); if(pg.length<3||polyArea(pg)<1) E('室 '+(r.name||r.id)+' の形が無い', r.id);
  });
  arr(m.fixtures).forEach(f=>{ if(!lv.has(f.level)) E('家具 '+f.id+' の階が無い', f.id); if(!f.at) E('家具 '+f.id+' の位置が無い', f.id); });
  arr(m.sections).forEach(s=>{ if(!s.a||!s.b||(s.a[0]===s.b[0]&&s.a[1]===s.b[1])) E('断面 '+s.id+' の線が無い', s.id); if(!DIRV[s.look]) Wn('断面 '+s.id+' の見る向きが無い', s.id); });
  // 階ごとの室の面積の和と外壁の芯の囲み（ずれは警告）
  arr(m.levels).forEach(l=>{
    const ex=arr(m.walls).filter(w=>w.level===l.id&&w.kind!=='partition'); if(!ex.length) return;
    const xs=ex.map(w=>[w.a[0],w.b[0]]).flat(), ys=ex.map(w=>[w.a[1],w.b[1]]).flat();
    const gx=arr(m.grid&&m.grid.x).map(g=>g.at), gy=arr(m.grid&&m.grid.y).map(g=>g.at);
    if(!gx.length||!gy.length) return;
    const box=(Math.max(...gx)-Math.min(...gx))*(Math.max(...gy)-Math.min(...gy));
    const sum=arr(m.rooms).filter(r=>r.level===l.id).reduce((s,r)=>s+polyArea(arr(r.polygon)),0);
    if(sum>0&&Math.abs(sum-box)>1e4) Wn('階 '+l.id+' の室の面積の和 '+(sum/1e6).toFixed(2)+' m² が通り芯の囲み '+(box/1e6).toFixed(2)+' m² と違う', l.id);
    void xs; void ys;
  });
  return out;
}

/* ── 面積（壁芯、m²。小数 2 桁） ─────────────────────────────────────────── */
function area(m, level){
  const one=(id)=>{ const rooms={}; let t=0; arr(m.rooms).filter(r=>r.level===id).forEach(r=>{ const raw=polyArea(arr(r.polygon)); rooms[r.id]=+(raw/1e6).toFixed(2); /* Python の round と同じ丸め（7.755→7.75） */ t+=raw; });
    // 吹抜：この階の床から抜ける分（level がこの階、または下の階から to まで貫く）
    let v=0; arr(m.voids).forEach(x=>{ if(x&&arr(x.polygon).length>=3&&coversLevel(m, x, id)) v+=polyArea(x.polygon); });
    return {total:Math.round(t/1e4)/100, rooms, mm2:t, voids:Math.round(v/1e4)/100, net:Math.round((t-v)/1e4)/100}; };
  if(level!=null) return one(level);
  const levels={}; let t=0; arr(m.levels).forEach(l=>{ levels[l.id]=one(l.id); t+=levels[l.id].mm2; });
  const roofs={}; arr(m.roofs).forEach(r=>{ if(!r||arr(r.polygon).length<3) return; let a=polyArea(r.polygon); roofHoles(r).forEach(h=>{ if(h.length>=3) a-=polyArea(h); }); roofs[r.id]=Math.round(a/1e4)/100; });
  return {total:Math.round(t/1e4)/100, levels, roofs};
}

A.model={ create, sample, fromArchdraw, apply, undo, redo,
  canUndo:(m)=>hist(m).past.length>0, canRedo:(m)=>hist(m).future.length>0,
  validate, area, polyArea, polyCentroid, polyBox, pointIn, wallFrame, wallRect, wallQuad, wallPolygon, arcPoints, openingSpan, stairGeom, clone,
  wallJoin, joinEdges, clipBand, clipHalf, simplify, levelFl, nextLevel, coversLevel, columnPolygon, rampGeom, screenGeom, roofHoles, roofFor };
})();
