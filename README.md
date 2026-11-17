<p align="center">
  <img src="assets/brand/icon.svg" alt="StoryBored icon" width="96" />
</p>
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/brand/lockup-dark.svg" />
    <img src="assets/brand/lockup-light.svg" alt="StoryBored" height="44" />
  </picture>
</p>
<p align="center"><em>脚本から絵コンテへ — 自分の GPU で。</em></p>

# StoryBored

> **AI で映画を絵コンテに — ノードグラフも専門用語もいりません。**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://img.shields.io/badge/CI-GitHub_Actions-blue.svg)](.github/workflows/ci.yml)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](backend/pyproject.toml)

StoryBored は映像制作者のためのオープンソース絵コンテソフトです。ComfyUI は
見えない場所で動くエンジン — ユーザーが見るのはシーンとショットのビジュアル
ボードだけで、ノードグラフは決して現れません。ショットの説明を書き、スチルを
生成し、お気に入りのテイクを選び、ショットを承認し、動画にレンダリングし、
ボード全体をアニマティック MP4 として書き出せます。

![The StoryBored board](docs/img/board.png)

## 特徴

- **ビジュアルボード** — プロジェクト → シーン → ショット。ショットとシーンはドラッグで並べ替え。
  ショットカードには最新のスチル、ショット番号、種別、承認状況が表示されます。
- **賭けではなくテイク** — ショットごとに複数のテイクを生成し、ギャラリーで比較して
  1 つ選び、ショットを承認。あなたが決めるまで何も確定しません。
- **画像 → 動画** — 承認済みショットは短い動画クリップにレンダリングされます
  (image-to-video、ショットごとにモーションプロンプトも任意で設定可能)。生成ボタンは
  ショットが持つすべての情報からモーションプロンプトの下書きを作り、スチルはクリップの
  先頭フレームにも*末尾*フレームにも使えます。
- **アニマティック書き出し** — ワンクリックでボード全体をボード順どおりの 1 本の MP4 に。
  各ショットの長さを守り、クリップの音声を保持し、スチルはホールドされます。
- **キャラクターは `@handles`** — キャラクターを一度学習すれば(既存の LoRA の読み込みも可)、
  どのショットの説明にも `@sam` と書くだけ。StoryBored が自動でキャラクターを生成に注入します。
- **脚本分解(任意)** — 脚本テキストを貼り付けると、OpenAI 互換の任意の LLM が
  シーン/ショット一覧の下書きを作成します。ボードに反映される前に下書きを確認・編集できます。
- **エンジンパック** — 生成エンジンはドロップインのフォルダです(ComfyUI グラフ +
  小さなマニフェスト)。StoryBored のコードに触れずに独自のワークフローを追加できます。
  詳しくは [docs/WORKFLOWS.md](docs/WORKFLOWS.md)。
- **UI からワークフローを読み込み** — ComfyUI API 形式の書き出しを設定ウィザードに
  ドロップするだけ:プロンプト、シード、サイズ、出力、LoRA の接合点を自動検出します
  (それぞれ確認・修正可能)。手書きマニフェストなしでエンジンになります。逆向きも動きます:
  任意のエンジンを標準 ComfyUI API JSON として**書き出し直す**こともできます —
  モデル差し替えや LoRA 編集が適用された状態で — そのまま ComfyUI に取り込めます。
  何もロックされません。
- **JSON をいじらない LoRA とモデル** — 各エンジンの組み込み LoRA スタックは設定で
  表示・編集できます(ON/OFF、強度変更、追加、ワンクリックでパック既定にリセット)。
  動画エンジンも追加 LoRA に対応。全レンダリングに共通の*スタイル LoRA* を重ねたり、
  エンジンのベースモデルをインストール済みのファインチューンに差し替えたり、
  既定のエンジンを選んだり — すべて設定として保存され、パックファイルには触れません。
- **ポータブルなプロジェクト** — 任意のプロジェクトを 1 つの `.storybored` ファイルに
  書き出し(ボード、テイク、アニマティック、独自エンジンパックも含む)、別マシンで読み込めます。
  キャラクターは参照として移動し、一致する `@handles` は読み込み時に再利用されるか、
  好みで別キャラクターのまま保てます。
