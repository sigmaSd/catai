import { walk } from "@std/fs/walk";
import { globToRegExp, relative, resolve } from "@std/path";
import { Args, argument, cli, description, required, type } from "@sigma/parse";

const IGNORED = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  "__pycache__",
  ".cache",
  ".vscode",
  ".idea",
  "vendor",
]);

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".bmp",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".mkv",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
]);

const TOKEN_LIMITS: Record<string, number> = {
  "claude": 200000,
  "gpt4": 128000,
  "gpt4o": 128000,
  "gpt3": 16000,
  "gemini": 1000000,
};

@cli({
  name: "catai",
  description: "Concatenate files for LLM context",
  defaultCommand: "help",
  color: true,
})
class CataiArgs extends Args {
  @description("Write to file instead of stdout")
  @type("string")
  output?: string;

  @description(
    "Include only files matching these glob patterns (e.g., '*.ts' '**/*.md')",
  )
  @type("string[]")
  include?: string[];

  @description(
    "Exclude files matching these glob patterns (e.g., '**/*.test.js')",
  )
  @type("string[]")
  exclude?: string[];

  @description(
    "Max file size before warning (default: 100KB, e.g. '1mb', '500k')",
  )
  maxSize = "100k";

  @description("Skip all prompts, include large files")
  yes = false;

  @description("Copy output to clipboard (auto-detects Wayland/X11)")
  copy = false;

  @argument({ rest: true, description: "Paths to concatenate" })
  @required()
  @type("string[]")
  paths!: string[];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

async function isTextFile(path: string): Promise<boolean> {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  if (BINARY_EXT.has(ext)) return false;
  try {
    const data = await Deno.readFile(path);
    const sample = data.slice(0, 8000);
    let nullCount = 0;
    for (const byte of sample) if (byte === 0) nullCount++;
    return nullCount / sample.length < 0.1;
  } catch {
    return false;
  }
}

async function getFiles(path: string): Promise<string[]> {
  const stat = await Deno.stat(path);
  if (stat.isFile) return [path];

  const files: string[] = [];
  for await (
    const entry of walk(path, {
      skip: [...IGNORED].map((d) => new RegExp(`(^|/)${d}($|/)`)),
    })
  ) {
    if (entry.isFile) files.push(entry.path);
  }
  return files.sort();
}

function matchesPattern(
  filePath: string,
  patterns: string[],
  baseDir: string,
): boolean {
  const relativePath = relative(baseDir, filePath);
  return patterns.some((pattern) => {
    const regex = globToRegExp(pattern, { extended: true, globstar: true });
    return regex.test(relativePath) || regex.test(filePath);
  });
}

function parseMaxSize(input: string): number {
  const match = input.match(/^(\d+)(k|kb|m|mb)?$/i);
  if (!match) {
    console.error("Invalid max size format:", input);
    Deno.exit(1);
  }
  let size = parseInt(match[1]);
  const unit = (match[2] || "").toLowerCase();
  if (unit === "k" || unit === "kb") size *= 1024;
  else if (unit === "m" || unit === "mb") size *= 1024 * 1024;
  return size;
}

// Write a prompt message to stderr and read the user's input from stdin.
async function promptStderr(message: string): Promise<string | null> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  await Deno.stderr.write(encoder.encode(message));

  const buf = new Uint8Array(1024);
  let input = "";
  while (true) {
    const n = await Deno.stdin.read(buf);
    if (n === null) break;
    input += decoder.decode(buf.subarray(0, n));
    if (input.includes("\n")) break;
    if (n < buf.length) break;
  }

  if (!input) return null;
  return input.replace(/\r?\n$/, "") || null;
}

async function copyToClipboard(text: string) {
  const sessionType = Deno.env.get("XDG_SESSION_TYPE") || "";
  const isWayland = sessionType.toLowerCase().includes("wayland");

  // wl-copy for Wayland, xclip for X11 fallback
  const cmd = isWayland ? ["wl-copy"] : ["xclip", "-selection", "clipboard"];

  try {
    const p = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      stdin: "piped",
      stdout: "null",
      stderr: "null",
    }).spawn();

    const writer = p.stdin.getWriter();
    await writer.write(new TextEncoder().encode(text));
    await writer.close();
    await p.status;
  } catch (err) {
    console.error(`\n❌ Failed to copy to clipboard (tried ${cmd[0]}).`);
    if (!isWayland) console.error("   Is 'xclip' installed?");
    else console.error("   Is 'wl-copy' installed?");
    console.error(err);
  }
}

