// js/app.js
(async () => {
  const status = el => document.getElementById('status').textContent = el || '';
  const out = v => document.getElementById('out').textContent = v;

  // wait for fengari to be ready
  if (typeof fengari === 'undefined') throw new Error('fengari-web not loaded');

  // fetch manifest that lists all prometheus files (array of file paths)
  status('loading modules...');
  const manifestResp = await fetch('/prometheus/manifest.json');
  if (!manifestResp.ok) throw new Error('failed to load manifest');
  const files = await manifestResp.json(); // e.g. ["prometheus.lua","lexer.lua",...]
  // load and register every module into package.preload
  for (const fpath of files) {
    const raw = await fetch('/prometheus/' + fpath);
    if (!raw.ok) throw new Error('failed to fetch ' + fpath);
    const src = await raw.text();

    // compute module name: convert "prometheus.lua" -> "prometheus" or "sub/mod.lua" -> "sub.mod"
    const modname = fpath.replace(/\.lua$/,'').replace(/\//g,'.');

    // build lua preload assignment. using load to create a loader that returns module's results.
    const luaRegister = `
      package.preload["${modname}"] = function(...)
        local chunk, err = load([==[${src.replace(/\]\=\]/g,']]==]..'||PLACEHOLDER||' )]==])
        if not chunk then error(err) end
        return chunk(...)
      end
    `;
    // run register via fengari.load
    fengari.load(luaRegister)();
  }

  status('modules loaded');

  document.getElementById('obf').addEventListener('click', async () => {
    status('obfuscating...');
    out('');
    const code = document.getElementById('source').value;
    const preset = document.getElementById('preset').value;
    const luaVersion = document.getElementById('luaVersion').value;

    // create runner that requires prometheus and runs pipeline
    // we return the obfuscated string
    const runner = `
      package.path = package.path .. ";./prometheus/?.lua;./prometheus/?/init.lua"
      local Prometheus = require("prometheus.prometheus")
      Prometheus.Logger.logLevel = Prometheus.Logger.LogLevel.Error

      -- choose preset
      local preset = Prometheus.Presets["${preset}"] or Prometheus.Presets.Strong
      local pipeline = Prometheus.Pipeline:fromConfig(preset)

      local code = [==[${code.replace(/\]\=\]/g,']]==]..'||PLACEHOLDER||' )]==]
      local ok, out = pcall(function() return pipeline:apply(code) end)
      if not ok then
        return '__ERROR__' .. tostring(out)
      end
      return out
    `;

    try {
      const result = fengari.load(runner)(); // returns string (or error marker)
      if (typeof result === 'string' && result.startsWith('__ERROR__')) {
        out(result.slice(9));
      } else {
        out(result || '');
      }
      status('done');
    } catch (e) {
      out('runtime error: ' + String(e));
      status('error');
    }
  });

})();
