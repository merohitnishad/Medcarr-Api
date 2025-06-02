export {};

declare global {
  namespace Express {
    export interface Request {
      userId?: string;
      cleanBody?: any;
      role: string;
      rawBody?: Buffer;
    }
  }
}
