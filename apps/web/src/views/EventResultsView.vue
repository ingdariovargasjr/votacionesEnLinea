<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { ApiError, apiRequest } from "../lib/api";
import { demoSession, demoStore } from "../lib/demo";

interface GalaEvent { id: string; name: string; timezone: string; }
interface ResultNominee { nomineeId: string; name: string; sortOrder: number; votes: number; uniqueVoters?: number; eventFighterId?: string | null; }
interface ResultFighter {
  identityKey: string;
  eventFighterId: string | null;
  name: string;
  identityNote: string;
  isAssigned: boolean;
  categoryCount: number;
  uniqueVoters: number;
  totalVotes: number;
}
interface ResultVersion {
  versionId: string;
  versionNumber: number;
  status: "published" | "archived" | "closed";
  isCurrent: boolean;
  publishedAt: string;
  totalSubmissions: number;
  totalVotes: number;
  nominees: ResultNominee[];
}
interface ResultBallot { ballotId: string; title: string; status: string; versions: ResultVersion[]; }
interface EventResults { eventId: string; totalSubmissions: number; totalVotes: number; fighters?: ResultFighter[]; ballots: ResultBallot[]; }

const route = useRoute();
const eventId = computed(() => typeof route.params.id === "string" ? route.params.id : "");
const event = ref<GalaEvent | null>(null);
const results = ref<EventResults | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const demoNotice = ref(false);

const versionCount = computed(() => results.value?.ballots.reduce((count, ballot) => count + ballot.versions.length, 0) ?? 0);
const assignedFighters = computed(() => (results.value?.fighters ?? []).filter((fighter) => fighter.isAssigned));
const unassignedFighters = computed(() => (results.value?.fighters ?? []).filter((fighter) => !fighter.isAssigned));
const topFighterVoters = computed(() => Math.max(0, ...assignedFighters.value.map((fighter) => fighter.uniqueVoters)));
const topFighterCount = computed(() => assignedFighters.value.filter((fighter) => fighter.uniqueVoters === topFighterVoters.value && fighter.uniqueVoters > 0).length);

function formatCount(value: number) {
  return new Intl.NumberFormat("es-MX").format(value);
}

function maxVotes(version: ResultVersion) {
  return Math.max(0, ...version.nominees.map((nominee) => nominee.votes));
}

function barWidth(version: ResultVersion, votes: number) {
  const maximum = maxVotes(version);
  return `${maximum === 0 ? 0 : Math.round((votes / maximum) * 100)}%`;
}

function isTopNominee(version: ResultVersion, votes: number) {
  return votes > 0 && votes === maxVotes(version);
}

function nomineeVoters(nominee: ResultNominee) {
  return nominee.uniqueVoters ?? 0;
}

function topNomineeCount(version: ResultVersion) {
  const maximum = maxVotes(version);
  return maximum > 0 ? version.nominees.filter((nominee) => nominee.votes === maximum).length : 0;
}

function fighterBarWidth(voters: number) {
  return `${topFighterVoters.value === 0 ? 0 : Math.round((voters / topFighterVoters.value) * 100)}%`;
}

function isTopFighter(fighter: ResultFighter) {
  return fighter.uniqueVoters > 0 && fighter.uniqueVoters === topFighterVoters.value;
}

function versionStatus(version: ResultVersion) {
  if (version.isCurrent && version.status === "published") return "Versión vigente";
  if (version.status === "archived") return "Archivada";
  if (version.status === "closed") return "Retirada";
  return "Publicada";
}

