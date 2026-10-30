export const db: any
export function createOrder(input: {
  customerName: string; customerEmail: string; customerPhone: string; sizeKg: number;
  quantity: number; fulfilment: 'PICKUP' | 'DELIVERY'; deliveryAddress: string
}): { id: string; totalPrice: number; deliveryFee: number; sizeKg: number; quantity: number; fulfilment: 'PICKUP' | 'DELIVERY'; createdAt: number }
export function getOrderForPayment(orderId: string): any
export function listStaffOrders(): Array<any>
export function listCustomerOrders(customerId:string): Array<any>
export function updateOrderStatus(orderId: string, status: string): boolean
export function listCylinders(): Array<{id:string;sizeKg:number;pricePerKg:number;active:number}>
export function saveCylinderPrices(cylinders: Array<{sizeKg:number;pricePerKg:number;active?:boolean}>): void
export function savePendingPayment(orderId: string, reference: string, amount: number): void
export function failPayment(reference: string): void
export function recordAutomationLog(type: string, orderId: string | undefined, customerId: string | null, status: 'SENT' | 'FAILED', error?: string | null): void
export function listAutomationLogs(): Array<any>
export function getAutomationCustomer(orderId: string): string | null
export function prepareOrderAutomation(orderId: string, type: string): {customerId:string; readyEmailSentAt:number|null} | null
export function markReadyEmailSent(orderId: string): void
export function findDueReminderCustomers(windowDays?: number): Array<{customerId:string;name:string;email:string;phone:string;sizeKg:number;averageDays:number;daysLeft:number;lastRefill:number}>
export function saveCustomerRefillEstimate(email: string, phone: string, days: number): boolean
export function getUserByEmail(email: string): any
export function getUserById(id: string): any
export function createUser(user: {name:string;email:string;phone:string;address?:string;passwordHash:string;role?:'CUSTOMER'|'STAFF'}): any
export function updateUserPassword(id:string,passwordHash:string): void
export function activateDemoCustomer(id:string,user:{name:string;phone:string;address?:string;passwordHash:string}): any
export function saveUserRefillEstimate(userId:string,days:number): boolean
export function saveUserCylinderRefillEstimate(userId:string,sizeKg:number,days:number): boolean
export function listUserCylinderRefillEstimates(userId:string): Array<{sizeKg:number;days:number}>
export function authThrottleSeconds(email:string): number
export function recordAuthFailure(email:string): void
export function clearAuthFailures(email:string): void
export function savePasswordResetToken(userId:string,tokenHash:string,expiresAt:number): void
export function consumePasswordResetToken(tokenHash:string,passwordHash:string): boolean
export function verifyPaystackPayment(reference: string): Promise<{ok:boolean; status?:number; message?:string; orderId?:string; alreadyVerified?:boolean}>
