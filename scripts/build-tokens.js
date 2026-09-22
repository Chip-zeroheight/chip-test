#!/usr/bin/env node
/**
 * Converts zeroheight/Figma DTCG-format token JSON files (one per theme/mode)
 * into CSS custom property files, scoped under [data-theme="<name>"].
 *
 * Handles the 3-tier structure zeroheight exports:
 *   "_00 00 Primitive Core"  -> raw primitives (colors, spacing, etc.)
 *   "00 01 Primitive Brand"  -> brand-level aliases of core primitives
 *   "01 00 Semantic Core"    -> semantic tokens aliasing brand primitives
 * Alias values look like "{_00 00 Primitive Core.primitive.color.grey.200}"
 * and get rewritten to var(--primitive-color-grey-200) so the CSS cascade
 * (not this script) resolves multi-hop chains at render time.
 *
 * Input:  tokens/<ThemeName>_Desktop.tokens.json   (one file per theme)
 * Output: src/tokens/<theme-name>.css
 *
 * Usage: node scripts/build-tokens.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TOKENS_DIR = path.join(__dirname, "..", "tokens");
const OUT_DIR = path.join(__dirname, "..", "src", "tokens");

const ALIAS_PATTERN = /^\{(.+)\}$/;

function sanitizeSegment(seg) {
  return seg
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isTokenLeaf(node) {
  return node && typeof node === "object" && "$value" in node;
}

/**
 * Walks the whole token tree once, recording every leaf under both its
 * raw path (exactly as written, for matching alias references) and its
 * sanitized CSS variable name (top-level wrapper group dropped, since
 * zeroheight's wrapper names like "_00 00 Primitive Core" are purely
 * organizational and the child key already carries the real name).
 */
function collectLeaves(obj, rawPath, sanitizedPath, depth, leaves) {
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) continue;
    const value = obj[key];
    if (!value || typeof value !== "object") continue;

    const nextRawPath = [...rawPath, key];
    const nextSanitizedPath =
      depth === 0 ? sanitizedPath : [...sanitizedPath, sanitizeSegment(key)];

    if (isTokenLeaf(value)) {
      leaves.push({
        rawKey: nextRawPath.join("."),
        varName: `--${nextSanitizedPath.join("-")}`,
        node: value,
      });
    } else {
      collectLeaves(value, nextRawPath, nextSanitizedPath, depth + 1, leaves);
    }
  }
}

function resolveValue(node, rawKeyToVarName, warnings, ownRawKey) {
  const { $value, $type } = node;

  if (typeof $value === "string") {
    const aliasMatch = $value.match(ALIAS_PATTERN);
    if (aliasMatch) {
      const targetRawKey = aliasMatch[1];
      const targetVarName = rawKeyToVarName.get(targetRawKey);
      if (!targetVarName) {
        warnings.push(`Could not resolve alias "${$value}" (referenced from ${ownRawKey})`);
        return `/* unresolved: ${$value} */`;
      }
      return `var(${targetVarName})`;
    }
  }

  if ($type === "color" && $value && typeof $value === "object" && $value.hex) {
    if (typeof $value.alpha === "number" && $value.alpha < 1) {
      const alphaHex = Math.round($value.alpha * 255)
        .toString(16)
        .padStart(2, "0");
      return `${$value.hex}${alphaHex}`;
    }
    return $value.hex;
  }
  if (typeof $value === "number") return `${$value}`;
  if (typeof $value === "string") return $value;
  return JSON.stringify($value);
}

/**
 * zeroheight's automation may commit files either flat
 * ("Mode1_Baseline_Desktop.tokens.json") or nested in folders per mode/theme
 * ("Mode 1/Baseline/Desktop.tokens.json"). Handle both: prefer the
 * containing folder name as the theme name, and fall back to parsing the
 * filename when the file sits directly in the tokens root.
 */
function themeNameFromPath(relativePath) {
  const segments = relativePath.split(path.sep);
  const filename = segments[segments.length - 1];
  const parentDir = segments.length > 1 ? segments[segments.length - 2] : null;

  if (parentDir && !/^mode/i.test(parentDir)) {
    return sanitizeSegment(parentDir);
  }

  // Flat filename fallback, e.g. "Mode1_BaselinePro_Desktop.tokens.json"
  const base = filename.replace(/\.tokens\.json$/i, "").replace(/\.json$/i, "");
  const parts = base.split("_").filter(Boolean);
  const middle = parts.length > 2 ? parts.slice(1, -1).join(" ") : base;
  return sanitizeSegment(middle);
}

function findJsonFilesRecursive(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFilesRecursive(fullPath, base));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(path.relative(base, fullPath));
    }
  }
  return results;
}

function buildThemeCss(json, file) {
  const leaves = [];
  collectLeaves(json, [], [], 0, leaves);

  const rawKeyToVarName = new Map(leaves.map((l) => [l.rawKey, l.varName]));
  const warnings = [];
  const lines = [];
  const seen = new Set();

  for (const leaf of leaves) {
    if (seen.has(leaf.varName)) continue; // duplicate path collision, keep first
    seen.add(leaf.varName);
    const cssValue = resolveValue(leaf.node, rawKeyToVarName, warnings, leaf.rawKey);
    lines.push(`  ${leaf.varName}: ${cssValue};`);
  }

  if (warnings.length) {
    console.warn(`\n${file}: ${warnings.length} unresolved alias(es):`);
    for (const w of warnings) console.warn(`  - ${w}`);
  }

  return lines;
}

function main() {
  if (!fs.existsSync(TOKENS_DIR)) {
    console.error(`No tokens directory found at ${TOKENS_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = findJsonFilesRecursive(TOKENS_DIR);

  if (files.length === 0) {
    console.error(`No .json token files found in ${TOKENS_DIR} (searched recursively)`);
    process.exit(1);
  }

  const themeNames = [];

  for (const file of files) {
    const fullPath = path.join(TOKENS_DIR, file);
    const json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    const lines = buildThemeCss(json, file);

    const themeName = themeNameFromPath(file);
    themeNames.push(themeName);

    const css = `/* Auto-generated from ${file}. Do not edit by hand. */\n[data-theme="${themeName}"] {\n${lines.join(
      "\n"
    )}\n}\n`;
    const outFile = path.join(OUT_DIR, `${themeName}.css`);
    fs.writeFileSync(outFile, css);
    console.log(`Wrote ${outFile} (${lines.length} tokens)`);
  }

  const indexCss = themeNames.map((t) => `@import "./${t}.css";`).join("\n") + "\n";
  fs.writeFileSync(path.join(OUT_DIR, "index.css"), indexCss);

  const themesJson = `// Auto-generated. Do not edit by hand.\nexport const THEMES = ${JSON.stringify(
    themeNames,
    null,
    2
  )};\n`;
  fs.writeFileSync(path.join(OUT_DIR, "themes.ts"), themesJson);

  console.log(`\nThemes found: ${themeNames.join(", ")}`);
}

main();
