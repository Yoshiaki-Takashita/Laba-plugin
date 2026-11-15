#!/usr/bin/env node
/* 建築図を作る道具（建築図の作図部品を、ブラウザ無しで動かす）。依存なし・Node 18 以上。
   使い方：node cli.js <命令> ...   （README.md に一覧）
   建物のデータ（models/*.json）から、平面・断面・立面・展開・アクソメ・配置・ダイアグラム・詳細・矩計・凡例を SVG にする。 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const LIB = path.join(__dirname, 'lib');
const ctx = { console, Math, JSON, Date, Array, Object, String, Number, RegExp, Set, Map, Error, parseFloat, parseInt, isNaN, isFinite, setTimeout, clearTimeout };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const p of ['model', 'plan', 'views', 'axon', 'site', 'detail']) vm.runInContext(fs.readFileSync(path.join(LIB, 'archstudio-' + p + '.js'), 'utf8'), ctx, { filename: p });
const A = ctx.GnotoArch, V = A.views;

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf('--' + n); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = flag('out'); const optS = flag('opt'); const scale = flag('scale');
const opt = Object.assign({}, optS ? JSON.parse(optS) : {}, scale ? { scale: +scale } : {});
const cmd = args[0];
const load = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const svgOf = r => (typeof r === 'string' ? r : (r && r.svg) || '');
const write = (f, s) => { fs.mkdirSync(path.dirname(path.resolve(f)), { recursive: true }); fs.writeFileSync(f, s); console.log('書きました', f, Math.round(s.length / 1024) + 'KB'); };

function render(m, view, ref) {
  const lv0 = (m.levels && m.levels[0] && m.levels[0].id) || '1F';
  switch (view) {
    case 'plan': return A.plan.render(m, ref || lv0, opt);
    case 'section': return V.section(m, ref || (m.sections && m.sections[0] && m.sections[0].id) || 'A', opt);
    case 'elevation': return V.elevation(m, ref || 'S', opt);
    case 'interior': return V.interior(m, ref || (m.rooms && m.rooms[0] && m.rooms[0].id), opt);
    case 'axon': return V.axon(m, opt);
    case 'layers': return V.layers(m, ref ? Object.assign({ kind: ref }, opt) : opt);
    case 'structure': return V.structure(m, opt);
    case 'stack': return V.stack(m, opt);
    case 'site': return V.site(m, opt);
    case 'block': return V.block(m, opt);
    case 'diagram': return V.diagram(m, ref || 'zoning', opt);
    case 'detail': return V.detail(m, ref || 'window', opt);
    case 'kanabakari': return V.kanabakari(m, opt);
    case 'legend': return V.legend(opt);
  }
  throw new Error('知らない図：' + view);
}
const VIEWS = ['plan', 'section', 'elevation', 'interior', 'axon', 'layers', 'structure', 'stack', 'site', 'block', 'diagram', 'detail', 'kanabakari', 'legend'];

if (cmd === 'list') {
  console.log('図：' + VIEWS.join(' '));
  console.log('ダイアグラムの kind：zoning circulation light_wind fire');
  console.log('詳細の kind：window parapet');
  console.log('階層の kind：sequence floors（layers の第 3 引数）');
  console.log('モデル：' + fs.readdirSync(path.join(__dirname, 'models')).join(' '));
} else if (cmd === 'sample') {
  write(args[1] || 'sample.json', JSON.stringify(A.model.sample(), null, 1));
} else if (cmd === 'validate') {
  const r = A.model.validate(load(args[1])); console.log(JSON.stringify(r, null, 1)); process.exit(r.some(x => x.level === 'error') ? 1 : 0);
} else if (cmd === 'render') {
  const m = load(args[1]); const s = svgOf(render(m, args[2], args[3]));
  if (!s) { console.error('図を作れませんでした'); process.exit(2); }
  write(out || (args[2] + (args[3] ? '-' + args[3] : '') + '.svg'), s);
} else if (cmd === 'all') {
  const m = load(args[1]), dir = args[2] || 'out'; let n = 0, ng = 0;
  const jobs = [];
  (m.levels || []).forEach(l => jobs.push(['plan', l.id]));
  (m.sections || []).forEach(s => jobs.push(['section', s.id]));
  ['S', 'N', 'E', 'W'].forEach(d => jobs.push(['elevation', d]));
  jobs.push(['axon'], ['layers'], ['structure'], ['stack'], ['site'], ['block'], ['kanabakari'], ['legend'], ['detail', 'window'], ['detail', 'parapet']);
  ['zoning', 'circulation', 'light_wind', 'fire'].forEach(k => jobs.push(['diagram', k]));
  jobs.forEach(([v, r]) => { try { const s = svgOf(render(m, v, r)); if (!s || /未実装|作れませんでした|準備中/.test(s.slice(0, 600))) throw new Error('空または仮'); write(path.join(dir, v + (r ? '-' + r : '') + '.svg'), s); n++; } catch (e) { ng++; console.error('作れませんでした', v, r || '', '：', String(e.message).slice(0, 100)); } });
  console.log(n + ' 枚作り、' + ng + ' 枚は作れませんでした（作れない図は、モデルに足りない値か、その建物では意味が無い図です）');
} else {
  console.log('使い方：node cli.js list | sample [out.json] | validate model.json | render model.json <図> [ref] [--scale N] [--opt \'{...}\'] [--out f.svg] | all model.json [outdir]');
}
