export function hashPassword(password: string): string
export function verifyPassword(password: string, encoded: string): boolean
export function timingSafeStringEqual(value: string, expectedValue: string): boolean
export function createPasswordResetToken(userId:string): string
export function completePasswordReset(token:string,password:string): boolean
export function issueSession(user: {id:string;role:string}): string
export function clearSession(): string
export function getSessionUser(request: Request): any
export function safeUser(user: any): any
