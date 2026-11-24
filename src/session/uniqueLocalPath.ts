const CONTROL_OR_SEPARATOR_RE = /[\\/\u0000-\u001f\u007f]/;
const FOLDER_INVALID_RE = /[\\\u0000-\u001f\u007f]/;

function normalizePosixPath(path: string): string {
  const isAbs = path.startsWith('/');
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop();
      } else if (!isAbs) {
        parts.push('..');
      }
      continue;
    }
    parts.push(part);
  }
  const joined = parts.join('/');
  return isAbs ? `/${joined}` : joined;
}

export function validateLocalFileName(fileName: string): string {
  if (
    typeof fileName !== 'string' ||
    !fileName.trim() ||
    fileName === '.' ||
    fileName === '..' ||
    CONTROL_OR_SEPARATOR_RE.test(fileName)
  ) {
    throw new Error('Invalid file name');
  }
  return fileName;
}

function resolveInsideFolder(folderPath: string, fileName: string): string {
  if (typeof folderPath !== 'string' || !folderPath.trim() || FOLDER_INVALID_RE.test(folderPath)) {
    throw new Error('Invalid destination folder');
  }
  const safeName = validateLocalFileName(fileName);
  const base = normalizePosixPath(folderPath);
  if (!base) throw new Error('Invalid destination folder');
  const candidate = base === '/' ? `/${safeName}` : `${base}/${safeName}`;
  const resolved = normalizePosixPath(candidate);
  const isDirectChild = base === '/'
    ? resolved.startsWith('/') && resolved.length > 1 && !resolved.slice(1).includes('/')
    : resolved.startsWith(`${base}/`) && !resolved.slice(base.length + 1).includes('/');
  if (!isDirectChild) {
    throw new Error('Destination path escapes selected folder');
  }
  return resolved;
}

/** "song.flac" splits into "song" and ".flac"; copies are named "song (1).flac", here and in the native writer. */
function splitName(fileName: string) {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? { stem: fileName.slice(0, dot), ext: fileName.slice(dot) } : { stem: fileName, ext: '' };
}

export function uniqueLocalPath(folderPath: string, fileName: string, exists: (path: string) => boolean): string {
  const safeName = validateLocalFileName(fileName);
  const candidate = resolveInsideFolder(folderPath, safeName);
  if (!exists(candidate)) return candidate;
  const { stem, ext } = splitName(safeName);
  for (let i = 1; i < 1000; i++) {
    const next = resolveInsideFolder(folderPath, `${stem} (${i})${ext}`);
    if (!exists(next)) return next;
  }
  return resolveInsideFolder(folderPath, `${stem}_${Date.now()}${ext}`);
}
