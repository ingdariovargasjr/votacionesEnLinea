<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { apiBaseUrl, apiRequest } from "../lib/api";

interface GalaEvent { id: string; name: string; status: string; }
interface BallotVersion {
  publicId: string;
  versionNumber: number;
  status: "published" | "archived" | "closed";
  isCurrent: boolean;
  publishedAt: string;
}
interface Ballot { id: string; title: string; sortOrder: number; versions: BallotVersion[]; }
interface IframeEntry { ballotId: string; ballotTitle: string; sortOrder: number; version: BallotVersion; }

const events = ref<GalaEvent[]>([]);
const selectedEventId = ref("");
const ballots = ref<Ballot[]>([]);
const allowedOrigins = ref<string[]>([]);
const loadingEvents = ref(true);
const loadingBallots = ref(false);
const errorMessage = ref("");
let requestSequence = 0;

const selectedEvent = computed(() => events.value.find((event) => event.id === selectedEventId.value) ?? null);
const currentOrigin = window.location.origin;
const originAllowed = computed(() => allowedOrigins.value.includes(currentOrigin));
const iframeEntries = computed<IframeEntry[]>(() => ballots.value.flatMap((ballot) =>
  ballot.versions.map((version) => ({ ballotId: ballot.id, ballotTitle: ballot.title, sortOrder: ballot.sortOrder, version })),
));

function iframeUrl(publicId: string) {
  return new URL(`/api/v1/embed/${publicId}`, apiBaseUrl || window.location.origin).href;
}

function versionLabel(version: BallotVersion) {
  if (version.status === "closed") return "Retirada";
  if (version.status === "archived") return "Archivada";
  return version.isCurrent ? "Activa" : "Publicada";
}

