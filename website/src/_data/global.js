function createId(length) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
  const hash = [];
  for (let i = 0; i < length; i += 1) {
    hash.push(chars[Math.floor(Math.random() * chars.length)]);
  }
  return hash.join("");
}

module.exports = function () {
  return {
    runMode: process.env.ELEVENTY_RUN_MODE || "build",
    assetVersion: createId(8),
  };
};
