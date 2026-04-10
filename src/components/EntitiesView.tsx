import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { QueryErrorBoundary } from "./QueryErrorBoundary";

type EntityType = "project" | "person" | "idea" | "admin";

export function EntitiesView() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<EntityType>("project");

  const entities = useQuery(api.entities.list);
  const create = useMutation(api.entities.create);

  const handleCreate = () => {
    if (!newName.trim()) return;
    create({ type: newType, name: newName });
    setNewName("");
    setShowForm(false);
  };

  if (entities === undefined) {
    return <div className="p-4">{t("focus.loading")}</div>;
  }

  if (entities === null) {
    return (
      <QueryErrorBoundary>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{t("entities.title")}</h2>
              <p className="text-muted-foreground">{t("entities.description")}</p>
            </div>
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("entities.title")}</h2>
          <p className="text-muted-foreground">{t("entities.description")}</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          {t("entities.newEntity")}
        </Button>
      </div>
      {showForm && (
        <Card>
          <CardContent className="p-4 flex gap-4 items-end">
            <div className="flex-1">
              <Input
                placeholder={t("entities.entityName")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <select
              className="h-9 px-3 rounded-md border border-input bg-background"
              value={newType}
              onChange={(e) => setNewType(e.target.value as EntityType)}
            >
              <option value="project">{t("entities.types.project")}</option>
              <option value="person">{t("entities.types.person")}</option>
              <option value="idea">{t("entities.types.idea")}</option>
              <option value="admin">{t("entities.types.admin")}</option>
            </select>
            <Button onClick={handleCreate}>{t("entities.create")}</Button>
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
