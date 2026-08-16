---
name: verify-tabs
description: >-
  始業・終業・週次・残業の4タブが正常動作するかを、タブごとに並列サブエージェントで検証する。
  「4タブ確認」「タブ検証」「サブエージェントで確認」「verify tabs」と言われたときに使う。
---

# 4タブ検証（サブエージェント）

syuji の4タブ（始業 / 終業 / 週次 / 残業）を、**タブごとに1体ずつのサブエージェントを並列起動**して検証し、親が結果を統合する。

## 手順（必ずこの順）

### 1. 共有スモークを先に実行

リポジトリルートで:

```bash
npm run verify:tabs
```

失敗したらその内容を全サブエージェントのプロンプトに含め、関連タブを重点確認させる。

### 2. 4体を並列起動（1メッセージで Task × 4）

`Task` ツールを **同じターンで4回**呼ぶ。共通設定:

- `subagent_type`: `explore`（コード読取中心）またはロジック深掘りなら `generalPurpose`
- `model`: `inherit`
- `run_in_background`: 親がすぐ統合するなら `false`。長時間なら `true` でも可だが、完了後に必ず統合する

各エージェントには次を渡す:

1. リポジトリパス: `/Users/ishi/src/syuji`（または実際の workspace root）
2. 担当タブ名（1つのみ）
3. 「[checklists.md](checklists.md) の担当タブ節だけを満たすこと」
4. スモーク結果（パス/失敗一覧）
5. 返すフォーマット（下記）

| エージェント | description | 担当 |
|---|---|---|
| 1 | 始業タブ検証 | `morning` |
| 2 | 終業タブ検証 | `evening` |
| 3 | 週次タブ検証 | `weekly` |
| 4 | 残業タブ検証 | `overtime` |

### 3. サブエージェントへのプロンプト雛形

```
あなたは syuji の【TAB】タブ専用検証エージェントです。
リポジトリ: ABSOLUTE_REPO_ROOT
チェックリスト: .cursor/skills/verify-tabs/checklists.md の【TAB】節のみ。

やること:
1. チェックリストの各項目について、関連ファイルを読んで PASS / FAIL / N/A を判定する
2. 必要なら scripts/verify-tab-logic.ts の該当ケースや実装を突き合わせる
3. 推測で PASS にしない。根拠にファイルパスと行番号（または関数名）を付ける
4. UI/E2E が必要な項目は「要手動」と書き、コード上確認できた範囲だけ PASS にする

最終応答は次の形式のみ（日本語）:

## 【TAB】検証結果
- 総合: PASS | FAIL | PARTIAL
- 項目:
  - [PASS|FAIL|N/A|要手動] 項目名 — 根拠
- 問題があれば修正提案を1〜3行
```

`【TAB】` を `morning` / `evening` / `weekly` / `overtime` に置き換える。

### 4. 親が統合して報告

4結果を待ち、次の形式でユーザーに返す（日本語・簡潔）:

```
## 4タブ検証サマリー
| タブ | 結果 | 主な問題 |
|---|---|---|
| 始業 | PASS/FAIL/PARTIAL | … |
| 終業 | … | … |
| 週次 | … | … |
| 残業 | … | … |

スモーク: PASS/FAIL（scripts/verify-tab-logic.ts）
```

FAIL / PARTIAL があるタブだけ、根拠と次アクションを短く書く。勝手に修正しない（ユーザーが修正を依頼したときだけ直す）。

## 注意

- 4タブを1エージェントに詰め込まない（並列が目的）
- Google / Gyazo / DB 実接続が必要な項目はコードレビュー＋要手動に分ける
- 詳細基準は [checklists.md](checklists.md) を正とする
