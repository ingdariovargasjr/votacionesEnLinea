<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import { useRoute } from "vue-router";
import { ApiError, apiRequest } from "../lib/api";

interface PublicNominee { id: string; name: string; imageUrl: string | null; sortOrder: number; }
interface PublicVoting {
  publicId: string;
  version: number;
  status: "published" | "archived" | "closed";
  canVote: boolean;
  eventName: string;
  timezone: string;
  title: string;
  description: string;
  votingMode: "single_daily" | "five_daily";
  socialProgramId: string | null;
  nominees: PublicNominee[];
  theme: { primaryColor: string; secondaryColor: string; fontFamily: string };
}
interface SocialRequirement {
  id: string;
  network: "Facebook" | "Instagram" | "TikTok";
  actionType: "follow" | "like";
  pageName: string;
  pageUrl: string;
  sortOrder: number;
  confirmedAt: string | null;
}
interface SocialProgramStatus {
  programId: string;
  programName: string;
  accessGranted: boolean;
  confirmedAt: string | null;
  confirmationMethod: "manual";
  requirements: SocialRequirement[];
}
interface VoteStatus { alreadyVoted: boolean; localDate: string; votingMode: "single_daily" | "five_daily"; socialAccessGranted: boolean; socialProgram: SocialProgramStatus | null; }

const route = useRoute();
const previewMode = computed(() => route.meta.adminPreview === true);
const voting = ref<PublicVoting | null>(null);
const loading = ref(true);
const errorMessage = ref("");
const voteStatus = ref<VoteStatus | null>(null);
const participantToken = ref("");
const participantLoading = ref(false);
const socialConfirming = ref(false);
const socialRequirementIds = ref<string[]>([]);
const socialError = ref("");
const voteError = ref("");
const voteMessage = ref("");
const submitting = ref(false);
const singleNomineeId = ref("");
const allocationCounts = reactive<Record<string, number>>({});
const assignedVotes = computed(() => Object.values(allocationCounts).reduce((total, count) => total + count, 0));
let pendingIdempotency: { selection: string; key: string } | null = null;
const participantIdentityStorageKey = "gala-voting:participant-token:v1";
const participantTokenStorageKey = (origin: string) => `gala-voting:participant-token:v1:${encodeURIComponent(origin)}`;
let requestNumber = 0;

const embedCredentials = computed(() => {
  const values = new URLSearchParams(window.location.hash.slice(1));
  return {
    origin: values.get("embedderOrigin") ?? "",
    token: values.get("embedToken") ?? "",
  };
});

const participantHeaders = computed(() => participantToken.value
  ? { "X-Participant-Token": participantToken.value }
  : undefined);

const widgetStyle = computed(() => ({
  "--widget-primary": voting.value?.theme.primaryColor ?? "#c70d96",
  "--widget-secondary": voting.value?.theme.secondaryColor ?? "#e98cdb",
  "--widget-primary-text": contrastText(voting.value?.theme.primaryColor ?? "#c70d96"),
  "--widget-secondary-text": contrastText(voting.value?.theme.secondaryColor ?? "#e98cdb"),
  "--widget-font": `"${voting.value?.theme.fontFamily ?? "DM Sans"}", sans-serif`,
} as CSSProperties));

function contrastText(hex: string) {
  const color = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16) / 255);
  const luminance = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  return luminance > 0.179 ? "#211b26" : "#ffffff";
}

function getStoredParticipantTokenForBrowser() {
  try { return window.localStorage.getItem(participantIdentityStorageKey) ?? ""; }
  catch { return ""; }
}

function getStoredParticipantToken(origin: string) {
  try { return window.localStorage.getItem(participantTokenStorageKey(origin)) ?? ""; }
  catch { return ""; }
}

function storeParticipantToken(token: string, origin: string) {
  try {
    window.localStorage.setItem(participantIdentityStorageKey, token);
    window.localStorage.setItem(participantTokenStorageKey(origin), token);
  }
  catch { /* storage may be partitioned or unavailable; keep the current session in memory */ }
}

