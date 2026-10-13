const globals = require("globals");
const fs = require("node:fs");
const path = require("node:path");
const tseslint = require("typescript-eslint");
const YAML = require("yaml");

const modulePolicy = YAML.parse(fs.readFileSync(
  path.join(__dirname, "src/modules/dependencies.yaml"), "utf8",
));

function bindingNames(pattern: any, names: Set<string>): void {
  if (pattern.type === "Identifier") names.add(pattern.name);
  else if (pattern.type === "ObjectPattern") {
    for (const property of pattern.properties) {
      bindingNames(property.type === "RestElement" ? property.argument : property.value, names);
    }
  } else if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) if (element) bindingNames(element, names);
  } else if (pattern.type === "AssignmentPattern" || pattern.type === "RestElement") {
    bindingNames(pattern.type === "AssignmentPattern" ? pattern.left : pattern.argument, names);
  }
}

function reportForwarded(value: any, foreignNames: Set<string>, aliases: Map<string, any>, context: any,
  seen: Set<string>): void {
  if (value.type === "Identifier" && foreignNames.has(value.name)) {
    context.report({ node: value, message: `Return a capability from its owning module instead of forwarding ${value.name}.` });
  } else if (value.type === "Identifier" && aliases.has(value.name) && !seen.has(value.name)) {
    seen.add(value.name);
    reportForwarded(aliases.get(value.name), foreignNames, aliases, context, seen);
  } else if (value.type === "MemberExpression" && !value.computed) {
    reportForwarded(value.object, foreignNames, aliases, context, seen);
  } else if (value.type === "ObjectExpression") {
    for (const property of value.properties) {
      if (property.type === "SpreadElement") {
        reportForwarded(property.argument, foreignNames, aliases, context, new Set(seen));
      } else if ((property.key.name ?? property.key.value) !== "$$private") {
        reportForwarded(property.value, foreignNames, aliases, context, new Set(seen));
      }
    }
  }
}

const noForwardedModuleDependencies = {
  meta: { type: "problem", docs: { description: "Disallow direct re-exports of another module's injected capabilities" }, schema: [] },
  create(context: any) {
    const normalizedPath = context.filename.replaceAll("\\", "/");
    const owner = normalizedPath.match(/\/src\/modules\/implementations\/([^/]+)\//u)?.[1];
    const providers = new Set(modulePolicy["allowed-modules"][owner] ?? []);
    if (providers.size === 0) return {};
    return {
      Program(node: any) {
        const exportAssignment = node.body.find((entry: any) => entry.type === "TSExportAssignment"
          || (entry.type === "ExpressionStatement" && entry.expression.type === "AssignmentExpression"
            && entry.expression.left.type === "MemberExpression" && entry.expression.left.object.name === "module"
            && entry.expression.left.property.name === "exports"));
        const factory = exportAssignment?.type === "TSExportAssignment"
          ? exportAssignment.expression : exportAssignment?.expression.right;
        if (!factory || !["ArrowFunctionExpression", "FunctionExpression"].includes(factory.type)) return;
        const parameter = factory.params[0];
        if (parameter?.type !== "ObjectPattern") return;
        const foreignNames = new Set<string>();
        for (const property of parameter.properties) {
          if (property.type === "Property" && providers.has(property.key.name ?? property.key.value)) {
            bindingNames(property.value, foreignNames);
          }
        }
        const aliases = new Map<string, any>();
        if (factory.body.type === "BlockStatement") {
          for (const statement of factory.body.body) {
            if (statement.type !== "VariableDeclaration") continue;
            for (const declaration of statement.declarations) {
              if (declaration.id.type === "Identifier" && declaration.init) {
                aliases.set(declaration.id.name, declaration.init);
              }
            }
          }
        }
        if (factory.body.type !== "BlockStatement") {
          reportForwarded(factory.body, foreignNames, aliases, context, new Set());
        } else {
          for (const statement of factory.body.body) {
            if (statement.type === "ReturnStatement" && statement.argument) {
              reportForwarded(statement.argument, foreignNames, aliases, context, new Set());
            }
          }
        }
      },
    };
  },
};

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
    ignores: ["dist/**", "**/*.js", "**/*.d.ts", "node_modules/**", "tmp/**", "coverage/**", "allure-results/**", "allure-report/**"],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      parserOptions: { tsconfigRootDir: __dirname },
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
    files: ["src/modules/implementations/**/*.ts"],
    plugins: { architecture: { rules: { "no-forwarded-module-dependencies": noForwardedModuleDependencies } } },
    rules: { "architecture/no-forwarded-module-dependencies": "error" },
  },
  {
    files: [
      "src/modules/interfaces/{core,numeric,accounting,database}.ts",
      "src/modules/implementations/{core,numeric,accounting,database}/**/*.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
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
