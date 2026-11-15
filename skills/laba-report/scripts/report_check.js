/* report_check.js — 学術文章の点検（laba-report）。依存なし。ブラウザでも node でも動く。
 * 機械的・粗い判定。内容の正しさ・引用の実在・数値の再計算は判定しない。指摘は「直す候補」であって、人の文を「AI が書いた」と判定する道具ではない。
 *   checkReport(text, {level, field, ledger, lang}) -> { level, lang, field, pass, score, findings:[{rule, severity, message, at, count}], stats, level_table }
 *   LEVELS   : 6 段（高校生→学部生→大学院生→専門家→論文→学会）のしきい値と、本体が指示文に差し込む短い要件の文（spec）。
 *   levelOf(word) : 「高校生」「ug」「paper」などの 1 語から段の id（分からなければ null）
 *
 * 唯一の元は references/levels.md の「しきい値（機械可読）」の JSON。このファイルの LEVELS はその写し（数値を変えるときは levels.md を先に直す）。
 *
 * 文体の数値は「段」ではなく「型（profile）」で変わる（2026-10-22 の研究で、上の段ほど文を短くそろえる設計は AI の形に近づくと分かった）：
 *   ja essay （高校生）   ：根拠つきの意見文。短い文・である調（設計上の判断）
 *   ja resume（学部生）   ：読み上げる発表レジュメ。較正用の完成版の実測で較正（EXEMPLAR-UNDERGRAD.md §6.2）
 *   ja paper （院・専門家・論文・学会）：人の法律論文 39 本と学者出身の判事の個別意見 39 件の分布（WRITING-JA-LAW-PAPERS.md §8・WRITING-JA-LAW-JUDGE.md §5）。法律以外の分野は未測定（同じ値を仮に使う）
 *   en      （全段）      ：英語の公開論文 99 本と AI の文の対比（WRITING-EN.md §7・§8.2）。一流の 5〜95 パーセンタイルの外を指す
 * 数え方（日本語。研究ノートの測定と同じ定義）：
 *   ・文は「。」で切る。「」『』（）の中の「。」では切らない。字数は空白を除く。
 *   ・引用段落（「…」で丸ごと囲んだ段落、閉じる」が次の段落にある判旨、条文の「民法107条　…」の段落、行頭の > ）は地の文から外す。
 *     引用をはさむ文（「…が、」＋引用段落＋「として、…。」）も外す。
 *   ・語尾は analyze_resume.py の ENDINGS の順で分類し、4 形＝た・る（する／である／のである／ことになる／ている）・ない で終わる文。
 *     「といえる」「とされる」「と読める」「と考えられる」は 4 形に入れない。です・ます は数えて info（書き手が発表用に直した段落は残す）。
 *   ・推量・問いの文末＝であろう・だろう（か）・と思われる・ように思われる・と考えられる・ではないか・〜か（paper 型で数える）。
 *   ・段落の 2〜4 文は地の文の段落だけで数える（箇条・番号つき・注〔※・[^n]:〕は除く）。ヘッジ＝と思われる・と考えられる・といえよう・ように思われる・であろう・だろう（地の文 1,000 字あたり）。
 * v2.1（2026-10-23。伏せた比較の採点で見つかった v2 の癖）：
 *   ・数え上げは語の形でなく「数詞＋分割の宣言」の族で数える（第一に・第一の・一つ目・一つは・もう一つ・二つの点・三つに・〇つある・〇点ある・少なくとも二つ）。族の合計が 1 万字に enumMax を超えたら enum-family。
 *     「第一に」だけを指すと書き手が「一つは／もう一つは」に逃げる（v2 の論文で 12 回）。
 *   ・章の頭と末の道案内（本章では〜を確認する・次章では〜）の密度 signposting。本文の作業の告白（検索先・検索語・読めなかった資料）work-confession（論文の型・IMRaD 以外）。
 *     参考文献に V2（書誌だけ）の文献 references-v2（院以上）。台帳の【要入手】ledger-toget（論文・学会）。図題の読み方の文と断片 figure-caption-reading／-fragment。
 *   ・発表レジュメの型に 2〜4 文の段落の上限 para24Max（そろいすぎ。完成版は 73%）。
 */
