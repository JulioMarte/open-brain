import { ConvexHttpClient } from "convex/browser";
import { AgentConfig, convexClient, refreshAgentToken as refreshAgentTokenFn } from "./convex.js";

const CONVEX_URL = process.env.CONVEX_URL!;

export class AgentTokenManager {
  private config: AgentConfig | null = null;
  private onTokenRefresh?: (newConfig: AgentConfig) => void;

  async refreshTokenIfNeeded(): Promise<AgentConfig> {
    if (!this.config) {
      throw new Error("Agent not configured");
    }

    if (!this.isTokenExpiringSoon()) {
      return this.config;
    }

    const result = await refreshAgentTokenFn(
      this.config.agentId,
      this.config.refreshToken,
      this.config.accessToken
    );

    const newConfig: AgentConfig = {
      agentId: this.config.agentId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    };

    this.config = newConfig;

    if (this.onTokenRefresh) {
      this.onTokenRefresh(newConfig);
    }

    return newConfig;
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