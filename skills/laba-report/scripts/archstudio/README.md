# 建築図を作る道具（archstudio）

建築図の作図部品を、ブラウザ無し・外部ライブラリ無し（Node 18 以上）で動かす。建物のデータ（JSON）から、製図の決まり（線の太さの段・黒／灰／強調の 3 色・文字の大きさ 3 段・寸法・通り芯・方位・スケールバー・図題）に沿った建築図を SVG にする。**手で SVG を書かない。この道具で作る。**

## 使い方（このフォルダで）
```
node cli.js list                                   # 図の種類・モデルの一覧
node cli.js sample my.json                         # 見本の建物（木造 3 階の住戸）のデータを書き出す（編集のひな形）
node cli.js validate models/shodhan.json           # データの整合（誤り・警告）
node cli.js render models/shodhan.json plan 2F --out out/plan-2F.svg
node cli.js render models/shodhan.json section A --scale 100 --out out/section-A.svg
node cli.js render models/shodhan.json elevation S
node cli.js render models/shodhan.json interior <室の id>    # 展開図
node cli.js render models/shodhan.json axon                   # 外観アクソメ
node cli.js render models/shodhan.json layers sequence        # 層の分解（sequence / floors）
node cli.js render models/shodhan.json structure | stack | site | block | kanabakari | legend
node cli.js render models/shodhan.json diagram zoning         # zoning / circulation / light_wind / fire
node cli.js render models/shodhan.json detail window          # window / parapet
node cli.js all models/shodhan.json out/                      # 作れる図を全部
python3 arch_check.py out/plan-2F.svg --kind plan --no-subject  # 図の決まりの点検（Python 標準ライブラリだけ）
```
- `--opt '{"title":false,"paper":false}'`：図の中の題を消す／紙に置かず中身の大きさで切る（見開きに並べるとき）。
- 縮尺は `--scale 100`。同じ種類の図は共通の縮尺にそろえる。

## 建物のデータ（models/*.json）の形
`sample` で出したものが雛形（grid・site・levels・walls・openings・stairs・rooms・fixtures・sections）。単位は mm。
- 値には出典と確かめの段階を付ける（`provenance` の欄）。**推定の値は推定と書く**（図題と注にも）。
- 使える建物の例：`models/shodhan.json`（ショーダン邸。柱の割付け・階の構成は資料で確かめたが、階高・ブリーズ・ソレイユ・斜路などは**推定を含む**。provenance に段階がある）。
- 別の建物は、`sample` を雛形に壁・開口・階段・室・家具を書き換える。足りない要素（斜路・ブリーズ・ソレイユ・日傘の屋根・独立柱・曲線の孔）はまだ描けない。近い要素で置き換え、図題に断りを書く。

## PNG にして目で見る
```
rsvg-convert -w 1600 図.svg -o 図.png      # あれば
convert -density 130 図.svg 図.png         # ImageMagick があれば
# どちらも無ければ、ブラウザ（Chromium）で SVG を開いてスクリーンショット
```
SVG の書体は 'Noto Sans JP'、IPAGothic、sans-serif の順。日本語の書体が無い環境では文字の幅が変わるので、重なりを見る。

## 中身
- `cli.js`：入口。`lib/archstudio-*.js`：作図の部品。`arch_check.py`：点検。`SPEC.md`：製図の約束。
