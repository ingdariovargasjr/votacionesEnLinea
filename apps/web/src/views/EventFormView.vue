<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { apiRequest, ApiError } from "../lib/api";

interface GalaEvent { id: string; name: string; slug: string; description: string; timezone: string; status: string; }
const route = useRoute();
const router = useRouter();
const eventId = computed(() => typeof route.params.id === "string" ? route.params.id : "");
const isEdit = computed(() => Boolean(eventId.value));
const busy = ref(false);
const loading = ref(isEdit.value);
const errorMessage = ref("");
const form = reactive({ name: "", slug: "", description: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Mexico_City" });

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
}

function updateSlug() { if (!isEdit.value || !form.slug) form.slug = slugify(form.name); }

onMounted(async () => {
  if (!isEdit.value) return;
  try {
    const { data } = await apiRequest<{ data: GalaEvent }>(`/api/v1/events/${eventId.value}`);
    Object.assign(form, { name: data.name, slug: data.slug, description: data.description || "", timezone: data.timezone });
    if (data.status !== "draft") errorMessage.value = "Esta gala ya no está en borrador y no puede editarse desde ADM-01.";
  } catch (error) { errorMessage.value = error instanceof Error ? error.message : "No se pudo cargar la gala."; }
  finally { loading.value = false; }
});

async function save() {
  busy.value = true; errorMessage.value = "";
  try {
    const payload = { name: form.name.trim(), slug: form.slug.trim(), description: form.description.trim(), timezone: form.timezone.trim() };
    if (isEdit.value) await apiRequest<{ data: GalaEvent }>(`/api/v1/events/${eventId.value}`, { method: "PATCH", body: JSON.stringify(payload) });
    else await apiRequest<{ data: GalaEvent }>("/api/v1/events", { method: "POST", body: JSON.stringify(payload) });
    await router.replace("/admin/events");
  } catch (error) {
    errorMessage.value = error instanceof ApiError && error.code === "slug_taken"
      ? "Ese identificador ya está en uso. Elige otro."
      : error instanceof Error ? error.message : "No se pudo guardar la gala.";
  } finally { busy.value = false; }
}
</script>

<template>
  <section class="form-page">
    <RouterLink class="back-link" to="/admin/events">← Volver a galas</RouterLink>
    <div v-if="loading" class="card empty-card">Cargando gala…</div>
    <form v-else class="card editor-card" @submit.prevent="save">
      <p class="eyebrow">{{ isEdit ? "Borrador" : "Nueva premiación" }}</p>
      <h1>{{ isEdit ? "Editar gala" : "Crea tu gala" }}</h1>
      <p class="muted">Configura lo básico. En la siguiente historia agregarás las votaciones y nominados.</p>
      <div v-if="errorMessage" class="notice notice-error" role="alert">{{ errorMessage }}</div>
      <div class="form-stack">
        <label class="field"><span>Nombre de la gala *</span><input v-model="form.name" maxlength="100" required placeholder="Premios de creadores 2026" @input="!isEdit && updateSlug()"></label>
        <label class="field"><span>Identificador de URL *</span><input v-model="form.slug" maxlength="64" pattern="[a-z0-9]+(-[a-z0-9]+)*" required placeholder="premios-creadores-2026"><small>Minúsculas, números y guiones. Este identificador será único.</small></label>
        <label class="field"><span>Descripción</span><textarea v-model="form.description" maxlength="500" rows="3" placeholder="Una breve presentación para tu equipo."></textarea></label>
        <label class="field"><span>Zona horaria *</span><input v-model="form.timezone" maxlength="80" required placeholder="America/Mexico_City"><small>Se usará para calcular cuándo se reinician los votos diarios.</small></label>
      </div>
      <div class="form-actions"><button class="button button-primary" type="submit" :disabled="busy || Boolean(errorMessage && isEdit)">{{ busy ? "Guardando…" : "GUARDAR BORRADOR" }}</button><RouterLink class="button button-quiet" to="/admin/events">Cancelar</RouterLink></div>
      <RouterLink v-if="isEdit" class="back-link next-setup-link" :to="`/admin/events/${eventId}/votings`">Continuar a votaciones, colores e imágenes →</RouterLink>
    </form>
  </section>
</template>
