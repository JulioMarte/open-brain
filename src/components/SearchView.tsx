import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Search as SearchIcon } from "lucide-react";

export function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);

  const searchMemories = async () => {
    if (!query.trim()) return;
    setSearched(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Search</h2>
        <p className="text-muted-foreground">Semantic search across memories</p>
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Search memories..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchMemories()}
        />
        <Button onClick={searchMemories}>
          <SearchIcon className="h-4 w-4" />
        </Button>
      </div>
      {searched && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No results found
              </CardContent>
            </Card>
          ) : (
            results.map((result: any, index: number) => (
              <Card key={index}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-sm">
                    Memory #{index + 1}
                    {result.confidenceScore && ` (${(result.confidenceScore * 100).toFixed(1)}% confidence)`}
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