(function (root) {
  'use strict';
  var SEV = { none: 0, info: 1, warn: 2, error: 3 };          // 重さの順（単調性の検査に使う）
  var STRUCT = { three: 0, field: 1, strict: 2 };             // 構成の厳密さの順

  /* 文体のしきい値（型ごと）。数値の根拠は references/prose-ja.md・prose-ja-law.md・prose-en.md */
  var JA_ESSAY  = { profile: 'essay',  avgMax: 55, avgTarget: null, over100Max: 0.05, over120Max: null, para24Min: 0.5,  para24Max: null, plainMin: 0.8,  hedgeMax: 1,   enumMax: 5, signpostMax: 3 };
  var JA_RESUME = { profile: 'resume', avgMax: 55, avgTarget: 48,   over100Max: 0.02, over120Max: 0,    para24Min: 0.6,  para24Max: 0.9,  plainMin: 0.85, hedgeMax: 0.5, enumMax: 5, signpostMax: 3 };
  var JA_PAPER  = { profile: 'paper', medianMin: 54, medianMax: 95, meanMin: 60, over100Min: 0.08, over100Max: 0.4, over200Max: 0.03, over300Max: 0, cvMin: 0.45,
    oneParaMin: 0.08, paraCharsMax: 600, inferMin: 0.025, inferMax: 0.2, sameEndRunMax: 0.02, judgmentEndMax: 0.01, daiichiMax: 2, mittsuMax: 2, enumMax: 5, signpostMax: 3, mottomoMax: 1.8,
    headingsMax: 25, headingCharsMax: 25, bulletsMax: 0 };
  var EN_RULES = {   // 文書単位の規則のしきい値（WRITING-EN.md §7.1。ug＝高校生・学部生、grad＝大学院生以上）
    ug:   { ptail: 0.7, moreover: 1.0, headings: 3.0,  ratherThan: 1.1,  aiWords3: 7,   quoteShare: 0.18, triad: 7,   wordLen: 6.0, emdash: 8, passive: 0.40, neitherNor: 0.5,  reframe: 0.3,  enumeration: 2.5,  paraWords: [70, 200], paraLong: 0.50, howeverInitial: 0.85, notOnly: 0.5, notXbutY: 1.0, restate: 0.2 },
    grad: { ptail: 0.5, moreover: 0.8, headings: 2.85, ratherThan: 1.03, aiWords3: 5.7, quoteShare: 0.15, triad: 6.5, wordLen: 5.9, emdash: 7, passive: 0.35, neitherNor: 0.42, reframe: 0.25, enumeration: 2.43, paraWords: [75, 190], paraLong: 0.45, howeverInitial: 0.80, notOnly: 0.5, notXbutY: 1.0, restate: 0.2 }
  };
  var LEVELS = [
    { id: 'hs', order: 1, name: { ja: '高校生', en: 'High school' }, icon: 'book',
      alias: ['高校生', '高校', '高校生向け', 'hs', 'highschool', 'high-school', 'high school'],
      spec: {
        ja: '根拠つきの意見文。序論・本論・結論の 3 部で章に通し番号。文献は 3 件以上（教科書・公的資料・新聞・事典。Wikipedia は出発点だけで台帳に載せない）。中心主張は V3 か V1（教科書・公的資料の整理）で支え、V0 は書かない。V1 は全体の 5 割まで。反対意見を 1 つ挙げて答える。専門用語は最小限、初出で一言定義し例を添える。文体（意見文の型）：1 文平均 55 字以下・100 字超は 5% 以下・段落 2〜4 文が半分以上・語尾 4 形 8 割以上・ヘッジは 1,000 字に 1 回まで。英語なら 1 文平均 14〜26 語で長短を混ぜ、40 語超は 15% まで。図は任意（入れるなら図題・番号・出典）。分量の目安 1,200〜2,000 字。査読 1 回（根拠のない主張・AI らしい言い回し）。スライドは頼まれたら 5〜8 枚。',
        en: 'An opinion essay with grounds. Three parts (introduction, body, conclusion) with numbered sections. At least 3 sources (textbooks, public bodies, newspapers, encyclopaedias; Wikipedia only as a starting point, never in the ledger). The central claim rests on V3 or V1 (a textbook or public summary); never V0. V1 at most half of the ledger. Raise one objection and answer it. Few technical terms, each defined at first use with an example. Prose (essay profile): in English a mean sentence of 14 to 26 words with mixed lengths (coefficient of variation 0.30 or more), at most 15% over 40 words and at most 15% under 10 words; in Japanese a mean of 55 characters or less and paragraphs of 2 to 4 sentences. Figures optional (if used: caption, number, source). About 1,200 to 2,000 characters. One independent review (unsupported claims, machine-like phrasing). Slides only on request, 5 to 8.'
      },
      th: { ja: JA_ESSAY, en: { meanMin: 14, meanMax: 26, cvMin: 0.30, over40Max: 0.15, under10Min: null, under10Max: 0.15, hedgeMin: null, hedgeMax: null, rules: 'ug' },
        ledgerMin: 3, v1Max: 0.5, v3Min: 0, primaryMin: 0,
        coreV3: 'warn', fig: 'warn', counter: 'warn', scope: 'info', structure: 'three', outline: 'none', method: false, abstract: false, limitations: false, sensitivity: false, qa: false,
        reviews: 1, slides: { req: false, min: 5, max: 8 }, chars: [1200, 2000] } },
    { id: 'ug', order: 2, name: { ja: '学部生', en: 'Undergraduate' }, icon: 'cap',
      alias: ['学部生', '学部', '大学生', '学部生向け', 'ug', 'undergrad', 'undergraduate', 'college', 'bachelor'],
      spec: {
        ja: '自分の論点が 1 つあるレポート（一次資料を細かく読んで見つけた、通説が読み飛ばしている点を考察の最初に置き、早い章で根拠の事実を予告して相互参照でつなぐ）。分野の標準構成（理工・医学は IMRaD、法学は前提知識→事案・制度→判断・学説→考察、人文・社会科学は問い→先行研究→分析→結論）。冒頭に構成を示し、各章の冒頭 1 文と章末の接続文。節ごとに定義→条文（根拠）→具体例（括弧書きで短く）→本件の順で、節の最後は本件に戻す。文献は 5 件以上、うち一次資料か査読論文 1 件以上（判例研究は 8 件以上が手本）。中心主張は V3 を 1 件以上で支え、V1 は補助だけで 3 割以下、V2 は参考文献に載せるだけ。先行研究は主要な見解を 2 つ以上並べ違いを 1 文で言い、説の対立は表にしない。最も強い反論 1 つと射程。専門用語は初出で一言定義。文体（発表レジュメの型。較正用の完成版で較正）：1 文平均 約 48 字（55 以下）・100 字超は 2% 以下（120 字超は 0）・地の文の段落の 6 割以上が 2〜4 文・語尾 4 形 85% 以上・「思われる／考えられる／といえよう」は 1,000 字に 0.5 回まで。英語なら 1 文平均 16〜30 語で長短を混ぜ（変動係数 0.35 以上）、40 語超は 25% まで、10 語未満も 15% まで、序論で主張を主張の動詞で言う。黒一色で囲みと塗りを使わず、図は規則に従い連番で本文から参照。分量の目安 2,000〜6,000 字（判例研究のレジュメは 12,000〜15,000 字・A4 16〜20 枚）。査読 1 回（根拠のない主張・原文と違う引用・矛盾・最も強い反論・AI らしい言い回し）。スライドは頼まれたら 10〜15 枚（判例研究は 45〜50 枚）。',
        en: 'A report with one point of your own, found by reading the primary sources closely (put it first in the discussion, foreshadow its facts early and link them by cross-reference). The standard structure of the field (IMRaD for science and medicine; background, facts and institutions, holding and views, discussion for law; question, prior work, analysis, conclusion for humanities and social science). State the structure at the start; open each chapter with one sentence on what it shows and close with a bridge. Each section runs definition, ground, short parenthetical example, this case. At least 5 sources, including 1 primary source or peer-reviewed paper (8 or more for a case study). The central claim rests on at least one V3 source; V1 only as support and at most 30%; V2 only in the reference list. Prior work: two main views and their difference in one sentence, no table of opposing views. The strongest objection and the scope. Define terms at first use. Prose (handout profile, calibrated on the owner\'s exemplar): in English a mean sentence of 16 to 30 words with mixed lengths (coefficient of variation 0.35 or more), at most 25% over 40 words and at most 15% under 10 words, the thesis stated with a claim verb in the introduction, no "In conclusion", no machine vocabulary (delve, tapestry, pivotal); in Japanese a mean of about 48 characters, at most 2% over 100, at least 60% of body paragraphs with 2 to 4 sentences, hedges at most 0.5 per 1,000 characters. Black only, no boxes or shading; figures numbered and cited. About 2,000 to 6,000 characters (a case-study handout 12,000 to 15,000). One independent review (unsupported claims, quotes that differ from the original, contradictions, the strongest objection, machine-like phrasing). Slides only on request, 10 to 15.'
      },
      th: { ja: JA_RESUME, en: { meanMin: 16, meanMax: 30, cvMin: 0.35, over40Max: 0.25, under10Min: null, under10Max: 0.15, hedgeMin: 1.5, hedgeMax: 15, rules: 'ug' },
        ledgerMin: 5, v1Max: 0.3, v3Min: 0.3, primaryMin: 1,
        coreV3: 'error', fig: 'error', counter: 'error', scope: 'warn', structure: 'field', outline: 'warn', method: false, abstract: false, limitations: false, sensitivity: false, qa: false,
        reviews: 1, slides: { req: false, min: 10, max: 15 }, chars: [2000, 6000] } },
    { id: 'grad', order: 3, name: { ja: '大学院生', en: 'Graduate' }, icon: 'layers',
      alias: ['大学院生', '大学院', '院生', '修士', '博士', '大学院生向け', 'grad', 'graduate', 'master', 'masters', 'phd', 'doctoral'],
      spec: {
        ja: '先行研究の隙間を埋める。学部生の要求に加えて：冒頭の 1〜2 文で立場と論じる範囲を言い、方法（資料の集め方・分析の手順・判断の基準）の節を独立させる。文献は 10 件以上、うち一次資料か査読論文 3 件以上、直近 5 年の文献 2 件以上。中心主張は一次資料か査読論文の V3 を 2 件以上で支え、V1 は 1 割以下、すべての主張に台帳の ID。先行研究を時系列か論点別に整理し、自分の問いが埋める隙間と、既存の見解に対する位置づけ（支持・修正・反対）を明示。最も強い反論 2 つ以上（確かに〜。しかし〜。の型で、相手の理由を書いてから事実か経緯で応える）、答えられない反論は「残る問題」に移し、射程の外を明示。用語は分野の標準に従い、定義の出典を示す。文体（論文の型。人の法律論文と判事の個別意見の分布）：文を短くそろえない。1 文の中央値 54〜95 字・平均 60 字以上・100 字超を 1〜4 割混ぜ・200 字超は 3% まで・300 字超は 0・長さの変動係数 0.45 以上。1 文の段落も使う（8% 以上）。断定と推論を書き分け、推量・問いの文末（であろう・と思われる・と考えられる・ではないか・〜か）を 2.5〜20%、各節の結論の文は推論にしない。判決の定型（というべきである）を地の文に使わない。「第一に…第三に」の三分割・「もっとも」の多用・細かい見出し（1 万字に 25 まで）・本文の箇条書き・「今後」で締める結びを避け、書籍の引用に頁、評釈は「判批」、判旨は「」で原文のまま。英語なら 1 文平均 18〜32 語・変動係数 0.38 以上・10 語未満は 2〜14%・序論に問いと隙間と主張。図の数値・日付はすべて台帳の根拠つき。分量の目安 8,000〜20,000 字。査読 2 回（引用検証役と反対役を別々に）。スライドは頼まれたら 15〜20 枚。',
        en: 'Fill a gap in prior work. Everything required of an undergraduate, plus: state your position and scope in the first one or two sentences, and give methods a separate section (how sources were gathered, how they were analysed, the criteria used). At least 10 sources, including 3 primary or peer-reviewed and 2 from the last five years. The central claim rests on at least two V3 primary or peer-reviewed sources; V1 at most 10%; every claim carries a ledger ID. Organise prior work by time or by issue, state the gap your question fills and your position (support, modify, oppose). Two or more strongest objections stated fairly ("One might object that ..."; "To be sure, ...") and answered with reasons or evidence; move unanswered ones to "remaining problems"; state what the conclusion does not cover. Use the field\'s standard terms and cite the source of each definition. Prose (paper profile, from the distribution of published work rather than from a short uniform target): a mean sentence of 18 to 32 words, coefficient of variation 0.38 or more, 10-word sentences between 2% and 14%, long sentences allowed (up to 25% over 40 words); the introduction opens with the received view or a concrete case, names what is not yet measured or explained, and states the thesis with a claim verb; short connectives (But, Yet, Thus), however also mid-sentence, no "In conclusion", no sentence-final participial tails ("..., highlighting ..."), no machine vocabulary, "rather than" and "First ... Second ... Third" not as a habit, headings at most 2.85 per 1,000 words. Every number and date in a figure has a ledger source. About 8,000 to 20,000 characters. Two independent reviews (citation check and counter-view separately). Slides only on request, 15 to 20.'
      },
      th: { ja: JA_PAPER, en: { meanMin: 18, meanMax: 32, cvMin: 0.38, over40Max: 0.25, under10Min: 0.02, under10Max: 0.14, hedgeMin: 2.5, hedgeMax: 15, rules: 'grad' },
        ledgerMin: 10, v1Max: 0.1, v3Min: 0.5, primaryMin: 3,
        coreV3: 'error', fig: 'error', counter: 'error', scope: 'error', structure: 'field', outline: 'error', method: true, abstract: false, limitations: false, sensitivity: false, qa: false,
        reviews: 2, slides: { req: false, min: 15, max: 20 }, chars: [8000, 20000] } },
    { id: 'pro', order: 4, name: { ja: '専門家', en: 'Professional' }, icon: 'building',
      alias: ['専門家', '実務', '実務家', '報告書', '専門家向け', 'pro', 'professional', 'practitioner', 'expert', 'practice'],
      spec: {
        ja: '意思決定に使える実務の報告書。大学院生の要求に加えて：冒頭に要旨（結論先出し・1 ページ以内）と推奨事項（選択肢・推奨・根拠・リスク）。V1 は 0（二次資料の整理を本文に書かない）。根拠の時点（法令の施行日・統計の年・報告書の版）を本文に書き、台帳に確認日を持つ。文献は一次資料（法令・判例・統計・公的報告書）中心。実務の慣行・公的基準・先例を整理して現状との差を示す。前提（数値・法令・市況）が変わったときに結論がどう変わるか（感度）を書く。専門用語に読者（決裁者）向けの平易な言い換えを併記。文体は論文の型と同じ（文を短くそろえない。実務の報告書は未測定なので設計上の判断）。数値は単位と時点付き。英語なら 1 文平均 16〜28 語（読者が決裁者のため短め）・40 語超は 2 割まで。1 枚で結論が分かる要約図を 1 つ。分量の目安 要旨 1 ページ＋本文 4,000〜12,000 字。査読 2 回＋数値・日付・法令の時点の再確認。スライドは頼まれたら要旨型 10〜15 枚。',
        en: 'A professional report a decision-maker can act on. Everything required of a graduate student, plus: an executive summary first (conclusion up front, one page) and recommendations (options, recommendation, grounds, risks). No V1 at all. State the point in time of each ground (date in force, statistical year, report edition) in the text and keep a check date in the ledger. Sources centre on primary material (statutes, cases, statistics, official reports). Lay out practice, official standards and precedents and show the gap with the present situation. Say how the conclusion changes if an assumption (a number, a statute, the market) changes. Pair each technical term with a plain paraphrase for the reader. Prose follows the paper profile (practice reports were not measured, so this is a design judgement); in English a mean sentence of 16 to 28 words because the reader is a decision-maker, at most 20% over 40 words; every number with unit and date. One summary figure that shows the conclusion on its own. About one page of summary plus 4,000 to 12,000 characters. Two independent reviews plus a recheck of numbers, dates and the point in time of each statute. Slides only on request, 10 to 15.'
      },
      th: { ja: JA_PAPER, en: { meanMin: 16, meanMax: 28, cvMin: 0.38, over40Max: 0.20, under10Min: 0.02, under10Max: 0.14, hedgeMin: 2.5, hedgeMax: 12, rules: 'grad' },
        ledgerMin: 10, v1Max: 0, v3Min: 0.5, primaryMin: 3,
        coreV3: 'error', fig: 'error', counter: 'error', scope: 'error', structure: 'field', outline: 'error', method: true, abstract: true, limitations: false, sensitivity: true, qa: false,
        reviews: 2, slides: { req: false, min: 10, max: 15 }, chars: [4000, 12000] } },
    { id: 'paper', order: 5, name: { ja: '論文', en: 'Journal paper' }, icon: 'doc',
      alias: ['論文', '査読', '投稿', '学術論文', '査読誌', 'paper', 'journal', 'journal paper', 'article', 'manuscript'],
      spec: {
        ja: '査読誌の論文。専門家の要求に加えて：先行研究に無い寄与（知見・方法・データ・解釈のどれか）が 1 つ以上あり、序論と結論で一致する。分野の標準構成を厳密に（IMRaD は序論・方法・結果・考察の 4 節＋要旨・参考文献。法学・人文は投稿先の書式）、要旨とキーワード。文献は 15 件以上、査読論文と一次資料が中心で、先行研究の主要文献を落とさず（主要な文献の注が引く文献をたどり、無料で読める一次資料は原典で引く。孫引きしない）、検索の方法（検索先・語・期間）は台帳と報告に記録して本文に書かない（IMRaD の方法の節は例外）。中心主張を支える文献はすべて V3、台帳の全行が V2 以上（DOI か書誌ページ）。V2 の文献は本文にも参考文献にも載せず、読めなかった有料の重要文献は【要入手】として報告の冒頭に出す。限界の節は論の射程（どこまで言えるか）に限り、作業の限界（読めなかった・検索した）を書かない。定義は先行研究の定義を引用し、記号・略語は初出で定義。文体は論文の型（大学院生と同じ数値。査読者の目で読む 3 回目の査読が上乗せ）。英語なら変動係数 0.40 以上・10 語未満は 3〜14%・ヘッジは 1,000 語に 3〜12。投稿先の図表規定（解像度・単位・凡例）に従い、表は本文を繰り返さない。分量は投稿先の規定（目安 8,000〜16,000 字）。査読 3 回（引用・反対・文体＝査読者の目）＋投稿規定との照合。スライドは頼まれたら 15〜20 枚。',
        en: 'A paper for a peer-reviewed journal. Everything required of a professional report, plus: at least one contribution absent from prior work (a finding, method, dataset or interpretation), stated consistently in the introduction and the conclusion. The field\'s standard structure strictly (IMRaD: introduction, methods, results, discussion, plus abstract and references; law and humanities follow the journal\'s format), with abstract and keywords. At least 15 sources, centred on peer-reviewed and primary material, none of the key prior works missing (follow the footnotes of the main works; cite freely available primary sources from the original, never second-hand); the search method (where, which terms, which period) is recorded in the ledger and the handover report, not in the text (IMRaD methods sections excepted). Every source behind the central claim is V3; every ledger row is V2 or above (DOI or bibliographic page). V2 works appear neither in the text nor in the reference list; unread paywalled key works go at the top of the handover report as "to obtain". Limitations cover the scope of the argument, not the work process (what could not be read, where you searched). Definitions quoted from prior work; symbols and abbreviations defined at first use. Prose follows the paper profile (same numbers as graduate; the third review reads as a referee does); in English coefficient of variation 0.40 or more, 10-word sentences between 3% and 14%, core hedges 3 to 12 per 1,000 words. Follow the journal\'s figure and table rules; tables do not repeat the text. Length per the journal (about 8,000 to 16,000 characters). Three independent reviews (citations, counter-view, style as a referee reads) plus a check against the submission rules. Slides only on request, 15 to 20.'
      },
      th: { ja: JA_PAPER, en: { meanMin: 18, meanMax: 32, cvMin: 0.40, over40Max: 0.25, under10Min: 0.03, under10Max: 0.14, hedgeMin: 3, hedgeMax: 12, rules: 'grad' },
        ledgerMin: 15, v1Max: 0, v3Min: 0.7, primaryMin: 5,
        coreV3: 'error', fig: 'error', counter: 'error', scope: 'error', structure: 'strict', outline: 'error', method: true, abstract: true, limitations: true, sensitivity: true, qa: false,
        reviews: 3, slides: { req: false, min: 15, max: 20 }, chars: [8000, 16000] } },
    { id: 'conf', order: 6, name: { ja: '学会', en: 'Conference' }, icon: 'people',
      alias: ['学会', '発表', '予稿', '学会発表', '口頭発表', 'conf', 'conference', 'talk', 'proceedings', 'presentation'],
      spec: {
        ja: '学会の発表と予稿。論文の要求に加えて：寄与が 1 枚のスライドで言える。予稿は投稿先の書式（頁数制限）に従い、参考文献を紙幅で絞っても台帳は全件渡す。直近 1〜2 年の動向に触れる。想定問答 5 問（質疑への答え）。文体は論文の型と同じ。スライドは必須で、発表時間 1 分に 1 枚が目安（15 分なら 12〜15 枚）、見出しは予稿と 1 対 1、図は図形で描き画像を貼らず、略語を避ける。査読 3 回＋スライド全ページを画像にして点検＋想定問答の確認。',
        en: 'A conference talk with its proceedings paper. Everything required of a journal paper, plus: the contribution fits on one slide. The paper follows the venue\'s format and page limit; even if the printed references are trimmed, hand over the whole ledger. Touch on developments of the last one or two years. Five anticipated questions with answers. Prose follows the paper profile. Slides are required, about one per minute of talk (12 to 15 for 15 minutes), headings one-to-one with the paper, figures drawn with shapes rather than pasted images, abbreviations avoided. Three independent reviews, plus rendering every slide as an image to check it, plus a check of the anticipated questions.'
      },
      th: { ja: JA_PAPER, en: { meanMin: 18, meanMax: 32, cvMin: 0.40, over40Max: 0.25, under10Min: 0.03, under10Max: 0.14, hedgeMin: 3, hedgeMax: 12, rules: 'grad' },
        ledgerMin: 15, v1Max: 0, v3Min: 0.7, primaryMin: 5,
        coreV3: 'error', fig: 'error', counter: 'error', scope: 'error', structure: 'strict', outline: 'error', method: true, abstract: true, limitations: true, sensitivity: true, qa: true,
        reviews: 3, slides: { req: true, min: 12, max: 15 }, chars: [3000, 12000] } }
  ];
  var BY_ID = {}; LEVELS.forEach(function (l) { BY_ID[l.id] = l; });
  var DEFAULT_LEVEL = 'ug';

  function levelOf(word) {
    var w = String(word == null ? '' : word).trim().toLowerCase().replace(/[。、.,:：;；]+$/, '');
    if (!w) return null;
    if (BY_ID[w]) return w;
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].alias.indexOf(w) >= 0) return LEVELS[i].id;
    return null;
  }

  /* ---------------- 文字列の下ごしらえ（analyze_resume.py と同じ定義） ---------------- */
  var RE_CJK = /[぀-ヿ㐀-鿿]/;
  var cpLen = function (s) { return Array.from(String(s)).length; };
  var slen = function (s) { return Array.from(String(s).replace(/\s/g, '')).length; };      // 字数は空白を除く
  var mean = function (a) { return a.length ? a.reduce(function (u, v) { return u + v; }, 0) / a.length : 0; };
  var medianOf = function (a) { var s = a.slice().sort(function (u, v) { return u - v; }); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  var sdOf = function (a) { var m = mean(a); return a.length ? Math.sqrt(a.reduce(function (u, v) { return u + (v - m) * (v - m); }, 0) / a.length) : 0; };
  var ratio = function (n, d) { return d ? n / d : 0; };
  var r3 = function (x) { return +(+x).toFixed(3); };
  function detectLang(t) {
    var c = 0, n = 0;
    for (var i = 0; i < t.length && i < 4000; i++) { var ch = t[i]; if (/\s/.test(ch)) continue; n++; if (RE_CJK.test(ch)) c++; }
    return (n && c / n > 0.15) ? 'ja' : 'en';
  }
  /* 引用台帳の 1 行：ID | 完全な書誌 | 確認に使った URL | V0〜V3 | 本文での使い方（前後の | は任意。4 列目が V でない行は見出しとして捨てる） */
  var RE_LEDGER = /^\s*\|?\s*([A-Za-z0-9][A-Za-z0-9_.\-]{0,23})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*(V[0-3])\b\s*\|\s*([^|]*?)\s*\|?\s*$/;
  var TAGS = { core: /【中心】|\[core\]|\(core\)/i, primary: /【一次】|\[primary\]/i, peer: /【査読】|\[peer\]/i, secondary: /【二次】|\[secondary\]/i, textbook: /【教科書】|\[textbook\]/i, toget: /【要入手】|\[to-?obtain\]|\[obtain\]/i };
  function parseLedger(text) {
    var rows = [], rest = [];
    String(text || '').replace(/\r/g, '').split('\n').forEach(function (line) {
      var m = RE_LEDGER.exec(line);
      if (!m) { rest.push(line); return; }
      var use = m[5] || '';
      rows.push({ id: m[1], bib: m[2], url: m[3], v: +m[4].slice(1), use: use, core: TAGS.core.test(use), primary: TAGS.primary.test(use), peer: TAGS.peer.test(use), secondary: TAGS.secondary.test(use), textbook: TAGS.textbook.test(use), toget: TAGS.toget.test(use) });
    });
    return { rows: rows, rest: rest.join('\n') };
  }
  /* 文を切る：日本語は「。．！？」、英語は「.!?」＋空白。「」『』（）の中では切らない。残りの断片も 1 文として返す（analyze_resume.py の split_sentences と同じ） */
  function splitJa(t) {
    var res = [], cur = '', depth = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t[i]; cur += c;
      if (c === '「' || c === '『' || c === '（' || c === '(') depth++;
      else if (c === '」' || c === '』' || c === '）' || c === ')') depth = Math.max(0, depth - 1);
      else if ((c === '。' || c === '．' || c === '！' || c === '？') && depth === 0) { res.push(cur); cur = ''; }
    }
    if (cur.trim()) res.push(cur);
    return res.map(function (s) { return s.trim(); }).filter(Boolean);
  }
  /* 英語の略語（v.・U.S.・e.g.・Cir.・No. など）の後では切らない（WRITING-EN.md §2.3 と同じ考え方） */
  var EN_ABBR = /\b(v|vs|U\.S|U\.K|e\.g|i\.e|cf|Cir|No|Nos|Id|Ibid|et al|Dr|Mr|Mrs|Ms|Prof|Inc|Ltd|Co|Fig|Figs|pp|p|ch|sec|para|Art|arts|ed|eds|vol|Jr|Sr|St|Mt|approx|Ph\.D|J\.D|a\.m|p\.m|Supp|Ct|Cal|N\.Y|Mass|Wash|Cong|Rev|Stat|App|Dep|t|Ex|Pt|Inst|Univ|Soc|Ass|n|nn|supra|infra|Sess|Comm|Gen|Ann|Am|Int|Nat|Natl|Proc|Pub|L|J|Q|S|D|F|E|W|C|M|H|A|B|R|P|T|G|K|O|I)\./g;
  function splitEn(t) {
    var p = t.replace(EN_ABBR, function (m) { return m.replace(/\./g, '\u0001'); }).replace(/(\d)\.(\d)/g, '$1\u0001$2');
    return p.split(/(?<=[.!?])["”’)\]]*\s+(?=["“‘(\[]?[A-Z0-9])/).map(function (s) { return s.replace(/\u0001/g, '.').trim(); }).filter(function (s) { return /[A-Za-z]/.test(s); });
  }
  var enWords = function (s) { return (String(s).match(/[A-Za-z0-9][A-Za-z0-9'’\-]*/g) || []); };
  /* 文末の分類（analyze_resume.py の ENDINGS の順＋paper 型で使う推量・問い・立場・判決の定型）。後ろの括弧書き「（99条1項）」「（調査官解説）」は外してから見る */
  var ENDINGS = [
    ['polite', /(?:です|ます|ました|ません|でした|でしょう)$/], ['dewanaika', /(?:ではないか|ではなかろうか|ではないだろうか|のではないか)$/], ['gimon', /疑問である$/],
    ['judgment', /(?:というべきである|と解するのが相当である|と解すべきである|と解される|と解するのが相当だ)$/],
    ['darou', /(?:であろうか|だろうか|であろう|だろう)$/], ['nodearu', /のである$/],
    ['kotoninaru', /(?:ことになる|こととなる|ことになった|こととなった)$/], ['toieru', /(?:といえる|といえよう|ともいえる)$/], ['toyomeru', /(?:と読める|とみられる)$/],
    ['hedge', /(?:と考えられる|と思われる|ように思われる)$/], ['tokangaeru', /(?:と考える|べきであると考える|と解する)$/], ['beki', /べきである$/],
    ['tosareru', /(?:とされる|といわれる|とされている|と指摘されている|と位置づけられている)$/],
    ['dearu', /である$/], ['nai', /ない$/], ['ta', /た$/], ['teiru', /(?:ている|ていた|てきた)$/], ['ka', /(?:か|のか)$/], ['suru', /[うくすつぬふむゆるぐぶ]$/], ['other', /.$/]
  ];
  var FOUR = { dearu: 1, nodearu: 1, nai: 1, ta: 1, suru: 1, teiru: 1, kotoninaru: 1, dewanaika: 1, gimon: 1, beki: 1, tokangaeru: 1 };   // 4 形＝た・る・ない の系統（発表レジュメ・意見文の型で数える）
  var INFER = { hedge: 1, darou: 1, dewanaika: 1, ka: 1 };                 // 推量・問いの文末（論文の型で数える。WRITING-JA-LAW-PAPERS.md §4.3・判事型 L4）
  function endingOf(s) {
    var core = String(s).replace(/[。．！？]+$/, '').trim();
    for (var k = 0; k < 3; k++) {
      var c2 = core.replace(/[（(][^（）()]*(?:[（(][^（）()]*[）)][^（）()]*)*[）)]$/, '').trim();
      if (c2 === core) break;
      core = c2;
    }
    if (/[」』]$/.test(core) && !/「[^」]*」$/.test(core)) core = core.replace(/[」』]+$/, '').trim();
    for (var i = 0; i < ENDINGS.length; i++) if (ENDINGS[i][1].test(core)) return ENDINGS[i][0];
    return 'other';
  }
  var RE_HEAD_NUM = /^(?:第\s*[0-9０-９一二三四五六七八九十ⅠⅡⅢⅣⅤⅥⅦⅧ]+\s*[部章節]|[0-9０-９]+(?:[.．][0-9０-９]+)*[.．、)）]?\s*|[ⅠⅡⅢⅣⅤⅥⅦⅧ][.．、\s]|[一二三四五六七八九十]+[.．、\s]|[①-⑳]\s*|[(（][0-9０-９]{1,2}[)）]\s*|#+\s+)/;
  var RE_TERM_END = /[。．！？」』）)]$/;
  function isHeading(line) {
    var l = line.trim(); if (!l || cpLen(l) > 40) return false;
    if (/[。．！？.!?]$/.test(l)) return false;
    return RE_HEAD_NUM.test(l) || /^(?:[A-Z][A-Za-z ]{1,30}|[^\s、。]{1,20})$/.test(l);
  }
  var RE_STATUTE = /^(?:[^\s　]{1,10}法|憲法)\s*(?:第)?[0-9０-９]{1,4}条(?:の[0-9０-９]+)?(?:第?[0-9０-９]+項)?[\s　]/;   // 条文の引用段落「民法107条　代理人が…」
  var RE_LIST = /^(?:[0-9０-９]{1,2}[.．)）]\s*|[①-⑳]\s*|[(（][0-9０-９]{1,2}[)）]\s*|[ⅰ-ⅹ][.．)）]\s*)/;
  var RE_BULLET = /^(?:[・•●○◦*]|-\s)/;
  var RE_CAPTION = /^(?:図|表|Figure|Fig\.?|Table)\s*(?:[0-9０-９]+|　)/;
  var RE_NOTE = /^(?:※|＊|\*|\[\^[^\]]+\]:)/;                               // 注の行（※・＊・Markdown の脚注 [^n]: ）は地の文から外す
  var RE_REFHEAD = /参考文献|引用文献|文献一覧|参考判例|^注$|^注釈$|^脚注|\breferences?\b|\bbibliography\b|\bnotes\b/i;   // ここから後ろは参考文献・注（作業語・V2 の照合に使う）
  var stripBold = function (l) { return l.replace(/^\*\*(.*?)\*\*/, '$1').replace(/^\*\*/, ''); };   // Markdown の太字の図題「**図 1　…**」

  /* 行の種類を決め、地の文の文と段落を取り出す */
  function segment(prose, lang) {
    var lines = prose.split('\n').map(function (l) { return l.trim(); });
    var kinds = [], depth = 0;
    lines.forEach(function (line) {
      if (!line) { kinds.push('empty'); depth = 0; return; }
      var o = (line.match(/[「『]/g) || []).length, c = (line.match(/[」』]/g) || []).length;
      var inside = depth > 0;
      var startsQ = /^[「『]/.test(line) && (o > c || (o === c && /[」』][。．]?$/.test(line)));
      var isQ = inside || startsQ || (RE_STATUTE.test(line) && slen(line) >= 40) || /^[>＞]/.test(line);
      if (startsQ || inside) depth = Math.max(0, depth + o - c); else depth = 0;
      if (isQ) { kinds.push('quote'); return; }
      if (RE_CAPTION.test(stripBold(line))) { kinds.push('caption'); return; }   // 太字の図題は注（*）より先に見る
      if (RE_NOTE.test(line)) { kinds.push('note'); return; }
      if (RE_BULLET.test(line)) { kinds.push('bullet'); return; }      // 「・」を文字で書いた箇条（文が無くても箇条。見出しより先に見る）
      if (isHeading(line)) { kinds.push('heading'); return; }
      var hasTerm = lang === 'ja' ? /[。．！？]/.test(line) : /[.!?]/.test(line);
      if (!hasTerm && slen(line) <= 60) { kinds.push('label'); return; }   // 小見出し（「① 昭和〇年　…」「Xの主張」）
      if (RE_LIST.test(line)) { kinds.push('list'); return; }
      kinds.push('body');
    });
    /* 引用をはさむ文：「…が、」＋引用段落＋「として、…。」は 1 文として地の文から外す */
    var skip = {}, sandwich = 0;
    for (var i = 0; i < lines.length; i++) {
      /* 「…であるが、」のような断片は、短ければ label に分類されているので、label も見る（引用の直前に限る） */
      if ((kinds[i] === 'body' || kinds[i] === 'list' || kinds[i] === 'label') && !RE_TERM_END.test(lines[i])) {
        var j = i + 1; while (j < lines.length && kinds[j] === 'empty') j++;
        if (j < lines.length && kinds[j] === 'quote') {
          skip[i] = 1; while (j < lines.length && (kinds[j] === 'quote' || kinds[j] === 'empty')) j++;
          if (j < lines.length && (kinds[j] === 'body' || kinds[j] === 'list')) skip[j] = 1;
          sandwich++;
        }
      }
    }
    var sents = [], paras = [], quoteChars = 0, quoteLines = 0;
    lines.forEach(function (line, i) {
      var k = kinds[i];
      if (k === 'quote') { quoteLines++; quoteChars += slen(line); return; }
      if (skip[i] || (k !== 'body' && k !== 'list' && k !== 'bullet')) return;
      var ss = lang === 'ja' ? splitJa(line) : splitEn(line);
      ss.forEach(function (s) { var s2 = s.replace(/^[・•●○◦*\-]\s*/, ''); sents.push({ s: s2, len: lang === 'ja' ? slen(s2) : enWords(s2).length, kind: k, line: i }); });
      if (k === 'body' && ss.length) paras.push({ n: ss.length, chars: slen(line), words: lang === 'ja' ? 0 : enWords(line).length, line: i });
    });
    return { lines: lines, kinds: kinds, sents: sents, paras: paras, sandwich: sandwich, quoteLines: quoteLines, quoteChars: quoteChars };
  }

  /* 構成の見出しの型（分野別）。見出し行の語で役割を決める */
  var HEADS = {
    abstract: /要旨|要約|抄録|\babstract\b|\bsummary\b/i, keywords: /キーワード|\bkeywords?\b/i, references: /参考文献|引用文献|文献一覧|参考判例|\breferences?\b|\bbibliography\b/i,
    limitations: /限界|\blimitations?\b/i, qa: /想定問答|想定される質問|質疑|\bq&a\b|anticipated questions/i, method: /方法|手法|資料と方法|材料と方法|検討の方法|分析の方法|\bmethods?\b|\bmaterials\b|\bmethodology\b/i,
    imrad: [/序論|はじめに|緒言|背景|\bintroduction\b|\bbackground\b/i, /方法|材料と方法|資料と方法|\bmethods?\b|\bmaterials\b/i, /結果|\bresults?\b|\bfindings\b/i, /考察|議論|\bdiscussion\b/i, /結論|おわりに|\bconclusions?\b/i],
    law: [/前提知識|基礎知識|制度の概要/, /事案|事実の概要|制度|各審級/, /判断|判旨|学説|意義|調査官/, /考察|評価|検討|私見/],
    hum: [/問い|問題の所在|はじめに|序論|\bintroduction\b/i, /先行研究|研究史|文献|\bliterature\b|prior work|related work/i, /分析|検討|考察|\banalysis\b|\bdiscussion\b/i, /結論|おわりに|\bconclusions?\b/i],
    three: [/序論|はじめに|導入|\bintroduction\b/i, /本論|\bbody\b/i, /結論|おわりに|まとめ|\bconclusions?\b/i]
  };
  var RE_OUTLINE = /^構成$|^目次$|構成[:：]|本稿では|本稿は|本論文では|本レポートでは|本報告では|以下では|次の順で|章立て|this (paper|report|essay|article) (is organised|is organized|proceeds)|the (rest|remainder) of this|\bPart (I|II|1|2)\b.*\bPart (II|III|2|3)\b/im;
  var RE_COUNTER = /反論|異論|批判|反対の立場|反対説|反対する立場|これに対し|確かに|という(?:考え方|見解|意見)も(?:ある|あり得る)|objection|counter-?argument|critics|one might (?:argue|object|worry|think|say|respond|contend)|on the other hand|to be sure|it is true that|admittedly/i;
  var RE_SCOPE = /射程|限界|どこまで|当てはまらない|及ばない|一般化|留保|scope|limitation|does not (apply|extend)|cannot be generalised|cannot be generalized/i;
  var RE_REMAIN = /残る問題|残された課題|今後の課題|open question|remaining (problem|issue)|future work/i;
  var RE_SENS = /前提が変わ|変われば|感度|シナリオ|仮に.*(なら|場合)|if .* (changes|were)|sensitivity|scenario/i;
  var RE_MARK = /【要確認】|【未確認】|【要出典】|【調査官解説で補充】|【TODO】|\[要確認\]|\[citation needed\]|\bTODO\b|\bTBD\b|\bXXX\b|\?\?\?/g;
  var RE_WORKNOTE = /本文(?:は)?約\s*[0-9０-９,，]+\s*字|記憶に基づ|提出前に(?:確認|お確かめ)|頁(?:数)?を(?:補|確認)してください|直接引用ではありません|正確な頁数を確認できなかった/g;   // AI の作業の注記（WRITING-JA-LAW-PAPERS.md P23）
  var RE_HEDGE = /と思われる|と考えられる|といえよう|ように思われる|であろう|だろう/g;
  /* 数え上げの族（P8 を語の形でなく「数詞＋分割の宣言」で数える。v2.1）：文頭「第一に」「第一の」・「一つ目」・文頭「一つは」「もう一つ」・「二つの点（理由・軸…）」・「三つの〇」「三つに」・「〇つある」「〇点ある」「〇つに分け」・「少なくとも二つ」。
   * ①②③ の番号は数えない（要件・理由の列挙はそれで書く）。人の宣言の語はおおむね 1 万字に 2〜3（文頭「第一に」0.5〜1.4、3,000 字の窓に「三つ」10〜16%・「二つ」27〜38%。WRITING-JA-LAW-PAPERS.md §5.1・§5.2）で、
   * 項目の語（一つは・もう一つ・第二に）を足して 4〜5 程度（推定）。AI は宣言だけで 5〜8。しきい値 5／万字・4 回以上（判。1 万字未満は回数で見る。v2 の論文 9.8・学部 6、完成版 2） */
  var NUMJ = '[一二三四五六七八九十0-9０-９]';
  var RE_ENUM = new RegExp('(?:^|[。\\n])\\s*第' + NUMJ + '{1,2}[にの](?!' + NUMJ + ')|' + NUMJ + 'つ目|(?:^|[、，。\\n]|その|まず)\\s*(?:一つ|1つ|１つ|ひとつ)(?:は|には)|もう一つ|[二三四五六七八九2-9２-９]つの(?:点|理由|意味|側面|軸|問題|課題|類型|場面|要素|観点|方向|段階|論点|実益|帰結|限界|誤り|基準|経路|型|関門|部分|柱|次元|系|段|層|揺れ|条件|要件|局面|手段|道|筋|性質|機能|効果|意義|前提|立場|見解|説|区分|系統|面|場合)|[三四五六七八九3-9３-９]つ[のに]|[二三四五六七八九十2-9２-９][つ点](?:ある|存在する|に分け|に整理|に大別|に区別|に分かれ|に集約|挙げられる|指摘できる|に要約)|(?:少なくとも|大きく|おおむね|主に|概ね)[二三四五六七八九十2-9２-９][つ点]', 'g');
  /* 章の頭と末の道案内（本章では〜を確認する・次章では〜を見る・以上を〜）。序論の構成の予告は 1 回で足りる（v2.1。密度は判） */
  var RE_SIGNPOST = /^(?:本章|本節|この章|この節|次章|次節|以下|以上|ここまで)(?:では|は|で|の|を|、)[^。]{0,40}(?:確認する|検討する|見る|整理する|述べる|論じる|取り上げる|まとめ|進む|踏まえ|触れる|扱う|示す|紹介する|考える|検討した|整理した|確認した|見た|述べた|論じた|分析する|検討を加える|見ていく|見てきた)/;
  /* 本文の作業の告白（検索先・検索語・読めなかった資料・書誌だけの確認。v2.1。台帳と報告に書き、本文には書かない。IMRaD の方法の節は例外）。注・参考文献の行は見ない */
  var RE_WORKWORD = /J-STAGE|CiNii|機関リポジトリ|OpenAlex|CrossRef|Google Scholar|の語で検索|検索し|検索語|検索範囲|検索結果|データベース(?:で|を)検索|全文を確認でき|全文を読め|全文が読め|参照できなかった|閲覧できなかった|入手できなかった|把握しておらず|通じてしか|書誌のみ|書誌だけ|未読|調べた範囲|確認できたのは|確認できた範囲|[0-9０-９]{4}年[0-9０-９]{1,2}月に(?:検索|確認|閲覧|取得)|時点で(?:検索|閲覧|取得)/g;
  /* 図題の文：述語で終わらない断片（「判断の段階は四つ。」）。出典の断り（筆者作成）は除く */
  var RE_PREDICATE_END = /(?:[うくすつぬふむゆるぐずづぶぷ]|い|た|だ|ない|である|です|ます|か|れ)$/;
  var RE_COUNTER_END = new RegExp(NUMJ + '(?:つ|点|段階|件|本|枚|種|層|類型)$');   // 「判断の段階は四つ」。体言止めの凡例（「赤は本件の争点」）は断片に数えない
  var RE_CAP_SOURCE = /出典|出所|筆者|作成|集計|加筆|基づく|もとに|基に|source|author/i;
  /* 禁止語（日本語）。2026-10-22 の研究で人と AI を分けないと分かった語（観点から・なお・非常に・極めて・まず…次に…最後に）は外すか info に落とした（WRITING-JA-LAW-PAPERS.md §5.3） */
  var BANNED_JA = [
    ['重要な役割を果た', /重要な役割を果た/g, 1, 'info', '「重要な役割を果たす」は具体的な名詞・数値・条文番号に置き換える（人にも AI にもまれな語。弱い目安）'],
    ['多岐にわた', /多岐にわた/g, 1, 'info', '「多岐にわたる」は何が幾つあるかを書く（弱い目安）'],
    ['踏まえると', /踏まえると/g, 3, 'warn', '「踏まえると」の多用（AI にやや多い）'],
    ['非常に・極めて', /非常に|極めて/g, 2, 'info', '程度の副詞だけで評価を済ませない（非常に・極めて は人の文の方が多い語。具体の基準に付けて使う）'],
    ['第一に・第二に・第三に', null, 1, 'warn', '「第一に…第二に…第三に」の番号つきの三分割は AI の文に 3〜5 倍多い。段落を分けて主題の文で言う'],
    ['ポイントの枠', /^(?:【ポイント】|ポイント[:：]|■\s*ポイント|◆\s*ポイント)/mg, 1, 'warn', '「ポイント」のような強調枠は使わない。要点は本文に混ぜる']
  ];
  /* 英語の語（WRITING-EN.md §5.4。段 1＝使わない、段 2＝文書に 1 回まで、段 3＝密度で見る） */
  var EN_AI1 = /\b(delv(?:e|es|ed|ing)|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|tapestry|testament|cornerstone|multifaceted|intricate(?:ly)?|intricacies|pivotal|paramount|transformative|unravel(?:s|ed|ing)?|pave(?:s|d)? the way|realms?|endeavou?rs?|invaluable|meticulous(?:ly)?|commendable|seamless(?:ly)?|harness(?:es|ed|ing)?|navigat(?:e|es|ed|ing)|interplay|advancements|boasts|groundbreaking|vibrant|ever-evolving|a deeper understanding)\b/gi;
  var EN_AI2 = /\b(nuanced|nuances?|bolster(?:s|ed|ing)?|profound(?:ly)?|foster(?:s|ed|ing)?|leverag(?:e|es|ed|ing)|vital|embrac(?:e|es|ed|ing)|tangible|garner(?:s|ed|ing)?|grappl(?:e|es|ed|ing)|resonat(?:e|es|ed|ing)|myriad|the intersection of|aligns? with|holistic|innovative|undoubtedly)\b/gi;
  var EN_AI3 = /\b(crucial(?:ly)?|significant(?:ly)?|insights|landscapes?|enhanc(?:e|es|ed|ing)|robust|ultimately|moreover|furthermore|additionally|notably|serves? as|highlights?|frameworks?|potential|findings)\b/gi;
  var EN_PTAIL = /,\s+(highlighting|underscoring|emphasizing|emphasising|reflecting|showing|demonstrating|illustrating|revealing|suggesting|indicating|making|allowing|enabling|creating|leading|resulting|ensuring|providing|offering|contributing|fostering|reinforcing|signaling|signalling|shaping)\b[^,.;]*[.!?]?\s*$/i;
  var EN_HEDGE = /\b(may|might|could|perhaps|possibly|likely|unlikely|probably|suggests?|suggested|appears?|appeared|seems?|seemed|tends?|tended|arguably|somewhat|potentially|plausibly|presumably|apparently)\b/gi;
  var EN_THESIS = /\b(?:I|we) (?:argue|show|contend|defend|claim|demonstrate|find|propose|maintain|will argue|shall argue)\b|\bthis (?:article|paper|essay|note|chapter|study|thesis|report|comment) (?:argues|shows|contends|defends|claims|demonstrates|finds|proposes|maintains|makes the case)\b|\bmy (?:argument|claim|thesis|central claim) is\b|\bthe (?:argument|claim|thesis) of this (?:article|paper|essay) is\b/i;
  var EN_PURPOSE = /\bthis (?:paper|article|essay|study|report|thesis|chapter) (?:explores|examines|focuses on|aims to|seeks to|considers|discusses|investigates|looks at|will explore|will examine|will discuss|attempts to)\b|\bthe (?:purpose|aim|goal) of this (?:paper|article|essay|study|report|thesis)\b|\bin this (?:paper|article|essay|study|report),? (?:I|we) (?:explore|examine|discuss|consider|investigate|look at)\b/i;
  var EN_GENERIC = /^(?:throughout history|since the dawn of|in today'?s (?:world|society|day and age)|in the modern (?:world|era)|in recent years,? [a-z ]+ has become|since the beginning of time|from time immemorial)|\bhas always been\b|\bone of the (?:most|greatest|biggest)\b|\b(?:dictionary|webster'?s?|oxford) defines\b|\bis defined (?:by the dictionary )?as\b/i;
  var EN_VAGUE = /\b(?:many|most|some|numerous|several|a number of) (?:scholars|researchers|studies|critics|commentators|authors|economists|historians|philosophers|observers|experts)\b|\bstudies (?:show|suggest|have shown|have found|indicate)\b|\bit is (?:widely|generally|commonly|often) (?:believed|accepted|agreed|held|argued|thought)\b|\bresearch (?:shows|suggests|has shown)\b|\bscholars (?:argue|agree|have argued|have noted)\b/i;
  var EN_CITE = /\(\s*[A-Z][A-Za-z\-'’]+(?:[^)]{0,60})?\b(?:1[89]|20)\d{2}[a-z]?\s*(?:[:,]\s*\d+(?:[–\-]\d+)?)?\)|\[\s*\d{1,3}(?:[,–\-]\s*\d{1,3})*\s*\]|\bsupra\b|\binfra\b|\bn\.\s*\d|\^\d+|\b(?:1[89]|20)\d{2}\)|\bU\.S\.C\b|\bv\.\s+[A-Z]|\bId\.|\bIbid\b/;
  var EN_COUNTER = /\bone might (?:object|worry|think|wonder|argue|say|respond|contend|reply)\b|\bto be sure\b|\bit is true that\b|\badmittedly\b|\ban objection\b|\bobjections? (?:to|against)\b|\bthis is not to say\b|\bcritics (?:may|might|will|could) (?:say|argue|claim|object|respond)\b|\bsome (?:may|might|will) (?:object|argue|say)\b/i;
  var EN_TURN = /\b(?:but|however|yet|still|nevertheless|nonetheless|does not|do not|is not|are not|cannot|even so|that said)\b/i;
  var EN_COUNTER_LABEL = /\b(?:a|the|one|another|this) (?:possible |potential |common |obvious )?counter-?arguments?\b|\baddress(?:es|ing)? (?:the|a) counter-?argument\b|\bcounter-?argument to this\b/i;
  var EN_MOREOVER = /^(?:moreover|furthermore|additionally)\b/i;
  var EN_INCONCL = /^(?:in conclusion|in summary|to sum up|to summarize|to summarise)\b/i;
  var EN_ENUM = /^(?:first|second|third|fourth|fifth|finally|lastly)(?:ly)?\b[,:]?/i;
  var EN_BOOST = /\b(?:clearly|obviously|undoubtedly|proves?|proved|proven)\b/i;
  var EN_PASSIVE = /\b(?:is|are|was|were|be|been|being)\b(?:\s+\w+ly)?(?:\s+(?:not|also|often|still|then|thus|widely|generally))?\s+(?:\w+(?:ed|en)|done|made|held|found|given|taken|seen|known|shown|written|built|brought|thought|said|set|put|kept|led|left|lost|met|paid|read|sent|sold|told|understood|won|cut|hit|run|spent|struck|bound|caught|chosen|driven|drawn|eaten|fallen|forgotten|frozen|hidden|ridden|risen|shaken|spoken|stolen|sworn|torn|worn|woven|begun|sung|sunk|drunk|rung|sprung|swung|dealt|felt|meant|sought|taught|bought|fought|brought|cast|laid)\b/i;

  /* ---------------- 本体 ---------------- */
  function checkReport(text, opts) {
    opts = opts || {};
    var raw = String(text == null ? '' : text).replace(/\r/g, '');
    var lv = BY_ID[levelOf(opts.level) || DEFAULT_LEVEL], th = lv.th;
    var findings = [];
    var add = function (rule, severity, message, at, count) { if (!severity || severity === 'none') return; findings.push({ rule: rule, severity: severity, message: message, at: at == null ? '' : String(at).slice(0, 60), count: count == null ? undefined : count }); };

    /* 台帳（本文の中か、別に渡したもの） */
    var led = parseLedger(raw), extra = opts.ledger ? parseLedger(String(opts.ledger)).rows : [];
    var rows = led.rows.concat(extra), prose = led.rest;
    var lang = (opts.lang === 'ja' || opts.lang === 'en') ? opts.lang : detectLang(prose);
    var seg = segment(prose, lang), lines = seg.lines, sents = seg.sents, paras = seg.paras;
    var heads = lines.filter(function (l, i) { return seg.kinds[i] === 'heading' || seg.kinds[i] === 'label'; });
    var headIdx = []; seg.kinds.forEach(function (k, i) { if (k === 'heading') headIdx.push(i); });
    var proseChars = sents.reduce(function (u, s) { return u + (lang === 'ja' ? s.len : slen(s.s)); }, 0);
    var proseWords = lang === 'en' ? sents.reduce(function (u, s) { return u + s.len; }, 0) : 0;
    var stats = { lang: lang, chars: slen(prose), proseChars: proseChars, proseWords: proseWords, quote: { lines: seg.quoteLines, chars: seg.quoteChars, sandwich: seg.sandwich },
      ledger: { n: rows.length, byV: [0, 0, 0, 0], core: 0, primary: 0, peer: 0, tagged: 0, toget: 0 }, profile: lang === 'ja' ? th.ja.profile : ('en-' + th.en.rules) };
    rows.forEach(function (r) { stats.ledger.byV[r.v]++; if (r.core) stats.ledger.core++; if (r.primary) stats.ledger.primary++; if (r.peer) stats.ledger.peer++; if (r.core || r.primary || r.peer || r.secondary || r.textbook) stats.ledger.tagged++; });
    var bodyText = sents.map(function (s) { return s.s; }).join('\n');
    var jaSig = [];   // 論文の型で当たった AI らしさの目印（短くそろう・長文が無い・推量が無い・三分割・見出しの多さ・箇条書き・「今後」の結び・出典のない通説・頁のない書籍）。3 つ以上で error
    var sig = function (name) { if (jaSig.indexOf(name) < 0) jaSig.push(name); };

    /* (a) 文の長さ・段落（地の文だけ。引用段落・はさむ文・見出し・注・図題は外してある） */
    var lens = sents.map(function (s) { return s.len; });
    var avg = mean(lens), median = medianOf(lens), sd = sdOf(lens), cvS = avg ? sd / avg : 0;
    var sorted = lens.slice().sort(function (u, v) { return u - v; });
    var limit = lang === 'ja' ? 100 : 40, longs = sents.filter(function (s) { return s.len > limit; }), lr = ratio(longs.length, sents.length);
    var over120 = sents.filter(function (s) { return s.len > (lang === 'ja' ? 120 : 50); }).length;
    var over200 = sents.filter(function (s) { return s.len > 200; }), over300 = sents.filter(function (s) { return s.len > 300; });
    var shorts = sents.filter(function (s) { return s.len < 10; }), shortR = ratio(shorts.length, sents.length);
    var okP = paras.filter(function (p) { return p.n >= 2 && p.n <= 4; }).length, oneP = paras.filter(function (p) { return p.n === 1; }).length, pr = ratio(okP, paras.length);
    var pLens = paras.map(function (p) { return lang === 'ja' ? p.chars : p.words; }), pAvg = mean(pLens), pSd = sdOf(pLens), cv = pAvg ? pSd / pAvg : 0;
    stats.sentences = { n: sents.length, avg: +avg.toFixed(1), median: median, sd: +sd.toFixed(1), cv: r3(cvS), max: sorted.length ? sorted[sorted.length - 1] : 0, over: longs.length, overRatio: r3(lr), over120: over120, over200: over200.length, over300: over300.length, short: shorts.length, shortRatio: r3(shortR), unit: lang === 'ja' ? 'chars' : 'words' };
    stats.paragraphs = { n: paras.length, ok24: okP, okRatio: +pr.toFixed(2), one: oneP, oneRatio: paras.length ? +(oneP / paras.length).toFixed(2) : 0, median: medianOf(pLens), long8: paras.filter(function (p) { return p.n >= 8; }).length, lenCv: +cv.toFixed(2) };
    if (!sents.length) add('no-sentences', 'info', lang === 'ja' ? '文が見つからない（本文を渡しているか）' : 'No sentences found');

    if (lang === 'ja') {
      var J = th.ja;
      if (J.profile !== 'paper') {
        /* 意見文・発表レジュメの型：短く断定する文体（較正用の完成版で較正） */
        if (sents.length) {
          if (avg > J.avgMax) add('sentence-avg', 'warn', '1 文の平均が長い（' + avg.toFixed(0) + ' 字。この型は ' + J.avgMax + ' 字以下' + (J.avgTarget ? '・目標 約 ' + J.avgTarget : '') + '）', '', +avg.toFixed(1));
          if (lr > J.over100Max) add('sentence-long', lr > J.over100Max * 3 + 0.02 ? 'error' : 'warn', '引用を除いて 100 字を超える文が ' + longs.length + ' 個（' + Math.round(lr * 100) + '%。この型は ' + Math.round(J.over100Max * 100) + '% まで）。例：「' + longs[0].s.slice(0, 24) + '…」', longs[0].s, longs.length);
          if (J.over120Max != null && over120 > J.over120Max) add('sentence-120', 'warn', '引用を除いて 120 字を超える文が ' + over120 + ' 個（この型では 0 にする）', '', over120);
        }
        if (paras.length >= 3 && pr < J.para24Min) add('paragraph-2-4', 'warn', '地の文で 1 段落 2〜4 文の段落が少ない（' + Math.round(pr * 100) + '%。この型は ' + Math.round(J.para24Min * 100) + '% 以上）', '', +pr.toFixed(2));
        else if (J.para24Max != null && paras.length >= 10 && pr > J.para24Max) add('paragraph-2-4-uniform', 'warn', '地の文の段落がほぼすべて 2〜4 文（' + Math.round(pr * 100) + '%。この型の上限 ' + Math.round(J.para24Max * 100) + '%。完成版は 73%：定義・導入・結びの 1 文の段落も使い、長さをそろえない）', '', +pr.toFixed(2));
        if (pLens.length >= 6 && cv < 0.15) add('paragraph-uniform', 'info', '段落の長さが揃いすぎている（長さを揃えない）', '', +cv.toFixed(2));
      } else {
        /* 論文の型：人の法律論文 39 本（文書ごとの分布の 10〜90% 点）と学者出身の判事の個別意見。短くそろった文・推量のない文・三分割・細かい見出し・本文の箇条書き・「今後」の結びを指す */
        if (sents.length >= 10) {
          if (median < J.medianMin || avg < J.meanMin) sig('short-flat');
          if (median < J.medianMin || avg < J.meanMin) add('sentence-short-flat', 'warn', '1 文が短くそろっている（中央値 ' + median + ' 字・平均 ' + avg.toFixed(0) + ' 字。人の法律論文は文書の中央値 54〜83 字・平均 61〜96 字。AI の文は中央値 40〜59）。長い文と短い文を混ぜ、理由や条件を同じ文に入れる', '', median);
          else if (median > J.medianMax) add('sentence-median-long', 'warn', '1 文の中央値が長い（' + median + ' 字。論文の型の目安は ' + J.medianMax + ' 字まで）', '', median);
          if (lr < J.over100Min) sig('long-few');
          if (lr < J.over100Min) add('sentence-long-few', 'warn', '100 字を超える文が少ない（' + Math.round(lr * 100) + '%。人の法律論文は 10〜39%、AI は 0〜5%）。長さをそろえない', '', longs.length);
          else if (lr > J.over100Max) add('sentence-long', 'warn', '100 字を超える文が多い（' + Math.round(lr * 100) + '%。この型は ' + Math.round(J.over100Max * 100) + '% まで）', longs[0] && longs[0].s, longs.length);
          if (ratio(over200.length, sents.length) > J.over200Max) add('sentence-200', 'warn', '200 字を超える文が ' + over200.length + ' 個（' + Math.round(ratio(over200.length, sents.length) * 100) + '%。人の論文では 1.9%・99% 点 236 字）。番号つきの列挙でなければ分ける', over200[0].s, over200.length);
          if (over300.length > J.over300Max) add('sentence-300', 'warn', '300 字を超える文が ' + over300.length + ' 個（分ける）', over300[0].s, over300.length);
          var over240 = sents.filter(function (s) { return s.len > 240 && s.len <= 300 && !/[①-⑳]|[(（][ⅰ-ⅹivx]+[)）]|第[一二三]に/.test(s.s); });
          if (over240.length) add('sentence-240-list', 'info', '240 字を超えるのに番号つきの列挙（①②・（ⅰ）（ⅱ））を含まない文が ' + over240.length + ' 個（要件・理由は番号を振って、後で番号で呼ぶ）', over240[0].s, over240.length);
          if (cvS < J.cvMin) sig('cv');
          if (cvS < J.cvMin) add('sentence-cv', 'warn', '文の長さの変動係数が小さい（' + cvS.toFixed(2) + '。人の論文は 0.46 以上・中央 0.59、AI は 0.37〜0.44）。長短を混ぜる', '', r3(cvS));
        }
        if (paras.length >= 8) {
          var oneR = ratio(oneP, paras.length);
          if (oneR < J.oneParaMin) add('paragraph-one', 'info', '1 文だけの段落が少ない（' + Math.round(oneR * 100) + '%。人の論文は 10〜46%：章の冒頭の予告・引用の導入・章末のまとめに使う）', '', oneP);
          var longP = paras.filter(function (p) { return p.chars > J.paraCharsMax; });
          if (longP.length) add('paragraph-long', 'info', J.paraCharsMax + ' 字を超える段落が ' + longP.length + ' 個（人の論文の 95% 点 545 字。分ける候補）', lines[longP[0].line], longP.length);
        }
      }
    } else {
      var E = th.en, ER = EN_RULES[E.rules], strict = E.rules === 'grad';
      var W = function (hard) { return strict ? hard : 'info'; };
      if (sents.length >= 8) {
        if (avg < E.meanMin || avg > E.meanMax) add('en-sent-mean', strict ? 'warn' : 'info', 'Mean sentence length ' + avg.toFixed(1) + ' words (this level expects ' + E.meanMin + ' to ' + E.meanMax + '; strong published writing averages about 25)', '', +avg.toFixed(1));
        if (cvS < E.cvMin) add('en-sent-cv', 'warn', 'Sentence lengths are too uniform (coefficient of variation ' + cvS.toFixed(2) + '; this level wants at least ' + E.cvMin + '; GPT-4o text sits near 0.27). Mix short and long sentences', '', r3(cvS));
        if (lr > E.over40Max) add('en-sent-long', 'warn', Math.round(lr * 100) + '% of sentences exceed 40 words (this level allows ' + Math.round(E.over40Max * 100) + '%)', longs[0] && longs[0].s, longs.length);
        if (shortR > E.under10Max) add('en-sent-short-max', 'warn', Math.round(shortR * 100) + '% of sentences are under 10 words (this level allows ' + Math.round(E.under10Max * 100) + '%; strong writing has about 6%; Claude drafts run 18 to 19%). Join short sentences so that reasons and conditions sit in the same sentence', shorts[0] && shorts[0].s, shorts.length);
        else if (E.under10Min != null && shortR < E.under10Min) add('en-sent-short', 'info', 'Fewer than ' + Math.round(E.under10Min * 100) + '% of sentences are under 10 words; a short sentence at a turn or conclusion helps', '', shorts.length);
      }
      if (paras.length >= 4) {
        var pm = medianOf(pLens);
        if (pm < ER.paraWords[0] || pm > ER.paraWords[1]) add('en-para-length', 'info', 'Median paragraph length ' + pm + ' words (strong writing: ' + ER.paraWords[0] + ' to ' + ER.paraWords[1] + ')', '', pm);
        var l8 = ratio(stats.paragraphs.long8, paras.length);
        if (l8 > ER.paraLong) add('en-para-long', W('warn'), Math.round(l8 * 100) + '% of paragraphs have 8 or more sentences (limit ' + Math.round(ER.paraLong * 100) + '%)', '', stats.paragraphs.long8);
      }
    }

    /* (b) 語尾（日本語だけ）・ヘッジ・禁止語・箇条書き */
    var per = Math.max(1, proseChars / 1000);
    var bullets = seg.kinds.filter(function (k) { return k === 'bullet'; }).length, bodyLines = seg.kinds.filter(function (k) { return k === 'body' || k === 'list' || k === 'bullet'; }).length;
    stats.bullets = { lines: bullets, ratio: bodyLines ? +(bullets / bodyLines).toFixed(2) : 0 };
    if (lang === 'ja') {
      var J2 = th.ja, cnt = {}, four = 0, infer = 0, judg = 0, runs = 0, prevE = null, runLen = 0;
      sents.forEach(function (s) { var e = endingOf(s.s); cnt[e] = (cnt[e] || 0) + 1; if (FOUR[e]) four++; if (INFER[e]) infer++; if (e === 'judgment') judg++;
        if (e === prevE && e !== 'ta' && e !== 'teiru' && e !== 'other' && e !== 'suru') { runLen++; if (runLen === 3) runs++; } else runLen = 1; prevE = e; });
      var plainR = ratio(four, sents.length), polite = cnt.polite || 0, inferR = ratio(infer, sents.length);
      stats.endings = { byKind: cnt, four: four, plainRatio: r3(plainR), polite: polite, infer: infer, inferRatio: r3(inferR), judgment: judg, sameRun3: runs, hedgeEnd: (cnt.hedge || 0) + (cnt.toieru || 0), question: (cnt.dewanaika || 0) + (cnt.gimon || 0) + (cnt.ka || 0) };
      if (polite) add('endings-polite', (polite / Math.max(1, sents.length) > 0.03) ? 'warn' : 'info', '「です・ます」の文が ' + polite + ' 個（生成した本文は である調。利用者が発表原稿として直した段落なら残す）', '', polite);
      var hedge = sents.reduce(function (u, s) { return u + (s.s.match(RE_HEDGE) || []).length; }, 0);
      stats.hedge = { count: hedge, per1000: +(hedge / per).toFixed(2) };
      if (J2.profile !== 'paper') {
        if (sents.length >= 5 && plainR < J2.plainMin) add('endings', 'warn', '語尾の 4 形（した・する・である・ない）が ' + Math.round(plainR * 100) + '%（この型は ' + Math.round(J2.plainMin * 100) + '% 以上。といえる・とされる・と考えられる は 4 形に入れない）', '', r3(plainR));
        if (hedge / per > J2.hedgeMax) add('hedge', 'warn', '「思われる／考えられる／といえよう／だろう」が 1,000 字に ' + (hedge / per).toFixed(1) + ' 回（この型は ' + J2.hedgeMax + ' 回まで）。断定か「〜と読める」「〜とみられる」に', '', hedge);
      } else if (sents.length >= 10) {
        if (inferR < J2.inferMin) sig('infer-few');
        if (inferR < J2.inferMin) add('infer-few', 'warn', '推量・問いの文末（であろう・と思われる・と考えられる・ではないか・〜か）が ' + (inferR * 100).toFixed(1) + '%（人の法律論文は 3〜16%・中央 5%、AI は 0〜4.5%）。断定と推論を書き分ける：根拠から一歩進めた推論に「と思われる」、立場は「と考える」', '', infer);
        else if (inferR > J2.inferMax) add('infer-many', 'warn', '推量の文末が ' + Math.round(inferR * 100) + '%（この型は ' + Math.round(J2.inferMax * 100) + '% まで）。結論の文は言い切る', '', infer);
        if (ratio(runs, sents.length) > J2.sameEndRunMax) add('endings-run', 'info', '同じ文末が 3 文続く箇所が ' + runs + '（手本は 1.3%）', '', runs);
        if (ratio(judg, sents.length) > J2.judgmentEndMax) add('endings-judgment', 'warn', '判決の定型（というべきである・と解するのが相当である・と解される）で終わる文が ' + judg + ' 個（論文の地の文では 0.2% 未満。個人の立場は「と考える」「べきである」）', '', judg);
        /* 各節の結論の文は推論にしない（判事型 L5） */
        var secEnd = [];
        for (var hi = 0; hi <= headIdx.length; hi++) {
          var from = hi === 0 ? 0 : headIdx[hi - 1], to = hi === headIdx.length ? lines.length : headIdx[hi];
          var last = null; sents.forEach(function (s) { if (s.line > from && s.line < to) last = s; });
          if (last && INFER[endingOf(last.s)] && /と思われる|と考えられる|であろう|だろう/.test(last.s)) secEnd.push(last.s);
        }
        if (secEnd.length && headIdx.length >= 2) add('section-end-infer', 'info', '節の最後の文が推論の文末になっている箇所が ' + secEnd.length + '（各節の結論は「と考える」「べきである」「である」で言い切る）', secEnd[0], secEnd.length);
        /* 書き出しの 1〜2 文で立場と範囲（判事型 L1） */
        var head2 = sents.slice(0, 2).map(function (s) { return s.s; }).join('');
        if (sents.length >= 20 && !/本稿|筆者|私見|私は|本論文|本章/.test(head2) && !/と考える|べきである|と解する|論じる|検討する|述べる|明らかにする|検討を加える|考察する/.test(head2)) add('opening-position', 'info', '書き出しの 1〜2 文に、立場の主語（本稿は・筆者は）と立場か予告の文末（と考える・論じる・検討する）が無い（手本 38／39 は最初の文で立場を言う）', sents[0].s, 1);
        /* 確かに→逆接（判事型 L7）・問い→答え（L9） */
        for (var si = 0; si < sents.length; si++) {
          if (/^(?:確かに|たしかに)/.test(sents[si].s)) { var nxt = sents.slice(si, si + 3).map(function (s) { return s.s; }).join(''); if (!/しかし|もっとも|むしろ|だが|ただし|が、|けれども/.test(nxt)) add('tashikani-turn', 'info', '「確かに」の後 2 文以内に逆接（しかし・もっとも・むしろ）が無い（反対の見方を公平に書いてから応える型）', sents[si].s); }
          if (/^(?:それでは|では)/.test(sents[si].s) && /(?:であろうか|だろうか|か)[。．]?$/.test(sents[si].s) && si + 1 < sents.length && /(?:であろうか|だろうか|のか|か)[。．]?$/.test(sents[si + 1].s)) add('question-answer', 'info', '問いを立てた直後の文も問いになっている（問いの次の文から答える）', sents[si].s);
        }
        /* 判例は初出で正式の形、繰り返すなら略称を定義（判事型 L12） */
        var cases = {}, cm, reCase = /最(?:大|[一二三]小)?(?:判|決)(?:昭和|平成|令和|大正|明治)?[0-9０-９元]+[年・.][0-9０-９]+[月・.][0-9０-９]+日?/g;
        while ((cm = reCase.exec(bodyText))) cases[cm[0]] = (cases[cm[0]] || 0) + 1;
        var rep = Object.keys(cases).filter(function (k) { return cases[k] >= 3; });
        if (rep.length && !/以下「[^」]{2,20}」という/.test(prose)) add('case-abbrev', 'info', '同じ判例を正式の形で 3 回以上引いている（' + rep[0] + '）。初出で略称を定義し（以下「〇〇判決」という。）、以後は略称で', rep[0], rep.length);
      }
      var banned = {};
      BANNED_JA.forEach(function (b) {
        var c = 0;
        if (b[0] === '第一に・第二に・第三に') { var d1 = (bodyText.match(/(?:^|[。\n])\s*第[一1１]に[、，]/g) || []).length, d2 = (bodyText.match(/(?:^|[。\n])\s*第[二2２]に[、，]/g) || []).length, d3 = (bodyText.match(/(?:^|[。\n])\s*第[三3３]に[、，]/g) || []).length; c = Math.min(d1, d2, d3);
          var perMan = Math.max(1, proseChars / 10000);
          if (J2.profile === 'paper') { if (d1 >= 3 && d1 / perMan > J2.daiichiMax) { sig('enum'); add('banned', 'warn', '文頭の「第一に」が 1 万字に ' + (d1 / perMan).toFixed(1) + ' 回（人の論文は 0.5〜1.4、AI は 3〜4.3）。段落を分けて主題の文で言う', '', d1); } c = 0; }
        }
        else if (b[0] === 'ポイントの枠') c = (prose.match(b[1]) || []).length;
        else c = (bodyText.match(b[1]) || []).length;
        banned[b[0]] = c;
        if (b[0] === '非常に・極めて') { if (c >= b[2] && c / per > 0.3) add('banned', b[3], b[4] + '：' + c + ' 回', '', c); return; }
        if (c >= b[2] && c > 0) add('banned', b[3], b[4] + '：' + c + ' 回', '', c);
      });
      stats.banned = banned;
      var triples = (bodyText.match(/[^・\s、。（）()]{1,12}・[^・\s、。（）()]{1,12}・[^・\s、。（）()]{1,12}(?![^・\s、。]*・)/g) || []).length;
      if (triples / per >= 3) add('triples', 'info', '三つ並べ（A・B・C）が多い（1,000 字に ' + (triples / per).toFixed(1) + ' 回）', '', triples);
      var mittsu = (bodyText.match(/(?:三つ|3つ|３つ|三点|3点|３点)(?:の|に|ある|を)/g) || []).length;
      if (J2.profile === 'paper' && mittsu / Math.max(1, proseChars / 5000) >= J2.mittsuMax) sig('enum');
      if (mittsu / Math.max(1, proseChars / 5000) >= (J2.profile === 'paper' ? J2.mittsuMax : 3)) add('mittsu', J2.profile === 'paper' ? 'warn' : 'info', '「三つ（3 点）に分ける」予告が 5,000 字に ' + mittsu + ' 回（人は 2 点に分けることが多く、三つに分けて番号を振るのは AI の癖）', '', mittsu);
      /* 数え上げの族（v2.1）：「第一に」を指すと「一つは／もう一つは」「二つの点で」「実益は二つ」に逃げるので、数詞＋分割の宣言をまとめて数える。①②③ は数えない */
      var perMan1 = Math.max(1, proseChars / 10000), enumHits = bodyText.match(RE_ENUM) || [], enumN = enumHits.length;
      stats.enumeration = { n: enumN, per10000: +(enumN / perMan1).toFixed(1), examples: enumHits.slice(0, 6).map(function (x) { return x.trim(); }) };
      if (enumN >= 4 && enumN / perMan1 > J2.enumMax) {
        if (J2.profile === 'paper') sig('enum');
        add('enum-family', 'warn', '数え上げ（第一に・一つは／もう一つ・二つの点・〇つある・〇つに分ける）が 1 万字に ' + (enumN / perMan1).toFixed(1) + ' 回（人の法律論文はおおむね ' + J2.enumMax + ' まで。例：' + stats.enumeration.examples.slice(0, 4).join('／') + '）。語の形を変えても同じ癖。要件・理由は ①②③ で番号を振り、それ以外は段落を分けて主題の文で言う', enumHits[0].trim(), enumN);
      }
      /* 章の頭と末の道案内（v2.1）：本章では〜を確認する・次章では〜を見る・以上を〜 の密度。序論の構成の予告 1 回で足りる */
      var signN = sents.filter(function (s) { return RE_SIGNPOST.test(s.s); }).length;
      stats.signposting = { n: signN, per10000: +(signN / perMan1).toFixed(1) };
      if (signN >= 4 && signN / perMan1 > J2.signpostMax) add('signposting', 'warn', '章の頭と末の道案内（本章では〜を確認する・次章では〜）が ' + signN + ' 文（1 万字に ' + (signN / perMan1).toFixed(1) + '。構成の予告は序論で 1 回、章の冒頭は主題の文で始め、章末は結論の文で終える）', sents.filter(function (s) { return RE_SIGNPOST.test(s.s); })[0].s, signN);
      var mottomo = sents.filter(function (s) { return /^もっとも[、，]/.test(s.s); }).length;
      if (J2.profile === 'paper' && mottomo >= 3 && mottomo / sents.length * 100 > J2.mottomoMax) sig('mottomo');
      if (J2.profile === 'paper' && mottomo >= 3 && mottomo / sents.length * 100 > J2.mottomoMax) add('mottomo', 'info', '文頭の「もっとも」が 100 文に ' + (mottomo / sents.length * 100).toFixed(1) + ' 回（人の論文は 0.9〜1.2、AI は 1.8〜2.7）', '', mottomo);
      var kanji = (bodyText.match(/[一二三四五六七八九十百千〇]{2,}(?:年|条|項|号|頁)/g) || []).length;
      if (kanji) add('kanji-numerals', 'info', '横書きで年・条・項を漢数字で書いた箇所が ' + kanji + '（人の横書きの論文は算用数字 2,718 対 漢数字 6。引用の中は除く）', '', kanji);
      var tsuu = sents.filter(function (s) { return /(?:^|[、，。\s])(?:通説|判例)(?:は|によれば|上|の立場)/.test(s.s) && !/[（(].{3,}[）)]|最[大判決]|[0-9０-９]+頁|参照/.test(s.s); }).length;
      if (tsuu && J2.profile === 'paper') sig('tsuusetsu');
      if (tsuu) add('tsuusetsu-cite', J2.profile === 'paper' ? 'warn' : 'info', '出典のない「通説は」「判例は」が ' + tsuu + ' 文（AI に 2〜11 倍多い。論者の名と頁、判例は裁判所と日付で）', '', tsuu);
      var tsuusho = (bodyText.match(/[^\s、。「」]{2,12}事件/g) || []), tsuushoN = tsuusho.filter(function (t) { return !/^(?:本|当該|この|同)/.test(t); }).length;
      if (J2.profile === 'paper' && tsuushoN >= 3 && tsuushoN / Math.max(1, proseChars / 10000) > 5 && !/最[大判決]|[地高]判/.test(bodyText)) add('case-nickname', 'info', '事件の通称（〇〇事件）が 1 万字に ' + tsuushoN + ' 回あるのに裁判所と日付が無い（人の論文は 1.7〜2.8、AI は 9〜14）', tsuusho[0], tsuushoN);
      /* 本文の箇条書き：発表レジュメ型は構造が本質のところ（要件・参考判例の事案と判断）を許し 3 割で指摘、論文型は 1 行でも指摘（人の論文 0／47） */
      if (J2.profile === 'paper') { if (bullets > J2.bulletsMax) { sig('bullets'); add('bullets', 'warn', '本文に箇条書きが ' + bullets + ' 行（人の法律論文 47 本に 0、AI は 5／18）。論証は段落の文で', '', bullets); } }
      else if (bodyLines >= 5 && bullets / bodyLines > 0.3) add('bullets', 'warn', '本文の箇条書きが多い（' + bullets + ' 行。要件の列挙・条文など構造が本質のところだけに）', '', bullets);
      /* 見出しの密度（P18・L2） */
      var perMan2 = Math.max(1, proseChars / 10000), hDens = headIdx.length / perMan2;
      stats.headings = { n: headIdx.length, per10000: +hDens.toFixed(1) };
      if (J2.profile === 'paper' && proseChars >= 2000) {
        if (headIdx.length >= 5 && hDens > J2.headingsMax) { sig('headings'); add('headings-dense', 'warn', '見出しが 1 万字に ' + hDens.toFixed(1) + '（人の論文は 12.6〜16.1、AI は 26.5〜38。1 見出しの本文が 600〜800 字になる粒度に）', '', headIdx.length); }
        else if (proseChars > 3000 && headIdx.length === 0) add('headings-none', 'info', '3,000 字を超える本文に見出しが無い（約 3,000 字に 1 つ、名詞の短い題で）', '', 0);
        var longH = headIdx.map(function (i) { return lines[i].replace(RE_HEAD_NUM, '').trim(); }).filter(function (t) { return cpLen(t) > J2.headingCharsMax; });
        if (longH.length) add('heading-long', 'info', '見出しの題が ' + J2.headingCharsMax + ' 字を超える（' + longH.length + ' 件。手本の中央値 10 字。動詞で終えない名詞の題に）', longH[0], longH.length);
      }
      /* 結び（P21）：最終段落が「今後」＋課題・求められる・期待・注視で終わり、具体の論点名が無い */
      var lastP = null; paras.forEach(function (p) { var t = lines[p.line]; if (!RE_WORKNOTE.test(t) && !/^[（(]/.test(t)) lastP = p; });   // 作業の注記・括弧だけの行は結びに数えない
      var kongo = !!(lastP && /今後/.test(lines[lastP.line]) && /(?:課題|求められる|期待|注視|必要がある|検討が必要)/.test(lines[lastP.line]) && !/[0-9０-９]+条|最[大判決]|[「『]/.test(lines[lastP.line]));
      if (kongo && J2.profile === 'paper') sig('kongo');
      if (kongo) add('closing-kongo', J2.profile === 'paper' ? 'warn' : 'info', '最終段落を「今後…が課題」型で締めている（AI 13／18、人 11／44）。答えた範囲と残る問題を具体の論点名（条文・判例・概念）で書く', lines[lastP.line], 1);
      /* 一人称（P22・L13） */
      var watashi = (bodyText.match(/(?<![公無滅])私(?=は|が|も|の|に|と|として)/g) || []).length;
      if (watashi && J2.profile !== 'essay') add('first-person', 'info', '「私」が ' + watashi + ' 回（レポート・論文の主語は「本稿」「筆者」。編集後記：法学の論文に「ワタシ」はあまり出てこない）', '', watashi);
      /* 書籍の引用に頁（P10）・判旨の「」（P14）・判批（P15） */
      var books = bodyText.match(/『[^』]{2,60}』(?:（[^）]{0,60}）)?[^。\n]{0,70}/g) || [];
      if (books.length >= 3) { var withPage = books.filter(function (b) { return /[0-9０-９]+\s*頁/.test(b); }).length, pr2 = withPage / books.length;
        stats.bookPages = { books: books.length, withPage: withPage };
        if (pr2 < 0.7 && J2.profile === 'paper') sig('book-page');
        if (pr2 < 0.7) add('book-page', J2.profile === 'paper' ? 'warn' : 'info', '『書名』の引用に頁があるのは ' + Math.round(pr2 * 100) + '%（人の論文は 71〜86%、AI は 0〜30%。頁の無い引用は V3 でない印）', '', books.length - withPage); }
      if (J2.profile === 'paper' && /最[大判決]|[地高]判|判旨|判決/.test(bodyText)) {
        var longQ = (prose.match(/「[^」]{30,}」/g) || []).length;
        if (!longQ && !seg.quoteLines) add('quote-none', 'info', '判例を扱うのに 30 字以上の「」引用も引用段落も無い（人は判旨を「」で原文のまま引き、省略は「……」。要約だけの判旨は原文と違いうる）', '', 0);
        if (!/判批|判解|評釈/.test(prose)) add('hanpi-none', 'info', '判例評釈（判批）を引いていない（判例を扱う人の論文 24／44 が引く。AI は 0／18）', '', 0);
      }
      stats.machineSignals = jaSig.slice();
      if (J2.profile === 'paper' && jaSig.length >= 2) add('ja-machine-signals', jaSig.length >= 3 ? 'error' : 'warn', '論文の型で AI の文に多い目印が ' + jaSig.length + ' つ当たった（' + jaSig.join('・') + '）。人の法律論文はどの目印も文書の 1 割前後にしか当たらない。3 つ以上なら書き直す（判定ではなく直す候補）', '', jaSig.length);
    } else {
      var E2 = th.en, ER2 = EN_RULES[E2.rules], strict2 = E2.rules === 'grad', W2 = function (hard) { return strict2 ? hard : 'info'; };
      var pw = Math.max(0.3, proseWords / 1000), noq = bodyText.replace(/[“"][^”"]{1,400}[”"]/g, ' ');
      var hedgeEn = (noq.match(EN_HEDGE) || []).length, hedgePer = hedgeEn / pw;
      stats.hedge = { count: hedgeEn, per1000: +hedgePer.toFixed(2) };
      if (proseWords >= 300 && E2.hedgeMin != null && (hedgePer < E2.hedgeMin || hedgePer > E2.hedgeMax)) add('en-hedge', W2('warn'), 'Core hedges (may, might, suggest, likely ...) at ' + hedgePer.toFixed(1) + ' per 1,000 words (this level: ' + E2.hedgeMin + ' to ' + E2.hedgeMax + '; strong writing 3 to 12). Match the strength of each claim to its evidence', '', hedgeEn);
      sents.forEach(function (s, i) {
        var hs = (s.s.replace(/[“"][^”"]{1,400}[”"]/g, ' ').match(EN_HEDGE) || []).length;
        if (hs >= 3) add('en-hedge-stack', W2('warn'), 'Three or more hedges in one sentence', s.s, hs);
        if (EN_BOOST.test(s.s) && !EN_CITE.test(s.s) && !/\d/.test(s.s) && !(i > 0 && (EN_CITE.test(sents[i - 1].s) || /\d/.test(sents[i - 1].s)))) add('en-booster-unsupported', W2('warn'), 'A booster (clearly, obviously, undoubtedly, prove) without a citation or number in this or the previous sentence', s.s);
        if (EN_VAGUE.test(s.s) && !EN_CITE.test(s.s)) add('en-vague-attribution', W2('error'), 'Unattributed generalisation ("many scholars", "studies show") without a citation in the same sentence', s.s);
        if (EN_COUNTER_LABEL.test(s.s)) add('en-counter-label', W2('warn'), '"Counterargument" used as the name of a move; state the objection itself ("One might object that ...") and answer it', s.s);
        if (EN_INCONCL.test(s.s)) add('en-in-conclusion', W2('error'), 'Sentence opens with "In conclusion" / "In summary" (absent from strong published writing)', s.s);
        if (EN_PTAIL.test(s.s)) stats._ptail = (stats._ptail || 0) + 1;
      });
      /* 序論：主張の文・目的だけ・第 1 文の広い一般化（R1〜R3） */
      var introN = Math.min(paras.length, Math.max(4, Math.min(10, Math.ceil(paras.length * 0.15)))), introLines = paras.slice(0, introN).map(function (p) { return lines[p.line]; }).join('\n');
      if (paras.length >= 3) {
        if (EN_THESIS.test(introLines)) stats.thesis = 'claim';
        else if (EN_PURPOSE.test(introLines)) { stats.thesis = 'purpose'; add('en-thesis-purpose-only', W2('error'), 'The introduction states a purpose ("this paper explores ...") but no claim; say what you argue in one sentence with a claim verb (I argue, this Article shows)', '', 1); }
        else { stats.thesis = 'none'; add('en-thesis', W2('error'), 'No thesis sentence with a claim verb in the first ' + introN + ' paragraphs (strong writing: 63%, undergraduates: 35%)', '', 0); }
        if (sents.length && EN_GENERIC.test(sents[0].s)) add('en-generic-opening', 'warn', 'The first sentence opens with a broad generalisation or a dictionary definition; open with a concrete case or the received view', sents[0].s);
      }
      /* 反論（R14）：印と切り返し */
      var ctrN = 0;
      sents.forEach(function (s, i) { if (EN_COUNTER.test(s.s)) { var win = sents.slice(i, i + 3).map(function (x) { return x.s; }).join(' '); if (EN_TURN.test(win)) ctrN++; } });
      stats.counterMoves = ctrN;
      if (proseWords >= 800 && ctrN < (strict2 ? 2 : 1)) add('en-counter', 'warn', 'Only ' + ctrN + ' objection stated and answered ("One might object ... But ..."); this level wants at least ' + (strict2 ? 2 : 1), '', ctrN);
      /* つなぎの語（R8） */
      var howAll = (noq.match(/\bhowever\b/gi) || []).length, howInit = sents.filter(function (s) { return /^however\b/i.test(s.s); }).length;
      var butInit = sents.filter(function (s) { return /^(?:but|yet)\b/i.test(s.s); }).length;
      if (howAll >= 5 && howInit / howAll > ER2.howeverInitial) add('en-however-initial', W2('warn'), Math.round(howInit / howAll * 100) + '% of "however" sit at the start of the sentence (strong writers about 55%; GPT-4o 84%). Move some mid-sentence after the subject', '', howInit);
      if (proseWords >= 2000 && butInit === 0 && howInit >= 3) add('en-but-initial', 'info', 'No sentence starts with "But" or "Yet" while "However," opens ' + howInit + '; strong writers start 2 to 3 sentences in 100 with But', '', howInit);
      var more = (noq.match(/\b(?:moreover|furthermore|additionally)\b/gi) || []).length, moreRun = 0;
      for (var mi = 1; mi < sents.length; mi++) if (EN_MOREOVER.test(sents[mi].s) && EN_MOREOVER.test(sents[mi - 1].s)) moreRun++;
      if (more >= 3 && more / pw > ER2.moreover) add('en-moreover', W2('warn'), '"Moreover / furthermore / additionally" at ' + (more / pw).toFixed(1) + ' per 1,000 words (strong writing 0.3; GPT-4o 2.9)', '', more);
      if (moreRun) add('en-moreover', 'warn', 'Two consecutive sentences start with moreover / furthermore / additionally', '', moreRun);
      /* 結論の言い直し（R15） */
      if (paras.length >= 4) {
        var cw = function (t) { var o = {}; (t.toLowerCase().match(/[a-z]{5,}/g) || []).forEach(function (w) { o[w] = 1; }); return o; };
        var A = cw(paras.slice(0, 2).map(function (p) { return lines[p.line]; }).join(' ')), B = cw(lines[paras[paras.length - 1].line]);
        var inter = Object.keys(A).filter(function (k) { return B[k]; }).length, uni = Object.keys(A).length + Object.keys(B).length - inter, jac = uni ? inter / uni : 0;
        stats.restate = +jac.toFixed(2);
        if (jac >= ER2.restate) add('en-restate', W2('warn'), 'The last paragraph repeats the opening (word overlap ' + jac.toFixed(2) + '; strong writing: median 0.07, max 0.28). Restate the claim in new words and say what changes', '', +jac.toFixed(2));
      }
      /* 語（R20・§5.4） */
      var a1 = noq.match(EN_AI1) || [], a2 = noq.match(EN_AI2) || [], a3 = noq.match(EN_AI3) || [];
      var a2c = {}; a2.forEach(function (w) { var k = w.toLowerCase(); a2c[k] = (a2c[k] || 0) + 1; }); var a2rep = Object.keys(a2c).filter(function (k) { return a2c[k] >= 2; });
      stats.aiWords = { tier1: a1.length, tier2: a2.length, tier3: a3.length, tier3per1000: +(a3.length / pw).toFixed(1) };
      if (a1.length) add('en-ai-words-1', W2('error'), 'Machine vocabulary (tier 1: ' + a1.slice(0, 5).join(', ') + (a1.length > 5 ? ' ...' : '') + '). Replace with plain, specific words', a1[0], a1.length);
      if (a2rep.length) add('en-ai-words-2', W2('warn'), 'Tier-2 words used more than once (' + a2rep.join(', ') + '); at most once per document', a2rep[0], a2rep.length);
      if (proseWords >= 500 && a3.length >= 3 && a3.length / pw > ER2.aiWords3) add('en-ai-words-3', W2('warn'), 'Tier-3 words (crucial, insights, landscape, enhance, robust, ultimately, moreover ...) at ' + (a3.length / pw).toFixed(1) + ' per 1,000 words (strong writing: median 2.1, 95th percentile 5.7)', '', a3.length);
      /* 構文（R18・R19・R24） */
      var ptail = stats._ptail || 0; delete stats._ptail;
      if (ptail >= 2 && ptail / pw > ER2.ptail) add('en-ptail', 'warn', 'Sentence-final participial tails (", highlighting ...", ", reflecting ...") at ' + (ptail / pw).toFixed(1) + ' per 1,000 words (strong writing 0.3; GPT-4o 4.5). Put the interpretation in a sentence with a subject', '', ptail);
      var notOnly = (noq.match(/\bnot only\b[^.;]{0,120}\bbut\b/gi) || []).length;
      if (notOnly >= 2 && notOnly / pw > ER2.notOnly) add('en-notonly', W2('warn'), '"not only ... but" ' + notOnly + ' times (at most one per 2,000 words)', '', notOnly);
      var nxby = (noq.match(/\bnot (?:a |an |the |simply |merely |just )?[\w-]+(?: [\w-]+){0,4},? but (?:rather |also )?/gi) || []).length + (noq.match(/, not (?:a |an |the )?[\w-]+[.,;]/gi) || []).length;
      if (nxby >= 3 && nxby / pw > ER2.notXbutY) add('en-not-x-but-y', W2('warn'), '"not X but Y" contrasts at ' + (nxby / pw).toFixed(1) + ' per 1,000 words (strong writing 0.56; GPT-4o 2.1)', '', nxby);
      var triad = (noq.match(/\b[\w-]+, [\w-]+,? and [\w-]+\b/g) || []).length;
      if (triad >= 4 && triad / pw > ER2.triad) add('en-triad', 'info', 'Triplets ("A, B, and C") at ' + (triad / pw).toFixed(1) + ' per 1,000 words (strong writing 3.9; undergraduates and GPT-4o more). Keep only triplets whose three items each have content', '', triad);
      var letters = (noq.match(/[A-Za-z]+/g) || []), wl = letters.length ? letters.join('').length / letters.length : 0;
      stats.wordLen = +wl.toFixed(2);
      if (letters.length >= 300 && wl > ER2.wordLen) add('en-wordlen', W2('warn'), 'Mean word length ' + wl.toFixed(2) + ' letters (strong writing 5.2; GPT-4o 6.4). Prefer plain words', '', +wl.toFixed(2));
      var em = (prose.match(/—|–| -- /g) || []).length;
      if (em >= 5 && em / pw > ER2.emdash) add('en-emdash', 'info', 'Em dashes at ' + (em / pw).toFixed(1) + ' per 1,000 words (strong writing about 3, 95th percentile 6.5)', '', em);
      var pas = sents.filter(function (s) { return EN_PASSIVE.test(s.s); }).length, pasR = ratio(pas, sents.length);
      stats.passive = { sentences: pas, ratio: r3(pasR), note: 'approximate (regular past participles only)' };
      if (sents.length >= 20 && pasR > ER2.passive) add('en-passive', 'info', Math.round(pasR * 100) + '% of sentences look passive (approximate; strong writing 21%, 95th percentile 35%). Use the active voice where the actor is the point', '', pas);
      var hd = headIdx.length / pw; stats.headings = { n: headIdx.length, per1000: +hd.toFixed(2) };
      if (proseWords >= 800 && hd > ER2.headings) add('en-headings', 'warn', 'Headings at ' + hd.toFixed(2) + ' per 1,000 words (strong writing 1.1 to 1.4; Claude drafts 3.5 to 3.8). Argue in paragraphs; at most one or two headings per 1,000 words', '', headIdx.length);
      var rth = (noq.match(/\brather than\b/gi) || []).length;
      if (rth >= 3 && rth / pw > ER2.ratherThan) add('en-rather-than', W2('warn'), '"rather than" at ' + (rth / pw).toFixed(1) + ' per 1,000 words (strong writing 0.5; Claude 1.3 to 1.4)', '', rth);
      var nn = (noq.match(/\bneither\b[^.;]{0,80}\bnor\b/gi) || []).length;
      if (nn >= 2 && nn / pw > ER2.neitherNor) add('en-neither-nor', 'info', '"neither ... nor" at ' + (nn / pw).toFixed(1) + ' per 1,000 words (strong writing 0.08; Claude 0.17 to 0.27)', '', nn);
      var refr = 0; for (var ri = 1; ri < sents.length; ri++) if (/\b(?:is|are|was|were)\s+not\b/i.test(sents[ri - 1].s) && /^(?:It|This|That)\s+(?:is|was)\b/.test(sents[ri].s)) refr++;
      if (refr >= 2 && refr / pw > ER2.reframe) add('en-reframe', W2('warn'), 'Reframing pairs ("... is not X. It is Y.") at ' + (refr / pw).toFixed(1) + ' per 1,000 words (strong writing 0.07; Claude Opus 0.6)', '', refr);
      var enumN = sents.filter(function (s) { return EN_ENUM.test(s.s); }).length;
      if (enumN >= 3 && enumN / pw > ER2.enumeration) add('en-enumeration', 'info', 'Sentence-initial First / Second / Third / Finally at ' + (enumN / pw).toFixed(1) + ' per 1,000 words (strong writing 0.9; Claude 1.4). Split into paragraphs with topic sentences instead of counting points', '', enumN);
      if (bullets) add('en-bullets', W2('warn'), bullets + ' bullet lines in the body; argue in paragraphs', '', bullets);
      var qShare = ratio((prose.match(/[“"][^”"]{1,400}[”"]/g) || []).join(' ').split(/\s+/).filter(Boolean).length, Math.max(1, proseWords));
      stats.quoteShare = r3(qShare);
      if (qShare > ER2.quoteShare) add('en-quote-share', 'warn', 'Quoted words are ' + Math.round(qShare * 100) + '% of the text (strong writing 5%, 95th percentile 17%). Paraphrase and quote only the phrase that is itself the point', '', +qShare.toFixed(2));
      /* 500 語の窓の合成（§7.2：7 つの印。3 つ以上で warn・2 つで info）。Claude の下書きには効かないので、文書単位の 6 つの印（C1〜C6）を別に数える */
      var win = [], cur = [], curW = 0;
      sents.forEach(function (s) { cur.push(s); curW += s.len; if (curW >= 500) { win.push(cur); cur = []; curW = 0; } });
      if (cur.length && curW >= 250) win.push(cur);
      var S1 = /\b(?:delv(?:e|es|ed|ing)|underscor(?:e|es|ed|ing)|showcas(?:e|es|ed|ing)|intricate(?:ly)?|intricacies|multifaceted|tapestry|testament|pivotal|paramount|realms?|nuanced|foster(?:s|ed|ing)?|harness(?:es|ed|ing)?|navigat(?:e|es|ed|ing)|bolster(?:s|ed|ing)?|garner(?:s|ed|ing)?|unravel(?:s|ed|ing)?|transformative|invaluable|meticulous(?:ly)?|commendable|seamless(?:ly)?|interplay|endeavou?rs?|cornerstone|vibrant|ever-evolving|pave(?:s|d)? the way|in the realm of|a testament to|complex interplay|in conclusion|unveil(?:s|ed|ing)?)\b/gi;
      var winHits = [];
      win.forEach(function (w) {
        var t = w.map(function (s) { return s.s; }).join(' '), wn = Math.max(1, w.reduce(function (u, s) { return u + s.len; }, 0)), k = 1000 / wn, ls = w.map(function (s) { return s.len; });
        var f = 0;
        if ((t.match(S1) || []).length * k >= 4) f++;
        if (sdOf(ls) < 7 && !ls.some(function (x) { return x > 40; })) f++;
        if (w.filter(function (s) { return EN_PTAIL.test(s.s); }).length * k >= 4) f++;
        if (((t.match(/\bnot only\b[^.;]{0,120}\bbut\b/gi) || []).length + (t.match(/\bnot (?:a |an |the )?[\w-]+(?: [\w-]+){0,4},? but (?:rather |also )?/gi) || []).length) * k >= 6) f++;
        if ((t.match(/,\s+\w+ing\b/g) || []).length * k >= 10) f++;
        var lw = t.match(/[A-Za-z]+/g) || []; if (lw.length && lw.join('').length / lw.length >= 6.1) f++;
        if ((t.match(/\b(?:moreover|furthermore|additionally)\b/gi) || []).length * k >= 4) f++;
        winHits.push(f);
      });
      stats.windows = { n: win.length, hits: winHits };
      winHits.forEach(function (f, i) { if (f >= 3) add('en-window-style', 'warn', 'Window ' + (i + 1) + ' of 500 words shows ' + f + ' of 7 machine-style signals (uniform lengths, participial tails, contrast templates, long words, moreover chains, tier-1 words); rewrite the window', win[i][0].s, f); else if (f === 2) add('en-window-style', 'info', 'Window ' + (i + 1) + ' shows 2 of 7 machine-style signals', win[i][0].s, f); });
      var C = [headIdx.length >= 3 && hd > 2.85, shortR > 0.14, rth >= 3 && rth / pw > 1.03, nn >= 2 && nn / pw > 0.42, refr >= 2 && refr / pw > 0.25, enumN >= 3 && enumN / pw > 2.43].filter(Boolean).length;
      stats.claudeSignals = C;
      if (proseWords >= 800 && C >= 2) add('en-claude-signals', 'warn', C + ' of 6 document-level signals typical of Claude drafts (many headings, many short sentences, rather than, neither ... nor, reframing, enumeration); 2 or more hit 17 of 18 Claude drafts and 2 of 89 published texts', '', C);
      stats.endings = { note: 'not counted for English' };
    }

    /* (c) 未確認の印・作業の注記 */
    var marks = raw.match(RE_MARK) || [];
    stats.marks = marks.length;
    if (marks.length) add('marks', 'error', lang === 'ja' ? '未確認の印が ' + marks.length + ' 個残っている（最終版には残さない。確かめて外すか、書かない）' : marks.length + ' unverified marks remain (remove or verify before the final version)', marks[0], marks.length);
    var wn = raw.match(RE_WORKNOTE) || [];
    if (wn.length) add('work-note', 'error', lang === 'ja' ? '作業の注記（本文約○字・記憶に基づく・提出前に確認）が本文に残っている（AI の下書きの印。最終版に残さない）' : 'Working notes ("about N characters", "from memory", "check before submitting") remain in the text', wn[0], wn.length);

    /* (d) 構成 */
    var headText = heads.join('\n');
    var countFam = function (fam) { return HEADS[fam].map(function (re) { return re.test(headText) ? 1 : 0; }); };
    var fam = { imrad: countFam('imrad'), law: countFam('law'), hum: countFam('hum'), three: countFam('three') };
    var sumF = function (a) { return a.reduce(function (u, v) { return u + v; }, 0); };
    var field = (opts.field && /^(imrad|law|hum)$/.test(opts.field)) ? opts.field : (sumF(fam.law) >= 3 ? 'law' : ((fam.imrad[1] && fam.imrad[2]) ? 'imrad' : (sumF(fam.hum) >= sumF(fam.imrad) ? 'hum' : 'imrad')));
    var has = { abstract: HEADS.abstract.test(headText), keywords: HEADS.keywords.test(headText), references: HEADS.references.test(headText) || rows.length > 0, limitations: HEADS.limitations.test(headText) || /限界(?:が|は|として)|\blimitations? (?:of|include)/i.test(prose), qa: HEADS.qa.test(headText) || /想定問答/.test(prose), method: HEADS.method.test(headText) };
    stats.structure = { headings: heads.length, field: field, matched: field === 'imrad' ? sumF(fam.imrad) : field === 'law' ? sumF(fam.law) : sumF(fam.hum), three: sumF(fam.three), has: has };
    var sev;
    if (th.structure === 'three') {
      if (!(fam.three[0] && fam.three[2]) && heads.length < 2) add('structure', 'warn', lang === 'ja' ? '序論・本論・結論の見出しが見当たらない（章に通し番号）' : 'No introduction / conclusion headings found', '', heads.length);
    } else {
      var need = field === 'imrad' ? 4 : 3, got = stats.structure.matched;
      sev = th.structure === 'strict' ? 'error' : (got >= 2 ? 'warn' : 'error');
      if (got < need) add('structure', sev, lang === 'ja' ? '分野の標準構成（' + field + '）の見出しが ' + got + '/' + need + ' しか見つからない' : 'Only ' + got + '/' + need + ' of the standard headings for ' + field + ' found', '', got);
      if (th.structure === 'strict') {
        if (!has.abstract) add('abstract', 'error', lang === 'ja' ? '要旨（抄録）が無い' : 'No abstract', '');
        if (!has.references) add('references', 'error', lang === 'ja' ? '参考文献の節か台帳が無い' : 'No reference list or ledger', '');
        if (!has.keywords) add('keywords', 'info', lang === 'ja' ? 'キーワードが無い（投稿先が求めるとき）' : 'No keywords (if the venue requires them)', '');
      }
    }
    if (th.outline !== 'none' && !RE_OUTLINE.test(lines.slice(0, 40).join('\n'))) add('outline', th.outline, lang === 'ja' ? '冒頭に構成（「構成」の見出しか、本稿では…の順で）を示す文が無い' : 'No statement of the structure near the start', '');
    /* 本文の作業の告白（v2.1）：検索先・検索語・読めなかった資料・書誌だけの確認を本文に書かない（台帳と報告に）。注・参考文献より前の地の文だけを見る。IMRaD の方法の節は検索を書く分野なので info */
    var refStart = -1; seg.kinds.forEach(function (k, i) { if (refStart < 0 && (k === 'heading' || k === 'label') && RE_REFHEAD.test(lines[i])) refStart = i; });
    if (lang === 'ja') {
      var workHits = [];
      sents.forEach(function (s) { if (refStart >= 0 && s.line >= refStart) return; var m = s.s.match(RE_WORKWORD); if (m) workHits.push({ s: s.s, m: m }); });
      stats.workConfession = { n: workHits.length, words: workHits.slice(0, 8).map(function (h) { return h.m[0]; }) };
      if (workHits.length) add('work-confession', (th.ja.profile === 'paper' && field !== 'imrad') ? 'warn' : 'info', '本文に作業の記録（検索先・検索語・読めなかった資料・書誌だけの確認）が ' + workHits.length + ' 文（' + stats.workConfession.words.slice(0, 4).join('・') + '）。日本の法学論文の慣行から浮き、読み手の信頼を下げる。台帳と渡すときの報告に書き、本文の限界の節は論の射程（どこまで言えるか）に限る', workHits[0].s, workHits.length);
    }
    if (th.method && field !== 'law' && !has.method) add('method', 'error', lang === 'ja' ? '方法（資料の集め方・分析の手順）の節が無い' : 'No methods section', '');
    if (th.abstract && !has.abstract && th.structure !== 'strict') add('abstract', 'error', lang === 'ja' ? '冒頭の要旨（結論先出し）が無い' : 'No executive summary', '');

    /* (e) 反論・射程・残る問題・感度・限界・想定問答 */
    var ctr = RE_COUNTER.test(prose), scp = RE_SCOPE.test(prose);
    stats.argument = { counter: ctr, scope: scp, remaining: RE_REMAIN.test(prose), sensitivity: RE_SENS.test(prose), limitations: has.limitations, qa: has.qa };
    if (!ctr) add('counter', th.counter, lang === 'ja' ? '最も強い反論（反対の立場）が見当たらない' : 'No strongest objection found', '');
    if (!scp) add('scope', th.scope, lang === 'ja' ? '射程（どこまで言えてどこから言えないか）が見当たらない' : 'No statement of scope', '');
    if (th.scope === 'error' && !stats.argument.remaining) add('remaining', 'warn', lang === 'ja' ? '「残る問題」（答えられない反論の置き場）が無い' : 'No "remaining problems"', '');
    if (th.sensitivity && !stats.argument.sensitivity) add('sensitivity', 'warn', lang === 'ja' ? '前提が変わったときに結論がどう変わるか（感度）が無い' : 'No sensitivity (what changes if an assumption changes)', '');
    if (th.limitations && !has.limitations) add('limitations', 'error', lang === 'ja' ? '限界（limitations）の節が無い' : 'No limitations section', '');
    if (th.qa && !has.qa) add('qa', 'error', lang === 'ja' ? '想定問答（5 問）が無い' : 'No anticipated questions', '');

    /* (f) 図表：番号の連番・図題・本文からの参照・出典・図題の中の数字（FIG-STUDENT-PORTFOLIOS S22・S24） */
    var figs = { fig: [], tab: [] }, capLines = {};
    lines.forEach(function (l0, i) {
      var l = stripBold(l0).replace(/\*\*/g, '');
      var m = /^(図|表|Figure|Fig\.?|Table)\s*([0-9０-９]+)\b/.exec(l); if (!m) return;
      var kind = /^(図|Fig)/.test(m[1]) ? 'fig' : 'tab', n = parseInt(m[2].replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xfee0); }), 10);
      /* 図題の文（v2.1）：題の後に読み方の文（。で終わる完全な文）があるか。述語の無い断片（「判断の段階は四つ。」）は無いか。括弧の中は見ない */
      var capBody = l.replace(/^(?:図|表|Figure|Fig\.?|Table)\s*[0-9０-９]+[\s　.．:：]*/, '').replace(/[（(][^（）()]*[）)]/g, '');
      var segs = capBody.split(/[。．]/).map(function (s) { return s.trim(); }).filter(Boolean), reading = segs.slice(1);
      var frags = lang === 'ja' ? reading.filter(function (s) { return !RE_CAP_SOURCE.test(s) && (RE_COUNTER_END.test(s) || (cpLen(s) <= 8 && !RE_PREDICATE_END.test(s))); }) : [];
      figs[kind].push({ n: n, line: i, caption: l, source: /出典|出所|より作成|による|筆者|source|based on|adapted from|author/i.test(l), number: /[0-9０-９]/.test(l.replace(/^(図|表|Figure|Fig\.?|Table)\s*[0-9０-９]+/, '')), reading: reading.length, frags: frags }); capLines[i] = 1;
    });
    var body2 = lines.filter(function (l, i) { return !capLines[i]; }).join('\n');
    var figStat = {};
    ['fig', 'tab'].forEach(function (kind) {
      var list = figs[kind], label = kind === 'fig' ? (lang === 'ja' ? '図' : 'Figure') : (lang === 'ja' ? '表' : 'Table');
      var nums = list.map(function (f) { return f.n; }), seq = nums.every(function (n, i) { return n === i + 1; });
      var refRe = kind === 'fig' ? /(?:図|Figure|Fig\.?)\s*([0-9０-９]+)/g : /(?:表|Table)\s*([0-9０-９]+)/g, refs = {}, m2;
      while ((m2 = refRe.exec(body2))) refs[parseInt(m2[1].replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xfee0); }), 10)] = 1;
      var unref = list.filter(function (f) { return !refs[f.n]; }), noCap = Object.keys(refs).map(Number).filter(function (n) { return nums.indexOf(n) < 0; });
      figStat[kind] = { n: list.length, sequential: seq, unreferenced: unref.map(function (f) { return f.n; }), referencedWithoutCaption: noCap, withoutSource: list.filter(function (f) { return !f.source; }).length, withoutNumber: list.filter(function (f) { return !f.number; }).length };
      if (list.length && !seq) add('figure-number', th.fig, label + (lang === 'ja' ? ' の番号が 1 からの連番でない：' : ' numbers are not consecutive from 1: ') + nums.join(','), '', list.length);
      if (unref.length) add('figure-ref', th.fig, label + (lang === 'ja' ? ' が本文から参照されていない：' : ' not referenced in the text: ') + unref.map(function (f) { return f.n; }).join(','), unref[0].caption, unref.length);
      if (noCap.length) add('figure-caption', th.fig, label + (lang === 'ja' ? ' の参照はあるが図題（図 N …）が無い：' : ' referenced but no caption line: ') + noCap.join(','), '', noCap.length);
      if (lv.order >= 3 && figStat[kind].withoutSource) add('figure-source', 'warn', label + (lang === 'ja' ? ' の図題に出典（出典・筆者作成）が無いものが ' + figStat[kind].withoutSource + ' 件' : ': ' + figStat[kind].withoutSource + ' captions without a source'), '', figStat[kind].withoutSource);
      if (kind === 'fig' && list.length && figStat[kind].withoutNumber === list.length && list.length >= 2) add('figure-caption-number', 'info', lang === 'ja' ? '図題に具体の数字（期間・件数・しきい値・単位）が 1 つも無い（優秀作の図題の 63% に数字）' : 'No caption contains a concrete number (63% of strong student captions do)', '', list.length);
      if (kind === 'fig') {
        var noRead = list.filter(function (f) { return !f.reading; }), fr = list.filter(function (f) { return f.frags.length; });
        figStat[kind].withoutReading = noRead.length; figStat[kind].fragments = fr.reduce(function (u, f) { return u + f.frags.length; }, 0);
        if (noRead.length) add('figure-caption-reading', lv.order >= 3 ? 'warn' : 'info', lang === 'ja' ? '図題に読み方の文が無い（題と出典だけ）：図 ' + noRead.map(function (f) { return f.n; }).join(',') + '（「図 N　題。実線は〜、赤は〜。出典：〜」の形で、何を示すか＋読み方＋出典を完全な文で）' : 'Caption has no reading sentence (title and source only): Figure ' + noRead.map(function (f) { return f.n; }).join(','), noRead[0].caption, noRead.length);
        if (fr.length) add('figure-caption-fragment', 'info', '図題に述語の無い断片の文（「' + fr[0].frags[0] + '。」）。図題は完全な文で書く', fr[0].caption, figStat[kind].fragments);
      }
    });
    var capNoNum = lines.filter(function (l, i) { return /^図[\s　]/.test(l) && !capLines[i]; }).length;
    if (capNoNum) add('figure-nonumber', 'info', lang === 'ja' ? '番号の無い図題が ' + capNoNum + ' 件（「図 1 …」とし、本文から「図 1 参照」）' : capNoNum + ' captions without a number', '', capNoNum);
    stats.figures = figStat;

    /* (g) 引用台帳と本文での使い方 */
    var L = stats.ledger, n = rows.length;
    if (!n) add('ledger-missing', lv.order >= 5 ? 'error' : 'warn', lang === 'ja' ? '引用台帳（ID | 書誌 | URL | V0〜V3 | 使い方）が本文に無い（別に渡しているなら ledger で渡す。論文・学会の段では必須）' : 'No citation ledger (ID | reference | URL | V0-V3 | use) in the text (pass it as ledger if kept separately; required at paper and conference level)', '');
    else {
      if (L.byV[0]) add('ledger-v0', 'error', lang === 'ja' ? 'V0（記憶のみ）の文献が ' + L.byV[0] + ' 件。V0 は書かない（台帳からも外す）' : L.byV[0] + ' V0 (memory only) rows; never write from V0', '', L.byV[0]);
      if (n < th.ledgerMin) add('ledger-count', lv.order >= 2 ? 'error' : 'warn', lang === 'ja' ? '文献が ' + n + ' 件（この段は ' + th.ledgerMin + ' 件以上）' : n + ' sources (this level wants at least ' + th.ledgerMin + ')', '', n);
      var v1r = L.byV[1] / n, v3r = L.byV[3] / n;
      if (v1r > th.v1Max) add('ledger-v1', 'error', lang === 'ja' ? 'V1（二次資料の要約だけ）が ' + Math.round(v1r * 100) + '%（この段は ' + Math.round(th.v1Max * 100) + '% まで）' : 'V1 rows are ' + Math.round(v1r * 100) + '% (this level allows ' + Math.round(th.v1Max * 100) + '%)', '', L.byV[1]);
      if (th.v3Min > 0 && v3r < th.v3Min) add('ledger-v3', lv.order >= 3 ? 'error' : 'warn', lang === 'ja' ? 'V3（全文を読んだ）が ' + Math.round(v3r * 100) + '%（この段は ' + Math.round(th.v3Min * 100) + '% 以上）' : 'V3 rows are ' + Math.round(v3r * 100) + '% (this level wants ' + Math.round(th.v3Min * 100) + '%)', '', L.byV[3]);
      var coreLow = rows.filter(function (r) { return r.core && r.v < 3; });
      if (coreLow.length) add('ledger-core', th.coreV3, lang === 'ja' ? '【中心】の文献が V3 でない：' + coreLow.map(function (r) { return r.id + '(V' + r.v + ')'; }).join('・') : 'Core sources below V3: ' + coreLow.map(function (r) { return r.id + '(V' + r.v + ')'; }).join(', '), '', coreLow.length);
      if (th.primaryMin > 0) {
        if (!L.tagged) add('ledger-tags', 'info', lang === 'ja' ? '使い方の欄に【中心】【一次】【査読】の印が無いので、一次資料・査読論文の数（この段は ' + th.primaryMin + ' 件以上）を数えられない' : 'No [core]/[primary]/[peer] tags, so primary and peer-reviewed counts (at least ' + th.primaryMin + ') cannot be checked', '');
        else if (L.primary + L.peer < th.primaryMin) add('ledger-primary', 'error', lang === 'ja' ? '一次資料か査読論文が ' + (L.primary + L.peer) + ' 件（この段は ' + th.primaryMin + ' 件以上）' : (L.primary + L.peer) + ' primary or peer-reviewed sources (at least ' + th.primaryMin + ')', '', L.primary + L.peer);
      }
      if (lv.order >= 5) { var noUrl = rows.filter(function (r) { return r.v >= 2 && !/\S/.test(r.url); }); if (noUrl.length) add('ledger-url', 'warn', lang === 'ja' ? '確認に使った URL（DOI・書誌ページ）が空の行が ' + noUrl.length + ' 件' : noUrl.length + ' rows without a verification URL (DOI or bibliographic page)', '', noUrl.length); }
      /* 要入手（v2.1）：読めなかった有料の重要文献は書かずに【要入手】で渡し、論文・学会の段では報告の冒頭に警告として出す */
      var toget = rows.filter(function (r) { return r.toget; }); stats.ledger.toget = toget.length;
      if (toget.length && lv.order >= 5) add('ledger-toget', 'info', lang === 'ja' ? '要入手の重要文献が ' + toget.length + ' 件（' + toget.map(function (r) { return r.id; }).join('・') + '）。本文には書かず、渡すときの報告の冒頭に「要入手の重要文献が残っている」と出す' : toget.length + ' key works still to obtain (' + toget.map(function (r) { return r.id; }).join(', ') + '); say so at the top of the handover report, not in the text', '', toget.length);
      /* 参考文献に V2（v2.1）：院以上は本文で中身に依拠した文献（V3。V1 は二次資料の側）だけを載せ、書誌だけ見た V2 を並べない（「読んでから出し直せ」になる）。書誌の題（「」『』の中）か先頭 16 字で参考文献の節を探す */
      if (refStart >= 0 && lv.order >= 3) {
        var refText = lines.slice(refStart).join('\n').replace(/\s+/g, ''), inRef = [];
        rows.forEach(function (r) { if (r.v !== 2) return; var km = /[「『]([^」』]{4,40})[」』]/.exec(r.bib), key = km ? km[1] : r.bib.replace(/\s+/g, '').slice(0, 16); if (key && key.length >= 4 && refText.indexOf(key.replace(/\s+/g, '')) >= 0) inRef.push(r.id); });
        if (inRef.length) add('references-v2', lv.order >= 5 ? 'warn' : 'info', lang === 'ja' ? '参考文献に V2（書誌だけ見た）の文献が ' + inRef.length + ' 件：' + inRef.join('・') + '（読んでいない文献を並べない。参考文献は本文で中身に依拠した V3 と、V1 の二次資料だけ。V2 は台帳と報告に）' : inRef.length + ' V2 rows appear in the reference list: ' + inRef.join(', ') + ' (list only works whose content the text relies on)', '', inRef.length);
      }
      /* 本文での使い方：「」のすぐ後ろに (ID) がある引用は V3 だけ。V1・V2 に頁数を付けない */
      var byId = {}; rows.forEach(function (r) { byId[r.id] = r; });
      var qm, badQ = [], reQ = /「[^」]{2,}」\s*[（(［\[]\s*([A-Za-z0-9][A-Za-z0-9_.\-]{0,23})[^）)］\]]{0,24}[）)］\]]/g;
      while ((qm = reQ.exec(prose))) { var r1 = byId[qm[1]]; if (r1 && r1.v < 3) badQ.push(qm[1] + '(V' + r1.v + ')'); }
      if (badQ.length) add('quote-low-v', 'error', lang === 'ja' ? 'V3 でない文献に「」の引用が付いている：' + badQ.join('・') + '（「」は原文を読んだ V3 だけ）' : 'Verbatim quotes attributed to rows below V3: ' + badQ.join(', '), '', badQ.length);
      var pm2, badP = [], reP = /[（(［\[]\s*([A-Za-z0-9][A-Za-z0-9_.\-]{0,23})\s*[,，、:：]?\s*(?:p\.?|pp\.?|頁|第)?\s*[0-9０-９]{1,4}\s*(?:頁|ページ|頁以下|f\.|ff\.)?\s*[）)］\]]/g;
      while ((pm2 = reP.exec(prose))) { var r2 = byId[pm2[1]]; if (r2 && r2.v < 3 && /頁|p\.|pp\.|ページ/.test(pm2[0])) badP.push(pm2[1] + '(V' + r2.v + ')'); }
      if (badP.length) add('page-low-v', 'warn', lang === 'ja' ? 'V3 でない文献に頁数が付いている：' + badP.join('・') + '（頁数は V3 か、利用者が貼った資料にあるときだけ）' : 'Page numbers attached to rows below V3: ' + badP.join(', '), '', badP.length);
    }

    /* (h) 分量（目安・info だけ） */
    if (stats.chars && lang === 'ja') { if (stats.chars < th.chars[0]) add('length', 'info', '本文 ' + stats.chars + ' 字（この段の目安 ' + th.chars[0] + '〜' + th.chars[1] + ' 字。課題の指定が優先）', '', stats.chars); else if (stats.chars > th.chars[1] * 1.5) add('length', 'info', '本文 ' + stats.chars + ' 字（この段の目安 ' + th.chars[0] + '〜' + th.chars[1] + ' 字の 1.5 倍を超える。課題の指定が優先。判例研究のレジュメは 12,000〜15,000 字）', '', stats.chars); }

    var order = { error: 0, warn: 1, info: 2 };
    findings.sort(function (a, b) { return order[a.severity] - order[b.severity]; });
    var nE = findings.filter(function (f) { return f.severity === 'error'; }).length, nW = findings.filter(function (f) { return f.severity === 'warn'; }).length;
    return { level: lv.id, level_name: lv.name, lang: lang, field: field, profile: stats.profile, pass: nE === 0, errors: nE, warnings: nW, score: Math.max(0, 100 - nE * 15 - nW * 5),
      findings: findings, stats: stats, level_table: th,
      note: lang === 'ja' ? '機械の候補（誤検知あり）。内容の正しさ・引用の実在・数値の再計算は判定しない。人の文を「AI が書いた」と判定する道具ではない' : 'Machine findings (false positives possible). Correctness, existence of sources and arithmetic are not checked. Not a detector of machine authorship' };
  }

  var api = { LEVELS: LEVELS, EN_RULES: EN_RULES, PROFILES: { essay: JA_ESSAY, resume: JA_RESUME, paper: JA_PAPER }, DEFAULT_LEVEL: DEFAULT_LEVEL, SEV: SEV, STRUCT: STRUCT, levelOf: levelOf, checkReport: checkReport, parseLedger: parseLedger, detectLang: detectLang, endingOf: endingOf, segment: segment, splitEn: splitEn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GnotoReportCheck = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
