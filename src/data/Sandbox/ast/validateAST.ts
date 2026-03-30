import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";

/*
Valid example:

async function run(api) {
  const conditions = await api.getActiveConditions();
  return conditions.map(c => c.display);
}
*/

export function validateAST(code: string) {
  const ast = parse(code, {
    sourceType: "script",
    allowReturnOutsideFunction: false,
    plugins: ["typescript"]
  });

  let hasRunFunction = false;
  // Track local variables initialized to object literals so we can allow
  // safe computed access like `map[id] = value` when `map` was created
  // as `{}` in the same function.
  const allowedComputedTargets = new Set<string>();

  traverse(ast, {
    enter(path) {
      const node = path.node;

      /* ---------------- FORBIDDEN SYNTAX ---------------- */

      if (
        t.isImportDeclaration(node) ||
        t.isExportNamedDeclaration(node) ||
        t.isWhileStatement(node) ||
        t.isForStatement(node) ||
        t.isDoWhileStatement(node) ||
        t.isTryStatement(node) ||
        t.isThrowStatement(node)
      ) {
        throw new Error("Forbidden syntax");
      }

      // Allow a small set of safe `new` constructors (Date, Map, Set, Array, Object)
      // but forbid arbitrary `new` expressions.
      if (t.isNewExpression(node)) {
        const callee = node.callee;
        const allowedNews = new Set(['Date', 'Map', 'Set', 'Array', 'Object']);
        if (!(t.isIdentifier(callee) && allowedNews.has(callee.name))) {
          throw new Error("Forbidden syntax");
        }
      }

      /* ---------------- FORBIDDEN IDENTIFIERS ---------------- */

      if (t.isIdentifier(node)) {
        const forbidden = new Set([
          "window",
          "document",
          "globalThis",
          "self",
          "Function",
          "eval",
          "fetch",
          "XMLHttpRequest",
          "WebSocket",
          "postMessage",
          "importScripts"
        ]);

        if (forbidden.has(node.name)) {
          throw new Error(`Forbidden identifier: ${node.name}`);
        }
      }

      /* ---------------- CALL EXPRESSIONS ---------------- */

      if (t.isCallExpression(node)) {
        const callee = node.callee;

        // Allow calls to a small safe set of global functions (e.g. parseFloat)
        const allowedGlobalFns = new Set([
          'parseFloat', 'parseInt', 'Number', 'String', 'Boolean', 'isFinite', 'isNaN',
          'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI'
        ]);

        // Helper: determine whether a callee object's shape is allowed.
        // Allow Identifiers, MemberExpressions, ArrayExpressions, or
        // CallExpressions whose callee is a MemberExpression with an
        // allowed object (this enables chained calls like arr.filter().sort()).
        // function isAllowedCalleeObject(obj: t.Node | null | undefined): boolean {
        //   if (!obj) return false;
        //   // Common allowed shapes: simple identifier, member access, array literal
        //   if (t.isIdentifier(obj) || t.isMemberExpression(obj) || t.isArrayExpression(obj)) return true;
        //   // Calls that return a value we can chain on: e.g. api.getX().filter()
        //   if (t.isCallExpression(obj)) {
        //     const inner = obj.callee;
        //     // If the call's callee is a member expression, inspect its object (e.g., foo().bar())
        //     if (t.isMemberExpression(inner)) return isAllowedCalleeObject(inner.object as t.Node);
        //     // If the call's callee is an identifier, allow chaining (e.g., Date factory calls)
        //     if (t.isIdentifier(inner)) return true;
        //     // Parenthesized or other shapes: try to recurse
        //     if ((inner as any)?.expression) return isAllowedCalleeObject((inner as any).expression as t.Node);
        //   }
        //   // Allow `new` expressions whose callee is a safe identifier/member (e.g., `new Date(...)`)
        //   if (t.isNewExpression(obj)) {
        //     const inner = (obj as any).callee;
        //     if (t.isIdentifier(inner)) return true;
        //     if (t.isMemberExpression(inner)) return isAllowedCalleeObject(inner.object as t.Node);
        //     if ((inner as any)?.expression) return isAllowedCalleeObject((inner as any).expression as t.Node);
        //   }
        //   // Allow parenthesized/ grouped expressions like (observations || [])
        //   if (t.isParenthesizedExpression(obj) && (obj as any).expression) {
        //     return isAllowedCalleeObject((obj as any).expression as t.Node);
        //   }
        //   // Allow logical expressions commonly used to provide a fallback: (observations || [])
        //   if (t.isLogicalExpression(obj)) {
        //     return isAllowedCalleeObject(obj.left as t.Node) || isAllowedCalleeObject(obj.right as t.Node);
        //   }
        //   // Allow conditional expressions (ternary) like (cond ? a : b)
        //   if (t.isConditionalExpression(obj)) {
        //     return isAllowedCalleeObject(obj.consequent as t.Node) || isAllowedCalleeObject(obj.alternate as t.Node);
        //   }
        //   return false;
        // }

        // Helper: walk the callee to determine if the chain is ultimately
        // rooted on `api` (e.g., api.getX().map()). If so, the outer call
        // must be awaited.
        function calleeHasApiBase(calleeNode: t.Node | null | undefined): boolean {
          if (!calleeNode) return false;
          if (t.isMemberExpression(calleeNode)) {
            const obj = calleeNode.object as any;
            if (t.isIdentifier(obj) && obj.name === 'api') return true;
            if (t.isMemberExpression(obj)) return calleeHasApiBase(obj);
            if (t.isCallExpression(obj)) return calleeHasApiBase(obj.callee as t.Node);
            if (t.isLogicalExpression(obj)) return calleeHasApiBase(obj.left as t.Node) || calleeHasApiBase(obj.right as t.Node);
            if ((obj as any).expression) return calleeHasApiBase((obj as any).expression as t.Node);
          }
          // If the calleeNode isn't a MemberExpression, try to inspect logical/parenthesized shapes
          if (t.isLogicalExpression(calleeNode)) {
            return calleeHasApiBase(calleeNode.left as t.Node) || calleeHasApiBase(calleeNode.right as t.Node);
          }
          if ((calleeNode as any).expression) {
            return calleeHasApiBase((calleeNode as any).expression as t.Node);
          }
          return false;
        }

        // ---- api.* calls must be awaited (or inside Promise.all) ----
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === "api") {
          const isAwaited =
            (path.parentPath && path.parentPath.isAwaitExpression()) ||
            Boolean(path.findParent((p) => p.isAwaitExpression())) ||
            Boolean(path.findParent((p) =>
              t.isCallExpression(p.node) &&
              t.isMemberExpression(p.node.callee) &&
              t.isIdentifier(p.node.callee.object, { name: "Promise" }) &&
              t.isIdentifier(p.node.callee.property, { name: "all" })
            ));

          if (!isAwaited) {
            throw new Error("API calls must be awaited");
          }

          return;
        }

        // If this is a member call (obj.method()), allow it in general but
        // require awaiting if it ultimately derives from `api`.
        if (t.isMemberExpression(callee)) {
          if (calleeHasApiBase(callee)) {
            const isAwaited =
              (path.parentPath && path.parentPath.isAwaitExpression()) ||
              Boolean(path.findParent((p) =>
                t.isCallExpression(p.node) &&
                t.isMemberExpression(p.node.callee) &&
                t.isIdentifier(p.node.callee.object, { name: "Promise" }) &&
                t.isIdentifier(p.node.callee.property, { name: "all" })
              ));

            if (!isAwaited) throw new Error("API calls must be awaited");
          }

          return;
        }

        // Allow direct calls to safe global functions (identifiers)
        if (t.isIdentifier(callee) && allowedGlobalFns.has(callee.name)) {
          return;
        }

        // Allow calling locally-declared bindings (functions/vars) in scope
        if (t.isIdentifier(callee) && path.scope && path.scope.hasBinding(callee.name)) {
          return;
        }

        throw new Error("Forbidden function call");
      }

      /* ---------------- MEMBER ACCESS ---------------- */

      // Capture simple local object initializers: `const m = {}`
      if (t.isVariableDeclarator(node) && t.isIdentifier(node.id) && node.init && t.isObjectExpression(node.init)) {
        allowedComputedTargets.add(node.id.name);
      }

      if (t.isMemberExpression(node) && node.computed) {
        // Allow safe literal indexing like `[0]` or `['0']` (e.g. split()[0]).
        // Also allow dynamic computed access when the root identifier for
        // the object expression was declared locally as an object literal
        // (e.g., `const m = {}`) — this enables patterns like
        // `const m = {}; m[id] = val;` and `m[enc.id] = obs;`.
        const prop = node.property;
        const isSafeIndex = t.isNumericLiteral(prop) || (t.isStringLiteral(prop) && /^\d+$/.test(prop.value));

        function getRootIdentifier(n: t.Node): string | null {
          if (t.isIdentifier(n)) return n.name;
          if (t.isMemberExpression(n)) return getRootIdentifier(n.object as t.Node);
          if ((n as any)?.expression) return getRootIdentifier((n as any).expression as t.Node);
          if (t.isLogicalExpression(n)) return getRootIdentifier(n.left as t.Node) || getRootIdentifier(n.right as t.Node);
          return null;
        }

        const rootName = getRootIdentifier(node.object as t.Node);
        const isAllowedLocalMap = !!rootName && allowedComputedTargets.has(rootName);

        if (!isSafeIndex && !isAllowedLocalMap) {
          throw new Error("Computed property access forbidden");
        }
      }

      /* ---------------- FUNCTION RULES ---------------- */

      if (t.isFunctionDeclaration(node) && node.id?.name === "run") {
        hasRunFunction = true;

        if (!node.async) {
          throw new Error("run(api) must be async");
        }

        if (node.params.length !== 1) {
          throw new Error("run() must take exactly one argument");
        }
      }
    }
  });

  if (!hasRunFunction) {
    throw new Error("Code must define async function run(api)");
  }
}
