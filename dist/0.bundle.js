jsonp.load([0, function(){console.log("import a");
setTimeout(() => {
  document.body.style = "background:red;";
}, 3000);
}])