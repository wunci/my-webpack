export const name = "world";
import("./b.js").then(() => {
  console.log("b done");
});
