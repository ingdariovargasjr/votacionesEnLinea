<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { demoSession } from "../lib/demo";

type AuthMode = "login" | "register" | "recover";
const mode = ref<AuthMode>("login");
const email = ref("");
const password = ref("");
const busy = ref(false);
const message = ref("");
const errorMessage = ref("");
const route = useRoute();
const router = useRouter();

function switchMode(next: AuthMode) {
  mode.value = next;
  message.value = "";
  errorMessage.value = "";
  password.value = "";
}

async function submitAuth() {
  if (!supabase) return;
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  try {
    if (mode.value === "register") {
      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: password.value,
        options: { emailRedirectTo: `${window.location.origin}/admin/events` },
      });
      if (error) throw error;
      if (data.session) await router.replace("/admin/events");
      else message.value = "Cuenta creada. Confirma tu correo con el enlace que te enviamos; después podrás iniciar sesión.";
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
    if (error) throw error;
    await router.replace(String(route.query.next || "/admin/events"));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "No se pudo completar el acceso.";
  } finally { busy.value = false; }
}

async function sendRecovery() {
  if (!supabase || !email.value.trim()) return;
  busy.value = true;
  message.value = "";
  errorMessage.value = "";
  const { error } = await supabase.auth.resetPasswordForEmail(email.value.trim(), {
    redirectTo: `${window.location.origin}/update-password`,
  });
  busy.value = false;
  if (error) errorMessage.value = error.message;
  else message.value = "Si existe una cuenta con ese correo, recibirás instrucciones para restablecer tu contraseña.";
}

function enterDemo() {
  demoSession.value = true;
  void router.replace("/admin/events");
}
</script>

<template>
  <section class="auth-card card">
    <p class="eyebrow">Cuenta de Gala Studio</p>
    <h1>{{ mode === "register" ? "Crea tu cuenta" : mode === "recover" ? "Recupera el acceso" : "Inicia sesión" }}</h1>
    <p class="muted">Tus galas quedan guardadas en tu cuenta; puedes volver a entrar aunque cambies de navegador.</p>

    <div v-if="!supabaseConfigured" class="notice notice-warning"><strong>Supabase no está conectado.</strong><br>Explora el panel con datos de demostración; no se guardarán los cambios.</div>
    <form v-else-if="mode === 'recover'" class="form-stack" @submit.prevent="sendRecovery">
      <label class="field"><span>Correo de tu cuenta</span><input v-model="email" type="email" autocomplete="email" required placeholder="tu@correo.com"></label>
      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <p v-if="message" class="notice notice-success" role="status">{{ message }}</p>
      <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? "Enviando…" : "ENVIAR RECUPERACIÓN" }}</button>
      <button class="text-button auth-switch" type="button" @click="switchMode('login')">Volver a iniciar sesión</button>
    </form>
    <form v-else-if="supabaseConfigured" class="form-stack" @submit.prevent="submitAuth">
      <label class="field"><span>Correo electrónico</span><input v-model="email" type="email" autocomplete="email" required placeholder="tu@correo.com"></label>
      <label class="field"><span>Contraseña</span><input v-model="password" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" type="password" minlength="8" required placeholder="Mínimo 8 caracteres"></label>
      <p v-if="errorMessage" class="form-error" role="alert">{{ errorMessage }}</p>
      <p v-if="message" class="notice notice-success" role="status">{{ message }}</p>
      <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? "Procesando…" : mode === "register" ? "CREAR CUENTA" : "INICIAR SESIÓN" }}</button>
      <button v-if="mode === 'login'" class="text-button auth-switch" type="button" @click="switchMode('recover')">¿Olvidaste tu contraseña?</button>
      <p v-if="mode === 'register'" class="form-help">Se enviará un enlace para confirmar tu correo. La cuenta debe tener una suscripción activa para crear galas; el superusuario configurado tiene acceso gratuito.</p>
      <p v-else class="form-help">¿Primera vez aquí? <button class="text-button inline-button" type="button" @click="switchMode('register')">Crear una cuenta</button></p>
      <p v-if="mode === 'register'" class="form-help">¿Ya tienes cuenta? <button class="text-button inline-button" type="button" @click="switchMode('login')">Inicia sesión</button></p>
    </form>

    <button class="button button-quiet demo-entry" type="button" @click="enterDemo">{{ supabaseConfigured ? "Abrir vista de demostración" : "ENTRAR A LA DEMOSTRACIÓN" }}</button>
  </section>
</template>
