<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { CSSProperties } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { apiBaseUrl, apiRequest } from "../lib/api";
import { demoSession, demoStore, type DemoBallot } from "../lib/demo";

type VotingMode = "single_daily" | "five_daily";
interface GalaEvent { id: string; name: string; status: string; }
interface Nominee { id: string; apiId?: string; name: string; imagePath?: string | null; image?: string; eventFighterId: string | null; }
interface EventFighter { id: string; name: string; identityNote: string; }
interface BallotVersion { id: string; publicId: string; versionNumber: number; status: "published" | "archived" | "closed"; isCurrent: boolean; publishedAt: string; }
interface Ballot { id: string; publicId: string | null; currentVersion: number | null; hasUnpublishedChanges: boolean; versions: BallotVersion[]; title: string; description: string; votingMode: VotingMode; socialProgramId: string | null; status: string; sortOrder: number; nominees: Nominee[]; }
interface Requirement { id?: string; network: "Facebook" | "Instagram" | "TikTok"; actionType: "follow" | "like"; pageName: string; pageUrl: string; sortOrder?: number; }
interface SocialProgram { id: string; name: string; requirements: Requirement[]; }

const route = useRoute();
const eventId = computed(() => typeof route.params.id === "string" ? route.params.id : "");
const event = ref<GalaEvent | null>(null);
const ballotList = ref<Ballot[]>([]);
const eventFighters = ref<EventFighter[]>([]);
const programs = ref<SocialProgram[]>([]);
const embedOrigins = ref<string[]>([]);
const embedOriginsText = ref("");
const loading = ref(true);
const loadError = ref("");
const saveError = ref("");
const saveMessage = ref("");
const savingBallot = ref("");
const savingTheme = ref(false);
const savingProgram = ref(false);
const creatingFighter = ref(false);
const savingEmbedOrigins = ref(false);
const publishingBallotId = ref("");
const uploadingImageId = ref("");
const activeBallotId = ref("");
const activeProgramId = ref("");
const fighterForm = reactive({ name: "", identityNote: "" });
const fonts = ["DM Sans", "Manrope", "Arial", "Georgia", "system-ui"];
const theme = reactive({ primary: "#c70d96", secondary: "#e98cdb", fontFamily: "DM Sans" });

const ballots = computed(() => ballotList.value);
const activeBallot = computed(() => ballots.value.find((item) => item.id === activeBallotId.value) ?? ballots.value[0]);
const selectedProgram = computed(() => programs.value.find((item) => item.id === activeProgramId.value) ?? programs.value[0]);
const primaryText = computed(() => readableText(theme.primary));
const secondaryText = computed(() => readableText(theme.secondary));
const contrastWarning = computed(() => contrastRatio(theme.primary, primaryText.value) < 4.5 || contrastRatio(theme.secondary, secondaryText.value) < 4.5);
const previewStyle = computed(() => ({
  "--preview-primary": theme.primary,
  "--preview-secondary": theme.secondary,
  "--preview-primary-text": primaryText.value,
  "--preview-secondary-text": secondaryText.value,
  "--preview-font": `"${theme.fontFamily}", sans-serif`,
} as CSSProperties));

function normalizeBallot(value: Record<string, any>): Ballot {
  return {
    id: value.id,
    publicId: value.publicId ?? null,
    currentVersion: value.currentVersion ?? null,
    hasUnpublishedChanges: Boolean(value.hasUnpublishedChanges),
    versions: value.versions ?? [],
    title: value.title,
    description: value.description ?? "",
    votingMode: value.votingMode ?? value.mode ?? "single_daily",
    socialProgramId: value.socialProgramId ?? null,
    status: value.status ?? "draft",
    sortOrder: value.sortOrder ?? 0,
    nominees: (value.nominees ?? []).map((nominee: Record<string, any>, index: number) => ({
      id: nominee.id ?? crypto.randomUUID(),
      apiId: typeof nominee.id === "string" ? nominee.id : undefined,
      name: nominee.name ?? "",
      imagePath: nominee.imagePath ?? null,
      image: nominee.imageUrl ?? nominee.image ?? undefined,
      eventFighterId: nominee.eventFighterId ?? null,
      sortOrder: nominee.sortOrder ?? index,
    })),
  };
}