- **クリーンな削除** — テイク、ショット、シーン、プロジェクトを削除すると、生成ファイルも
  ディスクから削除され、待機中のジョブもキャンセルされます。孤児ギガバイトは残りません。
- **graceful な縮退運転** — LLM が未設定?トレーナーが未インストール?その機能は
  クラッシュせず「設定で構成してください」という親切なヒントを表示します。

![Shot drawer](docs/img/shot-drawer.png)

## 動作を見る

**強化(Enhance)** — 粗いメモが、表示されているエディタ内で、決して黙らずに
レンダリング可能なプロンプトへ:

![Enhance rewriting a rough shot description](docs/img/enhance.gif)

**埋まっていくボード** — レンダリングキューが動くにつれ、テイクがカードに
リアルタイムで届きます(約 10 倍速):

![Board cards filling as renders finish](docs/img/board-filling.gif)

**チェックポイント選抜テスト** — 学習後、保存された全チェックポイントが同じテストショットを
レンダリングして採点され、勝者はワンクリックで適用:

![Shootout ranking and one-click apply](docs/img/shootout-apply.gif)

<details>
<summary><b>その他のスクリーンショット</b> — キャラクター、ストーリーモード、エンジン、書き出し</summary>

あなたのキャスト — ここにあるキャラクターは全員学習済み LoRA で、StoryBored 内だけで
生成・学習されました:

![Characters page](docs/img/characters.png)

ストーリーモード — 自由な文章を入れると、レンダリング可能なボードが出てきます:

![Story vibes](docs/img/script-vibes.png)

エンジンはドロップインパックで、マシンごとの実際の速度と VRAM 収まりを正直に表示します:

![Engines settings](docs/img/settings-engines.png)

書き出し — 承認済みショットが動画レンダリングと単一 MP4 アニマティックのために整列:

![Export page](docs/img/export.png)

</details>

## クイックスタート

