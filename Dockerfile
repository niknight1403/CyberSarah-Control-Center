FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
# Statischer Expo-Web-Export fuer die kombinierte Web+API-Auslieferung.
# CSS-Interop-Cache seeden (SHA-1-Fix fuer frische npm-ci-Installs, vgl. build-apk.yml)
RUN mkdir -p node_modules/react-native-css-interop/.cache \
 && touch node_modules/react-native-css-interop/.cache/web.css
RUN npx expo export -p web --output-dir web-dist
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web-dist ./web-dist

EXPOSE 8000

CMD ["node", "dist/index.js"]