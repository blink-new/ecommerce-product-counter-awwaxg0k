import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Progress } from './ui/progress'
import { Badge } from './ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Alert, AlertDescription } from './ui/alert'
import { Separator } from './ui/separator'
import { 
  Search, 
  Download, 
  Globe, 
  Package, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Eye,
  BarChart3,
  ExternalLink,
  Loader2
} from 'lucide-react'
import { blink } from '../blink/client'
import type { ProductAnalysis, AnalysisResult, PageAnalysis, CrawlProgress } from '../types/analysis'

export default function ProductCounter() {
  const [url, setUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<ProductAnalysis[]>([])
  const [user, setUser] = useState<any>(null)
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null)

  const loadHistory = useCallback(async () => {
    try {
      const analyses = await blink.db.productAnalyses.list({
        where: { userId: user?.id },
        orderBy: { createdAt: 'desc' },
        limit: 10
      })
      setHistory(analyses)
    } catch (error) {
      console.error('Failed to load history:', error)
    }
  }, [user?.id])

  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      setUser(state.user)
      if (state.user) {
        loadHistory()
      }
    })
    return unsubscribe
  }, [loadHistory])

  const validateUrl = (url: string): string => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url
      }
      new URL(url)
      return url
    } catch {
      throw new Error('Please enter a valid website URL')
    }
  }

  const findAllPages = async (baseUrl: string): Promise<string[]> => {
    console.log('🔍 Finding all pages for:', baseUrl)
    setProgressText('Discovering all website pages...')
    
    try {
      const domain = new URL(baseUrl).hostname
      const allPages = new Set<string>([baseUrl])
      
      // Step 1: Scrape homepage for internal links
      console.log('📄 Scraping homepage for links...')
      const { links, markdown } = await blink.data.scrape(baseUrl)
      
      if (links && links.length > 0) {
        console.log(`Found ${links.length} links on homepage`)
        
        // Filter for internal links that might contain products
        links.forEach(link => {
          try {
            const linkUrl = new URL(link, baseUrl)
            if (linkUrl.hostname === domain) {
              const path = linkUrl.pathname.toLowerCase()
              
              // Add all internal pages, we'll filter later
              if (
                path.includes('/product') ||
                path.includes('/item') ||
                path.includes('/shop') ||
                path.includes('/store') ||
                path.includes('/category') ||
                path.includes('/collection') ||
                path.includes('/catalog') ||
                path.includes('/p/') ||
                path.includes('/products/') ||
                path.includes('/items/') ||
                path.match(/\/\d+/) || // Product IDs
                path.includes('page=') || // Pagination
                path.length > 3 // Any substantial path
              ) {
                allPages.add(linkUrl.href)
              }
            }
          } catch (e) {
            // Skip invalid URLs
          }
        })
      }
      
      // Step 2: Try to find sitemap for comprehensive discovery
      try {
        console.log('🗺️ Checking for sitemap...')
        const sitemapUrls = [
          `${baseUrl}/sitemap.xml`,
          `${baseUrl}/sitemap_index.xml`,
          `${baseUrl}/product-sitemap.xml`
        ]
        
        for (const sitemapUrl of sitemapUrls) {
          try {
            const response = await blink.data.fetch({
              url: sitemapUrl,
              method: 'GET'
            })
            
            if (response.status === 200 && response.body) {
              console.log(`✅ Found sitemap: ${sitemapUrl}`)
              const sitemapText = response.body
              
              // Extract URLs from sitemap
              const urlMatches = sitemapText.match(/<loc>(.*?)<\/loc>/g)
              if (urlMatches) {
                urlMatches.forEach(match => {
                  const url = match.replace(/<\/?loc>/g, '').trim()
                  try {
                    const urlObj = new URL(url)
                    if (urlObj.hostname === domain) {
                      allPages.add(url)
                    }
                  } catch (e) {
                    // Skip invalid URLs
                  }
                })
              }
              break // Found a working sitemap
            }
          } catch (e) {
            // Try next sitemap URL
          }
        }
      } catch (e) {
        console.log('No sitemap found, using link discovery only')
      }
      
      const pages = Array.from(allPages)
      console.log(`🎯 Discovered ${pages.length} total pages`)
      
      // Limit to reasonable number for performance (prioritize product-looking URLs)
      const productPages = pages.filter(url => {
        const path = url.toLowerCase()
        return path.includes('/product') || path.includes('/item') || path.includes('/p/')
      })
      
      const categoryPages = pages.filter(url => {
        const path = url.toLowerCase()
        return path.includes('/category') || path.includes('/collection') || path.includes('/shop')
      })
      
      const otherPages = pages.filter(url => 
        !productPages.includes(url) && !categoryPages.includes(url)
      )
      
      // Prioritize product pages, then category pages, then others
      const prioritizedPages = [
        ...productPages.slice(0, 15),
        ...categoryPages.slice(0, 10),
        ...otherPages.slice(0, 5)
      ].slice(0, 30) // Max 30 pages total
      
      console.log(`📊 Will analyze ${prioritizedPages.length} prioritized pages:`)
      console.log(`- Product pages: ${productPages.length}`)
      console.log(`- Category pages: ${categoryPages.length}`)
      console.log(`- Other pages: ${otherPages.length}`)
      
      return prioritizedPages
      
    } catch (error) {
      console.error('Error discovering pages:', error)
      return [baseUrl] // Fallback to just homepage
    }
  }

  const analyzePageForProducts = async (pageUrl: string, pageIndex: number, totalPages: number): Promise<PageAnalysis> => {
    console.log(`🔍 Analyzing page ${pageIndex + 1}/${totalPages}: ${pageUrl}`)
    
    try {
      // Update progress
      setCrawlProgress(prev => ({
        ...prev!,
        currentPage: pageUrl,
        pagesAnalyzed: pageIndex
      }))

      // Scrape the page content
      console.log(`📄 Scraping content from: ${pageUrl}`)
      const { markdown, metadata, links } = await blink.data.scrape(pageUrl)
      
      if (!markdown || markdown.length < 100) {
        console.log(`❌ Page ${pageIndex + 1}: No content found`)
        return {
          url: pageUrl,
          productCount: 0,
          categories: [],
          confidence: 0,
          evidence: ['No content could be scraped from this page'],
          pageType: 'unknown',
          title: metadata?.title || 'Unknown',
          status: 'failed',
          errorMessage: 'Could not scrape page content'
        }
      }

      console.log(`📝 Scraped ${markdown.length} characters from page ${pageIndex + 1}`)

      // Create a very specific prompt for product counting
      const analysisPrompt = `
TASK: Count the exact number of products displayed on this ecommerce page.

PAGE URL: ${pageUrl}
PAGE TITLE: ${metadata?.title || 'Unknown'}

CONTENT TO ANALYZE:
${markdown.slice(0, 20000)}

INSTRUCTIONS:
1. Count ONLY actual products that are for sale on this specific page
2. Look for clear product indicators:
   - Product titles/names
   - Prices ($ amounts)
   - "Add to Cart" or "Buy Now" buttons
   - Product images with descriptions
   - SKU numbers or product codes

3. Determine page type:
   - "product": Single product detail page (usually count = 1)
   - "category": Category/listing page with multiple products
   - "homepage": Main page (may have featured products)
   - "search": Search results page
   - "other": Non-product page (count = 0)

4. For listing/category pages: Count each distinct product shown
5. Don't count:
   - Navigation menu items
   - Related/recommended products in sidebars (unless main content)
   - Advertisements
   - Blog posts or articles

6. Look for pagination indicators like "Page 1 of 5" or "Showing 1-20 of 100 products"

Respond with JSON only:
{
  "productCount": <exact number of products on this page>,
  "pageType": "<product|category|homepage|search|other>",
  "categories": ["<category1>", "<category2>"],
  "confidence": <0-100 confidence score>,
  "evidence": ["<specific evidence found>"],
  "reasoning": "<brief explanation of your count>",
  "hasPagination": <true/false if pagination detected>,
  "totalProductsIfPaginated": <estimated total if pagination found>
}
`

      console.log(`🤖 Sending page ${pageIndex + 1} to AI for analysis...`)
      const { object: analysis } = await blink.ai.generateObject({
        prompt: analysisPrompt,
        schema: {
          type: 'object',
          properties: {
            productCount: { type: 'number' },
            pageType: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
            evidence: { type: 'array', items: { type: 'string' } },
            reasoning: { type: 'string' },
            hasPagination: { type: 'boolean' },
            totalProductsIfPaginated: { type: 'number' }
          },
          required: ['productCount', 'pageType', 'categories', 'confidence', 'evidence', 'reasoning']
        }
      })

      console.log(`✅ Page ${pageIndex + 1} analysis complete:`, {
        url: pageUrl,
        count: analysis.productCount,
        type: analysis.pageType,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning
      })

      return {
        url: pageUrl,
        productCount: analysis.productCount || 0,
        categories: analysis.categories || [],
        confidence: analysis.confidence || 0,
        evidence: analysis.evidence || [],
        pageType: analysis.pageType || 'unknown',
        title: metadata?.title || 'Unknown',
        status: 'completed'
      }

    } catch (error) {
      console.error(`❌ Error analyzing page ${pageIndex + 1}:`, pageUrl, error)
      return {
        url: pageUrl,
        productCount: 0,
        categories: [],
        confidence: 0,
        evidence: [`Analysis failed: ${error.message}`],
        pageType: 'unknown',
        title: 'Unknown',
        status: 'failed',
        errorMessage: error.message
      }
    }
  }

  const analyzeWebsite = async () => {
    if (!url.trim()) {
      setError('Please enter a website URL')
      return
    }

    try {
      setError('')
      setResult(null)
      setIsAnalyzing(true)
      setProgress(0)
      setCrawlProgress(null)

      const validatedUrl = validateUrl(url.trim())
      console.log('🚀 Starting comprehensive website analysis for:', validatedUrl)

      // Save initial analysis record
      const analysisId = `analysis_${Date.now()}`
      await blink.db.productAnalyses.create({
        id: analysisId,
        userId: user?.id || 'anonymous',
        websiteUrl: validatedUrl,
        analysisStatus: 'analyzing',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      // Stage 1: Discover all pages (20% progress)
      setProgress(10)
      setProgressText('Discovering all website pages...')
      const discoveredPages = await findAllPages(validatedUrl)
      setProgress(20)
      
      console.log(`📊 Found ${discoveredPages.length} pages to analyze`)
      
      setCrawlProgress({
        stage: 'Analyzing pages for products',
        currentPage: '',
        pagesFound: discoveredPages.length,
        pagesAnalyzed: 0,
        totalProducts: 0
      })

      // Stage 2: Analyze each page individually (70% progress)
      const pageResults: PageAnalysis[] = []
      let totalProducts = 0
      const allCategories = new Set<string>()
      
      for (let i = 0; i < discoveredPages.length; i++) {
        const pageUrl = discoveredPages[i]
        setProgressText(`Analyzing page ${i + 1} of ${discoveredPages.length}...`)
        setProgress(20 + ((i + 1) / discoveredPages.length) * 70)

        const pageAnalysis = await analyzePageForProducts(pageUrl, i, discoveredPages.length)
        pageResults.push(pageAnalysis)
        
        if (pageAnalysis.status === 'completed') {
          totalProducts += pageAnalysis.productCount
          pageAnalysis.categories.forEach(cat => allCategories.add(cat))
          
          // Update crawl progress
          setCrawlProgress(prev => ({
            ...prev!,
            pagesAnalyzed: i + 1,
            totalProducts
          }))
          
          console.log(`📈 Running total: ${totalProducts} products found across ${i + 1} pages`)
        }

        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      // Stage 3: Compile final results (10% progress)
      setProgress(90)
      setProgressText('Compiling final results...')

      const categoryBreakdown: Record<string, number> = {}
      const pageBreakdown: Record<string, number> = {}
      
      pageResults.forEach(page => {
        if (page.status === 'completed') {
          page.categories.forEach(category => {
            categoryBreakdown[category] = (categoryBreakdown[category] || 0) + page.productCount
          })
          pageBreakdown[page.url] = page.productCount
        }
      })

      const successfulPages = pageResults.filter(p => p.status === 'completed').length
      const avgConfidence = successfulPages > 0 
        ? Math.round(pageResults.filter(p => p.status === 'completed').reduce((acc, p) => acc + p.confidence, 0) / successfulPages)
        : 0

      const finalResult: AnalysisResult = {
        totalProductCount: totalProducts,
        pagesAnalyzed: successfulPages,
        pageResults,
        sitemap: discoveredPages,
        summary: `Found ${totalProducts} products across ${successfulPages} pages. Analyzed ${discoveredPages.length} pages total with ${avgConfidence}% average confidence.`,
        status: successfulPages > 0 ? 'completed' : 'failed',
        details: {
          totalProducts,
          productsByCategory: categoryBreakdown,
          analysisMethod: 'Multi-page crawl with AI analysis per page',
          confidence: avgConfidence,
          pageBreakdown
        }
      }

      // Update database record
      await blink.db.productAnalyses.update(analysisId, {
        productCount: totalProducts,
        analysisStatus: 'completed',
        analysisDetails: JSON.stringify(finalResult),
        updatedAt: new Date().toISOString()
      })

      setResult(finalResult)
      setProgress(100)
      setProgressText('Analysis complete!')
      
      setCrawlProgress({
        stage: 'Complete',
        currentPage: '',
        pagesFound: discoveredPages.length,
        pagesAnalyzed: pageResults.length,
        totalProducts
      })

      console.log('🎉 Analysis complete! Final result:', finalResult)

      // Reload history
      await loadHistory()

    } catch (error) {
      console.error('❌ Analysis failed:', error)
      setError(error.message || 'Analysis failed. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const exportResults = () => {
    if (!result) return

    const csvData = [
      ['Page URL', 'Page Title', 'Product Count', 'Page Type', 'Categories', 'Confidence', 'Status', 'Evidence'],
      ...result.pageResults.map(page => [
        page.url,
        page.title,
        page.productCount.toString(),
        page.pageType,
        page.categories.join('; '),
        page.confidence.toString(),
        page.status,
        page.evidence.join('; ')
      ])
    ]

    const csvContent = csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `product-analysis-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-blue-600">Product Counter</CardTitle>
            <CardDescription>Please sign in to analyze ecommerce websites</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => blink.auth.login()} className="w-full">
              Sign In to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900">Ecommerce Product Counter</h1>
          <p className="text-lg text-gray-600">Analyze any ecommerce website and count products across all pages</p>
        </div>

        {/* Main Analysis Card */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Website Analysis
            </CardTitle>
            <CardDescription>
              Enter any ecommerce website URL to crawl all pages and count total products
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="https://example-store.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isAnalyzing}
                className="flex-1"
              />
              <Button 
                onClick={analyzeWebsite} 
                disabled={isAnalyzing || !url.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analyze Website
                  </>
                )}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isAnalyzing && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{progressText}</span>
                  <span className="text-blue-600 font-medium">{progress}%</span>
                </div>
                <Progress value={progress} className="w-full" />
                
                {crawlProgress && (
                  <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-blue-900">{crawlProgress.stage}</span>
                      <Badge variant="secondary">
                        {crawlProgress.pagesAnalyzed}/{crawlProgress.pagesFound} pages
                      </Badge>
                    </div>
                    {crawlProgress.currentPage && (
                      <div className="text-sm text-blue-700">
                        <span className="font-medium">Current page:</span>
                        <div className="truncate mt-1 bg-white p-2 rounded border">
                          {crawlProgress.currentPage}
                        </div>
                      </div>
                    )}
                    <div className="text-lg font-bold text-blue-900">
                      Products found so far: <span className="text-2xl text-blue-600">{crawlProgress.totalProducts}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Products</p>
                      <p className="text-3xl font-bold text-blue-600">{result.totalProductCount}</p>
                    </div>
                    <Package className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Pages Analyzed</p>
                      <p className="text-3xl font-bold text-green-600">{result.pagesAnalyzed}</p>
                    </div>
                    <Eye className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Avg Confidence</p>
                      <p className="text-3xl font-bold text-amber-600">{result.details.confidence}%</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-amber-600" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Categories</p>
                      <p className="text-3xl font-bold text-purple-600">
                        {Object.keys(result.details.productsByCategory).length}
                      </p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Results */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Analysis Results</CardTitle>
                  <Button onClick={exportResults} variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="pages" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="pages">Page Breakdown</TabsTrigger>
                    <TabsTrigger value="categories">Categories</TabsTrigger>
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                  </TabsList>

                  <TabsContent value="pages" className="space-y-4">
                    <div className="space-y-3">
                      {result.pageResults.map((page, index) => (
                        <div key={index} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium truncate">{page.title}</h4>
                                <Badge variant={page.status === 'completed' ? 'default' : 'destructive'}>
                                  {page.status === 'completed' ? (
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                  ) : (
                                    <XCircle className="h-3 w-3 mr-1" />
                                  )}
                                  {page.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-gray-600">
                                <span className="truncate">{page.url}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-4 w-4 p-0"
                                  onClick={() => window.open(page.url, '_blank')}
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-2xl font-bold text-blue-600">{page.productCount}</p>
                              <p className="text-xs text-gray-500">{page.confidence}% confidence</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {page.pageType}
                            </Badge>
                            {page.categories.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {page.categories.slice(0, 3).map((category, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {category}
                                  </Badge>
                                ))}
                                {page.categories.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{page.categories.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {page.evidence.length > 0 && (
                            <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                              <strong>Evidence:</strong> {page.evidence.slice(0, 2).join('; ')}
                              {page.evidence.length > 2 && '...'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="categories" className="space-y-4">
                    {Object.keys(result.details.productsByCategory).length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(result.details.productsByCategory).map(([category, count]) => (
                          <div key={category} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">{category}</h4>
                              <span className="text-2xl font-bold text-blue-600">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        No product categories identified
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="summary" className="space-y-4">
                    <div className="prose max-w-none">
                      <p className="text-gray-700">{result.summary}</p>
                      
                      <Separator className="my-4" />
                      
                      <div className="space-y-2">
                        <h4 className="font-medium">Analysis Details:</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• Method: {result.details.analysisMethod}</li>
                          <li>• Pages discovered: {result.sitemap.length}</li>
                          <li>• Pages successfully analyzed: {result.pagesAnalyzed}</li>
                          <li>• Overall confidence: {result.details.confidence}%</li>
                          <li>• Status: {result.status}</li>
                        </ul>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Analysis History */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Analyses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.slice(0, 5).map((analysis) => (
                  <div key={analysis.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{analysis.websiteUrl}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(analysis.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-lg font-bold text-blue-600">
                        {analysis.productCount || 0}
                      </p>
                      <Badge variant={
                        analysis.analysisStatus === 'completed' ? 'default' :
                        analysis.analysisStatus === 'failed' ? 'destructive' : 'secondary'
                      }>
                        {analysis.analysisStatus}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}