async function loadVoteStatus(publicId: string, token: string) {
  const { data } = await apiRequest<{ data: VoteStatus }>(`/api/v1/public/votings/${publicId}/vote-status`, {
    headers: { "X-Participant-Token": token },
  });
  return data;
}

async function prepareParticipant(publicId: string, origin: string, requestHeaders: Record<string, string>) {
  let token = getStoredParticipantToken(origin) || getStoredParticipantTokenForBrowser();
  if (token) {
    try {
      const status = await loadVoteStatus(publicId, token);
      return { token, status };
    } catch (error) {
      if (!(error instanceof ApiError) || !["participant_identity_required", "embed_not_authorized"].includes(error.code ?? "")) throw error;
      try { window.localStorage.removeItem(participantTokenStorageKey(origin)); } catch { /* storage may be unavailable */ }
      if (error.code === "participant_identity_required") {
        try { window.localStorage.removeItem(participantIdentityStorageKey); } catch { /* storage may be unavailable */ }
        token = "";
      }
    }
  }

  const issueParticipantToken = (participantToken: string) => apiRequest<{ data: { participantId: string; participantToken: string } }>(
    `/api/v1/public/votings/${publicId}/participant`,
    { method: "POST", headers: requestHeaders, body: JSON.stringify(participantToken ? { participantToken } : {}) },
  );
  let result;
  try { result = await issueParticipantToken(getStoredParticipantTokenForBrowser()); }
  catch (error) {
    if (!(error instanceof ApiError) || error.code !== "participant_identity_required") throw error;
    try { window.localStorage.removeItem(participantIdentityStorageKey); } catch { /* storage may be unavailable */ }
    result = await issueParticipantToken("");
  }
  token = result.data.participantToken;
  storeParticipantToken(token, origin);
  return { token, status: await loadVoteStatus(publicId, token) };
}

async function loadVoting() {
  const currentRequest = ++requestNumber;
  loading.value = true;
  errorMessage.value = "";
  voting.value = null;
  voteError.value = "";
  voteMessage.value = "";
  voteStatus.value = null;
  participantToken.value = "";
  participantLoading.value = false;
  socialConfirming.value = false;
  socialRequirementIds.value = [];
  socialError.value = "";
  pendingIdempotency = null;
  for (const nomineeId of Object.keys(allocationCounts)) delete allocationCounts[nomineeId];
  singleNomineeId.value = "";
  const publicId = typeof route.params.publicId === "string" ? route.params.publicId : "";
  try {
    if (previewMode.value) {
      const { data } = await apiRequest<{ data: PublicVoting }>(`/api/v1/public/voting-versions/preview/${publicId}`);
      if (currentRequest !== requestNumber) return;
      voting.value = data;
    } else {
      const credentials = embedCredentials.value;
      const headers = credentials.origin && credentials.token
        ? { "X-Embedder-Origin": credentials.origin, "X-Embedder-Token": credentials.token }
        : undefined;
      const { data } = await apiRequest<{ data: PublicVoting }>(`/api/v1/public/votings/${publicId}`, { headers });
      if (currentRequest !== requestNumber) return;
      voting.value = data;
      for (const nominee of data.nominees) allocationCounts[nominee.id] = 0;
      if (data.canVote) {
        participantLoading.value = true;
        try {
          const participant = await prepareParticipant(publicId, credentials.origin, headers ?? {});
          if (currentRequest === requestNumber) {
            participantToken.value = participant.token;
            voteStatus.value = participant.status;
          }
        } finally {
          if (currentRequest === requestNumber) participantLoading.value = false;
        }
      }
    }
  } catch (error) {
    if (currentRequest === requestNumber) {
      if (voting.value && !previewMode.value) voteError.value = error instanceof Error ? error.message : "No se pudo preparar la identidad del navegador.";
      else errorMessage.value = error instanceof Error ? error.message : "No se pudo cargar la votación.";
    }
  } finally {
    if (currentRequest === requestNumber) loading.value = false;
  }
}

function changeAllocation(nomineeId: string, delta: -1 | 1) {
  const current = allocationCounts[nomineeId] ?? 0;
  if (delta < 0 && current === 0) return;
  if (delta > 0 && assignedVotes.value >= 5) return;
  allocationCounts[nomineeId] = current + delta;
  voteError.value = "";
  voteMessage.value = "";
}

