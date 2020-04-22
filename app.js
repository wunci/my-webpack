const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");
const loader = require("./loader");

let id = 0; // 文件id
let bundleId = 0; // 模块id
const installedChunks = {}; // 缓存路径+id

// 解析文件
const resolve = function(filename) {
  let content = "";
  content = fs.readFileSync(path.resolve(__dirname, filename), "utf-8");
  content = loader(content);
  const ast = parser.parse(content, {
    sourceType: "module"
  });
  const dependencies = [];
  traverse(ast, {
    ImportDeclaration({ node }) {
      // import '' from ''
      dependencies.push(node.source.value);
    },
    CallExpression({ node }) {
      // import()
      if (node.callee.type === "Import") {
        const realPath = path.join(
          path.dirname(filename),
          node.arguments[0].value
        );
        if (installedChunks[realPath] !== undefined) return;
        let sourse = fs.readFileSync(realPath, "utf-8");
        // 转es5
        const { code } = babel.transform(sourse, {
          presets: ["@babel/preset-env"]
        });
        sourse = `jsonp.load([${bundleId}, function(){${code}}])`;
        fs.writeFileSync(`./dist/${bundleId}.bundle.js`, sourse);
        installedChunks[realPath] = bundleId;
        bundleId++;
        process.installedChunks = {
          nowPath: path.dirname(filename),
          ...installedChunks
        };
      }
    }
  });
  // ES6转成ES5
  const { code } = babel.transformFromAstSync(ast, null, {
    plugins: ["./babel-plugin.js"],
    presets: ["@babel/preset-env"]
  });
  return {
    id: id++,
    dependencies,
    filename,
    code
  };
};

// 递归启动查找
const start = function(filename) {
  const entry = resolve(filename);
  const queue = [entry];
  for (const asset of queue) {
    const dependencies = asset.dependencies;
    const dirname = path.dirname(asset.filename);
    asset.mapping = {};
    dependencies.forEach(val => {
      const result = resolve(path.join(dirname, val));
      asset.mapping[val] = result.id;
      queue.push(result);
    });
  }
  return queue;
};

// 是否存在dist
if (!fs.existsSync("dist")) {
  fs.mkdirSync("dist");
}
const fileDependenceList = start("./src/entry.js");
let moduleStr = "";

fileDependenceList.forEach(value => {
  moduleStr += `${value.id}:[
    function(require, module, exports) {
      ${value.code};
    },
    ${JSON.stringify(value.mapping)}
  ],`;
});

const result = `(${fs.readFileSync("./init.js", "utf-8")})({${moduleStr}})`;

try {
  fs.writeFileSync("./dist/result.js", result);
  console.log("编译成功");
} catch (error) {
  console.log(error);
}
