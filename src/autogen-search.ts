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
 * Search AutoGen documentation using their native search functionality
 */
export async function searchAutoGenDocs(query: string, limit: number = 10, version: string = 'stable'): Promise<SearchResult[]> {
  try {
    const baseUrl = getVersionUrl(version);
    // Use AutoGen's native search endpoint
    const searchUrl = `${baseUrl}/search.html?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Search request failed: ${response.statusText}`);
    }

    const html = await response.text();
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

    // If native search returns no results, try alternative parsing
    if (results.length === 0) {
      // Look for any links in the search results area that might be search results
      $('main a[href], .content a[href], article a[href]').each((index, element) => {
        if (results.length >= limit) return false;
        
        const $element = $(element);
        const title = $element.text().trim();
        let url = $element.attr('href');
        
        if (!url || !title || title.length < 3) return;
        
        // Make relative URLs absolute
        if (url.startsWith('/')) {
          url = baseUrl + url;
        } else if (!url.startsWith('http')) {
          url = `${baseUrl}/${url}`;
        }
        
        // Only include AutoGen documentation links that seem relevant to the query
        if (url.includes('microsoft.github.io/autogen') && 
            (title.toLowerCase().includes(query.toLowerCase()) || 
             url.toLowerCase().includes(query.toLowerCase()))) {
          
          results.push({
            title,
            url,
            snippet: 'AutoGen documentation',
            type: 'Documentation'
          });
        }
      });
    }

    // If still no results, fallback to manual search
    if (results.length === 0) {
      return await fallbackSearch(query, limit, version);
    }

    return results.slice(0, limit);
  } catch (error) {
    console.error('Native search failed, trying fallback:', error);
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
  
  // Key pages to search through, including API reference
  const pagesToSearch = [
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
      
      // Search in page content first
      const pageTitle = $('title').text() || $('h1').first().text();
      const pageContent = $('main, .content, article').text().toLowerCase();
      
      if (pageContent.includes(queryLower)) {
        // Find relevant sections or headings
        $('h1, h2, h3, h4').each((index, element) => {
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
          url = baseUrl + url;
        } else if (!url.startsWith('http')) {
          url = `${baseUrl}/${url}`;
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
