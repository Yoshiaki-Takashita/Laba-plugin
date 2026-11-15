/* 建築スタジオ：派生図（断面・立面・展開図・アクソメ／分解アクソメ）  担当 S2 → F2（断面・立面・展開）
 * 建物モデル（docs/archstudio/DESIGN.md §2）から SVG 文字列を自動で作る。外部ライブラリなし。
 * 作図の規則は tools/archdraw/{section,elevation,axon} の Python 版（作例 examples/*.png）を移したもの：
 *   切断（太線 0.7 を内側にずらす・1:100 は黒の塗り）と見えがかりの線の段（ISO 128-20・SPEC §2）、
 *   材料の記号（コンクリートの骨材の点・木の対角線・断熱と砕石のジグザグ：IS 962:1989 表 7）、
 *   GL の地盤ハッチ、▽ のレベル記号、寸法の端末（断面は 45° の斜線、立面・展開は黒丸）、通り芯の丸、
 *   線で描く人物（身長 1,700）、路地・後退線・道路中心線・隣地境界・延焼のおそれのある部分の境、南の隣家（灰）、
 *   冬至の南中の日射（強調色 1 つ）、キープラン、建具符号（国交省 作成基準 別表 1）、展開図記号、図題。
 * 公開：window.GnotoArch.views = { section(m,id,opt), elevation(m,dir,opt), interior(m,room,opt), axon(m,opt) } → SVG 文字列
 *   opt：scale（既定 100）、page（'A3' など。無ければ図の大きさ）、title:false（図題なし）、num（図番号）、
 *        recess（1F の前面を後退線からさらに引く寸法。見本の『縁』の形は 1300）、cut（断面の切断線 {a,b,look} の上書き）、
 *        context:false（隣家を描かない）、sun:false（日射を描かない）、table:false（立面の建具の表なし）、notes:false
 */
