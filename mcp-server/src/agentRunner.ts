import { ConvexHttpClient } from "convex/browser";
import { AgentConfig } from "./convex.js";

const CONVEX_URL = process.env.CONVEX_URL!;

export class AgentTokenManager {
  private client: ConvexHttpClient;
  private config: AgentConfig | null = null;
  private onTokenRefresh?: (newConfig: AgentConfig) => void;

  constructor() {
    this.client = new ConvexHttpClient(CONVEX_URL);
  }

  configure(config: AgentConfig, onTokenRefresh?: (newConfig: AgentConfig) => void) {
    this.config = config;
    this.onTokenRefresh = onTokenRefresh;
  }

  getCurrentToken(): string {
    if (!this.config) {
      throw new Error("Agent not configured");
    }
    return this.config.accessToken;
  }

  isTokenExpired(): boolean {
    if (!this.config) return true;
    return Date.now() >= this.config.expiresAt * 1000;
  }

  isTokenExpiringSoon(thresholdMs: number = 5 * 60 * 1000): boolean {
    if (!this.config) return true;
    return Date.now() >= (this.config.expiresAt * 1000) - thresholdMs;
  }

  async refreshTokenIfNeeded(): Promise<AgentConfig> {
    if (!this.config) {
      throw new Error("Agent not configured");
    }

    if (!this.isTokenExpiringSoon()) {
      return this.config;
    }

    const response = await fetch(`${CONVEX_URL}/api/mcp/agents/refreshAgentToken`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.accessToken}`,
      },
      body: JSON.stringify({
        agentId: this.config.agentId,
        refreshToken: this.config.refreshToken,
      }),
    });

    const result = await response.json() as {
      data?: { accessToken: string; refreshToken: string; expiresAt: number };
      error?: string;
    };

    if (result.error || !result.data) {
      throw new Error(result.error || "Failed to refresh token");
    }

    const newConfig: AgentConfig = {
      agentId: this.config.agentId,
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
      expiresAt: result.data.expiresAt,
    };

    this.config = newConfig;

    if (this.onTokenRefresh) {
      this.onTokenRefresh(newConfig);
    }

    return newConfig;
  }

  async executeWithRefresh<T>(
    operation: (token: string) => Promise<T>
  ): Promise<T> {
    if (this.isTokenExpiringSoon()) {
      await this.refreshTokenIfNeeded();
    }
    return operation(this.config!.accessToken);
  }
}

export const tokenManager = new AgentTokenManager();