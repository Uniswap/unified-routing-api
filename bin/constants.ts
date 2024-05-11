// IMPORANT: Once this has been changed once from the original value of 'Template',
// do not change again. Changing would cause every piece of infrastructure to change
// name, and thus be redeployed. Should be camel case and contain no non-alphanumeric characters.
export const SERVICE_NAME = 'UnifiedRouting';
export const SEV3_P99LATENCY_MS = 7000;
export const SEV2_P99LATENCY_MS = 10000;
export const SEV3_P90LATENCY_MS = 5500;
export const SEV2_P90LATENCY_MS = 8500;
export const ROUTING_API_MAX_LATENCY_MS = 4000;
export const LATENCY_ALARM_DEFAULT_PERIOD_MIN = 20;
