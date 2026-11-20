import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve, sep } from "node:path";

const distRoot = resolve("apps/mobile/dist");
const maxRouteJavaScriptGzipBytes = 512 * 1024;
const gzipSizes = new Map();

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.isFile() && extname(path) === ".html" ? [path] : [];
  });
}

function routeName(file) {
  let name = relative(distRoot, file).split(sep).join("/");
  if (name === "index.html") return "/";
  name = name.replace(/\/index\.html$/, "").replace(/\.html$/, "");
  return `/${name}`;
}

function javascriptBytes(file) {
  if (!gzipSizes.has(file)) gzipSizes.set(file, gzipSync(readFileSync(file), { level: 9 }).byteLength);
  return gzipSizes.get(file);
}

const pages = htmlFiles(distRoot).map((file) => {
  const html = readFileSync(file, "utf8");
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/giu)]
    .map((match) => match[1])
    .filter((source) => source?.startsWith("/_expo/static/js/web/"));
  const assets = [...new Set(sources)].map((source) => {
    const assetPath = resolve(distRoot, `.${new URL(source, "http://localhost").pathname}`);
    if (assetPath !== distRoot && !assetPath.startsWith(`${distRoot}${sep}`)) {
      throw new Error(`Expo Web asset escapes dist: ${source}`);
    }
    return assetPath;
  });
  if (assets.length === 0) throw new Error(`No Expo Web JavaScript bundles found in ${relative(distRoot, file)}`);
  const bytes = assets.reduce((total, asset) => total + javascriptBytes(asset), 0);
  return { route: routeName(file), bytes, assets: assets.length };
});

if (pages.length === 0) throw new Error("No static Expo Web routes found. Run `pnpm --filter @marcia/mobile export:web` first.");
const largest = pages.reduce((current, page) => page.bytes > current.bytes ? page : current);
const kib = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
console.log(`Expo Web initial JavaScript: largest route ${largest.route}, ${kib(largest.bytes)} gzip across ${largest.assets} bundles.`);
console.log(`Budget: ${kib(maxRouteJavaScriptGzipBytes)} gzip per route; ${pages.length} static routes checked.`);
if (largest.bytes > maxRouteJavaScriptGzipBytes) {
  console.error(`Mobile bundle budget exceeded on ${largest.route} by ${kib(largest.bytes - maxRouteJavaScriptGzipBytes)}.`);
  process.exitCode = 1;
}
