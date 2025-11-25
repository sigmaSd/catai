import {
  Args,
  argument,
  cli,
  description,
  required,
  short,
  type,
} from "@sigma/parse";
import type { CataiOptions } from "./types.ts";

@cli({
  name: "catai",
  description: "Concatenate files for LLM context",
  defaultCommand: "help",
  color: true,
})
class CataiArgs extends Args {
  @description("Write to file instead of stdout")
  @short()
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
  @short()
  copy = false;

  @argument({ rest: true, description: "Paths to concatenate" })
  @required()
  @type("string[]")
  paths!: string[];
}

export function parseArgs(args: string[]): CataiOptions {
  const parsed = CataiArgs.parse(args);

  return {
    output: parsed.output,
    include: parsed.include,
    exclude: parsed.exclude,
    maxSize: parsed.maxSize,
    yes: parsed.yes,
    copy: parsed.copy,
    paths: parsed.paths,
  };
}