async function loadResults() {
  loading.value = true;
  errorMessage.value = "";
  demoNotice.value = false;
  results.value = null;
  try {
    if (demoSession.value) {
      const demoEvent = demoStore.events.find((item) => item.id === eventId.value);
      if (!demoEvent) throw new Error("No encontramos esta gala de demostración.");
      event.value = { id: demoEvent.id, name: demoEvent.name, timezone: "America/Mexico_City" };
      results.value = { eventId: demoEvent.id, totalSubmissions: 0, totalVotes: 0, fighters: [], ballots: [] };
      demoNotice.value = true;
      return;
    }
    const [eventResponse, resultsResponse] = await Promise.all([
      apiRequest<{ data: GalaEvent }>(`/api/v1/events/${eventId.value}`),
      apiRequest<{ data: EventResults }>(`/api/v1/events/${eventId.value}/results`),
    ]);
    event.value = eventResponse.data;
    results.value = resultsResponse.data;
  } catch (error) {
    errorMessage.value = error instanceof ApiError && error.status === 404
      ? "No encontramos esta gala o no tienes acceso a ella."
      : error instanceof Error ? error.message : "No se pudieron cargar los resultados.";
  } finally { loading.value = false; }
}

onMounted(loadResults);
watch(eventId, () => void loadResults());
</script>