async function loadConfiguration() {
  loading.value = true;
  loadError.value = "";
  try {
    if (demoSession.value) {
      const demoEvent = demoStore.events.find((item) => item.id === eventId.value);
      if (!demoEvent) throw new Error("No encontramos esta gala de demostración.");
      event.value = { id: demoEvent.id, name: demoEvent.name, status: demoEvent.status };
      const demoTheme = demoStore.themeByEvent[eventId.value];
      if (demoTheme) Object.assign(theme, { primary: demoTheme.primary, secondary: demoTheme.secondary, fontFamily: demoTheme.fontFamily });
      ballotList.value = (demoStore.ballotsByEvent[eventId.value] ?? []).map((ballot, index) => normalizeBallot({ ...ballot, sortOrder: index }));
      const demoFighters = new Map<string, EventFighter>();
      for (const ballot of ballotList.value) for (const nominee of ballot.nominees) {
        const key = nominee.name.trim().replace(/\s+/g, " ").toLowerCase();
        if (!key) continue;
        if (!demoFighters.has(key)) demoFighters.set(key, { id: `demo-fighter:${key}`, name: nominee.name, identityNote: "" });
        nominee.eventFighterId = demoFighters.get(key)!.id;
      }
      eventFighters.value = [...demoFighters.values()];
      embedOrigins.value = [];
      embedOriginsText.value = "";
      const socialPages = demoTheme?.socialPages ?? [];
      programs.value = socialPages.length ? [{
        id: "demo-social-program",
        name: "Programa social de demostración",
        requirements: socialPages.map((page) => ({ id: page.id, network: page.network, actionType: "follow" as const, pageName: page.name, pageUrl: page.url })),
      }] : [];
    } else {
      const [eventResponse, ballotsResponse, programsResponse, themeResponse, embedOriginsResponse, fightersResponse] = await Promise.all([
        apiRequest<{ data: GalaEvent }>(`/api/v1/events/${eventId.value}`),
        apiRequest<{ data: Record<string, any>[] }>(`/api/v1/events/${eventId.value}/votings`),
        apiRequest<{ data: SocialProgram[] }>("/api/v1/social-programs"),
        apiRequest<{ data: { primaryColor: string; secondaryColor: string; fontFamily: string } }>(`/api/v1/events/${eventId.value}/theme`),
        apiRequest<{ data: { origins: string[] } }>(`/api/v1/events/${eventId.value}/embed-origins`),
        apiRequest<{ data: EventFighter[] }>(`/api/v1/events/${eventId.value}/fighters`),
      ]);
      event.value = eventResponse.data;
      ballotList.value = ballotsResponse.data.map(normalizeBallot);
      programs.value = programsResponse.data;
      eventFighters.value = fightersResponse.data;
      Object.assign(theme, { primary: themeResponse.data.primaryColor, secondary: themeResponse.data.secondaryColor, fontFamily: themeResponse.data.fontFamily });
      embedOrigins.value = embedOriginsResponse.data.origins;
      embedOriginsText.value = embedOrigins.value.join("\n");
    }
    activeBallotId.value = ballotList.value[0]?.id ?? "";
    activeProgramId.value = ballotList.value.find((item) => item.socialProgramId)?.socialProgramId ?? programs.value[0]?.id ?? "";
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : "No se pudo cargar la configuración.";
  } finally { loading.value = false; }
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function fighterOptionLabel(fighter: EventFighter) {
  const matchingNames = eventFighters.value.filter((item) => item.name.trim().toLowerCase() === fighter.name.trim().toLowerCase());
  if (matchingNames.length > 1) return `${fighter.name} · ${fighter.identityNote || fighter.id.slice(0, 6)}`;
  return fighter.identityNote ? `${fighter.name} · ${fighter.identityNote}` : fighter.name;
}

async function createFighter() {
  if (fighterForm.name.trim().length < 2) { saveError.value = "Escribe al menos dos caracteres para el nombre maestro."; return; }
  creatingFighter.value = true; saveError.value = ""; saveMessage.value = "";
  try {
    let fighter: EventFighter;
    if (demoSession.value) {
      fighter = { id: `demo-fighter:${crypto.randomUUID()}`, name: fighterForm.name.trim(), identityNote: fighterForm.identityNote.trim() };
    } else {
      const { data } = await apiRequest<{ data: EventFighter }>(`/api/v1/events/${eventId.value}/fighters`, {
        method: "POST", body: JSON.stringify({ name: fighterForm.name, identityNote: fighterForm.identityNote }),
      });
      fighter = data;
    }
    eventFighters.value.unshift(fighter);
    fighterForm.name = "";
    fighterForm.identityNote = "";
    saveMessage.value = demoSession.value ? "Luchador agregado solo a la demostración." : "Identidad maestra creada; asígnala a cada nominación correspondiente.";
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo crear el luchador maestro."; }
  finally { creatingFighter.value = false; }
}

function relativeLuminance(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(background: string, foreground: string) {
  const luminances = [relativeLuminance(background), relativeLuminance(foreground)].sort((a, b) => b - a);
  return (luminances[0]! + 0.05) / (luminances[1]! + 0.05);
}

function readableText(background: string) {
  const dark = "#211b26";
  const light = "#ffffff";
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

async function saveTheme() {
  savingTheme.value = true;
  saveError.value = "";
  saveMessage.value = "";
  try {
    if (demoSession.value) {
      const demoTheme = demoStore.themeByEvent[eventId.value];
      if (demoTheme) Object.assign(demoTheme, { primary: theme.primary, secondary: theme.secondary, fontFamily: theme.fontFamily });
      saveMessage.value = "Apariencia actualizada solo en esta demostración; no se guarda al recargar.";
    } else {
      const { data } = await apiRequest<{ data: { primaryColor: string; secondaryColor: string; fontFamily: string } }>(`/api/v1/events/${eventId.value}/theme`, {
        method: "PUT",
        body: JSON.stringify({ primaryColor: theme.primary, secondaryColor: theme.secondary, fontFamily: theme.fontFamily }),
      });
      Object.assign(theme, { primary: data.primaryColor, secondary: data.secondaryColor, fontFamily: data.fontFamily });
      saveMessage.value = "Apariencia guardada en Supabase y aplicada a todas las ternas de esta gala.";
    }
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo guardar la apariencia."; }
  finally { savingTheme.value = false; }
}

async function addBallot() {
  saveError.value = "";
  try {
    let ballot: Ballot;
    if (demoSession.value) {
      const item: DemoBallot = { id: crypto.randomUUID(), title: "Nueva terna", description: "Elige a tus favoritos.", mode: "single_daily", nominees: [], socialProgramId: null };
      demoStore.ballotsByEvent[eventId.value]?.push(item);
      ballot = normalizeBallot({ ...item, sortOrder: ballotList.value.length });
    } else {
      const { data } = await apiRequest<{ data: Record<string, any> }>(`/api/v1/events/${eventId.value}/votings`, {
        method: "POST",
        body: JSON.stringify({ title: "Nueva terna", description: "Elige a tus favoritos.", votingMode: "single_daily", socialProgramId: null }),
      });
      ballot = normalizeBallot(data);
    }
    ballotList.value.push(ballot);
    activeBallotId.value = ballot.id;
    saveMessage.value = demoSession.value ? "Cambio temporal de demostración." : "Terna creada como borrador.";
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo crear la terna."; }
}

async function saveBallot(ballot: Ballot) {
  if (demoSession.value) {
    const source = demoStore.ballotsByEvent[eventId.value]?.find((item) => item.id === ballot.id);
      if (source) Object.assign(source, { title: ballot.title, description: ballot.description, mode: ballot.votingMode, socialProgramId: ballot.socialProgramId, nominees: ballot.nominees.map((item) => ({ id: item.id, name: item.name, image: item.image, eventFighterId: item.eventFighterId })) });
    saveMessage.value = "Cambios visibles solo en esta demostración; no se guardan.";
    return;
  }
  savingBallot.value = ballot.id;
  saveError.value = "";
  saveMessage.value = "";
  try {
    const { data } = await apiRequest<{ data: Record<string, any> }>(`/api/v1/votings/${ballot.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: ballot.title,
        description: ballot.description,
        votingMode: ballot.votingMode,
        socialProgramId: ballot.socialProgramId,
        nominees: ballot.nominees.map((nominee) => ({ ...(nominee.apiId ? { id: nominee.apiId } : {}), name: nominee.name, eventFighterId: nominee.eventFighterId })),
      }),
    });
    const index = ballotList.value.findIndex((item) => item.id === ballot.id);
    if (index >= 0) {
      const localImages = ballot.nominees.map((nominee) => nominee.image);
      const updated = normalizeBallot(data);
      updated.nominees = updated.nominees.map((nominee, nomineeIndex) => ({ ...nominee, image: nominee.image ?? localImages[nomineeIndex] }));
      ballotList.value[index] = updated;
    }
    saveMessage.value = "Terna y nominados guardados en Supabase.";
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo guardar la terna."; }
  finally { savingBallot.value = ""; }
}

function replaceBallot(updatedValue: Record<string, any>) {
  const index = ballotList.value.findIndex((item) => item.id === updatedValue.id);
  if (index >= 0) ballotList.value[index] = normalizeBallot(updatedValue);
}

async function publishBallot(ballot: Ballot) {
  if (demoSession.value) { saveError.value = "La publicación requiere una gala guardada en Supabase."; return; }
  const confirmation = ballot.status === "published"
    ? "Publicar una nueva versión hará que esta configuración reemplace a la actual. La versión y los votos anteriores se conservarán. ¿Continuar?"
    : "Publicar esta votación y habilitar su versión pública?";
  if (!window.confirm(confirmation)) return;
  publishingBallotId.value = ballot.id;
  saveError.value = ""; saveMessage.value = "";
  try {
    const { data } = await apiRequest<{ data: Record<string, any> }>(`/api/v1/votings/${ballot.id}/publish`, { method: "POST" });
    replaceBallot(data);
    saveMessage.value = `Votación publicada como versión ${data.currentVersion}. La versión anterior permanece en el historial.`;
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo publicar la votación."; }
  finally { publishingBallotId.value = ""; }
}

async function retireBallot(ballot: Ballot) {
  if (demoSession.value || !window.confirm("Retirar la votación bloqueará nuevas participaciones sin borrar su versión publicada. ¿Continuar?")) return;
  publishingBallotId.value = ballot.id;
  saveError.value = ""; saveMessage.value = "";
  try {
    const { data } = await apiRequest<{ data: Record<string, any> }>(`/api/v1/votings/${ballot.id}/retire`, { method: "POST" });
    replaceBallot(data);
    saveMessage.value = "Votación retirada. Su versión publicada se conserva en el historial.";
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo retirar la votación."; }
  finally { publishingBallotId.value = ""; }
}

async function saveEmbedOrigins() {
  savingEmbedOrigins.value = true; saveError.value = ""; saveMessage.value = "";
  try {
    const origins = embedOriginsText.value.split(/\r?\n/).map((origin) => origin.trim()).filter(Boolean);
    if (demoSession.value) {
      embedOrigins.value = origins;
      saveMessage.value = "Cambios temporales de demostración; los dominios no se guardan.";
    } else {
      const { data } = await apiRequest<{ data: { origins: string[] } }>(`/api/v1/events/${eventId.value}/embed-origins`, {
        method: "PUT", body: JSON.stringify({ origins }),
      });
      embedOrigins.value = data.origins;
      embedOriginsText.value = data.origins.join("\n");
      saveMessage.value = "Dominios permitidos guardados.";
    }
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudieron guardar los dominios."; }
  finally { savingEmbedOrigins.value = false; }
}

function iframeSnippet(ballot: Ballot) {
  if (!ballot.publicId) return "";
  const escapeAttribute = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
  let src: string;
  try {
    const url = new URL(`${apiBaseUrl}/api/v1/embed/${ballot.publicId}`, window.location.origin);
    if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password) return "";
    src = url.href;
  } catch { return ""; }
  return `<iframe src="${escapeAttribute(src)}" title="${escapeAttribute(ballot.title)}" width="100%" height="680" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="display:block;width:100%;max-width:100%;height:680px;min-height:360px;border:0"></iframe>`;
}

async function copyIframeSnippet(ballot: Ballot) {
  try {
    await navigator.clipboard.writeText(iframeSnippet(ballot));
    saveMessage.value = "Código iframe copiado.";
    saveError.value = "";
  } catch { saveError.value = "No se pudo copiar automáticamente; selecciona y copia el código."; }
}

async function removeBallot(id: string) {
  if (!window.confirm("¿Eliminar esta terna y sus nominados? Esta acción no se puede deshacer.")) return;
  try {
    if (demoSession.value) {
      const source = demoStore.ballotsByEvent[eventId.value] ?? [];
      demoStore.ballotsByEvent[eventId.value] = source.filter((item) => item.id !== id);
    } else await apiRequest<void>(`/api/v1/votings/${id}`, { method: "DELETE" });
    ballotList.value = ballotList.value.filter((item) => item.id !== id);
    if (activeBallotId.value === id) activeBallotId.value = ballotList.value[0]?.id ?? "";
    saveMessage.value = demoSession.value ? "Eliminado solo en esta demostración." : "Terna eliminada.";
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo eliminar la terna."; }
}

function addNominee(ballot: Ballot) {
  ballot.nominees.push({ id: crypto.randomUUID(), name: "Nuevo nominado", eventFighterId: null });
}

function removeNominee(ballot: Ballot, nomineeId: string) {
  ballot.nominees = ballot.nominees.filter((item) => item.id !== nomineeId);
}

function moveNominee(ballot: Ballot, nomineeId: string, direction: -1 | 1) {
  const index = ballot.nominees.findIndex((item) => item.id === nomineeId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ballot.nominees.length) return;
  const [nominee] = ballot.nominees.splice(index, 1);
  ballot.nominees.splice(targetIndex, 0, nominee!);
}

async function uploadImage(nominee: Nominee, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    window.alert("Usa una imagen JPG, PNG o WebP."); input.value = ""; return;
  }
  if (file.size > 5 * 1024 * 1024) {
    window.alert("La imagen debe pesar 5 MB o menos."); input.value = ""; return;
  }
  if (nominee.image?.startsWith("blob:")) URL.revokeObjectURL(nominee.image);
  if (demoSession.value) {
    nominee.image = URL.createObjectURL(file);
    saveMessage.value = "Imagen temporal de demostración; no se sube a Supabase.";
    input.value = "";
    return;
  }
  if (!nominee.apiId) {
    window.alert("Guarda primero la terna y los nominados; después podrás subir su imagen.");
    input.value = "";
    return;
  }

  uploadingImageId.value = nominee.id;
  saveError.value = "";
  saveMessage.value = "";
  try {
    const { data } = await apiRequest<{ data: { imagePath: string; imageUrl: string } }>(`/api/v1/nominees/${nominee.apiId}/image`, { method: "PUT", body: file });
    nominee.imagePath = data.imagePath;
    nominee.image = data.imageUrl;
    saveMessage.value = "Imagen subida y guardada de forma privada en Supabase Storage.";
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "No se pudo subir la imagen.";
  } finally {
    uploadingImageId.value = "";
    input.value = "";
  }
}

async function removeImage(nominee: Nominee) {
  if (demoSession.value) {
    if (nominee.image?.startsWith("blob:")) URL.revokeObjectURL(nominee.image);
    delete nominee.image;
    nominee.imagePath = null;
    saveMessage.value = "Imagen quitada solo en esta demostración.";
    return;
  }
  if (!nominee.apiId) return;
  uploadingImageId.value = nominee.id;
  saveError.value = "";
  saveMessage.value = "";
  try {
    await apiRequest<{ data: { imagePath: null; imageUrl: null } }>(`/api/v1/nominees/${nominee.apiId}/image`, { method: "DELETE" });
    if (nominee.image?.startsWith("blob:")) URL.revokeObjectURL(nominee.image);
    delete nominee.image;
    nominee.imagePath = null;
    saveMessage.value = "Imagen quitada del nominado.";
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "No se pudo quitar la imagen.";
  } finally { uploadingImageId.value = ""; }
}

async function addProgram() {
  saveError.value = "";
  const name = `${event.value?.name ?? "Gala"} · Redes sociales`;
  try {
    let program: SocialProgram;
    if (demoSession.value) {
      program = { id: crypto.randomUUID(), name, requirements: [] };
      programs.value.push(program);
    } else {
      const { data } = await apiRequest<{ data: SocialProgram }>("/api/v1/social-programs", {
        method: "POST", body: JSON.stringify({ name, requirements: [] }),
      });
      program = data;
      programs.value.unshift(program);
    }
    activeProgramId.value = program.id;
    saveMessage.value = demoSession.value ? "Programa temporal de demostración." : "Programa social creado.";
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo crear el programa social."; }
}

function addSocialPage() {
  selectedProgram.value?.requirements.push({ id: crypto.randomUUID(), network: "Instagram", actionType: "follow", pageName: "", pageUrl: "" });
}

function removeSocialPage(page: Requirement) {
  if (selectedProgram.value) selectedProgram.value.requirements = selectedProgram.value.requirements.filter((item) => item !== page);
}

async function saveProgram() {
  if (!selectedProgram.value) return;
  if (selectedProgram.value.requirements.length > 4) { saveError.value = "Un programa puede tener hasta cuatro requisitos."; return; }
  savingProgram.value = true; saveError.value = ""; saveMessage.value = "";
  try {
    if (demoSession.value) {
      const demoTheme = demoStore.themeByEvent[eventId.value];
      if (demoTheme) demoTheme.socialPages = selectedProgram.value.requirements.map((item) => ({ id: item.id ?? crypto.randomUUID(), network: item.network, name: item.pageName, url: item.pageUrl }));
      saveMessage.value = "Cambios temporales de demostración; no se guardan.";
    } else {
      const { data } = await apiRequest<{ data: SocialProgram }>(`/api/v1/social-programs/${selectedProgram.value.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: selectedProgram.value.name, requirements: selectedProgram.value.requirements.map(({ network, actionType, pageName, pageUrl }) => ({ network, actionType, pageName, pageUrl })) }),
      });
      const index = programs.value.findIndex((item) => item.id === data.id);
      if (index >= 0) programs.value[index] = data;
      saveMessage.value = "Programa social guardado y disponible para reutilizar en otras ternas.";
    }
  } catch (error) { saveError.value = error instanceof Error ? error.message : "No se pudo guardar el programa social."; }
  finally { savingProgram.value = false; }
}

watch(eventId, loadConfiguration, { immediate: true });
</script>

<template>
  <section v-if="loading" class="card empty-card">Cargando configuración de la gala…</section>
  <section v-else-if="loadError" class="card empty-card"><div class="notice notice-error" role="alert">{{ loadError }}</div><RouterLink class="button button-quiet" to="/admin/events">Volver a galas</RouterLink></section>
  <section v-else-if="event" class="ballot-page">
    <RouterLink class="back-link" to="/admin/events">← Volver a galas</RouterLink>
    <header class="page-heading ballot-page-heading">
      <div><p class="eyebrow">{{ event.name }}</p><h1>Votaciones y nominados</h1><p class="muted">Cada terna se podrá publicar en su propio iframe.</p></div>
      <div class="ballot-heading-actions"><RouterLink class="button button-quiet compact-button" :to="`/admin/events/${eventId}/results`">Ver resultados</RouterLink><span class="demo-status">{{ demoSession ? "Vista de demostración" : "Borradores guardados en Supabase" }}</span></div>
    </header>
    <div v-if="saveError" class="notice notice-error" role="alert">{{ saveError }}</div>
    <div v-if="saveMessage" class="notice notice-success" role="status">{{ saveMessage }}</div>

    <div class="ballot-layout">
      <div class="ballot-editor-column">
        <section class="card config-card">
          <div class="config-title"><span class="config-icon">✦</span><div><h2>Apariencia de la gala</h2><p>Un solo tema se aplica a todas las ternas e iframes de esta gala.</p></div></div>
          <div class="theme-fields">
            <label class="theme-field"><span>Color principal de botones</span><span class="color-input"><input v-model="theme.primary" type="color" aria-label="Color principal de botones"><code>{{ theme.primary }}</code></span></label>
            <label class="theme-field"><span>Color secundario / acento</span><span class="color-input"><input v-model="theme.secondary" type="color" aria-label="Color secundario de botones"><code>{{ theme.secondary }}</code></span></label>
            <label class="theme-field font-field"><span>Tipografía</span><select v-model="theme.fontFamily"><option v-for="font in fonts" :key="font" :value="font">{{ font }}</option></select></label>
          </div>
          <div v-if="contrastWarning" class="notice notice-warning contrast-warning" role="status">El texto se ajustó automáticamente, pero uno de los colores no alcanza contraste AA (4.5:1). Considera elegir un tono más claro u oscuro.</div>
          <div class="theme-save-row"><p class="contrast-note">El texto de los botones se ajusta automáticamente para maximizar el contraste.</p><button class="button button-primary compact-button" type="button" :disabled="savingTheme" @click="saveTheme">{{ savingTheme ? "Guardando…" : "Guardar apariencia" }}</button></div>
        </section>

        <section class="card config-card embed-host-card">
          <div class="config-title"><span class="config-icon">⌘</span><div><h2>Dominios autorizados para el iframe</h2><p>Un origen HTTPS por línea, sin rutas. Máximo 20.</p></div></div>
          <label class="field"><span>Dominios</span><textarea v-model="embedOriginsText" rows="3" placeholder="https://www.ejemplo.com&#10;https://premios.ejemplo.com" aria-label="Dominios autorizados"></textarea></label>
          <div class="theme-save-row"><p class="contrast-note">{{ embedOrigins.length ? "Solo estos dominios podrán cargar la versión pública." : "Sin dominios autorizados, el acceso público queda bloqueado; puedes previsualizar como administrador." }}</p><button class="button button-quiet compact-button" type="button" :disabled="savingEmbedOrigins" @click="saveEmbedOrigins">{{ savingEmbedOrigins ? "Guardando…" : "Guardar dominios" }}</button></div>
        </section>

        <section class="card config-card social-program-card">
          <div class="program-heading"><div><h3>Programas sociales compartidos</h3><p>Reutiliza el mismo grupo de páginas en las ternas de cinco votos.</p></div><button class="button button-quiet compact-button" type="button" @click="addProgram">＋ Crear programa</button></div>
          <div v-if="programs.length" class="program-selector"><select v-model="activeProgramId" aria-label="Programa social activo"><option v-for="program in programs" :key="program.id" :value="program.id">{{ program.name }}</option></select></div>
          <div v-if="selectedProgram" class="program-edit">
            <label class="field"><span>Nombre del programa</span><input v-model="selectedProgram.name" maxlength="100"></label>
            <div class="nominee-editor-heading"><h3>Páginas requeridas (2–4 para publicar)</h3><button class="text-button" type="button" :disabled="selectedProgram.requirements.length >= 4" @click="addSocialPage">＋ Añadir página</button></div>
            <div v-if="!selectedProgram.requirements.length" class="social-empty">Añade de dos a cuatro páginas para usar este programa en una terna de cinco votos.</div>
            <div v-for="page in selectedProgram.requirements" :key="page.id" class="social-config-row social-config-detail">
              <select v-model="page.network" aria-label="Red social"><option>Facebook</option><option>Instagram</option><option>TikTok</option></select>
              <select v-model="page.actionType" aria-label="Acción social"><option value="follow">Seguir</option><option value="like">Dar like</option></select>
              <input v-model="page.pageName" maxlength="100" placeholder="Nombre de la página" aria-label="Nombre de la página">
              <input v-model="page.pageUrl" type="url" placeholder="https://..." aria-label="Enlace social">
              <button class="remove-button" type="button" aria-label="Quitar requisito" @click="removeSocialPage(page)">×</button>
            </div>
            <div class="program-actions"><button class="button button-quiet compact-button" type="button" :disabled="savingProgram" @click="saveProgram">{{ savingProgram ? "Guardando…" : "Guardar programa social" }}</button><small>Confirmación manual en el MVP; no verifica el follow.</small></div>
          </div>
          <div v-else class="social-empty">Aún no hay programas. Crea uno para asociarlo a tus ternas.</div>
        </section>

        <section class="card config-card fighter-roster-card">
          <div class="config-title"><span class="config-icon">♙</span><div><h2>Luchadores maestros de la gala</h2><p>Asocia al mismo luchador en todas sus ternas para consolidar el ranking general.</p></div></div>
          <form class="fighter-create-form" @submit.prevent="createFighter">
            <label class="field"><span>Nombre canónico</span><input v-model="fighterForm.name" maxlength="100" required placeholder="Nombre del luchador"></label>
            <label class="field"><span>Nota para distinguirlo (opcional)</span><input v-model="fighterForm.identityNote" maxlength="100" placeholder="Ej. luchador de la división junior"></label>
            <button class="button button-quiet compact-button" type="submit" :disabled="creatingFighter">{{ creatingFighter ? "Agregando…" : "＋ Agregar luchador" }}</button>
          </form>
          <p class="fighter-roster-help">Las asociaciones existentes se inicializaron con nombres iguales. Revisa homónimos y ajusta la identidad en cada nominado; las variantes se agrupan al elegir el mismo luchador maestro.</p>
          <div v-if="eventFighters.length" class="fighter-roster-list" aria-label="Luchadores maestros">
            <span v-for="fighter in eventFighters" :key="fighter.id" class="fighter-roster-chip">{{ fighterOptionLabel(fighter) }}</span>
          </div>
          <div v-else class="social-empty">Todavía no hay luchadores maestros. Créalo aquí y después asígnalo a los nominados correspondientes.</div>
        </section>

        <div class="ballot-list-heading"><div><h2>Ternas de la gala</h2><p>{{ ballots.length }} {{ ballots.length === 1 ? "votación" : "votaciones" }}</p></div><button class="button button-primary compact-button" type="button" @click="addBallot">＋ Nueva terna</button></div>
        <article v-for="(ballot, index) in ballots" :key="ballot.id" class="card ballot-config-card" :class="{ 'ballot-config-active': activeBallot?.id === ballot.id }">
          <div class="ballot-card-top"><span class="ballot-number">TERNA {{ String(index + 1).padStart(2, "0") }} · {{ ballot.status === "published" ? `PUBLICADA v${ballot.currentVersion}` : ballot.status === "closed" ? "RETIRADA" : "BORRADOR" }}</span><button v-if="ballot.status === 'draft'" class="text-button" type="button" @click="removeBallot(ballot.id)">Eliminar</button></div>
          <div v-if="ballot.status === 'published' && ballot.hasUnpublishedChanges" class="notice notice-warning">Hay cambios guardados que todavía no aparecen en la versión pública. Publica una nueva versión para aplicarlos.</div>
          <label class="field"><span>Nombre de la votación</span><input v-model="ballot.title" :disabled="ballot.status === 'closed'" maxlength="120" placeholder="Ej. Granjero favorito"></label>
          <label class="field"><span>Instrucciones para votar</span><textarea v-model="ballot.description" :disabled="ballot.status === 'closed'" rows="2" maxlength="500" placeholder="Explica cómo participar."></textarea></label>
          <label class="field"><span>Regla de votación</span><select v-model="ballot.votingMode" :disabled="ballot.status === 'closed'"><option value="single_daily">Un voto diario</option><option value="five_daily">Cinco votos diarios (requiere programa social)</option></select></label>
          <label v-if="ballot.votingMode === 'five_daily'" class="field"><span>Programa social compartido</span><select v-model="ballot.socialProgramId" :disabled="ballot.status === 'closed'"><option :value="null">Selecciona un programa</option><option v-for="program in programs" :key="program.id" :value="program.id">{{ program.name }}</option></select></label>
          <div class="nominee-editor-heading"><h3>Nominados</h3><button class="text-button" type="button" :disabled="ballot.status === 'closed'" @click="addNominee(ballot)">＋ Añadir nominado</button></div>
          <div v-if="ballot.nominees.length === 0" class="social-empty">Añade las personas nominadas en esta terna.</div>
          <div v-for="nominee in ballot.nominees" :key="nominee.id" class="nominee-edit-row">
            <div class="nominee-upload-preview"><img v-if="nominee.image" :src="nominee.image" :alt="`Vista previa de ${nominee.name}`" @error="nominee.image = undefined"><span v-else>{{ initials(nominee.name) || "?" }}</span></div>
            <div class="nominee-edit-fields"><input v-model="nominee.name" :disabled="ballot.status === 'closed'" maxlength="100" placeholder="Nombre del nominado" aria-label="Nombre del nominado"><label class="fighter-association"><span>Luchador maestro para el ranking general</span><select v-model="nominee.eventFighterId" :disabled="ballot.status === 'closed'"><option :value="null">Sin asociar</option><option v-for="fighter in eventFighters" :key="fighter.id" :value="fighter.id">{{ fighterOptionLabel(fighter) }}</option></select></label><div class="image-actions"><label class="image-upload-button" :class="{ 'image-upload-disabled': ballot.status === 'closed' || uploadingImageId === nominee.id || (!demoSession && !nominee.apiId) }">{{ uploadingImageId === nominee.id ? "Subiendo…" : nominee.imagePath || nominee.image ? "Cambiar imagen" : "＋ Subir imagen" }}<input type="file" accept="image/jpeg,image/png,image/webp" :disabled="ballot.status === 'closed' || uploadingImageId === nominee.id || (!demoSession && !nominee.apiId)" @change="uploadImage(nominee, $event)"></label><button v-if="nominee.image || nominee.imagePath" class="text-button" type="button" :disabled="ballot.status === 'closed' || uploadingImageId === nominee.id" @click="removeImage(nominee)">Quitar</button><small v-if="!demoSession && !nominee.apiId">Guarda primero la terna. JPEG, PNG o WebP · máx. 5 MB.</small><small v-else>JPEG, PNG o WebP · máx. 5 MB · almacenamiento privado</small></div></div>
            <div class="nominee-actions"><button class="remove-button" type="button" :disabled="ballot.status === 'closed' || ballot.nominees[0]?.id === nominee.id" aria-label="Mover nominado hacia arriba" @click="moveNominee(ballot, nominee.id, -1)">↑</button><button class="remove-button" type="button" :disabled="ballot.status === 'closed' || ballot.nominees.at(-1)?.id === nominee.id" aria-label="Mover nominado hacia abajo" @click="moveNominee(ballot, nominee.id, 1)">↓</button><button class="remove-button nominee-remove" type="button" :disabled="ballot.status === 'closed'" aria-label="Eliminar nominado" @click="removeNominee(ballot, nominee.id)">×</button></div>
          </div>
          <div class="ballot-actions"><button class="button button-primary compact-button" type="button" :disabled="ballot.status === 'closed' || savingBallot === ballot.id" @click="saveBallot(ballot)">{{ savingBallot === ballot.id ? "Guardando…" : ballot.status === 'published' ? "Guardar cambios" : ballot.status === 'closed' ? "Votación retirada" : "Guardar terna y nominados" }}</button><button class="preview-select" type="button" @click="activeBallotId = ballot.id">Vista previa local →</button><button v-if="ballot.status !== 'closed'" class="button button-quiet compact-button" type="button" :disabled="publishingBallotId === ballot.id" @click="publishBallot(ballot)">{{ publishingBallotId === ballot.id ? "Publicando…" : ballot.status === 'published' ? ballot.hasUnpublishedChanges ? "Publicar nueva versión" : `Publicada · v${ballot.currentVersion}` : "Publicar votación" }}</button><button v-if="ballot.status === 'published'" class="text-button" type="button" :disabled="publishingBallotId === ballot.id" @click="retireBallot(ballot)">Retirar</button></div>
          <section v-if="ballot.versions.length" class="version-history"><strong>Historial de versiones</strong><ul><li v-for="version in ballot.versions" :key="version.id">v{{ version.versionNumber }} · {{ version.status === "published" ? "Publicada" : version.status === "archived" ? "Archivada" : "Retirada" }} · {{ new Date(version.publishedAt).toLocaleString() }} <RouterLink v-if="version.publicId" :to="`/admin/preview/${version.publicId}`" target="_blank">Vista previa</RouterLink></li></ul></section>
          <section v-if="ballot.publicId && ballot.status === 'published'" class="embed-snippet"><div class="snippet-heading"><strong>Iframe · versión {{ ballot.currentVersion }}</strong><button class="text-button" type="button" :disabled="!embedOrigins.length" @click="copyIframeSnippet(ballot)">Copiar código</button></div><textarea :value="iframeSnippet(ballot)" rows="3" readonly aria-label="Código iframe"></textarea><p v-if="!embedOrigins.length" class="form-help">Configura al menos un dominio autorizado para activar el acceso público. Puedes usar la vista previa de administrador mientras tanto.</p></section>
          <RouterLink v-if="ballot.publicId" class="preview-select" :to="`/admin/preview/${ballot.publicId}`" target="_blank">Abrir vista previa aislada →</RouterLink>
        </article>
        <button class="button button-quiet add-ballot-bottom" type="button" @click="addBallot">＋ Añadir otra votación</button>
      </div>

      <aside class="preview-column">
        <div class="preview-heading"><div><span class="preview-live-dot"></span><strong>Vista previa del iframe</strong></div><small>No es pública</small></div>
        <div class="widget-preview" :style="previewStyle">
          <p class="preview-event-name">{{ event.name }}</p>
          <h2>{{ activeBallot?.title || "Título de la votación" }}</h2>
          <p class="preview-description">{{ activeBallot?.description || "Aquí aparecerán las instrucciones para votar." }}</p>
          <div class="preview-rule">{{ activeBallot?.votingMode === "five_daily" ? "✦ Cinco votos diarios" : "✓ Un voto diario" }}</div>
          <div v-if="activeBallot?.votingMode === 'five_daily' && selectedProgram?.requirements.length" class="preview-gate">Sigue las páginas de {{ selectedProgram.name }} para habilitar los cinco votos.</div>
          <div class="preview-nominees"><div v-for="nominee in activeBallot?.nominees ?? []" :key="nominee.id" class="preview-nominee"><span class="preview-avatar"><img v-if="nominee.image" :src="nominee.image" :alt="`Foto de ${nominee.name}`" @error="nominee.image = undefined"><span v-else>{{ initials(nominee.name) || "?" }}</span></span><strong>{{ nominee.name || "Nombre del nominado" }}</strong><button v-if="activeBallot?.votingMode === 'five_daily'" class="preview-step" type="button" aria-label="Restar voto">−</button><span v-if="activeBallot?.votingMode === 'five_daily'" class="preview-count">0</span><button v-if="activeBallot?.votingMode === 'five_daily'" class="preview-step preview-step-primary" type="button" aria-label="Añadir voto">+</button><input v-else type="radio" name="preview-nominee" aria-label="Elegir nominado"></div><div v-if="!activeBallot?.nominees.length" class="preview-empty">Los nominados aparecerán aquí.</div></div>
          <button class="preview-submit" type="button" :style="{ background: theme.primary, color: primaryText }">ENVIAR {{ activeBallot?.votingMode === "five_daily" ? "VOTOS" : "MI VOTO" }}</button>
        </div>
        <p class="preview-footnote">La terna, el tema y las imágenes se guardan en Supabase. El acceso público requiere publicar la votación y autorizar su dominio.</p>
      </aside>
    </div>
  </section>
</template>
