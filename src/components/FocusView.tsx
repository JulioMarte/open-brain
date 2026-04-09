import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Circle } from "lucide-react";

interface Task {
  _id: string;
  title: string;
  description?: string;
}

interface FocusViewProps {
  tasks?: Task[];
  onMarkDone?: (id: string) => void;
}

export function FocusView({ tasks = [], onMarkDone }: FocusViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Focus</h2>
        <p className="text-muted-foreground">Tasks ready to be worked on</p>
      </div>
      {tasks.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No actionable tasks
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
                    onClick={() => onMarkDone?.(task._id)}
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
