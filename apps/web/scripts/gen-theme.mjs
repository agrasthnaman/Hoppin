import { readFileSync, writeFileSync } from "node:fs";
import { themeCss } from "../src/theme/theme-css.mjs";

const data = JSON.parse(readFileSync(new URL("../src/theme/palettes.json", import.meta.url), "utf8"));
writeFileSync(new URL("../src/styles/theme.generated.css", import.meta.url), themeCss(data));
console.log("wrote src/styles/theme.generated.css");