function selectedAssignments() {
  if (!voting.value) return [];
  if (voting.value.votingMode === "single_daily") {
    return singleNomineeId.value ? [{ nomineeId: singleNomineeId.value, quantity: 1 }] : [];
  }
  return Object.entries(allocationCounts)
    .filter(([, quantity]) => quantity > 0)
    .map(([nomineeId, quantity]) => ({ nomineeId, quantity }))
    .sort((left, right) => left.nomineeId.localeCompare(right.nomineeId));
}

async function submitVote() {
  if (!voting.value || !participantToken.value || !voteStatus.value || submitting.value || !voting.value.canVote || voteStatus.value.alreadyVoted) return;
  if (voting.value.votingMode === "five_daily" && !voteStatus.value.socialAccessGranted) {
    voteError.value = "Confirma manualmente los requisitos del programa social antes de enviar los cinco votos.";
    return;
  }
  const assignments = selectedAssignments();
  if (voting.value.votingMode === "single_daily" && assignments.length !== 1) {
    voteError.value = "Selecciona un nominado antes de enviar.";
    return;
  }
  if (voting.value.votingMode === "five_daily" && assignedVotes.value !== 5) {
    voteError.value = "Debes asignar exactamente cinco votos antes de enviar.";
    return;
  }

  const selection = JSON.stringify(assignments);
  if (!pendingIdempotency || pendingIdempotency.selection !== selection) {
    pendingIdempotency = { selection, key: crypto.randomUUID() };
  }
  submitting.value = true;
  voteError.value = "";
  voteMessage.value = "";
  try {
    await apiRequest(`/api/v1/public/votings/${voting.value.publicId}/votes`, {
      method: "POST",
      headers: participantHeaders.value,
      body: JSON.stringify({ idempotencyKey: pendingIdempotency.key, assignments }),
    });
    if (voteStatus.value) voteStatus.value = { ...voteStatus.value, alreadyVoted: true };
    voteMessage.value = "Tu voto fue recibido. No podrás cambiarlo durante el día de hoy.";
    pendingIdempotency = null;
  } catch (error) {
    if (error instanceof ApiError && error.code === "daily_vote_limit_reached") {
      if (voteStatus.value) voteStatus.value = { ...voteStatus.value, alreadyVoted: true };
      voteMessage.value = error.message;
    } else if (error instanceof ApiError && error.code === "social_access_required") {
      voteError.value = "Debes completar la confirmación manual del programa social asociado antes de enviar. Esa confirmación no verifica que hayas seguido o indicado que te gusta la página.";
    } else {
      voteError.value = error instanceof Error ? error.message : "No se pudo enviar el voto. Puedes reintentar sin duplicarlo.";
    }
  } finally { submitting.value = false; }
}

async function confirmSocialAccess() {
  if (!voting.value || !voteStatus.value?.socialProgram || !participantToken.value || socialConfirming.value) return;
  const requirements = voteStatus.value.socialProgram.requirements;
  if (!requirements.length || socialRequirementIds.value.length !== requirements.length) {
    socialError.value = "Debes marcar cada requisito para confirmar.";
    return;
  }
  socialConfirming.value = true;
  socialError.value = "";
  try {
    const { data } = await apiRequest<{ data: SocialProgramStatus }>(
      `/api/v1/public/votings/${voting.value.publicId}/social-access/confirm`,
      {
        method: "POST",
        headers: participantHeaders.value,
        body: JSON.stringify({ requirementIds: requirements.map((item) => item.id) }),
      },
    );
    voteStatus.value = { ...voteStatus.value, socialAccessGranted: true, socialProgram: data };
    socialRequirementIds.value = [];
  } catch (error) {
    socialError.value = error instanceof Error ? error.message : "No se pudo guardar la confirmación. Inténtalo de nuevo.";
  } finally { socialConfirming.value = false; }
}

