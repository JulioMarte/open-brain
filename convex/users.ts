import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { upsertUserFromIdentity } from "./lib/auth";

export const storeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    
    const userId = await upsertUserFromIdentity(ctx, {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email,
    });
    
    return userId;
  },
});

export const list = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});
