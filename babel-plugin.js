const nodePath = require("path");

module.exports = function({ types: t }) {
  return {
    visitor: {
      CallExpression(path) {
        if (path.node.callee.type === "Import") {
          path.replaceWith(
            t.callExpression(
              t.memberExpression(
                t.identifier("require"),
                t.identifier("import")
              ),
              [
                t.numericLiteral(
                  process.installedChunks[
                    nodePath.join(
                      process.installedChunks["nowPath"],
                      path.node.arguments[0].value
                    )
                  ]
                ),
              ]
            )
          );
        }
      },
    },
  };
};
