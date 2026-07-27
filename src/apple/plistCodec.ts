import plist from "plist";

export function buildPlist(obj: Record<string, unknown>): string {
  return plist.build(obj as unknown as plist.PlistObject);
}

export function parsePlist(xml: string): Record<string, unknown> {
  return plist.parse(xml) as Record<string, unknown>;
}
