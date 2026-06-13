import Link from "next/link";

export const metadata = { title: "利用規約・プライバシーポリシー | TennisAI" };

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 22px", marginBottom: 16 };
const h2: React.CSSProperties = { fontWeight: 900, fontSize: 18, color: "#0f172a", margin: "0 0 12px" };
const h3: React.CSSProperties = { fontWeight: 800, fontSize: 14, color: "#16a34a", margin: "16px 0 6px" };
const p: React.CSSProperties = { fontSize: 13, color: "#334155", lineHeight: 1.9, margin: "0 0 8px" };
const li: React.CSSProperties = { fontSize: 13, color: "#334155", lineHeight: 1.9 };

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdf4,#f8fafc)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#0f172a" }}>🎾 利用規約・プライバシーポリシー</div>
          <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", textDecoration: "none" }}>← 戻る</Link>
        </div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>最終更新日：2026年6月13日</div>

        {/* 重要な注意 */}
        <div style={{ ...card, border: "2px solid #f59e0b", background: "#fffbeb" }}>
          <div style={{ ...h2, color: "#b45309" }}>⚠️ 重要なご注意（必ずお読みください）</div>
          <p style={p}><strong>1. AIによる推定診断です。</strong> 本サービスの診断結果は、アップロードされた動画から得られる情報のみをもとに、AIが推定したものです。実際のフォームや身体の状態と<strong>相違がある場合があります</strong>。スコアや数値はAIによる推定値であり、正確性・完全性を保証するものではありません。</p>
          <p style={p}><strong>2. 怪我・健康に関する注意。</strong> 診断結果や提案に基づいて練習・トレーニングを行う際、<strong>無理をすると痛みや怪我をする場合があります</strong>。ご自身の体調・体力に合わせ、決して無理をせず行ってください。痛みや違和感がある場合、または持病・既往症がある場合は、必ず医師や専門家にご相談ください。本サービスは医療行為・医学的アドバイスではありません。</p>
          <p style={{ ...p, marginBottom: 0 }}><strong>3. 撮影時の注意。</strong> 動画を撮影する際は、<strong>周りの人や物に十分配慮し、安全に配慮して行ってください</strong>。ラケットの振りやボールによる事故、転倒、衝突などにご注意ください。撮影・プレーは安全な場所で、周囲の安全を確認した上で行ってください。</p>
        </div>

        {/* 利用規約 */}
        <div style={card}>
          <h2 style={h2}>利用規約</h2>

          <h3 style={h3}>第1条（適用）</h3>
          <p style={p}>本規約は、本サービス「TennisAI」（以下「本サービス」）の提供条件および本サービスの運営者（以下「運営者」）と利用者との間の権利義務関係を定めるものです。利用者は、本サービスを利用することで本規約に同意したものとみなされます。</p>

          <h3 style={h3}>第2条（サービス内容）</h3>
          <p style={p}>本サービスは、利用者がアップロードしたテニスのスイング動画をAIが解析し、フォームに関する診断・アドバイスを提供するものです。診断はAIによる推定であり、動画から得られる情報のみを利用しているため、実際と相違がある場合があります。</p>

          <h3 style={h3}>第3条（料金・サブスクリプション）</h3>
          <p style={p}>Premiumプランは月額¥999（税込）で、毎月自動的に更新（継続課金）されます。決済はStripe社を通じて行われます。解約はいつでも可能で、解約後はPremium機能の利用が停止します。日割り返金は行いません（法令で必要な場合を除く）。</p>

          <h3 style={h3}>第4条（禁止事項）</h3>
          <p style={p}>利用者は、法令違反、第三者の権利侵害、虚偽情報の登録、本サービスの不正利用・リバースエンジニアリング、複数人での1アカウント共用その他運営者が不適切と判断する行為を行ってはなりません。</p>

          <h3 style={h3}>第5条（アカウント）</h3>
          <p style={p}>利用者は、自己の責任においてアカウント情報を管理するものとします。</p>

          <h3 style={h3}>第6条（規約の変更）</h3>
          <p style={p}>運営者は、必要に応じて本規約を変更できるものとします。変更後に本サービスを利用した場合、変更後の規約に同意したものとみなされます。</p>

          <h3 style={h3}>第7条（準拠法・裁判管轄）</h3>
          <p style={{ ...p, marginBottom: 0 }}>本規約は日本法に準拠し、本サービスに関して紛争が生じた場合は、運営者の所在地を管轄する裁判所を専属的合意管轄裁判所とします。</p>
        </div>

        {/* プライバシーポリシー */}
        <div style={card}>
          <h2 style={h2}>プライバシーポリシー（個人情報の取扱い）</h2>

          <h3 style={h3}>1. 取得する情報</h3>
          <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
            <li style={li}>アカウント情報：メールアドレス、パスワード（暗号化して保存）</li>
            <li style={li}>診断に関する入力情報：利き手・打ち方・痛みの部位等のプロフィール、診断結果データ</li>
            <li style={li}>動画から抽出した静止画（フレーム画像）：AI解析のために利用します</li>
            <li style={li}>決済情報：Stripe社が処理します。カード番号等は運営者のサーバーには保存されません</li>
            <li style={li}>利用状況に関する情報（アクセスログ等）</li>
          </ul>

          <h3 style={h3}>2. 利用目的</h3>
          <p style={p}>本サービスの提供・AI診断の実施・本人確認・課金処理・お問い合わせ対応・サービス改善のために利用します。</p>

          <h3 style={h3}>3. 外部サービス</h3>
          <p style={p}>本サービスは、サービス提供のため以下の外部サービスを利用しており、必要な範囲で情報が送信されます。各社のプライバシーポリシーが適用されます。</p>
          <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>
            <li style={li}>Supabase（認証・データベース）</li>
            <li style={li}>Anthropic（AIによる動画フレーム解析）</li>
            <li style={li}>Stripe（決済処理）</li>
            <li style={li}>Vercel（ホスティング）</li>
          </ul>
          <p style={p}>法令に基づく場合を除き、ご本人の同意なく上記以外の第三者へ個人情報を提供することはありません。</p>

          <h3 style={h3}>4. 端末内への保存（localStorage）</h3>
          <p style={p}>入力の手間を省くため、診断フォームの入力内容を利用者の端末（ブラウザ）に保存する場合があります。これらはサーバーには送信されません。</p>

          <h3 style={h3}>5. お問い合わせ</h3>
          <p style={{ ...p, marginBottom: 0 }}>個人情報の開示・訂正・削除のご希望、その他お問い合わせは <Link href="/contact" style={{ color: "#16a34a", fontWeight: 800 }}>お問い合わせフォーム</Link> よりご連絡ください。</p>
        </div>

        {/* 運営者情報（最下部） */}
        <div style={card}>
          <h2 style={h2}>運営者情報</h2>
          <p style={{ ...p, marginBottom: 0 }}>運営者氏名：<strong>石川 達也</strong></p>
        </div>

        <div style={{ textAlign: "center", padding: "8px 0 24px" }}>
          <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", textDecoration: "none" }}>← トップに戻る</Link>
        </div>
      </div>
    </div>
  );
}
