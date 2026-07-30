import { describe, expect, it } from "vitest";

import {
  WsAutomationCreateRpc,
  WsAutomationGetMemoryRpc,
  WsAutomationResolveProposalRpc,
  WsBootstrapRpcGroup,
  WsFeatureRpcGroup,
  WsProjectsDiscoverScriptsRpc,
  WsPullRequestsReviewRequestCountRpc,
  WsRpcError,
  WsRpcGroup,
} from "./rpc";
import { ORCHESTRATION_WS_METHODS } from "./orchestration";
import { SASCODE_WS_METHODS } from "./sascode";

describe("WS RPC contracts", () => {
  it("exports the additive Effect RPC group", () => {
    expect(WsRpcGroup).toBeDefined();
    expect(WsBootstrapRpcGroup.requests.has("bootstrap.negotiate")).toBe(true);
    expect(WsFeatureRpcGroup.requests.has("bootstrap.negotiate")).toBe(false);
    expect(
      WsFeatureRpcGroup.requests.has(ORCHESTRATION_WS_METHODS.listProviderDeliveryBlockers),
    ).toBe(true);
    expect(WsFeatureRpcGroup.requests.has(ORCHESTRATION_WS_METHODS.reconcileProviderDelivery)).toBe(
      true,
    );
    expect(WsFeatureRpcGroup.requests.has(SASCODE_WS_METHODS.getProjectSnapshot)).toBe(true);
    expect(WsFeatureRpcGroup.requests.has(SASCODE_WS_METHODS.scheduleWorkUnit)).toBe(true);
    expect(WsFeatureRpcGroup.requests.has(SASCODE_WS_METHODS.subscribeEvents)).toBe(true);
    expect(WsFeatureRpcGroup.requests.has(SASCODE_WS_METHODS.publishRoutingPolicy)).toBe(true);
    expect(WsFeatureRpcGroup.requests.has(SASCODE_WS_METHODS.savePermissionGrant)).toBe(true);
    expect(WsFeatureRpcGroup.requests.has(SASCODE_WS_METHODS.activateModule)).toBe(true);
    expect(WsFeatureRpcGroup.requests.has(SASCODE_WS_METHODS.bootstrapProject)).toBe(true);
    expect(WsFeatureRpcGroup.requests.has(SASCODE_WS_METHODS.startFeature)).toBe(true);
  });

  it("uses a schema-backed transport error", () => {
    expect(new WsRpcError({ message: "failed" }).message).toBe("failed");
  });

  it("exports the project script discovery RPC", () => {
    expect(WsProjectsDiscoverScriptsRpc).toBeDefined();
  });

  it("exports the automation create RPC", () => {
    expect(WsAutomationCreateRpc).toBeDefined();
    expect(WsAutomationGetMemoryRpc).toBeDefined();
    expect(WsAutomationResolveProposalRpc).toBeDefined();
  });

  it("exports the count-only pull request review RPC", () => {
    expect(WsPullRequestsReviewRequestCountRpc).toBeDefined();
  });
});
