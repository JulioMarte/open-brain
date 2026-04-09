import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus } from "lucide-react";

type EntityType = "project" | "person" | "idea" | "admin";

interface Entity {
  _id: string;
  type: EntityType;
  name: string;
  description?: string;
}

interface EntitiesViewProps {
  entities?: Entity[];
  onCreate?: (type: EntityType, name: string) => void;
}

export function EntitiesView({ entities = [], onCreate }: EntitiesViewProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EntityType>("project");

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreate?.(newType, newName);
    setNewName("");
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Entities</h2>
          <p className="text-muted-foreground">Projects, people, ideas, and more</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          New Entity
        </Button>
      </div>
      {showForm && (
        <Card>
          <CardContent className="p-4 flex gap-4 items-end">
            <div className="flex-1">
              <Input
                placeholder="Entity name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <select
              className="h-9 px-3 rounded-md border border-input bg-background"
              value={newType}
              onChange={(e) => setNewType(e.target.value as EntityType)}
            >
              <option value="project">Project</option>
              <option value="person">Person</option>
              <option value="idea">Idea</option>
              <option value="admin">Admin</option>
            </select>
            <Button onClick={handleCreate}>Create</Button>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-4">
        {entities.map((entity) => (
          <Card key={entity._id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    entity.type === "project"
                      ? "bg-blue-500"
                      : entity.type === "person"
                      ? "bg-green-500"
                      : entity.type === "idea"
                      ? "bg-purple-500"
                      : "bg-orange-500"
                  }`}
                />
                {entity.name}
              </CardTitle>
            </CardHeader>
            {entity.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground">{entity.description}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
