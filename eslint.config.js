const js = require("@eslint/js");
const globals = require("globals");

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
])].filter((name) => name !== "module");

module.exports = [
  {
    ignores: ["node_modules/**", "tmp/**", "coverage/**", "allure-results/**", "allure-report/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
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
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["src/{impl,surface}/**/*.js"],
    rules: {
      "no-restricted-globals": ["error", ...runtimeGlobals.map((name) => ({
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
];
