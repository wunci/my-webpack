## 执行
```
npm i
npm run dev
```
then:  open index.html

## 实现功能

1. 支持 `esModule` 
2. 支持 `import()` 异步加载文件
3. 支持 `loader`

## 准备工作

我们需要借助 `babel` 来解析，先 `npm init -y`
```
npm i @babel/parser @babel/traverse @babel/core -D
```

最终的文件目录结构
```
|-- dist           // 打包目标文件夹 
|   |-- 0.bundle.js                       
|   |-- 1.bundle.js                    
|   |-- result.js                       
|-- src            // 项目测试代码                         
|   |-- entry.js                   
|   |-- messgae.js            
|   |-- name.js            
|   |-- a.js              
|   |-- b.js            
|-- index.html      // 加载文件打包出的文件             
|-- app.js          // 启动文件         
|-- init.js         // 打包项目需要的初始化代码
|-- babel-plugin.js // babel插件
|-- loader.js       // loader
|-- package.json   
```
<!-- more -->
文件内容
entry.js
```js
import message from "./message.js";
console.log(message);
import("./a.js").then(() => {
  console.log("a done");
});
```
message.js
```js
import { name } from "./name.js";
export default `hello ${name}!`;
import("./a.js").then(() => {
  console.log("copy a done");
});
```
name.js
```js
export const name = "world";
import("./b.js").then(() => {
  console.log("b done");
});
```
a.js
```js
console.log("import a");
setTimeout(() => {
  document.body.style = "background:red;";
}, 3000);
```
b.js
```js
console.log("import b");
```

## 编写

