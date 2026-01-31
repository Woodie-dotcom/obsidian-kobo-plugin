import esbuild from "esbuild";
import process from "process";

const prod = process.argv[2] === "production";

// Node.js built-in modules that sql.js tries to import but doesn't need in browser/Electron
const nodeBuiltins = ['fs', 'path', 'crypto'];

const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@electron/remote",
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
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}
