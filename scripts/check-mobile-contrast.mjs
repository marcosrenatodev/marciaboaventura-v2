import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const themePath = "apps/mobile/src/theme.ts";
const theme = readFileSync(themePath, "utf8");
const colors = Object.fromEntries([...theme.matchAll(/\b([A-Za-z][A-Za-z0-9]*):\s*"(#[\da-fA-F]{6})"/g)].map(([, name, color]) => [name, color]));

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((channel) => Number.parseInt(channel, 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const requirements = [
  ["ink", "paper", 4.5], ["muted", "paper", 4.5], ["wine", "paper", 4.5],
  ["goldForeground", "gold", 4.5], ["goldDark", "gold", 3],
  ["wine", "wineWash", 4.5], ["attentionInk", "attention", 4.5],
  ["error", "paper", 4.5], ["green", "greenWash", 4.5],
  ["paper", "disabledPrimary", 4.5], ["wine", "disabledSecondary", 4.5],
  ["controlLine", "paper", 3], ["controlLine", "canvas", 3],
  ["focus", "paper", 3], ["focus", "canvas", 3],
];

let failures = 0;
for (const [foreground, background, minimum] of requirements) {
  const fg = colors[foreground];
  const bg = colors[background];
  if (!fg || !bg) {
    console.error(`Missing color token: ${!fg ? foreground : background}`);
    failures++;
    continue;
  }
  const ratio = contrast(fg, bg);
  if (ratio < minimum) {
    console.error(`${foreground}/${background}: ${ratio.toFixed(2)}:1 (requires ${minimum}:1)`);
    failures++;
  }
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    if (entry.isFile() && path.endsWith(".tsx") && !path.endsWith("/AccessibleTextInput.tsx")) return [path];
    return [];
  });
}

const bypasses = walk("apps/mobile/app").concat(walk("apps/mobile/src"))
  .filter((path) => /<TextInput\b/.test(readFileSync(path, "utf8")));
if (bypasses.length > 0) {
  console.error(`Text fields must use AccessibleTextInput: ${bypasses.join(", ")}`);
  failures++;
}

if (failures) process.exitCode = 1;
else console.log(`Mobile contrast and focus checks passed (${requirements.length} color pairs; all fields use the accessible input).`);
