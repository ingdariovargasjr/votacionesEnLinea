<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { apiRequest, ApiError } from "../lib/api";

interface GalaEvent { id: string; name: string; slug: string; description: string; timezone: string; status: "draft" | "published" | "closed"; created_at: string; }
const events = ref<GalaEvent[]>([]);
const account = ref<{ email: string; role: "member" | "superuser"; planCode: string | null; subscriptionStatus: string; canManageGalas: boolean } | null>(null);
const busy = ref(true);
const errorMessage = ref("");
const canManageGalas = computed(() => Boolean(account.value?.canManageGalas));

async function loadEvents() {
  busy.value = true;
  errorMessage.value = "";
  try {
    const [accountResponse, eventsResponse] = await Promise.all([
      apiRequest<{ data: NonNullable<typeof account.value> }>("/api/v1/me"),
      apiRequest<{ data: GalaEvent[] }>("/api/v1/events"),
    ]);
    account.value = accountResponse.data;
    events.value = eventsResponse.data;
  }
  catch (error) {
    errorMessage.value = error instanceof ApiError && error.status === 403
      ? "Tu cuenta inició sesión, pero aún no está autorizada en ADMIN_USER_IDS del API."
      : error instanceof Error ? error.message : "No se pudieron cargar las galas.";
  } finally { busy.value = false; }
}

onMounted(loadEvents);
</script>

<template>
  <section>
    <div class="page-heading"><div><p class="eyebrow">Tu espacio</p><h1>Galas y premios</h1><p class="muted">Crea y administra las premiaciones. Las galas nuevas comienzan como borrador.</p></div><RouterLink v-if="canManageGalas" class="button button-primary" to="/admin/events/new">＋ Nueva gala</RouterLink></div>
    <div v-if="account?.role === 'superuser'" class="notice notice-success"><strong>Superusuario · acceso gratuito.</strong> Tus galas se conservan en tu cuenta y puedes volver a entrar cuando quieras.</div>
    <div v-else-if="account && !canManageGalas" class="notice notice-warning"><strong>Suscripción requerida.</strong> Tu cuenta está creada, pero necesitas una suscripción activa para crear o editar galas. La activación de pagos se habilitará en una siguiente historia.</div>
    <div v-if="errorMessage" class="notice notice-error" role="alert">{{ errorMessage }} <button class="text-button" type="button" @click="loadEvents">Reintentar</button></div>
    <div v-else-if="busy" class="empty-card card">Cargando tus galas…</div>
    <div v-else-if="events.length === 0" class="empty-card card"><span class="empty-icon">✦</span><h2>Aún no tienes galas</h2><p class="muted">{{ canManageGalas ? "Crea tu primera premiación; después podrás agregar las ternas y nominados." : "Tus galas aparecerán aquí cuando estén vinculadas a tu cuenta." }}</p><RouterLink v-if="canManageGalas" class="button button-primary" to="/admin/events/new">Crear mi primera gala</RouterLink></div>
    <div v-else class="event-grid">
      <article v-for="event in events" :key="event.id" class="event-card card">
        <div class="event-card-top"><span class="status-pill">{{ event.status === "draft" ? "Borrador" : event.status }}</span><span class="card-arrow">↗</span></div>
        <h2>{{ event.name }}</h2><p class="muted">{{ event.description || "Sin descripción todavía." }}</p>
        <div class="event-meta"><span>/{{ event.slug }}</span><span>{{ event.timezone }}</span></div>
        <div class="event-card-actions"><RouterLink :to="`/admin/events/${event.id}`">Editar gala</RouterLink><RouterLink :to="`/admin/events/${event.id}/votings`">Votaciones y diseño →</RouterLink><RouterLink :to="`/admin/events/${event.id}/results`">Resultados →</RouterLink></div>
      </article>
    </div>
  </section>
</template>