function buildTree(files: string[], baseDir: string): string {
  const tree: Map<string, Set<string>> = new Map();

  // Build directory structure
  for (const file of files) {
    const rel = relative(baseDir, file);
    const parts = rel.split("/");

    for (let i = 0; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join("/");
      const item = parts[i];

      if (!tree.has(dirPath)) {
        tree.set(dirPath, new Set());
      }
      tree.get(dirPath)!.add(item);
    }
  }

  // Render tree
  const lines: string[] = [];

  function renderDir(path: string, prefix: string, _isLast: boolean) {
    const items = Array.from(tree.get(path) || []).sort();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemPath = path ? `${path}/${item}` : item;
      const isLastItem = i === items.length - 1;
      const branch = isLastItem ? "└── " : "├── ";
      const extension = isLastItem ? "    " : "│   ";

      const isDir = tree.has(itemPath);
      const icon = isDir ? "📁 " : "📄 ";

      lines.push(`${prefix}${branch}${icon}${item}`);

      if (isDir) {
        renderDir(itemPath, prefix + extension, isLastItem);
      }
    }
  }

  renderDir("", "", true);
  return lines.join("\n");
}

const opts = CataiArgs.parse(Deno.args);
const paths = opts.paths;

const maxFileSize = parseMaxSize(opts.maxSize);
const allFiles: string[] = [];

for (const p of paths) {
  allFiles.push(...await getFiles(resolve(p)));
}

const base = paths.length === 1 ? resolve(paths[0]) : Deno.cwd();
const baseStat = await Deno.stat(base).catch(() => null);
const baseDir = baseStat?.isDirectory ? base : Deno.cwd();

// Filter by include/exclude patterns
let filteredFiles = allFiles;

// Apply include filter (whitelist mode)
if (opts.include && opts.include.length > 0) {
  filteredFiles = filteredFiles.filter((file) =>
    matchesPattern(file, opts.include!, baseDir)
  );
}

// Apply exclude filter
if (opts.exclude && opts.exclude.length > 0) {
  filteredFiles = filteredFiles.filter((file) =>
    !matchesPattern(file, opts.exclude!, baseDir)
  );
}

// Check file sizes and prompt for large files
const filesToInclude: string[] = [];
const skippedFiles: string[] = [];

for (const file of filteredFiles) {
  if (!await isTextFile(file)) continue;

  const stat = await Deno.stat(file);
  const name = relative(baseDir, file) || file;

  if (stat.size > maxFileSize) {
    if (opts.yes) {
      filesToInclude.push(file);
      continue;
    }

    console.warn(`\n⚠️  Large file: ${name}`);
    console.warn(
      `   Size: ${formatBytes(stat.size)} (~${
        formatTokens(estimateTokens(await Deno.readTextFile(file)))
      } tokens)`,
    );

    const answer = await promptStderr(
      "   Include? [y]es / [n]o / [a]ll / [s]kip all: ",
    );
    const choice = (answer || "").toLowerCase().trim();

    if (choice === "a" || choice === "all") {
      opts.yes = true;
      filesToInclude.push(file);
    } else if (choice === "s" || choice === "skip") {
      skippedFiles.push(name);
      break;
    } else if (choice === "y" || choice === "yes") {
      filesToInclude.push(file);
    } else {
      skippedFiles.push(name);
    }
  } else {
    filesToInclude.push(file);
  }
}

// Build output (no tree here, it's shown in stderr)
const output: string[] = [];

for (const file of filesToInclude) {
  const name = relative(baseDir, file) || file;
  const content = await Deno.readTextFile(file);
  output.push(`-- file: ${name} --`);
  output.push(content.trimEnd());
  output.push("");
}

const result = output.join("\n");
const totalTokens = estimateTokens(result);

// Print tree and summary to stderr
console.warn(`\n📂 Included Files:`);
console.warn(buildTree(filesToInclude, baseDir));
console.warn("");

console.warn(`📊 Summary:`);
console.warn(`   Files: ${filesToInclude.length}`);
if (skippedFiles.length) {
  console.warn(
    `   Skipped: ${skippedFiles.length} (${skippedFiles.join(", ")})`,
  );
}
if (opts.include && opts.include.length > 0) {
  console.warn(`   Include patterns: ${opts.include.join(", ")}`);
}
if (opts.exclude && opts.exclude.length > 0) {
  console.warn(`   Exclude patterns: ${opts.exclude.join(", ")}`);
}
console.warn(`   Size: ${formatBytes(result.length)}`);
console.warn(`   Tokens: ~${formatTokens(totalTokens)}`);
console.warn("");

// Show fit status for common models
const fits = Object.entries(TOKEN_LIMITS)
  .map(([model, limit]) => `${model}: ${totalTokens < limit ? "✅" : "❌"}`)
  .join("  ");
console.warn(`   ${fits}`);
console.warn("");

if (opts.copy) {
  await copyToClipboard(result);
  console.warn("📋 Copied to clipboard");
}

if (opts.output) {
  await Deno.writeTextFile(opts.output, result);
  console.warn(`✅ Written to ${opts.output}`);
}

if (!opts.output && !opts.copy) {
  console.log(result);
}
