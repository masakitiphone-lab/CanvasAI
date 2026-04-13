"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Paperclip, RefreshCcw, Sparkles, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { ConversationAttachment, ConversationModelName } from "@/lib/canvas-types";

const MODEL_OPTIONS: Array<{ name: ConversationModelName; label: string; description: string }> = [
  {
    name: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    description: "最新の高速・マルチモーダル対応。普段使いに最適です。",
  },
  {
    name: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    description: "最上位の推論能力。複雑な思考回路での書き直しに向いています。",
  },
  {
    name: "gemini-3-flash-preview",
    label: "Gemini 3 Flash Preview",
    description: "安定した高精度推論。コーディングや長文の整理に。",
  },
];

type AiRegeneratePanelProps = {
  open: boolean;
  isSubmitting: boolean;
  initialModelName: ConversationModelName;
  existingAttachments: ConversationAttachment[];
  onClose: () => void;
  onSubmit: (payload: {
    modelName: ConversationModelName;
    files: File[];
    urls: string[];
    keepExistingAttachments: boolean;
  }) => Promise<void>;
};

type AiRegeneratePanelBodyProps = Omit<AiRegeneratePanelProps, "open">;

function AiRegeneratePanelBody({
  isSubmitting,
  initialModelName,
  existingAttachments,
  onClose,
  onSubmit,
}: AiRegeneratePanelBodyProps) {
  const [modelName, setModelName] = useState<ConversationModelName>(initialModelName);
  const [keepExistingAttachments, setKeepExistingAttachments] = useState(existingAttachments.length > 0);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = useMemo(
    () => MODEL_OPTIONS.find((option) => option.name === modelName) ?? MODEL_OPTIONS[0],
    [modelName],
  );

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);

    if (incoming.length === 0) {
      return;
    }

    setPendingFiles((current) => {
      const existingKeys = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      const deduped = incoming.filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
      return current.concat(deduped);
    });

    event.target.value = "";
  };

  const handleSubmit = async () => {
    setError(null);
    await onSubmit({
      modelName,
      files: pendingFiles,
      urls: [],
      keepExistingAttachments,
    });
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/65 p-6 backdrop-blur-sm">
      <Card className="w-full max-w-2xl rounded-3xl border-border/70 bg-card/96 shadow-xl">
        <CardHeader className="gap-3 border-b border-border/60 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="eyebrow">AI Regenerate</p>
              <div>
                <CardTitle className="text-xl font-semibold tracking-tight">再生成の設定</CardTitle>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  モデルを選び直して、必要ならファイルも足したうえで再生成できます。
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl border-border/70 bg-background"
              onClick={onClose}
              disabled={isSubmitting}
            >
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5 px-6 py-5">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">モデル</p>
            <div className="grid gap-3 md:grid-cols-3">
              {MODEL_OPTIONS.map((option) => (
                <Button
                  key={option.name}
                  type="button"
                  variant={modelName === option.name ? "default" : "outline"}
                  className="h-auto min-h-20 flex-col items-start justify-start rounded-2xl px-4 py-3 text-left"
                  onClick={() => setModelName(option.name)}
                  disabled={isSubmitting}
                >
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span className="mt-1 text-xs leading-5 opacity-80">{option.description}</span>
                </Button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">現在の選択: {selectedModel.label}</p>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">既存の添付</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  いま付いているファイルをそのまま引き継ぐか切り替えられます。
                </p>
              </div>
              <Button
                type="button"
                variant={keepExistingAttachments ? "default" : "outline"}
                className="rounded-xl"
                onClick={() => setKeepExistingAttachments((current) => !current)}
                disabled={isSubmitting || existingAttachments.length === 0}
              >
                <Paperclip className="size-4" />
                {keepExistingAttachments ? "引き継ぐ" : "引き継がない"}
              </Button>
            </div>

            <ScrollArea className="max-h-32 rounded-xl border border-border/70 bg-background px-3 py-3">
              <div className="space-y-2">
                {existingAttachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">既存の添付ファイルはありません。</p>
                ) : (
                  existingAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{attachment.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{attachment.url}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full border-border/70 bg-background text-xs text-muted-foreground"
                      >
                        {attachment.kind}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">追加ファイル</p>
              <Input
                type="file"
                accept="image/*,.pdf,application/pdf"
                multiple
                onChange={handleFileSelect}
                disabled={isSubmitting}
                className="rounded-xl border-border/70 bg-background"
              />
            </div>

            <ScrollArea className="max-h-36 rounded-xl border border-border/70 bg-background px-3 py-3">
              <div className="space-y-2">
                {pendingFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">追加予定のファイルはありません。</p>
                ) : (
                  pendingFiles.map((file) => (
                    <div
                      key={`${file.name}:${file.size}:${file.lastModified}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{file.type || "unknown type"}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="rounded-xl"
                        onClick={() =>
                          setPendingFiles((current) =>
                            current.filter(
                              (entry) =>
                                `${entry.name}:${entry.size}:${entry.lastModified}` !==
                                `${file.name}:${file.size}:${file.lastModified}`,
                            ),
                          )
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full border-border/70 bg-background text-muted-foreground">
              <RefreshCcw className="size-3.5" />
              追加条件込みで再生成
            </Badge>
            <Badge variant="outline" className="rounded-full border-border/70 bg-background text-muted-foreground">
              <Upload className="size-3.5" />
              ファイルは再生成リクエストに含まれます
            </Badge>
            <Badge variant="outline" className="rounded-full border-border/70 bg-background text-muted-foreground">
              <Sparkles className="size-3.5" />
              モデルはノードごとに変更できます
            </Badge>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl border-border/70 bg-background"
              onClick={onClose}
              disabled={isSubmitting}
            >
              キャンセル
            </Button>
            <Button type="button" className="rounded-xl" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "再生成中..." : "この設定で再生成"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AiRegeneratePanel(props: AiRegeneratePanelProps) {
  if (!props.open) {
    return null;
  }

  return (
    <AiRegeneratePanelBody
      key={`${props.initialModelName}:${props.existingAttachments.length}:${props.open ? "open" : "closed"}`}
      isSubmitting={props.isSubmitting}
      initialModelName={props.initialModelName}
      existingAttachments={props.existingAttachments}
      onClose={props.onClose}
      onSubmit={props.onSubmit}
    />
  );
}
