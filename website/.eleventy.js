const browserslist = require("browserslist");
const { bundle, browserslistToTargets } = require("lightningcss");
const esbuild = require("esbuild");

const lightningcssTargets = browserslistToTargets(browserslist(">= 1%"));

module.exports = function (eleventyConfig) {
  // static assets
  eleventyConfig.addPassthroughCopy("./src/assets/img/");
  // css assets
  eleventyConfig.addTemplateFormats("css");
  eleventyConfig.addExtension("css", {
    outputFileExtension: "css",
    compileOptions: {
      cache: false,
    },
    compile: async (content, path) => {
      if (!path.endsWith("index.css")) return;
      const result = bundle({ filename: path, minify: true, targets: lightningcssTargets });
      return async () => result.code;
    },
  });
  // js assets
  eleventyConfig.addTemplateFormats("js");
  eleventyConfig.addExtension("js", {
    outputFileExtension: "js",
    compileOptions: {
      cache: false,
    },
    compile: async (content, path) => {
      if (!path.endsWith("index.js")) return;
      return async () => {
        const result = await esbuild.build({
          bundle: true,
          entryPoints: [path],
          minify: true,
          target: "es2020",
          write: false,
        });
        return result.outputFiles[0].text;
      };
    },
  });
  return {
    dir: {
      input: "src",
      output: "dist",
    },
  };
};
