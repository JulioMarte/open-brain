import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Circle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { QueryErrorBoundary } from "./QueryErrorBoundary";

export function FocusView() {
  const { t } = useTranslation();
  const tasks = useQuery(api.tasks.getActionable);
  const markDone = useMutation(api.tasks.markDone);

  if (tasks === undefined) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t("focus.title")}</h2>
          <p className="text-muted-foreground">{t("focus.description")}</p>
        </div>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("focus.loading")}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tasks === null) {
    return (
      <QueryErrorBoundary>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">{t("focus.title")}</h2>
            <p className="text-muted-foreground">{t("focus.description")}</p>
          </div>
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t("focus.loading")}
            </CardContent>
          </Card>
        </div>
      </QueryErrorBoundary>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("focus.title")}</h2>
        <p className="text-muted-foreground">{t("focus.description")}</p>
      </div>
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t("focus.noTasks")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task._id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={async () => {
                      try {
                        await markDone({ id: task._id });
                      } catch (e) {
                        console.error("Failed to mark done:", e);
                      }
                    }}
                  >
                    <Circle className="h-4 w-4" />
                  </Button>
                  {task.title}
                </CardTitle>
              </CardHeader>
              {task.description && (
                <CardContent className="pb-2">
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
