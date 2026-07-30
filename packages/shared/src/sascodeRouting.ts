import type {
  AgentRoleDefinition,
  ProviderCapabilitySnapshot,
  ResolvedModelTarget,
  RoutingCandidate,
  RoutingConstraint,
  RoutingPolicy,
  SascodeActivityType,
  SascodeModelDescriptor,
  SascodeToolCapability,
  WorkUnitId,
} from "@synara/contracts";

export interface RoutingTelemetry {
  readonly quality?: number;
  readonly costEfficiency?: number;
  readonly latencyEfficiency?: number;
}

export interface EvaluateRoutingInput {
  readonly policy: RoutingPolicy;
  readonly roleId: AgentRoleDefinition["id"];
  readonly activity: SascodeActivityType;
  readonly snapshots: ReadonlyArray<ProviderCapabilitySnapshot>;
  readonly constraints?: ReadonlyArray<RoutingConstraint>;
  readonly priorProviderByWorkUnitId?: ReadonlyMap<WorkUnitId, string>;
  readonly telemetryByTarget?: ReadonlyMap<string, RoutingTelemetry>;
  readonly now?: string;
}

export interface RoutingEvaluation {
  readonly role: AgentRoleDefinition;
  readonly candidates: ReadonlyArray<RoutingCandidate>;
  readonly selected: ResolvedModelTarget | null;
  readonly fallbackOrder: ReadonlyArray<ResolvedModelTarget>;
  readonly rationale: string;
}

export type RoutingEvaluationFailure =
  | {
      readonly _tag: "role-not-found";
      readonly roleId: AgentRoleDefinition["id"];
    }
  | {
      readonly _tag: "no-eligible-target";
      readonly role: AgentRoleDefinition;
      readonly candidates: ReadonlyArray<RoutingCandidate>;
    };

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const targetKey = (target: ResolvedModelTarget): string =>
  `${target.connectionId}\u0000${target.modelSlug}`;

const healthAvailability = (
  snapshot: ProviderCapabilitySnapshot,
): number => {
  switch (snapshot.health) {
    case "ready":
      return 1;
    case "degraded":
      return 0.65;
    case "rate-limited":
      return 0.2;
    case "usage-limited":
    case "needs-auth":
    case "unavailable":
      return 0;
  }
};

const isExpired = (
  snapshot: ProviderCapabilitySnapshot,
  now: string | undefined,
): boolean =>
  now !== undefined &&
  snapshot.expiresAt != null &&
  snapshot.expiresAt <= now;

function requiredTools(
  role: AgentRoleDefinition,
  constraints: ReadonlyArray<RoutingConstraint>,
): ReadonlySet<SascodeToolCapability> {
  return new Set([
    ...role.requiredTools,
    ...constraints
      .filter(
        (
          constraint,
        ): constraint is Extract<RoutingConstraint, { readonly type: "requires-tool" }> =>
          constraint.type === "requires-tool",
      )
      .map((constraint) => constraint.tool),
  ]);
}

function constraintRejections(input: {
  readonly snapshot: ProviderCapabilitySnapshot;
  readonly model: SascodeModelDescriptor;
  readonly activity: SascodeActivityType;
  readonly constraints: ReadonlyArray<RoutingConstraint>;
  readonly priorProviderByWorkUnitId: ReadonlyMap<WorkUnitId, string>;
}): ReadonlyArray<string> {
  const rejected: string[] = [];
  for (const constraint of input.constraints) {
    switch (constraint.type) {
      case "requires-tool":
        if (!input.model.capability.tools.includes(constraint.tool)) {
          rejected.push(`Missing required tool capability: ${constraint.tool}.`);
        }
        break;
      case "requires-activity":
        if (!input.model.capability.activities.includes(constraint.activity)) {
          rejected.push(`Model does not support ${constraint.activity}.`);
        }
        break;
      case "provider-allow-list":
        if (!constraint.providerKeys.includes(input.snapshot.providerKey)) {
          rejected.push("Provider is not in the policy allow list.");
        }
        break;
      case "provider-deny-list":
        if (constraint.providerKeys.includes(input.snapshot.providerKey)) {
          rejected.push("Provider is denied by policy.");
        }
        break;
      case "different-provider-from-work-unit": {
        const prior = input.priorProviderByWorkUnitId.get(constraint.workUnitId);
        if (prior === input.snapshot.providerKey) {
          rejected.push(
            `Independent review must use a different provider than ${constraint.workUnitId}.`,
          );
        }
        break;
      }
      case "requires-image-input":
        if (!input.model.capability.inputModalities.includes("image")) {
          rejected.push("Model does not accept image input.");
        }
        break;
      case "requires-session-resume":
        if (!input.model.capability.supportsSessionResume) {
          rejected.push("Model cannot resume an existing provider session.");
        }
        break;
      case "max-usage-fraction": {
        const exceedsLimit = input.snapshot.quota.some(
          (window) =>
            window.usedFraction !== undefined &&
            window.usedFraction > constraint.value,
        );
        if (exceedsLimit) {
          rejected.push(
            `Provider usage exceeds the configured ${constraint.value} fraction.`,
          );
        }
        break;
      }
    }
  }
  if (!input.model.capability.activities.includes(input.activity)) {
    rejected.push(`Model does not declare support for ${input.activity}.`);
  }
  return rejected;
}

