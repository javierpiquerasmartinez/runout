/** The Plans an Account can be on (ADR 0011). */
export const PLANS = ['beta', 'pro'] as const
export type Plan = (typeof PLANS)[number]

/** How each Plan's badge is coloured: Beta in brass, Pro in green. */
export const PLAN_TONE: Record<Plan, 'brass' | 'sync'> = { beta: 'brass', pro: 'sync' }
