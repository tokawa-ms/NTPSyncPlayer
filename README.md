# 🎯 NTP Sync Countdown

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![Azure Container Apps](https://img.shields.io/badge/Azure-Container%20Apps-0078D4?logo=microsoftazure&logoColor=white)](infra/main.bicep)

[English](README-en.md)

**NTP 時刻同期により、複数端末間で正確に同期するカウントダウンタイマー** アプリケーションです。

イベント会場・配信スタジオ・QA テストなど、複数のデバイスで同時にカウントダウンを表示・同期する用途に使えます。

## ✨ 特徴

- **NTP 時刻同期** — サーバー経由で `ntp.nict.jp` から正確な時刻を取得し、クライアント PC の時計のずれを自動補正
- **動画カウントダウン** — MP4 動画をフレーム単位で同期再生（動画なしの場合はテキストカウントダウンにフォールバック）
- **マルチデバイス同期** — 複数のブラウザ / 端末で同じタイミングのカウントダウンを表示
- **リアルタイム品質表示** — NTP オフセット・HTTP RTT を色分けで可視化（緑/黄/赤）
- **モバイル対応** — タップオーバーレイによる Autoplay 制限回避、フルスクリーン対応
- **ゼロ依存フロントエンド** — フレームワーク不要、純粋な HTML/CSS/JS
- **Docker & Azure 対応** — Dockerfile と Bicep テンプレートによるワンコマンドデプロイ

## 🏗️ アーキテクチャ

```
┌──────────┐     UDP/123      ┌──────────────┐     HTTP      ┌──────────────┐
│ NTP サーバー │ ◄──────────► │  Web サーバー   │ ◄──────────► │  ブラウザ      │
│ ntp.nict.jp│               │  (Node.js)    │              │ (クライアント) │
└──────────┘               └──────────────┘              └──────────────┘
```

1. **サーバー → NTP**: 60 秒間隔で NTP サーバーに問い合わせ、サーバー時計のオフセットを算出
2. **クライアント → サーバー**: 30 秒間隔で `/api/ntp-offset` を取得し、HTTP RTT を考慮してクライアント側オフセットを計算
3. **`ntpNow()`**: `Date.now() + clientOffset` で NTP 補正済みの正確な時刻を取得

詳細は [docs/time-sync-algorithm.md](docs/time-sync-algorithm.md) を参照してください。

## 📁 プロジェクト構成

```
├── server.js              # Node.js HTTP サーバー + NTP クライアント
├── public/
│   ├── index.html         # メイン HTML
│   ├── app.js             # クライアントロジック（NTP 同期・カウントダウン制御）
│   └── style.css          # スタイルシート
├── docs/
│   └── time-sync-algorithm.md  # 時刻同期アルゴリズムの詳細ドキュメント
├── infra/
│   ├── main.bicep         # Azure Container Apps 用 Bicep テンプレート
│   └── main.bicepparam    # Bicep パラメータファイル
├── deploy.ps1             # デプロイスクリプト (PowerShell)
├── deploy.sh              # デプロイスクリプト (Bash)
├── Dockerfile             # コンテナイメージビルド定義
└── package.json
```

## 🚀 クイックスタート

### 前提条件

- [Node.js](https://nodejs.org/) 18 以上

### ローカル実行

```bash
# 依存パッケージのインストール
npm install

# サーバー起動
npm start
```

ブラウザで http://localhost:6413 を開きます。

### Docker 実行

```bash
# イメージビルド
docker build -t ntpsync .

# コンテナ起動
docker run -p 6413:6413 ntpsync
```

### 動画ファイル（オプション）

`public/` ディレクトリに `bg-movie-countdown01.mp4` を配置すると、カウントダウン時に動画が同期再生されます。動画がない場合は、テキストベースのカウントダウン（ビープ音付き）に自動フォールバックします。

## ☁️ Azure へのデプロイ

Azure Container Apps へのデプロイ用に Bicep テンプレートとデプロイスクリプトが含まれています。

```bash
# PowerShell
.\deploy.ps1

# Bash
./deploy.sh
```

デプロイには以下が必要です:

- Azure サブスクリプション
- Azure Container Registry (ACR)
- Azure CLI (`az`)

インフラ定義の詳細は [infra/main.bicep](infra/main.bicep) を参照してください。

## 🔧 設定

| 環境変数 | デフォルト | 説明                     |
| -------- | ---------- | ------------------------ |
| `PORT`   | `6413`     | サーバーの待ち受けポート |

### カウントダウンのタイミング

デフォルトでは毎分 **:20** と **:50** にカウントダウンが開始されます。変更する場合は [public/app.js](public/app.js) 内の `START_SECS` を編集してください。

## 📡 API

### `GET /api/ntp-offset`

サーバーの NTP 同期状態を返します。

```json
{
  "offsetMs": 12.5,
  "lastSync": "2026-04-13T12:00:00.000Z",
  "server": "ntp.nict.jp",
  "error": null,
  "serverTime": 1776182400000
}
```

| フィールド   | 型               | 説明                                              |
| ------------ | ---------------- | ------------------------------------------------- |
| `offsetMs`   | `number \| null` | サーバーの NTP オフセット (ms)。未取得時は `null` |
| `lastSync`   | `string \| null` | 最終同期時刻 (ISO 8601)                           |
| `server`     | `string`         | 使用中の NTP サーバー名                           |
| `error`      | `string \| null` | エラーメッセージ                                  |
| `serverTime` | `number`         | レスポンス生成時の `Date.now()` (ms)              |

## 🖥️ UI 表示

| 表示項目       | 説明                                              |
| -------------- | ------------------------------------------------- |
| NTP 補正済時刻 | `ntpNow()` による正確な時刻                       |
| システム時刻   | 補正なしの `Date.now()` による時刻                |
| NTP 補正情報   | クライアント基準オフセット + サーバー側オフセット |
| HTTP RTT       | クライアント↔サーバー間の往復時間                 |

### オフセット / RTT の色分け

| 状態    | オフセット | RTT        |
| ------- | ---------- | ---------- |
| 🟢 良好 | ≤ 100 ms   | ≤ 200 ms   |
| 🟡 注意 | 100–500 ms | 200–500 ms |
| 🔴 異常 | > 500 ms   | > 500 ms   |

## ⚠️ 制約事項

- NTP 通信はサーバー側のみ（ブラウザから UDP 通信は不可）
- PaaS / コンテナ環境では UDP ポート 123 がブロックされ NTP 同期が失敗する場合があります
- HTTP RTT が極端に大きい環境では同期精度が低下します

## 📄 ライセンス

[MIT](LICENSE)
