#!/usr/bin/env node
/* SVG を PNG（既定 600dpi・紙の上で幅 150mm）にする。sharp が必要（npm i sharp）。
   usage: node fig_build.js fig1.svg [fig2.svg ...] [--density 600] [--width-mm 150] [--outdir DIR] [--raw] [--jobs N]
   - 複数の SVG は同時に N 枚まで変換する（既定は CPU の数）。出力の並びは渡した順のまま。
   - 図は viewBox の幅を --width-mm（既定 150mm）に合わせ、その実寸で --density dpi になる画素数で書き出す。
     Word に貼ると 150mm 幅・600dpi になる。本文より字が小さくならないよう、縮めて貼らない。
   - --raw：実寸に合わせず、SVG の 1 単位を 1/72 インチとして density で描く（古い挙動）。
   - 書体は SVG 側で font-family="Noto Sans CJK JP, Noto Sans JP, sans-serif" を指定しておく。
   仕様（JSON）から図を起こすのは figgen/cli.js。これは手で書いた SVG や、直した SVG を PNG にするためのもの。 */
const fs = require('fs'), path = require('path');
let sharp;
try { sharp = require('sharp'); } catch (e) { console.error('sharp が見つからない：npm i sharp を実行する'); process.exit(1); }
const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const density = parseInt(opt('--density', '600'), 10), outdir = opt('--outdir', null), widthMm = parseFloat(opt('--width-mm', '150')), raw = args.includes('--raw');
const files = args.filter((a, i) => a.endsWith('.svg') && !(i > 0 && args[i - 1].startsWith('--') && args[i - 1] !== '--raw'));
const jobs = Math.max(1, parseInt(opt('--jobs', String(require('os').cpus().length)), 10) || 1);
if (!files.length) { console.error('usage: node fig_build.js fig.svg [--density 600] [--width-mm 150] [--outdir DIR] [--raw]'); process.exit(1); }
(async () => {
  if (outdir) fs.mkdirSync(outdir, { recursive: true });
  const msgs = new Array(files.length); let next = 0;
  const one = async (f) => {
    const out = path.join(outdir || path.dirname(f), path.basename(f, '.svg') + '.png');
    const buf = fs.readFileSync(f), vb = /viewBox="\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)/.exec(buf.toString('utf8'));
    let img;
    if (raw || !vb) img = sharp(buf, { density });
    else { const px = Math.round(widthMm / 25.4 * density); img = sharp(buf, { density: Math.min(2400, 72 * px / parseFloat(vb[1])) }).resize({ width: px }); }
    const info = await img.flatten({ background: '#ffffff' }).withMetadata({ density }).png().toFile(out);
    return `${out}: ${info.width}x${info.height}px @${density}dpi` + (raw || !vb ? '' : `（幅 ${widthMm}mm）`);
  };
  const worker = async () => { while (next < files.length) { const i = next++; msgs[i] = await one(files[i]); } };
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, worker));
  msgs.forEach(m => console.log(m));
})().catch(e => { console.error(e.message); process.exit(1); });
