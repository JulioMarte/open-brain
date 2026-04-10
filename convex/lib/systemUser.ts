import { internalMutation } from "../_generated/server";

const SYSTEM_TOKEN_IDENTIFIER = "system";

export const getOrCreateSystemUser = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", SYSTEM_TOKEN_IDENTIFIER))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: SYSTEM_TOKEN_IDENTIFIER,
      role: "admin",
      name: "System",
      email: undefined,
      createdAt: Date.now(),
    });
  },
});