<template>
  <section class="results-page">
    <RouterLink class="back-link" to="/admin/events">← Volver a galas</RouterLink>
    <div v-if="loading" class="card empty-card" role="status">Cargando resultados…</div>
    <div v-else-if="errorMessage" class="card empty-card">
      <div class="notice notice-error" role="alert">{{ errorMessage }}</div>
      <button class="button button-quiet" type="button" @click="loadResults">Reintentar</button>
    </div>
    <template v-else-if="event && results">
      <header class="page-heading results-heading">
        <div><p class="eyebrow">{{ event.name }}</p><h1>Resultados y participación</h1><p class="muted">Totales agregados por terna, versión y nominado.</p></div>
        <RouterLink class="button button-quiet" :to="`/admin/events/${event.id}/votings`">← Volver a votaciones</RouterLink>
      </header>

      <div v-if="demoNotice" class="notice notice-warning" role="status">La demostración no guarda votos. Los resultados reales aparecen al administrar una gala conectada a Supabase.</div>

      <section class="results-summary" aria-label="Resumen histórico de la gala">
        <article class="card results-summary-card"><span>Envíos registrados</span><strong>{{ formatCount(results.totalSubmissions) }}</strong><small>En todas las versiones publicadas</small></article>
        <article class="card results-summary-card"><span>Votos asignados</span><strong>{{ formatCount(results.totalVotes) }}</strong><small>Suma de las asignaciones recibidas</small></article>
        <article class="card results-summary-card"><span>Versiones publicadas</span><strong>{{ formatCount(versionCount) }}</strong><small>Incluye versiones archivadas y retiradas</small></article>
      </section>

      <p class="results-privacy-note">Cada envío representa una participación diaria en una terna; no equivale a una persona única. Los votos históricos se mantienen separados por versión. Este reporte no muestra identificadores ni datos personales.</p>

      <section class="card gala-fighter-ranking" aria-labelledby="gala-ranking-title">
        <header class="results-ballot-heading"><div><p class="eyebrow">Toda la gala</p><h2 id="gala-ranking-title">Luchadores más votados</h2></div><span v-if="topFighterCount" class="status-pill">{{ topFighterCount > 1 ? "Empate en el primer lugar" : "Líder de la gala" }}</span></header>
        <p class="results-ranking-explanation">Ordenado por identidades anónimas distintas que votaron por cada luchador, deduplicadas entre sus ternas. También se muestra la suma de votos asignados.</p>
        <ol v-if="assignedFighters.length" class="results-nominees gala-fighter-list">
          <li v-for="fighter in assignedFighters" :key="fighter.identityKey">
            <div class="results-nominee-label"><strong>{{ fighter.name }}<small v-if="fighter.identityNote"> · {{ fighter.identityNote }}</small></strong><span><strong>{{ formatCount(fighter.uniqueVoters) }}</strong> {{ fighter.uniqueVoters === 1 ? "identidad" : "identidades" }}</span></div>
            <div class="results-bar" role="img" :aria-label="`${fighter.name}: ${formatCount(fighter.uniqueVoters)} identidades anónimas distintas`"><span :style="{ width: fighterBarWidth(fighter.uniqueVoters) }"></span></div>
            <div class="gala-fighter-meta"><span>{{ formatCount(fighter.totalVotes) }} votos asignados</span><span>{{ formatCount(fighter.categoryCount) }} {{ fighter.categoryCount === 1 ? "terna" : "ternas" }}</span><b v-if="isTopFighter(fighter)" class="results-winner-badge">{{ topFighterCount > 1 ? "Empate" : "Más votado de la gala" }}</b></div>
          </li>
        </ol>
        <p v-else class="results-no-version">Todavía no hay identidades maestras vinculadas a nominaciones con votos.</p>
        <div v-if="unassignedFighters.length" class="results-unassigned">
          <strong>{{ unassignedFighters.length }} nominaciones sin luchador maestro</strong>
          <p>No se mezclan en el ranking general para evitar sumar luchadores distintos por error. Asígnalas desde <RouterLink :to="`/admin/events/${event.id}/votings`">Votaciones y nominados</RouterLink>.</p>
          <ul><li v-for="fighter in unassignedFighters" :key="fighter.identityKey">{{ fighter.name }} · {{ formatCount(fighter.uniqueVoters) }} identidades · {{ formatCount(fighter.totalVotes) }} votos</li></ul>
        </div>
      </section>

      <div v-if="!results.ballots.length" class="card empty-card results-empty">
        <span class="empty-icon">▤</span><h2>Aún no hay ternas</h2><p class="muted">Agrega votaciones a esta gala y publícalas para empezar a consultar resultados.</p>
        <RouterLink class="button button-primary" :to="`/admin/events/${event.id}/votings`">Administrar votaciones</RouterLink>
      </div>

      <div v-else class="results-ballots">
        <article v-for="ballot in results.ballots" :key="ballot.ballotId" class="card results-ballot-card">
          <header class="results-ballot-heading"><div><p class="eyebrow">Terna</p><h2>{{ ballot.title }}</h2></div><span class="status-pill">{{ ballot.status === "published" ? "Publicada" : ballot.status === "closed" ? "Retirada" : "Borrador" }}</span></header>
          <p v-if="!ballot.versions.length" class="results-no-version">Esta terna todavía no tiene una versión publicada ni resultados.</p>
          <details v-for="version in ballot.versions" :key="version.versionId" class="results-version" :open="version.isCurrent">
            <summary><span>Versión {{ version.versionNumber }} · {{ versionStatus(version) }}</span><time :datetime="version.publishedAt">{{ new Date(version.publishedAt).toLocaleDateString() }}</time></summary>
            <div class="results-version-summary"><span><strong>{{ formatCount(version.totalSubmissions) }}</strong> envíos</span><span><strong>{{ formatCount(version.totalVotes) }}</strong> votos asignados</span></div>
            <ol v-if="version.nominees.length" class="results-nominees">
              <li v-for="nominee in version.nominees" :key="nominee.nomineeId">
                <div class="results-nominee-label"><strong>{{ nominee.name }} <b v-if="isTopNominee(version, nominee.votes)" class="results-winner-badge">{{ topNomineeCount(version) > 1 ? "Empate" : "Más votado de la terna" }}</b></strong><span><strong>{{ formatCount(nominee.votes) }}</strong> {{ nominee.votes === 1 ? "voto" : "votos" }}<small class="results-unique-voters"> · {{ formatCount(nomineeVoters(nominee)) }} {{ nomineeVoters(nominee) === 1 ? "identidad" : "identidades" }}</small></span></div>
                <div class="results-bar" role="img" :aria-label="`${nominee.name}: ${formatCount(nominee.votes)} votos`"><span :style="{ width: barWidth(version, nominee.votes) }"></span></div>
              </li>
            </ol>
            <p v-else class="results-no-version">Esta versión no contiene nominados.</p>
          </details>
        </article>
      </div>
    </template>
  </section>
</template>
