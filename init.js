function init(modules) {
  function require(id) {
    var [fn, mapping] = modules[id];
    function localRequire(relativePath) {
      return require(mapping[relativePath]);
    }
    var module = { exports: {} };
    localRequire.import = require.import;
    fn(localRequire, module, module.exports);
    return module.exports;
  }
  var installedChunks = {};
  require.import = function(chunkId) {
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
  window.jsonp = {};
  jsonp.load = function(bundle) {
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
