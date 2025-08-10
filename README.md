# AutoGen Documentation MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with the ability to search and retrieve Microsoft AutoGen documentation.

## Features

## Features

- **Version Support**: Search across different AutoGen versions (stable, dev, specific releases)
- **Smart Search**: Uses AutoGen's native search functionality for accurate and relevant results
- **Comprehensive Coverage**: Searches across all AutoGen documentation including:
  - User guides and tutorials
  - API reference for AutoGen Core and AgentChat
  - Code examples and design patterns
- **Intelligent Fallback**: When native search is unavailable, falls back to comprehensive documentation crawling
- **Direct Access**: Results include direct links to documentation pages for easy access
- **Rich Metadata**: Results include document type, URL, title, and contextual snippets
- **Easy Installation**: Install globally via npx or use locally in your projects

## Installation

### Global Installation (Recommended)

```bash
npm install -g @sykuang/mcp-autogen-doc
```

### Using npx (No Installation Required)

```bash
npx @sykuang/mcp-autogen-doc
```

## Configuration

### Claude Desktop

Add this server to your Claude Desktop configuration file:

**macOS/Linux**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "autogen-docs": {
      "command": "npx",
      "args": ["@sykuang/mcp-autogen-doc"]
    }
  }
}
```

Alternatively, if installed globally:

```json
{
  "mcpServers": {
    "autogen-docs": {
      "command": "mcp-autogen-doc"
    }
  }
}
```

### Other MCP Clients

This server uses the standard MCP protocol and should work with any MCP-compatible client.

## Available Tools

### `search_autogen_docs`

Search AutoGen documentation for relevant information.

**Parameters:**
- `query` (string, required): Search query to find relevant AutoGen documentation
- `limit` (number, optional): Maximum number of results to return (default: 10)
- `version` (string, optional): AutoGen version to search (default: 'stable')

**Supported versions:**
- `stable` (default): Latest stable documentation
- `dev`: Development/latest documentation 
- `v0.4.0`, `v0.3.x`: Specific version documentation (when available)

**Example:**
```
Search for "multi-agent conversation" in AutoGen docs
```

## Available Resources

### `autogen-docs-overview`

Provides an overview of the AutoGen documentation structure and key sections.

## Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/sykuang/mcp-autogen-doc.git
cd mcp-autogen-doc

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

### Local Testing

You can test the server locally using the MCP Inspector:

```bash
npm install -g @modelcontextprotocol/inspector
npx @modelcontextprotocol/inspector node dist/index.js
```

## How It Works

This MCP server leverages AutoGen's native documentation search capabilities to provide intelligent and accurate search results. The search process works as follows:

1. **Native Search**: First attempts to use AutoGen's built-in search functionality at `https://microsoft.github.io/autogen/stable/search.html`
2. **Content Parsing**: Extracts structured results including document types (API Reference, User Guide, Tutorials, etc.)
3. **Intelligent Fallback**: If native search is unavailable, performs comprehensive crawling of key documentation sections
4. **Result Enhancement**: Enriches results with contextual snippets and metadata for better understanding

The server focuses specifically on Microsoft's AutoGen documentation, ensuring high-quality, relevant results for AutoGen-related queries.

## Supported Documentation

This server searches across all sections of Microsoft AutoGen documentation:

- Reference Documentation
- User Guides  
- Tutorials
- API Reference
- Core Concepts
- Installation Guides
- Quick Start Guides

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Related

- [Microsoft AutoGen](https://github.com/microsoft/autogen)
- [AutoGen Documentation](https://microsoft.github.io/autogen/stable/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
