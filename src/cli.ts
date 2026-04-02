import { Command, Option } from 'commander';
import fs from 'fs';
import path from 'path';
import { CommandBase } from './lib/CommandBase.js';
export type { Flags, FlagDefinition, FlagType } from './lib/CommandBase.js';
export { CommandBase };

function camelize(str: string): string {
  return str.replace(/-([a-z])/g, (_, l: string) => l.toUpperCase());
}

type RegisterCommandOpts = {
  dirPath: string;
  /**
   * If you want to add a Commander
   */
  program?: Command;
  /**
   * Whether to parse arguments
   * @default true
   */
  parse?: boolean;
}

export type StaticCommandEntry = {
  path: string[];
  CommandClass: new () => CommandBase;
};

function wireCommand(cmd: Command, mod: CommandBase): void {
  for (const [key, option] of Object.entries(mod.flags)) {
    const flagArr = [];
    if (option.char) {
      flagArr.push(`-${option.char}`);
    }
    if (option.type === 'array') {
      if (option.required) {
        flagArr.push(`--${key} <value...>`);
      } else {
        flagArr.push(`--${key} [value...]`);
      }
    } else {
      flagArr.push(`--${key}`);
    }
    const flags = flagArr.join(', ');
    const opt = new Option(flags, option.description);
    opt.required = option.required ?? false;
    if (option.defaultValue !== undefined || option.type === 'boolean') {
      opt.default(option.defaultValue ?? false);
    }

    if (option.parseArg) {
      opt.argParser(option.parseArg);
    } else if (option.type === 'integer') {
      opt.argParser((value) => parseInt(value));
    } else if (option.type === 'float') {
      opt.argParser((value) => parseFloat(value));
    }

    if (opt.required && !option.resolveDefault) {
      opt.makeOptionMandatory();
    } else {
      opt.optional = true;
    }

    cmd.addOption(opt);
  }

  // preAction hook: resolve dynamic defaults and enforce required check
  const dynamicFlags = Object.entries(mod.flags).filter(([, def]) => def.resolveDefault);
  if (dynamicFlags.length > 0) {
    cmd.hook('preAction', () => {
      for (const [key, option] of dynamicFlags) {
        const camelKey = camelize(key);
        const current = cmd.opts()[camelKey];
        if (current === undefined || current === false || current === '') {
          const resolved = option.resolveDefault!();
          if (resolved !== undefined) {
            cmd.setOptionValue(camelKey, resolved);
          } else if (option.required) {
            console.error(`error: required option '--${key} <value>' not specified and no default found in .sf/config.json`);
            process.exit(1);
          }
        }
      }
    });
  }

  if (mod.examples?.length) {
    const examplesText = mod.examples
      .map((ex) => `  ${ex.description ? `# ${ex.description}\n  ` : ''}${ex.command}`)
      .join('\n\n');
    cmd.addHelpText('after', `\nExamples:\n${examplesText}`);
  }
}

export async function registerCommands({ dirPath, program, parse = true }: RegisterCommandOpts) {
  const parentCommand = program ?? new Command();
  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      const subCommand = new Command(item.name);
      parentCommand.addCommand(subCommand);
      await registerCommands({dirPath: fullPath, program: subCommand, parse: false});
    } else if (item.isFile() && !item.name.endsWith('.d.ts') && !item.name.endsWith('.test.js') && !item.name.endsWith('.test.ts') && (item.name.endsWith('.ts') || item.name.endsWith('.js'))) {
      const mod: CommandBase = new (await import(`file://${fullPath.replace(/\.ts$/, '.js')}`)).default();
      const cmd = parentCommand
        .command(item.name.split('.')[0])
        .description(mod.description ?? '')
        .action(mod.action);

      wireCommand(cmd, mod);
    }
  }

  if (parse) {
    parentCommand.parse(process.argv);
  } else {
    return parentCommand;
  }
}

export function registerCommandsStatic(entries: StaticCommandEntry[], program?: Command): void {
  const root = program ?? new Command();

  for (const { path: commandPath, CommandClass } of entries) {
    const mod = new CommandClass();

    // Ensure intermediate subcommands exist
    let parent = root;
    for (let i = 0; i < commandPath.length - 1; i++) {
      const segment = commandPath[i];
      let sub = parent.commands.find((c) => c.name() === segment);
      if (!sub) {
        sub = new Command(segment);
        parent.addCommand(sub);
      }
      parent = sub;
    }

    const name = commandPath[commandPath.length - 1];
    const cmd = parent
      .command(name)
      .description(mod.description ?? '')
      .action(mod.action);

    wireCommand(cmd, mod);
  }

  root.parse(process.argv);
}
