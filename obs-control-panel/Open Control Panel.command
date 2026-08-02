#!/bin/bash
# Double-click this file to open the Studio Control panel.
cd "$(dirname "$0")" || exit 1

# Chrome handles local pages most consistently, so prefer it when installed.
if [ -d "/Applications/Google Chrome.app" ]; then
  open -a "Google Chrome" "index.html"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
  open -a "Microsoft Edge" "index.html"
else
  open "index.html"
fi
