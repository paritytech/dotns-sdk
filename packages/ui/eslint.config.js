import vue from "eslint-plugin-vue";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import ts from "@typescript-eslint/eslint-plugin";
import parserTs from "@typescript-eslint/parser";
import vueParser from "vue-eslint-parser";
import globals from "globals";

export default [
  {
    ignores: ["dist", "node_modules", "**/.papi/**", "**/coverage/**", "*.config.js"],
  },

  {
    files: ["**/*.ts", "**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: parserTs,
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      vue,
      prettier,
      "@typescript-eslint": ts,
    },
    rules: {
      ...ts.configs.recommended.rules,
      ...prettierConfig.rules,
      "prettier/prettier": "warn",
      "vue/multi-word-component-names": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern:
            "^(from|to|value|data|dest|accountAddress|injected|setTransactionStatus|status|event|handler|args)$",
          varsIgnorePattern: "^(I[A-Z].*|.*Types?)$",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  {
    files: ["**/*.d.ts"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
];
