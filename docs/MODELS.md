# モデルファイルの入手

StoryBored が同梱するのはエンジンの**定義**であり、モデルの重みではありません。
エンジンパックは小さな ComfyUI グラフ + マニフェスト([WORKFLOWS.md](WORKFLOWS.md) 参照)
— 数 KB です。実際の生成は**あなたの ComfyUI** にある数 GB のモデルファイルが行い、
それを別途ダウンロードします。

## 自分の GPU は何ができる?

<a id="what-can-my-gpu-do"></a>

セットアップウィザードはエンジンから GPU の VRAM を読み取り、**ティア**に分類して、
そのティアの検証済みエンジンを推奨します — この表はそのロジックを紙に起こしたものです。
すべての推奨は事前選択であり、決してロックではありません:ComfyUI が実行できるパックは
すべて選択可能なままです。速度数値は記載カードでのコミュニティ/ベンダーの実測値に基づく
ものであり、約束ではありません。

| VRAM | ティア | 推奨スチルエンジン | 推奨動画エンジン | ダウンロード | ライセンス | 実測速度 | キャラクター学習 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 6 GB 未満 | `board` | — | — | — | — | GPU なしでボード、脚本 AI、アニマティック書き出しが動作 | — |
| 6–11 GB | `stills-lite` | **Z-Image Turbo** (`z-image-turbo`) | — | ~12.2 GB | Apache 2.0 | 1024² スチル 1 枚約 15–20 秒(RTX 4060、6–8 GB ではオフロード付き) | 未確立 — 既製 LoRA を読み込み(Civitai に 5k+ の Z-Image キャラクター LoRA) |
| 12–15 GB | `stills` | **Z-Image Turbo** (`z-image-turbo`) | **Wan 2.2 5B** (`wan22-ti2v-5b`) | ~12.2 GB + ~18.1 GB | Apache 2.0 | スチル 10 秒未満(RTX 3060 12 GB) | **Z-Image** ~1–2 時間(2000 ステップ数、512/768 バケット — RTX 3060 クラスでコミュニティ実証済み) |
| 16–23 GB | `stills-hd` | **Krea 2** (`krea2-basic`) | **Wan 2.2 5B** (`wan22-ti2v-5b`) | ~19.1 GB + ~18.1 GB | Krea 2 Community(注意書き参照) | 1024² スチル 8 ステップで約 13 秒(RTX 3090) | **Z-Image** ~1–2 時間(2000 ステップ数);Krea 2 学習は 24 GB を望む |
| 24 GB+ | `studio` | **Qwen-Image 2512** (`qwen-image-2512`) | **Wan 2.2 14B** (`wan22-i2v-14b`) | ~30.9 GB + ~38.0 GB | Apache 2.0 | Lightning LoRA 使用でスチル約 34–55 秒(RTX 4090D、公式 Comfy 数値) | 全ファミリー — **Krea 2** ~2.5–4 時間(3000 ステップ数)または **Z-Image** ~1–2 時間;Qwen-Image は実験的 |

表に収まらない注意点:

- **Z-Image Turbo** は 16 GB+ での*高速でライセンスクリーンな*代替でもあります —
  Krea 2 の約 2 倍の速度でスチル 1 枚(RTX 4090 で約 2.3 秒)、Apache ライセンス、
  2025 年以降最大の LoRA 学習エコシステム。bf16 ビルド(12.3 GB)は 16 GB カード向けの
  カタログ代替です。
- **Wan 2.2 動画は無音** — 音声トラックなし。MiniMax H3 パックは同期音声を生成しますが、
  重大なライセンス注意(US/EU/UK/韓国領域除外)を持ち、既定ファイルは RTX 50 シリーズ
  のみで動きます。明確にラベル付けされた上級オプションとして利用可能なままです。
