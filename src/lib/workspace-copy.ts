export const CANVAS_COPY = {
  syncIndicator: "Synchronizing with cloud...",
  fileUploadFailed: "ファイルの読み込みに失敗しました。",
  geminiRequestFailed: "AI のリクエストに失敗しました。",
  geminiStreamFailed: "AI のストリームが途中で終了しました。",
  imageRequestFailed: "画像生成のリクエストに失敗しました。",
  attachmentUploadFailed: "添付ファイルのアップロードに失敗しました。",
  deepResearchUnavailable:
    "Deep Research はまだ有効化されていません。通常モードで利用してください。",
  generateFailedPrefix: "生成に失敗しました。",
  imageGenerateFailedPrefix: "画像生成に失敗しました。",
} as const;

export const SETTINGS_COPY = {
  description:
    "既定のテキストモデル、画像モデル、クレジット利用状況をまとめて管理します。余計な演出は削って、必要な設定だけを見やすくしています。",
  creditsDescription:
    "毎日付与されるクレジットの残高と最近の消費履歴です。生成失敗時の返金や、おおよその消費量もここで確認できます。",
} as const;

export const PLANS_COPY = {
  intro:
    "料金プランはまだ仮置きです。今は無料クレジット運用が中心で、将来的に有料プランとチーム課金を接続する想定です。",
  freeDescription: "日常的な試作と検証向けの無料枠です。基本機能を一通り使えます。",
  proDescription: "より重いモデルを安定して使いたい個人向けの拡張プランです。",
  teamDescription: "共有ワークスペース、監査、請求の集約を想定したチーム向けプランです。",
  rolloutDescription:
    "現時点では無料枠が本番運用中で、有料課金の実装は後続タスクです。見た目だけ先に派手にしても意味がないので、必要な情報だけを残しています。",
} as const;
