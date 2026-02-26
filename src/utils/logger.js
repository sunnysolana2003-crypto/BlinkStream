const DEBUG = process.env.DEBUG === "true";

module.exports = {
  info: (...args) => console.log("[INFO]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args),
  error: (...args) => console.error("[ERROR]", ...args),
  debug: (...args) => {
    if (DEBUG) {
      console.log("[DEBUG]", ...args);
    }
  }
};
