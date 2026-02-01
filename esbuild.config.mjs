import esbuild from "esbuild";
import process from "process";
import fs from "fs";
import path from "path";

const prod = process.argv[2] === "production";

// Node.js built-in modules that sql.js tries to import but doesn't need in browser/Electron
const nodeBuiltins = ['fs', 'path', 'crypto'];

// Copy sql-wasm.wasm to output directory
const copyWasmPlugin = {
    name: 'copy-wasm',
    setup(build) {
        build.onEnd(() => {
            const wasmSource = path.join('node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
            const wasmDest = 'sql-wasm.wasm';

            if (fs.existsSync(wasmSource)) {
                fs.copyFileSync(wasmSource, wasmDest);
                console.log('Copied sql-wasm.wasm to plugin directory');
            } else {
                console.warn('Warning: sql-wasm.wasm not found in node_modules');
            }
        });
    }
};

const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        // Node.js builtins - will be required at runtime via window.require if needed
        ...nodeBuiltins
    ],
    format: "cjs",
    target: "es2020",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    minify: prod,
    // Define globals to help with module resolution
    define: {
        'process.env.NODE_ENV': prod ? '"production"' : '"development"',
    },
    // Platform node is better for Electron environment
    platform: "node",
    // Plugins
    plugins: [copyWasmPlugin],
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}
