<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { demoSession } from "./lib/demo";

const route = useRoute();
const router = useRouter();
const backendSignedIn = ref(false);
const signedIn = computed(() => demoSession.value || backendSignedIn.value);
let unsubscribe: (() => void) | undefined;

onMounted(async () => {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  backendSignedIn.value = Boolean(data.session);
  const listener = supabase.auth.onAuthStateChange((event, session) => {
    backendSignedIn.value = Boolean(session);
    if (event === "PASSWORD_RECOVERY") {
      void router.replace("/update-password");
      return;
    }
    if (!session && route.meta.requiresAuth) void router.replace("/login");
    else if (session && route.meta.guest && route.path !== "/update-password") void router.replace("/admin/events");
  });
  unsubscribe = () => listener.data.subscription.unsubscribe();
});

onUnmounted(() => unsubscribe?.());

async function signOut() {
  if (demoSession.value) {
    demoSession.value = false;
    await router.replace("/login");
    return;
  }
  await supabase?.auth.signOut();
  await router.replace("/login");
}
</script>

<template>
  <div class="app-shell" :class="{ 'widget-app-shell': route.meta.widget }">
    <header v-if="!route.meta.widget" class="topbar">
      <RouterLink class="brand" to="/admin/events"><span class="brand-mark">✦</span><span>Gala Studio<small>Administración de votaciones</small></span></RouterLink>
      <div v-if="signedIn && supabaseConfigured && !demoSession" class="account-actions"><RouterLink class="account-link" to="/testing">Probar iframes</RouterLink><RouterLink class="account-link" to="/account/security">Seguridad</RouterLink><button class="button button-quiet" type="button" @click="signOut">Cerrar sesión</button></div>
      <button v-else-if="signedIn && demoSession" class="button button-quiet" type="button" @click="signOut">Salir de demo</button>
    </header>
    <div v-if="demoSession && !route.meta.widget" class="demo-banner"><strong>Modo demostración.</strong> Los cambios son temporales y se pierden al recargar; Supabase/API no están conectados para esta vista.</div>
    <main class="page" :class="{ 'widget-app-main': route.meta.widget }"><RouterView /></main>
  </div>
</template>
