import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";

const markerName = ".marcia-disposable-e2e-d1";
const markerContents = "Dados sintéticos descartáveis do E2E Márcia v1\n";

function checkPath(directory) {
  const path = resolve(directory);
  const relativeProject = relative(path, process.cwd());
  if (path === parse(path).root || relativeProject === "" || (!relativeProject.startsWith(`..${sep}`) && relativeProject !== ".." && !isAbsolute(relativeProject))) {
    throw new Error(`Diretório E2E recusado: ${path}`);
  }
  let parent = dirname(path);
  while (!existsSync(parent)) parent = dirname(parent);
  if (realpathSync(parent) !== parent) throw new Error(`Caminho E2E contém link simbólico: ${path}`);
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory())) {
    throw new Error(`Diretório E2E inválido: ${path}`);
  }
  return path;
}

export function removeDisposableD1(directory) {
  const path = checkPath(directory);
  if (!existsSync(path)) return;
  const marker = join(path, markerName);
  if (!existsSync(marker) || lstatSync(marker).isSymbolicLink() || readFileSync(marker, "utf8") !== markerContents) {
    throw new Error(`Recusada exclusão de D1 sem marcador E2E: ${path}`);
  }
  rmSync(path, { recursive: true, force: true });
}

export function resetDisposableD1(directory) {
  const path = checkPath(directory);
  removeDisposableD1(path);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, markerName), markerContents, { flag: "wx" });
}
