/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions from "../actions.js";
import type * as agents from "../agents.js";
import type * as crons from "../crons.js";
import type * as entities from "../entities.js";
import type * as inbox from "../inbox.js";
import type * as lib_agentJwt from "../lib/agentJwt.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_systemUser from "../lib/systemUser.js";
import type * as memories from "../memories.js";
import type * as memoriesStore from "../memoriesStore.js";
import type * as proposals from "../proposals.js";
import type * as tasks from "../tasks.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actions: typeof actions;
  agents: typeof agents;
  crons: typeof crons;
  entities: typeof entities;
  inbox: typeof inbox;
  "lib/agentJwt": typeof lib_agentJwt;
  "lib/auth": typeof lib_auth;
  "lib/permissions": typeof lib_permissions;
  "lib/systemUser": typeof lib_systemUser;
  memories: typeof memories;
  memoriesStore: typeof memoriesStore;
  proposals: typeof proposals;
  tasks: typeof tasks;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
