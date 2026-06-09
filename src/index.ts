#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { execFile } from "node:child_process";
import { resolve } from "node:path";

const BINARY = resolve(
   process.env.MERMAID_ASCII_BIN ?? "F:\\repos\\mermaid-ascii\\mermaid-ascii.exe"
);

function renderMermaid(
   diagram: string,
   opts: { ascii?: boolean; paddingX?: number; paddingY?: number; borderPadding?: number }
): Promise<string> {
   return new Promise((resolve, reject) => {
      const args = ["-f", "-"];
      if (opts.ascii) {
         args.push("--ascii");
      }
      if (opts.paddingX !== undefined) {
         args.push("-x", String(opts.paddingX));
      }
      if (opts.paddingY !== undefined) {
         args.push("-y", String(opts.paddingY));
      }
      if (opts.borderPadding !== undefined) {
         args.push("-p", String(opts.borderPadding));
      }

      const child = execFile(BINARY, args, { timeout: 15_000 }, (err, stdout, stderr) => {
         if (err) {
            const msg = stderr.trim() || err.message;
            reject(new Error(`mermaid-ascii failed: ${msg}`));
            return;
         }
         resolve(stdout);
      });

      child.stdin!.end(diagram);
   });
}

const RenderInputSchema = z.object({
   diagram: z.string()
      .min(1, "Diagram must not be empty")
      .describe("Mermaid diagram source code (e.g. 'graph LR\\n  A --> B')"),
   ascii: z.boolean()
      .default(false)
      .describe("Use pure ASCII characters instead of Unicode box-drawing"),
   paddingX: z.number().int().min(0).max(50).default(5)
      .describe("Horizontal spacing between nodes"),
   paddingY: z.number().int().min(0).max(50).default(5)
      .describe("Vertical spacing between nodes"),
   borderPadding: z.number().int().min(0).max(10).default(1)
      .describe("Padding between text and node border"),
}).strict();

const server = new McpServer({
   name: "mermaid-ascii-mcp-server",
   version: "1.0.0",
});

server.registerTool(
   "render_mermaid",
   {
      title: "Render Mermaid Diagram as ASCII Art",
      description: `Render a Mermaid diagram as ASCII/Unicode art in the terminal.

Supports graph/flowchart (LR and TD layouts) and sequence diagrams.

Args:
  - diagram (string): Mermaid source code
  - ascii (boolean): Use plain ASCII instead of Unicode box-drawing (default: false)
  - paddingX (number): Horizontal space between nodes (default: 5)
  - paddingY (number): Vertical space between nodes (default: 5)
  - borderPadding (number): Padding inside node borders (default: 1)

IMPORTANT: Always display the rendered diagram to the user in a fenced code block so they can see it.`,
      inputSchema: RenderInputSchema,
      annotations: {
         readOnlyHint: true,
         destructiveHint: false,
         idempotentHint: true,
         openWorldHint: false,
      },
   },
   async (params: z.infer<typeof RenderInputSchema>) => {
      try {
         const result = await renderMermaid(params.diagram, {
            ascii: params.ascii,
            paddingX: params.paddingX,
            paddingY: params.paddingY,
            borderPadding: params.borderPadding,
         });
         return {
            content: [{ type: "text" as const, text: result }],
         };
      } catch (error) {
         return {
            isError: true,
            content: [{
               type: "text" as const,
               text: error instanceof Error ? error.message : String(error),
            }],
         };
      }
   }
);

async function main() {
   const transport = new StdioServerTransport();
   await server.connect(transport);
   console.error("mermaid-ascii MCP server running via stdio");
}

main().catch((err) => {
   console.error("Fatal:", err);
   process.exit(1);
});
