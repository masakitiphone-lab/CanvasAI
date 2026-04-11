"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type NodeCreationPanelProps = {
  open: boolean;
  mode: "root" | "reply";
  screenPosition: { x: number; y: number };
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: { content: string; files: File[]; urls: string[] }) => Promise<void>;
};

type NodeCreationPanelBodyProps = Omit<NodeCreationPanelProps, "open">;

function dedupeFiles(current: File[], incoming: File[]) {
  const existingKeys = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  const nextFiles = incoming.filter((file) => !existingKeys.has(`${file.name}:${file.size}:${file.lastModified}`));
  return current.concat(nextFiles);
}

function NodeCreationPanelBody({
  mode,
  screenPosition,
  isSubmitting,
  onClose,
  onSubmit,
}: NodeCreationPanelBodyProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [content, setContent] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, []);

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    if (incoming.length === 0) {
      return;
    }

    setPendingFiles((current) => dedupeFiles(current, incoming));
    event.target.value = "";
  };

  const handleDropFiles = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);

    const droppedFiles = Array.from(event.dataTransfer.files ?? []);
    if (droppedFiles.length === 0) {
      return;
    }

    setPendingFiles((current) => dedupeFiles(current, droppedFiles));
  };

  const handleSubmit = async () => {
    if (!content.trim() && pendingFiles.length === 0) {
      setError("本文を書くか、ファイルを追加してください。");
      return;
    }

    setError(null);
    await onSubmit({
      content,
      files: pendingFiles,
      urls: [],
    });
  };

  const handleComposerKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isSubmitting) {
      return;
    }

    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) {
      return;
    }

    event.preventDefault();
    await handleSubmit();
  };

  return (
    <div
      className="canvas-composer"
      style={{
        left: screenPosition.x,
        top: screenPosition.y,
      }}
    >
      <div
        className={cn("canvas-composer__surface", isDraggingFiles && "canvas-composer__surface--dragging")}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDraggingFiles(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDraggingFiles(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          setIsDraggingFiles(false);
        }}
        onDrop={handleDropFiles}
      >
        <div className="canvas-composer__row">
          <button
            type="button"
            className="canvas-composer__icon-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSubmitting}
            aria-label="ファイルを追加"
          >
            <Plus className="size-4" />
          </button>

          <div className="canvas-composer__spacer" />

          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={onClose} disabled={isSubmitting}>
            <X className="size-4" />
          </Button>
        </div>

        <Textarea
          ref={inputRef}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder={mode === "root" ? "書きたいことを書いてください" : "続ける内容を書いてください"}
          disabled={isSubmitting}
          className="canvas-composer__textarea nodrag nowheel mt-3 min-h-24 resize-none border-0 bg-transparent px-1 py-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {pendingFiles.length > 0 ? (
          <div className="canvas-composer__attachments">
            {pendingFiles.map((file) => (
              <Badge
                key={`${file.name}:${file.size}:${file.lastModified}`}
                variant="secondary"
                className="h-8 rounded-full pl-3 pr-1 text-sm"
              >
                <Paperclip className="mr-1 size-3.5" />
                <span className="max-w-40 truncate">{file.name}</span>
                <button
                  type="button"
                  className="ml-1 flex size-6 items-center justify-center rounded-full hover:bg-black/5"
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
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="canvas-composer__footer canvas-composer__footer--minimal">
          <div className="canvas-composer__spacer" />
          <Button
            type="button"
            size="icon"
            className="canvas-composer__send rounded-full"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            aria-label="送信"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>

        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

export function NodeCreationPanel(props: NodeCreationPanelProps) {
  if (!props.open) {
    return null;
  }

  return (
    <NodeCreationPanelBody
      key={`${props.mode}:${props.screenPosition.x}:${props.screenPosition.y}`}
      mode={props.mode}
      screenPosition={props.screenPosition}
      isSubmitting={props.isSubmitting}
      onClose={props.onClose}
      onSubmit={props.onSubmit}
    />
  );
}
