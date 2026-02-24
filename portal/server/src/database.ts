import { DatabaseSync } from 'node:sqlite'
import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '../../data/portal.db')
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)

function needsMigration(): boolean {
  try { db.prepare('SELECT vendor_number FROM products LIMIT 1').get(); return false }
  catch { return true }
}

function init() {
  if (needsMigration()) {
    console.log('Migrating schema...')
    db.exec(`
      DROP TABLE IF EXISTS inventory;
      DROP TABLE IF EXISTS creatives;
      DROP TABLE IF EXISTS retailer_applications;
      DROP TABLE IF EXISTS invoices;
      DROP TABLE IF EXISTS assets;
      DROP TABLE IF EXISTS distributors;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS users;
    `)
  }
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'partner', company TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, brand TEXT NOT NULL, category TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL, description TEXT,
      price REAL NOT NULL, image_url TEXT, in_stock INTEGER DEFAULT 1,
      vendor_number TEXT, upc TEXT, unit_size TEXT,
      case_pack INTEGER, case_cost REAL, unit_msrp REAL,
      case_weight TEXT, unit_dimensions TEXT, case_dimensions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, brand TEXT NOT NULL, type TEXT NOT NULL,
      file_url TEXT NOT NULL, thumbnail_url TEXT, file_size TEXT, dimensions TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS distributors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, region TEXT NOT NULL, state TEXT NOT NULL,
      city TEXT, address TEXT, phone TEXT, email TEXT, website TEXT, contact_name TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL, partner_id INTEGER REFERENCES users(id),
      amount REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      due_date TEXT NOT NULL, issued_date TEXT NOT NULL, items TEXT NOT NULL, notes TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      product_name TEXT NOT NULL, brand TEXT NOT NULL, sku TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'in_stock',
      last_updated TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS retailer_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      business_name TEXT NOT NULL, business_type TEXT,
      contact_name TEXT NOT NULL, email TEXT NOT NULL,
      phone TEXT, address TEXT, city TEXT, state TEXT, zip TEXT,
      website TEXT, annual_revenue TEXT, how_heard TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      submitted_at TEXT DEFAULT (datetime('now')), reviewed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS creatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, brand TEXT NOT NULL, type TEXT NOT NULL,
      campaign TEXT, thumbnail_url TEXT, file_url TEXT,
      description TEXT, dimensions TEXT, file_size TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)
}

// ─── SEED ───────────────────────────────────────────────────────────────────

