import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const source = await fs.readFile(new URL('./finance.test.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    .replaceAll('../src/', '../dist/');
const output = new URL('./finance.generated.test.mjs', import.meta.url);
await fs.writeFile(output, javascript);
const result = spawnSync(process.execPath, ['--test', output.pathname.replace(/^\/(\w:)/, '$1')], { stdio: 'inherit' });
process.exitCode = result.status || 0;
