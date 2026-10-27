declare namespace Express {
  export interface Request {
    adminUser?: { id: string; email?: string };
    account?: {
      id: string;
      email: string;
      role: "member" | "superuser";
      subscription_status: "payment_required" | "active" | "past_due" | "canceled" | "free";
      plan_code: "free" | "paid" | null;
    };
  }
}
