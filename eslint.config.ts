const globals = require("globals");
const tseslint = require("typescript-eslint");

const restrictedSyntax = [
  {
    selector: ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > AssignmentPattern",
    message: "Default parameters are not allowed; callers must pass values explicitly.",
  },
  {
    selector: ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > ObjectPattern > Property > AssignmentPattern",
    message: "Default parameters are not allowed; callers must pass values explicitly.",
  },
  {
    selector: ":matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression) > ArrayPattern > AssignmentPattern",
    message: "Default parameters are not allowed; callers must pass values explicitly.",
  },
];
const runtimeGlobals = [...new Set([
  ...Object.keys(globals.node),
  ...Object.keys(globals.browser),
  "globalThis",
])].filter((name: any) => name !== "module");

module.exports = [
  {
    ignores: ["**/*.js", "**/*.d.ts", "node_modules/**", "tmp/**", "coverage/**", "allure-results/**", "allure-report/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      curly: ["error", "multi-line"],
      indent: ["error", 2, { SwitchCase: 1 }],
      "no-restricted-syntax": ["error", ...restrictedSyntax],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "prefer-const": "off",
    },
  },
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error", ...runtimeGlobals.map((name: any) => ({
        name,
        message: "Inject runtime dependencies from the composition layer.",
      }))],
      "no-restricted-properties": ["error", {
        object: "module",
        property: "require",
        message: "Inject dependencies from the composition layer instead of using require.",
      }],
      "no-restricted-syntax": ["error", ...restrictedSyntax, {
        selector: "CallExpression[callee.name='require']",
        message: "Inject dependencies from the composition layer instead of using require.",
      }],
    },
  },
  {
    files: ["src/modules/external.ts"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
      "no-restricted-syntax": ["error", ...restrictedSyntax],
    },
  },
];
