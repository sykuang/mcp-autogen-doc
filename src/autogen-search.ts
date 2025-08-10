import fetch from "node-fetch";
import * as cheerio from "cheerio";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  type?: string; // e.g., "Python module", "Python class", "Guide", etc.
}

const AUTOGEN_BASE_URL = "https://microsoft.github.io/autogen";

/**
 * Get the base URL for a specific AutoGen version
 */
function getVersionUrl(version: string = 'stable'): string {
  return `${AUTOGEN_BASE_URL}/${version}`;
}

/**
 * Perform search on the parsed search index
 */
function performIndexSearch(searchData: any, query: string, baseUrl: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 0);
  
  try {
    // Search index structure can vary, but typically contains:
    // - terms: array of search terms
    // - titles: array of page titles  
    // - titleterms: mapping of terms to title IDs
    // - docnames: array of document names
    // - filenames: array of filenames
    
    if (searchData.titles && searchData.docnames) {
      for (let i = 0; i < searchData.titles.length && results.length < limit; i++) {
        const title = searchData.titles[i];
        const docname = searchData.docnames[i];
        
        // Check if query terms match title or docname
        const titleLower = title.toLowerCase();
        const docnameLower = docname.toLowerCase();
        
        let score = 0;
        for (const term of queryTerms) {
          if (titleLower.includes(term)) score += 3;
          if (docnameLower.includes(term)) score += 2;
        }
        
        if (score > 0) {
          const url = `${baseUrl}/${docname}.html`;
          let type = 'Documentation';
          
          // Determine type based on path
          if (docname.includes('python/')) {
            type = 'API Reference';
          } else if (docname.includes('user-guide/')) {
            type = 'User Guide';
          } else if (docname.includes('tutorials/')) {
            type = 'Tutorial';
          } else if (docname.includes('components/')) {
            type = 'Core Guide';
          }
          
          results.push({
            title,
            url,
            snippet: type,
            type
          });
        }
      }
    }
    
    // Sort by relevance (score) - simple scoring for now
    results.sort((a, b) => {
      const aMatches = queryTerms.reduce((count, term) => 
        count + (a.title.toLowerCase().includes(term) ? 1 : 0), 0);
      const bMatches = queryTerms.reduce((count, term) => 
        count + (b.title.toLowerCase().includes(term) ? 1 : 0), 0);
      return bMatches - aMatches;
    });
    
  } catch (searchError) {
    console.error('Error in index search:', searchError);
  }
  
  return results.slice(0, limit);
}

/**
 * Search AutoGen documentation using enhanced search strategies
 */
export async function searchAutoGenDocs(query: string, limit: number = 10, version: string = 'stable'): Promise<SearchResult[]> {
  try {
    const baseUrl = getVersionUrl(version);
    
    // Try to get the search index file directly first
    const searchIndexUrl = `${baseUrl}/searchindex.js`;
    const response = await fetch(searchIndexUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (response.ok) {
      const searchIndexContent = await response.text();
      
      // Parse the search index (it's a JavaScript file that defines Search object)
      let searchData;
      try {
        // Extract the search data from the JavaScript file
        // The search index typically contains terms, titles, and document info
        const match = searchIndexContent.match(/Search\.setIndex\((.*)\);?$/m);
        if (match) {
          searchData = JSON.parse(match[1]);
          
          // Perform search on the parsed index
          const indexResults = performIndexSearch(searchData, query, baseUrl, limit);
          if (indexResults.length > 0) {
            return indexResults;
          }
        }
      } catch (parseError) {
        console.log('Could not parse search index, trying fallback:', parseError instanceof Error ? parseError.message : String(parseError));
      }
    }

    // If search index approach didn't work, try the native search page
    const searchUrl = `${baseUrl}/search.html?q=${encodeURIComponent(query)}`;
    const searchPageResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (searchPageResponse.ok) {
      const html = await searchPageResponse.text();
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];

      // Parse AutoGen native search results
      // The search results are typically in a list or section after "Searching" heading
      const searchSection = $('h2:contains("Searching")').parent();
      
      // Look for search result items - they appear as links with descriptions
      searchSection.find('a[href]').each((index, element) => {
        if (results.length >= limit) return false;
        
        const $element = $(element);
        let title = $element.text().trim();
        let url = $element.attr('href');
        
        if (!url || !title) return;
        
        // Make relative URLs absolute
        if (url.startsWith('/')) {
          url = baseUrl + url;
        } else if (!url.startsWith('http')) {
          url = `${baseUrl}/${url}`;
        }
        
        // Skip if not an AutoGen documentation URL
        if (!url.includes('microsoft.github.io/autogen')) return;
        
        // Get the context/description that follows the link
        let snippet = '';
        let type = '';
        
        // Look for parenthetical type information like "(Python module, in autogen_core)"
        const parentElement = $element.parent();
        const fullText = parentElement.text();
        const typeMatch = fullText.match(/\(([^)]+)\)/);
        if (typeMatch) {
          type = typeMatch[1];
          snippet = `${type}`;
        }
        
        // If no type found, try to get surrounding context
        if (!snippet) {
          const nextSibling = $element.next();
          if (nextSibling.length > 0) {
            snippet = nextSibling.text().trim().substring(0, 200);
          }
        }
        
        // Clean up the title
        title = title.replace(/\s+/g, ' ').trim();
        
        if (title && url) {
          results.push({
            title,
            url,
            snippet: snippet || 'AutoGen documentation',
            type
          });
        }
      });

      if (results.length > 0) {
        return results.slice(0, limit);
      }
    }

    // Fallback to enhanced manual search
    return await fallbackSearch(query, limit, version);

  } catch (error) {
    console.error('Enhanced search failed, trying fallback:', error);
    return await fallbackSearch(query, limit, version);
  }
}