function socialActionLabel(requirement: SocialRequirement) {
  const action = requirement.actionType === "follow" ? "seguir" : "indicar que te gusta";
  return `${requirement.network}: ${action} ${requirement.pageName}`;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

watch(() => [route.params.publicId, previewMode.value] as const, () => void loadVoting(), { immediate: true });
</script>

<template>
  <main class="public-widget-page" :style="widgetStyle">
    <section v-if="loading" class="public-widget-card widget-loading" role="status">Cargando votación…</section>
    <section v-else-if="errorMessage" class="public-widget-card widget-error" role="alert">{{ errorMessage }}</section>
    <article v-else-if="voting" class="public-widget-card" :aria-labelledby="`widget-title-${voting.publicId}`">
      <p class="widget-event-name">{{ voting.eventName }}</p>
      <div class="widget-version">Versión {{ voting.version }} <span v-if="previewMode">· Vista previa privada</span></div>
      <h1 :id="`widget-title-${voting.publicId}`">{{ voting.title }}</h1>
      <p v-if="voting.description" class="widget-description">{{ voting.description }}</p>
      <div class="widget-rule">{{ voting.votingMode === "five_daily" ? "Cinco votos diarios" : "Un voto diario" }}</div>
      <div v-if="!voting.canVote" class="widget-closed" role="status">Esta versión ya no recibe votos. El historial de la votación se conserva.</div>
      <p v-if="!previewMode && voting.canVote && !voteStatus?.alreadyVoted" class="widget-voting-date">Límite diario según la zona horaria {{ voting.timezone }}.</p>
      <section v-if="voting.votingMode === 'five_daily' && voteStatus?.socialProgram && voting.canVote && !previewMode" class="widget-social-panel" aria-labelledby="social-access-title">
        <h2 id="social-access-title">{{ voteStatus.socialProgram.programName }}</h2>
        <p class="widget-social-disclaimer">La confirmación es manual y no verificada. No demuestra que hayas completado estas acciones. No pedimos tu contraseña ni acceso a tus redes. Se comparte con las ternas asociadas a este programa.</p>
        <div v-if="voteStatus.socialAccessGranted" class="widget-social-granted" role="status">
          Acceso habilitado mediante tu confirmación manual<span v-if="voteStatus.socialProgram.confirmedAt"> · {{ new Date(voteStatus.socialProgram.confirmedAt).toLocaleDateString() }}</span>.
        </div>
        <template v-else-if="voteStatus.socialProgram.requirements.length">
          <ul class="widget-social-requirements">
            <li v-for="requirement in voteStatus.socialProgram.requirements" :key="requirement.id">
              <label>
                <input v-model="socialRequirementIds" type="checkbox" :value="requirement.id" :disabled="socialConfirming || participantLoading || !participantToken">
                <span>{{ socialActionLabel(requirement) }}</span>
              </label>
              <a :href="requirement.pageUrl" target="_blank" rel="noopener noreferrer">Abrir enlace de {{ requirement.network }}<span class="visually-hidden"> (se abre en otra pestaña)</span></a>
            </li>
          </ul>
          <button class="widget-social-confirm" type="button" :disabled="socialConfirming || participantLoading || !participantToken || socialRequirementIds.length !== voteStatus.socialProgram.requirements.length" @click="confirmSocialAccess">
            {{ socialConfirming ? "Guardando confirmación…" : "Confirmo haber completado estas acciones" }}
          </button>
        </template>
        <p v-else class="widget-social-unavailable" role="status">Este programa todavía no tiene requisitos sociales configurados. Contacta a la organización de la gala.</p>
        <p v-if="socialError" class="widget-vote-error" role="alert">{{ socialError }}</p>
      </section>
      <p v-if="voting.votingMode === 'five_daily' && voteStatus && !voteStatus.socialProgram && voting.canVote && !previewMode" class="widget-social-unavailable" role="status">Esta terna no tiene un programa social disponible para habilitar los cinco votos. Contacta a la organización de la gala.</p>
      <p v-if="participantLoading" class="widget-votes-placeholder" role="status">Preparando una identidad anónima para este navegador…</p>
      <div v-if="voteStatus?.alreadyVoted && !previewMode" class="widget-received" role="status">{{ voteMessage || "Tu voto de hoy ya fue recibido. No puedes cambiarlo hasta el próximo día en la zona horaria de la gala." }}</div>
      <div v-if="voting.votingMode === 'single_daily'" class="public-nominee-list" role="radiogroup" :aria-label="`Elige un nominado para ${voting.title}`">
        <label v-for="nominee in voting.nominees" :key="nominee.id" class="public-nominee" :class="{ 'public-nominee-selected': singleNomineeId === nominee.id }">
          <span class="public-nominee-avatar"><img v-if="nominee.imageUrl" :src="nominee.imageUrl" :alt="`Foto de ${nominee.name}`" @error="nominee.imageUrl = null"><span v-else>{{ initials(nominee.name) || "?" }}</span></span>
          <strong>{{ nominee.name }}</strong>
          <input v-if="!previewMode && voting.canVote" v-model="singleNomineeId" type="radio" :disabled="participantLoading || !participantToken || submitting || voteStatus?.alreadyVoted" :name="`vote-${voting.publicId}`" :value="nominee.id" :aria-label="`Votar por ${nominee.name}`" @change="voteError = ''; voteMessage = ''">
        </label>
      </div>
      <ul v-else class="public-nominee-list" aria-label="Asigna votos a los nominados">
        <li v-for="nominee in voting.nominees" :key="nominee.id" class="public-nominee" :class="{ 'public-nominee-selected': (allocationCounts[nominee.id] ?? 0) > 0 }">
          <span class="public-nominee-avatar"><img v-if="nominee.imageUrl" :src="nominee.imageUrl" :alt="`Foto de ${nominee.name}`" @error="nominee.imageUrl = null"><span v-else>{{ initials(nominee.name) || "?" }}</span></span>
          <strong>{{ nominee.name }}</strong>
          <template v-if="!previewMode && voting.canVote && !voteStatus?.alreadyVoted">
            <button class="widget-step" type="button" :disabled="(allocationCounts[nominee.id] ?? 0) <= 0 || participantLoading || !participantToken || submitting" :aria-label="`Quitar un voto a ${nominee.name}`" @click="changeAllocation(nominee.id, -1)">−</button>
            <output class="widget-count" :aria-label="`${allocationCounts[nominee.id] ?? 0} votos asignados a ${nominee.name}`">{{ allocationCounts[nominee.id] ?? 0 }}</output>
            <button class="widget-step widget-step-add" type="button" :disabled="assignedVotes >= 5 || participantLoading || !participantToken || submitting" :aria-label="`Añadir un voto a ${nominee.name}`" @click="changeAllocation(nominee.id, 1)">+</button>
          </template>
        </li>
      </ul>
      <p v-if="voting.votingMode === 'five_daily' && !previewMode && voting.canVote && !voteStatus?.alreadyVoted" class="widget-vote-total" :aria-live="'polite'">Votos asignados: <strong>{{ assignedVotes }} de 5</strong></p>
      <div v-if="voteError" class="widget-vote-error" role="alert">{{ voteError }}</div>
      <div v-if="voteMessage && !voteStatus?.alreadyVoted" class="widget-received" role="status">{{ voteMessage }}</div>
      <button v-if="!previewMode && voting.canVote && !voteStatus?.alreadyVoted" class="widget-submit" type="button" :disabled="submitting || participantLoading || !participantToken || !voteStatus || (voting.votingMode === 'single_daily' && !singleNomineeId) || (voting.votingMode === 'five_daily' && (assignedVotes !== 5 || !voteStatus.socialAccessGranted))" @click="submitVote">{{ submitting ? "Enviando…" : voting.votingMode === "five_daily" ? "Enviar cinco votos" : "Enviar mi voto" }}</button>
      <p v-if="!previewMode && voting.canVote" class="widget-votes-placeholder">La identidad es anónima y se guarda solo en este navegador. No necesitas iniciar sesión ni compartir credenciales con el sitio anfitrión.</p>
      <p v-else-if="!voting.canVote" class="widget-retired-note">{{ voting.status === "archived" ? "Consulta la versión vigente en la página de la gala." : "Votación retirada." }}</p>
    </article>
  </main>
</template>
