// Vercel treats .js files as CommonJS unless "type":"module" is in package.json.
// Dynamic import() is the only way to load an ESM bundle from CJS.
let _app;

async function loadApp() {
  if (!_app) {
    const mod = await import("./_bundle/app.mjs");
    _app = mod.default;
  }
  return _app;
}

module.exports = async (req, res) => {
  const app = await loadApp();
  app(req, res);
};