async function loadEvents() {
  loadingEvents.value = true;
  errorMessage.value = "";
  try {
    const { data } = await apiRequest<{ data: GalaEvent[] }>("/api/v1/events");
    events.value = data;
    if (!data.some((event) => event.id === selectedEventId.value)) {
      selectedEventId.value = data[0]?.id ?? "";
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "No se pudieron cargar las galas.";
  } finally {
    loadingEvents.value = false;
  }
}

async function refresh() {
  const previousEventId = selectedEventId.value;
  await loadEvents();
  if (selectedEventId.value && selectedEventId.value === previousEventId) await loadSelectedEvent();
}

async function loadSelectedEvent() {
  const eventId = selectedEventId.value;
  const sequence = ++requestSequence;
  ballots.value = [];
  allowedOrigins.value = [];
  errorMessage.value = "";
  if (!eventId) return;

  loadingBallots.value = true;
  try {
    const [ballotsResponse, originsResponse] = await Promise.all([
      apiRequest<{ data: Ballot[] }>(`/api/v1/events/${eventId}/votings`),
      apiRequest<{ data: { origins: string[] } }>(`/api/v1/events/${eventId}/embed-origins`),
    ]);
    if (sequence !== requestSequence) return;
    ballots.value = ballotsResponse.data;
    allowedOrigins.value = originsResponse.data.origins;
  } catch (error) {
    if (sequence === requestSequence) {
      errorMessage.value = error instanceof Error ? error.message : "No se pudieron cargar las votaciones de esta gala.";
    }
  } finally {
    if (sequence === requestSequence) loadingBallots.value = false;
  }
}

watch(selectedEventId, () => void loadSelectedEvent());
onMounted(loadEvents);
</script>

<template>
  <section class="testing-view">
    <RouterLink class="back-link" to="/admin/events">← Volver a galas</RouterLink>
    <header class="page-heading">
      <div>
        <p class="eyebrow">Entorno local</p>
        <h1>Visor de iframes</h1>
        <p class="muted">Elige una gala para cargar aquí cada iframe de sus versiones publicadas.</p>
      </div>
      <button class="button button-quiet" type="button" :disabled="loadingEvents || loadingBallots" @click="refresh">
        {{ loadingEvents || loadingBallots ? "Actualizando…" : "Actualizar" }}
      </button>
    </header>

    <div v-if="errorMessage" class="notice notice-error" role="alert">
      {{ errorMessage }}
      <button class="text-button" type="button" @click="selectedEventId ? loadSelectedEvent() : loadEvents()">Reintentar</button>
    </div>

    <div v-if="!loadingEvents && events.length" class="testing-toolbar card">
      <label class="field" for="testing-event">
        <span>Gala</span>
        <select id="testing-event" v-model="selectedEventId" :disabled="loadingEvents">
          <option v-for="event in events" :key="event.id" :value="event.id">{{ event.name }}</option>
        </select>
      </label>
      <div v-if="selectedEvent" class="testing-event-status">
        <span class="status-pill">{{ selectedEvent.status === "draft" ? "Borrador" : selectedEvent.status }}</span>
        <RouterLink :to="`/admin/events/${selectedEvent.id}/votings`">Configurar gala y dominios autorizados →</RouterLink>
      </div>
    </div>

    <div v-if="selectedEvent && !originAllowed && !loadingBallots" class="notice notice-warning">
      Para que los iframes carguen, autoriza este origen en la configuración de la gala:
      <code>{{ currentOrigin }}</code>
    </div>

    <div v-if="loadingEvents || loadingBallots" class="empty-card card" role="status">Cargando galas e iframes…</div>
    <div v-else-if="!events.length && !errorMessage" class="empty-card card">
      <span class="empty-icon">✦</span>
      <h2>Aún no tienes galas</h2>
      <p class="muted">Las galas aparecerán aquí cuando estén disponibles en tu cuenta.</p>
      <RouterLink class="button button-primary" to="/admin/events">Ir a galas</RouterLink>
    </div>
    <div v-else-if="selectedEvent && !iframeEntries.length && !errorMessage" class="empty-card card">
      <span class="empty-icon">▣</span>
      <h2>Esta gala todavía no tiene iframes</h2>
      <p class="muted">Publica una votación para generar su primera versión e iframe.</p>
      <RouterLink class="button button-primary" :to="`/admin/events/${selectedEvent.id}/votings`">Ir a votaciones</RouterLink>
    </div>

    <div v-else-if="iframeEntries.length" class="testing-grid">
      <article v-for="entry in iframeEntries" :key="entry.version.publicId" class="testing-card card">
        <header class="testing-card-heading">
          <div>
            <p class="eyebrow">{{ entry.ballotTitle }}</p>
            <h2>Versión {{ entry.version.versionNumber }}</h2>
          </div>
          <span class="status-pill" :class="`status-${entry.version.status}`">{{ versionLabel(entry.version) }}</span>
        </header>
        <p class="testing-public-id"><span>UUID público</span><code>{{ entry.version.publicId }}</code></p>
        <iframe
          class="testing-iframe"
          :src="iframeUrl(entry.version.publicId)"
          :title="`${entry.ballotTitle} · versión ${entry.version.versionNumber}`"
          loading="lazy"
          referrerpolicy="strict-origin-when-cross-origin"
        />
        <p class="testing-date">Publicada {{ new Date(entry.version.publishedAt).toLocaleString() }}</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.testing-toolbar { display: flex; align-items: end; justify-content: space-between; gap: 20px; padding: 18px 20px; margin-bottom: 18px; }
.testing-toolbar .field { flex: 1; max-width: 520px; }
.testing-toolbar select { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 11px; background: #fff; color: var(--text); }
.testing-event-status { display: flex; align-items: center; gap: 14px; font-size: 12px; font-weight: 800; }
.testing-event-status a { color: var(--accent); }
.testing-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); align-items: start; gap: 18px; }
.testing-card { min-width: 0; padding: 17px; }
.testing-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.testing-card-heading .eyebrow { margin-bottom: 3px; }
.testing-card-heading h2 { margin: 0; font-size: 18px; }
.testing-card .status-published { background: #e6f6ef; color: #12805c; }
.testing-card .status-archived { background: #eeeaf1; color: #655d6b; }
.testing-card .status-closed { background: #fff0f1; color: #a33146; }
.testing-public-id { display: grid; gap: 4px; margin-bottom: 11px; color: var(--muted); font-size: 10px; }
.testing-public-id code { overflow-wrap: anywhere; color: var(--text); }
.testing-iframe { display: block; width: 100%; height: 680px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.testing-date { margin: 9px 2px 0; color: var(--muted); font-size: 10px; }
@media (max-width: 760px) {
  .testing-grid { grid-template-columns: 1fr; }
  .testing-toolbar { align-items: stretch; flex-direction: column; }
  .testing-toolbar .field { max-width: none; }
  .testing-event-status { justify-content: space-between; }
}
</style>
