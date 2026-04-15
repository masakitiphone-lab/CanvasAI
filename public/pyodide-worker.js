const PYODIDE_VERSION = "0.27.2";
const PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

let pyodideReadyPromise = null;

const STDLIB_MODULES = new Set([
  "__future__", "abc", "argparse", "array", "ast", "asyncio", "base64", "binascii", "bisect", "builtins",
  "calendar", "cmath", "collections", "concurrent", "contextlib", "copy", "csv", "ctypes", "datetime",
  "decimal", "difflib", "dis", "email", "enum", "errno", "faulthandler", "fnmatch", "fractions", "functools",
  "gc", "getopt", "getpass", "gettext", "glob", "gzip", "hashlib", "heapq", "hmac", "html", "http", "importlib",
  "inspect", "io", "ipaddress", "itertools", "json", "logging", "lzma", "math", "mimetypes", "numbers",
  "operator", "os", "pathlib", "pickle", "pkgutil", "platform", "plistlib", "pprint", "queue", "random",
  "re", "reprlib", "resource", "secrets", "selectors", "shlex", "shutil", "signal", "site", "socket", "sqlite3",
  "statistics", "string", "struct", "subprocess", "sys", "tempfile", "textwrap", "threading", "time", "timeit",
  "traceback", "types", "typing", "unittest", "urllib", "uuid", "warnings", "weakref", "xml", "zipfile", "zoneinfo",
]);

const PACKAGE_NAME_MAP = {
  PIL: "Pillow",
  bs4: "beautifulsoup4",
  cv2: "opencv-python",
  Crypto: "pycryptodome",
  dateutil: "python-dateutil",
  fitz: "pymupdf",
  sklearn: "scikit-learn",
  skimage: "scikit-image",
  yaml: "PyYAML",
};

function postResponse(id, ok, payload) {
  self.postMessage(ok ? { id, ok: true, data: payload } : { id, ok: false, error: payload });
}

async function ensurePyodide() {
  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      self.importScripts(`${PYODIDE_BASE_URL}pyodide.js`);
      const pyodide = await self.loadPyodide({ indexURL: PYODIDE_BASE_URL });
      await pyodide.loadPackage("micropip");
      await pyodide.runPythonAsync(`
import os
WORKSPACE_DIR = "/workspace"
INPUTS_DIR = os.path.join(WORKSPACE_DIR, "inputs")
ARTIFACTS_DIR = os.path.join(WORKSPACE_DIR, "artifacts")
os.makedirs(INPUTS_DIR, exist_ok=True)
os.makedirs(ARTIFACTS_DIR, exist_ok=True)
`);
      return pyodide;
    })();
  }

  return pyodideReadyPromise;
}

function sanitizeFilename(name, fallback) {
  const trimmed = (name || "").trim();
  const candidate = trimmed || fallback;
  return candidate.replace(/[^\w.\-]+/g, "_");
}

function splitPackageList(raw) {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function detectPackages(code) {
  const detected = new Set();
  const directivePattern = /^\s*#\s*(?:pip|packages?)\s*:\s*(.+)$/gim;
  let directiveMatch = null;
  while ((directiveMatch = directivePattern.exec(code)) !== null) {
    splitPackageList(directiveMatch[1]).forEach((pkg) => detected.add(pkg));
  }

  const importPattern = /^\s*(?:from\s+([A-Za-z0-9_\.]+)\s+import|import\s+([A-Za-z0-9_\.,\s]+))/gm;
  let importMatch = null;
  while ((importMatch = importPattern.exec(code)) !== null) {
    if (importMatch[1]) {
      const root = importMatch[1].split(".")[0];
      if (!STDLIB_MODULES.has(root)) {
        detected.add(PACKAGE_NAME_MAP[root] || root);
      }
      continue;
    }

    if (importMatch[2]) {
      importMatch[2]
        .split(",")
        .map((part) => part.trim().split(/\s+as\s+/i)[0]?.split(".")[0])
        .filter(Boolean)
        .forEach((root) => {
          if (!STDLIB_MODULES.has(root)) {
            detected.add(PACKAGE_NAME_MAP[root] || root);
          }
        });
    }
  }

  return Array.from(detected);
}

async function resetWorkspace(pyodide) {
  await pyodide.runPythonAsync(`
import os
import shutil

WORKSPACE_DIR = "/workspace"
INPUTS_DIR = os.path.join(WORKSPACE_DIR, "inputs")
ARTIFACTS_DIR = os.path.join(WORKSPACE_DIR, "artifacts")

for path in (INPUTS_DIR, ARTIFACTS_DIR):
    if os.path.isdir(path):
        shutil.rmtree(path)
    os.makedirs(path, exist_ok=True)

for entry in os.listdir(WORKSPACE_DIR):
    if entry in {"inputs", "artifacts"}:
        continue
    full_path = os.path.join(WORKSPACE_DIR, entry)
    if os.path.isdir(full_path):
        shutil.rmtree(full_path)
    else:
        os.remove(full_path)
`);
}

async function stageAttachments(pyodide, attachments, contextText) {
  const staged = [];

  for (const attachment of attachments) {
    if (attachment.kind === "url") {
      staged.push({
        name: attachment.name,
        path: null,
        kind: attachment.kind,
        url: attachment.url,
      });
      continue;
    }

    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch input attachment: ${attachment.name}`);
    }

    const buffer = await response.arrayBuffer();
    const filePath = `/workspace/inputs/${sanitizeFilename(attachment.name, attachment.kind === "image" ? "image.bin" : "input.bin")}`;
    pyodide.FS.writeFile(filePath, new Uint8Array(buffer), { canOwn: true });
    staged.push({
      name: attachment.name,
      path: filePath,
      kind: attachment.kind,
      url: attachment.url,
    });
  }

  const manifestPath = "/workspace/input_manifest.json";
  const manifest = JSON.stringify(staged, null, 2);
  pyodide.FS.writeFile(manifestPath, manifest);

  if (contextText.trim()) {
    pyodide.FS.writeFile("/workspace/lineage_context.md", contextText);
  }

  return staged;
}

async function installPackages(pyodide, packageNames) {
  const installed = [];
  const failed = [];

  for (const name of packageNames) {
    try {
      await pyodide.loadPackage(name);
      installed.push(name);
      continue;
    } catch {
      try {
        await pyodide.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(name)})
`);
        installed.push(name);
      } catch (installError) {
        failed.push({
          name,
          error: installError instanceof Error ? installError.message : String(installError),
        });
      }
    }
  }

  return { installed, failed };
}

