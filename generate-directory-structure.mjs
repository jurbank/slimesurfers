import { promises as fs } from "node:fs";
import path from "node:path";

function printHelp() {
  console.log(`Usage: node generate-directory-structure.mjs [options]

Options:
  -o, --output <file>       Output markdown file path
  -x, --exclude <value>     Exclude a file or directory by name or relative path
  -h, --help                Show this help text

Examples:
  node generate-directory-structure.mjs
  node generate-directory-structure.mjs -o STRUCTURE.md
  node generate-directory-structure.mjs -x node_modules -x .git -x apps/game/client/src/assets
`);
}

function normalizeForMatch(value) {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");
}

function parseArgs(argv) {
  const options = {
    output: "CURRENT_DIRECTORY_STRUCTURE.md",
    excludes: [
      "node_modules",
      ".git",
      ".github",
      ".vite-hooks",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".claude",
      ".vscode",
      ".gemini",
      ".codex",
      "dist",
      "build",
    ],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "-o" || arg === "--output") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      options.output = value;
      i += 1;
      continue;
    }

    if (arg === "-x" || arg === "--exclude") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }
      options.excludes.push(
        ...value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      );
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function buildExcludeMatcher(rootDir, outputPath, excludes) {
  const normalizedOutputPath = normalizeForMatch(path.relative(rootDir, outputPath));
  /** @type {Set<string>} */
  const normalizedExcludes = new Set(
    excludes.map((value) => normalizeForMatch(value)).filter(Boolean),
  );

  if (normalizedOutputPath) {
    normalizedExcludes.add(normalizedOutputPath);
  }

  return {
    normalizedExcludes,
    shouldExclude(relativePath, name) {
      const normalizedRelative = normalizeForMatch(relativePath);
      if (!normalizedRelative) return false;
      if (normalizedExcludes.has(name)) return true;
      if (normalizedExcludes.has(normalizedRelative)) return true;

      for (const excluded of normalizedExcludes) {
        if (normalizedRelative.startsWith(`${excluded}/`)) {
          return true;
        }
      }

      return false;
    },
  };
}

async function buildTreeLines(dirPath, rootDir, excludeMatcher, prefix = "") {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const visibleEntries = entries
    .filter((entry) => {
      const relativePath = path.relative(rootDir, path.join(dirPath, entry.name));
      return !excludeMatcher.shouldExclude(relativePath, entry.name);
    })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  const lines = [];

  for (let i = 0; i < visibleEntries.length; i += 1) {
    const entry = visibleEntries[i];
    const isLast = i === visibleEntries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = `${prefix}${isLast ? "    " : "│   "}`;
    const fullPath = path.join(dirPath, entry.name);
    const suffix = entry.isDirectory() ? "/" : "";

    lines.push(`${prefix}${connector}${entry.name}${suffix}`);

    if (entry.isDirectory()) {
      const childLines = await buildTreeLines(fullPath, rootDir, excludeMatcher, childPrefix);
      lines.push(...childLines);
    }
  }

  return lines;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const rootDir = process.cwd();
  const outputPath = path.resolve(rootDir, options.output);
  const excludeMatcher = buildExcludeMatcher(rootDir, outputPath, options.excludes);
  const rootName = path.basename(rootDir);
  const treeLines = await buildTreeLines(rootDir, rootDir, excludeMatcher);

  const markdown = [
    "# Directory Structure",
    "",
    `Root: \`${rootName}\``,
    "",
    excludeMatcher.normalizedExcludes.size > 0
      ? `Excluded: ${Array.from(excludeMatcher.normalizedExcludes)
          .sort((a, b) => a.localeCompare(b))
          .map((value) => `\`${value}\``)
          .join(", ")}`
      : "Excluded: none",
    "",
    "```text",
    `${rootName}/`,
    ...treeLines,
    "```",
    "",
  ].join("\n");

  await fs.writeFile(outputPath, markdown, "utf8");
  console.log(`Wrote ${path.relative(rootDir, outputPath) || path.basename(outputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
