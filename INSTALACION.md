# CCM & Epic Golf PWA — Guía de instalación

## Qué necesitás
- Cuenta de GitHub (ya tenés)
- El Google Sheet del torneo
- 30 minutos la primera vez

---

## PASO 1 — Apps Script en el Sheet

1. Abrí tu Google Sheet del torneo
2. **Extensiones → Apps Script**
3. Borrá el código que hay y pegá el bloque que está al final de `js/sheets.js`
   (todo lo que está entre los comentarios `── Pegar esto` y `── Fin del código`)
4. En la línea `const SHEET_ID = ...` reemplazá con el ID de tu sheet
   (está en la URL: `docs.google.com/spreadsheets/d/**ESTE_ID**/edit`)
5. Verificá el objeto `FILAS` — debe tener la fila exacta donde están los golpes
   de cada jugador en cada pestaña Cuarto1, Cuarto2, etc.
6. **Guardar** (Ctrl+S)
7. **Implementar → Nueva implementación**
   - Tipo: Aplicación web
   - Ejecutar como: Yo
   - Quién tiene acceso: **Cualquier usuario**
   - Hacer clic en **Implementar**
8. Copiá la URL que aparece (algo como `https://script.google.com/macros/s/ABC123/exec`)

---

## PASO 2 — Configurar la PWA

Abrí el archivo `js/config.js` y completá:

```javascript
APPS_SCRIPT_URL: "URL_que_copiaste_en_el_paso_anterior",
```

Si los jugadores de los cuartos cambian para el torneo, editá el array `CUARTOS` en ese mismo archivo.

---

## PASO 3 — Ícono de la app

La app necesita dos íconos en la carpeta `icons/`:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

Podés usar cualquier imagen — por ejemplo una pelota de golf ⛳ sobre fondo oscuro.
Herramienta gratuita para generarlos: https://realfavicongenerator.net

---

## PASO 4 — Publicar en GitHub Pages

1. Creá un repositorio nuevo en GitHub (ej: `ccm-epic-golf`)
2. Subí todos los archivos de esta carpeta al repositorio
3. En el repositorio: **Settings → Pages**
4. Source: **Deploy from a branch → main → / (root)**
5. Guardá — en 1 minuto la app está en `https://TU_USUARIO.github.io/ccm-epic-golf`

---

## PASO 5 — Instalar en el iPhone

1. Abrí la URL en Safari (tiene que ser Safari, no Chrome)
2. Tocá el botón de compartir ⬆️
3. **"Agregar a pantalla de inicio"**
4. Ponerle nombre "CCM & Epic" → Agregar
5. Listo — aparece el ícono como una app nativa

Compartí el link con el grupo para que todos lo instalen.

---

## PASO 6 — Pestaña Historial (opcional)

Para que el historial funcione, agregá una pestaña llamada **"Historial"** en tu Sheet con estas columnas en la fila 1:

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Fecha | Ganador | Score | Jugadores | Polla | Notas |

Cada torneo anterior va en una fila. La app los muestra automáticamente.

---

## Actualizar cuartos para un nuevo torneo

Solo editás `CUARTOS` en `js/config.js`, subís el cambio a GitHub, y en segundos está actualizado para todos.

---

## Troubleshooting

**La app no carga datos**
→ Verificar que la URL en `config.js` sea la del Apps Script implementado (no la de edición)
→ En Apps Script: asegurarse de que el acceso sea "Cualquier usuario"
→ Si actualizaste el script, hay que crear una **nueva implementación** (no editar la existente)

**Los scores no se guardan en el sheet**
→ Verificar las filas en el objeto `FILAS` del Apps Script
→ Abrir la consola del browser (F12) y ver si hay errores

**El ícono no aparece en iPhone**
→ Tiene que instalarse desde Safari, no desde Chrome
→ Los íconos deben estar en la carpeta `icons/` con los nombres exactos del manifest.json