/**
 * Fallback search by crawling AutoGen documentation directly
 */
async function fallbackSearch(query: string, limit: number, version: string = 'stable'): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();
  const baseUrl = getVersionUrl(version);
  
  // For MCP queries, prioritize specific sections and use alternative base URL
  const isMcpQuery = queryLower.includes('mcp') || queryLower.includes('model context protocol') || queryLower.includes('autogen_ext');
  
  let pagesToSearch;
  
  if (isMcpQuery) {
    // Use main documentation URL for MCP-related searches
    const mcpBaseUrl = 'https://microsoft.github.io/autogen';
    pagesToSearch = [
      // MCP-specific pages
      { url: `${mcpBaseUrl}/docs/ecosystem/integrations`, type: 'MCP Integrations' },
      { url: `${mcpBaseUrl}/docs/reference/agentchat/contrib`, type: 'Contrib Modules' },
      { url: `${mcpBaseUrl}/docs/ecosystem/community`, type: 'Community' },
      { url: `${mcpBaseUrl}/docs/tutorial/code-executors`, type: 'Code Executors' },
      { url: `${mcpBaseUrl}/docs/tutorial/tool-use`, type: 'Tool Use' },
      { url: `${mcpBaseUrl}/docs/ecosystem/ecosystem`, type: 'Ecosystem' },
      
      // Standard documentation pages
      { url: `${mcpBaseUrl}/docs/Getting-Started`, type: 'Getting Started' },
      { url: `${mcpBaseUrl}/docs/tutorial/introduction`, type: 'Tutorial' },
      { url: `${mcpBaseUrl}/docs/Use-Cases/agent_chat`, type: 'Agent Chat' },
      { url: `${mcpBaseUrl}/docs/Installation`, type: 'Installation' },
      { url: `${mcpBaseUrl}/docs/FAQ`, type: 'FAQ' },
      { url: `${mcpBaseUrl}/docs/Migration-Guide`, type: 'Migration' },
      { url: `${mcpBaseUrl}/blog`, type: 'Blog' },
    ];
  } else {
    // Standard documentation pages for non-MCP queries
    pagesToSearch = [
      {
        url: `${baseUrl}/user-guide/index.html`,
        type: 'User Guide'
      },
      {
        url: `${baseUrl}/user-guide/core-user-guide/index.html`,
        type: 'Core Guide'
      },
      {
        url: `${baseUrl}/user-guide/agentchat-user-guide/index.html`,
        type: 'AgentChat Guide'
      },
      {
        url: `${baseUrl}/reference/index.html`,
        type: 'API Reference'
      },
      {
        url: `${baseUrl}/reference/agentchat/index.html`,
        type: 'AgentChat API'
      },
      {
        url: `${baseUrl}/reference/autogen_core/index.html`,
        type: 'Core API'
      },
      {
        url: `${baseUrl}/tutorials/index.html`,
        type: 'Tutorials'
      }
    ];
  }

  for (const page of pagesToSearch) {
    if (results.length >= limit) break;
    
    try {
      const response = await fetch(page.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AutoGen-MCP-Search/1.0)'
        }
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script, style').remove();
      
      // Search in page content first
      const pageTitle = $('title').text() || $('h1').first().text();
      const pageContent = $('main, .content, article').text().toLowerCase();
      
      if (pageContent.includes(queryLower)) {
        // Find relevant sections or headings
        $('h1, h2, h3, h4, h5, h6').each((index, element) => {
          if (results.length >= limit) return false;
          
          const $heading = $(element);
          const headingText = $heading.text().trim();
          
          if (headingText.toLowerCase().includes(queryLower)) {
            const headingId = $heading.attr('id');
            let url = page.url;
            if (headingId) {
              url += `#${headingId}`;
            }
            
            // Get context from the next paragraph or section
            const nextContent = $heading.next('p, div').text().trim();
            const snippet = nextContent.substring(0, 200) || `${page.type}: ${headingText}`;
            
            results.push({
              title: headingText,
              url,
              snippet,
              type: page.type
            });
          }
        });
        
        // Search in paragraphs and divs for content matches
        $('p, div').each((index, element) => {
          if (results.length >= limit) return false;
          
          const $element = $(element);
          const text = $element.text().trim();
          
          if (text.toLowerCase().includes(queryLower) && text.length > 50) {
            // Find the closest heading for title
            const $heading = $element.prevAll('h1, h2, h3, h4, h5, h6').first();
            const title = $heading.length > 0 ? $heading.text().trim() : pageTitle || 'AutoGen Documentation';
            
            let url = page.url;
            const headingId = $heading.attr('id');
            if (headingId) {
              url += `#${headingId}`;
            }
            
            const snippet = text.substring(0, 200);
            
            // Avoid duplicates
            const isDuplicate = results.some(result => 
              result.url === url && result.title === title
            );
            
            if (!isDuplicate) {
              results.push({
                title,
                url,
                snippet,
                type: page.type
              });
            }
          }
        });
      }
      
      // For MCP queries, also search for related terms
      if (isMcpQuery) {
        const mcpRelatedTerms = ['autogen_ext', 'tools', 'extensions', 'contrib', 'ecosystem'];
        mcpRelatedTerms.forEach(term => {
          if (results.length >= limit) return;
          
          const pageText = $.text().toLowerCase();
          if (pageText.includes(term)) {
            // Find headings or sections mentioning these terms
            $('h1, h2, h3, h4, h5, h6, p, div').each((index, element) => {
              if (results.length >= limit) return false;
              
              const $element = $(element);
              const text = $element.text().trim();
              
              if (text.toLowerCase().includes(term) && text.length > 20) {
                const isHeading = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(element.tagName);
                let title = isHeading ? text : $element.prevAll('h1, h2, h3, h4, h5, h6').first().text().trim();
                
                if (!title) title = `${page.type}: ${term}`;
                
                let url = page.url;
                const id = $element.attr('id');
                if (id) {
                  url += `#${id}`;
                }
                
                const snippet = text.substring(0, 200);
                
                // Avoid duplicates
                const isDuplicate = results.some(result => 
                  result.url === url && result.title === title
                );
                
                if (!isDuplicate) {
                  results.push({
                    title,
                    url,
                    snippet,
                    type: page.type
                  });
                }
              }
            });
          }
        });
      }
      
      // Find relevant links
      $('a[href]').each((index, element) => {
        if (results.length >= limit) return false;
        
        const $element = $(element);
        const title = $element.text().trim();
        let url = $element.attr('href');
        
        if (!url || !title || title.length < 3) return;
        
        // Make relative URLs absolute
        if (url.startsWith('/')) {
          url = (isMcpQuery ? 'https://microsoft.github.io/autogen' : baseUrl) + url;
        } else if (!url.startsWith('http')) {
          url = `${isMcpQuery ? 'https://microsoft.github.io/autogen' : baseUrl}/${url}`;
        }
        
        // Skip external links
        if (!url.includes('microsoft.github.io/autogen')) return;
        
        // Check if title or URL contains query terms
        if (title.toLowerCase().includes(queryLower) || 
            url.toLowerCase().includes(queryLower)) {
          
          // Get some context from the surrounding text
          const parent = $element.parent();
          let snippet = parent.text().trim();
          
          // If parent text is too short, try getting context from siblings
          if (snippet.length < 50) {
            const siblings = $element.parent().siblings();
            snippet = siblings.text().trim();
          }
          
          snippet = snippet.substring(0, 200) || 'AutoGen documentation';
          
          // Avoid duplicates
          const isDuplicate = results.some(result => 
            result.url === url || result.title === title
          );
          
          if (!isDuplicate) {
            results.push({
              title,
              url,
              snippet,
              type: page.type
            });
          }
        }
      });
    } catch (error) {
      console.error(`Failed to search page ${page.url}:`, error);
    }
  }
  
  // Remove duplicates and sort by relevance
  const uniqueResults = results.filter((result, index, self) => 
    index === self.findIndex(r => r.url === result.url)
  );
  
  return uniqueResults.slice(0, limit);
}
