import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Copy, Plus, Trash2, Shield, Clock, Check } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useQuery, useMutation } from "convex/react";

type AgentScope = "orchestrator" | "entity_scoped" | "sub_agent";

interface AgentToken {
  _id: string;
  scope: AgentScope;
  scopeEntityIds?: string[];
  issuedAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  isRevoked: boolean;
  isExpired: boolean;
  isActive: boolean;
}

interface Agent {
  _id: string;
  name: string;
  role: string;
  agentScope?: AgentScope;
  agentScopes?: string[];
  isRevoked?: boolean;
  revokedAt?: number;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  hasValidToken?: boolean;
}

export function AgentsView() {
  const { t } = useTranslation();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentScope, setNewAgentScope] = useState<AgentScope>("entity_scoped");
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<string | null>(null);
  const [newAgentTokens, setNewAgentTokens] = useState<{accessToken: string; refreshToken: string} | null>(null);

  const agents = useQuery(api.agents.listAllAgentsForOwner);
  const createAgent = useMutation(api.agents.createAgent);
  const revokeAgent = useMutation(api.agents.revokeAgent);
  const deleteAgent = useMutation(api.agents.deleteAgent);
  const getAgentTokens = useQuery(api.agents.getAgentTokens, 
    showTokens ? { agentId: showTokens as any } : "skip"
  );

  const handleCreateAgent = async () => {
    if (!newAgentName.trim()) return;
    try {
      const result = await createAgent({
        name: newAgentName,
        scope: newAgentScope,
      });
      setNewAgentTokens(result);
      setNewAgentName("");
      setShowCreateForm(false);
    } catch (error) {
      console.error("Failed to create agent:", error);
    }
  };

  const copyToClipboard = async (text: string, tokenId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedTokenId(tokenId);
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getScopeLabel = (scope: AgentScope) => {
    switch (scope) {
      case "orchestrator":
        return t("agents.scopes.orchestrator");
      case "entity_scoped":
        return t("agents.scopes.entityScoped");
      case "sub_agent":
        return t("agents.scopes.subAgent");
      default:
        return scope;
    }
  };

  const getScopeDescription = (scope: AgentScope) => {
    switch (scope) {
      case "orchestrator":
        return t("agents.scopeDescriptions.orchestrator");
      case "entity_scoped":
        return t("agents.scopeDescriptions.entityScoped");
      case "sub_agent":
        return t("agents.scopeDescriptions.subAgent");
      default:
        return "";
    }
  };

  if (agents === undefined) {
    return <div className="p-4">{t("agents.loading")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t("agents.title")}</h2>
          <p className="text-muted-foreground">{t("agents.description")}</p>
        </div>
        <Button onClick={() => { setShowCreateForm(!showCreateForm); setNewAgentTokens(null); }}>
          <Plus className="h-4 w-4" />
          {t("agents.createAgent")}
        </Button>
      </div>

      {showCreateForm && !newAgentTokens && (
        <Card>
          <CardHeader>
            <CardTitle>{t("agents.createNewAgent")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                placeholder={t("agents.agentName")}
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("agents.scope")}</label>
              <div className="grid grid-cols-3 gap-2">
                {(["orchestrator", "entity_scoped", "sub_agent"] as AgentScope[]).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setNewAgentScope(scope)}
                    className={`p-3 rounded-lg border text-left ${
                      newAgentScope === scope
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="font-medium text-sm">{getScopeLabel(scope)}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {getScopeDescription(scope)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreateAgent}>{t("agents.create")}</Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                {t("agents.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {newAgentTokens && (
        <Card className="border-green-500">
          <CardHeader>
            <CardTitle className="text-green-600">Agent Created Successfully</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copy these tokens securely. They will not be shown again.
            </p>
            <div className="space-y-2">
              <div>
                <label className="text-sm font-medium">Access Token</label>
                <div className="flex gap-2 mt-1">
                  <Input 
                    value={newAgentTokens.accessToken} 
                    readOnly 
                    className="font-mono text-xs"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyToClipboard(newAgentTokens.accessToken, "access")}
                  >
                    {copiedTokenId === "access" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Refresh Token</label>
                <div className="flex gap-2 mt-1">
                  <Input 
                    value={newAgentTokens.refreshToken} 
                    readOnly 
                    className="font-mono text-xs"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyToClipboard(newAgentTokens.refreshToken, "refresh")}
                  >
                    {copiedTokenId === "refresh" ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <Button onClick={() => setNewAgentTokens(null)}>
              Done
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {agents.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              {t("agents.noAgents")}
            </CardContent>
          </Card>
        ) : (
          agents.map((agent) => (
            <Card key={agent._id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    {agent.isRevoked && (
                      <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                        {t("agents.revoked")}
                      </span>
                    )}
                    {agent.hasValidToken && !agent.isRevoked && (
                      <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded">
                        {t("agents.active")}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!agent.isRevoked && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowTokens(showTokens === agent._id ? null : agent._id)}
                      >
                        <Shield className="h-4 w-4" />
                        {t("agents.viewTokens")}
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteAgent({ agentId: agent._id as any })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {t("agents.created")}: {formatDate(agent.createdAt)}
                  </div>
                  {agent.lastUsedAt && (
                    <div>
                      {t("agents.lastUsed")}: {formatDate(agent.lastUsedAt)}
                    </div>
                  )}
                  {agent.agentScope && (
                    <div>
                      {t("agents.scope")}: {getScopeLabel(agent.agentScope)}
                    </div>
                  )}
                </div>

                {showTokens === agent._id && getAgentTokens && (
                  <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
                    <h4 className="font-medium">{t("agents.tokens")}</h4>
                    {getAgentTokens.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("agents.noTokens")}</p>
                    ) : (
                      getAgentTokens.map((token: AgentToken) => (
                        <div
                          key={token._id}
                          className="flex items-center justify-between p-2 bg-background rounded"
                        >
                          <div className="space-y-1">
                            <div className="text-sm font-medium">
                              {token.scope} - {token.isActive ? t("agents.active") : t("agents.inactive")}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {t("agents.issued")}: {formatDate(token.issuedAt)}
                              {" | "}
                              {t("agents.expires")}: {formatDate(token.expiresAt)}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(token._id, token._id)}
                            >
                              {copiedTokenId === token._id ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}