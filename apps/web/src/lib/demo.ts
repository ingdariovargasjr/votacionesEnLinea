import { ref, reactive } from "vue";

export const demoSession = ref(false);

export interface DemoNominee {
  id: string;
  name: string;
  image?: string;
}

export interface DemoBallot {
  id: string;
  title: string;
  description: string;
  mode: "single_daily" | "five_daily";
  nominees: DemoNominee[];
  socialProgramId?: string | null;
  sortOrder?: number;
  status?: string;
}

export interface DemoSocialPage {
  id: string;
  network: "Facebook" | "Instagram" | "TikTok";
  name: string;
  url: string;
}

const galaId = "demo-la-granja-vip";
const newId = () => crypto.randomUUID();

export const demoStore = reactive({
  events: [{
    id: galaId,
    name: "La Granja VIP · Segunda temporada",
    slug: "la-granja-vip-segunda-temporada",
    description: "Demo visual para configurar una premiación y sus votaciones.",
    timezone: "America/Mexico_City",
    status: "draft" as const,
    created_at: new Date().toISOString(),
  }],
  ballotsByEvent: {
    [galaId]: [
      {
        id: "ballot-salvar",
        title: "¡Vota para salvar a tu granjero favorito!",
        description: "Reparte tus cinco votos entre tus favoritos.",
        mode: "five_daily" as const,
        nominees: [
          { id: "nom-1", name: 'Kevyn “Bicolor”' },
          { id: "nom-2", name: "Mónica Escobedo" },
          { id: "nom-3", name: "Rafa Mercadante" },
        ],
      },
      {
        id: "ballot-ganador",
        title: "Ganador de la temporada",
        description: "Elige a quien quieres ver ganar la temporada.",
        mode: "single_daily" as const,
        nominees: [
          { id: "nom-4", name: 'Kevyn “Bicolor”' },
          { id: "nom-5", name: "Mónica Escobedo" },
          { id: "nom-6", name: "Rafa Mercadante" },
        ],
      },
    ] as DemoBallot[],
  } as Record<string, DemoBallot[]>,
  themeByEvent: {
    [galaId]: {
      primary: "#c70d96",
      secondary: "#e98cdb",
      fontFamily: "DM Sans",
      socialPages: [] as DemoSocialPage[],
    },
  } as Record<string, { primary: string; secondary: string; fontFamily: string; socialPages: DemoSocialPage[] }>,
});

export function createDemoEvent(input: { name: string; slug: string; description: string; timezone: string }) {
  const event = { ...input, id: newId(), status: "draft" as const, created_at: new Date().toISOString() };
  demoStore.events.unshift(event);
  demoStore.ballotsByEvent[event.id] = [];
  demoStore.themeByEvent[event.id] = { primary: "#c70d96", secondary: "#e98cdb", fontFamily: "DM Sans", socialPages: [] };
  return event;
}
