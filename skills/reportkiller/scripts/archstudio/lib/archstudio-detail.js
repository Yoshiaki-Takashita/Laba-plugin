/* 建築スタジオ：詳細図（矩計図・部分詳細・材料記号の凡例）  担当 F5
 * tools/archdraw/detail の Python 版（model.py・jis_hatch.py・draw.py・svgdoc.py・kanabakari.py・detail_window.py・
 * detail_parapet.py・legend.py）を JS に移したもの。外部ライブラリなし。座標は紙の上の mm（y 下向き）。
 *   ・材料の表示記号：JIS A 0150:1999 付表2（右欄・中欄）を <pattern>／clipPath の部品に
 *   ・注記の書式：JIS A 0150 12.4（引出線の黒丸・矢印、文字は線の上 約 1 mm）、JIS Z 8317-1（寸法補助線・縦の数値は −90°）
 *   ・線の太さ 0.13／0.18／0.25／0.5／0.7、文字 2.0／2.5／3.5、色は黒・紙・強調（防火被覆）だけ（SPEC §1・§2）
 * 建物モデル（DESIGN §2）から読む値：levels（FL・階高）、roof.parapet、site.setback、site.roads[0].width、
 *   南の外壁の開口（sill・head）。外壁の層の構成・基礎・床・天井・屋根は「一般的な仕様の例」（Python 版 README の判断）。
 * 公開：window.GnotoArch.views.kanabakari(m, opt)・views.detail(m, kind, opt)（kind：'window'|'parapet'）・
 *       views.legend(opt)・views.detailKinds・views.detailNative → SVG 文字列。
 *   opt：{title:false で図題と目盛を省く, paper:false で紙の大きさでなく図の範囲（全部材の外接＋4 mm）,
 *         scale：本来の縮尺（矩計 20・窓 5・パラペット 10）と違う値を渡すと、構図はそのままで図全体（文字・線も）を一様に縮める}
 */
