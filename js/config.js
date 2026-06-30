// CCM & Epic Golf — CONFIGURACIÓN

const CONFIG = {
  APPS_SCRIPT_URL: "https://ccm-epic-golf.shopein10.workers.dev",
  TORNEO_ACTUAL: "Torneo CCM & Epic 2025",
  PAR_TOTAL: 72,
  HOYOS_POR_BLOQUE: 3,
  REFRESH_INTERVAL: 30,
  // Estos valores se sobreescriben con los datos del sheet al cargar
  CUARTOS: [
    { id: "Cuarto1", nombre: "Cuarto 1", jugadores: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"] },
    { id: "Cuarto2", nombre: "Cuarto 2", jugadores: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"] },
    { id: "Cuarto3", nombre: "Cuarto 3", jugadores: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"] },
    { id: "Cuarto4", nombre: "Cuarto 4", jugadores: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"] },
    { id: "Cuarto5", nombre: "Cuarto 5", jugadores: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"] },
    { id: "Cuarto6", nombre: "Cuarto 6", jugadores: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"] },
    { id: "Cuarto7", nombre: "Cuarto 7", jugadores: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"] },
    { id: "Cuarto8", nombre: "Cuarto 8", jugadores: ["Jugador 1", "Jugador 2", "Jugador 3", "Jugador 4"] }
  ],
  PAR_HOYOS: [4, 4, 5, 3, 4, 4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5],
};
