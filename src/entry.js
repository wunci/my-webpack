import message from "./message.js";
console.log(message);
import("./a.js").then(() => {
  console.log("a done");
});
