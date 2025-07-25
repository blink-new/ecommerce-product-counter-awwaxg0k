export interface ProductAnalysis {
  id: string
  userId: string
  websiteUrl: string
  productCount?: number
  analysisStatus: 'pending' | 'analyzing' | 'completed' | 'failed'
  screenshotUrl?: string
  analysisDetails?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface PageAnalysis {
  url: string
  productCount: number
  categories: string[]
  confidence: number
  evidence: string[]
  pageType: string
  title: string
  status: 'completed' | 'failed' | 'skipped'
  errorMessage?: string
}

export interface AnalysisResult {
  totalProductCount: number
  pagesAnalyzed: number
  pageResults: PageAnalysis[]
  sitemap: string[]
  summary: string
  status: 'completed' | 'partial' | 'failed'
  details: {
    totalProducts: number
    productsByCategory: Record<string, number>
    analysisMethod: string
    confidence: number
    pageBreakdown: Record<string, number>
  }
}

export interface CrawlProgress {
  stage: string
  currentPage: string
  pagesFound: number
  pagesAnalyzed: number
  totalProducts: number
}