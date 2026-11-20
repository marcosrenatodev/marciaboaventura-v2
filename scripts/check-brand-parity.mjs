import { readFileSync } from "node:fs";

const css = readFileSync("src/index.css", "utf8");
const rootBlock = css.match(/:root\s*\{([\s\S]*?)\n\s*\}\s*\.dark\s*\{/i)?.[1];
if (!rootBlock) throw new Error("Could not find the light institutional palette in src/index.css.");

const theme = readFileSync("apps/mobile/src/theme.ts", "utf8");
const colorsBlock = theme.match(/export const colors\s*=\s*\{([\s\S]*?)\n\};/)?.[1];
if (!colorsBlock) throw new Error("Could not find the mobile color tokens in apps/mobile/src/theme.ts.");

const cssTokens = new Map();
for (const [, name, hue, saturation, lightness] of rootBlock.matchAll(
  /--([a-z][a-z-]*):\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%\s*;/gi,
)) {
  cssTokens.set(name, [Number(hue), Number(saturation) / 100, Number(lightness) / 100]);
}

const appTokens = new Map(
  [...colorsBlock.matchAll(/\b([A-Za-z][A-Za-z0-9]*):\s*"(#[\da-fA-F]{6})"/g)]
    .map(([, name, color]) => [name, color.toLowerCase()]),
);

function hslToHex([hue, saturation, lightness]) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((normalizedHue / 60) % 2 - 1));
  const offset = lightness - chroma / 2;
  const channels = normalizedHue < 60 ? [chroma, x, 0]
    : normalizedHue < 120 ? [x, chroma, 0]
      : normalizedHue < 180 ? [0, chroma, x]
        : normalizedHue < 240 ? [0, x, chroma]
          : normalizedHue < 300 ? [x, 0, chroma]
            : [chroma, 0, x];
  return `#${channels.map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

let failures = 0;
function fail(message) {
  console.error(message);
  failures++;
}

function cssColor(name) {
  const value = cssTokens.get(name);
  if (!value) {
    fail(`Missing institutional color --${name} in src/index.css.`);
    return null;
  }
  return hslToHex(value);
}

function compareCssAliases(left, right) {
  const leftColor = cssColor(left);
  const rightColor = cssColor(right);
  if (leftColor && rightColor && leftColor !== rightColor) {
    fail(`Institutional aliases --${left} (${leftColor}) and --${right} (${rightColor}) diverge.`);
  }
}

function compareAppToken(cssName, appName) {
  const expected = cssColor(cssName);
  const actual = appTokens.get(appName);
  if (!actual) {
    fail(`Missing mobile theme token ${appName} in apps/mobile/src/theme.ts.`);
  } else if (expected && actual !== expected) {
    fail(`Brand mismatch: --${cssName} is ${expected}, but mobile ${appName} is ${actual}.`);
  }
}

compareCssAliases("primary", "marsala");
compareCssAliases("secondary", "gold");
compareAppToken("primary", "wine");
compareAppToken("marsala", "wine");
compareAppToken("secondary", "gold");
compareAppToken("gold", "gold");
compareAppToken("gold-light", "goldLight");

// goldDark and focus are contrast-adjusted app tokens, so they intentionally
// differ from the decorative CSS --gold-dark hue.
const siteLogo = readFileSync("src/assets/logo-mb.png");
const mobileLogo = readFileSync("apps/mobile/assets/brand/logo-mb.png");
if (!siteLogo.equals(mobileLogo)) fail("The mobile MB logo differs from the institutional site asset.");

if (failures) process.exitCode = 1;
else console.log("Brand parity passed: marsala/gold tokens and MB logo match the institutional site.");
