# Schema Modification Checklist

MUST be followed when modifying `convex/schema.ts`.

## Pre-flight Checks

Before adding any field to a table:

- [ ] Field is defined in the table with correct type
- [ ] Field is NOT already defined (avoid duplicates)
- [ ] All mutations that should set `updatedAt`/`updatedBy` have the field defined
- [ ] If field is optional, use `v.optional()` wrapper
- [ ] If field is an enum, use `v.union(v.literal(...))`
- [ ] If field is a reference to another table, use `v.id("otherTable")`

## Common Mistakes

### Mistake: Adding `updatedAt` to code but not schema
**Symptom**: `TS2353: 'updatedAt' does not exist in type 'Partial<...>'`

**Fix**: Add `updatedAt: v.number()` to the table definition

### Mistake: Forgetting to add new fields to `create` mutation
**Symptom**: `ctx.db.insert()` missing property

**Fix**: Always add all required fields in insert operations

### Mistake: Mismatch between schema field type and mutation args
**Symptom**: Type errors when calling `ctx.db.patch()`

**Fix**: Ensure mutation args types match schema types

## For Tasks Table Specifically

When modifying the tasks table, ensure these fields are present:
- `entityId`, `title`, `status` (required)
- `description`, `priority`, `parentTaskId`, `dueDate`, `completedAt` (optional)
- `blockedBy` (array of task IDs)
- `updatedAt`, `createdAt` (numbers, timestamps)
- `updatedBy`, `createdBy`, `agentCreated` (references and boolean)

## After Schema Changes

1. Run `npx convex build --typecheck` to verify types
2. Update any mutation handlers that set new fields
3. Update tests to cover new fields
4. Update this checklist if new patterns emerge