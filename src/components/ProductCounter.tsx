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
      console.log('🚀 Starting website analysis for:', validatedUrl)

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

      // Stage 1: Take screenshot and scrape content (30%)
      setProgress(10)
      setProgressText('Taking website screenshot...')
      
      console.log('📸 Taking screenshot...')
      const screenshotUrl = await blink.data.screenshot(validatedUrl, {
        fullPage: true,
        width: 1400,
        height: 1050
      })
      console.log('✅ Screenshot captured:', screenshotUrl)

      setProgress(20)
      setProgressText('Scraping website content...')
      
      console.log('📄 Scraping website content...')
      const { markdown, metadata, links } = await blink.data.scrape(validatedUrl)
      console.log(`✅ Scraped ${markdown?.length || 0} characters of content`)

      if (!markdown || markdown.length < 100) {
        throw new Error('Could not scrape website content. The site may be protected or inaccessible.')
      }

      // Stage 2: Analyze content for products (40%)
      setProgress(30)
      setProgressText('Analyzing content for products...')

      console.log('🤖 Analyzing content with AI...')
      
      // Create a comprehensive analysis prompt
      const analysisPrompt = `You are an expert ecommerce analyst. Analyze this website to count ALL products available for purchase.

WEBSITE: ${validatedUrl}
TITLE: ${metadata?.title || 'Unknown'}

CONTENT TO ANALYZE:
${markdown.slice(0, 25000)}

TASK: Count the TOTAL number of products on this entire website.

INSTRUCTIONS:
1. Look for clear product indicators:
   - Product names/titles
   - Prices ($ amounts, currency symbols)
   - "Add to Cart", "Buy Now", "Shop Now" buttons
   - Product images with descriptions
   - SKU numbers, product codes
   - Product listings, grids, or catalogs

2. Count ALL products you can identify:
   - Individual product pages (count = 1 per page)
   - Product listing pages (count each distinct product)
   - Category pages with multiple products
   - Featured products on homepage
   - Product grids or catalogs

3. Look for pagination indicators:
   - "Page 1 of X" or "Showing 1-20 of 100 products"
   - "Next page", "Previous page" buttons
   - Numbered page links
   - "Load more" buttons

4. Identify product categories:
   - Clothing, Electronics, Books, etc.
   - Any category names mentioned

5. Don't count:
   - Navigation menu items
   - Blog posts or articles
   - About/Contact pages
   - Advertisements (unless they're products for sale)

6. If you see pagination like "Showing 1-20 of 500 products", the total is 500, not 20.

Provide a detailed analysis with your reasoning.

Respond with JSON only:
{
  "totalProducts": <total number of products on entire website>,
  "productsOnThisPage": <products visible on this specific page>,
  "categories": ["category1", "category2"],
  "confidence": <0-100 confidence score>,
  "evidence": ["specific evidence found"],
  "reasoning": "detailed explanation of your count",
  "hasPagination": <true/false>,
  "paginationInfo": "description of pagination if found",
  "estimatedTotalFromPagination": <number if pagination indicates total>
}`

      const { object: analysis } = await blink.ai.generateObject({
        prompt: analysisPrompt,
        schema: {
          type: 'object',
          properties: {
            totalProducts: { type: 'number' },
            productsOnThisPage: { type: 'number' },
            categories: { type: 'array', items: { type: 'string' } },
            confidence: { type: 'number' },
            evidence: { type: 'array', items: { type: 'string' } },
            reasoning: { type: 'string' },
            hasPagination: { type: 'boolean' },
            paginationInfo: { type: 'string' },
            estimatedTotalFromPagination: { type: 'number' }
          },
          required: ['totalProducts', 'productsOnThisPage', 'categories', 'confidence', 'evidence', 'reasoning']
        }
      })

      console.log('✅ AI analysis complete:', analysis)

      // Stage 3: Visual analysis of screenshot (30%)
      setProgress(60)
      setProgressText('Analyzing screenshot for visual product detection...')

      console.log('👁️ Analyzing screenshot with AI...')
      
      const visualPrompt = `Analyze this ecommerce website screenshot to count products visually.

Look for:
- Product grids or listings
- Product cards with images
- Price tags and "Add to Cart" buttons
- Product thumbnails
- Shopping cart icons
- Product galleries or catalogs

Count all visible products in the image. If you see a product grid with multiple items, count each one.

Respond with JSON only:
{
  "visualProductCount": <number of products visible in screenshot>,
  "visualEvidence": ["what you see in the image"],
  "layoutType": "single product page | product listing | homepage | category page",
  "confidence": <0-100 confidence score>
}`

      const { object: visualAnalysis } = await blink.ai.generateObject({
        prompt: visualPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: visualPrompt },
              { type: "image", image: screenshotUrl }
            ]
          }
        ],
        schema: {
          type: 'object',
          properties: {
            visualProductCount: { type: 'number' },
            visualEvidence: { type: 'array', items: { type: 'string' } },
            layoutType: { type: 'string' },
            confidence: { type: 'number' }
          },
          required: ['visualProductCount', 'visualEvidence', 'layoutType', 'confidence']
        }
      })

      console.log('✅ Visual analysis complete:', visualAnalysis)

      // Stage 4: Combine analyses and determine final count
      setProgress(90)
      setProgressText('Combining analyses for final count...')

      // Use the higher count between text analysis and visual analysis
      // If pagination is detected, use that total
      let finalProductCount = analysis.totalProducts || 0
      
      if (analysis.estimatedTotalFromPagination && analysis.estimatedTotalFromPagination > finalProductCount) {
        finalProductCount = analysis.estimatedTotalFromPagination
      }
      
      // If visual analysis found more products on this page, adjust accordingly
      if (visualAnalysis.visualProductCount > analysis.productsOnThisPage) {
        const difference = visualAnalysis.visualProductCount - analysis.productsOnThisPage
        finalProductCount += difference
      }

      const combinedEvidence = [
        ...analysis.evidence,
        ...visualAnalysis.visualEvidence
      ]

      const avgConfidence = Math.round((analysis.confidence + visualAnalysis.confidence) / 2)

      // Create page analysis result
      const pageAnalysis: PageAnalysis = {
        url: validatedUrl,
        productCount: finalProductCount,
        categories: analysis.categories || [],
        confidence: avgConfidence,
        evidence: combinedEvidence,
        pageType: visualAnalysis.layoutType || 'unknown',
        title: metadata?.title || 'Unknown',
        status: 'completed'
      }

      const finalResult: AnalysisResult = {
        totalProductCount: finalProductCount,
        pagesAnalyzed: 1,
        pageResults: [pageAnalysis],
        sitemap: [validatedUrl],
        summary: `Found ${finalProductCount} products. ${analysis.reasoning} Visual analysis: ${visualAnalysis.visualEvidence.join(', ')}.`,
        status: 'completed',
        details: {
          totalProducts: finalProductCount,
          productsByCategory: analysis.categories.reduce((acc, cat) => {
            acc[cat] = finalProductCount // Simplified - assign all products to each category
            return acc
          }, {} as Record<string, number>),
          analysisMethod: 'Combined text and visual AI analysis',
          confidence: avgConfidence,
          pageBreakdown: { [validatedUrl]: finalProductCount }
        }
      }

      // Update database record
      await blink.db.productAnalyses.update(analysisId, {
        productCount: finalProductCount,
        analysisStatus: 'completed',
        analysisDetails: JSON.stringify(finalResult),
        updatedAt: new Date().toISOString()
      })

      setResult(finalResult)
      setProgress(100)
      setProgressText('Analysis complete!')

      console.log('🎉 Analysis complete! Final result:', finalResult)

      // Reload history
      await loadHistory()

    } catch (error) {
      console.error('❌ Analysis failed:', error)
      setError(error.message || 'Analysis failed. Please try again.')
      
      // Update database record as failed
      try {
        const analysisId = `analysis_${Date.now()}`
        await blink.db.productAnalyses.create({
          id: analysisId,
          userId: user?.id || 'anonymous',
          websiteUrl: url,
          analysisStatus: 'failed',
          productCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        })
      } catch (dbError) {
        console.error('Failed to save error to database:', dbError)
      }
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
          <p className="text-lg text-gray-600">Analyze any ecommerce website and count products with AI-powered analysis</p>
        </div>

        {/* Main Analysis Card */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              Website Analysis
            </CardTitle>
            <CardDescription>
              Enter any ecommerce website URL to analyze and count all products
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
                
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-700">
                    <p className="font-medium">Analysis in progress...</p>
                    <p className="mt-1">Using advanced AI to analyze both website content and visual layout for accurate product counting.</p>
                  </div>
                </div>
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
                      <p className="text-sm font-medium text-gray-600">Confidence</p>
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
                <Tabs defaultValue="summary" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="summary">Summary</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="categories">Categories</TabsTrigger>
                  </TabsList>

                  <TabsContent value="summary" className="space-y-4">
                    <div className="prose max-w-none">
                      <p className="text-gray-700">{result.summary}</p>
                      
                      <Separator className="my-4" />
                      
                      <div className="space-y-2">
                        <h4 className="font-medium">Analysis Details:</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• Method: {result.details.analysisMethod}</li>
                          <li>• Pages analyzed: {result.pagesAnalyzed}</li>
                          <li>• Overall confidence: {result.details.confidence}%</li>
                          <li>• Status: {result.status}</li>
                        </ul>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="details" className="space-y-4">
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