#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchAutoGenDocs } from "./autogen-search.js";

const server = new McpServer({
  name: "autogen-doc-server",
  version: "1.0.0"
});

// Register the search tool
server.tool(
  "search_autogen_docs",
  "Search AutoGen documentation for relevant information",
  {
    query: z.string().describe("Search query to find relevant AutoGen documentation"),
    limit: z.number().optional().default(10).describe("Maximum number of results to return (default: 10)"),
    version: z.string().optional().default('stable').describe("AutoGen version to search (default: 'stable', e.g., 'dev', 'v0.4.0')")
  },
  async ({ query, limit = 10, version = 'stable' }) => {
    try {
      const results = await searchAutoGenDocs(query, limit, version);
      
      if (results.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No results found for "${query}" in AutoGen ${version} documentation.`
            }
          ]
        };
      }

      const formattedResults = results.map((result: any, index: number) => {
        const typeInfo = result.type ? ` (${result.type})` : '';
        return `${index + 1}. **${result.title}**${typeInfo}\n   URL: ${result.url}\n   ${result.snippet}\n`;
      }).join('\n');

      return {
        content: [
          {
            type: "text",
            text: `Found ${results.length} result(s) for "${query}" in AutoGen ${version} documentation:

${formattedResults}`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching AutoGen documentation: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  }
);

// Register a resource for AutoGen documentation overview
server.resource(
  "autogen-docs-overview",
  "https://microsoft.github.io/autogen/stable/",
  {
    name: "AutoGen Documentation Overview",
    description: "Overview of Microsoft AutoGen documentation structure and key sections",
    mimeType: "text/plain"
  },
  async () => {
    const overview = `AutoGen Documentation Overview

Microsoft AutoGen is a framework for creating multi-agent conversational AI systems.

Key Documentation Sections:
- Reference: https://microsoft.github.io/autogen/stable/reference/
- Getting Started: https://microsoft.github.io/autogen/stable/user-guide/
- Tutorials: https://microsoft.github.io/autogen/stable/tutorials/
- API Reference: https://microsoft.github.io/autogen/stable/reference/

To search for specific information, use the search_autogen_docs tool with your query.
The search results will provide direct links to the relevant documentation pages.`;

    return {
      contents: [
        {
          uri: "https://microsoft.github.io/autogen/stable/",
          text: overview
        }
      ]
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AutoGen Documentation MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
