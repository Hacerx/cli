import { CommandBase, FlagType } from '../../../lib/CommandBase.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join  } from 'node:path';

const flags = {
    'base-dir': FlagType.string({
        char: 'b',
        description: 'Base directory for the test files',
        defaultValue: process.cwd()
    }),
    'test-suite': FlagType.array<string>({
        char: 's',
        description: 'Name of the test suite to find files for',
    })
} as const;

function extractTestClassesFromXml(content: string): string[] {
    const regex = /<testClassName>(.*?)<\/testClassName>/g;
    let matches;
    const testClasses = [];

    while ((matches = regex.exec(content)) !== null) {
        testClasses.push(matches[1]);
    }

    return testClasses;
}

function findAllTestSuitesDirs(dir: string, testSuitesDirs: string[] = []): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'testSuites') {
                testSuitesDirs.push(fullPath);
            } else {
                findAllTestSuitesDirs(fullPath, testSuitesDirs);
            }
        }
    }

    return testSuitesDirs;
}

function readAllXmlFilesInDirs(dirs: string[]): string[] {
    const testClassSet = new Set<string>();

    for (const dir of dirs) {
        const files = readdirSync(dir).filter(file => file.endsWith('.testSuite-meta.xml'));

        for (const file of files) {
            const filePath = join(dir, file);
            const content = readFileSync(filePath, 'utf-8');
            const testClasses = extractTestClassesFromXml(content);
            testClasses.forEach(name => testClassSet.add(name));
        }
    }

    return [...testClassSet];
}


export default class TestUtils extends CommandBase<typeof flags> {
    flags = flags;

    description = 'Utility to find test files in the base directory and its subdirectories.';
    
    async run(): Promise<void> {

        const { baseDir } = this.options;
        // console.log(resolve(baseDir));

        const testSuitesDirs = findAllTestSuitesDirs(baseDir);
        const testClasses = readAllXmlFilesInDirs(testSuitesDirs);
        const output = testClasses.map(name => `-t ${name}`).join(' ');
        console.log(output);
    }
}
