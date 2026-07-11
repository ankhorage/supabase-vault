import { describe, expect, test } from "bun:test";

import { createSupabaseVaultAdapter } from "./adapter";
import type { SupabaseVaultRpcClient, SupabaseVaultRpcResponse } from "./types";

const metadata = {
  ref: "auth/oauth/google",
  scope: { projectId: "scanner", environment: "local" },
  kind: "oauth",
  provider: "google",
  configuredFields: ["clientId", "clientSecret"],
  createdAt: "2026-07-11T18:00:00.000Z",
  updatedAt: "2026-07-11T18:00:00.000Z",
};

class FakeRpcClient implements SupabaseVaultRpcClient {
  readonly calls: Array<{
    functionName: string;
    parameters?: Record<string, unknown>;
  }> = [];

  constructor(private readonly responses: SupabaseVaultRpcResponse[]) {}

  async rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): Promise<SupabaseVaultRpcResponse> {
    this.calls.push({ functionName, parameters });
    const response = this.responses.shift();
    if (response === undefined) throw new Error("Missing fake RPC response.");
    return response;
  }
}

describe("createSupabaseVaultAdapter", () => {
  test("rejects missing trusted server configuration without exposing input", async () => {
    const adapter = createSupabaseVaultAdapter({});
    const result = await adapter.list({
      scope: { projectId: "scanner", environment: "local" },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_config",
        message:
          "Supabase Vault requires a project URL and server-only service-role key.",
      },
    });
  });

  test("creates a scoped secret and returns metadata only", async () => {
    const client = new FakeRpcClient([{ data: metadata, error: null }]);
    const adapter = createSupabaseVaultAdapter({ client });

    const result = await adapter.create({
      scope: { projectId: " scanner ", environment: " local " },
      ref: "/auth//oauth/google/",
      kind: "oauth",
      provider: "google",
      payload: {
        clientId: "google-client-id",
        clientSecret: "sentinel-secret-value",
      },
    });

    expect(result).toEqual({ ok: true, data: metadata });
    expect(JSON.stringify(result)).not.toContain("sentinel-secret-value");
    expect(client.calls).toEqual([
      {
        functionName: "ankh_secret_create",
        parameters: {
          p_project_id: "scanner",
          p_environment: "local",
          p_secret_ref: "auth/oauth/google",
          p_kind: "oauth",
          p_provider: "google",
          p_payload: {
            clientId: "google-client-id",
            clientSecret: "sentinel-secret-value",
          },
        },
      },
    ]);
  });

  test("replaces the complete payload without reading the old value", async () => {
    const updated = {
      ...metadata,
      configuredFields: ["clientId", "clientSecret", "teamId"],
    };
    const client = new FakeRpcClient([{ data: updated, error: null }]);
    const adapter = createSupabaseVaultAdapter({ client });

    const result = await adapter.replace({
      scope: metadata.scope,
      ref: metadata.ref,
      payload: {
        clientId: "new-id",
        clientSecret: "new-secret",
        teamId: "new-team",
      },
    });

    expect(result).toEqual({ ok: true, data: updated });
    expect(client.calls[0]?.functionName).toBe("ankh_secret_replace");
  });

  test("resolves raw payloads only through the trusted resolve operation", async () => {
    const client = new FakeRpcClient([
      {
        data: {
          clientId: "google-client-id",
          clientSecret: "sentinel-secret-value",
        },
        error: null,
      },
    ]);
    const adapter = createSupabaseVaultAdapter({ client });

    const result = await adapter.resolve({
      scope: metadata.scope,
      ref: metadata.ref,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        clientId: "google-client-id",
        clientSecret: "sentinel-secret-value",
      },
    });
    expect(client.calls[0]?.functionName).toBe("ankh_secret_resolve");
  });

  test("redacts provider failures and submitted secret values", async () => {
    const client = new FakeRpcClient([
      {
        data: null,
        error: {
          code: "XX000",
          message: "provider echoed sentinel-secret-value",
        },
      },
    ]);
    const adapter = createSupabaseVaultAdapter({ client });

    const result = await adapter.create({
      scope: metadata.scope,
      ref: metadata.ref,
      kind: "oauth",
      provider: "google",
      payload: { clientSecret: "sentinel-secret-value" },
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "provider_error",
        message:
          "Supabase Vault failed to create a secret. Provider details were redacted.",
      },
    });
    expect(JSON.stringify(result)).not.toContain("sentinel-secret-value");
  });

  test("maps scoped list filters without cross-environment defaults", async () => {
    const client = new FakeRpcClient([{ data: [metadata], error: null }]);
    const adapter = createSupabaseVaultAdapter({ client });

    const result = await adapter.list({
      scope: metadata.scope,
      kind: "oauth",
      provider: "google",
    });

    expect(result).toEqual({ ok: true, data: [metadata] });
    expect(client.calls[0]).toEqual({
      functionName: "ankh_secret_list",
      parameters: {
        p_project_id: "scanner",
        p_environment: "local",
        p_kind: "oauth",
        p_provider: "google",
      },
    });
  });
});
