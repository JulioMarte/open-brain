import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { useAction } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Search as SearchIcon, Loader2 } from "lucide-react";

export function SearchView() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const searchMemories = useAction(api.actions.searchMemories);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const queryText = query.trim();
      const searchResults = await searchMemories({ queryText });
      setResults(searchResults);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{t("search.title")}</h2>
        <p className="text-muted-foreground">{t("search.description")}</p>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={t("search.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchIcon className="h-4 w-4" />}
        </Button>
      </div>
      {searched && (
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t("search.searching")}
              </CardContent>
            </Card>
          ) : results.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                {t("search.noResults")}
              </CardContent>
            </Card>
          ) : (
            results.map((result: any, index: number) => (
              <Card key={index}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-sm">
                    {t("search.memory")}{index + 1}
                    {result._score && ` (${(result._score * 100).toFixed(1)}% ${t("search.confidence")})`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{result.text}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}