<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";

const password = ref("");
const confirmPassword = ref("");
const busy = ref(false);
const errorMessage = ref("");
const router = useRouter();

async function updatePassword() {
  if (!supabase) return;
  errorMessage.value = "";
  if (password.value !== confirmPassword.value) {
    errorMessage.value = "Las contraseñas no coinciden.";
    return;
  }
  busy.value = true;
  const { error } = await supabase.auth.updateUser({ password: password.value });
  busy.value = false;
  if (error) errorMessage.value = error.message;
  else await router.replace("/admin/events");
}
</script>

<template>
  <section class="auth-card card">
    <p class="eyebrow">Recuperación de cuenta</p>
    <h1>Elige una nueva contraseña</h1>
    <p class="muted">Al terminar volverás a tus galas.</p>
    <form class="form-stack" @submit.prevent="updatePassword">
      <label class="field"><span>Nueva contraseña</span><input v-model="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="field"><span>Confirma la contraseña</span><input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>
      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? "Guardando…" : "ACTUALIZAR CONTRASEÑA" }}</button>
    </form>
  </section>
</template>