必要なもの:Python 3.11+、Node 20+、起動中の [ComfyUI](https://github.com/comfyanonymous/ComfyUI)
インスタンス(ローカルでも、到達できる別マシンでも可)。

### どんな ComfyUI でも動く

StoryBored は ComfyUI と**純粋に HTTP API 経由のみ**で通信します — ComfyUI の
ファイルやインストール構成には一切触れません。ポータブル zip、git checkout、ComfyUI
Desktop、マネージャー経由のインストール、別マシンの ComfyUI すらも:API が応答すれば動きます。

- `COMFYUI_URL`(またはセットアップウィザード)を、ComfyUI が起動時に表示するアドレスに
  向けてください。クラシックサーバーの既定は `http://127.0.0.1:8188`;**ComfyUI
  Desktop は独自のポートを使います** — サーバー設定でアドレスを確認してください。
- ComfyUI が別マシンにある? `--listen` を付けて起動してネットワーク接続を受け付けさせ、
  `http://そのマシン:8188` を使ってください。(アプリ内モデルダウンローダーは StoryBored と
  ComfyUI が同じファイルシステム上にある必要があります。リモートエンジンでは代わりに
  ダウンロードリンクと対象フォルダが表示されます。)

### macOS / Linux

```bash
git clone https://github.com/storybored-app/storybored.git
cd storybored

# 1. 設定 — COMFYUI_URL を任意の ComfyUI インスタンスに向ける
cp .env.example .env
$EDITOR .env

# 2. バックエンド — 隔離された virtualenv にインストールします。
#    最近の Debian/Ubuntu と Homebrew の macOS はシステム Python を
#    "externally managed" としており、素の `pip install` を拒否するため、
#    まず venv を作ります。
python3 -m venv .venv
. .venv/bin/activate
pip install -e backend

# 3. フロントエンド(一度だけビルド。バックエンドが配信します)
npm --prefix frontend i && npm --prefix frontend run build

# 4. 実行(同じシェルで、venv を有効化したまま)
python3 -m storybored
```

venv は StoryBored の依存パッケージをシステム Python から切り離します。新しいシェルで
`python3 -m storybored` を実行する前に、必ず venv を有効化してください
(`. .venv/bin/activate`)。[uv](https://docs.astral.sh/uv/) のほうが好きですか?
`uv venv && uv pip install -e backend` で同じことができます。

### Windows (PowerShell)

```powershell
git clone https://github.com/storybored-app/storybored.git
cd storybored

# 1. 設定 — COMFYUI_URL を自分の ComfyUI インスタンスに向ける
copy .env.example .env
notepad .env

# 2. バックエンド、virtualenv 内で
py -3.11 -m venv .venv          # 3.11+ なら素の `python` でも可
.venv\Scripts\Activate.ps1
pip install -e backend

# 3. フロントエンド(一度だけビルド。バックエンドが配信します)
npm --prefix frontend install
npm --prefix frontend run build

# 4. 実行(同じシェル、venv 有効のまま)
python -m storybored
```

PowerShell が `Activate.ps1` の実行を拒否する場合は、
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` でローカルスクリプトを一度許可してください。

**WSL2 のほうが好き?** 上記の macOS/Linux の手順が WSL2 Ubuntu シェル内でそのまま
使えます — Windows マシンでフル機能セット(キャラクター学習を含む)を使いたいなら
こちらが推奨ルートです。

**conda のほうが好き?** conda 環境が venv の手順を置き換えるだけです(どのプラットフォームでも):

```bash
conda create -n storybored python=3.11 nodejs -c conda-forge
conda activate storybored
pip install -e backend       # 以降はフロントエンドと実行の手順は上記どおり
```

**Windows 上の注意 — キャラクター学習。** ボード、レンダリング、脚本 AI、アニマティックは
すべて Windows 上でネイティブに動きます。*写真からキャラクターを学習する*パイプラインは
bash スクリプトを呼び出すため、学習を使いたい場合は StoryBored を
[WSL2](https://learn.microsoft.com/windows/wsl/install)(Ubuntu)内で実行し、
`COMFYUI_URL` は Windows 側の ComfyUI に向けてください。それ以外はネイティブで問題なく、
自分で学習する代わりに既製のキャラクター LoRA ファイルを読み込むこともできます。

<http://localhost:8600> を開いてください。

### Docker

コンテナのほうが好きですか?マルチステージビルド(フロントエンド同梱、非 root、
ヘルスチェック付き)がリポジトリに同梱されています:

```bash
git clone https://github.com/storybored-app/storybored.git
cd storybored
docker compose up -d
```

<http://localhost:8600> を開いてください — compose ファイルは既定で localhost のみに
バインドします。ポートを LAN に開くときは `STORYBORED_TOKEN` を設定してください
(未設定のまま公開すると、到達した誰でも GPU とメディアを操作できます)。
すべての状態はホストの `./data` に入ります。

ComfyUI はコンテナの**外**に置いたままです — StoryBored は HTTP でのみ通信します。
初回起動ウィザード(または `COMFYUI_URL`)で、*同じマシン上*の ComfyUI のアドレスは
`http://host.docker.internal:8188` です — コンテナ内から `127.0.0.1` はコンテナ自身を
指します。この名前は macOS/Windows ではそのまま使え、Linux では compose ファイルの
`extra_hosts` 行が追加します。別マシンの ComfyUI は普通の URL です。執筆アシスタント用の
ローカル LLM にも同じ手が使えます(Ollama なら `http://host.docker.internal:11434/v1`)。

コンテナ内で動くもの:

| 機能 | コンテナ内 | 備考 |
| --- | --- | --- |
| ボード、テイク、承認、アニマティック書き出し | ✅ | 追加設定不要 |
| スチル / 動画レンダリング | ✅ | 上記のとおり `COMFYUI_URL` 経由 |
| 執筆アシスタント(LLM) | ✅ | 上記のとおり `LLM_BASE_URL` 経由 |
| アプリ内モデルダウンローダー | ⚠️ マウントが必要 | ComfyUI の `models/` ディレクトリをコンテナにマウントする必要(`COMFY_MODELS_DIR`);そうしなければダウンロードリンクと対象フォルダが表示される — 壊れない |
| キャラクター学習 | ❌ 通常不可 | トレーナーは独自の venv/GPU スタックを持つ外部チェックアウトで、StoryBored がそこへシェルアウトします。GPU のないこのイメージ内ではそのスタックは実行できないため、タブには「設定で構成」ヒントが表示されます。Docker 以外のインストールで学習するか(既製 LoRA の読み込みならコンテナ内でも問題なく動きます) |

compose ファイルには、モデルダウンローダーとトレーナー向けのコメント付きボリューム
マウント例が含まれています。コンテナ化インストールでは通常 `COMFY_MODELS_DIR` /
`LORA_FACTORY_DIR` を未設定のままにして、graceful な縮退に任せます。

### 初回起動

エンジンが接続されるまで、StoryBored は短い**セットアップウィザード**を開きます
(設定 → *セットアップウィザード*からいつでも開けます):

1. **状況を選ぶ** — すでに ComfyUI を動かしている、まだインストールが必要
   (ウィザードが正しいドキュメントへ案内します)、または **GPU なし**で
   とりあえずボードだけのプランニングをしたい。
2. **エンジンを接続** — ComfyUI のアドレスを入力して*テスト*を押します。成功すると
   ウィザードは GPU、その VRAM、性能ティア、**そのティアに推奨されるエンジン**と
   ダウンロードサイズ(モデルフォルダ設定済みならワンクリックダウンロード)、
   そして準備済みのエンジンパックと不足しているモデルファイルを表示します
   ([docs/MODELS.md](docs/MODELS.md) 参照)。
3. **執筆アシスタント(任意)** — 脚本分解、プロンプトの磨き、モーション下書きのための
   OpenAI 互換 LLM。ウィザードは利用中のサービスが提供するモデルを一覧表示します。
   スキップすれば自分で書くことになります。
4. **キャラクタートレーナー(任意)** — トレーナーのチェックアウトを指定すると、
   写真からのキャラクター学習が有効になります([docs/TRAINING.md](docs/TRAINING.md))。

どの選択もスキップ可能で、後から設定で変更できます — ここに壁はありません。
(空の)プロジェクト画面に着いたら、**デモプロジェクトを読み込む**を押してください。
すぐ遊べる 2 シーンの小さなボード「The Last Lighthouse」が手に入ります。

### LLM(執筆アシスタント)を用意する

執筆アシスタントは任意ですが、2 分の価値があります:脚本分解、ストーリーモードのボード、
*強化(Enhance)* ボタン、モーションプロンプトの下書きはすべてこれにぶら下がっています。
なければすべてのプロンプトを自分で書くことに;あれば、粗いメモが磨かれた
エンジン対応のプロンプトになります。

一番簡単なのは [Ollama](https://ollama.com)、無料のローカル LLM ランナーです:

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh
# macOS / Windows: https://ollama.com/download からインストーラーを実行

# その後、StoryBored の既定モデルを pull
ollama pull qwen3.5:9b
```

ウィザード(または設定)を `http://127.0.0.1:11434/v1` に向け、モデルは
`qwen3.5:9b` にします。正直なリソース注意:qwen3.5:9b は **6.6 GB のダウンロード**
(量子化、256K コンテキスト)で、実行にはそれくらいの空き RAM か VRAM が必要です —
CPU でも動きますが遅いだけです。ハードウェアで選んでください:小型 GPU や CPU のみの
マシンには `qwen3.5:4b`(3.4 GB)、ほとんどのマシンには `qwen3.5:9b`、
32 GB 以上の VRAM があれば `qwen3.5:35b-a3b`(24 GB、高速 MoE)。セットアップ
ウィザードは GPU に合うものを提案します。

Ollama とレンダリングエンジンで 1 枚の GPU を共用?Ollama はすでに数分でアイドル
モデルをアンロードします。`llm_keep_alive` 設定を `0` にすれば、毎回の呼び出し後に
**即座に** VRAM を解放します(Ollama エンドポイントのみ — 他のプロバイダーでは空のままに)。

ローカルの計算力や根気がない?**OpenAI 互換のホステッド API** も使えます —
ベース URL、モデル名、API キーを入力してください。

> **ネットワーク上で実行する場合。** StoryBored は既定で `127.0.0.1`(localhost)
> のみをリッスンし、実行しているマシンからだけ到達できます。ログイン画面はありません。
> トンネルや `STORYBORED_HOST=0.0.0.0` で他のマシンから届くようにするときは、必ず
> `STORYBORED_TOKEN` を設定してください。未設定のまま公開すると、到達した誰でも
> GPU を操作し、メディアを読み、設定を変更できます。トークンは
> `Authorization: Bearer` か `?token=`(画像と SSE 用)で渡します。

## ハードウェアの目安

StoryBored 自体は軽量です — GPU 要件は ComfyUI で動かすエンジンパックから来ます。
StoryBored が同梱するのはエンジンの*定義*であり、ロードされる数 GB のモデルファイルでは
ありません。最初のショットの前に、ComfyUI に各パックが必要とするファイルがあるか
確認してください。セットアップウィザードは GPU の VRAM をエンジンから直接読み取り、
どのティアかを教え、**そのティアの検証済みエンジンを推奨**し、(モデルフォルダが設定されて
いれば)ファイルをワンクリックでダウンロードします。**[docs/MODELS.md](docs/MODELS.md)** に
ファイル一覧、サイズ、正直な速度数値を含む全マトリクスがあります。

| VRAM        | ティア        | スチルエンジン                | 動画エンジン                    | LLM の提案   |
| ----------- | ----------- | ---------------------------- | ------------------------------- | ---------------- |
| 6 GB 未満  | board       | — (ボード、脚本 AI、アニマティックは動作可) | —              | qwen3.5:4b       |
| 6–11 GB     | stills-lite | Z-Image Turbo (Apache 2.0)   | —                               | qwen3.5:4b       |
| 12–15 GB    | stills      | Z-Image Turbo (Apache 2.0)   | Wan 2.2 5B (Apache 2.0, 無音) | qwen3.5:9b       |
| 16–23 GB    | stills-hd   | Krea 2 (community license)   | Wan 2.2 5B (Apache 2.0, 無音) | qwen3.5:9b       |
| 24 GB+      | studio      | Qwen-Image 2512 (Apache 2.0) | Wan 2.2 14B (Apache 2.0, 無音) — MiniMax H3 は音声付きでラベル付き上級オプション | qwen3.5:9b (32 GB+ では 35b-a3b) |

キャラクター学習は 24 GB クラスのカードを望み、複数時間のジョブで生成の後ろに
キューイングされます。ライセンスの哲学:**推奨パスはデフォルトで安全**(ティアに Apache 2.0 の勝者がいれば Apache 2.0)、実際の注意点を持つライセンス — 領域除外、収益上限、
撤回可能な許諾 — のエンジンは利用可能なまま、設定とウィザードで注意点を目に見える
通知として表示します。

ComfyUI は StoryBored とは別のマシンで動かせます — `COMFYUI_URL` を適宜設定してください。
全ジョブは 1 本の GPU レーンを共有するため、長い学習実行は単純に生成の後ろに
キューイングされます(UI にキューが表示されます)。

## Colab / Kaggle で動かす(実験的)

GPU のないマシンから、ノートブック 1 つで ComfyUI と StoryBored をクラウド GPU 上に立ち上げてブラウザから使えます。手順は [notebooks/storybored-cloud.ipynb](notebooks/storybored-cloud.ipynb) です。プラットフォーム側の仕様が変わると急に止まることがあります。

- **Colab** — [このボタンで開く](https://colab.research.google.com/github/ma-team333/storybored/blob/ja/notebooks/storybored-cloud.ipynb)。無料枠の T4(16 GB)で足ります。
- **Kaggle** — File → Import Notebook。Settings で Internet を ON、Accelerator を GPU T4 x2 にします。セッションは最長 12 時間、GPU は週 30 時間の割り当てです。ノートブックは 1 枚だけ使います。
- **公開** — ngrok(pyngrok)で 8600 番を出します。cloudflared のクイックトンネル(trycloudflare.com)は SSE(`/api/events`)に対応しないので使えません。
- **トークン** — ノートブックが `STORYBORED_TOKEN` を生成し、トークン付き URL を表示します。トンネルを開いたままトークンなしにしないでください。
- **データ** — セッションのディスクは切れます。閉じる前にノートブックの退避セル(Colab は Google Drive、Kaggle は zip のダウンロード)か、UI の書き出し(`.storybored`)を使ってください。

16 GB の T4 は、上の表の **16–23 GB(stills-hd)** の下限です。最初は Z-Image Turbo の int8 ビルド(拡散モデル 6.2 GB + テキストエンコーダ 5.6 GB + VAE 335 MB)から始めてください。同じ帯の Krea 2 は拡散モデル 13.1 GB + テキストエンコーダ 5.2 GB で、16 GB では込まりきらないことがあります。Qwen-Image 2512 は 24 GB カードの約 86% を使うと [docs/MODELS.md](docs/MODELS.md) にあり、16 GB には入りません。Wan 2.2 14B は拡散モデル 14.3 GB が 2 本です。MiniMax H3 の同梱ファイルは NVFP4 で、同じ形式の Z-Image NVFP4 は Blackwell(RTX 50 シリーズ)専用とカタログに書いてあります。T4 では使えません。速度の新しい実測はここには書きません。

## データの移動・バックアップ

StoryBored が作るものはすべて 1 つのフォルダ — `DATA_DIR`(既定:リポジトリ内の
`./data`)に入ります:データベース、生成されたスチルとクリップ、アニマティック
書き出し、自分でインストールしたエンジンパック。

- **1 プロジェクトのバックアップ / 共有** — プロジェクトページの**書き出し**を使います。
  ボード全体とメディアを含む 1 つの `.storybored` ファイルが得られます。任意の StoryBored で
  **読み込み**から取り込みます(一致する `@handles` のキャラクターは再利用されるか、
  選択すれば別々に保てます)。キャラクターの LoRA ファイルはアーカイブ内に*ありません* —
  通常どおりエンジンにインストールしてください。
- **すべてをバックアップ** — StoryBored を停止した状態で `DATA_DIR` フォルダをコピーします。
  そのフォルダ*こそが*あなたのスタジオです。
- **大きなディスクへの移動** — StoryBored を停止してから:

  ```bash
  python3 -m storybored relocate /path/to/new/location
  ```

  サーバー起動中は実行を拒否し、フォルダを移動し、`.env` に書く
  `DATA_DIR=...` の行を出力します。(手動でも可能:フォルダを移動し、`DATA_DIR` を
  新しいパスに設定。)`STORYBORED_HOME` はさらに強力なハンマーで、`.env` と相対
  `DATA_DIR` の探索場所を移動します。パッケージインストール用です。

## さらに進むには

- **質問と健全な懐疑心** — [docs/FAQ.md](docs/FAQ.md)
- **パックが必要とするモデルファイルを入手** — [docs/MODELS.md](docs/MODELS.md)
- **独自のエンジンパックを作る** — [docs/WORKFLOWS.md](docs/WORKFLOWS.md)
- **写真からキャラクターを学習** — [docs/TRAINING.md](docs/TRAINING.md)
- **binding v1 仕様** — [docs/CONTRACT.md](docs/CONTRACT.md)
- **コードベースツアーと不変条件** — [ARCHITECTURE.md](ARCHITECTURE.md)
- **貢献(人間とコーディングエージェント)** — [CONTRIBUTING.md](CONTRIBUTING.md)

## ロードマップ

- **Cloud / Runpod ワンクリック** — ローカル GPU のない人のために ComfyUI + StoryBored を
  一緒に立ち上げるテンプレート。
- **エンジンパックの拡充** — 画像・動画モデルファミリーの追加をドロップインの
  ワークフローパックとして。
- **協編集ボード** — 同じボードに複数人が同時に参加。

## ライセンス

[MIT](LICENSE)。
