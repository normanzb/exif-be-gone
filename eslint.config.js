import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import tsParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";

/** @type {import("eslint").Linter.Config} */
export default [
  eslintConfigPrettier,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      ts: typescriptPlugin,
      import: importPlugin,
    },
    files: ["index.ts", "src/**/*.ts"],
    ignores: ["**/*.d.ts", "dist/**/*"],
    rules: {
      "import/extensions": [
        "error",
        "ignorePackages",
        {
          js: "always",
          ts: "never",
          jsx: "never",
          tsx: "never",
        },
      ],
    },
  },
];
