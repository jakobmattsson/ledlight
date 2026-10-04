const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**", "tmp/**"],
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
      "no-restricted-syntax": [
        "error",
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
      ],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
