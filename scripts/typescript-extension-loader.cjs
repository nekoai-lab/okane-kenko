const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Rewrite only module specifiers in the build input; source files stay unchanged.
module.exports = function typescriptExtensionLoader(source) {
  const file = ts.createSourceFile(this.resourcePath, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  const visit = (node) => {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = node.moduleSpecifier;
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      specifier = node.arguments[0];
    }
    if (
      specifier &&
      ts.isStringLiteral(specifier) &&
      /^\.{1,2}\//.test(specifier.text) &&
      specifier.text.endsWith(".js")
    ) {
      const stem = specifier.text.slice(0, -3);
      for (const extension of [".ts", ".tsx", ".js"]) {
        const candidate = path.resolve(path.dirname(this.resourcePath), stem + extension);
        this.addDependency(candidate);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          edits.push([specifier.getStart(file) + 1, specifier.end - 1, stem + extension]);
          break;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) {
    source = source.slice(0, start) + replacement + source.slice(end);
  }
  return source;
};
