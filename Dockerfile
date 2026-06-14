# Dockerfile für PlaywrightCSM Server
FROM node:18-bullseye

# Arbeitsverzeichnis anlegen
WORKDIR /usr/src/app

# package.json und package-lock.json kopieren
COPY package*.json ./

# Alle Abhängigkeiten installieren (inkl. devDependencies)
RUN npm install
# Playwright-Browser installieren
RUN npx playwright install --with-deps
# Browser installieren
RUN npx playwright install chrome
RUN npx playwright install msedge

# Quellcode kopieren
COPY ./src ./src
# Reports & Generator kopieren
COPY ./reports ./reports

# Copy the run-tests.sh script into the container
COPY run-tests.sh /usr/src/app/run-tests.sh
RUN chmod +x /usr/src/app/run-tests.sh

# Standardport für den Server
EXPOSE 3000

# Use the script as the CMD entrypoint
CMD ["/usr/src/app/run-tests.sh"]
