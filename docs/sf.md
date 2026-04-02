# sf

## sf extract test

Utility to find test files in the base directory and its subdirectories.

### Options

| Flag | Short | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--base-dir` | `-b` | string | No | `process.cwd()` | Base directory for the test files |
| `--test-suite` | `-s` | array | No | — | Name of the test suite to find files for |

### Examples

# Extract all test classes from the current directory
```bash
hacerx sf extract test
```

# Extract test classes from a specific directory
```bash
hacerx sf extract test --base-dir ./force-app
```

# Extract only from a specific test suite
```bash
hacerx sf extract test --test-suite MySuite
```

---

## sf permissionset generate-admin

Generate a permissionset for system admins with full permissions to all objects

### Options

| Flag | Short | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--username` | `-u` | string | Yes | — | Salesforce username |
| `--output-dir` | `-o` | string | No | `"./"` | Output directory |

---

## sf types object

SObject(s) to get types for

Get multiple types, either set multiple --sobject flags or a single --sobject flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes.

It can be used with the --case-insensitive flag to ignore the case of SObject names.

Allows wildcard characters * and ..

### Options

| Flag | Short | Type | Required | Default | Description |
|------|-------|------|----------|---------|-------------|
| `--sobject` | `-s` | array | Yes | — | SObject(s) to get types for |
| `--output-dir` | `-o` | string | No | `"./types/"` | Output directory |
| `--username` | `-u` | string | Yes | — | Salesforce username |
| `--case-insensitive` | `-i` | boolean | No | — | Case insensitive SObject names |
| `--declare-module` | — | boolean | No | — | Add declare module to the output file |

---
