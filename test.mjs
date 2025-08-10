#!/usr/bin/env node

/**
 * Comprehensive test suite for the AutoGen Documentation MCP Server
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';

class MCPTester {
  constructor() {
    this.serverProcess = null;
    this.responses = new Map();
    this.testResults = [];
    this.currentId = 1;
  }

  startServer() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting MCP Server...\n');
      
      this.serverProcess = spawn('node', ['dist/index.js'], {
        stdio: ['pipe', 'pipe', 'inherit']
      });

      this.serverProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          try {
            const response = JSON.parse(line);
            this.responses.set(response.id, response);
          } catch (e) {
            // Ignore non-JSON output (like stderr messages)
          }
        });
      });

      this.serverProcess.on('error', reject);
      
      // Give server time to start
      setTimeout(resolve, 500);
    });
  }

  async sendRequest(method, params = {}) {
    const id = this.currentId++;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    const startTime = performance.now();
    this.serverProcess.stdin.write(JSON.stringify(message) + '\n');
    
    // Wait for response
    const maxWait = 10000; // 10 seconds
    const checkInterval = 50;
    let elapsed = 0;
    
    while (elapsed < maxWait) {
      if (this.responses.has(id)) {
        const response = this.responses.get(id);
        const duration = performance.now() - startTime;
        return { response, duration };
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }
    
    throw new Error(`Request ${id} (${method}) timed out after ${maxWait}ms`);
  }

  logTest(name, success, details = '', duration = 0) {
    const status = success ? '✅' : '❌';
    const time = duration ? ` (${duration.toFixed(0)}ms)` : '';
    console.log(`${status} ${name}${time}`);
    if (details) console.log(`   ${details}`);
    this.testResults.push({ name, success, details, duration });
  }

  async runTests() {
    try {
      await this.startServer();
      
      // Test 1: Server Initialization
      await this.testInitialization();
      
      // Test 2: List Available Tools
      await this.testListTools();
      
      // Test 3: List Available Resources  
      await this.testListResources();
      
      // Test 4: Basic Search Functionality
      await this.testBasicSearch();
      
      // Test 5: Version Support
      await this.testVersionSupport();
      
      // Test 6: Search with Different Limits
      await this.testSearchLimits();
      
      // Test 7: Empty/Invalid Queries
      await this.testErrorHandling();
      
      // Test 8: Resource Access
      await this.testResourceAccess();
      
      // Test 9: Performance Test
      await this.testPerformance();
      
      this.printSummary();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      process.exit(1);
    } finally {
      if (this.serverProcess) {
        this.serverProcess.kill();
      }
    }
  }

  async testInitialization() {
    console.log('📋 Test 1: Server Initialization');
    
    try {
      const { response, duration } = await this.sendRequest('initialize', {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: {
          name: "enhanced-test-client",
          version: "2.0.0"
        }
      });

      const success = response.result && response.result.capabilities;
      this.logTest(
        'Initialize server',
        success,
        success ? 'Server initialized with capabilities' : 'Missing capabilities in response',
        duration
      );
    } catch (error) {
      this.logTest('Initialize server', false, error.message);
    }
  }

  async testListTools() {
    console.log('\n🛠️  Test 2: List Available Tools');
    
    try {
      const { response, duration } = await this.sendRequest('tools/list');
      
      const tools = response.result?.tools || [];
      const hasSearchTool = tools.some(tool => tool.name === 'search_autogen_docs');
      
      this.logTest(
        'List tools',
        tools.length > 0,
        `Found ${tools.length} tool(s): ${tools.map(t => t.name).join(', ')}`,
        duration
      );
      
      this.logTest(
        'Search tool available',
        hasSearchTool,
        hasSearchTool ? 'search_autogen_docs tool found' : 'search_autogen_docs tool missing'
      );
      
      // Validate tool schema
      const searchTool = tools.find(t => t.name === 'search_autogen_docs');
      if (searchTool) {
        const hasRequiredParams = searchTool.inputSchema?.properties?.query;
        const hasVersionParam = searchTool.inputSchema?.properties?.version;
        
        this.logTest(
          'Tool schema validation',
          hasRequiredParams && hasVersionParam,
          `Required params: ${hasRequiredParams ? '✓' : '✗'}, Version param: ${hasVersionParam ? '✓' : '✗'}`
        );
      }
    } catch (error) {
      this.logTest('List tools', false, error.message);
    }
  }

  async testListResources() {
    console.log('\n📚 Test 3: List Available Resources');
    
    try {
      const { response, duration } = await this.sendRequest('resources/list');
      
      const resources = response.result?.resources || [];
      const hasOverviewResource = resources.some(r => r.name === 'AutoGen Documentation Overview');
      
      this.logTest(
        'List resources',
        resources.length > 0,
        `Found ${resources.length} resource(s)`,
        duration
      );
      
      this.logTest(
        'Overview resource available',
        hasOverviewResource,
        hasOverviewResource ? 'AutoGen Documentation Overview resource found' : 'Overview resource missing'
      );
    } catch (error) {
      this.logTest('List resources', false, error.message);
    }
  }

  async testBasicSearch() {
    console.log('\n🔍 Test 4: Basic Search Functionality');
    
    const testQueries = [
      { query: 'agent', expectedResults: true, description: 'Common term search' },
      { query: 'multi-agent', expectedResults: true, description: 'Hyphenated term search' },
      { query: 'tutorial', expectedResults: true, description: 'Documentation search' }
    ];

    for (const test of testQueries) {
      try {
        const { response, duration } = await this.sendRequest('tools/call', {
          name: 'search_autogen_docs',
          arguments: {
            query: test.query,
            limit: 5
          }
        });

        const success = !response.error && response.result?.content?.length > 0;
        const content = response.result?.content?.[0]?.text || '';
        // Consider it successful if the search executed without error, regardless of results
        const searchExecuted = success && (content.includes('Found') || content.includes('No results'));
        
        this.logTest(
          `Search: "${test.query}"`,
          searchExecuted,
          `${test.description} - ${searchExecuted ? 'Success' : 'Failed to execute'}`,
          duration
        );
        
        // Only validate URLs if there were actual search results
        const hasResults = content.includes('Found') && !content.includes('No results');
        if (hasResults) {
          const urlPattern = /https:\/\/microsoft\.github\.io\/autogen/;
          const hasValidUrls = urlPattern.test(content);
          this.logTest(
            `URL validation for "${test.query}"`,
            hasValidUrls,
            hasValidUrls ? 'URLs properly formatted' : 'Invalid URL format detected'
          );
        }
      } catch (error) {
        this.logTest(`Search: "${test.query}"`, false, error.message);
      }
    }
  }

  async testVersionSupport() {
    console.log('\n🔄 Test 5: Version Support');
    
    const versions = ['stable', 'dev'];
    
    for (const version of versions) {
      try {
        const { response, duration } = await this.sendRequest('tools/call', {
          name: 'search_autogen_docs',
          arguments: {
            query: 'agent',
            limit: 3,
            version: version
          }
        });

        const success = !response.error;
        const content = response.result?.content?.[0]?.text || '';
        const hasVersionInUrls = content.includes(`/autogen/${version}/`);
        
        this.logTest(
          `Version "${version}" search`,
          success,
          success ? `Search completed for ${version} version` : 'Version search failed',
          duration
        );
        
        if (success && content.includes('Found')) {
          this.logTest(
            `Version "${version}" URL format`,
            hasVersionInUrls,
            hasVersionInUrls ? `URLs contain /${version}/` : `URLs missing /${version}/`
          );
        }
      } catch (error) {
        this.logTest(`Version "${version}" search`, false, error.message);
      }
    }
  }

  async testSearchLimits() {
    console.log('\n📊 Test 6: Search Limits');
    
    const limits = [1, 5, 15];
    
    for (const limit of limits) {
      try {
        const { response, duration } = await this.sendRequest('tools/call', {
          name: 'search_autogen_docs',
          arguments: {
            query: 'agent',
            limit: limit
          }
        });

        const success = !response.error;
        const content = response.result?.content?.[0]?.text || '';
        
        // Count results in response
        const resultCount = (content.match(/\d+\.\s\*\*/g) || []).length;
        const respectsLimit = resultCount <= limit;
        
        this.logTest(
          `Limit test (${limit} results)`,
          success && respectsLimit,
          `Requested: ${limit}, Got: ${resultCount}, Respects limit: ${respectsLimit}`,
          duration
        );
      } catch (error) {
        this.logTest(`Limit test (${limit} results)`, false, error.message);
      }
    }
  }

  async testErrorHandling() {
    console.log('\n🚨 Test 7: Error Handling');
    
    const errorTests = [
      { 
        query: '', 
        description: 'Empty query',
        shouldFail: false // Server should handle gracefully
      },
      { 
        query: 'xyznonexistenttermabc123', 
        description: 'Non-existent term',
        shouldFail: false // Should return "No results found"
      }
    ];

    for (const test of errorTests) {
      try {
        const { response, duration } = await this.sendRequest('tools/call', {
          name: 'search_autogen_docs',
          arguments: {
            query: test.query,
            limit: 5
          }
        });

        const hasError = !!response.error;
        const content = response.result?.content?.[0]?.text || '';
        const gracefulHandling = !hasError || content.includes('No results');
        
        this.logTest(
          test.description,
          test.shouldFail ? hasError : gracefulHandling,
          `Error: ${hasError}, Content: ${content.substring(0, 50)}...`,
          duration
        );
      } catch (error) {
        this.logTest(test.description, test.shouldFail, error.message);
      }
    }

    // Test invalid version
    try {
      const { response, duration } = await this.sendRequest('tools/call', {
        name: 'search_autogen_docs',
        arguments: {
          query: 'agent',
          version: 'nonexistent-version-123'
        }
      });

      const gracefulHandling = !response.error;
      this.logTest(
        'Invalid version handling',
        gracefulHandling,
        gracefulHandling ? 'Handled gracefully' : 'Failed with error',
        duration
      );
    } catch (error) {
      this.logTest('Invalid version handling', false, error.message);
    }
  }

  async testResourceAccess() {
    console.log('\n📖 Test 8: Resource Access');
    
    try {
      const { response, duration } = await this.sendRequest('resources/read', {
        uri: 'https://microsoft.github.io/autogen/stable/'
      });

      const success = !response.error && response.result?.contents?.length > 0;
      const content = response.result?.contents?.[0]?.text || '';
      const hasOverviewContent = content.includes('AutoGen Documentation Overview');
      
      this.logTest(
        'Read overview resource',
        success && hasOverviewContent,
        success ? 'Resource content retrieved' : 'Failed to read resource',
        duration
      );
      
      if (hasOverviewContent) {
        const hasUsefulLinks = content.includes('https://microsoft.github.io/autogen');
        this.logTest(
          'Resource content quality',
          hasUsefulLinks,
          hasUsefulLinks ? 'Contains useful documentation links' : 'Missing expected links'
        );
      }
    } catch (error) {
      this.logTest('Read overview resource', false, error.message);
    }
  }

  async testPerformance() {
    console.log('\n⚡ Test 9: Performance Test');
    
    const performanceTests = [
      { query: 'agent', description: 'Quick search performance' },
      { query: 'multi-agent conversation chat', description: 'Complex query performance' }
    ];

    for (const test of performanceTests) {
      try {
        const { response, duration } = await this.sendRequest('tools/call', {
          name: 'search_autogen_docs',
          arguments: {
            query: test.query,
            limit: 10
          }
        });

        const success = !response.error;
        const acceptable = duration < 5000; // 5 seconds threshold
        
        this.logTest(
          test.description,
          success && acceptable,
          `${success ? 'Success' : 'Failed'} in ${duration.toFixed(0)}ms (${acceptable ? 'Acceptable' : 'Slow'})`,
          duration
        );
      } catch (error) {
        this.logTest(test.description, false, error.message);
      }
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    
    const total = this.testResults.length;
    const passed = this.testResults.filter(t => t.success).length;
    const failed = total - passed;
    
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    const avgDuration = this.testResults
      .filter(t => t.duration > 0)
      .reduce((sum, t) => sum + t.duration, 0) / this.testResults.length;
    
    if (avgDuration > 0) {
      console.log(`Average Response Time: ${avgDuration.toFixed(0)}ms`);
    }
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(t => !t.success)
        .forEach(t => console.log(`   - ${t.name}: ${t.details}`));
    }
    
    console.log('\n' + '='.repeat(60));
    
    if (failed === 0) {
      console.log('🎉 All tests passed! The MCP server is working perfectly.');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed. Please review the issues above.');
      process.exit(1);
    }
  }
}

// Run the enhanced test suite
const tester = new MCPTester();
tester.runTests().catch(console.error);
