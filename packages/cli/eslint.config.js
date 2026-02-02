import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: ["**/.papi/**", "**/dist/**", "**/coverage/**", "**/node_modules/**"],
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      /// We disable this given the many unknown types from the sdk
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  prettier,
];
