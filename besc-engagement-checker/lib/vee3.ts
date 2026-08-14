import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const VEE3_MCP_URL = "https://mcp.vee3.io/mcp";

interface ToolContentBlock {
  type: string;
  text?: string;
}

export class Vee3Error extends Error {}

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
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });

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
