import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLAYER_PROFILES: Record<string, string> = {
  "ロジャー・フェデラー": "フォアハンド：セミウエスタン、フラット系、打点は高め・前方、フォロースルーは肩より上。バックハンド：片手打ち。特徴：全身のキネティックチェーンが完璧、骨盤の回転を最大活用。",
  "ノバク・ジョコビッチ": "フォアハンド：セミウエスタン〜ウエスタン、強烈なトップスピン。バックハンド：両手打ち、体幹の回転でパワー。特徴：柔軟性が異常に高く低いボールへの対応が世界一、骨盤を深く沈めてから回転。",
  "ラファエル・ナダル": "フォアハンド：ウエスタン、強烈なトップスピン、フォロースルーは頭の上まで。バックハンド：両手打ち。特徴：左利き特有の角度、骨盤を大きく前傾させ腰の回転でトップスピンを生み出す。",
  "アンディ・マレー": "フォアハンド：イースタン〜セミウエスタン、安定性重視。バックハンド：両手打ち、リターンが優秀。特徴：カウンターパンチャー、体幹でショットの方向を制御。",
  "ヤニック・シナー": "フォアハンド：セミウエスタン、フラット系高速ショット、打点は前方・高め。バックハンド：両手打ち、コンパクトなテイクバック。特徴：コンパクトなスイングから瞬時に骨盤を回転、爆発的な加速。",
  "カルロス・アルカラス": "フォアハンド：セミウエスタン〜ウエスタン、トップスピンとフラットを高速で打ち分け。バックハンド：両手打ち。特徴：全身バネのように使い骨盤の回転が非常に大きい、爆発的パワー。",
  "錦織 圭": "フォアハンド：セミウエスタン、高い打点からのトップスピン、エアKが代名詞。バックハンド：両手打ち。特徴：柔軟性を活かした低い体勢からの強打、ジャンプしながら骨盤を回転。",
  "大坂なおみ": "フォアハンド：ウエスタン寄り、フラット系強力ショット、打点は前方・高め。バックハンド：両手打ち、非常にパワフル。特徴：サーブとフォアの攻撃力が世界最高クラス、上半身と下半身の回転が完璧に同期。",
  "アリナ・サバレンカ": "フォアハンド：セミウエスタン〜ウエスタン、230km/h超のフラット強打。バックハンド：両手打ち。特徴：攻撃的なベースラインプレー、全身の筋力を最大限に活用。",
  "イガ・シフォンティク": "フォアハンド：セミウエスタン、強烈なトップスピン。バックハンド：両手打ち。特徴：クレーコートで圧倒的強さ、骨盤を大きく前傾させトップスピンを生み出す。",
  "エレーナ・リバキナ": "フォアハンド：セミウエスタン、フラット系、長身を活かした高い打点。バックハンド：両手打ち、コンパクトなテイクバック。特徴：長身(182cm)を活かした攻撃的なサーブ、体重移動でパワーを生み出す。",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // 利用回数の制限（無料: 累計3回 / Premium: 月30回）
    const FREE_LIMIT = 3;
    const PREMIUM_MONTHLY_LIMIT = 30;
    // 無制限のデモ/オーナーアカウント（全機能を回数無制限で利用可）
    const DEMO_EMAILS = ["i.tatsuya8768@gmail.com"];
    const isUnlimited = !!user.email && DEMO_EMAILS.includes(user.email.toLowerCase());
    let isPremium = false;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_premium")
        .eq("id", user.id)
        .maybeSingle();
      isPremium = !!prof?.is_premium;
    } catch {}
    if (!isUnlimited && !isPremium) {
      const { count } = await supabase
        .from("diagnoses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);
      if ((count ?? 0) >= FREE_LIMIT) {
        return NextResponse.json(
          {
            error: `無料診断は${FREE_LIMIT}回までです。続けるにはPremiumプランにご登録ください。`,
            code: "FREE_LIMIT_REACHED",
          },
          { status: 402 }
        );
      }
    } else if (!isUnlimited) {
      // Premium: 月間上限（カレンダー月・UTC基準）
      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      ).toISOString();
      const { count } = await supabase
        .from("diagnoses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", monthStart);
      if ((count ?? 0) >= PREMIUM_MONTHLY_LIMIT) {
        return NextResponse.json(
          {
            error: `今月の診断回数が上限（${PREMIUM_MONTHLY_LIMIT}回/月）に達しました。来月1日にリセットされます。`,
            code: "MONTHLY_LIMIT_REACHED",
          },
          { status: 402 }
        );
      }
    }

    const body = await req.json();
    const profile = body.profile;
    const poseMetrics = body.poseMetrics ?? null;
    const comparePlayer: string | null = body.comparePlayer ?? null;
    const shotCategory: string | null = body.shotCategory ?? null;
    const shotType: string | null = body.shotType ?? null;
    const frames: string[] = Array.isArray(body.frames)
      ? body.frames.filter((f: unknown) => typeof f === "string" && f.length > 100)
      : [];
    const grips: { label: string; data: string }[] = Array.isArray(body.grips)
      ? body.grips.filter((g: any) => g && typeof g.data === "string" && g.data.length > 100)
      : [];

    const hasPain = profile.painAreas.length > 0;

    const painDesc = hasPain
      ? profile.painAreas.map((a: string) =>
          `${a}（${["","軽い違和感","やや痛む","かなり痛む","激しい痛み"][profile.painLevels[a] ?? 2]}）`
        ).join("、")
      : "なし";

    const poseDesc = poseMetrics
      ? `【骨格解析実測値】右肘:${poseMetrics.rightElbowAngle}° 左肘:${poseMetrics.leftElbowAngle}° 右膝:${poseMetrics.rightKneeAngle}°`
      : "【骨格データ】なし";

    const compareSection = comparePlayer && PLAYER_PROFILES[comparePlayer]
      ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n【比較対象：${comparePlayer}】\n${PLAYER_PROFILES[comparePlayer]}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      : "";

    const shotSection = shotCategory
      ? `\n【診断対象ショット】\n✅ ${shotCategory}（${shotType ?? "球種未選択"}）\nこのショットに特化して診断してください。例：フォアハンドストロークのトップスピンなら体幹回転・打点前方・フォロースルー完成度を重点評価。ボレーなら面の安定・足の踏み込み・コンパクトなスイングを重点評価。サーブならトス・トロフィーポジション・プロネーションを重点評価。\n`
      : "\n【診断対象ショット】⚠️ 未選択（動画から判断してください）\n";

    const gripSection = grips.length > 0
      ? `\n【グリップ写真】\nグリップ（握り方）の写真が添付されています（${grips.map((g) => g.label).join("、")}）。写真から握り方（イースタン／セミウエスタン／ウエスタン／コンチネンタル等）を推定し、診断対象ショットに適したグリップかどうかを評価に反映してください。\n`
      : "";

    const compareInstruction = comparePlayer
      ? `各診断項目の末尾に「📊 ${comparePlayer}との比較：違い・取り入れるべき点・習得難易度(易/中/難)」を1〜2文で追加。`
      : "";

    const volleyKnowledge = `
【ボレー診断の専門基準（診断対象がボレーの場合は必ず適用）】
- テイクバックはコンパクトが基本。テイクバック時にラケットが身体より後ろまで引かれているのは明らかな引きすぎであり、確認できたら明確に指摘する。
- 安定の核は「面を作って動かさないこと」：ラケット面を早くセットしたら、その面をインパクトまで動かさない（振らない・こねない・止める意識）。無駄なスイングを減らしシンプルなモーションにするほど安定する。グリップは握りすぎず脱力し、インパクトの瞬間だけ安定させる。ボールをキャッチ／受け止めるイメージで当てると面ブレが減る。動画で面がインパクト前後でブレている・余計に振っている・終始力んでいる様子があれば、面を止めるシンプルな打ち方に修正するよう指摘する。
- 「待つ」技術を最重要の土台として評価する：ボレーは打ち急がず、スプリットステップで一旦止まって相手・ボールを見る時間を作り、「どこへ来たかを見てから」動いて捉える。上級者でも打ち急いで早く飛び込みがちなので、動画で打ち急ぎ・突っ込み・ボールを見る前に動き出している様子があれば明確に指摘する。ネットへ詰める場面では「スプリット→細かいフットワークで微調整→ボレー」の順になっているかを見る。
- ボレーのフットワークはストロークのフットワークとは別物として評価する：
  ・先に踏み込みすぎると身体が泳いで「手打ち」になりやすい（重要な注意点）。
  ・強いボールを打つハイボレーは、インパクトと踏み込みのタイミングが一致しているのがベスト。
  ・つなぐローボレー・ミドルボレーは、身体のバランスを崩さないよう軸足でボールを待ってから踏み込む。または、インパクト後に着地する形でもよい。
  ・体重移動でボールをコントロールすることが最重要。
- バックボレー（特に片手）の手首は「使う」のではなく「固定」する。以下を必ずチェックする：
  ・テイクバック〜セットで手首を背屈（手の甲側に折る）させ、ラケット面が打球方向を向いた状態を早く作る。背屈が作れていないと面が逸れてボールを捕まえられない。
  ・インパクトで背屈をキープできているか（手首ロック）。背屈が緩むとラケットヘッドが落ち、下を切る薄い当たりになる。動画でヘッドが落ち手首が伸びていれば指摘する。
  ・手首の角度を保ったまま、肩・背中で腕を動かしているか（手首をこねていないか）。腕とラケットの角度は鋭角に折りすぎず保つ。
  ・コンパクトに引き込んで面を作る一方、下を切りすぎず、インパクト後はラケットを前へ運ぶ。打った後に足が着地する順序での体重移動が理想。
- 「ボールを呼び込む」＝早く手を出してつついて当てに行かず、前の打点までボールを待って引きつけてから捉える。動画で打点が手前すぎる・腕だけ早く伸びて迎えに行っていれば指摘する。
- 力強いインパクトは大きなテイクバックで作らない。テイクバックでエネルギーを作ろうとすると必ずオーバースイングになり打点が後ろにずれ、かえって力が伝わらない。パワーは腕ではなく、胸椎・肩甲骨を軸にした体の回転（遠心力）とボールへまっすぐ踏み込む体重移動から生む。テイクバックが大きい・腕で振っている場合は、コンパクトな準備と体・体重でのインパクトに修正するよう指摘する。
- 上記基準に照らし、動画から観察できるデータ（テイクバック量、踏み込みとインパクトのタイミング、軸足、体重移動、バランス、手首の背屈の有無とキープ）をしっかり捉えてから、根拠を示してアドバイスすること。推測だけで断定しない。`;

    const strokeKnowledge = `
【ストローク診断の専門基準（診断対象がストロークの場合は必ず適用）】
- ラリーミスの最大原因の一つは「ボールに近づきすぎる（詰まる）」こと。多くのプレイヤーは無意識にボールとの距離が近すぎる。
  ・近すぎると体とラケットの間のスペースが消え、スイングが窮屈になって手打ちになる、体の回転（捻り）が使えない、面が安定せずミスが増える。
  ・正しくは、体の前で利き腕を気持ちよく伸ばせるスペースを確保した打点で捉える。
  ・距離はフットワークで合わせる：スプリットステップ→落下点へ早めに先回り→最後は細かいステップで微調整。遠い時に詰めるだけでなく、「近すぎる時は半歩下がって離れる」調整も同じく重要。
- 動画でボールに詰まっている様子（打点が体に近い、肘が窮屈に曲がっている、上体がのけぞる・逃げる、軸がボールから離れる方向に流れる）があれば、距離の取り方とフットワークでの調整を最重要改善点として明確に指摘する。詰まっていなければ「適切な距離で捉えられている」と正直に評価する。
- 距離・打点について断定する際は、動画で実際に体とボール／打点の位置関係が確認できる場合に限る。角度的に確認できない場合は断定せず、その旨を明記する。
- フォアハンド（特にトップスピンを増やしたい場合）のスピン量は、以下で評価する：
  ・スイングは「下から上」の斜め軌道（右利きなら左下→右上）でボールの後ろを擦り上げる。縦方向の角度が大きいほどスピンは増える。フィニッシュが自然に高く（肩〜頭の高さ）上がっているかを見る。
  ・スピンの源は手首のこねではなく「ラケットヘッドのスピード×擦り上げ」。脱力してテイクバックでラケットヘッドがグリップより下に落ちる（ラグ＝しなり）と、そこからヘッドが走って強い回転がかかる。終始力んでヘッドが落ちていない・加速感がない場合は脱力とヘッドの走りを指摘する。
  ・パワーとスピンは手先ではなく脚・体幹の大きな筋肉から。脚で下から上へ押し上げ、腰・上体の回転とスイングが同調しているかを見る。腕だけ・手首だけで擦ろうとしている（手打ち／弱いワイパーで振り回すだけ）と、フレーム気味の薄い回転になりやすいので指摘する。
  ・動画でスイング軌道・フィニッシュの高さ・ヘッドの落ちと加速・下半身の使い方が確認できた範囲で根拠を示して評価する。確認できない要素は断定しない。
- 「効率のいいストローク」（少ない力で安定して強いボール）は、以下で評価する：
  ・運動連鎖：力は下半身→体幹（腰の回転）→腕→ラケットの順に伝える。後ろ足で地面を蹴り、腰・体を回し、後ろ足→前足へ体重移動してボールに体重を乗せる。手や腕だけで打つ「手打ち」は非効率でコントロールも不安定なので、確認できれば指摘する。
  ・早い準備：ボールがバウンドする頃にはテイクバックを作り終えているのが理想。準備が早いほどフォームを整える余裕が生まれ、効率的かつ安定する。動画で準備が遅れて打点が後ろになっていれば指摘する。
  ・脱力：効率の本質は「最小の力で最大のパワー」。終始力むのではなく、インパクトの瞬間だけ力を入れ、それ以外は脱力する。終始力んで動きが硬い・大ぶりで力任せに見える場合は、脱力と運動連鎖での効率化を指摘する。
  ・上記は動画で下半身・体の回転・準備のタイミング・体重移動が確認できた範囲で根拠を示して評価し、確認できない要素は断定しない。
- 強いストロークは体格ではなく技術から生まれる。小柄な選手でもトップ選手は、効率的な体の使い方・運動連鎖・タイミング・脱力によって圧倒的なストロークを打つ。診断ではパワー不足の原因を体格・筋力のせいにして片付けず、テイクバックのタイミング、体の回転、体重移動、脱力、運動連鎖といった技術面から具体的な原因と改善策を示すこと。
- バックハンド（特に両手）は「シンプルで再現性が高い」ことが強さの土台。以下で評価する：
  ・準備はユニットターンで行う。腕でラケットを大きく引かず、脇を軽く締めて体・肩の回転で横向きを作り、テイクバックはコンパクトにする。大きい・腕主導のテイクバックは振り遅れ・タイミングのズレの原因なので指摘する。
  ・両手バックは非利き手（右利きなら左手）が主導。「逆の手のフォアハンド」の感覚で左手で引っ張ると、シンプルで安定し強く打てる。利き手で操作しすぎている様子があれば指摘する。
  ・パワーは股関節のタメ→下半身→体幹の運動連鎖から。両腕とラケットの三角形を保ち、手首の角度は固定する（こねない）。
  ・スイングは縦方向（下から上）でフィニッシュは肩の高さへ。打点は体の前で、フォアよりやや体に近い位置で捉える。
  ・脱力してシンプルなモーションにするほど安定して強くなる。動画で確認できた範囲（準備の大きさ・横向き・左右どちらの手で引いているか・打点・フィニッシュ）で根拠を示して評価し、確認できない要素は断定しない。`;

    const serveKnowledge = `
【サーブ診断の専門基準（診断対象がサーブの場合は必ず適用）】
- グリップはコンチネンタル（包丁握り）が基本。厚い（フォアハンド寄りの）グリップだと面が作れず、プロネーションが使えずスピードもスピンも出ない。動画でグリップが厚そう・面を被せて当てている様子があれば指摘する。
- トスの安定が美しく再現性の高いサーブの土台。ボールは握らず指で支え、肘・手首を曲げずに真っすぐ上げる。トスがブレる・低い・体から離れる/被ると、打点・フォーム全体が崩れる。動画でトスが不安定・打点がばらついていれば最重要級の改善点として指摘する。
- トロフィーポジション：トスを上げながらテイクバックを取り、トス側の足に体重を乗せて沈み込む。肘を下げない（肘が落ちるとパワーと打点が下がる）。
- パワーは運動連鎖とレッグドライブから：膝を曲げて地面を蹴り上げ、腰→肩のラインを入れ替え（肩over肩）、その勢いを腕→ラケットへ伝える。下半身が安定し、地面を使えているかを見る。腕の力だけで打つ「手打ちサーブ」は指摘する。
- ラケットダウン（スイング前にラケットヘッドを背中側に落として溜める）からプロネーション（前腕の回内でラケット面を横→前へ返す）でヘッドを走らせる。プロネーションが使えるとスピードとスピンが出る。脱力してヘッドが走っているか、面を被せて当てに行っていないかを見る。
- 打点は高く、体をしっかり伸ばして（必要に応じてジャンプして）捉える。打点が低い・体が伸びていなければ指摘する。
- 上記は動画で確認できた範囲（グリップ・トスの安定・トロフィーの形・膝の曲げと蹴り・ラケットダウン・打点の高さ）で根拠を示して評価し、確認できない要素は断定しない。`;

    const proKnowledge = `
【世界トップ基準（一切妥協しない精密診断の指針）】
以下は世界トップの選手・指導者が一貫して重視し体現してきた技術原則である。診断対象に該当する原則を必ず照合し、動画から実際に観察できる事実のみを根拠に評価すること。観察できない要素は断定せず「この動画／角度では確認できない」と明記する。憶測で良し悪しを語ってはならない。

■ 脱力とタイミング（ロジャー・フェデラーが体現する原則）
- グリップは打つ直前まで緩め、インパクトの瞬間だけ握る。終始力むとラケットヘッドが走らず面もブレる。動画で前腕・手首が常に緊張して見える、またはスイングが硬く加速感がない場合に限り力みを指摘する。
- 準備は「ユニットターン」で肩・体幹から早く回し、腕だけで引かない。テイクバックが腕主導で遅れている様子が見えれば指摘する。
- インパクトで頭・視線を残す。打つ瞬間に頭が上がる・目線が離れるとミート率と安定性が落ちる。動画で確認できた場合のみ指摘する。

■ コンパクトな面づくり（鈴木貴男が体現するボレー・スライスの原則）
- ボレー／スライスは「振る」のではなく面を作って当てる。ラケットを身体より後ろに引いたら引きすぎ。コンチネンタル系グリップで面を早く作り、コンパクトに合わせる。
- 打点は身体の前。腕で操作せず、脚で面を運ぶ・身体ごと前に出る。手打ちにならないこと。
- 低い球は膝・股関節を曲げ、目線を落として入る。腰高のまま手だけで処理していないかを確認する。

■ フットワークと粘り（マイケル・チャンが体現する原則）
- すべての打球準備はスプリットステップから始まる。相手（ボール）が来る瞬間にスプリットが入っているかを最優先で確認し、入っていなければ最重要改善点として指摘する。
- 最後まで足を動かし、打点に正確に入る。打点が合わない原因の多くは足が止まること。重心を低く保ち、打った後すぐ次のリカバリーへ移る。
- 軸足を決めてから打つ。足が流れた状態・上体だけで打つ形は安定しない。

【判定の鉄則（最重要）】
- 上記原則のうち、動画で実際に確認できた事実のみを根拠とし、「どの場面のどの動作がどうだったか」を具体的に示してからアドバイスする。
- 確認できない要素について良し悪しを断定しない。見えない場合は「この角度／フレームでは確認できない」と正直に書く。
- 褒める時も改善を促す時も、必ず動画内の観察事実を根拠として添える。一切妥協せず、しかし推測で語らないこと。`;

    const textPrompt = `あなたは元プロテニスプレイヤーで25年以上のコーチング経験を持つ世界最高峰のテニスコーチです。
有料コーチングに値する詳細かつ一貫性のある診断を行ってください。

━━━━━━━━━━━━━━━━━━━━━━━━━━
【最重要：プレイヤーの確定情報】
✅ 利き手：${profile.handedness}（確定・変更不可）
✅ フォアハンドストローク：${profile.forehand}${profile.forehandGrip ? `（${profile.forehandGrip}）` : ""}（確定・変更不可）
✅ バックハンドストローク：${profile.backhand}（確定・変更不可）
✅ フォアハンドボレー：${profile.foreVolley ?? "未設定"}（確定・変更不可）
✅ バックハンドボレー：${profile.backVolley ?? "未設定"}（確定・変更不可）
✅ 現在の痛み：${painDesc}（確定・変更不可）
━━━━━━━━━━━━━━━━━━━━━━━━━━
${poseDesc}
${shotSection}
${gripSection}
${compareSection}

【絶対に守るルール】
1. 確定情報（利き手・フォア・バック）を診断中に絶対に覆さない
2. 動画で確認できない動作は「〜の可能性があります」と表現
3. 「動画の中で」「インパクトの瞬間」「テイクバック時」「フォロースルー時」で場面を表現
4. 「画像」「1枚目」「2枚目」は絶対に使わない
5. 打点が後方の場合は肘・肩・手首への負担増加リスクを警告
6. 打点が前方なら「前方で捉えられています」と正直に評価
7. 良い点も必ず1つ以上具体的に褒める
8. 診断対象ショットに特化した評価をする
${compareInstruction}
${volleyKnowledge}
${strokeKnowledge}
${serveKnowledge}
${proKnowledge}

【診断項目】各5〜7文でプロコーチとして有料級の診断をしてください：

1. formAnalysis：体幹・骨盤の使い方、肩の開きのタイミング、テイクバックからフォロースルーの流れ。${shotCategory ? `${shotCategory}（${shotType}）に必要な動作を重点評価。` : ""}★最優先改善点を末尾に記載。

2. impactCheck：動画からインパクトの瞬間を特定し打点の位置（高さ・前後）を正確に評価。ラケット面の角度、振り遅れ・振り急ぎの判定。★最優先改善点を末尾に記載。

3. footwork：足の動き、踏み込みと軸足の安定度、リカバリー。★最優先改善点を末尾に記載。

4. injuryCare：現在の痛みへの対処法、将来的なリスク、推奨ストレッチ・エクササイズを3つ具体的に。★最優先改善点を末尾に記載。

5. scores：以下の基準で算出（同じ動画なら毎回同じスコアになるよう客観的に判断）

【スコア算出基準】
- formScore：体幹・骨盤(30点) + テイクバック〜フォロースルー(30点) + 肩のタイミング(20点) + 安定性(20点)
- footworkScore：スプリットステップ(25点) + 踏み込み・軸足(25点) + 重心移動(25点) + リカバリー(25点)
- swingSpeed：動画から推定(km/h)、推定不可なら100
- impactOffset：前方ならマイナス、後方ならプラス(cm)
- elbowAngle：インパクト時の利き腕肘の角度(度)、推定不可なら130
- injuryRisk：「低」=問題なし / 「中」=軽度問題あり or 打点15cm以上後方 / 「中〜高」=痛みあり or 打点20cm以上後方 / 「高」=重大な問題あり

必ずJSON形式のみで返してください：
{
  "formAnalysis": "...",
  "impactCheck": "...",
  "footwork": "...",
  "injuryCare": "...",
  "scores": {
    "formScore": 0から100の整数,
    "footworkScore": 0から100の整数,
    "swingSpeed": 80から140の整数,
    "impactOffset": プラスなら後方マイナスなら前方のcm整数,
    "elbowAngle": インパクト時の肘の角度,
    "injuryRisk": "低" または "中" または "中〜高" または "高"
  }
}`;

    const contentParts: any[] = frames.slice(0, 12).map((frame) => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: frame },
    }));
    if (grips.length > 0) {
      contentParts.push({ type: "text", text: `以下はグリップ（握り方）の写真です。順番に：${grips.map((g) => g.label).join("、")}` });
      for (const g of grips.slice(0, 7)) {
        contentParts.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: g.data } });
      }
    }
    contentParts.push({ type: "text", text: textPrompt });

    const hasImages = frames.length > 0 || grips.length > 0;
    const messageContent: Anthropic.MessageParam["content"] = hasImages ? contentParts : textPrompt;
    const model = hasImages ? "claude-opus-4-5" : "claude-haiku-4-5-20251001";

    const message = await anthropic.messages.create({
      model,
      max_tokens: 2500,
      temperature: 0, // 出力のブレを最小化（同じ動画なら毎回ほぼ同じスコアにする）
      messages: [{ role: "user", content: messageContent }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";

    let sections = {
      formAnalysis: "",
      impactCheck: "",
      footwork: "",
      injuryCare: "",
    };
    let aiScores = {
      formScore:     60,
      footworkScore: 60,
      swingSpeed:    100,
      impactOffset:  0,
      elbowAngle:    130,
      injuryRisk:    hasPain ? "中" : "低" as string,
    };

    try {
      const clean = rawText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      sections = {
        formAnalysis: parsed.formAnalysis ?? "",
        impactCheck:  parsed.impactCheck  ?? "",
        footwork:     parsed.footwork     ?? "",
        injuryCare:   parsed.injuryCare   ?? "",
      };
      if (parsed.scores) {
        aiScores = {
          formScore:     Number(parsed.scores.formScore)     || aiScores.formScore,
          footworkScore: Number(parsed.scores.footworkScore) || aiScores.footworkScore,
          swingSpeed:    Number(parsed.scores.swingSpeed)    || aiScores.swingSpeed,
          impactOffset:  Number(parsed.scores.impactOffset)  ?? aiScores.impactOffset,
          elbowAngle:    Number(parsed.scores.elbowAngle)    || aiScores.elbowAngle,
          injuryRisk:    parsed.scores.injuryRisk            || aiScores.injuryRisk,
        };
      }
      if (aiScores.impactOffset >= 20 && aiScores.injuryRisk === "低") {
        aiScores.injuryRisk = "中";
      }
    } catch {
      sections = {
        formAnalysis: rawText,
        impactCheck:  "解析完了。",
        footwork:     "フットワーク解析完了。",
        injuryCare:   hasPain
          ? "痛みのある部位への負担を減らすフォーム修正が必要です。"
          : "現在のフォームを継続すると肘・肩への負担が蓄積する可能性があります。",
      };
    }

    const elbowAngle = poseMetrics?.rightElbowAngle || aiScores.elbowAngle;
    const report = {
      formScore:     aiScores.formScore,
      injuryRisk:    aiScores.injuryRisk,
      swingSpeed:    aiScores.swingSpeed,
      elbowAngle,
      footworkScore: aiScores.footworkScore,
      takebackDepth: 0,
      impactOffset:  aiScores.impactOffset,
      sections,
      comparePlayer,
      shotCategory,
      shotType,
    };

    // 動画が正しく読み込め（フレームあり）、かつAIが内容を返した場合のみ記録する＝回数にカウントする。
    // 動画を読み込めない・エラー・空の結果のときはカウントしない。
    const countable = frames.length > 0 && !!sections.formAnalysis && sections.formAnalysis.trim().length > 0;
    if (countable) {
      await supabase.from("diagnoses").insert({
        user_id:       user.id,
        handedness:    profile.handedness,
        forehand:      profile.forehand,
        forehand_grip: profile.forehandGrip ?? null,
        backhand:      profile.backhand,
        pain_areas:    profile.painAreas,
        pain_levels:   profile.painLevels,
        ai_report:     report,
        ai_text:       Object.values(sections).join("\n\n"),
      });
    }

    return NextResponse.json({ report });

  } catch (err) {
    console.error("Analyze error:", err);
    return NextResponse.json({ error: "診断中にエラーが発生しました" }, { status: 500 });
  }
}
