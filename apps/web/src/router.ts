import { createRouter, createWebHistory } from "vue-router";
import { supabase } from "./lib/supabase";
import { demoSession } from "./lib/demo";
import LoginView from "./views/LoginView.vue";
import EventsView from "./views/EventsView.vue";
import EventFormView from "./views/EventFormView.vue";
import EventBallotsView from "./views/EventBallotsView.vue";
import PasswordRecoveryView from "./views/PasswordRecoveryView.vue";
import AccountSecurityView from "./views/AccountSecurityView.vue";
import EventResultsView from "./views/EventResultsView.vue";
import PublicVotingView from "./views/PublicVotingView.vue";
import TestingView from "./views/TestingView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", component: LoginView, meta: { guest: true } },
    { path: "/update-password", component: PasswordRecoveryView, meta: { requiresAuth: true, passwordRecovery: true } },
    { path: "/account/security", component: AccountSecurityView, meta: { requiresAuth: true } },
    { path: "/", redirect: "/admin/events" },
    { path: "/admin/events", component: EventsView, meta: { requiresAuth: true } },
    { path: "/admin/events/new", component: EventFormView, meta: { requiresAuth: true } },
    { path: "/admin/events/:id", component: EventFormView, meta: { requiresAuth: true } },
    { path: "/admin/events/:id/votings", component: EventBallotsView, meta: { requiresAuth: true } },
    { path: "/admin/events/:id/results", component: EventResultsView, meta: { requiresAuth: true } },
    { path: "/testing", component: TestingView, meta: { requiresAuth: true } },
    { path: "/admin/preview/:publicId", component: PublicVotingView, meta: { requiresAuth: true, widget: true, adminPreview: true } },
    { path: "/widget/:publicId", component: PublicVotingView, meta: { widget: true } },
  ],
});

router.beforeEach(async (to) => {
  if (demoSession.value) return true;
  if (!supabase) return to.meta.requiresAuth ? { path: "/login" } : true;
  const { data } = await supabase.auth.getSession();
  if (to.meta.requiresAuth && !data.session) return { path: "/login", query: { next: to.fullPath } };
  if (to.meta.guest && data.session) return "/admin/events";
  return true;
});
