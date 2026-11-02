import axios from "axios";
import { canUseTier } from "./compute-routing-policy";

export enum ComputeTier {
  TIER_1_LOCAL = "TIER_1_LOCAL_OLLAMA",
  TIER_2_FREE_CLOUD = "TIER_2_FREE_CLOUD",
  TIER_3_PAID_API = "TIER_3_PAID_API",
}
export interface TaskRequest {
  id: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  complexityHint?: "low" | "medium" | "high";
  privacy?: "public" | "internal" | "air-gapped";
  allowPaid?: boolean;
  maxCostUSD?: number;
}
export interface ExecutionResult {
  taskId: string;
  tierUsed: ComputeTier;
  output: string;
  costUSD: number;
  latencyMs: number;
}
type Endpoint = {tier: ComputeTier; url: string; model: string; key?: string; timeout: number};
const cleanUrl = (url: string) => {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported endpoint protocol");
  return parsed.toString().replace(/\/$/, "");
};
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
export function initialComputeTier(tokens: number, hint?: TaskRequest["complexityHint"]): ComputeTier {
  if (hint === "high" || tokens > 4000) return ComputeTier.TIER_3_PAID_API;
  if (hint === "medium" || tokens > 1500) return ComputeTier.TIER_2_FREE_CLOUD;
  return ComputeTier.TIER_1_LOCAL;
}
export class ComputeCascadingRouter {
  async executeTask(task: TaskRequest): Promise<ExecutionResult> {
    if (!task.id || !task.prompt.trim()) throw new Error("Task id and prompt are required");
    const start = Date.now();
    const tokens = estimateTokens(task.prompt + (task.systemPrompt ?? ""));
    const initial = initialComputeTier(tokens, task.complexityHint);
    if (task.maxTokens !== undefined && (!Number.isSafeInteger(task.maxTokens) || task.maxTokens < 1 || task.maxTokens > 8192)) throw new Error("Invalid maxTokens");
    const maxOutput = task.maxTokens ?? 1024;
    const local: Endpoint = {tier: ComputeTier.TIER_1_LOCAL, url: cleanUrl(process.env.OLLAMA_ENDPOINT ?? "http://127.0.0.1:11434"), model: process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b", timeout: 30000};
    const free: Endpoint = {tier: ComputeTier.TIER_2_FREE_CLOUD, url: cleanUrl(process.env.FREE_CLOUD_ENDPOINT ?? "https://openrouter.ai/api/v1"), model: process.env.FREE_CLOUD_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free", key: process.env.FREE_CLOUD_API_KEY, timeout: 20000};
    const paid: Endpoint = {tier: ComputeTier.TIER_3_PAID_API, url: cleanUrl(process.env.PAID_API_ENDPOINT ?? "https://api.openai.com/v1"), model: process.env.PAID_API_MODEL ?? "gpt-4o", key: process.env.PAID_API_KEY, timeout: 30000};
    const candidates = initial === ComputeTier.TIER_1_LOCAL ? [local, free, paid] : initial === ComputeTier.TIER_2_FREE_CLOUD ? [free, local, paid] : [paid, free, local];
    const pricing = { inputUsdPerMillion: Number(process.env.PAID_INPUT_USD_PER_MILLION ?? NaN), outputUsdPerMillion: Number(process.env.PAID_OUTPUT_USD_PER_MILLION ?? NaN) };
    const errors: string[] = [];
    for (const endpoint of candidates) {
      if (!canUseTier(task, endpoint.tier, pricing)) continue;
      if (endpoint.tier !== ComputeTier.TIER_1_LOCAL && !endpoint.key) continue;
      if (endpoint.tier === ComputeTier.TIER_3_PAID_API && !Number.isFinite(task.maxCostUSD)) continue;
      try {
        let output: string;
        let costUSD = 0;
        if (endpoint.tier === ComputeTier.TIER_1_LOCAL) {
          const response = await axios.post(`${endpoint.url}/api/generate`, {model:endpoint.model, prompt:`${task.systemPrompt ?? ""}\n${task.prompt}`, stream:false, options:{num_predict:maxOutput}}, {timeout:endpoint.timeout});
          output = response.data?.response;
        } else {
          const response = await axios.post(`${endpoint.url}/chat/completions`, {model:endpoint.model, max_tokens:maxOutput, messages:[...(task.systemPrompt ? [{role:"system",content:task.systemPrompt}] : []),{role:"user",content:task.prompt}]}, {headers:{Authorization:`Bearer ${endpoint.key}`},timeout:endpoint.timeout});
          output = response.data?.choices?.[0]?.message?.content;
          if (endpoint.tier === ComputeTier.TIER_3_PAID_API) {
            const inputRate = Number(process.env.PAID_INPUT_USD_PER_MILLION ?? NaN);
            const outputRate = Number(process.env.PAID_OUTPUT_USD_PER_MILLION ?? NaN);
            if (Number.isFinite(inputRate) && Number.isFinite(outputRate)) {
              costUSD = ((response.data?.usage?.prompt_tokens ?? tokens) * inputRate + (response.data?.usage?.completion_tokens ?? maxOutput) * outputRate) / 1_000_000;
            } else throw new Error("Paid API pricing unavailable");
          }
        }
        if (typeof output !== "string" || !output.trim()) throw new Error("Empty model response");
        return {taskId:task.id,tierUsed:endpoint.tier,output,costUSD,latencyMs:Date.now()-start};
      } catch (error) {
        errors.push(`${endpoint.tier}: ${axios.isAxiosError(error) ? (error.response?.status ?? error.code ?? "request failed") : "request failed"}`);
      }
    }
    throw new Error(`No permitted inference route succeeded: ${errors.join("; ") || "no eligible endpoints"}`);
  }
}
