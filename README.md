# Bocado

Apunta lo que comes y mira tus calorías y macros frente a tus objetivos. The interface is in Spanish.

- **Hoy**: log foods per meal. A ring shows calories left, split into one colour per macro, with each macro's grams against its target. With a calculated goal it also shows the day's deficit or excess against estimated daily burn.
- **Alimentos**: your food list with values per 100 g and optional servings ("1 loncha = 17 g"). Starts with the foods from the original spreadsheet.
- **Objetivos**: set daily calories by hand, or calculate them from sex, age, height, weight and activity (Mifflin-St Jeor or revised Harris-Benedict) plus a deficit or surplus. Macro split by calories on a bar that always adds up to 100 %.

It's a local-first web app you can install: data lives in the browser (IndexedDB) on each device, and works offline. Use **Objetivos → Exportar/Importar copia** to move data between devices.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for the nutrition maths
npm run build    # production build in dist/
```

To try it on a phone on the same Wi-Fi, run `npm run dev -- --host` and open the Network URL it prints. Installing to the home screen and offline mode need HTTPS, so use a deployed build for that.

## Stack

React + TypeScript + Vite, Dexie for IndexedDB, vite-plugin-pwa for the service worker and manifest.