- **8–11 GB カードでの Wan 2.2 5B**:公式の下限は「ネイティブオフロードで 8 GB に
  収まる」。大げさな約束を避けるため、ウィザードは 12 GB から*推奨*するだけ —
  8 GB カードでも手動で試せます。
- **約 20 ステップ数の Wan 2.2 14B** は RTX 4090 で 5 秒クリップ 1 本あたり約 4 分 20 秒;
  同梱パックは公式 lightx2v 4 ステップ LoRA を焼き込んでおり、ステップ数を 20 → 4 に
  減らします(設定で OFF にすれば低速パスで実行 — その場合ステップ数を 20、cfg を
  3.5 に上げてください)。
- **キャラクター学習はファミリー縛りかつティア別**([学習](TRAINING.md#モデルファミリー) の
  列と [TRAINING.md](TRAINING.md#モデルファミリー) 参照):学習済み LoRA はその学習
  ファミリーでしか動かず、学習は既定画像エンジンのファミリーをターゲットにし、
  実証済みレシピは 12 GB クラスからの Z-Image(約 1–2 時間)と 24 GB クラスからの
  Krea 2(約 2.5–4 時間)。12 GB 未満では学習の代わりに既製 LoRA を読み込んでください。
- ライセンスの哲学:推奨は**デフォルトで安全** — ティアに Apache 勝者がいれば
  Apache 2.0。ライセンス注意点のあるエンジンは利用可能なまま、設定とウィザードで
  目に見える通知(`license_note`)を身に付けます。

### 執筆アシスタント(LLM)のサイジング

ウィザードは同じ VRAM 読み取りで執筆アシスタント用の Ollama モデルも提案します
(LLM はレンダリングと GPU を共用 — 設定で `llm_keep_alive` を `0` にすると
毎呼び出し後に VRAM を即解放):

| 最良 GPU VRAM | 推奨タグ | ダウンロード | 備考 |
| --- | --- | --- | --- |
| 12 GB 未満(GPU なし含む) | `qwen3.5:4b` | 3.4 GB | 256K コンテキスト;CPU でも十分 |
| 12–31 GB | `qwen3.5:9b` | 6.6 GB | 256K コンテキスト;既定 |
| 32 GB+ | `qwen3.5:35b-a3b` | 24 GB | MoE、アクティブ 3B — 高速デコード |

**設定画面があなたの買い物リストです。** パックが ComfyUI から見えないファイルを
参照している場合、StoryBored はパックを**利用不可**とマークし、不足ファイルを
**設定**に、カタログが知るすべてとともに一覧表示します:配置先フォルダ、サイズ、
ライセンス、そして検証済みソースを持つファイルには直接リンク。ファイルを
インストールする方法は 2 つ:

- **アプリ内ダウンロード。** 設定で**エンジンモデルフォルダ**を設定します
  (`COMFY_MODELS_DIR` 環境変数 — ComfyUI の `models/` ディレクトリ;StoryBored が
  ComfyUI と同じマシン/ファイルシステムで動くときのみ可能)。検証済みソースを持つ
  不足ファイルには**ダウンロード**ボタンが付き、「不足分をすべてダウンロード」で
  全部取得。ダウンロードは専用ジョブレーンで動くためレンダリングをブロックせず、
  各ファイルのサイズはカタログに対して検証されます。
- **手動配置。** ソースリンクを辿る(またはコミュニティファイルの検索ガイダンスに
  従う)、自分でファイルをダウンロードし、表示されたフォルダに置く。ファイル名は
  一覧と**完全に**同じに保ってください — 利用可否はファイル名で一致します。

どちらの方法でも:ファイルが置けたら ComfyUI を再起動または更新して再スキャンさせ、
設定のエンジンパネルで**更新**を押します — パックが利用可能に切り替わります。

## ComfyUI が各種ファイルを置く場所

マニフェストは各要件を、それをロードする ComfyUI ノードでキー付けします。そのノードが、
ファイルが属すべき標準 ComfyUI モデルフォルダを教えます:

| マニフェストのローダーノード | ComfyUI フォルダ |
| --- | --- |
| `UNETLoader` | `models/diffusion_models`(別名 `models/unet`) |
| `CLIPLoader` | `models/text_encoders`(別名 `models/clip`) |
| `VAELoader` | `models/vae` |
| `LoraLoader` / `LoraLoaderModelOnly` | `models/loras` |
| `CheckpointLoaderSimple` | `models/checkpoints` |

モデルのインストールと各フォルダの場所については ComfyUI 自身のドキュメントが
権威です: <https://docs.comfy.org/>

## カタログ

<a id="the-catalog"></a>

`workflows/catalog.json` は同梱パックが必要とする各ファイル名をそのソースへ
マップします。URL を持つエントリは**ホスティングサイトに対して検証済み**です
(正確なパス、バイトサイズ、ライセンス)— これらがアプリ内ダウンローダーの
原動力です。*community* とマークされたエントリは正規の場所のないコミュニティ公開
ファイルです;私たちはリンクせず、備考が探し場所を述べます。同じ形の `catalog.json` を
`DATA_DIR/workflows/` に置けばカタログを拡張・上書きできます
(自分のパックに便利 — 同じファイル名が勝ちます)。

以下の表は同梱カタログの要約です。サイズは検証済みバイト数の丸めです。

### Krea 2 画像パック(`krea2-basic`、`krea2-realism`)

両パックは同じベース + turbo-distill LoRA の上に構築されます。`krea2-basic` は
最初の 4 行のみ必要;`krea2-realism` はコミュニティ realism スタックを追加します。

**ベースファイル** — 検証済み、Hugging Face の [`Comfy-Org/Krea-2`](https://huggingface.co/Comfy-Org/Krea-2)
で **Comfy-Org** 組織がホスト、すべて Krea 2 Community License の下:

| ファイル | フォルダ | サイズ |
| --- | --- | --- |
| `krea2_raw_fp8_scaled.safetensors` | `diffusion_models` | 13.1 GB |
| `qwen3vl_4b_fp8_scaled.safetensors` | `text_encoders` | 5.2 GB |
| `qwen_image_vae.safetensors` | `vae` | 254 MB |

**Turbo distill LoRA**(両パック)— コミュニティだが既知のページあり:
`(Krea 2) 8-Step Turbo Distill Rank 64 V2026.1.safetensors`(約 469 MB、
Krea 2 Community License を継承)は [Civitai 上](https://civitai.com/models/2746698)の
「Krea-2 Turbo 8-Step Distillation LoRA (SVD Extract)」バージョン V2026.1。
Civitai のダウンロードには(無料の)ログインアカウントが必要なため、これは手動 —
ファイル名は括弧と空白を含めそのまま維持してください。フォルダ:`loras`。

**Realism LoRA スタック**(`krea2-realism` のみ)— すべてコミュニティファイル、
フォルダ `loras`。これらはまさにこのファイル名で Hugging Face、Civitai、Tensor.Art を
流通しています;いずれにも正規のライセンス済みの置き場所を指せないため、ハブを
自分で検索し、手に入れたものを確認してください(本物の LoRA は MB〜GB 単位 —
バイトサイズのプレースホルダ再アップロードに注意):

| ファイル | 既知の由来 |
| --- | --- |
| `krea2filterbypass3.safetensors` | 見つからず — ハブを検索;この名前で 160 バイトのスタブ再アップロードが存在 |
| `Krea2-realism-V2.safetensors` | Hugging Face に再アップロード |
| `Detailer-KREA2.safetensors` | 見つからず — ハブを検索 |
| `bloomgirls-ultrarealism-krea2_4k.safetensors` | Tensor.Art(「[KR2]BloomGirls UltraRealism」) |
| `lenovo_krea2.safetensors` | Civitai(「Lenovo Ultrareal」、Krea 2 ビルド) |
| `RealisticSnapshotKrea2.safetensors` | Civitai(「Realistic Snapshot」、Krea 2 ビルド) |
| `realism_engine_krea2_v3.1.safetensors` | Hugging Face に再アップロード |

スタックを追いかけたくない場合は `krea2-basic` から始めてください — そして設定では
個々の realism LoRA を OFF にできることを忘れないでください;無効化した LoRA は
パックが利用可能と見なされるための要件から外れます。

### Z-Image Turbo(`z-image-turbo`)

すべて検証済み、[`Comfy-Org/z_image_turbo`](https://huggingface.co/Comfy-Org/z_image_turbo)
で **Comfy-Org** がホスト、すべて **Apache 2.0** — パック全体がワンクリック
ダウンロード可能です:

| ファイル | フォルダ | サイズ |
| --- | --- | --- |
| `z_image_turbo_int8_convrot.safetensors` | `diffusion_models` | 6.2 GB |
| `qwen_3_4b_fp8_mixed.safetensors` | `text_encoders` | 5.6 GB |
| `ae.safetensors` | `vae` | 335 MB |

カタログ代替(設定のパックの*ベースモデル*スロットで差し替え):
`z_image_turbo_bf16.safetensors`(12.3 GB、フル精度、16 GB+ カード向け)と
`z_image_turbo_nvfp4.safetensors`(4.5 GB、**RTX 50 シリーズ/Blackwell のみ**)。
ComfyUI ≥ 0.3.75 が必要(Z-Image ノードはこれ以降コア)。

### Qwen-Image 2512(`qwen-image-2512`)

すべて検証済み:モデルファイルは
[`Comfy-Org/Qwen-Image_ComfyUI`](https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI)、
Lightning LoRA は
[`lightx2v/Qwen-Image-Lightning`](https://huggingface.co/lightx2v/Qwen-Image-Lightning);
スタック全体が **Apache 2.0**:

| ファイル | フォルダ | サイズ |
| --- | --- | --- |
| `qwen_image_2512_fp8_e4m3fn.safetensors` | `diffusion_models` | 20.4 GB |
| `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `text_encoders` | 9.4 GB |
| `qwen_image_vae.safetensors` | `vae` | 254 MB — **Krea 2 パックと同じファイル**、1 回のダウンロードで両方に対応 |
| `Qwen-Image-Lightning-8steps-V2.0-bf16.safetensors` | `loras` | 850 MB |

ComfyUI ≥ 0.3.49 が必要(Qwen-Image ノードはこれ以降コア)。実際には fp8 モデル +
fp8 テキストエンコーダで 24 GB カードの約 86% を使います。

### Wan 2.2 動画パック(`wan22-ti2v-5b`、`wan22-i2v-14b`)

すべて検証済み、[`Comfy-Org/Wan_2.2_ComfyUI_Repackaged`](https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged)
で **Comfy-Org** がホスト、すべて **Apache 2.0**。両パックはテキストエンコーダを
共有;VAE は異なります(Wan の癖であり誤りではありません):

| ファイル | フォルダ | サイズ | 使用パック |
| --- | --- | --- | --- |
| `wan2.2_ti2v_5B_fp16.safetensors` | `diffusion_models` | 10.0 GB | 5B |
| `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors` | `diffusion_models` | 14.3 GB | 14B |
| `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors` | `diffusion_models` | 14.3 GB | 14B |
| `wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors` | `loras` | 1.2 GB | 14B |
| `wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors` | `loras` | 1.2 GB | 14B |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `text_encoders` | 6.7 GB | 両方 |
| `wan2.2_vae.safetensors` | `vae` | 1.4 GB | 5B |
| `wan_2.1_vae.safetensors` | `vae` | 254 MB | 14B |

14B パックは 2 つのエキスパートモデルを**順に**ロードします(初期ステップは
high-noise、後期は low-noise)ため、24 GB カードが両方を同時に保持することは
ありません。Wan 2.2 の出力は**無音** — アニマティック書き出しはスチルと同様、
それらのクリップに無音を与えます。Wan ノードは ComfyUI コア(2025 年夏以降)です。

### MiniMax H3 動画パック(`minimax-h3-i2v`)

承認済みスチルを生成音声付きの短いクリップにアニメートします。テキストエンコーダと
VAE は公式 [`Comfy-Org/MiniMax-H3`](https://huggingface.co/Comfy-Org/MiniMax-H3)
Hugging Face リポジトリで検証済み;4 ファイルすべて MiniMax H3 Community License
Agreement の下:

| ファイル | フォルダ | サイズ | ソース |
| --- | --- | --- | --- |
| `minimax_h3_fl2va_pruned_nvfp4.safetensors` | `diffusion_models` | 12.5 GB | コミュニティ NVFP4 リポジトリ(検証済み、備考参照) |
| `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | `text_encoders` | 15.7 GB | Comfy-Org/MiniMax-H3 |
| `minimax_h3_video_vae_fp16.safetensors` | `vae` | 5.2 GB | Comfy-Org/MiniMax-H3 |
| `minimax_h3_audio_vae_fp32.safetensors` | `vae` | 605 MB | Comfy-Org/MiniMax-H3 |

**動画 UNET について:** 公式 Comfy-Org リポジトリは bf16 / fp8_scaled / int8_convrot
の各バリエーションを*異なる*ファイル名で出荷しています;このパックが参照する正確な
NVFP4 ファイルは Hugging Face のコミュニティ量子化リポジトリにあります
(カタログはサイズ検証済みの 1 つへリンク;バイト同一のミラーが存在)。
別のバリエーションを使う場合は、設定でパックの動画モデルを差し替えてください —
利用可否はあなたの選択に従います。

**量子化ビルドを推奨。** これは苦労して得た教訓であり推測ではありません:32 GB 前後の
非量子化 bf16 動画 UNET は 24 GB クラスカードで大規模な VRAM オフロードを強制しますが、
同じモデルの量子化ビルドは完全に GPU 上で動きます。`COMFY_MODELS_DIR` が設定されて
いる場合、StoryBored はモデルドロップダウンの背後のファイルを stat し、24 GB 超に
警告します。

## VRAM の目安

冒頭の [自分の GPU は何ができる?](#自分の-gpu-は何ができる) を参照 — あの
マトリクス*こそが*サイジングガイドであり、セットアップウィザードが自動適用します。
ボード、UI、アニマティック書き出しには GPU は一切不要です。

## カスタムノードは別の要件

パックに欠けるのはモデルファイルだけではありません:グラフは、あなたの ComfyUI が
持っていないかもしれないノードクラス(カスタムノードパック、またはインストールより
新しいコアノード)も使います。設定はそれらを*カスタムノード不足*として別に報告します —
同梱パックの前提とそれを提供するノードパックについては
[WORKFLOWS.md](WORKFLOWS.md#custom-nodes-what-availability-checks-and-what-the-shipped-packs-need)
を参照。

## 自分のモデルを持ち込む

これらのファイルはどれも StoryBored 専用ではありません — 普通の ComfyUI モデル
ファイルであり、既定パックはありうる構成の一例にすぎません。既に生成に使っている
ComfyUI があるなら、最速の道は**自分のワークフローをパックとしてラップすること**:
`python -m storybored validate-pack --write` を実行してグラフから
`required_models` を導出すれば、上記のダウンロードを完全にスキップできます。
[WORKFLOWS.md](WORKFLOWS.md) がパック作成(平文 SDXL の例を含む)を段階的に
案内します。自分のパックの不足モデル一覧にもリンクとサイズを持たせたい場合は、
ファイルごとに `DATA_DIR/workflows/catalog.json` エントリを追加してください。
StoryBored は参照ファイルが ComfyUI に存在する任意のパックを実行します — それ以上の
条件はありません。
