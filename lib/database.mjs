import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'

function databasePath() {
  const configured = process.env.DATABASE_URL || 'file:./dev.db'
  if (!configured.startsWith('file:')) throw new Error('DATABASE_URL must use SQLite file: syntax')
  return resolve(process.cwd(), configured.slice('file:'.length))
}

const path = databasePath()
mkdirSync(dirname(path), { recursive: true })
export const db = new DatabaseSync(path)
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
db.exec(`
  CREATE TABLE IF NOT EXISTS User (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', passwordHash TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK(role IN ('CUSTOMER','STAFF')),
    manualRefillDays INTEGER, createdAt INTEGER NOT NULL, passwordChangedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS Cylinder (
    id TEXT PRIMARY KEY, sizeKg REAL NOT NULL UNIQUE, pricePerKg REAL NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
  );
  CREATE TABLE IF NOT EXISTS Orders (
    id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES User(id), cylinderId TEXT NOT NULL REFERENCES Cylinder(id),
    quantity INTEGER NOT NULL CHECK(quantity > 0), fulfilment TEXT NOT NULL CHECK(fulfilment IN ('PICKUP','DELIVERY')),
    deliveryAddress TEXT NOT NULL DEFAULT '', totalPrice REAL NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
    createdAt INTEGER NOT NULL, readyAt INTEGER, readyEmailSentAt INTEGER, completedAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS Payment (
    id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES Orders(id), reference TEXT NOT NULL UNIQUE,
    amount INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('PENDING','SUCCESS','FAILED')),
    provider TEXT NOT NULL DEFAULT 'PAYSTACK', createdAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS AutomationLog (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, orderId TEXT REFERENCES Orders(id), customerId TEXT REFERENCES User(id),
    status TEXT NOT NULL CHECK(status IN ('SENT','FAILED')), error TEXT, createdAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS AuthThrottle (
    email TEXT PRIMARY KEY, attempts INTEGER NOT NULL, resetAt INTEGER NOT NULL, blockedUntil INTEGER
  );
  CREATE TABLE IF NOT EXISTS PasswordResetToken (
    tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
    expiresAt INTEGER NOT NULL, createdAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS Orders_customer_created ON Orders(customerId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS Orders_status_created ON Orders(status, createdAt);
  CREATE INDEX IF NOT EXISTS Payment_order ON Payment(orderId);
`)
db.exec(`CREATE TABLE IF NOT EXISTS CustomerRefillEstimate (
  customerId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  sizeKg REAL NOT NULL,
  days INTEGER NOT NULL CHECK(days BETWEEN 7 AND 90),
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(customerId,sizeKg)
)`)
try { db.exec('ALTER TABLE User ADD COLUMN passwordChangedAt INTEGER') } catch {}

const cylinders = [[3,1250],[5,1240],[6,1230],[12.5,1200],[25,1180],[50,1150]]
const addCylinder = db.prepare('INSERT OR IGNORE INTO Cylinder(id,sizeKg,pricePerKg,active) VALUES(?,?,?,1)')
for (const [size, price] of cylinders) addCylinder.run(`cyl-${String(size).replace('.','-')}`, size, price)

if (db.prepare('SELECT COUNT(*) AS count FROM Orders').get().count === 0) {
  const now = Date.now()
  const customers = [
    ['demo-customer-amina','Amina Yusuf','amina@example.com','0803 111 2233'],
    ['demo-customer-chidi','Chidi Okafor','chidi@example.com','0806 222 3344'],
  ]
  const insertUser = db.prepare("INSERT OR IGNORE INTO User(id,name,email,phone,role,createdAt) VALUES(?,?,?,?, 'CUSTOMER',?)")
  for (const customer of customers) insertUser.run(...customer,now)
  const demoOrders = [
    ['GU-1042','demo-customer-amina','cyl-12-5',12.5,1200,now-40*86400000],
    ['GU-1043','demo-customer-amina','cyl-12-5',12.5,1200,now-19*86400000],
    ['GU-1044','demo-customer-chidi','cyl-6',6,1230,now-28*86400000],
  ]
  const insertOrder = db.prepare(`INSERT OR IGNORE INTO Orders(id,customerId,cylinderId,quantity,fulfilment,totalPrice,status,createdAt,completedAt)
    VALUES(?,?,?,1,'PICKUP',?,'COMPLETED',?,?)`)
  const insertPayment = db.prepare("INSERT OR IGNORE INTO Payment(id,orderId,reference,amount,status,provider,createdAt) VALUES(?,?,?,?, 'SUCCESS','DEMO',?)")
  for (const [id,customerId,cylinderId,sizeKg,pricePerKg,createdAt] of demoOrders) {
    const total = sizeKg*pricePerKg
    insertOrder.run(id,customerId,cylinderId,total,createdAt,createdAt)
    insertPayment.run(`payment-${id}`,id,`DEMO-${id}`,total*100,createdAt)
  }
}

