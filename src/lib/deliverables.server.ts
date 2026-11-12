import { unzipSync } from "fflate";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;
const MAX_TEXT = 180_000;
const SOURCE_EXTENSIONS = new Set(["txt", "md", "csv", "json", "xml", "html", "css", "js", "jsx", "ts", "tsx", "py", "java", "go", "rs", "rb", "php", "sql", "yaml", "yml", "toml", "vue", "svelte", "c", "h", "cpp", "cs", "sh"]);
const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

export type EvidencePart =
  | { type: "text"; text: string }
  | { type: "image"; image: URL }
  | { type: "file"; filename: string; data: string; mediaType: "application/pdf" };

export type EvidenceInspection = {
  source: string;
  kind: "file" | "screenshot" | "website" | "github";
  status: "INSPECTED" | "PARTIALLY_INSPECTED" | "UNABLE_TO_INSPECT";
  detail: string;
};

export type InspectedDeliverables = {
  parts: EvidencePart[];
  inspections: EvidenceInspection[];
  evidenceText: string;
};

const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const cleanText = (value: string) => value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
const clip = (value: string, max = 60_000) => value.length > max ? `${value.slice(0, max)}\n[Truncated]` : value;

function xmlText(xml: string) {
  return cleanText(xml.replace(/<w:tab\b[^>]*\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<w:br\b[^>]*\/>/g, "\n"));
}

function safeUnzip(bytes: Uint8Array, maxEntries: number, maxUncompressed: number) {
  let accepted = 0;
  let declared = 0;
  return unzipSync(bytes, {
    filter: (file) => {
      if (file.name.endsWith("/")) return false;
      declared += file.originalSize;
      accepted += 1;
      return accepted <= maxEntries && declared <= maxUncompressed && file.originalSize <= 2_000_000;
    },
  });
}

export function extractDocxText(bytes: Uint8Array) {
  const files = safeUnzip(bytes, 100, 20 * 1024 * 1024);
  const document = files["word/document.xml"];
  if (!document) throw new Error("The DOCX document body is missing");
  return xmlText(new TextDecoder().decode(document));
}

export function extractSourceArchive(bytes: Uint8Array) {
  const files = safeUnzip(bytes, 500, 30 * 1024 * 1024);
  const chunks: string[] = [];
  const names = Object.keys(files).filter((name) => !/(^|\/)(node_modules|dist|build|\.git|vendor|coverage)(\/|$)/i.test(name));
  const candidates = names.filter((name) => SOURCE_EXTENSIONS.has(extension(name)) || /(^|\/)(readme|license|makefile|dockerfile|gemfile|procfile)(\.[^/]*)?$/i.test(name)).sort((a, b) => {
    const rank = (n: string) => /readme|package\.json|requirements\.txt|pyproject\.toml/i.test(n) ? 0 : /(^|\/)(src|app|lib|pages|routes|components)(\/|$)/i.test(n) ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  let total = 0;
  for (const name of candidates.slice(0, 45)) {
    const text = new TextDecoder().decode(files[name]);
    const remaining = Math.min(25_000, MAX_TEXT - total);
    if (remaining <= 0) break;
    chunks.push(`\n--- ${name} ---\n${clip(text, remaining)}`);
    total += Math.min(text.length, remaining);
  }
  return { text: chunks.join("\n"), fileCount: names.length, inspectedCount: Math.min(candidates.length, 45) };
}

function privateIp(ip: string) {
  return /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip);
}

async function assertPublicHttpUrl(raw: string, checkDns = true) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only public HTTP(S) URLs are supported");
  const host = url.hostname.toLowerCase();
  if (["localhost", "localhost.localdomain", "metadata.google.internal"].includes(host) || host.endsWith(".local") || privateIp(host)) throw new Error("Private or local URLs are not allowed");
  if (checkDns) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("The website address could not be resolved");
    const dns = await response.json() as { Answer?: { data: string }[] };
    if (!dns.Answer?.length || dns.Answer.some((answer) => privateIp(answer.data))) throw new Error("The website does not resolve to a public address");
  }
  return url;
}

