import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const source = await fs.readFile(new URL('./finance.test.ts', import.meta.url), 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    .replaceAll('../src/', '../dist/');
const output = new URL('./finance.generated.test.mjs', import.meta.url);
await fs.writeFile(output, javascript);
// Imported application modules may load dotenv. An empty working directory keeps real .env credentials out of tests.
const runtime = new URL('../../.local/finance-test-runtime/', import.meta.url);
await fs.mkdir(runtime, { recursive: true });
const result = spawnSync(process.execPath, ['--test', fileURLToPath(output)], { stdio: 'inherit', cwd: fileURLToPath(runtime) });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