async function collectArtifacts(pyodide) {
  const encoded = await pyodide.runPythonAsync(`
import base64
import json
import mimetypes
import os

WORKSPACE_DIR = "/workspace"
INPUTS_DIR = os.path.join(WORKSPACE_DIR, "inputs")
ARTIFACTS_DIR = os.path.join(WORKSPACE_DIR, "artifacts")

items = []
for root, _, files in os.walk(WORKSPACE_DIR):
    if root.startswith(INPUTS_DIR):
        continue
    for filename in files:
        full_path = os.path.join(root, filename)
        if os.path.basename(full_path) in {"input_manifest.json", "lineage_context.md"}:
            continue
        with open(full_path, "rb") as handle:
            payload = base64.b64encode(handle.read()).decode("ascii")
        mime_type, _ = mimetypes.guess_type(filename)
        items.append({
            "name": filename,
            "path": full_path,
            "mimeType": mime_type or "application/octet-stream",
            "bytesBase64": payload,
        })

json.dumps(items)
`);

  return JSON.parse(encoded);
}

async function runPython(payload) {
  const pyodide = await ensurePyodide();
  await resetWorkspace(pyodide);
  const stdout = [];
  const stderr = [];

  pyodide.setStdout({ batched: (message) => stdout.push(message) });
  pyodide.setStderr({ batched: (message) => stderr.push(message) });

  const detectedPackages = detectPackages(payload.code);
  const packageResult = await installPackages(pyodide, detectedPackages);
  const stagedInputs = await stageAttachments(pyodide, payload.attachments || [], payload.contextText || "");

  await pyodide.runPythonAsync(`
import os
os.chdir("/workspace")

try:
    import matplotlib
    matplotlib.use("AGG")
    import matplotlib.pyplot as plt

    _codex_original_show = plt.show
    _codex_show_counter = {"value": 0}

    def _codex_show(*args, **kwargs):
        figures = [plt.figure(num) for num in plt.get_fignums()]
        for figure in figures:
            _codex_show_counter["value"] += 1
            output_path = os.path.join("/workspace/artifacts", f"figure-{_codex_show_counter['value']}.png")
            figure.savefig(output_path, bbox_inches="tight", dpi=160)
        plt.close("all")

    plt.show = _codex_show
except Exception:
    pass
`);

  let success = true;
  let errorMessage = null;

  try {
    await pyodide.runPythonAsync(payload.code);
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const files = await collectArtifacts(pyodide);
  return {
    success,
    errorMessage,
    stdout: stdout.join("\n").trim(),
    stderr: stderr.join("\n").trim(),
    detectedPackages,
    installedPackages: packageResult.installed,
    failedPackages: packageResult.failed,
    files,
    stagedInputs,
  };
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};

  try {
    if (type === "init") {
      await ensurePyodide();
      postResponse(id, true, { ready: true, version: PYODIDE_VERSION });
      return;
    }

    if (type === "run") {
      const result = await runPython(payload || {});
      postResponse(id, true, result);
      return;
    }

    postResponse(id, false, { message: `Unknown worker message: ${type}` });
  } catch (error) {
    postResponse(id, false, { message: error instanceof Error ? error.message : String(error) });
  }
};
