import type { CataiOptions } from "./types.ts";
import process from "node:process";

export function parseArgs(args: string[]): CataiOptions {
  const options: CataiOptions = {
    maxSize: "100k",
    yes: false,
    copy: false,
    paths: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg === "-v" || arg === "--version") {
      console.log("catai version 1.0.0");
      process.exit(0);
    } else if (arg === "-o" || arg === "--output") {
      i++;
      if (i >= args.length) {
        console.error("Error: --output requires a value");
        process.exit(1);
      }
      options.output = args[i];
    } else if (arg === "--include") {
      i++;
      const patterns: string[] = [];
      while (i < args.length && !args[i].startsWith("-")) {
        patterns.push(args[i]);
        i++;
      }
      i--; // Step back one since the outer loop will increment
      if (patterns.length === 0) {
        console.error("Error: --include requires at least one pattern");
        process.exit(1);
      }
      options.include = patterns;
    } else if (arg === "--exclude") {
      i++;
      const patterns: string[] = [];
      while (i < args.length && !args[i].startsWith("-")) {
        patterns.push(args[i]);
        i++;
      }
      i--; // Step back one since the outer loop will increment
      if (patterns.length === 0) {
        console.error("Error: --exclude requires at least one pattern");
        process.exit(1);
      }
      options.exclude = patterns;
    } else if (arg === "--max-size") {
      i++;
      if (i >= args.length) {
        console.error("Error: --max-size requires a value");
        process.exit(1);
      }
      options.maxSize = args[i];
    } else if (arg === "--yes") {
      options.yes = true;
    } else if (arg === "-c" || arg === "--copy") {
      options.copy = true;
    } else if (arg.startsWith("-")) {
      console.error(`Error: Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    } else {
      // It's a path argument
      options.paths.push(arg);
    }

    i++;
  }

  // Validate required arguments
  if (options.paths.length === 0) {
    console.error("Error: At least one path is required");
    printHelp();
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
catai - Concatenate files for LLM context

USAGE:
  catai [OPTIONS] <paths...>

ARGUMENTS:
  <paths...>              Paths to concatenate

OPTIONS:
  -o, --output <file>     Write to file instead of stdout
  --include <patterns...> Include only files matching these glob patterns
                          (e.g., '*.ts' '**/*.md')
  --exclude <patterns...> Exclude files matching these glob patterns
                          (e.g., '**/*.test.js')
  --max-size <size>       Max file size before warning
                          (default: 100k, e.g. '1mb', '500k')
  --yes                   Skip all prompts, include large files
  -c, --copy              Copy output to clipboard (auto-detects Wayland/X11)
  -h, --help              Show this help message
  -v, --version           Show version

EXAMPLES:
  catai src/
  catai src/ --include '*.ts' '*.tsx'
  catai . --exclude 'node_modules' --output context.txt
  catai src/ --copy
`);
}