async function fetchWebsite(raw: string) {
  let url = await assertPublicHttpUrl(raw);
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(url, { redirect: "manual", headers: { "user-agent": "PacePay-Deliverable-Verifier/1.0", accept: "text/html,text/plain,application/json" }, signal: AbortSignal.timeout(12_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Website redirect has no destination");
      url = await assertPublicHttpUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Website returned HTTP ${response.status}`);
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/json/i.test(type)) throw new Error(`Unsupported website content: ${type || "unknown"}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Website returned no readable content");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 600_000) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      if (size >= 600_000) { await reader.cancel(); break; }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { url: url.toString(), text: clip(cleanText(new TextDecoder().decode(bytes)), 70_000) };
  }
  throw new Error("Too many website redirects");
}

function githubRepo(raw: string) {
  const match = raw.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/?#]|$)/i);
  return match ? { owner: match[1], repo: match[2] } : null;
}

async function fetchGithub(raw: string) {
  const repo = githubRepo(raw);
  if (!repo) throw new Error("Not a GitHub repository URL");
  await assertPublicHttpUrl(raw, false);
  const headers = { accept: "application/vnd.github+json", "user-agent": "PacePay-Deliverable-Verifier/1.0" };
  const metaResponse = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, { headers, signal: AbortSignal.timeout(12_000) });
  if (!metaResponse.ok) throw new Error(metaResponse.status === 404 ? "Repository is private, missing or inaccessible" : `GitHub returned HTTP ${metaResponse.status}`);
  const meta = await metaResponse.json() as { default_branch?: string; private?: boolean; description?: string | null };
  if (meta.private) throw new Error("Private repositories are not accessible");
  const branch = meta.default_branch;
  if (!branch || !/^[A-Za-z0-9_.\/-]+$/.test(branch)) throw new Error("Repository default branch is inaccessible");
  const archiveResponse = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/zipball/${encodeURIComponent(branch)}`, { headers, signal: AbortSignal.timeout(25_000) });
  if (!archiveResponse.ok) throw new Error(`Repository archive returned HTTP ${archiveResponse.status}`);
  const bytes = new Uint8Array(await archiveResponse.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Repository archive exceeds the 15MB inspection limit");
  const extracted = extractSourceArchive(bytes);
  return { branch, description: meta.description ?? "", ...extracted };
}

function inspectImage(name: string, bytes: Uint8Array, ext: string): EvidencePart {
  const signatures: Record<string, boolean> = {
    png: bytes[0] === 0x89 && bytes[1] === 0x50,
    jpg: bytes[0] === 0xff && bytes[1] === 0xd8,
    jpeg: bytes[0] === 0xff && bytes[1] === 0xd8,
    webp: new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP",
    gif: new TextDecoder().decode(bytes.slice(0, 3)) === "GIF",
  };
  if (!signatures[ext]) throw new Error(`${name} is not a valid ${ext.toUpperCase()} image`);
  return { type: "image", image: new URL(`data:${IMAGE_TYPES[ext]};base64,${base64(bytes)}`) };
}

export async function inspectDeliverables(input: {
  files: string[];
  urls: string[];
  download: (path: string) => Promise<Uint8Array>;
}): Promise<InspectedDeliverables> {
  const parts: EvidencePart[] = [];
  const inspections: EvidenceInspection[] = [];
  const textChunks: string[] = [];
  let textSize = 0;
  const addText = (label: string, text: string) => {
    const remaining = MAX_TEXT - textSize;
    if (remaining <= 0 || !text.trim()) return;
    const content = clip(text, remaining);
    textChunks.push(`\n=== ${label} ===\n${content}`);
    textSize += content.length;
  };
  const fail = (source: string, kind: EvidenceInspection["kind"], error: unknown) => {
    inspections.push({ source, kind, status: "UNABLE_TO_INSPECT", detail: String(error instanceof Error ? error.message : error).slice(0, 300) });
  };

  for (const path of input.files.slice(0, 8)) {
    const name = path.split("/").pop() ?? "upload";
    const ext = extension(name);
    const kind = IMAGE_TYPES[ext] ? "screenshot" : "file";
    try {
      const bytes = await input.download(path);
      if (!bytes.byteLength) throw new Error("File is empty");
      if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("File exceeds the 20MB inspection limit");
      if (IMAGE_TYPES[ext]) {
        if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("Screenshot exceeds the 10MB visual inspection limit");
        parts.push(inspectImage(name, bytes, ext));
        inspections.push({ source: name, kind, status: "INSPECTED", detail: "Screenshot pixels were supplied to the AI for visual inspection." });
      } else if (ext === "pdf") {
        if (new TextDecoder().decode(bytes.slice(0, 4)) !== "%PDF") throw new Error("File does not contain a valid PDF header");
        if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("PDF exceeds the 10MB document inspection limit");
        parts.push({ type: "file", filename: name, data: base64(bytes), mediaType: "application/pdf" });
        inspections.push({ source: name, kind, status: "INSPECTED", detail: "The complete PDF was supplied to the AI for content and layout inspection." });
      } else if (ext === "docx") {
        const text = extractDocxText(bytes);
        if (!text) throw new Error("No readable text found in the DOCX");
        addText(name, text);
        inspections.push({ source: name, kind, status: "INSPECTED", detail: `Extracted and inspected ${Math.min(text.length, MAX_TEXT).toLocaleString()} characters from the DOCX body.` });
      } else if (ext === "zip") {
        const extracted = extractSourceArchive(bytes);
        if (!extracted.text) throw new Error("No supported source files found in the ZIP");
        addText(name, extracted.text);
        inspections.push({ source: name, kind, status: extracted.inspectedCount < extracted.fileCount ? "PARTIALLY_INSPECTED" : "INSPECTED", detail: `Inspected ${extracted.inspectedCount} source files from an archive containing ${extracted.fileCount} files; dependencies and build output were excluded.` });
      } else if (SOURCE_EXTENSIONS.has(ext)) {
        addText(name, new TextDecoder().decode(bytes));
        inspections.push({ source: name, kind, status: "INSPECTED", detail: "Read the submitted text/source file contents." });
      } else {
        throw new Error(`Unsupported file type .${ext || "unknown"}; use PDF, DOCX, an image, ZIP or a text/source file`);
      }
    } catch (error) { fail(name, kind, error); }
  }
  for (const path of input.files.slice(8)) fail(path.split("/").pop() ?? "upload", "file", "Only the first 8 files are inspected per review");

  for (const raw of input.urls.slice(0, 5)) {
    const repo = githubRepo(raw);
    try {
      if (repo) {
        const result = await fetchGithub(raw);
        addText(`GitHub repository ${repo.owner}/${repo.repo} (${result.branch})`, `Description: ${result.description}\n${result.text}`);
        inspections.push({ source: raw, kind: "github", status: result.text ? "INSPECTED" : "UNABLE_TO_INSPECT", detail: result.text ? `Read the public repository archive on ${result.branch}; inspected ${result.inspectedCount} source files.` : "No supported source files were readable." });
      } else {
        const result = await fetchWebsite(raw);
        addText(`Website ${result.url}`, result.text);
        inspections.push({ source: raw, kind: "website", status: "INSPECTED", detail: `Fetched and inspected the public page content at ${result.url}. Visual appearance and interactive behavior were not executed.` });
      }
    } catch (error) { fail(raw, repo ? "github" : "website", error); }
  }
  for (const raw of input.urls.slice(5)) fail(raw, githubRepo(raw) ? "github" : "website", "Only the first 5 links are inspected per review");

  return { parts, inspections, evidenceText: textChunks.join("\n") || "No extractable text content was available." };
}
