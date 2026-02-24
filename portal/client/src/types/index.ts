export interface User {
  id: number
  email: string
  name: string
  role: 'admin' | 'partner' | 'distributor'
  company?: string
}

export interface Product {
  id: number
  brand: string
  name: string
  sku: string
  category: string
  description?: string
  price: number
  image_url?: string | null
  in_stock: number
  // Catalog fields (Jan 2026 price sheet)
  vendor_number?: string
  upc?: string
  unit_size?: string
  case_pack?: number
  case_cost?: number
  unit_msrp?: number
  case_weight?: string
  unit_dimensions?: string
  case_dimensions?: string
}

export interface Asset {
  id: number
  brand: string
  name: string
  type: string
  file_url: string
  thumbnail_url?: string | null
  file_size?: string | null
  dimensions?: string | null
  created_at?: string
}

export interface Distributor {
  id: number
  name: string
  region: string
  state: string
  city?: string | null
  address?: string | null
  contact_name?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
}

export interface InvoiceItem {
  product: string
  qty: number
  unit_price: number
}

export interface Invoice {
  id: number
  invoice_number: string
  partner_id?: number
  amount: number
  status: 'paid' | 'pending' | 'overdue'
  due_date: string
  issued_date: string
  items: InvoiceItem[]
  notes?: string | null
}

export interface InventoryItem {
  id: number
  product_id?: number
  product_name: string
  brand: string
  sku: string
  quantity: number
  reorder_level: number
  status: 'in_stock' | 'low_stock' | 'out_of_stock'
  last_updated?: string
}

export interface Creative {
  id: number
  title: string
  brand: string
  type: string
  campaign?: string | null
  thumbnail_url?: string | null
  file_url: string
  description?: string | null
  dimensions?: string | null
  file_size?: string | null
  created_at?: string
}

export interface StatsOverview {
  totalProducts: number
  totalAssets: number
  pendingInvoices: number
  overdueInvoices: number
  lowStock: number
  outOfStock: number
  totalRevenue: number
  distributors: number
}
