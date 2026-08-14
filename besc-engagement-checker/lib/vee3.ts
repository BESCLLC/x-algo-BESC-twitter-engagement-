import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const VEE3_MCP_URL = "https://mcp.vee3.io/mcp";
const REQUEST_TIMEOUT_MS = 20000;

interface ToolContentBlock {
  type: string;
  text?: string;
}

export class Vee3Error extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Vee3Error(`${label} timed out after ${(ms / 1000).toFixed(0)}s`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export async function callVee3Tool<T = unknown>(
  toolName: string,
  args: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.VEE3_API_KEY;
  if (!apiKey) {
    throw new Vee3Error("VEE3_API_KEY is not configured on the server");
  }

  const transport = new StreamableHTTPClientTransport(new URL(VEE3_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
  });
  const client = new Client({ name: "besc-engagement-checker", version: "1.0.0" });

  try {
    // client.connect() does the initial handshake and isn't covered by
    // callTool's own request timeout, so it needs its own hard deadline —
    // otherwise a hung/unresponsive Vee3 endpoint spins the UI forever.
    await withTimeout(client.connect(transport), REQUEST_TIMEOUT_MS, "Vee3 connection");
    const result = await withTimeout(
      client.callTool({ name: toolName, arguments: args }, undefined, {
        timeout: REQUEST_TIMEOUT_MS,
      }),
      REQUEST_TIMEOUT_MS + 2000,
      `Vee3 tool "${toolName}"`
    );

    const blocks = (result.content ?? []) as ToolContentBlock[];
    const textBlock = blocks.find((b) => b.type === "text" && typeof b.text === "string");

    if (result.isError) {
      const message = blocks.map((b) => b.text).filter(Boolean).join(" ");
      throw new Vee3Error(message || `Vee3 tool "${toolName}" failed`);
    }
    if (!textBlock?.text) {
      throw new Vee3Error(`Vee3 tool "${toolName}" returned no content`);
    }

    try {
      return JSON.parse(textBlock.text) as T;
    } catch {
      return textBlock.text as unknown as T;
    }
  } finally {
    await client.close().catch(() => {});
  }
}
