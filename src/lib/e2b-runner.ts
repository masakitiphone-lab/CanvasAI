import Sandbox from "e2b";
import { readAttachmentBinary, storeGeneratedAttachmentBuffer } from "@/lib/attachment-store";
import type { ConversationAttachment } from "@/lib/canvas-types";

export type E2BStagedInput = {
  name: string;
  path: string;
  kind: ConversationAttachment["kind"];
  mimeType: string;
  url: string;
  storagePath?: string;
};

export type E2BArtifact = {
  name: string;
  path: string;
  mimeType: string;
  bytesBase64: string;
};

export type E2BRunResult = {
  success: boolean;
  errorMessage: string | null;
  stdout: string;
  stderr: string;
  detectedPackages: string[];
  installedPackages: string[];
  failedPackages: Array<{ name: string; error: string }>;
  files: E2BArtifact[];
  stagedInputs: E2BStagedInput[];
};

const DEFAULT_INSTALL_PACKAGES: string[] = [];

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:\0]/g, "_").replace(/\s+/g, " ").trim() || "attachment";
}

function inferRequestedFormats(prompt: string) {
  const lowered = prompt.toLowerCase();
  const formats = new Set<string>();
  if (/\bpdf\b/.test(lowered)) formats.add("pdf");
  if (/\bdocx?\b/.test(lowered) || /word/.test(lowered)) formats.add("docx");
  if (/\bxlsx?\b/.test(lowered) || /\bexcel\b/.test(lowered)) formats.add("xlsx");
  if (/\bcsv\b/.test(lowered)) formats.add("csv");
  if (/\bpptx?\b/.test(lowered) || /\bpowerpoint\b/.test(lowered)) formats.add("pptx");
  return Array.from(formats);
}

function inferAttachmentFormat(attachment: { name: string; mimeType?: string; kind?: string }) {
  const name = attachment.name.toLowerCase();
  const mimeType = attachment.mimeType?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || name.endsWith(".docx")) {
    return "docx";
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || name.endsWith(".xlsx")) {
    return "xlsx";
  }
  if (mimeType === "text/csv" || name.endsWith(".csv")) return "csv";
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || name.endsWith(".pptx")) {
    return "pptx";
  }
  return attachment.kind ?? "file";
}

function detectPackages(code: string) {
  const detected = new Set<string>();
  const push = (name: string) => detected.add(name);

  if (/\bimport\s+docx\b/.test(code) || /\bfrom\s+docx\b/.test(code)) push("python-docx");
  if (/\breportlab\b/.test(code)) push("reportlab");
  if (/\bimport\s+pandas\b/.test(code) || /\bfrom\s+pandas\b/.test(code)) push("pandas");
  if (/\bimport\s+openpyxl\b/.test(code) || /\bfrom\s+openpyxl\b/.test(code)) push("openpyxl");
  if (/\bimport\s+pypdf\b/.test(code) || /\bfrom\s+pypdf\b/.test(code) || /\bimport\s+PyPDF2\b/.test(code) || /\bfrom\s+PyPDF2\b/.test(code)) push("pypdf");
  if (/\bimport\s+fitz\b/.test(code) || /\bfrom\s+fitz\b/.test(code)) push("pymupdf");
  if (/\bimport\s+PIL\b/.test(code) || /\bfrom\s+PIL\b/.test(code) || /\bpillow\b/.test(code)) push("pillow");

  return Array.from(detected);
}

function getInstallPackages(code: string) {
  const detected = detectPackages(code);
  const installPackages = new Set<string>(DEFAULT_INSTALL_PACKAGES);

  for (const packageName of detected) {
    installPackages.add(packageName);
  }

  return Array.from(installPackages);
}