function seed() {
  const { c } = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }
  if (c > 0) return

  // Users
  const hash = (p: string) => bcrypt.hashSync(p, 10)
  const addUser = db.prepare('INSERT INTO users (name, email, password_hash, role, company) VALUES (?, ?, ?, ?, ?)')
  addUser.run('Admin User',       'admin@sliquid.com',      hash('admin123'),   'admin',       'Sliquid')
  addUser.run('Demo Partner',     'partner@demo.com',       hash('partner123'), 'partner',     'Demo Retail Co.')
  addUser.run('Demo Distributor', 'distributor@demo.com',   hash('dist123'),    'distributor', 'Demo Distribution LLC')

  // Products
  // Columns: name, brand, category, sku, description, price, image_url, in_stock,
  //          vendor_number, upc, unit_size, case_pack, case_cost, unit_msrp,
  //          case_weight, unit_dimensions, case_dimensions
  type P = [string,string,string,string,string,number,string|null,number,
            string,string,string,number,number,number,string,string,string]

  const addProduct = db.prepare(`INSERT INTO products
    (name,brand,category,sku,description,price,image_url,in_stock,
     vendor_number,upc,unit_size,case_pack,case_cost,unit_msrp,
     case_weight,unit_dimensions,case_dimensions)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)

  // Shorthand dims used repeatedly
  const d42  = ['4.25 lbs', '1.75" Dia x 4.5"',  '8" x 6" x 5"'   ] as const
  const d85  = ['4.5 lbs',  '2.25" Dia x 5.5"',  '5" x 7" x 6"'   ] as const
  const d20  = ['3 lbs',    '1.25" Dia x 4.5"',  '5.5" x 5.5" x 5"'] as const
  const dpil = ['2.5 lbs',  '3" x 3" x .15"',    '10" x 5" x 4"'  ] as const
  const d85s = ['4.5 lbs',  '1.75" Dia x 7.75"', '5.75" x 4" x 8"'] as const // splash/soothe
  const d85m = ['3.75 lbs', '1.75" Dia x 7.5"',  '5.75" x 4" x 8"'] as const // massage
  const d85r = ['4.5 lbs',  '1.75" Dia x 7.5"',  '5.75" x 4" x 8"'] as const // ride 8.5oz
  const d42r = ['4.25 lbs', '1.5" Dia x 5.75"',  '6.5" x 5" x 6"' ] as const // ride 4.2oz
  const d20r = ['3 lbs',    '1.25" Dia x 4.5"',  '5.5" x 5.5" x 5"'] as const
  const d1oz = ['2.5 lbs',  '1.25" Dia x 3.75"', '6" x 4" x 4"'   ] as const
  const d2l  = ['2.2 lbs',  '1.25" Dia x 3.75"', '6" x 4" x 4"'   ] as const // rise gel

  // Descriptions (reusable)
  const DESC = {
    h2o:       'pH-balanced water-based formula. Glycerin-free, paraben-free, vegan. Compatible with all toy materials.',
    h2oMl:     'pH-balanced water-based formula. Multilingual packaging for international markets.',
    sassy:     'Thick gel-consistency water-based formula. Extra cushion ideal for anal play.',
    sassyMl:   'Thick gel-consistency water-based formula. Multilingual packaging for international markets.',
    sea:       'Water-based formula enhanced with carrageenan for a rich, natural feel. Ideal for sensitive skin.',
    seaMl:     'Carrageenan-enhanced water-based formula. Multilingual packaging for international markets.',
    tsunami:   'Ultra-thick water-based gel formula for maximum cushion during intimate play.',
    silk:      'Water and silicone hybrid blend for long-lasting, silky performance.',
    silkMl:    'Water and silicone hybrid blend. Multilingual packaging for international markets.',
    sizzle:    'Warming water-based lubricant with a gentle, pleasant heating sensation.',
    satin:     'Silicone-enhanced water-based hybrid with an ultra-smooth, extended-wear finish.',
    satinMl:   'Silicone-enhanced water-based hybrid. Multilingual packaging for international markets.',
    silver:    '100% pure silicone lubricant. Waterproof, hypoallergenic, long-lasting. Not for use with silicone toys.',
    booty:     'Stimulating lubricant with a proprietary formula for enhanced anal sensation.',
    studio:    'Premium silicone formula in a sleek studio pump bottle. Elevated design, same Silver formula.',
    sparkle:   'Pride edition water-based lubricant. Same H2O formula with festive limited-edition packaging.',
    soul:      'Multi-use intimate moisturizer. Silky, long-lasting hydration for sensitive tissue.',
    pillow:    'Single-use pillow packet. Portable and convenient for travel and point-of-sale sampling.',
    pilSilv:   'Silicone lubricant single-use pillow packet. Portable and convenient for travel and sampling.',
    pilSilk:   'Hybrid lubricant single-use pillow packet. Portable and convenient for travel and sampling.',
    pilSatin:  'Silicone-enhanced hybrid single-use pillow packet. Portable and convenient.',
    orgNat:    'USDA certified organic water-based formula with aloe vera and plant cellulose. Vegan.',
    orgNatMl:  'USDA certified organic water-based formula. Multilingual packaging for international markets.',
    orgSens:   'Organic water-based formula with light stimulating properties from organic botanicals.',
    orgSensMl: 'Organic stimulating water-based formula. Multilingual packaging for international markets.',
    orgSilk:   'Organic water and silicone hybrid with USDA certified organic botanicals.',
    orgSilkMl: 'Organic hybrid formula. Multilingual packaging for international markets.',
    orgGel:    'Organic gel-consistency water-based formula with USDA certified organic ingredients.',
    orgGelMl:  'Organic gel-consistency formula. Multilingual packaging for international markets.',
    orgOce:    'Organic formula enriched with certified organic seaweed and ocean botanicals.',
    orgOGel:   'Organic arousal gel with organic peppermint oil for gentle stimulation and enhanced sensitivity.',
    orgOGelMl: 'Organic arousal gel. Multilingual packaging for international markets.',
    splash:    'pH-balanced feminine wash for daily external intimate use. Gentle, dermatologist tested.',
    massMin:   'Aromatherapy intimate massage oil with Mint & Cedar. Moisturizing and sensual.',
    massCit:   'Aromatherapy intimate massage oil with Citrus Neroli. Brightening and invigorating.',
    massUns:   'Fragrance-free intimate massage oil. Pure, moisturizing formula for sensitive skin.',
    soakCh:    'Cherry Blossom bath soak for intimate wellness. Soothing and relaxing formula.',
    soakCo:    'Coconut Papaya bath soak for intimate wellness. Tropical and nourishing formula.',
    sootheMB:  'Mandarin Bergamot soothing topical gel for feminine comfort and moisture restoration.',
    sootheSC:  'Sweet Coconut soothing topical gel for feminine comfort and moisture restoration.',
    rideWB:    "RIDE's body-safe water-based formula. Clean, glycerin-free, compatible with all toy materials.",
    rideSil:   "RIDE's premium 100% silicone formula. Waterproof, ultra-long-lasting superior glide.",
    rideHyb:   "RIDE's hybrid formula combining water-based and silicone for enhanced performance.",
    rideBooty: "RIDE's stimulating anal lubricant with a proprietary enhanced sensation formula.",
    roccoWB:   "Ride Rocco signature water-based lube. Body-safe, clean formula from Rocco Siffredi's collection.",
    roccoSil:  'Ride Rocco premium silicone lube. Waterproof and long-lasting formula.',
    roccoHyb:  'Ride Rocco hemp seed oil hybrid. Water and botanical oil blend for natural glide.',
    rise:      "RIDE's intimate arousal gel. Stimulating formula to increase sensitivity and enhance pleasure.",
    tLube:     'Formulated for testosterone-treated tissue. pH-balanced water-based lubricant.',
    tWash:     'External intimate wash designed for testosterone users. pH-balanced and gentle.',
    shine85:   'USDA organic certified toy cleaner. Antibacterial, body-safe formula for all toy materials.',
    shine2:    'USDA organic certified toy cleaner in a travel-size bottle. Antibacterial and body-safe.',
    swirlDesc: (flavor: string) => `${flavor} flavored water-based lubricant. Glycerin-free and great for oral play.`,
  }

  const SLQ  = 'Sliquid'
  const RIDE = 'RIDE'
  const ROCC = 'Ride Rocco'
  const H2O_IMG = 'https://www.sliquid.com/wp-content/uploads/2021/05/H2O_4oz.png'
  const SEA_IMG = 'https://www.sliquid.com/wp-content/uploads/2021/05/Sea_4oz.png'
  const SLV_IMG = 'https://www.sliquid.com/wp-content/uploads/2021/05/Silver_4oz.png'
  const ORG_IMG = 'https://www.sliquid.com/wp-content/uploads/2021/05/Organics_Natural_4oz.png'

  const products: P[] = [
    // ── SLIQUID NATURALS 4.2 oz ────────────────────────────────────────────
    ['Naturals H2O',                  SLQ,'Water-Based', '001',DESC.h2o,      7.00,H2O_IMG,1,'001','894147000012','4.2 oz',12, 84.00,14.00,...d42],
    ['Naturals H2O (Multilingual)',   SLQ,'Water-Based', '901',DESC.h2oMl,    7.00,null,   1,'901','894147009015','4.2 oz',12, 84.00,14.00,...d42],
    ['Sparkle Pride Lube',            SLQ,'Water-Based', '105',DESC.sparkle,  7.00,null,   1,'105','650245516332','4.2 oz',12, 84.00,14.00,...d42],
    ['Naturals Sassy',                SLQ,'Water-Based', '031',DESC.sassy,    7.00,null,   1,'031','894147000319','4.2 oz',12, 84.00,14.00,...d42],
    ['Naturals Sassy (Multilingual)', SLQ,'Water-Based', '931',DESC.sassyMl,  7.00,null,   1,'931','894147009312','4.2 oz',12, 84.00,14.00,...d42],
    ['Naturals Sea',                  SLQ,'Water-Based', '013',DESC.sea,      7.50,SEA_IMG, 1,'013','894147000135','4.2 oz',12, 90.00,15.00,...d42],
    ['Naturals Sea (Multilingual)',   SLQ,'Water-Based', '913',DESC.seaMl,    7.50,null,   1,'913','894147009138','4.2 oz',12, 90.00,15.00,...d42],
    ['Naturals Tsunami',              SLQ,'Water-Based', '109',DESC.tsunami,  7.50,null,   1,'109','850050864134','4.2 oz',12, 90.00,15.00,...d42],
    ['Naturals Silk',                 SLQ,'Hybrid',      '009',DESC.silk,     7.50,null,   1,'009','894147000098','4.2 oz',12, 90.00,15.00,...d42],
    ['Naturals Silk (Multilingual)',  SLQ,'Hybrid',      '909',DESC.silkMl,   7.50,null,   1,'909','894147009091','4.2 oz',12, 90.00,15.00,...d42],
    ['Naturals Sizzle',               SLQ,'Warming',     '008',DESC.sizzle,   7.00,null,   1,'008','894147000081','4.2 oz',12, 84.00,14.00,...d42],
    ['Naturals Satin',                SLQ,'Hybrid',      '058',DESC.satin,    7.50,null,   1,'058','894147000586','4.2 oz',12, 90.00,15.00,...d42],
    ['Naturals Satin (Multilingual)', SLQ,'Hybrid',      '958',DESC.satinMl,  7.50,null,   1,'958','894147009589','4.2 oz',12, 90.00,15.00,...d42],
    ['Naturals Silver',               SLQ,'Silicone-Based','002',DESC.silver, 16.00,SLV_IMG,1,'002','894147000029','4.2 oz',12,192.00,32.00,...d42],
    ['Naturals Spark Booty Buzz',     SLQ,'Stimulating', '990',DESC.booty,   16.00,null,   1,'990','894147009909','4.2 oz',12,192.00,32.00,...d42],
    ['Studio Collection — Silver',    SLQ,'Silicone-Based','084',DESC.studio, 16.50,null,  1,'084','894147000845','3.4 oz',12,198.00,33.00,
      '6.2 lbs','2.25" x 1.75" x 4.25"','9.25" x 5.5" x 4.5"'],
    ['Naturals Swirl (Cherry Vanilla)',      SLQ,'Flavored','005',DESC.swirlDesc('Cherry Vanilla'),      7.00,null,1,'005','894147000050','4.2 oz',12,84.00,14.00,...d42],
    ['Naturals Swirl (Pina Colada)',         SLQ,'Flavored','006',DESC.swirlDesc('Pina Colada'),         7.00,null,1,'006','894147000067','4.2 oz',12,84.00,14.00,...d42],
    ['Naturals Swirl (Green Apple)',         SLQ,'Flavored','007',DESC.swirlDesc('Green Apple'),         7.00,null,1,'007','894147000074','4.2 oz',12,84.00,14.00,...d42],
    ['Naturals Swirl (Blue Raspberry)',      SLQ,'Flavored','010',DESC.swirlDesc('Blue Raspberry'),      7.00,null,1,'010','894147000104','4.2 oz',12,84.00,14.00,...d42],
    ['Naturals Swirl (Strawberry Pomegranate)',SLQ,'Flavored','014',DESC.swirlDesc('Strawberry Pomegranate'),7.00,null,1,'014','894147000142','4.2 oz',12,84.00,14.00,...d42],
    ['Naturals Swirl (Pink Lemonade)',       SLQ,'Flavored','016',DESC.swirlDesc('Pink Lemonade'),       7.00,null,1,'016','894147000166','4.2 oz',12,84.00,14.00,...d42],
    ['Naturals Swirl (Blackberry Fig)',      SLQ,'Flavored','021',DESC.swirlDesc('Blackberry Fig'),      7.00,null,1,'021','894147000210','4.2 oz',12,84.00,14.00,...d42],
    ['Naturals Swirl (Tangerine Peach)',     SLQ,'Flavored','022',DESC.swirlDesc('Tangerine Peach'),     7.00,null,1,'022','894147000227','4.2 oz',12,84.00,14.00,...d42],

    // ── SLIQUID NATURALS 8.5 oz ────────────────────────────────────────────
    ['Naturals H2O',                  SLQ,'Water-Based', '011',DESC.h2o,      11.00,null,1,'011','894147000111','8.5 oz',6, 66.00,22.00,...d85],
    ['Naturals H2O (Multilingual)',   SLQ,'Water-Based', '911',DESC.h2oMl,    11.00,null,1,'911','894147009114','8.5 oz',6, 66.00,22.00,...d85],
    ['Naturals Sassy',                SLQ,'Water-Based', '041',DESC.sassy,    11.00,null,1,'041','894147000418','8.5 oz',6, 66.00,22.00,...d85],
    ['Naturals Sea',                  SLQ,'Water-Based', '049',DESC.sea,      12.00,null,1,'049','894147000494','8.5 oz',6, 72.00,24.00,...d85],
    ['Naturals Tsunami',              SLQ,'Water-Based', '110',DESC.tsunami,  12.00,null,1,'110','850050864141','8.5 oz',6, 72.00,24.00,...d85],
    ['Naturals Silk',                 SLQ,'Hybrid',      '019',DESC.silk,     12.00,null,1,'019','894147000197','8.5 oz',6, 72.00,24.00,...d85],
    ['Naturals Sizzle',               SLQ,'Warming',     '018',DESC.sizzle,   11.00,null,1,'018','650245514116','8.5 oz',6, 66.00,22.00,...d85],
    ['Naturals Satin',                SLQ,'Hybrid',      '059',DESC.satin,    12.50,null,1,'059','894147000593','8.5 oz',6, 75.00,25.00,...d85],
    ['Naturals Silver',               SLQ,'Silicone-Based','012',DESC.silver, 22.00,null,1,'012','894147000128','8.5 oz',6,132.00,44.00,...d85],
    ['Naturals Spark Booty Buzz',     SLQ,'Stimulating', '987',DESC.booty,   22.00,null,1,'987','650245232263','8.5 oz',6,132.00,44.00,...d85],

    // ── SLIQUID NATURALS 2.0 oz ────────────────────────────────────────────
    ['Naturals H2O',                  SLQ,'Water-Based', '996',DESC.h2o,     5.00,null,1,'996','894147009961','2.0 oz',16, 80.00,10.00,...d20],
    ['Sparkle Pride Lube',            SLQ,'Water-Based', '104',DESC.sparkle, 5.00,null,1,'104','650245240909','2.0 oz',16, 80.00,10.00,...d20],
    ['Naturals Sassy',                SLQ,'Water-Based', '997',DESC.sassy,   5.00,null,1,'997','894147009978','2.0 oz',16, 80.00,10.00,...d20],
    ['Naturals Sea',                  SLQ,'Water-Based', '998',DESC.sea,     5.50,null,1,'998','894147009985','2.0 oz',16, 88.00,11.00,...d20],
    ['Naturals Silk',                 SLQ,'Hybrid',      '999',DESC.silk,    5.50,null,1,'999','894147009992','2.0 oz',16, 88.00,11.00,...d20],
    ['Naturals Sizzle',               SLQ,'Warming',     '928',DESC.sizzle,  5.00,null,1,'928','894147009282','2.0 oz',16, 80.00,10.00,...d20],
    ['Naturals Satin',                SLQ,'Hybrid',      '969',DESC.satin,   5.50,null,1,'969','894147009695','2.0 oz',16, 88.00,11.00,...d20],
    ['Naturals Silver',               SLQ,'Silicone-Based','968',DESC.silver,9.00,null,1,'968','894147009688','2.0 oz',16,144.00,18.00,...d20],
    ['Naturals Spark Booty Buzz',     SLQ,'Stimulating', '988',DESC.booty,   9.00,null,1,'988','650245551340','2.0 oz',16,144.00,18.00,...d20],
    ['Sliquid Soul',                  SLQ,'Feminine Wellness','991',DESC.soul,7.00,null,1,'991','894147009916','2.0 oz',16,112.00,14.00,...d20],

    // ── SLIQUID NATURALS PILLOWS .17 oz ────────────────────────────────────
    ['Naturals H2O Pillow',           SLQ,'Water-Based', '003',DESC.pillow,  0.60,null,1,'003','894147000036','.17 oz',200,120.00,1.25,...dpil],
    ['Naturals Sassy Pillow',         SLQ,'Water-Based', '131',DESC.pillow,  0.60,null,1,'131','894147001316','.17 oz',200,120.00,1.25,...dpil],
    ['Naturals Silver Pillow',        SLQ,'Silicone-Based','004',DESC.pilSilv,1.25,null,1,'004','894147000043','.17 oz',200,250.00,2.50,...dpil],
    ['Naturals Silk Pillow',          SLQ,'Hybrid',      '119',DESC.pilSilk, 0.65,null,1,'119','894147001194','.17 oz',200,130.00,1.25,...dpil],
    ['Naturals Sea Pillow',           SLQ,'Water-Based', '113',DESC.pillow,  0.65,null,1,'113','894147001132','.17 oz',200,130.00,1.25,...dpil],
    ['Naturals Tsunami Pillow',       SLQ,'Water-Based', '111',DESC.pillow,  0.65,null,1,'111','850050864158','.17 oz',200,130.00,1.25,...dpil],
    ['Naturals Satin Pillow',         SLQ,'Hybrid',      '063',DESC.pilSatin,0.75,null,1,'063','894147000630','.17 oz',200,150.00,1.50,...dpil],

    // ── SLIQUID ORGANICS 4.2 oz ────────────────────────────────────────────
    ['Organics Natural',              SLQ,'Organic','042',DESC.orgNat,   8.00,ORG_IMG,1,'042','894147000425','4.2 oz',12, 96.00,16.00,...d42],
    ['Organics Natural (Multilingual)',SLQ,'Organic','942',DESC.orgNatMl, 8.00,null,  1,'942','894147009428','4.2 oz',12, 96.00,16.00,...d42],
    ['Organics Sensation',            SLQ,'Organic','043',DESC.orgSens,  8.00,null,   1,'043','894147000432','4.2 oz',12, 96.00,16.00,...d42],
    ['Organics Sensation (Multilingual)',SLQ,'Organic','943',DESC.orgSensMl,8.00,null,1,'943','894147009435','4.2 oz',12, 96.00,16.00,...d42],
    ['Organics Silk',                 SLQ,'Organic','044',DESC.orgSilk,  8.00,null,   1,'044','894147000449','4.2 oz',12, 96.00,16.00,...d42],
    ['Organics Silk (Multilingual)',  SLQ,'Organic','944',DESC.orgSilkMl,8.00,null,   1,'944','894147009442','4.2 oz',12, 96.00,16.00,...d42],
    ['Organics Natural Gel',          SLQ,'Organic','082',DESC.orgGel,   8.00,null,   1,'082','894147000821','4.2 oz',12, 96.00,16.00,...d42],
    ['Organics Natural Gel (Multilingual)',SLQ,'Organic','982',DESC.orgGelMl,8.00,null,1,'982','894147009824','4.2 oz',12, 96.00,16.00,...d42],
    ['Organics Oceanics',             SLQ,'Organic','081',DESC.orgOce,   8.00,null,   1,'081','894147000814','4.2 oz',12, 96.00,16.00,...d42],

    // ── SLIQUID ORGANICS 8.5 oz ────────────────────────────────────────────
    ['Organics Natural',    SLQ,'Organic','046',DESC.orgNat,  12.00,null,1,'046','894147000463','8.5 oz',6,72.00,24.00,...d85],
    ['Organics Sensation',  SLQ,'Organic','047',DESC.orgSens, 12.00,null,1,'047','894147000470','8.5 oz',6,72.00,24.00,...d85],
    ['Organics Silk',       SLQ,'Organic','048',DESC.orgSilk, 12.00,null,1,'048','894147000487','8.5 oz',6,72.00,24.00,...d85],
    ['Organics Natural Gel',SLQ,'Organic','086',DESC.orgGel,  12.00,null,1,'086','894147000869','8.5 oz',6,72.00,24.00,...d85],
    ['Organics Oceanics',   SLQ,'Organic','083',DESC.orgOce,  12.00,null,1,'083','894147000838','8.5 oz',6,72.00,24.00,...d85],

    // ── SLIQUID ORGANICS 2.0 oz ────────────────────────────────────────────
    ['Organics Natural',    SLQ,'Organic','096',DESC.orgNat,   6.00,null,1,'096','894147000968','2.0 oz',16, 96.00,12.00,...d20],
    ['Organics Sensation',  SLQ,'Organic','098',DESC.orgSens,  6.00,null,1,'098','894147000982','2.0 oz',16, 96.00,12.00,...d20],
    ['Organics Silk',       SLQ,'Organic','099',DESC.orgSilk,  6.00,null,1,'099','894147000999','2.0 oz',16, 96.00,12.00,...d20],
    ['Organics Natural Gel',SLQ,'Organic','097',DESC.orgGel,   6.00,null,1,'097','894147000975','2.0 oz',16, 96.00,12.00,...d20],
    ['Organics O Gel (Multilingual)',SLQ,'Organic','945',DESC.orgOGelMl,8.00,null,1,'945','894147009459','1 oz',20,160.00,16.00,...d1oz],

    // ── SLIQUID ORGANICS PILLOWS ────────────────────────────────────────────
    ['Organics Natural Pillow',     SLQ,'Organic','092',DESC.pillow, 0.65,null,1,'092','894147000920','.17 oz',200,130.00,1.50,...dpil],
    ['Organics Natural Gel Pillow', SLQ,'Organic','095',DESC.pillow, 0.65,null,1,'095','894147000951','.17 oz',200,130.00,1.50,...dpil],
    ['Organics O Gel Pillow',       SLQ,'Organic','245',DESC.orgOGel,1.00,null,1,'245','894147002450','.17 oz',200,200.00,2.00,
      '2.5 lbs','2" x 2.5" x .25"','12" x 12" x 3"'],

    // ── BALANCE COLLECTION ─────────────────────────────────────────────────
    ['Balance Splash (Unscented)',          SLQ,'Feminine Wellness','024',DESC.splash,  8.00,null,1,'024','894147000241','8.5 oz',6,48.00,16.00,...d85s],
    ['Balance Splash (Mango Passion)',      SLQ,'Feminine Wellness','050',DESC.splash,  8.00,null,1,'050','894147000500','8.5 oz',6,48.00,16.00,...d85s],
    ['Balance Splash (Honeydew Cucumber)', SLQ,'Feminine Wellness','028',DESC.splash,  8.00,null,1,'028','894147000289','8.5 oz',6,48.00,16.00,...d85s],
    ['Balance Splash (Grapefruit Thyme)',   SLQ,'Feminine Wellness','029',DESC.splash,  8.00,null,1,'029','894147000296','8.5 oz',6,48.00,16.00,...d85s],
    ['Balance Massage (Mint & Cedar)',      SLQ,'Massage',          '078',DESC.massMin,12.00,null,1,'078','894147000784','8.5 oz',6,72.00,25.00,...d85m],
    ['Balance Massage (Citrus Neroli)',     SLQ,'Massage',          '079',DESC.massCit,12.00,null,1,'079','894147000791','8.5 oz',6,72.00,25.00,...d85m],
    ['Balance Massage (Unscented)',         SLQ,'Massage',          '069',DESC.massUns,12.00,null,1,'069','894147000692','8.5 oz',6,72.00,25.00,...d85m],
    ['Balance Soak (Cherry Blossom)',       SLQ,'Feminine Wellness','056',DESC.soakCh,  6.50,null,1,'056','894147000562','8.5 oz',6,39.00,12.00,...d85],
    ['Balance Soak (Coconut Papaya)',       SLQ,'Feminine Wellness','929',DESC.soakCo,  6.50,null,1,'929','894147009299','8.5 oz',6,39.00,12.00,...d85],
    ['Balance Soothe (Mandarin Bergamot)', SLQ,'Feminine Wellness','074',DESC.sootheMB,8.00,null,1,'074','650245246697','8.5 oz',6,48.00,16.00,...d85s],
    ['Balance Soothe (Sweet Coconut)',      SLQ,'Feminine Wellness','075',DESC.sootheSC,8.00,null,1,'075','650245289786','8.5 oz',6,48.00,16.00,...d85s],

    // ── RIDE LUBE 4.2 oz ───────────────────────────────────────────────────
    ['Ride Lube Water Based', RIDE,'Water-Based',  '353',DESC.rideWB,   7.50,null,1,'353','894147003532','4.2 oz',12, 90.00,15.00,...d42r],
    ['Ride Lube Silicone',    RIDE,'Silicone-Based','354',DESC.rideSil, 17.00,null,1,'354','894147003549','4.2 oz',12,204.00,34.00,...d42r],
    ['Ride Lube Hybrid',      RIDE,'Hybrid',        '350',DESC.rideHyb,  7.50,null,1,'350','894147003501','4.2 oz',12, 90.00,15.00,...d42r],
    ['Ride Lube Booty Buzz',  RIDE,'Stimulating',   '989',DESC.rideBooty,17.00,null,1,'989','894147009893','4.2 oz',12,204.00,34.00,...d42r],
    ['Ride Rocco Silicone',   ROCC,'Silicone-Based','364',DESC.roccoSil, 17.00,null,1,'364','606246358532','4.2 oz',12,204.00,34.00,...d42r],
    ['Ride Rocco Water Based',ROCC,'Water-Based',   '363',DESC.roccoWB,   7.50,null,1,'363','606246334086','4.2 oz',12, 90.00,15.00,...d42r],
    ['Ride Rocco Seed Hybrid',ROCC,'Hybrid',         '366',DESC.roccoHyb,  7.50,null,1,'366','650245462394','4.2 oz',12, 90.00,15.00,...d42r],

    // ── RIDE LUBE 8.5 oz ───────────────────────────────────────────────────
    ['Ride Lube Water Based', RIDE,'Water-Based',  '351',DESC.rideWB,   12.00,null,1,'351','894147003518','8.5 oz',6, 72.00,24.00,...d85r],
    ['Ride Lube Silicone',    RIDE,'Silicone-Based','352',DESC.rideSil, 22.00,null,1,'352','894147003525','8.5 oz',6,132.00,44.00,...d85r],
    ['Ride Lube Hybrid',      RIDE,'Hybrid',        '359',DESC.rideHyb,  12.00,null,1,'359','894147003594','8.5 oz',6, 72.00,24.00,...d85r],
    ['Ride Lube Booty Buzz',  RIDE,'Stimulating',   '992',DESC.rideBooty,22.00,null,1,'992','894147009923','8.5 oz',6,132.00,44.00,...d85r],
    ['Ride Rocco Silicone',   ROCC,'Silicone-Based','362',DESC.roccoSil, 22.00,null,1,'362','606246694494','8.5 oz',6,132.00,44.00,...d85r],
    ['Ride Rocco Water Based',ROCC,'Water-Based',   '361',DESC.roccoWB,  12.00,null,1,'361','606246382278','8.5 oz',6, 72.00,24.00,...d85r],
    ['Ride Rocco Seed Hybrid',ROCC,'Hybrid',         '365',DESC.roccoHyb, 12.00,null,1,'365','650245382296','8.5 oz',6, 72.00,24.00,...d85r],

    // ── RIDE LUBE 2 oz ─────────────────────────────────────────────────────
    ['Ride Lube Water Based', RIDE,'Water-Based',  '036',DESC.rideWB,   5.50,null,1,'036','894147000364','2 oz',16, 88.00,11.00,...d20r],
    ['Ride Lube Silicone',    RIDE,'Silicone-Based','037',DESC.rideSil,  9.00,null,1,'037','894147000371','2 oz',16,144.00,18.00,...d20r],
    ['Ride Lube Hybrid',      RIDE,'Hybrid',        '035',DESC.rideHyb,  5.50,null,1,'035','894147000357','2 oz',16, 88.00,11.00,...d20r],

    // ── RIDE BODYWORX RISE ─────────────────────────────────────────────────
    ['Ride BodyWorx Rise Stimulating Gel',RIDE,'Stimulating','951',DESC.rise,8.50,null,1,'951','894147009510','1 oz',20,170.00,18.00,...d2l],

    // ── SPECIALTY ──────────────────────────────────────────────────────────
    ["Buck Angel's T-Lube",             SLQ,'Specialty','040',DESC.tLube,  7.00,null,1,'040','894147000401','4.2 oz',12, 84.00,15.00,...d42],
    ["Buck Angel's T-Wash",             SLQ,'Specialty','051',DESC.tWash,  7.50,null,1,'051','653166085208','8.5 oz', 6, 45.00,15.00,...d85r],
    ['Sliquid Shine Toy Cleaner',       SLQ,'Toy Care', '032',DESC.shine85,8.00,null,1,'032','894147000326','8.5 oz', 6, 48.00,16.00,...d85r],
    ['Sliquid Shine Toy Cleaner',       SLQ,'Toy Care', '033',DESC.shine2, 5.50,null,1,'033','894147000333','2 oz',  16, 88.00,11.00,
      '3 lbs','1.25" Dia x 5"','5.5" x 5.5" x 5.5"'],
  ]

  for (const p of products) addProduct.run(...p)
  console.log(`Seeded ${products.length} products.`)

  // Assets
  const addAsset = db.prepare('INSERT INTO assets (name,brand,type,file_url,thumbnail_url,file_size,dimensions) VALUES (?,?,?,?,?,?,?)')
  const assets: [string,string,string,string,string|null,string|null,string|null][] = [
    ['Sliquid Logo Horizontal (Light)','Sliquid','Logo','/uploads/sliquid-logo-h-light.svg',null,'12 KB','SVG'],
    ['Sliquid Logo Horizontal (Dark)','Sliquid','Logo','/uploads/sliquid-logo-h-dark.svg',null,'12 KB','SVG'],
    ['Sliquid Logo Stacked','Sliquid','Logo','/uploads/sliquid-logo-stacked.svg',null,'14 KB','SVG'],
    ['RIDE Logo Primary','RIDE','Logo','/uploads/ride-logo-primary.svg',null,'10 KB','SVG'],
    ['Ride Rocco Logo','Ride Rocco','Logo','/uploads/rocco-logo.svg',null,'11 KB','SVG'],
    ['H2O Product Family Banner','Sliquid','Banner','/uploads/h2o-family-banner.jpg','/uploads/thumbs/h2o-family-banner.jpg','2.4 MB','2560x1440'],
    ['Organics Collection Banner','Sliquid','Banner','/uploads/organics-banner.jpg','/uploads/thumbs/organics-banner.jpg','1.8 MB','2560x1440'],
    ['Pride Month Banner 2025','Sliquid','Banner','/uploads/pride-2025-banner.jpg','/uploads/thumbs/pride-2025-banner.jpg','2.1 MB','2560x1440'],
    ['RIDE Spring Campaign Banner','RIDE','Banner','/uploads/ride-spring-banner.jpg','/uploads/thumbs/ride-spring-banner.jpg','1.6 MB','2560x1440'],
    ['H2O Instagram Story Set','Sliquid','Social','/uploads/h2o-ig-stories.zip','/uploads/thumbs/h2o-ig-stories.jpg','8.2 MB','1080x1920 (x5)'],
    ['Organics Facebook Post Pack','Sliquid','Social','/uploads/organics-fb-pack.zip','/uploads/thumbs/organics-fb-pack.jpg','5.6 MB','1080x1080 (x4)'],
    ['RIDE Social Media Kit','RIDE','Social','/uploads/ride-social-kit.zip','/uploads/thumbs/ride-social-kit.jpg','12 MB','Various'],
    ['Sliquid Brand Guidelines 2025','Sliquid','Document','/uploads/sliquid-brand-guidelines-2025.pdf',null,'4.8 MB','PDF'],
    ['RIDE Product Sell Sheet','RIDE','Document','/uploads/ride-sell-sheet.pdf',null,'1.2 MB','PDF'],
    ['Retailer Display Guide','Sliquid','Document','/uploads/retailer-display-guide.pdf',null,'3.1 MB','PDF'],
    ['Rocco Brand Launch Kit','Ride Rocco','Document','/uploads/rocco-launch-kit.zip',null,'22 MB','ZIP'],
  ]
  for (const a of assets) addAsset.run(...a)

  // Distributors
  const addDist = db.prepare('INSERT INTO distributors (name,region,state,city,address,phone,email,website,contact_name) VALUES (?,?,?,?,?,?,?,?,?)')
  const dists: [string,string,string,string|null,string|null,string|null,string|null,string|null,string|null][] = [
    ['Williams Trading Co.','Northeast','NJ','Pennsauken','3500 Hadfield Road','(856) 910-1000','info@williamstrading.com','https://williamstrading.com','Mike Torres'],
    ['Eldorado Trading Company','Mountain West','CO','Broomfield','2121 S Oneida St','(303) 232-9933','info@eldorado.net','https://eldorado.net','Sarah Lee'],
    ['Synergy Wholesale Inc.','West','CA','Los Angeles','5555 Industry Ave','(213) 555-0100','orders@synergywholesale.com',null,'James Park'],
    ['McKesson Distribution','Southeast','GA','Atlanta','1000 McKesson Pkwy','(404) 555-0200','wellness@mckesson.com',null,'Angela Davis'],
    ['Sportsheets International','West','CA','Buena Park','6484 Brisa St','(714) 562-1645','sales@sportsheets.com','https://sportsheets.com','Chris Nguyen'],
    ["Lion's Den Distribution",'Midwest','OH','Columbus','2850 Corporate Exchange Dr','(614) 555-0300','dist@lionsden.com',null,'Tom Fields'],
    ["Honey's Place",'West','CA','Chatsworth','6670 Valjean Ave','(818) 703-8780','orders@honeysplace.com','https://honeysplace.com','Robin Chase'],
    ['GHP Group (Intimacy)','Midwest','IL','Chicago','1301 W Randolph St','(312) 555-0400','intimacy@ghpgroup.com',null,'David Chen'],
    ['Eldorado SE','Southeast','FL','Miami','8700 NW 36th St','(305) 555-0500','fl@eldorado.net',null,'Rosa Martinez'],
    ['Pacific Trading Co.','Northwest','WA','Seattle','1400 Western Ave','(206) 555-0600','orders@pacifictrading.com',null,'Amy Wilson'],
    ['Premier Wholesale','Southwest','TX','Dallas','4200 Commerce St','(214) 555-0700','sales@premierwholesale.com',null,'Brad Johnson'],
    ['Atlantic Distributors','Northeast','NY','Brooklyn','500 Atlantic Ave','(718) 555-0800','info@atlanticdist.com',null,'Maria Lopez'],
    ['Midwest Wellness Group','Midwest','MN','Minneapolis','900 Nicollet Mall','(612) 555-0900','orders@midwestwellness.com',null,'Karen Smith'],
    ['Southern Comfort Distribution','Southeast','NC','Charlotte','1700 South Blvd','(704) 555-1000','contact@scddist.com',null,'John Reynolds'],
    ['Rocky Mountain Wholesale','Mountain West','UT','Salt Lake City','250 S 400 W','(801) 555-1100','info@rmwholesale.com',null,'Paul Bennett'],
  ]
  for (const d of dists) addDist.run(...d)

  // Invoices
  const addInvoice = db.prepare('INSERT INTO invoices (invoice_number,partner_id,amount,status,due_date,issued_date,items,notes) VALUES (?,?,?,?,?,?,?,?)')
  const statuses = ['paid','paid','paid','pending','overdue']
  for (let i = 1; i <= 25; i++) {
    const num = `INV-2025-${String(i).padStart(4,'0')}`
    const amount = Math.round((150 + Math.random() * 2000) * 100) / 100
    const status = statuses[Math.floor(Math.random() * statuses.length)]
    const daysAgo = i * 12
    const issued = new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0]
    const due    = new Date(Date.now() - (daysAgo - 30) * 86400000).toISOString().split('T')[0]
    const items  = JSON.stringify([
      { product: 'Naturals H2O 4.2 oz', qty: Math.ceil(Math.random() * 24), unit_price: 7.00 },
      { product: 'Organics Natural 4.2 oz', qty: Math.ceil(Math.random() * 12), unit_price: 8.00 },
    ])
    addInvoice.run(num, 2, amount, status, due, issued, items, null)
  }

  // Inventory — generate from products table dynamically
  const allProds = db.prepare('SELECT id, name, brand, sku FROM products').all() as { id:number; name:string; brand:string; sku:string }[]
  const addInv = db.prepare('INSERT INTO inventory (product_id,product_name,brand,sku,quantity,reorder_level,status) VALUES (?,?,?,?,?,?,?)')
  const rand = Math.random
  for (const p of allProds) {
    const r = rand()
    const qty = r < 0.08 ? 0 : r < 0.22 ? Math.floor(5 + rand() * 14) : Math.floor(50 + rand() * 150)
    const reorder = 20
    const status  = qty === 0 ? 'out_of_stock' : qty <= reorder ? 'low_stock' : 'in_stock'
    addInv.run(p.id, p.name, p.brand, p.sku, qty, reorder, status)
  }

  // Creatives
  const addCreative = db.prepare('INSERT INTO creatives (title,brand,type,campaign,thumbnail_url,file_url,description,dimensions,file_size) VALUES (?,?,?,?,?,?,?,?,?)')
  const creatives: [string,string,string,string|null,string|null,string,string|null,string|null,string|null][] = [
    ['Summer Hydration Campaign — Banner Set','Sliquid','Banner','Summer Hydration 2025',null,'/uploads/creatives/summer-banner-set.zip','Full set of web banners for Summer Hydration campaign.','Various','18 MB'],
    ['Pride Month 2025 — Social Pack','Sliquid','Social Media','Pride 2025',null,'/uploads/creatives/pride-2025-social.zip','Social media assets for Pride Month 2025 campaign.','1080x1080, 1080x1920','24 MB'],
    ['RIDE New Arrivals — Email Template','RIDE','Email','RIDE Launch 2025',null,'/uploads/creatives/ride-email-template.zip','HTML email template for RIDE new arrivals announcement.','600px wide','2.4 MB'],
    ['Rocco Brand Launch — Full Kit','Ride Rocco','Multi','Rocco Brand Launch',null,'/uploads/creatives/rocco-launch-full.zip','Complete brand launch kit: print, digital, social.','Various','55 MB'],
    ['Organics — Point of Sale Kit','Sliquid','Print','Organics POS',null,'/uploads/creatives/organics-pos-kit.zip','Print-ready point-of-sale materials for Organics line.','5x7", 8x10", 11x17"','32 MB'],
  ]
  for (const c of creatives) addCreative.run(...c)

  console.log('Database seeded successfully.')
}

init()
seed()
export default db
