#!/usr/bin/env node
/**
 * APIProbe - Smart API Testing Tool
 * Detect, test, and document APIs automatically
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

class APIProbe {
  constructor() {
    this.history = [];
    this.collections = new Map();
    this.verbose = false;
  }

  log(level, ...args) {
    if (this.verbose || level !== 'debug') {
      const prefix = level === 'error' ? `${colors.red}✗` :
                     level === 'success' ? `${colors.green}✓` :
                     level === 'warn' ? `${colors.yellow}⚠` :
                     level === 'info' ? `${colors.cyan}ℹ` : ' ';
      console.log(`${prefix}${colors.reset}`, ...args);
    }
  }

  async probe(url, options = {}) {
    const {
      method = 'GET',
      headers = {},
      body = null,
      timeout = 10000,
      followRedirects = true,
    } = options;

    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'User-Agent': 'APIProbe/1.0',
        'Accept': 'application/json, */*',
        ...headers,
      },
      timeout,
    };

    return new Promise((resolve, reject) => {
      const req = client.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const result = {
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            body: data,
            time: Date.now() - startTime,
            size: Buffer.byteLength(data),
          };

          // Try to parse JSON
          try {
            result.json = JSON.parse(data);
          } catch {}

          resolve(result);
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      const startTime = Date.now();

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  async discover(url) {
    this.log('info', `${colors.bright}Discovering API at${colors.reset}`, url);

    const results = {
      endpoints: [],
      schemas: [],
      contentTypes: new Set(),
      authentication: null,
    };

    // Try common API paths
    const paths = ['', '/api', '/api/v1', '/api/v2', '/graphql', '/health', '/status'];

    for (const p of paths) {
      try {
        const res = await this.probe(url + p, { method: 'GET' });
        if (res.status < 400) {
          results.endpoints.push({ path: p || '/', status: res.status, method: 'GET' });
          if (res.headers['content-type']) {
            results.contentTypes.add(res.headers['content-type']);
          }
          if (res.headers['www-authenticate']) {
            results.authentication = res.headers['www-authenticate'];
          }
          this.log('success', `Found: ${p || '/'} (${res.status})`);
        }
      } catch (e) {
        // Skip failures
      }
    }

    // Detect OpenAPI/Swagger
    const specPaths = ['/openapi.json', '/swagger.json', '/api-docs', '/api/spec'];
    for (const spec of specPaths) {
      try {
        const res = await this.probe(url + spec);
        if (res.status === 200 && res.json) {
          results.schemas.push({ path: spec, type: 'openapi' });
          this.log('success', `Found OpenAPI spec: ${spec}`);
        }
      } catch {}
    }

    return results;
  }

  async testEndpoint(url, method = 'GET', body = null) {
    const startTime = Date.now();
    this.log('info', `${method} ${url}`);

    try {
      const res = await this.probe(url, { method, body });

      // Format output
      const color = res.status < 300 ? colors.green :
                    res.status < 400 ? colors.yellow :
                    colors.red;

      console.log(`\n${colors.bright}${method} ${url}${colors.reset}`);
      console.log(`${color}${res.status} ${res.statusText}${colors.reset} (${res.time}ms)`);
      console.log(`${colors.dim}Size: ${res.size} bytes${colors.reset}`);

      if (res.json) {
        console.log(`\n${colors.cyan}Response (JSON):${colors.reset}`);
        console.log(JSON.stringify(res.json, null, 2));
      } else if (res.body.length > 0) {
        console.log(`\n${colors.cyan}Response:${colors.reset}`);
        console.log(res.body.substring(0, 1000));
      }

      // Save to history
      this.history.push({
        url, method, body,
        status: res.status,
        time: res.time,
        timestamp: new Date().toISOString(),
      });

      return res;
    } catch (e) {
      this.log('error', `${method} ${url}: ${e.message}`);
      throw e;
    }
  }

  async runCollection(collection) {
    this.log('info', `${colors.bright}Running collection:${colors.reset}`, collection.name);
    const results = [];

    for (const request of collection.requests) {
      try {
        const res = await this.testEndpoint(request.url, request.method, request.body);
        results.push({ ...request, success: res.status < 400, response: res });
      } catch (e) {
        results.push({ ...request, success: false, error: e.message });
      }
    }

    const passed = results.filter(r => r.success).length;
    this.log('info', `${colors.green}${passed}/${results.length} passed${colors.reset}`);

    return results;
  }

  generateReport(format = 'json') {
    if (format === 'json') {
      return JSON.stringify({
        timestamp: new Date().toISOString(),
        totalRequests: this.history.length,
        history: this.history,
      }, null, 2);
    }

    if (format === 'markdown') {
      let md = `# API Test Report\n\n`;
      md += `Generated: ${new Date().toISOString()}\n\n`;
      md += `## Summary\n\n`;
      md += `- Total Requests: ${this.history.length}\n`;
      md += `- Endpoints Tested:\n`;

      const endpoints = [...new Set(this.history.map(h => h.url))];
      for (const ep of endpoints) {
        const reqs = this.history.filter(h => h.url === ep);
        md += `  - ${ep}: ${reqs.length} requests\n`;
      }

      md += `\n## History\n\n`;
      md += `| Time | Method | URL | Status |\n`;
      md += `|------|--------|-----|--------|\n`;

      for (const h of this.history) {
        md += `| ${h.timestamp} | ${h.method} | ${h.url} | ${h.status} |\n`;
      }

      return md;
    }
  }
}

async function main() {
  const probe = new APIProbe();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
${colors.cyan}${colors.bright}
    █████╗ ██████╗  ██████╗██╗  ██╗███████╗██████╗ 
   ██╔══██╗██╔════╝██╔════╝██║  ██║██╔════╝██╔══██╗
   ███████║██║     ██║     ███████║█████╗  ██████╔╝
   ██╔══██║██║     ██║     ██╔══██║██╔══╝  ██╔══██╗
   ██║  ██║╚██████╗╚██████╗██║  ██║███████╗██║  ██║
   ╚═╝  ╚═╝ ╚═════╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
${colors.reset}
${colors.dim}Smart API Testing Tool${colors.reset}

Usage:
  apiprobe <url> [method] [body]   Test an endpoint
  apiprobe discover <url>          Discover API endpoints
  apiprobe run <collection.json>   Run a collection
  apiprobe history                 Show request history
  apiprobe report [format]         Generate report (json|markdown)

Examples:
  apiprobe https://api.example.com
  apiprobe https://api.example.com/users GET
  apiprobe https://api.example.com/users POST '{"name":"test"}'
  apiprobe discover https://api.example.com
  apiprobe report markdown > report.md
`);
    process.exit(0);
  }

  const command = args[0];

  if (command === 'discover') {
    const url = args[1] || 'http://localhost:3000';
    const results = await probe.discover(url);
    console.log('\n📊 Discovery Results:');
    console.log(JSON.stringify(results, null, 2));
  }
  else if (command === 'run') {
    const file = args[1];
    if (!file) {
      console.error('Please specify a collection file');
      process.exit(1);
    }
    const collection = JSON.parse(fs.readFileSync(file));
    await probe.runCollection(collection);
  }
  else if (command === 'history') {
    console.log('\n📜 Request History:');
    for (const h of probe.history.slice(-10)) {
      const color = h.status < 300 ? colors.green : colors.red;
      console.log(`${color}${h.method}${colors.reset} ${h.url} -> ${h.status} (${h.time}ms)`);
    }
  }
  else if (command === 'report') {
    console.log(probe.generateReport(args[1] || 'json'));
  }
  else {
    // Default: test endpoint
    const url = command;
    const method = args[1] || 'GET';
    let body = args[2] || null;
    if (body && (body.startsWith('{') || body.startsWith('['))) {
      // Assume JSON
    }
    await probe.testEndpoint(url, method, body);
  }
}

main().catch(console.error);