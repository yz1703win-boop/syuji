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
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key VARCHAR(100) NOT NULL UNIQUE,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // デフォルトテンプレートを挿入（存在しない場合のみ）
  await sql`
    INSERT INTO templates (type, content) VALUES
    ('morning', ${DEFAULT_MORNING_TEMPLATE}),
    ('evening', ${DEFAULT_EVENING_TEMPLATE}),
    ('weekly', ${DEFAULT_WEEKLY_TEMPLATE}),
    ('overtime', ${DEFAULT_OVERTIME_TEMPLATE})
    ON CONFLICT (type) DO NOTHING
  `;
}

export async function resetTemplates() {
  const sql = getDb();
  await sql`
    INSERT INTO templates (type, content) VALUES
    ('morning', ${DEFAULT_MORNING_TEMPLATE}),
    ('evening', ${DEFAULT_EVENING_TEMPLATE}),
    ('weekly', ${DEFAULT_WEEKLY_TEMPLATE}),
    ('overtime', ${DEFAULT_OVERTIME_TEMPLATE})
    ON CONFLICT (type) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
  `;
}

export async function saveRefreshToken(token: string) {
  const sql = getDb();
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES ('google_refresh_token', ${token}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function getRefreshToken(): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT value FROM settings WHERE key = 'google_refresh_token' LIMIT 1
  `;
  return rows[0]?.value ?? null;
}

const DEFAULT_MORNING_TEMPLATE = `━━━━━━━━━━━━━━━━━━━━━━━━
{{date}}　始業日報
━━━━━━━━━━━━━━━━━━━━━━━━
おはようございます。
本日の始業日報を提出いたします。
何卒よろしくお願いいたします。
{{goal_url}}`;

const DEFAULT_EVENING_TEMPLATE = `━━━━━━━━━━━━━━━━━━━━━━━━
{{date}}　終業日報
━━━━━━━━━━━━━━━━━━━━━━━━
1　本日の目標
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣
{{goal_url}}

2　本日の結果
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣
{{result_url}}

3　差分・翌日の行動変化
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣
特にございません

4　[事務タスク]未対応業務の再確認
￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣￣
①未完了のタスクはないか ⇒ なし
②未返信のメールはないか ⇒ なし
③本日締切の約束はないか ⇒ なし

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
{{weekend_work_sections}}
▼{{week_range}}タスク別所要時間
{{task_time_section}}

５）目標達成のためにほしい権限

[/info]`;

const DEFAULT_OVERTIME_TEMPLATE = `[To:3393402]藤原直樹(ばび～)

藤原さん、お疲れ様です。
始業前のご連絡失礼します。

本日の残業申請をさせていただきます。

・今月の現残業時間⇒{{current_month_overtime}}
・残業時間⇒{{today_overtime}}
・内容⇒
{{overtime_tasks}}

お手数をおかけし恐れ入りますが、
何卒ご確認をよろしくお願いいたします。`;
