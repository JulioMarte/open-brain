# Convex Cron Jobs Guide

## CRITICAL: Convex Crons Have a Specific API

Unlike regular Convex functions (queries/mutations), cron jobs require a **different API**:

```typescript
import { cronJobs } from "convex/server";
const crons = cronJobs();
crons.interval("job-name", { hours: 12 }, internal.module.function);
export default crons;
```

## Common Mistakes

### Mistake: Using internalMutation without Crons export
**WRONG:**
```typescript
export const myCron = internalMutation({ ... });
```

**CORRECT:**
```typescript
import { cronJobs } from "convex/server";
const crons = cronJobs();
crons.interval("my-cron", { hours: 1 }, internal.mymodule.myCron);
export default crons;
```

### Mistake: Using setInterval or setTimeout
**WRONG:** Trying to use JavaScript's setInterval/setTimeout

**CORRECT:** Use Convex's scheduler API:
```typescript
crons.interval("name", { seconds: 30 }, internal.module.function);
crons.hourly("name", { minuteUTC: 0 }, internal.module.function);
crons.daily("name", { hourUTC: 0, minuteUTC: 0 }, internal.module.function);
```

## Schedule Options

| Method | Example |
|--------|---------|
| `crons.interval` | `{ seconds: 30 }`, `{ minutes: 5 }`, `{ hours: 12 }` |
| `crons.hourly` | `{ minuteUTC: 0 }` |
| `crons.daily` | `{ hourUTC: 0, minuteUTC: 0 }` |
| `crons.weekly` | `{ dayOfWeekUTC: 0, hourUTC: 0, minuteUTC: 0 }` |
| `crons.monthly` | `{ day: 1, hourUTC: 0, minuteUTC: 0 }` |
| `crons.cron` | `"0 */12 * * *"` (every 12 hours UTC) |

## File Structure

```
convex/
  crons.ts          # Contains BOTH the logic AND the cron registration
```

The `crons.ts` file:
1. Defines the cron logic as `internalMutation`
2. Creates `cronJobs()` instance
3. Registers jobs with the scheduler
4. Default exports the `crons` object

## Testing

Cron jobs are hard to test because they run on a schedule. Test the underlying `internalMutation` function instead:

```typescript
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";

const t = convexTest(schema, modules);
await t.mutation(internal.crons.checkOverdueTasks, {});
```

## Pre-flight Checklist

Before creating a cron job:
- [ ] Import `cronJobs` from "convex/server"
- [ ] Create `const crons = cronJobs()`
- [ ] Define logic as `internalMutation`
- [ ] Register with `crons.interval()` or similar
- [ ] Default export: `export default crons`
- [ ] File must be named `crons.ts` (Convex convention)
