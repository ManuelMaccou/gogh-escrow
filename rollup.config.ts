import * as glob from "glob";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getBabelOutputPlugin } from "@rollup/plugin-babel";
import copy from "rollup-plugin-copy";
import multiInput from "rollup-plugin-multi-input";

const excludeFiles: string[] = [];

export default {
  input: Object.fromEntries(
    glob
      .sync("src/*.js")
      .filter((file) => excludeFiles.includes(file) === false)
      .map((file) => [
        path.relative(
          "src",
          file.slice(0, file.length - path.extname(file).length)
        ),
        fileURLToPath(new URL(file, import.meta.url)),
      ])
  ),
  output: {
    dir: "dist/",
    format: "cjs",
  },
  multiInput,
  plugins: [
    getBabelOutputPlugin({
      presets: ["@babel/preset-env"],
    }),
    copy({
      verbose: true,
      targets: [
        {
          src: "src/*.html",
          dest: "dist/",
        },
      ],
    }),
  ],
};
