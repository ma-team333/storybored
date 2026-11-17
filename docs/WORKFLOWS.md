# エンジンパックの作成

**エンジンパック**は、ユーザーにノードグラフを見せることなく StoryBored が ComfyUI と
やり取りする仕組みです。パックは 2 つのファイルだけを含むフォルダです:

```
workflows/<pack-id>/
  manifest.json   # StoryBored がグラフについて知る必要があること
  graph.json      # API 形式の ComfyUI グラフ
```

StoryBored はパックを 2 か所でスキャンします:

- リポジトリ内の `workflows/`(StoryBored 同梱のパック)
- `DATA_DIR/workflows/`(あなたのパック — アップグレード後も残り、フォーク不要)

どちらかの場所にフォルダを置けば、エンジンセレクタに表示されます。パックが
ComfyUI にないモデルを参照している場合、StoryBored はそのパックを**利用不可として
フラグし、不足モデルを一覧表示**します — パックを隠したりクラッシュしたりしません。
不足ファイルはモデルカタログから情報が補完されます([MODELS.md](MODELS.md#the-catalog) 参照)。
パックの不足モデル一覧にダウンロードリンク・サイズ・ライセンスを持たせたい場合は、
ファイルごとに `DATA_DIR/workflows/catalog.json` エントリを追加します。

## UI からの読み込み(簡単な方法)

マニフェストを自力で書く必要はありません:**設定 → エンジン → ワークフローを読み込む**が、
StoryBored 内で API 形式の書き出しをパックに変換します。

1. ワークフローを API 形式で書き出し(次の節参照)、その `.json` をウィザードに
   ドロップします。
2. StoryBored はグラフを解析し、このドキュメントが手動で見つける方法を説明している
   マッピングを自動入力します:プロンプト(サンプラーの positive/negative conditioning
   リンクを追跡して 2 つの text encode を区別)、シード、width/height ノード、
   save ノード、差し替え可能なモデルローダー、そして LoRA の接合点
   (画像グラフなら `character_injection`、動画なら `lora_injection`)。各推測は
   グラフの候補ノードのドロップダウンです — 確認または修正します。必須はプロンプトと
   出力だけ。曖昧さ(2 つの text encode、save ノードなし)は選択肢として表示され、
   エラーにはなりません。
3. 名前を付け、id を与え、完了。パックは `DATA_DIR/workflows/<id>/` に置かれ、
   `required_models` はグラフのローダーノードから導出され(`validate-pack --write` が
   作るものとまったく同じ)、同じオフライン検証を通過し、エンジンセレクタに即座に
   表示されます — 他のパックと同様に利用可否チェックされ、不足モデル/ノードは設定に
   一覧表示されます。

読み込まれたパックには設定行に**読み込み済み**バッジと**このエンジンを削除**ボタンが
付きます。StoryBored 同梱のパックは削除できません。ウィザードが受け付けるのは
API 形式の書き出しのみ — エディタ形式の「Save」ファイルは、dev モード書き出しを
案内するメッセージとともに拒否されます。

このドキュメントの残りは手動ルートです:完全な制御(既定値、steps などの追加パラメータ、
`disable_nodes`、`required_nodes`、フレーム conditioning の調整)のために自分で
`manifest.json` を書くか、ウィザードが生成したものを理解するために読みます。

## graph.json:API 形式の書き出し

ComfyUI には 2 つのグラフ形式があります。パックが使うのは **API 形式** —
`POST /prompt` が受け付ける JSON — であって「Save」/ドラッグ&ドロップの形式では*ありません*。

書き出すには:ComfyUI で **dev モード**を有効化(設定 →「Enable Dev mode Options」)し、
**Save (API Format)** を使います。ノード id をキーにした JSON オブジェクトが得られます:

```json
{
  "3": {
    "class_type": "KSampler",
    "inputs": {
      "seed": 42,
      "steps": 8,
      "model": ["4", 0],
      "positive": ["6", 0],
      "latent_image": ["5", 0]
    }
  },
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": { "text": "a lighthouse at dusk", "clip": ["4", 1] }
  }
}
```

覚えておくべき 2 つのこと:

- **ノード id がトップレベルのキーです**(`"3"`, `"6"`, …)。文字列で、任意で、
  マニフェストが指す対象です。
- **リンクは `[node_id, output_index]` のペアです。** `"model": ["4", 0]` は
  「入力 `model` はノード 4 の出力 0 から来る」という意味。StoryBored はこれで
  キャラクター LoRA をグラフにスプライスします(後述)。

### 必要なノード id を見つける

書き出した `graph.json` を開き、`class_type` で検索します:

- **プロンプト**は通常 `CLIPTextEncode` ノードの入力 `text` にあります;
- **シード**はサンプラー上(`KSampler` → `seed`、発展サンプラーグラフでは
  `RandomNoise` → `noise_seed`);
- **width/height** は `EmptyLatentImage`(または動画ノード自体);
- **出力**はあなたの `SaveImage` / `SaveVideo` ノードです。

ヒント:書き出す前に ComfyUI エディタでノードに分かりやすいタイトルを付けましょう —
API 書き出しは id しか保持しないため、エディタ形式の `.json` を「ソース」として
取っておき、編集後に再書き出しするのが良いでしょう。

## manifest.json、フィールドごと

<a id="manifestjson-field-by-field"></a>

```json
{
  "id": "krea2-realism",
  "name": "Krea 2 — Realism stack",
  "kind": "image",
  "description": "Photoreal stills, 8-step distilled sampling.",
  "graph": "graph.json",
  "parameters": [
    {"key": "prompt", "label": "Prompt", "type": "prompt", "node": "6", "input": "text"},
    {"key": "seed",   "type": "seed", "node": "3", "input": "seed"},
    {"key": "width",  "type": "int",  "node": "5", "input": "width",  "default": 1728},
    {"key": "height", "type": "int",  "node": "5", "input": "height", "default": 1152}
  ],
  "output_node": "9",
  "character_injection": {"after_node": "lora_7", "disable_nodes": ["lora_1", "lora_2", "lora_3", "lora_4", "lora_6", "lora_7"]},
  "required_models": {
    "UNETLoader.unet_name": ["krea2_raw_fp8_scaled.safetensors"]
  }
}
```

| フィールド | 必須 | 意味 |
| --- | --- | --- |
| `id` | はい | 一意な slug。フォルダ名と一致する必要があります。テイクに保存される(`take.workflow_id`)ため、変更すると履歴が孤立します — 一度決めたら変えないこと。 |
| `name` | はい | エンジンセレクタに表示される人間向けラベル。 |
| `kind` | はい | `"image"` または `"video"`。どの UI がパックを提示するか、ジョブ前にどの GPU モードコマンドを実行するか(`COMFY_MODE_IMAGE_CMD` / `COMFY_MODE_VIDEO_CMD`)を決めます。 |
| `description` | いいえ | 名前の下に表示される 1〜2 文。 |
| `graph` | はい | API 形式グラフのファイル名。パックフォルダからの相対パス。慣例では `graph.json`。 |
| `parameters` | はい | StoryBored が操作できる knobs。各エントリは UI パラメータを 1 つのノード入力にマップします:エンジンは文字どおり `graph[node]["inputs"][input] = value` を実行します。エントリごとのフィールド:`key`(パック内で一意)、任意の `label`(UI テキスト;既定は key)、`type`(後述)、`node`(ノード id 文字列)、`input`(そのノードの入力名)、任意の `default`。 |
| `output_node` | はい | `SaveImage` / `SaveVideo` ノードの id。StoryBored はテイクごとにその `filename_prefix` を書き換え、このノードについて ComfyUI 履歴から結果を読みます。 |
| `character_injection` | いいえ | `@character` LoRA のスプライス先(画像パック;次節参照)。省略するとパックはキャラクターを単に無視します。接合ノードに clip 出力がない場合(素の `UNETLoader`、model-only LoRA チェーン — Z-Image/Qwen-Image グラフ)は `"class_type": "LoraLoaderModelOnly"` を追加します。キャラクターは model パスのみでスプライスされ、存在しない clip 出力を参照しなくなります。 |
| `lora_injection` | いいえ | パックに `character_injection` がない場合(動画パック)にユーザー追加 LoRA がスプライスされる場所:`{"after_node": "1", "class_type": "LoraLoaderModelOnly"}`。`class_type` の既定は `LoraLoader`;model-only ローダーは model パスのみを扱います(clip なし)。 |
| `model_slots` | いいえ | ユーザーが設定から差し替えられるローダー入力:`[{"key": "unet", "label": "Base model", "node": "1", "input": "unet_name"}]`。UI は各スロットのエンジンのドロップダウン enum を一覧表示し、選択は `engine_models` 設定に保存され、レンダリング時に入力へ書き込まれます。 |
| `frame_conditioning` | いいえ | サンプラーが先頭フレーム画像と末尾フレーム画像の両方を受け付ける動画パック:`{"node": "6", "first": "first_frame", "last": "last_frame"}`。ショットレベルの「スチルを先頭/末尾フレームにアンカー」トグルが有効になります — 「last」は先頭入力に与えられるものを末尾入力へ移します。 |
| `required_models` | いいえ | `"<ClassType>.<input_name>"` → グラフが必要とするモデルファイル名リストのマップ。ComfyUI の `/object_info` enum に対して検証(60 秒キャッシュ);不一致は不足名を一覧してパックを利用不可にします。利用可否チェックは**実効的な**セットに対して行われます:ユーザーの設定でのモデル差し替えは焼き込まれたファイル名を置き換え、ユーザーが OFF にした焼き込み LoRA は必須になりません。 |
| `required_nodes` | いいえ | グラフが既に参照しているものを超えて追加で要求するノード**クラス名**(めったに不要 — グラフ内の全 `class_type` は自動チェックされます)。不足クラスは「カスタムノード不足」一覧とともにパックを利用不可にし、ユーザーはモデルファイルではなくノードパックが必要だと分かります。 |
| `license_note` | いいえ | パックの**モデルライセンス**の現実的な注意点についての正直な 1〜2 文 — 領域除外、収益上限、撤回可能な許諾、ハードウェア固定の既定ファイル。パックの設定行とセットアップウィザードのエンジン一覧に小さな警告行として表示されます。クリーンなライセンス(Apache/MIT)では省略;マーケティングには使わないこと。同梱の Krea 2 パック(community license: 収益 $1M 未満、撤回可能)と `minimax-h3-i2v`(US/EU/UK/韓国領域除外 + Blackwell 専用の既定ファイル)に例があります。 |
| `lora_family` | いいえ | このパックのキャラクター LoRA が属すべき**モデルファミリー** — `"krea2"`、`"z-image"`、`"qwen-image"` のような小文字 slug。キャラクター LoRA はファミリー縛りです(Krea 2 用に学習したものは Z-Image では無効)なので、StoryBored はこの id でレンダリングを事前チェックします:記録されたファミリーがパックと異なるキャラクターを起用したショットは、キューに入る前に明確な 409 で拒否され、ショットドロワーはそのようなエンジンを「キャラクター非対応」と表示します。学習のターゲットでもあります:トレーナーは既定画像エンジンのファミリーの LoRA を作るよう指示されます。ファミリー非依存のパックでは省略 — 省略は「チェックなし」であり、決してブロックではありません。同梱の画像パックは `krea2`(Krea 2 パック両方)、`z-image`、`qwen-image` を宣言しています。 |
| `prompt_guide` | いいえ | 執筆アシスタントに*あなたのモデル*がどうプロンプトされるべきかを教えます:`{"style": "<1 段落の説明>", "examples": ["<良いプロンプト>", ...]}`(examples は任意、最大 3)。あなたのパックが結果をレンダリングするエンジンであるとき、すべての LLM プロンプト組み立てパス — 強化(Enhance)、脚本/ストーリーモード分解、モーション下書き — に注入されます。不正なガイドはログに記録されて無視され、致命的にはなりません。後述「アシスタントにあなたのモデルのプロンプトスタイルを教える」参照。 |

### パラメータ型

| `type` | UI | 備考 |
| --- | --- | --- |
| `prompt` | ショットの説明テキストエリア | 値がグラフに書き込まれる前に、`@handles` は各キャラクターの `"{trigger} {class_word}"` に置換されます。すべての画像パックはこれをちょうど 1 つ持つべきです。 |
| `seed` | 非表示 | StoryBored はテイクごとに新しいランダムシードを割り当ててテイクに保存するため、テイクは再現可能です。 |
| `int` / `float` | 数値フィールド | `default` で事前入力。 |
| `string` | テキストフィールド | 自由テキスト(スタイル接尾辞など)。 |
| `image` | 非表示(動画パック) | StoryBored はショットの承認済みスチルを `POST /upload/image` でアップロードし、アップロード名をここに書き込みます。 |

### 動画パック

`kind: "video"` のマニフェストは 2 つの慣例的パラメータを追加します:

```json
{"key": "first_frame", "type": "image", "node": "5", "input": "image"},
{"key": "length",      "type": "int",   "node": "6", "input": "length"}
```

`first_frame` は承認済みスチルを受け取り、`length` はクリップ長(フレーム数)です。
ショットの `motion_prompt` がパックの `prompt` パラメータに渡されます。
同梱の例は `workflows/minimax-h3-i2v/` を参照(LoadImage →
image-to-video ノード → サンプラー → video+audio デコード → `SaveVideo`)。

動画パックは `lora_injection`(設定から動画 LoRA 追加)、`model_slots`
(動画 UNET をファインチューンに差し替え)、`frame_conditioning`
(スチルをクリップの先頭ではなく*末尾*にアンカー)も宣言できます —
上記のマニフェストフィールド表と、3 つすべてを使う同梱 minimax パックを参照。
`frame_conditioning` はグラフのサンプラー/latent ノードが**本当に**末尾フレーム入力を
持つときだけ宣言してください:同梱の Wan 2.2 パックは正直に省略しています
(latent ノードは開始画像のみ受け付けます)ため、これらにはフレーム位置トグルが
単に表示されません。`wan22-i2v-14b` は**デュアルエキスパート**グラフの同梱例:
2 つの UNETLoader を 2 つの `model_slots` として宣言、2 段のチェーンされた
`KSamplerAdvanced` パス、最初の(ノイズ追加)サンプラーに 1 つのシードパラメータ。

## キャラクター注入の仕組み

<a id="character-injection-explained"></a>

StoryBored のキャラクターは LoRA です。ショットが `@sam` に言及すると、生成時に
エンジンが Sam の LoRA をあなたのグラフにスプライスします — パックは*どこ*かを
宣言するだけです:

```json
"character_injection": {"after_node": "lora_7", "disable_nodes": ["lora_1", "lora_2", "lora_3", "lora_4", "lora_6", "lora_7"]}
```

美系 LoRA(実写風、ディテーラー、「美顔」LoRA)は自分の顔で学習されているため、
キャラクター LoRA の同一性と衝突し — 多くの場合圧倒します — したがって
`disable_nodes` には美系スタックの*全体*を列挙すべきです;キャラクターと共存させるのは
同一性に中立なユーティリティ(フィルタバイパス、turbo distill)だけにします。
チェックポイント選抜テストは同じパックで同じ除外を使ってレンダリングするため、
その類似スコアはメイクアップではなくキャラクターを測ります。

- **`after_node`** — キャラクター LoRA がぶら下がるべき MODEL/CLIP 出力を持つノード。
  通常はスタイルチェーンの*最後*の `LoraLoader`(チェーンがなければ
  checkpoint/UNET ローダー)。機械的には、各ショットキャラクターに対してエンジンは:
  1. 新しい `LoraLoader` ノードを挿入し、その `model`/`clip` 入力を
     `[after_node, 0]` / `[after_node, 1]` に向け、キャラクターの `lora_name` と
     `lora_strength` を設定;
  2. `[after_node, 0]` か `[after_node, 1]` を参照していた他の*すべての*ノードを、
     新しいノードから読むよう配線し直し;
  3. 追加キャラクターを順にチェーンします(キャラクター 2 はキャラクター 1 の
     ノードにぶら下がる、など)。
- **`disable_nodes`** — キャラクター LoRA が有効な間、`strength_model`/`strength_clip`
  を `0` にするノード id。学習された同一性と衝突するスタイル/美系 LoRA に使います
  (同梱の `krea2-realism` パックでは、キャラクターがショットにいるとき 2 つの
  「美顔」LoRA が無効化されます)。ノードはグラフに残るため、キャラクター*なし*の
  ショットはフルのスタイルスタックを保ちます。

プロンプト側:説明内の `@sam` は、プロンプトがグラフに書き込まれる前に Sam の
`"{trigger} {class_word}"`(例:`"zxsam person"`)になります — trigger トークンは
LoRA が学習された応答対象です。

**ファミリー。** キャラクター LoRA は学習されたモデルファミリーでしか動きません。
`lora_family` マニフェストキーでパックのファミリーを宣言すれば(フィールド表参照)、
StoryBored はゴミレンダリングの代わりに有用なメッセージとともに、Krea 2 キャラクターを
Z-Image グラフにスプライスすることを拒否できます。ファミリー未記録のキャラクターと
キーのないパックはファミリー非依存として扱われます:欠損値で何かがブロックされることは
決してありません。

**model-only 接合点。** 上記の機構は、接合ノードが MODEL と CLIP の両方の出力を
持つ前提です(checkpoint ローダーかフル `LoraLoader` チェーン)。テキストエンコーダが
LoRA チェーンを経由しないグラフ — Z-Image や Qwen-Image 方式で、接合点が素の
`UNETLoader` か `LoraLoaderModelOnly` の場合 — は
`"character_injection": {"after_node": "...", "class_type": "LoraLoaderModelOnly"}`
を宣言します。キャラクター(と、同じ接合点を再利用するスタイル/エンジン LoRA)は
model-only ローダーとしてスプライスされます:`clip` 入力なし、`strength_clip` なし、
出力 0 のみの配線し直し。これはそれらのモデルファミリーでは正しい動作です —
LoRA は transformer のみに効くためです。読み込みウィザードは接合ノードの型から
正しいクラスを自動提案します。

## アシスタントにあなたのモデルのプロンプトスタイルを教える(`prompt_guide`)

すべての画像/動画モデルファミリーにはプロンプトの方言があります — 流れるような
写真散文を好むもの、簡潔なアクション行を好むもの、末尾の `Audio:` 文のような
慣例を持つもの。任意の `prompt_guide` マニフェストキーで、パックが StoryBored の
執筆アシスタントにその方言を教えられるため、*強化(Enhance)*、脚本/ストーリーモード分解、
モーション下書きが、汎用ではなく**あなたの**エンジン向けに書かれるようになります:

```json
"prompt_guide": {
  "style": "One paragraph describing how this model wants to be prompted — sentence structure, what to always state (wardrobe, lighting, lens), what to avoid (tag lists, weights).",
  "examples": [
    "A complete example prompt in exactly the style your model responds to best."
  ]
}
```

- **`style`**(必須)— プロンプト作成者への指示として書かれた 1 段落。含めるもの、
  その形、避けるべきものを述べます。
- **`examples`**(任意、最大 3)— 対象スタイルの完成プロンプト。3 つの凡庸な例より
  1〜2 個の強い例が勝ります。システムプロンプトにそのまま貼り付けるため、短く
  自己完結的に保ってください。

ガイドは、あなたのパックが実際にレンダリングするエンジンであるとき — ショット
ドロワーで選択されたエンジン、または設定された既定画像/動画ワークフロー — アシスタントの
システムプロンプトの明確に区切られたセクションとして注入されます。ガイドのないパックは
単に汎用のプロンプト規則を得ます — 何も壊れません。不正なガイドはロード時に
ログ記録されて無視され(`validate-pack` は具体的な問題を警告)、動いているパックを
沈めることは決してありません。

同梱パックには参考にできるガイドがあります:Krea 2、Z-Image、Qwen-Image パックは
写真散文によるスチルプロンプティングを説明し(Qwen はその verbatim テキストレンダリング
慣例を追加)、Wan 2.2 パックは無音のモーション散文を、`minimax-h3-i2v` は
`Audio:` 行の慣例付きモーション散文を説明します。

## 実行時 LoRA レイヤー:パックに触れずにユーザーが変えられるもの

アプリがパックのファイルを編集することは決してありません。代わりに、設定が 3 つの
JSON 設定を保存し、それがレンダリング時にグラフへ適用されるため、ユーザーは UI から
エンジンを調整し、ワンクリックであなたの既定に戻れます:

- **エンジンごとの編集**(設定 → エンジン → 行を展開):グラフ内の全 `LoraLoader`
  がチェーン順に強度つきで一覧表示されます。ユーザーはどれでも OFF にでき
  (両強度が 0 に強制され — ノード削除とレンダリング結果は同一)、強度を変更でき、
  エンジンへ追加 LoRA を**追加**できます。`engine_loras` 設定にパック id キーで保存;
  オーバーライドはあなたのノード id を参照するため、パック更新でのノード名変更は単に
  古いオーバーライドを無効化します(不明 id は無視され、致命的ではありません)。
- **スタイル LoRA**(設定 → スタイル LoRA):エンジンに関係なく*すべての*画像
  レンダリングに重ねられるグローバルリストで、各項目に ON/OFF トグルと強度があります。
  `style_loras` 設定に保存されます。
- **モデル差し替え**(設定 → エンジン → 行を展開 → モデル):各 `model_slots` エントリが
  エンジンのインストール済みファイルのドロップダウンになり、別のベースモデルや
  ファインチューンでパックを実行できます。`engine_models` 設定にパック id キーで保存;
  不明なスロットキーは無視され、致命的ではありません。

両種類の追加 LoRA は、あなたの `character_injection.after_node` — キャラクターが使うのと
同じ接合点 — でグラフにスプライスされます(キャラクターのないパック、例えば動画パックは、
代わりに `lora_injection` で接合点を宣言します)。最終チェーン順は常に:

```
あなたの焼き込みスタック → エンジン追加 → スタイル LoRA → キャラクター LoRA → サンプラー
```

キャラクター LoRA が最後なのは意図的です:同一性がスタイルに勝つ。パック作者への
2 つの帰結:

1. `after_node` は*すべての*実行時 LoRA 挿入の接合点であり、キャラクター限定では
   ありません — キャラクターを狙わないパックでも、同梱する最後の LoRA の後に置きます。
2. `character_injection` のないパックでもノードごとの強度/OFF オーバーライドは
   得られますが、独自の `lora_injection` 接合点を宣言しない限りユーザーは LoRA を
   追加できません。

エンジン一覧はどのパックが種別ごとの**既定**か(ショットが明示的にエンジンを選ばないとき
使われる)も表示し、ユーザーは変更できます — `default_image_workflow` /
`default_video_workflow` 設定に裏付けられています。

## 実例:独自の txt2img ワークフローをパッケージする

好きな普通の SDXL 方式ワークフローがあるとします。API 形式で書き出します:

```json
{
  "1": {"class_type": "CheckpointLoaderSimple",
        "inputs": {"ckpt_name": "my_model.safetensors"}},
  "2": {"class_type": "CLIPTextEncode",
        "inputs": {"text": "PROMPT HERE", "clip": ["1", 1]}},
  "3": {"class_type": "CLIPTextEncode",
        "inputs": {"text": "blurry, low quality", "clip": ["1", 1]}},
  "4": {"class_type": "EmptyLatentImage",
        "inputs": {"width": 1216, "height": 832, "batch_size": 1}},
  "5": {"class_type": "KSampler",
        "inputs": {"seed": 0, "steps": 25, "cfg": 6.5,
                   "sampler_name": "euler", "scheduler": "normal", "denoise": 1,
                   "model": ["1", 0], "positive": ["2", 0],
                   "negative": ["3", 0], "latent_image": ["4", 0]}},
  "6": {"class_type": "VAEDecode",
        "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
  "7": {"class_type": "SaveImage",
        "inputs": {"filename_prefix": "storybored", "images": ["6", 0]}}
}
```

グラフの読み方:プロンプト = ノード `"2"` の入力 `text`;シード = ノード `"5"` の入力
`seed`;サイズ = ノード `"4"`;出力 = ノード `"7"`;キャラクターは checkpoint ローダー、
ノード `"1"` にぶら下がるべき。よって:

```json
{
  "id": "my-sdxl",
  "name": "My SDXL look",
  "kind": "image",
  "description": "My favorite general-purpose look.",
  "graph": "graph.json",
  "parameters": [
    {"key": "prompt", "label": "Prompt", "type": "prompt", "node": "2", "input": "text"},
    {"key": "seed",   "type": "seed", "node": "5", "input": "seed"},
    {"key": "width",  "type": "int",  "node": "4", "input": "width",  "default": 1216},
    {"key": "height", "type": "int",  "node": "4", "input": "height", "default": 832}
  ],
  "output_node": "7",
  "character_injection": {"after_node": "1"},
  "required_models": {
    "CheckpointLoaderSimple.ckpt_name": ["my_model.safetensors"]
  }
}
```

両ファイルを `DATA_DIR/workflows/my-sdxl/` に置き、設定を更新すると — パックが表示され、
あなたの ComfyUI に対して利用可否チェックされます。これが全工程です。

## パックの検証(`validate-pack`)

下のリストを目視確認しないでください — リポジトリはそれを行うオフライン linter を
同梱しており、グラフのローダーノードから直接 `required_models` を導出するため、
ファイル名を手作業で転記する必要もありません:

```bash
python -m storybored validate-pack workflows/my-pack          # check
python -m storybored validate-pack workflows/my-pack --write  # + fix required_models
python -m storybored validate-pack workflows/*/               # CI: all packs
```

ComfyUI 不要で、パックごとに以下をチェックします:

- マニフェストが解析でき、まともな形状(`id` がフォルダ名と一致、`kind` は
  image/video、パラメータ型が既知、キー重複なし);
- グラフが本当に **API 形式**であり、マニフェストが参照する全ノード id
  (`parameters`、`output_node`、`model_slots`、`character_injection`、
  `lora_injection`、`frame_conditioning`)がグラフ内に存在;
- `required_models` がグラフのローダーノードが実際にロードするものと一致
  (`UNETLoader`、`CLIPLoader`、`DualCLIPLoader`、`VAELoader`、`LoraLoader`、
  `LoraLoaderModelOnly`、`CheckpointLoaderSimple`)。不一致は `DRIFT` として報告され;
  `--write` はマニフェストの該当セクションをグラフから再生成します。カスタムノード
  クラスがロードするファイルはオフラインで導出できません — `WARN` が有力候補を指し、
  それらは手動で列挙します。

終了コード:`0` 全パック有効、`1` 検証エラーまたは drift(CI は失敗すべき)、
`2` 使用法/IO の問題。

## カスタムノード:利用可否チェックの対象と同梱パックの必要物

<a id="custom-nodes-what-availability-checks-and-what-the-shipped-packs-need"></a>

利用可否はモデルファイルだけの話ではありません。StoryBored はグラフが使う
**全ノードクラス**をエンジンの `/object_info` に対してもチェックし、エンジンが知らない
クラスは設定に*カスタムノード不足*として一覧されるため、ユーザーはダウンロードではなく
ノードパック(または新しい ComfyUI)が必要だと分かります。任意のマニフェスト
`required_nodes` リストは、グラフが参照するものを超えたクラスを追加します。

同梱パックの前提:

- `PathchSageAttentionKJ`(typo が実際のクラス名)— **ComfyUI-KJNodes** カスタム
  ノードパック(registry 名 `comfyui-kjnodes`)から。追加で ComfyUI の環境に
  `sageattention` Python ライブラリのインストールが必要。`krea2-basic` と
  `krea2-realism` が使用。
- `MiniMaxH3MemoryEfficientSageAttentionPatch` — 同じく **ComfyUI-KJNodes** から
  (実験的;最近の `sageattention` が必要)。`minimax-h3-i2v` が使用。
- `MiniMaxH3ImageToVideo` — **ComfyUI コア**だが最近のビルドのみ(公式 MiniMax H3
  例ページによれば ComfyUI ≥ 0.30.0)。古い ComfyUI は未インストールのノードパックと
  同じように欠損を報告します。
- `CreateVideo`、`SaveVideo`、`VAEDecodeAudio` — ComfyUI コアの動画/音声ノード
  (2025 年春に追加された動画型サポート以降に存在)。

ティア推奨の 4 パックは**カスタムノードを一切必要としません** — 使用する全クラスが
ComfyUI コアで、次のバージョン下限があります:

- `z-image-turbo` — Z-Image サポート(`lumina2` CLIP 型の
  `ModelSamplingAuraFlow`)は **ComfyUI 0.3.75** 以降コア。
- `qwen-image-2512` — Qwen-Image サポート(`qwen_image` CLIP 型)は
  **ComfyUI 0.3.49** 以降コア。
- `wan22-ti2v-5b` / `wan22-i2v-14b` — `Wan22ImageToVideoLatent` /
  `WanImageToVideo` は Wan 2.2 リリース(2025 年夏)以降コア。古い ComfyUI は
  未インストールのノードパックと同じように欠損を報告します。

## パック共有前のチェックリスト

`python -m storybored validate-pack <dir>` は最後の項目以外を自動チェックします:

- [ ] `graph.json` が **API 形式**(トップレベルキーはノード id であり、
      `nodes` 配列ではない)。
- [ ] マニフェストの `id` がフォルダ名と一致;全 `parameters[].node` /
      `input` がグラフ内に存在。
- [ ] `output_node` は save ノード;その `filename_prefix` はそのまま
      (StoryBored がテイクごとに上書き)。
- [ ] `required_models` がグラフがロードする全モデルファイルをカバー
      (`validate-pack --write` で生成)— これがあるからユーザーは暗号のような
      ComfyUI エラーではなく有用な「missing: …」メッセージを得られます。
- [ ] `character_injection.after_node` はチェーンの*最後*の LoRA を指す —
      キャラクター、スタイル LoRA、ユーザー追加 LoRA すべての接合点です
      (上記「実行時 LoRA レイヤー」参照)。
- [ ] 学習済みキャラクター LoRA がこのパックで動くべき(そして誤ファミリーを
      ガードされるべき)なら `lora_family` でモデルファミリーを宣言 — 本当に
      ファミリー非依存のグラフでのみ省略。
- [ ] 両ファイルに絶対パス、ホスト名、個人的な LoRA 名がない。
