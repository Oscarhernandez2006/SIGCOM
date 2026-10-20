const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');

const output = path.resolve(__dirname, '../dist');
const files = [];

function listFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) listFiles(filename);
    else if (entry.name.endsWith('.js')) files.push(filename);
  }
}

assert.ok(fs.existsSync(path.join(output, 'main.js')), 'Missing dist/main.js');
assert.ok(fs.existsSync(path.join(output, 'database/database.module.js')), 'Missing dist/database/database.module.js');
listFiles(output);

const missing = [];
let imports = 0;
for (const filename of files) {
  const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const resolver = createRequire(filename);
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith('.')) {
      imports++;
      try {
        resolver.resolve(node.arguments[0].text);
      } catch {
        missing.push(`${path.relative(output, filename)} -> ${node.arguments[0].text}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

assert.equal(missing.length, 0, `Unresolved compiled imports:\n${missing.join('\n')}`);
console.log(`[verify-build] ${files.length} compiled files, ${imports} local imports resolved.`);