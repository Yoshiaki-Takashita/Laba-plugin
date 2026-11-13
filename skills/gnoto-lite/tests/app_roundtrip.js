// 任意の確認：Lite が書いた .gnoto を、手元の GNOTO（GLYPH.html）に読み込ませて、題・style・行数・スライド枚数が合うか調べる。
// GNOTO 本体は読むだけ（書き換えない）。Playwright が要る。プラグインの動作には要らない。
//   GNOTO_HTML=/path/to/GLYPH.html node tests/app_roundtrip.js FILE.gnoto [...]
// 注：GNOTO のオープニングは gopStop() で止めてから消す。
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const fs = require('fs');
const html = process.env.GNOTO_HTML;
if (!html) { console.error('GNOTO_HTML を指定してください'); process.exit(2); }
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  await p.addInitScript(() => { try { localStorage.setItem('glyph_lang', 'ja'); } catch (e) {} });
  await p.goto('file://' + html);
  await p.waitForTimeout(2500);
  await p.evaluate(() => { try { gopStop(); } catch (e) {} const s = document.getElementById('glyph-splash'); if (s) s.remove(); });
  let bad = 0;
  for (const f of process.argv.slice(2)) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    const want = data.note.content;
    const r = await p.evaluate(async (data) => {
      const id = openImportedGnoto(data);
      if (!id) return { rejected: true };
      await new Promise(r => setTimeout(r, 700));
      const m = getNoteMeta(id), c = NOTE_CONTENT[id];
      return { style: m.note.style, title: m.note.title, rows: c.rows.length, slides: (c.slides || []).length,
               rowsJson: JSON.stringify(c.rows), slidesJson: JSON.stringify(c.slides || []), lite: c.gnotoLite || null };
    }, data);
    const ok = !r.rejected && r.title === data.note.title && r.style === data.note.style &&
      (data.note.style === 'slide' ? r.slides === (want.slides || []).length : r.rows === (want.rows || []).length);
    // 書いた HTML が欠けずに戻るか（空の html を除く行の文字数の合計で比べる）
    const canon = v => Array.isArray(v) ? v.map(canon) : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => (o[k] = canon(v[k]), o), {}) : v;
    const strip = s => JSON.stringify(canon(s));
    const same = data.note.style === 'slide' ? strip(want.slides) === strip(JSON.parse(r.slidesJson)) : strip(want.rows) === strip(JSON.parse(r.rowsJson));
    console.log(JSON.stringify({ file: f.split('/').pop(), ok, identical: same, title: r.title, style: r.style, rows: r.rows, slides: r.slides, liteKept: !!r.lite }));
    if (!ok || !same) bad++;
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
