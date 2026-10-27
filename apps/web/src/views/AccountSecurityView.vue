<script setup lang="ts">
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { supabase } from "../lib/supabase";

const password = ref("");
const confirmPassword = ref("");
const busy = ref(false);
const successMessage = ref("");
const errorMessage = ref("");

async function changePassword() {
  if (!supabase) return;
  successMessage.value = "";
  errorMessage.value = "";
  if (password.value !== confirmPassword.value) {
    errorMessage.value = "Las contraseñas no coinciden.";
    return;
  }
  busy.value = true;
  const { error } = await supabase.auth.updateUser({ password: password.value });
  busy.value = false;
  if (error) errorMessage.value = error.message;
  else {
    password.value = "";
    confirmPassword.value = "";
    successMessage.value = "Contraseña actualizada.";
  }
}
</script>

<template>
  <section class="form-page">
    <RouterLink class="back-link" to="/admin/events">← Volver a mis galas</RouterLink>
    <form class="card editor-card" @submit.prevent="changePassword">
      <p class="eyebrow">Seguridad de la cuenta</p>
      <h1>Cambiar contraseña</h1>
      <p class="muted">Elige una contraseña nueva y única. Tus galas permanecen vinculadas a tu cuenta.</p>
      <div class="form-stack">
        <label class="field"><span>Nueva contraseña</span><input v-model="password" type="password" autocomplete="new-password" minlength="8" required></label>
        <label class="field"><span>Confirma la contraseña</span><input v-model="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>
      </div>
      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <p v-if="successMessage" class="notice notice-success" role="status">{{ successMessage }}</p>
      <div class="form-actions"><button class="button button-primary" type="submit" :disabled="busy">{{ busy ? "Actualizando…" : "ACTUALIZAR CONTRASEÑA" }}</button></div>
    </form>
  </section>
</template>
