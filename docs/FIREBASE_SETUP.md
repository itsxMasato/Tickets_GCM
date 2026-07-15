Guía rápida de configuración de Firebase Admin

1) Generar un Service Account JSON desde la consola de Firebase / GCP.
2) Colocar el archivo en el repositorio (ej. `./keys/service-account.json`) o
   almacenar su contenido en la variable `FIREBASE_SERVICE_ACCOUNT` en CI.
3) En el entorno local, definir:

   FIREBASE_SERVICE_ACCOUNT_PATH=./keys/service-account.json
   # o
   FIREBASE_SERVICE_ACCOUNT="<JSON string aquí>"

4) Asegurarse de que el JSON contiene `project_id`. Si no, definir:

   FIREBASE_PROJECT_ID=tu-project-id
   GOOGLE_APPLICATION_CREDENTIALS=./keys/service-account.json

5) Reiniciar el servidor.

Notas:
- La app ahora intentará inferir `projectId` del JSON o de `FIREBASE_PROJECT_ID`.
- Si sigue apareciendo: "Unable to detect a Project Id...", copie el project_id
  del JSON y añádalo en `FIREBASE_PROJECT_ID`.
