import { build } from 'esbuild';
import { readdirSync, existsSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const projectRoot = join(__dirname, '..');
const srcCommandsDir = join(projectRoot, 'src', 'commands');
const entryFile = join(projectRoot, 'src', '_pro_entry.ts');
const outFile = join(projectRoot, 'dist', 'index.js');
function collectCommandFiles(dir, prefix) {
    const results = [];
    if (!existsSync(dir))
        return results;
    for (const item of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, item.name);
        if (item.isDirectory()) {
            results.push(...collectCommandFiles(fullPath, [...prefix, item.name]));
        }
        else if (item.isFile() &&
            item.name.endsWith('.ts') &&
            !item.name.endsWith('.test.ts') &&
            !item.name.endsWith('.d.ts')) {
            results.push({
                path: [...prefix, item.name.replace(/\.ts$/, '')],
                srcPath: fullPath,
            });
        }
    }
    return results;
}
function generateEntry(commands) {
    const imports = commands
        .map((cmd, i) => {
        const rel = relative(join(projectRoot, 'src'), cmd.srcPath)
            .replace(/\\/g, '/')
            .replace(/\.ts$/, '.js');
        return `import _cmd${i} from './${rel}';`;
    })
        .join('\n');
    const entries = commands
        .map((cmd, i) => `  { path: ${JSON.stringify(cmd.path)}, CommandClass: _cmd${i} },`)
        .join('\n');
    return `${imports}\nimport { registerCommandsStatic } from './cli.js';\n\nregisterCommandsStatic([\n${entries}\n]);\n`;
}
const commands = collectCommandFiles(srcCommandsDir, []);
if (commands.length === 0) {
    console.error('No commands found in src/commands/');
    process.exit(1);
}
// Clean dist/
const distDir = join(projectRoot, 'dist');
if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
    console.log('Cleaned dist/');
}
console.log(`Found ${commands.length} command(s). Generating entry point...`);
writeFileSync(entryFile, generateEntry(commands), 'utf-8');
try {
    console.log('Bundling with esbuild...');
    await build({
        entryPoints: [entryFile],
        bundle: true,
        minify: true,
        platform: 'node',
        format: 'esm',
        outfile: outFile,
        // Bundle the npm punycode package inline so Node's deprecated built-in (DEP0040)
        // is never loaded at runtime (required by whatwg-url@5 and tr46 via node-fetch).
        alias: {
            punycode: resolve(projectRoot, 'node_modules', 'punycode', 'punycode.js'),
        },
        // Polyfill require() for bundled CJS deps that use it at runtime.
        // Also patch url.parse (DEP0169) with a WHATWG URL-based replacement before
        // any bundled code runs — faye / websocket-driver call it but are unmaintained.
        banner: {
            // Line 1: shebang (must be its own line — it's a comment that swallows the rest).
            // Line 2+: ESM-compatible CJS require polyfill + url.parse replacement (DEP0169).
            // url.parse is patched before any bundled module runs so faye/websocket-driver
            // (unmaintained) never call the deprecated Node built-in.
            js: '#!/usr/bin/env node\n'
                + "import{createRequire}from'module';const require=createRequire(import.meta.url);"
                + "(()=>{"
                + "const _m=require('url');"
                + "_m.parse=function(s,q){"
                + "if(!s)return null;s=String(s);"
                + "let u;"
                + "try{u=new URL(s);}catch{"
                + "try{u=new URL(s,'http://localhost');}catch{return null;}"
                + "}"
                + "const abs=u.origin!='null'&&!s.startsWith('/')&&!s.startsWith('.');"
                + "const port=u.port||null,search=u.search||null,hash=u.hash||null;"
                + "const query=q?Object.fromEntries(u.searchParams):search?search.slice(1):null;"
                + "const auth=u.username?(u.password?u.username+':'+u.password:u.username):null;"
                + "return abs"
                + "?{href:u.href,protocol:u.protocol,slashes:true,auth,host:u.host,port,hostname:u.hostname,hash,search,query,pathname:u.pathname,path:u.pathname+(search||'')}"
                + ":{href:s,protocol:null,slashes:null,auth:null,host:null,port:null,hostname:null,hash,search,query,pathname:u.pathname,path:u.pathname+(search||'')};"
                + "};"
                + "})();",
        },
    });
    console.log('Built: dist/index.js');
}
finally {
    unlinkSync(entryFile);
}