function normalizeStringList(values: unknown) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function buildPrelude(prompt: string, attachments: ConversationAttachment[]) {
  const requestedFormats = inferRequestedFormats(prompt);
  const attachmentNotes = attachments.map((attachment) => {
    const actualFormat = inferAttachmentFormat(attachment);
    const requestedFormat = requestedFormats[0] ?? null;
    const mismatch = requestedFormat && requestedFormat !== actualFormat
      ? ` (user asked for ${requestedFormat.toUpperCase()}, actual file is ${actualFormat.toUpperCase()})`
      : "";
    return `- ${attachment.name}: ${actualFormat}${mismatch}`;
  });

  return [
    "## Execution guidance",
    "- The sandbox is E2B, not Pyodide.",
    "- Inputs live in /workspace and /workspace/inputs.",
    "- If the user asks for PDF but the real file is DOCX, use python-docx or a DOCX-to-PDF flow.",
    "- If the user asks for DOCX but the real file is PDF, use pypdf or PyPDF2.",
    "- If the user asks for CSV but the real file is XLSX, use pandas.read_excel() or openpyxl.",
    "- Do not fetch fonts or static assets from the network unless explicitly required.",
    "",
    "## Requested formats",
    requestedFormats.length > 0 ? requestedFormats.map((format) => `- ${format.toUpperCase()}`).join("\n") : "- none",
    "",
    "## Attached files",
    attachmentNotes.length > 0 ? attachmentNotes.join("\n") : "- none",
  ].join("\n");
}

async function stagedAttachmentToSandboxFile(params: {
  sandbox: Sandbox;
  attachment: ConversationAttachment;
}) {
  const { data, mimeType } = await readAttachmentBinary(params.attachment);
  const safeName = sanitizeFileName(params.attachment.name);
  const workspacePath = `/workspace/${safeName}`;
  const inputsPath = `/workspace/inputs/${safeName}`;
  const blob = new Blob([data], { type: mimeType || params.attachment.mimeType || "application/octet-stream" });
  await params.sandbox.files.write(workspacePath, blob);
  await params.sandbox.files.write(inputsPath, blob);

  return {
    name: params.attachment.name,
    path: inputsPath,
    kind: params.attachment.kind,
    mimeType: mimeType || params.attachment.mimeType || "application/octet-stream",
    url: params.attachment.url,
    storagePath: params.attachment.storagePath,
  };
}

async function collectArtifacts(params: {
  sandbox: Sandbox;
  beforeFiles: Set<string>;
}) {
  const listResult = await params.sandbox.commands.run(
    `python3 - <<'PY'
import json
import os

root = "/workspace"
files = []
for dirpath, _, filenames in os.walk(root):
    for filename in filenames:
        full_path = os.path.join(dirpath, filename)
        rel_path = os.path.relpath(full_path, root)
        files.append(rel_path)

print(json.dumps(sorted(files)))
PY`,
    { cwd: "/workspace", timeoutMs: 30_000 },
  );

  const allFiles = new Set<string>(JSON.parse(listResult.stdout.trim() || "[]") as string[]);
  const artifactPaths = Array.from(allFiles).filter((filePath) => {
    if (params.beforeFiles.has(filePath)) return false;
    if (filePath.startsWith("inputs/")) return false;
    if (filePath === "input_manifest.json" || filePath === "lineage_context.md" || filePath === "script.py") return false;
    return true;
  });

  const files: E2BArtifact[] = [];
  for (const artifactPath of artifactPaths) {
    const buffer = await params.sandbox.files.read(`/workspace/${artifactPath}`, { format: "bytes" });
    const mimeType = artifactPath.endsWith(".pdf")
      ? "application/pdf"
      : artifactPath.endsWith(".png")
        ? "image/png"
        : artifactPath.endsWith(".jpg") || artifactPath.endsWith(".jpeg")
          ? "image/jpeg"
          : "application/octet-stream";
    files.push({
      name: artifactPath.split("/").pop() ?? artifactPath,
      path: artifactPath,
      mimeType,
      bytesBase64: Buffer.from(buffer).toString("base64"),
    });
  }

  return files;
}

