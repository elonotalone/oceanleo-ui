import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/vault-api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
function harness() {
  const requests = [];
  const state = { result: { references: [] }, error: null };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    assert.equal(name, "./cloud-computer-api");
    return { cloudComputerRequest: async (path, init) => {
      requests.push({ path, ...init });
      if (state.error) throw state.error;
      return state.result;
    } };
  }, module, module.exports);
  return { api: module.exports, requests, state };
}

// UC-NONE
// Per-call vault authentication checks change no origins, CORS policy or browser trust.
test("main and project vault endpoints always use the shared per-call authenticated gateway helper", async () => {
  const { api, requests, state } = harness();
  const secretId = randomUUID();
  const referenceId = randomUUID();
  const projectId = "project/one";
  const signal = new AbortController().signal;
  const sealed = { v: 1, ct: "test-ciphertext" };
  await api.getVault(signal);
  await api.getVaultSealKey(signal);
  await api.createVaultSecret({ name: "service", kind: "api_key", username: "", description: "", sealed }, signal);
  await api.updateVaultSecret(secretId, { sealed }, signal);
  await api.deleteVaultSecret(secretId, signal);
  await api.getVaultReferences(signal);
  await api.getProjectVaultReferences(projectId, signal);
  await api.createProjectVaultReference(projectId, { secret_id: secretId, purpose: "runtime_env", env_name: "SERVICE_KEY", environment: "production" }, signal);
  await api.deleteProjectVaultReference(projectId, referenceId, signal);
  await api.deleteVaultBrowserBinding(referenceId, signal);
  assert.deepEqual(requests.map(({ method, path }) => [method, path]), [
    ["GET", "/v1/vault"], ["GET", "/v1/vault/seal-key"], ["POST", "/v1/vault/secrets"],
    ["PATCH", `/v1/vault/secrets/${secretId}`], ["DELETE", `/v1/vault/secrets/${secretId}`],
    ["GET", "/v1/vault/references"], ["GET", "/v1/website-projects/project%2Fone/vault/references"],
    ["POST", "/v1/website-projects/project%2Fone/vault/references"], ["DELETE", `/v1/website-projects/project%2Fone/vault/references/${referenceId}`],
    ["DELETE", `/v1/vault/browser-bindings/${referenceId}`],
  ]);
  assert.ok(requests.every((request) => request.signal === signal));
  state.result = { references: [{ id: referenceId, version: 2 }] };
  assert.equal((await api.getProjectVaultReferences(projectId)).references[0].version, 2);
  assert.equal(requests.length, 11, "metadata and authorization must be resolved afresh on every use");
  assert.doesNotMatch(source, /\bfetch\(|localStorage|sessionStorage|new Map|setTimeout|access_token/);
});

// UC-NONE
// Sealed credential and metadata payload checks introduce no UGC or database trust changes.
test("secret writes whitelist sealed envelope fields and small vault writes contain references only", async () => {
  const { api, requests } = harness();
  const privateMarker = randomUUID();
  const sealed = { v: 1, ct: randomUUID() };
  await api.createVaultSecret({ name: "service", kind: "api_key", username: "", description: "", sealed, value: privateMarker, token: privateMarker });
  await api.updateVaultSecret("secret", { description: "changed", value: privateMarker });
  await api.createProjectVaultReference("project", { secret_id: "secret", purpose: "runtime_env", env_name: "KEY", environment: "preview", value: privateMarker, sealed, token: privateMarker });
  assert.deepEqual(Object.keys(JSON.parse(requests[0].body)).sort(), ["name", "kind", "username", "description", "sealed"].sort());
  assert.deepEqual(JSON.parse(requests[1].body), { description: "changed" });
  assert.deepEqual(JSON.parse(requests[2].body), { secret_id: "secret", purpose: "runtime_env", env_name: "KEY", environment: "preview" });
  assert.ok(requests.every((request) => !request.body.includes(privateMarker)));
});

// UC-NONE
// Error disclosure checks change no browser trust, origin or database permissions.
test("transport errors never retain submitted values and stable auth/quota cases remain actionable", async () => {
  const { api, state } = harness();
  const privateMarker = randomUUID();
  for (const [status, rawCode, expected] of [[401, "unauthorized", "signed_out"], [403, "reauth_required", "reauth_required"], [403, "permission_denied", "forbidden"], [409, "vault_quota", "quota"], [409, "vault_conflict", "conflict"], [429, "vault_rate_limited", "rate_limited"], [503, "vault_mutation_committed_runtime_unavailable", "mutation_committed_runtime_unavailable"], [503, privateMarker, "unavailable"], [0, privateMarker, "network"]]) {
    state.error = { status, code: rawCode, message: privateMarker, body: privateMarker };
    await assert.rejects(api.getVault(), (error) => {
      assert.equal(error instanceof api.VaultApiError, true);
      assert.equal(error.code, expected);
      assert.equal(error.message, expected);
      assert.equal(error.status, status);
      assert.equal(JSON.stringify(error).includes(privateMarker), false);
      return true;
    });
  }
});

// UC-NONE
// Server-only environment validation changes no browser trust, origin or database permissions.
test("unsafe runtime, loader, proxy and public environment variables fail before a binding request", async () => {
  const { api, requests } = harness();
  for (const name of [...api.VAULT_RUNTIME_ENV_DENIED, ...api.VAULT_RUNTIME_ENV_DENIED_PREFIXES.map((prefix) => `${prefix}TEST`), "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_AUTH_URL_SUFFIX", "NODE_TLS_REJECT_UNAUTHORIZED", "PYTHONINSPECT", "DYLD_INSERT_LIBRARIES"]) {
    assert.equal(api.validVaultEnvName(name), false, name);
    await assert.rejects(api.createProjectVaultReference("project", { secret_id: "secret", purpose: "runtime_env", env_name: name, environment: "preview" }), { code: "invalid" });
  }
  assert.equal(requests.length, 0);
  for (const name of api.VAULT_RUNTIME_ENV_PROVIDER_KEYS) assert.equal(api.validVaultEnvName(name), true, name);
});

// UC-NONE
// Pure source-policy comparison reads no credentials and changes no trust surfaces.
test("UI runtime env policy and samples match the final Python authority", (context) => {
  const corePath = fileURLToPath(new URL("../../oceanleo/backend/app/vault/client.py", import.meta.url));
  if (!existsSync(corePath)) { context.skip("sibling backend source is unavailable in this standalone UI checkout"); return; }
  const { api } = harness();
  const samples = ["SERVICE_KEY", "_PRIVATE", "A".repeat(128), "A".repeat(129), "", "1KEY", "lowercase", "KEY-NAME", "KEY\n", "KEY\r", "KEY\u2028", "KEY\u2029", null, 42,
    ...api.VAULT_RUNTIME_ENV_DENIED, ...api.VAULT_RUNTIME_ENV_DENIED_PREFIXES.map((prefix) => `${prefix}TEST`),
    ...api.VAULT_RUNTIME_ENV_PROVIDER_KEYS, "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_AUTH_SERVICE_ROLE_KEY_EXTRA"];
  // Execute only the authority's pure AST declarations, never its app/config
  // imports. This checks actual Python behavior without loading credentials.
  const program = `import ast,json,re,sys\nnames={"RUNTIME_ENV_DENIED","RUNTIME_ENV_DENIED_PREFIXES","RUNTIME_ENV_PROVIDER_KEYS"}\ntree=ast.parse(open(sys.argv[1],encoding="utf-8").read())\nbody=[n for n in tree.body if (isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets)) or (isinstance(n,ast.FunctionDef) and n.name=="runtime_env_name_allowed")]\nns={"re":re}\nexec(compile(ast.Module(body=body,type_ignores=[]),"env-policy","exec"),ns)\nprint(json.dumps({"denied":sorted(ns["RUNTIME_ENV_DENIED"]),"prefixes":sorted(ns["RUNTIME_ENV_DENIED_PREFIXES"]),"providers":sorted(ns["RUNTIME_ENV_PROVIDER_KEYS"]),"results":[ns["runtime_env_name_allowed"](x) for x in json.load(sys.stdin)]}))`;
  const python = JSON.parse(execFileSync("python3", ["-I", "-c", program, corePath], { input: JSON.stringify(samples), encoding: "utf8" }));
  assert.deepEqual([...api.VAULT_RUNTIME_ENV_DENIED].sort(), python.denied);
  assert.deepEqual([...api.VAULT_RUNTIME_ENV_DENIED_PREFIXES].sort(), python.prefixes);
  assert.deepEqual([...api.VAULT_RUNTIME_ENV_PROVIDER_KEYS].sort(), python.providers);
  assert.deepEqual(samples.map((name) => api.validVaultEnvName(name)), python.results);
});

test("aborted requests cannot report stale data as a vault error", async () => {
  const { api, state } = harness();
  state.error = new Error("test transport error");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.getVault(controller.signal), { name: "AbortError" });
});