function preferenceScore(
  role: AgentRoleDefinition,
  snapshot: ProviderCapabilitySnapshot,
  model: SascodeModelDescriptor,
): number {
  const providerPreferred = role.preferredProviderKeys.includes(snapshot.providerKey);
  const familyPreferred = role.preferredModelFamilies.includes(model.family);
  if (providerPreferred && familyPreferred) return 1;
  if (familyPreferred) return 0.9;
  if (providerPreferred) return 0.75;
  return 0.35;
}

function weightedScore(
  policy: RoutingPolicy,
  components: RoutingCandidate["scoreComponents"],
): number {
  const weights = policy.scoreWeights;
  const totalWeight =
    weights.capability +
    weights.preference +
    weights.availability +
    weights.quality +
    weights.cost +
    weights.latency +
    weights.continuity;
  if (totalWeight <= 0) return 0;
  return (
    (components.capability * weights.capability +
      components.preference * weights.preference +
      components.availability * weights.availability +
      components.quality * weights.quality +
      components.cost * weights.cost +
      components.latency * weights.latency +
      components.continuity * weights.continuity) /
    totalWeight
  );
}

export function evaluateRouting(
  input: EvaluateRoutingInput,
): RoutingEvaluation | RoutingEvaluationFailure {
  const role = input.policy.roles.find((candidate) => candidate.id === input.roleId);
  if (!role) {
    return { _tag: "role-not-found", roleId: input.roleId };
  }

  const constraints = input.constraints ?? [];
  const priorProviderByWorkUnitId =
    input.priorProviderByWorkUnitId ?? new Map<WorkUnitId, string>();
  const tools = requiredTools(role, constraints);
  const candidates: RoutingCandidate[] = [];

  for (const snapshot of input.snapshots) {
    for (const model of snapshot.models) {
      const target: ResolvedModelTarget = {
        connectionId: snapshot.connectionId,
        providerKey: snapshot.providerKey,
        providerKind: snapshot.providerKind,
        modelSlug: model.slug,
        modelFamily: model.family,
        options: model.optionDefaults ?? {},
      };
      const rejectedReasons = [
        ...constraintRejections({
          snapshot,
          model,
          activity: input.activity,
          constraints,
          priorProviderByWorkUnitId,
        }),
      ];
      const warnings: string[] = [];

      if (role.forbiddenProviderKeys.includes(snapshot.providerKey)) {
        rejectedReasons.push("Provider is forbidden for this role.");
      }
      for (const tool of tools) {
        if (!model.capability.tools.includes(tool)) {
          rejectedReasons.push(`Model is missing role tool capability: ${tool}.`);
        }
      }
      if (
        snapshot.health === "usage-limited" ||
        snapshot.health === "needs-auth" ||
        snapshot.health === "unavailable"
      ) {
        rejectedReasons.push(`Provider connection is ${snapshot.health}.`);
      } else if (snapshot.health !== "ready") {
        warnings.push(`Provider connection is ${snapshot.health}.`);
      }
      if (isExpired(snapshot, input.now)) {
        rejectedReasons.push("Capability snapshot has expired.");
      }
      if (model.deprecated === true) {
        warnings.push("Model is marked deprecated.");
      }

      const telemetry = input.telemetryByTarget?.get(targetKey(target));
      const components: RoutingCandidate["scoreComponents"] = {
        capability: rejectedReasons.length === 0 ? 1 : 0,
        preference: preferenceScore(role, snapshot, model),
        availability: healthAvailability(snapshot),
        quality: clamp01(telemetry?.quality ?? 0.5),
        cost: clamp01(telemetry?.costEfficiency ?? 0.5),
        latency: clamp01(telemetry?.latencyEfficiency ?? 0.5),
        continuity: model.capability.supportsSessionResume ? 1 : 0.4,
      };
      const eligible = rejectedReasons.length === 0;
      candidates.push({
        target,
        capabilitySnapshotId: snapshot.id,
        eligible,
        score: eligible ? weightedScore(input.policy, components) : -1,
        scoreComponents: components,
        rejectedReasons,
        warnings,
      });
    }
  }

  candidates.sort(
    (left, right) =>
      Number(right.eligible) - Number(left.eligible) ||
      right.score - left.score ||
      left.target.providerKey.localeCompare(right.target.providerKey) ||
      left.target.modelSlug.localeCompare(right.target.modelSlug) ||
      left.target.connectionId.localeCompare(right.target.connectionId),
  );
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const selected = eligible[0]?.target ?? null;
  if (selected === null) {
    return {
      _tag: "no-eligible-target",
      role,
      candidates,
    };
  }

  return {
    role,
    candidates,
    selected,
    fallbackOrder: eligible.slice(1).map((candidate) => candidate.target),
    rationale:
      `Selected ${selected.providerKey}/${selected.modelSlug} for ${input.activity} ` +
      `using role ${role.displayName} and routing policy revision ${input.policy.revision}.`,
  };
}