我在之前写的 [webpack系列之输出文件分析](http://www.wclimb.site/2019/06/19/webpack%E7%B3%BB%E5%88%97%E4%B9%8B%E8%BE%93%E5%87%BA%E6%96%87%E4%BB%B6%E5%88%86%E6%9E%90/) 文章说过，`webpack`打包出来的代码大致的样子是👇
```js
(function(modules) {
  function __webpack_require__(moduleId) {
    ...
  }
  ...
  return __webpack_require__(__webpack_require__.s = "./src/main.js");
})({
  "./src/a.js": (function(module, __webpack_exports__, __webpack_require__) {}
  "./src/b.js": (function(module, __webpack_exports__, __webpack_require__) {}
  "./src/main.js": (function(module, __webpack_exports__, __webpack_require__) {}
})
```

借鉴他的思路，我们也可以很快写出来一个简单的 `webpack`，首先 `(function(modules) {...})` 内部的代码基本上可以写死，也就是我们等会需要写的 `init.js`，接着看，这是一个自执行的函数， 传入的是一个对象，首先执行的是主入口的文件，然后再分别去找他们的依赖去执行相应的文件。

### 热身

我们这里借助bable来编译代码
先简单看一下👇这个示例
```js
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const babel = require("@babel/core");
let id = 0;

const resolve = function(filename) {
  let content = "";
  content = fs.readFileSync(path.resolve(__dirname, filename), "utf-8");
  // 转ast树
  const ast = parser.parse(content, {
    sourceType: "module",
  });
  // 依赖
  const dependencies = [];
  traverse(ast, {
    ImportDeclaration({ node }) {
      // import '' from ''
      dependencies.push(node.source.value);
    },
  });
  // ES6转成ES5
  const { code } = babel.transformFromAstSync(ast, null, {
    presets: ["@babel/preset-env"],
  });
  return {
    id: id++,
    dependencies,
    filename,
    code,
  };
};
const result = resolve("./src/entry.js");
console.log(result);
```
打印结果
```js
{ id: 0,
  dependencies: [ './message.js' ],
  filename: './src/entry.js',
  code: '"use strict";\n\nvar _message = _interopRequireDefault(require( ....."
}
```
我们这里解析了一个入口文件，然后通过 `babel` 转成 `ast`，`ImportDeclaration` 拦截到 `import`，将它添加到 `dependencies` 依赖内，处理完 `import`后把代码转成 `es5`，最后输出对象，包含当前的文件的`id`，依赖关系，文件名，以及编译后的源代码。这段代码是整篇的精髓，不过现在只处理了一个文件，我们刚刚找到了当前文件的依赖，接着需要递归查找下一个文件的依赖关系，最后把他们组合起来，跟之前看 `webpack` 输出的文件思想差不多。


### 递归查找所有依赖

在下面添加以下代码👇，顺便删除最后两行 `const result = resolve("./src/entry.js"); console.log(result); `
```js
const start = function(filename) {
  const entry = resolve(filename);
  const queue = [entry];
  for (const asset of queue) {
    const dependencies = asset.dependencies;
    const dirname = path.dirname(asset.filename);
    asset.mapping = {};
    dependencies.forEach((val) => {
      const result = resolve(path.join(dirname, val));
      asset.mapping[val] = result.id;
      queue.push(result);
    });
  }
  return queue;
};
const fileDependenceList = start("./src/entry.js");
console.log(fileDependenceList);
```
执行后结果，我们捋一捋
入口 `entry.js` import 👉 `message.js`
`message.js` import 👉 `name.js`
`name.js` 没有 `import` 别的文件所以依赖是空的
```js
[
  {
    id: 0,
    dependencies: [ './message.js' ],
    filename: './src/entry.js',
    code: '"use strict";\n\nvar _message = _interopRequireDefault(require( ....."'
  },
  {
    id: 1,
    dependencies: [ './name.js' ],
    filename: 'src/message.js',
    code: '"..."'
  },
  {
    id: 2,
    dependencies: [],
    filename: 'src/name.js',
    code: '"..."'
  },
]
```
结果我们得到了，目前还不是之前想要的那个结构，继续添加以下代码
```js
let moduleStr = "";
fileDependenceList.forEach((value) => {
  moduleStr += `${value.id}:[
    function(require, module, exports) {
      ${value.code};
    },
    ${JSON.stringify(value.mapping)}
  ],`;
});
const result = `(${fs.readFileSync("./init.js", "utf-8")})({${moduleStr}})`;
fs.writeFileSync("./dist/result.js", result); // 注意这里需要有dist文件夹
```
这里把 `init.js` 引入了，内容如下
```js
function init(modules) {
  function require(id) {
    var [fn, mapping] = modules[id];
    function localRequire(relativePath) {
      return require(mapping[relativePath]);
    }
    var module = { exports: {} };
    fn(localRequire, module, module.exports);
    return module.exports;
  }
  //执行入口文件，
  return require(0);
}
```
执行之后在 `dist/` 下有一个 `result` 文件，我们放到浏览器去执行，`index.html` 加载

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>webpack</title>
  </head>
  <body>
    <script src="./dist/result.js"></script>
  </body>
</html>
```
不出意外控制台输出 `hello world`，接着会有三个报错，没错，因为我们没有处理 `import().then()` 这种代码，这个需要单独处理，如果你想把错误去掉，去 `src` 文件夹把 `import()` 都注释就完事了。

你去看 `result` 的代码内容，会发现代码我们首先执行 `require(0)`，从入口触发，然后递归调用 `require` 来完成整个流程，看我们之前 `moduleStr` 输出的代码，结构跟 `webpack` 输入的有点区别，思路差不多
```js
{
  0: [
    function(require, module, exports) {
      var _message = _interopRequireDefault(require("./message.js"));
      function _interopRequireDefault(obj) {
        return obj && obj.__esModule ? obj : { default: obj };
      }
      console.log(_message["default"]);
    },
    { "./message.js": 1 },
  ],
  1: [function(require, module, exports) { ... }, { "./name.js": 2 }],
  2: [function(require, module, exports) { ... }, {}],
}
```
我们 `require` 都是当前文件的 `id`，但是我们看内部有一段 `require("./message.js")` ，其实它执行的是 `localRequire` 方法，通过当前文件数组的第二个值 `{ "./message.js": 1 }` 来定位它要执行的 `id` 是什么，这里的 `id` 是1，下面就是它的逻辑，通过文件名`filename`，去查找 `mapping` 对应的 `id`。
```js
var [fn, mapping] = modules[id];
function localRequire(relativePath) {
  return require(mapping[relativePath]);
}
```

### 支持 import() 异步加载

首先先来解释以下如何异步加载，我们需要先生成 `0.bundle.js` `1.bundle.js`这样的文件，然后通过 `document.createElement("script")` 把它 `push` 到页面的 `head` 内完成加载。
修改`babel`部分
```diff
....

+ let bundleId = 0;
+ const installedChunks = {};
const resolve = function(filename) {
  let content = "";
  content = fs.readFileSync(path.resolve(__dirname, filename), "utf-8");
  const ast = parser.parse(content, {
    sourceType: "module",
  });
  const dependencies = [];
  traverse(ast, {
    ImportDeclaration({ node }) {
      // import '' from ''
      dependencies.push(node.source.value);
    },
+    CallExpression({ node }) {
+      // import()
+      if (node.callee.type === "Import") {
+        const realPath = path.join(
+          path.dirname(filename),
+          node.arguments[0].value
+        );
+        if (installedChunks[realPath] !== undefined) return;
+        let sourse = fs.readFileSync(realPath, "utf-8");
+        sourse = `jsonp.load([${bundleId}, function(){${sourse}}])`;
+        fs.writeFileSync(`./dist/${bundleId}.bundle.js`, sourse);
+        installedChunks[realPath] = bundleId;
+        bundleId++;
+        process.installedChunks = {
+          nowPath: path.dirname(filename),
+          ...installedChunks,
+        };
+      }
+    },
  });
  // ES6转成ES5
  const { code } = babel.transformFromAstSync(ast, null, {
+    plugins: ["./babel-plugin.js"],
    presets: ["@babel/preset-env"],
  });
  return {
    id: id++,
    dependencies,
    filename,
    code,
  };
};

...

```

我们看到上面我们新增使用 `babel` 插件 `plugins: ["./babel-plugin.js"]`，不懂的可以看[babel-handbook](https://github.com/jamiebuilds/babel-handbook)

`babel-plugin.js`
```js
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
```
上面插件的功能就是把 `import('./a.js')` 转成 `require.import(0)`

修改 `init.js`，主要是新增 `import` 方法，借鉴自 `webpack`
```js
function init(modules) {
  function require(id) {
    var [fn, mapping] = modules[id];
    function localRequire(relativePath) {
      return require(mapping[relativePath]);
    }
    var module = { exports: {} };
    localRequire.import = require.import; // 新增
    fn(localRequire, module, module.exports);
    return module.exports;
  }
  var installedChunks = {}; // 当前新增
  require.import = function(chunkId) { // 当前新增
    var promises = [];
    var installedChunkData = installedChunks[chunkId];
    // 如果没有加载
    if (installedChunkData !== 0) {
      if (installedChunkData) {
        promises.push(installedChunkData[2]);
      } else {
        var promise = new Promise(function(resolve, reject) {
          installedChunkData = installedChunks[chunkId] = [resolve, reject];
        });
        promises.push((installedChunkData[2] = promise));
        // start chunk loading
        var script = document.createElement("script");
        var onScriptComplete;
        script.charset = "utf-8";
        script.src = "dist/" + chunkId + ".bundle.js";
        var error = new Error();
        onScriptComplete = function(event) {
          // avoid mem leaks in IE.
          script.onerror = script.onload = null;
          clearTimeout(timeout);
          var chunk = installedChunks[chunkId];
          if (chunk !== 0) {
            if (chunk) {
              var errorType =
                event && (event.type === "load" ? "missing" : event.type);
              var realSrc = event && event.target && event.target.src;
              error.message =
                "Loading chunk " +
                chunkId +
                " failed.\n(" +
                errorType +
                ": " +
                realSrc +
                ")";
              error.name = "ChunkLoadError";
              error.type = errorType;
              error.request = realSrc;
              chunk[1](error);
            }
            installedChunks[chunkId] = undefined;
          }
        };
        var timeout = setTimeout(function() {
          onScriptComplete({ type: "timeout", target: script });
        }, 120000);
        script.onerror = script.onload = onScriptComplete;
        document.head.appendChild(script);
      }
    }
    return Promise.all(promises);
  };
  window.jsonp = {}; // 当前新增
  jsonp.load = function(bundle) { // 当前新增
    var chunkId = bundle[0];
    var fn = bundle[1];
    var resolve = installedChunks[chunkId][0];
    installedChunks[chunkId] = 0;
    // 执行异步加载文件代码
    fn();
    // 执行resolve
    resolve();
  };
  //执行入口文件，
  return require(0);
}
```
我们异步加载的文件都会执行 `jsonp.load` 方法，，在生成文件 `*.bunnd.js` 之前都会把代码改装一下，得到下面的结构，这样就可以控制执行源代码及 `.then() .catch()` 等操作了
```js
jsonp.load([
  0,
  function() {
   // 原文件代码
  },
]);

```

然后执行，你会发现 `dist` 多了两个文件，`0.bundle.js` `1.bundle.js`，前提是你没有注释之前 `import()` 写的代码，然后去浏览器控制台查看，分别打印以下，接着3秒后页面背景变为红色
```
hello world!
import b
b done
import a
copy a done
a done
```
等等，我们使用了三个 `import`，为什么只有两个文件，因为有一个 `import('./a.js')` 使用了两次，这里我做了缓存，所以重复异步引入的文件会缓存利用

### 支持loader

`loader` 支持很简单，其实就是把文件的内容交给它单独处理返回新的结果，我们新建文件 `loader.js`，内容如下：
```js
module.exports = function(content) {
  return content + "; console.log('loader')";
};
```
在每个js文件后都加上打印loader的代码

接着修改resolve方法内的代码
```diff
+ const loader = require("./loader");
const resolve = function(filename) {
  let content = "";
  content = fs.readFileSync(path.resolve(__dirname, filename), "utf-8");
+  content = loader(content);
  const ast = parser.parse(content, {
    sourceType: "module",
  });
  ....
}
```
然后运行代码，浏览器控制台会打印是三个 `loader`

## 最后

至此，我们完成了 `esModule` 的支持，文件异步加载的支持、`loader` 的支持，我们顺便还写了一个 `babel` 插件，整个流程没有什么难理解的地方，一个 `webpack` 就这样完成了，当然还可以再把功能完善。支持插件？把 `tapable` 加入？等等，时间有限，点到为止，如有错误还望指正

本章代码部分借鉴 `webpack` 输出的 `bundle` 及 `You Gotta Love Frontend` 的视频 [Ronen Amiel - Build Your Own Webpack](https://www.youtube.com/watch?v=Gc9-7PBqOC8&list=LLHK1mTHpwrUeYgF5gu-Kd4g)

代码已上传至 `GitHub`： https://github.com/wclimb/my-webpack

本文地址 http://www.wclimb.site/2020/03/15/vue-source-code-data-bind/

## 公众号

![img](./gzh.png)