import type { Id } from "../../convex/_generated/dataModel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convexIdToString(id: Id<any>): string {
  return id as unknown as string;
}