(function () {
  'use strict';
  var G = window.GnotoArch = window.GnotoArch || {};

  var INK = '#1A1A1A', GRAY = '#8C9493', ACC = '#943522', WHITE = '#FFFFFF';
  var TINT = '#E2E4E4';   // 灰 #8C9493 を白に 25% 重ねた面の色（アクソメの側面。判断）
  var FONT = "'Noto Sans JP','IPAGothic','Helvetica Neue',Arial,sans-serif";
  var TN = 2.0, TR = 2.5, TT = 3.5;   // 文字は 3 段（SPEC §1）
  // 家具・設備の高さ（モデルに無いので判断。tools/archdraw/section と同じ値）
  var FIX_H = { table: 700, desk: 720, counter: 850, vanity: 850, shelf: 1800, shoebox: 900, fridge: 1800,
    tvboard: 450, bench: 420, lowtable: 350, wardrobe: 2000, tub: 550, washer: 1000, bed: 450, sofa: 420,
    toilet: 400, handbasin: 800, hood: 2000 };
  // 床組・屋根・基礎・外壁の層（tools/archdraw/section/defaults.json の値。モデルに無いので判断）
  var CON = { finish: 15, ply: 28, beamW: 105, beamH: 330, beamPitch: 900, ceil: 25,
    deck: 60, roofBeamH: 300, roofIns: 200,
    slabT: 300, blinding: 50, gravel: 150, edgeBottom: -600, stemTop: 400, stemW: 150,
    eaveDrop: 60, copingOver: 20, copingH: 60, layers: [25, 105, 20],
    treadB: 36, riserB: 12, nosing: 20, stringer: 45, stringerD: 380, handrail: 800,
    nbGap: 450, nbEave: 5800, nbPitch: 0.4, nbOver: 450, nbRoofT: 150, nbFL: 450, nbFloor2: 3300, nbDepth: 7280, nbShow: 4250,
    latitude: 35.68, declination: -23.44 };
  var SEQ = 0;

  function sty(s) {
    if (s <= 50) return { cut: 0.7, cutm: 0.35, ground: 0.7, out: 0.5, vis: 0.25, far: 0.18, fine: 0.13, hatch: 0.13, dim: 0.13, tick: 0.25, hidden: 0.18, grid: 0.13, ctx: 0.25, ctxf: 0.18, accent: 0.25, detail: true, poche: false };
    return { cut: 0.5, cutm: 0.25, ground: 0.7, out: 0.5, vis: 0.25, far: 0.18, fine: 0.13, hatch: 0.13, dim: 0.13, tick: 0.25, hidden: 0.18, grid: 0.13, ctx: 0.25, ctxf: 0.18, accent: 0.25, detail: false, poche: true };
  }
  function f2(v) { return (Math.round(v * 100) / 100).toString(); }
  function nfmt(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // 文字の幅：全角 1em・半角 0.55em（IPAGothic は 0.5。Noto を見込んで少し広く。判断）
  function tw(t, size) { var w = 0; t = String(t); for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); w += (c < 0x2E80 || (c >= 0xFF61 && c <= 0xFF9F)) ? size * 0.55 : size; } return w; }
  // 一点鎖線・破線（ISO 128-20 の比。d は 0.25 未満なら 0.25 として長さを決める：細線のすき間が実線に見えないように）
  function chainDash(w) { var d = Math.max(w || 0.13, 0.25); return f2(24 * d) + ' ' + f2(3 * d) + ' ' + f2(0.5 * d) + ' ' + f2(3 * d); }
  function dashDash(w) { var d = Math.max(w || 0.13, 0.25); return f2(12 * d) + ' ' + f2(3 * d); }
  var CHAIN_S = '2 0.6 0.15 0.6';   // 小さい図形の一点鎖線（判断）
  function rng(seed) { var x = seed >>> 0 || 1; return function () { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

  // ---------------------------------------------------------------- SVG（紙の上の mm、範囲を自動で追う）
  function Doc() { this.o = []; this.defs = []; this.b = [1e9, 1e9, -1e9, -1e9]; this.id = 'gav' + (++SEQ) + '_'; this.k = 0; this.texts = []; }
  Doc.prototype.ext = function (x, y) { var b = this.b; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
  Doc.prototype.line = function (x1, y1, x2, y2, w, col, dash) {
    this.ext(x1, y1); this.ext(x2, y2);
    this.o.push('<line x1="' + f2(x1) + '" y1="' + f2(y1) + '" x2="' + f2(x2) + '" y2="' + f2(y2) + '" stroke="' + (col || INK) + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>');
  };
  Doc.prototype.poly = function (pts, w, stroke, fill, open, dash, extra) {
    var s = '', self = this;
    pts.forEach(function (p) { self.ext(p[0], p[1]); s += f2(p[0]) + ',' + f2(p[1]) + ' '; });
    this.o.push('<' + (open ? 'polyline' : 'polygon') + ' points="' + s.trim() + '" stroke="' + (stroke || 'none') + '" stroke-width="' + (w || 0) + '" fill="' + (fill || 'none') + '" stroke-linejoin="' + (extra || 'miter') + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>');
  };
  Doc.prototype.rect = function (x0, y0, x1, y1, w, stroke, fill, dash) {
    this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], w, stroke, fill, false, dash);
  };
  Doc.prototype.fill = function (x0, y0, x1, y1, col) { this.rect(x0, y0, x1, y1, 0, 'none', col || INK); };
  // 切断の輪郭を内側に w/2 ずらして引く（外形の寸法を実寸のまま保つ）。細すぎれば黒く塗る
  Doc.prototype.rectIn = function (x0, y0, x1, y1, w, fill) {
    var a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1), h = w / 2;
    this.rect(a, c, b, d, 0, 'none', fill || WHITE);
    if (b - a < 2.2 * w || d - c < 2.2 * w) { this.rect(a, c, b, d, 0, 'none', INK); return; }
    this.rect(a + h, c + h, b - h, d - h, w, INK, 'none');
  };
  Doc.prototype.circle = function (x, y, r, w, stroke, fill) {
    this.ext(x - r, y - r); this.ext(x + r, y + r);
    this.o.push('<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + f2(r) + '" stroke="' + (stroke || 'none') + '" stroke-width="' + (w || 0) + '" fill="' + (fill || 'none') + '"/>');
  };
  Doc.prototype.dot = function (x, y, r) { this.circle(x, y, r || 0.32, 0, 'none', INK); };
  Doc.prototype.ellipse = function (x, y, rx, ry, w, stroke, fill) {
    this.ext(x - rx, y - ry); this.ext(x + rx, y + ry);
    this.o.push('<ellipse cx="' + f2(x) + '" cy="' + f2(y) + '" rx="' + f2(rx) + '" ry="' + f2(ry) + '" stroke="' + stroke + '" stroke-width="' + w + '" fill="' + (fill || 'none') + '"/>');
  };
  Doc.prototype.text = function (x, y, t, size, anchor, weight, rot, col) {
    var w = tw(t, size), x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    if (rot) { this.ext(x - size, y - w); this.ext(x + size, y + w); this.texts.push([x - size, y - w, x + size, y]); }
    else { this.ext(x0, y - size * 0.85); this.ext(x0 + w, y + size * 0.2); this.texts.push([x0, y - size * 0.85, x0 + w, y + size * 0.2]); }
    this.o.push('<text x="' + f2(x) + '" y="' + f2(y) + '" font-size="' + size + '" text-anchor="' + (anchor || 'start') + '"' +
      (weight && weight !== 400 ? ' font-weight="' + weight + '"' : '') + (rot ? ' transform="rotate(' + rot + ' ' + f2(x) + ' ' + f2(y) + ')"' : '') +
      ' fill="' + (col || INK) + '">' + esc(t) + '</text>');
    return w;
  };
  // 多角形の中を角度 ang・間隔 gap の平行線で塗る（clipPath）
  Doc.prototype.hatch = function (pts, ang, gap, w, col) {
    var id = this.id + 'c' + (this.k++), s = '';
    pts.forEach(function (p) { s += f2(p[0]) + ',' + f2(p[1]) + ' '; });
    this.defs.push('<clipPath id="' + id + '"><polygon points="' + s.trim() + '"/></clipPath>');
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, self = this;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); self.ext(p[0], p[1]); });
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 * 1.5 + 1;
    var a = ang * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a), nx = -dy, ny = dx, out = '';
    // 線の位置は紙の原点からそろえる（隣り合う帯で線が続く）
    var c0 = cx * nx + cy * ny, t0 = Math.floor((c0 - R) / gap) * gap - c0;
    for (var t = t0; t <= R; t += gap) {
      var px = cx + nx * t, py = cy + ny * t;
      out += 'M' + f2(px - dx * R) + ' ' + f2(py - dy * R) + 'L' + f2(px + dx * R) + ' ' + f2(py + dy * R);
    }
    this.o.push('<path clip-path="url(#' + id + ')" d="' + out + '" stroke="' + (col || INK) + '" stroke-width="' + w + '" fill="none"/>');
  };
  // コンクリート：細かい骨材の点（IS 962:1989 表 7）。縁から 0.25 は空ける
  Doc.prototype.stipple = function (x0, y0, x1, y1, density, rnd) {
    var a = Math.min(x0, x1) + 0.25, b = Math.max(x0, x1) - 0.25, c = Math.min(y0, y1) + 0.25, d = Math.max(y0, y1) - 0.25;
    if (b <= a || d <= c) return;
    var n = Math.floor((b - a) * (d - c) * density), rs = [0.09, 0.11, 0.14], out = '';
    for (var i = 0; i < n; i++) out += '<circle cx="' + f2(a + rnd() * (b - a)) + '" cy="' + f2(c + rnd() * (d - c)) + '" r="' + rs[Math.floor(rnd() * 3)] + '"/>';
    this.o.push('<g fill="' + INK + '">' + out + '</g>');
  };
  // 帯の中のジグザグ（断熱材・砕石：IS 962:1989 表 7）。horizontal=true は横長の帯
  Doc.prototype.zigzag = function (x0, y0, x1, y1, w, horizontal) {
    var a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(y0, y1), d = Math.max(y0, y1), pts = [], k = 0;
    if (horizontal) { var p = Math.max((d - c) * 0.9, 1.0); for (var x = a; x <= b + 1e-6; x += p / 2, k++) pts.push([x, k % 2 ? c : d]); if (pts.length && pts[pts.length - 1][0] < b) pts.push([b, pts[pts.length - 1][1] === d ? c : d]); }
    else { var q = Math.max((b - a) * 0.9, 1.0); for (var y = c; y <= d + 1e-6; y += q / 2, k++) pts.push([k % 2 ? b : a, y]); if (pts.length && pts[pts.length - 1][1] < d) pts.push([pts[pts.length - 1][0] === a ? b : a, d]); }
    if (pts.length > 1) this.poly(pts, w, INK, 'none', true, null, 'miter');
  };
  // 語の途中で切らない折り返し（「、」「。」「）」「・」と空白の後ろでだけ）
  function wrapText(text, firstW, w, size) {
    var chunks = [], cur = '';
    for (var i = 0; i < text.length; i++) { var ch = text[i]; cur += ch; if ('、。）・ 　'.indexOf(ch) >= 0) { chunks.push(cur); cur = ''; } }
    if (cur) chunks.push(cur);
    var lines = [], line = '', lim = firstW;
    chunks.forEach(function (c) { if (line && tw(line + c, size) > lim) { lines.push(line.replace(/\s+$/, '')); line = c; lim = w; } else line += c; });
    if (line) lines.push(line.replace(/\s+$/, ''));
    return lines;
  }
  // 図題：「図n　主題（縮尺）。」（3.5、番号は太字）＋ 読み方と出典（2.5）。cap = {num, title, body}
  Doc.prototype.finish = function (opt, cap) {
    var b = this.b.slice(), m = 8;
    if (!isFinite(b[0])) b = [0, 0, 10, 10];
    var body = this.o.join('\n'), capParts = '';
    var pg = null;
    if (opt && opt.page) {
      pg = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594] }[opt.page] || [420, 297];
      if (opt.orient === 'P') pg = [pg[1], pg[0]];
    }
    var X, Y, W, H;
    if (pg) { W = pg[0]; H = pg[1]; X = b[0] - (W - (b[2] - b[0])) / 2; Y = b[1] - (H - (b[3] - b[1])) / 2; }
    else { X = b[0] - m; Y = b[1] - m; W = b[2] - b[0] + 2 * m; H = b[3] - b[1] + 2 * m; }
    if (cap) {
      var mg = pg ? 12 : m, u0 = pg ? X + mg : b[0], uEnd = pg ? X + W - mg : Math.max(b[2], b[0] + 170);
      var head = cap.num != null ? '図' + cap.num : '', u1 = u0 + (head ? tw(head, TT) + 2.0 : 0), t1 = cap.title || '';
      var u2 = u1 + tw(t1, TT) + 0.5, lines = cap.body ? wrapText(cap.body, uEnd - u2, uEnd - u1, TR) : [], lead = 4.2;
      var capH = TT + lead * Math.max(0, lines.length - 1) + 2;
      var v;
      if (pg) { v = Y + H - mg - lead * Math.max(0, lines.length - 1); if (b[3] + 6 > v - TT) { Y = b[1] - (H - (b[3] - b[1]) - capH - 6) / 2; v = Y + H - mg - lead * Math.max(0, lines.length - 1); } else { Y = b[1] - (H - (b[3] - b[1]) - capH - 6) / 2; v = Y + H - mg - lead * Math.max(0, lines.length - 1); } }
      else { v = b[3] + 6 + TT; H += capH + 6; }
      if (head) capParts += '<text x="' + f2(u0) + '" y="' + f2(v) + '" font-size="' + TT + '" font-weight="700">' + esc(head) + '</text>';
      capParts += '<text x="' + f2(u1) + '" y="' + f2(v) + '" font-size="' + TT + '">' + esc(t1) + '</text>';
      lines.forEach(function (ln, i) { capParts += '<text x="' + f2(i === 0 ? u2 : u1) + '" y="' + f2(v + i * lead) + '" font-size="' + TR + '">' + esc(ln) + '</text>'; });
      if (!pg) { var cw = Math.max(u2 + (lines[0] ? tw(lines[0], TR) : 0), u1 + (lines[1] ? tw(lines[1], TR) : 0)) + m; if (cw > X + W) W = cw - X; }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + f2(W) + 'mm" height="' + f2(H) + 'mm" viewBox="' + f2(X) + ' ' + f2(Y) + ' ' + f2(W) + ' ' + f2(H) + '"' +
      ' font-family="' + FONT + '" stroke-linecap="butt" fill="' + INK + '">' +
      '<rect x="' + f2(X) + '" y="' + f2(Y) + '" width="' + f2(W) + '" height="' + f2(H) + '" fill="' + WHITE + '"/>' +
      (this.defs.length ? '<defs>' + this.defs.join('') + '</defs>' : '') + '\n' + body + '\n' + capParts + '</svg>';
  };

  // ---------------------------------------------------------------- モデルの読み取り
  function levels(m) { return (m.levels || []).slice().sort(function (a, b) { return a.fl - b.fl; }); }
  function levelTop(ls, i) { return i < ls.length - 1 ? ls[i + 1].fl : ls[i].fl + (ls[i].height || 2800); }
  function roofZ(m) { var ls = levels(m); return (m.roof && m.roof.fl != null) ? m.roof.fl : (ls.length ? levelTop(ls, ls.length - 1) : 3000); }
  function parapetH(m) { return (m.roof && m.roof.parapet != null) ? m.roof.parapet : 1100; }
  // 天井高：モデルに無ければ階高から（1F 2,400・2F 2,350・3F 2,250 になる値。断面担当の defaults と同じ。判断）
  function chOf(ls, i) { var l = ls[i]; if (l.ch) return l.ch; return Math.min(levelTop(ls, i) - l.fl - 450, 2400); }
  function lvIndex(m, id) { var ls = levels(m); for (var i = 0; i < ls.length; i++) if (ls[i].id === id) return i; return -1; }
  function isExt(w) { return w.kind === 'exterior' || w.kind === 'fire'; }
  function wallGeo(w) {
    var dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, h = (w.t || 150) / 2;
    var nx = -uy, ny = ux;
    return { len: len, u: [ux, uy], n: [nx, ny], t: w.t || 150,
      poly: [[w.a[0] + nx * h, w.a[1] + ny * h], [w.b[0] + nx * h, w.b[1] + ny * h], [w.b[0] - nx * h, w.b[1] - ny * h], [w.a[0] - nx * h, w.a[1] - ny * h]],
      at: function (s) { return [w.a[0] + ux * s, w.a[1] + uy * s]; } };
  }
  function openingsOf(m, w) { return (m.openings || []).filter(function (o) { return o.wall === w.id; }); }
  function bbox(pts) { var b = [1e9, 1e9, -1e9, -1e9]; pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); return b; }
  function footprint(m) {   // 外壁の外形の外接矩形（判断：建物の外形は矩形と見なす）
    var pts = [];
    (m.walls || []).forEach(function (w) { if (isExt(w)) pts = pts.concat(wallGeo(w).poly); });
    if (!pts.length) (m.walls || []).forEach(function (w) { pts = pts.concat(wallGeo(w).poly); });
    var b = bbox(pts.length ? pts : [[0, 0], [1, 1]]);
    return { b: b, poly: [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], c: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] };
  }
  function extT(m) { var t = 0; (m.walls || []).forEach(function (w) { if (isExt(w)) t = Math.max(t, w.t || 150); }); return t || 150; }
  function parT(m) { var t = 0; (m.walls || []).forEach(function (w) { if (!isExt(w)) t = Math.max(t, w.t || 100); }); return t || 100; }
  function outward(w, c) { var g = wallGeo(w), mx = (w.a[0] + w.b[0]) / 2 - c[0], my = (w.a[1] + w.b[1]) / 2 - c[1]; return (mx * g.n[0] + my * g.n[1]) >= 0 ? g.n : [-g.n[0], -g.n[1]]; }
  var DIRV = { N: [0, 1], S: [0, -1], E: [1, 0], W: [-1, 0] };
  var DIRNAME = { N: '北', S: '南', E: '東', W: '西' };
  function dirOf(v) { if (Math.abs(v[0]) > Math.abs(v[1])) return v[0] > 0 ? 'E' : 'W'; return v[1] > 0 ? 'N' : 'S'; }
  function stairSteps(m, st) {   // n 段の蹴上・n-1 段の踏面。各踏面の平面の矩形と上端の高さ
    var ls = levels(m), i0 = lvIndex(m, st.from), z0 = i0 >= 0 ? ls[i0].fl : 0;
    var d = DIRV[st.dir] || [0, 1], p = [d[1], -d[0]], w = st.width || 800, tr = st.tread || 220, ri = st.rise || 200, n = st.n || 15, out = [];
    var side = p;
    for (var i = 0; i < n - 1; i++) {
      var a = [st.origin[0] + d[0] * tr * i, st.origin[1] + d[1] * tr * i], b = [a[0] + d[0] * tr, a[1] + d[1] * tr];
      out.push({ i: i, poly: [a, b, [b[0] + side[0] * w, b[1] + side[1] * w], [a[0] + side[0] * w, a[1] + side[1] * w]], z0: z0 + i * ri, z1: z0 + (i + 1) * ri });
    }
    var full = [st.origin, [st.origin[0] + d[0] * tr * (n - 1), st.origin[1] + d[1] * tr * (n - 1)]];
    full.push([full[1][0] + side[0] * w, full[1][1] + side[1] * w], [full[0][0] + side[0] * w, full[0][1] + side[1] * w]);
    return { steps: out, z0: z0, rise: ri, tread: tr, n: n, w: w, d: d, side: side, full: full, top: z0 + n * ri, run: tr * (n - 1) };
  }
  function fixturePoly(f) {
    var a = (f.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), w = (f.w || 600) / 2, d = (f.d || 600) / 2;
    return [[-w, -d], [w, -d], [w, d], [-w, d]].map(function (p) { return [f.at[0] + p[0] * c - p[1] * s, f.at[1] + p[0] * s + p[1] * c]; });
  }
  function roomsOf(m, levelId) { return (m.rooms || []).filter(function (r) { return r.level === levelId; }); }
  function pointInPoly(x, y, poly) {
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  // 敷地の道路：edge は多角形の辺の番号か N/E/S/W。{mid, dir, side}
  function roadEdge(site, r) {
    var poly = site.polygon && site.polygon.length >= 3 ? site.polygon : null;
    if (typeof r.edge === 'number' && poly) {
      var a = poly[r.edge % poly.length], b = poly[(r.edge + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      var c = bbox(poly), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return { mid: mid, dir: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], side: dirOf([mid[0] - (c[0] + c[2]) / 2, mid[1] - (c[1] + c[3]) / 2]) };
    }
    if (typeof r.edge === 'string' && DIRV[r.edge]) {
      var bb = poly ? bbox(poly) : null; if (!bb) return null;
      var d = DIRV[r.edge], md = [(bb[0] + bb[2]) / 2 + d[0] * (bb[2] - bb[0]) / 2, (bb[1] + bb[3]) / 2 + d[1] * (bb[3] - bb[1]) / 2];
      return { mid: md, dir: [d[1], -d[0]], side: r.edge };
    }
    return null;
  }
  // 建具符号（国交省 作成基準 別表 1）：同じ形・寸法は同じ番号。AD＝戸（シャッター付きの店の戸・外部の戸）、AW＝窓
  function doorTags(m) {
    var ls = levels(m), fp = footprint(m), map = {}, keys = {}, nAD = 0, nAW = 0, order = { S: 0, N: 1, E: 2, W: 3 };
    var list = [];
    (m.walls || []).forEach(function (w) {
      if (!isExt(w)) return;
      var side = dirOf(outward(w, fp.c)), g = wallGeo(w);
      openingsOf(m, w).forEach(function (o) { var p = g.at(o.at); list.push({ o: o, side: side, lv: lvIndex(m, w.level), u: p[0] + p[1] }); });
    });
    list.sort(function (a, b) { return (order[a.side] - order[b.side]) || (a.lv - b.lv) || (a.u - b.u); });
    list.forEach(function (it) {
      var o = it.o, kind = (o.shutter || o.type === 'door') ? 'AD' : 'AW', key = kind + '|' + o.width + '|' + (o.head - (o.sill || 0)) + '|' + (o.panels || 0) + '|' + (o.shutter ? 1 : 0);
      if (!keys[key]) keys[key] = kind + '-' + (kind === 'AD' ? ++nAD : ++nAW);
      map[o.id] = keys[key];
    });
    return map;
  }
  function glassOf(o, front) { return o.fire ? (front ? '網入り透明' : '網入り型板') : '透明'; }
  function kindJa(o) {
    var n = o.panels || (o.type === 'door' ? 1 : 2);
    if (o.shutter) return n + ' 枚引違い戸＋防火シャッター';
    if (o.type === 'door') return '開き戸';
    if (n >= 4) return n + ' 枚引違い';
    if (o.type === 'fix') return 'FIX';
    return '引違い';
  }

  // ---------------------------------------------------------------- 新要素（docs/archstudio/ELEMENTS.md）の読み取り
  function arr(x) { return Array.isArray(x) ? x : []; }
  function num(v, d) { var n = +v; return isFinite(n) ? n : d; }
  function rcOf(m) { return /RC|鉄筋|コンクリート|concrete/i.test(String(m.structure || '') + ' ' + String(m.materials && m.materials.structure || '')); }
  function roofsOf(m) { return arr(m.roofs).filter(function (r) { return r && isFinite(+r.fl) && arr(r.polygon).length >= 3; }); }
  function columnsOf(m) { return arr(m.columns).filter(function (c) { return c && c.at && isFinite(+c.at[0]) && isFinite(+c.at[1]); }); }
  function voidsOf(m) { return arr(m.voids).filter(function (v) { return v && arr(v.polygon).length >= 3; }); }
  function rampsOf(m) { return arr(m.ramps).filter(function (r) { return r && arr(r.path).length >= 2 && isFinite(+r.width); }); }
  function screensOf(m) { return arr(m.screens).filter(function (s) { return s && s.a && s.b && isFinite(+s.height) && isFinite(+s.depth); }); }
  // 最上階が屋上テラス（roof.fl が最上階の床と同じ）か
  function roofIsLevel(m) { var ls = levels(m); return ls.length > 0 && Math.abs(roofZ(m) - ls[ls.length - 1].fl) < 1; }
  // 最高高さ：パラペットの天端と屋根の板の上端の高い方
  function topZ(m) { var t = roofZ(m) + parapetH(m); roofsOf(m).forEach(function (r) { t = Math.max(t, +r.fl + (r.shell && r.shell.kind === 'curved' ? num(r.shell.rise, 0) : 0)); }); return t; }
  function levelById(m, id) { return levels(m).filter(function (l) { return l.id === id; })[0] || null; }
  // 柱の下端・上端（GL から）。to が階なら床、屋根の id か roofs.supports なら屋根の板の下端。無ければ次の階の床
  function columnZ(m, c) {
    var ls = levels(m), i = lvIndex(m, c.level); if (i < 0) return null;
    var from = c.from != null ? levelById(m, c.from) : null, z0 = from ? from.fl : ls[i].fl, z1 = null, rf;
    if (c.to != null) { var to = levelById(m, c.to); if (to) z1 = to.fl; else { rf = roofsOf(m).filter(function (r) { return r.id === c.to; })[0]; if (rf) z1 = +rf.fl - num(rf.thickness, 300); } }
    if (z1 == null) { rf = roofsOf(m).filter(function (r) { return arr(r.supports).indexOf(c.id) >= 0; })[0]; if (rf) z1 = +rf.fl - num(rf.thickness, 300); }
    if (z1 == null) z1 = i + 1 < ls.length ? ls[i + 1].fl : (roofZ(m) > ls[i].fl + 1 ? roofZ(m) - num(m.slab, 300) : ls[i].fl + (ls[i].height || 2800));
    return z1 > z0 ? [z0, z1] : null;
  }
  function columnPoly(c) {
    var w = num(c.w, 400), d = num(c.d, w), x = +c.at[0], y = +c.at[1], pts = [];
    if (c.shape === 'round') { for (var i = 0; i < 12; i++) pts.push([x + w / 2 * Math.cos(i * Math.PI / 6), y + w / 2 * Math.sin(i * Math.PI / 6)]); return pts; }
    return [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]];
  }
  // 屋根の孔：楕円・円は 32 角形に
  function holePoly(h) {
    if (!h) return null;
    if (arr(h.polygon).length >= 3) return h.polygon.map(function (p) { return [+p[0], +p[1]]; });
    if (h.c && (isFinite(+h.rx) || isFinite(+h.r))) { var rx = isFinite(+h.rx) ? +h.rx : +h.r, ry = isFinite(+h.ry) ? +h.ry : rx, rot = num(h.rot, 0) * Math.PI / 180, pts = []; for (var i = 0; i < 32; i++) { var t = i * Math.PI / 16, x = rx * Math.cos(t), y = ry * Math.sin(t); pts.push([+h.c[0] + x * Math.cos(rot) - y * Math.sin(rot), +h.c[1] + x * Math.sin(rot) + y * Math.cos(rot)]); } return pts; }
    return null;
  }
  // 階 id の床を抜く吹抜：その階の voids と、下の階から to（その床は残す）まで抜ける voids の多角形
  function voidPolysAt(m, levelId) {
    var l = levelById(m, levelId); if (!l) return [];
    return voidsOf(m).filter(function (v) { if (v.level === levelId) return true; var a = levelById(m, v.level), b = v.to != null ? levelById(m, v.to) : null; return a && b && a.fl < l.fl && l.fl < b.fl; }).map(function (v) { return v.polygon.map(function (p) { return [+p[0], +p[1]]; }); });
  }
  // 壁の接合：model.wallJoin(m, level) があればそれ（S-A）。無ければここだけの仮の実装（archstudio-axon.js と同じ規則）：
  // 端点が他の壁の芯に乗る壁は、L 形なら id の小さい方を相手の厚さの半分だけ伸ばし、大きい方を相手の面まで縮める。T 形なら相手の面で止める
  function joinedWalls(m, level) {
    var MD = (window.GnotoArchStudio || window.GnotoArch || {}).model;
    if (MD && typeof MD.wallJoin === 'function') {
      try { var r = MD.wallJoin(m, level); if (Array.isArray(r) && r.length) return r.map(function (x) { var w = x.w || x.wall || arr(m.walls).filter(function (q) { return q.id === (x.id || x.wall); })[0], poly = x.poly || x.polygon; if (!w || !poly || poly.length < 3) return null; var g = wallGeo(w), lo = 1e18, hi = -1e18; poly.forEach(function (p) { var t = (p[0] - w.a[0]) * g.u[0] + (p[1] - w.a[1]) * g.u[1]; lo = Math.min(lo, t); hi = Math.max(hi, t); }); return { id: w.id, w: w, poly: poly, s0: num(x.s0, lo), s1: num(x.s1, hi) }; }).filter(Boolean); } catch (e) { /* 仮の実装へ */ }
    }
    var ws = arr(m.walls).filter(function (w) { return w && w.a && w.b && (level == null || w.level === level) && !w.column && isFinite(+w.a[0]) && isFinite(+w.b[0]); });
    return ws.map(function (w) {
      var g = wallGeo(w), t = num(w.t, 150), s0 = 0, s1 = g.len;
      [[w.a, -1], [w.b, 1]].forEach(function (pe) {
        var Pt = pe[0], end = pe[1];
        for (var k = 0; k < ws.length; k++) {
          var q = ws[k]; if (q === w) continue; var gq = wallGeo(q), tq = num(q.t, 150);
          if (Math.abs(g.u[0] * gq.u[0] + g.u[1] * gq.u[1]) > 0.95) continue;
          var dn = Math.abs((Pt[0] - q.a[0]) * gq.n[0] + (Pt[1] - q.a[1]) * gq.n[1]), ds = (Pt[0] - q.a[0]) * gq.u[0] + (Pt[1] - q.a[1]) * gq.u[1];
          if (dn > tq / 2 + 1 || ds < -t / 2 - 1 || ds > gq.len + t / 2 + 1) continue;
          var atEnd = ds < t / 2 + 1 || ds > gq.len - t / 2 - 1, cosA = Math.abs(g.u[0] * gq.n[0] + g.u[1] * gq.n[1]), kk = cosA > 1e-6 ? 1 / cosA : 1;
          var d = atEnd ? ((String(w.id) < String(q.id)) ? tq / 2 * kk : -(tq / 2) * kk) : -(tq / 2) * kk;
          if (end < 0) s0 = Math.max(s0 - d, -tq); else s1 = Math.min(s1 + d, g.len + tq);
          break;
        }
      });
      if (s1 - s0 < 1) { s0 = 0; s1 = g.len; }
      var h = t / 2, p0 = g.at(s0), p1 = g.at(s1);
      return { id: w.id, w: w, s0: s0, s1: s1, poly: [[p0[0] + g.n[0] * h, p0[1] + g.n[1] * h], [p1[0] + g.n[0] * h, p1[1] + g.n[1] * h], [p1[0] - g.n[0] * h, p1[1] - g.n[1] * h], [p0[0] - g.n[0] * h, p0[1] - g.n[1] * h]] };
    });
  }
  // 斜路の中心線に沿う高さ：path の長さの比で level→to（返り値 {segs:[{p,q,za,zb,u,n,L}], z0, z1}）
  function rampGeo(m, r) {
    var a = levelById(m, r.level), b = levelById(m, r.to); if (!a || !b) return null;
    var path = r.path.map(function (p) { return [+p[0], +p[1]]; }), total = 0, i, segs = [], s = 0;
    for (i = 0; i + 1 < path.length; i++) total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    if (!(total > 1)) return null;
    for (i = 0; i + 1 < path.length; i++) { var p = path[i], q = path[i + 1], L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; segs.push({ p: p, q: q, L: L, u: u, n: [-u[1], u[0]], za: a.fl + (b.fl - a.fl) * s / total, zb: a.fl + (b.fl - a.fl) * (s + L) / total }); s += L; }
    return { segs: segs, z0: a.fl, z1: b.fl, W: +r.width, T: num(r.thickness, 200) };
  }
  // ブリーズ・ソレイユの幾何：{a,b,u,n(外向き),L,z0,z1,depth,t,pitch,fins:[s...],rows:[z...]}
  function screenGeo(m, s, center) {
    var l = levelById(m, s.level); if (!l) return null;
    var a = [+s.a[0], +s.a[1]], b = [+s.b[0], +s.b[1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (!(L > 1)) return null;
    var u = [dx / L, dy / L], n = [-u[1], u[0]], mid = [(a[0] + b[0]) / 2 - center[0], (a[1] + b[1]) / 2 - center[1]];
    if (mid[0] * n[0] + mid[1] * n[1] < 0) n = [-n[0], -n[1]];
    var depth = +s.depth, t = num(s.thickness, 100), pitch = num(s.pitch, 1000), z0 = l.fl + num(s.from, 0), H = +s.height, kind = s.kind || 'vertical', fins = [], rows = [];
    if (!(depth > 0 && H > 0 && pitch > 0)) return null;
    if (kind === 'vertical' || kind === 'eggcrate') { for (var sx = 0; sx <= L - t + 1; sx += pitch) fins.push(Math.max(0, Math.min(sx, L - t))); if (L - fins[fins.length - 1] > t + 1) fins.push(L - t); }
    if (kind === 'horizontal' || kind === 'eggcrate') { var hp = isFinite(+s.hpitch) ? +s.hpitch : (kind === 'horizontal' ? pitch : H); for (var z = z0; z < z0 + H - t - 1; z += hp) rows.push(z); rows.push(z0 + H - t); }
    return { a: a, b: b, u: u, n: n, L: L, z0: z0, z1: z0 + H, depth: depth, t: t, pitch: pitch, fins: fins, rows: rows, kind: kind, at: function (sx, d) { return [a[0] + u[0] * sx + n[0] * d, a[1] + u[1] * sx + n[1] * d]; } };
  }

  // 多角形と切断線（d=0）の交わり：u の区間の列
  function cutIntervals(poly, wu, wd) {
    var xs = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i], q = poly[(i + 1) % poly.length], dp = wd(p), dq = wd(q);
      if ((dp < 0) !== (dq < 0)) { var t = dp / (dp - dq); xs.push(wu(p) + (wu(q) - wu(p)) * t); }
    }
    xs.sort(function (a, b) { return a - b; });
    var out = []; for (var j = 0; j + 1 < xs.length; j += 2) if (xs[j + 1] - xs[j] > 1e-6) out.push([xs[j], xs[j + 1]]);
    return out;
  }
  function subtract(span, holes) {
    var res = [[Math.min(span[0], span[1]), Math.max(span[0], span[1])]];
    holes.forEach(function (h0) {
      var h = [Math.min(h0[0], h0[1]), Math.max(h0[0], h0[1])], nx = [];
      res.forEach(function (s) {
        if (h[1] <= s[0] || h[0] >= s[1]) { nx.push(s); return; }
        if (h[0] > s[0]) nx.push([s[0], h[0]]);
        if (h[1] < s[1]) nx.push([h[1], s[1]]);
      });
      res = nx;
    });
    return res.filter(function (s) { return s[1] - s[0] > 1; });
  }

  // ---------------------------------------------------------------- 共通の記号
  function person(doc, X, V, gl, s, st, flip, h) {   // 正面の立ち姿（tools/archdraw/section の輪郭）
    var k = (h || 1700) / 1700, sx = flip ? -1 : 1;
    var half = [[22, 0], [128, 0], [130, 45], [112, 110], [124, 470], [138, 800], [150, 930], [138, 1060], [150, 1250], [166, 1300],
      [178, 1250], [196, 1040], [206, 860], [214, 790], [200, 760], [182, 790], [176, 1000], [172, 1150], [164, 1340], [170, 1395],
      [128, 1430], [52, 1450], [44, 1480]];
    var left = half.slice().reverse().map(function (p) { return [-p[0], p[1]]; });
    var pts = [[0, 820]].concat(half, left, [[-22, 0]]).map(function (p) { return [X + sx * p[0] * k / s, V(gl + p[1] * k)]; });
    doc.poly(pts, st.far, INK, WHITE, false, null, 'round');
    doc.ellipse(X, V(gl + 1585 * k), 92 * k / s, 112 * k / s, st.far, INK, WHITE);
  }
  // ▽ のレベル記号：頂点を線に当て、名前（太字）と高さを ▽ の右（dir=-1 なら左）に
  function levelMark(doc, st, y, xFrom, xTri, name, val, dir, below) {
    dir = dir || 1;
    doc.line(xFrom, y, xTri + dir * (dir > 0 ? 1.6 : 9.0), y, st.fine);
    var a = 1.0;
    doc.poly([[xTri, y], [xTri - a, y - 1.6 * a], [xTri + a, y - 1.6 * a]], st.far, INK, WHITE);
    var ty = below ? y + TN + 0.4 : y - 0.7;
    if (dir > 0) {
      var x = xTri + 1.6;
      doc.text(x, ty, name, TN, 'start', 700);
      if (val) doc.text(x + tw(name, TN) + 1.0, ty, val, TN, 'start');
    } else {
      var xe = xTri - 1.6, w = val ? doc.text(xe, ty, val, TN, 'end') : 0;
      doc.text(xe - w - (val ? 1.0 : 0), ty, name, TN, 'end', 700);
    }
  }
  function tick(doc, st, x, y) { var a = 0.9; doc.line(x - a, y + a, x + a, y - a, st.tick); }
  // 水平の寸法の連続（xs：紙、vals：実寸）。end：'tick'（断面）か 'dot'（立面・展開）。below：数字を線の下に
  function dimH(doc, st, xs, vals, y, extFrom, end, below, texts) {
    var idx = xs.map(function (_, i) { return i; }).sort(function (a, b) { return xs[a] - xs[b]; });
    xs = idx.map(function (i) { return xs[i]; }); vals = idx.map(function (i) { return vals[i]; });
    var lo = xs[0], hi = xs[xs.length - 1];
    doc.line(lo, y, hi, y, st.dim);
    xs.forEach(function (x, i) {
      if (extFrom != null) { var e = Array.isArray(extFrom) ? extFrom[idx[i]] : extFrom; if (e != null) doc.line(x, e + (e < y ? 0.8 : -0.8), x, y + (e < y ? 1.2 : -1.2), st.dim); }
      if (end === 'dot') doc.dot(x, y); else tick(doc, st, x, y);
    });
    var prevAlt = false;
    for (var i = 0; i + 1 < xs.length; i++) {
      var t = texts ? texts[i] : nfmt(Math.abs(vals[i + 1] - vals[i])), a = xs[i], b = xs[i + 1], w = tw(t, TN), cx = (a + b) / 2, bl = !!below;
      if (w + 0.6 > b - a) {
        if (prevAlt) bl = !bl;
        prevAlt = !prevAlt;
        if (i === 0 && xs.length > 2) cx = a - w / 2 - 0.8; else if (i === xs.length - 2 && xs.length > 2) cx = b + w / 2 + 0.8;
      } else prevAlt = false;
      doc.text(cx, bl ? y + TN + 0.5 : y - 0.7, t, TN, 'middle');
    }
  }
  // 縦の寸法の連続。数字は図の右から読む向き（-90°）で寸法線の左（right=true なら右）に
  function dimV(doc, st, ys, vals, x, extFrom, end, right, texts) {
    var idx = ys.map(function (_, i) { return i; }).sort(function (a, b) { return ys[b] - ys[a]; });   // 下から上
    ys = idx.map(function (i) { return ys[i]; }); vals = idx.map(function (i) { return vals[i]; });
    doc.line(x, ys[0], x, ys[ys.length - 1], st.dim);
    ys.forEach(function (y, i) {
      if (extFrom != null) { var e = Array.isArray(extFrom) ? extFrom[idx[i]] : extFrom; if (e != null) doc.line(e + (e < x ? 0.8 : -0.8), y, x + (e < x ? 1.2 : -1.2), y, st.dim); }
      if (end === 'dot') doc.dot(x, y); else tick(doc, st, x, y);
    });
    var prevAlt = false;
    for (var i = 0; i + 1 < ys.length; i++) {
      var t = texts ? texts[i] : nfmt(Math.abs(vals[i + 1] - vals[i])), a = ys[i], b = ys[i + 1], w = tw(t, TN), cy = (a + b) / 2, lf = !right;
      if (w + 0.6 > a - b) {
        if (prevAlt) lf = !lf;
        prevAlt = !prevAlt;
        if (i === 0 && ys.length > 2) cy = a + w / 2 + 0.8; else if (i === ys.length - 2 && ys.length > 2) cy = b - w / 2 - 0.8;
      } else prevAlt = false;
      doc.text(lf ? x - 0.7 : x + TN + 0.5, cy, t, TN, 'middle', 400, -90);
    }
  }
  function bubble(doc, st, x, y, id, r) { r = r || 2.6; doc.circle(x, y, r, st.far, INK, WHITE); doc.text(x, y + 0.75, id, TN * 0.95, 'middle'); }
  // スケールバー：実寸の目盛り（黒白の帯 1.1mm、下に数字）。meters：全長 m、step：目盛 m
  function scaleBar(doc, st, x, y, s, meters, step) {
    var unit = 1000 / s, n = Math.round(meters / step);
    for (var i = 0; i < n; i++) doc.rect(x + i * step * unit, y, x + (i + 1) * step * unit, y + 1.1, st.fine, INK, i % 2 ? WHITE : INK);
    for (var j = 0; j <= n; j++) { var v = j * step, t = (Math.round(v * 10) / 10).toString(); doc.text(x + j * step * unit, y + 1.1 + 2.6, j === n ? t + ' m' : t, TN, j === n ? 'start' : 'middle'); }
    return n * step * unit;
  }
  function scaleBarDefault(doc, st, x, y, s) { if (s <= 50) return scaleBar(doc, st, x, y, s, 5, 1); return scaleBar(doc, st, x, y, s, 10, 2); }
  // 地盤：GL の太線と、その下に一定の深さのハッチの帯（IS 962 13.4：広い面は縁の近くだけ）
  function earth(doc, st, x0, x1, y, band, skip, pitch) {
    var a = Math.min(x0, x1), b = Math.max(x0, x1);
    subtract([a, b], skip || []).forEach(function (sg) { doc.hatch([[sg[0], y], [sg[1], y], [sg[1], y + band], [sg[0], y + band]], 45, pitch || 0.9, st.hatch); });
    doc.line(a, y, b, y, st.ground);
  }
  function breakLineV(doc, x, yTop, yBot, col, w, ym) {
    var a = 1.6, b = 1.0; ym = ym == null ? (yTop + yBot) / 2 : ym;
    doc.poly([[x, yTop], [x, ym - a], [x + b, ym - a / 3], [x - b, ym + a / 3], [x, ym + a], [x, yBot]], w, col, 'none', true, null, 'miter');
  }
  // 引出線：target から elbow まで斜め、そこから水平に文字（文字は線の上）
  function leader(doc, st, target, elbow, text, anchor, dot) {
    if (dot !== false) doc.dot(target[0], target[1], 0.3);
    doc.line(target[0], target[1], elbow[0], elbow[1], st.fine);
    var w = tw(text, TN);
    if (anchor === 'end') { doc.line(elbow[0], elbow[1], elbow[0] - w - 0.6, elbow[1], st.fine); doc.text(elbow[0] - 0.3, elbow[1] - 0.6, text, TN, 'end'); }
    else { doc.line(elbow[0], elbow[1], elbow[0] + w + 0.6, elbow[1], st.fine); doc.text(elbow[0] + 0.3, elbow[1] - 0.6, text, TN, 'start'); }
  }
  // 注記を 1 列にそろえる（左端を共通の縦線に）。notes：[{p:[x,y], t}]
  function placeNotes(doc, st, notes, colX, yMin, yMax, gap, anchor) {
    var items = notes.slice().sort(function (a, b) { return a.p[1] - b.p[1]; }), ys = [];
    items.forEach(function (n) { var y = Math.max(n.p[1], ys.length ? ys[ys.length - 1] + gap : yMin); ys.push(y); });
    if (ys.length && ys[ys.length - 1] > yMax) { ys[ys.length - 1] = yMax; for (var i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - gap); }
    items.forEach(function (n, i) { leader(doc, st, n.p, [colX, ys[i]], n.t, anchor || 'start'); });
  }
  // 建具符号：丸を横線で上下に分け、上に整理番号、下に略号
  function doorTag(doc, st, cx, cy, tag, r) {
    r = r || 3.0;
    var kv = tag.split('-'), kind = kv[0], num = kv[1] || '';
    doc.circle(cx, cy, r, 0, 'none', WHITE);
    doc.circle(cx, cy, r, st.fine, INK, 'none');
    doc.line(cx - r, cy, cx + r, cy, st.fine);
    doc.text(cx, cy - 0.55, num, TN, 'middle');
    doc.text(cx, cy + 2.05, kind, kind.length > 2 ? TN * 0.9 : TN, 'middle');
  }
  // 展開図記号：円と上下左右の短い線、外に A〜D（上から時計回り）
  function unfoldSymbol(doc, st, cx, cy, r, letters) {
    letters = letters || ['A', 'B', 'C', 'D']; r = r || 4.2;
    doc.circle(cx, cy, r, st.vis, INK, 'none');
    var tin = r - 1.1, tout = r + 1.1;
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d) { doc.line(cx + d[0] * tin, cy + d[1] * tin, cx + d[0] * tout, cy + d[1] * tout, st.vis); });
    var off = r + 2.4;
    doc.text(cx, cy - off - 0.2, letters[0], TR, 'middle', 700);
    doc.text(cx + off + 0.3, cy + 0.9, letters[1], TR, 'start', 700);
    doc.text(cx, cy + off + 2.0, letters[2], TR, 'middle', 700);
    doc.text(cx - off - 0.3, cy + 0.9, letters[3], TR, 'end', 700);
  }
  function northArrow(doc, st, cx, cy, len) {
    len = len || 9.0; var y0 = cy + len / 2, y1 = cy - len / 2;
    doc.line(cx, y0, cx, y1, st.vis);
    doc.poly([[cx - 1.2, y1 + 2.0], [cx, y1], [cx + 1.2, y1 + 2.0]], st.vis, INK, INK);
    doc.text(cx, y1 - 1.0, 'N', TR, 'middle');
  }
  // 表：表題を上に（「表n　題」）、横罫 3 本、縦罫なし、見出しは太字
  function table(doc, st, x, y, num, title, header, rows, colW) {
    var w0 = doc.text(x, y, num != null ? '表' + num : '', TR, 'start', 700);
    doc.text(x + w0 + 2.0, y, title, TR, 'start');
    var y0 = y + 2.2, total = colW.reduce(function (a, b) { return a + b; }, 0), rh = TN * 1.9;
    doc.line(x, y0, x + total, y0, st.vis);
    var cx = x; header.forEach(function (c, i) { doc.text(cx + 0.8, y0 + rh - 1.2, c, TN, 'start', 700); cx += colW[i]; });
    var y1 = y0 + rh + 0.4; doc.line(x, y1, x + total, y1, st.fine);
    var yy = y1;
    rows.forEach(function (r) { var cx2 = x; r.forEach(function (c, i) { doc.text(cx2 + 0.8, yy + rh - 1.0, c, TN, 'start'); cx2 += colW[i]; }); yy += rh; });
    doc.line(x, yy + 0.6, x + total, yy + 0.6, st.vis);
    return yy + 0.6;
  }

  // 材料の記号（1:50）。1:100 は黒の塗り＝ポシェ
  function matTimber(doc, st, x0, y0, x1, y1, w) {   // 構造材の木口：輪郭に対角線 2 本
    if (st.poche) { doc.fill(x0, y0, x1, y1, INK); return; }
    doc.rect(x0, y0, x1, y1, 0, 'none', WHITE);
    doc.line(x0, y0, x1, y1, st.hatch); doc.line(x0, y1, x1, y0, st.hatch);
    doc.rect(x0, y0, x1, y1, w || st.cutm, INK, 'none');
  }
  function matConcrete(doc, st, x0, y0, x1, y1, rnd) {
    if (st.poche) { doc.fill(x0, y0, x1, y1, INK); return; }
    doc.rect(x0, y0, x1, y1, 0, 'none', WHITE);
    doc.stipple(x0, y0, x1, y1, 0.9, rnd);
    doc.rectIn(x0, y0, x1, y1, st.cut, 'none');
  }
  function matConcretePoly(doc, st, pts, rnd) {   // 任意の多角形（基礎）
    var b = bbox(pts);
    if (st.poche) { doc.poly(pts, 0, 'none', INK); return; }
    doc.poly(pts, 0, 'none', WHITE);
    var id = doc.id + 'c' + (doc.k++), s = ''; pts.forEach(function (p) { s += f2(p[0]) + ',' + f2(p[1]) + ' '; });
    doc.defs.push('<clipPath id="' + id + '"><polygon points="' + s.trim() + '"/></clipPath>');
    var n = Math.floor((b[2] - b[0]) * (b[3] - b[1]) * 0.9), rs = [0.09, 0.11, 0.14], out = '';
    for (var i = 0; i < n; i++) { var x = b[0] + rnd() * (b[2] - b[0]), y = b[1] + rnd() * (b[3] - b[1]); if (pointInPoly(x, y, pts)) out += '<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + rs[Math.floor(rnd() * 3)] + '"/>'; }
    doc.o.push('<g clip-path="url(#' + id + ')" fill="' + INK + '">' + out + '</g>');
    doc.poly(insetPoly(pts, st.cut / 2) || pts, st.cut, INK, 'none');
  }
  function insetPoly(pts, d) {   // 多角形を内側へ d だけ縮める（留めの角）
    var q = [], n;
    pts.forEach(function (p) { if (!q.length || Math.abs(p[0] - q[q.length - 1][0]) > 1e-9 || Math.abs(p[1] - q[q.length - 1][1]) > 1e-9) q.push(p); });
    n = q.length; if (n < 3) return null;
    var A = 0; for (var i = 0; i < n; i++) A += q[i][0] * q[(i + 1) % n][1] - q[(i + 1) % n][0] * q[i][1];
    var sg = A > 0 ? 1 : -1;
    function nrm(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [-dy / L * sg, dx / L * sg]; }
    var out = [];
    for (var j = 0; j < n; j++) {
      var n1 = nrm(q[(j - 1 + n) % n], q[j]), n2 = nrm(q[j], q[(j + 1) % n]), k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
      if (k < 1e-6) return null;
      out.push([q[j][0] + d * (n1[0] + n2[0]) / k, q[j][1] + d * (n1[1] + n2[1]) / k]);
    }
    return out;
  }
  function solid(doc, x0, y0, x1, y1) { doc.fill(x0, y0, x1, y1, INK); }   // 薄い板・金物は黒く塗る（IS 962 13.5）

  // ---------------------------------------------------------------- 投影（断面・立面で共通）
  function Proj(A, look, s) {
    var L = DIRV[look] || look, R = [L[1], -L[0]];
    this.L = L; this.R = R; this.A = A; this.s = s;
    this.wu = function (p) { return p[0] * R[0] + p[1] * R[1]; };
    this.wd = function (p) { return (p[0] - A[0]) * L[0] + (p[1] - A[1]) * L[1]; };
    this.X = function (u) { return u / s; };
    this.V = function (z) { return -z / s; };
  }
  function urange(P, poly) { var a = 1e9, b = -1e9, d0 = 1e9, d1 = -1e9; poly.forEach(function (p) { var u = P.wu(p), d = P.wd(p); a = Math.min(a, u); b = Math.max(b, u); d0 = Math.min(d0, d); d1 = Math.max(d1, d); }); return { u0: a, u1: b, d0: d0, d1: d1 }; }

  // 開口の見えがかり（室内から見た窓・戸。断面の奥の壁に見えるもの）
  function drawOpeningFace(doc, st, o, ua, ub, yb, yt, s) {
    var w = st.far, inset = 40 / s, n = o.panels || (o.type === 'door' ? 1 : 2);
    if (o.type === 'door' || (o.type === 'slide' && (o.variant || o.sill === 0) && !o.panels)) {   // 扉：枠・戸・取っ手
      doc.rect(ua, yt, ub, yb, st.vis, INK, WHITE);
      doc.rect(ua + 30 / s, yt + 30 / s, ub - 30 / s, yb, w, INK, 'none');
      var hx = o.type === 'slide' ? ua + 90 / s : ub - 90 / s, hy = yb - 900 / s;
      doc.line(hx, hy, hx + (o.type === 'slide' ? 1 : -1) * 100 / s, hy, w);
      return;
    }
    // 窓：額縁（見付け 20）と枠 40、障子の割付、引違いの召合せ
    doc.rect(ua - 20 / s, yt - 20 / s, ub + 20 / s, yb + (o.sill > 0 ? 20 / s : 0), st.vis, INK, WHITE);
    doc.rect(ua, yt, ub, yb, st.fine, INK, 'none');
    var fa = ua + inset, fb = ub - inset, ft = yt + inset, fbm = yb - (o.sill > 0 ? inset : 0);
    doc.rect(fa, ft, fb, fbm, st.fine, INK, 'none');
    if (n >= 4) {
      var ov = 30 / s, p = (fb - fa + 3 * ov) / 4, lefts = [0, 1, 2, 3].map(function (i) { return fa + i * (p - ov); }), order = [0, 3, 1, 2];
      order.forEach(function (i) { var l = lefts[i], r = l + p; doc.rect(l, ft, r, fbm, st.fine, INK, (i === 1 || i === 2) ? WHITE : 'none'); doc.rect(l + 35 / s, ft + 35 / s, r - 35 / s, fbm - 35 / s, st.fine, INK, 'none'); });
    } else if (n === 2) {
      var xc = (fa + fb) / 2, o2 = 15 / s, stl = 35 / s;
      doc.rect(fa, ft, xc + o2, fbm, st.fine, INK, 'none'); doc.rect(fa + stl, ft + stl, xc + o2 - stl, fbm - stl, st.fine, INK, 'none');
      doc.rect(xc - o2, ft, fb, fbm, st.fine, INK, WHITE); doc.rect(xc - o2 + stl, ft + stl, fb - stl, fbm - stl, st.fine, INK, 'none');
    }
  }

  // ================================================================ 断面図
  function section(m, id, opt) {
    opt = opt || {};
    var s = opt.scale || 100, st = sty(s), doc = new Doc(), detail = st.detail, rnd = rng(7 + s);
    var sec = opt.cut || (m.sections || []).filter(function (x) { return x.id === id; })[0];
    if (!sec) return errSvg('断面 ' + id + ' がモデルにありません');
    var P = new Proj(sec.a, sec.look, s), X = P.X, V = P.V, wu = P.wu, wd = P.wd;
    var ls = levels(m), nL = ls.length, rz = roofZ(m), ph = parapetH(m), top = topZ(m), fp = footprint(m), tExt = extT(m), tPar = parT(m);
    var RC = rcOf(m), roofs = roofsOf(m), columns = columnsOf(m), ramps = rampsOf(m), screens = screensOf(m), rfLevel = roofIsLevel(m), openTop = rfLevel || roofs.length > 0;   // 最上階が屋上テラスか、屋根の板が別にある（天井の板を描かない）
    var bI = cutIntervals(fp.poly, wu, wd); if (!bI.length) return errSvg('断面 ' + id + ' の切断線が建物を通りません');
    var bMin = bI[0][0], bMax = bI[bI.length - 1][1];
    var FL = ls.map(function (l) { return l.fl; }), CH = ls.map(function (_, i) { return chOf(ls, i); });
    var fl1 = FL.length ? FL[0] : 150;
    var mmr = function (paper) { return paper * s; };   // 紙の mm → 実寸

    // ---- 敷地・道路・隣地：前（道路側）と後ろ ---------------------------------------------
    var site = m.site || {}, sPoly = site.polygon && site.polygon.length >= 3 ? site.polygon : null;
    var sI = sPoly ? cutIntervals(sPoly, wu, wd) : [];
    var sMin = sI.length ? sI[0][0] : bMin - 650, sMax = sI.length ? sI[sI.length - 1][1] : bMax + 650;
    var road = null, fs = 0, roadSide = null;
    (site.roads || []).forEach(function (r) {
      var e = roadEdge(site, r); if (!e || road) return;
      if (Math.abs(e.dir[0] * P.R[0] + e.dir[1] * P.R[1]) > 0.7) return;   // 道路の辺が切断線と平行＝断面に出ない
      var mu = wu(e.mid);
      if (Math.abs(mu - sMin) < 400) { road = r; fs = -1; roadSide = e.side; } else if (Math.abs(mu - sMax) < 400) { road = r; fs = 1; roadSide = e.side; }
    });
    if (!fs) fs = -1;
    var inF = -fs;                                       // 前から建物の中へ向かう u の符号
    var uF = fs < 0 ? bMin : bMax, uB = fs < 0 ? bMax : bMin;   // 前・後ろの外壁の外面
    var recess = opt.recess != null ? opt.recess : (m.recess || 0);
    var uF1 = uF + inF * recess;                         // 1 階の前面（縁の形なら引っ込む）
    var roadNear = fs < 0 ? sMin : sMax, roadFar = road ? roadNear + fs * road.width : null, cl = road ? roadNear + fs * road.width / 2 : null;
    var backB = fs < 0 ? sMax : sMin;                    // 後ろの隣地境界
    var uEndF = road ? roadFar + fs * (CON.nbGap + CON.nbShow) : roadNear + fs * 1500;   // 前の描く端
    var uEndB = backB - fs * 400;
    var lo = function (a, b) { return Math.min(a, b); }, hi = function (a, b) { return Math.max(a, b); };
    var frontName = roadSide ? DIRNAME[roadSide] : '';
    var isUx = Math.abs(P.R[0]) > 0.7;                   // u が x 方向（東西に切る）か

    // 切断線の上にある開口（壁 w の中で切断線が通る位置 cpt）
    function cutAt(w) { var g = wallGeo(w), dd = wd(w.a) - wd(w.b); if (Math.abs(dd) < 1e-6) return null; return (wd(w.a) / dd) * g.len; }
    function holesOf(w) { var c = cutAt(w); if (c == null) return []; return openingsOf(m, w).filter(function (o) { return c > o.at && c < o.at + o.width; }); }
    // 切断される壁（u の区間つき）
    var cutWalls = [];
    joinedWalls(m, null).forEach(function (jw) {   // 接合した多角形で切る（L・T の隅が 1 つの塗りになる）
      var w = jw.w, i = lvIndex(m, w.level); if (i < 0) return;
      var g = wallGeo(w), ivs = cutIntervals(jw.poly, wu, wd); if (!ivs.length) return;
      var iv = ivs[0], shift = 0;
      if (recess > 0 && isExt(w) && i === 0 && Math.abs((fs < 0 ? iv[0] : iv[1]) - uF) < 1) shift = inF * recess;
      cutWalls.push({ w: w, i: i, u0: iv[0] + shift, u1: iv[1] + shift, ext: isExt(w), holes: holesOf(w), g: g, front: Math.abs((fs < 0 ? iv[0] : iv[1]) - uF) < 1 });
    });
    // 柱・吹抜・斜路・ブリーズ・ソレイユ・屋根の板（切断と見えがかりに分ける）
    var beyond = [], cutCols = [], cutRamps = [], cutScreens = [], cutRoofs = [];
    columns.forEach(function (c) { var z = columnZ(m, c); if (!z) return; var pol = columnPoly(c), ivs = cutIntervals(pol, wu, wd), r = urange(P, pol); if (ivs.length) cutCols.push({ c: c, iv: ivs[0], z: z }); else if (r.d0 > 0) addBeyond(r.d0, function () { doc.rect(X(r.u0), V(z[0]), X(r.u1), V(z[1]), st.vis, INK, WHITE); }); });
    ramps.forEach(function (r) {
      var G = rampGeo(m, r); if (!G) return;
      G.segs.forEach(function (sg) {
        var hw = G.W / 2, quad = [[sg.p[0] + sg.n[0] * hw, sg.p[1] + sg.n[1] * hw], [sg.q[0] + sg.n[0] * hw, sg.q[1] + sg.n[1] * hw], [sg.q[0] - sg.n[0] * hw, sg.q[1] - sg.n[1] * hw], [sg.p[0] - sg.n[0] * hw, sg.p[1] - sg.n[1] * hw]];
        var rr = urange(P, quad), along = Math.abs(sg.u[0] * P.R[0] + sg.u[1] * P.R[1]) > 0.7;
        var zAt = function (u) { var ua = wu(sg.p), ub = wu(sg.q); return Math.abs(ub - ua) < 1e-6 ? sg.za : sg.za + (sg.zb - sg.za) * (u - ua) / (ub - ua); };
        if (rr.d0 < 0 && rr.d1 > 0) cutRamps.push({ G: G, sg: sg, rr: rr, along: along, zAt: zAt });
        else if (rr.d0 > 0) addBeyond(rr.d0, function () {
          if (along) { var ua = rr.u0, ub = rr.u1, za = zAt(ua), zb = zAt(ub); doc.poly([[X(ua), V(za)], [X(ub), V(zb)], [X(ub), V(zb - G.T)], [X(ua), V(za - G.T)]], st.vis, INK, WHITE); doc.line(X(ua), V(za + 900), X(ub), V(zb + 900), st.far); doc.line(X(ua), V(za + 860), X(ub), V(zb + 860), st.far); for (var u = ua + 300; u < ub; u += 1200) doc.line(X(u), V(zAt(u)), X(u), V(zAt(u) + 860), st.fine); }
          else { var zc = (sg.za + sg.zb) / 2; doc.rect(X(rr.u0), V(zc - G.T), X(rr.u1), V(zc), st.vis, INK, WHITE); doc.rect(X(rr.u0), V(zc), X(rr.u1), V(zc + 900), st.far, INK, 'none'); }
        });
      });
    });
    screens.forEach(function (sc0) {
      var G = screenGeo(m, sc0, fp.c); if (!G) return;
      var box = [G.at(0, 0), G.at(G.L, 0), G.at(G.L, G.depth), G.at(0, G.depth)], rr = urange(P, box), along = Math.abs(G.u[0] * P.R[0] + G.u[1] * P.R[1]) > 0.7;
      if (rr.d0 < 0 && rr.d1 > 0) cutScreens.push({ G: G, rr: rr, along: along });
      else if (rr.d0 > 0) addBeyond(rr.d0, function () {
        if (!along) { doc.rect(X(rr.u0), V(G.z0), X(rr.u1), V(G.z1), st.vis, INK, WHITE); G.rows.forEach(function (z) { doc.line(X(rr.u0), V(z), X(rr.u1), V(z), st.fine); doc.line(X(rr.u0), V(z + G.t), X(rr.u1), V(z + G.t), st.fine); }); return; }
        doc.rect(X(rr.u0), V(G.z0), X(rr.u1), V(G.z1), st.vis, INK, WHITE);
        G.fins.forEach(function (sx) { var u0 = wu(G.at(sx, 0)), u1 = wu(G.at(sx + G.t, 0)); doc.rect(X(Math.min(u0, u1)), V(G.z0), X(Math.max(u0, u1)), V(G.z1), st.fine, INK, WHITE); });
        G.rows.forEach(function (z) { doc.rect(X(rr.u0), V(z), X(rr.u1), V(z + G.t), st.fine, INK, WHITE); });
      });
    });
    roofs.forEach(function (r) {
      var pol = r.polygon.map(function (p) { return [+p[0], +p[1]]; }), T = num(r.thickness, 300), z1 = +r.fl, ivs = cutIntervals(pol, wu, wd), rr = urange(P, pol);
      var holes = arr(r.holes).map(holePoly).filter(Boolean), hIv = []; holes.forEach(function (h) { cutIntervals(h, wu, wd).forEach(function (iv) { hIv.push(iv); }); });
      var rise = (r.shell && r.shell.kind === 'curved') ? num(r.shell.rise, 0) : 0, u0 = rr.u0, u1 = rr.u1;
      var zTop = function (u) { if (!(rise > 0)) return z1; var t = (u - u0) / (u1 - u0 || 1); return z1 + rise * (1 - Math.pow(2 * t - 1, 2)); };
      if (ivs.length) cutRoofs.push({ r: r, ivs: ivs, holes: hIv, T: T, z1: z1, zTop: zTop, rise: rise, rr: rr });
      else if (rr.d0 > 0) addBeyond(rr.d0, function () { var pts = [], k; for (k = 0; k <= 16; k++) pts.push([X(u0 + (u1 - u0) * k / 16), V(zTop(u0 + (u1 - u0) * k / 16))]); for (k = 16; k >= 0; k--) pts.push([X(u0 + (u1 - u0) * k / 16), V(zTop(u0 + (u1 - u0) * k / 16) - T)]); doc.poly(pts, st.vis, INK, WHITE); });
    });
    var frontDoorAtFloor = cutWalls.some(function (c) { return c.ext && c.i === 0 && c.front && c.holes.some(function (o) { return (o.sill || 0) <= 0; }); });
    var stemFrontTop = frontDoorAtFloor ? fl1 : CON.stemTop;
    // 床の穴（階段の吹抜け）と屋根の穴（天窓・ハッチ）
    function holesAt(levelId) {
      var h = [];
      (m.stairs || []).forEach(function (sd) { if (sd.to === levelId) cutIntervals(stairSteps(m, sd).full, wu, wd).forEach(function (iv) { h.push(iv); }); });
      voidPolysAt(m, levelId).forEach(function (pg) { cutIntervals(pg, wu, wd).forEach(function (iv) { h.push(iv); }); });   // 吹抜（床を切らない）
      return h;
    }
    var roofOps = [];
    (m.fixtures || []).forEach(function (f) {
      if (f.kind !== 'skylight' && f.kind !== 'hatch') return;
      if (lvIndex(m, f.level) !== nL - 1) return;
      var pol = fixturePoly(f), ivs = cutIntervals(pol, wu, wd), r = urange(P, pol);
      roofOps.push({ f: f, iv: ivs[0] || null, r: r });
    });
    // 梁の向き：外形の短い方向に架ける → 切断線と直交するとき木口（×）が並ぶ
    var beamAlongX = (fp.b[2] - fp.b[0]) <= (fp.b[3] - fp.b[1]);
    var beamsCross = beamAlongX !== isUx;
    var innerF = uF + inF * tExt, innerB = uB - inF * tExt;   // 上階の内面（前は後退線の上の壁）
    function beamsFor(zLevelId, holes) {
      var bw = CON.beamW, heads = [], out = [];
      holes.forEach(function (h) { heads.push([h[0] - bw, h[0]]); heads.push([h[1], h[1] + bw]); });
      out = heads.slice();
      if (beamsCross) {
        var gset = isUx ? (m.grid && m.grid.x) || [] : (m.grid && m.grid.y) || [], k = isUx ? P.R[0] : P.R[1];
        var gus = gset.map(function (q) { return q.at * k; }).sort(function (a, b) { return a - b; });
        var start = gus.length ? gus[0] : lo(innerF, innerB), end = gus.length ? gus[gus.length - 1] : hi(innerF, innerB);
        for (var u = start + CON.beamPitch; u < end - 1; u += CON.beamPitch) {
          var b = [u - bw / 2, u + bw / 2];
          var clash = heads.some(function (h) { return !(b[1] + 300 <= h[0] || b[0] - 300 >= h[1]); });
          var inside = holes.some(function (h) { return h[0] < u && u < h[1]; });
          if (!clash && !inside) out.push(b);
        }
      }
      if (zLevelId === (ls[1] && ls[1].id) && recess > 0) { var yc = uF1 + inF * tExt / 2, bb = [yc - bw / 2, yc + bw / 2]; if (!out.some(function (h) { return !(bb[1] <= h[0] || bb[0] >= h[1]); })) out.push(bb); }
      return out.sort(function (a, b) { return a[0] - b[0]; });
    }
    function betweenBeams(beams, ua, ub) { var out = [], prev = lo(ua, ub), end = hi(ua, ub); beams.forEach(function (b) { if (b[1] <= prev || b[0] >= end) return; if (b[0] > prev) out.push([prev, b[0]]); prev = b[1]; }); if (end > prev) out.push([prev, end]); return out; }

    // ---- 1. 通り芯 --------------------------------------------------------------------------
    var gridSet = isUx ? (m.grid && m.grid.x) || [] : (m.grid && m.grid.y) || [], gk = isUx ? P.R[0] : P.R[1];
    var gu = gridSet.map(function (q) { return { id: q.id, u: q.at * gk }; }).sort(function (a, b) { return a.u - b.u; });
    gu.forEach(function (q) { doc.line(X(q.u), V(top + 350), X(q.u), V(-900), st.grid, INK, chainDash(st.grid)); });

    // ---- 2. 地盤のハッチ（GL・舗装・基礎の下に帯、深い基礎の脇は L 字） ---------------------------
    var band = mmr(4.0), e300 = 300, deep = CON.edgeBottom - CON.blinding - CON.gravel, under = fl1 - CON.slabT - CON.blinding - CON.gravel;
    var pav = recess > 0 ? -200 : 0;
    var rects = [];
    function seg(a, b, zt) { if (b - a > 1) rects.push([a, b, zt - band, zt]); }
    (function () {
      var A = lo(uEndF, uEndB), B = hi(uEndF, uEndB);
      var f0 = lo(uF1, uB), f1 = hi(uF1, uB), nr = roadNear;
      if (fs < 0) { seg(A, nr, 0); seg(nr, f0, pav); } else { seg(f1, nr, pav); seg(nr, B, 0); }
      seg(f0, f0 + e300, deep); seg(f0 + e300, f1 - e300, under); seg(f1 - e300, f1, deep);
      if (fs < 0) seg(f1, B, 0); else seg(A, f0, 0);
      rects.push([f0 - band, f0, deep - band, fs < 0 ? pav : 0]);
      rects.push([f0 + e300, f0 + e300 + band, deep - band, under]);
      rects.push([f1 - e300 - band, f1 - e300, deep - band, under]);
      rects.push([f1, f1 + band, deep - band, fs < 0 ? 0 : pav]);
      rects.forEach(function (r) { var a = Math.max(r[0], A), b = Math.min(r[1], B); if (b > a) doc.hatch([[X(a), V(r[3])], [X(b), V(r[3])], [X(b), V(r[2])], [X(a), V(r[2])]], 45, 0.9, st.hatch); });
    })();

    // ---- 3. 文脈：隣家（灰）・境界・道路中心線・延焼の境 ------------------------------------------
    var nbTip = null, enshou = null;
    var nbFront = roadSide ? arr(site.neighbors).filter(function (n) { return n && n.side === roadSide; })[0] : null;   // 道路の向かいの隣家はモデルにあるときだけ
    if (road && opt.context !== false && nbFront) {
      var yw = roadFar + fs * CON.nbGap, yfar = yw + fs * CON.nbDepth, yridge = (yw + yfar) / 2, zw = CON.nbEave + CON.nbRoofT, pit = CON.nbPitch, ov = CON.nbOver;
      function roofTop(u) { return (fs < 0 ? u >= yridge : u <= yridge) ? zw + pit * Math.abs(yw - u) : zw + pit * Math.abs(u - yfar); }
      var tipY = yw - fs * ov, tipTop = zw - pit * ov, tipBot = tipTop - CON.nbRoofT, yb = uEndF, c = GRAY;
      doc.poly([[X(tipY), V(tipTop)], [X(yridge), V(roofTop(yridge))], [X(yb), V(roofTop(yb))]], st.ctx, c, 'none', true);
      doc.line(X(tipY), V(tipTop), X(tipY), V(tipBot), st.ctx, c);
      doc.line(X(tipY), V(tipBot), X(yw), V(tipBot + pit * ov), st.ctx, c);
      doc.line(X(yw), V(0), X(yw), V(tipBot + pit * ov), st.ctx, c);
      doc.line(X(yw), V(400), X(yb), V(400), st.ctxf, c);
      doc.line(X(yw), V(CON.nbFloor2 - 150), X(yb), V(CON.nbFloor2 - 150), st.ctxf, c);
      doc.line(X(yw), V(CON.nbFloor2 + 150), X(yb), V(CON.nbFloor2 + 150), st.ctxf, c);
      [[CON.nbFL + 900, CON.nbFL + 1800], [CON.nbFloor2 + 800, CON.nbFloor2 + 1800]].forEach(function (zz) {
        var ya = yw + fs * 900, ybb = yw + fs * 2600;
        doc.rect(X(ya), V(zz[0]), X(ybb), V(zz[1]), st.ctxf, c, 'none');
        doc.line(X((ya + ybb) / 2), V(zz[0]), X((ya + ybb) / 2), V(zz[1]), st.ctxf, c);
      });
      breakLineV(doc, X(yb), V(roofTop(yb) + 400), V(-mmr(4.0)), c, st.ctxf);
      nbTip = [tipY, tipTop];
      doc.line(X(cl), V(-mmr(4.0)), X(cl), V(top + 450), st.grid, INK, chainDash(st.grid));
      [roadNear, roadFar, backB].forEach(function (u) { doc.line(X(u), V(-mmr(2.5)), X(u), V(1500), st.grid, INK, chainDash(st.grid)); });
      var y3 = cl + inF * 3000, y5 = cl + inF * 5000, z2 = FL[1] != null ? FL[1] : 3150, zt = top + 150, wh = st.hidden;
      doc.line(X(y3), V(0), X(y3), V(z2), wh, INK, dashDash(wh));
      doc.line(X(y5), V(z2), X(y5), V(zt), wh, INK, dashDash(wh));
      enshou = [y3, y5, z2, zt];
    } else if (road) {   // 道路はあるが向かいの隣家は描かない：境界・中心線・延焼の境だけ
      doc.line(X(cl), V(-mmr(4.0)), X(cl), V(top + 450), st.grid, INK, chainDash(st.grid));
      [roadNear, roadFar, backB].forEach(function (u) { doc.line(X(u), V(-mmr(2.5)), X(u), V(1500), st.grid, INK, chainDash(st.grid)); });
      var y3b = cl + inF * 3000, y5b = cl + inF * 5000, z2b = FL[1] != null ? FL[1] : 3150, ztb = top + 150, whb = st.hidden;
      doc.line(X(y3b), V(0), X(y3b), V(z2b), whb, INK, dashDash(whb)); doc.line(X(y5b), V(z2b), X(y5b), V(ztb), whb, INK, dashDash(whb));
      enshou = [y3b, y5b, z2b, ztb];
    } else {
      [sMin, sMax].forEach(function (u) { doc.line(X(u), V(-mmr(2.5)), X(u), V(1500), st.grid, INK, chainDash(st.grid)); });
    }

    // ---- 4. 見えがかり（奥から手前へ白で塗り重ねる） ----------------------------------------------
    var cutFix = [];
    function addBeyond(d, fn) { if (d > 0) beyond.push({ d: d, fn: fn }); }
    // 奥の側壁：立上りの線（縁の形なら側壁の小口と立上り）
    addBeyond(1e6, function () {
      doc.line(X(uF1 + inF * tExt), V(CON.stemTop), X(innerB), V(CON.stemTop), st.far);
      if (recess > 0) { var zsof = fl1 + CH[0]; doc.line(X(uF), V(0), X(uF), V(zsof), st.vis); doc.line(X(uF), V(CON.stemTop), X(uF1), V(CON.stemTop), st.far); }
    });
    function adjWall(levelId, pt, tol) {   // 点 pt に接する壁（同じ階）
      return (m.walls || []).filter(function (w) { if (w.level !== levelId) return false; var g = wallGeo(w), q = g.poly; var b = bbox(q); return pt[0] >= b[0] - tol && pt[0] <= b[2] + tol && pt[1] >= b[1] - tol && pt[1] <= b[3] + tol; })[0] || null;
    }
    // 階段
    var stairCut = [];
    (m.stairs || []).forEach(function (sd) {
      var S = stairSteps(m, sd), par = Math.abs(S.d[0] * P.R[0] + S.d[1] * P.R[1]) > 0.7;
      var sdir = (S.d[0] * P.R[0] + S.d[1] * P.R[1]) > 0 ? 1 : -1;            // 上る向きの u の符号
      var e0 = sd.origin, e1 = [e0[0] + S.side[0] * S.w, e0[1] + S.side[1] * S.w];  // 幅の両端（長い辺）
      var d0 = wd(e0), d1 = wd(e1), inside = (d0 < 0) !== (d1 < 0);
      var u0 = wu(e0), base = S.z0, n = S.n, R = S.rise, T = S.tread;
      var mid = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2], midTop = [mid[0] + S.d[0] * S.run, mid[1] + S.d[1] * S.run];
      function riserU(i) { return u0 + sdir * i * T; }
      function nosingZ(u) { return base + R + (u - u0) * sdir * R / T; }
      function stringerPoly() {
        var pts = [[riserU(0), base]];
        for (var i = 0; i < n - 1; i++) { pts.push([riserU(i), base + R * (i + 1) - CON.treadB]); pts.push([riserU(i + 1), base + R * (i + 1) - CON.treadB]); }
        pts.push([riserU(n - 1), base + R * n - 43]);
        var uEnd = riserU(n - 1), zEnd = nosingZ(uEnd) - CON.stringerD, uFoot = u0 + sdir * (CON.stringerD - R) * T / R;
        pts.push([uEnd, zEnd]); pts.push([uFoot, base]);
        return pts.map(function (p) { return [X(p[0]), V(p[1])]; });
      }
      if (!par) {   // 切断線と直交：段を箱で（切る段は切断、奥の段は見えがかり）
        S.steps.forEach(function (stp) {
          var r = urange(P, stp.poly);
          if (r.d0 < 0 && r.d1 > 0) stairCut.push(function () { doc.rect(X(r.u0), V(stp.z1), X(r.u1), V(stp.z1 - 240), st.cutm, INK, st.poche ? INK : WHITE); });
          else if (r.d0 > 0) addBeyond(r.d0, function () { doc.rect(X(r.u0), V(stp.z1), X(r.u1), V(stp.z0), st.vis, INK, WHITE); });
        });
        return;
      }
      var farPt = d0 > d1 ? e0 : e1, nearPt = d0 > d1 ? e1 : e0, dFar = Math.max(d0, d1), dNear = Math.min(d0, d1);
      var sideV = [farPt[0] - mid[0], farPt[1] - mid[1]], sl = Math.hypot(sideV[0], sideV[1]) || 1; sideV = [sideV[0] / sl, sideV[1] / sl];
      var farWall = adjWall(sd.from, [midTop[0] * 0.5 + mid[0] * 0.5 + sideV[0] * (S.w / 2 + 60), midTop[1] * 0.5 + mid[1] * 0.5 + sideV[1] * (S.w / 2 + 60)], 10);
      var nearWall = adjWall(sd.from, [midTop[0] * 0.5 + mid[0] * 0.5 - sideV[0] * (S.w / 2 + 60), midTop[1] * 0.5 + mid[1] * 0.5 - sideV[1] * (S.w / 2 + 60)], 10);
      if (inside) {
        // 奥の桁・吹抜けの奥の縁・壁付き手摺
        addBeyond(dFar - CON.stringer, function () { doc.poly(stringerPoly(), st.vis, INK, WHITE); });
        var iTo = lvIndex(m, sd.to), iFrom = lvIndex(m, sd.from);
        if (iTo > 0 && (!farWall || !isExt(farWall))) addBeyond(dFar, function () {
          var zc = FL[iFrom] + CH[iFrom], a = u0, b = riserU(n - 1);
          doc.rect(X(a), V(zc), X(b), V(FL[iTo]), st.vis, INK, WHITE);
          doc.line(X(a), V(FL[iTo] - CON.finish - CON.ply), X(b), V(FL[iTo] - CON.finish - CON.ply), st.fine);
        });
        if (farWall) addBeyond(dFar - 60, function () {
          var a = u0 - sdir * CON.nosing, b = riserU(n - 1);
          doc.line(X(a), V(nosingZ(a) + 780), X(b), V(nosingZ(b) + 600), st.far);
        });
        // 切断：踏板（木）と蹴込板（黒）／1:100 は段の折れ線
        stairCut.push(function () {
          if (st.poche) {
            var prof = [[X(riserU(0)), V(base)]];
            for (var i = 0; i < n - 1; i++) { prof.push([X(riserU(i)), V(base + R * (i + 1))]); prof.push([X(riserU(i + 1)), V(base + R * (i + 1))]); }
            prof.push([X(riserU(n - 1)), V(base + R * n - 43)]);
            doc.poly(prof, st.cut, INK, 'none', true, null, 'miter');
            return;
          }
          for (var j = 0; j < n - 1; j++) {
            var za = base + R * (j + 1), ua = riserU(j) - sdir * CON.nosing, ub = riserU(j + 1);
            doc.rectIn(X(ua), V(za), X(ub), V(za - CON.treadB), st.cutm);
            doc.line(X(ua), V(za), X(ub), V(za - CON.treadB), st.hatch);
          }
          for (var k2 = 0; k2 < n; k2++) {
            var z0 = k2 === 0 ? base : base + R * k2, z1 = base + R * (k2 + 1) - (k2 < n - 1 ? CON.treadB : 43);
            solid(doc, X(riserU(k2)), V(z0), X(riserU(k2) + sdir * CON.riserB), V(z1));
          }
        });
        stairCut.note = stairCut.note || [];
        stairCut.note.push({ u: u0 + sdir * S.run * 0.86, z: base + 1050, t1: '蹴上 ' + R + '×' + n, t2: '踏面 ' + T + '×' + (n - 1) });
      } else if (dNear > 0) {
        // 脇から見る：桁と段（開いた側なら手摺）
        addBeyond(dNear + 0.5, function () {
          doc.poly(stringerPoly(), st.vis, INK, WHITE);
          if (detail) for (var i = 0; i < n - 1; i++) doc.rect(X(riserU(i) - sdir * CON.nosing), V(base + R * (i + 1) - CON.treadB), X(riserU(i + 1)), V(base + R * (i + 1)), st.vis, INK, WHITE);
          else { var prof = []; for (var j = 0; j < n - 1; j++) { prof.push([X(riserU(j) - sdir * CON.nosing), V(base + R * (j + 1))]); prof.push([X(riserU(j + 1)), V(base + R * (j + 1))]); } doc.poly(prof, st.vis, INK, 'none', true); }
        });
        if (!nearWall) addBeyond(dNear - 0.5, function () {
          var a = u0 - sdir * CON.nosing, b = riserU(n - 1), hr = function (u) { return nosingZ(u) + 850; };
          doc.line(X(a), V(hr(a)), X(b), V(hr(b)), st.vis);
          for (var u = u0 + sdir * 40; sdir * (b - u) > 30; u += sdir * 110) { var i = Math.min(Math.floor(sdir * (u - u0) / T), n - 2); doc.line(X(u), V(i >= 0 ? base + R * (i + 1) : base), X(u), V(hr(u)), st.fine); }
        });
      }
    });
    // 間仕切り・外壁の面（切断線と平行で奥にあるもの）
    (m.walls || []).forEach(function (w) {
      var i = lvIndex(m, w.level); if (i < 0) return;
      var g = wallGeo(w), r = urange(P, g.poly);
      if (r.d0 <= 0 || Math.abs(g.u[0] * P.R[0] + g.u[1] * P.R[1]) < 0.7) return;
      var z0 = FL[i], zc = FL[i] + CH[i];
      if (isExt(w)) {   // 奥の外壁：面は描かず、開口だけ見える
        addBeyond(r.d0, function () {
          openingsOf(m, w).forEach(function (o) {
            var pa = g.at(o.at), pb = g.at(o.at + o.width), ua = X(wu(pa)), ub = X(wu(pb)); if (ua > ub) { var t = ua; ua = ub; ub = t; }
            drawOpeningFace(doc, st, o, ua, ub, V(z0 + (o.sill || 0)), V(z0 + o.head), s);
          });
        });
        return;
      }
      addBeyond(r.d0, function () {
        var a = Math.max(r.u0, lo(innerF, innerB)), b = Math.min(r.u1, hi(innerF, innerB));
        doc.rect(X(a), V(z0), X(b), V(zc), 0, 'none', WHITE);
        [w.a, w.b].forEach(function (pt) {   // 端が他の壁に当たらなければ出隅の線
          var free = !(m.walls || []).some(function (q) { if (q === w || q.level !== w.level) return false; var qb = bbox(wallGeo(q).poly); return pt[0] >= qb[0] - 60 && pt[0] <= qb[2] + 60 && pt[1] >= qb[1] - 60 && pt[1] <= qb[3] + 60; });
          if (free) doc.line(X(wu(pt)), V(z0), X(wu(pt)), V(zc), st.vis);
        });
        openingsOf(m, w).forEach(function (o) {
          var pa = g.at(o.at), pb = g.at(o.at + o.width), ua = X(wu(pa)), ub = X(wu(pb)); if (ua > ub) { var t = ua; ua = ub; ub = t; }
          drawOpeningFace(doc, st, o, ua, ub, V(z0 + (o.sill || 0)), V(z0 + o.head), s);
        });
      });
    });
    // 家具・設備（奥は細線、切断面にかかれば中線の切り口）
    function furniture(f, cut) {
      var i = lvIndex(m, f.level); if (i < 0) return;
      var pol = fixturePoly(f), r = urange(P, pol), fl = FL[i], w = cut ? st.cutm : st.far, thin = st.fine;
      var y0 = r.u0, y1 = r.u1;
      if (i === 0) { var fin = lo(uF1 + inF * tExt, innerB), fax = hi(uF1 + inF * tExt, innerB); y0 = Math.max(y0, fin); y1 = Math.min(y1, fax); if (y1 - y0 < 100) return; }
      var k = f.kind, H = f.h || FIX_H[k] || 700;
      function box(a, b, z0, z1, lw) { doc.rect(X(a), V(fl + z0), X(b), V(fl + z1), lw || w, INK, WHITE); }
      if (k === 'table' || k === 'desk' || k === 'lowtable' || k === 'bench') {
        box(y0, y1, H - 35, H);
        [y0 + 40, y1 - 100].forEach(function (ya) { box(ya, ya + 60, 0, H - 35); });
        if (k === 'table' && (f.chairs || 0) >= 2 && !cut) [[y0 - 470, y0 - 470], [y1 + 30, y1 + 410]].forEach(function (c) { var ya = c[0], back = c[1]; box(ya, ya + 440, 400, 430); box(ya + 20, ya + 50, 0, 400); box(ya + 390, ya + 420, 0, 400); box(back, back + 30, 430, 820); });
      } else if (k === 'shelf' || k === 'shoebox' || k === 'wardrobe' || k === 'fridge' || k === 'tvboard' || k === 'washer') {
        box(y0, y1, 0, H);
        if (k === 'shelf') { for (var q = 1; q <= 4; q++) { var z = 80 + (H - 80) * q / 5; doc.line(X(y0), V(fl + z), X(y1), V(fl + z), thin); } if (f.div) for (var yy = y0 + f.div; yy < y1 - 100; yy += f.div) doc.line(X(yy), V(fl), X(yy), V(fl + H), thin); }
        else if (k === 'fridge') doc.line(X(y0), V(fl + 1150), X(y1), V(fl + 1150), thin);
        else if (k === 'wardrobe') doc.line(X(y0), V(fl + 1800), X(y1), V(fl + 1800), thin);
        else if (k === 'shoebox' || k === 'tvboard') doc.line(X(y0), V(fl + 80), X(y1), V(fl + 80), thin);
      } else if (k === 'counter' || k === 'vanity') {
        var nearBack = Math.abs(y1 - hi(innerF, innerB)) < 200 || Math.abs(y0 - lo(innerF, innerB)) < 200;   // 壁に付く側
        var front = Math.abs(y1 - hi(innerF, innerB)) < 200 ? y0 : y1, kick = front === y0 ? 70 : -70, back = front === y0 ? y1 : y0;
        doc.rect(X(y0), V(fl + 100), X(y1), V(fl + H), w, INK, WHITE);
        doc.rect(X(lo(front + kick, back)), V(fl), X(hi(front + kick, back)), V(fl + 100), w, INK, WHITE);
        doc.line(X(y0), V(fl + H - 30), X(y1), V(fl + H - 30), thin);
        if (k === 'vanity' && !cut) doc.rect(X(y0 + 50), V(fl + 1050), X(y1 - 50), V(fl + 1800), thin, INK, WHITE);
        void nearBack;
      } else if (k === 'hood') { box(y0, y1, 1650, CH[i]); doc.line(X(y0 + 20), V(fl + 1710), X(y1 - 20), V(fl + 1710), thin); }
      else if (k === 'sofa') { box(y0, y1, 0, 420); box(y0, y0 + 150, 0, 620); box(y1 - 150, y1, 0, 620); doc.rect(X(y0 + 150), V(fl + 420), X(y1 - 150), V(fl + 780), thin, INK, WHITE); }
      else if (k === 'bed') {
        box(y0, y1, 120, H); [y0 + 30, y1 - 110].forEach(function (ya) { box(ya, ya + 50, 0, 120); });
        var head = f.head || 'N', hv = DIRV[head] || [0, 1], alongU = Math.abs(hv[0] * P.R[0] + hv[1] * P.R[1]) > 0.7;
        if (alongU) { var hu = (hv[0] * P.R[0] + hv[1] * P.R[1]) > 0 ? y1 - 50 : y0; box(hu, hu + 50, 0, 900); var yp = hu === y0 ? y0 + 70 : y1 - 470; doc.rect(X(yp), V(fl + H), X(yp + 380), V(fl + H + 110), thin, INK, WHITE); }
        else if ((hv[0] * P.L[0] + hv[1] * P.L[1]) > 0 && !cut) doc.rect(X(y0), V(fl + H), X(y1), V(fl + 900), thin, INK, 'none');
      } else if (k === 'tub') { box(y0, y1, 0, H); doc.line(X(y0 + 60), V(fl + H - 60), X(y1 - 60), V(fl + H - 60), thin); }
      else if (k === 'toilet') { var tb = Math.abs(y1 - hi(innerF, innerB)) < Math.abs(y0 - lo(innerF, innerB)) ? [y1 - 200, y1] : [y0, y0 + 200]; box(tb[0], tb[1], 380, 800); doc.rect(X(y0), V(fl), X(y1), V(fl + 400), w, INK, WHITE); }
      else if (k === 'handbasin') { box(y0, y1, 720, 820); doc.line(X((y0 + y1) / 2), V(fl + 720), X((y0 + y1) / 2), V(fl + 500), thin); }
      else if (k === 'shower') { doc.line(X((y0 + y1) / 2), V(fl + 1000), X((y0 + y1) / 2), V(fl + 1900), thin); doc.circle(X((y0 + y1) / 2), V(fl + 1900), 60 / s, thin, INK, WHITE); }
      else box(y0, y1, 0, H);
    }
    (m.fixtures || []).forEach(function (f) {
      if (f.kind === 'rod' || f.kind === 'skylight' || f.kind === 'hatch') return;
      if (f.upper && f.kind !== 'hood') return;
      var r = urange(P, fixturePoly(f));
      if (r.d0 < 0 && r.d1 > 0) cutFix.push(f); else if (r.d0 > 0) addBeyond(r.d0, function () { furniture(f, false); });
    });
    // 屋上の天窓・ハッチ（切らないとき：立上りの箱）
    roofOps.forEach(function (ro) { if (ro.iv) return; if (ro.r.d0 > 0) addBeyond(ro.r.d0, function () { doc.rect(X(ro.r.u0 - 49), V(rz), X(ro.r.u1 + 49), V(rz + 304), st.vis, INK, WHITE); doc.rect(X(ro.r.u0 - 75), V(rz + 304), X(ro.r.u1 + 75), V(rz + 354), st.vis, INK, WHITE); }); });
    // 室名の位置（先に決めて、人物と重ねない）
    var roomLabels = [];
    ls.forEach(function (l, i) {
      var stairHere = (m.stairs || []).some(function (sd) { return sd.from === l.id && cutIntervals(stairSteps(m, sd).full, wu, wd).length && Math.abs((DIRV[sd.dir] || [0, 1])[0] * P.R[0] + (DIRV[sd.dir] || [0, 1])[1] * P.R[1]) > 0.7; });
      roomsOf(m, l.id).forEach(function (r) {
        var spans = cutIntervals(r.polygon, wu, wd).map(function (iv) { return [Math.max(iv[0], i === 0 ? lo(uF1 + inF * tExt, innerB) : lo(innerF, innerB)), Math.min(iv[1], hi(innerF, innerB))]; }).filter(function (sp) { return sp[1] - sp[0] > 500; });
        if (!spans.length) return;
        var sp = spans.sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]); })[0];
        var name = (r.labelText || r.name).replace(/ /g, ''), small = /物入|廊下|便所|階段/.test(name) || !!r.small;
        var hasStair = (m.stairs || []).some(function (sd) { return sd.from === l.id && pointInPoly(sd.origin[0] + 10, sd.origin[1] + 10, r.polygon); });
        if (name === '階段' && stairHere && hasStair) return;
        var z = (hasStair && stairHere) ? 450 : 1500;
        // 奥に背の高い家具があれば、その上に
        var tall = 0;
        (m.fixtures || []).forEach(function (f) { if (f.level !== l.id || f.upper) return; var rr = urange(P, fixturePoly(f)); if (rr.d0 < 0 || rr.u1 < sp[0] || rr.u0 > sp[1]) return; tall = Math.max(tall, f.h || FIX_H[f.kind] || 700); });
        if (!hasStair && tall >= 1200 && tall + 350 <= CH[i] - 250) z = tall + 350;
        var label = r.sub && !r.labelText ? name + '（' + r.sub + '）' : name, showCH = !small && detail && r.name.indexOf('階段') < 0;
        roomLabels.push({ i: i, u: (sp[0] + sp[1]) / 2, z: l.fl + z, t: label, sub: showCH ? 'CH ' + nfmt(CH[i]) : null, size: small ? TN : TR, span: sp, room: r, hasStair: hasStair });
      });
    });
    // 人物：1 階と 2 階に 1 人ずつ（階段の無い広い部屋、室名の脇）、路地に 1 人
    var figs = [];
    ls.slice(0, 2).forEach(function (l, i) {
      var cands = roomLabels.filter(function (rl) { return rl.i === i && !rl.hasStair && rl.span[1] - rl.span[0] > 1500; }).sort(function (a, b) { return (b.span[1] - b.span[0]) - (a.span[1] - a.span[0]); });
      if (!cands.length) return;
      var rl = cands[0], half = tw(rl.t, rl.size) * s / 2 + 450, c = rl.u, sp = rl.span, u = null;
      var left = c - half, right = c + half;
      if (left - 300 >= sp[0] && (i === 0 || inF > 0)) u = Math.max(sp[0] + 300, left - (i === 0 ? 300 : 0));
      else if (right + 300 <= sp[1]) u = Math.min(sp[1] - 300, right);
      else if (left - 300 >= sp[0]) u = left;
      if (u != null) figs.push({ u: u, z: l.fl, h: i === 0 ? 1700 : 1650, flip: i === 1 });
    });
    if (road) figs.push({ u: roadNear + fs * 1000, z: 0, h: 1700 });
    figs.forEach(function (fg) { addBeyond(1, function () { person(doc, X(fg.u), V, fg.z, s, st, fg.flip, fg.h); }); });
    beyond.sort(function (a, b) { return b.d - a.d; }).forEach(function (it) { it.fn(); });

    // ---- 5. 日射（強調色 1 つ：冬至の南中）。前面に 2 階の窓が切られているときだけ ------------------
    var sunInfo = null;
    if (nbTip && opt.sun !== false && roadSide === 'S') {
      var alt = 90 - CON.latitude + CON.declination, tn = Math.tan(alt * Math.PI / 180);
      var win2 = cutWalls.filter(function (c) { return c.ext && c.front && c.i === 1 && c.holes.length; })[0];
      if (win2) {
        var zHit = nbTip[1] - tn * Math.abs(uF - nbTip[0]), zStart = 8400, yStart = nbTip[0] - fs * (zStart - nbTip[1]) / tn * -1;
        yStart = nbTip[0] + fs * (zStart - nbTip[1]) / tn;
        doc.line(X(yStart), V(zStart), X(uF), V(zHit), st.accent, ACC);
        var o = win2.holes[0], zh = FL[1] + o.head, yFloor = uF + inF * (zh - FL[1]) / tn, ys2 = uF + fs * (zStart - zh) / tn;
        doc.line(X(ys2), V(zStart), X(yFloor), V(FL[1]), st.accent, ACC);
        if (detail) doc.text(X(yFloor) + fs * 1.0, V(FL[1]) - 1.0, '外壁から ' + nfmt(Math.round((yFloor - uF) * inF / 10) * 10), TN, fs > 0 ? 'start' : 'end');
        doc.text(X(yStart) + inF * 1.0, V(zStart) - 1.2, '冬至の南中 ' + Math.round(alt) + '°', TN, inF > 0 ? 'start' : 'end');
        doc.text(X(uF) + fs * 1.2, V(zHit) + 3.0, '影の上端 GL+' + nfmt(Math.round(zHit / 10) * 10), TN, fs > 0 ? 'start' : 'end');
        sunInfo = { alt: alt, zHit: zHit, depth: (yFloor - uF) * inF };
      }
    }

    // ---- 6. 切断面：基礎 ----------------------------------------------------------------------
    (function () {
      var y0 = lo(uF1, uB), y1 = hi(uF1, uB), topZ = fl1, bot = fl1 - CON.slabT, eb = CON.edgeBottom, stT = CON.stemTop, w = CON.stemW;
      var fTop = stemFrontTop, bTop = stT;
      var frontIsLo = fs < 0;
      var loTop = frontIsLo ? fTop : bTop, hiTop = frontIsLo ? bTop : fTop;
      if (recess > 0) {   // 縁の舗装（土間コンクリート 100）と砕石
        var pa = lo(roadNear, uF1), pb = hi(roadNear, uF1);
        doc.rectIn(X(pa), V(0), X(pb), V(-100), st.cutm); if (detail) doc.stipple(X(pa), V(0), X(pb), V(-100), 0.7, rnd);
        gravel(pa, pb, -200, -100);
      }
      var e = e300, bl = CON.blinding, gr = CON.gravel;
      gravel(y0, y0 + e, eb - bl - gr, eb - bl); gravel(y0 + e, y1 - e, bot - bl - gr, bot - bl); gravel(y1 - e, y1, eb - bl - gr, eb - bl);
      var blind = [[y0, eb], [y0 + e, eb], [y0 + e, bot], [y1 - e, bot], [y1 - e, eb], [y1, eb], [y1, eb - bl], [y1 - e, eb - bl], [y1 - e, bot - bl], [y0 + e, bot - bl], [y0 + e, eb - bl], [y0, eb - bl]];
      doc.poly(blind.map(function (p) { return [X(p[0]), V(p[1])]; }), st.fine, INK, WHITE);
      var poly = [[y0, eb], [y0, loTop], [y0 + w, loTop]];
      if (loTop > topZ) poly.push([y0 + w, topZ]);
      poly.push([y1 - w, topZ]);
      if (hiTop > topZ) poly.push([y1 - w, hiTop]);
      poly.push([y1, hiTop], [y1, eb], [y1 - e, eb], [y1 - e, bot], [y0 + e, bot], [y0 + e, eb]);
      matConcretePoly(doc, st, poly.map(function (p) { return [X(p[0]), V(p[1])]; }), rnd);
      if (loTop > topZ) matTimber(doc, st, X(y0 + 22), V(loTop), X(y0 + 127), V(loTop + 105));
      if (hiTop > topZ) matTimber(doc, st, X(y1 - 128), V(hiTop), X(y1 - 23), V(hiTop + 105));
      function gravel(a, b, z0, z1) { doc.rect(X(a), V(z1), X(b), V(z0), 0, 'none', WHITE); if (detail) doc.zigzag(X(a), V(z1), X(b), V(z0), st.hatch, true); doc.rect(X(a), V(z1), X(b), V(z0), st.fine, INK, 'none'); }
    })();

    // ---- 7. 床（上階）・屋根 ----------------------------------------------------------------------
    var slabHoles = {};
    function plate(a, b, z0, z1, w) { if (st.poche) { doc.fill(X(a), V(z0), X(b), V(z1), INK); return; } solid(doc, X(a), V(z0), X(b), V(z1)); void w; }
    ls.forEach(function (l, i) {
      if (i === 0) return;
      var Fz = l.fl, zc = FL[i - 1] + CH[i - 1], tPl = CON.finish + CON.ply, bh = CON.beamH, bw = CON.beamW;
      var holes = holesAt(l.id); slabHoles[l.id] = holes;
      var span = [lo(innerF, innerB), hi(innerF, innerB)], segs = subtract(span, holes);
      if (RC) {   // RC：床版 1 枚（厚さ slab）を黒く塗る。梁・天井の板は描かない
        var tS = num(m.slab, 300);
        segs.forEach(function (sg) { doc.rect(X(sg[0]), V(zc), X(sg[1]), V(Fz), 0, 'none', WHITE); plate(sg[0], sg[1], Fz - tS, Fz); });
        holes.forEach(function (h) { h.forEach(function (ye) { doc.line(X(ye), V(Fz - tS), X(ye), V(Fz), st.cut); }); });
        return;
      }
      segs.forEach(function (sg) { doc.rect(X(sg[0]), V(zc), X(sg[1]), V(Fz), 0, 'none', WHITE); });
      var beams = beamsFor(l.id, holes);
      beams.forEach(function (b) {
        if (b[1] <= span[0] || b[0] >= span[1]) return;
        var ok = segs.some(function (sg) { return sg[0] <= (b[0] + b[1]) / 2 && (b[0] + b[1]) / 2 <= sg[1]; }) || holes.some(function (h) { return h[0] - bw - 1 <= b[0] && b[1] <= h[1] + bw + 1; });
        if (!ok) return;
        matTimber(doc, st, X(b[0]), V(Fz - tPl - bh), X(b[1]), V(Fz - tPl));
        if (detail && (Fz - tPl - bh) - (zc + CON.ceil) > 80) { var yc = (b[0] + b[1]) / 2; doc.line(X(yc), V(zc + CON.ceil), X(yc), V(Fz - tPl - bh), st.fine); }
      });
      segs.forEach(function (sg) { plate(sg[0], sg[1], Fz - tPl, Fz); if (detail) doc.line(X(sg[0]), V(Fz - CON.finish), X(sg[1]), V(Fz - CON.finish), st.fine, WHITE); });
      segs.forEach(function (sg) {
        if (i === 1 && recess > 0) subtract(sg, [[uF1, uF1 + inF * tExt]]).forEach(function (s2) { plate(s2[0], s2[1], zc, zc + CON.ceil, st.cutm); });
        else plate(sg[0], sg[1], zc, zc + CON.ceil, st.cutm);
      });
      holes.forEach(function (h) { h.forEach(function (ye) { doc.line(X(ye), V(zc), X(ye), V(Fz), st.cut); }); });
      if (i === 1 && recess > 0 && detail) betweenBeams(beams, innerF, uF1).forEach(function (bb) { doc.zigzag(X(bb[0] + 8), V(Fz - tPl - 100), X(bb[1] - 8), V(Fz - tPl - 2), st.hatch, true); });
    });
    (function () {   // 屋根
      var zc = FL[nL - 1] + CH[nL - 1], deck = CON.deck, bh = CON.roofBeamH, span = [lo(innerF, innerB), hi(innerF, innerB)];
      var holes = roofOps.filter(function (r) { return r.iv; }).map(function (r) { return r.iv; });
      var segs = subtract(span, holes);
      if (rfLevel) return;   // 最上階が屋上テラス：床は階の床として描いた。屋根の板は roofs
      if (RC) { segs.forEach(function (sg) { doc.rect(X(sg[0]), V(zc), X(sg[1]), V(rz), 0, 'none', WHITE); plate(sg[0], sg[1], rz - num(m.slab, 300), rz); }); holes.forEach(function (h) { h.forEach(function (ye) { doc.line(X(ye), V(rz - num(m.slab, 300)), X(ye), V(rz), st.cut); }); }); return; }
      if (openTop) { segs.forEach(function (sg) { doc.rect(X(sg[0]), V(zc), X(sg[1]), V(rz), 0, 'none', WHITE); plate(sg[0], sg[1], rz - deck, rz); }); return; }
      segs.forEach(function (sg) { doc.rect(X(sg[0]), V(zc), X(sg[1]), V(rz), 0, 'none', WHITE); });
      var beams = beamsFor('__roof', holes);
      if (detail) betweenBeams(beams, span[0], span[1]).forEach(function (bb) { subtract(bb, holes).forEach(function (b2) { if (b2[1] - b2[0] > 60) doc.zigzag(X(b2[0] + 6), V(rz - deck - CON.roofIns), X(b2[1] - 6), V(rz - deck - 2), st.hatch, true); }); });
      beams.forEach(function (b) { if (b[1] <= span[0] || b[0] >= span[1]) return; matTimber(doc, st, X(b[0]), V(rz - deck - bh), X(b[1]), V(rz - deck)); });
      segs.forEach(function (sg) { plate(sg[0], sg[1], rz - deck, rz); if (detail) doc.line(X(sg[0]), V(rz - 28), X(sg[1]), V(rz - 28), st.fine, WHITE); plate(sg[0], sg[1], zc, zc + CON.ceil, st.cutm); });
      [span[0], span[1]].forEach(function (y, k) { doc.line(X(y), V(rz), X(y), V(rz + 300), st.vis); var sg = k === 0 ? 1 : -1; solid(doc, X(lo(y, y + sg * 18)), V(rz + 250), X(hi(y, y + sg * 18)), V(rz + 300)); });
      roofOps.forEach(function (ro) {
        if (!ro.iv) return;
        var h0 = ro.iv[0], h1 = ro.iv[1], fr = 45, curb = 300;
        [[h0 - fr, h0], [h1, h1 + fr]].forEach(function (yy) { matTimber(doc, st, X(yy[0]), V(rz - deck), X(yy[1]), V(rz + curb)); });
        [h0, h1].forEach(function (ye) { doc.line(X(ye), V(zc), X(ye), V(rz - deck), st.cut); });
        doc.poly([[X(h0 - fr - 4), V(rz)], [X(h0 - fr - 4), V(rz + curb + 4)], [X(h1 + fr + 4), V(rz + curb + 4)], [X(h1 + fr + 4), V(rz)]], st.vis, INK, 'none', true);
        if (ro.f.kind === 'skylight') {
          var zt0 = rz + curb + 4, zt1 = zt0 + (h1 - h0) / 20;
          solid(doc, X(h0 - fr - 30), V(zt0), X(h0 + 30), V(zt0 + 60)); solid(doc, X(h1 - 30), V(zt1), X(h1 + fr + 30), V(zt1 + 60));
          doc.line(X(h0 + 30), V(zt0 + 40), X(h1 - 30), V(zt1 + 40), st.far); doc.line(X(h0 + 30), V(zt0 + 15), X(h1 - 30), V(zt1 + 15), st.far);
        } else solid(doc, X(h0 - fr - 30), V(rz + curb + 4), X(h1 + fr + 30), V(rz + curb + 54));
      });
    })();

    // ---- 8. 壁の切断（外壁は階をまとめて 1 本の帯。間仕切りは階ごと） --------------------------------
    var bands = {};
    cutWalls.forEach(function (c) {
      if (!c.ext) return;
      var key = Math.round(c.u0) + ':' + Math.round(c.u1);
      var z0 = c.i === 0 ? ((c.holes.some(function (o) { return (o.sill || 0) <= 0; })) ? FL[0] : CON.stemTop + 105) : FL[c.i];
      var z1 = c.i === nL - 1 ? (openTop ? (roofs.length && !rfLevel ? rz : levelTop(ls, c.i)) : top - 30) : levelTop(ls, c.i);
      if (isFinite(+c.w.h)) z1 = FL[c.i] + +c.w.h;   // 壁ごとの高さ（屋上の手摺壁など）
      if (recess > 0 && c.i === 0 && c.front) z1 = FL[1] - CON.finish - CON.ply - CON.beamH;
      if (recess > 0 && c.i === 1 && c.front) z0 = FL[0] + CH[0];
      if (!bands[key]) bands[key] = { u0: c.u0, u1: c.u1, z0: z0, z1: z1, holes: [], outer: (Math.abs(c.u0 - lo(uF, uB)) < 1 || Math.abs(c.u0 - lo(uF1, uB)) < 1) ? c.u0 : c.u1, wins: [] };
      var B = bands[key]; B.z0 = Math.min(B.z0, z0); B.z1 = Math.max(B.z1, z1);
      c.holes.forEach(function (o) { B.holes.push([FL[c.i] + (o.sill || 0), FL[c.i] + o.head]); B.wins.push({ o: o, i: c.i }); });
    });
    var isFrontBand = function (B) { return Math.abs(B.outer - uF) < 1 || Math.abs(B.outer - uF1) < 1; };
    Object.keys(bands).forEach(function (k) {
      var B = bands[k], yo = B.outer, yi = yo === B.u0 ? B.u1 : B.u0, sgn = yi > yo ? 1 : -1;
      subtract([B.z0, B.z1], B.holes).forEach(function (zz) {
        if (st.poche) { doc.fill(X(B.u0), V(zz[0]), X(B.u1), V(zz[1]), INK); return; }
        if (RC) { matConcrete(doc, st, X(B.u0), V(zz[1]), X(B.u1), V(zz[0]), rnd); return; }   // RC：コンクリートの記号
        doc.rect(X(B.u0), V(zz[0]), X(B.u1), V(zz[1]), 0, 'none', WHITE);
        if (zz[1] - zz[0] > 120) { var ya = yo + sgn * CON.layers[0], yb = ya + sgn * CON.layers[1]; doc.zigzag(X(lo(ya, yb) + 6), V(zz[1] - 25), X(hi(ya, yb) - 6), V(zz[0] + 25), st.hatch, false); }
        doc.rectIn(X(B.u0), V(zz[0]), X(B.u1), V(zz[1]), st.cut, 'none');
      });
      // 胴差・軒桁（壁の中の梁）と笠木（木造のとき）
      var ya2 = yo + sgn * CON.layers[0], lo2 = lo(ya2, ya2 + sgn * CON.layers[1]), hi2 = hi(ya2, ya2 + sgn * CON.layers[1]);
      if (!RC) ls.forEach(function (l, i) { if (i === 0 || l.fl <= B.z0 || l.fl > B.z1) return; var z1 = l.fl - CON.finish - CON.ply; matTimber(doc, st, X(lo2), V(z1 - CON.beamH), X(hi2), V(z1)); });
      if (B.z1 >= top - 31 && !RC && !openTop) {
        matTimber(doc, st, X(lo2), V(rz - CON.deck - CON.roofBeamH), X(hi2), V(rz - CON.deck));
        var ov = CON.copingOver, yo2 = yo - sgn * ov, yi2 = yi + sgn * ov, tp = top - 30;
        doc.poly([[X(yo2), V(tp - 40)], [X(yo2), V(top)], [X(yi2), V(top - 12)], [X(yi2), V(tp - 40)]], st.cutm, INK, 'none', true, null, 'miter');
        if (detail) matTimber(doc, st, X(lo(yo, yi)), V(tp - 2), X(hi(yo, yi)), V(tp + 22));
      }
      // 開口の切断：枠・ガラス・膳板・水切り・窓台・まぐさ・額縁・手摺・シャッター
      B.wins.forEach(function (wn) {
        var o = wn.o, fl = FL[wn.i], z0 = fl + (o.sill || 0), z1 = fl + o.head, fa = yo + sgn * 15, fb = yo + sgn * 85, lw = lo(fa, fb), hw = hi(fa, fb), mid = (lw + hw) / 2, fh = 40, floorLevel = (o.sill || 0) <= 0;
        doc.line(X(yo), V(z0), X(yo), V(z1), st.vis); doc.line(X(yi), V(z0), X(yi), V(z1), st.vis);
        doc.line(X(lw), V(z0 + fh), X(lw), V(z1 - fh), st.far); doc.line(X(hw), V(z0 + fh), X(hw), V(z1 - fh), st.far);
        solid(doc, X(lw), V(z1 - fh), X(hw), V(z1));
        var zb = floorLevel ? z0 + 25 : z0 + fh; solid(doc, X(lw), V(z0), X(hw), V(zb));
        var zt = z1 - fh;
        if (o.type === 'door' && !o.panels) { doc.line(X(mid), V(zb), X(mid), V(zt), st.far); }
        else { doc.line(X(mid - 14), V(zb), X(mid - 14), V(zt), st.far); doc.line(X(mid + 14), V(zb), X(mid + 14), V(zt), st.far); }
        if (detail) {
          var inner = sgn > 0 ? hw : lw;
          if (!floorLevel) {
            doc.rect(X(inner), V(z0 + fh - 18), X(yi + sgn * 25), V(z0 + fh + 7), st.cutm, INK, WHITE);               // 膳板
            doc.poly([[X(sgn > 0 ? lw : hw), V(z0 + 8)], [X(yo - sgn * 35), V(z0 - 22)], [X(yo - sgn * 35), V(z0 - 52)]], st.far, INK, 'none', true, null, 'miter');   // 水切り
            matTimber(doc, st, X(lo2), V(z0 - 45), X(hi2), V(z0));                                               // 窓台
          }
          doc.rect(X(inner), V(z1 - fh + 18), X(yi + sgn * 15), V(z1 - fh - 7), st.cutm, INK, WHITE);               // 額縁
          if (!(recess > 0 && wn.i === 0 && isFrontBand(B))) matTimber(doc, st, X(lo2), V(z1), X(hi2), V(z1 + 105));   // まぐさ
        }
        if (o.rail) {   // 掃き出し窓の外の手摺：切断では手摺子 1 本、笠木と下桟は丸の切り口
          var yr = yo - sgn * 90;
          doc.line(X(yr), V(fl + 110), X(yr), V(fl + 1100), st.vis);
          [[fl + 1100, 17], [fl + 110, 14]].forEach(function (zr) { doc.line(X(yr), V(zr[0]), X(yo), V(zr[0]), st.vis); doc.dot(X(yr), V(zr[0]), Math.max(zr[1] / s, 0.2)); });
        }
        if (o.shutter) {   // 防火シャッターの巻き取りの箱：前面が後退線の上なら室内の天井内（法 44 条）、縁の形なら外
          var yb0 = (!recess && wn.i === 0) ? yi + sgn * 270 : yo, by0 = lo(yb0 - sgn * 260, yb0 - sgn * 10), by1 = hi(yb0 - sgn * 260, yb0 - sgn * 10);
          doc.rect(X(by0), V(z1 + 5), X(by1), V(z1 + 225), st.cutm, INK, WHITE);
          doc.circle(X((by0 + by1) / 2), V(z1 + 125), 80 / s, st.fine, INK, 'none');
        }
      });
    });
    // 間仕切り（切断）
    cutWalls.forEach(function (c) {
      if (c.ext) return;
      var fl = FL[c.i], zc = fl + CH[c.i], door = c.holes[0] || null, holes = door ? [[fl, fl + door.head]] : [];
      subtract([fl, zc], holes).forEach(function (zz) { if (st.poche) doc.fill(X(c.u0), V(zz[0]), X(c.u1), V(zz[1]), INK); else doc.rectIn(X(c.u0), V(zz[0]), X(c.u1), V(zz[1]), st.cut); });
      if (door) {
        var zh = fl + door.head; solid(doc, X(c.u0 - 10), V(zh - 25), X(c.u1 + 10), V(zh));
        if (door.variant === 'closet') { var at = (c.u0 + c.u1) / 2; [at - 35, at + 5].forEach(function (yy) { doc.rectIn(X(yy), V(fl + 10), X(yy + 30), V(zh - 25), st.cutm); }); }
        else { doc.line(X(c.u0), V(fl), X(c.u0), V(zh), st.vis); doc.line(X(c.u1), V(fl), X(c.u1), V(zh), st.vis); }
      }
    });
    // 独立柱の切断（床から上端まで。RC は塗り、1:50 はコンクリートの記号）
    cutCols.forEach(function (cc) { if (st.poche || !detail) doc.fill(X(cc.iv[0]), V(cc.z[0]), X(cc.iv[1]), V(cc.z[1]), INK); else matConcrete(doc, st, X(cc.iv[0]), V(cc.z[1]), X(cc.iv[1]), V(cc.z[0]), rnd); });
    // 斜路の切断：沿って切れば傾いた床（厚さ T）と手摺、横切れば局所の高さの切り口
    cutRamps.forEach(function (cr) {
      var G = cr.G, sg = cr.sg, rr = cr.rr;
      if (cr.along) {
        var ua = rr.u0, ub = rr.u1, za = cr.zAt(ua), zb = cr.zAt(ub);
        doc.poly([[X(ua), V(za)], [X(ub), V(zb)], [X(ub), V(zb - G.T)], [X(ua), V(za - G.T)]], 0, 'none', WHITE);
        if (st.poche) doc.poly([[X(ua), V(za)], [X(ub), V(zb)], [X(ub), V(zb - G.T)], [X(ua), V(za - G.T)]], 0, 'none', INK);
        else doc.poly([[X(ua), V(za)], [X(ub), V(zb)], [X(ub), V(zb - G.T)], [X(ua), V(za - G.T)]], st.cut, INK, 'none');
        doc.line(X(ua), V(za + 900), X(ub), V(zb + 900), st.vis); doc.line(X(ua), V(za + 860), X(ub), V(zb + 860), st.far);   // 手摺（見えがかり：奥の側）
        for (var u = ua + 300; u < ub; u += 1200) doc.line(X(u), V(cr.zAt(u)), X(u), V(cr.zAt(u) + 860), st.fine);
        cutRamps.note = cutRamps.note || []; cutRamps.note.push({ u: (ua + ub) / 2, z: (za + zb) / 2 + 1300, t: '斜路 1:' + Math.round(Math.abs(ub - ua) / Math.max(1, Math.abs(zb - za))) });
      } else {
        var dp = wd(sg.p), dq = wd(sg.q), tt = Math.abs(dp - dq) < 1e-6 ? 0.5 : Math.min(1, Math.max(0, dp / (dp - dq))), zc = sg.za + (sg.zb - sg.za) * tt;   // 切断線と中心線の交点の高さ
        if (st.poche) doc.fill(X(rr.u0), V(zc - G.T), X(rr.u1), V(zc), INK); else doc.rectIn(X(rr.u0), V(zc - G.T), X(rr.u1), V(zc), st.cut);
        [rr.u0 + 40, rr.u1 - 40].forEach(function (u) { doc.line(X(u), V(zc), X(u), V(zc + 900), st.vis); doc.dot(X(u), V(zc + 900), Math.max(20 / s, 0.2)); });
      }
    });
    // ブリーズ・ソレイユの切断：横切れば箱の輪郭（奥行×高さ）と横板の切り口（黒）、奥の羽根の見えがかり。沿って切れば羽根の切り口（黒）
    cutScreens.forEach(function (cs) {
      var G = cs.G, rr = cs.rr;
      if (!cs.along) {
        doc.rect(X(rr.u0), V(G.z0), X(rr.u1), V(G.z1), 0, 'none', WHITE);
        G.fins.forEach(function () { });
        doc.rect(X(rr.u0), V(G.z0), X(rr.u1), V(G.z1), st.vis, INK, 'none');   // 奥の羽根の面（箱）
        G.rows.forEach(function (z) { solid(doc, X(rr.u0), V(z), X(rr.u1), V(z + G.t)); });
        if (!G.rows.length) solid(doc, X(rr.u0), V(G.z0), X(rr.u1), V(G.z0 + G.t));
      } else {
        G.fins.forEach(function (sx) { var u0 = wu(G.at(sx, 0)), u1 = wu(G.at(sx + G.t, 0)); solid(doc, X(Math.min(u0, u1)), V(G.z0), X(Math.max(u0, u1)), V(G.z1)); });
        G.rows.forEach(function (z) { doc.rect(X(rr.u0), V(z), X(rr.u1), V(z + G.t), st.vis, INK, WHITE); });
      }
    });
    // 屋根の板の切断（孔を抜く。曲面は折れ線）
    cutRoofs.forEach(function (cr) {
      cr.ivs.forEach(function (iv) {
        subtract(iv, cr.holes).forEach(function (sg) {
          var pts = [], k, n = cr.rise > 0 ? 12 : 1;
          for (k = 0; k <= n; k++) pts.push([X(sg[0] + (sg[1] - sg[0]) * k / n), V(cr.zTop(sg[0] + (sg[1] - sg[0]) * k / n))]);
          for (k = n; k >= 0; k--) pts.push([X(sg[0] + (sg[1] - sg[0]) * k / n), V(cr.zTop(sg[0] + (sg[1] - sg[0]) * k / n) - cr.T)]);
          doc.poly(pts, 0, 'none', WHITE);
          if (st.poche || !detail) doc.poly(pts, 0, 'none', INK); else { doc.poly(pts, st.cut, INK, 'none'); doc.stipple(X(sg[0]), V(cr.z1), X(sg[1]), V(cr.z1 - cr.T), 0.9, rnd); }
        });
        cr.holes.forEach(function (h) { h.forEach(function (ue) { if (ue > iv[0] && ue < iv[1]) doc.line(X(ue), V(cr.zTop(ue) - cr.T), X(ue), V(cr.zTop(ue)), st.cut); }); });
      });
    });
    cutFix.forEach(function (f) { furniture(f, true); });
    stairCut.forEach(function (fn) { fn(); });

    // ---- 9. 地盤線 ------------------------------------------------------------------------------
    doc.line(X(uEndF), V(0), X(uF1), V(0), st.ground);
    doc.line(X(uB), V(0), X(uEndB), V(0), st.ground);

    // ---- 10. レベル記号（後ろの側）・寸法 ----------------------------------------------------------
    var uNf = X(uB), nside = -fs, uTri, uFrom, dir;
    if (nside > 0) { uTri = uNf + 4.0; uFrom = uNf + 1.0; dir = 1; } else { uTri = uNf - 4.0; uFrom = uNf - 1.0; dir = -1; }
    var marks = [['GL', 0, '±0', fl1 / s < 3.2]].concat(ls.map(function (l) { return [l.id.replace(/F$/, 'FL'), l.fl, 'GL+' + nfmt(l.fl), false]; }), rfLevel ? [] : [['RFL', rz, 'GL+' + nfmt(rz), false]], [['最高高さ', top, 'GL+' + nfmt(top), false]]);
    roofs.forEach(function (r) { if (Math.abs(+r.fl - top) > 1) marks.push([(r.name || '屋根') + ' 上端', +r.fl, 'GL+' + nfmt(+r.fl), false]); });
    marks.forEach(function (mk) { levelMark(doc, st, V(mk[1]), uFrom, uTri, mk[0], mk[2], dir, mk[3]); });
    var eave = rz - CON.eaveDrop, uf = X(uF) + fs * 1.0;
    if (!openTop) { if (fs > 0) levelMark(doc, st, V(eave), uf, uf + 5.0, '軒高', 'GL+' + nfmt(eave), 1); else levelMark(doc, st, V(eave), uf, uf - 3.2 - tw('軒高', TN) - 1.0 - tw('GL+' + nfmt(eave), TN) + 2.0, '軒高', 'GL+' + nfmt(eave), 1); }
    var r1 = V(0) + (s <= 50 ? 24.0 : 17.0), gap = 6.5, dimRows = [r1, r1 + gap, r1 + 2 * gap];
    if (gu.length > 1) dimH(doc, st, gu.map(function (q) { return X(q.u); }), gu.map(function (q) { return q.u; }), r1, r1 - 3.0);
    if (road) {
      dimH(doc, st, [X(roadFar), X(roadNear), X(uF), X(uB), X(backB)], [roadFar, roadNear, uF, uB, backB], r1 + gap, r1 + gap - 3.0);
      dimH(doc, st, [X(roadFar), X(roadNear), X(backB)], [roadFar, roadNear, backB], r1 + 2 * gap, r1 + 2 * gap - 3.0);
    } else {
      dimH(doc, st, [X(sMin), X(bMin), X(bMax), X(sMax)], [sMin, bMin, bMax, sMax], r1 + gap, r1 + gap - 3.0);
      dimH(doc, st, [X(sMin), X(sMax)], [sMin, sMax], r1 + 2 * gap, r1 + 2 * gap - 3.0);
    }
    if (recess > 0) dimH(doc, st, [X(uF), X(uF1)], [uF, uF1], V(1900));
    var zs = [0].concat(FL, [rz, top]);
    dimV(doc, st, zs.map(V), zs, uNf + nside * 31.0);
    dimV(doc, st, [V(0), V(top)], [0, top], uNf + nside * 38.0);
    if (road) {
      var vt = V(top + 300);
      dimH(doc, st, [X(cl), X(uF)], [cl, uF], vt, [null, V(top) - 0.5]);
      doc.text(X(cl), vt - 3.2, '道路中心線', TN, 'middle'); doc.text(X(uF), vt - 3.2, '後退線', TN, 'middle');
    }
    // 通り芯の符号
    var vC = dimRows[2] + 6.2;
    gu.forEach(function (q) { doc.line(X(q.u), V(-900), X(q.u), vC - 2.3, st.grid, INK, chainDash(st.grid)); doc.circle(X(q.u), vC, 2.3, st.fine, INK, WHITE); doc.text(X(q.u), vC + 0.75, q.id, TN, 'middle'); });

    // ---- 11. 室名・注記 ---------------------------------------------------------------------------
    function room(u, z, name, sub, size) { doc.text(X(u), V(z), name, size || TR, 'middle'); if (sub) doc.text(X(u), V(z) + 3.0, sub, TN, 'middle'); }
    roomLabels.forEach(function (rl) { room(rl.u, rl.z, rl.t, rl.sub, rl.size); });
    (stairCut.note || []).forEach(function (nt) { room(nt.u, nt.z, nt.t1, nt.t2, TN); });
    (cutRamps.note || []).forEach(function (nt) { room(nt.u, nt.z, nt.t, null, TN); });
    if (recess > 0) room(uF + inF * 300, 1150, '縁');
    if (road) {
      room(cl, 2300, road.width < 4000 ? '路地' : '道路');
      if (uF !== roadNear) room(roadNear + inF * (uF - roadNear) / 2, 2300, '後退', null, TN);
      if (opt.context !== false && nbFront) room(roadFar + fs * 2200, 2850, '隣家', nbFront.kind || null);
      doc.text(X(backB) + nside * 0.6, V(1500) - 0.8, '隣地境界', TN, nside > 0 ? 'start' : 'end');
      doc.text(X(roadNear) + fs * 0.6, V(1500) - 0.8, '道路境界', TN, fs > 0 ? 'start' : 'end');
      var ux = X(enshou[0]) + (inF > 0 ? -0.8 - 0.14 * TN : 0.8 + 0.86 * TN);
      doc.text(ux, V(250), '延焼ライン 3m', TN, 'start', 400, -90);
      doc.text(X(enshou[1]), V(enshou[3]) - 1.2, '延焼ライン 5m', TN, 'middle');
    } else {
      doc.text(Math.min(X(sMin), X(bMin)) - 0.6, V(1500) - 0.8, '隣地境界', TN, 'end'); doc.text(Math.max(X(sMax), X(bMax)) + 0.6, V(1500) - 0.8, '隣地境界', TN, 'start');
    }
    if (!rfLevel) room((innerF + innerB) / 2 + inF * ((innerB - innerF) * inF) * -0.2, rz + 500, '屋上');
    roofs.forEach(function (r) { var rr = urange(P, r.polygon.map(function (p) { return [+p[0], +p[1]]; })); if (rr.d0 < 0 && rr.d1 > 0 && r.name) doc.text(X((rr.u0 + rr.u1) / 2), V(+r.fl) - 1.2, r.name + '（版 ' + nfmt(num(r.thickness, 300)) + '）', TN, 'middle'); });

    // ---- 12. キープラン（1:400・北が上）とスケールバー：前の側の地盤の下 ----------------------------
    (function () {
      var k = 400, b = fp.b, sb = sPoly ? bbox(sPoly) : [b[0] - 650, b[1] - 650, b[2] + 650, b[3] + 650];
      var yTop = sb[3] + 700, yBot = sb[1] - (road ? road.width : 0) - 700, xL = sb[0] - 700, xR = sb[2] + 700;
      var kpW = (xR - xL) / k + 8, kpH = (yTop - yBot) / k + 7, bar = (s <= 50 ? 3000 : 5000) / s;
      var vA = V(-mmr(4.0)) + 6.0, uA, uB2;
      if (fs < 0) { uA = X(uEndF) + 2; uB2 = road ? X(roadFar) - 8 : X(uF) - 8; } else { uA = road ? X(roadFar) + 8 : X(uF) + 8; uB2 = X(uEndF) - 2; }
      if (!road) { uA = X(uEndF) - kpW - bar - 14; uB2 = X(uEndF) - 4; }
      var x0;
      var showScale = !(opt.layers && opt.layers.scale === false), showKey = !(opt.layers && opt.layers.keyplan === false);
      if (uB2 - uA >= bar + kpW + 6) { x0 = fs < 0 ? uA : uB2 - kpW; if (showKey) keyplan(x0, vA); if (showScale) scaleBar(doc, st, fs < 0 ? x0 + kpW + 4 : uA, dimRows[2] - 1.0, s, s <= 50 ? 3 : 5, 1); }
      else { x0 = fs < 0 ? uA : uB2 - Math.max(kpW, bar + 4); if (showKey) keyplan(x0, vA); if (showScale) scaleBar(doc, st, x0, vA + kpH + 3.0, s, s <= 50 ? 3 : 5, 1); }
      function keyplan(ux, vy) {
        var ox = ux + 4.0, oy = vy + 3.5;
        function K(x, y) { return [ox + (x - xL) / k, oy + (yTop - y) / k]; }
        function KP(pts) { return pts.map(function (p) { return K(p[0], p[1]); }); }
        if (sPoly) doc.poly(KP(sPoly), st.fine, INK, 'none', false, dashDash(0.13));
        (site.roads || []).forEach(function (r) { var e = roadEdge(site, r); if (!e) return; var dv = DIRV[e.side], a = sb, far = e.side === 'S' ? a[1] - r.width : e.side === 'N' ? a[3] + r.width : e.side === 'W' ? a[0] - r.width : a[2] + r.width; if (dv[1]) { var p0 = K(xL, far), p1 = K(xR, far); doc.line(p0[0], p0[1], p1[0], p1[1], st.fine); var tx = K((a[0] + a[2]) / 2, (far + (e.side === 'S' ? a[1] : a[3])) / 2); doc.text(tx[0], tx[1] + 0.7, r.name || '路地', TN, 'middle'); } else { var q0 = K(far, sb[1]), q1 = K(far, sb[3]); doc.line(q0[0], q0[1], q1[0], q1[1], st.fine); } });
        doc.poly(KP(fp.poly), st.vis, INK, 'none');
        if (recess > 0 && roadSide) { var dv2 = DIRV[roadSide], rl = roadSide === 'S' ? b[1] + recess : roadSide === 'N' ? b[3] - recess : roadSide === 'W' ? b[0] + recess : b[2] - recess; if (dv2[1]) { var r0 = K(b[0], rl), r1b = K(b[2], rl); doc.line(r0[0], r0[1], r1b[0], r1b[1], st.fine); } else { var r2 = K(rl, b[1]), r3 = K(rl, b[3]); doc.line(r2[0], r2[1], r3[0], r3[1], st.fine); } }
        (m.stairs || []).forEach(function (sd) { doc.poly(KP(stairSteps(m, sd).full), st.fine, INK, 'none'); });
        // 切断線（ISO 128-40：細い一点鎖線、両端と見る向きの矢印は太線、同じ大文字 2 つ）
        var secs = opt.cut ? [{ id: id, a: sec.a, b: sec.b, look: sec.look }].concat((m.sections || []).filter(function (x) { return x.id !== id; })) : (m.sections || []);
        secs.forEach(function (sc) {
          var mine = sc.id === id, wide = mine ? 0.5 : 0.25, L = DIRV[sc.look] || [0, 1], R = [L[1], -L[0]];
          var along = Math.abs(R[0]) > 0.7 ? 'x' : 'y', at = along === 'x' ? sc.a[1] : sc.a[0];
          var pA = along === 'x' ? K(xL, at) : K(at, yBot), pB = along === 'x' ? K(xR, at) : K(at, yTop);
          doc.line(pA[0], pA[1], pB[0], pB[1], st.fine, INK, chainDash(0.13));
          [pA, pB].forEach(function (p, j) {
            var sg = along === 'x' ? (j === 0 ? -1 : 1) : (j === 0 ? 1 : -1);
            if (along === 'x') { doc.line(p[0], p[1], p[0] + sg * 1.4, p[1], wide); doc.line(p[0], p[1], p[0], p[1] - L[1] * 1.6, wide); doc.poly([[p[0] - 0.55, p[1] - L[1] * 1.5], [p[0], p[1] - L[1] * 2.4], [p[0] + 0.55, p[1] - L[1] * 1.5]], 0, 'none', INK); doc.text(p[0] + sg * 0.6, p[1] - L[1] * 2.8 + (L[1] > 0 ? 0 : 1.6), sc.id, TN, sg > 0 ? 'start' : 'end', mine ? 700 : 400); }
            else { doc.line(p[0], p[1], p[0], p[1] + sg * 1.4, wide); doc.line(p[0], p[1], p[0] + L[0] * 1.6, p[1], wide); doc.poly([[p[0] + L[0] * 1.5, p[1] - 0.55], [p[0] + L[0] * 2.4, p[1]], [p[0] + L[0] * 1.5, p[1] + 0.55]], 0, 'none', INK); doc.text(p[0] + L[0] * 2.8, p[1] + 0.7, sc.id, TN, L[0] > 0 ? 'start' : 'end', mine ? 700 : 400); }
          });
        });
        if (opt.layers && opt.layers.north === false) return;
        var c = K(xR, yTop); c[0] += 4.0; c[1] += 4.0;
        doc.line(c[0], c[1] + 5.0, c[0], c[1] + 0.6, st.fine);
        doc.poly([[c[0], c[1] - 0.6], [c[0] - 0.8, c[1] + 1.4], [c[0] + 0.8, c[1] + 1.4]], 0, 'none', INK);
        doc.text(c[0], c[1] - 1.4, 'N', TN, 'middle');
      }
    })();

    // ---- 13. 図題 ----------------------------------------------------------------------------------
    var cap = null;
    if (opt.title !== false) {
      var cutDesc = st.poche ? '切断面は黒く塗り' : (RC ? '切断面は太線とコンクリートの記号で描き' : '切断面は太線と材料の記号（コンクリート・木・断熱材・砕石）で描き');
      var look = DIRNAME[dirOf(P.L)] + 'を見る', axisDesc = isUx ? '東西に' : '南北に';
      var where = road ? (frontName === 'S' || roadSide ? DIRNAME[roadSide] + 'の' + (road.width < 4000 ? '路地' : '道路') + 'から奥へ' : '') : '';
      var stairIn = (stairCut.note || []).length > 0;
      var elems = [].concat(cutCols.length ? ['独立柱'] : [], Object.keys(slabHoles).some(function (k) { return voidPolysAt(m, k).length > 0; }) ? ['吹抜'] : [], cutRamps.length ? ['斜路の傾いた床'] : [], cutScreens.length ? ['ブリーズ・ソレイユ'] : [], cutRoofs.length ? ['屋根の板' + (cutRoofs.some(function (c) { return c.holes.length; }) ? 'と孔' : '')] : []);
      var body = opt.caption || ((m.name ? m.name : '建物') + 'を' + where + axisDesc + '切り、' + look + '。' + cutDesc + '、奥に見える壁・扉・家具' + (stairIn ? '・階段の桁・手摺' : '') + 'は細線' + (road && opt.context !== false && nbFront ? '、灰は' + DIRNAME[roadSide] + 'の隣家' : '') + '。' +
        (elems.length ? elems.join('・') + 'はモデルの要素から描いた。' : '') +
        (road ? '破線は延焼のおそれのある部分の境（道路中心線から1階3m・2階以上5m）。' : '') +
        (stairIn ? '直階段は上り口をそろえて同じ向きに重ね、上の段は下の段の吹抜けの上にかかる。' : '') +
        (sunInfo ? '赤の線は冬至の南中の日射（北緯' + CON.latitude.toFixed(1) + '°、高度' + Math.round(sunInfo.alt) + '°）で、隣家の軒先の影はこちらの外壁のGL+' + nfmt(Math.round(sunInfo.zHit / 10) * 10) + 'まで上がるが、2階の窓からは外壁から' + nfmt(Math.round(sunInfo.depth / 10) * 10) + 'の奥まで日が入る。' : '') + '筆者作成。');
      cap = { num: opt.num, title: opt.title || (id + '-' + id + '′ 断面図（1:' + s + '）。'), body: body };
    }
    return doc.finish(opt, cap);
  }

  // ================================================================ 立面図
  var EL = { base: 300, jointPitch: 455, railTop: 1100, railBot: 120, barPitch: 120, postPitch: 1200, railExt: 100, shutterRail: 70, shutterBox: 450,
    nbGap: 450, nbShown: 1050, nbEave: 5650, nbPitch: 0.4, nbBarge: 180, nbVerge: 300, dpD: 75, dpHeadH: 280, dpHeadW: 220 };   // 立面だけの判断（tools/archdraw/elevation/model.json）
  // 開口の見付け（外から／室内から）。o：{x0,x1,sill,head,kind,shutter,rail}（u と絶対の z）
  function glassMark(doc, st, x0, y0, x1, y1) {   // ガラスの印：左上に 45° の短い平行線 2 本
    var w = Math.abs(x1 - x0), h = Math.abs(y1 - y0); if (w < 6 || h < 6) return;
    var ax = Math.min(x0, x1), ay = Math.min(y0, y1), L = Math.min(w, h, 30) * 0.32;
    [[0, 1.0], [1, 0.62]].forEach(function (k) { var o = k[0] * 0.75, sx = ax + Math.min(w * 0.18, 4.0) + o, sy = ay + Math.min(h * 0.18, 4.0) + o; doc.line(sx, sy + L * k[1], sx + L * k[1], sy, st.fine); });
  }
  function slideSashes(doc, st, X, V, a0, b0, a1, b1, lod, w) {   // 引違い 2 枚：右の障子が手前
    var xc = (a0 + a1) / 2, o = 30, stl = 35;
    if (lod <= 50) {
      doc.rect(X(a0), V(b0), X(xc + o / 2), V(b1), w, INK, 'none'); doc.rect(X(a0 + stl), V(b0 + stl), X(xc + o / 2 - stl), V(b1 - stl), st.fine, INK, 'none'); glassMark(doc, st, X(a0 + stl), V(b1 - stl), X(xc + o / 2 - stl), V(b0 + stl));
      doc.rect(X(xc - o / 2), V(b0), X(a1), V(b1), w, INK, WHITE); doc.rect(X(xc - o / 2 + stl), V(b0 + stl), X(a1 - stl), V(b1 - stl), st.fine, INK, 'none'); glassMark(doc, st, X(xc - o / 2 + stl), V(b1 - stl), X(a1 - stl), V(b0 + stl));
    } else doc.line(X(xc), V(b0), X(xc), V(b1), st.fine);
  }
  function slide4Sashes(doc, st, X, V, a0, b0, a1, b1, lod, front, w, door) {   // 4 枚引違い：両端が外のレール（判断）
    var ov = 30, Wd = a1 - a0, p = (Wd + 3 * ov) / 4, lefts = [0, 1, 2, 3].map(function (i) { return a0 + i * (p - ov); });
    var fr = front === 'ends' ? [0, 3] : [1, 2], order = [0, 1, 2, 3].filter(function (i) { return fr.indexOf(i) < 0; }).concat(fr);
    var stl = door ? 60 : 35, tp = door ? 60 : 35, bt = door ? 110 : 35;
    if (lod <= 50) order.forEach(function (i) { var l = lefts[i], r = l + p; doc.rect(X(l), V(b0), X(r), V(b1), w, INK, fr.indexOf(i) >= 0 ? WHITE : 'none'); doc.rect(X(l + stl), V(b0 + bt), X(r - stl), V(b1 - tp), st.fine, INK, 'none'); glassMark(doc, st, X(l + stl), V(b1 - tp), X(r - stl), V(b0 + bt)); });
    else fr.forEach(function (i) { [lefts[i], lefts[i] + p].forEach(function (u) { if (a0 + 1 < u && u < a1 - 1) doc.line(X(u), V(b0), X(u), V(b1), st.fine); }); });
  }
  function windowFace(doc, st, X, V, o, lod, frameW, interior) {
    var x0 = Math.min(o.x0, o.x1), x1 = Math.max(o.x0, o.x1), sl = o.sill, hd = o.head, k = o.kind, f = 40;
    if (interior) { doc.rect(X(x0 - 20), V(sl - (sl <= 0 ? 0 : 20)), X(x1 + 20), V(hd + 20), st.vis, INK, WHITE); doc.rect(X(x0), V(sl), X(x1), V(hd), st.fine, INK, 'none'); }
    else doc.rect(X(x0), V(sl), X(x1), V(hd), frameW, INK, WHITE);
    if (lod <= 50) {
      if (!interior && k !== 'shop4' && sl > 0) { doc.line(X(x0 - 25), V(sl - 25), X(x1 + 25), V(sl - 25), st.fine); doc.line(X(x0 - 25), V(sl - 25), X(x0 - 25), V(sl), st.fine); doc.line(X(x1 + 25), V(sl - 25), X(x1 + 25), V(sl), st.fine); }
      doc.rect(X(x0 + f), V(sl + f), X(x1 - f), V(hd - f), st.fine, INK, 'none');
    }
    var i0 = x0 + f, i1 = x1 - f, j0 = sl + f, j1 = hd - f;
    if (k === 'fix') { if (lod <= 50) glassMark(doc, st, X(i0), V(j1), X(i1), V(j0)); }
    else if (k === 'slide') slideSashes(doc, st, X, V, i0, j0, i1, j1, lod, st.fine);
    else if (k === 'slide4' || k === 'shop4') slide4Sashes(doc, st, X, V, i0, j0, i1, j1, lod, interior ? 'center' : 'ends', st.fine, k === 'shop4');
    else if (k === 'door') { doc.rect(X(i0), V(j0), X(i1), V(j1), st.fine, INK, 'none'); var hx = o.x1 > o.x0 ? i1 - 90 : i0 + 90; doc.line(X(hx), V(sl + 900), X(hx), V(sl + 1000), st.fine); }
  }
  function shutterFace(doc, st, X, V, o, lod) {
    var rw = EL.shutterRail, bh = EL.shutterBox, x0 = Math.min(o.x0, o.x1), x1 = Math.max(o.x0, o.x1), sl = o.sill, hd = o.head;
    doc.rect(X(x0 - rw), V(sl), X(x0), V(hd), st.vis, INK, WHITE); doc.rect(X(x1), V(sl), X(x1 + rw), V(hd), st.vis, INK, WHITE);
    doc.rect(X(x0 - rw), V(hd), X(x1 + rw), V(hd + bh), st.vis, INK, WHITE);
    if (lod <= 50) { doc.line(X(x0 - rw + 30), V(hd + 30), X(x1 + rw - 30), V(hd + 30), st.fine); for (var k = 1; k < 3; k++) { var u = x0 - rw + (x1 - x0 + 2 * rw) * k / 3; doc.line(X(u), V(hd), X(u), V(hd + bh), st.fine); } }
  }
  function railingFace(doc, st, X, V, o, lod) {
    var fl = o.sill, a0 = Math.min(o.x0, o.x1) - EL.railExt, a1 = Math.max(o.x0, o.x1) + EL.railExt, top = fl + EL.railTop, bot = fl + EL.railBot;
    doc.rect(X(a0), V(top - 40), X(a1), V(top), st.vis, INK, WHITE);
    doc.rect(X(a0), V(bot), X(a1), V(bot + 30), st.fine, INK, WHITE);
    var n = Math.max(1, Math.round((a1 - a0) / EL.postPitch)), posts = [];
    for (var k = 0; k <= n; k++) { var u = a0 + (a1 - a0) * k / n, uu = Math.min(Math.max(u, a0 + 20), a1 - 20); posts.push(uu); doc.rect(X(uu - 20), V(fl + 30), X(uu + 20), V(top - 40), st.fine, INK, WHITE); }
    if (lod <= 50) for (var u2 = a0 + EL.barPitch / 2; u2 < a1 - EL.barPitch / 2 + 1; u2 += EL.barPitch) if (posts.every(function (pu) { return Math.abs(u2 - pu) > 40; })) doc.line(X(u2), V(bot + 30), X(u2), V(top - 40), st.fine);
  }
  function kindOf(o) { var n = o.panels || (o.type === 'door' ? 1 : 2); if (o.shutter && n >= 4) return 'shop4'; if (o.type === 'door' && n === 1) return 'door'; if (o.type === 'fix') return 'fix'; return n >= 4 ? 'slide4' : 'slide'; }

  function elevation(m, dir, opt) {
    opt = opt || {}; dir = dir || 'S';
    var s = opt.scale || 100, st = sty(s), doc = new Doc(), lod = s <= 50 ? 50 : 100, fp = footprint(m), dv = DIRV[dir];
    if (!dv) return errSvg('向き ' + dir + ' は N/E/S/W のどれか');
    var look = [-dv[0], -dv[1]], A = [fp.c[0] - look[0] * 50000, fp.c[1] - look[1] * 50000];
    var P = new Proj(A, look, s), X = P.X, V = P.V, ls = levels(m), nL = ls.length, rz = roofZ(m), ph = parapetH(m), top = topZ(m), tExt = extT(m);
    var FL = ls.map(function (l) { return l.fl; }), CH = ls.map(function (_, i) { return chOf(ls, i); }), fl1 = FL[0] != null ? FL[0] : 150;
    var RC = rcOf(m), roofs = roofsOf(m), rfLv = roofIsLevel(m), hasRoofs = roofs.length > 0, mats = m.materials || {}, columns = columnsOf(m), screens = screensOf(m);
    var r = urange(P, fp.poly), xl = r.u0, xr = r.u1;
    var site = m.site || {}, sPoly = site.polygon && site.polygon.length >= 3 ? site.polygon : null, sb = sPoly ? bbox(sPoly) : null;
    var roadSide = null; (site.roads || []).forEach(function (rd) { var e = roadEdge(site, rd); if (e && !roadSide) roadSide = e.side; });
    var isFront = roadSide === dir, recess = isFront ? (opt.recess != null ? opt.recess : (m.recess || 0)) : 0;
    var soffit = fl1 + CH[0], base = EL.base, tags = doorTags(m), notes = [];
    // 正面の壁と開口（u と絶対の z）
    var ops = [];
    (m.walls || []).forEach(function (w) {
      if (!isExt(w)) return;
      var g = wallGeo(w), on = outward(w, fp.c);
      if (on[0] * dv[0] + on[1] * dv[1] < 0.7 || Math.abs(g.u[0] * P.R[0] + g.u[1] * P.R[1]) < 0.7) return;
      var i = lvIndex(m, w.level); if (i < 0) return;
      openingsOf(m, w).forEach(function (o) {
        var pa = P.wu(g.at(o.at)), pb = P.wu(g.at(o.at + o.width));
        ops.push({ o: o, i: i, x0: Math.min(pa, pb), x1: Math.max(pa, pb), sill: FL[i] + (o.sill || 0), head: FL[i] + o.head, kind: kindOf(o), shutter: !!o.shutter, rail: !!o.rail, tag: tags[o.id] || 'AW', fire: !!o.fire });
      });
    });
    ops.sort(function (a, b) { return a.i - b.i || a.x0 - b.x0; });
    // 隣家（灰）：左右の側に隣地があれば
    var leftDir = dirOf([-P.R[0], -P.R[1]]), rightDir = dirOf(P.R), nbs = (site.neighbors || []).map(function (n) { return n.side; });
    var farL = xl - 75, farR = xr + 75, ctx = opt.context !== false;
    [[-1, leftDir], [1, rightDir]].forEach(function (sd) {
      var side = sd[0]; if (!ctx || nbs.indexOf(sd[1]) < 0) return;
      var wall = side < 0 ? xl - EL.nbGap : xr + EL.nbGap, far = wall + side * EL.nbShown, vg = wall - side * EL.nbVerge;
      var hWall = EL.nbEave + EL.nbVerge * EL.nbPitch, hFar = EL.nbEave + Math.abs(far - vg) * EL.nbPitch, bh = EL.nbBarge;
      doc.line(X(wall), V(0), X(wall), V(hWall), st.far, GRAY);
      doc.poly([[X(far), V(hFar)], [X(vg), V(EL.nbEave)], [X(vg), V(EL.nbEave + bh)], [X(far), V(hFar + bh)]], st.far, GRAY, 'none');
      breakLineV(doc, X(far), V(hFar + bh), V(0), GRAY, st.far, V(EL.nbEave * 0.45));
      var um = (wall + far) / 2;
      var nbk = site.neighbors.filter(function (n) { return n.side === sd[1]; })[0].kind;
      doc.text(X(um), V(EL.nbEave * 0.62), '隣家', TN, 'middle', 400, 0, GRAY); if (nbk) doc.text(X(um), V(EL.nbEave * 0.62) + 2.8, nbk, TN, 'middle', 400, 0, GRAY);
      if (side < 0) farL = far; else farR = far;
    });
    // 地盤
    var gA = Math.min(farL, xl) - 75, gB = Math.max(farR, xr) + 75;
    doc.hatch([[X(gA), V(0)], [X(gB), V(0)], [X(gB), V(0) + 2.4], [X(gA), V(0) + 2.4]], 45, lod <= 50 ? 1.0 : 0.9, st.fine);
    doc.line(X(gA), V(0), X(gB), V(0), st.ground);
    // 目地（先に描き、開口・樋は白で上に重ねる）
    var onFace = ops.filter(function (o) { return !(recess && o.i === 0); }), holes = [];
    onFace.forEach(function (o) { if (o.shutter) holes.push([o.x0 - EL.shutterRail - 20, o.sill - 40, o.x1 + EL.shutterRail + 20, o.head + EL.shutterBox + 20]); else holes.push([o.x0 - 40, o.sill - 40, o.x1 + 40, o.head + 10]); });
    // 換気口：台所（コンロの上）・便所（窓の脇）。正面の壁に接する室だけ（判断）
    var vents = [];
    (m.fixtures || []).forEach(function (f) {
      if (f.kind !== 'counter' || !f.hob) return; var i = lvIndex(m, f.level); if (i < 0) return;
      var pb = bbox(fixturePoly(f)), touch = dir === 'N' ? pb[3] >= fp.b[3] - tExt - 100 : dir === 'S' ? pb[1] <= fp.b[1] + tExt + 100 : dir === 'E' ? pb[2] >= fp.b[2] - tExt - 100 : pb[0] <= fp.b[0] + tExt + 100;
      if (!touch) return;
      vents.push({ u: P.wu([f.at[0] + f.hob[0], f.at[1] + f.hob[1]]), h: FL[i] + 2300, d: 150, name: '台所 換気口 φ150' + (mats.vent ? '（' + mats.vent + '）' : '') });
    });
    (m.rooms || []).forEach(function (rm) {
      if (rm.name.indexOf('便所') < 0) return; var i = lvIndex(m, rm.level); if (i < 0) return;
      var rb = bbox(rm.polygon), touch = dir === 'N' ? rb[3] >= fp.b[3] - tExt - 100 : dir === 'S' ? rb[1] <= fp.b[1] + tExt + 100 : dir === 'E' ? rb[2] >= fp.b[2] - tExt - 100 : rb[0] <= fp.b[0] + tExt + 100;
      if (!touch) return;
      var ru = [P.wu([rb[0], rb[1]]), P.wu([rb[2], rb[3]])].sort(function (a, b) { return a - b; });
      var win = ops.filter(function (o) { return o.i === i && o.x0 >= ru[0] - 1 && o.x1 <= ru[1] + 1; })[0];
      vents.push({ u: win ? win.x1 + 250 : (ru[0] + ru[1]) / 2, h: FL[i] + 2300, d: 100, name: '便所 換気口 φ100' });
    });
    vents.forEach(function (vt) { var q = vt.d / 2 + 60; holes.push([vt.u - q, vt.h - q, vt.u + q, vt.h + q]); });
    var gridSet = Math.abs(P.R[0]) > 0.7 ? (m.grid && m.grid.x) || [] : (m.grid && m.grid.y) || [], gk = Math.abs(P.R[0]) > 0.7 ? P.R[0] : P.R[1];
    var gu = gridSet.map(function (q) { return { id: q.id, u: q.at * gk }; }).sort(function (a, b) { return a.u - b.u; });
    var org = gu.length ? gu[Math.floor((gu.length - 1) / 2)].u : (xl + xr) / 2;
    // 外壁の目地：materials.jointPitch（mm）があるときだけ（以前は 455 の決め打ち）
    var jointPitch = num(mats.jointPitch, 0), wallBottom = recess ? soffit + 50 : base, jointTop = (hasRoofs || rfLv) ? top : top - CON.copingH, jx = [];
    if (jointPitch > 0) for (var k = 0; org - k * jointPitch > xl || org + k * jointPitch < xr; k++) [org - k * jointPitch, org + k * jointPitch].forEach(function (x) { if (xl + 100 < x && x < xr - 100 && jx.indexOf(x) < 0) jx.push(x); });
    jx.sort(function (a, b) { return a - b; }).forEach(function (x) {
      var hz = holes.filter(function (h) { return h[0] <= x && x <= h[2]; }).map(function (h) { return [h[1], h[3]]; });
      subtract([wallBottom, jointTop], hz).forEach(function (zz) { doc.line(X(x), V(zz[0]), X(x), V(zz[1]), st.fine); });
    });
    // 水平の目地・水切り（掃き出し窓のある階の床は除く）・笠木の下端
    // 水平の目地・水切り（掃き出し窓のある階の床は除く）：materials.flashing があるときだけ。笠木の下端はパラペットの建物だけ
    var fj = [];
    if (mats.flashing) ls.forEach(function (l, i) { if (i === 0) return; if (ops.some(function (o) { return o.i === i && o.o.sill <= 0; })) return; fj.push(l.fl - 50); });
    fj.forEach(function (hj) { doc.line(X(xl), V(hj), X(xr), V(hj), st.fine); if (lod <= 50) doc.line(X(xl), V(hj + 20), X(xr), V(hj + 20), st.fine); });
    if (!hasRoofs && !rfLv) doc.line(X(xl - CON.copingOver), V(jointTop), X(xr + CON.copingOver), V(jointTop), st.vis);
    // 1F の足元：基礎と土台水切り
    var o1 = ops.filter(function (o) { return o.i === 0; }).sort(function (a, b) { return (b.x1 - b.x0) - (a.x1 - a.x0); })[0];
    if (recess) {
      if (o1) {
        doc.rect(X(xl + tExt), V(fl1), X(xr - tExt), V(soffit), st.far, INK, 'none');
        if (o1.shutter) { var rw = EL.shutterRail; doc.rect(X(o1.x0 - rw), V(o1.sill), X(o1.x0), V(Math.min(o1.head, soffit)), st.far, INK, WHITE); doc.rect(X(o1.x1), V(o1.sill), X(o1.x1 + rw), V(Math.min(o1.head, soffit)), st.far, INK, WHITE); }
        windowFace(doc, st, X, V, o1, lod, st.far, false);
        doc.line(X(o1.x0 - 100), V(o1.sill), X(o1.x1 + 100), V(o1.sill), st.far);
      }
      doc.line(X(xl + tExt), V(soffit + 50), X(xr - tExt), V(soffit + 50), st.fine);
      [[xl, xl + tExt], [xr - tExt, xr]].forEach(function (ab) { doc.line(X(ab[0]), V(base), X(ab[1]), V(base), st.fine); });
    } else {
      var cuts = ops.filter(function (o) { return o.sill < base + 1; }).map(function (o) { return [o.x0 - (o.shutter ? EL.shutterRail : 0), o.x1 + (o.shutter ? EL.shutterRail : 0)]; });
      subtract([xl, xr], cuts).forEach(function (ab) { doc.line(X(ab[0]), V(base), X(ab[1]), V(base), lod <= 50 ? st.vis : st.fine); });
    }
    // 開口・シャッター・手すり
    onFace.forEach(function (o) {
      if (o.shutter) shutterFace(doc, st, X, V, o, lod);
      windowFace(doc, st, X, V, o, lod, st.vis, false);
      if (o.kind === 'shop4' || (o.sill <= fl1 && o.i === 0)) doc.line(X(o.x0 - 100), V(o.sill), X(o.x1 + 100), V(o.sill), st.vis);   // 沓摺
      if (o.rail) railingFace(doc, st, X, V, o, lod);
    });
    vents.forEach(function (vt) { var rr = vt.d / 2; if (lod <= 50) { var q = rr + 45; doc.rect(X(vt.u - q), V(vt.h - q), X(vt.u + q), V(vt.h + q), st.fine, INK, WHITE); } doc.circle(X(vt.u), V(vt.h), rr / s, st.fine, INK, WHITE); doc.dot(X(vt.u), V(vt.h), 0.25); });
    // ブリーズ・ソレイユ：正面を向くものは格子の模様（箱の白で壁を隠す）、直交するものは側面の箱
    var cx0 = fp.c;
    screens.forEach(function (sc0) {
      var G = screenGeo(m, sc0, cx0); if (!G) return;
      var box = [G.at(0, 0), G.at(G.L, 0), G.at(G.L, G.depth), G.at(0, G.depth)], rr = urange(P, box), facing = G.n[0] * dv[0] + G.n[1] * dv[1] > 0.7, side = Math.abs(G.n[0] * dv[0] + G.n[1] * dv[1]) < 0.3;
      if (!facing && !side) return;   // 反対側は見えない
      if (side) { if (rr.d1 <= 0) return; doc.rect(X(rr.u0), V(G.z0), X(rr.u1), V(G.z1), st.vis, INK, WHITE); G.rows.forEach(function (z) { doc.line(X(rr.u0), V(z), X(rr.u1), V(z), st.fine); doc.line(X(rr.u0), V(z + G.t), X(rr.u1), V(z + G.t), st.fine); }); return; }
      doc.rect(X(rr.u0), V(G.z0), X(rr.u1), V(G.z1), st.vis, INK, WHITE);
      G.fins.forEach(function (sx) { var u0 = P.wu(G.at(sx, 0)), u1 = P.wu(G.at(sx + G.t, 0)); doc.rect(X(Math.min(u0, u1)), V(G.z0), X(Math.max(u0, u1)), V(G.z1), st.fine, INK, WHITE); });
      G.rows.forEach(function (z) { doc.rect(X(rr.u0), V(z), X(rr.u1), V(z + G.t), st.fine, INK, WHITE); });
      // 奥の建具が見える格子の中は、羽根の影（細線 1 本）で奥行を示す（判断）
      if (lod <= 50) G.fins.forEach(function (sx) { var u1 = P.wu(G.at(sx + G.t, 0)), u0 = P.wu(G.at(sx, 0)), ue = Math.max(u0, u1) + Math.min(G.depth * 0.25, 300); doc.line(X(ue), V(G.z0 + G.t), X(ue), V(G.z1 - G.t), st.fine); });
    });
    // 外形（太線）：パラペット・笠木・外壁の外面（パラペットの建物）。屋根の板や屋上テラスのある建物は、階ごとの外壁の高さの上包絡
    var ov = CON.copingOver, ch = CON.copingH;
    if (!hasRoofs && !rfLv && !ls.some(function (l) { return joinedWalls(m, l.id).some(function (jw) { return isFinite(+jw.w.h); }); })) {
      doc.poly([[X(xl), V(0)], [X(xl), V(top - ch)], [X(xl - ov), V(top - ch)], [X(xl - ov), V(top)], [X(xr + ov), V(top)], [X(xr + ov), V(top - ch)], [X(xr), V(top - ch)], [X(xr), V(0)]], st.out, INK, 'none', true, null, 'miter');
    } else {
      var wr = [];
      ls.forEach(function (l, i) { joinedWalls(m, l.id).forEach(function (jw) { if (!isExt(jw.w)) return; var ur = urange(P, jw.poly), zt = isFinite(+jw.w.h) ? l.fl + +jw.w.h : (i === nL - 1 ? ((hasRoofs && !rfLv) ? rz : levelTop(ls, i)) : levelTop(ls, i)); wr.push([ur.u0, ur.u1, zt]); }); });
      var bp = []; wr.forEach(function (q) { bp.push(q[0], q[1]); }); bp = bp.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
      if (bp.length >= 2) {
        var pts = [[X(bp[0]), V(0)]], zPrev = 0;
        for (var bi = 0; bi + 1 < bp.length; bi++) { var um = (bp[bi] + bp[bi + 1]) / 2, zm = 0; wr.forEach(function (q) { if (q[0] <= um && um <= q[1]) zm = Math.max(zm, q[2]); }); if (zm !== zPrev) { pts.push([X(bp[bi]), V(zPrev)]); pts.push([X(bp[bi]), V(zm)]); } zPrev = zm; }
        pts.push([X(bp[bp.length - 1]), V(zPrev)]); pts.push([X(bp[bp.length - 1]), V(0)]);
        doc.poly(pts, st.out, INK, 'none', true, null, 'miter');
      }
    }
    if (recess) doc.poly([[X(xl + tExt), V(0)], [X(xl + tExt), V(soffit)], [X(xr - tExt), V(soffit)], [X(xr - tExt), V(0)]], st.out, INK, 'none', true, null, 'miter');
    // 独立柱（外壁の無い階＝屋上テラスの柱、屋根を受ける柱）
    columns.forEach(function (c) { var i = lvIndex(m, c.level); if (i < 0) return; var hasExt = joinedWalls(m, c.level).some(function (jw) { return isExt(jw.w); }); var sup = roofs.some(function (rf) { return arr(rf.supports).indexOf(c.id) >= 0; }); if (hasExt && !sup) return; var z = columnZ(m, c); if (!z) return; var ur = urange(P, columnPoly(c)); if (ur.d1 <= 0) return; var zb = hasExt ? Math.max(z[0], levelTop(ls, i) - (isFinite(+((joinedWalls(m, c.level)[0] || {}).w || {}).h) ? 0 : 0)) : z[0]; doc.rect(X(ur.u0), V(zb), X(ur.u1), V(z[1]), st.vis, INK, WHITE); });
    // 屋根の板（孔は立面に出ない。曲面の殻は折れ線）：いちばん上に重ねる
    roofs.forEach(function (rf) {
      var pol = rf.polygon.map(function (p) { return [+p[0], +p[1]]; }), rr = urange(P, pol), T = num(rf.thickness, 300), z1 = +rf.fl, rise = (rf.shell && rf.shell.kind === 'curved') ? num(rf.shell.rise, 0) : 0;
      if (!(rise > 0)) { doc.rect(X(rr.u0), V(z1 - T), X(rr.u1), V(z1), st.out, INK, WHITE); return; }
      var pts2 = [], k2, n2 = 16, zt = function (u) { var t = (u - rr.u0) / (rr.u1 - rr.u0 || 1); return z1 + rise * (1 - Math.pow(2 * t - 1, 2)); };
      for (k2 = 0; k2 <= n2; k2++) pts2.push([X(rr.u0 + (rr.u1 - rr.u0) * k2 / n2), V(zt(rr.u0 + (rr.u1 - rr.u0) * k2 / n2))]);
      for (k2 = n2; k2 >= 0; k2--) pts2.push([X(rr.u0 + (rr.u1 - rr.u0) * k2 / n2), V(zt(rr.u0 + (rr.u1 - rr.u0) * k2 / n2) - T)]);
      doc.poly(pts2, st.out, INK, WHITE);
      doc.text(X((rr.u0 + rr.u1) / 2), V(z1 + rise) - 1.2, '曲面は折れ線の近似（反り ' + nfmt(rise) + '）', TN, 'middle');
    });
    // 縦樋・あんこう・オーバーフロー管（道路側。materials.downpipe があるとき）
    var dp = null;
    if (isFront && mats.downpipe) {
      dp = { x: xr - tExt / 2, top: rz + 50, hb: rz + 50 - EL.dpHeadH, r: EL.dpD / 2, ofx: xl + 325, ofh: rz + 150 };
      var hw = EL.dpHeadW, pts = [[dp.x - hw / 2, dp.top], [dp.x + hw / 2, dp.top], [dp.x + hw / 4, dp.hb], [dp.x - hw / 4, dp.hb]].map(function (p) { return [X(p[0]), V(p[1])]; });
      doc.poly(pts, 0, 'none', WHITE); doc.poly(pts, st.vis, INK, 'none');
      doc.rect(X(dp.x - dp.r), V(dp.hb), X(dp.x + dp.r), V(fl1), 0, 'none', WHITE);
      doc.line(X(dp.x - dp.r), V(fl1), X(dp.x - dp.r), V(dp.hb), st.vis); doc.line(X(dp.x + dp.r), V(fl1), X(dp.x + dp.r), V(dp.hb), st.vis);
      doc.line(X(dp.x - dp.r - 15), V(fl1), X(dp.x + dp.r + 15), V(fl1), st.vis);
      if (lod <= 50) for (var hb = base + 900; hb < dp.hb - 300; hb += 1200) { doc.line(X(dp.x - dp.r - 25), V(hb), X(dp.x + dp.r + 25), V(hb), st.fine); doc.line(X(dp.x - dp.r - 25), V(hb + 40), X(dp.x + dp.r + 25), V(hb + 40), st.fine); }
      doc.circle(X(dp.ofx), V(dp.ofh), 40 / s, st.fine, INK, WHITE); if (lod <= 50) doc.circle(X(dp.ofx), V(dp.ofh), 28 / s, st.fine, INK, 'none');
    }
    // 建具符号：幅の広い開口は左の壁に、小さい窓は窓の下に
    var tagR = lod <= 50 ? 3.0 : 2.6;
    ops.forEach(function (o) {
      var wide = (o.x1 - o.x0) > (xr - xl) * 0.5, cx, cy;
      if (wide) { cx = X((xl + o.x0 - (o.shutter ? EL.shutterRail : 0)) / 2); cy = V((o.sill + o.head) / 2); } else { cx = X((o.x0 + o.x1) / 2); cy = V(o.sill) + 1.5 + tagR; }
      doorTag(doc, st, cx, cy, o.tag, tagR);
    });
    // 寸法・レベル（左）
    var leftX = X(gA + 75), rightX = X(gB - 75), hsLv = [0].concat(FL, [rz, top]), xc = leftX - 4.0, gap = 7.0;
    if (lod <= 50) {
      var hs1 = [0].concat(FL, [rz, top]);
      ls.forEach(function (l, i) { var main = ops.filter(function (o) { return o.i === i; }).sort(function (a, b) { return (b.x1 - b.x0) - (a.x1 - a.x0); })[0]; if (!main) return; hs1.push(main.sill, main.head); if (main.rail) hs1.push(main.sill + EL.railTop); });
      hs1 = hs1.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
      dimV(doc, st, hs1.map(V), hs1, xc, leftX - 1.0, 'dot'); xc -= gap;
    }
    dimV(doc, st, hsLv.map(V), hsLv, xc, leftX - 1.0, 'dot'); xc -= gap;
    dimV(doc, st, [V(0), V(top)], [0, top], xc, leftX - 1.0, 'dot'); xc -= 3.0;
    var names = [['GL', 0]].concat(ls.map(function (l) { return [l.id.replace(/F$/, 'FL'), l.fl]; }), rfLv ? [] : [['RFL', rz]], roofs.filter(function (rf) { return Math.abs(+rf.fl - top) > 1; }).map(function (rf) { return [(rf.name || '屋根') + ' 上端', +rf.fl]; }), [['最高高さ', top]]);
    names.sort(function (a, b) { return a[1] - b[1]; });
    names.forEach(function (nm, i) { var nxt = i + 1 < names.length ? names[i + 1][1] : null, below = nxt != null && (nxt - nm[1]) / s < 3.2; levelMark(doc, st, V(nm[1]), leftX - 1.0, xc - 1.0, nm[0], nm[1] === 0 ? '±0' : 'GL+' + nfmt(nm[1]), -1, below); });
    // 通り芯と寸法（下）
    var yb = V(0) + 2.4, yc = yb + 5.5;
    if (lod <= 50) {
      var us = [xl, xr], lv1 = ops.filter(function (o) { return o.i === Math.min(1, nL - 1); });
      lv1.forEach(function (o) { us.push(o.x0, o.x1); gu.forEach(function (q) { if (o.x0 < q.u && q.u < o.x1) us.push(q.u); }); });
      us = us.filter(function (v, i, a) { return a.indexOf(v) === i; });
      dimH(doc, st, us.map(X), us, yc, yb + 0.2, 'dot', true); yc += 6.0;
    }
    dimH(doc, st, [X(xl), X(xr)], [xl, xr], yc, yb + 0.2, 'dot', true); yc += 6.0;
    if (gu.length > 1) dimH(doc, st, gu.map(function (q) { return X(q.u); }), gu.map(function (q) { return q.u; }), yc, null, 'dot', true); yc += 4.0;
    gu.forEach(function (q) { doc.line(X(q.u), yb + 0.3, X(q.u), yc + 5.0 - 2.8, st.fine, INK, chainDash(0.13)); bubble(doc, st, X(q.u), yc + 5.0, q.id, 2.8); });
    var yBottom = yc + 5.0 + 2.8;
    // 仕上げの注記（右の列。左端をそろえる）
    if (opt.notes !== false) {
      var col = rightX + 8.0, uMax = xr, gapTo = sb ? Math.round(dir === 'N' ? sb[3] - fp.b[3] : dir === 'S' ? fp.b[1] - sb[1] : dir === 'E' ? sb[2] - fp.b[2] : fp.b[0] - sb[0]) : null;
      var topWin = ops.slice().sort(function (a, b) { return b.head - a.head; })[0], railOp = ops.filter(function (o) { return o.rail; })[0], shOp = ops.filter(function (o) { return o.shutter; })[0], doorOp = ops.filter(function (o) { return o.kind === 'shop4' || o.kind === 'door'; })[0];
      // 仕上げの文はモデルの materials から（無ければ描かない。以前は窯業系サイディング・アルミ笠木などの決め打ち）
      var N = function (k, u, z, t) { notes.push({ k: k, p: [X(u), V(z)], t: t }); };
      if (!hasRoofs && !rfLv && mats.coping) N('k', uMax - 150, top - 30, '笠木：' + mats.coping);
      if (mats.exterior) N('k', uMax - 230, top - 2450, '外壁：' + mats.exterior);
      if (jointPitch > 0) N('', uMax - 230, top - 750, '目地 @' + nfmt(jointPitch) + '（通り芯 ' + (gu.length ? gu[Math.floor((gu.length - 1) / 2)].id : '') + ' から割付）');
      if (fj.length) N('', uMax - 300, fj[fj.length - 1] + 10, '水切り：' + mats.flashing);
      if (dp) N('k', dp.x, dp.top - 120, 'あんこう・縦樋：' + mats.downpipe);
      if (topWin && topWin.kind !== 'shop4') N('k', topWin.x1 - 500, topWin.head - 300, 'AW：' + (mats.window ? mats.window + ' ' : '') + (topWin.fire ? (isFront ? '防火設備 網入りガラス' : '網入り型板ガラス') : '透明ガラス') + (!isFront && gapTo != null ? '（隣地まで ' + nfmt(gapTo) + '）' : ''));
      if (railOp) N('k', railOp.x1 + 60, railOp.sill + EL.railTop - 20, '手すり：' + (mats.rail ? mats.rail + ' ' : '') + 'H' + nfmt(EL.railTop));
      if (shOp && !recess) N('', shOp.x1 - 300, shOp.head + EL.shutterBox / 2, '防火シャッター' + (mats.shutter ? '：' + mats.shutter : ''));
      if (doorOp) N('k', doorOp.x1 - 500, fl1 + 1350, 'AD：' + (mats.door ? mats.door + ' ' : '') + (doorOp.fire ? '防火戸 網入りガラス' : '透明ガラス'));
      vents.forEach(function (vt) { N('k', vt.u, vt.h, vt.name); });
      if (recess) { N('k', xr - tExt - 300, fl1, '縁（奥行 ' + nfmt(recess) + '）' + (mats.porch ? '：' + mats.porch : '')); N('', xr - tExt - 700, soffit + 25, '2F 張り出しの下端（軒）'); }
      if (mats.base) N(isFront ? '' : 'k', uMax - 300, base / 2, '基礎：' + mats.base);
      screens.forEach(function (sc0, si) { var G = screenGeo(m, sc0, cx0); if (!G || si > 0 || G.n[0] * dv[0] + G.n[1] * dv[1] < 0.7) return; var rr = urange(P, [G.at(0, 0), G.at(G.L, 0)]); N('k', rr.u1 - 400, G.z1 - 300, 'ブリーズ・ソレイユ：' + (mats.screen ? mats.screen + ' ' : '') + '奥行 ' + nfmt(G.depth) + '・羽根 ' + nfmt(G.t) + ' @' + nfmt(G.pitch)); });
      roofs.forEach(function (rf) { var pol = rf.polygon.map(function (p) { return [+p[0], +p[1]]; }), rr = urange(P, pol); N('k', rr.u1 - 600, +rf.fl - num(rf.thickness, 300) / 2, (rf.name || '屋根の板') + '：版 ' + nfmt(num(rf.thickness, 300)) + (mats.roof ? '・' + mats.roof : '') + (arr(rf.holes).length ? '・孔 ' + arr(rf.holes).length + ' か所（立面には出ない）' : '')); });
      var use = notes.filter(function (n) { return lod <= 50 || n.k === 'k'; });
      placeNotes(doc, st, use, col, V(top) - 2.0, V(0) - 1.0, lod <= 50 ? 4.4 : 4.0);
    }
    // 建具の表（1:50）
    if (lod <= 50 && opt.table !== false && ops.length) {
      var rows = [], seen = {};
      ops.forEach(function (o) {
        if (seen[o.tag]) { seen[o.tag].n++; if (seen[o.tag].fl.indexOf(ls[o.i].id) < 0) seen[o.tag].fl.push(ls[o.i].id); return; }
        seen[o.tag] = { o: o, n: 1, fl: [ls[o.i].id] }; rows.push(seen[o.tag]);
      });
      var tx = doc.b[2] + 10.0, ty = V(top) + 4.0;
      table(doc, st, tx, ty, opt.tableNum != null ? opt.tableNum : opt.num, DIRNAME[dir] + '面の建具（寸法は枠の外法 W×H、mm）', ['符号', '形式', 'W×H', 'ガラス', '階', '数'],
        rows.map(function (rw) { return [rw.o.tag, kindJa(rw.o.o), nfmt(rw.o.x1 - rw.o.x0) + '×' + nfmt(rw.o.head - rw.o.sill), glassOf(rw.o.o, isFront), rw.fl.join('・'), String(rw.n)]; }), [12, 33, 22, 21, 9, 6]);
    }
    if (!(opt.layers && opt.layers.scale === false)) scaleBarDefault(doc, st, leftX + 1.0, yBottom + 4.0, s);
    var cap = null;
    if (opt.title !== false) {
      var sides = [leftDir, rightDir].filter(function (d) { return nbs.indexOf(d) >= 0 && ctx; }).map(function (d) { return DIRNAME[d]; }).join('');
      var anyFire = ops.some(function (o) { return o.fire; }), elems = [].concat(screens.length ? ['ブリーズ・ソレイユの格子'] : [], roofs.length ? ['屋根の板'] : []);
      var body = opt.caption || (DIRNAME[dir] + 'の外壁を正面から見る。外形' + ((!hasRoofs && !rfLv) ? 'と笠木' : (roofs.length ? 'と屋根の板' : '')) + 'は太線、開口の枠・手すり' + (dp ? '・樋' : '') + (vents.length ? '・換気口' : '') + (screens.length ? '・ブリーズ・ソレイユの箱' : '') + 'は中線、' + (jointPitch > 0 ? '目地と' : '') + '障子の割付・ガラスの印・寸法は細線。' +
        (ops.length ? '開口は' + (anyFire ? '防火設備' : '建具') + (isFront ? '（' + ((site.roads || [])[0] && (site.roads || [])[0].width < 4000 ? '路地' : '道路') + 'に向く）' : '') + 'で、符号は' + (lod <= 50 && opt.table !== false ? '右の表' : '建具表') + 'に対応する。' : '') + (elems.length ? elems.join('・') + 'はモデルの要素から描いた。' : '') + (sides ? '灰は' + sides + 'の隣家。' : '') + '筆者作成。');
      cap = { num: opt.num, title: opt.title || (DIRNAME[dir] + '立面図' + (isFront ? '（' + ((site.roads || [])[0] && (site.roads || [])[0].width < 4000 ? '路地側' : '道路側') + '）' : '') + (recess ? '・縁の形' : '') + '（1:' + s + '）'), body: body };
    }
    return doc.finish(opt, cap);
  }

  // ================================================================ 展開図（室ごとに壁 A〜D。tools/archdraw/elevation/interior.py の移植）
  // 作法：平面の上（北）の壁を A とし時計回りに B・C・D（鳥取県 作成基準 3.1(5)3)）。各面は壁から 1,000 の位置で見た正面図で、
  // 両端は壁と近い開口を断面で示す（日本インテリア学会「インテリア製図通則・同解説」解説 3(2)）。置き家具（卓・椅子・ソファ・寝台）は描かない。
  var LOOSE = { table: 1, sofa: 1, lowtable: 1, bench: 1, bed: 1, desk: 1, chair: 1, rod: 1, skylight: 1, hatch: 1, shower: 1 };
  var FLOORSTAND = { counter: 1, tvboard: 1, shelf: 1, wardrobe: 1, shoebox: 1, washer: 1, vanity: 1, tub: 1, toilet: 1, handbasin: 1 };
  var ANCHOR = { '台所': ['counter', 'fridge', 'hood'], 'キッチン': ['counter', 'fridge', 'hood'], 'DK': ['counter'], '食堂': ['table'], '居間': ['sofa', 'tvboard', 'lowtable'],
    '寝室': ['bed'], '洗面': ['vanity'], '脱衣': ['washer'], '浴室': ['tub'], '書斎': ['desk'], '便所': ['toilet'], '物入': ['shelf', 'wardrobe'] };
  var KIND_JA = { counter: 'キッチン', vanity: '洗面化粧台', washer: '洗濯機置場', shoebox: '下足入', shelf: '棚', wardrobe: '衣装戸棚', tub: '浴槽', toilet: '便器', fridge: '冷蔵庫置場', tvboard: 'TV ボード', hood: 'レンジフード', handbasin: '手洗器' };
  var DEV_NAME = { outlet: 'コンセント 2 口', switch3: 'スイッチ 3 連', tv: 'TV 端子', intercom: 'インターホン親機' };
  var FIN_DRY = [['床', '複合フローリング t15'], ['幅木', '木製 H60'], ['壁', '強化石膏ボード t15 下地 ビニルクロス張り'], ['回り縁', '木製 H40'], ['天井', '強化石膏ボード t15 下地 ビニルクロス張り']];
  var FIN_WET = [['床', '長尺塩ビシート t2.5'], ['幅木', 'ソフト幅木 H60'], ['壁', '耐水石膏ボード t12.5 下地 ビニルクロス張り'], ['回り縁', '塩ビ製 H40'], ['天井', '耐水石膏ボード t9.5 下地 ビニルクロス張り']];
  // 展開だけの判断（tools/archdraw/elevation/model.json・README「判断 12」）
  var IV = { off: 1000, base: 60, crown: 40, cbox: 100, cboxExt: 150, railH: 800, railD: 35, top: 30, plinth: 100, hoodBot: 1650, hoodTop: 2000, acW: 800, acBot: 1950, acTop: 2240,
    hOutlet: 250, hCounterOutlet: 1100, hFridge: 2000, hSwitch: 1200, hIntercom: 1450, hTv: 650, hAc: 2100 };

  function polyEdges(poly) {
    var A = 0, n = poly.length, out = [];
    for (var i = 0; i < n; i++) { var p = poly[i], q = poly[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1]; }
    var cw = A < 0;
    for (var j = 0; j < n; j++) {
      var a = poly[j], b = poly[(j + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      out.push({ a: a, b: b, n: cw ? [-dy / L, dx / L] : [dy / L, -dx / L], len: L });
    }
    return out;
  }
  // 芯が線分 a-b と重なる壁（同じ階）
  function wallAlong(m, levelId, a, b) {
    var best = null;
    (m.walls || []).forEach(function (w) {
      if (w.level !== levelId || best) return;
      var g = wallGeo(w);
      var da = Math.abs((a[0] - w.a[0]) * g.n[0] + (a[1] - w.a[1]) * g.n[1]), db = Math.abs((b[0] - w.a[0]) * g.n[0] + (b[1] - w.a[1]) * g.n[1]);
      if (da > 1 || db > 1) return;
      var sa = (a[0] - w.a[0]) * g.u[0] + (a[1] - w.a[1]) * g.u[1], sb = (b[0] - w.a[0]) * g.u[0] + (b[1] - w.a[1]) * g.u[1];
      if (Math.max(sa, sb) < 1 || Math.min(sa, sb) > g.len - 1) return;
      best = w;
    });
    return best;
  }
  function findRoom(m, room, opt) {
    var rs = m.rooms || [], r = null;
    if (room && typeof room === 'object') return room;
    if (room) r = rs.filter(function (x) { return x.id === room; })[0] || rs.filter(function (x) { return x.name === room; })[0] || null;
    if (!r) { var cand = rs.filter(function (x) { return !opt.level || x.level === opt.level; }); cand.sort(function (a, b) { return Math.abs(polyArea(b.polygon)) - Math.abs(polyArea(a.polygon)); }); r = cand[0] || rs[0] || null; }
    return r;
  }
  function polyArea(p) { var A = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; A += a[0] * b[1] - b[0] * a[1]; } return A / 2; }
  function areaCentroid(p) { var A = 0, cx = 0, cy = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length], f = a[0] * b[1] - b[0] * a[1]; A += f; cx += (a[0] + b[0]) * f; cy += (a[1] + b[1]) * f; } if (Math.abs(A) < 1e-9) return centroid(p); return [cx / (3 * A), cy / (3 * A)]; }
  function centroid(p) { var c = [0, 0]; p.forEach(function (q) { c[0] += q[0]; c[1] += q[1]; }); return [c[0] / p.length, c[1] / p.length]; }
  // 家具の背（壁に付く側）：接する壁の向き。2 つ以上なら長い辺の側、同じなら隣の家具と同じ側（判断）
  function touchDirs(fb, wallBoxes) {
    var out = [];
    wallBoxes.forEach(function (wb) {
      var ox = fb[0] < wb[2] - 1 && wb[0] < fb[2] - 1, oy = fb[1] < wb[3] - 1 && wb[1] < fb[3] - 1;
      if (ox && Math.abs(fb[3] - wb[1]) <= 60 && out.indexOf('N') < 0) out.push('N');
      if (ox && Math.abs(fb[1] - wb[3]) <= 60 && out.indexOf('S') < 0) out.push('S');
      if (oy && Math.abs(fb[2] - wb[0]) <= 60 && out.indexOf('E') < 0) out.push('E');
      if (oy && Math.abs(fb[0] - wb[2]) <= 60 && out.indexOf('W') < 0) out.push('W');
    });
    return out;
  }
  function backDir(f, fxs, wallBoxes) {
    var fb = bbox(fixturePoly(f)), t = touchDirs(fb, wallBoxes);
    if (t.length === 1) return t[0];
    if (!t.length) return null;
    var w = fb[2] - fb[0], d = fb[3] - fb[1];
    var ns = t.filter(function (x) { return x === 'N' || x === 'S'; }), ew = t.filter(function (x) { return x === 'E' || x === 'W'; });
    if (w > d + 1 && ns.length) return ns[0];
    if (d > w + 1 && ew.length) return ew[0];
    var nb = null;
    fxs.forEach(function (g) {
      if (g === f || nb) return;
      var gb = bbox(fixturePoly(g)), gap = Math.max(gb[0] - fb[2], fb[0] - gb[2], gb[1] - fb[3], fb[1] - gb[3]);
      if (gap > 100) return;
      var tg = touchDirs(gb, wallBoxes); if (tg.length === 1 && t.indexOf(tg[0]) >= 0) nb = tg[0];
    });
    return nb || t[0];
  }
  // 室内の器具を実形（プレート）で（国交省 作成基準 3.6(1)2)）。(x,y) は紙の中心、k は 1:50 を 1 とする倍率
  function deviceMark(doc, st, x, y, kind, k) {
    k = k || 1;
    function R(u0, h0, u1, h1, fill) { doc.rect(x + u0 * k / 50, y - h1 * k / 50, x + u1 * k / 50, y - h0 * k / 50, st.fine, INK, fill || 'none'); }
    if (kind === 'intercom') { R(-60, -90, 60, 90, WHITE); doc.circle(x, y - 40 * k / 50, 25 * k / 50, st.fine, INK, 'none'); R(-25, -60, 25, -35); return; }
    R(-35, -60, 35, 60, WHITE);
    if (kind === 'outlet') [28, -28].forEach(function (dh) { [-12, 12].forEach(function (du) { doc.line(x + du * k / 50, y - (dh + 9) * k / 50, x + du * k / 50, y - (dh - 9) * k / 50, st.fine); }); });
    else if (kind === 'switch3') [32, 0, -32].forEach(function (dh) { R(-20, dh - 11, 20, dh + 11); });
    else if (kind === 'tv') doc.circle(x, y, 14 * k / 50, st.fine, INK, 'none');
  }

  function interior(m, room, opt) {
    opt = opt || {};
    var s = opt.scale || 50, st = sty(s), doc = new Doc(), lod = s <= 50 ? 50 : 100;
    var r = findRoom(m, room, opt);
    if (!r || !r.polygon || r.polygon.length < 3) return errSvg('室 ' + room + ' がモデルにありません');
    var ls = levels(m), li = lvIndex(m, r.level); if (li < 0) return errSvg('室 ' + r.id + ' の階 ' + r.level + ' がありません');
    var FL = ls[li].fl, CH = chOf(ls, li), lvId = r.level, poly = r.polygon, pb = bbox(poly), edges = polyEdges(poly);
    var lvWalls = (m.walls || []).filter(function (w) { return w.level === lvId; }), wallBoxes = lvWalls.map(function (w) { return bbox(wallGeo(w).poly); });
    var tags = doorTags(m), site = m.site || {}, roadSide = null;
    (site.roads || []).forEach(function (rd) { var e = roadEdge(site, rd); if (e && !roadSide) roadSide = e.side; });
    var fxAll = (m.fixtures || []).filter(function (f) { return f.level === lvId && !LOOSE[f.kind]; });
    function inRoom(pts) { return pts.some(function (p) { return pointInPoly(p[0], p[1], poly); }) || pointInPoly((bbox(pts)[0] + bbox(pts)[2]) / 2, (bbox(pts)[1] + bbox(pts)[3]) / 2, poly); }
    var fxs = fxAll.filter(function (f) { var q = fixturePoly(f), c = centroid(q), shrink = q.map(function (p) { return [c[0] + (p[0] - c[0]) * 0.9, c[1] + (p[1] - c[1]) * 0.9]; }); return inRoom(shrink); });
    // 吹抜：この室の上の階の床が抜けていれば、天井はその上の階の天井（voids）
    var cen0 = areaCentroid(poly), voidAbove = false;
    for (var vi = li + 1; vi < ls.length; vi++) { if (voidPolysAt(m, ls[vi].id).some(function (pg) { return pointInPoly(cen0[0], cen0[1], pg); })) { CH = (ls[vi].fl - FL) + chOf(ls, vi); voidAbove = true; } else break; }
    // 独立柱：室の中の柱は床から天井までの箱として家具と同じ道筋で描く（kind 'column'）
    columnsOf(m).forEach(function (c) { if (c.level !== lvId || !pointInPoly(+c.at[0], +c.at[1], poly)) return; var z = columnZ(m, c); fxs.push({ id: c.id, kind: 'column', at: [+c.at[0], +c.at[1]], w: num(c.w, 400), d: num(c.d, num(c.w, 400)), rot: 0, h: z ? Math.min(CH, z[1] - FL) : CH, name: (c.shape === 'round' ? '丸柱 φ' : '柱 ') + nfmt(num(c.w, 400)) }); });
    // 内法の外接：外接の 4 辺に芯が重なる壁の厚さの半分だけ内へ
    function halfT(a, b) { var w = wallAlong(m, lvId, a, b); return w ? (w.t || 150) / 2 : 0; }
    var inner = [pb[0] + halfT([pb[0], pb[1]], [pb[0], pb[3]]), pb[1] + halfT([pb[0], pb[1]], [pb[2], pb[1]]), pb[2] - halfT([pb[2], pb[1]], [pb[2], pb[3]]), pb[3] - halfT([pb[0], pb[3]], [pb[2], pb[3]])];
    var corners = [[inner[0], inner[1]], [inner[2], inner[1]], [inner[2], inner[3]], [inner[0], inner[3]]];
    var gridX = (m.grid && m.grid.x) || [], gridY = (m.grid && m.grid.y) || [];

    // ---- 2D の範囲（名前の付いた使い方）：室名の「・」で分け、家具を手掛かりに長い方向へ帯にする。上がり口は階段の到着 ----------
    var axisX = (pb[2] - pb[0]) >= (pb[3] - pb[1]) ? 0 : 1, ax2 = 1 - axisX;
    var zones = [], arrivals = [];
    (m.stairs || []).forEach(function (sd) {
      if (sd.to !== lvId) return;
      var S = stairSteps(m, sd), d = S.d, top = [sd.origin[0] + d[0] * S.run, sd.origin[1] + d[1] * S.run];
      var mid = [top[0] + S.side[0] * S.w / 2 + d[0] * 100, top[1] + S.side[1] * S.w / 2 + d[1] * 100];
      if (!pointInPoly(mid[0], mid[1], poly)) return;
      var ahead = d[1] > 0 ? inner[3] : d[1] < 0 ? inner[1] : d[0] > 0 ? inner[2] : inner[0];
      var rect = d[0] ? [Math.min(top[0], ahead), Math.min(top[1], top[1] + S.side[1] * S.w), Math.max(top[0], ahead), Math.max(top[1], top[1] + S.side[1] * S.w)]
        : [Math.min(top[0], top[0] + S.side[0] * S.w), Math.min(top[1], ahead), Math.max(top[0], top[0] + S.side[0] * S.w), Math.max(top[1], ahead)];
      arrivals.push({ sd: sd, S: S, top: top, rect: rect, dir: dirOf(d), ahead: ahead });
      zones.push({ name: '上がり口', rect: rect, pri: 2 });
    });
    (function () {
      var parts = String(r.name || '').split(/[・･、,／/]/).map(function (t) { return t.trim(); }).filter(Boolean);
      if (parts.length < 2) { zones.push({ name: r.name || r.id, rect: inner.slice(), pri: 0 }); return; }
      var info = parts.map(function (nm, i) {
        var kinds = []; Object.keys(ANCHOR).forEach(function (k) { if (nm.indexOf(k) >= 0) kinds = kinds.concat(ANCHOR[k]); });
        var fs = fxs.filter(function (f) { return kinds.indexOf(f.kind) >= 0; }).concat((m.fixtures || []).filter(function (f) { return f.level === lvId && LOOSE[f.kind] && kinds.indexOf(f.kind) >= 0 && inRoom(fixturePoly(f)); }));
        var b = fs.length ? bbox(fs.reduce(function (a, f) { return a.concat(fixturePoly(f)); }, [])) : null;
        return { name: nm, i: i, b: b, kitchen: /台所|キッチン|DK/.test(nm), c: b ? (b[axisX] + b[axisX + 2]) / 2 : null };
      });
      var withC = info.filter(function (x) { return x.c != null; });
      if (withC.length) { var lo = inner[axisX], hi = inner[axisX + 2]; info.forEach(function (x) { if (x.c == null) x.c = lo + (hi - lo) * (x.i + 0.5) / parts.length; }); }
      else info.forEach(function (x) { x.c = inner[axisX] + (inner[axisX + 2] - inner[axisX]) * (x.i + 0.5) / parts.length; });
      info.sort(function (a, b) { return a.c - b.c; });
      var verts = poly.map(function (p) { return p[axisX]; });
      function snap(v) { var best = v; verts.forEach(function (q) { if (Math.abs(q - v) < 600 && Math.abs(q - v) < Math.abs(best - v)) best = q; }); return best; }
      var bounds = [inner[axisX]];
      for (var i = 0; i + 1 < info.length; i++) {
        var a = info[i], b = info[i + 1], v;
        if (b.kitchen && b.b) v = b.b[axisX] - 350;
        else if (a.kitchen && a.b) v = a.b[axisX + 2] + 350;
        else if (a.b && b.b) v = snap((a.b[axisX + 2] + b.b[axisX]) / 2);
        else v = (a.c + b.c) / 2;
        bounds.push(Math.max(bounds[bounds.length - 1] + 300, Math.min(v, inner[axisX + 2] - 300)));
      }
      bounds.push(inner[axisX + 2]);
      info.forEach(function (x, i) {
        var rect = inner.slice(); rect[axisX] = bounds[i]; rect[axisX + 2] = bounds[i + 1];
        if (x.kitchen && x.b) {   // 台所は家具の幅だけ。残りは隣の範囲
          var full = rect.slice(); rect[ax2] = Math.max(inner[ax2], x.b[ax2] - 50); rect[ax2 + 2] = Math.min(inner[ax2 + 2], x.b[ax2 + 2] + 50);
          var nb = info[i - 1] || info[i + 1];
          if (nb) { if (rect[ax2] > full[ax2] + 1) { var r1 = full.slice(); r1[ax2 + 2] = rect[ax2]; zones.push({ name: nb.name, rect: r1, pri: 1 }); } if (rect[ax2 + 2] < full[ax2 + 2] - 1) { var r2 = full.slice(); r2[ax2] = rect[ax2 + 2]; zones.push({ name: nb.name, rect: r2, pri: 1 }); } }
        }
        zones.push({ name: x.name, rect: rect, pri: 1 });
      });
    })();
    zones.sort(function (a, b) { return b.pri - a.pri; });
    function zoneAt(p) { for (var i = 0; i < zones.length; i++) { var z = zones[i].rect; if (p[0] >= z[0] - 1 && p[0] <= z[2] + 1 && p[1] >= z[1] - 1 && p[1] <= z[3] + 1) return zones[i].name; } return null; }

    // ---- 各面の仕様 ---------------------------------------------------------------------------------------------
    var ORDER = [['A', 'N'], ['B', 'E'], ['C', 'S'], ['D', 'W']];
    var specs = {};
    ORDER.forEach(function (kd) {
      var key = kd[0], dir = kd[1], d = DIRV[dir], R = [d[1], -d[0]], umin = 1e9, umax = -1e9, pmax = -1e9;
      corners.forEach(function (c) { var u = c[0] * R[0] + c[1] * R[1], p = c[0] * d[0] + c[1] * d[1]; umin = Math.min(umin, u); umax = Math.max(umax, u); pmax = Math.max(pmax, p); });
      var sp = { key: key, dir: dir, d: d, R: R, umin: umin, pmax: pmax, W: umax - umin, name: DIRNAME[dir] };
      sp.U = function (p) { return p[0] * R[0] + p[1] * R[1] - umin; };
      sp.DEP = function (p) { return pmax - (p[0] * d[0] + p[1] * d[1]); };
      // 壁の面（室の辺のうち、この向きを向くもの）
      sp.surfaces = [];
      edges.forEach(function (e) {
        if (e.n[0] * d[0] + e.n[1] * d[1] < 0.7) return;
        var w = wallAlong(m, lvId, e.a, e.b); if (!w) return;
        var faceVal = e.a[0] * d[0] + e.a[1] * d[1] - (w.t || 150) / 2, dep = pmax - faceVal;
        var ua = sp.U(e.a), ub = sp.U(e.b), u0 = Math.max(0, Math.min(ua, ub)), u1 = Math.min(sp.W, Math.max(ua, ub));
        if (u1 - u0 < 1) return;
        var g = wallGeo(w), ops = [];
        openingsOf(m, w).forEach(function (o) {
          var pa = g.at(o.at), pbb = g.at(o.at + o.width), x0 = sp.U(pa), x1 = sp.U(pbb), lo = Math.min(x0, x1), hi = Math.max(x0, x1);
          if (hi <= u0 + 1 || lo >= u1 - 1) return;
          ops.push({ o: o, u0: lo, u1: hi, sill: o.sill || 0, head: o.head, kind: kindOf(o), ext: isExt(w), tag: tags[o.id] || null, dep: dep });
        });
        sp.surfaces.push({ w: w, u0: u0, u1: u1, dep: dep, ops: ops, ext: isExt(w), e: e });
      });
      sp.surfaces.sort(function (a, b) { return a.dep - b.dep; });
      sp.depAt = function (u) { var dep = 0; sp.surfaces.forEach(function (sf) { if (u >= sf.u0 - 1 && u <= sf.u1 + 1) dep = Math.max(dep, sf.dep); }); return dep; };
      // 両端の壁（直交する壁の断面。見る位置の面で切るので、そこに開口があれば開口の断面）
      sp.ends = [-1, 1].map(function (side) {
        var val = side < 0 ? umin : umin + sp.W, found = null, planeC = pmax - IV.off;
        lvWalls.forEach(function (w) {
          if (found) return; var g = wallGeo(w); if (Math.abs(g.u[0] * d[0] + g.u[1] * d[1]) < 0.7) return;
          var c = w.a[0] * R[0] + w.a[1] * R[1], tt = (w.t || 150) / 2; if (Math.abs(Math.abs(c - val) - tt) > 2) return;
          var pa = w.a[0] * d[0] + w.a[1] * d[1], pbv = w.b[0] * d[0] + w.b[1] * d[1]; if (Math.max(pa, pbv) < pmax - IV.off - 500 || Math.min(pa, pbv) > pmax) return;
          found = w;
        });
        var t = found ? (found.t || 150) : 100, win = null;
        if (found) {
          var g2 = wallGeo(found);
          openingsOf(m, found).forEach(function (o) {
            var a = g2.at(o.at), b = g2.at(o.at + o.width), pa = a[0] * d[0] + a[1] * d[1], pbv = b[0] * d[0] + b[1] * d[1];
            if (Math.min(pa, pbv) <= planeC && planeC <= Math.max(pa, pbv)) win = { o: o, sill: o.sill || 0, head: o.head, rail: !!o.rail, tag: tags[o.id] || null, ext: isExt(found), door: o.type === 'door' || o.type === 'slide' || !isExt(found) };
          });
        }
        return { side: side, t: t, w: found, win: win };
      });
      // 家具：見る位置（壁から 1,000）と壁の間にあるものを描く。見る位置の面が家具を横切れば切断
      sp.fix = [];
      fxs.forEach(function (f) {
        var q = fixturePoly(f), us = q.map(sp.U), ds = q.map(sp.DEP), u0 = Math.min.apply(null, us), u1 = Math.max.apply(null, us), d0 = Math.min.apply(null, ds), d1 = Math.max.apply(null, ds);
        if (d1 <= 0 || d0 >= IV.off) return;
        if (u1 <= 0 || u0 >= sp.W) return;
        var back = backDir(f, fxs, wallBoxes), bd = back ? DIRV[back] : null;
        var rel = !bd ? 'front' : (bd[0] * d[0] + bd[1] * d[1] > 0.7 ? 'front' : (bd[0] * d[0] + bd[1] * d[1] < -0.7 ? 'front' : 'side'));
        sp.fix.push({ f: f, u0: Math.max(0, u0), u1: Math.min(sp.W, u1), d0: d0, d1: d1, cut: d0 < IV.off && d1 > IV.off, rel: rel, back: back, H: f.h || FIX_H[f.kind] || 700, backU: bd ? (bd[0] * R[0] + bd[1] * R[1]) : 0 });
      });
      sp.fix.sort(function (a, b) { return a.d0 - b.d0; });
      specs[key] = sp;
    });
    // 階段の到着：手すり（側壁の面）と、前の壁の面での手すりの切断
    var rails = [];   // {face, u0, u1} 側壁の面の手すり
    arrivals.forEach(function (ar) {
      var S = ar.S, lr = ar.rect, sideDirs = ar.dir === 'N' || ar.dir === 'S' ? ['E', 'W'] : ['N', 'S'];
      sideDirs.forEach(function (sdir) {
        var dv = DIRV[sdir], edge = sdir === 'E' ? lr[2] : sdir === 'W' ? lr[0] : sdir === 'N' ? lr[3] : lr[1];
        var hasWall = lvWalls.some(function (w) { var wb = bbox(wallGeo(w).poly); return dv[0] ? (Math.abs((dv[0] > 0 ? wb[0] : wb[2]) - edge) <= 60 && wb[1] < lr[3] && wb[3] > lr[1]) : (Math.abs((dv[1] > 0 ? wb[1] : wb[3]) - edge) <= 60 && wb[0] < lr[2] && wb[2] > lr[0]); });
        if (!hasWall) return;
        var face = ORDER.filter(function (kd) { return kd[1] === sdir; })[0][0], sp = specs[face];
        var ua = sp.U(ar.top), ub = sp.U([ar.dir === 'N' || ar.dir === 'S' ? ar.top[0] : ar.ahead, ar.dir === 'N' || ar.dir === 'S' ? ar.ahead : ar.top[1]]);
        rails.push({ face: face, u0: Math.min(ua, ub), u1: Math.max(ua, ub), ahead: ORDER.filter(function (kd) { return kd[1] === ar.dir; })[0][0], aheadU: sp.key, edgeDir: sdir, lr: lr, ar: ar });
      });
      void S;
    });

    // ---- エアコン（居間・寝室など。長い壁の、開口も家具も無い最も長い区間。判断） --------------------------------------------
    var aircon = null;
    if (/居間|寝室|食堂|LDK|書斎|子供/.test(r.name || '')) {
      var best = null;
      ORDER.forEach(function (kd) {
        var sp = specs[kd[0]], busy = [];
        sp.surfaces.forEach(function (sf) { sf.ops.forEach(function (o) { if (o.head > IV.acBot - 100) busy.push([o.u0 - 150, o.u1 + 150]); }); if (sf.dep > 1) { busy.push([sf.u0 - 1, sf.u0 + 1]); busy.push([sf.u1 - 1, sf.u1 + 1]); } });
        sp.fix.forEach(function (fx) { if (fx.H > IV.acBot - 150 || fx.cut || fx.f.kind === 'hood' || fx.f.kind === 'counter') busy.push([fx.u0 - 100, fx.u1 + 100]); });
        rails.forEach(function (rl) { if (rl.face === kd[0]) busy.push([rl.u0, rl.u1]); });
        subtract([0, sp.W], busy).forEach(function (sg) { var L = sg[1] - sg[0]; if (L >= IV.acW + 400 && (!best || L > best.L)) best = { face: kd[0], a: sg[0], b: sg[1], L: L }; });
      });
      if (best) { var a0 = best.L >= IV.acW + 3000 ? best.a + 1500 : (best.a + best.b) / 2 - IV.acW / 2; aircon = { face: best.face, u0: a0, u1: a0 + IV.acW }; }
    }

    // ---- 1 面を描く ----------------------------------------------------------------------------------------------
    var usedDev = {}, usedPlaceholder = false, faceInfo = {}, faceSummary = [];
    function drawFace(sp, ox, oy) {
      var key = sp.key, Wd = sp.W, X = function (u) { return ox + u / s; }, V = function (h) { return oy - h / s; }, L = function (mm) { return mm / s; };
      var tL = sp.ends[0].t, tR = sp.ends[1].t;
      function R_(u0, h0, u1, h1, w, fill, dash) { doc.rect(X(u0), V(h0), X(u1), V(h1), w, INK, fill || 'none', dash); }
      function Hl(u0, u1, h, w) { doc.line(X(u0), V(h), X(u1), V(h), w); }
      function Vl(u, h0, h1, w) { doc.line(X(u), V(h0), X(u), V(h1), w); }
      var skipB = [], skipC = [], feat = [0, Wd], vch = [0, CH], vchR = null, rightH = [], notes = [], occ = [], devs = [], zr = [], summary = [];
      function occupy(u0, h0, u1, h1) { occ.push([Math.min(u0, u1), Math.min(h0, h1), Math.max(u0, u1), Math.max(h0, h1)]); }
      var mainWin = null;
      // 壁の面：出隅の線（手前にある面の両端）、開口
      sp.surfaces.forEach(function (sf) {
        if (sf.dep > 1) {
          [sf.u0, sf.u1].forEach(function (u) { if (u > 1 && u < Wd - 1) { Vl(u, 0, CH, st.vis); feat.push(u); } });
          var beyond = [(sf.e.a[0] + sf.e.b[0]) / 2 + sf.e.n[0] * ((sf.w.t || 100) / 2 + 150), (sf.e.a[1] + sf.e.b[1]) / 2 + sf.e.n[1] * ((sf.w.t || 100) / 2 + 150)];
          var other = roomsOf(m, lvId).filter(function (q) { return q !== r && pointInPoly(beyond[0], beyond[1], q.polygon); })[0];
          var lab = other ? '間仕切り（奥は' + other.name.replace(/ /g, '') + '）' : '間仕切り';
          notes.push({ kind: 'label', u: (sf.u0 + sf.u1) / 2, h: CH - 400, t: lab });
          if (other && /階段/.test(other.name)) summary.push('階段との間仕切り');
        }
        sf.ops.forEach(function (op) {
          var o = op.o, ext = op.ext;
          if (o.type === 'door' || (o.type === 'slide' && o.variant)) {   // 戸：枠・戸・取っ手（引違いの物入は 2 枚）
            var f = 25;
            R_(op.u0 - f, 0, op.u1 + f, op.head + f, st.vis, WHITE); R_(op.u0, 0, op.u1, op.head, st.fine);
            if (o.variant === 'closet') { var xc = (op.u0 + op.u1) / 2; R_(op.u0 + 10, 10, xc + 15, op.head - 10, st.fine); R_(xc - 15, 10, op.u1 - 10, op.head - 10, st.fine, WHITE); }
            else if (o.variant === 'outset') { R_(op.u0 - 60, op.head + 30, op.u1 + op.u1 - op.u0 + 60, op.head + 90, st.fine, WHITE); R_(op.u0, 10, op.u1, op.head - 10, st.fine, WHITE); Vl(op.u1 - 90, 900, 1000, st.fine); }
            else { R_(op.u0 + 10, 10, op.u1 - 10, op.head - 10, st.fine); var hx = o.swing === 'R' ? op.u0 + 100 : op.u1 - 100; Hl(hx - 50, hx + 50, 950, st.fine); }
            skipB.push([op.u0 - f, op.u1 + f]); feat.push(op.u0, op.u1); occupy(op.u0 - f, 0, op.u1 + f, op.head + f);
            notes.push({ kind: 'top', u: (op.u0 + op.u1) / 2, h: op.head - 200, t: (o.variant === 'closet' ? 'CL 引違い戸 W' : o.variant === 'outset' ? 'WD 片引き戸 W' : 'WD 片開き戸 W') + nfmt(op.u1 - op.u0) + '×H' + nfmt(op.head) });
            return;
          }
          windowFace(doc, st, X, V, { x0: op.u0, x1: op.u1, sill: op.sill, head: op.head, kind: op.kind }, lod, st.vis, true);
          occupy(op.u0 - 20, Math.max(0, op.sill - 20), op.u1 + 20, op.head + 20);
          if (o.rail) { Hl(op.u0 + 40, op.u1 - 40, EL.railTop, st.fine); Hl(op.u0 + 40, op.u1 - 40, EL.railTop - 40, st.fine); notes.push({ kind: 'top', u: op.u0 + 300, h: EL.railTop - 20, t: '外の手すり H' + nfmt(EL.railTop) }); vch.push(EL.railTop); }
          var cb = o.type === 'sweep' || op.head >= CH - 300;
          if (cb) { R_(op.u0 - IV.cboxExt, CH - IV.cbox, op.u1 + IV.cboxExt, CH, st.vis, WHITE); skipC.push([op.u0 - IV.cboxExt, op.u1 + IV.cboxExt]); notes.push({ kind: 'top', u: op.u1 + 60, h: CH - 50, t: 'カーテンボックス H' + IV.cbox, prefer: 'end' }); }
          if (op.sill <= 0) skipB.push([op.u0, op.u1]);
          feat.push(op.u0, op.u1);
          if ((op.u1 - op.u0) > 1800) { var gs = Math.abs(sp.R[0]) > 0.7 ? gridX : gridY; gs.forEach(function (q) { var u = q.at * (Math.abs(sp.R[0]) > 0.7 ? sp.R[0] : sp.R[1]) - sp.umin; if (u > op.u0 + 1 && u < op.u1 - 1) feat.push(u); }); }
          if (!mainWin || (op.u1 - op.u0) * (op.head - op.sill) > (mainWin.u1 - mainWin.u0) * (mainWin.head - mainWin.sill)) mainWin = op;
          var glass = ext ? '・' + glassOf(o, roadSide === sp.dir) + 'ガラス' : '';
          notes.push({ kind: 'top', u: op.u0 + Math.min(1500, (op.u1 - op.u0) * 0.4), h: op.head - Math.min(500, (op.head - op.sill) * 0.3), t: (op.tag ? op.tag + ' ' : '') + (op.sill <= 0 ? '掃き出し ' : '') + kindJa(o) + glass });
        });
      });
      if (mainWin) { if (mainWin.sill > 0) vch.push(mainWin.sill); vch.push(mainWin.head); }
      // 家具（壁に近い方から）
      sp.fix.forEach(function (fx) {
        var f = fx.f, k = f.kind, u0 = fx.u0, u1 = fx.u1, H = fx.H, Wf = Math.round(u1 - u0), Df = Math.round(fx.d1 - fx.d0);
        if (fx.cut) {   // 見る位置の面で切断
          if (k === 'counter' && Math.abs(fx.backU) > 0.5) {
            var uf = fx.backU > 0 ? u0 : u1, ub = fx.backU > 0 ? u1 : u0, dd = ub > uf ? 1 : -1, tt = IV.top, pl = IV.plinth;
            var Uc = function (t) { return uf + dd * t; };
            var pts = [[Uc(70), 0], [ub, 0], [ub, H], [Uc(0), H], [Uc(0), H - tt], [Uc(20), H - tt], [Uc(20), pl], [Uc(70), pl]].map(function (p) { return [X(p[0]), V(p[1])]; });
            doc.poly(pts, st.out, INK, WHITE);
            Hl(Uc(20), ub, H - tt, st.fine); Hl(Uc(40), ub - dd * 20, 460, st.fine);
            skipB.push([Math.min(uf, ub), Math.max(uf, ub)]); feat.push(uf); occupy(u0, 0, u1, H);
            vchR = [0, H, CH]; notes.push({ kind: 'in', u: uf + dd * 300, h: 450, eu: uf - dd * 150, eh: 560, anchor: dd > 0 ? 'end' : 'start', t: 'キッチン（断面）H' + nfmt(H) });
            summary.push((fx.backU > 0 ? '右' : '左') + '端はキッチンの切断');
          } else if (k === 'hood') { R_(u0, IV.hoodBot, u1, IV.hoodTop, st.out, WHITE); R_(u0, IV.hoodTop, u1, CH, st.out, WHITE); occupy(u0, IV.hoodBot, u1, CH); skipC.push([u0, u1]); }
          else { R_(u0, 0, u1, H, st.out, WHITE); if (FLOORSTAND[k]) skipB.push([u0, u1]); feat.push(fx.backU > 0 ? u0 : u1); occupy(u0, 0, u1, H); if (!vchR) vchR = [0, H, CH]; notes.push({ kind: 'in', u: (u0 + u1) / 2, h: H - 100, eu: fx.backU > 0 ? u0 - 150 : u1 + 150, eh: H + 350, anchor: fx.backU > 0 ? 'end' : 'start', t: (f.name || KIND_JA[k] || k) + '（断面）H' + nfmt(H) }); }
          return;
        }
        var side = fx.rel === 'side';
        if (k === 'fridge') {   // 置き場だけを示す機器：一点鎖線（インテリア製図通則 解説 8）
          R_(u0 + 25, 0, u1 - 25, H, st.far, null, CHAIN_S); usedPlaceholder = true;
          doc.text(X((u0 + u1) / 2), V(H - 750), '冷蔵庫置場', TN, 'middle'); doc.text(X((u0 + u1) / 2), V(H - 750) + 3.0, side ? '（側面）' : 'W' + nfmt(Wf), TN, 'middle');
          occupy(u0, 0, u1, H);
          if (!side) { feat.push(fx.backU > 0 ? u0 : u1); devs.push({ u: (u0 + u1) / 2, h: IV.hFridge, type: 'outlet' }); vch.push(H); } else rightH.push(H);
          return;
        }
        if (k === 'counter') {
          var pl2 = IV.plinth, tt2 = IV.top;
          R_(u0, pl2, u1, H - tt2, st.vis, WHITE); R_(u0, H - tt2, u1, H, st.vis, WHITE);
          Hl(u0 + 50, u1 - 50, 0, st.fine); Vl(u0 + 50, 0, pl2, st.fine); Vl(u1 - 50, 0, pl2, st.fine);
          if (!side) {   // 引出しの割付：流しと加熱機器から（判断）
            var units = [], cur = u0, sinkU = null, hobU = null, c = f.at, cosA = Math.cos((f.rot || 0) * Math.PI / 180), sinA = Math.sin((f.rot || 0) * Math.PI / 180);
            function abs(p) { return [c[0] + p[0] * cosA - p[1] * sinA, c[1] + p[0] * sinA + p[1] * cosA]; }
            if (f.sink) { var sa = sp.U(abs([f.sink[0], f.sink[1]])), sb = sp.U(abs([f.sink[2], f.sink[3]])); sinkU = [Math.min(sa, sb) - 25, Math.max(sa, sb) + 25]; }
            if (f.hob) { var hu = sp.U(abs(f.hob)); hobU = [hu - 300, hu + 300]; }
            var fixedU = [sinkU && { a: sinkU[0], b: sinkU[1], kind: 'sink' }, hobU && { a: hobU[0], b: hobU[1], kind: 'cook' }].filter(Boolean).sort(function (a, b) { return a.a - b.a; });
            fixedU.forEach(function (fu) { if (fu.a - cur > 150) units.push({ a: cur, b: fu.a, kind: fu.a - cur >= 450 ? 'drawer3' : 'slim' }); else if (fu.a - cur > 1) units.push({ a: cur, b: fu.a, kind: 'filler' }); units.push(fu); cur = fu.b; });
            if (u1 - cur > 150) units.push({ a: cur, b: u1, kind: u1 - cur >= 450 ? 'drawer3' : 'slim' }); else if (u1 - cur > 1) units.push({ a: cur, b: u1, kind: 'filler' });
            var splits = { drawer3: [360, 600], sink: [460], slim: [], cook: [360, 600], filler: [] };
            units.forEach(function (un) { if (un.b < u1 - 1) Vl(un.b, pl2, H - tt2, st.fine); splits[un.kind].forEach(function (sh) { Hl(un.a + 3, un.b - 3, sh, st.fine); }); });
            if (sinkU) { var fu0 = (sinkU[0] + sinkU[1]) / 2; R_(fu0 - 15, H, fu0 + 15, H + 260, st.fine, WHITE); R_(fu0 - 15, H + 260, fu0 + 110, H + 290, st.fine, WHITE); }
            devs.push({ u: u0 + 225, h: IV.hCounterOutlet, type: 'outlet' }); devs.push({ u: u1 - 75, h: IV.hCounterOutlet, type: 'outlet' });
            notes.push({ kind: 'top', u: u1 - 200, h: 450, t: 'キッチン I 型 W' + nfmt(Wf) + '×D' + nfmt(Df) + '×H' + nfmt(H) + (f.hob ? '・IH' : '') });
            notes.push({ kind: 'top', u: u0 + 200, h: 1300, t: 'キッチンパネル t3' });
            summary.push('台所の正面'); vch.push(H);
          }
          skipB.push([u0, u1]); feat.push(u0, u1); occupy(u0, 0, u1, H + 300);
          return;
        }
        if (k === 'hood') {
          R_(u0, IV.hoodBot, u1, IV.hoodTop, st.vis, WHITE); Hl(u0 + 20, u1 - 20, IV.hoodBot + 60, st.fine); R_(u0 + 75, IV.hoodTop, u1 - 75, CH, st.fine);
          skipC.push([u0 + 75, u1 - 75]); occupy(u0, IV.hoodBot, u1, CH);
          notes.push({ kind: 'top', u: (u0 + u1) / 2, h: IV.hoodBot + 200, t: 'レンジフード W' + nfmt(Wf) });
          return;
        }
        if (k === 'tvboard') {
          var pl3 = 60;
          R_(u0, pl3, u1, H, st.vis, WHITE); Hl(u0, u1, H - 30, st.fine); Hl(u0 + 50, u1 - 50, 0, st.fine); Vl(u0 + 50, 0, pl3, st.fine); Vl(u1 - 50, 0, pl3, st.fine); Vl((u0 + u1) / 2, pl3, H - 30, st.fine);
          skipB.push([u0, u1]); feat.push(u0, u1); occupy(u0, 0, u1, H); vch.push(H);
          if (!side) { devs.push({ u: (u0 + u1) / 2 - 125, h: IV.hTv, type: 'tv' }); devs.push({ u: (u0 + u1) / 2 + 125, h: IV.hTv, type: 'outlet' }); }
          notes.push({ kind: 'in', u: u0 + 500, h: 300, eu: u0 - 300, eh: 950, anchor: 'start', t: '造作 TV ボード W' + nfmt(Wf) + '×D' + nfmt(Df) + '×H' + nfmt(H) });
          return;
        }
        // そのほかの造作・設備（細線の箱と割付）
        if (k === 'shelf' || k === 'wardrobe' || k === 'shoebox' || k === 'washer') {
          R_(u0, 0, u1, H, st.vis, WHITE);
          if (k === 'shelf') { for (var q = 1; q <= 4; q++) Hl(u0, u1, 80 + (H - 80) * q / 5, st.fine); if (f.div && !side) for (var yy = u0 + f.div; yy < u1 - 100; yy += f.div) Vl(yy, 0, H, st.fine); }
          else if (k === 'wardrobe') { Hl(u0, u1, 1800, st.fine); if (!side) Vl((u0 + u1) / 2, 0, 1800, st.fine); }
          else if (k === 'shoebox') Hl(u0, u1, 80, st.fine);
          else { R_(u0 + 60, H - 60, u1 - 60, H - 20, st.fine); doc.circle(X((u0 + u1) / 2), V(H / 2 + 50), L(230), st.fine, INK, 'none'); }
          skipB.push([u0, u1]); feat.push(u0, u1); occupy(u0, 0, u1, H); vch.push(H);
          notes.push({ kind: 'top', u: (u0 + u1) / 2, h: H - 150, t: (f.name || KIND_JA[k]) + ' W' + nfmt(u1 - u0) + '×H' + nfmt(H) });
        } else if (k === 'vanity') {
          R_(u0, IV.plinth, u1, H, st.vis, WHITE); R_(u0 + 50, 0, u1 - 50, IV.plinth, st.fine); Hl(u0, u1, H - 30, st.fine);
          if (!side) { R_(u0 + 50, 1050, u1 - 50, 1800, st.fine, WHITE); R_((u0 + u1) / 2 - 15, H, (u0 + u1) / 2 + 15, H + 200, st.fine, WHITE); }
          skipB.push([u0, u1]); feat.push(u0, u1); occupy(u0, 0, u1, 1800); vch.push(H); notes.push({ kind: 'top', u: (u0 + u1) / 2, h: 1700, t: '洗面化粧台 W' + nfmt(u1 - u0) + '×H' + nfmt(H) + '・鏡' });
        } else if (k === 'tub') {
          R_(u0, 0, u1, H, st.vis, WHITE); Hl(u0 + 60, u1 - 60, H - 60, st.fine); skipB.push([u0, u1]); feat.push(u0, u1); occupy(u0, 0, u1, H); vch.push(H);
          notes.push({ kind: 'top', u: (u0 + u1) / 2, h: H - 100, t: '浴槽 W' + nfmt(u1 - u0) + '×H' + nfmt(H) });
        } else if (k === 'toilet') {
          var tb = side ? [fx.backU > 0 ? u1 - 200 : u0, fx.backU > 0 ? u1 : u0 + 200] : [u0 + 30, u1 - 30];
          R_(tb[0], 380, tb[1], 800, st.vis, WHITE); R_(u0, 0, u1, 400, st.vis, WHITE); skipB.push([u0, u1]); feat.push(u0, u1); occupy(u0, 0, u1, 800);
        } else if (k === 'handbasin') {
          R_(u0, 720, u1, 820, st.vis, WHITE); Vl((u0 + u1) / 2, 500, 720, st.fine); occupy(u0, 500, u1, 820); feat.push(u0, u1); vch.push(820);
        } else { R_(u0, 0, u1, H, st.vis, WHITE); if (FLOORSTAND[k]) skipB.push([u0, u1]); feat.push(u0, u1); occupy(u0, 0, u1, H); }
      });
      // 階段の到着の手すり（側壁の面：見えがかり。前の壁の面：切断の丸）
      rails.forEach(function (rl) {
        if (rl.face === key) {
          var hr = IV.railH, a = rl.u0, b = rl.u1;
          Hl(a, b, hr, st.vis); Hl(a, b, hr - IV.railD, st.vis);
          [a + 150, b - 150].forEach(function (ub) { R_(ub - 10, hr - 100, ub + 10, hr - IV.railD, st.fine); });
          occupy(a, hr - 100, b, hr); vch.push(hr);
          notes.push({ kind: 'in', u: (a + b) * 0.5, h: hr, eu: b - 150, eh: hr + 380, anchor: 'end', t: '手すり φ' + IV.railD + ' H' + nfmt(hr) });
          devs.push({ u: b + 300, h: IV.hIntercom, type: 'intercom' });
        }
        if (rl.ahead === key) {
          var edv = DIRV[rl.edgeDir], uEnd = edv[0] * sp.R[0] + edv[1] * sp.R[1] > 0 ? Wd : 0, sgn = uEnd > 0 ? -1 : 1, hr2 = IV.railH;
          doc.circle(X(uEnd + sgn * 60), V(hr2 - IV.railD / 2), L(IV.railD / 2), st.vis, INK, WHITE); Hl(uEnd + sgn * 42, uEnd, hr2 - IV.railD / 2, st.fine);
          notes.push({ kind: 'in', u: uEnd + sgn * 60, h: hr2, eu: uEnd + sgn * 150, eh: hr2 - 280, anchor: sgn < 0 ? 'end' : 'start', t: '手すり φ' + IV.railD + ' H' + nfmt(hr2) });
          var uPart = sp.U([rl.lr[0], rl.lr[1]]), uPart2 = sp.U([rl.lr[2], rl.lr[3]]), uIn = Math.abs(uPart - uEnd) > Math.abs(uPart2 - uEnd) ? uPart : uPart2;
          devs.push({ u: uIn - sgn * 100, h: IV.hSwitch, type: 'switch3' });
        }
      });
      // エアコン
      if (aircon && aircon.face === key) {
        R_(aircon.u0, IV.acBot, aircon.u1, IV.acTop, st.vis, WHITE); Hl(aircon.u0 + 30, aircon.u1 - 30, IV.acBot + 60, st.fine);
        feat.push(aircon.u0, aircon.u1); occupy(aircon.u0, IV.acBot, aircon.u1, IV.acTop);
        notes.push({ kind: 'top', u: (aircon.u0 + aircon.u1) / 2, h: IV.acTop - 40, t: 'エアコン W' + nfmt(IV.acW) });
        devs.push({ u: aircon.u1 + 150, h: IV.hAc, type: 'outlet' });
      }
      // 床のコンセント：家具と床までの開口を除いた区間に、おおむね 2,600 に 1 つ（判断）
      var busyB = skipB.slice(); occ.forEach(function (o) { if (o[1] < IV.hOutlet + 100 && o[3] > IV.hOutlet - 100) busyB.push([o[0], o[2]]); });
      subtract([0, Wd], busyB).forEach(function (sg) {
        var Lg = sg[1] - sg[0]; if (Lg < 700) return;
        var n = Math.max(1, Math.round(Lg / 2600));
        for (var i = 0; i < n; i++) { var u = sg[0] + Lg * (i + 0.5) / n; if (u > 300 && u < Wd - 300) devs.push({ u: u, h: IV.hOutlet, type: 'outlet' }); }
      });
      devs.forEach(function (dv) { deviceMark(doc, st, X(dv.u), V(dv.h), dv.type, 50 / s); usedDev[dv.type] = true; });
      // 幅木・回り縁
      subtract([0, Wd], skipB).forEach(function (sg) { Hl(sg[0], sg[1], IV.base, st.fine); });
      subtract([0, Wd], skipC).forEach(function (sg) { Hl(sg[0], sg[1], CH - IV.crown, st.fine); });
      // 床・天井（切断の太線）と両端の壁
      Hl(-tL, Wd + tL, 0, st.cut); Hl(-tL, Wd + tR, CH, st.cut);
      function endWall(uIn, uOut, en) {
        var dd = uOut > uIn ? 1 : -1, lo = -120, hi = CH + 120, win = en.win;
        function Uo(t) { return uIn + dd * t; }
        if (!win) { doc.fill(X(uIn), V(hi), X(uOut), V(lo), INK); return; }
        var sl = win.sill, hd = win.head;
        doc.fill(X(uIn), V(sl > 0 ? sl : 0), X(uOut), V(lo), INK); doc.fill(X(uIn), V(hi), X(uOut), V(hd), INK);
        if (win.door) {   // 戸の開口の切断：枠（見付け 25）と戸の厚み
          R_(Uo(-25), hd, Uo(en.t + 25), hd + 25, st.fine); R_(Uo(en.t / 2 - 18), 10, Uo(en.t / 2 + 18), hd, st.vis, WHITE); vch.push(hd);
          notes.push({ kind: 'top', u: uIn + dd * en.t / 2, h: hd - 300, t: (win.o.type === 'slide' ? '引戸' : '戸') + '（断面）H' + nfmt(hd), prefer: dd > 0 ? 'end' : 'start' });
          summary.push((dd > 0 ? '右' : '左') + '端は戸の切断');
          return;
        }
        R_(Uo(-20), hd, Uo(55), hd + 18, st.fine);                     // 上の額縁
        R_(Uo(40), sl, Uo(140), sl + 35, st.vis); R_(Uo(40), hd - 40, Uo(140), hd, st.vis);   // 下枠（レール 2 本）・上枠
        Vl(Uo(70), sl + 35, hd - 40, st.fine); Vl(Uo(110), sl + 35, hd - 40, st.fine);        // 内外のレールの障子のガラス
        if (win.rail) {
          var ru = en.t + 80;                                           // 外壁の外面から 80 に手すり（判断）
          R_(Uo(ru - 20), EL.railTop - 40, Uo(ru + 20), EL.railTop, st.vis, WHITE); R_(Uo(ru - 15), EL.railBot, Uo(ru + 15), EL.railBot + 30, st.fine, WHITE);
          Vl(Uo(ru), EL.railBot + 30, EL.railTop - 40, st.fine); Hl(Uo(en.t), Uo(ru - 20), EL.railTop - 20, st.fine);
          vch.push(EL.railTop);
        }
        R_(Uo(-IV.cboxExt), CH - IV.cbox, Uo(0), CH, st.vis, WHITE);   // カーテンボックス（切断）
        if (sl > 0) vch.push(sl); vch.push(hd);
        var ue = uIn + dd * en.t / 2, tg = win.tag ? win.tag + '・' : '';
        notes.push({ kind: 'top', u: ue, h: 1500, t: tg + (win.rail ? '外の手すり（断面）' : '開口（断面）'), prefer: dd > 0 ? 'end' : 'start', outside: true });
        notes.push({ kind: 'top', u: uIn - dd * 75, h: CH - 50, t: 'カーテンボックス（断面）', prefer: dd > 0 ? 'end' : 'start' });
        summary.push((dd > 0 ? '右' : '左') + '端は' + (win.tag || '開口') + (win.rail ? 'と外の手すり' : '') + 'の切断');
      }
      endWall(0, -tL, sp.ends[0]); endWall(Wd, Wd + tR, sp.ends[1]);
      // 注記：上の帯 2 段（引出線）・室内の引出し・直書き
      var rowY = [V(CH) - 4.2, V(CH) - 8.6, V(CH) - 13.0], rowOcc = [[], [], []];
      function free(row, x0, x1) { return rowOcc[row].every(function (iv) { return x1 + 2.5 <= iv[0] || x0 - 2.5 >= iv[1]; }); }
      function hitsOcc(u0, h0, u1, h1) { return occ.some(function (o) { return !(u1 <= o[0] || u0 >= o[2] || h1 <= o[1] || h0 >= o[3]); }); }
      notes.sort(function (a, b) { return a.u - b.u; });
      var inPlaced = [];
      notes.forEach(function (n) {
        var wt = tw(n.t, TN) + 0.6;
        if (n.kind === 'label') {
          var lu0 = n.u - wt * s / 2, lu1 = n.u + wt * s / 2;
          if (!hitsOcc(lu0, n.h - 100, lu1, n.h + 100) && lu0 > 0 && lu1 < Wd) { doc.text(X(n.u), V(n.h), n.t, TN, 'middle'); occupy(lu0, n.h - 100, lu1, n.h + 100); return; }
          n.kind = 'top';
        }
        if (n.kind === 'in') {
          var ex = X(n.eu), ey = V(n.eh), tx0 = n.anchor === 'end' ? ex - wt : ex, tx1 = tx0 + wt;
          var tu0 = (tx0 - ox) * s, tu1 = (tx1 - ox) * s, th0 = n.eh - 50, th1 = n.eh + 2.6 * s;
          var clash = hitsOcc(tu0, th0, tu1, th1) || tu0 < 50 || tu1 > Wd - 50 || inPlaced.some(function (p) { return !(tx1 <= p[0] || tx0 >= p[1] || ey - 2.6 >= p[3] || ey + 0.4 <= p[2]); });
          if (!clash) { leader(doc, st, [X(n.u), V(n.h)], [ex, ey + 0.6], n.t, n.anchor); inPlaced.push([tx0, tx1, ey - 2.6, ey + 0.6]); occupy(tu0, th0, tu1, th1); return; }
          n.kind = 'top';
        }
        // 上の帯：指す点の近くに、重ならない段へ
        var tx = X(n.u), ty = V(n.h), anchor = n.prefer || (n.u < Wd * 0.55 ? 'start' : 'end');
        var placed = false;
        for (var step = 0; step < 40 && !placed; step++) {
          var dx = 3.0 + step * 2.0, xmin = X(-tL) - 2 - step * 1.5, xmax = X(Wd + tR) + 2 + step * 1.5;
          for (var row = 0; row < (step < 6 && Wd > 2500 ? 2 : 3) && !placed; row++) {
            var ex2 = anchor === 'start' ? tx + dx : tx - dx, x0 = anchor === 'start' ? ex2 : ex2 - wt, x1 = x0 + wt;
            if (x0 < xmin || x1 > xmax) { if (step > 3) { anchor = anchor === 'start' ? 'end' : 'start'; } continue; }
            if (free(row, x0, x1)) { leader(doc, st, [tx, ty], [ex2, rowY[row]], n.t, anchor); rowOcc[row].push([x0, x1]); placed = true; }
          }
        }
        if (!placed) { var ex3 = anchor === 'start' ? tx + 3 : tx - 3; leader(doc, st, [tx, ty], [ex3, rowY[2] - 4.4], n.t, anchor); }
      });
      // 下：名前の付いた範囲（床の線の下に 1 本の線と区切り）
      var y = oy + 4.2;
      (function () {
        var cuts = [0, Wd];
        zones.forEach(function (z) { [[z.rect[0], z.rect[1]], [z.rect[2], z.rect[1]], [z.rect[2], z.rect[3]], [z.rect[0], z.rect[3]]].forEach(function (p) { var u = sp.U(p); if (u > 1 && u < Wd - 1) cuts.push(u); }); });
        cuts = cuts.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
        var segs = [];
        for (var i = 0; i + 1 < cuts.length; i++) {
          var um = (cuts[i] + cuts[i + 1]) / 2, dep = sp.depAt(um) + 50;
          var p = [sp.R[0] * (um + sp.umin) + sp.d[0] * (sp.pmax - dep), sp.R[1] * (um + sp.umin) + sp.d[1] * (sp.pmax - dep)];
          var nm = zoneAt(p) || (r.name || '');
          if (segs.length && segs[segs.length - 1].n === nm) segs[segs.length - 1].b = cuts[i + 1]; else segs.push({ a: cuts[i], b: cuts[i + 1], n: nm });
        }
        segs = segs.filter(function (sg) { return sg.b - sg.a > 150; });
        if (segs.length) {
          var xa = X(segs[0].a) + 0.5, xb = X(segs[segs.length - 1].b) - 0.5;
          doc.line(xa, y, xb, y, st.fine);
          segs.forEach(function (sg, i) {
            var x0 = X(sg.a) + (i === 0 ? 0.5 : 0), x1 = X(sg.b) - (i === segs.length - 1 ? 0.5 : 0);
            doc.line(x0, y - 1.0, x0, y + 1.0, st.fine); doc.line(x1, y - 1.0, x1, y + 1.0, st.fine);
            if (tw(sg.n, TR) < x1 - x0 - 1) doc.text((x0 + x1) / 2, y + TR + 0.6, sg.n, TR, 'middle');
            zr.push(sg);
          });
        }
      })();
      y += 9.0;
      // 寸法 3 列：見付け・内法（両端の壁の半分）・通り芯
      feat = feat.map(function (v) { return Math.round(v); }).filter(function (v, i, a) { return a.indexOf(v) === i && v >= 0 && v <= Wd; }).sort(function (a, b) { return a - b; });
      var feat2 = []; feat.forEach(function (v) { if (!feat2.length || v - feat2[feat2.length - 1] >= 40) feat2.push(v); else if (v === Wd) feat2[feat2.length - 1] = v; });
      dimH(doc, st, feat2.map(X), feat2, y, oy + 1.0, 'dot', true); y += 6.0;
      var innerPts = [-tL / 2, 0, Wd, Wd + tR / 2];
      dimH(doc, st, innerPts.map(X), innerPts, y, null, 'dot', true); y += 6.0;
      var gset = Math.abs(sp.R[0]) > 0.7 ? gridX : gridY, gk = Math.abs(sp.R[0]) > 0.7 ? sp.R[0] : sp.R[1];
      var gu = gset.map(function (q) { return { id: q.id, u: q.at * gk - sp.umin }; }).filter(function (q) { return q.u >= -tL - 400 && q.u <= Wd + tR + 400; }).sort(function (a, b) { return a.u - b.u; });
      if (gu.length > 1) dimH(doc, st, gu.map(function (q) { return X(q.u); }), gu.map(function (q) { return q.u; }), y, null, 'dot', true);
      y += 4.5;
      gu.forEach(function (q) { doc.line(X(q.u), oy + 0.8, X(q.u), y + 4.0 - 2.8, st.fine, INK, chainDash(0.13)); doc.circle(X(q.u), y + 4.0, 2.8, st.far, INK, WHITE); doc.text(X(q.u), y + 4.0 + 0.75, q.id, TN, 'middle'); });
      y += 7.0 + 4.8;
      // 面の名前
      var lab = key + ' 展開', sub = sp.name + 'の壁（壁から ' + nfmt(IV.off) + ' の位置で見る）', twl = tw(lab, TR), tw2 = tw(sub, TN), xm = X(Wd / 2) - (twl + 2.0 + tw2) / 2;
      doc.text(xm, y, lab, TR, 'start', 700); doc.text(xm + twl + 2.0, y, sub, TN, 'start');
      // 高さの寸法（左、必要なら右）
      var xw = X(-tL);
      vch = vch.filter(function (v, i, a) { return a.indexOf(v) === i && v >= 0 && v <= CH; }).sort(function (a, b) { return a - b; });
      var vch2 = []; vch.forEach(function (v) { if (!vch2.length || v - vch2[vch2.length - 1] >= 60) vch2.push(v); else if (v === CH) vch2[vch2.length - 1] = v; });
      if (vch2.length > 2) dimV(doc, st, vch2.map(V), vch2, xw - 5.0, xw, 'dot');
      dimV(doc, st, [V(0), V(CH)], [0, CH], vch2.length > 2 ? xw - 11.0 : xw - 5.0, xw, 'dot', false, ['CH ' + nfmt(CH)]);
      if (vchR) rightH.forEach(function (h) { vchR.push(h); });
      if (vchR) { var xr = X(Wd + tR), vr = vchR.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }); dimV(doc, st, vr.map(V), vr, xr + 4.0, xr, 'dot', true); }
      faceSummary.push({ key: key, items: summary });
      return { bottom: y + 1.0, left: xw - 14.0, right: X(Wd + tR) + (vchR ? 9.0 : 0.0), top: rowY[2] - 2.5 };
    }

    // ---- キープラン（この階の平面。縮尺は展開の半分）--------------------------------------------------------------------
    function keyplan(ox, oy, ks) {
      var fp = footprint(m), ob = fp.b;
      function P(x, y) { return [ox + (x - ob[0]) / ks, oy + (ob[3] - y) / ks]; }
      function Rk(x0, y0, x1, y1, w, fill, dash) { var a = P(x0, y0), b = P(x1, y1); if (fill) doc.rect(a[0], b[1], b[0], a[1], 0, 'none', fill); if (w) doc.rect(a[0], b[1], b[0], a[1], w, INK, 'none', dash); }
      function Lk(x0, y0, x1, y1, w, dash) { var a = P(x0, y0), b = P(x1, y1); doc.line(a[0], a[1], b[0], b[1], w, INK, dash); }
      lvWalls.forEach(function (w) { doc.poly(wallGeo(w).poly.map(function (p) { return P(p[0], p[1]); }), 0, 'none', INK); });
      lvWalls.forEach(function (w) {
        var g = wallGeo(w), h = (w.t || 150) / 2;
        openingsOf(m, w).forEach(function (o) {
          var a = g.at(o.at), b = g.at(o.at + o.width);
          doc.poly([[a[0] + g.n[0] * h, a[1] + g.n[1] * h], [b[0] + g.n[0] * h, b[1] + g.n[1] * h], [b[0] - g.n[0] * h, b[1] - g.n[1] * h], [a[0] - g.n[0] * h, a[1] - g.n[1] * h]].map(function (p) { return P(p[0], p[1]); }), 0, 'none', WHITE);
          if (o.type === 'door') { var hp = o.swing === 'R' ? b : a, tip = [hp[0] + g.n[0] * o.width, hp[1] + g.n[1] * o.width]; Lk(hp[0], hp[1], tip[0], tip[1], st.fine); }
          else [-h / 3, h / 3].forEach(function (off) { Lk(a[0] + g.n[0] * off, a[1] + g.n[1] * off, b[0] + g.n[0] * off, b[1] + g.n[1] * off, st.fine); });
          if (o.rail && isExt(w)) { var on = outward(w, fp.c), e = h + 80; Lk(a[0] + on[0] * e - g.u[0] * 100, a[1] + on[1] * e - g.u[1] * 100, b[0] + on[0] * e + g.u[0] * 100, b[1] + on[1] * e + g.u[1] * 100, st.fine); }
        });
      });
      // 階段（この階から上るもの：段の線・切断線・矢印。到着だけのものは段の線）
      var drawnUp = [];
      (m.stairs || []).forEach(function (sd) {
        if (sd.from !== lvId) return;
        var S = stairSteps(m, sd), d = S.d, cutI = Math.min(6, S.n - 2);
        S.steps.forEach(function (stp, i) { var a = stp.poly[0], b = stp.poly[3]; Lk(a[0], a[1], b[0], b[1], st.fine, i > cutI ? dashDash(0.13) : null); });
        var last = S.steps[S.steps.length - 1]; if (last) Lk(last.poly[1][0], last.poly[1][1], last.poly[2][0], last.poly[2][1], st.fine, dashDash(0.13));
        var cx = sd.origin[0] + S.side[0] * S.w / 2, cy = sd.origin[1] + S.side[1] * S.w / 2, cu = S.tread * (cutI + 1);
        Lk(cx + d[0] * cu - S.side[0] * (S.w / 2 + 250), cy + d[1] * cu - S.side[1] * (S.w / 2 + 250), cx + d[0] * cu + S.side[0] * (S.w / 2 + 250), cy + d[1] * cu + S.side[1] * (S.w / 2 + 250), st.fine);
        var a0 = P(cx + d[0] * 110, cy + d[1] * 110), a1 = P(cx + d[0] * (cu - 50), cy + d[1] * (cu - 50));
        doc.circle(a0[0], a0[1], 0.6, st.fine, INK, 'none'); doc.line(a0[0], a0[1], a1[0], a1[1], st.fine);
        var vx = a1[0] - a0[0], vy = a1[1] - a0[1], vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
        doc.poly([[a1[0] - vx * 1.6 - vy * 0.8, a1[1] - vy * 1.6 + vx * 0.8], a1, [a1[0] - vx * 1.6 + vy * 0.8, a1[1] - vy * 1.6 - vx * 0.8]], st.fine, INK, 'none', true);
        drawnUp.push(bbox(S.full));
      });
      (m.stairs || []).forEach(function (sd) {
        if (sd.to !== lvId) return; var S = stairSteps(m, sd), fb = bbox(S.full);
        if (drawnUp.some(function (b) { return fb[0] < b[2] && b[0] < fb[2] && fb[1] < b[3] && b[1] < fb[3]; })) return;
        S.steps.forEach(function (stp) { var a = stp.poly[0], b = stp.poly[3]; Lk(a[0], a[1], b[0], b[1], st.fine); });
      });
      // 造作・機器（細線。置き家具は描かない）
      fxAll.forEach(function (f) {
        var q = fixturePoly(f), b = bbox(q), k = f.kind;
        if (k === 'hood') { Rk(b[0], b[1], b[2], b[3], st.fine, null, dashDash(0.13)); return; }
        if (k === 'fridge') { Rk(b[0] + 25, b[1] + 25, b[2] - 25, b[3] - 25, st.fine, null, CHAIN_S); return; }
        doc.poly(q.map(function (p) { return P(p[0], p[1]); }), st.fine, INK, 'none');
        if (k === 'counter') {
          var c = f.at, ca = Math.cos((f.rot || 0) * Math.PI / 180), sa = Math.sin((f.rot || 0) * Math.PI / 180), abs = function (p) { return [c[0] + p[0] * ca - p[1] * sa, c[1] + p[0] * sa + p[1] * ca]; };
          if (f.sink) { var s0 = abs([f.sink[0], f.sink[1]]), s1 = abs([f.sink[2], f.sink[3]]); Rk(Math.min(s0[0], s1[0]), Math.min(s0[1], s1[1]), Math.max(s0[0], s1[0]), Math.max(s0[1], s1[1]), st.fine); }
          if (f.hob) { var hb = abs(f.hob); [-150, 150].forEach(function (dx) { var cc = P(hb[0] + dx, hb[1]); doc.circle(cc[0], cc[1], 100 / ks, st.fine, INK, 'none'); }); }
        }
      });
      // 室名と展開図記号（この室）、通り芯の符号
      var c0 = areaCentroid(poly), rh = pb[3] - pb[1], rw = pb[2] - pb[0], tall = rh >= rw;
      var symP = tall ? P(c0[0], c0[1] - rh * 0.12) : P(c0[0] - rw * 0.12, c0[1]), nameP = tall ? P(c0[0], c0[1] + rh * 0.3) : P(c0[0] + rw * 0.3, c0[1]);
      doc.text(nameP[0], nameP[1] + 0.8, (r.name || r.id), TN, 'middle');
      unfoldSymbol(doc, st, symP[0], symP[1], 4.2);
      gridX.forEach(function (q) { var a = P(q.at, ob[1]); doc.line(a[0], a[1] + 0.5, a[0], a[1] + 6.0 - 2.2, st.fine, INK, chainDash(0.13)); doc.circle(a[0], a[1] + 6.0, 2.2, st.far, INK, WHITE); doc.text(a[0], a[1] + 6.0 + 0.75, q.id, TN, 'middle'); });
      gridY.forEach(function (q) { var a = P(ob[2], q.at); doc.line(a[0] + 0.5, a[1], a[0] + 6.0 - 2.2, a[1], st.fine, INK, chainDash(0.13)); doc.circle(a[0] + 6.0, a[1], 2.2, st.far, INK, WHITE); doc.text(a[0] + 6.0, a[1] + 0.75, q.id, TN, 'middle'); });
      return { tl: P(ob[0], ob[3]), br: P(ob[2], ob[1]), w: (ob[2] - ob[0]) / ks, h: (ob[3] - ob[1]) / ks };
    }

    // ---- 組み立て：A B を上、C D を下。右にキープラン・凡例・仕上げ ----------------------------------------------------------
    var showKey = !(opt.layers && opt.layers.keyplan === false) && opt.keyplan !== false, showLegend = !(opt.layers && opt.layers.legend === false), showScale = !(opt.layers && opt.layers.scale === false), showNorth = !(opt.layers && opt.layers.north === false);
    var mg = 12.0, y0 = mg, hgt = CH / s, tA = specs.A.ends[0].t / s, tB = specs.B.ends[0].t / s;
    var xA = mg + 17.0 + tA, xB = xA + specs.A.W / s + specs.A.ends[1].t / s + 6.0 + 17.0 + tB;
    var oy1 = y0 + 20.0 + hgt;
    var infoA = drawFace(specs.A, xA, oy1), infoB = drawFace(specs.B, xB, oy1);
    var oy2 = Math.max(infoA.bottom, infoB.bottom) + 5.0 + 20.0 + hgt;
    var infoC = drawFace(specs.C, xA, oy2), infoD = drawFace(specs.D, xB, oy2);
    var ks = s * 2, kx = Math.max(infoB.right, infoD.right) + 8.0, kBottom = y0;
    if (showKey) {
      doc.text(kx - 4.0, y0 + 6.0, 'キープラン', TR, 'start', 700);
      doc.text(kx - 4.0 + tw('キープラン', TR) + 2.0, y0 + 6.0, lvId + '（1:' + ks + '）', TN, 'start');
      var kp = keyplan(kx, y0 + 16.0, ks);
      if (showNorth) northArrow(doc, st, kp.br[0] + 6.0, y0 + 9.0, 8.0);
      kBottom = kp.br[1] + 16.0;
    }
    if (showLegend) {
      var ly = kBottom, used = Object.keys(DEV_NAME).filter(function (k) { return usedDev[k]; });
      var hs = { outlet: 'FL+' + nfmt(IV.hOutlet) + ' ほか、図に高さ', switch3: 'FL+' + nfmt(IV.hSwitch), tv: 'FL+' + nfmt(IV.hTv), intercom: 'FL+' + nfmt(IV.hIntercom) };
      if (used.length || usedPlaceholder) {
        doc.text(kx - 4.0, ly, '凡例', TR, 'start', 700);
        used.forEach(function (k, i) { var yy = ly + 5.0 + i * 5.0; deviceMark(doc, st, kx - 2.0, yy, k, 1); doc.text(kx + 2.5, yy + 0.8, DEV_NAME[k] + '（' + hs[k] + '）', TN, 'start'); });
        var yy2 = ly + 5.0 + used.length * 5.0 + 1.0;
        if (usedPlaceholder) { doc.line(kx - 4.0, yy2 - 0.7, kx + 0.4, yy2 - 0.7, st.far, INK, CHAIN_S); doc.text(kx + 2.5, yy2, '一点鎖線：置き場だけ示す機器', TN, 'start'); yy2 += 4.2; }
        ly = yy2 + 5.0;
      }
      var fins = (r.finishes || m.finishes || (/浴室|洗面|脱衣|便所/.test(r.name || '') ? FIN_WET : FIN_DRY));
      if (!Array.isArray(fins)) fins = Object.keys(fins).map(function (k) { return [k, fins[k]]; });
      doc.text(kx - 4.0, ly, '仕上げ', TR, 'start', 700);
      fins.forEach(function (pf, i) { var y_ = ly + 5.0 + i * 4.2; doc.text(kx - 4.0, y_, pf[0], TN, 'start', 700); doc.text(kx - 4.0 + 9.0, y_, pf[1], TN, 'start'); });
      var y3 = ly + 5.0 + fins.length * 4.2;
      doc.text(kx - 4.0, y3, '天井高', TN, 'start', 700); doc.text(kx - 4.0 + 9.0, y3, 'CH ' + nfmt(CH) + '（' + lvId.replace(/F$/, 'FL') + ' から）', TN, 'start');
    }
    var yb = Math.max(infoC.bottom, infoD.bottom) + 4.0, xLeft = infoC.left;
    if (showScale) scaleBar(doc, st, xLeft, yb, s, s <= 50 ? 3 : 5, s <= 50 ? 0.5 : 1);
    var cap = null;
    if (opt.title !== false) {
      var endsTxt = [];
      ['A', 'B', 'C', 'D'].forEach(function (k) { specs[k].ends.forEach(function (en) { if (en.win) endsTxt.push(k); }); });
      var endWin = null; ['A', 'B', 'C', 'D'].forEach(function (k) { specs[k].ends.forEach(function (en) { if (en.win && !endWin) endWin = en.win; }); });
      var ends = endsTxt.length ? endsTxt.filter(function (v, i, a) { return a.indexOf(v) === i; }).join('・') + ' の端では' + (endWin.tag ? endWin.tag + '（' : '') + kindJa(endWin.o) + (endWin.tag ? '）' : '') + (endWin.rail ? 'と外の手すり' : '') + 'を切断で示す。' : '';
      var per = faceSummary.filter(function (f) { return f.items.length; }).map(function (f) { var it = f.items.filter(function (v, i, a) { return a.indexOf(v) === i; }), ends2 = it.filter(function (t) { return /^[左右]端/.test(t); }), rest = it.filter(function (t) { return !/^[左右]端/.test(t); }); return (rest.length ? f.key + ' は' + rest.join('・') : '') + (rest.length && ends2.length ? '、' : '') + (ends2.length ? f.key + ' の' + ends2.join('、') : ''); }).join('、');
      var nCol = fxs.filter(function (f) { return f.kind === 'column'; }).length;
      var body = opt.caption || ('平面の北の壁を A とし、時計回りに B・C・D の 4 面を、床から天井（CH ' + nfmt(CH) + (voidAbove ? '。吹抜のため上の階の天井まで' : '') + '）まで正面に描いた。' + (showKey ? 'どの壁かは右のキープランの記号で示す。' : '') + '両端の黒い帯は切断した壁で、' + ends + (per ? per + '。' : '') + (nCol ? '室内の独立柱 ' + nCol + ' 本は床から天井までの箱。' : '') + '置き家具は描かない。筆者作成。');
      cap = { num: opt.num, title: opt.title || (lvId.replace(/F$/, ' 階') + ' ' + (r.name || r.id) + 'の展開図（1:' + s + '）'), body: body };
    }
    if (opt.page === undefined && opt.paper !== false) opt = Object.assign({}, opt, { page: 'A3' });
    // 紙（A3 横 420×297）に収まらない大きな室は縮尺を 2 倍にして描き直す
    if (!opt.scale && s < 200 && (doc.b[2] - doc.b[0] > 396 || doc.b[3] - doc.b[1] > 273)) return interior(m, room, Object.assign({}, opt, { scale: s * 2, _auto: true }));
    if (opt._auto && s < 200 && (doc.b[2] - doc.b[0] > 396 || doc.b[3] - doc.b[1] > 273)) return interior(m, room, Object.assign({}, opt, { scale: s * 2 }));
    return doc.finish(opt, cap);
  }
  // ---------------------------------------------------------------- アクソメ・分解アクソメ
  var ANG = { '30/60': [30, 60], '45/45': [45, 45], '60/30': [60, 30], iso: [30, 30] };
  function axon(m, opt) {
    opt = opt || {};
    var s = opt.scale || 200, st = sty(s), doc = new Doc(), ls = levels(m), rz = roofZ(m), ph = parapetH(m), fp = footprint(m);
    var an = ANG[opt.angle || '30/60'] || ANG['30/60'], ax = an[0] * Math.PI / 180, ay = an[1] * Math.PI / 180;
    var Xd = [Math.cos(ax), -Math.sin(ax)], Yd = [-Math.cos(ay), -Math.sin(ay)];
    var explode = !!opt.explode, gap = opt.gap != null ? opt.gap : 2600, cutH = opt.cut != null ? opt.cut : 1200;
    function S(p, z) { return [(p[0] * Xd[0] + p[1] * Yd[0]) / s, (p[0] * Xd[1] + p[1] * Yd[1] - z) / s]; }
    function key(p) { return -(p[0] * Xd[1] + p[1] * Yd[1]); }   // 大きいほど奥
    function vis(n) { return (n[0] * Xd[1] + n[1] * Yd[1]) > 1e-9; }    // 画面で下を向く面が見える
    // 角柱（凸の平面形を z0..z1 に立ち上げ）。top：上面の塗り
    function prism(poly, z0, z1, o) {
      o = o || {};
      var b = bbox(poly), cx = 0, cy = 0; poly.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= poly.length; cy /= poly.length;
      return { b: b, z0: z0, z1: z1, k: key([cx, cy]), draw: function () {
        var area = 0; for (var i = 0; i < poly.length; i++) { var p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
        var ccw = area > 0;
        for (var j = 0; j < poly.length; j++) {
          var a = poly[j], c = poly[(j + 1) % poly.length], ex = c[0] - a[0], ey = c[1] - a[1], n = ccw ? [ey, -ex] : [-ey, ex];
          if (!vis(n) || z1 - z0 <= 0) continue;
          doc.poly([S(a, z0), S(c, z0), S(c, z1), S(a, z1)], o.w || st.far, INK, o.side || TINT);
          if (o.accent && Math.abs(n[1]) > Math.abs(n[0]) && n[1] < 0) { var p0 = S(a, z0), p1 = S(c, z0); doc.line(p0[0], p0[1], p1[0], p1[1], st.vis * 1.6, ACC); }
        }
        doc.poly(poly.map(function (p) { return S(p, z1); }), o.tw || st.far, INK, o.top || WHITE);
      } };
    }
    function behind(A, B) {   // A が B より奥（平面で分離できるとき）
      var fx = Xd[1] < 0 ? 1 : -1, fy = Yd[1] < 0 ? 1 : -1;   // 奥へ向かう符号
      var sepX = fx > 0 ? A.b[0] >= B.b[2] - 1 : A.b[2] <= B.b[0] + 1, sepY = fy > 0 ? A.b[1] >= B.b[3] - 1 : A.b[3] <= B.b[1] + 1;
      var ovX = A.b[0] < B.b[2] - 1 && B.b[0] < A.b[2] - 1, ovY = A.b[1] < B.b[3] - 1 && B.b[1] < A.b[3] - 1;
      if (sepX || sepY) return true;
      if (ovX && ovY) return A.z1 <= B.z0 + 1;   // 重なる平面では低いほうが先
      return false;
    }
    function order(items) {   // 奥から手前へ（位相の並べ替え。決まらないときは奥行きの鍵）
      var n = items.length, indeg = new Array(n).fill(0), adj = items.map(function () { return []; });
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) if (i !== j && behind(items[i], items[j]) && !behind(items[j], items[i])) { adj[i].push(j); indeg[j]++; }
      var out = [], done = new Array(n).fill(false);
      while (out.length < n) {
        var best = -1;
        for (var k = 0; k < n; k++) if (!done[k] && indeg[k] === 0 && (best < 0 || items[k].k > items[best].k || (items[k].k === items[best].k && items[k].z0 < items[best].z0))) best = k;
        if (best < 0) { for (k = 0; k < n; k++) if (!done[k] && (best < 0 || items[k].k > items[best].k)) best = k; }
        done[best] = true; out.push(items[best]); adj[best].forEach(function (j) { indeg[j]--; });
      }
      return out;
    }
    var placed = [];   // ラベルの位置
    var pys = fp.poly.map(function (p) { return S(p, 0)[1] * s; }), planH = Math.max.apply(null, pys) - Math.min.apply(null, pys);
    var D = opt.gap != null ? opt.gap : planH + cutH * 0.6;   // 層の間隔：下の層の床と壁が上の層に隠れない値（判断）
    var fl0 = ls.length ? ls[0].fl : 0;
    var dz = function (i) { return explode ? (fl0 + i * D) - (i < ls.length ? ls[i].fl : rz) : 0; };
    gap = D;
    var bottoms = [];
    function wallPieces(w, z0, zc, items, accent) {
      var g = wallGeo(w), ops = openingsOf(m, w).slice().sort(function (a, b) { return a.at - b.at; }), cur = 0, h = (w.t || 150) / 2;
      function seg(a, b, za, zb, o) {
        if (b - a < 1 || zb - za < 1) return;
        var p0 = g.at(a), p1 = g.at(b);
        var poly = [[p0[0] + g.n[0] * h, p0[1] + g.n[1] * h], [p1[0] + g.n[0] * h, p1[1] + g.n[1] * h], [p1[0] - g.n[0] * h, p1[1] - g.n[1] * h], [p0[0] - g.n[0] * h, p0[1] - g.n[1] * h]];
        items.push(prism(poly, za, zb, o));
      }
      var cutTop = { top: INK, tw: st.far, accent: accent }, plain = { accent: accent };
      ops.forEach(function (o) {
        var a = o.at, b = o.at + o.width;
        seg(cur, a, z0, zc, explode ? cutTop : plain);
        seg(a, b, z0, Math.min(zc, z0 + (o.sill || 0)), plain);
        if (z0 + o.head < zc) seg(a, b, z0 + o.head, zc, explode ? cutTop : plain);
        if (o.type !== 'door') {   // ガラス（厚さ 30 の板。判断）
          var pa = g.at(a), pb = g.at(b), t2 = 15;
          items.push(prism([[pa[0] + g.n[0] * t2, pa[1] + g.n[1] * t2], [pb[0] + g.n[0] * t2, pb[1] + g.n[1] * t2], [pb[0] - g.n[0] * t2, pb[1] - g.n[1] * t2], [pa[0] - g.n[0] * t2, pa[1] - g.n[1] * t2]],
            z0 + (o.sill || 0), Math.min(zc, z0 + o.head), { side: '#C5CACA', w: st.fine }));
        }
        cur = b;
      });
      seg(cur, g.len, z0, zc, explode ? cutTop : plain);
    }
    function levelItems(i, z) {
      var l = ls[i], items = [], fl = l.fl + z, zc = explode ? fl + cutH : levelTop(ls, i) + z - (i < ls.length - 1 ? 0 : 0);
      if (!explode && i === ls.length - 1) zc = rz + z;
      (m.walls || []).forEach(function (w) {
        if (w.level !== l.id) return;
        var c = fp.c, on = outward(w, c);
        wallPieces(w, fl, explode ? zc : (i === ls.length - 1 && isExt(w) ? rz + ph : levelTop(ls, i)), items, false);
      });
      (m.fixtures || []).forEach(function (f) {
        if (f.level !== l.id || f.upper) return;
        items.push(prism(fixturePoly(f), fl, fl + Math.min(FIX_H[f.kind] || 700, explode ? cutH : 1e9), { side: WHITE }));
      });
      (m.stairs || []).forEach(function (sd) {
        if (sd.from !== l.id) return;
        stairSteps(m, sd).steps.forEach(function (stp) {
          var z1 = stp.z1 - l.fl; if (explode && z1 > cutH) return;
          items.push(prism(stp.poly, fl, fl + z1, { side: WHITE }));
        });
      });
      return { items: items, fl: fl };
    }
    var fpPoly = fp.poly, tl = [], firstZ = null;
    // 基礎（底盤 200。立上りは 1F に含める。判断）
    var baseZ = 0;
    ls.forEach(function (l, i) {
      var z = dz(i), slabT = i === 0 ? 250 : 300, fl = l.fl + z;
      if (i === 0 && explode) { var bz = z - 2600; var b = prism(fpPoly, bz - 200, bz, {}); b.draw(); bottoms.push({ z: bz + 150, id: '基礎', sub: ['べた基礎（底盤 200）'] }); }
      var slab = prism(fpPoly, fl - slabT, fl, { w: st.vis, accent: opt.accent !== false && (explode || i === 0) });
      slab.draw();
      // 床の穴（下の階からの階段の上）
      (m.stairs || []).forEach(function (sd) { if (sd.to === l.id) doc.poly(stairSteps(m, sd).full.map(function (p) { return S(p, fl); }), st.fine, INK, TINT, false, '1 0.6'); });
      var L = levelItems(i, z);
      order(L.items).forEach(function (it) { it.draw(); });
      (m.rooms || []).forEach(function (r) {
        if (r.level !== l.id || !explode) return;
        var c = [0, 0]; r.polygon.forEach(function (p) { c[0] += p[0]; c[1] += p[1]; }); c[0] /= r.polygon.length; c[1] /= r.polygon.length;
        var q = S(c, fl); doc.text(q[0], q[1] + 0.8, r.name, TN, 'middle');
      });
      var rn = (m.rooms || []).filter(function (r) { return r.level === l.id; }).map(function (r) { return r.name; });
      tl.push({ z: fl, id: l.id, sub: [rn.slice(0, 4).join('・'), l.id.replace(/F$/, 'FL') + ' GL+' + nfmt(l.fl) + '　階高 ' + nfmt(levelTop(ls, i) - l.fl)] });
    });
    // 屋根
    var zr = rz + dz(ls.length);
    if (explode || true) {
      var roofSlab = prism(fpPoly, zr - 300, zr, { w: st.vis });
      roofSlab.draw();
      var par = [];
      (m.walls || []).forEach(function (w) { if (w.level === ls[ls.length - 1].id && isExt(w)) { var g = wallGeo(w); par.push(prism(g.poly, zr, zr + ph, {})); } });
      order(par).forEach(function (it) { it.draw(); });
      tl.push({ z: zr, id: '屋根', sub: ['陸屋根・パラペット ' + nfmt(ph), 'RFL GL+' + nfmt(rz)] });
    }
    // 案内線（破線）：層の外形の左右の隅をそろえる
    if (explode) {
      var corners = fpPoly.map(function (p) { return { p: p, x: S(p, 0)[0] }; }).sort(function (a, b) { return a.x - b.x; });
      [corners[0].p, corners[corners.length - 1].p].forEach(function (p) {
        var a = S(p, dz(0) - 2800), b = S(p, zr + ph);
        doc.line(a[0], a[1], b[0], b[1], st.hidden, INK, '1.6 1');
      });
    }
    // ラベル（右の列）。手前の右の隅から引出線
    var xs = fpPoly.map(function (p) { return S(p, 0)[0]; }), xmax = Math.max.apply(null, xs);
    var rc = fpPoly.slice().sort(function (a, b) { return S(b, 0)[0] - S(a, 0)[0]; })[0];
    var xl = xmax + 12;
    var lastY = 1e9;
    bottoms.concat(tl).forEach(function (t) {   // 下から順に。前のラベルと 12mm 未満なら上へずらす
      var p = S(rc, t.z - 150); p[0] -= 0.6;
      var ly = Math.min(p[1], lastY - 12); lastY = ly;
      doc.circle(p[0], p[1], 0.35, st.fine, INK, INK);
      doc.poly([[p[0], p[1]], [xl - 4, p[1]], [xl - 1.5, ly]], st.fine, INK, 'none', true);
      doc.text(xl, ly + 0.9, t.id, TR, 'start', 700);
      t.sub.forEach(function (sx, k) { if (sx) doc.text(xl, ly + 0.9 + 3.6 + k * 3.0, sx, TN, 'start'); });
    });
    // 方位・スケール
    var bb = doc.b.slice();
    var nv = S([0, 1000], 0), n0 = S([0, 0], 0), dx = nv[0] - n0[0], dy = nv[1] - n0[1], dl = Math.hypot(dx, dy);
    var nx = bb[0] + 5 * (s >= 200 ? 2000 : 1000) / s + 16, ny = bb[3] + 4;
    doc.line(nx - dx / dl * 5, ny - dy / dl * 5, nx + dx / dl * 5, ny + dy / dl * 5, st.vis);
    doc.poly([[nx + dx / dl * 5, ny + dy / dl * 5], [nx + dx / dl * 3 - dy / dl * 1, ny + dy / dl * 3 + dx / dl * 1], [nx + dx / dl * 3 + dy / dl * 1, ny + dy / dl * 3 - dx / dl * 1]], st.fine, INK, INK);
    doc.text(nx + dx / dl * 7.5, ny + dy / dl * 7.5 + 0.8, 'N', TN, 'middle');
    scaleBar(doc, st, bb[0], bb[3] + 6, s);
    var ttl = explode ? '各階の分解アクソメ' : 'アクソメ';
    var t = opt.title === false ? null : [(opt.title || (ttl + '（' + (opt.angle === 'iso' ? '等角' : 'プラノメトリック ' + (opt.angle || '30/60')) + '、1:' + s + '）')),
      opt.caption || (explode ? '各階は FL+' + nfmt(cutH) + ' で水平に切り、黒は切った壁。破線は層の隅をそろえる案内線。筆者作成。' : '外形・開口・屋上のパラペット。赤は路地に面する外壁の足元。筆者作成。')];
    return doc.finish(opt, t);
  }

  function errSvg(msg) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="20mm" viewBox="0 0 120 20" font-family="' + FONT + '"><rect width="120" height="20" fill="#fff"/><text x="4" y="11" font-size="3.5" fill="' + INK + '">' + esc(msg) + '</text></svg>';
  }

  G.views = { section: section, elevation: elevation, interior: interior, axon: axon, version: 2 };
})();
