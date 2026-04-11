"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import { MagicImage } from "@/components/ui/magic-image";

type MarkdownRendererProps = {
  content: string;
  className?: string;
};

function CodeBlock({
  language,
  copyValue,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLPreElement> & { language: string; copyValue: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copyValue) return;

    try {
      await navigator.clipboard.writeText(copyValue);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  return (
    <div className="not-prose mx-auto my-10 overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-9 py-4">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          <span>{copied ? "コピー済み" : "コピー"}</span>
        </button>
      </div>
      <SyntaxHighlighter
        {...props}
        language={language.toLowerCase()}
        style={oneLight}
        customStyle={{
          margin: 0,
          padding: "32px 36px",
          background: "#ffffff",
          borderRadius: 0,
          fontSize: "13px",
          lineHeight: "1.7",
        }}
        codeTagProps={{
          className: cn("font-mono", className),
          style: {
            fontFamily:
              'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          },
        }}
        wrapLongLines
        PreTag="div"
      >
        {copyValue}
      </SyntaxHighlighter>
      {children ? <span className="hidden">{children}</span> : null}
    </div>
  );
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "markdown-body nodrag prose prose-zinc max-w-none text-[15px] leading-[1.75]",
        "prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:text-zinc-950",
        "prose-h1:mb-4 prose-h1:mt-9 prose-h1:text-[24px] prose-h1:leading-[1.25] prose-h1:tracking-[-0.03em]",
        "prose-h2:mb-4 prose-h2:mt-10 prose-h2:text-[20px] prose-h2:leading-[1.3] prose-h2:tracking-[-0.025em]",
        "prose-h3:mb-3 prose-h3:mt-8 prose-h3:text-[18px] prose-h3:leading-[1.35]",
        "prose-h4:mb-3 prose-h4:mt-7 prose-h4:text-[16px] prose-h4:leading-[1.4]",
        "prose-h5:mb-3 prose-h5:mt-6 prose-h5:text-[15px] prose-h5:font-semibold prose-h5:leading-[1.45] prose-h5:text-zinc-800",
        "prose-h6:mb-3 prose-h6:mt-5 prose-h6:text-[14px] prose-h6:font-semibold prose-h6:leading-[1.45] prose-h6:text-zinc-600",
        "prose-p:my-4 prose-p:text-[15px] prose-p:leading-[1.8] prose-p:text-zinc-800",
        "prose-strong:font-bold prose-strong:text-zinc-950",
        "prose-em:text-zinc-700",
        "prose-del:text-zinc-500",
        "prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6",
        "prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6",
        "prose-li:my-1 prose-li:pl-0 prose-li:text-[15px] prose-li:leading-[1.8] prose-li:text-zinc-800",
        "prose-li:marker:text-zinc-500",
        "prose-blockquote:my-9 prose-blockquote:border-0 prose-blockquote:bg-transparent prose-blockquote:py-0 prose-blockquote:pl-4 prose-blockquote:pr-0 prose-blockquote:text-[15px] prose-blockquote:leading-[1.85] prose-blockquote:text-zinc-700",
        "prose-hr:my-10 prose-hr:border-zinc-200",
        "prose-code:rounded-md prose-code:bg-[#f7f7f5] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[13px] prose-code:font-medium prose-code:text-[#b45309]",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0 prose-pre:shadow-none prose-pre:before:hidden prose-pre:after:hidden",
        "prose-table:my-0 prose-table:w-full prose-table:text-left prose-table:text-[14px]",
        "prose-thead:border-b prose-thead:border-zinc-200 prose-th:bg-zinc-50 prose-th:text-left prose-th:text-[13px] prose-th:font-semibold prose-th:text-zinc-800",
        "prose-td:border-t prose-td:border-zinc-200 prose-td:text-[14px] prose-td:leading-[1.7] prose-td:text-zinc-700",
        "prose-input:mr-2 prose-input:rounded prose-input:border-zinc-300",
        "prose-a:font-medium prose-a:text-zinc-950 prose-a:underline prose-a:decoration-zinc-300 prose-a:underline-offset-4 hover:prose-a:text-zinc-700",
        "prose-img:my-6 prose-img:w-full prose-img:rounded-2xl prose-img:border prose-img:border-zinc-200 prose-img:bg-white prose-img:shadow-sm",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ className: linkClassName, ...props }) => (
            <a
              {...props}
              className={cn("transition-colors", linkClassName)}
              target="_blank"
              rel="noreferrer"
            />
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const isInline = !codeClassName?.includes("language-");

            if (isInline) {
              return (
                <code {...props} className={cn(codeClassName)}>
                  {children}
                </code>
              );
            }

            return (
              <code
                {...props}
                className={cn(
                  "block min-w-full overflow-x-auto font-mono text-[13px] leading-6 text-zinc-100",
                  codeClassName,
                )}
              >
                {children}
              </code>
            );
          },
          pre: ({ children, className: preClassName, ...props }) => {
            const codeElement = Array.isArray(children) ? children[0] : children;
            const languageClass =
              typeof codeElement === "object" &&
              codeElement &&
              "props" in codeElement &&
              typeof codeElement.props === "object" &&
              codeElement.props &&
              "className" in codeElement.props &&
              typeof codeElement.props.className === "string"
                ? codeElement.props.className
                : "";

            const language = languageClass.replace("language-", "").toUpperCase() || "CODE";

            const copyValue =
              typeof codeElement === "object" &&
              codeElement &&
              "props" in codeElement &&
              typeof codeElement.props === "object" &&
              codeElement.props &&
              "children" in codeElement.props &&
              typeof codeElement.props.children === "string"
                ? codeElement.props.children
                : "";

            return (
              <CodeBlock language={language} copyValue={copyValue} className={preClassName} {...props}>
                {children}
              </CodeBlock>
            );
          },
          img: ({ className: imageClassName, alt, src, ...props }) => (
            <MagicImage
              src={typeof src === "string" ? src : undefined}
              alt={alt ?? ""}
              className={cn("my-6 w-full rounded-2xl border border-zinc-200 bg-white shadow-sm", imageClassName)}
              imageClassName="object-cover"
            />
          ),
          table: ({ className: tableClassName, ...props }) => (
            <div className="not-prose my-10 max-w-full overflow-x-auto">
              <div className="inline-block min-w-[560px] rounded-2xl border border-zinc-200 bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
                <div className="overflow-hidden rounded-[16px] border border-zinc-200">
                  <table
                    {...props}
                    className={cn("mb-0 mt-0 w-full table-fixed border-separate border-spacing-0", tableClassName)}
                  />
                </div>
              </div>
            </div>
          ),
          th: ({ className: tableHeadClassName, ...props }) => (
            <th
              {...props}
              className={cn(
                "bg-zinc-50 px-6 py-3.5 text-left align-top text-[13px] font-semibold text-zinc-800 first:w-[40%] first:pl-8 last:pr-8",
                tableHeadClassName,
              )}
            />
          ),
          td: ({ className: tableCellClassName, ...props }) => (
            <td
              {...props}
              className={cn(
                "border-t border-zinc-200 px-6 py-3.5 text-left align-top text-[14px] leading-[1.7] text-zinc-700 first:w-[40%] first:pl-8 last:pr-8",
                tableCellClassName,
              )}
            />
          ),
          blockquote: ({ className: blockquoteClassName, ...props }) => (
            <blockquote
              {...props}
              className={cn(
                "not-italic border-l-[4px] border-sky-200 pl-4 pr-0 text-zinc-700 [&>p]:my-0 [&>p]:text-inherit [&>p]:leading-[1.9] [&>p+p]:mt-3",
                blockquoteClassName,
              )}
            />
          ),
          h1: ({ className: headingClassName, ...props }) => (
            <h1 {...props} className={cn("font-semibold text-zinc-950", headingClassName)} />
          ),
          h2: ({ className: headingClassName, ...props }) => (
            <h2 {...props} className={cn("font-semibold text-zinc-950", headingClassName)} />
          ),
          h3: ({ className: headingClassName, ...props }) => (
            <h3 {...props} className={cn("font-semibold text-zinc-950", headingClassName)} />
          ),
          h4: ({ className: headingClassName, ...props }) => (
            <h4 {...props} className={cn("font-semibold text-zinc-900", headingClassName)} />
          ),
          strong: ({ className: strongClassName, ...props }) => (
            <strong {...props} className={cn("font-bold text-neutral-950", strongClassName)} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

