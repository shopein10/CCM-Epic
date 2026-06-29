// ============================================================
// CCM & Epic Golf — CONFIGURACIÓN
// Completar estos valores antes de publicar
// ============================================================

const CONFIG = {

  // URL del Google Apps Script Web App
  // Cómo obtenerla: Apps Script → Implementar → Nueva implementación
  // → Tipo: Aplicación web → Acceso: Cualquier usuario → Implementar
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbynkXNzLdW2ShQCLLYMOMaycJwKE4hTLPurBxtl2xfgZpIiFbywc4on5hgilF-DuDfp_g/exec",

  // Nombre del torneo actual (aparece en toda la app)
  TORNEO_ACTUAL: "Torneo CCM & Epic 2025",

  // Par total del campo
  PAR_TOTAL: 72,

  // Hoyos por bloque de carga
  HOYOS_POR_BLOQUE: 3,

  // Cada cuántos segundos se refresca el leaderboard automáticamente
  // 30 segundos es un buen balance entre frescura y cuota de la API
  REFRESH_INTERVAL: 30,

  // Cuartos del torneo — actualizar antes de cada torneo
  // El orden de los jugadores debe coincidir con el orden en el Sheet
  CUARTOS: [
    {
      id: "Cuarto1",
      nombre: "Cuarto 1",
      jugadores: ["Nico DP", "Festapinto", "Pichon", "Cuca"]
    },
    {
      id: "Cuarto2",
      nombre: "Cuarto 2",
      jugadores: ["Nacho", "Emi", "Mani", "Maxi"]
    },
    {
      id: "Cuarto3",
      nombre: "Cuarto 3",
      jugadores: ["Matungo", "Bocha", "Tato", "Edu"]
    },
    {
      id: "Cuarto4",
      nombre: "Cuarto 4",
      jugadores: ["Zorro", "Crazy", "Pera", "Juli"]
    },
    {
      id: "Cuarto5",
      nombre: "Cuarto 5",
      jugadores: ["Lucas", "Polino", "Pancho", "Andy"]
    },
    {
      id: "Cuarto6",
      nombre: "Cuarto 6",
      jugadores: ["Pui", "Nole", "Mosk", "Principe"]
    }
  ],

  // Par de cada hoyo (ajustar si el campo difiere)
  PAR_HOYOS: [4, 4, 5, 3, 4, 4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5],
};
