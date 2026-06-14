#!/bin/sh

# Perform login and save state
node src/auth/login.js
if [ $? -ne 0 ]; then
  echo "Login failed. Exiting container startup."
  exit 1
fi

# Perform portal login and save state
node src/auth/portal-login.js
if [ $? -ne 0 ]; then
  echo "Portal login failed. Exiting container startup."
  exit 1
fi

# Start the server
exec npm start