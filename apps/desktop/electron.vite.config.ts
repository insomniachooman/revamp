import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      lib: {
        entry: path.resolve(__dirname, "src/main/index.ts"),
        formats: ["cjs"]
      },
      rollupOptions: {
        output: {
          entryFileNames: "[name].cjs"
        }
      }
    },
    resolve: {
      alias: {
        "@revamp/core-types": path.resolve(root, "packages/core-types/src/index.ts"),
        "@revamp/editor-engine": path.resolve(root, "packages/editor-engine/src/index.ts"),
        "@revamp/recording-engine": path.resolve(root, "packages/recording-engine/src/index.ts"),
        "@revamp/render-engine": path.resolve(root, "packages/render-engine/src/index.ts"),
        "@revamp/design-system": path.resolve(root, "packages/design-system/src/index.ts")
      }
    }
  },
  preload: {
    build: {
      outDir: "dist/preload",
      lib: {
        entry: path.resolve(__dirname, "src/preload/index.ts"),
        formats: ["cjs"]
      },
      rollupOptions: {
        output: {
          entryFileNames: "[name].cjs"
        }
      }
    },
    resolve: {
      alias: {
        "@revamp/core-types": path.resolve(root, "packages/core-types/src/index.ts")
      }
    }
  },
  renderer: {
    build: {
      outDir: "dist/renderer"
    },
    resolve: {
      alias: {
        "@renderer": path.resolve(__dirname, "src/renderer/src"),
        "@revamp/core-types": path.resolve(root, "packages/core-types/src/index.ts"),
        "@revamp/editor-engine": path.resolve(root, "packages/editor-engine/src/index.ts"),
        "@revamp/recording-engine": path.resolve(root, "packages/recording-engine/src/index.ts"),
        "@revamp/design-system": path.resolve(root, "packages/design-system/src/index.ts")
      }
    },
    plugins: [react()]
  }
});
