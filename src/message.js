import { name } from "./name.js";
export default `hello ${name}!`;
import("./a.js").then(() => {
  console.log("copy a done");
});