export async function runE2ECodeSandbox(params: {
  code: string;
  attachments: ConversationAttachment[];
  contextText: string;
  projectId?: string;
  ownerUserId: string;
  requiredTools?: string[];
  requiredPythonPackages?: string[];
}) {
  const sandbox = await Sandbox.create({
    apiKey: process.env.E2B_API_KEY?.trim(),
    timeoutMs: Number(process.env.E2B_SANDBOX_TIMEOUT_MS ?? 300000),
  });

  try {
    await sandbox.files.write("/workspace/script.py", params.code);
    await sandbox.files.write("/workspace/lineage_context.md", buildPrelude(params.contextText, params.attachments));
    await sandbox.files.write("/workspace/input_manifest.json", JSON.stringify(
      params.attachments.map((attachment) => ({
        name: attachment.name,
        kind: attachment.kind,
        mimeType: attachment.mimeType ?? null,
        storagePath: attachment.storagePath ?? null,
      })),
      null,
      2,
    ));

    await sandbox.commands.run("mkdir -p /workspace/inputs /workspace/artifacts", { cwd: "/workspace", timeoutMs: 15_000 });

    const stagedInputs: E2BStagedInput[] = [];
    for (let index = 0; index < params.attachments.length; index += 1) {
      const attachment = params.attachments[index];
      if (attachment.kind === "url") {
        continue;
      }
      stagedInputs.push(await stagedAttachmentToSandboxFile({ sandbox, attachment }));
    }

    const beforeFilesResult = await sandbox.commands.run(
      `python3 - <<'PY'
import json
import os
root = "/workspace"
files = []
for dirpath, _, filenames in os.walk(root):
    for filename in filenames:
        full_path = os.path.join(dirpath, filename)
        rel_path = os.path.relpath(full_path, root)
        files.append(rel_path)
print(json.dumps(sorted(files)))
PY`,
      { cwd: "/workspace", timeoutMs: 30_000 },
    );
    const beforeFiles = new Set<string>(JSON.parse(beforeFilesResult.stdout.trim() || "[]") as string[]);

    const declaredTools = normalizeStringList(params.requiredTools);
    const declaredPythonPackages = normalizeStringList(params.requiredPythonPackages);
    const installPackages = Array.from(new Set([...declaredPythonPackages, ...getInstallPackages(params.code)]));
    const installedPackages: string[] = [];
    const failedPackages: Array<{ name: string; error: string }> = [];
    for (const pkg of installPackages) {
      const installResult = await sandbox.commands.run(`python3 -m pip install --disable-pip-version-check --no-input ${pkg}`, {
        cwd: "/workspace",
        timeoutMs: 180_000,
      });
      if (installResult.exitCode === 0) {
        installedPackages.push(pkg);
      } else {
        failedPackages.push({ name: pkg, error: installResult.stderr || installResult.error || `Failed to install ${pkg}` });
      }
    }

    const sandboxTools = new Set<string>(declaredTools.map((tool) => tool.toLowerCase()));
    if (sandboxTools.has("libreoffice")) {
      const libreOfficeCheck = await sandbox.commands.run("bash -lc 'command -v libreoffice >/dev/null 2>&1 || (apt-get update && apt-get install -y libreoffice)'", {
        cwd: "/workspace",
        timeoutMs: 900_000,
      });
      if (libreOfficeCheck.exitCode !== 0) {
        failedPackages.push({ name: "libreoffice", error: libreOfficeCheck.stderr || libreOfficeCheck.error || "Failed to install libreoffice" });
      }
    }

    const execution = await sandbox.commands.run("python3 /workspace/script.py", {
      cwd: "/workspace",
      timeoutMs: Number(process.env.E2B_CODE_TIMEOUT_MS ?? 240000),
    });

    const files = await collectArtifacts({
      sandbox,
      beforeFiles,
    });

    return {
      success: execution.exitCode === 0,
      errorMessage: execution.exitCode === 0 ? null : execution.stderr || execution.error || "Execution failed.",
      stdout: execution.stdout?.trim() ?? "",
      stderr: execution.stderr?.trim() ?? "",
      detectedPackages: detectPackages(params.code),
      installedPackages,
      failedPackages,
      files,
      stagedInputs,
    };
  } finally {
    await sandbox.kill().catch(() => undefined);
  }
}

export async function persistE2BArtifacts(params: {
  files: E2BArtifact[];
  ownerUserId: string;
  projectId?: string | null;
}) {
  const uploaded: ConversationAttachment[] = [];
  for (const file of params.files) {
    uploaded.push(
      await storeGeneratedAttachmentBuffer({
        buffer: Buffer.from(file.bytesBase64, "base64"),
        fileName: file.name,
        kind: file.mimeType.startsWith("image/") ? "image" : "file",
        mimeType: file.mimeType,
        ownerUserId: params.ownerUserId,
        projectId: params.projectId ?? null,
      }),
    );
  }
  return uploaded;
}
