import { Router } from "express";
import { requireAccount } from "../middleware/account-auth.js";

export const accountRouter = Router();

accountRouter.get("/me", requireAccount, (req, res) => {
  const account = req.account!;
  return res.json({ data: {
    id: account.id,
    email: account.email,
    role: account.role,
    planCode: account.plan_code,
    subscriptionStatus: account.subscription_status,
    canManageGalas: account.role === "superuser" || account.subscription_status === "active",
  } });
});
