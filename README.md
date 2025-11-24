# Catai

`catai` is a CLI tool for **concatenating multiple files into a single output**
suitable for LLM (Large Language Model) contexts. It intelligently handles file
inclusion/exclusion, large files, and can copy the result to your clipboard.

```
catai deno.json a.ts

📂 Included Files:
├── 📄 a.ts
└── 📄 deno.json

📊 Summary:
   Files: 2
   Size: 299B
   Tokens: ~86

   claude: ✅  gpt4: ✅  gpt4o: ✅  gpt3: ✅  gemini: ✅

-- file: deno.json --
{
  "name": "@sigma/catai",
  "version": "1.0.1",
  "exports": "./catai.ts",
  "license": "MIT",
  "imports": {
    "@sigma/parse": "jsr:@sigma/parse@^0.17.1",
    "@std/fs": "jsr:@std/fs@^1.0.20",
    "@std/path": "jsr:@std/path@^1.1.3"
  }
}

-- file: a.ts --
console.log(4)
```

---

## Features

- Concatenate text files from multiple directories.
- Filter files using **include/exclude glob patterns**.
- Automatically **skip binary files** (images, audio, video, archives, etc.).
- Warns for **large files** and allows interactive decisions.
- Shows a **directory tree** of included files.
- Estimates **token usage** for different LLMs.
- Supports **copying output to clipboard** (Wayland/X11).
- Optional output file writing.

---

## Installation

Requires **Deno**.

```bash
deno install -Afg --name catai jsr:@sigma/catai
```

---

## Usage

Basic usage:

```bash
catai [options] <paths...>
```

### Options

| Option                 | Description                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| `--output <file>`      | Write concatenated result to a file instead of stdout                     |
| `--include <patterns>` | Include only files matching these glob patterns (e.g., `*.ts`, `**/*.md`) |
| `--exclude <patterns>` | Exclude files matching these glob patterns (e.g., `**/*.test.js`)         |
| `--maxSize <size>`     | Max file size before warning (default: `100k`, e.g., `1mb`, `500k`)       |
| `--yes`                | Skip prompts for large files and include them automatically               |
| `--copy`               | Copy the result to the clipboard automatically                            |

### Example

Concatenate all `.ts` and `.md` files in the `src` directory:

```bash
catai --include "**/*.ts" "**/*.md" src
```

Output to a file and copy to clipboard:

```bash
catai --output all_files.txt --copy src
```

---

## Token Estimation

`catai` estimates the number of tokens for common LLM models:

| Model  | Token Limit |
| ------ | ----------- |
| claude | 200,000     |
| gpt4   | 128,000     |
| gpt4o  | 128,000     |
| gpt3   | 16,000      |
| gemini | 1,000,000   |

It shows whether your concatenated content **fits within the model's token
limit**.

---

## Supported File Types

`catai` automatically skips **binary files** including:

- Images: `.png`, `.jpg`, `.gif`, `.webp`, `.bmp`, `.ico`
- Audio/Video: `.mp3`, `.mp4`, `.wav`, `.avi`, `.mov`, `.mkv`
- Archives: `.zip`, `.tar`, `.gz`, `.rar`, `.7z`
- Executables/Libraries: `.exe`, `.dll`, `.so`, `.dylib`, `.bin`
- Fonts: `.woff`, `.woff2`, `.ttf`, `.eot`, `.otf`
- PDFs: `.pdf`

---

## Tips:

This allows you to paste as file, llm chat will recognize this as file instead
of text and present it nicly in the UI (somehow there doesn't seem to be a
better way on linux other then spawning the file manager)

```bash
catai file1 file2 >/tmp/o && nautilus /tmp/o # then copy the file from nautilus
```

---

## License

MIT License
