import * as ts from 'typescript';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const projectRoot = join(__dirname, '..');
const srcCommandsDir = join(projectRoot, 'src', 'commands');
const docsDir = join(projectRoot, 'docs');
function extractStringLiteral(node) {
    if (ts.isStringLiteral(node))
        return node.text;
    if (ts.isNoSubstitutionTemplateLiteral(node))
        return node.text;
    if (ts.isTemplateExpression(node)) {
        // Return head text for template expressions with interpolations
        return node.head.text.trim();
    }
    return undefined;
}
function extractDefaultValue(node, sourceFile) {
    if (ts.isStringLiteral(node))
        return `"${node.text}"`;
    if (ts.isNoSubstitutionTemplateLiteral(node))
        return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword)
        return 'true';
    if (node.kind === ts.SyntaxKind.FalseKeyword)
        return 'false';
    if (ts.isNumericLiteral(node))
        return node.text;
    if (ts.isCallExpression(node))
        return node.getText(sourceFile);
    return undefined;
}
function parseFlagObject(objLiteral, sourceFile) {
    const result = { description: '' };
    for (const prop of objLiteral.properties) {
        if (!ts.isPropertyAssignment(prop))
            continue;
        const name = prop.name.getText(sourceFile).replace(/['"]/g, '');
        const init = prop.initializer;
        switch (name) {
            case 'char':
                result.char = extractStringLiteral(init);
                break;
            case 'description':
                result.description = extractStringLiteral(init) ?? '';
                break;
            case 'required':
                if (init.kind === ts.SyntaxKind.TrueKeyword)
                    result.required = true;
                if (init.kind === ts.SyntaxKind.FalseKeyword)
                    result.required = false;
                break;
            case 'defaultValue':
                result.defaultValue = extractDefaultValue(init, sourceFile);
                break;
        }
    }
    return result;
}
function parseExamples(arrayLiteral, sourceFile) {
    const examples = [];
    for (const element of arrayLiteral.elements) {
        if (!ts.isObjectLiteralExpression(element))
            continue;
        let description = '';
        let command = '';
        for (const prop of element.properties) {
            if (!ts.isPropertyAssignment(prop))
                continue;
            const name = prop.name.getText(sourceFile).replace(/['"]/g, '');
            const value = extractStringLiteral(prop.initializer) ?? '';
            if (name === 'description')
                description = value;
            if (name === 'command')
                command = value;
        }
        if (command)
            examples.push({ description, command });
    }
    return examples;
}
function parseFlagType(callExpr) {
    const expr = callExpr.expression;
    if (ts.isPropertyAccessExpression(expr))
        return expr.name.text;
    return 'string';
}
function parseCommandSource(filePath) {
    const sourceText = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    let description = '';
    const flags = {};
    let examples = [];
    ts.forEachChild(sourceFile, (node) => {
        // Extract top-level `const flags = { ... } as const`
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (!ts.isIdentifier(decl.name) || decl.name.text !== 'flags')
                    continue;
                if (!decl.initializer)
                    continue;
                let objLiteral;
                if (ts.isAsExpression(decl.initializer) &&
                    ts.isObjectLiteralExpression(decl.initializer.expression)) {
                    objLiteral = decl.initializer.expression;
                }
                else if (ts.isObjectLiteralExpression(decl.initializer)) {
                    objLiteral = decl.initializer;
                }
                if (!objLiteral)
                    continue;
                for (const prop of objLiteral.properties) {
                    if (!ts.isPropertyAssignment(prop))
                        continue;
                    const flagName = prop.name.getText(sourceFile).replace(/['"]/g, '');
                    const init = prop.initializer;
                    if (ts.isCallExpression(init)) {
                        const flagType = parseFlagType(init);
                        const arg = init.arguments[0];
                        if (arg && ts.isObjectLiteralExpression(arg)) {
                            flags[flagName] = { ...parseFlagObject(arg, sourceFile), type: flagType };
                        }
                    }
                }
            }
        }
        // Extract `description` and `examples` from the exported class
        if (ts.isClassDeclaration(node)) {
            for (const member of node.members) {
                if (!ts.isPropertyDeclaration(member) || !member.initializer)
                    continue;
                const memberName = member.name?.getText(sourceFile);
                if (memberName === 'description') {
                    description = extractStringLiteral(member.initializer) ?? '';
                }
                else if (memberName === 'examples' && ts.isArrayLiteralExpression(member.initializer)) {
                    examples = parseExamples(member.initializer, sourceFile);
                }
            }
        }
    });
    if (!description && Object.keys(flags).length === 0)
        return null;
    return { description, flags, examples };
}
function collectSourceFiles(dir, prefix) {
    const results = [];
    if (!existsSync(dir))
        return results;
    const items = readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = join(dir, item.name);
        if (item.isDirectory()) {
            results.push(...collectSourceFiles(fullPath, [...prefix, item.name]));
        }
        else if (item.isFile() &&
            item.name.endsWith('.ts') &&
            !item.name.endsWith('.test.ts') &&
            !item.name.endsWith('.d.ts')) {
            results.push({
                path: [...prefix, item.name.replace(/\.ts$/, '')],
                filePath: fullPath,
            });
        }
    }
    return results;
}
function toAnchor(commandPath) {
    return commandPath.join('-').toLowerCase();
}
function firstLine(text) {
    const line = text.split('\n')[0]?.trim();
    return line || 'No description provided.';
}
function renderFlagsTable(flags) {
    const entries = Object.entries(flags);
    if (entries.length === 0)
        return 'This command has no options.';
    const rows = entries.map(([name, def]) => {
        const flag = `\`--${name}\``;
        const short = def.char ? `\`-${def.char}\`` : '—';
        const type = def.type ?? 'string';
        const required = def.required ? 'Yes' : 'No';
        const defaultVal = def.defaultValue !== undefined ? `\`${def.defaultValue}\`` : '—';
        const desc = def.description ?? '';
        return `| ${flag} | ${short} | ${type} | ${required} | ${defaultVal} | ${desc} |`;
    });
    return [
        '| Flag | Short | Type | Required | Default | Description |',
        '|------|-------|------|----------|---------|-------------|',
        ...rows,
    ].join('\n');
}
function renderExamples(examples) {
    return examples
        .map((ex) => [`${ex.description ? `# ${ex.description}` : ''}`, '```bash', ex.command, '```'].filter(Boolean).join('\n'))
        .join('\n\n');
}
function generateReadme(entries, pkg) {
    const projectName = pkg.name ?? 'alpha-cli';
    const projectDesc = pkg.description || 'A CLI tool for day-to-day tasks.';
    const tableRows = entries.map((entry) => {
        const commandStr = entry.path.join(' ');
        const desc = firstLine(entry.description);
        const group = entry.path[0];
        const anchor = toAnchor(entry.path);
        const detailsLink = entry.path.length > 1
            ? `[docs](docs/${group}.md#${anchor})`
            : `[docs](docs/${group}.md)`;
        return `| \`${commandStr}\` | ${desc} | ${detailsLink} |`;
    });
    return [
        `# ${projectName}`,
        '',
        `> ${projectDesc}`,
        '',
        '## Installation',
        '',
        '```bash',
        `npm install -g ${projectName}`,
        '```',
        '',
        '## Usage',
        '',
        '```bash',
        `${projectName} <command> [options]`,
        '```',
        '',
        '## Commands',
        '',
        '| Command | Description | Details |',
        '|---------|-------------|---------|',
        ...tableRows,
        '',
        '---',
        '*This documentation was auto-generated. Run `npm run docs` to regenerate.*',
        '',
    ]
        .join('\n')
        .replace(/\r\n/g, '\n');
}
function generateGroupDoc(group, entries) {
    const lines = [`# ${group}`, ''];
    for (const entry of entries) {
        const commandStr = entry.path.join(' ');
        lines.push(`## ${commandStr}`, '');
        lines.push(entry.description || 'No description provided.', '');
        lines.push('### Options', '');
        lines.push(renderFlagsTable(entry.flags), '');
        if (entry.examples.length > 0) {
            lines.push('### Examples', '');
            lines.push(renderExamples(entry.examples), '');
        }
        lines.push('---', '');
    }
    return lines.join('\n').replace(/\r\n/g, '\n');
}
async function main() {
    if (!existsSync(srcCommandsDir)) {
        console.error(`Error: src/commands not found at ${srcCommandsDir}`);
        process.exit(1);
    }
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
    const files = collectSourceFiles(srcCommandsDir, []);
    const entries = [];
    for (const { path, filePath } of files) {
        const parsed = parseCommandSource(filePath);
        if (parsed) {
            entries.push({ path, ...parsed });
        }
        else {
            console.warn(`Skipped (no metadata found): ${filePath}`);
        }
    }
    if (entries.length === 0) {
        console.warn('No commands found in src/commands/');
        return;
    }
    await mkdir(docsDir, { recursive: true });
    const readme = generateReadme(entries, pkg);
    await writeFile(join(projectRoot, 'README.md'), readme, 'utf-8');
    console.log('Generated README.md');
    const groups = new Map();
    for (const entry of entries) {
        const group = entry.path[0];
        if (!groups.has(group))
            groups.set(group, []);
        groups.get(group).push(entry);
    }
    for (const [group, groupEntries] of groups) {
        const content = generateGroupDoc(group, groupEntries);
        await writeFile(join(docsDir, `${group}.md`), content, 'utf-8');
        console.log(`Generated docs/${group}.md`);
    }
    console.log('Documentation generated successfully.');
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