export function createOrder(input) {
  const cylinder = db.prepare('SELECT id,sizeKg,pricePerKg FROM Cylinder WHERE sizeKg=? AND active=1').get(input.sizeKg)
  if (!cylinder) throw new Error('This cylinder size is unavailable')
  const deliveryFee = input.fulfilment === 'DELIVERY' ? Math.max(0, Number(process.env.DELIVERY_FEE_NGN || 1500)) : 0
  const totalPrice = Math.round(cylinder.sizeKg * cylinder.pricePerKg * input.quantity + deliveryFee)
  const customerId = randomUUID()
  const orderId = `GU-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0,6).toUpperCase()}`
  const now = Date.now()
  db.exec('BEGIN IMMEDIATE')
  try {
    const existing = db.prepare('SELECT id FROM User WHERE email=?').get(input.customerEmail)
    const id = existing?.id || customerId
    if (existing) {
      db.prepare('UPDATE User SET name=?,phone=?,address=? WHERE id=?').run(input.customerName,input.customerPhone,input.fulfilment==='DELIVERY'?input.deliveryAddress:'',id)
    } else {
      db.prepare(`INSERT INTO User(id,name,email,phone,address,role,createdAt) VALUES(?,?,?,?,?,'CUSTOMER',?)`)
        .run(id,input.customerName,input.customerEmail,input.customerPhone,input.fulfilment==='DELIVERY'?input.deliveryAddress:'',now)
    }
    db.prepare(`INSERT INTO Orders(id,customerId,cylinderId,quantity,fulfilment,deliveryAddress,totalPrice,status,createdAt)
      VALUES(?,?,?,?,?,?,?,'PENDING',?)`).run(orderId,id,cylinder.id,input.quantity,input.fulfilment,input.fulfilment==='DELIVERY'?input.deliveryAddress:'',totalPrice,now)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { id: orderId, totalPrice, deliveryFee, sizeKg: cylinder.sizeKg, quantity: input.quantity, fulfilment: input.fulfilment, createdAt: now }
}

export function getOrderForPayment(orderId) {
  return db.prepare(`SELECT o.id,o.customerId,o.totalPrice,o.status,u.email,u.name,c.sizeKg,o.quantity
    FROM Orders o JOIN User u ON u.id=o.customerId JOIN Cylinder c ON c.id=o.cylinderId WHERE o.id=?`).get(orderId)
}

export function listStaffOrders() {
  return db.prepare(`SELECT o.id,o.quantity,o.fulfilment,o.deliveryAddress,o.totalPrice,o.status,o.createdAt,o.readyAt,o.completedAt,
    u.name AS customerName,u.phone AS customerPhone,u.email AS customerEmail,c.sizeKg,
    p.status AS paymentStatus,p.reference AS paymentReference
    FROM Orders o JOIN User u ON u.id=o.customerId JOIN Cylinder c ON c.id=o.cylinderId
    LEFT JOIN Payment p ON p.id=(SELECT p2.id FROM Payment p2 WHERE p2.orderId=o.id ORDER BY p2.createdAt DESC LIMIT 1)
    ORDER BY o.createdAt DESC`).all()
}

export function listCustomerOrders(customerId) {
  return db.prepare(`SELECT o.id,o.quantity,o.fulfilment,o.deliveryAddress,o.totalPrice,o.status,o.createdAt,o.readyAt,o.completedAt,
    u.name AS customerName,u.phone AS customerPhone,u.email AS customerEmail,c.sizeKg,
    p.status AS paymentStatus,p.reference AS paymentReference
    FROM Orders o JOIN User u ON u.id=o.customerId JOIN Cylinder c ON c.id=o.cylinderId
    LEFT JOIN Payment p ON p.id=(SELECT p2.id FROM Payment p2 WHERE p2.orderId=o.id ORDER BY p2.createdAt DESC LIMIT 1)
    WHERE o.customerId=? ORDER BY o.createdAt DESC`).all(customerId)
}

export function updateOrderStatus(orderId, status) {
  const completedAt = status === 'COMPLETED' ? Date.now() : null
  return db.prepare('UPDATE Orders SET status=?,completedAt=COALESCE(?,completedAt),readyAt=CASE WHEN ?=\'READY\' THEN COALESCE(readyAt,?) ELSE readyAt END WHERE id=?')
    .run(status,completedAt,status,Date.now(),orderId).changes > 0
}

export function listCylinders() {
  return db.prepare('SELECT id,sizeKg,pricePerKg,active FROM Cylinder ORDER BY sizeKg').all()
}

export function saveCylinderPrices(cylinders) {
  const upsert = db.prepare(`INSERT INTO Cylinder(id,sizeKg,pricePerKg,active) VALUES(?,?,?,?)
    ON CONFLICT(sizeKg) DO UPDATE SET pricePerKg=excluded.pricePerKg,active=excluded.active`)
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const cylinder of cylinders) {
      const id=`cyl-${String(cylinder.sizeKg).replace('.','-')}`
      upsert.run(id,cylinder.sizeKg,cylinder.pricePerKg,cylinder.active===false?0:1)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function savePendingPayment(orderId, reference, amount) {
  db.prepare(`INSERT INTO Payment(id,orderId,reference,amount,status,provider,createdAt)
    VALUES(?,?,?,?,'PENDING','PAYSTACK',?)`).run(randomUUID(),orderId,reference,amount,Date.now())
}

export function failPayment(reference) {
  db.prepare("UPDATE Payment SET status='FAILED' WHERE reference=? AND status='PENDING'").run(reference)
}

export function recordAutomationLog(type, orderId, customerId, status, error = null) {
  db.prepare(`INSERT INTO AutomationLog(id,type,orderId,customerId,status,error,createdAt)
    VALUES(?,?,?,?,?,?,?)`).run(randomUUID(), type, orderId || null, customerId || null, status, error, Date.now())
}

export function listAutomationLogs() {
  return db.prepare(`SELECT a.id,a.type,a.orderId,a.customerId,a.status,a.error,a.createdAt,u.name AS customerName,u.email AS customerEmail
    FROM AutomationLog a LEFT JOIN User u ON u.id=COALESCE(a.customerId,(SELECT customerId FROM Orders WHERE id=a.orderId))
    ORDER BY a.createdAt DESC LIMIT 100`).all()
}

export function getAutomationCustomer(orderId) {
  return db.prepare('SELECT customerId FROM Orders WHERE id=?').get(orderId)?.customerId || null
}

export function prepareOrderAutomation(orderId, type) {
  const order = db.prepare(`SELECT o.customerId,o.readyEmailSentAt FROM Orders o WHERE o.id=?`).get(orderId)
  if (!order) return null
  if (type === 'READY') {
    db.prepare("UPDATE Orders SET status='READY',readyAt=COALESCE(readyAt,?) WHERE id=?").run(Date.now(),orderId)
  } else if (type === 'OUT_FOR_DELIVERY') {
    db.prepare("UPDATE Orders SET status='OUT_FOR_DELIVERY' WHERE id=?").run(orderId)
  }
  return order
}

export function markReadyEmailSent(orderId) {
  db.prepare('UPDATE Orders SET readyEmailSentAt=? WHERE id=? AND readyEmailSentAt IS NULL').run(Date.now(),orderId)
}

export function findDueReminderCustomers(windowDays = 3) {
  const rows = db.prepare(`SELECT o.customerId,u.name,u.email,u.phone,u.manualRefillDays,c.sizeKg,
      (SELECT e.days FROM CustomerRefillEstimate e WHERE e.customerId=o.customerId AND e.sizeKg=c.sizeKg) AS cylinderEstimate,
      COALESCE(o.completedAt,o.createdAt) AS refillAt
    FROM Orders o JOIN User u ON u.id=o.customerId JOIN Cylinder c ON c.id=o.cylinderId
    WHERE o.status='COMPLETED' ORDER BY refillAt`).all()
  const groups = new Map()
  for (const row of rows) {
    const key = `${row.customerId}|${row.sizeKg}`
    if (!groups.has(key)) groups.set(key,{...row,refills:[]})
    groups.get(key).refills.push(row.refillAt)
  }
  const now = Date.now()
  return [...groups.values()].flatMap(group => {
    const intervals = group.refills.slice(1).map((date,index)=>(date-group.refills[index])/86400000)
    const average = group.cylinderEstimate || (intervals.length ? intervals.reduce((sum,value)=>sum+value,0)/intervals.length : group.manualRefillDays)
    if (!average || average < 1) return []
    const lastRefill = group.refills.at(-1)
    const daysLeft = Math.ceil((lastRefill+average*86400000-now)/86400000)
    if (daysLeft < 0 || daysLeft > windowDays) return []
    const alreadySent = db.prepare(`SELECT 1 FROM AutomationLog WHERE customerId=? AND type='REMINDER' AND status='SENT' AND createdAt>=? LIMIT 1`).get(group.customerId,lastRefill)
    if (alreadySent) return []
    return [{customerId:group.customerId,name:group.name,email:group.email,phone:group.phone,sizeKg:group.sizeKg,averageDays:Math.round(average),daysLeft,lastRefill}]
  })
}

export function saveCustomerRefillEstimate(email, phone, days) {
  return db.prepare('UPDATE User SET manualRefillDays=? WHERE email=? AND phone=? AND role=\'CUSTOMER\'').run(days,email,phone).changes > 0
}

export function getUserByEmail(email) {
  return db.prepare('SELECT id,name,email,phone,address,passwordHash,role,manualRefillDays,createdAt,passwordChangedAt FROM User WHERE email=?').get(email)
}

export function getUserById(id) {
  return db.prepare('SELECT id,name,email,phone,address,role,manualRefillDays,createdAt,passwordChangedAt FROM User WHERE id=?').get(id)
}

export function createUser(user) {
  const id = randomUUID()
  db.prepare(`INSERT INTO User(id,name,email,phone,address,passwordHash,role,createdAt) VALUES(?,?,?,?,?,?,?,?)`)
    .run(id,user.name,user.email,user.phone,user.address || '',user.passwordHash,user.role || 'CUSTOMER',Date.now())
  return getUserById(id)
}

export function updateUserPassword(id, passwordHash) {
  db.prepare('UPDATE User SET passwordHash=?,passwordChangedAt=? WHERE id=?').run(passwordHash,Date.now(),id)
}

export function activateDemoCustomer(id, user) {
  db.prepare('UPDATE User SET name=?,phone=?,address=?,passwordHash=?,passwordChangedAt=? WHERE id=? AND role=\'CUSTOMER\' AND passwordHash=\'\'')
    .run(user.name,user.phone,user.address || '',user.passwordHash,Date.now(),id)
  return getUserById(id)
}

export function saveUserRefillEstimate(userId, days) {
  return db.prepare("UPDATE User SET manualRefillDays=? WHERE id=? AND role='CUSTOMER'").run(days,userId).changes > 0
}

export function saveUserCylinderRefillEstimate(userId, sizeKg, days) {
  const customer = db.prepare("SELECT 1 FROM User WHERE id=? AND role='CUSTOMER'").get(userId)
  const cylinder = db.prepare('SELECT 1 FROM Cylinder WHERE sizeKg=?').get(sizeKg)
  if (!customer || !cylinder) return false
  db.prepare(`INSERT INTO CustomerRefillEstimate(customerId,sizeKg,days,updatedAt) VALUES(?,?,?,?)
    ON CONFLICT(customerId,sizeKg) DO UPDATE SET days=excluded.days,updatedAt=excluded.updatedAt`)
    .run(userId,sizeKg,days,Date.now())
  return true
}

export function listUserCylinderRefillEstimates(userId) {
  return db.prepare('SELECT sizeKg,days FROM CustomerRefillEstimate WHERE customerId=?').all(userId)
}

export function authThrottleSeconds(email) {
  const row=db.prepare('SELECT resetAt,blockedUntil FROM AuthThrottle WHERE email=?').get(email)
  return row?.blockedUntil && row.blockedUntil>Date.now() ? Math.ceil((row.blockedUntil-Date.now())/1000) : 0
}

export function recordAuthFailure(email) {
  const now=Date.now(), windowMs=15*60*1000
  const old=db.prepare('SELECT attempts,resetAt FROM AuthThrottle WHERE email=?').get(email)
  const attempts=!old || old.resetAt<=now ? 1 : old.attempts+1
  const resetAt=!old || old.resetAt<=now ? now+windowMs : old.resetAt
  const blockedUntil=attempts>=10 ? now+windowMs : null
  db.prepare(`INSERT INTO AuthThrottle(email,attempts,resetAt,blockedUntil) VALUES(?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET attempts=excluded.attempts,resetAt=excluded.resetAt,blockedUntil=excluded.blockedUntil`)
    .run(email,attempts,resetAt,blockedUntil)
}

export function clearAuthFailures(email) {
  db.prepare('DELETE FROM AuthThrottle WHERE email=?').run(email)
}

export function savePasswordResetToken(userId, tokenHash, expiresAt) {
  db.prepare('DELETE FROM PasswordResetToken WHERE expiresAt<=?').run(Date.now())
  db.prepare('DELETE FROM PasswordResetToken WHERE userId=?').run(userId)
  db.prepare('INSERT INTO PasswordResetToken(tokenHash,userId,expiresAt,createdAt) VALUES(?,?,?,?)').run(tokenHash,userId,expiresAt,Date.now())
}

export function consumePasswordResetToken(tokenHash, passwordHash) {
  const now=Date.now()
  db.exec('BEGIN IMMEDIATE')
  try {
    const token=db.prepare('SELECT userId FROM PasswordResetToken WHERE tokenHash=? AND expiresAt>?').get(tokenHash,now)
    if(!token){db.exec('ROLLBACK');return false}
    db.prepare('UPDATE User SET passwordHash=?,passwordChangedAt=? WHERE id=? AND role=\'CUSTOMER\'').run(passwordHash,now,token.userId)
    db.prepare('DELETE FROM PasswordResetToken WHERE userId=?').run(token.userId)
    db.exec('COMMIT')
    return true
  } catch(error) {db.exec('ROLLBACK');throw error}
}

export async function verifyPaystackPayment(reference) {
  const payment = db.prepare(`SELECT p.id,p.orderId,p.amount,p.status,o.totalPrice FROM Payment p JOIN Orders o ON o.id=p.orderId WHERE p.reference=?`).get(reference)
  if (!payment) return { ok: false, status: 404, message: 'Payment reference not found' }
  if (payment.status === 'SUCCESS') return { ok: true, orderId: payment.orderId, alreadyVerified: true }
  if (payment.status === 'FAILED') return { ok: false, status: 402, orderId: payment.orderId, message: 'This payment attempt failed' }

  const secret = process.env.PAYSTACK_SECRET_KEY || ''
  if (!secret.startsWith('sk_test_')) return { ok: false, status: 503, message: 'Paystack test secret key is not configured' }
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  const result = await response.json().catch(() => ({}))
  const expectedAmount = Math.round(payment.totalPrice * 100)
  if (!response.ok || result?.data?.status !== 'success' || result?.data?.amount !== expectedAmount || payment.amount !== expectedAmount) {
    failPayment(reference)
    return { ok: false, status: 402, orderId: payment.orderId, message: 'Payment could not be verified' }
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare("UPDATE Payment SET status='SUCCESS' WHERE reference=? AND status='PENDING'").run(reference)
    db.prepare("UPDATE Orders SET status='PAID' WHERE id=? AND status='PENDING'").run(payment.orderId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { ok: true, orderId: payment.orderId, alreadyVerified: false }
}
