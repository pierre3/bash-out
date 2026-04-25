# BashOut

ボスバトル型のブロック崩しゲーム。面ごとに異なるボスと戦う、Breakout オマージュ。HTML5 Canvas + TypeScript + Vite で実装。

## プレイ

**▶ <https://pierre3.github.io/bash-out/>**

スマホからは下のQRコードを読み込んでアクセスできます。

![QRコード](qr.png)

## 概要

- 画面右上の**ボス**に攻撃を加え、HPをゼロにすると勝利
- 面ごとに異なるボスが登場（現状は猪ボス1種）
- ボスは時間経過でブロックを叩き落とす（ボディアタック）、電撃でパドルを麻痺、ボールを加速、ブロックを強化（岩化）の4種の攻撃を仕掛けてくる
- プレイヤーはチャージでエネルギーを溜め、3種の基本技（パドル拡大 / ボール分裂 / バリア）と、★3つで発動する必殺技「貫通弾」で対抗する

## 操作

| 操作 | キーボード | タッチ / クリック |
|------|-----------|-------------------|
| 左右移動 | ← / → | 画面下の左右ボタン長押し |
| ダッシュ | 同方向2連打 | 同ボタン2連タップ |
| チャージ | ←＋→同時押し | 左右ボタン同時押し |
| 基本技発動 | ↑キー | スキル名のギザギザ吹き出しをタップ |

ダッシュは1回25エネルギーを消費（タンクから自動補充）。ダッシュ中の残像でもボールを反射可能。

## 開発

### 必要環境

- Node.js（推奨 v20 以上）
- npm

### セットアップと起動

```bash
npm install
npm run dev
```

`http://localhost:5173/` を開くとゲームが起動する。

### ビルド

```bash
npm run build
```

`dist/` に静的ファイルが出力される。`npm run preview` でローカル確認可能。

## 仕様書

設計・実装方針は [spec.md](spec.md) にまとめている。

## GitHub Pages への公開

`vite.config.ts` で `base: './'` を指定済みのため、サブパス配信（`https://USER.github.io/REPO/`）でも動作する。

### 手動デプロイ

```bash
npm run build
# dist/ の中身を gh-pages ブランチに push する
```

### GitHub Actions による自動デプロイ

`.github/workflows/deploy.yml` を作成して以下のような内容を置けば、main ブランチへの push で自動的に Pages にデプロイできる:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

リポジトリの **Settings → Pages → Source** を **GitHub Actions** に設定すること。

## 技術スタック

- HTML5 Canvas 2D（描画基盤）
- TypeScript
- Vite（開発サーバ・ビルド）

内部論理解像度は 540×960 (9:16) に固定。devicePixelRatio 対応で高DPI端末でもクリスプに描画される。
