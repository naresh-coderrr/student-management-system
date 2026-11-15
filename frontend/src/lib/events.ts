export const SCHEMA_CHANGED = "sms-schema-changed";

export function notifySchemaChanged() {
  window.dispatchEvent(new Event(SCHEMA_CHANGED));
}
