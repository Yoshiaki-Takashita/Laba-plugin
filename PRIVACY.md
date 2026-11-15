# LABA プラグイン プライバシーポリシー（Privacy Policy）

最終更新：2026-11-15

## 日本語

1. **集める情報**：このプラグインの作者（LABA）は、利用者の情報を一切集めない。利用状況の記録・送信（テレメトリ）も行わない。
2. **プラグインの動き**：スキルと担当（agents）は、Claude が利用者の Claude の中で読む手順書である。同梱のスクリプトは、利用者の作業フォルダのファイルを読み書きするだけで、作者のサーバへは何も送らない（作者はサーバを持たない）。
3. **外部へのアクセス**：
   - `skills/laba/scripts/case_lookup.py` は、頼まれたときだけ、裁判所ウェブサイト（www.courts.go.jp）の判例検索に、検索の条件（裁判の年月日・裁判所の種類）を送って、検索結果と判決全文の PDF を取る。利用者の文章や個人の情報は送らない。
   - 条文・判例・文献の確認では、Claude が e-Gov 法令検索・裁判所ウェブサイト・J-STAGE・CiNii などの公開の頁を読む。これらの頁の扱いは、各運営者のプライバシーポリシーに従う。
   - 利用者が自分で登録したコネクタ（MCP サーバ）を使う場合、その扱いは、そのコネクタの運営者のポリシーに従う。このプラグインにはコネクタの URL も鍵も入っていない。
4. **保存**：作ったノート・レジュメ・図などは、利用者の作業フォルダにだけ残る。作者は持たない。保存の期間・消去は、利用者が決める。
5. **第三者への提供**：作者は情報を持たないので、第三者に提供することはない。
6. **問い合わせ**：https://github.com/Yoshiaki-Takashita/Laba-plugin/issues

## English

1. **Data collected**: The author (LABA) collects no information about users and sends no telemetry.
2. **How it works**: The skills and agents are instructions read by Claude inside the user's own Claude. The bundled scripts only read and write files in the user's working folder and send nothing to the author (the author runs no server).
3. **External access**: `skills/laba/scripts/case_lookup.py`, only when asked, sends search conditions (decision date and court level) to the Courts of Japan case-law search (www.courts.go.jp) and downloads the result page and the decision PDF; it never sends the user's text or personal data. For verification, Claude reads public pages (e-Gov, the courts site, J-STAGE, CiNii, and similar), which are governed by their operators' policies. A connector the user registers is governed by its operator's policy; the plugin contains no connector URL or key.
4. **Storage and retention**: Outputs stay only in the user's working folder. The user decides how long to keep them.
5. **Sharing**: The author holds no user data and shares none.
6. **Contact**: https://github.com/Yoshiaki-Takashita/Laba-plugin/issues
