# SINSA Promo MVP

Aplicacion React/Vite para gestion de promociones retail. El MVP mantiene Excel como respaldo/exportacion y agrega conexion a Google Sheets por medio de Apps Script.

## Instalacion

```bash
npm install
npm run dev
```

## Estructura

```text
src/App.jsx
src/styles.css
src/services/excelService.js
AGENTS.md
ROADMAP.md
```

## Flujo recomendado

1. Ejecutar el proyecto.
2. Publicar el Apps Script de `apps-script/Code.gs`.
3. Guardar la URL `/exec` en Ajustes.
4. Cargar el catalogo desde Drive en Inicio.
5. Crear/editar promociones.
6. Agregar comentarios de Mercadeo.
7. Guardar en Drive para regenerar CONSOLIDADO y EXPORT_*.

## Google Sheets / Drive

La hoja configurada para este sprint es:

```text
1QuT13pajfbLx_90oTZEosB3O7G3mpwuk_soOPqyOCms
```

Pasos rapidos:

1. Abrir la hoja en Google Sheets.
2. Entrar a `Extensiones > Apps Script`.
3. Pegar `apps-script/Code.gs`.
4. Ejecutar `setupWorkbook`.
5. Publicar como aplicacion web.
6. Pegar la URL publicada en Ajustes de la app.

Tambien se puede configurar por entorno copiando `.env.example` a `.env`.

## Flujo Excel de respaldo

1. Cargar plantilla Excel desde Inicio.
2. Revisar Consolidado.
3. Crear/editar promociones.
4. Agregar comentarios de Mercadeo.
5. Guardar Excel actualizado.

## Nota

Este MVP esta preparado para que Codex continue con:

- Integracion real del archivo comprador ERP.
- Validaciones de negocio avanzadas.
- Conectores Drive/SharePoint.
- Seguridad y roles.