// UC-NONE
// Vault fingerprints and runtime name validation change no browser trust or origin policy.
test("fingerprints never expose a malformed full value and runtime env names match the core security boundary", () => {
  const { api } = harness();
  assert.equal(api.safeVaultFingerprint("api_key", "abcd…wxyz"), "abcd…wxyz");
  assert.equal(api.safeVaultFingerprint("api_key", "…ab"), "…ab");
  assert.equal(api.safeVaultFingerprint("api_key", randomUUID()), "••••");
  assert.equal(api.safeVaultFingerprint("password", randomUUID()), "••••••");
  assert.equal(api.safeVaultFingerprint("text", randomUUID()), "");
  for (const name of ["SERVICE_API_KEY", "_PRIVATE", "A".repeat(128)]) assert.equal(api.validVaultEnvName(name), true);
  for (const name of ["", "lowercase", "A".repeat(129), "1KEY", "KEY-NAME", "VITE_KEY", "NEXT_PUBLIC_KEY", "PUBLIC_KEY", "REACT_APP_KEY", "NUXT_PUBLIC_KEY", "EXPO_PUBLIC_KEY", "OCEANLEO_KEY", "PORT", "PATH", "HOME", "SHELL", "ENV", "BASH_ENV", "NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "PYTHONPATH", "PYTHONSTARTUP"]) assert.equal(api.validVaultEnvName(name), false, name);
});
