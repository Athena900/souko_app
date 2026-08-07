# Supabase セットアップ

## 1. プロジェクト

依頼者名義のSupabaseプロジェクトを作成し、検証・本番を分離する。ブラウザにはPublishable Keyだけを渡し、`service_role`やSecret Keyは渡さない。

## 2. マイグレーション

Supabase CLIの利用可能なコマンドを`--help`で確認し、ローカルで検証してからクラウドへ適用する。

```text
supabase start
supabase db reset
supabase db lint
```

このリポジトリではCLIを`npx --yes supabase`で実行できる。クラウドDBへの適用はまだ実施していない。

2026年以降の新規プロジェクトでは、publicスキーマの新しい表がData APIへ自動公開されない場合がある。マイグレーションのGRANTに加え、DashboardのData API設定で必要な表だけを公開し、不要な表・キューは公開しない。

## 3. Storageバケット

Dashboardまたは承認済みの運用スクリプトで、次の非公開バケットを作成する。

- `source-quarantine`: アップロード直後。利用者から読めない
- `source-original`: 検査済み原本
- `field-photos`: 現場写真
- `exports`: 確認用Excel

原本は上書きせず、ファイル名に取込版IDを含める。署名付きURLは短い有効期限で発行する。

## 4. 必須の確認

- `user_memberships`に利用者・荷主・拠点・役割を登録する
- RLS否定試験（現場ユーザーが単価・請求候補・他拠点を読めない）を通す
- DB、Storage、全体の3種類の復元演習を行う
- pgmqのメッセージ再読込・可視性期限・失敗再試行を実データなしで確認する

現在のマイグレーションでは、クライアントへ直接公開する権限を現場記録の登録と必要な参照に限定している。原本・outbox・監査イベントの登録は、アップロード検査と監査を書き込むサーバー側ワーカーを実装してから専用経路で行う。