(function () {
  'use strict';
  var G = window.GnotoArch = window.GnotoArch || {};
  G.views = G.views || {};

  // ---------------------------------------------------------------- 定数（svgdoc.py）
  var INK = '#1A1A1A', GRAY = '#8C9493', ACCENT = '#943522', PAPER = '#FFFFFF';
  var FONT = "'Noto Sans JP','IPAGothic','Helvetica Neue',Arial,sans-serif";
  var W_CUT = 0.5, W_VIS = 0.25, W_THIN = 0.13, W_HIDDEN = 0.18, W_SYMBOL = 0.18, W_TICK = 0.25, W_GROUND = 0.7;
  var T_NOTE = 2.0, T_ROOM = 2.5, T_TITLE = 3.5;
  var SEQ = 0;

  function f(v) { var s = (Math.round(v * 1000) / 1000).toString(); return s === '-0' ? '0' : s; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function dash(kind, d) {
    var k = d < 0.2 ? 1.5 : 1.0, g = f(3 * d * k * 1.6), p = f(0.6 * d * k);
    if (kind === 'dashed') return f(12 * d * k) + ' ' + g;
    if (kind === 'dashdot') return f(24 * d * k) + ' ' + g + ' ' + p + ' ' + g;
    if (kind === 'dashdotdot') return f(24 * d * k) + ' ' + g + ' ' + p + ' ' + g + ' ' + p + ' ' + g;
    return null;
  }
  function charW(ch) {
    var o = ch.charCodeAt(0);
    if (o < 0x2000) { if ('iIl.,:;\'|!'.indexOf(ch) >= 0) return 0.32; if (ch === ' ') return 0.35; return 0.58; }
    if (o >= 0xFF61 && o <= 0xFF9F) return 0.55;
    return 1.0;
  }
  function textW(s, size) { var w = 0; s = String(s); for (var i = 0; i < s.length; i++) w += charW(s[i]); return w * size; }
  function fmt(v) {
    if (Math.abs(v - Math.round(v)) < 0.05) return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var s = v.toFixed(1), i = s.indexOf('.'); return s.slice(0, i).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + s.slice(i);
  }
  // 乱数（模様の種。Python の random と同じ列ではないが、種で決まる）
  function rng(seed) { var a = (seed >>> 0) || 1; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------------------------------------------------------------- Doc（svgdoc.Doc）
  function Doc(w, h, title, desc) {
    this.w = w; this.h = h; this.title = title; this.desc = desc || '';
    this.defs = []; this.body = []; this.n = 0; this.pre = 'ad' + (++SEQ) + '_';
    this.textBoxes = []; this.pats = {}; this.b = [1e9, 1e9, -1e9, -1e9];
  }
  Doc.prototype.ext = function (x, y) { if (this.noExt) return; var b = this.b; if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
  Doc.prototype.uid = function (p) { this.n++; return this.pre + (p || 'i') + this.n; };
  Doc.prototype.addDef = function (s) { this.defs.push(s); };
  Doc.prototype.add = function (s) { this.body.push(s); };
  Doc.prototype.openGroup = function (attrs) { this.body.push(attrs ? '<g ' + attrs + '>' : '<g>'); };
  Doc.prototype.closeGroup = function () { this.body.push('</g>'); };
  function strokeAttr(w, color, dashKind, cap, join) {
    var s = 'stroke="' + (color || INK) + '" stroke-width="' + f(w) + '"';
    if (cap && cap !== 'butt') s += ' stroke-linecap="' + cap + '"';
    if (join && join !== 'miter') s += ' stroke-linejoin="' + join + '"';
    if (dashKind) { var da = dash(dashKind, w); if (da) s += ' stroke-dasharray="' + da + '"'; }
    return s;
  }
  Doc.prototype.line = function (x1, y1, x2, y2, w, color, dashKind, cap) {
    this.ext(x1, y1); this.ext(x2, y2);
    this.add('<line x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(x2) + '" y2="' + f(y2) + '" ' + strokeAttr(w == null ? W_THIN : w, color, dashKind, cap) + '/>');
  };
  Doc.prototype.polyline = function (pts, w, o) {
    o = o || {};
    if (pts.length < 2) return;
    var self = this; pts.forEach(function (p) { self.ext(p[0], p[1]); });
    var d = pts.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ');
    var st = w > 0 ? strokeAttr(w, o.color, o.dashKind, o.cap, o.join) : 'stroke="none"';
    this.add('<' + (o.closed ? 'polygon' : 'polyline') + ' points="' + d + '" fill="' + (o.fill || 'none') + '" ' + st + '/>');
  };
  Doc.prototype.polygon = function (pts, fill, w, color, join) { this.polyline(pts, w || 0, { color: color, closed: true, fill: fill || INK, join: join }); };
  Doc.prototype.rect = function (x, y, w_, h_, fill, w, color) {
    this.ext(x, y); this.ext(x + w_, y + h_);
    var st = w > 0 ? strokeAttr(w, color) : 'stroke="none"';
    this.add('<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(w_) + '" height="' + f(h_) + '" fill="' + (fill || 'none') + '" ' + st + '/>');
  };
  Doc.prototype.circle = function (cx, cy, r, fill, w, color) {
    this.ext(cx - r, cy - r); this.ext(cx + r, cy + r);
    var st = w > 0 ? strokeAttr(w, color) : 'stroke="none"';
    this.add('<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '" fill="' + (fill || 'none') + '" ' + st + '/>');
  };
  Doc.prototype.path = function (d, w, o) {
    o = o || {};
    var st = w > 0 ? strokeAttr(w, o.color, o.dashKind, o.cap, o.join) : 'stroke="none"';
    this.add('<path d="' + d + '" fill="' + (o.fill || 'none') + '" ' + st + '/>');
  };
  Doc.prototype.text = function (x, y, s, size, o) {
    o = o || {}; size = size || T_NOTE;
    var attrs = 'x="' + f(x) + '" y="' + f(y) + '" font-size="' + f(size) + '"';
    if (o.anchor && o.anchor !== 'start') attrs += ' text-anchor="' + o.anchor + '"';
    if (o.weight && o.weight !== 'normal') attrs += ' font-weight="' + o.weight + '"';
    if (o.color && o.color !== INK) attrs += ' fill="' + o.color + '"';
    if (o.rot) attrs += ' transform="rotate(' + f(o.rot) + ' ' + f(x) + ' ' + f(y) + ')"';
    this.add('<text ' + attrs + '>' + esc(s) + '</text>');
    if (o.record !== false) this.recordText(x, y, s, size, o.anchor || 'start', o.rot || 0);
  };
  Doc.prototype.recordText = function (x, y, s, size, anchor, rot) {
    var tw = textW(s, size), a0, a1;
    if (anchor === 'middle') { a0 = -tw / 2; a1 = tw / 2; } else if (anchor === 'end') { a0 = -tw; a1 = 0; } else { a0 = 0; a1 = tw; }
    var b0 = -0.8 * size, b1 = 0.12 * size, box;
    if (!rot) box = [x + a0, y + b0, x + a1, y + b1];
    else if (Math.abs(rot + 90) < 1e-6) box = [x + b0, y - a1, x + b1, y - a0];
    else if (Math.abs(rot - 90) < 1e-6) box = [x - b1, y + a0, x - b0, y + a1];
    else {
      var c = Math.cos(rot * Math.PI / 180), s_ = Math.sin(rot * Math.PI / 180), xs = [], ys = [];
      [a0, a1].forEach(function (u) { [b0, b1].forEach(function (v) { xs.push(x + u * c - v * s_); ys.push(y + u * s_ + v * c); }); });
      box = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
    }
    box.push(s); this.textBoxes.push(box); this.ext(box[0], box[1]); this.ext(box[2], box[3]);
  };
  // k：全体の縮小率（opt.scale が図の本来の縮尺と違うとき、図全体を写真のように縮める。文字・線の太さも一緒に縮む）
  Doc.prototype.toString = function (opt) {
    opt = opt || {}; var k = opt.k || 1;
    var X = 0, Y = 0, W = this.w, H = this.h;
    if (opt.paper === false) { var b = isFinite(this.b[0]) ? this.b : [0, 0, this.w, this.h], m = 4; X = b[0] - m; Y = b[1] - m; W = b[2] - b[0] + 2 * m; H = b[3] - b[1] + 2 * m; }
    var head = '<svg xmlns="http://www.w3.org/2000/svg" width="' + f(W * k) + 'mm" height="' + f(H * k) + 'mm" viewBox="' + f(X * k) + ' ' + f(Y * k) + ' ' + f(W * k) + ' ' + f(H * k) + '" font-family="' + FONT + '" fill="' + INK + '">';
    head += '<title>' + esc(this.title) + '</title>';
    if (this.desc) head += '<desc>' + esc(this.desc) + '</desc>';
    return head + '<defs>' + this.defs.join('') + '</defs>' +
      '<rect x="' + f(X * k) + '" y="' + f(Y * k) + '" width="' + f(W * k) + '" height="' + f(H * k) + '" fill="' + PAPER + '"/>\n' +
      (k !== 1 ? '<g transform="scale(' + f(k) + ')">' : '') + this.body.join('\n') + (k !== 1 ? '</g>' : '') + '\n</svg>';
  };
  function textOverlaps(doc, tol) {
    tol = tol == null ? 0.15 : tol; var bad = [], bx = doc.textBoxes;
    for (var i = 0; i < bx.length; i++) for (var j = i + 1; j < bx.length; j++) {
      var a = bx[i], b = bx[j];
      if (a[0] + tol < b[2] - tol && b[0] + tol < a[2] - tol && a[1] + tol < b[3] - tol && b[1] + tol < a[3] - tol) bad.push([a[4], b[4]]);
    }
    return bad;
  }
  function outOfSheet(doc, margin) {
    margin = margin == null ? 5 : margin; var bad = [];
    doc.textBoxes.forEach(function (b) { if (b[0] < margin || b[1] < margin || b[2] > doc.w - margin || b[3] > doc.h - margin) bad.push(b[4]); });
    return bad;
  }

  // ---------------------------------------------------------------- 材料記号（jis_hatch.py）
  var MATERIALS = {
    concrete: { name: 'コンクリート・鉄筋コンクリート', jis: 'コンクリート及び鉄筋コンクリート', col: '右欄', status: 'JIS+判断', how: '小さな円（骨材）と点。円の数・大きさは判断' },
    concrete_mid: { name: 'コンクリート（中欄）', jis: 'コンクリート及び鉄筋コンクリート', col: '中欄', status: 'JIS+判断', how: '45° の斜線。間隔は判断' },
    mortar: { name: 'モルタル・左官仕上げ', jis: '左官仕上', col: '右欄', status: 'JIS+判断', how: '細かい点' },
    gravel: { name: '砂利・砂', jis: '砂利砂', col: '右欄', status: 'JIS+判断', how: '小石の輪郭を詰めて並べる' },
    crushed: { name: '割栗（砕石の地業にも使う）', jis: '割栗', col: '右欄', status: 'JIS+判断', how: '上下の線の間を斜めの線でつなぎ、両端に小さなくさび。砕石に使うのは判断' },
    earth: { name: '地盤', jis: '地盤', col: '中欄・右欄', status: 'JIS+判断', how: '地盤線の下に矢筈（ジグザグと平行線）の帯' },
    insulation: { name: '保温・吸音材（断熱材）', jis: '保温吸音材', col: '右欄', status: 'JIS+判断', how: '斜めの格子（菱形）' },
    wood_struct: { name: '木材 構造材（木口）', jis: '木材及び木造壁 構造材', col: '中欄・右欄', status: 'JIS', how: '輪郭に対角線 2 本（×）' },
    wood_aux: { name: '木材 補助構造材（木口）', jis: '木材及び木造壁 補助構造材', col: '中欄・右欄', status: 'JIS', how: '輪郭に対角線 1 本' },
    wood_finish: { name: '木材 化粧材', jis: '木材及び木造壁 化粧材', col: '中欄（斜線）・右欄（年輪・木目）', status: 'JIS+判断', how: '1:20 以下は密な斜線、1:10 以上は木口に年輪・長手に木目' },
    wood_long: { name: '木材 長手方向の切断（柱・間柱・野縁受け）', jis: '（付表2に区別なし）', col: '—', status: '判断', how: '輪郭だけ。×・斜線は木口にだけ使う' },
    plywood: { name: '合板', jis: '木材及び木造壁 合板', col: '右欄', status: 'JIS+判断', how: '層に平行な細線' },
    gypsum: { name: 'せっこうボード', jis: '（付表2になし）その他の材料', col: '—', status: '判断', how: '輪郭をかいて材料名を記入（付表2「その他の材料」）' },
    siding: { name: '窯業系サイディング', jis: '（付表2になし）その他の材料', col: '—', status: '判断', how: '輪郭と目地' },
    glass: { name: '板ガラス', jis: '板ガラス', col: '中欄（1 本線）・右欄（細線を重ねる）', status: 'JIS+判断', how: '紙の上で 0.6 mm 未満は 1 本線、それ以上は厚さの中に細線を重ねる' },
    metal: { name: '金属板・形材', jis: '鉄骨（実形）／その他の材料', col: '—', status: '判断', how: '実形を太い線で' },
    stone: { name: '石材・擬石', jis: '石材又はぎ石', col: '右欄', status: 'JIS+判断', how: '斜線と破線を交互に' },
    tile: { name: 'タイル・テラコッタ', jis: 'タイル又はテラコッタ', col: '右欄', status: 'JIS+判断', how: '斜線と点' },
    tatami: { name: '畳', jis: '畳', col: '右欄', status: 'JIS+判断', how: '縦に連なる細長い輪' },
    lath: { name: '金網（メタルラス）', jis: '網 メタルラスの場合', col: '右欄', status: 'JIS', how: 'ジグザグの線' },
    mesh_mid: { name: '金網（中欄）', jis: '網', col: '中欄', status: 'JIS', how: '破線' },
    sealant: { name: 'シーリング材', jis: '（付表2になし）', col: '—', status: '判断', how: '黒く塗る' },
    other: { name: 'その他の材料', jis: 'その他の材料', col: '中欄・右欄', status: 'JIS', how: '輪郭をかいて材料名を記入' }
  };

  function periodicDarts(seed, W, H, nTry, rmin, rmax, gap, maxN, ellipse) {
    var r_ = rng(seed), items = [];
    for (var k = 0; k < nTry && items.length < maxN; k++) {
      var r = rmin + r_() * (rmax - rmin), x = r_() * W, y = r_() * H, ok = true;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], dx = Math.min(Math.abs(x - it[0]), W - Math.abs(x - it[0])), dy = Math.min(Math.abs(y - it[1]), H - Math.abs(y - it[1]));
        if (Math.hypot(dx, dy) < r + it[2] + gap) { ok = false; break; }
      }
      if (ok) items.push([x, y, r, ellipse === false ? 1 : 0.7 + r_() * 0.3, r_() * 180]);
    }
    return items;
  }
  function wrapped(items, W, H) {
    var out = [];
    items.forEach(function (it) {
      [-W, 0, W].forEach(function (ox) { [-H, 0, H].forEach(function (oy) {
        var xx = it[0] + ox, yy = it[1] + oy;
        if (xx >= -it[2] && xx <= W + it[2] && yy >= -it[2] && yy <= H + it[2]) out.push([xx, yy, it[2], it[3], it[4]]);
      }); });
    });
    return out;
  }
  function ellipseSvg(it) {
    return '<ellipse cx="' + f(it[0]) + '" cy="' + f(it[1]) + '" rx="' + f(it[2]) + '" ry="' + f(it[2] * it[3]) + '" transform="rotate(' + f(it[4]) + ' ' + f(it[0]) + ' ' + f(it[1]) + ')" fill="none" stroke="' + INK + '" stroke-width="' + f(W_THIN) + '"/>';
  }
  function dotSvg(x, y, r) { return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r) + '" fill="' + INK + '"/>'; }
  function pat(doc, key, w, h, body, transform) {
    var pid = doc.pre + key;
    if (doc.pats[pid] && !transform) return pid;
    doc.addDef('<pattern id="' + pid + '" patternUnits="userSpaceOnUse" width="' + f(w) + '" height="' + f(h) + '"' + (transform ? ' patternTransform="' + transform + '"' : '') + '>' + body + '</pattern>');
    doc.pats[pid] = 1; return pid;
  }
  function diagTile(s) {
    var t = s * Math.SQRT2;
    return [t, 'M0,' + f(t) + ' L' + f(t) + ',0 M' + f(-t / 2) + ',' + f(t / 2) + ' L' + f(t / 2) + ',' + f(-t / 2) + ' M' + f(t / 2) + ',' + f(3 * t / 2) + ' L' + f(3 * t / 2) + ',' + f(t / 2)];
  }
  function patternId(doc, mat) {
    var W, H, items, body, t, r_, k, i, seg;
    if (mat === 'concrete') {
      W = 14; H = 11; items = periodicDarts(150, W, H, 6000, 0.22, 0.58, 0.35, 17);
      var dots = []; r_ = rng(1501);
      for (k = 0; k < 4000 && dots.length < 64; k++) {
        var x = r_() * W, y = r_() * H, ok = true;
        for (i = 0; i < items.length; i++) { var a = items[i]; if (Math.hypot(Math.min(Math.abs(x - a[0]), W - Math.abs(x - a[0])), Math.min(Math.abs(y - a[1]), H - Math.abs(y - a[1]))) <= a[2] + 0.25) { ok = false; break; } }
        for (i = 0; ok && i < dots.length; i++) { var d2 = dots[i]; if (Math.hypot(Math.min(Math.abs(x - d2[0]), W - Math.abs(x - d2[0])), Math.min(Math.abs(y - d2[1]), H - Math.abs(y - d2[1]))) <= 0.45) ok = false; }
        if (ok) dots.push([x, y]);
      }
      body = wrapped(items, W, H).map(ellipseSvg).join('') + dots.map(function (d) { return dotSvg(d[0], d[1], 0.075); }).join('');
      return pat(doc, 'jis-concrete', W, H, body);
    }
    if (mat === 'gravel') {
      W = H = 4; items = periodicDarts(73, W, H, 6000, 0.2, 0.42, 0.05, 60);
      return pat(doc, 'jis-gravel', W, H, wrapped(items, W, H).map(ellipseSvg).join(''));
    }
    if (mat === 'mortar') {
      W = H = 2.4; r_ = rng(31); var md = [];
      for (k = 0; k < 3000 && md.length < 15; k++) {
        var mx = r_() * W, my = r_() * H, mok = true;
        for (i = 0; i < md.length; i++) if (Math.hypot(Math.min(Math.abs(mx - md[i][0]), W - Math.abs(mx - md[i][0])), Math.min(Math.abs(my - md[i][1]), H - Math.abs(my - md[i][1]))) <= 0.36) { mok = false; break; }
        if (mok) md.push([mx, my]);
      }
      return pat(doc, 'jis-mortar', W, H, md.map(function (d) { return dotSvg(d[0], d[1], 0.065); }).join(''));
    }
    if (mat === 'insulation') {
      t = 0.85 * Math.SQRT2;
      body = '<path d="M0,0 L' + f(t) + ',' + f(t) + ' M0,' + f(t) + ' L' + f(t) + ',0" stroke="' + INK + '" stroke-width="' + f(W_THIN) + '" stroke-linecap="square"/>';
      return pat(doc, 'jis-insulation', t, t, body);
    }
    var simple = { wood_finish: [0.42, 'jis-wood-finish'], concrete_mid: [1.0, 'jis-concrete-mid'] };
    if (simple[mat]) { seg = diagTile(simple[mat][0]); return pat(doc, simple[mat][1], seg[0], seg[0], '<path d="' + seg[1] + '" stroke="' + INK + '" stroke-width="' + f(W_THIN) + '"/>'); }
    if (mat === 'stone') {
      seg = diagTile(1.4); t = seg[0];
      body = '<path d="' + seg[1] + '" stroke="' + INK + '" stroke-width="' + f(W_THIN) + '"/>' +
        '<path d="' + seg[1] + '" transform="translate(' + f(t / 2) + ',0)" stroke="' + INK + '" stroke-width="' + f(W_THIN) + '" stroke-dasharray="0.6 0.35"/>';
      return pat(doc, 'jis-stone', t, t, body);
    }
    if (mat === 'tile') {
      seg = diagTile(1.1); t = seg[0]; r_ = rng(7);
      body = '<path d="' + seg[1] + '" stroke="' + INK + '" stroke-width="' + f(W_THIN) + '"/>';
      for (i = 0; i < 3; i++) body += dotSvg(r_() * t, r_() * t, 0.06);
      return pat(doc, 'jis-tile', t, t, body);
    }
    return null;
  }
  function clipOf(doc, poly) {
    var cid = doc.uid('clip');
    doc.addDef('<clipPath id="' + cid + '"><polygon points="' + poly.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ') + '"/></clipPath>');
    return cid;
  }
  function bboxOf(poly) { var xs = poly.map(function (p) { return p[0]; }), ys = poly.map(function (p) { return p[1]; }); return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; }

  // 多角形 poly を材料 mat の記号で塗る（輪郭は呼ぶ側）。o：{orient:'h'|'v', rects:[[x0,y0,x1,y1]...]}
  function hfill(doc, poly, mat, o) {
    o = o || {}; var orient = o.orient || 'h';
    var pts = poly.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ');
    var pid = patternId(doc, mat);
    if (pid) { doc.add('<polygon points="' + pts + '" fill="url(#' + pid + ')" stroke="none"/>'); return; }
    if (['crushed', 'plywood', 'glass', 'wood_grain', 'wood_end', 'tatami'].indexOf(mat) >= 0) {
      var cid = clipOf(doc, poly);
      doc.openGroup('clip-path="url(#' + cid + ')"');
      (o.rects || [bboxOf(poly)]).forEach(function (r) {
        if (mat === 'crushed') wariguri(doc, r);
        else if (mat === 'plywood') plywood(doc, r, orient);
        else if (mat === 'glass') glass(doc, r, orient);
        else if (mat === 'wood_grain') woodGrain(doc, r, orient);
        else if (mat === 'wood_end') woodEnd(doc, r);
        else if (mat === 'tatami') tatami(doc, r);
      });
      doc.closeGroup();
    }
    // gypsum / siding / other / metal / air：輪郭だけ（JIS「その他の材料」）
  }
  function thinPath(doc, d, w) { doc.add('<path d="' + d.join(' ') + '" fill="none" stroke="' + INK + '" stroke-width="' + f(w || W_THIN) + '"/>'); }
  function wariguri(doc, r) {
    var x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3], h = y1 - y0;
    if (h <= 0.3) return;
    var p = Math.max(1.2, 0.62 * h), lean = 0.18 * h, wv = Math.min(0.16 * h, 0.9), ww = Math.min(0.07 * h, 0.4), d = [];
    for (var x = x0 - lean + p * 0.3; x < x1 + p; x += p) {
      var xt = x, xb = x + lean;
      d.push('M' + f(xt) + ',' + f(y0 + wv) + ' L' + f(xb) + ',' + f(y1 - wv));
      d.push('M' + f(xt - ww) + ',' + f(y0) + ' L' + f(xt) + ',' + f(y0 + wv) + ' L' + f(xt + ww) + ',' + f(y0));
      d.push('M' + f(xb - ww) + ',' + f(y1) + ' L' + f(xb) + ',' + f(y1 - wv) + ' L' + f(xb + ww) + ',' + f(y1));
    }
    thinPath(doc, d);
  }
  function parallel(doc, r, orient, cs, w) {
    var d = [];
    cs.forEach(function (c) {
      if (orient === 'h') d.push('M' + f(r[0]) + ',' + f(r[1] + c) + ' L' + f(r[2]) + ',' + f(r[1] + c));
      else d.push('M' + f(r[0] + c) + ',' + f(r[1]) + ' L' + f(r[0] + c) + ',' + f(r[3]));
    });
    thinPath(doc, d, w);
  }
  function plywood(doc, r, orient) {
    var t = orient === 'h' ? r[3] - r[1] : r[2] - r[0], n = Math.max(1, Math.floor(t / 0.42)), cs = [];
    for (var i = 1; i <= n; i++) cs.push(i * t / (n + 1));
    parallel(doc, r, orient, cs);
  }
  function glass(doc, r, orient) {
    var t = orient === 'h' ? r[3] - r[1] : r[2] - r[0], cs = [];
    if (t < 0.6) cs = [t / 2];
    else { var n = Math.max(2, Math.floor(t / 0.45)); for (var i = 1; i <= n; i++) cs.push(i * t / (n + 1)); }
    parallel(doc, r, orient, cs, cs.length === 1 ? W_VIS : W_THIN);
  }
  function woodGrain(doc, r, orient) {
    var x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3], r_ = rng(Math.floor((x0 + y0) * 10) % 9973 + 1);
    var L = orient === 'h' ? x1 - x0 : y1 - y0, T = orient === 'h' ? y1 - y0 : x1 - x0, n = Math.max(2, Math.floor(T / 0.7)), d = [];
    for (var i = 1; i <= n; i++) {
      var c = i * T / (n + 1) + (r_() * 0.24 - 0.12) * T / (n + 1), a = (r_() * 0.5 - 0.25) * T / (n + 1);
      if (orient === 'h') d.push('M' + f(x0) + ',' + f(y0 + c) + ' Q' + f(x0 + L / 2) + ',' + f(y0 + c + 2 * a) + ' ' + f(x1) + ',' + f(y0 + c));
      else d.push('M' + f(x0 + c) + ',' + f(y0) + ' Q' + f(x0 + c + 2 * a) + ',' + f(y0 + L / 2) + ' ' + f(x0 + c) + ',' + f(y1));
    }
    thinPath(doc, d);
  }
  function woodEnd(doc, r) {
    var x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3], w = x1 - x0, h = y1 - y0, cx = x0 - 0.25 * w, cy = y1 + 0.35 * h;
    var rmax = Math.hypot(x1 - cx, y0 - cy), rmin = Math.hypot(x0 - cx, y1 - cy), step = Math.max(0.55, Math.min(w, h) / 3.5), d = [];
    for (var rr = rmin + step * 0.6; rr < rmax; rr += step) d.push('M' + f(cx - rr) + ',' + f(cy) + ' A' + f(rr) + ',' + f(rr) + ' 0 0 1 ' + f(cx + rr) + ',' + f(cy));
    thinPath(doc, d);
  }
  function tatami(doc, r) {
    var x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3], h = y1 - y0, p = Math.max(0.5, 0.18 * h), d = ['M' + f(x0) + ',' + f(y1 - 0.1 * h)], x = x0, up = true;
    while (x < x1) {
      if (up) d.push('C' + f(x) + ',' + f(y0) + ' ' + f(x + p) + ',' + f(y0) + ' ' + f(x + p) + ',' + f(y0 + 0.5 * h));
      else { d.push('C' + f(x + p) + ',' + f(y1) + ' ' + f(x + 2 * p) + ',' + f(y1) + ' ' + f(x + 2 * p) + ',' + f(y0 + 0.5 * h)); x += p; }
      x += p; up = !up;
    }
    thinPath(doc, d);
  }
  function markX(doc, r, w) { doc.add('<path d="M' + f(r[0]) + ',' + f(r[1]) + ' L' + f(r[2]) + ',' + f(r[3]) + ' M' + f(r[0]) + ',' + f(r[3]) + ' L' + f(r[2]) + ',' + f(r[1]) + '" stroke="' + INK + '" stroke-width="' + f(w || W_THIN) + '"/>'); }
  function markDiag(doc, r, w) { doc.add('<path d="M' + f(r[0]) + ',' + f(r[1]) + ' L' + f(r[2]) + ',' + f(r[3]) + '" stroke="' + INK + '" stroke-width="' + f(w || W_THIN) + '"/>'); }
  function groundPattern(doc, pid, a, s, transform) {
    var d = ['M0,0 L' + f(a) + ',' + f(a) + ' L' + f(2 * a) + ',0'];
    for (var t = s; t < a - 0.05; t += s) {
      d.push('M' + f(t) + ',' + f(t) + ' L' + f(2 * t) + ',0');
      [0, -2 * a].forEach(function (ox) { d.push('M' + f(a + t + ox) + ',' + f(a - t) + ' L' + f(a + 2 * t + ox) + ',' + f(a)); });
    }
    doc.addDef('<pattern id="' + pid + '" patternUnits="userSpaceOnUse" width="' + f(2 * a) + '" height="' + f(a) + '" patternTransform="' + transform + '"><path d="' + d.join(' ') + '" fill="none" stroke="' + INK + '" stroke-width="' + f(W_THIN) + '"/></pattern>');
  }
  function offsetPolyline(pts, d) {
    var n = pts.length, norms = [], out = [];
    for (var i = 0; i < n - 1; i++) { var dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dy) || 1; norms.push([-dy / L, dx / L]); }
    for (i = 0; i < n; i++) {
      if (i === 0) out.push([pts[0][0] + norms[0][0] * d, pts[0][1] + norms[0][1] * d]);
      else if (i === n - 1) out.push([pts[n - 1][0] + norms[n - 2][0] * d, pts[n - 1][1] + norms[n - 2][1] * d]);
      else {
        var n1 = norms[i - 1], n2 = norms[i], bx = n1[0] + n2[0], by = n1[1] + n2[1], bl = Math.hypot(bx, by);
        if (bl < 1e-9) { out.push([pts[i][0] + n1[0] * d, pts[i][1] + n1[1] * d]); continue; }
        bx /= bl; by /= bl; var m = d / Math.max(bx * n1[0] + by * n1[1], 0.2);
        out.push([pts[i][0] + bx * m, pts[i][1] + by * m]);
      }
    }
    return out;
  }
  function groundBand(doc, pts, depth, a, s) {
    depth = depth || 3.6; a = a || 1.8; s = s || 0.6;
    var q = offsetPolyline(pts, depth);
    for (var i = 0; i < pts.length - 1; i++) {
      var ang = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) * 180 / Math.PI, pid = doc.uid('jis-ground');
      groundPattern(doc, pid, a, s, 'translate(' + f(pts[i][0]) + ',' + f(pts[i][1]) + ') rotate(' + f(ang) + ')');
      var quad = [pts[i], pts[i + 1], q[i + 1], q[i]];
      doc.add('<polygon points="' + quad.map(function (p) { return f(p[0]) + ',' + f(p[1]); }).join(' ') + '" fill="url(#' + pid + ')" stroke="none"/>');
    }
  }
  function lathLine(doc, x0, y0, x1, amp, step, w) {
    amp = amp || 0.35; step = step || 0.7; var d = ['M' + f(x0) + ',' + f(y0)], x = x0, up = true;
    while (x < x1) { x = Math.min(x + step / 2, x1); d.push('L' + f(x) + ',' + f(up ? y0 - amp : y0)); up = !up; }
    thinPath(doc, d, w);
  }

  // ---------------------------------------------------------------- 建物の形（model.py）。建物のモデルから条件を読む
  function R(u0, z0, u1, z1) { return [[u0, z0], [u1, z0], [u1, z1], [u0, z1]]; }
  function levelsOf(m) { return (m && m.levels || []).slice().sort(function (a, b) { return a.fl - b.fl; }); }

  // 設計条件（SPEC §4）を 建物のモデルから取り出す。足りないものは Python 版の判断の値
  function conditions(m) {
    var ls = levelsOf(m), C = {};
    C.FL = ls.length ? ls.map(function (l) { return l.fl; }) : [150, 3150, 5950];
    C.STORY = ls.length ? ls.map(function (l) { return l.height || 2800; }) : [3000, 2800, 2700];
    C.GL = 0; C.FL1 = C.FL[0];
    C.RFL = (m && m.roof && m.roof.fl != null) ? m.roof.fl : C.FL[C.FL.length - 1] + C.STORY[C.STORY.length - 1];
    C.PARAPET = (m && m.roof && m.roof.parapet != null) ? m.roof.parapet : 1100;
    C.TOP = C.RFL + C.PARAPET;
    C.SETBACK = (m && m.site && m.site.setback != null) ? m.site.setback : 650;
    // 道路（site.roads[0]）。無ければ描かない（路地・中心線・みなし道路境界・延焼の線は道路があるときだけ。ELEMENTS.md「決め打ちを外す」）
    var road0 = (m && m.site && m.site.roads && m.site.roads[0]) || null;
    C.HAS_ROAD = !!(road0 && road0.width > 0);
    C.ROJI_W = C.HAS_ROAD ? road0.width : null;
    C.ROAD_NAME = C.HAS_ROAD ? (road0.name || (road0.width < 4000 ? '路地' : '道路')) : null;
    C.SIDE = C.HAS_ROAD ? C.ROAD_NAME + '側（南）' : '南';   // 図題の「路地側（南）」は道路があるときだけ
    C.STRUCT = String((m && m.structure) || '');
    C.WOOD = !/RC|鉄筋|コンクリート|S\s*造|鉄骨|石造|組積/.test(C.STRUCT);   // 外壁の構成の例は木造。モデルの構造が違えば図題に断る
    C.SLOPE = 50;
    C.N = C.FL.length;
    C.levelIds = ls.length ? ls.map(function (l) { return l.id; }) : ['1F', '2F', '3F'];
    // 外壁の層（外→内）。判断：告示（平12建告1399）の 1 時間耐火の外壁の例示仕様の形＋通気層
    C.WALL = [['siding', '窯業系サイディング', 16, 'siding'], ['air', '通気層（縦胴縁 18×45＠455）', 18, 'air'],
      ['gbo1', '強化せっこうボード', 21, 'gypsum'], ['gbo2', '強化せっこうボード', 21, 'gypsum'],
      ['frame', '柱 120 角・間柱／高性能グラスウール 16K', 120, 'insulation'],
      ['gbi1', '強化せっこうボード', 21, 'gypsum'], ['gbi2', '強化せっこうボード', 21, 'gypsum']];
    C.WALL_T = C.WALL.reduce(function (s, w) { return s + w[2]; }, 0);
    var U = {}, u = -(C.WALL[4][2] / 2) - (16 + 18 + 21 + 21);
    C.WALL.forEach(function (w) { U[w[0]] = [u, u + w[2]]; u += w[2]; });
    C.U = U; C.U_EXT = U.siding[0]; C.U_SID = U.siding[1]; C.U_GBO = U.gbo1[0]; C.U_GBOM = U.gbo1[1];
    C.U_FO = U.frame[0]; C.U_FI = U.frame[1]; C.U_GBIM = U.gbi1[1]; C.U_INT = U.gbi2[1];
    C.U_BOUND = C.U_EXT - C.SETBACK;
    C.U_CL = C.HAS_ROAD ? C.U_BOUND - C.ROJI_W / 2 : null;
    C.U_MINASHI = C.HAS_ROAD ? C.U_CL + 2000 : null; C.U_ENSHO1 = C.HAS_ROAD ? C.U_CL + 3000 : null; C.U_ENSHO2 = C.HAS_ROAD ? C.U_CL + 5000 : null;
    C.U_END = 3000;
    // 左端：道路の中心線の少し先まで。ただし外壁から 4,000 を超えては描かない（後退 7,000 のモデルで紙が 663 mm になった不具合。
    // 遠い境界や中心線は版面の外になるので省く＝「無ければ描かない」）
    C.U_LEFT = C.HAS_ROAD ? Math.max(C.U_CL - 300, C.U_EXT - 4000) : (C.U_BOUND >= C.U_EXT - 2500 ? C.U_BOUND - 300 : C.U_EXT - 900);
    C.SHOW_BOUND = C.U_BOUND > C.U_LEFT + 100;
    C.SHOW_CL = C.HAS_ROAD && C.U_CL > C.U_LEFT + 100;
    C.STEM_U = [-68, C.U_INT]; C.STEM_TOP = 380; C.STEM_BOT = -250; C.SLAB = [-50, C.FL1]; C.PACK = [380, 400]; C.DODAI = [400, 520]; C.XPS_W = 910;
    C.FLOOR = [['複合フローリング', 12, 'wood_finish'], ['強化せっこうボード', 21, 'gypsum'], ['強化せっこうボード', 21, 'gypsum'], ['構造用合板（剛床）', 28, 'plywood']];
    C.FLOOR_T = 82; C.BEAM = [120, 210]; C.DOSA = [120, 300]; C.NOKETA = [120, 270]; C.BEAM_U = [910, 1820, 2730];
    C.CEIL_GB = []; C.CH = [];
    for (var i = 0; i < C.N; i++) {
      var last = i === C.N - 1;
      C.CEIL_GB.push(last ? [12.5, 15] : [21, 25]);
      // 天井高（判断）：階高 − 床 82 − 梁 210 − 野縁 90 − 板 の範囲で、Python 版の 2,500／2,350／2,250 に合わせる
      var room = C.STORY[i] - (last ? 111 + 210 : 82 + 210) - 90 - (last ? 27.5 : 46) - 10;   // 梁の下端と天井の板の上に野縁 90 が入る上限
      C.CH.push(Math.min(room, [2500, 2350, 2250][Math.min(i, 2)]));
    }
    C.NOBUCHI = 45;
    C.ROOF = [['FRP 防水 2 プライ', 3, 'line'], ['構造用合板（防水下地）', 12, 'plywood'], ['構造用合板（防水下地）', 12, 'plywood'],
      ['硬質ウレタンフォーム保温板（垂木 45×60＠455 の間）', 60, 'insulation'], ['構造用合板', 24, 'plywood']];
    C.ROOF_T = 111; C.U_PIN = C.U_FI + 24; C.TOP_PLATE = 45; C.TENBA_PLY = 12; C.KASAGI_GAP = 15;
    // 開口（南の外壁の窓）：モデルの開口（sill・head は FL から）。掃き出し（sill < 500）は窓台の納まりが別なので、矩計の例の値（判断）
    var ex = [[600, 2400], [650, 2200], [800, 2050]];
    C.WINDOWS = []; C.windowFromModel = [];
    for (i = 0; i < C.N; i++) {
      var lid = C.levelIds[i], op = null;
      (m && m.openings || []).forEach(function (o) {
        var w = (m.walls || []).filter(function (x) { return x.id === o.wall; })[0];
        if (!w || w.level !== lid) return;
        var south = Math.abs(w.a[1] - w.b[1]) < 1 && Math.abs(w.a[1]) < 200;   // y≈0 の壁＝南（Y1）
        if (south && (o.type === 'window' || o.type === 'slide' || o.type === 'sweep' || /window|slide/.test(o.type || '')) && (!op || (o.width || 0) > (op.width || 0))) op = o;
      });
      var e = ex[Math.min(i, 2)];
      if (op && op.sill != null && op.sill >= 500 && op.head > op.sill + 300) { C.WINDOWS.push([C.FL[i] + op.sill, C.FL[i] + op.head]); C.windowFromModel.push(true); }
      else { C.WINDOWS.push([C.FL[i] + e[0], C.FL[i] + e[1]]); C.windowFromModel.push(false); }
    }
    C.MADODAI = 45; C.MAGUSA = 120;
    C.SASH_OUT = C.U_GBO - 14; C.SASH_D = 80; C.SASH_IN = C.SASH_OUT + C.SASH_D;
    C.LANES = [[C.SASH_OUT + 4, C.SASH_OUT + 36], [C.SASH_OUT + 40, C.SASH_OUT + 72]];
    C.GLASS = [6.8, 9.0, 5.0]; C.FIN_U = C.U_GBO - 3.2;
    C.roofDz = function (u) { return Math.max(0, u - (C.U_PIN + 3)) / C.SLOPE; };
    C.deckBottom = function (u) { return C.RFL - C.ROOF_T + C.roofDz(u); };
    C.ceilZ = function (n) { return C.FL[n - 1] + C.CH[n - 1]; };
    return C;
  }

  // 部品：{kind:'region'|'line'|'hidden'|'contour'|'circle', pts, mat, w, mark, orient, tag, lod:[a,b], rects, r, name, grain}
  function part(kind, pts, mat, o) {
    var p = { kind: kind, pts: pts, mat: mat || 'other', w: null, mark: null, orient: 'h', tag: '', lod: [0, 2], rects: null, r: 0, name: '', grain: 'end' };
    if (o) for (var k in o) p[k] = o[k];
    return p;
  }

  function buildParts(C) {
    var P = [], Gd = {};
    function reg(pts, mat, o) { P.push(part('region', pts, mat, o)); }
    function line(pts, w, o) { o = o || {}; var mat = o.mat || 'other'; delete o.mat; o.w = w; P.push(part('line', pts, mat, o)); }
    function contour(pts, o) { P.push(part('contour', pts, 'other', o)); }
    var U_LEFT = C.U_LEFT, U_BOUND = C.U_BOUND, U_EXT = C.U_EXT, U_SID = C.U_SID, U_GBO = C.U_GBO, U_GBOM = C.U_GBOM, U_FO = C.U_FO, U_FI = C.U_FI,
      U_GBIM = C.U_GBIM, U_INT = C.U_INT, U_END = C.U_END, U_PIN = C.U_PIN, TOP = C.TOP, RFL = C.RFL, FL1 = C.FL1, N = C.N;
    var STEM_TOP = C.STEM_TOP, STEM_BOT = C.STEM_BOT, SLAB = C.SLAB, DODAI = C.DODAI, PACK = C.PACK, s0 = C.STEM_U[0], s1 = C.STEM_U[1];

    // ---------------- 路地・外構
    // 道路の舗装は道路があるときだけ（無いモデルでは敷地の地盤が続く）
    var gravelFrom = C.SHOW_BOUND ? U_BOUND : U_LEFT;
    if (C.HAS_ROAD && C.SHOW_BOUND) {
      reg(R(U_LEFT, -100, U_BOUND, 0), 'concrete', { name: C.ROAD_NAME + ' 舗装' });
      reg(R(U_LEFT, -200, U_BOUND, -100), 'crushed', { rects: [[U_LEFT, -200, U_BOUND, -100]], name: C.ROAD_NAME + ' 路盤' });
    }
    reg(R(gravelFrom, -50, s0 - 15, 0), 'gravel', { name: '犬走り 化粧砂利' });
    line([[gravelFrom, -50], [s0 - 15, -50]], 0.13, { lod: [1, 2], name: '防草シート' });

    // ---------------- 基礎
    var conc = [[s0, STEM_TOP], [s1, STEM_TOP], [s1, SLAB[1]], [U_END + 400, SLAB[1]], [U_END + 400, SLAB[0]], [s1, SLAB[0]], [s1, STEM_BOT], [s0, STEM_BOT]];
    reg(conc, 'concrete', { w: 0.5, name: '基礎' });
    reg(R(s0 - 15, -50, s0, STEM_TOP), 'mortar', { name: '基礎巾木' });
    reg(R(U_FO, PACK[0], U_FI, PACK[1]), 'other', { name: '気密パッキン' });
    reg(R(U_FO, DODAI[0], U_FI, DODAI[1]), 'wood_struct', { w: 0.5, mark: 'x', name: '土台' });
    P.push(part('hidden', [[0, DODAI[1] + 30], [0, DODAI[1] - 450]], 'other', { w: 0.18, name: 'アンカーボルト' }));
    reg(R(s1, -100, s1 + C.XPS_W, -50), 'insulation', { name: '土間下断熱' });
    reg(R(s1 + C.XPS_W, -100, U_END + 400, -50), 'concrete', { name: '捨てコンクリート' });
    line([[s1, -100], [U_END + 400, -100]], 0.25, { name: '防湿フィルム' });
    reg(R(s0 - 50, STEM_BOT - 50, s1 + 50, STEM_BOT), 'concrete', { name: '捨てコンクリート（立上り下）' });
    var crushed = [[s0 - 100, STEM_BOT - 200], [s1 + 100, STEM_BOT - 200], [s1 + 100, -250], [U_END + 400, -250], [U_END + 400, -100], [s1, -100], [s1, STEM_BOT], [s1 + 50, STEM_BOT], [s1 + 50, STEM_BOT - 50], [s0 - 100, STEM_BOT - 50]];
    reg(crushed, 'crushed', { rects: [[s0 - 100, STEM_BOT - 200, s1 + 100, STEM_BOT - 50], [s1 + 50, STEM_BOT - 50, s1 + 100, -250], [s1, -250, U_END + 400, -100]], name: '砕石' });
    Gd.earth = [[U_LEFT, -200], [U_BOUND, -200], [U_BOUND, -50], [s0, -50], [s0, STEM_BOT], [s0 - 50, STEM_BOT], [s0 - 50, STEM_BOT - 50], [s0 - 100, STEM_BOT - 50], [s0 - 100, STEM_BOT - 200], [s1 + 100, STEM_BOT - 200], [s1 + 100, -250], [U_END + 400, -250]];
    Gd.glLine = [[U_LEFT, 0], [s0 - 15, 0]];

    // ---------------- 外壁（縦の層）
    var zs = [], zh = [];
    for (var n = 0; n < N; n++) { zs.push(C.WINDOWS[n][0]); zh.push(C.WINDOWS[n][1]); }
    var SID_BOT = 400, SID_TOP = TOP - 70;
    var sidIv = [[SID_BOT, zs[0] - 12]];
    for (n = 0; n < N - 1; n++) sidIv.push([zh[n] + 40, zs[n + 1] - 12]);
    sidIv.push([zh[N - 1] + 40, SID_TOP]);
    sidIv.forEach(function (iv) {
      var a = iv[0], b = iv[1];
      reg(R(U_EXT, a, U_SID, b), 'siding', { name: 'サイディング' });
      for (var j = SID_BOT + 455; j < SID_TOP; j += 455) if (a + 30 < j && j < b - 30) {
        line([[U_EXT, j], [U_SID, j]], 0.13, { lod: [0, 0] });
        line([[U_EXT, j], [U_EXT + 8, j], [U_EXT + 8, j + 10], [U_SID, j + 10]], 0.13, { lod: [1, 2] });
      }
      contour([[U_EXT, a], [U_EXT, b]]);
    });
    Gd.sidIv = sidIv;
    var gboTop = TOP - 60;
    var gbIv = [[STEM_TOP, zs[0]]];
    for (n = 0; n < N - 1; n++) gbIv.push([zh[n], zs[n + 1]]);
    gbIv.push([zh[N - 1], gboTop]);
    gbIv.forEach(function (iv) {
      var a = iv[0], b = iv[1];
      reg(R(U_GBO, a, U_GBOM, b), 'gypsum', { tag: 'fire', name: '強化せっこうボード（屋外側）' });
      reg(R(U_GBOM, a, U_FO, b), 'gypsum', { tag: 'fire', name: '強化せっこうボード（屋外側）' });
      line([[U_GBO, a + (zh.indexOf(a) >= 0 ? 250 : 0)], [U_GBO, b - (zs.indexOf(b) >= 0 ? 10 : 0)]], 0.25, { lod: [1, 2], name: '透湿防水シート' });
    });
    // 枠組みの中（柱の幅）
    var dosa = {};
    for (n = 2; n <= N; n++) dosa[n] = [C.FL[n - 1] - C.FLOOR_T - C.DOSA[1], C.FL[n - 1] - C.FLOOR_T];
    var noketa = [RFL - C.ROOF_T - C.NOKETA[1], RFL - C.ROOF_T];
    Gd.dosa = dosa; Gd.noketa = noketa;
    var cav = [];
    for (n = 1; n <= N; n++) {
      cav.push([n === 1 ? DODAI[1] : C.FL[n - 1] - C.FLOOR_T + 28, zs[n - 1] - C.MADODAI]);
      cav.push([zh[n - 1] + C.MAGUSA, n < N ? dosa[n + 1][0] : noketa[0]]);
    }
    cav.forEach(function (iv) { reg(R(U_FO, iv[0], U_FI, iv[1]), 'insulation', { name: '高性能グラスウール' }); });
    for (n = 1; n <= N; n++) {
      reg(R(U_FO, zs[n - 1] - C.MADODAI, U_FI, zs[n - 1]), 'wood_aux', { mark: 'diag', name: '窓台' });
      reg(R(U_FO, zh[n - 1], U_FI, zh[n - 1] + C.MAGUSA), 'wood_aux', { mark: 'diag', name: 'まぐさ' });
    }
    for (n = 2; n <= N; n++) reg(R(U_FO, dosa[n][0], U_FI, dosa[n][1]), 'wood_struct', { mark: 'x', w: 0.5, name: '胴差' });
    reg(R(U_FO, noketa[0], U_FI, noketa[1]), 'wood_struct', { mark: 'x', w: 0.5, name: '軒桁' });
    // 室内側の被覆
    var gbiIv = [[STEM_TOP, zs[0]]];
    for (n = 1; n <= N; n++) {
      if (n < N) { gbiIv.push([zh[n - 1], C.FL[n] - C.FLOOR_T]); gbiIv.push([C.FL[n] - C.FLOOR_T + 28, zs[n]]); }
      else gbiIv.push([zh[n - 1], C.deckBottom(U_FI)]);
    }
    gbiIv.forEach(function (iv) {
      var a = iv[0], b = iv[1];
      reg(R(U_FI, a, U_GBIM, b), 'gypsum', { tag: 'fire', name: '強化せっこうボード（屋内側）' });
      reg(R(U_GBIM, a, U_INT, b), 'gypsum', { tag: 'fire', name: '強化せっこうボード（屋内側）' });
      line([[U_FI, a], [U_FI, b]], 0.25, { lod: [1, 2], name: '防湿フィルム' });
    });
    for (n = 1; n <= N; n++) {
      contour([[U_INT, n > 1 ? C.FL[n - 1] : STEM_TOP], [U_INT, zs[n - 1]]]);
      contour([[U_INT, zh[n - 1]], [U_INT, C.ceilZ(n)]]);
    }
    contour([[U_INT, FL1], [U_INT, STEM_TOP]]);
    line([[U_GBO - 1, DODAI[0] + 45], [U_GBO - 1, STEM_TOP + 2], [U_EXT - 14, STEM_TOP - 8], [U_EXT - 14, STEM_TOP - 28]], 0.5, { mat: 'metal', name: '土台水切り' });

    // ---------------- 床（2F 以上）
    for (n = 2; n <= N; n++) {
      var fl = C.FL[n - 1], z = fl;
      C.FLOOR.forEach(function (L) {
        var u0 = L[2] === 'plywood' ? U_FO : U_INT;
        reg(R(u0, z - L[1], U_END + 400, z), L[2], { tag: L[2] === 'gypsum' ? 'fire' : '', orient: 'h', grain: 'end', name: L[0] });
        z -= L[1];
      });
      contour([[U_INT, fl], [U_END + 400, fl]]);
      reg(R(U_INT, fl, U_INT + 8, fl + 60), 'wood_finish', { name: '巾木' });
      C.BEAM_U.forEach(function (uc) { reg(R(uc - C.BEAM[0] / 2, fl - C.FLOOR_T - C.BEAM[1], uc + C.BEAM[0] / 2, fl - C.FLOOR_T), 'wood_struct', { mark: 'x', w: 0.5, name: '床梁' }); });
    }

    // ---------------- 天井
    Gd.ceil = {};
    for (n = 1; n <= N; n++) {
      var c = C.ceilZ(n), lo = C.CEIL_GB[n - 1][0], hi = C.CEIL_GB[n - 1][1];
      reg(R(U_INT, c, U_END + 400, c + lo), 'gypsum', { tag: 'fire', name: '天井 強化せっこうボード' });
      reg(R(U_INT, c + lo, U_END + 400, c + lo + hi), 'gypsum', { tag: 'fire', name: '天井 強化せっこうボード' });
      contour([[U_INT, c], [U_END + 400, c]]);
      var zb = c + lo + hi;
      for (var uc = U_INT + 48; uc < U_END + 200; uc += 303) reg(R(uc - 22.5, zb, uc + 22.5, zb + C.NOBUCHI), 'wood_aux', { mark: 'diag', name: '野縁' });
      reg(R(U_INT, zb + C.NOBUCHI, U_END + 400, zb + 2 * C.NOBUCHI), 'wood_long', { name: '野縁受け' });
      for (var bi = 0; bi < C.BEAM_U.length; bi++) {
        var ub = C.BEAM_U[bi], top = n < N ? C.FL[n] - C.FLOOR_T - C.BEAM[1] : C.deckBottom(ub) - C.BEAM[1];
        if (top > zb + 2 * C.NOBUCHI + 1) reg(R(ub - 22.5, zb + 2 * C.NOBUCHI, ub + 22.5, top), 'wood_long', { name: '吊木' });
      }
      Gd.ceil[n] = [c, zb, zb + 2 * C.NOBUCHI];
    }

    // ---------------- 屋根
    function roofPoly(u0, u1, off0, off1) {
      var uk = U_PIN + 3, us = [u0, uk, u1].filter(function (u) { return u >= u0 && u <= u1; });
      us = us.filter(function (u, i) { return us.indexOf(u) === i; }).sort(function (a, b) { return a - b; });
      var topP = us.map(function (u) { return [u, C.deckBottom(u) + off1]; }), botP = us.slice().reverse().map(function (u) { return [u, C.deckBottom(u) + off0]; });
      return topP.concat(botP);
    }
    reg(roofPoly(U_FO, U_END + 400, 0, 24), 'plywood', { name: '構造用合板 t=24' });
    C.BEAM_U.forEach(function (ub) { var zt = C.deckBottom(ub); reg(R(ub - C.BEAM[0] / 2, zt - C.BEAM[1], ub + C.BEAM[0] / 2, zt), 'wood_struct', { mark: 'x', w: 0.5, name: '屋根梁' }); });
    line([[U_PIN, C.deckBottom(U_PIN) + 24], [U_PIN + 3, C.deckBottom(U_PIN + 3) + 24], [U_END + 400, C.deckBottom(U_END + 400) + 24]], 0.25, { lod: [1, 2], name: '防湿フィルム（屋根）' });
    reg(roofPoly(U_PIN, U_END + 400, 24, 84), 'insulation', { name: '屋根断熱' });
    reg(roofPoly(U_PIN, U_END + 400, 84, 96), 'plywood', { name: '防水下地 1' });
    reg(roofPoly(U_PIN, U_END + 400, 96, 108), 'plywood', { name: '防水下地 2' });
    var zsub = C.deckBottom(U_PIN) + 108, cant = 30;
    reg([[U_PIN, zsub], [U_PIN + cant, zsub], [U_PIN, zsub + cant]], 'wood_long', { name: '面木' });
    var frp = [[U_PIN + 1.5, gboTop], [U_PIN + 1.5, zsub + cant + 1.5 * 0.41], [U_PIN + cant + 1.5 * 0.41, zsub + 1.5], [U_END + 400, C.deckBottom(U_END + 400) + 109.5]];
    line(frp, 0.5, { name: 'FRP 防水' });
    Gd.frp = frp; Gd.zsub = zsub;

    // ---------------- パラペット
    var zdk = C.deckBottom(U_FO) + 24;
    reg(R(U_FO, zdk, U_FI, gboTop - C.TOP_PLATE), 'insulation', { name: 'パラペット 断熱' });
    reg(R(U_FO, gboTop - C.TOP_PLATE, U_FI, gboTop), 'wood_aux', { mark: 'diag', name: '天端の横材' });
    reg(R(U_FI, zdk, U_FI + 12, gboTop), 'plywood', { orient: 'v', name: 'パラペット 下地合板' });
    reg(R(U_FI + 12, zdk, U_PIN, gboTop), 'plywood', { orient: 'v', name: 'パラペット 下地合板' });
    reg(R(U_GBO, gboTop, U_PIN + 3, gboTop + C.TENBA_PLY), 'plywood', { name: '天端 合板' });
    var zt = gboTop + C.TENBA_PLY;
    line([[U_GBO - 1.5, gboTop - 100], [U_GBO - 1.5, zt + 1], [U_PIN + 4.5, zt + 1], [U_PIN + 4.5, gboTop - 100]], 0.25, { lod: [1, 2], name: '先張り防水シート（天端）' });
    var uo = U_EXT - C.KASAGI_GAP, ui = U_PIN + 3 + C.KASAGI_GAP;
    var kas = [[uo + 6, SID_TOP - 40 + 4], [uo, SID_TOP - 40], [uo, TOP - 1], [ui, TOP - 1], [ui, SID_TOP - 40], [ui - 6, SID_TOP - 40 + 4]];
    line(kas, 0.5, { mat: 'metal', name: '笠木' });
    Gd.kasagi = kas;
    P.push(part('hidden', [[U_GBO + 10, zt], [U_GBO + 10, TOP - 8], [U_PIN - 10, TOP - 8], [U_PIN - 10, zt]], 'other', { w: 0.18, lod: [1, 2], name: '笠木 金具' }));

    // ---------------- 窓
    for (n = 1; n <= N; n++) windowParts(C, P, zs[n - 1], zh[n - 1]);

    Gd.zs = zs; Gd.zh = zh; Gd.gboTop = gboTop; Gd.zdk = zdk; Gd.sidTop = SID_TOP;
    return { P: P, G: Gd };
  }

  function windowParts(C, P, z_s, z_h) {
    function reg(pts, mat, o) { P.push(part('region', pts, mat, o)); }
    function line(pts, w, o) { o = o || {}; var mat = o.mat || 'other'; delete o.mat; o.w = w == null ? 0.25 : w; P.push(part('line', pts, mat, o)); }
    var so = C.SASH_OUT, si = C.SASH_IN, l1a = C.LANES[0][0], l2a = C.LANES[1][0], U_EXT = C.U_EXT, U_INT = C.U_INT, U_GBO = C.U_GBO, FIN_U = C.FIN_U;
    reg(R(so, z_s, si, z_s + 40), 'metal', { w: 0.25, lod: [0, 0], name: '下枠' });
    reg(R(so, z_h - 38, si, z_h), 'metal', { w: 0.25, lod: [0, 0], name: '上枠' });
    line([[so, z_s + 22], [U_EXT - 14, z_s + 8], [U_EXT - 14, z_s - 14]], 0.25, { mat: 'metal', lod: [0, 0], name: '水切り' });
    var sill = [[so + 4, z_s], [si, z_s], [si, z_s + 50], [si - 6, z_s + 50], [si - 6, z_s + 36], [l2a + 18, z_s + 36], [l2a + 18, z_s + 44], [l2a + 14, z_s + 44], [l2a + 14, z_s + 30], [l1a + 18, z_s + 30], [l1a + 18, z_s + 38], [l1a + 14, z_s + 38], [l1a + 14, z_s + 24], [so, z_s + 20], [so, z_s + 14], [so + 4, z_s + 14]];
    reg(sill, 'metal', { w: 0.25, lod: [1, 2], name: '下枠' });
    [[so + 7, z_s + 3, so + 17, z_s + 12], [so + 22, z_s + 3, l2a - 6, z_s + 22], [l2a + 2, z_s + 3, si - 3, z_s + 30]].forEach(function (r) { reg(R(r[0], r[1], r[2], r[3]), 'other', { w: 0.13, lod: [2, 2] }); });
    line([[l2a - 2, z_s], [l2a - 2, z_s + 30]], 0.25, { lod: [1, 2], name: '樹脂とアルミの境' });
    line([[so, z_s + 17], [U_EXT - 14, z_s + 6], [U_EXT - 14, z_s - 14]], 0.5, { mat: 'metal', lod: [1, 2], name: '水切り' });
    line([[FIN_U, z_s], [FIN_U, z_s - 30]], 0.5, { mat: 'metal', lod: [1, 2], name: 'つば（下）' });
    var head = [[so, z_h], [si, z_h], [si, z_h - 38], [si - 4, z_h - 38], [si - 4, z_h - 12], [l2a + 18, z_h - 12], [l2a + 18, z_h - 34], [l2a + 14, z_h - 34], [l2a + 14, z_h - 12], [l1a + 18, z_h - 12], [l1a + 18, z_h - 34], [l1a + 14, z_h - 34], [l1a + 14, z_h - 12], [so, z_h - 12]];
    reg(head, 'metal', { w: 0.25, lod: [1, 2], name: '上枠' });
    [[so + 4, z_h - 9, l1a + 10, z_h - 3], [l1a + 22, z_h - 9, l2a + 10, z_h - 3], [l2a + 22, z_h - 9, si - 3, z_h - 3]].forEach(function (r) { reg(R(r[0], r[1], r[2], r[3]), 'other', { w: 0.13, lod: [2, 2] }); });
    line([[l2a - 2, z_h], [l2a - 2, z_h - 12]], 0.25, { lod: [1, 2], name: '樹脂とアルミの境' });
    line([[FIN_U, z_h], [FIN_U, z_h + 30]], 0.5, { mat: 'metal', lod: [1, 2], name: 'つば（上）' });
    var gOut = C.GLASS[0], gAir = C.GLASS[1], gIn = C.GLASS[2], gt = gOut + gAir + gIn;
    C.LANES.forEach(function (ln) {
      var a = ln[0], b = ln[1], c = (a + b) / 2, g0 = c - gt / 2;
      var zb0 = z_s + (a === l1a ? 24 + 14 : 30 + 14), zt1 = z_h - 14, gz0 = zb0 + 48 - 15, gz1 = zt1 - 40 + 15;
      reg(R(g0, gz0, g0 + gOut, gz1), 'glass', { orient: 'v', name: '網入り板ガラス 6.8' });
      reg(R(g0 + gOut + gAir, gz0, g0 + gt, gz1), 'glass', { orient: 'v', name: 'フロート板ガラス 5' });
      P.push(part('hidden', [[g0 + gOut / 2, gz0], [g0 + gOut / 2, gz1]], 'other', { w: 0.13, lod: [2, 2], name: '網' }));
      reg(R(a, zb0, b, zb0 + 48), 'metal', { w: 0.25, lod: [0, 0], name: '下框' });
      reg(R(a, zt1 - 40, b, zt1), 'metal', { w: 0.25, lod: [0, 0], name: '上框' });
      var ra = a + 13, rb = a + 19;
      reg([[a, zb0], [ra, zb0], [ra, zb0 + 14], [rb, zb0 + 14], [rb, zb0], [b, zb0], [b, zb0 + 48], [a, zb0 + 48]], 'metal', { w: 0.25, lod: [1, 2], name: '下框' });
      reg([[a, zt1 - 40], [b, zt1 - 40], [b, zt1], [rb, zt1], [rb, zt1 - 22], [ra, zt1 - 22], [ra, zt1], [a, zt1]], 'metal', { w: 0.25, lod: [1, 2], name: '上框' });
      reg(R(g0 - 2.5, zb0 + 48 - 16, g0 + gt + 2.5, zb0 + 48), 'other', { w: 0.13, lod: [1, 2] });
      reg(R(g0 - 2.5, zt1 - 40, g0 + gt + 2.5, zt1 - 40 + 16), 'other', { w: 0.13, lod: [1, 2] });
      reg(R(g0, gz0, g0 + gOut, zb0 + 48 + 2), 'glass', { orient: 'v', lod: [1, 2] });
      reg(R(g0 + gOut + gAir, gz0, g0 + gt, zb0 + 48 + 2), 'glass', { orient: 'v', lod: [1, 2] });
      reg(R(g0, zt1 - 40 - 2, g0 + gOut, gz1), 'glass', { orient: 'v', lod: [1, 2] });
      reg(R(g0 + gOut + gAir, zt1 - 40 - 2, g0 + gt, gz1), 'glass', { orient: 'v', lod: [1, 2] });
      [zb0 + 48 - 6, zt1 - 40].forEach(function (zz) {
        reg(R(g0 - 2.5, zz, g0, zz + 6), 'sealant', { w: 0, lod: [2, 2], name: 'グレイジング' });
        reg(R(g0 + gt, zz, g0 + gt + 2.5, zz + 6), 'sealant', { w: 0, lod: [2, 2], name: 'グレイジング' });
      });
      reg(R(g0 + gOut, gz0, g0 + gOut + gAir, gz0 + 9), 'other', { w: 0.25, lod: [2, 2], name: 'スペーサー' });
      reg(R(g0 + gOut, gz1 - 9, g0 + gOut + gAir, gz1), 'other', { w: 0.25, lod: [2, 2], name: 'スペーサー' });
      P.push(part('circle', [[c, zb0 + 6.5]], 'other', { r: 6, w: 0.25, lod: [2, 2], name: '戸車' }));
    });
    [so, si, U_INT + 8].forEach(function (u) {
      var top = u !== U_INT + 8 ? z_h - 38 : z_h - 41, bot = u !== U_INT + 8 ? z_s + 50 : z_s + 41;
      line([[u, bot], [u, top]], 0.25, { lod: [0, 0], name: '見えがかり' });
    });
    reg(R(si, z_s, U_INT, z_s + 21), 'gypsum', { tag: 'fire', name: '開口の返し 強化せっこうボード' });
    reg(R(si, z_s + 21, U_INT + 8, z_s + 41), 'wood_finish', { grain: 'end', name: '額縁' });
    reg(R(si, z_h - 21, U_INT, z_h), 'gypsum', { tag: 'fire', name: '開口の返し 強化せっこうボード' });
    reg(R(si, z_h - 41, U_INT + 8, z_h - 21), 'wood_finish', { grain: 'end', name: '額縁' });
    line([[si, z_s - 1], [U_GBO - 1.6, z_s - 1], [U_GBO - 1.6, z_s - 150]], 0.25, { lod: [1, 2], name: '先張り防水シート' });
    line([[U_GBO - 5.0, z_h + 4], [U_GBO - 5.0, z_h + 75]], 0.5, { lod: [2, 2], name: '両面防水テープ' });
    line([[U_GBO - 6.6, z_h + 70], [U_GBO - 6.6, z_h + 22], [U_EXT - 12, z_h + 10], [U_EXT - 12, z_h - 6]], 0.5, { mat: 'metal', name: '窓上 水切り' });
    line([[U_GBO, z_h + 250], [U_GBO, z_h + 92], [U_GBO - 8.2, z_h + 84], [U_GBO - 8.2, z_h + 26]], 0.25, { lod: [1, 2], name: '透湿防水シート（窓上）' });
  }

  // ---------------- 実寸 → 紙（draw.View）
  function View(scale, ox, oy, u0, z0, clip, lod) {
    this.s = scale; this.ox = ox; this.oy = oy; this.u0 = u0 || 0; this.z0 = z0 || 0; this.clip = clip || null; this.lod = lod || 0;
  }
  View.prototype.x = function (u) { return this.ox + (u - this.u0) / this.s; };
  View.prototype.y = function (z) { return this.oy - (z - this.z0) / this.s; };
  View.prototype.p = function (u, z) { return [this.x(u), this.y(z)]; };
  View.prototype.ps = function (pts) { var v = this; return pts.map(function (q) { return v.p(q[0], q[1]); }); };

  // ---------------- 部品を描く（draw.render）
  function render(doc, view, parts, fire, breaks) {
    var c = view.clip, cid = doc.uid('view');
    doc.addDef('<clipPath id="' + cid + '"><rect x="' + f(c[0]) + '" y="' + f(c[1]) + '" width="' + f(c[2] - c[0]) + '" height="' + f(c[3] - c[1]) + '"/></clipPath>');
    doc.openGroup('clip-path="url(#' + cid + ')"');
    doc.ext(c[0], c[1]); doc.ext(c[2], c[3]); doc.noExt = true;   // 切り取られる部材は外接に数えない（範囲の矩形だけ）
    var shown = [];
    parts.forEach(function (p) {
      if (!(p.lod[0] <= view.lod && view.lod <= p.lod[1])) return;
      var pp = view.ps(p.pts), r = p.kind === 'circle' ? p.r / view.s : 0;
      var xs = pp.map(function (q) { return q[0]; }), ys = pp.map(function (q) { return q[1]; });
      if (Math.max.apply(null, xs) + r < c[0] || Math.min.apply(null, xs) - r > c[2] || Math.max.apply(null, ys) + r < c[1] || Math.min.apply(null, ys) - r > c[3]) return;
      shown.push(p);
      if (p.kind === 'region') region(doc, view, p, fire);
      else if (p.kind === 'line') doc.polyline(pp, p.w != null ? p.w : W_VIS, { join: 'miter' });
      else if (p.kind === 'hidden') doc.polyline(pp, p.w || W_HIDDEN, { dashKind: 'dashed' });
      else if (p.kind === 'contour') doc.polyline(pp, W_CUT, { cap: 'square' });
      else if (p.kind === 'circle') doc.circle(pp[0][0], pp[0][1], p.r / view.s, PAPER, p.w || W_VIS);
    });
    doc.noExt = false; doc.closeGroup();
    if (breaks !== false) breakMarks(doc, view, shown);
    return shown;
  }
  function region(doc, view, p, fire) {
    var poly = view.ps(p.pts), m = p.mat;
    if (m === 'sealant') { doc.polygon(poly, INK, 0); return; }
    var accentOutline = m === 'gypsum' && p.tag === 'fire' && fire === 'outline';
    if (m === 'gypsum' && p.tag === 'fire' && fire === 'solid') doc.polygon(poly, ACCENT, 0);
    else doc.polygon(poly, PAPER, 0);
    if (accentOutline) { doc.polyline(poly, W_VIS, { color: ACCENT, closed: true }); return; }
    var rects = null;
    if (p.rects) rects = p.rects.map(function (r) { var a = view.p(r[0], r[3]), b = view.p(r[2], r[1]); return [a[0], a[1], b[0], b[1]]; });
    if (m === 'wood_finish') {
      if (view.s >= 20) hfill(doc, poly, 'wood_finish');
      else hfill(doc, poly, p.grain === 'end' ? 'wood_end' : 'wood_grain', { orient: p.orient });
    } else if (['concrete', 'mortar', 'gravel', 'insulation', 'stone', 'tile', 'concrete_mid'].indexOf(m) >= 0) hfill(doc, poly, m);
    else if (['crushed', 'plywood', 'glass', 'tatami'].indexOf(m) >= 0) hfill(doc, poly, m, { orient: p.orient, rects: rects });
    var w = p.w != null ? p.w : W_VIS;
    var xs = poly.map(function (q) { return q[0]; }), ys = poly.map(function (q) { return q[1]; });
    if (m === 'glass') {
      var t = p.orient === 'v' ? Math.max.apply(null, xs) - Math.min.apply(null, xs) : Math.max.apply(null, ys) - Math.min.apply(null, ys);
      if (t < 0.6) return;
      w = W_THIN;
    }
    if (w > 0) doc.polyline(poly, w, { closed: true });
    if (p.mark) {
      var c = view.clip, r = [Math.max(Math.min.apply(null, xs), c[0]), Math.max(Math.min.apply(null, ys), c[1]), Math.min(Math.max.apply(null, xs), c[2]), Math.min(Math.max.apply(null, ys), c[3])];
      if (r[2] > r[0] && r[3] > r[1]) (p.mark === 'x' ? markX : markDiag)(doc, r);
    }
  }
  function breakMarks(doc, view, parts, tol) {
    tol = tol || 0.9; var c = view.clip, edges = { L: [], R: [], T: [], B: [] };
    parts.forEach(function (p) {
      if (p.kind !== 'region' || p.mat === 'sealant') return;
      var poly = view.ps(p.pts), xs = poly.map(function (q) { return q[0]; }), ys = poly.map(function (q) { return q[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      if (x1 - x0 < 0.05 && y1 - y0 < 0.05) return;
      [['L', c[0], y0, y1, x0, x1], ['R', c[2], y0, y1, x0, x1], ['T', c[1], x0, x1, y0, y1], ['B', c[3], x0, x1, y0, y1]].forEach(function (e) {
        if (e[4] < e[1] - 0.05 && e[5] > e[1] + 0.05) {
          var lim = e[0] === 'L' || e[0] === 'R' ? [c[1], c[3]] : [c[0], c[2]], s0 = Math.max(e[2], lim[0]), s1 = Math.min(e[3], lim[1]);
          if (s1 > s0) edges[e[0]].push([s0, s1]);
        }
      });
    });
    Object.keys(edges).forEach(function (key) {
      var iv = edges[key].sort(function (a, b) { return a[0] - b[0]; }), merged = [];
      iv.forEach(function (ab) { if (merged.length && ab[0] <= merged[merged.length - 1][1] + tol) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], ab[1]); else merged.push([ab[0], ab[1]]); });
      merged.forEach(function (ab) {
        if (key === 'L' || key === 'R') zigV(doc, key === 'L' ? c[0] : c[2], ab[0] - 1.2, ab[1] + 1.2);
        else zigH(doc, key === 'T' ? c[1] : c[3], ab[0] - 1.2, ab[1] + 1.2);
      });
    });
  }
  function zigV(doc, x, y0, y1) { var m = (y0 + y1) / 2, a = 1.1; doc.polyline([[x, y0], [x, m - 0.9], [x - a, m - 0.3], [x + a, m + 0.3], [x, m + 0.9], [x, y1]], W_THIN, { join: 'miter' }); }
  function zigH(doc, y, x0, x1) { var m = (x0 + x1) / 2, a = 1.1; doc.polyline([[x0, y], [m - 0.9, y], [m - 0.3, y - a], [m + 0.3, y + a], [m + 0.9, y], [x1, y]], W_THIN, { join: 'miter' }); }

  // ---------------- 寸法・引出線・記号（draw.py）
  var EXT_OVER = 8 * W_THIN, EXT_GAP = 0.8, TICK = 2.0, DOT_R = 0.38, TXT_GAP = 0.9, PITCH = 1.45;
  function tick(doc, x, y) { var d = TICK / 2 / Math.SQRT2; doc.line(x - d, y + d, x + d, y - d, W_TICK); }
  function dimV(doc, x, ys, labels, o) {
    o = o || {}; var size = o.size || T_NOTE, side = o.textSide || 'left', prefix = o.prefix || '', ext = o.extFrom;
    var sorted = ys.slice().sort(function (a, b) { return a - b; });
    doc.line(x, sorted[0], x, sorted[sorted.length - 1], W_THIN);
    ys.forEach(function (y, i) {
      tick(doc, x, y);
      if (ext && ext[i] != null) { var sgn = ext[i] < x ? 1 : -1; doc.line(ext[i] + sgn * EXT_GAP, y, x + sgn * EXT_OVER, y, W_THIN); }
    });
    var mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys), last = ys.length - 1;
    for (var k = 0; k < ys.length - 1; k++) {
      var lab = labels[k]; if (lab == null) continue; lab = prefix + lab;
      var ya = ys[k], yb = ys[k + 1], ym = (ya + yb) / 2, tw = textW(lab, size);
      var tx = side === 'left' ? x - TXT_GAP : x + TXT_GAP + 0.8 * size;
      if (tw > Math.abs(yb - ya) - 0.6) {
        var lo = Math.min(ya, yb), hi = Math.max(ya, yb);
        if ((k === last - 1 && ys[last] === mn) || (k === 0 && ys[0] === mn)) { doc.line(x, lo, x, lo - tw - 1.2, W_THIN); doc.text(tx, lo - 0.6 - tw / 2, lab, size, { anchor: 'middle', rot: -90 }); continue; }
        if ((k === last - 1 && ys[last] === mx) || (k === 0 && ys[0] === mx)) { doc.line(x, hi, x, hi + tw + 1.2, W_THIN); doc.text(tx, hi + 0.6 + tw / 2, lab, size, { anchor: 'middle', rot: -90 }); continue; }
        tx = side === 'left' ? tx - (0.8 * size + 0.4) : tx + (0.8 * size + 0.4);
      }
      doc.text(tx, ym, lab, size, { anchor: 'middle', rot: -90 });
    }
  }
  function dimH(doc, y, xs, labels, o) {
    o = o || {}; var size = o.size || T_NOTE, above = o.textAbove !== false, stagger = o.stagger !== false, ext = o.extFrom;
    var sorted = xs.slice().sort(function (a, b) { return a - b; });
    doc.line(sorted[0], y, sorted[sorted.length - 1], y, W_THIN);
    xs.forEach(function (x, i) {
      tick(doc, x, y);
      if (ext && ext[i] != null) { var sgn = ext[i] < y ? 1 : -1; doc.line(x, ext[i] + sgn * EXT_GAP, x, y + sgn * EXT_OVER, W_THIN); }
    });
    var mn = Math.min.apply(null, xs), mx = Math.max.apply(null, xs), last = xs.length - 1;
    for (var k = 0; k < xs.length - 1; k++) {
      var lab = labels[k]; if (lab == null) continue;
      var xa = xs[k], xb = xs[k + 1], xm = (xa + xb) / 2, tw = textW(lab, size);
      var ty = above ? y - TXT_GAP : y + TXT_GAP + 0.8 * size;
      if (tw > Math.abs(xb - xa) - 0.6) {
        var lo = Math.min(xa, xb), hi = Math.max(xa, xb);
        if ((k === 0 && xs[0] === mn) || (k === last - 1 && xs[last] === mn)) { doc.line(lo, y, lo - tw - 1.2, y, W_THIN); doc.text(lo - 0.6, ty, lab, size, { anchor: 'end' }); continue; }
        if ((k === last - 1 && xs[last] === mx) || (k === 0 && xs[0] === mx)) { doc.line(hi, y, hi + tw + 1.2, y, W_THIN); doc.text(hi + 0.6, ty, lab, size, { anchor: 'start' }); continue; }
        if (stagger) ty = above ? ty - (size + 0.3) : ty + (size + 0.3);
      }
      doc.text(xm, ty, lab, size, { anchor: 'middle' });
    }
  }
  function arrow(doc, x, y, fx, fy, L, ang) {
    L = L || 1.8; ang = ang || 15; var a = Math.atan2(fy - y, fx - x);
    [-1, 1].forEach(function (s) { var b = a + s * ang * Math.PI / 180; doc.line(x, y, x + L * Math.cos(b), y + L * Math.sin(b), W_THIN); });
  }
  // 引出線と注記。o：{side:'left'|'right', ends:[], size, boldFirst, width, dotR}
  function leader(doc, pts, lines, colX, shoulderY, o) {
    o = o || {}; var side = o.side || 'left', size = o.size || T_NOTE, dotR = o.dotR || DOT_R;
    var tw = o.width || Math.max.apply(null, lines.map(function (s) { return textW(s, size); })) + 0.6, kx, sx0, sx1;
    if (side === 'left') { kx = colX + tw; sx0 = colX; sx1 = kx; } else { kx = colX; sx0 = colX; sx1 = colX + tw; }
    var path = pts.slice(); path.push([kx, shoulderY]);
    if (Math.abs(path[path.length - 2][0] - kx) < 1e-6 && Math.abs(path[path.length - 2][1] - shoulderY) < 1e-6) path.pop();
    doc.polyline(path, W_THIN);
    doc.line(sx0, shoulderY, sx1, shoulderY, W_THIN);
    var ends = o.ends || pts.map(function () { return 'dot'; });
    pts.forEach(function (p, i) {
      if (ends[i] === 'dot') doc.circle(p[0], p[1], dotR, INK, 0);
      else if (ends[i] === 'arrow') { var nx = i + 1 < path.length ? path[i + 1] : [kx, shoulderY]; arrow(doc, p[0], p[1], nx[0], nx[1]); }
    });
    var n = lines.length;
    lines.forEach(function (s, i) { doc.text(sx0 + 0.3, shoulderY - TXT_GAP - (n - 1 - i) * size * PITCH, s, size, { weight: o.boldFirst && i === 0 ? 'bold' : 'normal' }); });
    return [sx0, shoulderY - TXT_GAP - n * size * PITCH, sx1, shoulderY];
  }
  function label(doc, x, y, s, size, anchor, bold) { doc.text(x, y, s, size || T_NOTE, { anchor: anchor || 'start', weight: bold ? 'bold' : 'normal' }); }
  function level(doc, x0, x1, y, name, value, o) {
    o = o || {}; var size = o.size || T_NOTE, right = o.right !== false, below = !!o.below;
    doc.line(x0, y, x1, y, W_THIN);
    var sx = o.symX != null ? o.symX : (right ? x1 - 2 : x0 + 2), k = below ? -1 : 1;
    doc.polygon([[sx, y], [sx - 1.2, y - k * 1.8], [sx + 1.2, y - k * 1.8]], PAPER, W_SYMBOL);
    var s = name + '　' + value, ty = below ? y + TXT_GAP + 0.8 * size : y - TXT_GAP;
    if (right) doc.text(sx + 2, ty, s, size); else doc.text(sx - 2, ty, s, size, { anchor: 'end' });
  }
  function grid(doc, x, y0, y1, name, bubbleAt, r) {
    r = r || 3.4; doc.line(x, y0, x, y1, W_THIN, null, 'dashdot');
    var cy = bubbleAt === 'bottom' ? y1 + r : y0 - r;
    doc.circle(x, cy, r, PAPER, W_SYMBOL); doc.text(x, cy + 0.9, name, T_ROOM, { anchor: 'middle' });
  }
  function refLine(doc, x, y0, y1, lines, side, kind, size) {
    size = size || T_NOTE; doc.line(x, y0, x, y1, W_THIN, null, kind || 'dashdotdot');
    lines.forEach(function (s, i) {
      var yy = y0 - 1.0 - (lines.length - 1 - i) * size * PITCH;
      if (side === 'right') doc.text(x + 0.8, yy, s, size); else if (side === 'left') doc.text(x - 0.8, yy, s, size, { anchor: 'end' }); else doc.text(x, yy, s, size, { anchor: 'middle' });
    });
  }
  function airArrow(doc, pts) { doc.polyline(pts, W_THIN); var a = pts[pts.length - 1], b = pts[pts.length - 2]; arrow(doc, a[0], a[1], b[0], b[1], 1.4, 22); }
  function detailCircle(doc, cx, cy, r, text, tx, ty, anchor) { doc.circle(cx, cy, r, null, W_THIN); doc.text(tx, ty, text, T_NOTE, { anchor: anchor || 'start', weight: 'bold' }); }
  function scaleBar(doc, x, y, scale, total, step, unit) {
    unit = unit || 'mm'; var n = Math.round(total / step), h = 1.2;
    for (var i = 0; i < n; i++) doc.rect(x + i * step / scale, y - h, step / scale, h, i % 2 === 0 ? INK : PAPER, W_THIN);
    for (i = 0; i <= n; i++) doc.text(x + i * step / scale, y + 2.6, fmt(i * step) + (i === n ? ' ' + unit : ''), T_NOTE, { anchor: i === n ? 'start' : 'middle' });
    return x + total / scale;
  }
  function caption(doc, x, y, title, lines) {
    doc.text(x, y, title, T_TITLE, { weight: 'bold' }); var yy = y + 4.6;
    lines.forEach(function (s) { doc.text(x, yy, s, T_NOTE); yy += T_NOTE * PITCH; });
    return yy;
  }
  // 注記を 1 列に並べる。items：[点 or 点の列, [行...], 'dot'|'arrow']
  function columnNotes(doc, items, colX, o) {
    o = o || {}; var side = o.side || 'left', gap = o.gap == null ? 1.6 : o.gap, size = o.size || T_NOTE, align = o.align || 'left';
    function isList(pt) { return Array.isArray(pt[0]); }
    function last(pt) { return isList(pt) ? pt[pt.length - 1] : pt; }
    var its = items.slice().sort(function (a, b) { return last(a[0])[1] - last(b[0])[1]; }), placed = [], prevBottom = o.yMin != null ? o.yMin : -1e9;
    its.forEach(function (it) {
      var h = it[1].length * size * PITCH + TXT_GAP, sy = Math.max(last(it[0])[1], prevBottom + h + gap);
      placed.push([it[0], it[1], it[2], sy, h]); prevBottom = sy;
    });
    if (o.yMax != null && placed.length && placed[placed.length - 1][3] > o.yMax) {
      placed[placed.length - 1][3] = o.yMax;
      for (var i = placed.length - 2; i >= 0; i--) { var lim = placed[i + 1][3] - placed[i + 1][4] - gap; if (placed[i][3] > lim) placed[i][3] = lim; }
    }
    return placed.map(function (pl) {
      var cx = colX;
      if (side === 'left' && align === 'right') cx = colX - (Math.max.apply(null, pl[1].map(function (s) { return textW(s, size); })) + 0.6);
      var pts = isList(pl[0]) ? pl[0].slice() : [pl[0]], ends = pts.map(function () { return pl[2]; });
      return leader(doc, pts, pl[1], cx, pl[3], { side: side, ends: ends, size: size, boldFirst: /（上から）$/.test(pl[1][0]) });
    });
  }

  function paperOf(opt, dflt) { return (opt && opt.paper && Array.isArray(opt.paper)) ? opt.paper : dflt; }
  // native：図の本来の縮尺。opt.scale がそれと違えば k＝native/scale で全体を縮める（構図は本来の縮尺のまま）。
  // 例：矩計 1:20 を 1:50 で置く → k=0.4（A2 の図が 168×238 mm に。文字 2.0→0.8 mm。読める大きさは見開きの担当が縮尺で決める）
  function finish(doc, opt, native) {
    doc.checks = { overlaps: textOverlaps(doc), out: outOfSheet(doc), bbox: doc.b.slice() };
    G.views.lastChecks = doc.checks;   // 自己点検（文字の重なり・版面からのはみ出し）を外から読めるように
    var k = (opt && opt.scale && native) ? native / opt.scale : 1;
    return doc.toString({ paper: !(opt && opt.paper === false), k: k });
  }

  // ================================================================ 図 1 矩計図（kanabakari.py）
  function kanabakari(m, opt) {
    opt = opt || {}; var C = conditions(m), B = buildParts(C), P = B.P, Gd = B.G;
    var SCALE = 20, pg = paperOf(opt, [420, 594]), W = pg[0], Hh = pg[1];
    var doc = new Doc(W, Hh, '矩計図 ' + C.SIDE + 'の外壁', C.SIDE + 'の外壁の矩計図。1:' + SCALE + '。GnotoArchStudio views.kanabakari');
    var span = C.TOP + 400 + 560;   // 描く高さ（実寸）：最高高さの上 400 から地盤の下 560
    var X0 = 62 - C.U_LEFT / SCALE, Y0 = 12 + (C.TOP + 400) / SCALE;
    var v = new View(SCALE, X0, Y0, 0, 0, [62, 10, X0 + C.U_END / SCALE, Y0 + 560 / SCALE], 0);
    var x = function (u) { return v.x(u); }, y = function (z) { return v.y(z); };
    var zs = Gd.zs, zh = Gd.zh, xb = v.clip[2], N = C.N;
    // 形
    var cid = doc.uid('clip'), c = v.clip;
    doc.addDef('<clipPath id="' + cid + '"><rect x="' + f(c[0]) + '" y="' + f(c[1]) + '" width="' + f(c[2] - c[0]) + '" height="' + f(c[3] - c[1]) + '"/></clipPath>');
    doc.openGroup('clip-path="url(#' + cid + ')"'); doc.noExt = true; groundBand(doc, v.ps(Gd.earth), 3.6); doc.noExt = false; doc.closeGroup();
    render(doc, v, P, 'solid');
    doc.polyline(v.ps(Gd.glLine), W_GROUND);
    // 参照線
    var FL2 = C.FL[1] != null ? C.FL[1] : C.FL1 + C.STORY[0];
    if (C.SHOW_BOUND) refLine(doc, x(C.U_BOUND), y(2250), y(-200), ['敷地境界線'], 'right');
    if (C.SHOW_CL) {   // 道路の中心線・みなし道路境界・延焼の線は、道路（site.roads）があるモデルだけ
      refLine(doc, x(C.U_CL), y(2650), y(0), [C.ROAD_NAME + '中心線'], 'right', 'dashdot');
      if (C.ROJI_W < 4000) refLine(doc, x(C.U_MINASHI), y(2950), y(0), ['みなし道路境界線', '（' + C.ROAD_NAME + 'を 2 項道路と仮定）'], 'left');
      refLine(doc, x(C.U_ENSHO1), y(FL2), y(C.FL1), [], 'right');
      refLine(doc, x(C.U_ENSHO2), y(C.TOP), y(FL2), [], 'right');
      ['延焼のおそれのある部分の線', '1 階：' + C.ROAD_NAME + '中心線から 3,000'].forEach(function (s, k) { label(doc, x(C.U_ENSHO1) + 1.0, y(1900) + k * 2.9, s); });
      var ze2 = FL2 + Math.min(3550, (C.TOP - FL2) * 0.55);
      leader(doc, [[x(C.U_ENSHO2), y(ze2)]], ['延焼のおそれのある部分の線', '2 階以上：' + C.ROAD_NAME + '中心線から 5,000'], x(1250), y(ze2), { side: 'left', ends: ['arrow'] });
      dimH(doc, y(1250), [x(C.U_CL), x(C.U_BOUND), x(C.U_EXT)], [fmt(C.ROJI_W / 2), fmt(C.SETBACK)], { extFrom: [y(0), y(0), null] });
      if (C.ROJI_W < 4000) dimH(doc, y(1750), [x(C.U_CL), x(C.U_MINASHI)], ['2,000'], { extFrom: [null, null] });
      label(doc, x(C.U_CL) + 1.0, y(1250) + 3.4, C.ROAD_NAME + 'の幅 ' + fmt(C.ROJI_W) + ' の半分');
    } else if (C.SHOW_BOUND) {
      dimH(doc, y(1250), [x(C.U_BOUND), x(C.U_EXT)], [fmt(C.SETBACK)], { extFrom: [y(0), null] });
    } else {
      label(doc, x(C.U_LEFT) + 1.0, y(1250), '敷地境界まで ' + fmt(C.SETBACK) + '（図の外）');
    }
    // 通り芯 Y1・壁厚
    grid(doc, x(0), y(C.TOP + 300), v.clip[3] + 1.0, 'Y1', 'bottom');
    dimH(doc, y(C.TOP + 250), [x(C.U_EXT), x(0), x(C.U_INT)], [fmt(-C.U_EXT), fmt(C.U_INT)], { extFrom: [y(C.TOP + 10), null, y(C.TOP + 10)] });
    dimH(doc, y(C.TOP + 250) - 6.0, [x(C.U_EXT), x(C.U_INT)], ['外壁 ' + fmt(C.WALL_T)], { extFrom: [y(C.TOP + 250), y(C.TOP + 250)] });
    // レベルと高さの寸法（右）
    var lv = [['最高高さ（笠木の天端）', C.TOP], ['RFL（防水面・パラペット際）', C.RFL]];
    for (var n = N; n >= 1; n--) lv.push([n === 1 ? '1FL（土間）' : n + 'FL', C.FL[n - 1]]);
    lv.push([C.HAS_ROAD ? 'GL（' + C.ROAD_NAME + 'の路面）' : 'GL', 0]);
    lv.forEach(function (L) {
      var x0 = L[0].indexOf('最高') === 0 ? x(C.U_INT) + 1 : xb + 0.8;
      level(doc, x0, xb + 26, y(L[1]), L[0], L[1] ? 'GL+' + fmt(L[1]) : '±0', { symX: xb + 24 });
    });
    var ysH = [y(0)], labsH = [fmt(C.FL1)];
    for (n = 0; n < N; n++) { ysH.push(y(C.FL[n])); }
    ysH.push(y(C.RFL)); ysH.push(y(C.TOP));
    for (n = 0; n < N - 1; n++) labsH.push(fmt(C.FL[n + 1] - C.FL[n]));
    labsH.push(fmt(C.RFL - C.FL[N - 1])); labsH.push(fmt(C.PARAPET));
    dimV(doc, xb + 8, ysH, labsH);
    dimV(doc, xb + 16, [y(0), y(C.TOP)], [fmt(C.TOP)]);
    label(doc, xb + 8, y(C.TOP) - 9.0, '階高', T_NOTE, 'middle');
    label(doc, xb + 16, y(C.TOP) - 5.0, '全高', T_NOTE, 'middle');
    // 室内の高さ（開口・天井高）
    for (n = 1; n <= N; n++) {
      var cz = C.ceilZ(n), fl = C.FL[n - 1];
      dimV(doc, x(330), [y(fl), y(zs[n - 1]), y(zh[n - 1]), y(cz)], [fmt(zs[n - 1] - fl), fmt(zh[n - 1] - zs[n - 1]), fmt(cz - zh[n - 1])], { extFrom: [null, x(C.U_INT + 10), x(C.U_INT + 10), null] });
      dimV(doc, x(2600), [y(fl), y(cz)], [fmt(cz - fl)], { prefix: 'CH ' });
    }
    // 室名（モデルの室名。南の外壁に接する室を各階 1 つ）
    var roomNames = roomsAtSouth(m, C);
    for (n = 1; n <= N; n++) label(doc, x(1750), y(C.FL[n - 1] + Math.round(C.CH[n - 1] * 0.48)), roomNames[n - 1], T_ROOM, 'middle');
    label(doc, x(900), y(C.RFL + 250), '屋上', T_ROOM, 'middle');
    if (C.SHOW_BOUND) label(doc, 66, y(260), C.HAS_ROAD ? C.ROAD_NAME : '敷地', T_ROOM);
    // 注記：外壁（外→内の層）。引出線は最上階の腰壁を水平に横切る
    var zc = C.FL[N - 1] + 300, us = [81, 60, 0, -81, -102, -111, -128];
    leader(doc, us.map(function (u) { return [x(u), y(zc + (81 - u) * 0.9)]; }),
      ['外壁 総厚 ' + fmt(C.WALL_T) + '（耐火の構成の例）', '窯業系サイディング t=16', '通気層 18（縦胴縁 18×45＠455）', '透湿防水シート',
        '強化せっこうボード t=21＋21（屋外側の防火被覆）', '柱 120 角・間柱／グラスウール 16K t=120', '防湿フィルム',
        '強化せっこうボード t=21＋21・AEP（屋内側の防火被覆）'], 104, y(zc + 209 * 0.9), { side: 'left', boldFirst: true, dotR: 0.26 });
    var zwin = (zs[1 < N ? 1 : 0] + zh[1 < N ? 1 : 0]) / 2;
    leader(doc, [[x(-103), y(zwin)]], ['防火設備の窓（例）', 'アルミ樹脂複合サッシ・引違い', '網入り複層ガラス 6.8＋中空層 9＋5'], 116, y(zwin) + 6, { side: 'left', ends: ['arrow'], boldFirst: true });
    leader(doc, [[x(-151), y(C.TOP - 30)]], ['アルミ笠木（通気型）'], 132, y(C.TOP - 30) + 4, { side: 'left', ends: ['arrow'] });
    leader(doc, [[x(-30), y(C.RFL + 450)]], ['パラペット：グラスウール 16K 充填'], 118, y(C.RFL + 450) + 4, { side: 'left' });
    leader(doc, [[x(-20), y(460)]], ['土台 120 角（防腐・防蟻処理）', '気密パッキン t=20'], 92, y(1000), { side: 'left' });
    leader(doc, [[x(-140), y(372)]], ['土台水切り ガルバリウム鋼板 t=0.35'], 92, y(760), { side: 'left', ends: ['arrow'] });
    leader(doc, [[x(-75), y(150)]], ['基礎巾木 モルタル刷毛引き t=15'], 92, y(560), { side: 'left' });
    leader(doc, [[x(-480), y(-25)]], ['化粧砂利 t=50・防草シート（犬走り）'], 92, y(330), { side: 'left' });
    if (C.HAS_ROAD && C.SHOW_BOUND) leader(doc, [[x(Math.max(C.U_LEFT + 200, C.U_BOUND - 1500)), y(-50)]], [C.ROAD_NAME + '：コンクリート舗装 t=100・砕石 t=100'], 92, y(110), { side: 'left' });
    leader(doc, [[x(15), y(-130)]], ['べた基礎 立上り 幅 170・根入れ 250', 'アンカーボルト M12（隠れ線）', '鉄筋は構造図による'], 92, y(-520), { side: 'left' });
    // 注記：床・天井・屋根・土間
    function stack(u, zlist, lines, colX, zsh, side, bold, kx) {
      var pts = zlist.map(function (z) { return [x(u), y(z)]; });
      if (kx != null) { var tw = Math.max.apply(null, lines.map(function (s) { return textW(s, T_NOTE); })) + 0.6; colX = kx - tw; }
      leader(doc, pts, lines, colX, y(zsh), { side: side, boldFirst: bold });
    }
    if (N >= 2) {
      var fl2 = C.FL[1];
      stack(2050, [fl2 - 68, fl2 - 33, fl2 - 6], ['複合フローリング t=12', '強化せっこうボード t=21＋21（床の防火被覆）', '構造用合板 t=28（剛床）'], null, fl2 + 560, 'left', false, x(2050));
      for (n = 3; n <= N; n++) leader(doc, [[x(1300), y(C.FL[n - 1] - 6)]], [n + ' 階の床：2 階の床と同じ構成'], x(330) + 4, y(C.FL[n - 1] + 300), { side: 'left', width: x(1300) - x(330) - 4 });
    }
    [[1, ['野縁受け 45×45＠910・吊木', '野縁 45×45＠303', '強化せっこうボード t=25＋21・AEP（床の下の防火被覆）']],
     [N, ['野縁受け 45×45＠910・吊木', '野縁 45×45＠303', '強化せっこうボード t=15＋12.5・AEP（屋根の防火被覆）']]].forEach(function (it) {
      var nn = it[0]; if (nn === 1 && N === 1) return;
      var cc = Gd.ceil[nn], lo = C.CEIL_GB[nn - 1][0];
      stack(2271, [cc[2] - 22, cc[1] + 22, cc[0] + lo], it[1], null, cc[0] - 420, 'left', false, x(2271) - 4);
    });
    for (n = 2; n < N; n++) leader(doc, [[x(1500), y(C.ceilZ(n) + 10)]], [n + ' 階の天井：1 階の天井と同じ構成'], x(330) + 4, y(C.ceilZ(n) - 330), { side: 'left', width: x(1500) - x(330) - 4 });
    if (N >= 2) {
      leader(doc, [[x(0), y(Gd.dosa[2][0] + 150)]], ['胴差 120×300'], 196, y(Gd.dosa[2][0] + 60), { side: 'right' });
      leader(doc, [[x(910), y(C.FL[1] - 82 - 105)]], ['床梁 120×210＠910'], 240, y(C.FL[1] - 82 - 150), { side: 'right' });
    }
    leader(doc, [[x(0), y(Gd.noketa[0] + 135)]], ['軒桁 120×270'], 196, y(Gd.noketa[0] + 40), { side: 'right' });
    leader(doc, [[x(910), y(C.deckBottom(910) - 105)]], ['屋根梁 120×210＠910'], 240, y(C.deckBottom(910) - 150), { side: 'right' });
    var u = 2450, db = C.deckBottom(u);
    stack(u, [db + 12, db + 24, db + 54, db + 96, db + 109.5], ['屋上（陸屋根・勾配 1/50）', 'FRP 防水 2 プライ・歩行用トップコート', '構造用合板 t=12＋12（防水下地）', '硬質ウレタンフォーム保温板 t=60（垂木の間）', '防湿フィルム', '構造用合板 t=24'], null, C.RFL + 550, 'left', true, x(u));
    stack(700, [-175, -100, -75, 50], ['土間コンクリート（耐圧盤）t=200 金ごて押え', '押出法ポリスチレンフォーム t=50（外周 910）', '防湿フィルム t=0.15', '砕石 t=150（割栗の記号で表す）'], x(700) + 14, 680, 'right');
    leader(doc, [[x(2300), y(-75)]], ['捨てコンクリート t=50'], x(1950), y(330), { side: 'right' });
    // 詳細の位置
    var nd = Math.min(2, N);
    detailCircle(doc, x(-20), y(zs[nd - 1] - 10), 9.0, '詳細 1：窓まわり（1:5）', x(-20) + 10, y(zs[nd - 1]) + 10.5);
    doc.circle(x(-20), y(zh[nd - 1] + 20), 9.0, null, W_THIN);
    detailCircle(doc, x(-25), y(C.TOP - 330), 15.0, '詳細 2：パラペット（1:10）', x(-25) + 16, y(C.TOP - 330) - 11);
    // 図題・スケールバー
    if (opt.title !== false) {
      var yc = Hh - 31;
      caption(doc, 30, yc, '図 1　' + C.SIDE + 'の外壁の矩計図（1:' + SCALE + '）', [
        '基礎からパラペットまでの床組・壁・開口・天井・屋根の層を、材料と寸法の引出線で示す。赤茶の帯は防火被覆の強化せっこうボードで、木の骨組みを室内と屋外から包む。',
        '構成は木造の一般的な仕様の例で、法令への適合を示すものではない。' + (C.SHOW_CL ? '参照線は建築基準法の定義の距離を描いたもの。' : '') + '階の高さと開口はモデルの値。筆者作成。'
        + (C.windowFromModel.every(Boolean) ? '' : '窓の高さは矩計の例の値（掃き出しは別の納まり）。')
        + (C.WOOD ? '' : 'モデルの構造は「' + C.STRUCT.slice(0, 24) + '」で、この木造の構成の例とは異なる。')]);
      scaleBar(doc, W - 80, yc - 2.5, SCALE, 1000, 250);
    }
    return finish(doc, opt, 20);
  }
  function roomsAtSouth(m, C) {
    var out = [], dflt = ['土間（作業場・店）', '居間', '寝室'];
    for (var i = 0; i < C.N; i++) {
      var lid = C.levelIds[i], best = null;
      (m && m.rooms || []).forEach(function (r) {
        if (r.level !== lid || !r.polygon) return;
        var touches = r.polygon.some(function (p) { return Math.abs(p[1]) < 200; });
        if (touches && (!best || polyArea(r.polygon) > polyArea(best.polygon))) best = r;
      });
      var nm = best ? (best.name + (best.sub ? '（' + best.sub + '）' : '')) : dflt[Math.min(i, 2)];
      if (nm.length > 8) nm = nm.replace('・食堂・台所', '');
      out.push(nm);
    }
    return out;
  }
  function polyArea(p) { var a = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; }

  // ================================================================ 図 2 詳細 1：窓まわり（detail_window.py）
  function detailWindow(m, opt) {
    opt = opt || {}; var C = conditions(m), B = buildParts(C), P = B.P;
    var SCALE = 5, pg = paperOf(opt, [420, 297]), W = pg[0], Hh = pg[1];
    var N = Math.min(opt.level || 2, C.N);
    var doc = new Doc(W, Hh, '窓まわり詳細 縦断面', C.SIDE + 'の ' + N + ' 階の窓の縦断面。1:' + SCALE + '。GnotoArchStudio views.detail(window)');
    var z_s = C.WINDOWS[N - 1][0], z_h = C.WINDOWS[N - 1][1], c = C.ceilZ(N), FL = C.FL[N - 1];
    var OX = 205.0, U0 = -232, U1 = 330;
    var topZ1 = z_h + 350, topZ0 = z_h - 200, botZ1 = z_s + 190, botZ0 = z_s - 240;
    var top = new View(SCALE, OX, 22, 0, topZ1, null, 2);
    top.clip = [top.x(U0), top.y(topZ1), top.x(U1), top.y(topZ0)];
    var bot = new View(SCALE, OX, top.clip[3] + 14, 0, botZ1, null, 2);
    bot.clip = [bot.x(U0), bot.y(botZ1), bot.x(U1), bot.y(botZ0)];
    render(doc, top, P, 'outline'); render(doc, bot, P, 'outline');
    // 通り芯
    var yg = bot.clip[3] + 15.0;
    doc.line(top.x(0), top.clip[1] - 4, top.x(0), yg, W_THIN, null, 'dashdot');
    doc.circle(top.x(0), yg + 3.4, 3.4, PAPER, W_SYMBOL); doc.text(top.x(0), yg + 3.4 + 0.9, 'Y1', T_ROOM, { anchor: 'middle' });
    // 通気の流れ
    var t = top, b = bot;
    airArrow(doc, [t.p(-152, z_h + 2), t.p(-128, z_h + 30), t.p(-111, z_h + 46), t.p(-111, z_h + 190)]);
    airArrow(doc, [b.p(-111, z_s - 200), b.p(-111, z_s - 22), b.p(-128, z_s - 4), b.p(-158, z_s - 30)]);
    // 注記
    var L = [], Rn = [];
    L.push([t.p(-128, z_h + 230), ['窯業系サイディング t=16（合いじゃくり）'], 'dot'],
      [t.p(-111, z_h + 120), ['通気層 18：窓の上の水切りとの間から入る'], 'dot'],
      [t.p(C.U_GBO - 8.2, z_h + 60), ['透湿防水シート（上から重ねる）'], 'arrow'],
      [t.p(C.U_GBO - 5.0, z_h + 40), ['両面防水テープ t=0.6×75（つばの上）'], 'arrow'],
      [t.p(-81, z_h + 330), ['強化せっこうボード t=21＋21', '（屋外側の防火被覆）'], 'dot'],
      [t.p(-122, z_h + 15), ['窓上 水切り ガルバリウム鋼板 t=0.35'], 'arrow'],
      [t.p(C.FIN_U, z_h + 12), ['サッシのつば（釘打ちフィン）'], 'arrow'],
      [t.p(C.SASH_OUT + 6, z_h - 6), ['上枠 アルミ形材（外）＋樹脂形材（内）'], 'dot'],
      [t.p(C.LANES[0][0] + 4, z_h - 40), ['上框（外障子）'], 'dot'],
      [t.p(-103, z_h - 65), ['網入り板ガラス 6.8（網は破線）'], 'dot'],
      [t.p(-95, z_h - 78), ['中空層 9（乾燥空気）'], 'dot'],
      [t.p(-88.1, z_h - 90), ['フロート板ガラス 5'], 'dot']);
    var hasFloorAbove = N < C.N;
    if (hasFloorAbove) Rn.push([t.p(0, Math.min(C.FL[N] - C.FLOOR_T - 15, z_h + 315)), ['胴差 120×300'], 'dot']);
    else Rn.push([t.p(0, Math.min(B.G.noketa[1] - 15, z_h + 315)), ['軒桁 120×270'], 'dot']);
    Rn.push([t.p(260, c + 91 + 22), ['野縁受け 45×45＠910'], 'dot'],
      [t.p(150, c + 46 + 22), ['野縁 45×45＠303'], 'dot'],
      [t.p(260, c + 21), hasFloorAbove ? ['天井 強化せっこうボード t=25＋21・AEP', '（床の下の防火被覆）'] : ['天井 強化せっこうボード t=12.5＋15・AEP', '（屋根の防火被覆）'], 'dot'],
      [t.p(81, z_h + 330), ['強化せっこうボード t=21＋21・AEP', '（屋内側の防火被覆）'], 'dot'],
      [t.p(C.U_FI, z_h + 100), ['防湿フィルム t=0.2'], 'arrow'],
      [t.p(0, z_h + 60), ['まぐさ 120×120'], 'dot'],
      [t.p(30, z_h - 8), ['開口の返し 強化せっこうボード t=21'], 'dot'],
      [t.p(60, z_h - 31), ['額縁 t=20（木・クリア塗装）'], 'dot']);
    var zb0 = z_s + 38;
    L.push([b.p(C.LANES[1][0] + 4, z_s + 74), ['下框（内障子）'], 'dot'],
      [b.p(-96, zb0 + 6.5), ['戸車'], 'dot'],
      [b.p(C.SASH_OUT + 10, z_s + 8), ['下枠 アルミ形材（外）＋樹脂形材（内）', '室内側に水返し'], 'dot'],
      [b.p(-140, z_s + 9), ['水切り（下枠と一体）'], 'arrow'],
      [b.p(-128, z_s - 40), ['サイディングの上端：水切りの下を 20 以上あけ、', '通気層の空気を外へ出す'], 'dot'],
      [b.p(C.FIN_U, z_s - 18), ['サッシのつば（釘打ちフィン）'], 'arrow'],
      [b.p(C.U_GBO - 1.6, z_s - 110), ['先張り防水シート（窓台を包み、', '下の透湿防水シートの上に重ねる）'], 'arrow'],
      [b.p(C.U_GBO, z_s - 185), ['透湿防水シート'], 'arrow'],
      [b.p(-81, z_s - 215), ['強化せっこうボード t=21＋21（屋外側）'], 'dot']);
    Rn.push([b.p(70, z_s + 31), ['額縁 t=20（木・クリア塗装）'], 'dot'],
      [b.p(30, z_s + 10), ['開口の返し 強化せっこうボード t=21'], 'dot'],
      [b.p(0, z_s - 22), ['窓台 120×45'], 'dot'],
      [b.p(0, z_s - 160), ['高性能グラスウール 16K t=120'], 'dot'],
      [b.p(81, z_s - 215), ['強化せっこうボード t=21＋21・AEP（屋内側）'], 'dot']);
    columnNotes(doc, L, top.x(U0) - 6, { side: 'left', align: 'right', yMin: 16, yMax: bot.clip[3] });
    columnNotes(doc, Rn, top.x(U1) + 8, { side: 'right', yMin: 16, yMax: bot.clip[3] });
    // 寸法（高さ）：開口の高さは省略をまたいで実寸を書く
    var xd = top.x(200);
    dimV(doc, xd, [b.y(z_s), t.y(z_h), t.y(c)], [fmt(z_h - z_s), fmt(c - z_h)], { extFrom: [b.x(C.U_INT + 10), t.x(C.U_INT + 10), null] });
    level(doc, t.x(C.U_INT + 10), t.x(312), t.y(c), '天井', N + 'FL+' + fmt(c - FL), { symX: t.x(225), right: true, below: true });
    // 寸法（水平）
    var yb = bot.clip[3] + 5.0;
    var xs = [C.U_EXT, C.U_SID, C.U_GBO, C.U_GBOM, C.U_FO, C.U_FI, C.U_GBIM, C.U_INT].map(function (u) { return b.x(u); });
    dimH(doc, yb, xs, ['16', '18', '21', '21', '120', '21', '21'], { extFrom: xs.map(function () { return bot.clip[3]; }) });
    dimH(doc, yb + 5.5, [xs[0], xs[xs.length - 1]], [fmt(C.WALL_T)], { extFrom: [yb, yb] });
    var ya = top.clip[1] - 5.0, xs2 = [C.U_EXT, C.SASH_OUT, C.SASH_IN, C.U_INT].map(function (u) { return t.x(u); });
    dimH(doc, ya, xs2, [fmt(C.SASH_OUT - C.U_EXT), '見込み ' + fmt(C.SASH_D), fmt(C.U_INT - C.SASH_IN)], { extFrom: xs2.map(function () { return top.clip[1]; }) });
    label(doc, top.x(-60), (top.clip[3] + bot.clip[1]) / 2 + 0.8, 'ガラスの中間を省略', T_NOTE, 'middle');
    if (opt.title !== false) {
      var yc = Hh - 35;
      caption(doc, 24, yc, '図 2　詳細 1：' + C.SIDE + 'の ' + N + ' 階の窓まわり 縦断面（1:' + SCALE + '）', [
        '防火設備の窓（アルミ樹脂複合サッシ・引違い・網入り複層ガラスの例）を、耐火の外壁の例に納めた形。赤茶の輪郭は防火被覆の強化せっこうボードで、開口のまわりで室内側へ折り返す。',
        'サッシの下端は ' + N + 'FL+' + fmt(z_s - FL) + '、上端は ' + N + 'FL+' + fmt(z_h - FL) + '。雨水は水切りと先張り防水シートで外へ、通気層の空気は窓の上下のすき間から出入りする（矢印）。',
        'サッシの断面は特定の製品でなく簡略化した形。法令への適合は示さない。矩計図（図 1）と同じ数値で描いた。筆者作成。']);
      scaleBar(doc, W - 90, yc - 2.5, SCALE, 200, 50);
    }
    return finish(doc, opt, 5);
  }

  // ================================================================ 図 3 詳細 2：パラペット（detail_parapet.py）
  function detailParapet(m, opt) {
    opt = opt || {}; var C = conditions(m), B = buildParts(C), P = B.P, Gd = B.G;
    var SCALE = 10, pg = paperOf(opt, [420, 297]), W = pg[0], Hh = pg[1];
    var doc = new Doc(W, Hh, 'パラペット詳細', C.SIDE + 'のパラペットの納まり。1:' + SCALE + '。GnotoArchStudio views.detail(parapet)');
    var N = C.N, U0 = -450, U1 = 760, Z1 = C.TOP + 100, Z0 = Z1 - 1970;
    var v = new View(SCALE, 200, 24, 0, Z1, null, 1);
    v.clip = [v.x(U0), v.y(Z1), v.x(U1), v.y(Z0)];
    render(doc, v, P, 'outline');
    var x = function (u) { return v.x(u); }, y = function (z) { return v.y(z); }, p = function (u, z) { return v.p(u, z); };
    var zt = Gd.gboTop + C.TENBA_PLY, cN = Gd.ceil[N], c3 = cN[0], zb3 = cN[1], ztop3 = cN[2], TOP = C.TOP, RFL = C.RFL;
    var yg = v.clip[3] + 13;
    doc.line(x(0), y(TOP) - 2, x(0), yg, W_THIN, null, 'dashdot');
    doc.circle(x(0), yg + 3.4, 3.4, PAPER, W_SYMBOL); doc.text(x(0), yg + 4.3, 'Y1', T_ROOM, { anchor: 'middle' });
    airArrow(doc, [p(-111, TOP - 400), p(-111, TOP - 32), p(-143.5, TOP - 24), p(-143.5, TOP - 160)]);
    airArrow(doc, [p(640, RFL + C.roofDz(640) + 150), p(420, RFL + C.roofDz(420) + 145)]);
    label(doc, x(530), y(RFL + C.roofDz(530) + 150) - 1.2, '勾配 1/50', T_NOTE, 'middle');
    label(doc, x(530), y(RFL + C.roofDz(530) + 150) + 3.4, '雨水はパラペット際へ', T_NOTE, 'middle');
    var zh3 = C.WINDOWS[N - 1][1];
    var L = [[p(C.U_EXT - 15, TOP - 4), ['アルミ笠木 t=2（通気型）'], 'arrow'],
      [p(C.U_GBO + 10, TOP - 15), ['笠木の金具＠600（隠れ線）：天端の上から釘を打たない'], 'arrow'],
      [p(C.U_GBO - 1.5, TOP - 95), ['先張り防水シート（改質アスファルトルーフィング）', '天端を包み、両側へ 100 垂らす'], 'arrow'],
      [p(-143.5, TOP - 90), ['通気層の出口：笠木の垂れと外壁の間 15'], 'dot'],
      [p(-128, TOP - 190), ['窯業系サイディング t=16（上端は笠木の垂れに 40 入れる）'], 'dot'],
      [p(C.U_GBO, TOP - 330), ['透湿防水シート'], 'arrow'],
      [p(-81, TOP - 450), ['強化せっこうボード t=21＋21（屋外側の防火被覆、天端まで）'], 'dot'],
      [p(-111, TOP - 570), ['通気層 18（縦胴縁 18×45＠455）'], 'dot'],
      [p(0, TOP - 700), ['グラスウール 16K t=120（パラペットの中）'], 'dot'],
      [p(-30, Gd.zdk - 12), ['構造用合板 t=24（屋根の床面材、軒桁の上まで）'], 'dot'],
      [p(0, Gd.noketa[0] + 150), ['軒桁 120×270'], 'dot'],
      [p(0, (Gd.noketa[0] + zh3 + C.MAGUSA) / 2), ['高性能グラスウール 16K t=120'], 'dot'],
      [p(0, zh3 + 60), ['まぐさ 120×120（' + N + ' 階の窓の上）'], 'dot'],
      [p(-122, zh3 + 15), ['窓上 水切り（詳細 1 と同じ納まり）'], 'arrow']];
    var Rn = [[p(-20, zt - 6 - C.TENBA_PLY - 22), ['天端の横材 120×45'], 'dot'],
      [p(40, zt - 6), ['天端 構造用合板 t=12'], 'dot'],
      [p(C.U_PIN + 1.5, TOP - 450), ['FRP 防水の立上り：天端まで（防水面から ' + fmt(Gd.gboTop - RFL) + '）', '入隅は面木 30×30 で FRP を鋭く折らない'], 'arrow'],
      [p(72, TOP - 600), ['構造用合板 t=12＋12（立上りの下地）'], 'dot'],
      [p(81, Gd.noketa[0] + 150), ['強化せっこうボード t=21＋21・AEP（屋内側）'], 'dot'],
      [p(700, ztop3 - 22), ['野縁受け 45×45＠910'], 'dot'],
      [p(756, zb3 + 22), ['野縁 45×45＠303'], 'dot'],
      [p(700, c3 + 12.5), ['天井 強化せっこうボード t=12.5＋15・AEP', '（屋根の屋内側の防火被覆）'], 'dot']];
    var u = 680, db = C.deckBottom(u);
    Rn.push([[db + 12, db + 24, db + 54, db + 96, db + 109.5].map(function (z) { return p(u, z); }),
      ['屋上の層（上から）', 'FRP 防水 2 プライ・歩行用トップコート', '構造用合板 t=12＋12（防水下地・継目をずらす）', '硬質ウレタンフォーム保温板 t=60（垂木 45×60＠455 の間）', '防湿フィルム', '構造用合板 t=24'], 'dot']);
    columnNotes(doc, L, x(U0) - 6, { side: 'left', align: 'right', yMin: 14, yMax: v.clip[3] });
    columnNotes(doc, Rn, x(U1) + 8, { side: 'right', yMin: 14, yMax: v.clip[3] });
    level(doc, x(C.U_INT + 3), x(300), y(TOP), '笠木の天端', 'GL+' + fmt(TOP), { symX: x(300) });
    level(doc, x(-445), x(C.U_EXT - 2), y(RFL), 'RFL（防水面）', 'GL+' + fmt(RFL), { symX: x(-433) });
    level(doc, x(C.U_INT + 10), x(150), y(c3), N + ' 階の天井', 'GL+' + fmt(c3) + '（CH ' + fmt(C.CH[N - 1]) + '）', { symX: x(150), below: true });
    var xd = x(200);
    dimV(doc, xd, [y(RFL), y(Gd.gboTop), y(TOP)], [fmt(Gd.gboTop - RFL), null], { extFrom: [x(C.U_PIN + 32), x(C.U_PIN + 6), x(C.U_INT + 3)] });
    dimV(doc, xd + 7, [y(RFL), y(TOP)], ['パラペット ' + fmt(C.PARAPET)]);
    var yt = v.clip[1] + 6, kas = Gd.kasagi, uo = kas[1][0], ui = kas[3][0];
    dimH(doc, yt, [x(uo), x(C.U_EXT), x(C.U_PIN + 3), x(ui)], [fmt(C.U_EXT - uo), fmt(C.U_PIN + 3 - C.U_EXT), fmt(ui - C.U_PIN - 3)], { extFrom: [y(TOP) - 0.6, y(TOP) - 0.6, y(TOP) - 0.6, y(TOP) - 0.6] });
    dimH(doc, yt - 6, [x(uo), x(ui)], ['笠木の幅 ' + fmt(ui - uo)], { extFrom: [yt, yt] });
    if (opt.title !== false) {
      var yc = Hh - 35;
      caption(doc, 24, yc, '図 3　詳細 2：' + C.SIDE + 'のパラペットの納まり（1:' + SCALE + '）', [
        '屋上の FRP 防水を入隅の面木で折らずに立ち上げ、天端まで巻き上げてから先張り防水シートと笠木で覆う。外壁の通気層の空気は笠木の下から外へ出る（矢印）。赤茶の輪郭は防火被覆の強化せっこうボード。',
        '笠木の天端は防水面から ' + fmt(C.PARAPET) + '（GL+' + fmt(TOP) + '）。ルーフドレン（横引き）は断面の位置にないので描かない。法令への適合は示さない。矩計図（図 1）と同じ数値で描いた。筆者作成。']);
      scaleBar(doc, W - 90, yc - 2.5, SCALE, 500, 100);
    }
    return finish(doc, opt, 10);
  }

  // ================================================================ 図 0 材料記号の凡例（legend.py）
  var LEGEND_ROWS = [['concrete', 'fill'], ['concrete_mid', 'fill'], ['mortar', 'fill'], ['gravel', 'fill'], ['crushed', 'fill'], ['earth', 'band'],
    ['insulation', 'fill'], ['wood_struct', 'x'], ['wood_aux', 'diag'], ['wood_finish', 'fill'], ['wood_finish_end', 'end'], ['wood_finish_long', 'grain'],
    ['wood_long', 'outline'], ['plywood', 'ply'], ['gypsum', 'outline'], ['glass', 'glass'], ['stone', 'fill'], ['tile', 'fill'], ['tatami', 'tatami'],
    ['lath', 'lath'], ['mesh_mid', 'mesh'], ['sealant', 'solid'], ['other', 'outline']];
  function legend(opt) {
    opt = opt || {}; var pg = paperOf(opt, [297, 420]), W = pg[0], Hh = pg[1];
    var doc = new Doc(W, Hh, '材料構造表示記号の見本', 'JIS A 0150:1999 付表2 の記号を SVG の部品にしたものの一覧。GnotoArchStudio views.legend');
    var x0 = 22.0, y0 = 30.0, rowH = 14.0, cols = [x0, x0 + 40, x0 + 112, x0 + 210];
    doc.text(cols[0], y0 - 8, '見本', T_NOTE, { weight: 'bold' }); doc.text(cols[1], y0 - 8, 'この道具での名前（キー）', T_NOTE, { weight: 'bold' });
    doc.text(cols[2], y0 - 8, '付表2 の表示事項・欄', T_NOTE, { weight: 'bold' }); doc.text(cols[3], y0 - 8, '状態', T_NOTE, { weight: 'bold' });
    doc.line(x0, y0 - 5.5, W - 20, y0 - 5.5, W_VIS);
    LEGEND_ROWS.forEach(function (row, i) {
      var key = row[0], kind = row[1], y = y0 + i * rowH, sx0 = cols[0], sy0 = y, sx1 = cols[0] + 32, sy1 = y + 9;
      var box = [[sx0, sy0], [sx1, sy0], [sx1, sy1], [sx0, sy1]];
      var base = key.indexOf('wood_finish_') === 0 ? 'wood_finish' : key, info = MATERIALS[base], r;
      if (kind === 'fill') { hfill(doc, box, key); doc.polyline(box, W_VIS, { closed: true }); }
      else if (kind === 'band') { doc.line(sx0, sy0 + 1.5, sx1, sy0 + 1.5, W_GROUND); groundBand(doc, [[sx0, sy0 + 1.5], [sx1, sy0 + 1.5]], 3.6); }
      else if (kind === 'x') { r = [sx0 + 9, sy0, sx0 + 21, sy1]; doc.rect(r[0], r[1], r[2] - r[0], r[3] - r[1], null, W_CUT); markX(doc, r); }
      else if (kind === 'diag') { r = [sx0 + 11, sy0 + 1, sx0 + 19, sy1]; doc.rect(r[0], r[1], r[2] - r[0], r[3] - r[1], null, W_VIS); markDiag(doc, r); }
      else if (kind === 'end') { r = [sx0 + 8, sy0, sx0 + 24, sy1]; hfill(doc, [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]], 'wood_end'); doc.rect(r[0], r[1], r[2] - r[0], r[3] - r[1], null, W_VIS); }
      else if (kind === 'grain') { hfill(doc, box, 'wood_grain', { orient: 'h' }); doc.polyline(box, W_VIS, { closed: true }); }
      else if (kind === 'outline') doc.polyline(box, W_VIS, { closed: true });
      else if (kind === 'ply') { hfill(doc, box, 'plywood', { orient: 'h' }); doc.polyline(box, W_VIS, { closed: true }); }
      else if (kind === 'glass') { var g = [[sx0, sy0 + 3], [sx1, sy0 + 3], [sx1, sy0 + 5.2], [sx0, sy0 + 5.2]]; hfill(doc, g, 'glass', { orient: 'h' }); doc.polyline(g, W_VIS, { closed: true }); doc.line(sx0, sy0 + 8, sx1, sy0 + 8, W_THIN); }
      else if (kind === 'tatami') { hfill(doc, box, 'tatami'); doc.line(sx0, sy0, sx1, sy0, W_VIS); doc.line(sx0, sy1, sx1, sy1, W_VIS); }
      else if (kind === 'lath') lathLine(doc, sx0, sy0 + 5, sx1);
      else if (kind === 'mesh') doc.line(sx0, sy0 + 4.5, sx1, sy0 + 4.5, W_VIS, null, 'dashed');
      else if (kind === 'solid') doc.rect(sx0 + 12, sy0 + 2, 8, 5, INK, 0);
      var name = info.name;
      if (key === 'wood_finish') name += '（1:20 以下）'; else if (key === 'wood_finish_end') name += '（木口・1:10 以上）'; else if (key === 'wood_finish_long') name += '（長手・1:10 以上）';
      doc.text(cols[1], y + 4.0, name, T_NOTE); doc.text(cols[1], y + 7.4, key, T_NOTE);
      doc.text(cols[2], y + 4.0, info.jis, T_NOTE); doc.text(cols[2], y + 7.4, info.col, T_NOTE);
      doc.text(cols[3], y + 4.0, info.status, T_NOTE);
      doc.line(x0, y + rowH - 2.5, W - 20, y + rowH - 2.5, W_THIN);
    });
    if (opt.title !== false) {
      var yc = y0 + LEGEND_ROWS.length * rowH + 6;
      doc.text(x0, yc, '図 0　材料構造表示記号の見本（JIS A 0150:1999 付表2 にもとづく）', T_TITLE);
      doc.text(x0, yc + 5.0, '見本の大きさは紙の上で 32×9 mm。模様の密度は紙の上で一定で、縮尺に依らない。', T_NOTE);
      doc.text(x0, yc + 8.4, '「JIS」は付表2 の記号そのもの、「JIS+判断」は付表2 の形に沿って線の間隔などを決めたもの、「判断」は付表2 に記号がなく「その他の材料」に従ったもの。筆者作成。', T_NOTE);
    }
    return finish(doc, opt);
  }

  // ================================================================ 公開
  var DETAIL_KINDS = { window: { label: '窓まわり', scale: 5, fn: detailWindow }, parapet: { label: 'パラペット', scale: 10, fn: detailParapet } };
  function detail(m, kind, opt) {
    var k = DETAIL_KINDS[kind] || DETAIL_KINDS.window;
    return k.fn(m, opt);
  }
  G.views.kanabakari = kanabakari;
  G.views.detail = detail;
  G.views.legend = legend;
  G.views.detailKinds = Object.keys(DETAIL_KINDS).map(function (k) { return { id: k, label: DETAIL_KINDS[k].label, scale: DETAIL_KINDS[k].scale }; });
  G.views.detailNative = { kanabakari: 20, window: 5, parapet: 10 };   // 図の本来の縮尺（シートで他の縮尺を指定すると全体が縮む）
  // 他の担当も使える部品（材料記号の塗り・凡例の一覧）
  G.hatch = { fill: hfill, markX: markX, markDiag: markDiag, groundBand: groundBand, lathLine: lathLine, MATERIALS: MATERIALS, Doc: Doc };
  G.views.detailVersion = 1;
})();
