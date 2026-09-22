import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { defineConfig, type UserConfig } from "vite";

function copyStaticPublicFiles(outDir: string) {
  const publicDir = resolve("public");
  const outputDir = resolve(outDir);

  function copyDir(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const source = resolve(dir, entry);
      const stats = statSync(source);
      const target = resolve(outputDir, relative(publicDir, source));

      if (stats.isDirectory()) {
        copyDir(source);
        continue;
      }

      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }

  return {
    name: "celestial-copy-static-public-files",
    closeBundle() {
      if (existsSync(publicDir)) {
        copyDir(publicDir);
      }
    },
  };
}

export default defineConfig((): UserConfig => {
  return {
    root: "public",
    publicDir: false,
    appType: "custom",
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:5439",
          changeOrigin: true,
        },
        "/mux": {
          target: "http://127.0.0.1:5439",
          changeOrigin: true,
        },
        "/epoxy": {
          target: "http://127.0.0.1:5439",
          changeOrigin: true,
        },
        "/curl": {
          target: "http://127.0.0.1:5439",
          changeOrigin: true,
        },
        "/scram": {
          target: "http://127.0.0.1:5439",
          changeOrigin: true,
        },
        "/wisp": {
          target: "ws://127.0.0.1:5439",
          ws: true,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "../dist",
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: resolve("build/empty-entry.js"),
      },
    },
    plugins: [copyStaticPublicFiles("dist")],
  };
});