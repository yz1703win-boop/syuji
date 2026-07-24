import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getDb(): NeonQueryFunction<false, false> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set");
    }
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}

export default getDb;

export async function initDb() {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      type VARCHAR(20) NOT NULL UNIQUE,
      content TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      report_date DATE NOT NULL,
      week_start DATE,
      content TEXT NOT NULL,
      copied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS reports_type_date_idx
    ON reports (type, report_date)
  `;

  await sql`
    INSERT INTO templates (type, content) VALUES
    ('morning', ${DEFAULT_MORNING_TEMPLATE}),
    ('evening', ${DEFAULT_EVENING_TEMPLATE}),
    ('weekly', ${DEFAULT_WEEKLY_TEMPLATE})
    ON CONFLICT (type) DO NOTHING
  `;
}

const DEFAULT_MORNING_TEMPLATE = `━━━━━━━━━━━━━━━━━━━━━━━━
{{date}}　始業日報
━━━━━━━━━━━━━━━━━━━━━━━━
おはようございます。
本日の始業日報を提出いたします。
何卒よろしくお願いいたします。`;

const DEFAULT_EVENING_TEMPLATE = `━━━━━━━━━━━━━━━━━━━━━━━━
{{date}}　終業日報
━━━━━━━━━━━━━━━━━━━━━━━━
1　本日の目標
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣


2　本日の結果
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣


3　差分・翌日の行動変化
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣
特にございません

4　[事務タスク]未対応業務の再確認
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣
①未完了のタスクはないか ⇒ 
②未返信のメールはないか ⇒ 
③本日締切の約束はないか ⇒ 

5　本日の振り返り、今日の気づき
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣
`;

const DEFAULT_WEEKLY_TEMPLATE = `{{header}}

{{greeting}}
週次タスクを提出させていただきます。
何卒宜しくお願い致します。

[info]１）先週の結果
▼先週の行動変化

{{prev_action_change}}

▼先週のタスク目標

{{prev_week_tasks}}

２）差分
{{diff}}

３）行動変化（不足を埋める○○をします）

{{action_change}}

４）今週の目標

▼タスク目標

〇{{monday_date}}
{{monday_events}}

〇{{tuesday_date}}
{{tuesday_events}}

〇{{wednesday_date}}
{{wednesday_events}}

〇{{thursday_date}}
{{thursday_events}}

〇{{friday_date}}
{{friday_events}}

▼{{week_range}}タスク別所要時間
＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝

（タスクと所要時間を入力してください）

＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝

５）目標達成のためにほしい権限

[/info]`;
