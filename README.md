# Bocado

Log what you eat and see calories and macros against your daily goals.

- **Today**: log foods per meal, see calories left and each macro's grams and share of calories against your targets.
- **Foods**: your food list with values per 100 g and optional servings ("1 slice = 17 g"). Starts with the foods from the original spreadsheet.
- **Goals**: a calorie target and a macro split by calories (carbs and protein 4 kcal/g, fat 9 kcal/g).

It's a local-first web app you can install: data lives in the browser (IndexedDB) on each device, and works offline. Use **Goals → Export/Import backup** to move data between devices.

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
