export const DYNAMIC_VARIABLE_NAMES = [
  '$uuid',
  '$guid',
  '$timestamp',
  '$timestampMs',
  '$isoTimestamp',
  '$randomInt',
  '$randomString',
  '$randomHex',
  '$randomBoolean',
] as const;

export type DynamicVariableName = (typeof DYNAMIC_VARIABLE_NAMES)[number];
