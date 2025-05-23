import { writeFile as fsWriteFile, mkdir, unlink, rename, cp, rm } from 'node:fs/promises';
import { existsSync, PathLike } from 'node:fs';
import { dirname } from 'node:path';
import * as prettier from 'prettier';

export async function writeFile(...params: Parameters<typeof fsWriteFile>): Promise<void> {
  const path = params[0] as string;
  const dir = dirname(path);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  return fsWriteFile(...params);
}

export async function format(content: string): Promise<string> {
  return prettier.format(content, { parser: 'typescript' });
}

export async function forceRename(from: PathLike, to: PathLike): Promise<void> {
  if (from === to) return;

  if (existsSync(to)) {
    await unlink(to);
  }

  return rename(from, to);
}

export async function copyAndReplaceDir(from: string, to: string): Promise<void> {
  if (existsSync(to)) {
    await rm(to, { recursive: true });
  }

  return cp(from, to, { recursive: true });
}
