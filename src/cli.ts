import { Command, Option } from 'commander';
import fs from 'fs';
import path from 'path';
import { CommandBase } from './lib/CommandBase.js';
export type { Flags, FlagDefinition, FlagType } from './lib/CommandBase.js';
export { CommandBase };

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

export async function registerCommands({ dirPath, program, parse = true }: RegisterCommandOpts) {
  const parentCommand = program ?? new Command();
  const items = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      const subCommand = new Command(item.name);
      parentCommand.addCommand(subCommand);
      await registerCommands({dirPath: fullPath, program: subCommand, parse: false});
    } else if (item.isFile() && !item.name.endsWith('.d.ts') && (item.name.endsWith('.ts') || item.name.endsWith('.js'))) {
      const mod: CommandBase = new (await import(`file://${fullPath.replace(/\.ts$/, '.js')}`)).default();
      const cmd = parentCommand
        .command(item.name.split('.')[0])
        .description(mod.description ?? '')
        .action(mod.action);

      for(const [key, option] of Object.entries(mod.flags)) {
        const flagArr = [];
        if(option.char){
          flagArr.push(`-${option.char}`);
        }
        if(option.type === 'array') {
          if(option.required) {
            flagArr.push(`--${key} <value...>`);
          }else{
            flagArr.push(`--${key} [value...]`);
          }
        }else{
          flagArr.push(`--${key}`);
        }
        const flags = flagArr.join(', ');
        const opt = new Option(flags, option.description);
        opt.required = option.required ?? false;
        if(option.defaultValue !== undefined || option.type === 'boolean') {
          opt.default(option.defaultValue ?? false);
        }

        if(option.parseArg){
          opt.argParser(option.parseArg);
        }else if(option.type === 'integer'){
          opt.argParser((value) => parseInt(value));
        } else if(option.type === 'float'){
          opt.argParser((value) => parseFloat(value));
        }

        if(opt.required) {
          opt.makeOptionMandatory();
        }else{
          opt.optional = true;
        }
  
        cmd.addOption(opt);
      }
    }
  }

  if(parse){
    parentCommand.parse(process.argv);
  }else {
    return parentCommand;
  }
}


