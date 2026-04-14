# APIProbe - Smart API Testing Tool

**Automatically discover, test, and document APIs**

APIProbe is a smart command-line API testing tool that auto-detects API endpoints, generates documentation, and helps you test APIs faster.

## Features

- **Auto-discovery** - Find API endpoints automatically
- **OpenAPI Detection** - Automatically detects Swagger/OpenAPI specs
- **Request History** - Tracks all your API calls
- **Collections** - Save and replay groups of requests
- **Report Generation** - Export results as JSON or Markdown
- **Color Output** - Easy to read in terminal
- **JSON Introspection** - Auto-parses JSON responses

## Installation

```bash
# Install globally
npm install -g apiprobe

# Or run directly
node index.js <url>
```

## Usage

```bash
# Test an endpoint
apiprobe https://api.example.com/users

# POST with JSON body
apiprobe https://api.example.com/users POST '{"name":"test"}'

# Discover API endpoints
apiprobe discover https://api.example.com

# Run a collection
apiprobe run mycollection.json

# Show request history
apiprobe history

# Generate report
apiprobe report markdown > report.md
```

## Collection Format

```json
{
  "name": "My API Tests",
  "requests": [
    {
      "url": "https://api.example.com/health",
      "method": "GET"
    },
    {
      "url": "https://api.example.com/users",
      "method": "POST",
      "body": {"name": "test"}
    }
  ]
}
```

## Examples

```bash
# Health check
apiprobe https://api.example.com/health

# Test authentication
apiprobe https://api.example.com/login POST '{"email":"test@example.com","password":"secret"}'

# Discover all endpoints
apiprobe discover https://api.example.com

# Test GraphQL
apiprobe https://api.example.com/graphql POST '{"query":"{ users { id name } }"}'
```

## Output Formats

```bash
# JSON report
apiprobe report json

# Markdown report (great for docs)
apiprobe report markdown > api-report.md
```

## License

MIT
