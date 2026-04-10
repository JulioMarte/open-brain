import { cronJobs } from "convex/server";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

export const checkOverdueTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const twelveHoursFromNow = now + 12 * 60 * 60 * 1000;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_dueDate", (q) => q.lt("dueDate", twelveHoursFromNow))
      .collect();

    const overdueTasks = tasks.filter((t): t is typeof t & { dueDate: number } => {
      if (t.status === "done" || t.status === "cancelled") return false;
      if (!t.dueDate) return false;
      return true;
    });

    const systemUser = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", "system")
      )
      .first();

    if (!systemUser) {
      throw new Error("System user not found");
    }

    let createdCount = 0;

    const recentNotifications = await ctx.db
      .query("inbox_log")
      .withIndex("by_source", (q) => q.eq("source", "system_cron"))
      .filter((q) => q.gt(q.field("createdAt"), now - 24 * 60 * 60 * 1000))
      .collect();

    const recentlyNotifiedTaskIds = new Set(
      recentNotifications
        .map((n) => (n.sourceMetadata as { taskId: string } | null)?.taskId)
        .filter((id): id is string => !!id)
    );

    for (const task of overdueTasks) {
      if (recentlyNotifiedTaskIds.has(task._id)) {
        continue;
      }

      await ctx.db.insert("inbox_log", {
        rawText: `🔴 Task Overdue: "${task.title}" was due on ${new Date(
          task.dueDate
        ).toLocaleString()}`,
        source: "system_cron",
        sourceMetadata: {
          taskId: task._id,
          taskTitle: task.title,
          originalDueDate: task.dueDate,
          overdueByHours: Math.round((now - task.dueDate) / (60 * 60 * 1000)),
          notifiedAt: now,
        },
        processed: false,
        createdAt: now,
        createdBy: systemUser._id,
      });

      createdCount++;
    }

    return { createdCount };
  },
});

crons.interval(
  "check-overdue-tasks",
  { hours: 12 },
  internal.crons.checkOverdueTasks,
);

export default crons;
