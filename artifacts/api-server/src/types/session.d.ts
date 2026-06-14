import "express-session";

declare module "express-session" {
  interface SessionData {
    userId: number;
    userRole: string;
    userName: string;
    userEmail: string;
    employerAccountId: number | null;
    employerName: string | null;
  }
}
