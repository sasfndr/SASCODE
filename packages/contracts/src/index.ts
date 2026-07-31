export * from "./auth";
export * from "./automation";
export * from "./baseSchemas";
export * from "./browserAutomationBounds";
export * from "./browserAutomationIds";
export * from "./browserAutomationErrors";
export * from "./browserAutomationCssSelector";
export * from "./browserAutomationTargets";
export { BrowserLoadState } from "./browserAutomationToolCommon";
export * from "./browserAutomationToolInputs";
export * from "./browserAutomationToolOutputs";
export * from "./browserAutomationToolCatalogue";
export * from "./browserAnnotations";
export * from "./ipc";
export * from "./terminal";
export * from "./provider";
export * from "./providerDiscovery";
export * from "./providerRuntime";
export * from "./model";
export * from "./agentMentions";
export * from "./agentGateway";
export * from "./externalMcp";
export * from "./ws";
export * from "./wsCompatibility";
export * from "./keybindings";
export * from "./server";
export * from "./stats";
export * from "./settings";
export * from "./git";
export * from "./pullRequests";
export * from "./orchestration";
export * from "./editor";
export * from "./environment";
export * from "./project";
export * from "./studio";
export * from "./filesystem";
export * from "./rpc";
export * from "./sascode";

// `BrowserTabId` is defined twice on purpose: the browser-automation contracts
// name a live process-level tab, and the SASCODE browser control plane names a
// durable record. They are different ids for different layers. Star exports
// cannot disambiguate, so the barrel explicitly re-exports the automation one,
// which is what every existing consumer of `@synara/contracts` means. SASCODE
// modules import theirs directly from "./sascode/core".
export { BrowserTabId } from "./browserAutomationIds";
