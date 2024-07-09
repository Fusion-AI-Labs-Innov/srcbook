import fs from 'node:fs/promises';
import Path from 'node:path';
import type {
  CellType,
  CodeCellType,
  CodeLanguageType,
  PackageJsonCellType,
  SrcbookMetadataType,
} from '@srcbook/shared';
import { randomid } from '@srcbook/shared';
import { encode, decode } from '../srcmd.mjs';
import { toFormattedJSON } from '../utils.mjs';
import { readdir } from '../fs-utils.mjs';
import { SRCBOOKS_DIR } from '../constants.mjs';
import { EXAMPLE_SRCBOOKS } from '../srcbook/examples.mjs';
import { pathToCodeFile, pathToPackageJson, pathToReadme } from './path.mjs';

function writeCellOnlyToDisk(srcbookDir: string, cell: PackageJsonCellType | CodeCellType) {
  const path =
    cell.type === 'package.json'
      ? pathToPackageJson(srcbookDir)
      : pathToCodeFile(srcbookDir, cell.filename);

  return fs.writeFile(path, cell.source, { encoding: 'utf8' });
}

export function writeToDisk(srcbookDir: string, metadata: SrcbookMetadataType, cells: CellType[]) {
  const writes = [writeReadmeToDisk(srcbookDir, metadata, cells)];

  for (const cell of cells) {
    if (cell.type === 'package.json' || cell.type === 'code') {
      writes.push(writeCellOnlyToDisk(srcbookDir, cell));
    }
  }

  return Promise.all(writes);
}

export function writeCellToDisk(
  srcbookDir: string,
  metadata: SrcbookMetadataType,
  cells: CellType[],
  cell: PackageJsonCellType | CodeCellType,
) {
  // Readme must also be updated
  return Promise.all([
    writeReadmeToDisk(srcbookDir, metadata, cells),
    writeCellOnlyToDisk(srcbookDir, cell),
  ]);
}

export function moveCodeCellOnDisk(
  srcbookDir: string,
  metadata: SrcbookMetadataType,
  cells: CellType[],
  cell: CodeCellType,
  oldFilename: string,
) {
  return Promise.all([
    writeReadmeToDisk(srcbookDir, metadata, cells),
    fs.unlink(pathToCodeFile(srcbookDir, oldFilename)),
    fs.writeFile(pathToCodeFile(srcbookDir, cell.filename), cell.source, { encoding: 'utf8' }),
  ]);
}

export function writeReadmeToDisk(
  srcbookDir: string,
  metadata: SrcbookMetadataType,
  cells: CellType[],
) {
  return fs.writeFile(pathToReadme(srcbookDir), encode(cells, metadata, { inline: false }), {
    encoding: 'utf8',
  });
}

/**
 * Creates a srcbook directory from a .srcmd file.
 */
export async function importSrcbookFromSrcmdFile(srcmdPath: string) {
  // Check if the user is opening one of the example Srcbooks that comes bundled with the app.
  const example = EXAMPLE_SRCBOOKS.find((example) => example.path === srcmdPath);

  if (example) {
    const { exists } = await readdir(example.dirname);

    if (exists) {
      return example.dirname;
    } else {
      const srcmd = await fs.readFile(example.path, 'utf8');
      return importSrcbookFromSrcmdText(srcmd, example.id);
    }
  } else {
    const srcmd = await fs.readFile(srcmdPath, 'utf8');
    return importSrcbookFromSrcmdText(srcmd);
  }
}

/**
 * Creates a srcbook directory from a srcmd text.
 */
export async function importSrcbookFromSrcmdText(text: string, directoryBasename?: string) {
  const result = decode(text);

  if (result.error) {
    console.error(result.error);
    throw new Error(`Cannot decode invalid srcmd`);
  }

  const dirname = await createSrcbookDir(directoryBasename);

  await writeToDisk(dirname, result.metadata, result.cells);

  return dirname;
}

/**
 * Creates a new srcbook.
 * Each Srcbook has a directory in ~/.srcbook/ refered to as its private directory.
 * This private directory has a randomid() private identifier.
 * Users are not supposed to be aware or modify private directories.
 */
export async function createSrcbook(title: string, metadata: SrcbookMetadataType) {
  const dirname = await createSrcbookDir();

  const cells: CellType[] = [
    {
      id: randomid(),
      type: 'title',
      text: title,
    },
    {
      id: randomid(),
      type: 'package.json',
      source: buildPackageJson(metadata.language),
      filename: 'package.json',
      status: 'idle',
    },
  ];

  await writeToDisk(dirname, metadata, cells);

  return dirname;
}

async function createSrcbookDir(basename: string = randomid()) {
  const dirname = Path.join(SRCBOOKS_DIR, basename);
  await fs.mkdir(dirname);
  await fs.mkdir(Path.join(dirname, 'src'));
  return dirname;
}

function buildPackageJson(language: CodeLanguageType) {
  return toFormattedJSON(language === 'typescript' ? buildTSPackageJson() : buildJSPackageJson());
}

function buildJSPackageJson() {
  return {
    type: 'module',
    dependencies: {},
  };
}

function buildTSPackageJson() {
  return {
    type: 'module',
    dependencies: {
      tsx: 'latest',
      typescript: 'latest',
      '@types/node': 'latest',
    },
  };
}

export async function removeSrcbook(srcbookDir: string) {
  await fs.rm(srcbookDir, { recursive: true });
}