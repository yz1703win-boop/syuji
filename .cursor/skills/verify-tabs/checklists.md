# 4タブ検証チェックリスト

サブエージェントは担当タブの節だけを確認する。根拠にはパスと関数名（または行付近）を付ける。

## morning（始業日報）

関連: `src/components/MainPage.tsx`, `src/lib/schedule.ts`, `src/app/api/schedule/gyazo/route.ts`, `src/lib/db.ts`, `src/lib/template.ts`

| ID | 確認内容 |
|---|---|
| M1 | 日付は `getTodayJST` / `morningDateStr`（前日モード時は -1 日） |
| M2 | テンプレ変数 `buildMorningVars`（`{{date}}` / `{{goal_url}}`） |
| M3 | Gyazo 生成は `mode=morning`。`buildScheduleSlots(..., "morning")` で plan のみ埋まる |
| M4 | 勤務窓より前開始の予定は窓開始（通常 9:00）マスに表示（`clippedDisplayStart`） |
| M5 | 窓前に終了する予定は出ない |
| M6 | `saveMorningSchedulePlan` で `schedule_plans` に plan / window を保存 |
| M7 | `upsertMorningScheduleUrl` で本文に Gyazo URL が入る |
| M8 | 趣味・私用、18時以降の移動は日程から除外（`shouldIncludeScheduleEvent`） |

## evening（終業日報）

関連: `MainPage.tsx`, `schedule.ts`, `gyazo/route.ts`, `db.ts`, `template.ts`（`getEveningDateJST`）

| ID | 確認内容 |
|---|---|
| E1 | 日付は `getEveningDateJST`（JST 7時前は前日）+ 前日モード |
| E2 | 同日の始業レポートから `extractGoalUrls` → `{{goal_url}}` |
| E3 | Gyazo は `mode=evening`。左列は `getMorningSchedulePlan` の `planOverride` のみ |
| E4 | 終業でライブ予定を左列（plan）に入れない（override 無しなら plan 空） |
| E5 | 右列（progress）は当日カレンダー、22時（または窓終端）まで |
| E6 | 右列でも窓前開始は窓開始から表示 |
| E7 | `upsertEveningResultUrl` で「2　本日の結果」に URL |
| E8 | date 省略時の API フォールバックも `getEveningDateJST` |

## weekly（週次チャット）

関連: `MainPage.tsx`, `src/app/api/calendar/route.ts`, `template.ts`（`getWeekStart` / `buildWeeklyVars`）, `PrevWeekPanel.tsx`

| ID | 確認内容 |
|---|---|
| W1 | 週開始は `getWeekStart`（月曜起点。日曜 23:30 以降は翌週月曜） |
| W2 | `/api/calendar?week_start=` で月〜金の予定を取得 |
| W3 | `buildWeeklyVars` が曜日日付・予定・週範囲・前週セクションを埋める |
| W4 | 前週コンテンツは `/api/reports/prev-week` |
| W5 | 振休・有休・休日出勤の扱いがカレンダー組み立てと整合（該当コードがあること） |
| W6 | 保存キーは `weekStartStr` |

## overtime（残業申請）

関連: `MainPage.tsx`, `src/app/api/calendar/day/route.ts`, `src/lib/overtime-calc.ts`, `template.ts`（残業ヘルパー）

| ID | 確認内容 |
|---|---|
| O1 | 取得日付は `eveningDateStr`（0〜6時は前日。終業と同一） |
| O2 | `getOvertimeMinutes`: 18時前開始でも 18時以降の重なり分だけ計上（17–19 → 60） |
| O3 | 18時前に終わるタスクは 0（申請に出ない） |
| O4 | 除外ワード（移動・趣味・課題・飯・風呂）は `shouldIncludeOvertimeEvent` |
| O5 | `buildOvertimeVars` が今月合計・本日残業・タスク一覧を生成 |
| O6 | コピー時に月次加算・last 保存の日付も `eveningDateStr` |
| O7 | 保存・リセットの report_date も overtime は evening 日付 |

## 共通（親または各エージェントが軽く見る）

| ID | 確認内容 |
|---|---|
| C1 | `scripts/verify-tab-logic.ts` が PASS |
| C2 | テンプレ API `/api/templates?type=` が4種を返す前提のコードパスがある |
| C3 | レポート保存 `/api/reports` の type / report_date 分岐がタブと一致 |
