# Bocados

Live at https://bocados.org

Apunta lo que comes y mira tus calorías y macros frente a tus objetivos. The interface is in Spanish.

- **Diario**: log foods per meal. A ring shows calories left, split into one colour per macro, with each macro's grams against its target. With a calculated goal it also shows the day's deficit or excess against estimated daily burn.
- **Alimentos**: foods grouped by category, with values per 100 g and optional servings ("1 loncha = 17 g"). Select several to delete them at once.
- **Objetivos**: set daily calories by hand, or calculate them from sex, age, height, weight and activity (Mifflin-St Jeor or revised Harris-Benedict) plus a deficit or surplus. Macro split by calories on a bar that always adds up to 100 %.

It's a local-first web app you can install: data lives in the browser (IndexedDB) on each device, and works offline. Use **Objetivos → Exportar/Importar copia** to move data between devices.

## Food data

The built-in list (`src/data/seedFoods.json`) has 148 common foods with average values per 100 g, taken from USDA FoodData Central and BEDCA. They follow the EU label convention used in Spain: carbohydrates exclude fibre, and kcal = 4 × carbs + 4 × protein + 9 × fat + 2 × fibre. Names say whether a food is raw, cooked or drained, since that changes the numbers a lot.

## Supermarket products

Foods can also be pulled from [Open Food Facts](https://es.openfoodfacts.org) (ODbL licence): search results show a "Supermercados" section, and products can be scanned by barcode with the camera. Their search allows 10 requests a minute per address and can't be called from a browser, so `worker/index.js` (a Cloudflare Worker) proxies it at `/api/buscar` and `/api/codigo/:barcode`, filters out products without usable values, re-ranks them and caches the answers. Picking a product copies it into the device's own list.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173 (proxies /api to wrangler below)
npm run dev:api  # the Worker with the Open Food Facts API, on :8788
npm test         # unit tests for the nutrition maths
npm run build    # production build in dist/
```

To try it on a phone on the same Wi-Fi, run `npm run dev -- --host` and open the Network URL it prints. Installing to the home screen and offline mode need HTTPS, so use a deployed build for that.

## Stack

React + TypeScript + Vite, Dexie for IndexedDB, vite-plugin-pwa for the service worker and manifest.
