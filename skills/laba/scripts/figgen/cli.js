#!/usr/bin/env node
'use strict';
/* figgen：図の仕様（JSON）から、法学の図（SVG・600dpi PNG）を作る。
   node cli.js list                         型の一覧
   node cli.js spec.json [out.svg] [--png] [--density 600] [--width-mm 150] [--step N | --steps]
   node cli.js all specs/ outdir/ [--png]   フォルダの仕様を全部
   node cli.js check spec.json              仕様の検証だけ（必須の項目・知らない項目・参照先のない id）
   仕様に誤りがあれば、図を作らずに理由を出して終了コード 1。warn は図を作ったうえで出す。
   PNG には sharp が要る（npm i sharp）。SVG だけなら依存なし。 */
const fs = require('fs'), path = require('path');
const { Canvas, wrapLog } = require('./lib/core');
const TYPES = {
  compare: '比較図（似た2〜3場面の帰結の違い）', quadrant: '座標図（二つの観点の組合せ）', matrix: '判例マトリクス', flow: '流れ図（段階と枝分かれ）',
  timeline: '時間軸（時点・期間・状態の帯）', parties: '当事者関係図（三者間・多数当事者・積み上げ）', stack: '請求・抗弁・再抗弁の積み上げ図',
  instances: '審級の流れ', chain: '権利移転の連鎖・対抗関係', tree: '決定木・要件の木・組織図', numberline: '数直線（期間・金額・順位）',
  swimlane: '手続のスイムレーン', movement: '動きの図（及ぶ・及ばない）', nest: '包含図', statute: '条文の構造図', bar: '価値配分',
  panel: '複合図（同じ枠の図を上下に並べて比べる。panels に下位の仕様を入れる）'
};
/* 仕様の検証：必須の項目、知らない項目（書き間違い）、参照先のない id。描く前に止める。項目の表は README の「項目の一覧」と同じ */
const COMMON = ['type', 'message', 'caption', 'notes', 'width', 'showStep', 'legend', '$comment', 'relations_table'];
const NODE_K = ['id', 'label', 'sub', 'pos', 'kind', 'accent', 'gray', 'note', 'under'];
const SCHEMA = {
  parties: { req: ['nodes'], opt: ['edges', 'groups', 'nodeWidth', 'rowGap', 'pict', 'band'], sub: { nodes: { req: ['id', 'label'], opt: NODE_K }, edges: { req: ['from', 'to'], opt: ['label', 'sub', 'accent', 'dash', 'head', 'stop', 'step', 'port', 'straight', 'elbow'] }, groups: { req: ['members'], opt: ['label', 'accent'] } } },
  chain: { req: ['nodes'], opt: ['links', 'relations', 'groups', 'nodeWidth', 'rowGap'], sub: { nodes: { req: ['id', 'label'], opt: NODE_K }, links: { req: ['from', 'to'], opt: ['label', 'sub', 'accent', 'dash'] }, relations: { req: ['a', 'b'], opt: ['label', 'sub', 'accent', 'head', 'side', 'solid'] }, groups: { req: ['members'], opt: ['label', 'accent'] } } },
  flow: { req: ['steps'], opt: ['direction', 'pass', 'end', 'mergeExits', 'exitStyle'], sub: { steps: { req: ['text'], opt: ['sub', 'pass', 'exit', 'accent', 'kind', 'branch'] } } },
  compare: { req: ['columns', 'rows'], opt: ['arrows', 'header'], sub: { columns: { req: ['title'], opt: [] }, rows: { req: ['cells'], opt: ['label', 'accent', 'dash', 'arrow', 'align', 'under'] } } },
  timeline: { req: ['events'], opt: ['tracks', 'scale', 'breaks', 'guides'], sub: { events: { req: [], opt: ['date', 'label', 'accent', 'mark', 'guide'] }, tracks: { req: ['segments'], opt: ['name'] } } },
  numberline: { req: ['ticks'], opt: ['ranges', 'proportional', 'arrow', 'breaks'], sub: { ticks: { req: ['v'], opt: ['value', 'label', 'accent', 'guide'] }, ranges: { req: ['from', 'to'], opt: ['label', 'accent', 'gray', 'dash'] } } },
  tree: { req: ['root'], opt: ['direction', 'gapY', 'noHeads', 'leafUnder'] },
  stack: { req: ['levels'], opt: ['left', 'right'], sub: { levels: { req: ['name'], opt: ['side', 'items', 'effect', 'against', 'accent'] } } },
  instances: { req: ['stages'], opt: ['links'], sub: { stages: { req: ['court'], opt: ['date', 'result', 'reason', 'accent', 'dash'] } } },
  swimlane: { req: ['lanes', 'steps'], opt: [], sub: { steps: { req: ['lane', 'text'], opt: ['sub', 'accent', 'via'] } } },
  movement: { req: ['from', 'to', 'items'], opt: [], sub: { items: { req: ['label'], opt: ['pass', 'why', 'accent'] } } },
  statute: { req: ['parts'], opt: ['name'], sub: { parts: { req: ['kind', 'text'], opt: ['effect', 'accent', 'indent'] } } },
  panel: { req: ['panels'], opt: [], sub: { panels: { req: ['spec'], opt: ['title'] } } },
  matrix: { req: ['rows', 'cols'], opt: ['corner', 'labelWidth'] }, quadrant: { req: ['cells', 'xAxis', 'yAxis'], opt: [] }, nest: { req: ['root'], opt: [] }, bar: { req: ['rows'], opt: [] }
};
const near = (k, list) => { const d = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  const c = list.map(x => [d(k.toLowerCase(), x.toLowerCase()), x]).sort((p, q) => p[0] - q[0])[0]; return c && c[0] <= Math.max(2, Math.ceil(k.length / 2)) ? c[1] : null; };
function validate(spec, where) {
  where = where || ''; const err = [], warn = [];
  if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) return { err: [`${where}仕様が JSON のオブジェクトでない`], warn };
  if (!spec.type) { err.push(`${where}type がない。型の名前を書く（${Object.keys(TYPES).join('・')}）`); return { err, warn }; }
  if (!TYPES[spec.type]) { const n = near(String(spec.type), Object.keys(TYPES)); err.push(`${where}type「${spec.type}」という型はない` + (n ? `。「${n}」の書き間違いではないか` : '') + '（一覧は node cli.js list）'); return { err, warn }; }
  const sc = SCHEMA[spec.type]; if (!sc) return { err, warn };
  for (const k of sc.req) if (spec[k] == null) err.push(`${where}${spec.type} には「${k}」が要る（最小の例は README の「最小の仕様」）`);
  const known = COMMON.concat(sc.req, sc.opt);
  for (const k of Object.keys(spec)) if (!known.includes(k)) { const n = near(k, known); warn.push(`${where}知らない項目「${k}」は無視される` + (n ? `。「${n}」の書き間違いではないか` : `。${spec.type} で使える項目：${sc.req.concat(sc.opt).join('・')}`)); }
  for (const [arr, rule] of Object.entries(sc.sub || {})) {
    if (spec[arr] == null) continue;
    if (!Array.isArray(spec[arr])) { err.push(`${where}「${arr}」は配列（[ … ]）で書く`); continue; }
    spec[arr].forEach((it, i) => { if (it == null || typeof it !== 'object') { err.push(`${where}${arr}[${i}] は { … } で書く`); return; }
      for (const k of rule.req) if (it[k] == null) err.push(`${where}${arr}[${i}] に「${k}」がない`);
      const kn = rule.req.concat(rule.opt); for (const k of Object.keys(it)) if (!kn.includes(k) && !(arr === 'tracks' || arr === 'panels')) { const n = near(k, kn); warn.push(`${where}${arr}[${i}] の知らない項目「${k}」は無視される` + (n ? `。「${n}」の書き間違いではないか` : `。使える項目：${kn.join('・')}`)); } });
  }
  // 参照先のない id
  const ids = Array.isArray(spec.nodes) ? spec.nodes.map(n => n && n.id) : null;
  if (ids) {
    const dup = ids.filter((x, i) => x != null && ids.indexOf(x) !== i); if (dup.length) err.push(`${where}nodes の id が重複している：${[...new Set(dup)].join('・')}`);
    const ref = (arr, keys) => (Array.isArray(spec[arr]) ? spec[arr] : []).forEach((e, i) => keys.forEach(k => { if (e && e[k] != null && !ids.includes(e[k])) err.push(`${where}${arr}[${i}] の ${k}「${e[k]}」は nodes にない id（ある id：${ids.join('・')}）。この線は描けない`); }));
    ref('edges', ['from', 'to']); ref('links', ['from', 'to']); ref('relations', ['a', 'b']);
    (Array.isArray(spec.groups) ? spec.groups : []).forEach((g, i) => (g.members || []).forEach(m => { if (!ids.includes(m)) err.push(`${where}groups[${i}] の members「${m}」は nodes にない id`); }));
    if (spec.type === 'parties') spec.nodes.forEach((n, i) => { if (n && n.pos != null && !(Array.isArray(n.pos) && n.pos.length === 2 && n.pos.every(Number.isInteger))) err.push(`${where}nodes[${i}] の pos は [列, 行]（0 から数えた整数二つ）で書く`); });
    if (spec.type === 'parties') { const seen = {}; spec.nodes.forEach(n => { if (n && Array.isArray(n.pos)) { const k = n.pos.join(','); if (seen[k]) err.push(`${where}nodes「${seen[k]}」と「${n.id}」が同じ pos [${k}] にある`); seen[k] = n.id; } }); }
  }
  if (spec.type === 'timeline') { const n = (spec.events || []).length; (spec.tracks || []).forEach((t, i) => (t.segments || []).forEach((g, j) => ['from', 'to'].forEach(k => { if (g[k] != null && !(Number.isInteger(g[k]) && g[k] >= 0 && g[k] < n)) err.push(`${where}tracks[${i}].segments[${j}] の ${k}「${g[k]}」は events の番号（0〜${n - 1}）で書く`); })));
    (spec.breaks || []).forEach(b => { if (!(Number.isInteger(b) && b >= 0 && b < n - 1)) err.push(`${where}breaks の「${b}」は、省略の印を置く区間の左側の events の番号（0〜${n - 2}）で書く`); }); }
  if (spec.type === 'numberline') { const vs = (spec.ticks || []).map(t => t && t.v); if (vs.some(v => typeof v !== 'number')) err.push(`${where}ticks の v は数（位置を決める値）で書く。表示する語は value に書く`);
    (spec.ranges || []).forEach((r, i) => ['from', 'to'].forEach(k => { if (typeof r[k] === 'number' && vs.length && (r[k] < Math.min(...vs) || r[k] > Math.max(...vs))) err.push(`${where}ranges[${i}] の ${k}「${r[k]}」が ticks の範囲（${Math.min(...vs)}〜${Math.max(...vs)}）の外`); }));
    (spec.breaks || []).forEach(b => { if (!(Number.isInteger(b) && b >= 0 && b < vs.length - 1)) err.push(`${where}breaks の「${b}」は、省略の印を置く区間の左側の目盛りの番号（小さい順に 0〜${vs.length - 2}）で書く`); }); }
  if (spec.type === 'compare' && Array.isArray(spec.columns) && Array.isArray(spec.rows)) spec.rows.forEach((r, i) => { if (Array.isArray(r.cells) && r.cells.length !== spec.columns.length) err.push(`${where}rows[${i}]（${r.label || ''}）の cells が ${r.cells.length} 個。columns は ${spec.columns.length} 列`);
    ['accent', 'dash'].forEach(k => (Array.isArray(r[k]) ? r[k] : []).forEach(c => { if (!(Number.isInteger(c) && c >= 0 && c < spec.columns.length)) err.push(`${where}rows[${i}] の ${k} の「${c}」は列の番号（0〜${spec.columns.length - 1}）で書く`); })); });
  if (spec.type === 'swimlane' && Array.isArray(spec.lanes)) (spec.steps || []).forEach((s, i) => { if (!(Number.isInteger(s.lane) && s.lane >= 0 && s.lane < spec.lanes.length)) err.push(`${where}steps[${i}] の lane「${s.lane}」は lanes の番号（0〜${spec.lanes.length - 1}）で書く`); });
  if (spec.type === 'tree') { const walk = (n, p) => { if (!n || n.text == null) err.push(`${where}${p} に text がない`); (n && n.children || []).forEach((c, i) => walk(c, `${p}.children[${i}]`)); }; walk(spec.root, 'root'); }
  if (spec.type === 'panel') (spec.panels || []).forEach((p, i) => { if (p && p.spec) { const r = validate(p.spec, `${where}panels[${i}].spec：`); err.push(...r.err); warn.push(...r.warn); } });
  return { err, warn };
}
function render(spec, opt) {
  opt = opt || {}; const v = validate(spec); if (v.err.length) { const e = new Error('仕様に誤りがある（図は作っていない）\n  ' + v.err.join('\n  ')); e.spec = true; throw e; }
  wrapLog.length = 0;
  const cv = new Canvas({ width: spec.width || 1040 });
  if (opt.step != null) spec = Object.assign({}, spec, { showStep: opt.step });
  cv.legendItems = Array.isArray(spec.legend) ? spec.legend.slice() : null;
  require('./lib/renderers/' + spec.type)(spec, cv);
  const warn = v.warn.concat(cv.warn);
  for (const w of wrapLog) warn.push(w.cost >= 99 ? `幅に入らない語がある：「${w.lines[0]}」。箱を広げるか、語を短くする` : `語の途中で折れた：「${w.lines.join('／')}」。語を減らすか、| で折る位置を決めるか、箱を広げる`);
  if (!spec.message) warn.push('message（この図で分かること：一文）がない。言えないなら図にしない');
  if (spec.caption && !/^図\s*[0-9０-９N]+/.test(spec.caption)) warn.push('caption は「図N　この図で分かること：…。読み方。」の形にする');
  if (!spec.caption) warn.push('caption がない');
  const acc = (cv.parts.join('').match(/#943522/g) || []).length; if (!acc) warn.push('強調が一つもない。争点・分かれ目・変わった所のどれか一つを accent にする');
  return { svg: cv.svg({ desc: spec.message || '', type: spec.type === 'panel' && (spec.panels || []).every(q => q.spec && ['compare', 'matrix', 'statute', 'stack', 'quadrant', 'bar', 'instances'].includes(q.spec.type)) ? 'panel-table' : spec.type }), warn, labels: cv.meta.labels, height: Math.max(cv.total, cv.oy + cv.maxY) + cv.M };
}
async function toPng(svgPath, density, widthMm) {
  let sharp; try { sharp = require('sharp'); } catch (e) { console.error('sharp が見つからない（npm i sharp）。SVG だけ出した'); return null; }
  const out = svgPath.replace(/\.svg$/, '.png');
  // 図の幅を紙の上の実寸（既定 150mm）に合わせ、その幅で density dpi になる画素数で書き出す
  const buf = fs.readFileSync(svgPath), vb = /viewBox="0 0 ([\d.]+) /.exec(buf.toString('utf8')), W = vb ? parseFloat(vb[1]) : 1040;
  const dpi = density || 600, px = Math.round((widthMm || 150) / 25.4 * dpi), rd = Math.min(2400, 72 * px / W);
  const info = await sharp(buf, { density: rd }).resize({ width: px }).flatten({ background: '#ffffff' }).withMetadata({ density: dpi }).png().toFile(out);
  return `${out} ${info.width}x${info.height}`;
}
async function one(specPath, outPath, a) {
  let spec; try { spec = JSON.parse(fs.readFileSync(specPath, 'utf8')); } catch (e) { throw new Error(`${specPath} が JSON として読めない：${e.message}（かっこ・カンマ・引用符を確かめる）`); }
  const base = outPath || specPath.replace(/\.json$/, '.svg');
  const steps = a.includes('--steps') ? [...new Set((spec.edges || []).map(e => e.step).filter(s => s != null))].sort((x, y) => x - y) : [a.includes('--step') ? parseInt(a[a.indexOf('--step') + 1], 10) : null];
  for (const st of steps) {
    const r = render(spec, { step: st }); const out = st != null && a.includes('--steps') ? base.replace(/\.svg$/, `_${st}.svg`) : base;
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, r.svg);
    let msg = `${out}  [${spec.type}] 高さ ${Math.round(r.height)}`;
    if (a.includes('--png')) { const p = await toPng(out, a.includes('--density') ? parseInt(a[a.indexOf('--density') + 1], 10) : 600, a.includes('--width-mm') ? parseFloat(a[a.indexOf('--width-mm') + 1]) : 150); if (p) msg += `  → ${p}`; }
    console.log(msg); r.warn.forEach(w => console.log('  warn: ' + w));
    if (spec.caption && !a.includes('--quiet')) console.log('  図題: ' + spec.caption);
  }
}
if (require.main === module) (async () => {
  const a = process.argv.slice(2);
  if (!a.length || a[0] === 'help' || a[0] === '--help') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('/*')[1]); return; }
  if (a[0] === 'list') { for (const k in TYPES) console.log(k.padEnd(11) + TYPES[k]); return; }
  if (a[0] === 'check') { let bad = 0; for (const f of a.slice(1)) { const v = validate(JSON.parse(fs.readFileSync(f, 'utf8'))); console.log(`${f}: error ${v.err.length} / warn ${v.warn.length}`); v.err.forEach(e => console.log('  error: ' + e)); v.warn.forEach(w => console.log('  warn: ' + w)); bad += v.err.length; } process.exit(bad ? 1 : 0); }
  if (a[0] === 'all') { const dir = a[1], out = a[2] || a[1]; for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) await one(path.join(dir, f), path.join(out, f.replace(/\.json$/, '.svg')), a.slice(3)); return; }
  const pos = a.filter((x, i) => !x.startsWith('--') && !(i > 0 && ['--density', '--step', '--width-mm'].includes(a[i - 1])));
  await one(pos[0], pos[1], a);
})().catch(e => { console.error('error: ' + e.message); process.exit(1); });
module.exports = { render, validate, TYPES, SCHEMA };
